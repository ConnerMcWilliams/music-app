/**
 * Placeholder score-trend series for the Profile screen's progress chart.
 *
 * Identity and streak/stats are now live: identity comes from the authenticated
 * account (`AuthContext`) and streak/stats from `GET /api/profile/` (see
 * `useProfile`). The score *trend* has no backend endpoint yet, so the chart
 * renders this fixed series until one exists.
 *
 * TODO(api): serve the score trend from the backend and delete this.
 */
import type { ProgressPoint } from '@/types';

export const SCORE_TREND: ProgressPoint[] = [
  { label: 'Apr', value: 70 },
  { label: '', value: 74 },
  { label: '', value: 72 },
  { label: 'May', value: 81 },
  { label: '', value: 84 },
  { label: '', value: 87 },
  { label: 'Jun', value: 85 },
  { label: '', value: 90 },
];
