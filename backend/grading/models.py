"""
Submissions and their grades.

A ``Submission`` is one uploaded take (the stored audio plus which exercise it
was for and who sent it, when known). Its ``GradingResult`` is the engine's
score for that take — the rubric breakdown the mobile Results screen renders.

The two are split so a submission can exist before/independently of its grade
(re-grading, async grading later) and so grade columns stay queryable for
history and averages. Both reference ``settings.AUTH_USER_MODEL`` /
``studies.Study`` loosely (nullable) because the first vertical slice grades
unauthenticated, section-level takes; those FKs tighten up as accounts and a
real id→study mapping land.
"""
from __future__ import annotations

import re
import uuid

from django.conf import settings
from django.db import models


def submission_audio_path(instance: Submission, filename: str) -> str:
    """Store uploads under a per-submission path so names never collide.

    The suffix comes from the client filename, so it is sanitized here: only a
    short alphanumeric extension survives (the serializer already enforces an
    audio-format allowlist; this guards direct model use too). The rest of the
    path is server-generated — never user-controlled.
    """
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else "audio"
    if not re.fullmatch(r"[a-z0-9]{1,8}", suffix):
        suffix = "audio"
    return f"submissions/{instance.id}/take.{suffix}"


class Submission(models.Model):
    """One recorded (or uploaded) take submitted for grading."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Nullable until the record flow sends auth; on delete keep the take but
    # drop the link. Referenced via AUTH_USER_MODEL, never the concrete class.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="submissions",
    )
    # Best-effort link to the catalog study (the client sends a section-level id
    # that may not resolve to a single Study yet).
    study = models.ForeignKey(
        "studies.Study",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="submissions",
    )

    # The client-supplied identifiers, kept verbatim so a take is traceable even
    # when `study` can't be resolved.
    exercise_id = models.CharField(max_length=64, blank=True)
    exercise_title = models.CharField(max_length=200, blank=True)

    audio = models.FileField(upload_to=submission_audio_path)
    # Client-reported clip length; the engine measures its own from the audio.
    duration_seconds = models.FloatField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Submission {self.id} ({self.exercise_id or 'unknown study'})"


# A study counts as "passed" once the player has at least one analyzed take
# scoring at least this. Progression surfaces (e.g. the Today card's "first
# unpassed study") compare best scores against it.
PASSING_SCORE = 70


class GradingResult(models.Model):
    """The rubric grade for one submission (see docs/grading-rubric.md)."""

    submission = models.OneToOneField(
        Submission,
        on_delete=models.CASCADE,
        related_name="grade",
        primary_key=True,
    )

    total_score = models.PositiveSmallIntegerField()
    grade_label = models.CharField(max_length=4)
    band = models.CharField(max_length=80)

    # Earned points per rubric category (maxes are fixed: 25/25/20/15/15).
    pitch_score = models.FloatField()
    rhythm_score = models.FloatField()
    tempo_score = models.FloatField()
    tone_score = models.FloatField()
    completion_score = models.FloatField()

    summary = models.TextField()
    practice_tip = models.TextField()

    # XP this take awarded the submitter (0 when it didn't beat their prior best
    # on the study, or the study/value is unknown). Stored so history and the
    # Results screen can show "+XP" without recomputing. See progress.rewards.
    xp_awarded = models.PositiveIntegerField(default=0)

    # False when the audio couldn't be decoded server-side and only length was
    # scored — surfaced so these grades aren't mistaken for full analyses.
    analyzed = models.BooleanField(default=True)

    # True when Pitch/Rhythm above were scored from a note-by-note match against
    # the study's notation rather than the reference-free heuristics. Requires
    # the take to have resolved to exactly one transcribed exercise *and* the
    # match to have been trustworthy — see grading/engine/align.py. False on
    # every grade recorded before note-level scoring existed, which is why the
    # Results overlay keys off it rather than off `note_results` being empty.
    note_grading = models.BooleanField(default=False)

    # Per-note verdicts, as a list of compact dicts:
    #   {"i": expected index, "v": correct|wrong|missed,
    #    "t": timing error in beats, "c": cents error, "m": MIDI heard}
    # Short keys because a long study carries ~150 of these; even so this is
    # only a few KB, and it stays readable in the DB and in logs. Empty for
    # grades without note-level scoring.
    note_results = models.JSONField(default=list, blank=True)

    # Notes played that matched nothing notated. Held separately because an
    # extra note has no expected index, so it cannot live in `note_results`.
    note_extra = models.PositiveSmallIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Grade {self.total_score}/100 ({self.grade_label}) for {self.submission_id}"
