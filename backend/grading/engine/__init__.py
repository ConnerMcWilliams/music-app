"""
Clarke study grading engine.

A self-contained, dependency-light pipeline that turns a raw audio take into the
100-point grade defined in ``docs/grading-rubric.md``:

    audio bytes ──▶ decode (audio.py) ──▶ analyse (analysis.py)
                                              │
              reference (reference.py) ───────┼──▶ score (rubric.py) ──▶ GradeResult

The only third-party dependency is NumPy (DSP). Nothing here imports Django, so
the whole engine is unit-testable in isolation; the ``grading`` app's view is a
thin wrapper that persists the result and serialises it to the wire format.

Public API: :func:`grade_recording`.
"""
from __future__ import annotations

from dataclasses import dataclass

from .align import Alignment, NoteVerdict, align
from .analysis import AudioFeatures, analyze
from .audio import decode_audio
from .reference import (
    DEFAULT_EXPECTED_SECONDS,
    ExpectedPerformance,
    default_expected,
    expected_from_musicxml,
)
from .rubric import CategoryScore, GradeResult, grade
from .segment import PerformedNote, segment_notes
from .timeline import (
    DEFAULT_TRANSPOSITION_SEMITONES,
    ExpectedNote,
    ExpectedTimeline,
    timeline_from_musicxml,
    validate_notation,
)

__all__ = [
    "grade_recording",
    "grade_take",
    "GradedTake",
    "GradeResult",
    "CategoryScore",
    "AudioFeatures",
    "ExpectedPerformance",
    "expected_from_musicxml",
    "default_expected",
    "DEFAULT_EXPECTED_SECONDS",
    "Alignment",
    "NoteVerdict",
    "align",
    "PerformedNote",
    "segment_notes",
    "ExpectedNote",
    "ExpectedTimeline",
    "timeline_from_musicxml",
    "validate_notation",
    "DEFAULT_TRANSPOSITION_SEMITONES",
]


@dataclass(frozen=True)
class GradedTake:
    """A graded take: the rubric score, plus the note-level match when trusted."""

    grade: GradeResult
    # None whenever note-level grading wasn't attempted or wasn't trustworthy.
    # It is never populated unless ``grade`` was actually computed from it, so
    # the score and the overlay can't tell the player two different stories.
    alignment: Alignment | None = None


def grade_recording(
    audio_bytes: bytes,
    *,
    filename: str | None = None,
    mime: str | None = None,
    musicxml: str = "",
    tempo_label: str = "",
    client_duration: float = 0.0,
) -> GradeResult:
    """Grade one audio take end-to-end (reference-free Pitch/Rhythm).

    The long-standing entry point, unchanged. Use :func:`grade_take` when the
    caller can also make use of a note-level alignment.
    """
    return grade_take(
        audio_bytes,
        filename=filename,
        mime=mime,
        musicxml=musicxml,
        tempo_label=tempo_label,
        client_duration=client_duration,
    ).grade


def grade_take(
    audio_bytes: bytes,
    *,
    filename: str | None = None,
    mime: str | None = None,
    musicxml: str = "",
    tempo_label: str = "",
    client_duration: float = 0.0,
    note_level: bool = False,
    transposition_semitones: int = DEFAULT_TRANSPOSITION_SEMITONES,
) -> GradedTake:
    """Grade one audio take end-to-end.

    Args:
        audio_bytes: The uploaded take (any container the decoder can read).
        filename / mime: Hints for the decoder (the byte signature wins).
        musicxml: The study's notation, when known, to make Completion concrete.
        tempo_label: The study's tempo string (e.g. "♩ = 80") as a bpm fallback.
        client_duration: Client-reported length, used only for the degraded
            (undecodable-audio) grade.
        note_level: Attempt note-by-note alignment against ``musicxml``. Only
            pass this when the take resolved to *exactly one* transcribed
            exercise — aligning against the wrong study's notation would mark a
            correct performance entirely wrong.
        transposition_semitones: Written-to-sounding shift for the instrument.

    Returns:
        A :class:`GradedTake`. If the audio can't be decoded, the grade is a
        clearly-labelled, length-only result rather than an invented one.
    """
    expected = (
        expected_from_musicxml(musicxml, tempo_label) if musicxml else default_expected()
    )

    decoded = decode_audio(audio_bytes, filename=filename, mime=mime)
    if decoded is None:
        return GradedTake(
            grade(
                AudioFeatures(duration_seconds=0.0, sample_rate=0),
                expected,
                analyzed=False,
                client_duration=client_duration,
            )
        )

    features = analyze(decoded.samples, decoded.sample_rate)
    alignment = (
        _align_take(features, musicxml, tempo_label, transposition_semitones)
        if note_level
        else None
    )
    result = grade(
        features,
        expected,
        analyzed=True,
        client_duration=client_duration,
        alignment=alignment,
    )
    if alignment is not None and (alignment.degenerate or not alignment.gradeable):
        alignment = None
    return GradedTake(result, alignment)


def _align_take(
    features: AudioFeatures,
    musicxml: str,
    tempo_label: str,
    transposition_semitones: int,
) -> Alignment | None:
    """Note-level alignment, or None when the notation isn't fit to grade against."""
    if not musicxml:
        return None
    # The bundled notation is OMR output from a 1912 scan. A study with
    # structural damage would mark a correct performance wrong with no way for
    # the player to tell, so it is graded reference-free instead.
    if validate_notation(musicxml):
        return None
    timeline = timeline_from_musicxml(
        musicxml,
        tempo_label=tempo_label,
        transposition_semitones=transposition_semitones,
    )
    if timeline is None:
        return None
    return align(timeline, segment_notes(features))
