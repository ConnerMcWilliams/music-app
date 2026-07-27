import { useState } from 'react';

import { AuthField } from '@/components/auth';
import { OnboardingStep } from '@/components/onboarding';
import { useOnboardingStep } from '@/hooks/useOnboardingStep';

/**
 * The player's name.
 *
 * Asked here rather than on the signup form so signup stays email + password.
 * Pre-filled for Google accounts, whose display name comes from the `name` claim.
 */
export default function NameStep() {
  const { preferences, loading, step, totalSteps, editing, saving, error, copy, submit, goBack } =
    useOnboardingStep('name');
  // Null until the user types. Showing the stored name until then fills the
  // field in as soon as it loads, without clobbering anything already typed on
  // a slow connection.
  const [typed, setTyped] = useState<string | null>(null);

  const name = typed ?? preferences.displayName;
  const trimmed = name.trim();

  return (
    <OnboardingStep
      step={step}
      totalSteps={totalSteps}
      title={copy('title')}
      subtitle={copy('subtitle')}
      ctaLabel={copy('cta')}
      onContinue={() => submit({ displayName: trimmed })}
      canContinue={trimmed.length > 0 && !loading}
      saving={saving}
      onBack={goBack}
      editing={editing}
      error={error}>
      <AuthField
        label={copy('field_label', 'Your name')}
        value={name}
        onChangeText={setTyped}
        placeholder={copy('placeholder')}
        autoCapitalize="words"
        autoComplete="name"
        maxLength={120}
        returnKeyType="next"
        onSubmitEditing={() => trimmed && submit({ displayName: trimmed })}
      />
    </OnboardingStep>
  );
}
