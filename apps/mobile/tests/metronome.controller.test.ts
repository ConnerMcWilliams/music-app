import { createMetronome, type AudioBackend, type MetronomeConfig } from '@/lib/metronome';

/**
 * Controller tests. A fake backend gives us a controllable audio clock and a
 * record of scheduled clicks, while Jest fake timers drive the internal
 * look-ahead ticker and the visual-event timeouts. These cover the lifecycle
 * guarantees the metronome must honor: single scheduler, safe stop/dispose,
 * config changes while running, and beat events for the indicator.
 */
class FakeBackend implements AudioBackend {
  readonly isSilent = false;
  t = 0;
  clicks: { time: number; accented: boolean }[] = [];
  prepareCount = 0;
  disposeCount = 0;

  async prepare(): Promise<void> {
    this.prepareCount += 1;
  }
  now(): number {
    return this.t;
  }
  scheduleClick(time: number, accented: boolean): void {
    this.clicks.push({ time, accented });
  }
  async dispose(): Promise<void> {
    this.disposeCount += 1;
  }
}

const config = (over: Partial<MetronomeConfig> = {}): MetronomeConfig => ({
  bpm: 120,
  beatsPerMeasure: 4,
  accentedBeats: [true, false, false, false],
  ...over,
});

describe('Metronome controller', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('prepares the backend and schedules the opening click on start', async () => {
    const backend = new FakeBackend();
    const m = createMetronome({ backend });
    await m.start(config());
    expect(backend.prepareCount).toBe(1);
    expect(backend.clicks.length).toBeGreaterThanOrEqual(1);
    expect(backend.clicks[0].accented).toBe(true);
    await m.dispose();
  });

  it('start called twice does not create a second scheduler/ticker', async () => {
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    const backend = new FakeBackend();
    const m = createMetronome({ backend });
    await m.start(config());
    await m.start(config()); // retarget, not a new run
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    await m.dispose();
    setIntervalSpy.mockRestore();
  });

  it('stop is safe when never started', async () => {
    const backend = new FakeBackend();
    const m = createMetronome({ backend });
    await expect(m.stop()).resolves.toBeUndefined();
    expect(backend.clicks).toHaveLength(0);
    await m.dispose();
  });

  it('stops scheduling further clicks after stop', async () => {
    const backend = new FakeBackend();
    const m = createMetronome({ backend });
    await m.start(config());
    const countAtStop = backend.clicks.length;
    await m.stop();
    backend.t = 10; // advance the audio clock a long way
    jest.advanceTimersByTime(500); // fire any pending ticks
    expect(backend.clicks.length).toBe(countAtStop);
    await m.dispose();
  });

  it('emits a beat event to subscribers at the audible moment', async () => {
    const backend = new FakeBackend();
    const m = createMetronome({ backend });
    const events: number[] = [];
    const unsubscribe = m.subscribe((e) => events.push(e.beatIndex));
    await m.start(config());
    // The opening beat's visual timeout is ~ (startOffset) ms out; flush it.
    jest.advanceTimersByTime(120);
    expect(events[0]).toBe(0);
    unsubscribe();
    await m.dispose();
  });

  it('applies a tempo change while running without a second scheduler', async () => {
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    const backend = new FakeBackend();
    const m = createMetronome({ backend });
    await m.start(config({ bpm: 120 }));
    await m.updateConfig(config({ bpm: 60 }));
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    // Advance and confirm clicks keep coming (still one running schedule).
    backend.t = 2;
    jest.advanceTimersByTime(50);
    expect(backend.clicks.length).toBeGreaterThan(1);
    await m.dispose();
    setIntervalSpy.mockRestore();
  });

  it('dispose is safe to call more than once and releases the backend', async () => {
    const backend = new FakeBackend();
    const m = createMetronome({ backend });
    await m.start(config());
    await m.dispose();
    await expect(m.dispose()).resolves.toBeUndefined();
    expect(backend.disposeCount).toBeGreaterThanOrEqual(1);
  });
});
