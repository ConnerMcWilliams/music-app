/**
 * Metronome service barrel.
 *
 * Screens/components import from `@/lib/metronome` — never from the individual
 * modules — so the timing/audio internals stay behind one seam.
 */
export {
  BPM_MIN,
  BPM_MAX,
  BPM_DEFAULT,
  BPM_STEP,
  BPM_STEP_LARGE,
  SUPPORTED_METERS,
  DEFAULT_BEATS_PER_MEASURE,
  clampBpm,
  isBpmInRange,
  beatDurationSeconds,
  beatDurationMs,
  beatIndexForNumber,
  measureForNumber,
  nextBeatIndex,
  targetTime,
  makeAccentPattern,
  toggleAccent,
  normalizeConfig,
  isValidConfig,
  defaultConfig,
} from './types';
export type {
  MetronomeConfig,
  MetronomeController,
  BeatEvent,
  BeatListener,
} from './types';

export { LookaheadScheduler } from './scheduler';
export type { ScheduledBeat, SchedulerDeps, SchedulerDiagnostic } from './scheduler';

export {
  AudioApiBackend,
  SilentBackend,
  createAudioBackend,
  monotonicNowSeconds,
} from './audioBackend';
export type { AudioBackend } from './audioBackend';

export { createMetronome } from './metronome';
export type { MetronomeOptions } from './metronome';
