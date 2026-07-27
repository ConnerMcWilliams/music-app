import { useState } from 'react';

import { ChoiceCard, OnboardingStep } from '@/components/onboarding';
// Imported from the module, not the `@/data` barrel, so a step screen never
// drags the bundled MusicXML catalog in behind it.
import { EXPERIENCE_LEVELS } from '@/data/onboardingChoices';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import type { ExperienceLevel } from '@/services/preferences';

/** Step 3 — how long they've played, which sets the tone of the feedback. */
export default function ExperienceStep() {
  const { preferences, step, editing, saving, error, submit, goBack } =
    useOnboardingStep('/onboarding/experience');
  // Null until the user picks; the stored answer shows through until then.
  const [chosen, setChosen] = useState<ExperienceLevel | null>(null);

  const level = chosen ?? preferences.experienceLevel;

  return (
    <OnboardingStep
      step={step}
      title="How long have you been playing?"
      subtitle="This shapes how we pitch feedback — not how strictly we grade."
      onContinue={() => submit({ experienceLevel: level })}
      canContinue={level !== ''}
      saving={saving}
      onBack={goBack}
      editing={editing}
      error={error}>
      {EXPERIENCE_LEVELS.map((option) => (
        <ChoiceCard
          key={option.value}
          label={option.label}
          hint={option.hint}
          selected={level === option.value}
          onPress={() => setChosen(option.value)}
        />
      ))}
    </OnboardingStep>
  );
}
