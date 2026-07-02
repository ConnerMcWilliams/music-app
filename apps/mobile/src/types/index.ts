/**
 * Shared domain types for the Clarke Coach mobile app.
 *
 * These intentionally mirror the shapes the Django backend is expected to return
 * (see `docs/architecture.md` and `docs/grading-rubric.md`) so that swapping the
 * mock data in `src/data` for real API calls later is a drop-in change.
 */

export type ExerciseStatus = 'completed' | 'in_progress' | 'locked';

export type ExerciseCategory = 'Foundational' | 'Articulation' | 'Flexibility';

export interface Exercise {
  id: string;
  /** Clarke study number, e.g. 2 for "Second Study". */
  number: number;
  title: string;
  /** Short descriptor, e.g. "Legato slurs · C major". */
  subtitle: string;
  key: string;
  /** Quarter-note tempo marking, e.g. "♩ = 80". */
  tempo: string;
  /** Playable range label, e.g. "G3–C5". */
  rangeLabel: string;
  category: ExerciseCategory;
  estMinutes: number;
  status: ExerciseStatus;
  /** Last graded score (0–100) when the study has been completed. */
  score?: number;
}

export interface Submission {
  id: string;
  exerciseId: string;
  title: string;
  /** Pre-formatted date label for display, e.g. "Jun 11". */
  dateLabel: string;
  /** Pre-formatted clip length, e.g. "0:48". */
  durationLabel: string;
  score: number;
}

export interface GradingCategory {
  label: string;
  /** 0–100 sub-score for this rubric category. */
  score: number;
}

export interface GradingResult {
  submissionId: string;
  exerciseId: string;
  exerciseTitle: string;
  /** Overall score out of 100. */
  totalScore: number;
  /** Letter grade label, e.g. "A−". */
  gradeLabel: string;
  categories: GradingCategory[];
  feedbackAuthor: string;
  feedbackInitials: string;
  feedbackText: string;
}

export interface ProgressPoint {
  /** X-axis label, e.g. "Apr". */
  label: string;
  /** Score value 0–100. */
  value: number;
}

export interface UserProfile {
  name: string;
  initials: string;
  level: string;
  joined: string;
  dayStreak: number;
  personalBest: number;
  studiesDone: number;
  avgScore: number;
  /** Score trend used by the profile chart. */
  progress: ProgressPoint[];
}
