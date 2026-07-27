import { useMemo, useState } from 'react';

import { ChoiceCard, OnboardingStep } from '@/components/onboarding';
import { STUDY_SECTIONS } from '@/data';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';

/** Sentinel for "new to Clarke", which stores as a null start section. */
const NEW_TO_CLARKE = 0;

/**
 * Where the player already is in the Clarke studies.
 *
 * Moves the Today card's starting point only. Earlier studies are not marked
 * passed and stay open from the Studies tab, so nothing is lost by aiming high.
 *
 * As on the instrument step, the variant chooses which studies to offer; their
 * names come from the bundled catalog.
 */
export default function ClarkeStep() {
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
  } = useOnboardingStep('clarke');
  // `undefined` is "untouched" — null can't be, because null is the answer
  // "new to Clarke". Until the user picks, the stored section shows through.
  const [chosen, setChosen] = useState<number | null | undefined>(undefined);

  const offered = options('sections');
  const sections = useMemo(() => {
    const allowed = new Set(offered.map((option) => Number(option.value)));
    // An empty group means the variant said nothing, not "offer nothing".
    return allowed.size > 0
      ? STUDY_SECTIONS.filter((section) => allowed.has(section.section))
      : STUDY_SECTIONS;
  }, [offered]);

  const section = chosen === undefined ? preferences.clarkeStartSection : chosen;
  const selected = section ?? NEW_TO_CLARKE;

  return (
    <OnboardingStep
      step={step}
      totalSteps={totalSteps}
      title={copy('title')}
      subtitle={copy('subtitle')}
      ctaLabel={copy('cta')}
      onContinue={() => submit({ clarkeStartSection: section })}
      // "New to Clarke" is a valid answer, so there is no empty state to gate
      // on: without this, saving before the load lands would PATCH that null
      // over a section the user had already chosen.
      canContinue={!loading}
      saving={saving}
      onBack={goBack}
      editing={editing}
      error={error}>
      <ChoiceCard
        label={copy('new_to_clarke_label', 'New to Clarke')}
        hint={copy('new_to_clarke_hint')}
        selected={selected === NEW_TO_CLARKE}
        onPress={() => setChosen(null)}
      />
      {sections.map((studySection) => (
        <ChoiceCard
          key={studySection.section}
          label={studySection.label}
          hint={studySection.focus}
          selected={selected === studySection.section}
          onPress={() => setChosen(studySection.section)}
        />
      ))}
    </OnboardingStep>
  );
}
