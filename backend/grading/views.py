"""
GET/POST /api/submissions/ — the signed-in player's takes.

POST receives multipart audio, persists the :class:`Submission`, runs the
grading engine (``grading.engine``), stores the :class:`GradingResult`, and
returns the snake_case grade the mobile Results screen renders. GET lists the
caller's submission history (newest first, paginated) with each take's grade.
The response shapes are the contract the app consumes (see
``apps/mobile/src/services/{api,submissions}.ts``).
"""
from __future__ import annotations

import re

from django.db import transaction
from django.db.models import Max
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from progress.models import PracticeReward, Profile
from progress.rewards import study_xp_value
from studies.models import Study

from .engine import grade_recording
from .engine.rubric import GradeResult
from .models import GradingResult, Submission
from .serializers import SubmissionCreateSerializer, SubmissionListSerializer
from .wire import FEEDBACK_AUTHOR, FEEDBACK_INITIALS, feedback_text


class SubmissionListCreateView(generics.ListCreateAPIView):
    """List the caller's takes (GET) or grade a new one (POST)."""

    # A take always belongs to the signed-in player: the mobile record flow
    # sends the JWT (authClient.authedRequest), the submission is attributed to
    # request.user — never a client-supplied id — and the grade feeds that
    # user's streak/stats. Uploads are rate-limited per user ("submissions").
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = SubmissionListSerializer
    # Read by ScopedRateThrottle when it runs (POST only, see get_throttles).
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "submissions"

    def get_queryset(self):
        # Only the caller's own takes; Submission.Meta orders newest-first.
        return Submission.objects.filter(user=self.request.user).select_related(
            "grade"
        )

    def get_throttles(self):
        # Rate-limit uploads only; listing history isn't capped at the low upload
        # rate. (ScopedRateThrottle scopes off the class `throttle_scope`.)
        if self.request.method == "POST":
            return super().get_throttles()
        return []

    def post(self, request, *args, **kwargs):
        serializer = SubmissionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        audio_file = data["audio"]
        exercise_id = data["exercise_id"]
        study = _resolve_study(exercise_id)

        # Read the bytes for the engine before the FileField save consumes them.
        audio_file.seek(0)
        audio_bytes = audio_file.read()
        audio_file.seek(0)

        # Grade before touching the database: the engine is pure over the audio
        # bytes, so the (potentially slow) analysis holds no transaction open,
        # and a grading failure persists nothing — no orphaned audio upload.
        result = grade_recording(
            audio_bytes,
            filename=getattr(audio_file, "name", None),
            mime=getattr(audio_file, "content_type", None),
            musicxml=_musicxml_for(study),
            tempo_label=study.tempo if study else "",
            client_duration=data["duration_seconds"],
        )

        # Persist the take, its grade, and the reward as one unit: a mid-flow
        # failure must not leave a Submission without its grade, or the
        # streak/XP advanced without a stored result.
        with transaction.atomic():
            # The profile lock must be taken before reading the prior best: a
            # concurrent take from the same user blocks here until this one
            # commits, so its prior-best read sees this grade and the
            # improvement delta is paid only once.
            profile = Profile.lock_for_user(request.user)

            # The player's prior best on this study, read *before* the new grade
            # is stored, so XP pays only the improvement (see progress.rewards).
            prev_best = _previous_best(request.user, study)

            submission = Submission.objects.create(
                user=request.user,
                study=study,
                exercise_id=exercise_id,
                exercise_title=data["exercise_title"],
                audio=audio_file,
                duration_seconds=data["duration_seconds"],
            )

            # A graded take counts as practice: advance the submitter's streak,
            # fold the score into their stats, and award XP/coins. A take the
            # server couldn't analyse (length-only grade) still counts as
            # practice but earns no XP: its value is zeroed here, and
            # _previous_best ignores it, so it can't mine or burn the study's XP.
            reward = profile.record_practice(
                score=result.total_score,
                study_value=study_xp_value(study) if result.analyzed else 0,
                prev_best_pct=prev_best,
            )
            _persist_grade(submission, result, reward.xp_awarded)

        return Response(
            _to_wire(submission, result, reward),
            status=status.HTTP_201_CREATED,
        )


def _resolve_study(exercise_id: str) -> Study | None:
    """Best-effort map a client exercise id to a catalog study for the reference.

    Tries an exact slug first (e.g. ``clarke-2-1``); failing that, treats a
    section-level id (``clarke-2``) as "the Second Study" and picks its first
    transcribed exercise so Completion has real notation to measure against.
    """
    if not exercise_id:
        return None
    study = Study.objects.filter(slug=exercise_id).select_related("content").first()
    if study is not None:
        return study

    match = re.fullmatch(r"[a-z]+-(\d+)", exercise_id)
    if not match:
        return None
    section = int(match.group(1))
    section_qs = Study.objects.filter(section=section).select_related("content")
    # Prefer an exercise that actually carries notation; fall back to any in the
    # section so `study` is still linked for history.
    return (
        section_qs.exclude(content__musicxml="").order_by("order", "number").first()
        or section_qs.order_by("order", "number").first()
    )


def _musicxml_for(study: Study | None) -> str:
    content = getattr(study, "content", None) if study else None
    return content.musicxml if content else ""


def _previous_best(user, study: Study | None) -> int:
    """The user's best prior *analyzed* score on ``study`` (0 if none/unknown).

    Read before the current take's grade is stored, so it reflects the *prior*
    best. XP is then awarded only for beating it. Length-only grades
    (``analyzed=False``) never earn XP, so they don't count as a best either —
    otherwise an undecodable upload would permanently eat into the XP a real
    take can still pay.
    """
    if study is None:
        return 0
    best = GradingResult.objects.filter(
        submission__user=user, submission__study=study, analyzed=True
    ).aggregate(best=Max("total_score"))["best"]
    return best or 0


def _persist_grade(
    submission: Submission, result: GradeResult, xp_awarded: int
) -> None:
    points = {c.key: c.points for c in result.categories}
    GradingResult.objects.create(
        submission=submission,
        total_score=result.total_score,
        grade_label=result.grade_label,
        band=result.band,
        pitch_score=points.get("pitch", 0.0),
        rhythm_score=points.get("rhythm", 0.0),
        tempo_score=points.get("tempo", 0.0),
        tone_score=points.get("tone", 0.0),
        completion_score=points.get("completion", 0.0),
        summary=result.summary,
        practice_tip=result.practice_tip,
        analyzed=result.analyzed,
        xp_awarded=xp_awarded,
    )


def _to_wire(
    submission: Submission, result: GradeResult, reward: PracticeReward
) -> dict:
    """GradeResult + reward → the snake_case JSON the mobile app consumes."""
    return {
        "submission_id": str(submission.id),
        "exercise_id": submission.exercise_id,
        "exercise_title": submission.exercise_title or "Clarke Study",
        "total_score": result.total_score,
        "grade_label": result.grade_label,
        "categories": [
            {"label": c.label, "score": c.percent} for c in result.categories
        ],
        "feedback_author": FEEDBACK_AUTHOR,
        "feedback_initials": FEEDBACK_INITIALS,
        "feedback_text": feedback_text(result.summary, result.practice_tip),
        # Reward earned for this take (see progress.rewards).
        "xp_awarded": reward.xp_awarded,
        "coins_awarded": reward.coins_awarded,
        "level": reward.level,
        "rank_title": reward.rank_title,
        "leveled_up": reward.leveled_up,
    }
