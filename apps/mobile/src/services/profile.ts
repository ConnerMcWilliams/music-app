/**
 * The current user's practice progress: day streak, aggregate stats, and the
 * reward economy (XP / level / coins / streak freezes).
 *
 * Identity (name, initials, join date) is NOT here — it comes from the
 * authenticated account (`AuthContext` / `/api/auth/me/`). This module fetches
 * only what accrues as the user practices, from the authenticated
 * `GET /api/profile/` endpoint, and buys streak freezes via
 * `POST /api/profile/streak-freeze/`.
 */
import { authClient } from '@/services/auth';

/** App-facing streak + stats + rewards (camelCase). */
export interface ProfileStats {
  dayStreak: number;
  personalBest: number;
  studiesDone: number;
  avgScore: number;
  xp: number;
  level: number;
  rankTitle: string;
  xpIntoLevel: number;
  xpForNextLevel: number;
  coins: number;
  streakFreezes: number;
  freezeCost: number;
  maxFreezes: number;
}

/** Backend `/api/profile/` response (snake_case wire format). */
interface ProfileStatsWire {
  day_streak: number;
  personal_best: number;
  studies_done: number;
  avg_score: number;
  xp: number;
  level: number;
  rank_title: string;
  xp_into_level: number;
  xp_for_next_level: number;
  coins: number;
  streak_freezes: number;
  freeze_cost: number;
  max_freezes: number;
}

/** A brand-new user with no practice yet — used before the fetch resolves. */
export const EMPTY_PROFILE_STATS: ProfileStats = {
  dayStreak: 0,
  personalBest: 0,
  studiesDone: 0,
  avgScore: 0,
  xp: 0,
  level: 1,
  rankTitle: 'Beginner',
  xpIntoLevel: 0,
  xpForNextLevel: 0,
  coins: 0,
  streakFreezes: 0,
  freezeCost: 0,
  maxFreezes: 0,
};

function mapStats(body: ProfileStatsWire): ProfileStats {
  return {
    dayStreak: body.day_streak,
    personalBest: body.personal_best,
    studiesDone: body.studies_done,
    avgScore: body.avg_score,
    xp: body.xp,
    level: body.level,
    rankTitle: body.rank_title,
    xpIntoLevel: body.xp_into_level,
    xpForNextLevel: body.xp_for_next_level,
    coins: body.coins,
    streakFreezes: body.streak_freezes,
    freezeCost: body.freeze_cost,
    maxFreezes: body.max_freezes,
  };
}

/** GET `/api/profile/` — the authenticated user's streak, stats, and rewards. */
export async function fetchProfileStats(): Promise<ProfileStats> {
  const resp = await authClient.authedRequest('/api/profile/', { method: 'GET' });
  if (!resp.ok) {
    throw new Error(`Profile request failed (HTTP ${resp.status}).`);
  }
  return mapStats(await resp.json());
}

/**
 * POST `/api/profile/streak-freeze/` — spend coins to buy one streak freeze.
 * Returns the updated stats so the caller can refresh the coin/freeze display.
 * Throws with the backend's message (too poor, at cap) on rejection.
 */
export async function purchaseStreakFreeze(): Promise<ProfileStats> {
  const resp = await authClient.authedRequest('/api/profile/streak-freeze/', {
    method: 'POST',
  });
  if (!resp.ok) {
    const detail = await resp
      .json()
      .then((b) => (b as { detail?: string }).detail)
      .catch(() => undefined);
    throw new Error(detail ?? `Streak-freeze purchase failed (HTTP ${resp.status}).`);
  }
  return mapStats(await resp.json());
}
