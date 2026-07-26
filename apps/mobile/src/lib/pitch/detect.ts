/**
 * Monophonic pitch detection by FFT autocorrelation.
 *
 * This is a deliberate port of `_track_pitch` in
 * `backend/grading/engine/analysis.py` — same frame geometry, same search range,
 * same periodicity floor, same parabolic peak refinement. The live analytical
 * overlay and the server-side grade therefore judge a note the same way, and a
 * player cannot see green in practice and red in their results for the same
 * playing. **If you retune a constant here, retune it there too.**
 *
 * Pure functions over `Float32Array`; no audio APIs, no React, so it unit-tests
 * against synthesised tones and runs unchanged on web.
 */
import { fftInPlace, hannWindow, nextPowerOfTwo } from './fft';

// --- Frame geometry (seconds, so behaviour is sample-rate independent) -------
/** ~46 ms analysis window. */
export const FRAME_SECONDS = 0.046;
/** 10 ms hop → 100 frames/sec. */
export const HOP_SECONDS = 0.01;

// --- Search range -----------------------------------------------------------
/**
 * Trumpet-plus-margin fundamental range. Written B♭-trumpet range is roughly
 * F♯3–C6; widened so detection is not the thing that fails a slightly low or
 * high player.
 */
export const MIN_F0_HZ = 150;
export const MAX_F0_HZ = 1250;

/**
 * A frame counts as pitched only when the autocorrelation peak is this strong,
 * i.e. the sound is clearly periodic rather than breath or noise.
 */
export const PERIODICITY_FLOOR = 0.55;

export interface PitchReading {
  /** Estimated fundamental, in Hz. */
  hz: number;
  /** Normalised autocorrelation peak in [0, 1] — how confidently periodic. */
  clarity: number;
}

/** Samples per analysis frame at a given rate. */
export function frameLengthFor(sampleRate: number): number {
  return Math.max(2, Math.round(sampleRate * FRAME_SECONDS));
}

/** Samples per hop at a given rate. */
export function hopLengthFor(sampleRate: number): number {
  return Math.max(1, Math.round(sampleRate * HOP_SECONDS));
}

/**
 * Reusable scratch buffers.
 *
 * At 100 frames/sec, allocating three typed arrays per frame is real GC
 * pressure on device. Analysis runs at one frame size for a whole session, so a
 * single cached set is enough.
 */
let scratch: { size: number; re: Float64Array; im: Float64Array } | null = null;

function scratchFor(size: number): { re: Float64Array; im: Float64Array } {
  if (!scratch || scratch.size !== size) {
    scratch = { size, re: new Float64Array(size), im: new Float64Array(size) };
  } else {
    scratch.re.fill(0);
    scratch.im.fill(0);
  }
  return scratch;
}

/** Hann windows are per-frame-length constants; cache the current one. */
let windowCache: { length: number; window: Float64Array } | null = null;

function windowFor(length: number): Float64Array {
  if (!windowCache || windowCache.length !== length) {
    windowCache = { length, window: hannWindow(length) };
  }
  return windowCache.window;
}

/**
 * Sub-sample lag of an autocorrelation peak via parabolic interpolation.
 *
 * Without this the estimate is quantised to whole samples, which at 22 kHz is
 * ~40 cents of error near the top of the range — enough to fail an in-tune note.
 */
function parabolicPeak(values: Float64Array, peak: number): number {
  if (peak <= 0 || peak >= values.length - 1) return peak;
  const left = values[peak - 1];
  const mid = values[peak];
  const right = values[peak + 1];
  const denom = left - 2 * mid + right;
  if (denom === 0) return peak;
  return peak + (0.5 * (left - right)) / denom;
}

/**
 * Estimate the fundamental of one analysis frame.
 *
 * Returns `null` when the frame is not confidently pitched — silence, breath,
 * a cracked attack, or a fundamental outside the searched range. Callers should
 * treat `null` as "no opinion", not as "wrong note".
 */
export function detectPitch(frame: Float32Array, sampleRate: number): PitchReading | null {
  const frameLength = frame.length;
  if (frameLength < 4 || !Number.isFinite(sampleRate) || sampleRate <= 0) return null;

  const minLag = Math.max(2, Math.trunc(sampleRate / MAX_F0_HZ));
  const maxLag = Math.min(frameLength - 1, Math.trunc(sampleRate / MIN_F0_HZ));
  if (maxLag <= minLag) return null;

  // Zero-pad to at least twice the frame so the circular autocorrelation the
  // FFT computes matches the linear one we actually want.
  const fftLength = nextPowerOfTwo(2 * frameLength);
  const { re, im } = scratchFor(fftLength);
  const window = windowFor(frameLength);

  // Remove DC before windowing — a mic offset would otherwise dominate lag 0.
  let mean = 0;
  for (let i = 0; i < frameLength; i += 1) mean += frame[i];
  mean /= frameLength;

  for (let i = 0; i < frameLength; i += 1) {
    re[i] = (frame[i] - mean) * window[i];
  }

  fftInPlace(re, im, false);

  // Power spectrum: |X|². Its inverse transform is the autocorrelation.
  for (let i = 0; i < fftLength; i += 1) {
    re[i] = re[i] * re[i] + im[i] * im[i];
    im[i] = 0;
  }

  fftInPlace(re, im, true);

  const zero = re[0];
  if (!(zero > 0)) return null;

  let peak = minLag;
  let best = re[minLag];
  for (let lag = minLag + 1; lag <= maxLag; lag += 1) {
    if (re[lag] > best) {
      best = re[lag];
      peak = lag;
    }
  }

  const clarity = best / zero;
  if (clarity < PERIODICITY_FLOOR) return null;

  const lag = parabolicPeak(re, peak);
  if (lag <= 0) return null;

  const hz = sampleRate / lag;
  if (hz < MIN_F0_HZ || hz > MAX_F0_HZ) return null;

  return { hz, clarity };
}

/** Root-mean-square level of a frame — the loudness envelope input. */
export function frameRms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i += 1) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}
