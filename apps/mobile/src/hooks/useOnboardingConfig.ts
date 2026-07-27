import { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { DEFAULT_ONBOARDING_CONFIG } from '@/data/onboardingConfig';
import type { OnboardingStepKey } from '@/lib/onboarding/flow';
import {
  fetchOnboardingConfig,
  type ConfiguredStep,
  type OnboardingConfig,
} from '@/services/onboardingConfig';

export interface UseOnboardingConfig {
  config: OnboardingConfig;
  /** True until the first fetch settles — a step must not advance before then. */
  loading: boolean;
  /** The step's configured content, or the bundled one if this flow omits it. */
  stepContent: (stepKey: OnboardingStepKey) => ConfiguredStep;
}

const BUNDLED_BY_KEY = new Map(
  DEFAULT_ONBOARDING_CONFIG.steps.map((step) => [step.stepKey, step]),
);

/**
 * The onboarding flow to render: which steps, in what order, with what copy.
 *
 * Deliberately the same shape as `usePreferences` — plain `useState`, an
 * `active` cancellation flag, no query library — and held once at the onboarding
 * layout so every step reads the same answer. Fetching once per flow is also
 * what stops a dashboard edit landing mid-run from reordering the steps under
 * someone's feet.
 *
 * Any failure falls back to the bundled flow rather than surfacing an error:
 * onboarding is a hard gate, so a config the app can't fetch must cost the
 * player nothing.
 */
export function useOnboardingConfig(): UseOnboardingConfig {
  const { user } = useAuth();
  // Null until the first fetch settles; `loading` is derived from it, matching
  // usePreferences so the two can share one gate in the step screens.
  const [loaded, setLoaded] = useState<OnboardingConfig | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchOnboardingConfig()
      .then((next) => {
        if (!active) return;
        // An empty flow would strand the user with nothing to answer. The
        // server guards against this too; this is the second lock.
        setLoaded(next.steps.length > 0 ? next : DEFAULT_ONBOARDING_CONFIG);
      })
      .catch(() => {
        if (active) setLoaded(DEFAULT_ONBOARDING_CONFIG);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const config = loaded ?? DEFAULT_ONBOARDING_CONFIG;

  return {
    config,
    loading: user !== null && loaded === null,
    stepContent: (stepKey) =>
      config.steps.find((step) => step.stepKey === stepKey) ??
      // Reachable from the account screen: a player can edit an answer to a
      // step the current flow no longer includes. Showing the bundled copy
      // beats refusing to let them change something they already chose.
      BUNDLED_BY_KEY.get(stepKey) ?? { stepKey, copy: {}, options: {} },
  };
}
