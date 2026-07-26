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

from .engine.align import Alignment
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


# --- Note-level verdicts ----------------------------------------------------
#
# Stored and sent in a compact form: a long study carries ~150 verdicts, and
# short keys keep the payload a few KB while staying readable in the DB.
#
#   i = expected-note index (the *sounding* ordinal — the client maps it to a
#       glyph through ExpectedNote.noteIndex; the two differ at every rest)
#   v = verdict: correct | wrong | missed
#   t = signed onset error in beats (positive = late), omitted when missed
#   c = signed cents from the expected pitch, omitted when missed
#   m = MIDI actually heard, omitted when missed


def note_results_from_engine(alignment: Alignment | None) -> list[dict]:
    """Engine :class:`Alignment` → the stored/wire verdict rows."""
    if alignment is None:
        return []
    rows: list[dict] = []
    for verdict in alignment.verdicts:
        row: dict = {"i": verdict.expected_index, "v": verdict.status}
        if verdict.timing_error_beats is not None:
            row["t"] = round(verdict.timing_error_beats, 4)
        if verdict.cents_error is not None:
            row["c"] = round(verdict.cents_error, 1)
        if verdict.heard_midi is not None:
            row["m"] = verdict.heard_midi
        rows.append(row)
    return rows


def note_summary(note_results: list[dict], extra: int = 0) -> dict:
    """Tally the verdicts for the Results screen's summary line."""
    counts = {"correct": 0, "wrong": 0, "missed": 0}
    for row in note_results or []:
        verdict = row.get("v")
        if verdict in counts:
            counts[verdict] += 1
    counts["extra"] = int(extra)
    counts["gradeable"] = len(note_results or [])
    return counts


def note_block(grade: GradingResult) -> dict:
    """The note-level half of a grade payload, from a stored row.

    Shared by the POST response and the history list so a tapped history row
    shows exactly what the fresh grade showed — the drift this module exists to
    prevent.
    """
    results = grade.note_results or []
    return {
        "note_grading": grade.note_grading,
        "note_results": results,
        "note_summary": note_summary(results, grade.note_extra),
    }
