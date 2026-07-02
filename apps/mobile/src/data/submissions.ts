/**
 * Mock practice submissions (recent recordings).
 *
 * TODO(api): replace with the user's submission history from the Django
 * submissions endpoint via `src/services/api.ts`.
 */
import type { Submission } from '@/types';

export const SUBMISSIONS: Submission[] = [
  {
    id: 'sub-1',
    exerciseId: 'clarke-2',
    title: 'Study No. 2 — Slurs',
    dateLabel: 'Jun 11',
    durationLabel: '0:48',
    score: 88,
  },
  {
    id: 'sub-2',
    exerciseId: 'flex-warmup',
    title: 'Lip Flexibility Warm-up',
    dateLabel: 'Jun 10',
    durationLabel: '1:12',
    score: 82,
  },
  {
    id: 'sub-3',
    exerciseId: 'clarke-1',
    title: 'Study No. 1 — First Study',
    dateLabel: 'Jun 9',
    durationLabel: '0:55',
    score: 90,
  },
];
