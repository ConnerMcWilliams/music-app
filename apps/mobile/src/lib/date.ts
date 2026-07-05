/**
 * Small date helpers for the Today screen — the header date label and the
 * "this week" streak strip. Kept dependency-free (no Intl) so the formatting is
 * identical across Hermes/JSC and easy to unit-test with an injected `now`.
 */

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** e.g. "Tuesday, June 11" — the Today screen's header date. */
export function formatTodayLabel(now: Date = new Date()): string {
  return `${WEEKDAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
}

export type DayState = 'done' | 'current' | 'todo';

export interface WeekDay {
  /** Single-letter weekday label, Monday-first: M T W T F S S. */
  day: string;
  state: DayState;
}

// Monday-first single-letter labels, indexed by JS `getDay()` (0 = Sunday).
const LETTER_BY_WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/**
 * The current Monday–Sunday week as pills for the Today strip, derived from the
 * live date and the user's day streak.
 *
 * Today is `current`; a past day is `done` when it falls inside the streak
 * window (practiced that day) and `todo` otherwise; future days are `todo`.
 * This makes the strip reflect real progress instead of hard-coded states.
 */
export function getWeekStrip(dayStreak: number, now: Date = new Date()): WeekDay[] {
  const jsDay = now.getDay(); // 0 = Sun … 6 = Sat
  // Days since the most recent Monday (Mon = 0 … Sun = 6).
  const sinceMonday = (jsDay + 6) % 7;

  return Array.from({ length: 7 }, (_, i) => {
    const daysFromToday = i - sinceMonday; // negative = past, 0 = today, positive = future
    const weekday = (jsDay + daysFromToday + 7) % 7;

    let state: DayState;
    if (daysFromToday === 0) {
      state = 'current';
    } else if (daysFromToday > 0) {
      state = 'todo';
    } else {
      // Past day: part of the streak when it's within `dayStreak` days back.
      state = -daysFromToday < dayStreak ? 'done' : 'todo';
    }

    return { day: LETTER_BY_WEEKDAY[weekday], state };
  });
}
