/**
 * Audio backends for the metronome.
 *
 * The scheduler decides *when* each click sounds; a backend decides *how*. The
 * `AudioBackend` interface is the seam that keeps all audio out of React and the
 * scheduler, and lets the click engine be swapped or stubbed (tests, web, an
 * environment where the native module isn't built).
 *
 * The default backend uses `react-native-audio-api` — Software Mansion's Web
 * Audio implementation running on a **native audio thread**. It gives us a real
 * audio clock (`ctx.currentTime`) and sample-accurate `start(when)` scheduling,
 * which is what makes the "schedule ahead, don't drift" strategy actually
 * accurate rather than merely tidy. Clicks are synthesized from short oscillator
 * envelopes, so nothing is loaded or decoded per beat.
 */
import { AudioContext, type GainNode, type OscillatorNode } from 'react-native-audio-api';

export interface AudioBackend {
  /** True when this backend produces no sound (fallback / tests). */
  readonly isSilent: boolean;
  /** Create/resume the audio clock and warm resources. Idempotent. */
  prepare(): Promise<void>;
  /** Current time on the backend's monotonic audio clock, in seconds. */
  now(): number;
  /** Schedule a single click to sound at absolute `time` (seconds). */
  scheduleClick(time: number, accented: boolean): void;
  /** Release all audio resources. Safe to call more than once. */
  dispose(): Promise<void>;
}

// Click voicing. Short bursts keep latency low and stay well clear of the
// ~0.5 s gap between beats even at fast tempos.
const CLICK_SECONDS = 0.035;
const ACCENT_FREQ = 1760; // A6 — brighter downbeat
const NORMAL_FREQ = 1108; // ~C#6 — softer offbeat
const ACCENT_GAIN = 0.9;
const NORMAL_GAIN = 0.55;
const PEAK_ATTACK_SECONDS = 0.001;

/** Monotonic wall-clock seconds, used by the silent backend and as a fallback. */
export function monotonicNowSeconds(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === 'function') return perf.now() / 1000;
  return Date.now() / 1000;
}

/**
 * `react-native-audio-api` backend. Requires a dev/native build (this project
 * already uses expo-dev-client + CNG). Each click is a fresh oscillator + gain
 * envelope — the standard Web Audio "one-shot" idiom: cheap, no file decode,
 * and scheduled entirely on the audio thread.
 */
export class AudioApiBackend implements AudioBackend {
  readonly isSilent = false;
  private ctx: AudioContext | null = null;

  async prepare(): Promise<void> {
    if (this.ctx) {
      // Resume if the OS suspended us (e.g. after an interruption).
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  now(): number {
    return this.ctx ? this.ctx.currentTime : monotonicNowSeconds();
  }

  scheduleClick(time: number, accented: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // Never schedule in the past — clamp to the clock's leading edge.
    const start = Math.max(time, ctx.currentTime);
    const end = start + CLICK_SECONDS;

    const osc: OscillatorNode = ctx.createOscillator();
    const gain: GainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = accented ? ACCENT_FREQ : NORMAL_FREQ;

    const peak = accented ? ACCENT_GAIN : NORMAL_GAIN;
    // Percussive envelope: near-instant attack, fast exponential decay.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + PEAK_ATTACK_SECONDS);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
  }

  async dispose(): Promise<void> {
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) await ctx.close();
  }
}

/**
 * No-op backend. Keeps a valid monotonic clock so the scheduler and beat
 * indicator still work (e.g. in tests, on web, or if the native audio module
 * fails to initialize) — there just isn't any sound.
 */
export class SilentBackend implements AudioBackend {
  readonly isSilent = true;
  async prepare(): Promise<void> {}
  now(): number {
    return monotonicNowSeconds();
  }
  scheduleClick(): void {}
  async dispose(): Promise<void> {}
}

/** Default backend used by the app. Isolated so it's easy to override in tests. */
export function createAudioBackend(): AudioBackend {
  return new AudioApiBackend();
}
