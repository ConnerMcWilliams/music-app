import { buildScoreTrend } from '@/lib/scoreTrend';
import type { GradingResult, Submission } from '@/types';

// Build ISO timestamps at local noon so bucketing (which uses the local calendar
// day/week) round-trips deterministically regardless of the runner's timezone.
function iso(year: number, month1: number, day: number): string {
  return new Date(year, month1 - 1, day, 12, 0, 0).toISOString();
}

function grade(score: number): GradingResult {
  return {
    submissionId: 's',
    exerciseId: 'clarke-2',
    exerciseTitle: 'Second Study',
    totalScore: score,
    gradeLabel: 'B',
    categories: [],
    feedbackAuthor: '',
    feedbackInitials: '',
    feedbackText: '',
  };
}

function take(createdAt: string, score: number, graded = true): Submission {
  return {
    id: `${createdAt}-${score}`,
    exerciseId: 'clarke-2',
    title: 'Second Study',
    dateLabel: '',
    durationLabel: '',
    score: graded ? score : 0,
    createdAt,
    durationSeconds: 30,
    audioUrl: null,
    grade: graded ? grade(score) : null,
  };
}

describe('buildScoreTrend', () => {
  it('returns an empty trend for no submissions', () => {
    const trend = buildScoreTrend([]);
    expect(trend.points).toEqual([]);
    expect(trend.deltaPoints).toBe(0);
    expect(trend.spanLabel).toBe('');
  });

  it('ignores ungraded takes', () => {
    const trend = buildScoreTrend([
      take(iso(2026, 1, 3), 80),
      take(iso(2026, 1, 5), 0, false), // ungraded
      take(iso(2026, 1, 7), 90),
      take(iso(2026, 1, 9), 0, false), // ungraded
    ]);
    expect(trend.points).toHaveLength(2);
    expect(trend.points.map((p) => p.value)).toEqual([80, 90]);
  });

  it('averages multiple takes in the same day bucket and orders ascending', () => {
    // Provided newest-first to prove it sorts chronologically.
    const trend = buildScoreTrend([
      take(iso(2026, 1, 8), 70),
      take(iso(2026, 1, 6), 90),
      take(iso(2026, 1, 6), 80),
    ]);
    expect(trend.points.map((p) => p.value)).toEqual([85, 70]); // Jan 6 avg, then Jan 8
    expect(trend.deltaPoints).toBe(-15);
  });

  it('buckets by week when asked', () => {
    // Jan 6 & 8 2026 fall in the week of Mon Jan 5; Jan 13 in the next week.
    const rows = [take(iso(2026, 1, 6), 80), take(iso(2026, 1, 8), 90), take(iso(2026, 1, 13), 60)];
    expect(buildScoreTrend(rows, 'day').points).toHaveLength(3);
    const weekly = buildScoreTrend(rows, 'week');
    expect(weekly.points.map((p) => p.value)).toEqual([85, 60]); // week1 avg, week2
    expect(weekly.deltaPoints).toBe(-25);
  });

  it('caps to the most recent buckets and reports the span', () => {
    // 15 distinct days, score = day number; day granularity keeps the last 12.
    const rows = Array.from({ length: 15 }, (_, i) => take(iso(2026, 1, i + 1), i + 1));
    const trend = buildScoreTrend(rows, 'day');
    expect(trend.points).toHaveLength(12);
    expect(trend.points[0].value).toBe(4); // Jan 4 — oldest kept
    expect(trend.points[11].value).toBe(15); // Jan 15 — newest
    expect(trend.deltaPoints).toBe(11);
    expect(trend.spanLabel).toBe('11 days');
  });

  it('labels the first and last buckets', () => {
    const trend = buildScoreTrend([
      take(iso(2026, 1, 3), 70),
      take(iso(2026, 1, 5), 80),
      take(iso(2026, 1, 7), 90),
    ]);
    expect(trend.points[0].label).not.toBe('');
    expect(trend.points[trend.points.length - 1].label).not.toBe('');
  });

  it('yields a single flat point for one graded take', () => {
    const trend = buildScoreTrend([take(iso(2026, 1, 3), 82)]);
    expect(trend.points).toHaveLength(1);
    expect(trend.deltaPoints).toBe(0);
    expect(trend.spanLabel).toBe('');
  });
});
