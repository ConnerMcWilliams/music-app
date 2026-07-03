/**
 * Metronome domain types, limits, and **pure** helpers.
 *
 * Everything in this file is framework-free and side-effect-free so it can be
 * unit-tested in isolation (see `tests/metronome.logic.test.ts`) and reused by
 * the scheduler, the controller, and the React layer without pulling any of them
 * in. No audio, no timers, no React here.
 */

/** BPM bounds and steps. See `docs/product.md` — used for serious practice. */
export const BPM_MIN = 30;
export const BPM_MAX = 300;
export const BPM_DEFAULT = 120;
export const BPM_STEP = 1;
/** Larger step used by the ± controls' secondary action / press-and-hold. */
export const BPM_STEP_LARGE = 5;

/** Meters the UI offers. The pure layer accepts any integer >= 1. */
export const SUPPORTED_METERS = [2, 3, 4, 6] as const;
export const DEFAULT_BEATS_PER_MEASURE = 4;

export type MetronomeConfig = {
  /** Beats per minute. Always kept within [BPM_MIN, BPM_MAX]. */
  bpm: number;
  /** Beats in a measure (e.g. 4). */
  beatsPerMeasure: number;
  /**
   * Per-beat accent flags, length === beatsPerMeasure. `accentedBeats[0]` is the
   * downbeat. Represented as beat-level config (not a single boolean) so any
   * pattern such as [true, false, true, false] is expressible.
   */
  accentedBeats: boolean[];
};

/** Emitted once per beat, at (approximately) the beat's audible moment. */
export type BeatEvent = {
  /** Monotonic beat counter since the metronome started. */
  beatNumber: number;
  /** 0-based position within the measure. */
  beatIndex: number;
  /** 0-based measure number since start. */
  measure: number;
  /** Whether this beat is accented under the active pattern. */
  accented: boolean;
  /** Audio-clock time (seconds) the beat was scheduled for. Authoritative. */
  time: number;
};

export type BeatListener = (event: BeatEvent) => void;

/**
 * Imperative metronome contract. The audio scheduling lives entirely behind this
 * interface, off the React tree (see `metronome.ts`).
 */
export interface MetronomeController {
  /** Create/resume the audio context and warm resources. Idempotent. */
  prepare(): Promise<void>;
  /** Start (or, if already running, re-target to) the given config. */
  start(config: MetronomeConfig): Promise<void>;
  /** Stop playback and clear pending beats. Safe to call when stopped. */
  stop(): Promise<void>;
  /** Apply a new config; takes effect at the next beat when running. */
  updateConfig(config: MetronomeConfig): Promise<void>;
  /** Stop and release all audio resources. Safe to call more than once. */
  dispose(): Promise<void>;
  /** Subscribe to beat events (for the visual indicator). Returns unsubscribe. */
  subscribe(listener: BeatListener): () => void;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Clamp any input to a valid integer BPM. Non-finite input → default. */
export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return BPM_DEFAULT;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm)));
}

export function isBpmInRange(bpm: number): boolean {
  return Number.isFinite(bpm) && bpm >= BPM_MIN && bpm <= BPM_MAX;
}

/** Seconds between beats. Used against the audio clock. */
export function beatDurationSeconds(bpm: number): number {
  return 60 / clampBpm(bpm);
}

/** Milliseconds between beats. Convenience for UI / non-audio math. */
export function beatDurationMs(bpm: number): number {
  return 60000 / clampBpm(bpm);
}

/** Beat-in-measure for a monotonic beat number. */
export function beatIndexForNumber(beatNumber: number, beatsPerMeasure: number): number {
  const beats = Math.max(1, Math.floor(beatsPerMeasure));
  return ((beatNumber % beats) + beats) % beats;
}

/** Measure number for a monotonic beat number. */
export function measureForNumber(beatNumber: number, beatsPerMeasure: number): number {
  const beats = Math.max(1, Math.floor(beatsPerMeasure));
  return Math.floor(beatNumber / beats);
}

/** Next beat-in-measure index (wraps at the measure boundary). */
export function nextBeatIndex(currentIndex: number, beatsPerMeasure: number): number {
  return beatIndexForNumber(currentIndex + 1, beatsPerMeasure);
}

/**
 * Drift-free target time for beat N:
 *   target = startTime + N × beatDuration
 * Computed from a *stable* origin — never from the previous beat's actual time —
 * so scheduling jitter can never accumulate.
 */
export function targetTime(startTime: number, beatDurationSec: number, beatNumber: number): number {
  return startTime + beatNumber * beatDurationSec;
}

/**
 * Build a valid accent pattern of the given length.
 *
 * - No `previous`: accent the first beat only ([true, false, …]).
 * - With `previous`: preserve overlapping toggles, pad new beats with `false`,
 *   truncate removed beats — so changing the meter always yields a valid
 *   pattern. If preserving would leave nothing accented, the downbeat is
 *   re-accented so the meter stays audible.
 */
export function makeAccentPattern(beatsPerMeasure: number, previous?: boolean[]): boolean[] {
  const beats = Math.max(1, Math.floor(beatsPerMeasure));
  if (!previous) {
    return Array.from({ length: beats }, (_, i) => i === 0);
  }
  const next = Array.from({ length: beats }, (_, i) => previous[i] ?? false);
  if (!next.some(Boolean)) next[0] = true;
  return next;
}

/** Flip the accent flag at `index`, returning a new array (bounds-safe). */
export function toggleAccent(pattern: boolean[], index: number): boolean[] {
  if (index < 0 || index >= pattern.length) return pattern.slice();
  const next = pattern.slice();
  next[index] = !next[index];
  return next;
}

/**
 * Coerce any partial/invalid config into a valid one: clamp BPM, floor the meter
 * to >= 1, and reconcile the accent pattern to the meter length.
 */
export function normalizeConfig(config: MetronomeConfig): MetronomeConfig {
  const beatsPerMeasure = Math.max(1, Math.floor(config.beatsPerMeasure));
  return {
    bpm: clampBpm(config.bpm),
    beatsPerMeasure,
    accentedBeats: makeAccentPattern(beatsPerMeasure, config.accentedBeats),
  };
}

/** True when the config is already valid (no normalization needed). */
export function isValidConfig(config: MetronomeConfig): boolean {
  return (
    isBpmInRange(config.bpm) &&
    Number.isInteger(config.beatsPerMeasure) &&
    config.beatsPerMeasure >= 1 &&
    Array.isArray(config.accentedBeats) &&
    config.accentedBeats.length === config.beatsPerMeasure
  );
}

/** A sensible starting config: 120 BPM, 4/4, downbeat accented. */
export function defaultConfig(): MetronomeConfig {
  return {
    bpm: BPM_DEFAULT,
    beatsPerMeasure: DEFAULT_BEATS_PER_MEASURE,
    accentedBeats: makeAccentPattern(DEFAULT_BEATS_PER_MEASURE),
  };
}
