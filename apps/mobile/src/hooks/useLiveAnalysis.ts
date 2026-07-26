import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  createLiveAnalysis,
  emptyCounts,
  DEFAULT_COUNT_IN_BEATS,
  type LiveAnalysisController,
  type LiveAnalysisState,
  type LiveSessionSummary,
} from '@/lib/analysis';
import { monotonicNowSeconds } from '@/lib/metronome';
import type { ExpectedNote } from '@/lib/musicxml';
import type { UseMetronome } from './useMetronome';

/**
 * React binding for live analytical mode. Owns exactly one
 * {@link LiveAnalysisController} for the lifetime of the screen and keeps all
 * audio/timing behind it — the component tree only renders state and calls
 * `toggle`.
 *
 * It also owns the one piece of coordination the feature needs: analytical mode
 * is *tempo-locked*, so the metronome is not an optional companion but the clock
 * itself. Enabling starts the metronome and anchors the score's timeline to its
 * first beat; disabling stops both. Keeping that here means the screen never has
 * to reason about beats, and the pairing can be tested without a UI.
 *
 * Lifecycle guarantees, mirroring `useMetronome`:
 *  - the controller is `prepare()`d once on mount and `dispose()`d on unmount;
 *  - it is stopped whenever the screen loses focus, so the microphone is never
 *    live on another screen.
 */
export interface UseLiveAnalysis {
  state: LiveAnalysisState;
  /** True once analytical mode is switched on (includes the count-in). */
  isActive: boolean;
  /** Set when the microphone is unavailable — the UI must surface this. */
  error?: string;
  /** Result of the most recent run, available after `disable()`. */
  lastSummary: LiveSessionSummary | null;
  enable: (timeline: readonly ExpectedNote[]) => void;
  disable: () => void;
  toggle: (timeline: readonly ExpectedNote[]) => void;
}

const IDLE_STATE: LiveAnalysisState = {
  phase: 'idle',
  verdicts: new Map(),
  summary: emptyCounts(),
};

export interface UseLiveAnalysisOptions {
  /** Override the controller (tests). */
  controller?: LiveAnalysisController;
  countInBeats?: number;
}

export function useLiveAnalysis(
  metronome: UseMetronome,
  options: UseLiveAnalysisOptions = {},
): UseLiveAnalysis {
  const { controller: injected, countInBeats = DEFAULT_COUNT_IN_BEATS } = options;

  // One controller for the lifetime of the screen (created lazily, never during
  // a re-render).
  const [controller] = useState<LiveAnalysisController>(() => injected ?? createLiveAnalysis());

  const [state, setState] = useState<LiveAnalysisState>(IDLE_STATE);
  const [isActive, setIsActive] = useState(false);
  const [lastSummary, setLastSummary] = useState<LiveSessionSummary | null>(null);

  // Pending "wait for the downbeat" subscription, so it can be torn down if the
  // user switches analytical mode off before the metronome's first beat lands.
  const pendingBeat = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    void controller.prepare();
    return () => {
      unsubscribe();
      void controller.dispose();
    };
  }, [controller]);

  const cancelPendingBeat = useCallback(() => {
    pendingBeat.current?.();
    pendingBeat.current = null;
  }, []);

  const disable = useCallback(() => {
    cancelPendingBeat();
    setIsActive(false);
    metronome.stop();
    void controller.stop().then(setLastSummary);
  }, [cancelPendingBeat, controller, metronome]);

  const enable = useCallback(
    (timeline: readonly ExpectedNote[]) => {
      if (timeline.length === 0) return;
      cancelPendingBeat();
      setIsActive(true);
      setLastSummary(null);

      const bpm = metronome.config.bpm;
      // Anchor on the metronome's first beat rather than on "now": the
      // scheduler starts the click a fraction of a second out, and the score has
      // to line up with what the player actually hears.
      const unsubscribe = metronome.subscribe((beat) => {
        if (beat.beatNumber !== 0) return;
        cancelPendingBeat();
        void controller.start({ timeline, bpm, countInBeats }, monotonicNowSeconds());
      });
      pendingBeat.current = unsubscribe;

      metronome.start();
    },
    [cancelPendingBeat, controller, countInBeats, metronome],
  );

  const toggle = useCallback(
    (timeline: readonly ExpectedNote[]) => {
      if (isActive) disable();
      else enable(timeline);
    },
    [disable, enable, isActive],
  );

  // Stop when the screen loses focus (navigation away, tab switch, unmount) so
  // the microphone never stays live behind another screen.
  useFocusEffect(
    useCallback(() => {
      return () => {
        pendingBeat.current?.();
        pendingBeat.current = null;
        setIsActive(false);
        void controller.stop();
      };
    }, [controller]),
  );

  return {
    state,
    isActive,
    error: state.error,
    lastSummary,
    enable,
    disable,
    toggle,
  };
}
