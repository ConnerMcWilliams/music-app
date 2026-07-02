/**
 * Mock grading result for the latest submission.
 *
 * Category labels follow the design mockup. The real grading engine (see
 * `docs/grading-rubric.md`) will return pitch/rhythm/tempo/tone/completion
 * sub-scores; this mock is intentionally shaped to be easy to remap later.
 *
 * TODO(api): replace with the graded result polled from the Django grading
 * endpoint via `src/services/api.ts`.
 */
import type { GradingResult } from '@/types';

export const MOCK_GRADING_RESULT: GradingResult = {
  submissionId: 'sub-1',
  exerciseId: 'clarke-2',
  exerciseTitle: 'Clarke Study No. 2',
  totalScore: 88,
  gradeLabel: 'A−',
  categories: [
    { label: 'Intonation', score: 92 },
    { label: 'Tone Quality', score: 90 },
    { label: 'Rhythm', score: 85 },
    { label: 'Tempo Accuracy', score: 84 },
  ],
  feedbackAuthor: 'Prof. Halvorsen',
  feedbackInitials: 'PH',
  feedbackText:
    'Lovely legato through the slurs. Watch the tempo drift in bar 3 — keep the air steady and the rhythm will lock in.',
};
