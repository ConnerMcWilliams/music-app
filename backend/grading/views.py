"""
POST /api/submissions/ — grade an uploaded take.

Receives multipart audio, persists the :class:`Submission`, runs the grading
engine (``grading.engine``), stores the :class:`GradingResult`, and returns the
snake_case grade the mobile Results screen renders. The response shape is the
contract the app already consumes (see ``apps/mobile/src/services/api.ts``).
"""
from __future__ import annotations

import re

from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from progress.models import Profile
from studies.models import Study

from .engine import grade_recording
from .engine.rubric import GradeResult
from .models import GradingResult, Submission
from .serializers import SubmissionCreateSerializer

# The coaching persona the Results screen attributes feedback to. Kept stable so
# the UI copy ("Coaching feedback") stays consistent; the text itself is
# generated per take by the engine.
FEEDBACK_AUTHOR = "Prof. Halvorsen"
FEEDBACK_INITIALS = "PH"


class SubmissionCreateView(APIView):
    """Grade a submitted take and return its rubric score."""

    # Unauthenticated for now — the first vertical slice predates the record
    # flow sending a token. Submissions attach to a user once it does.
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
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

        submission = Submission.objects.create(
            user=request.user if request.user.is_authenticated else None,
            study=study,
            exercise_id=exercise_id,
            exercise_title=data["exercise_title"],
            audio=audio_file,
            duration_seconds=data["duration_seconds"],
        )

        result = grade_recording(
            audio_bytes,
            filename=getattr(audio_file, "name", None),
            mime=getattr(audio_file, "content_type", None),
            musicxml=_musicxml_for(study),
            tempo_label=study.tempo if study else "",
            client_duration=data["duration_seconds"],
        )
        _persist_grade(submission, result)

        # A graded take counts as practice for a signed-in user: advance their
        # streak and fold the score into their running stats. Anonymous takes are
        # still graded but touch no streak. (The mobile record flow always sends
        # a token, so real practice always counts — see progress/models.py.)
        if request.user.is_authenticated:
            Profile.for_user(request.user).record_practice(score=result.total_score)

        return Response(
            _to_wire(submission, result),
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


def _persist_grade(submission: Submission, result: GradeResult) -> None:
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
    )


def _to_wire(submission: Submission, result: GradeResult) -> dict:
    """GradeResult → the snake_case JSON the mobile app consumes."""
    feedback_text = result.summary
    if result.practice_tip:
        feedback_text = f"{result.summary} {result.practice_tip}"
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
        "feedback_text": feedback_text,
    }
