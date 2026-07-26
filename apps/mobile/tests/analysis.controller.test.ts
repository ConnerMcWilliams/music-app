import {
  createLiveAnalysis,
  type FrameSink,
  type LiveAnalysisState,
  type MicBackend,
  type MicTake,
} from '@/lib/analysis';
import { frameLengthFor, hopLengthFor, hzToMidi, midiToHz } from '@/lib/pitch';
import type { ExpectedNote } from '@/lib/musicxml';
import type { NoteState } from '@/types';

const RATE = 22050;
const FRAME = frameLengthFor(RATE);
const HOP = hopLengthFor(RATE);
const ORIGIN = 1000;

/**
 * Fake microphone. Holds a fixed clock so the controller's timebase maths is
 * exercised exactly, and lets a test push real audio through the real detector.
 */
class FakeMic implements MicBackend {
  readonly isSilent = false;
  sink: FrameSink | null = null;
  take: MicTake | null = { uri: 'file:///take.wav', durationSeconds: 3 };
  prepareError: Error | null = null;
  stopped = false;

  async prepare(): Promise<void> {
    if (this.prepareError) throw this.prepareError;
  }
  async start(onFrame: FrameSink): Promise<void> {
    this.sink = onFrame;
  }
  async stop(): Promise<MicTake | null> {
    this.stopped = true;
    return this.take;
  }
  now(): number {
    return ORIGIN;
  }
  async dispose(): Promise<void> {}

  /**
   * Feed `signal` as the overlapping ~46 ms / 10 ms-hop frames the real
   * assembler produces, so the controller sees the true frame density.
   */
  play(signal: Float32Array): void {
    for (let start = 0; start + FRAME <= signal.length; start += HOP) {
      this.sink?.(signal.subarray(start, start + FRAME), start / RATE, RATE);
    }
  }
}

/** Continuous-phase tone whose frequency follows `midiAt` (null = silence). */
function synthesize(seconds: number, midiAt: (t: number) => number | null): Float32Array {
  const total = Math.ceil(seconds * RATE);
  const out = new Float32Array(total);
  let phase = 0;
  for (let i = 0; i < total; i += 1) {
    const midi = midiAt(i / RATE);
    if (midi == null) continue;
    phase += (2 * Math.PI * midiToHz(midi)) / RATE;
    out[i] = Math.sin(phase);
  }
  return out;
}

function timeline(midis: number[], durationBeats: number): ExpectedNote[] {
  return midis.map((midi, i) => ({
    index: i,
    // Deliberately offset from `index`, as real scores with rests are.
    noteIndex: i + 100,
    midi,
    onsetBeats: i * durationBeats,
    durationBeats,
    measureIndex: 0,
  }));
}

/** Latest published state, so assertions read the controller's real output. */
function track(controller: ReturnType<typeof createLiveAnalysis>) {
  const box: { state: LiveAnalysisState | null } = { state: null };
  controller.subscribe((state) => {
    box.state = state;
  });
  return box;
}

/**
 * Let the controller's coalesced publish land.
 *
 * State is throttled to ~50 ms so a run doesn't re-render 150 SVG glyphs per
 * audio frame; a synchronous burst of frames therefore leaves the last update on
 * a trailing timer. Waiting for it is exactly what the UI does.
 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 80));

const verdictOf = (state: LiveAnalysisState | null, noteIndex: number): NoteState | undefined =>
  state?.verdicts.get(noteIndex);

describe('live analysis over real audio', () => {
  /** Quarter notes at ♩=120; the boundary between notes falls at frame 10. */
  const QUARTERS = timeline([60, 62], 1);
  /** Note change lands mid-run; frames straddling it are a realistic minority. */
  const SWITCH_SECONDS = 0.46;

  it('turns a correctly played passage green', async () => {
    const mic = new FakeMic();
    const controller = createLiveAnalysis({ backend: mic });
    const box = track(controller);

    await controller.prepare();
    await controller.start(
      { timeline: QUARTERS, bpm: 120, countInBeats: 0, latencySeconds: 0 },
      ORIGIN,
    );

    mic.play(synthesize(1.2, (t) => (t < SWITCH_SECONDS ? 60 : 62)));
    await flush();

    expect(verdictOf(box.state, 100)).toBe('correct');
    expect(verdictOf(box.state, 101)).toBe('correct');
    expect(box.state?.summary).toMatchObject({ correct: 2, wrong: 0, missed: 0, total: 2 });
    await controller.dispose();
  });

  it('turns a wrong note red without disturbing the right one', async () => {
    const mic = new FakeMic();
    const controller = createLiveAnalysis({ backend: mic });
    const box = track(controller);

    await controller.prepare();
    await controller.start(
      { timeline: QUARTERS, bpm: 120, countInBeats: 0, latencySeconds: 0 },
      ORIGIN,
    );

    // Second note played a fourth too high.
    mic.play(synthesize(1.2, (t) => (t < SWITCH_SECONDS ? 60 : 67)));
    await flush();

    expect(verdictOf(box.state, 100)).toBe('correct');
    expect(verdictOf(box.state, 101)).toBe('wrong');
    await controller.dispose();
  });

  /**
   * The realistic trumpet error: the whole passage played an octave low. It must
   * read red, and it must read red the same way `align.py` does — a take that
   * goes green in practice and red in its results is the outcome the shared
   * tolerance exists to prevent.
   */
  it('turns an octave-low performance red, end to end', async () => {
    const mic = new FakeMic();
    const controller = createLiveAnalysis({ backend: mic });

    await controller.prepare();
    await controller.start(
      // Expect D5/E5; the player sounds them an octave down.
      { timeline: timeline([74, 76], 1), bpm: 120, countInBeats: 0, latencySeconds: 0 },
      ORIGIN,
    );
    mic.play(synthesize(1.2, (t) => (t < SWITCH_SECONDS ? 62 : 64)));

    const summary = await controller.stop();
    expect(summary.judgements.map((j) => j.state)).toEqual(['wrong', 'wrong']);
    // The detail tells the player what they actually played.
    expect(summary.judgements[0].heardMidi).toBe(62);
    expect(summary.judgements[1].heardMidi).toBe(64);
  });

  it('marks silence as missed', async () => {
    const mic = new FakeMic();
    const controller = createLiveAnalysis({ backend: mic });
    const box = track(controller);

    await controller.prepare();
    await controller.start(
      { timeline: QUARTERS, bpm: 120, countInBeats: 0, latencySeconds: 0 },
      ORIGIN,
    );
    mic.play(new Float32Array(Math.ceil(1.2 * RATE)));
    await flush();

    expect(verdictOf(box.state, 100)).toBe('missed');
    expect(verdictOf(box.state, 101)).toBe('missed');
    await controller.dispose();
  });

  it('reports the run and the recorded take when stopped', async () => {
    const mic = new FakeMic();
    const controller = createLiveAnalysis({ backend: mic });

    await controller.prepare();
    await controller.start(
      { timeline: QUARTERS, bpm: 120, countInBeats: 0, latencySeconds: 0 },
      ORIGIN,
    );
    mic.play(synthesize(1.2, (t) => (t < SWITCH_SECONDS ? 60 : 62)));

    const summary = await controller.stop();
    expect(mic.stopped).toBe(true);
    expect(summary.take).toEqual({ uri: 'file:///take.wav', durationSeconds: 3 });
    expect(summary.judgements.map((j) => j.state)).toEqual(['correct', 'correct']);
    expect(summary.counts.correct).toBe(2);
    expect(summary.medianTimingErrorSeconds).not.toBeNull();
  });

  it('leaves notes the player never reached unjudged, not missed', async () => {
    const mic = new FakeMic();
    const controller = createLiveAnalysis({ backend: mic });

    await controller.prepare();
    await controller.start(
      { timeline: timeline([60, 62, 64, 65], 1), bpm: 120, countInBeats: 0, latencySeconds: 0 },
      ORIGIN,
    );
    // Only enough audio to cover the first note.
    mic.play(synthesize(0.6, () => 60));

    const summary = await controller.stop();
    // Stopping early is a choice, not four mistakes.
    expect(summary.judgements).toHaveLength(1);
    expect(summary.counts).toMatchObject({ correct: 1, wrong: 0, missed: 0, total: 4 });
  });
});

describe('count-in', () => {
  it('does not judge anything until the count-in has elapsed', async () => {
    const mic = new FakeMic();
    const controller = createLiveAnalysis({ backend: mic });
    const box = track(controller);

    await controller.prepare();
    // Four beats of count-in at ♩=120 is two seconds of grace.
    await controller.start(
      { timeline: timeline([60, 62], 1), bpm: 120, countInBeats: 4, latencySeconds: 0 },
      ORIGIN,
    );
    expect(box.state?.phase).toBe('count-in');

    mic.play(synthesize(1.2, () => 60));
    await flush();
    // All of that audio landed before the first note's window.
    expect(box.state?.phase).toBe('count-in');
    expect(box.state?.summary.judged).toBe(0);
    await controller.dispose();
  });
});

describe('latency recovery', () => {
  /**
   * The case the recovery exists for: a fast passage on a laggy device. Eighth
   * notes at ♩=120 give ~0.23 s windows, so 0.3 s of lag pushes the player's
   * audio clean out of the notes it belongs to.
   */
  const EIGHTHS = timeline([60, 62, 64, 65, 67, 69], 0.5);
  const LAG = 0.3;
  const NOTE_SECONDS = 0.25;

  const laggedSignal = () =>
    synthesize(2.0, (t) => {
      if (t < LAG) return null;
      const i = Math.floor((t - LAG) / NOTE_SECONDS);
      return EIGHTHS[i]?.midi ?? null;
    });

  it('re-anchors instead of painting the study red', async () => {
    const mic = new FakeMic();
    const controller = createLiveAnalysis({ backend: mic });
    const box = track(controller);

    await controller.prepare();
    await controller.start(
      { timeline: EIGHTHS, bpm: 120, countInBeats: 0, latencySeconds: 0 },
      ORIGIN,
    );
    mic.play(laggedSignal());
    await flush();

    const summary = await controller.stop();
    // Without recovery every note would be missed or wrong. After re-anchoring
    // the later notes line up and come back correct.
    expect(summary.counts.correct).toBeGreaterThanOrEqual(3);
    expect(box.state?.summary.correct).toBeGreaterThanOrEqual(3);
  });

  it('discards the verdicts it reached under the bad alignment', async () => {
    const mic = new FakeMic();
    const controller = createLiveAnalysis({ backend: mic });

    await controller.prepare();
    await controller.start(
      { timeline: EIGHTHS, bpm: 120, countInBeats: 0, latencySeconds: 0 },
      ORIGIN,
    );
    mic.play(laggedSignal());

    const summary = await controller.stop();
    // The opening notes are left unjudged rather than wrongly condemned.
    const opening = summary.judgements.filter((j) => j.index < 2);
    expect(opening.every((j) => j.state === 'correct')).toBe(true);
  });

  /**
   * The microphone hears the metronome, and the offbeat click (1108 Hz) sits
   * inside the detector's search range — so during a count-in the detector
   * returns confident, entirely spurious readings.
   *
   * If one of those is taken for the player's entry, the recovery anchors two
   * seconds early, the offset lands far outside MAX_RECOVERY_SECONDS, and the
   * safety net latches off having never been used — on exactly the laggy device
   * it exists for. The player then gets a study painted red.
   */
  it('is not fooled by the metronome bleeding through the count-in', async () => {
    const mic = new FakeMic();
    const controller = createLiveAnalysis({ backend: mic });
    const box = track(controller);

    const COUNT_IN_BEATS = 4;
    const countInSeconds = COUNT_IN_BEATS * 0.5; // ♩=120

    await controller.prepare();
    await controller.start(
      {
        timeline: EIGHTHS,
        bpm: 120,
        countInBeats: COUNT_IN_BEATS,
        latencySeconds: 0,
      },
      ORIGIN,
    );

    // A 35 ms click on each count-in beat, then the same lagged entry the test
    // above uses, pushed back behind the count-in.
    const CLICK_HZ = 1108;
    const CLICK_SECONDS = 0.035;
    mic.play(
      synthesize(countInSeconds + 2.0, (t) => {
        if (t < countInSeconds) {
          const intoBeat = t % 0.5;
          return intoBeat < CLICK_SECONDS ? hzToMidi(CLICK_HZ) : null;
        }
        const played = t - countInSeconds;
        if (played < LAG) return null;
        return EIGHTHS[Math.floor((played - LAG) / NOTE_SECONDS)]?.midi ?? null;
      }),
    );
    await flush();

    const summary = await controller.stop();
    expect(summary.counts.correct).toBeGreaterThanOrEqual(3);
    expect(box.state?.summary.correct).toBeGreaterThanOrEqual(3);
  });

  it('leaves a well-tracking run alone', async () => {
    const mic = new FakeMic();
    const controller = createLiveAnalysis({ backend: mic });

    await controller.prepare();
    await controller.start(
      { timeline: EIGHTHS, bpm: 120, countInBeats: 0, latencySeconds: 0 },
      ORIGIN,
    );
    mic.play(synthesize(2.0, (t) => EIGHTHS[Math.floor(t / NOTE_SECONDS)]?.midi ?? null));

    const summary = await controller.stop();
    expect(summary.counts.correct).toBeGreaterThanOrEqual(5);
    expect(summary.counts.missed).toBe(0);
  });
});

describe('microphone failure', () => {
  it('degrades to silent and surfaces an error the UI can show', async () => {
    const mic = new FakeMic();
    mic.prepareError = new Error('Microphone permission denied');
    const controller = createLiveAnalysis({ backend: mic });
    const box = track(controller);

    await controller.prepare();

    expect(box.state?.error).toMatch(/microphone access/i);
    // The screen still works — it just can't hear anything.
    await expect(
      controller.start({ timeline: timeline([60], 1), bpm: 120 }, ORIGIN),
    ).resolves.toBeUndefined();
    await controller.dispose();
  });

  it('reports a generic problem when the microphone is simply unavailable', async () => {
    const mic = new FakeMic();
    mic.prepareError = new Error('no audio hardware');
    const controller = createLiveAnalysis({ backend: mic });
    const box = track(controller);

    await controller.prepare();
    expect(box.state?.error).toMatch(/unavailable/i);
    await controller.dispose();
  });
});

describe('controller lifecycle', () => {
  it('is safe to stop and dispose repeatedly', async () => {
    const controller = createLiveAnalysis({ backend: new FakeMic() });
    await controller.prepare();
    await expect(controller.stop()).resolves.toBeDefined();
    await controller.dispose();
    await expect(controller.dispose()).resolves.toBeUndefined();
  });

  it('stops listening once unsubscribed', async () => {
    const mic = new FakeMic();
    const controller = createLiveAnalysis({ backend: mic });
    let calls = 0;
    const unsubscribe = controller.subscribe(() => {
      calls += 1;
    });
    await controller.prepare();
    const before = calls;
    unsubscribe();
    await controller.start({ timeline: timeline([60], 1), bpm: 120 }, ORIGIN);
    expect(calls).toBe(before);
    await controller.dispose();
  });

  it('starting again resets the previous run', async () => {
    const mic = new FakeMic();
    const controller = createLiveAnalysis({ backend: mic });
    const box = track(controller);
    const config = { timeline: timeline([60, 62], 1), bpm: 120, countInBeats: 0, latencySeconds: 0 };

    await controller.prepare();
    await controller.start(config, ORIGIN);
    mic.play(synthesize(1.2, () => 60));
    await flush();
    expect(box.state?.summary.judged).toBe(2);

    await controller.start(config, ORIGIN);
    expect(box.state?.summary.judged).toBe(0);
    expect(box.state?.verdicts.size).toBe(0);
    await controller.dispose();
  });
});
