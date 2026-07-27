import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChoiceCard, OnboardingStep } from '@/components/onboarding';
import { INSTRUMENTS, INSTRUMENT_FAMILY_LABELS, type InstrumentFamily } from '@/data';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { Colors, Fonts } from '@/theme';

const FAMILY_ORDER: InstrumentFamily[] = ['trumpet', 'horn', 'low-brass'];

/**
 * Step 2 — the instrument.
 *
 * The one answer the app cannot work around: it decides which transposition of
 * the Clarke studies the player is shown and graded against.
 */
export default function InstrumentStep() {
  const { preferences, step, editing, saving, error, submit, goBack } =
    useOnboardingStep('/onboarding/instrument');
  // Null until the user picks, so a resumed run shows the stored answer without
  // an effect to seed it.
  const [chosen, setChosen] = useState<string | null>(null);

  const slug = chosen ?? preferences.instrument;

  return (
    <OnboardingStep
      step={step}
      title="What do you play?"
      subtitle="Clarke wrote these for cornet. We'll transpose them for your instrument."
      onContinue={() => submit({ instrument: slug })}
      canContinue={slug !== ''}
      saving={saving}
      onBack={goBack}
      editing={editing}
      error={error}>
      {FAMILY_ORDER.map((family) => (
        <View key={family} style={styles.group}>
          <Text style={styles.groupLabel}>{INSTRUMENT_FAMILY_LABELS[family]}</Text>
          {INSTRUMENTS.filter((i) => i.family === family).map((instrument) => (
            <ChoiceCard
              key={instrument.slug}
              label={instrument.label}
              selected={slug === instrument.slug}
              onPress={() => setChosen(instrument.slug)}
            />
          ))}
        </View>
      ))}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  group: { gap: 9, marginBottom: 8 },
  groupLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 11.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: Colors.textMutedDim,
    marginTop: 6,
  },
});
