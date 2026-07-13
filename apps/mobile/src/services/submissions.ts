/**
 * The signed-in user's submission history (GET /api/submissions/).
 *
 * Mirrors `src/services/profile.ts`: hit the authenticated endpoint, then map the
 * snake_case wire rows to the camelCase app `Submission` used by the Profile
 * "Recent recordings" list. Each row also carries its stored `grade` and the
 * recording `audioUrl`, so tapping a row can show the grade and replay the take
 * without a second request. The endpoint is paginated (DRF PageNumberPagination).
 */
import { authClient } from '@/services/auth';
import type { GradingResult, Submission } from '@/types';

/** One row of the paginated `/api/submissions/` response (snake_case). */
interface SubmissionWire {
  submission_id: string;
  exercise_id: string;
  exercise_title: string;
  created_at: string;
  duration_seconds: number;
  audio_url: string | null;
  grade: {
    total_score: number;
    grade_label: string;
    categories: { label: string; score: number }[];
    feedback_author: string;
    feedback_initials: string;
    feedback_text: string;
    xp_awarded: number;
  } | null;
}

/** DRF's paginated list envelope. */
interface PaginatedWire<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface SubmissionPage {
  items: Submission[];
  /** Next page number, or null when there are no more. */
  nextPage: number | null;
}

/** GET `/api/submissions/` — one page of the user's history, newest first. */
export async function fetchSubmissions(page = 1): Promise<SubmissionPage> {
  const resp = await authClient.authedRequest(`/api/submissions/?page=${page}`, {
    method: 'GET',
  });
  if (!resp.ok) {
    throw new Error(`Submissions request failed (HTTP ${resp.status}).`);
  }
  const body: PaginatedWire<SubmissionWire> = await resp.json();
  return {
    items: body.results.map(mapSubmission),
    nextPage: body.next ? page + 1 : null,
  };
}

function mapSubmission(row: SubmissionWire): Submission {
  const grade = row.grade ? mapGrade(row, row.grade) : null;
  return {
    id: row.submission_id,
    exerciseId: row.exercise_id,
    title: row.exercise_title || 'Clarke Study',
    dateLabel: formatDate(row.created_at),
    durationLabel: formatDuration(row.duration_seconds),
    score: row.grade?.total_score ?? 0,
    createdAt: row.created_at,
    durationSeconds: row.duration_seconds,
    audioUrl: row.audio_url,
    grade,
  };
}

function mapGrade(row: SubmissionWire, grade: NonNullable<SubmissionWire['grade']>): GradingResult {
  return {
    submissionId: row.submission_id,
    exerciseId: row.exercise_id,
    exerciseTitle: row.exercise_title || 'Clarke Study',
    totalScore: grade.total_score,
    gradeLabel: grade.grade_label,
    categories: grade.categories,
    feedbackAuthor: grade.feedback_author,
    feedbackInitials: grade.feedback_initials,
    feedbackText: grade.feedback_text,
    audioUrl: row.audio_url,
    xpAwarded: grade.xp_awarded,
  };
}

/** ISO timestamp → short display label, e.g. "Jun 11". */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Seconds → "m:ss", e.g. 48 → "0:48". */
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
