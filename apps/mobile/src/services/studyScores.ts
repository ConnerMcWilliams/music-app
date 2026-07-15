/**
 * The current user's best score per catalog study, from the authenticated
 * `GET /api/profile/study-scores/` endpoint.
 *
 * The backend reports one row per study with at least one analyzed graded take,
 * keyed by catalog slug (`clarke-{section}-{local}`), plus the passing
 * threshold so the client never hardcodes it. Progression logic (which study
 * the Today card surfaces) is derived from this in `lib/todayStudy`.
 */
import { authClient } from '@/services/auth';

/** Best analyzed take for one study, and whether it clears the passing bar. */
export interface StudyScore {
  bestScore: number;
  passed: boolean;
}

/** App-facing per-study scores (camelCase), keyed by catalog slug. */
export interface StudyScores {
  passingScore: number;
  bySlug: Record<string, StudyScore>;
}

/** Backend `/api/profile/study-scores/` response (snake_case wire format). */
interface StudyScoresWire {
  passing_score: number;
  studies: { slug: string; best_score: number; passed: boolean }[];
}

function mapScores(body: StudyScoresWire): StudyScores {
  const bySlug: Record<string, StudyScore> = {};
  for (const row of body.studies) {
    bySlug[row.slug] = { bestScore: row.best_score, passed: row.passed };
  }
  return { passingScore: body.passing_score, bySlug };
}

/** GET `/api/profile/study-scores/` — the user's best score per study. */
export async function fetchStudyScores(): Promise<StudyScores> {
  const resp = await authClient.authedRequest('/api/profile/study-scores/', {
    method: 'GET',
  });
  if (!resp.ok) {
    throw new Error(`Study scores request failed (HTTP ${resp.status}).`);
  }
  return mapScores(await resp.json());
}
