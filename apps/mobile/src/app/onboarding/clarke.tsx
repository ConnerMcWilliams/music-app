import { useState } from 'react';

import { ChoiceCard, OnboardingStep } from '@/components/onboarding';
import { STUDY_SECTIONS } from '@/data';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';

/** Sentinel for "new to Clarke", which stores as a null start section. */
const NEW_TO_CLARKE = 0;

/**
 * Step 6 — where the player already is in the Clarke studies.
 *
 * Moves the Today card's starting point only. Earlier studies are not marked
 * passed and stay open from the Studies tab, so nothing is lost by aiming high.
 */
export default function ClarkeStep() {
  const { preferences, step, editing, saving, error, submit, goBack } =
    useOnboardingStep('/onboarding/clarke');
  // `undefined` is "untouched" — null can't be, because null is the answer
  // "new to Clarke". Until the user picks, the stored section shows through.
  const [chosen, setChosen] = useState<number | null | undefined>(undefined);

  const section = chosen === undefined ? preferences.clarkeStartSection : chosen;
  const selected = section ?? NEW_TO_CLARKE;

  return (
    <OnboardingStep
      step={step}
      title="Where are you with the Clarke studies?"
      subtitle="We'll start you here. Everything before it stays open in the Studies tab."
      onContinue={() => submit({ clarkeStartSection: section })}
      saving={saving}
      onBack={goBack}
      editing={editing}
      error={error}>
      <ChoiceCard
        label="New to Clarke"
        hint="Start at the First Study."
        selected={selected === NEW_TO_CLARKE}
        onPress={() => setChosen(null)}
      />
      {STUDY_SECTIONS.map((studySection) => (
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
