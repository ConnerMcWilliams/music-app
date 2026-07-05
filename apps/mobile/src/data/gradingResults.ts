/**
 * Mock grading result shown on a direct visit to the Results tab (before any
 * take has been submitted this session). Its category labels mirror the real
 * grading engine's rubric output (see `docs/grading-rubric.md`): Pitch,
 * Rhythm, Tempo, Tone, Completion — so the preview matches a live grade.
 *
 * A just-submitted take replaces this with the real result from the backend
 * via `src/services/api.ts` (`submitTakeForGrading` → `/api/submissions/`).
 */
import type { GradingResult } from '@/types';

export const MOCK_GRADING_RESULT: GradingResult = {
  submissionId: 'sub-1',
  exerciseId: 'clarke-2',
  exerciseTitle: 'Clarke Study No. 2',
  totalScore: 89,
  gradeLabel: 'B+',
  categories: [
    { label: 'Pitch Accuracy', score: 92 },
    { label: 'Rhythm', score: 88 },
    { label: 'Tempo Consistency', score: 90 },
    { label: 'Tone Stability', score: 85 },
    { label: 'Completion', score: 93 },
  ],
  feedbackAuthor: 'Prof. Halvorsen',
  feedbackInitials: 'PH',
  feedbackText:
    'Strong playing overall; clear, even tone. Main thing to watch: keep the air steady so the tempo holds through the phrase.',
};
