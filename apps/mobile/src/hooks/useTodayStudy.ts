import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { firstUnpassedStudy, passedSlugs, type TodayStudy } from '@/lib/todayStudy';
import { fetchStudyScores } from '@/services/studyScores';

/** With nothing passed yet, the walk lands on the very first catalog study. */
const FALLBACK: TodayStudy = firstUnpassedStudy(new Set());

export interface TodayStudyState extends TodayStudy {
  loading: boolean;
  refetch: () => void;
}

/**
 * The study the Today card (and the Practice tab's no-param open) should show:
 * the user's first unpassed catalog exercise, per `GET /api/profile/study-scores/`.
 *
 * Always renderable: signed out, offline, or against a backend without the
 * endpoint it serves the first catalog study. `refetch` re-pulls the scores;
 * the Today screen calls it on focus so the card advances right after a take
 * graded on the Record flow passes the current study. Like `useSubmissionsPage`,
 * the fetch outcome is tagged with the attempt it belongs to and `loading` is
 * derived by comparison, so a refetch keeps showing the last computed study
 * (no flash back to Study No. 1) without setting state inside the effect.
 */
export function useTodayStudy(): TodayStudyState {
  const { user } = useAuth();
  const [outcome, setOutcome] = useState<{ attempt: number; today: TodayStudy } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const refetch = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchStudyScores()
      .then((scores) => {
        if (!active) return;
        setOutcome({ attempt, today: firstUnpassedStudy(passedSlugs(scores)) });
      })
      .catch(() => {
        // Keep the last computed study (or the fallback); nothing actionable
        // for the user here.
        if (!active) return;
        setOutcome((prev) => ({ attempt, today: prev?.today ?? FALLBACK }));
      });
    return () => {
      active = false;
    };
  }, [user, attempt]);

  // Signed out: report the fallback, settled, regardless of any prior fetch.
  if (!user) {
    return { ...FALLBACK, loading: false, refetch };
  }
  const settled = outcome !== null && outcome.attempt === attempt;
  return { ...(outcome?.today ?? FALLBACK), loading: !settled, refetch };
}
