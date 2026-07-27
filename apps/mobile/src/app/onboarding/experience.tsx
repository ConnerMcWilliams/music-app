import { useState } from 'react';

import { ChoiceCard, OnboardingStep } from '@/components/onboarding';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import type { ExperienceLevel } from '@/services/preferences';

/** How long they've played, which sets the tone of the feedback. */
export default function ExperienceStep() {
  const { preferences, step, totalSteps, editing, saving, error, copy, options, submit, goBack } =
    useOnboardingStep('experience');
  // Null until the user picks; the stored answer shows through until then.
  const [chosen, setChosen] = useState<ExperienceLevel | null>(null);

  const level = chosen ?? preferences.experienceLevel;

  return (
    <OnboardingStep
      step={step}
      totalSteps={totalSteps}
      title={copy('title')}
      subtitle={copy('subtitle')}
      ctaLabel={copy('cta')}
      onContinue={() => submit({ experienceLevel: level })}
      canContinue={level !== ''}
      saving={saving}
      onBack={goBack}
      editing={editing}
      error={error}>
      {options('levels').map((option) => (
        <ChoiceCard
          key={String(option.value)}
          label={option.label ?? String(option.value)}
          hint={option.hint}
          selected={level === option.value}
          onPress={() => setChosen(option.value as ExperienceLevel)}
        />
      ))}
    </OnboardingStep>
  );
}
