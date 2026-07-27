import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useOnboardingFlowConfig, useOnboardingPreferences } from '@/app/onboarding/_layout';
import { useAuth } from '@/context/AuthContext';
import {
  nextStepRoute,
  stepPosition,
  stepTotal,
  type OnboardingStepKey,
} from '@/lib/onboarding/flow';
import { recordStepView, type ConfiguredOption } from '@/services/onboardingConfig';
import type { Preferences, PreferencesPatch } from '@/services/preferences';

export interface UseOnboardingStep {
  /** Current answers; empty until `loading` clears. */
  preferences: Preferences;
  loading: boolean;
  /** 1-based position, for the progress dots. */
  step: number;
  /** How many steps this flow has, for the progress dots. */
  totalSteps: number;
  /** True when the user came from the account screen to change one answer. */
  editing: boolean;
  saving: boolean;
  /** Load or save failure, surfaced by the step's error banner. */
  error: string | null;
  /** This step's configured copy, keyed by the backend catalog's slot names. */
  copy: (slot: string, fallback?: string) => string;
  /** This step's configured answers for one option group. */
  options: (group: string) => ConfiguredOption[];
  /** Save this step's answer, then advance (or return to the account screen). */
  submit: (patch: PreferencesPatch) => void;
  /** Back control; undefined on the first step of a fresh run. */
  goBack: (() => void) | undefined;
}

/**
 * Everything a single onboarding step needs beyond its own question: the current
 * answers, its configured copy and options, save-and-advance, and the Back
 * affordance.
 *
 * Each step PATCHes on Continue rather than the flow submitting once at the end,
 * so quitting halfway keeps what was already answered. The last step also sends
 * `complete: true`, refreshes the session so the route guard stops pulling the
 * user back in, and hands off to the tabs — "last" meaning last in the *served*
 * flow, which the dashboard can reorder or shorten.
 */
export function useOnboardingStep(stepKey: OnboardingStepKey): UseOnboardingStep {
  const {
    preferences,
    loading: loadingPreferences,
    error: loadError,
    save,
  } = useOnboardingPreferences();
  const { config, loading: loadingConfig, stepContent } = useOnboardingFlowConfig();
  const { refreshUser } = useAuth();
  const params = useLocalSearchParams<{ edit?: string }>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const editing = params.edit === '1';
  const content = stepContent(stepKey);
  const next = nextStepRoute(stepKey, config.steps);
  // Both fetches gate Continue: advancing before the config lands could send
  // the user to the wrong next step, and saving before the answers land would
  // PATCH defaults over what they already chose.
  const loading = loadingPreferences || loadingConfig;

  useEffect(() => {
    // The funnel beacon behind the dashboard's drop-off table. Not fired for
    // account-screen edits — those aren't someone moving through the flow, and
    // counting them would quietly inflate every step's reach.
    if (editing || loadingConfig) return;
    void recordStepView(stepKey);
  }, [editing, loadingConfig, stepKey]);

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

  const step = stepPosition(stepKey, config.steps);

  // No Back on the first step of a fresh run — there is nothing behind it but
  // the signup screen, which the user has already left.
  const goBack = editing || step > 1 ? () => router.back() : undefined;

  return {
    preferences,
    loading,
    step,
    totalSteps: stepTotal(config.steps),
    editing,
    saving,
    // A failed load leaves the step showing blank answers, so it has to say so;
    // whatever just went wrong with a save is the more urgent message.
    error: saveError ?? loadError,
    copy: (slot, fallback = '') => content.copy[slot] || fallback,
    options: (group) => content.options[group] ?? [],
    submit,
    goBack,
  };
}
