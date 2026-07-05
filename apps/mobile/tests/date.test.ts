import { formatTodayLabel, getWeekStrip } from '@/lib/date';

/**
 * The Today screen derives its header date and "this week" strip from the live
 * date + the user's streak, so these tests pin the formatting and the
 * done/current/todo logic against fixed dates.
 */
describe('formatTodayLabel', () => {
  it('formats as "Weekday, Month Day"', () => {
    // 2026-06-11 is a Thursday.
    expect(formatTodayLabel(new Date(2026, 5, 11))).toBe('Thursday, June 11');
  });

  it('uses no leading zero on the day', () => {
    expect(formatTodayLabel(new Date(2026, 0, 5))).toBe('Monday, January 5');
  });
});

describe('getWeekStrip', () => {
  // Wednesday, 2026-07-08 — mid-week so we see past, present, and future.
  const wednesday = new Date(2026, 6, 8);

  it('is Monday-first and seven days long', () => {
    const week = getWeekStrip(0, wednesday);
    expect(week.map((d) => d.day)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });

  it('marks today as current and future days as todo', () => {
    const week = getWeekStrip(3, wednesday);
    expect(week[2].state).toBe('current'); // Wednesday
    expect(week[3].state).toBe('todo'); // Thursday (future)
    expect(week[6].state).toBe('todo'); // Sunday (future)
  });

  it('marks past days inside the streak window as done', () => {
    // Streak of 3 covers today + the two prior days (Mon, Tue).
    const week = getWeekStrip(3, wednesday);
    expect(week[0].state).toBe('done'); // Monday
    expect(week[1].state).toBe('done'); // Tuesday
  });

  it('leaves past days outside the streak window as todo', () => {
    // Streak of 1 covers only today; earlier days were not practiced.
    const week = getWeekStrip(1, wednesday);
    expect(week[0].state).toBe('todo'); // Monday
    expect(week[1].state).toBe('todo'); // Tuesday
    expect(week[2].state).toBe('current'); // Wednesday
  });

  it('handles Sunday (getDay() === 0) as the last column', () => {
    const sunday = new Date(2026, 6, 12); // Sunday
    const week = getWeekStrip(0, sunday);
    expect(week[6].state).toBe('current');
    expect(week[0].day).toBe('M');
  });
});
