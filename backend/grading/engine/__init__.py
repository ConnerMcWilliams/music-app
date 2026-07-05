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

from .analysis import AudioFeatures, analyze
from .audio import decode_audio
from .reference import (
    DEFAULT_EXPECTED_SECONDS,
    ExpectedPerformance,
    default_expected,
    expected_from_musicxml,
)
from .rubric import CategoryScore, GradeResult, grade

__all__ = [
    "grade_recording",
    "GradeResult",
    "CategoryScore",
    "AudioFeatures",
    "ExpectedPerformance",
    "expected_from_musicxml",
    "default_expected",
    "DEFAULT_EXPECTED_SECONDS",
]


def grade_recording(
    audio_bytes: bytes,
    *,
    filename: str | None = None,
    mime: str | None = None,
    musicxml: str = "",
    tempo_label: str = "",
    client_duration: float = 0.0,
) -> GradeResult:
    """Grade one audio take end-to-end.

    Args:
        audio_bytes: The uploaded take (any container the decoder can read).
        filename / mime: Hints for the decoder (the byte signature wins).
        musicxml: The study's notation, when known, to make Completion concrete.
        tempo_label: The study's tempo string (e.g. "♩ = 80") as a bpm fallback.
        client_duration: Client-reported length, used only for the degraded
            (undecodable-audio) grade.

    Returns:
        A :class:`GradeResult`. If the audio can't be decoded, the result is a
        clearly-labelled, length-only grade rather than an invented one.
    """
    expected = (
        expected_from_musicxml(musicxml, tempo_label) if musicxml else default_expected()
    )

    decoded = decode_audio(audio_bytes, filename=filename, mime=mime)
    if decoded is None:
        return grade(
            AudioFeatures(duration_seconds=0.0, sample_rate=0),
            expected,
            analyzed=False,
            client_duration=client_duration,
        )

    features = analyze(decoded.samples, decoded.sample_rate)
    return grade(features, expected, analyzed=True, client_duration=client_duration)
