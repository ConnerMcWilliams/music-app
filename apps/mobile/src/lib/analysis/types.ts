/**
 * Live-analysis domain types, tuning constants, and **pure** helpers.
 *
 * Everything here is framework-free and side-effect-free so it can be unit-
 * tested in isolation and reused by the playhead, the matcher, the controller,
 * and the React layer without pulling any of them in. No audio, no timers, no
 * React — the same split the metronome uses (`lib/metronome/types.ts`).
 */
import type { ExpectedNote } from '@/lib/musicxml';
import type { NoteState } from '@/types';

// ---------------------------------------------------------------------------
// Tuning constants
//
// These decide what counts as a right note. They are collected here (rather
// than inlined at their use sites) precisely because they will need tuning
// against real recordings — see the report in `docs/` when that happens.
// ---------------------------------------------------------------------------

/**
 * How far off pitch a frame may be and still count as the expected note, in
 * semitones. 0.6 is deliberately loose: brass bends under the lip, the pitch
 * tracker carries a known low-register bias (see `lib/pitch/detect.ts`), and
 * the reference notation is OMR output from a 1912 scan. Tighter than this and
 * the overlay starts calling correct playing wrong, which is the one failure
 * mode that destroys trust in the feature.
 *
 * **Shared with `backend/grading/engine/align.py`.** This value and the
 * no-octave-tolerance rule in {@link matchesExpected} must change on both sides
 * together, or the same take reads green live and red in its results.
 */
export const MATCH_SEMITONES = 0.6;

/**
 * Minimum frame loudness to be considered "the player is sounding a note".
 * Fixed rather than adaptive: the backend can percentile-threshold a whole
 * recording, but a streaming analyser has no future to look at.
 */
export const RMS_FLOOR = 0.01;

/** Minimum autocorrelation clarity for a pitch reading to be trusted. */
export const CLARITY_FLOOR = 0.55;

/** Below this share of voiced frames, the note was not played at all. */
export const MISSED_VOICED_RATIO = 0.25;

/** At or above this share of matched voiced frames, the note was correct. */
export const CORRECT_MATCH_RATIO = 0.5;

/** Longest lead-in before a note's onset that still counts toward it. */
export const WINDOW_PRE_MAX_SECONDS = 0.09;

/** Dead space before the next window, so an attack can't be double-counted. */
export const WINDOW_GAP_SECONDS = 0.02;

/**
 * Assumed round-trip audio latency: the player hears the click late and plays
 * late, and the microphone buffer arrives later still. Positive values shift
 * captured audio *later* relative to the score.
 *
 * A single fixed constant, and **the only latency correction there is** — there
 * is no calibration UI and no automatic re-anchoring, so a device whose real
 * latency is far from this reads consistently late (see the `liveAnalysis`
 * module header for why the automatic correction was removed rather than
 * fixed). {@link LiveSessionSummary.medianTimingErrorSeconds} is how this number
 * gets tuned against real devices.
 */
export const DEFAULT_LATENCY_SECONDS = 0.06;

/** Beats of count-in before the first note is judged. */
export const DEFAULT_COUNT_IN_BEATS = 4;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/**
 * How the analyser decides where the player is in the score.
 *
 * Only `tempo-locked` is implemented: the playhead advances on the metronome's
 * clock. `onset-follow` (advance on detected attacks, free tempo) is named here
 * so the controller seam is already shaped for it.
 */
export type FollowMode = 'tempo-locked' | 'onset-follow';

/** One analysed audio frame, timestamped on the score's timeline (seconds). */
export interface PitchFrame {
  /** Seconds from the first judged beat. Negative during the count-in. */
  time: number;
  /** Detected fundamental, or null when the frame wasn't confidently pitched. */
  hz: number | null;
  /** Fractional MIDI for {@link hz}, or null alongside it. */
  midi: number | null;
  clarity: number;
  rms: number;
}

/** The span of time during which a given note is judged. */
export interface NoteWindow {
  /** {@link ExpectedNote.index} — the sounding ordinal, shared with the backend. */
  index: number;
  /** {@link ExpectedNote.noteIndex} — the glyph handle for `MusicXmlView`. */
  noteIndex: number;
  /** Expected **sounding** MIDI (transposition already applied upstream). */
  midi: number;
  /** Notated onset in seconds, before the lead-in. */
  onset: number;
  start: number;
  end: number;
}

/** A finalised judgement for one note. */
export interface NoteJudgement {
  index: number;
  noteIndex: number;
  state: Exclude<NoteState, 'active'>;
  /** Signed onset error in beats; positive is late. Absent when missed. */
  timingErrorBeats?: number;
  /** Signed cents from the expected pitch. Absent when missed. */
  centsError?: number;
  /** Rounded sounding MIDI actually heard. Absent when nothing was heard. */
  heardMidi?: number;
}

export type LiveAnalysisPhase =
  | 'idle'
  | 'preparing'
  | 'count-in'
  | 'listening'
  | 'finished'
  | 'error';

export interface LiveAnalysisConfig {
  /** Expected notes, from `buildTimeline` — already in sounding pitch. */
  timeline: readonly ExpectedNote[];
  bpm: number;
  countInBeats?: number;
  latencySeconds?: number;
  followMode?: FollowMode;
}

export interface LiveAnalysisState {
  phase: LiveAnalysisPhase;
  /** Judged notes so far, keyed by `noteIndex` for direct use as `noteStates`. */
  verdicts: ReadonlyMap<number, NoteState>;
  /** `noteIndex` the playhead is inside, for the halo. */
  activeNoteIndex?: number;
  summary: NoteSummaryCounts;
  /** Set when the microphone is unavailable; the UI must surface it. */
  error?: string;
}

export interface NoteSummaryCounts {
  correct: number;
  wrong: number;
  missed: number;
  /** Notes judged so far — the denominator for the others. */
  judged: number;
  /** Notes in the study. */
  total: number;
}

/** A recorded file a live session produced, if one is usable. */
export interface MicTake {
  uri: string;
  durationSeconds: number;
}

export interface LiveSessionSummary {
  judgements: NoteJudgement[];
  counts: NoteSummaryCounts;
  /** Null when no single-file recording was produced (see `micBackend`). */
  take: MicTake | null;
  /**
   * Median signed onset error over correct notes, in seconds.
   *
   * The signal for tuning {@link DEFAULT_LATENCY_SECONDS} from real devices, and
   * the only one: nothing corrects a device's latency at run time, so this is
   * how a systematic offset gets found and fixed in the constant.
   */
  medianTimingErrorSeconds: number | null;
}

export type LiveAnalysisListener = (state: LiveAnalysisState) => void;

/**
 * Imperative live-analysis contract. All audio and timing live behind this, off
 * the React tree — mirroring `MetronomeController`.
 */
export interface LiveAnalysisController {
  /** Acquire the microphone and warm resources. Idempotent. */
  prepare(): Promise<void>;
  /**
   * Begin judging `config` against the metronome's timebase.
   *
   * `originCtxTime` is the metronome's audio-clock origin — passing it in
   * (rather than starting an independent clock) is what makes "tempo-locked"
   * structural instead of aspirational.
   */
  start(config: LiveAnalysisConfig, originCtxTime: number): Promise<void>;
  /** Stop listening and return what was heard. Safe when already stopped. */
  stop(): Promise<LiveSessionSummary>;
  /** Release the microphone. Safe to call more than once. */
  dispose(): Promise<void>;
  subscribe(listener: LiveAnalysisListener): () => void;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function emptyCounts(total = 0): NoteSummaryCounts {
  return { correct: 0, wrong: 0, missed: 0, judged: 0, total };
}

/**
 * Beats-per-minute from a display tempo string such as `"♩ = 144"`.
 *
 * Mirrors the backend's `_parse_bpm` fallback in
 * `grading/engine/reference.py`: take the first 2–3 digit run. Returns null
 * when there isn't one, so callers can fall back to the metronome's own BPM.
 */
export function parseTempoBpm(tempo: string | undefined): number | null {
  if (!tempo) return null;
  const match = /(\d{2,3})/.exec(tempo);
  if (!match) return null;
  const bpm = Number(match[1]);
  return Number.isFinite(bpm) && bpm >= 30 && bpm <= 300 ? bpm : null;
}

/**
 * Does a detected pitch count as the expected note?
 *
 * **Octave-strict**, matching `backend/grading/engine/align.py`. A trumpet
 * player an octave low has played a wrong note, and the product promise is
 * green for the right note and red for the wrong one. Accepting octaves here
 * while the grader rejects them would also mean the same take reads green in
 * practice and red in its results — the single outcome this feature exists to
 * prevent.
 *
 * Autocorrelation can lock onto a subharmonic, which is what an octave
 * tolerance would have hedged against, but that risk is covered better
 * elsewhere: the detector tracks the true fundamental even on a harmonic-rich
 * tone with a weak one (see `tests/pitch.detect.test.ts`), and at a 10 ms hop a
 * sixteenth note gets ~10 frames, so a sporadic slip cannot flip a verdict
 * against {@link CORRECT_MATCH_RATIO}. When a note does read wrong,
 * `heardMidi` reports the octave actually played — "expected D5, heard D4" is
 * more useful to a player than a silent pass.
 */
export function matchesExpected(frameMidi: number, expectedMidi: number): boolean {
  return Math.abs(frameMidi - expectedMidi) <= MATCH_SEMITONES;
}

/**
 * Signed cents from the expected note. Positive is sharp.
 *
 * Only ever computed over *matched* frames, which {@link matchesExpected}
 * bounds to ±{@link MATCH_SEMITONES}, so this stays well inside ±60 cents.
 */
export function signedCents(frameMidi: number, expectedMidi: number): number {
  return (frameMidi - expectedMidi) * 100;
}

/** True when a frame carries a usable pitch reading. */
export function isVoiced(frame: PitchFrame): boolean {
  return frame.midi != null && frame.rms >= RMS_FLOOR && frame.clarity >= CLARITY_FLOOR;
}

/**
 * Judging windows for a timeline at a given tempo.
 *
 * Each note owns `[onset − pre, min(nextOnset, onset + duration) − GAP)`. The
 * lead-in catches an early attack; the trailing gap keeps one attack from being
 * counted twice.
 *
 * **Windows never overlap.** Where a generous lead-in would reach back into the
 * previous note, it is clamped to that note's end. This is what lets the matcher
 * be a single forward fold with no backtracking, so it can run streaming.
 */
export function buildWindows(
  timeline: readonly ExpectedNote[],
  bpm: number,
): NoteWindow[] {
  const beatSeconds = 60 / bpm;
  const windows: NoteWindow[] = [];

  for (let i = 0; i < timeline.length; i += 1) {
    const note = timeline[i];
    const onset = note.onsetBeats * beatSeconds;
    const duration = note.durationBeats * beatSeconds;
    const next = timeline[i + 1];
    const nextOnset = next ? next.onsetBeats * beatSeconds : Infinity;

    const pre = Math.min(0.5 * duration, WINDOW_PRE_MAX_SECONDS);
    const previousEnd = windows[windows.length - 1]?.end ?? -Infinity;
    const start = Math.max(onset - pre, previousEnd);
    const rawEnd = Math.min(nextOnset, onset + duration) - WINDOW_GAP_SECONDS;
    // A very short note (or a heavy gap) could invert the window; keep it
    // non-empty so the note is still judged rather than silently skipped.
    const end = Math.max(rawEnd, start + 1e-3);

    windows.push({
      index: note.index,
      noteIndex: note.noteIndex,
      midi: note.midi,
      onset,
      start,
      end,
    });
  }

  return windows;
}

/** Median of a numeric list, or null when empty. Used over mean throughout. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Most common value in a list, or null when empty. Ties resolve to the first. */
export function mode(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  let best = values[0];
  let bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
