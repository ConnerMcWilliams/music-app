/**
 * Metronome controller — wires the audio backend to the drift-free scheduler and
 * exposes the imperative `MetronomeController` contract.
 *
 * Responsibilities kept here (and out of React):
 *  - own the single scheduler + backend and guarantee only one runs at a time;
 *  - schedule audio ahead of time on the backend (authoritative timing);
 *  - fire beat events to subscribers at the *audible* moment for the visual
 *    indicator — a delayed UI callback never shifts the audio schedule;
 *  - degrade to a silent backend if audio init fails, so a screen never crashes.
 */
import {
  AudioApiBackend,
  SilentBackend,
  type AudioBackend,
  createAudioBackend,
} from './audioBackend';
import { LookaheadScheduler, type ScheduledBeat, type SchedulerDiagnostic } from './scheduler';
import {
  normalizeConfig,
  type BeatEvent,
  type BeatListener,
  type MetronomeConfig,
  type MetronomeController,
} from './types';

/** Ring buffer of the most recent scheduling records (dev diagnostics only). */
const DIAGNOSTIC_CAPACITY = 128;

export interface MetronomeOptions {
  /** Override the audio backend (tests / web). Defaults to react-native-audio-api. */
  backend?: AudioBackend;
}

class Metronome implements MetronomeController {
  private backend: AudioBackend;
  private readonly scheduler: LookaheadScheduler;
  private readonly listeners = new Set<BeatListener>();
  private readonly visualTimeouts = new Set<ReturnType<typeof setTimeout>>();
  private readonly diagnostics: SchedulerDiagnostic[] = [];

  private prepared = false;
  private running = false;
  private lastConfig: MetronomeConfig | null = null;

  constructor(options: MetronomeOptions = {}) {
    this.backend = options.backend ?? createAudioBackend();
    this.scheduler = new LookaheadScheduler({
      // Read `this.backend` lazily so a fallback swap in prepare() is picked up.
      now: () => this.backend.now(),
      onSchedule: (beat) => this.handleScheduledBeat(beat),
      setTicker: (cb, ms) => setInterval(cb, ms),
      clearTicker: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
      onDiagnostic: __DEV__ ? (d) => this.recordDiagnostic(d) : undefined,
    });
  }

  async prepare(): Promise<void> {
    if (this.prepared) return;
    try {
      await this.backend.prepare();
    } catch (err) {
      if (__DEV__) {
        console.warn('[metronome] audio backend failed to init; running silent.', err);
      }
      if (!(this.backend instanceof SilentBackend)) {
        this.backend = new SilentBackend();
        await this.backend.prepare();
      }
    }
    this.prepared = true;
  }

  async start(config: MetronomeConfig): Promise<void> {
    const normalized = normalizeConfig(config);
    this.lastConfig = normalized;
    if (!this.prepared) await this.prepare();
    // Idempotent: starting while running just retargets — never a 2nd scheduler.
    if (this.running) {
      this.scheduler.updateConfig(normalized);
      return;
    }
    this.running = true;
    this.scheduler.start(normalized);
  }

  async stop(): Promise<void> {
    if (!this.running && !this.scheduler.isRunning) {
      // Still clear any stray visual timeouts, then no-op safely.
      this.clearVisualTimeouts();
      this.running = false;
      return;
    }
    this.scheduler.stop();
    this.clearVisualTimeouts();
    this.running = false;
  }

  async updateConfig(config: MetronomeConfig): Promise<void> {
    const normalized = normalizeConfig(config);
    this.lastConfig = normalized;
    if (this.running) this.scheduler.updateConfig(normalized);
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.listeners.clear();
    this.prepared = false;
    try {
      await this.backend.dispose();
    } catch {
      // disposing twice / on a half-initialized ctx is fine.
    }
  }

  subscribe(listener: BeatListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Dev-only: recent scheduling records (target vs. scheduled-at, lead, beat #). */
  getDiagnostics(): readonly SchedulerDiagnostic[] {
    return this.diagnostics;
  }

  private handleScheduledBeat(beat: ScheduledBeat): void {
    // Audio: scheduled ahead, on the audio thread — authoritative.
    this.backend.scheduleClick(beat.time, beat.accented);

    // Visual: fire the beat event at (approximately) the audible moment. Any
    // UI-thread delay here affects only the indicator, never the audio.
    const delayMs = Math.max(0, (beat.time - this.backend.now()) * 1000);
    const id = setTimeout(() => {
      this.visualTimeouts.delete(id);
      if (!this.running) return;
      const event: BeatEvent = {
        beatNumber: beat.beatNumber,
        beatIndex: beat.beatIndex,
        measure: beat.measure,
        accented: beat.accented,
        time: beat.time,
      };
      this.listeners.forEach((l) => l(event));
    }, delayMs);
    this.visualTimeouts.add(id);
  }

  private clearVisualTimeouts(): void {
    this.visualTimeouts.forEach((id) => clearTimeout(id));
    this.visualTimeouts.clear();
  }

  private recordDiagnostic(d: SchedulerDiagnostic): void {
    this.diagnostics.push(d);
    if (this.diagnostics.length > DIAGNOSTIC_CAPACITY) this.diagnostics.shift();
  }
}

/** Create a metronome controller. One instance owns one scheduler + backend. */
export function createMetronome(options?: MetronomeOptions): MetronomeController {
  return new Metronome(options);
}

export { AudioApiBackend, SilentBackend };
export type { AudioBackend };
