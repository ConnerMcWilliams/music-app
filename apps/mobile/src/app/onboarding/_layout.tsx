import { Stack } from 'expo-router';
import { createContext, useContext } from 'react';

import { useOnboardingConfig, type UseOnboardingConfig } from '@/hooks/useOnboardingConfig';
import { usePreferences, type UsePreferences } from '@/hooks/usePreferences';
import { Colors } from '@/theme';

const PreferencesContext = createContext<UsePreferences | null>(null);
const ConfigContext = createContext<UseOnboardingConfig | null>(null);

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

/**
 * Which steps this account sees, in what order, with what copy.
 *
 * Held here for the same reason as the answers, plus one of its own: fetching
 * the flow once per run is what stops an edit made in the dashboard partway
 * through someone's onboarding from reordering the steps beneath them.
 */
export function useOnboardingFlowConfig(): UseOnboardingConfig {
  const value = useContext(ConfigContext);
  if (!value) {
    throw new Error('useOnboardingFlowConfig must be used inside the onboarding layout.');
  }
  return value;
}

export default function OnboardingLayout() {
  const preferences = usePreferences();
  const config = useOnboardingConfig();

  return (
    <PreferencesContext.Provider value={preferences}>
      <ConfigContext.Provider value={config}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.bg },
            // The steps carry their own Back control and save as they go; a swipe
            // out of the flow would strand a user who still owes onboarding.
            gestureEnabled: false,
          }}
        />
      </ConfigContext.Provider>
    </PreferencesContext.Provider>
  );
}
