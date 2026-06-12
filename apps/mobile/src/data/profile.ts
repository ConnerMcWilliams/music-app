/**
 * Mock user profile + progress trend.
 *
 * TODO(api): replace with the authenticated user's profile and streak data from
 * the Django users/streaks endpoints via `src/services/api.ts`.
 */
import type { UserProfile } from '@/types';

export const PROFILE: UserProfile = {
  name: 'Marcus Bell',
  initials: 'MB',
  level: 'Intermediate',
  joined: 'Joined 2024',
  dayStreak: 47,
  personalBest: 52,
  studiesDone: 23,
  avgScore: 86,
  progress: [
    { label: 'Apr', value: 70 },
    { label: '', value: 74 },
    { label: '', value: 72 },
    { label: 'May', value: 81 },
    { label: '', value: 84 },
    { label: '', value: 87 },
    { label: 'Jun', value: 85 },
    { label: '', value: 90 },
  ],
};
