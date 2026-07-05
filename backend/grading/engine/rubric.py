"""
Rubric scoring — the musical judgement layer.

Turns :class:`AudioFeatures` (plus an optional :class:`ExpectedPerformance`)
into the 100-point grade defined in ``docs/grading-rubric.md``:

    Pitch 25 · Rhythm 25 · Tempo 20 · Tone 15 · Completion 15

Every category is computed as a quality in ``[0, 1]`` and multiplied by its point
weight, so the maximums always sum to 100 and the wire ``total_score`` equals the
sum of the raw category points.

Per the doc's v1 philosophy this rewards *fundamentals* and is deliberately
approximate: it does not attempt professional intonation judgement or note-level
transcription. Where no notation reference is available it scores the recording's
intrinsic steadiness/in-tune-ness (a slow, steady take beats a fast sloppy one).

This module is pure Python over plain floats/arrays — no Django, no I/O — so it
unit-tests directly against synthetic features.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .analysis import AudioFeatures
from .reference import ExpectedPerformance, default_expected

# Point weights, straight from the rubric doc.
MAX_PITCH = 25
MAX_RHYTHM = 25
MAX_TEMPO = 20
MAX_TONE = 15
MAX_COMPLETION = 15


@dataclass(frozen=True)
class CategoryScore:
    key: str
    label: str
    points: float        # earned points, 0..max
    max_points: int
    detail: str          # short human note used to build feedback

    @property
    def percent(self) -> int:
        """0–100 for the UI bar (points as a fraction of this category's max)."""
        if self.max_points <= 0:
            return 0
        return int(round(100.0 * self.points / self.max_points))


@dataclass(frozen=True)
class GradeResult:
    total_score: int
    grade_label: str
    band: str
    categories: list[CategoryScore]
    summary: str
    practice_tip: str
    analyzed: bool
    detail: dict = field(default_factory=dict)


def grade(
    features: AudioFeatures,
    expected: ExpectedPerformance | None = None,
    *,
    analyzed: bool = True,
    client_duration: float = 0.0,
) -> GradeResult:
    """Score ``features`` against the rubric.

    ``analyzed=False`` signals the audio couldn't be decoded on the server; only
    Completion (from the client-reported duration) is credited and the feedback
    says so, rather than fabricating pitch/tone scores.
    """
    expected = expected or default_expected()

    if not analyzed:
        return _unanalyzed_result(expected, client_duration)

    categories = [
        _score_pitch(features),
        _score_rhythm(features),
        _score_tempo(features),
        _score_tone(features),
        _score_completion(features, expected),
    ]
    return _assemble(categories, analyzed=True)


# --- Category scorers -------------------------------------------------------
#
# Each returns a CategoryScore. Helpers below map an error/deviation onto a
# quality in [0, 1] via `_quality` (1 when error≈0, 0 at/beyond a "bad" bound).


def _score_pitch(f: AudioFeatures) -> CategoryScore:
    """Pitch accuracy (25): in-tune-ness of sustained pitches + how much of the
    sound was cleanly pitched vs breathy/cracked."""
    if f.cents_deviation.size == 0:
        return CategoryScore(
            "pitch", "Pitch Accuracy", 0.0, MAX_PITCH,
            "no clear pitch was detected",
        )
    mean_cents = float(np.mean(np.abs(f.cents_deviation)))
    # 0 cents → 1.0; 50 cents (a quarter-tone off) → 0.0.
    intune = _quality(mean_cents, bad=50.0)
    coverage = _clamp(f.pitched_ratio / 0.8)  # ~80% pitched frames = full marks
    quality = 0.75 * intune + 0.25 * coverage
    detail = f"averaged {mean_cents:.0f} cents from centre pitch"
    return CategoryScore("pitch", "Pitch Accuracy", quality * MAX_PITCH, MAX_PITCH, detail)


def _score_rhythm(f: AudioFeatures) -> CategoryScore:
    """Rhythm accuracy (25): how consistently note onsets fall on a steady
    subdivision grid (Clarke patterns are even note streams)."""
    onsets = f.onset_times
    if onsets.size < 3:
        # Not enough attacks to judge rhythm; give partial credit scaled by how
        # much sound is present rather than a flat zero.
        quality = 0.3 * _clamp(f.voiced_ratio / 0.5)
        return CategoryScore(
            "rhythm", "Rhythm", quality * MAX_RHYTHM, MAX_RHYTHM,
            "too few distinct notes to assess timing",
        )
    iois = np.diff(onsets)
    grid = float(np.median(iois))
    if grid <= 0:
        return CategoryScore("rhythm", "Rhythm", 0.0, MAX_RHYTHM, "unstable onset timing")
    # Snap each interval to the nearest whole multiple of the grid; the leftover
    # (as a fraction of a grid unit) is the timing error.
    ratios = iois / grid
    quantized = np.maximum(1.0, np.round(ratios))
    errors = np.abs(ratios - quantized)
    mean_error = float(np.mean(errors))
    quality = _quality(mean_error, bad=0.5)  # half-a-slot average error → 0
    detail = (
        "kept even, on-the-beat timing" if mean_error < 0.06
        else f"onsets drifted about {mean_error * 100:.0f}% off the beat grid"
    )
    return CategoryScore("rhythm", "Rhythm", quality * MAX_RHYTHM, MAX_RHYTHM, detail)


def _score_tempo(f: AudioFeatures) -> CategoryScore:
    """Tempo consistency (20): steadiness of pulse over the whole take —
    penalise drift (gradual rush/drag) and sudden jumps, not slowness."""
    onsets = f.onset_times
    if onsets.size < 4:
        quality = 0.3 * _clamp(f.voiced_ratio / 0.5)
        return CategoryScore(
            "tempo", "Tempo Consistency", quality * MAX_TEMPO, MAX_TEMPO,
            "not enough notes to gauge tempo",
        )
    iois = np.diff(onsets)
    # Drift: how much the pulse changes from the first third to the last third.
    third = max(1, iois.size // 3)
    start = float(np.median(iois[:third]))
    end = float(np.median(iois[-third:]))
    drift = abs(end - start) / start if start > 0 else 1.0
    # Jitter: overall spread of the pulse (robust CV via the median).
    median_ioi = float(np.median(iois))
    jitter = float(np.std(iois)) / median_ioi if median_ioi > 0 else 1.0
    quality = 0.6 * _quality(drift, bad=0.35) + 0.4 * _quality(jitter, bad=0.6)
    direction = "rushed" if end < start else "dragged"
    detail = (
        "held a steady tempo" if drift < 0.08
        else f"{direction} by about {drift * 100:.0f}% over the take"
    )
    return CategoryScore("tempo", "Tempo Consistency", quality * MAX_TEMPO, MAX_TEMPO, detail)


def _score_tone(f: AudioFeatures) -> CategoryScore:
    """Tone stability (15): even loudness with no dropouts, plus steady pitch
    within notes (no excessive waver). Kept simple per the v1 rule."""
    voiced = f.rms[f.rms > 0]
    if voiced.size < 3:
        return CategoryScore("tone", "Tone Stability", 0.0, MAX_TONE, "no sustained tone")
    loud = float(np.percentile(f.rms, 95))
    voiced_frames = f.rms[f.rms >= max(loud * 0.12, 1e-4)]
    if voiced_frames.size < 3:
        return CategoryScore("tone", "Tone Stability", 0.0, MAX_TONE, "no sustained tone")
    # Loudness evenness during sound.
    cv = float(np.std(voiced_frames)) / float(np.mean(voiced_frames))
    evenness = _quality(cv, bad=0.7)
    # Dropouts: quiet dips inside the sounding region read as cracked/broken tone.
    dropouts = float(np.mean(voiced_frames < loud * 0.25))
    steady = 1.0 - _clamp(dropouts / 0.3)
    # Pitch waver within the take.
    waver = float(np.std(f.cents_deviation)) if f.cents_deviation.size > 2 else 0.0
    smoothness = _quality(waver, bad=45.0)
    quality = 0.5 * evenness + 0.3 * steady + 0.2 * smoothness
    detail = "clear, even tone" if quality > 0.8 else "tone wavered in places"
    return CategoryScore("tone", "Tone Stability", quality * MAX_TONE, MAX_TONE, detail)


def _score_completion(f: AudioFeatures, expected: ExpectedPerformance) -> CategoryScore:
    """Completion (15): did they play the whole thing, and not get cut off."""
    reached = _clamp(f.sound_seconds / expected.expected_seconds)
    quality = 0.85 * reached
    # A clean ending (release, not a hard cut mid-note) earns the remainder.
    if not f.truncated:
        quality += 0.15
    quality = _clamp(quality)
    if reached >= 0.9 and not f.truncated:
        detail = "played through to the end"
    elif f.truncated:
        detail = "recording looks cut off before the final note"
    else:
        detail = f"captured about {reached * 100:.0f}% of the expected length"
    return CategoryScore(
        "completion", "Completion", quality * MAX_COMPLETION, MAX_COMPLETION, detail
    )


# --- Assembly & feedback ----------------------------------------------------


def _assemble(categories: list[CategoryScore], *, analyzed: bool) -> GradeResult:
    total = int(round(sum(c.points for c in categories)))
    total = int(np.clip(total, 0, 100))
    label, band = _grade_label(total)
    summary, tip = _feedback(total, categories)
    detail = {c.key: round(c.points, 2) for c in categories}
    return GradeResult(
        total_score=total,
        grade_label=label,
        band=band,
        categories=categories,
        summary=summary,
        practice_tip=tip,
        analyzed=analyzed,
        detail=detail,
    )


def _unanalyzed_result(expected: ExpectedPerformance, client_duration: float) -> GradeResult:
    """Degraded grade when the audio couldn't be decoded on the server."""
    reached = _clamp(client_duration / expected.expected_seconds) if client_duration else 0.0
    completion = CategoryScore(
        "completion", "Completion", 0.85 * reached * MAX_COMPLETION, MAX_COMPLETION,
        "length only (audio wasn't analysed)",
    )
    zero = lambda key, lbl, mx: CategoryScore(  # noqa: E731
        key, lbl, 0.0, mx, "audio couldn't be analysed on the server"
    )
    categories = [
        zero("pitch", "Pitch Accuracy", MAX_PITCH),
        zero("rhythm", "Rhythm", MAX_RHYTHM),
        zero("tempo", "Tempo Consistency", MAX_TEMPO),
        zero("tone", "Tone Stability", MAX_TONE),
        completion,
    ]
    result = _assemble(categories, analyzed=False)
    return GradeResult(
        total_score=result.total_score,
        grade_label=result.grade_label,
        band=result.band,
        categories=categories,
        summary=(
            "We received your take but couldn't analyse the audio format on the "
            "server, so only length was scored."
        ),
        practice_tip=(
            "Upload a WAV file, or install FFmpeg on the backend, to get a full "
            "pitch, rhythm, and tone grade."
        ),
        analyzed=False,
        detail=result.detail,
    )


# Letter grade + rubric "score band" from the total score.
def _grade_label(total: int) -> tuple[str, str]:
    bands = [
        (93, "A", "Excellent fundamentals"),
        (90, "A−", "Excellent fundamentals"),
        (87, "B+", "Strong performance with small issues"),
        (83, "B", "Strong performance with small issues"),
        (80, "B−", "Strong performance with small issues"),
        (77, "C+", "Good attempt with noticeable mistakes"),
        (73, "C", "Good attempt with noticeable mistakes"),
        (70, "C−", "Good attempt with noticeable mistakes"),
        (67, "D+", "Needs focused practice"),
        (63, "D", "Needs focused practice"),
        (60, "D−", "Needs focused practice"),
    ]
    for floor, label, band in bands:
        if total >= floor:
            return label, band
    return "F", "Recording or performance needs major improvement"


# Per-category coaching tips, keyed by the weakest area.
_TIPS = {
    "pitch": "Play long tones against a tuner or drone to centre each pitch.",
    "rhythm": "Practise slowly with a metronome so every note lands on the click.",
    "tempo": "Set a metronome and hold one steady tempo from the first note to the last.",
    "tone": "Work slow, even long tones — steady air keeps the sound from wavering.",
    "completion": "Record the full exercise start to finish without stopping.",
}


def _feedback(total: int, categories: list[CategoryScore]) -> tuple[str, str]:
    """A short summary + one practice tip, driven by the weakest category."""
    ranked = sorted(categories, key=lambda c: c.points / c.max_points)
    weakest = ranked[0]
    strongest = ranked[-1]

    weak = weakest.label.lower()
    if total >= 90:
        summary = f"Excellent, well-rounded take — {strongest.detail}."
    elif total >= 80:
        summary = (
            f"Strong playing overall; {strongest.detail}. "
            f"Main thing to watch: {weakest.detail}."
        )
    elif total >= 70:
        summary = f"Good attempt. The clearest issue was {weak} — {weakest.detail}."
    elif total >= 60:
        summary = f"Solid start, but {weak} needs work — {weakest.detail}."
    else:
        summary = f"This take needs another pass — {weakest.detail}."

    return summary, _TIPS.get(weakest.key, _TIPS["tempo"])


# --- Small numeric helpers --------------------------------------------------


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return float(min(max(value, low), high))


def _quality(error: float, *, bad: float) -> float:
    """Map an error onto a quality in [0, 1]: 1 at error 0, 0 at/above ``bad``."""
    if bad <= 0:
        return 1.0
    return _clamp(1.0 - error / bad)
