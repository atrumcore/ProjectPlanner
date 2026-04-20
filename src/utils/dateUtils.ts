const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'April', 'May', 'June',
  'July', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function getMonthName(monthIndex: number): string {
  return MONTH_NAMES[monthIndex % 12];
}

/** Real number of days in a given month/year (handles leap years). */
export function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Integer week-column count a month spans (4 or 5).
 * Used by prepend/trim operations to add/remove whole-week columns.
 */
export function getWeeksForMonth(month: number, year: number): number {
  return Math.ceil(getDaysInMonth(month, year) / 7);
}

/**
 * Returns month layout data with real calendar boundaries.
 * `weekStart` is fractional — e.g. Feb 2026 starts at week 4.43, not 4.
 * `weekCount` is the fractional number of weeks that month spans.
 */
export function getMonthsFromWeeks(
  startMonth: number,
  startYear: number,
  totalWeeks: number
): { name: string; month: number; year: number; weekStart: number; weekCount: number }[] {
  const months: { name: string; month: number; year: number; weekStart: number; weekCount: number }[] = [];
  let cumulativeDays = 0;
  let month = startMonth;
  let year = startYear;

  while (cumulativeDays / 7 < totalWeeks) {
    const weekStart = cumulativeDays / 7;
    const daysThisMonth = getDaysInMonth(month, year);
    const weekEnd = (cumulativeDays + daysThisMonth) / 7;
    const weekCount = Math.min(weekEnd, totalWeeks) - weekStart;

    if (weekCount <= 0) break;

    months.push({
      name: getMonthName(month),
      month,
      year,
      weekStart,
      weekCount,
    });

    cumulativeDays += daysThisMonth;
    month++;
    if (month >= 12) {
      month = 0;
      year++;
    }
  }
  return months;
}

/**
 * Accurate today position as a fractional week offset from the timeline start.
 * Uses real day-difference math — no 4-week-per-month approximation.
 */
export function getTodayWeekOffset(startMonth: number, startYear: number): number {
  const now = new Date();
  const start = new Date(startYear, startMonth, 1);
  const diffMs = now.getTime() - start.getTime();
  return diffMs / (7 * 24 * 60 * 60 * 1000);
}

/**
 * Cumulative real weeks from startMonth/startYear to targetMonth/targetYear.
 * Used by ensureTodayVisible and range computations.
 */
/** South African public holidays for a given year. */
export function getSAPublicHolidays(year: number): { date: Date; name: string }[] {
  const holidays: { date: Date; name: string }[] = [
    { date: new Date(year, 0, 1), name: "New Year's Day" },
    { date: new Date(year, 2, 21), name: 'Human Rights Day' },
    { date: new Date(year, 3, 27), name: 'Freedom Day' },
    { date: new Date(year, 4, 1), name: "Workers' Day" },
    { date: new Date(year, 5, 16), name: 'Youth Day' },
    { date: new Date(year, 7, 9), name: "National Women's Day" },
    { date: new Date(year, 8, 24), name: 'Heritage Day' },
    { date: new Date(year, 11, 16), name: 'Day of Reconciliation' },
    { date: new Date(year, 11, 25), name: 'Christmas Day' },
    { date: new Date(year, 11, 26), name: 'Day of Goodwill' },
  ];
  // Easter-based (Good Friday + Family Day) — compute via anonymous Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  holidays.push({ date: new Date(year, month, day - 2), name: 'Good Friday' });
  holidays.push({ date: new Date(year, month, day + 1), name: 'Family Day' });

  // If a holiday falls on Sunday, the Monday is observed
  return holidays.map(h => {
    if (h.date.getDay() === 0) {
      return { date: new Date(h.date.getFullYear(), h.date.getMonth(), h.date.getDate() + 1), name: h.name + ' (observed)' };
    }
    return h;
  });
}

/**
 * ISO 8601 week number for a given date. Week 1 of a year is the week
 * containing that year's first Thursday (equivalently, the week containing
 * January 4). Weeks run Monday–Sunday.
 *
 * Uses UTC math so DST transitions don't knock a week ±1 at the edges.
 */
export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Shift to the Thursday of this ISO week — that Thursday's year is the
  // ISO week-year, and ISO week 1 is the week of its first Thursday.
  const dayNum = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Returns fractional-week offsets for each Monday inside the timeline, along
 * with its ISO 8601 week number. Used by TimelineGrid + TimelineHeader so the
 * vertical grid lines and the "W1, W2 …" labels land on real calendar weeks
 * instead of 7-day chunks from day 1.
 *
 * Phase bar positioning is not affected — bars are still stored as fractional
 * week offsets from the timeline start; only the painted grid changes.
 *
 * A partial leading week (if the timeline doesn't start on a Monday) is not
 * labelled. Same for a partial trailing week.
 */
export function getCalendarWeekBoundaries(
  startMonth: number,
  startYear: number,
  totalWeeks: number
): { weekStart: number; weekNumber: number }[] {
  const start = new Date(startYear, startMonth, 1);
  const startDay = start.getDay(); // 0 = Sun, 1 = Mon, …, 6 = Sat
  // Days until the first Monday on or after day 1.
  // Mon (1) → 0, Tue (2) → 6, …, Sun (0) → 1.
  const daysToFirstMonday = (8 - startDay) % 7;
  const boundaries: { weekStart: number; weekNumber: number }[] = [];
  let offset = daysToFirstMonday;
  while (offset / 7 <= totalWeeks) {
    const monday = new Date(startYear, startMonth, 1);
    monday.setDate(monday.getDate() + offset);
    boundaries.push({ weekStart: offset / 7, weekNumber: getISOWeek(monday) });
    offset += 7;
  }
  return boundaries;
}

/**
 * Returns fractional-week ranges covering Saturday + Sunday across the timeline.
 * Used by TimelineGrid for the weekend-shading overlay. Uses local Date math
 * so it honours whichever day-of-week a given calendar date actually falls on
 * (including leap-year drift).
 */
export function getWeekendDayRanges(
  startMonth: number,
  startYear: number,
  totalWeeks: number
): { weekStart: number; weekEnd: number }[] {
  const start = new Date(startYear, startMonth, 1);
  const totalDays = Math.ceil(totalWeeks * 7);
  const ranges: { weekStart: number; weekEnd: number }[] = [];
  let i = 0;
  while (i < totalDays) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dow = d.getDay(); // 0 = Sun, 6 = Sat
    if (dow === 6) {
      // Saturday — weekend runs 2 days
      const end = Math.min(i + 2, totalDays);
      ranges.push({ weekStart: i / 7, weekEnd: end / 7 });
      i = end;
    } else if (dow === 0) {
      // Sunday (e.g. timeline starts on a Sunday) — 1 day
      const end = Math.min(i + 1, totalDays);
      ranges.push({ weekStart: i / 7, weekEnd: end / 7 });
      i = end;
    } else {
      i++;
    }
  }
  return ranges;
}

/**
 * Returns holidays mapped to fractional week offsets from the timeline start.
 */
export function getHolidayWeekOffsets(
  startMonth: number,
  startYear: number,
  totalWeeks: number
): { week: number; name: string; date: Date }[] {
  const timelineStart = new Date(startYear, startMonth, 1);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const results: { week: number; name: string; date: Date }[] = [];
  // Check the start year and potentially the next year
  for (const year of [startYear, startYear + 1]) {
    for (const h of getSAPublicHolidays(year)) {
      const weekOffset = (h.date.getTime() - timelineStart.getTime()) / msPerWeek;
      if (weekOffset >= 0 && weekOffset <= totalWeeks) {
        results.push({ week: weekOffset, name: h.name, date: h.date });
      }
    }
  }
  return results;
}

/**
 * The calendar date at a fractional week offset from the timeline start.
 * Rounds to the nearest day.
 */
export function getDateAtWeekOffset(startMonth: number, startYear: number, week: number): Date {
  const d = new Date(startYear, startMonth, 1);
  d.setDate(d.getDate() + Math.round(week * 7));
  return d;
}

/** Short "DD Mon" label, e.g. "15 Jan". */
export function formatDayMonth(date: Date): string {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].substring(0, 3)}`;
}

export function getCumulativeWeeks(
  startMonth: number,
  startYear: number,
  targetMonth: number,
  targetYear: number
): number {
  let days = 0;
  let m = startMonth;
  let y = startYear;
  while (y < targetYear || (y === targetYear && m < targetMonth)) {
    days += getDaysInMonth(m, y);
    m++;
    if (m >= 12) {
      m = 0;
      y++;
    }
  }
  return days / 7;
}
