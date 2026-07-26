/**
 * Live-analysis service barrel.
 *
 * Screens/hooks import from `@/lib/analysis` — never from the individual
 * modules — so the audio/timing internals stay behind one seam, mirroring
 * `@/lib/metronome`.
 */
export {
  buildWindows,
  emptyCounts,
  signedCents,
  isVoiced,
  matchesExpected,
  median,
  mode,
  parseTempoBpm,
  CLARITY_FLOOR,
  CORRECT_MATCH_RATIO,
  DEFAULT_COUNT_IN_BEATS,
  DEFAULT_LATENCY_SECONDS,
  MATCH_SEMITONES,
  MISSED_VOICED_RATIO,
  RMS_FLOOR,
  WINDOW_GAP_SECONDS,
  WINDOW_PRE_MAX_SECONDS,
} from './types';
export type {
  FollowMode,
  LiveAnalysisConfig,
  LiveAnalysisController,
  LiveAnalysisListener,
  LiveAnalysisPhase,
  LiveAnalysisState,
  LiveSessionSummary,
  MicTake,
  NoteJudgement,
  NoteSummaryCounts,
  NoteWindow,
  PitchFrame,
} from './types';

export { Playhead } from './playhead';
export { NoteMatcher } from './matcher';

export {
  AudioApiMicBackend,
  FrameAssembler,
  SilentMicBackend,
  createMicBackend,
} from './micBackend';
export type { FrameSink, MicBackend } from './micBackend';

export { createLiveAnalysis } from './liveAnalysis';
export type { LiveAnalysisOptions } from './liveAnalysis';
