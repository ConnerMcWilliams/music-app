import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  BPM_STEP,
  clampBpm,
  createMetronome,
  defaultConfig,
  makeAccentPattern,
  normalizeConfig,
  toggleAccent,
  type BeatListener,
  type MetronomeConfig,
  type MetronomeController,
} from '@/lib/metronome';

/**
 * React binding for the metronome. Owns exactly one {@link MetronomeController}
 * for the lifetime of the screen and keeps all audio/timing behind it — the
 * component tree only ever touches config state and transport actions.
 *
 * Lifecycle guarantees required by the Practice screen:
 *  - the controller is `prepare()`d once on mount and `dispose()`d on unmount;
 *  - it is `stop()`ped whenever the screen loses focus (covers navigating to
 *    Record, tab switches, and back-gestures) so the metronome never plays on
 *    another screen;
 *  - config edits while running are pushed through `updateConfig` (no second
 *    scheduler, no drift).
 */
export interface UseMetronome {
  config: MetronomeConfig;
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  setBpm: (bpm: number) => void;
  incrementBpm: (step?: number) => void;
  decrementBpm: (step?: number) => void;
  setBeatsPerMeasure: (beats: number) => void;
  toggleBeatAccent: (index: number) => void;
  /** Subscribe to beat events (for the visual indicator). Returns unsubscribe. */
  subscribe: (listener: BeatListener) => () => void;
}

export function useMetronome(initial?: Partial<MetronomeConfig>): UseMetronome {
  // One controller for the lifetime of the screen (created lazily, never during
  // a re-render).
  const [controller] = useState<MetronomeController>(() => createMetronome());

  const [config, setConfig] = useState<MetronomeConfig>(() =>
    normalizeConfig({ ...defaultConfig(), ...initial }),
  );
  const [isRunning, setIsRunning] = useState(false);

  // Prepare once; dispose on unmount.
  useEffect(() => {
    void controller.prepare();
    return () => {
      void controller.dispose();
    };
  }, [controller]);

  // Push config changes to a running metronome (takes effect next beat).
  useEffect(() => {
    if (isRunning) void controller.updateConfig(config);
  }, [config, isRunning, controller]);

  // Stop when the screen loses focus (navigation away, tab switch, unmount).
  useFocusEffect(
    useCallback(() => {
      return () => {
        void controller.stop();
        setIsRunning(false);
      };
    }, [controller]),
  );

  const start = useCallback(() => {
    void controller.start(config);
    setIsRunning(true);
  }, [controller, config]);

  const stop = useCallback(() => {
    void controller.stop();
    setIsRunning(false);
  }, [controller]);

  const toggle = useCallback(() => {
    if (isRunning) stop();
    else start();
  }, [isRunning, start, stop]);

  const setBpm = useCallback((bpm: number) => {
    setConfig((c) => ({ ...c, bpm: clampBpm(bpm) }));
  }, []);

  const incrementBpm = useCallback((step: number = BPM_STEP) => {
    setConfig((c) => ({ ...c, bpm: clampBpm(c.bpm + step) }));
  }, []);

  const decrementBpm = useCallback((step: number = BPM_STEP) => {
    setConfig((c) => ({ ...c, bpm: clampBpm(c.bpm - step) }));
  }, []);

  const setBeatsPerMeasure = useCallback((beats: number) => {
    setConfig((c) => ({
      ...c,
      beatsPerMeasure: beats,
      accentedBeats: makeAccentPattern(beats, c.accentedBeats),
    }));
  }, []);

  const toggleBeatAccent = useCallback((index: number) => {
    setConfig((c) => ({ ...c, accentedBeats: toggleAccent(c.accentedBeats, index) }));
  }, []);

  const subscribe = useCallback(
    (listener: BeatListener) => controller.subscribe(listener),
    [controller],
  );

  return {
    config,
    isRunning,
    start,
    stop,
    toggle,
    setBpm,
    incrementBpm,
    decrementBpm,
    setBeatsPerMeasure,
    toggleBeatAccent,
    subscribe,
  };
}
