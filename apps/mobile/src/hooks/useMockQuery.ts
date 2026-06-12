import { useCallback, useEffect, useState } from 'react';

/**
 * Simulates an async data fetch against the mock data so screens can render real
 * loading / empty / error states. Pure client-side timer — no network.
 *
 * TODO(api): replace with a real data-fetching hook backed by `src/services/api.ts`
 * (e.g. React Query) once the Django endpoints exist. The `{ data, loading, error,
 * refetch }` shape is deliberately close to common fetch hooks to ease that swap.
 */
export interface MockQueryState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface MockQueryOptions {
  /** Simulated latency in ms. */
  delayMs?: number;
  /** Force the error branch — handy for demoing the error placeholder. */
  shouldFail?: boolean;
}

interface InternalState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

const PENDING = { data: null, loading: true, error: null } as const;

export function useMockQuery<T>(
  resolver: () => T,
  options: MockQueryOptions = {},
): MockQueryState<T> {
  const { delayMs = 550, shouldFail = false } = options;
  const [state, setState] = useState<InternalState<T>>(PENDING);
  const [attempt, setAttempt] = useState(0);

  const refetch = useCallback(() => {
    // Reset to the loading state in the event handler (not in the effect) and
    // bump `attempt` to re-trigger the simulated fetch below.
    setState(PENDING);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      if (shouldFail) {
        setState({ data: null, loading: false, error: new Error('Something went wrong while loading.') });
      } else {
        setState({ data: resolver(), loading: false, error: null });
      }
    }, delayMs);

    return () => {
      active = false;
      clearTimeout(timer);
    };
    // `resolver` is passed inline by callers; re-run only on these inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delayMs, shouldFail, attempt]);

  return { ...state, refetch };
}
