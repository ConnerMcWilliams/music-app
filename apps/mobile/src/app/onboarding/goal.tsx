import { useState } from 'react';

import { ChoiceCard, OnboardingStep } from '@/components/onboarding';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';
import type { PrimaryGoal } from '@/services/preferences';

/** Mirrors `UserPreferences.PrimaryGoal` in the backend. */
const OPTIONS: { value: PrimaryGoal; label: string; hint: string }[] = [
  { value: 'tone', label: 'Better tone and control', hint: 'Steady, even sound at every dynamic.' },
  { value: 'range', label: 'Extend my range', hint: 'Reach higher without forcing.' },
  { value: 'endurance', label: 'Build endurance', hint: 'Last a full rehearsal or set.' },
  { value: 'technique', label: 'Faster, cleaner technique', hint: 'Fingers and tongue together.' },
  { value: 'consistency', label: 'Practice consistently', hint: 'Show up every day and keep a streak.' },
  { value: 'audition', label: 'Prepare for an audition', hint: 'Get sharp for a chair test or seat.' },
];

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
      {OPTIONS.map((option) => (
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
