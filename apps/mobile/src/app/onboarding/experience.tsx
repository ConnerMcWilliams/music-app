import { useState } from 'react';

import { ChoiceCard, OnboardingStep } from '@/components/onboarding';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import type { ExperienceLevel } from '@/services/preferences';

/** Mirrors `UserPreferences.ExperienceLevel` in the backend. */
const OPTIONS: { value: ExperienceLevel; label: string; hint: string }[] = [
  { value: 'under_1', label: 'Less than a year', hint: 'Still building the basics.' },
  { value: 'y1_3', label: '1–3 years', hint: 'Comfortable with the fundamentals.' },
  { value: 'y3_7', label: '3–7 years', hint: 'Playing regularly, working on refinement.' },
  { value: 'over_7', label: '7+ years', hint: 'Experienced — here for the discipline.' },
];

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
      {OPTIONS.map((option) => (
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
