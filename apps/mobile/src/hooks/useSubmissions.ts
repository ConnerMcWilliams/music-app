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
