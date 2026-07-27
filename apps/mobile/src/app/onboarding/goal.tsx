import { useState } from 'react';

import { ChoiceCard, OnboardingStep } from '@/components/onboarding';
// Imported from the module, not the `@/data` barrel, so a step screen never
// drags the bundled MusicXML catalog in behind it.
import { PRIMARY_GOALS } from '@/data/onboardingChoices';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import type { PrimaryGoal } from '@/services/preferences';

/** Step 4 — what they're working toward, which drives what we recommend. */
export default function GoalStep() {
  const { preferences, step, editing, saving, error, submit, goBack } =
    useOnboardingStep('/onboarding/goal');
  // Null until the user picks; the stored answer shows through until then.
  const [chosen, setChosen] = useState<PrimaryGoal | null>(null);

  const goal = chosen ?? preferences.primaryGoal;

  return (
    <OnboardingStep
      step={step}
      title="What are you working toward?"
      subtitle="Pick the one that matters most right now. You can change it later."
      onContinue={() => submit({ primaryGoal: goal })}
      canContinue={goal !== ''}
      saving={saving}
      onBack={goBack}
      editing={editing}
      error={error}>
      {PRIMARY_GOALS.map((option) => (
        <ChoiceCard
          key={option.value}
          label={option.label}
          hint={option.hint}
          selected={goal === option.value}
          onPress={() => setChosen(option.value)}
        />
      ))}
    </OnboardingStep>
  );
}
