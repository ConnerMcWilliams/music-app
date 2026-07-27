import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';

import { useOnboardingPreferences } from '@/app/onboarding/_layout';
import { useAuth } from '@/context/AuthContext';
import { nextRoute, stepNumber, type OnboardingRoute } from '@/lib/onboarding/flow';
import type { Preferences, PreferencesPatch } from '@/services/preferences';

export interface UseOnboardingStep {
  /** Current answers; empty until `loading` clears. */
  preferences: Preferences;
  loading: boolean;
  /** 1-based position, for the progress dots. */
  step: number;
  /** True when the user came from the account screen to change one answer. */
  editing: boolean;
  saving: boolean;
  /** Load or save failure, surfaced by the step's error banner. */
  error: string | null;
  /** Save this step's answer, then advance (or return to the account screen). */
  submit: (patch: PreferencesPatch) => void;
  /** Back control; undefined on the first step of a fresh run. */
  goBack: (() => void) | undefined;
}

/**
 * Everything a single onboarding step needs beyond its own question: the current
 * answers, save-and-advance, and the Back affordance.
 *
 * Each step PATCHes on Continue rather than the flow submitting once at the end,
 * so quitting halfway keeps what was already answered. The last step also sends
 * `complete: true`, refreshes the session so the route guard stops pulling the
 * user back in, and hands off to the tabs.
 */
export function useOnboardingStep(route: OnboardingRoute): UseOnboardingStep {
  const { preferences, loading, error: loadError, save } = useOnboardingPreferences();
  const { refreshUser } = useAuth();
  const params = useLocalSearchParams<{ edit?: string }>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const editing = params.edit === '1';
  const step = stepNumber(route);
  const next = nextRoute(route);

  const submit = useCallback(
    (patch: PreferencesPatch) => {
      if (saving) return;
      setSaving(true);
      setSaveError(null);

      // Editing one answer from the account screen never advances the flow, and
      // never re-stamps completion.
      const isFinalStep = !editing && next === null;

      save(isFinalStep ? { ...patch, complete: true } : patch)
        .then(async () => {
          if (editing) {
            // The display name is carried on the session too (account header,
            // avatar initials, Profile tab), so a changed one has to be pulled
            // back in or those keep showing the old value. Best-effort: the
            // answer is already saved, so a failed refresh must not read as a
            // failed save.
            if (patch.displayName !== undefined) {
              await refreshUser().catch(() => {});
            }
            router.back();
            return;
          }
          if (next) {
            router.push(next);
            return;
          }
          // Refresh before navigating: the guard reads `onboardingCompleted` off
          // the session, so flipping it first is what stops it bouncing the user
          // straight back into the flow.
          await refreshUser();
          router.replace('/');
        })
        .catch((e: unknown) => {
          setSaveError(e instanceof Error ? e.message : "We couldn't save that. Please try again.");
        })
        .finally(() => setSaving(false));
    },
    [saving, editing, next, save, refreshUser],
  );

  // No Back on the first step of a fresh run — there is nothing behind it but
  // the signup screen, which the user has already left.
  const goBack = editing || step > 1 ? () => router.back() : undefined;

  return {
    preferences,
    loading,
    step,
    editing,
    saving,
    // A failed load leaves the step showing blank answers, so it has to say so;
    // whatever just went wrong with a save is the more urgent message.
    error: saveError ?? loadError,
    submit,
    goBack,
  };
}
