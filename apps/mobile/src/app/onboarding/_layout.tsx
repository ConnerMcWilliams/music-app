import { Stack } from 'expo-router';
import { createContext, useContext } from 'react';

import { usePreferences, type UsePreferences } from '@/hooks/usePreferences';
import { Colors } from '@/theme';

const PreferencesContext = createContext<UsePreferences | null>(null);

/**
 * The onboarding answers, shared by every step.
 *
 * Held at the layout so the flow fetches once instead of per screen, and so each
 * step's PATCH response updates what the next step renders. Steps reached from
 * the account screen (`?edit=1`) sit under this layout too, so they get the same
 * loaded values without a special case.
 */
export function useOnboardingPreferences(): UsePreferences {
  const value = useContext(PreferencesContext);
  if (!value) {
    throw new Error('useOnboardingPreferences must be used inside the onboarding layout.');
  }
  return value;
}

export default function OnboardingLayout() {
  const preferences = usePreferences();

  return (
    <PreferencesContext.Provider value={preferences}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
          // The steps carry their own Back control and save as they go; a swipe
          // out of the flow would strand a user who still owes onboarding.
          gestureEnabled: false,
        }}
      />
    </PreferencesContext.Provider>
  );
}
