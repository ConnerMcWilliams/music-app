"""
Matching what was played against what was written.

Given the notated :class:`ExpectedNote` sequence and the :class:`PerformedNote`
sequence detected in the audio, decide which performed note corresponds to which
notated one — and therefore which notes were played correctly, played wrong, or
not played at all.

**Why a dynamic program and not a greedy walk.** A greedy matcher is fine until
the player inserts or drops a single note; from then on every following pair is
off by one and the whole study reads as wrong. That is the worst possible
failure for a practice tool — one slip, and the app tells you that you played
nothing right. Semi-global Needleman–Wunsch pays a bounded price for a gap and
then recovers, so one mistake stays one mistake.

**Why not frame-level DTW.** DTW aligns time series by *stretching*, so it
cannot express a deletion at all — it would smear a skipped note across its
neighbours — and it costs ~100× more over every frame pair. Notes are the right
granularity: at most a few hundred per side, so the table is trivial.

**Free end gaps** (leading gaps cost nothing, and the best score is taken across
the whole final row/column) are what make the ends forgiving. Every bundled
Clarke study is written with repeats; a player who takes the repeat produces a
second pass that falls out as unpenalised trailing insertions instead of
hundreds of spurious errors. The same mechanism absorbs a count-in, a false
start, and a study that stops early.

NumPy only; no Django, no I/O.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .segment import PerformedNote
from .timeline import ExpectedNote, ExpectedTimeline

# --- Verdict vocabulary (mirrors NoteState in apps/mobile/src/types/index.ts) --
CORRECT = "correct"
WRONG = "wrong"
MISSED = "missed"

# A performed pitch this close to the notated one counts as that note. 60 cents
# is deliberately loose: brass players bend, and the notation is OMR output from
# a 1912 scan, so a tighter bound mostly manufactures false errors.
PITCH_TOLERANCE_SEMITONES = 0.6

# Alignment scores. A substitution can go slightly negative, but never as
# negative as the two gaps that would replace it — so the aligner prefers to
# call a note "wrong" rather than "missed *and* extra", which is also how a
# teacher would describe it.
_SCORE_PITCH_MATCH = 1.0
_SCORE_PITCH_OCTAVE = 0.15   # right pitch class, wrong octave
_SCORE_PITCH_MISMATCH = -0.5
_GAP = -0.6

# Pass 1 is pitch-driven with a very loose clock, purely to find *which* notes
# correspond so the tempo can be fitted from them. Pass 2 uses the fitted clock
# and weighs timing properly.
_PASS1_PITCH_WEIGHT = 0.85
_PASS1_TIME_TOLERANCE = 4.0  # seconds — effectively "ignore timing"
_PASS2_PITCH_WEIGHT = 0.5
_PASS2_TIME_TOLERANCE_FLOOR = 0.25  # seconds

# Below this share of gradeable notes actually accounted for (paired with
# *something* played), the alignment is not telling us anything trustworthy and
# the caller must fall back to reference-free scoring.
MIN_ACCOUNTED_RATIO = 0.4
# ...and below this share of the study reached at all, we are grading a fragment.
MIN_COVERAGE_RATIO = 0.5
# Below this share actually *correct*, the likeliest explanation is that we are
# comparing against the wrong music — a mis-selected study, a bad transcription,
# or pitch detection that failed — not that the player got almost everything
# wrong. Falling back is the forgiving choice on purpose: showing a practising
# player a wall of red they didn't earn destroys trust in the feature, and the
# Tempo/Tone/Completion categories still reflect a genuinely poor take.
MIN_CORRECT_RATIO = 0.25


@dataclass(frozen=True)
class NoteVerdict:
    """How one notated note was played."""

    expected_index: int
    status: str
    # Signed cents from the expected pitch (None when nothing was played).
    cents_error: float | None = None
    # Signed onset error in beats; positive is late (None when nothing played).
    timing_error_beats: float | None = None
    # What was actually heard, rounded to a semitone — powers "expected D, heard C♯".
    heard_midi: float | None = None


@dataclass(frozen=True)
class Alignment:
    """The outcome of matching one take against one study."""

    verdicts: list[NoteVerdict]
    # Performed notes that matched nothing notated.
    extra_notes: int
    # Seconds-per-beat and origin actually fitted to the performance.
    seconds_per_beat: float
    origin_seconds: float
    # True when the result is too poor to be believed — see MIN_ACCOUNTED_RATIO.
    degenerate: bool

    @property
    def gradeable(self) -> int:
        return len(self.verdicts)

    def count(self, status: str) -> int:
        return sum(1 for v in self.verdicts if v.status == status)

    @property
    def summary(self) -> dict:
        return {
            "correct": self.count(CORRECT),
            "wrong": self.count(WRONG),
            "missed": self.count(MISSED),
            "extra": self.extra_notes,
            "gradeable": self.gradeable,
        }


def align(
    timeline: ExpectedTimeline,
    performed: list[PerformedNote],
) -> Alignment | None:
    """Align a performance against a study's notation.

    Returns ``None`` when there is nothing to align. The result may still be
    flagged ``degenerate``; callers must check it before trusting the verdicts.
    """
    expected = timeline.notes
    if not expected or not performed:
        return None

    seconds_per_beat = 60.0 / timeline.bpm
    origin = performed[0].onset - expected[0].onset_beats * seconds_per_beat

    # Pass 1 — pitch-driven, loose clock: find the correspondence.
    pairs = _align_pass(
        expected, performed, origin, seconds_per_beat,
        pitch_weight=_PASS1_PITCH_WEIGHT, time_tolerance=_PASS1_TIME_TOLERANCE,
    )
    # Fit the tempo the player actually used, so Rhythm judges *relative* timing
    # within their own tempo. Absolute steadiness is scored separately by the
    # existing Tempo category, so this is not letting a slow take off the hook.
    seconds_per_beat, origin = _fit_tempo(
        expected, performed, pairs, seconds_per_beat, origin
    )

    # Pass 2 — fitted clock, timing now carries real weight.
    tolerance = max(
        _PASS2_TIME_TOLERANCE_FLOOR,
        0.35 * float(np.median([n.duration_beats for n in expected])) * seconds_per_beat,
    )
    pairs = _align_pass(
        expected, performed, origin, seconds_per_beat,
        pitch_weight=_PASS2_PITCH_WEIGHT, time_tolerance=tolerance,
    )

    return _build_alignment(
        expected, performed, pairs, origin, seconds_per_beat, timeline
    )


# --- Dynamic program --------------------------------------------------------


def _align_pass(
    expected: list[ExpectedNote],
    performed: list[PerformedNote],
    origin: float,
    seconds_per_beat: float,
    *,
    pitch_weight: float,
    time_tolerance: float,
) -> list[tuple[int, int]]:
    """One semi-global alignment; returns the matched ``(expected, performed)`` pairs."""
    n, m = len(expected), len(performed)
    substitution = _substitution_matrix(
        expected, performed, origin, seconds_per_beat,
        pitch_weight=pitch_weight, time_tolerance=time_tolerance,
    )

    # score[i][j] = best score aligning expected[:i] against performed[:j].
    # Row 0 and column 0 stay at zero: leading gaps on either side are free.
    score = np.zeros((n + 1, m + 1))
    # 0 = diagonal (pair), 1 = expected gap (missed), 2 = performed gap (extra).
    back = np.zeros((n + 1, m + 1), dtype=np.int8)
    back[0, 1:] = 2
    back[1:, 0] = 1

    for i in range(1, n + 1):
        row, prev = score[i], score[i - 1]
        brow = back[i]
        sub_row = substitution[i - 1]
        for j in range(1, m + 1):
            diagonal = prev[j - 1] + sub_row[j - 1]
            up = prev[j] + _GAP          # expected note with no performed partner
            left = row[j - 1] + _GAP     # performed note with no expected partner
            if diagonal >= up and diagonal >= left:
                row[j], brow[j] = diagonal, 0
            elif up >= left:
                row[j], brow[j] = up, 1
            else:
                row[j], brow[j] = left, 2

    i, j = _best_end_cell(score, n, m)
    pairs: list[tuple[int, int]] = []
    while i > 0 and j > 0:
        move = back[i, j]
        if move == 0:
            pairs.append((i - 1, j - 1))
            i, j = i - 1, j - 1
        elif move == 1:
            i -= 1
        else:
            j -= 1
    pairs.reverse()
    return pairs


def _best_end_cell(score: np.ndarray, n: int, m: int) -> tuple[int, int]:
    """Best cell on the final row or column — trailing gaps on either side are free."""
    last_row = score[n, :]
    last_col = score[:, m]
    j_best = int(np.argmax(last_row))
    i_best = int(np.argmax(last_col))
    if last_row[j_best] >= last_col[i_best]:
        return n, j_best
    return i_best, m


def _substitution_matrix(
    expected: list[ExpectedNote],
    performed: list[PerformedNote],
    origin: float,
    seconds_per_beat: float,
    *,
    pitch_weight: float,
    time_tolerance: float,
) -> np.ndarray:
    """``(len(expected), len(performed))`` pairing scores."""
    expected_midi = np.array([e.midi for e in expected])[:, None]
    performed_midi = np.array([p.midi for p in performed])[None, :]
    expected_time = (
        origin + np.array([e.onset_beats for e in expected]) * seconds_per_beat
    )[:, None]
    performed_time = np.array([p.onset for p in performed])[None, :]

    delta = np.abs(performed_midi - expected_midi)
    pitch = np.full(delta.shape, _SCORE_PITCH_MISMATCH)
    # Right pitch class but the wrong octave — a real player error, but also the
    # classic autocorrelation slip, so it is scored as a near-miss rather than a
    # stranger. It still pairs, which keeps the rest of the study aligned.
    octave_off = np.abs(delta - 12.0) <= PITCH_TOLERANCE_SEMITONES
    octave_off |= np.abs(delta - 24.0) <= PITCH_TOLERANCE_SEMITONES
    pitch[octave_off] = _SCORE_PITCH_OCTAVE
    pitch[delta <= PITCH_TOLERANCE_SEMITONES] = _SCORE_PITCH_MATCH

    timing = np.clip(
        1.0 - np.abs(performed_time - expected_time) / max(time_tolerance, 1e-6), 0.0, 1.0
    )
    return pitch_weight * pitch + (1.0 - pitch_weight) * timing


def _fit_tempo(
    expected: list[ExpectedNote],
    performed: list[PerformedNote],
    pairs: list[tuple[int, int]],
    seconds_per_beat: float,
    origin: float,
) -> tuple[float, float]:
    """Least-squares ``onset = origin + beats × seconds_per_beat`` over good pairs."""
    good = [
        (expected[i].onset_beats, performed[j].onset)
        for i, j in pairs
        if abs(performed[j].midi - expected[i].midi) <= PITCH_TOLERANCE_SEMITONES
    ]
    if len(good) < 3:
        return seconds_per_beat, origin
    beats = np.array([b for b, _ in good])
    seconds = np.array([s for _, s in good])
    if float(np.ptp(beats)) <= 0:
        return seconds_per_beat, origin
    slope, intercept = np.polyfit(beats, seconds, 1)
    # Reject a nonsensical fit (negative or wildly off) rather than trusting it.
    if not np.isfinite(slope) or slope <= 0:
        return seconds_per_beat, origin
    if not 0.25 * seconds_per_beat <= slope <= 4.0 * seconds_per_beat:
        return seconds_per_beat, origin
    return float(slope), float(intercept)


# --- Verdicts ---------------------------------------------------------------


def _build_alignment(
    expected: list[ExpectedNote],
    performed: list[PerformedNote],
    pairs: list[tuple[int, int]],
    origin: float,
    seconds_per_beat: float,
    timeline: ExpectedTimeline,
) -> Alignment:
    by_expected = dict(pairs)

    if not pairs:
        return Alignment(
            verdicts=[], extra_notes=len(performed), seconds_per_beat=seconds_per_beat,
            origin_seconds=origin, degenerate=True,
        )

    # Grade only the span the player actually reached. Notes before the first
    # match or after the last are not "wrong" — they were never attempted, and
    # the Completion category already scores how much of the study was covered.
    # Without this, a study whose notation carries trailing OMR junk (every
    # Study 6 file ends with a spurious extra note) would show a permanent red.
    first = min(i for i, _ in pairs)
    last = max(i for i, _ in pairs)

    verdicts: list[NoteVerdict] = []
    for i in range(first, last + 1):
        note = expected[i]
        j = by_expected.get(i)
        if j is None:
            verdicts.append(NoteVerdict(expected_index=note.index, status=MISSED))
            continue
        played = performed[j]
        delta = played.midi - note.midi
        expected_onset = origin + note.onset_beats * seconds_per_beat
        timing_beats = (played.onset - expected_onset) / seconds_per_beat
        status = CORRECT if abs(delta) <= PITCH_TOLERANCE_SEMITONES else WRONG
        verdicts.append(
            NoteVerdict(
                expected_index=note.index,
                status=status,
                cents_error=float(delta * 100.0),
                timing_error_beats=float(timing_beats),
                heard_midi=float(round(played.midi)),
            )
        )

    matched_performed = {j for _, j in pairs}
    # Only count insertions *inside* the performed span as extra notes; anything
    # before or after is a count-in, a repeat, or room noise.
    lo, hi = min(matched_performed), max(matched_performed)
    extra = sum(1 for j in range(lo, hi + 1) if j not in matched_performed)

    accounted = sum(1 for v in verdicts if v.status in (CORRECT, WRONG))
    correct = sum(1 for v in verdicts if v.status == CORRECT)
    coverage = len(verdicts) / len(expected) if expected else 0.0
    degenerate = (
        not verdicts
        or accounted < MIN_ACCOUNTED_RATIO * len(verdicts)
        or correct < MIN_CORRECT_RATIO * len(verdicts)
        or coverage < MIN_COVERAGE_RATIO
    )

    return Alignment(
        verdicts=verdicts,
        extra_notes=extra,
        seconds_per_beat=seconds_per_beat,
        origin_seconds=origin,
        degenerate=degenerate,
    )
