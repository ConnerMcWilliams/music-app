import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components';
import { BPM_MAX, BPM_MIN, SUPPORTED_METERS } from '@/lib/metronome';
import { Colors, Fonts, Radius } from '@/theme';

/**
 * Metronome transport + tempo/meter controls.
 *
 * Presentational: it renders the current BPM, ± steppers (tap = 1 BPM, press &
 * hold = fast repeat), the meter selector (2/3/4/6), and start/stop. All state
 * lives in `useMetronome`; this component only calls the handlers it's given.
 */
interface MetronomeControlsProps {
  bpm: number;
  beatsPerMeasure: number;
  isRunning: boolean;
  onToggle: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onSetBeatsPerMeasure: (beats: number) => void;
}

export function MetronomeControls({
  bpm,
  beatsPerMeasure,
  isRunning,
  onToggle,
  onIncrement,
  onDecrement,
  onSetBeatsPerMeasure,
}: MetronomeControlsProps) {
  const inc = useHoldRepeat(onIncrement);
  const dec = useHoldRepeat(onDecrement);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Icon name="metronome" size={18} color={Colors.gold} />
        <Text style={styles.title}>Metronome</Text>
      </View>

      {/* Tempo stepper */}
      <View style={styles.tempoRow}>
        <StepperButton
          label="−"
          disabled={bpm <= BPM_MIN}
          onPressIn={dec.start}
          onPressOut={dec.stop}
        />
        <View style={styles.bpmBlock}>
          <Text style={styles.bpmValue} accessibilityLabel={`${bpm} beats per minute`}>
            {bpm}
          </Text>
          <Text style={styles.bpmUnit}>BPM</Text>
        </View>
        <StepperButton
          label="+"
          disabled={bpm >= BPM_MAX}
          onPressIn={inc.start}
          onPressOut={inc.stop}
        />
      </View>

      {/* Meter selector */}
      <View style={styles.meterRow}>
        {SUPPORTED_METERS.map((m) => {
          const active = m === beatsPerMeasure;
          return (
            <Pressable
              key={m}
              onPress={() => onSetBeatsPerMeasure(m)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${m} beats per measure`}
              style={({ pressed }) => [
                styles.meterChip,
                active ? styles.meterChipActive : styles.meterChipIdle,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.meterText, active && styles.meterTextActive]}>{m}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Transport */}
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={isRunning ? 'Stop metronome' : 'Start metronome'}
        style={({ pressed }) => [
          styles.transport,
          isRunning ? styles.transportStop : styles.transportStart,
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.transportText, isRunning && styles.transportTextStop]}>
          {isRunning ? 'Stop' : 'Start'}
        </Text>
      </Pressable>
    </View>
  );
}

function StepperButton({
  label,
  disabled,
  onPressIn,
  onPressOut,
}: {
  label: string;
  disabled?: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Increase tempo' : 'Decrease tempo'}
      style={({ pressed }) => [
        styles.stepper,
        disabled && styles.stepperDisabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={styles.stepperLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * Press-and-hold repeater: fires `action` once on press, then repeats quickly
 * after a short hold so the user can sweep the BPM. Cleans up its timers on
 * release and unmount so nothing keeps firing off-screen.
 */
function useHoldRepeat(action: () => void) {
  const actionRef = useRef(action);
  useEffect(() => {
    actionRef.current = action;
  }, [action]);
  const holdTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (holdTimeout.current !== null) {
      clearTimeout(holdTimeout.current);
      holdTimeout.current = null;
    }
    if (repeat.current !== null) {
      clearInterval(repeat.current);
      repeat.current = null;
    }
  }, []);

  const start = useCallback(() => {
    stop();
    actionRef.current();
    holdTimeout.current = setTimeout(() => {
      repeat.current = setInterval(() => actionRef.current(), 60);
    }, 350);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { start, stop };
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.mutedBorder,
    borderRadius: Radius.lg,
    padding: 16,
    gap: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: Fonts.sansSemibold, fontSize: 13, color: Colors.textCream },

  tempoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bpmBlock: { alignItems: 'center', minWidth: 96 },
  bpmValue: { fontFamily: Fonts.serifBold, fontSize: 44, color: Colors.gold, lineHeight: 48 },
  bpmUnit: {
    fontFamily: Fonts.sansSemibold,
    fontSize: 10.5,
    letterSpacing: 1.6,
    color: Colors.textMuted,
    marginTop: -2,
  },
  stepper: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.goldBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDisabled: { opacity: 0.35 },
  stepperLabel: { fontFamily: Fonts.sans, fontSize: 28, color: Colors.gold, lineHeight: 30 },

  meterRow: { flexDirection: 'row', gap: 8 },
  meterChip: {
    flex: 1,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  meterChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  meterChipIdle: { backgroundColor: 'rgba(126,147,172,.08)', borderColor: Colors.mutedBorderAlt },
  meterText: { fontFamily: Fonts.sansSemibold, fontSize: 15, color: Colors.chipText },
  meterTextActive: { color: Colors.textOnCream },

  transport: {
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  transportStart: { backgroundColor: 'rgba(228,197,126,.14)', borderColor: Colors.goldBorderStrong },
  transportStop: { backgroundColor: 'rgba(126,147,172,.1)', borderColor: Colors.mutedBorderAlt },
  transportText: { fontFamily: Fonts.sansSemibold, fontSize: 15.5, color: Colors.gold },
  transportTextStop: { color: Colors.textCream },

  pressed: { opacity: 0.8 },
});
