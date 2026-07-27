import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { Colors, Fonts, Radius } from '@/theme';

/**
 * The practice cadence the streak aims at, plus an optional reminder.
 *
 * Two questions on one screen, so the variant carries two option groups: which
 * day counts to offer, and which reminder times (a preset set rather than a
 * wheel picker — it needs no native date-picker dependency, and "some
 * morning-ish time" is the real answer people give). The time is stored now;
 * scheduling the notification is separate, later work.
 */
export default function PracticeStep() {
  const {
    preferences,
    loading,
    step,
    totalSteps,
    editing,
    saving,
    error,
    copy,
    options,
    submit,
    goBack,
  } = useOnboardingStep('practice');
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

  const dayOptions = options('days');
  const timeOptions = options('times');

  return (
    <OnboardingStep
      step={step}
      totalSteps={totalSteps}
      title={copy('title')}
      subtitle={copy('subtitle')}
      ctaLabel={copy('cta')}
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
      <Text style={styles.groupLabel}>{copy('days_label', 'Days per week')}</Text>
      <View style={styles.chipRow}>
        {dayOptions.map((option) => {
          const value = Number(option.value);
          return (
            <Chip
              key={value}
              label={String(value)}
              accessibilityLabel={`${value} days per week`}
              selected={days === value}
              onPress={() => setChosenDays(value)}
            />
          );
        })}
      </View>

      <Text style={styles.groupLabel}>{copy('reminder_label', 'Daily reminder')}</Text>
      <View style={styles.chipRow}>
        <Chip
          label={copy('no_reminder_label', 'Not now')}
          selected={time === null}
          onPress={() => setChosenTime(null)}
        />
        {timeOptions.map((option) => (
          <Chip
            key={String(option.value)}
            label={option.label ?? String(option.value)}
            selected={time === option.value}
            onPress={() => setChosenTime(String(option.value))}
          />
        ))}
      </View>
      <Text style={styles.note}>{copy('footnote')}</Text>
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
