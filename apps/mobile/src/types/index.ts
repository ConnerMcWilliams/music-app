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
  /**
   * Per-user progress state. Optional because it depends on submissions/progress
   * (a later, separate concern) — the raw catalog studies mirrored from the
   * backend carry no per-user state, so it is undefined for them.
   */
  status?: ExerciseStatus;
  /** Last graded score (0–100) when the study has been completed. */
  score?: number;
}

/**
 * A Clarke "Study" — the grouping a client browses (First Study … Tenth Study),
 * each containing many individual exercises (studies). Mirrors the backend's
 * section fields (`section`, `section_label`, `category`) plus its exercises.
 */
export interface StudySection {
  /** Clarke study number, 1–10. */
  section: number;
  /** Display label, e.g. "Second Study". */
  label: string;
  category: ExerciseCategory;
  /** Short description of what the section drills. */
  focus: string;
  /** The individual exercises (studies) that make up this section. */
  exercises: Exercise[];
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
  /** Membership label, e.g. "Joined 2024". */
  joined: string;
  dayStreak: number;
  personalBest: number;
  studiesDone: number;
  avgScore: number;
  /** Score trend used by the profile chart. */
  progress: ProgressPoint[];
}
