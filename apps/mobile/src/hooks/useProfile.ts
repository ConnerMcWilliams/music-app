import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { identityForUser } from '@/lib/identity';
import { EMPTY_PROFILE_STATS, fetchProfileStats, type ProfileStats } from '@/services/profile';
import type { UserProfile } from '@/types';

const SIGNED_OUT_IDENTITY = { name: '', initials: '', joined: '' };

/**
 * The current user's profile for the Today and Profile screens: identity from
 * the authenticated account (`AuthContext`) combined with live streak/stats and
 * the reward economy from `GET /api/profile/`.
 *
 * Stats start empty (a new user with no practice) and fill in once the fetch
 * resolves; a failed fetch leaves them empty rather than blanking the screen.
 * `reloadStats` re-fetches on demand — used after buying a streak freeze so the
 * coin balance and freeze count update without leaving the screen. The Profile
 * chart's score trend is derived separately from submission history (see
 * `buildScoreTrend`), not returned here.
 */
export function useProfile(): UserProfile & { reloadStats: () => void } {
  const { user } = useAuth();
  const [stats, setStats] = useState<ProfileStats>(EMPTY_PROFILE_STATS);

  const reloadStats = useCallback(() => {
    if (!user) return;
    fetchProfileStats()
      .then(setStats)
      .catch(() => {
        // Keep the current stats; nothing actionable for the user here.
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchProfileStats()
      .then((s) => {
        if (active) setStats(s);
      })
      .catch(() => {
        // Keep the empty stats; nothing actionable for the user here.
      });
    return () => {
      active = false;
    };
  }, [user]);

  // Signed out, report empty stats regardless of any previously fetched values.
  const identity = user ? identityForUser(user) : SIGNED_OUT_IDENTITY;
  const effectiveStats = user ? stats : EMPTY_PROFILE_STATS;
  return { ...identity, ...effectiveStats, reloadStats };
}
