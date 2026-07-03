import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/theme';
import type { BeatListener } from '@/lib/metronome';

/**
 * Row of dots showing the current beat within the measure.
 *
 * It subscribes to the metronome's beat events *itself* and holds its own tiny
 * bit of state, so a beat tick re-renders only this component — never the whole
 * Practice screen. It is purely a read-out: the events it renders are driven by
 * the (authoritative) audio schedule, and any UI-thread lag here can never shift
 * that schedule.
 */
interface BeatIndicatorProps {
  beatsPerMeasure: number;
  accentedBeats: boolean[];
  running: boolean;
  subscribe: (listener: BeatListener) => () => void;
}

export function BeatIndicator({
  beatsPerMeasure,
  accentedBeats,
  running,
  subscribe,
}: BeatIndicatorProps) {
  const [activeBeat, setActiveBeat] = useState(-1);
  // Derive the shown beat so we never have to reset state in the effect body:
  // when stopped, nothing is active regardless of the last beat seen.
  const shownBeat = running ? activeBeat : -1;

  useEffect(() => {
    if (!running) return;
    const unsubscribe = subscribe((event) => setActiveBeat(event.beatIndex));
    return unsubscribe;
  }, [running, subscribe]);

  return (
    <View style={styles.row} accessibilityLabel="Beat indicator">
      {Array.from({ length: beatsPerMeasure }, (_, i) => {
        const isActive = i === shownBeat;
        const isAccent = accentedBeats[i] ?? false;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              isAccent ? styles.dotAccent : styles.dotNormal,
              isActive && (isAccent ? styles.dotActiveAccent : styles.dotActive),
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 22,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  // Idle voicing distinguishes accented (ring) from normal (faint) beats.
  dotAccent: { borderColor: Colors.gold, backgroundColor: 'transparent' },
  dotNormal: { borderColor: Colors.mutedBorderAlt, backgroundColor: 'transparent' },
  // Active beat fills in; accented downbeat pulses brighter/larger.
  dotActive: { backgroundColor: Colors.iconLight, borderColor: Colors.iconLight },
  dotActiveAccent: {
    backgroundColor: Colors.gold,
    borderColor: Colors.goldGlow,
    transform: [{ scale: 1.25 }],
  },
});
