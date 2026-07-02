/**
 * Centralized mock data barrel.
 *
 * Everything the mock frontend reads comes from here, so replacing it with a
 * real API layer (`src/services/api.ts`) later touches one place. Screens import
 * from `@/data`, never from a backend directly (there isn't one yet).
 */
import type { Exercise } from '@/types';
import { EXERCISES } from './exercises';

export { EXERCISES } from './exercises';
export { SUBMISSIONS } from './submissions';
export { MOCK_GRADING_RESULT } from './gradingResults';
export { PROFILE } from './profile';

/** The study surfaced on the Home / Today screen. */
export function getTodayExercise(): Exercise {
  const inProgress = EXERCISES.find((e) => e.status === 'in_progress');
  return inProgress ?? EXERCISES[0];
}

/** Look up a single exercise by id (used when navigating from a card). */
export function getExerciseById(id: string | undefined): Exercise | undefined {
  if (!id) return undefined;
  return EXERCISES.find((e) => e.id === id);
}
