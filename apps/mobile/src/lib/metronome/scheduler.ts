/**
 * Drift-free look-ahead scheduler — the timing heart of the metronome.
 *
 * This implements the well-known "two clocks" pattern (Chris Wilson, *A Tale of
 * Two Clocks*): a coarse JS ticker wakes up frequently and schedules every beat
 * that falls inside a short look-ahead window **ahead of time**, against a
 * monotonic audio clock. Two properties matter:
 *
 *   1. Beat target times are absolute: `origin + N × beatDuration`. They are
 *      never derived from when the previous beat *actually* fired, so JS-thread
 *      jitter cannot accumulate into tempo drift.
 *   2. The audio is scheduled ~100 ms early, so the audio backend (native audio
 *      thread) plays each click at the exact target time regardless of what the
 *      JS thread is doing at that instant.
 *
 * The class is deliberately pure and dependency-injected (clock, "schedule a
 * beat" sink, and the ticker) so the timing logic is unit-testable with fake
 * clocks and no audio hardware. It owns no audio and no React state.
 */
import {
  beatIndexForNumber,
  measureForNumber,
  normalizeConfig,
  targetTime,
  type MetronomeConfig,
} from './types';

export type ScheduledBeat = {
  beatNumber: number;
  beatIndex: number;
  measure: number;
  accented: boolean;
  /** Absolute audio-clock time (seconds) the beat should sound. */
  time: number;
};

export type SchedulerDiagnostic = {
  beatNumber: number;
  /** Absolute target time the beat was scheduled for. */
  targetTime: number;
  /** Clock reading at the moment we scheduled it. */
  scheduledAt: number;
  /** How far ahead we scheduled (targetTime − scheduledAt). Should stay > 0. */
  leadSeconds: number;
};

export type TickerHandle = ReturnType<typeof setTimeout> | number;

export interface SchedulerDeps {
  /** Monotonic clock in **seconds** (typically the audio context's currentTime). */
  now: () => number;
  /** Schedule one beat's audio at `beat.time`. Must not block. */
  onSchedule: (beat: ScheduledBeat) => void;
  /** Start the repeating look-ahead ticker; returns a handle. */
  setTicker: (cb: () => void, intervalMs: number) => TickerHandle;
  /** Stop the ticker created by `setTicker`. */
  clearTicker: (handle: TickerHandle) => void;
  /** Optional dev-only per-beat scheduling record. */
  onDiagnostic?: (d: SchedulerDiagnostic) => void;
  /** Ticker cadence in ms (how often we look ahead). Default 25. */
  lookaheadMs?: number;
  /** How far ahead, in seconds, to schedule beats. Default 0.12. */
  scheduleAheadSec?: number;
  /**
   * Small delay before the very first beat so it can be scheduled ahead rather
   * than firing late on the first tick. Default 0.08 s.
   */
  startOffsetSec?: number;
  /**
   * If the next beat's target falls more than this many seconds in the past
   * (e.g. after the app was backgrounded), resync instead of firing a burst of
   * catch-up clicks. Default 0.25 s.
   */
  resyncThresholdSec?: number;
}

export class LookaheadScheduler {
  private readonly deps: Required<Omit<SchedulerDeps, 'onDiagnostic'>> &
    Pick<SchedulerDeps, 'onDiagnostic'>;

  private running = false;
  private ticker: TickerHandle | null = null;

  // Stable origin the whole schedule is computed from.
  private originTime = 0;
  private originBeatIndex = 0;
  private beatDurationSec = 0.5;
  private beatsPerMeasure = 4;
  private accentedBeats: boolean[] = [true, false, false, false];
  private nextBeatNumber = 0;

  constructor(deps: SchedulerDeps) {
    this.deps = {
      lookaheadMs: 25,
      scheduleAheadSec: 0.12,
      startOffsetSec: 0.08,
      resyncThresholdSec: 0.25,
      ...deps,
    };
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Begin scheduling `config` from now. Calling `start` while already running is
   * a no-op (it never creates a second ticker) — use `updateConfig` to retarget.
   */
  start(config: MetronomeConfig): void {
    if (this.running) return;
    const normalized = normalizeConfig(config);
    this.beatDurationSec = 60 / normalized.bpm;
    this.beatsPerMeasure = normalized.beatsPerMeasure;
    this.accentedBeats = normalized.accentedBeats;
    this.originTime = this.deps.now() + this.deps.startOffsetSec;
    this.originBeatIndex = 0;
    this.nextBeatNumber = 0;
    this.running = true;

    this.ticker = this.deps.setTicker(() => this.tick(), this.deps.lookaheadMs);
    // Schedule the opening window immediately so the first click isn't late.
    this.tick();
  }

  /** Stop scheduling. Safe when already stopped. */
  stop(): void {
    if (this.ticker !== null) {
      this.deps.clearTicker(this.ticker);
      this.ticker = null;
    }
    this.running = false;
  }

  /**
   * Retarget a running schedule. The change takes effect at the **next**
   * (not-yet-scheduled) beat: we re-anchor the stable origin to that beat's
   * boundary, preserving beat-in-measure phase, so there's no burst of
   * catch-up clicks and no accumulated drift. If stopped, this just records the
   * config for the next `start`.
   */
  updateConfig(config: MetronomeConfig): void {
    const normalized = normalizeConfig(config);
    const newDuration = 60 / normalized.bpm;

    if (!this.running) {
      this.beatDurationSec = newDuration;
      this.beatsPerMeasure = normalized.beatsPerMeasure;
      this.accentedBeats = normalized.accentedBeats;
      return;
    }

    // Boundary of the next beat we have NOT scheduled yet, under old timing.
    const anchorTime = Math.max(
      this.deps.now(),
      targetTime(this.originTime, this.beatDurationSec, this.nextBeatNumber),
    );
    const currentIndex = beatIndexForNumber(
      this.originBeatIndex + this.nextBeatNumber,
      this.beatsPerMeasure,
    );

    this.beatDurationSec = newDuration;
    this.beatsPerMeasure = normalized.beatsPerMeasure;
    this.accentedBeats = normalized.accentedBeats;
    // Re-anchor: the next beat becomes beat 0 of the new origin, keeping its
    // position in the (possibly resized) measure.
    this.originTime = anchorTime;
    this.originBeatIndex = currentIndex % normalized.beatsPerMeasure;
    this.nextBeatNumber = 0;
  }

  private tick(): void {
    if (!this.running) return;
    const now = this.deps.now();

    // If we've fallen far behind (backgrounding, a long JS stall), don't machine-
    // gun the missed beats: resync the origin to the next beat at `now`.
    const nextTarget = targetTime(this.originTime, this.beatDurationSec, this.nextBeatNumber);
    if (nextTarget < now - this.deps.resyncThresholdSec) {
      this.originBeatIndex = beatIndexForNumber(
        this.originBeatIndex + this.nextBeatNumber,
        this.beatsPerMeasure,
      );
      this.originTime = now;
      this.nextBeatNumber = 0;
    }

    const horizon = now + this.deps.scheduleAheadSec;
    while (
      targetTime(this.originTime, this.beatDurationSec, this.nextBeatNumber) < horizon
    ) {
      const time = targetTime(this.originTime, this.beatDurationSec, this.nextBeatNumber);
      const absoluteBeat = this.originBeatIndex + this.nextBeatNumber;
      const beatIndex = beatIndexForNumber(absoluteBeat, this.beatsPerMeasure);
      const beat: ScheduledBeat = {
        beatNumber: this.nextBeatNumber,
        beatIndex,
        measure: measureForNumber(absoluteBeat, this.beatsPerMeasure),
        accented: this.accentedBeats[beatIndex] ?? false,
        time,
      };
      this.deps.onSchedule(beat);
      this.deps.onDiagnostic?.({
        beatNumber: this.nextBeatNumber,
        targetTime: time,
        scheduledAt: now,
        leadSeconds: time - now,
      });
      this.nextBeatNumber += 1;
    }
  }
}
