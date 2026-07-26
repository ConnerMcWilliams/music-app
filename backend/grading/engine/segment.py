"""
Grouping a frame-level pitch track into the notes a player actually sounded.

``analysis.py`` answers "what pitch is present at each 10 ms frame" and "where
did an attack happen", but it never joins the two — so nothing downstream could
say *which note* a pitch belonged to. This module makes that join, turning
:class:`AudioFeatures` into a list of :class:`PerformedNote`, which is what the
aligner matches against the notation.

The one design decision worth stating: note boundaries come from **attacks and
pitch changes together**, not attacks alone. Most of the Clarke studies are
slurred, and a slurred note change produces no attack transient at all — a
spectral-flux onset detector simply cannot see it. Relying on onsets alone would
merge whole slurred phrases into one enormous "note".

NumPy only, no Django, no I/O — unit-testable against synthesised tones.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .analysis import AudioFeatures

# A pitch move this large, sustained, starts a new note. Below it we assume the
# player is bending or the tracker is wobbling within one note. Well under a
# semitone so real steps are caught, well above typical intra-note waver.
_PITCH_STEP_SEMITONES = 0.7
# How many frames a new pitch must hold before it counts as a note change,
# rather than a single-frame tracker glitch or an octave slip on an attack.
_HOLD_FRAMES = 3
# One attack yields one note; matches the onset detector's own refractory.
_REFRACTORY_SECONDS = 0.06

# A brass attack's first moments are noise, and the release tails off, so both
# ends are trimmed before measuring a note's pitch.
_ATTACK_TRIM_SECONDS = 0.030
_RELEASE_TRIM_SECONDS = 0.020

# Segments shorter than this are artifacts, not notes.
_MIN_NOTE_SECONDS = 0.050
_MIN_PITCHED_FRAMES = 2


@dataclass(frozen=True)
class PerformedNote:
    """One note detected in the recording."""

    onset: float          # seconds
    offset: float         # seconds
    midi: float           # median sounding MIDI over the note's steady part
    cents: float          # signed cents from the nearest equal-tempered semitone
    confidence: float     # fraction of frames agreeing with the median pitch
    rms: float            # mean loudness over the note

    @property
    def duration(self) -> float:
        return max(0.0, self.offset - self.onset)


def segment_notes(features: AudioFeatures) -> list[PerformedNote]:
    """Group the frame-indexed pitch track into discrete performed notes."""
    f0 = features.f0_frames
    if f0.size == 0 or features.frame_times.size == 0:
        return []

    hop = features.hop_seconds
    if hop <= 0:
        return []

    midi = _midi_track(f0)
    pitched = ~np.isnan(midi)
    if not pitched.any():
        return []

    smoothed = _median_filter(midi, size=_HOLD_FRAMES)
    onset_frames = _onset_frames(features.onset_times, hop, midi.size)

    notes: list[PerformedNote] = []
    for run_start, run_end in _runs(pitched):
        # A run of continuously-pitched frames is a phrase; split it where an
        # attack or a sustained pitch change says a new note began.
        splits = _splits_in_run(run_start, run_end, smoothed, onset_frames, hop)
        bounds = [run_start, *splits, run_end]
        pieces: list[tuple[int, int]] = list(zip(bounds, bounds[1:], strict=False))
        for start, end in _merge_unarticulated(pieces, features, midi):
            note = _build_note(features, midi, start, end, hop)
            if note is not None:
                notes.append(note)
    return notes


# --- Internals --------------------------------------------------------------


def _midi_track(f0: np.ndarray) -> np.ndarray:
    """Frame-indexed MIDI numbers, NaN where the frame carried no pitch."""
    out = np.full(f0.shape, np.nan)
    valid = ~np.isnan(f0) & (f0 > 0)
    out[valid] = 69.0 + 12.0 * np.log2(f0[valid] / 440.0)
    return out


def _median_filter(values: np.ndarray, size: int) -> np.ndarray:
    """Small running median that ignores NaN, used to de-glitch the pitch track."""
    if size <= 1 or values.size == 0:
        return values.copy()
    half = size // 2
    out = np.full(values.shape, np.nan)
    for i in range(values.size):
        window = values[max(0, i - half) : i + half + 1]
        finite = window[~np.isnan(window)]
        if finite.size:
            out[i] = float(np.median(finite))
    return out


def _runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """Maximal ``[start, end)`` spans where ``mask`` is True."""
    if not mask.any():
        return []
    padded = np.concatenate(([False], mask, [False]))
    edges = np.flatnonzero(padded[1:] != padded[:-1])
    return list(zip(edges[0::2].tolist(), edges[1::2].tolist(), strict=True))


def _onset_frames(onset_times: np.ndarray, hop: float, n_frames: int) -> set[int]:
    if onset_times.size == 0:
        return set()
    frames = np.rint(onset_times / hop).astype(int)
    return {int(f) for f in frames if 0 <= f < n_frames}


def _splits_in_run(
    run_start: int,
    run_end: int,
    smoothed: np.ndarray,
    onset_frames: set[int],
    hop: float,
) -> list[int]:
    """Frame indices inside ``[run_start, run_end)`` where a new note begins."""
    candidates: set[int] = set()

    # Attacks the onset detector found inside this run.
    for frame in onset_frames:
        if run_start < frame < run_end:
            candidates.add(frame)

    # Sustained pitch changes — the slurred-note case onsets cannot see.
    for frame in range(run_start + 1, run_end):
        before = smoothed[frame - 1]
        after = smoothed[frame]
        if np.isnan(before) or np.isnan(after):
            continue
        if abs(after - before) < _PITCH_STEP_SEMITONES:
            continue
        if _holds(smoothed, frame, run_end, after):
            candidates.add(frame)

    # One attack, one note: collapse candidates inside the refractory window.
    refractory = max(1, int(round(_REFRACTORY_SECONDS / hop)))
    kept: list[int] = []
    last = run_start
    for frame in sorted(candidates):
        if frame - last >= refractory:
            kept.append(frame)
            last = frame
    return kept


def _merge_unarticulated(
    pieces: list[tuple[int, int]],
    features: AudioFeatures,
    midi: np.ndarray,
) -> list[tuple[int, int]]:
    """Rejoin neighbouring pieces that are really one held note.

    Two adjacent pieces at the same pitch with no dip in energy between them
    were never two notes — nothing re-articulated. This matters because
    ``_detect_onsets`` normalises spectral flux by its own maximum, so on a very
    even sustained tone it amplifies numerical noise into a stream of phantom
    attacks (a perfectly constant 1.2 s sine yields 14 of them). Requiring a
    corroborating amplitude dip keeps a genuine repeated note split, because
    re-tonguing always leaves a trough.
    """
    if len(pieces) < 2:
        return pieces

    merged: list[tuple[int, int]] = [pieces[0]]
    for start, end in pieces[1:]:
        prev_start, prev_end = merged[-1]
        same_pitch = abs(
            _median_of(midi, prev_start, prev_end) - _median_of(midi, start, end)
        ) <= 0.5
        if same_pitch and not _articulated(features.rms, prev_start, prev_end, start, end):
            merged[-1] = (prev_start, end)
        else:
            merged.append((start, end))
    return merged


def _median_of(values: np.ndarray, start: int, end: int) -> float:
    window = values[start:end]
    finite = window[~np.isnan(window)]
    return float(np.median(finite)) if finite.size else float("nan")


def _articulated(
    rms: np.ndarray, prev_start: int, prev_end: int, start: int, end: int
) -> bool:
    """True when energy dips at the boundary, i.e. the note was struck again."""
    if rms.size == 0:
        return False
    before = rms[prev_start:prev_end]
    after = rms[start:end]
    if before.size == 0 or after.size == 0:
        return False
    reference = min(float(np.mean(before)), float(np.mean(after)))
    if reference <= 0:
        return False
    # Look just either side of the boundary for a trough.
    lo = max(prev_start, start - 3)
    hi = min(end, start + 3)
    trough = float(np.min(rms[lo:hi])) if hi > lo else reference
    return trough < 0.75 * reference


def _holds(smoothed: np.ndarray, frame: int, run_end: int, value: float) -> bool:
    """True when the new pitch persists, rather than being a one-frame glitch."""
    stop = min(frame + _HOLD_FRAMES, run_end)
    window = smoothed[frame:stop]
    finite = window[~np.isnan(window)]
    if finite.size == 0:
        return False
    return bool(abs(float(np.median(finite)) - value) < _PITCH_STEP_SEMITONES)


def _build_note(
    features: AudioFeatures,
    midi: np.ndarray,
    start: int,
    end: int,
    hop: float,
) -> PerformedNote | None:
    """Measure one segment, or None when it is too short/unpitched to be a note."""
    onset = float(features.frame_times[start])
    offset = float(features.frame_times[min(end, features.frame_times.size) - 1]) + hop
    if offset - onset < _MIN_NOTE_SECONDS:
        return None

    # Measure pitch away from the attack transient and the release tail.
    lead = int(round(_ATTACK_TRIM_SECONDS / hop))
    tail = int(round(_RELEASE_TRIM_SECONDS / hop))
    core_start, core_end = start + lead, end - tail
    if core_end - core_start < _MIN_PITCHED_FRAMES:
        # Too short to trim; measure the whole thing rather than discard it.
        core_start, core_end = start, end

    core = midi[core_start:core_end]
    finite = core[~np.isnan(core)]
    if finite.size < _MIN_PITCHED_FRAMES:
        return None

    median = float(np.median(finite))
    # Median, not mean: an octave slip on one frame would drag a mean badly.
    confidence = float(np.mean(np.abs(finite - median) <= 0.5))
    cents = (median - round(median)) * 100.0

    rms_slice = features.rms[start:end]
    rms = float(np.mean(rms_slice)) if rms_slice.size else 0.0

    return PerformedNote(
        onset=onset,
        offset=offset,
        midi=median,
        cents=cents,
        confidence=confidence,
        rms=rms,
    )
