"""
Shared JSON shaping for a submission's grade.

Both the POST response (``views._to_wire``) and the history list
(``serializers.SubmissionListSerializer``) turn a grade into the same
snake_case shape the mobile app consumes, so the two must not drift. The POST
path shapes a live ``engine.rubric.GradeResult``; the list path shapes a
persisted :class:`grading.models.GradingResult`. The category order/labels and
point maxima here mirror the engine (``grading/engine/rubric.py``).
"""
from __future__ import annotations

from .engine.rubric import (
    MAX_COMPLETION,
    MAX_PITCH,
    MAX_RHYTHM,
    MAX_TEMPO,
    MAX_TONE,
)
from .models import GradingResult

# The coaching persona the Results screen attributes feedback to. Kept stable so
# the UI copy ("Coaching feedback") stays consistent; the text itself is
# generated per take by the engine.
FEEDBACK_AUTHOR = "Prof. Halvorsen"
FEEDBACK_INITIALS = "PH"

# (model field, engine key, UI label, point max) in the engine's category order.
CATEGORY_SPECS: list[tuple[str, str, str, int]] = [
    ("pitch_score", "pitch", "Pitch Accuracy", MAX_PITCH),
    ("rhythm_score", "rhythm", "Rhythm", MAX_RHYTHM),
    ("tempo_score", "tempo", "Tempo Consistency", MAX_TEMPO),
    ("tone_score", "tone", "Tone Stability", MAX_TONE),
    ("completion_score", "completion", "Completion", MAX_COMPLETION),
]


def grade_categories(grade: GradingResult) -> list[dict]:
    """Per-category bars from stored points, matching ``CategoryScore.percent``."""
    categories = []
    for field, _key, label, maximum in CATEGORY_SPECS:
        points = getattr(grade, field)
        percent = int(round(100.0 * points / maximum)) if maximum > 0 else 0
        categories.append({"label": label, "score": percent})
    return categories


def feedback_text(summary: str, practice_tip: str) -> str:
    """Summary with the practice tip appended when present."""
    if practice_tip:
        return f"{summary} {practice_tip}"
    return summary
