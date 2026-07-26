import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useLiveAnalysis } from '@/hooks/useLiveAnalysis';
import { emptyCounts, type LiveAnalysisController, type LiveSessionSummary } from '@/lib/analysis';
import type { ExpectedNote } from '@/lib/musicxml';
import type { BeatEvent, BeatListener } from '@/lib/metronome';
import type { UseMetronome } from '@/hooks/useMetronome';

// Run the focus effect like a mount effect so its cleanup runs on unmount.
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(() => cb(), [cb]);
  },
}));

const TIMELINE: ExpectedNote[] = [
  { index: 0, noteIndex: 0, midi: 60, onsetBeats: 0, durationBeats: 1, measureIndex: 0 },
];

const EMPTY_SUMMARY: LiveSessionSummary = {
  judgements: [],
  counts: emptyCounts(),
  take: null,
  medianTimingErrorSeconds: null,
};

function fakeController() {
  const calls = {
    prepare: 0,
    start: 0,
    stop: 0,
    dispose: 0,
    startedWith: null as { origin: number } | null,
  };
  const controller: LiveAnalysisController = {
    prepare: async () => {
      calls.prepare += 1;
    },
    start: async (_config, origin) => {
      calls.start += 1;
      calls.startedWith = { origin };
    },
    stop: async () => {
      calls.stop += 1;
      return EMPTY_SUMMARY;
    },
    dispose: async () => {
      calls.dispose += 1;
    },
    subscribe: () => () => {},
  };
  return { controller, calls };
}

/** Metronome stub that records transport calls and can fire its first beat. */
function fakeMetronome() {
  const listeners = new Set<BeatListener>();
  const calls = { start: 0, stop: 0 };
  const metronome = {
    config: { bpm: 120, beatsPerMeasure: 4, accentedBeats: [true, false, false, false] },
    isRunning: false,
    start: () => {
      calls.start += 1;
    },
    stop: () => {
      calls.stop += 1;
    },
    toggle: () => {},
    setBpm: () => {},
    incrementBpm: () => {},
    decrementBpm: () => {},
    setBeatsPerMeasure: () => {},
    toggleBeatAccent: () => {},
    subscribe: (listener: BeatListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as UseMetronome;

  const fireBeat = (beatNumber: number) => {
    const event: BeatEvent = {
      beatNumber,
      beatIndex: 0,
      measure: 0,
      accented: true,
      time: 1,
    };
    [...listeners].forEach((listener) => listener(event));
  };

  return { metronome, calls, fireBeat, listenerCount: () => listeners.size };
}

/** Harness exposing the hook's API to the test body. */
function Harness({
  controller,
  metronome,
  onReady,
}: {
  controller: LiveAnalysisController;
  metronome: UseMetronome;
  onReady: (api: ReturnType<typeof useLiveAnalysis>) => void;
}) {
  const api = useLiveAnalysis(metronome, { controller });
  onReady(api);
  return <Text>{api.isActive ? 'active' : 'idle'}</Text>;
}

async function mount() {
  const { controller, calls } = fakeController();
  const met = fakeMetronome();
  let api: ReturnType<typeof useLiveAnalysis> | null = null;
  const view = await render(
    <Harness
      controller={controller}
      metronome={met.metronome}
      onReady={(a) => {
        api = a;
      }}
    />,
  );
  return { view, calls, met, api: () => api as ReturnType<typeof useLiveAnalysis> };
}

describe('useLiveAnalysis lifecycle', () => {
  it('prepares the controller once on mount', async () => {
    const { calls } = await mount();
    expect(calls.prepare).toBe(1);
  });

  it('disposes the controller on unmount', async () => {
    const { view, calls } = await mount();
    await act(async () => view.unmount());
    expect(calls.dispose).toBe(1);
  });

  it('stops when the screen loses focus, so the mic never runs off-screen', async () => {
    const { view, calls } = await mount();
    await act(async () => view.unmount());
    expect(calls.stop).toBeGreaterThanOrEqual(1);
  });
});

describe('useLiveAnalysis metronome pairing', () => {
  it('starts the metronome and waits for its downbeat before judging', async () => {
    const { calls, met, api } = await mount();

    await act(() => api().enable(TIMELINE));

    // The metronome is the clock, so it starts first …
    expect(met.calls.start).toBe(1);
    // … and nothing is judged until its first beat actually sounds.
    expect(calls.start).toBe(0);

    await act(() => met.fireBeat(0));
    expect(calls.start).toBe(1);
  });

  it('ignores later beats so a run is only anchored once', async () => {
    const { calls, met, api } = await mount();

    await act(() => api().enable(TIMELINE));
    await act(() => met.fireBeat(0));
    await act(() => met.fireBeat(1));
    await act(() => met.fireBeat(2));

    expect(calls.start).toBe(1);
  });

  it('does not anchor to a beat fired before analytical mode was enabled', async () => {
    const { calls, met } = await mount();
    await act(() => met.fireBeat(0));
    expect(calls.start).toBe(0);
  });

  it('stops both the metronome and the analyser when disabled', async () => {
    const { calls, met, api } = await mount();

    await act(() => api().enable(TIMELINE));
    await act(() => met.fireBeat(0));
    await act(() => api().disable());

    expect(met.calls.stop).toBe(1);
    expect(calls.stop).toBeGreaterThanOrEqual(1);
  });

  it('drops the pending downbeat subscription when switched off early', async () => {
    const { calls, met, api } = await mount();

    await act(() => api().enable(TIMELINE));
    await act(() => api().disable());
    // The beat arrives after the user changed their mind.
    await act(() => met.fireBeat(0));

    expect(calls.start).toBe(0);
    expect(met.listenerCount()).toBe(0);
  });

  it('refuses to start on a study with no notation to judge against', async () => {
    const { calls, met, api } = await mount();

    await act(() => api().enable([]));

    expect(met.calls.start).toBe(0);
    expect(calls.start).toBe(0);
    expect(api().isActive).toBe(false);
  });

  it('toggles on and back off', async () => {
    const { met, api } = await mount();

    await act(() => api().toggle(TIMELINE));
    expect(api().isActive).toBe(true);

    await act(() => api().toggle(TIMELINE));
    expect(api().isActive).toBe(false);
    expect(met.calls.stop).toBe(1);
  });
});
