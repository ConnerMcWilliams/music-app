/**
 * The current user's practice progress: day streak and aggregate stats.
 *
 * Identity (name, initials, join date) is NOT here — it comes from the
 * authenticated account (`AuthContext` / `/api/auth/me/`). This module fetches
 * only what accrues as the user practices, from the authenticated
 * `GET /api/profile/` endpoint.
 */
import { authClient } from '@/services/auth';

/** App-facing streak + stats (camelCase). */
export interface ProfileStats {
  dayStreak: number;
  personalBest: number;
  studiesDone: number;
  avgScore: number;
}

/** Backend `/api/profile/` response (snake_case wire format). */
interface ProfileStatsWire {
  day_streak: number;
  personal_best: number;
  studies_done: number;
  avg_score: number;
}

/** A brand-new user with no practice yet — used before the fetch resolves. */
export const EMPTY_PROFILE_STATS: ProfileStats = {
  dayStreak: 0,
  personalBest: 0,
  studiesDone: 0,
  avgScore: 0,
};

/** GET `/api/profile/` — the authenticated user's streak and stats. */
export async function fetchProfileStats(): Promise<ProfileStats> {
  const resp = await authClient.authedRequest('/api/profile/', { method: 'GET' });
  if (!resp.ok) {
    throw new Error(`Profile request failed (HTTP ${resp.status}).`);
  }
  const body: ProfileStatsWire = await resp.json();
  return {
    dayStreak: body.day_streak,
    personalBest: body.personal_best,
    studiesDone: body.studies_done,
    avgScore: body.avg_score,
  };
}
