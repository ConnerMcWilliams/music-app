import { useState } from 'react';

import { AuthField } from '@/components/auth';
import { OnboardingStep } from '@/components/onboarding';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';

/**
 * Step 1 — the player's name.
 *
 * Asked here rather than on the signup form so signup stays email + password.
 * Pre-filled for Google accounts, whose display name comes from the `name` claim.
 */
export default function NameStep() {
  const { preferences, loading, step, editing, saving, error, submit, goBack } =
    useOnboardingStep('/onboarding');
  // Null until the user types. Showing the stored name until then fills the
  // field in as soon as it loads, without clobbering anything already typed on
  // a slow connection.
  const [typed, setTyped] = useState<string | null>(null);

  const name = typed ?? preferences.displayName;
  const trimmed = name.trim();

  return (
    <OnboardingStep
      step={step}
      title="What should we call you?"
      subtitle="We'll use this to greet you when you sit down to practice."
      onContinue={() => submit({ displayName: trimmed })}
      canContinue={trimmed.length > 0 && !loading}
      saving={saving}
      onBack={goBack}
      editing={editing}
      error={error}>
      <AuthField
        label="Your name"
        value={name}
        onChangeText={setTyped}
        placeholder="Herbert"
        autoCapitalize="words"
        autoComplete="name"
        maxLength={120}
        returnKeyType="next"
        onSubmitEditing={() => trimmed && submit({ displayName: trimmed })}
      />
    </OnboardingStep>
  );
}
