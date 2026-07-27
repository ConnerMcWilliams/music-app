import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { Colors, Fonts, Radius } from '@/theme';

const DAY_OPTIONS = [3, 4, 5, 6, 7];

/**
 * Preset reminder times, as `HH:MM:SS` local wall-clock.
 *
 * A fixed set rather than a wheel picker: it needs no native date-picker
 * dependency, and "some morning-ish time" is the real answer people give. The
 * time is stored now; scheduling the notification is separate, later work.
 */
const TIME_OPTIONS = [
  { value: '07:00:00', label: '7:00 am' },
  { value: '08:00:00', label: '8:00 am' },
  { value: '12:00:00', label: 'Noon' },
  { value: '16:00:00', label: '4:00 pm' },
  { value: '18:00:00', label: '6:00 pm' },
  { value: '20:00:00', label: '8:00 pm' },
];

/** Step 5 — the practice cadence the streak aims at, plus an optional reminder. */
export default function PracticeStep() {
  const { preferences, loading, step, editing, saving, error, submit, goBack } =
    useOnboardingStep('/onboarding/practice');
  // Both start "untouched" so the stored answers show through until the user
  // taps. `undefined` rather than null for the time, because null is the answer
  // "no reminder".
  const [chosenDays, setChosenDays] = useState<number | null>(null);
  const [chosenTime, setChosenTime] = useState<string | null | undefined>(undefined);

  const days = chosenDays ?? preferences.practiceDaysGoal;
  const time =
    chosenTime === undefined
      ? (preferences.reminderEnabled ? preferences.reminderTime : null)
      : chosenTime;

  return (
    <OnboardingStep
      step={step}
      title="How often do you want to practice?"
      subtitle="Your streak aims at this. Be honest rather than ambitious — it's easier to raise later."
      onContinue={() =>
        submit({
          practiceDaysGoal: days,
          reminderTime: time,
          reminderEnabled: time !== null,
        })
      }
      // Every answer here has a default, so nothing else blocks Continue —
      // without the load gate, saving early would PATCH those defaults over
      // whatever the user had already chosen.
      canContinue={!loading}
      saving={saving}
      onBack={goBack}
      editing={editing}
      error={error}>
      <Text style={styles.groupLabel}>Days per week</Text>
      <View style={styles.chipRow}>
        {DAY_OPTIONS.map((value) => (
          <Chip
            key={value}
            label={String(value)}
            accessibilityLabel={`${value} days per week`}
            selected={days === value}
            onPress={() => setChosenDays(value)}
          />
        ))}
      </View>

      <Text style={styles.groupLabel}>Daily reminder</Text>
      <View style={styles.chipRow}>
        <Chip label="Not now" selected={time === null} onPress={() => setChosenTime(null)} />
        {TIME_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={time === option.value}
            onPress={() => setChosenTime(option.value)}
          />
        ))}
      </View>
      <Text style={styles.note}>
        We&apos;ll save your preference now — you&apos;ll be asked to allow notifications before
        any reminder is sent.
      </Text>
    </OnboardingStep>
  );
}

function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipActive : styles.chipIdle,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groupLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 11.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: Colors.textMutedDim,
    marginTop: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 48,
    alignItems: 'center',
  },
  chipIdle: { borderColor: Colors.mutedBorderAlt, backgroundColor: Colors.surface },
  chipActive: { borderColor: Colors.goldBorderStrong, backgroundColor: Colors.surfaceAlt },
  pressed: { opacity: 0.75 },
  chipText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.chipText },
  chipTextActive: { fontFamily: Fonts.sansSemibold, color: Colors.gold },
  note: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.textMutedDim,
    marginTop: 4,
  },
});
