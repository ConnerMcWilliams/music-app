"""
Signal analysis for the grading engine.

Extracts the low-level, instrument-agnostic features the rubric scores from a
mono PCM signal: where sound is present (loudness envelope), what pitch is being
played (autocorrelation fundamental + how far it sits from equal temperament),
and where notes begin (spectral-flux onsets).

The output is a plain :class:`AudioFeatures` dataclass of floats/arrays — no
scoring or musical judgement happens here. That separation keeps the rubric
(``rubric.py``) testable with synthetic features and keeps this module a pure,
reusable DSP layer, matching the "grading module" split in
``docs/architecture.md``.

The DSP is deliberately classic and lightweight (framed RMS, FFT
autocorrelation, spectral flux) — accurate enough for the v1 rubric's
"reward the fundamentals" goal without pulling in a heavy audio stack.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

# Frame geometry in seconds, converted to samples per signal so behaviour is
# identical regardless of the incoming sample rate.
_FRAME_SECONDS = 0.046  # ~46 ms analysis window
_HOP_SECONDS = 0.010    # 10 ms hop → 100 frames/sec

# Trumpet-plus-margin fundamental range searched by the pitch tracker. Written
# B♭-trumpet range is roughly F#3–C6; we widen it so detection is not the thing
# that fails a slightly low or high player.
_MIN_F0_HZ = 150.0
_MAX_F0_HZ = 1_250.0

# A frame counts as "pitched" only when the autocorrelation peak is this strong,
# i.e. the sound is clearly periodic rather than breath/noise.
_PERIODICITY_FLOOR = 0.55


@dataclass(frozen=True)
class AudioFeatures:
    """Per-recording features derived from the raw signal."""

    duration_seconds: float
    sample_rate: int

    # Loudness envelope (one value per frame) and matching frame onset times.
    frame_times: np.ndarray = field(default_factory=lambda: np.zeros(0))
    rms: np.ndarray = field(default_factory=lambda: np.zeros(0))

    # Fraction of frames with any sound above the noise floor.
    voiced_ratio: float = 0.0
    # Wall-clock seconds of actual sound (voiced frames × hop).
    sound_seconds: float = 0.0
    # True when the take ends mid-note at full energy (likely cut off) rather
    # than with a release/decay.
    truncated: bool = False

    # Estimated fundamental (Hz) and signed cents-from-nearest-semitone for each
    # confidently pitched frame; parallel arrays.
    f0_hz: np.ndarray = field(default_factory=lambda: np.zeros(0))
    cents_deviation: np.ndarray = field(default_factory=lambda: np.zeros(0))
    # Fraction of voiced frames that were confidently pitched.
    pitched_ratio: float = 0.0

    # Detected note onset times (seconds).
    onset_times: np.ndarray = field(default_factory=lambda: np.zeros(0))

    @property
    def note_count(self) -> int:
        return int(self.onset_times.size)


def analyze(samples: np.ndarray, sample_rate: int) -> AudioFeatures:
    """Compute :class:`AudioFeatures` for a mono float signal."""
    samples = np.asarray(samples, dtype=np.float32)
    duration = len(samples) / sample_rate if sample_rate > 0 else 0.0

    frame_len = max(256, int(_FRAME_SECONDS * sample_rate))
    hop = max(1, int(_HOP_SECONDS * sample_rate))

    if samples.size < frame_len:
        # Too short to frame — report duration only; the rubric handles this as
        # a near-empty take.
        return AudioFeatures(duration_seconds=duration, sample_rate=sample_rate)

    frames = _frame_signal(samples, frame_len, hop)
    frame_times = np.arange(frames.shape[0]) * hop / sample_rate

    rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1))
    voiced_mask = _voiced_mask(rms)
    voiced_ratio = float(np.mean(voiced_mask)) if rms.size else 0.0
    sound_seconds = float(np.count_nonzero(voiced_mask) * hop / sample_rate)

    f0_hz, cents_dev, pitched_ratio = _track_pitch(
        frames, voiced_mask, sample_rate, frame_len
    )
    onset_times = _detect_onsets(frames, hop, sample_rate)
    truncated = _is_truncated(rms, voiced_mask)

    return AudioFeatures(
        duration_seconds=duration,
        sample_rate=sample_rate,
        frame_times=frame_times,
        rms=rms,
        voiced_ratio=voiced_ratio,
        sound_seconds=sound_seconds,
        truncated=truncated,
        f0_hz=f0_hz,
        cents_deviation=cents_dev,
        pitched_ratio=pitched_ratio,
        onset_times=onset_times,
    )


def _frame_signal(samples: np.ndarray, frame_len: int, hop: int) -> np.ndarray:
    """Slice ``samples`` into overlapping frames as a (n_frames, frame_len) view."""
    n_frames = 1 + (samples.size - frame_len) // hop
    idx = np.arange(frame_len)[None, :] + hop * np.arange(n_frames)[:, None]
    return samples[idx]


def _voiced_mask(rms: np.ndarray) -> np.ndarray:
    """Frames that carry sound, via an adaptive threshold on the RMS envelope."""
    if rms.size == 0:
        return np.zeros(0, dtype=bool)
    loud = float(np.percentile(rms, 95))
    if loud <= 0:
        return np.zeros(rms.shape, dtype=bool)
    # 12% of the loud level, floored so a silent recording is not "voiced".
    threshold = max(loud * 0.12, 1e-4)
    return rms >= threshold


def _track_pitch(
    frames: np.ndarray, voiced_mask: np.ndarray, sample_rate: int, frame_len: int
) -> tuple[np.ndarray, np.ndarray, float]:
    """Estimate the fundamental of each voiced frame by FFT autocorrelation.

    Returns ``(f0_hz, cents_deviation, pitched_ratio)`` where the first two are
    parallel arrays over the confidently-pitched frames only.
    """
    voiced_idx = np.nonzero(voiced_mask)[0]
    if voiced_idx.size == 0:
        return np.zeros(0), np.zeros(0), 0.0

    min_lag = max(2, int(sample_rate / _MAX_F0_HZ))
    max_lag = min(frame_len - 1, int(sample_rate / _MIN_F0_HZ))
    if max_lag <= min_lag:
        return np.zeros(0), np.zeros(0), 0.0

    window = np.hanning(frame_len)
    fft_len = 1 << int(np.ceil(np.log2(2 * frame_len)))

    f0_list: list[float] = []
    cents_list: list[float] = []
    for i in voiced_idx:
        frame = frames[i].astype(np.float64)
        frame = (frame - frame.mean()) * window
        spectrum = np.fft.rfft(frame, n=fft_len)
        autocorr = np.fft.irfft(spectrum * np.conj(spectrum), n=fft_len)[:max_lag + 1]
        if autocorr[0] <= 0:
            continue

        segment = autocorr[min_lag:max_lag + 1]
        peak = int(np.argmax(segment)) + min_lag
        periodicity = autocorr[peak] / autocorr[0]
        if periodicity < _PERIODICITY_FLOOR:
            continue

        lag = _parabolic_peak(autocorr, peak)
        f0 = sample_rate / lag
        if not (_MIN_F0_HZ <= f0 <= _MAX_F0_HZ):
            continue

        midi = 69.0 + 12.0 * np.log2(f0 / 440.0)
        cents = (midi - round(midi)) * 100.0
        f0_list.append(f0)
        cents_list.append(cents)

    pitched_ratio = len(f0_list) / voiced_idx.size if voiced_idx.size else 0.0
    return np.asarray(f0_list), np.asarray(cents_list), float(pitched_ratio)


def _parabolic_peak(values: np.ndarray, peak: int) -> float:
    """Sub-sample lag of an autocorrelation peak via parabolic interpolation."""
    if peak <= 0 or peak >= values.size - 1:
        return float(peak)
    left, mid, right = values[peak - 1], values[peak], values[peak + 1]
    denom = left - 2.0 * mid + right
    if denom == 0:
        return float(peak)
    return peak + 0.5 * (left - right) / denom


def _detect_onsets(frames: np.ndarray, hop: int, sample_rate: int) -> np.ndarray:
    """Note onsets via spectral flux with adaptive peak-picking."""
    if frames.shape[0] < 3:
        return np.zeros(0)

    window = np.hanning(frames.shape[1])
    magnitudes = np.abs(np.fft.rfft(frames * window, axis=1))
    # Spectral flux: summed positive change in magnitude between frames.
    flux = np.sum(np.maximum(0.0, np.diff(magnitudes, axis=0)), axis=1)
    if flux.max() <= 0:
        return np.zeros(0)
    flux = flux / flux.max()

    # Adaptive threshold = local mean + margin, over a ~150 ms window.
    win = max(3, int(0.15 * sample_rate / hop))
    threshold = _moving_average(flux, win) + 0.10

    # Enforce a refractory gap so one attack yields one onset.
    min_gap = max(1, int(0.06 * sample_rate / hop))
    onsets: list[int] = []
    last = -min_gap
    for i in range(1, flux.size - 1):
        if (
            flux[i] > threshold[i]
            and flux[i] >= flux[i - 1]
            and flux[i] > flux[i + 1]
            and i - last >= min_gap
        ):
            onsets.append(i)
            last = i

    if not onsets:
        return np.zeros(0)
    # +1 aligns the flux index (a difference between frames i and i+1) with the
    # onset frame.
    return (np.asarray(onsets) + 1) * hop / sample_rate


def _moving_average(values: np.ndarray, window: int) -> np.ndarray:
    if window <= 1 or values.size == 0:
        return values.copy()
    padded = np.pad(values, window // 2, mode="edge")
    kernel = np.ones(window) / window
    return np.convolve(padded, kernel, mode="same")[window // 2 : window // 2 + values.size]


def _is_truncated(rms: np.ndarray, voiced_mask: np.ndarray) -> bool:
    """Heuristic: the take likely got cut off if it ends loud and voiced."""
    if rms.size < 5 or not voiced_mask.any():
        return False
    tail = rms[-3:]
    loud = float(np.percentile(rms, 95))
    return bool(voiced_mask[-1] and loud > 0 and np.mean(tail) > 0.6 * loud)
