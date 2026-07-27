import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
  EMPTY_PREFERENCES,
  fetchPreferences,
  savePreferences,
  type Preferences,
  type PreferencesPatch,
} from '@/services/preferences';

export interface UsePreferences {
  preferences: Preferences;
  /** True until the first fetch settles — steps render their answer only after. */
  loading: boolean;
  /** Load failure. Saving errors are thrown by `save` for the step to surface. */
  error: string | null;
  /** PATCH one step's answer; resolves once the server has it. */
  save: (patch: PreferencesPatch) => Promise<Preferences>;
}

/**
 * The signed-in user's onboarding answers, loaded once and saved a step at a time.
 *
 * Loading the current values up front is what makes the flow resumable: a user
 * who quits partway through (or comes back to edit one answer from the account
 * screen) sees what they already chose rather than a blank form.
 *
 * Kept deliberately close to `useProfile` in shape — plain `useState`, no query
 * library, matching the rest of the app.
 */
export function usePreferences(): UsePreferences {
  const { user } = useAuth();
  // Null until the first fetch settles. `loading` is derived from it rather than
  // tracked alongside it, so the effect never has to setState synchronously.
  const [loaded, setLoaded] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchPreferences()
      .then((next) => {
        if (!active) return;
        setLoaded(next);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        // Fall back to blank answers so the flow still renders and can still
        // save; the step surfaces the message above its question.
        setLoaded(EMPTY_PREFERENCES);
        setError("We couldn't load your preferences.");
      });
    return () => {
      active = false;
    };
  }, [user]);

  const save = useCallback(async (patch: PreferencesPatch) => {
    const next = await savePreferences(patch);
    // Trust the server's echo rather than the local guess, so a value the
    // backend normalized (or a completion stamp) is what the flow carries on
    // with. It supersedes a failed load, message included.
    setLoaded(next);
    setError(null);
    return next;
  }, []);

  // Signed out, report blank answers regardless of anything previously fetched.
  return {
    preferences: user && loaded ? loaded : EMPTY_PREFERENCES,
    loading: user !== null && loaded === null,
    error,
    save,
  };
}
