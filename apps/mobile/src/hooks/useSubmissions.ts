import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { fetchSubmissions } from '@/services/submissions';
import type { Submission } from '@/types';

/**
 * The signed-in user's recent submissions for the Profile "Recent recordings"
 * list. Returns the `{ data, loading, error, refetch }` shape the screens' state
 * views already expect (see `useMockQuery`), gated on the authenticated user.
 *
 * First page only — the endpoint is paginated, so a future "See all" screen can
 * page through the full history.
 */
export interface SubmissionsState {
  data: Submission[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useSubmissions(): SubmissionsState {
  const { user } = useAuth();
  const [data, setData] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Reset to the loading state in the event handler (not the effect) and bump
  // `attempt` to re-run the fetch below — mirrors `useMockQuery`.
  const refetch = useCallback(() => {
    setData([]);
    setError(null);
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchSubmissions(1)
      .then((page) => {
        if (!active) return;
        setData(page.items);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error('Failed to load submissions.'));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, attempt]);

  // Signed out: report empty, settled state regardless of any prior fetch.
  if (!user) {
    return { data: [], loading: false, error: null, refetch };
  }
  return { data, loading, error, refetch };
}

/** {@link SubmissionsState} plus whether another page follows this one. */
export interface SubmissionsPageState extends SubmissionsState {
  hasNext: boolean;
}

/**
 * A single, explicit page of the user's submission history — for the "All
 * recordings" screen's Previous/Next pager. Same auth-gating and settled shape as
 * {@link useSubmissions}, but fetches the given `page` (re-running when it changes)
 * and reports `hasNext` so the pager can disable "Next" on the last page.
 */
export function useSubmissionsPage(page: number): SubmissionsPageState {
  const { user } = useAuth();
  // Store the fetch outcome tagged with the (page, attempt) it belongs to. We
  // then *derive* loading/error/data by comparing that tag to what's currently
  // requested — so a page change or refetch resets to the loading state without
  // calling setState synchronously in the effect (mirrors `useSubmissions`,
  // which resets state outside the effect body).
  const [outcome, setOutcome] = useState<{
    page: number;
    attempt: number;
    items: Submission[];
    hasNext: boolean;
    error: Error | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const refetch = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchSubmissions(page)
      .then((result) => {
        if (!active) return;
        setOutcome({ page, attempt, items: result.items, hasNext: result.nextPage !== null, error: null });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const error = err instanceof Error ? err : new Error('Failed to load submissions.');
        setOutcome({ page, attempt, items: [], hasNext: false, error });
      });
    return () => {
      active = false;
    };
  }, [user, page, attempt]);

  if (!user) {
    return { data: [], loading: false, error: null, hasNext: false, refetch };
  }
  const settled = outcome !== null && outcome.page === page && outcome.attempt === attempt;
  return {
    data: settled ? outcome.items : [],
    loading: !settled,
    error: settled ? outcome.error : null,
    hasNext: settled ? outcome.hasNext : false,
    refetch,
  };
}
