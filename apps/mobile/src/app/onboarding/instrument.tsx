import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChoiceCard, OnboardingStep } from '@/components/onboarding';
import { INSTRUMENTS, INSTRUMENT_FAMILY_LABELS, type InstrumentFamily } from '@/data';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import { Colors, Fonts } from '@/theme';

const FAMILY_ORDER: InstrumentFamily[] = ['trumpet', 'horn', 'low-brass'];

/**
 * The instrument.
 *
 * The one answer the app cannot work around: it decides which transposition of
 * the Clarke studies the player is shown and graded against.
 *
 * The variant chooses *which* instruments to offer; their names come from the
 * bundled catalog, which the backend pins with a mirror test. A variant that
 * could rename them would silently fork the two.
 */
export default function InstrumentStep() {
  const {
    preferences,
    step,
    totalSteps,
    editing,
    saving,
    error,
    copy,
    options,
    submit,
    goBack,
  } = useOnboardingStep('instrument');
  // Null until the user picks, so a resumed run shows the stored answer without
  // an effect to seed it.
  const [chosen, setChosen] = useState<string | null>(null);

  const offered = options('instruments');
  const instruments = useMemo(() => {
    const allowed = new Set(offered.map((option) => String(option.value)));
    // An empty group means the variant said nothing, not "offer nothing".
    return allowed.size > 0
      ? INSTRUMENTS.filter((instrument) => allowed.has(instrument.slug))
      : INSTRUMENTS;
  }, [offered]);

  const slug = chosen ?? preferences.instrument;

  return (
    <OnboardingStep
      step={step}
      totalSteps={totalSteps}
      title={copy('title')}
      subtitle={copy('subtitle')}
      ctaLabel={copy('cta')}
      onContinue={() => submit({ instrument: slug })}
      canContinue={slug !== ''}
      saving={saving}
      onBack={goBack}
      editing={editing}
      error={error}>
      {FAMILY_ORDER.map((family) => {
        const inFamily = instruments.filter((instrument) => instrument.family === family);
        if (inFamily.length === 0) return null;
        return (
          <View key={family} style={styles.group}>
            <Text style={styles.groupLabel}>{INSTRUMENT_FAMILY_LABELS[family]}</Text>
            {inFamily.map((instrument) => (
              <ChoiceCard
                key={instrument.slug}
                label={instrument.label}
                selected={slug === instrument.slug}
                onPress={() => setChosen(instrument.slug)}
              />
            ))}
          </View>
        );
      })}
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
