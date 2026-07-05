import { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { SCORE_TREND } from '@/data';
import { identityForUser } from '@/lib/identity';
import { EMPTY_PROFILE_STATS, fetchProfileStats, type ProfileStats } from '@/services/profile';
import type { UserProfile } from '@/types';

const SIGNED_OUT_IDENTITY = { name: '', initials: '', joined: '' };

/**
 * The current user's profile for the Today and Profile screens: identity from
 * the authenticated account (`AuthContext`) combined with live streak/stats from
 * `GET /api/profile/`.
 *
 * Stats start empty (a new user with no practice) and fill in once the fetch
 * resolves; a failed fetch leaves them empty rather than blanking the screen.
 * The score-trend series is still a placeholder (`SCORE_TREND`) until the
 * backend serves it.
 */
export function useProfile(): UserProfile {
  const { user } = useAuth();
  const [stats, setStats] = useState<ProfileStats>(EMPTY_PROFILE_STATS);

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
  return { ...identity, ...effectiveStats, progress: SCORE_TREND };
}
