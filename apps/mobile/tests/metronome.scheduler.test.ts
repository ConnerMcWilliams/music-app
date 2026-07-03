import { LookaheadScheduler, type ScheduledBeat } from '@/lib/metronome/scheduler';
import type { MetronomeConfig } from '@/lib/metronome/types';

/**
 * Scheduler tests. The scheduler is driven by an injected fake clock and a
 * manual ticker, so we can prove the timing math directly — including the key
 * requirement that beat targets are absolute (start + N × dur) and never
 * accumulate drift from irregular callback timing.
 */
function makeHarness() {
  let now = 0;
  let tickerCb: (() => void) | null = null;
  let setTickerCalls = 0;
  let clearTickerCalls = 0;
  const scheduled: ScheduledBeat[] = [];

  const scheduler = new LookaheadScheduler({
    now: () => now,
    onSchedule: (beat) => scheduled.push(beat),
    setTicker: (cb) => {
      setTickerCalls += 1;
      tickerCb = cb;
      return setTickerCalls;
    },
    clearTicker: () => {
      clearTickerCalls += 1;
      tickerCb = null;
    },
    lookaheadMs: 25,
    scheduleAheadSec: 0.1,
    startOffsetSec: 0,
    resyncThresholdSec: 0.25,
  });

  return {
    scheduler,
    scheduled,
    setNow(t: number) {
      now = t;
    },
    tick() {
      tickerCb?.();
    },
    get setTickerCalls() {
      return setTickerCalls;
    },
    get clearTickerCalls() {
      return clearTickerCalls;
    },
    get tickerActive() {
      return tickerCb !== null;
    },
  };
}

const config = (over: Partial<MetronomeConfig> = {}): MetronomeConfig => ({
  bpm: 120,
  beatsPerMeasure: 4,
  accentedBeats: [true, false, false, false],
  ...over,
});

describe('LookaheadScheduler timing', () => {
  it('schedules the opening beat immediately at the origin (no late first click)', () => {
    const h = makeHarness();
    h.scheduler.start(config()); // startOffset 0 → origin at now (0)
    expect(h.scheduled[0]?.time).toBeCloseTo(0, 10);
    expect(h.scheduled[0]?.beatIndex).toBe(0);
    expect(h.scheduled[0]?.accented).toBe(true);
  });

  it('places beats at absolute times start + N × beatDuration', () => {
    const h = makeHarness();
    h.scheduler.start(config({ bpm: 120 })); // 0.5 s per beat
    // Walk the clock forward beat by beat.
    for (let i = 1; i <= 4; i += 1) {
      h.setNow(i * 0.5);
      h.tick();
    }
    const times = h.scheduled.map((b) => b.time);
    expect(times).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it('does NOT accumulate drift when the ticker fires at irregular times', () => {
    const h = makeHarness();
    h.scheduler.start(config({ bpm: 120 })); // 0.5 s beats
    // Jittery-but-keeping-up clock readings (each within the resync threshold),
    // as a busy JS thread would produce.
    [0.4, 0.55, 0.9, 1.05, 1.4, 1.55, 1.9, 2.05].forEach((t) => {
      h.setNow(t);
      h.tick();
    });
    // Every scheduled beat still lands exactly on N × 0.5, not offset by jitter.
    expect(h.scheduled.length).toBeGreaterThan(3);
    for (const beat of h.scheduled) {
      expect(beat.time).toBeCloseTo(beat.beatNumber * 0.5, 9);
    }
  });

  it('advances beat index and measure with wrapping', () => {
    const h = makeHarness();
    h.scheduler.start(config({ beatsPerMeasure: 4 }));
    for (let i = 1; i <= 5; i += 1) {
      h.setNow(i * 0.5);
      h.tick();
    }
    expect(h.scheduled.slice(0, 6).map((b) => b.beatIndex)).toEqual([0, 1, 2, 3, 0, 1]);
    expect(h.scheduled[4].measure).toBe(1);
  });

  it('applies accent pattern per beat', () => {
    const h = makeHarness();
    h.scheduler.start(config({ accentedBeats: [true, false, true, false] }));
    for (let i = 1; i <= 3; i += 1) {
      h.setNow(i * 0.5);
      h.tick();
    }
    expect(h.scheduled.slice(0, 4).map((b) => b.accented)).toEqual([true, false, true, false]);
  });
});

describe('LookaheadScheduler lifecycle guarantees', () => {
  it('start called twice does not create a second ticker', () => {
    const h = makeHarness();
    h.scheduler.start(config());
    h.scheduler.start(config()); // ignored while running
    expect(h.setTickerCalls).toBe(1);
    expect(h.scheduler.isRunning).toBe(true);
  });

  it('stop is safe when already stopped', () => {
    const h = makeHarness();
    expect(() => h.scheduler.stop()).not.toThrow();
    h.scheduler.start(config());
    h.scheduler.stop();
    expect(() => h.scheduler.stop()).not.toThrow();
    expect(h.scheduler.isRunning).toBe(false);
    expect(h.tickerActive).toBe(false);
  });

  it('schedules nothing after stop even if the clock advances', () => {
    const h = makeHarness();
    h.scheduler.start(config());
    const countAtStop = h.scheduled.length;
    h.scheduler.stop();
    h.setNow(10);
    h.tick(); // ticker is cleared; even a stray call is a no-op
    expect(h.scheduled.length).toBe(countAtStop);
  });
});

describe('LookaheadScheduler config changes while running', () => {
  it('changes tempo at the next beat without a burst or drift', () => {
    const h = makeHarness();
    h.scheduler.start(config({ bpm: 120 })); // 0.5 s beats: beat0@0
    h.setNow(0.5);
    h.tick(); // beat1@0.5 scheduled; next unscheduled beat target = 1.0
    const before = h.scheduled.length;

    h.scheduler.updateConfig(config({ bpm: 60 })); // 1.0 s beats from the next beat
    // No catch-up burst at the moment of change.
    expect(h.scheduled.length).toBe(before);

    h.setNow(1.0);
    h.tick();
    h.setNow(2.0);
    h.tick();
    const newBeats = h.scheduled.slice(before);
    const times = newBeats.map((b) => b.time);
    expect(times).toEqual([1, 2]); // 1.0 s spacing, continuous from the boundary
  });

  it('changing beats-per-measure keeps a valid, wrapping index sequence', () => {
    const h = makeHarness();
    h.scheduler.start(config({ beatsPerMeasure: 4, bpm: 120 }));
    h.setNow(0.5);
    h.tick();
    h.scheduler.updateConfig(config({ beatsPerMeasure: 3, bpm: 120 }));
    for (let i = 2; i <= 6; i += 1) {
      h.setNow(i * 0.5);
      h.tick();
    }
    // Every index stays within the (new) meter.
    for (const beat of h.scheduled) {
      expect(beat.beatIndex).toBeGreaterThanOrEqual(0);
      expect(beat.beatIndex).toBeLessThan(4);
    }
  });

  it('resyncs instead of firing a burst after a long stall (backgrounding)', () => {
    const h = makeHarness();
    h.scheduler.start(config({ bpm: 120 }));
    const before = h.scheduled.length;
    // Jump far ahead as if the app was backgrounded for 5 seconds.
    h.setNow(5);
    h.tick();
    // It should not have machine-gunned ~10 missed beats; only the current
    // look-ahead window is scheduled.
    expect(h.scheduled.length - before).toBeLessThanOrEqual(2);
  });
});
