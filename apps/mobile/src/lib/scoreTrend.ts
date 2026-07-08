/**
 * Derives the Profile "Score progress" series from the user's real submissions.
 *
 * The backend stores only aggregate stats on `Profile` (no time-series), but the
 * submission history (`GET /api/submissions/`) already carries a score + timestamp
 * per graded take. This buckets those takes by day (default) or week, averaging
 * the score in each bucket, so the chart plots real progress over time.
 */
import type { ProgressPoint, Submission } from '@/types';

export type TrendGranularity = 'day' | 'week';

export interface ScoreTrend {
  /** Chart points, oldest → newest, one per bucket. */
  points: ProgressPoint[];
  /** Change from the first to the last point (0 when fewer than 2 points). */
  deltaPoints: number;
  /** Span between first and last bucket, in the selected unit: "9 days" (day) or "6 weeks" (week). */
  spanLabel: string;
}

/** Keep the chart readable: cap how many buckets we draw for each granularity. */
const MAX_BUCKETS: Record<TrendGranularity, number> = { day: 12, week: 8 };

const MS_PER_DAY = 86_400_000;

interface Bucket {
  /** Representative local date — the day's midnight, or the week's Monday. */
  date: Date;
  sum: number;
  count: number;
}

/**
 * Builds the score trend from a page of submissions (any order). Ungraded takes
 * are ignored — they have no real score. The most recent `MAX_BUCKETS` buckets
 * are kept, chronological.
 */
export function buildScoreTrend(
  submissions: Submission[],
  granularity: TrendGranularity = 'day',
): ScoreTrend {
  const buckets = new Map<string, Bucket>();

  for (const s of submissions) {
    if (!s.grade) continue; // ungraded takes carry no score to plot
    const when = new Date(s.createdAt);
    if (Number.isNaN(when.getTime())) continue;
    const date = granularity === 'week' ? startOfWeek(when) : startOfDay(when);
    const key = dateKey(date);
    const existing = buckets.get(key);
    if (existing) {
      existing.sum += s.score;
      existing.count += 1;
    } else {
      buckets.set(key, { date, sum: s.score, count: 1 });
    }
  }

  const ordered = [...buckets.values()]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(-MAX_BUCKETS[granularity]);

  const points: ProgressPoint[] = ordered.map((bucket, i) => ({
    label: bucketLabel(ordered, i),
    value: Math.round(bucket.sum / bucket.count),
  }));

  const deltaPoints =
    points.length < 2 ? 0 : points[points.length - 1].value - points[0].value;
  const spanLabel =
    ordered.length < 2
      ? ''
      : formatSpan(ordered[0].date, ordered[ordered.length - 1].date, granularity);

  return { points, deltaPoints, spanLabel };
}

/** Local midnight of the given date. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Local Monday of the week containing the given date. */
function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  // getDay(): 0=Sun … 6=Sat; shift so Monday starts the week.
  const backToMonday = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - backToMonday);
  return day;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Sparse x-axis labels (like the original design's "Apr … May … Jun"): label the
 * first and last bucket, plus any bucket whose short month differs from the
 * previous one. Others are blank.
 */
function bucketLabel(buckets: Bucket[], i: number): string {
  const isEdge = i === 0 || i === buckets.length - 1;
  const monthChanged = i > 0 && shortMonth(buckets[i - 1].date) !== shortMonth(buckets[i].date);
  return isEdge || monthChanged ? shortMonth(buckets[i].date) : '';
}

function shortMonth(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short' });
}

/** Span between two bucket dates, labelled in the selected granularity's unit. */
function formatSpan(start: Date, end: Date, granularity: TrendGranularity): string {
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY));
  if (granularity === 'week') {
    const weeks = Math.max(1, Math.round(days / 7));
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  }
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
