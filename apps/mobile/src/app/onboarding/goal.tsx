import { useState } from 'react';

import { ChoiceCard, OnboardingStep } from '@/components/onboarding';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import type { PrimaryGoal } from '@/services/preferences';

/** What they're working toward, which drives what we recommend. */
export default function GoalStep() {
  const { preferences, step, totalSteps, editing, saving, error, copy, options, submit, goBack } =
    useOnboardingStep('goal');
  // Null until the user picks; the stored answer shows through until then.
  const [chosen, setChosen] = useState<PrimaryGoal | null>(null);

  const goal = chosen ?? preferences.primaryGoal;

  return (
    <OnboardingStep
      step={step}
      totalSteps={totalSteps}
      title={copy('title')}
      subtitle={copy('subtitle')}
      ctaLabel={copy('cta')}
      onContinue={() => submit({ primaryGoal: goal })}
      canContinue={goal !== ''}
      saving={saving}
      onBack={goBack}
      editing={editing}
      error={error}>
      {options('goals').map((option) => (
        <ChoiceCard
          key={String(option.value)}
          label={option.label ?? String(option.value)}
          hint={option.hint}
          selected={goal === option.value}
          onPress={() => setChosen(option.value as PrimaryGoal)}
        />
      ))}
    </OnboardingStep>
  );
}
