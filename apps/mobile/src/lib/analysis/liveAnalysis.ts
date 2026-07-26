/**
 * Live-analysis controller — wires the microphone to the pitch detector, the
 * playhead, and the matcher, and exposes the imperative
 * {@link LiveAnalysisController} contract.
 *
 * Responsibilities kept here (and out of React):
 *  - own the single backend + playhead + matcher, and guarantee one run at a time;
 *  - put microphone audio and the metronome's beat onto **one timebase**;
 *  - latch each note's verdict when its window closes and publish coalesced state;
 *  - degrade to a silent backend if the microphone fails, so a screen never crashes.
 *
 * ## The timebase
 *
 * Three clocks are in play and only one can win. The metronome runs on its own
 * `AudioContext.currentTime`; the recorder timestamps buffers in seconds since
 * *its* capture started; a second `AudioContext` would introduce a third origin.
 * Rather than trying to relate audio contexts, everything is anchored to the
 * shared monotonic wall clock (`MicBackend.now()`):
 *
 *   - `start()` is called on the downbeat, capturing the timeline origin;
 *   - the first delivered buffer fixes `micEpoch = now() − when`;
 *   - a frame sits at `micEpoch + when + halfFrame + latency`.
 *
 * The half-frame term centres a frame on its analysis window. Leaving it out
 * biases every single note late by ~23 ms, which at a brisk tempo is a
 * meaningful slice of a note.
 *
 * ## Use headphones — the microphone also hears the metronome
 *
 * Analytical mode is tempo-locked, so the click is sounding the whole time we
 * are listening. On a device speaker it bleeds into the capture, and the
 * detector cannot tell a click from a played note (see the `micBackend` module
 * header for why). Two consequences, both accepted rather than papered over:
 *
 *  - a click can produce a **spurious verdict**, most visibly on rests and in
 *    quiet passages, where no real note is sounding to outweigh it;
 *  - there is **no automatic correction for input latency**. The frame offset
 *    is the fixed {@link DEFAULT_LATENCY_SECONDS}, so a device whose real
 *    round-trip latency is far from it reads consistently late, and notes drift
 *    into their neighbours' windows. An earlier build re-anchored the timeline
 *    from the first sound heard; on speakers that sound is a click, so it
 *    anchored on the click rather than on the player and corrected nothing. It
 *    was removed instead of left in place reading as protection that wasn't
 *    there. `LiveSessionSummary.medianTimingErrorSeconds` is the signal for
 *    tuning the constant against real devices.
 */
import { detectPitch, frameRms, hzToMidi } from '@/lib/pitch';

import { NoteMatcher } from './matcher';
import { Playhead } from './playhead';
import {
  buildWindows,
  emptyCounts,
  median,
  DEFAULT_COUNT_IN_BEATS,
  DEFAULT_LATENCY_SECONDS,
  type LiveAnalysisConfig,
  type LiveAnalysisController,
  type LiveAnalysisListener,
  type LiveAnalysisPhase,
  type LiveAnalysisState,
  type LiveSessionSummary,
  type NoteJudgement,
  type NoteSummaryCounts,
  type NoteWindow,
  type PitchFrame,
} from './types';
import { createMicBackend, SilentMicBackend, type MicBackend } from './micBackend';
import type { NoteState } from '@/types';

/** How often state is published to React, in ms. */
const EMIT_INTERVAL_MS = 50;

export interface LiveAnalysisOptions {
  /** Override the microphone backend (tests / web). */
  backend?: MicBackend;
}

class LiveAnalysis implements LiveAnalysisController {
  private backend: MicBackend;
  private readonly listeners = new Set<LiveAnalysisListener>();

  private prepared = false;
  private running = false;
  private error: string | undefined;
  private phase: LiveAnalysisPhase = 'idle';

  private playhead = new Playhead([]);
  private matcher = new NoteMatcher(0.5);
  private windows: NoteWindow[] = [];
  private readonly judgements = new Map<number, NoteJudgement>();
  private verdicts = new Map<number, NoteState>();

  private timelineOrigin = 0;
  private latencySeconds = DEFAULT_LATENCY_SECONDS;
  private beatSeconds = 0.5;
  private micEpoch: number | null = null;
  private activeNoteIndex: number | undefined;

  private lastEmit = 0;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: LiveAnalysisOptions = {}) {
    this.backend = options.backend ?? createMicBackend();
  }

  async prepare(): Promise<void> {
    if (this.prepared) return;
    try {
      await this.backend.prepare();
      this.error = undefined;
    } catch (err) {
      if (__DEV__) {
        console.warn('[analysis] microphone unavailable; running silent.', err);
      }
      this.error =
        err instanceof Error && /permission/i.test(err.message)
          ? 'Microphone access is needed for analytical mode.'
          : 'The microphone is unavailable on this device.';
      if (!(this.backend instanceof SilentMicBackend)) {
        this.backend = new SilentMicBackend();
        await this.backend.prepare();
      }
    }
    this.prepared = true;
    this.publish(true);
  }

  async start(config: LiveAnalysisConfig, originTime: number): Promise<void> {
    if (!this.prepared) await this.prepare();
    if (this.running) await this.stop();

    const countInBeats = config.countInBeats ?? DEFAULT_COUNT_IN_BEATS;
    this.beatSeconds = 60 / config.bpm;
    this.latencySeconds = config.latencySeconds ?? DEFAULT_LATENCY_SECONDS;
    this.windows = buildWindows(config.timeline, config.bpm);
    this.playhead = new Playhead(this.windows);
    this.matcher = new NoteMatcher(this.beatSeconds);
    this.judgements.clear();
    this.verdicts = new Map();
    this.micEpoch = null;
    this.activeNoteIndex = this.windows[0]?.noteIndex;

    // Timeline zero is the first *judged* beat, so the count-in is simply time
    // before the origin — no special-casing anywhere downstream.
    this.timelineOrigin = originTime + countInBeats * this.beatSeconds;
    this.running = true;
    this.phase = countInBeats > 0 ? 'count-in' : 'listening';
    this.publish(true);

    try {
      await this.backend.start((frame, when, sampleRate) =>
        this.handleFrame(frame, when, sampleRate),
      );
    } catch (err) {
      if (__DEV__) console.warn('[analysis] could not start capture.', err);
      this.error = 'The microphone could not be started.';
      this.phase = 'error';
      this.running = false;
      this.publish(true);
    }
  }

  async stop(): Promise<LiveSessionSummary> {
    const wasRunning = this.running;
    this.running = false;
    this.clearEmitTimer();

    let take = null;
    if (wasRunning) {
      try {
        take = await this.backend.stop();
      } catch (err) {
        if (__DEV__) console.warn('[analysis] stop failed.', err);
      }
    }

    // Notes the player never reached are left *unjudged*, not missed — stopping
    // early is a choice, not a mistake, and colouring the rest of the study red
    // would be a lie.
    this.phase = this.playhead.isFinished ? 'finished' : 'idle';
    this.activeNoteIndex = undefined;
    this.publish(true);

    const judgements = [...this.judgements.values()].sort((a, b) => a.index - b.index);
    const timing = judgements
      .filter((j) => j.state === 'correct' && j.timingErrorBeats != null)
      .map((j) => (j.timingErrorBeats as number) * this.beatSeconds);

    return {
      judgements,
      counts: this.counts(),
      take,
      medianTimingErrorSeconds: median(timing),
    };
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.listeners.clear();
    this.prepared = false;
    try {
      await this.backend.dispose();
    } catch {
      // Disposing twice is fine.
    }
  }

  subscribe(listener: LiveAnalysisListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // -------------------------------------------------------------------------

  private handleFrame(frame: Float32Array, when: number, sampleRate: number): void {
    if (!this.running) return;

    if (this.micEpoch == null) this.micEpoch = this.backend.now() - when;

    const halfFrame = frame.length / (2 * sampleRate);
    const monoTime = this.micEpoch + when + halfFrame + this.latencySeconds;
    const time = monoTime - this.timelineOrigin;

    const reading = detectPitch(frame, sampleRate);
    const pitchFrame: PitchFrame = {
      time,
      hz: reading?.hz ?? null,
      midi: reading ? hzToMidi(reading.hz) : null,
      clarity: reading?.clarity ?? 0,
      rms: frameRms(frame),
    };

    if (this.phase === 'count-in' && time >= 0) this.phase = 'listening';

    const window = this.playhead.windowAt(time);
    if (window) this.matcher.addFrame(window, pitchFrame);

    for (const closed of this.playhead.advanceTo(time)) {
      this.record(this.matcher.finalize(closed));
    }

    this.activeNoteIndex = this.playhead.activeAt(time)?.noteIndex;
    if (this.playhead.isFinished) this.phase = 'finished';
    this.publish(false);
  }

  private record(judgement: NoteJudgement): void {
    this.judgements.set(judgement.index, judgement);
    this.verdicts = new Map(this.verdicts).set(judgement.noteIndex, judgement.state);
  }

  private counts(): NoteSummaryCounts {
    const counts = emptyCounts(this.windows.length);
    for (const judgement of this.judgements.values()) {
      counts[judgement.state] += 1;
      counts.judged += 1;
    }
    return counts;
  }

  private snapshot(): LiveAnalysisState {
    return {
      phase: this.phase,
      verdicts: this.verdicts,
      activeNoteIndex: this.activeNoteIndex,
      summary: this.counts(),
      error: this.error,
    };
  }

  /**
   * Publish state, coalesced to {@link EMIT_INTERVAL_MS}.
   *
   * Frames arrive faster than a human can see, and each publish re-renders up to
   * ~150 SVG glyphs. The trailing timer guarantees the last state still lands.
   */
  private publish(immediate: boolean): void {
    const now = Date.now();
    if (immediate || now - this.lastEmit >= EMIT_INTERVAL_MS) {
      this.clearEmitTimer();
      this.lastEmit = now;
      const state = this.snapshot();
      this.listeners.forEach((listener) => listener(state));
      return;
    }
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.lastEmit = Date.now();
      const state = this.snapshot();
      this.listeners.forEach((listener) => listener(state));
    }, EMIT_INTERVAL_MS - (now - this.lastEmit));
  }

  private clearEmitTimer(): void {
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = null;
    }
  }
}

/** Create a live-analysis controller. One instance owns one microphone session. */
export function createLiveAnalysis(options?: LiveAnalysisOptions): LiveAnalysisController {
  return new LiveAnalysis(options);
}
