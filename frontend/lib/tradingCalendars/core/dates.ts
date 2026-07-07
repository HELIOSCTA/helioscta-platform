import type { CalendarDate, DayOfWeek } from "./types";

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function assertCalendarDate(value: CalendarDate): CalendarDate {
  if (!CALENDAR_DATE_PATTERN.test(value)) {
    throw new Error(`Expected YYYY-MM-DD calendar date, got "${value}".`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (formatCalendarDate(parsed) !== value) {
    throw new Error(`Invalid calendar date "${value}".`);
  }

  return value;
}

export function makeCalendarDate(year: number, month: number, day: number): CalendarDate {
  return formatCalendarDate(new Date(Date.UTC(year, month - 1, day)));
}

export function parseCalendarDate(value: CalendarDate): Date {
  assertCalendarDate(value);
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatCalendarDate(date: Date): CalendarDate {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const parsed = parseCalendarDate(date);
  return formatCalendarDate(new Date(parsed.getTime() + days * MS_PER_DAY));
}

export function compareCalendarDates(left: CalendarDate, right: CalendarDate): number {
  assertCalendarDate(left);
  assertCalendarDate(right);
  return left.localeCompare(right);
}

export function getCalendarYear(date: CalendarDate): number {
  assertCalendarDate(date);
  return Number(date.slice(0, 4));
}

export function getDayOfWeek(date: CalendarDate): DayOfWeek {
  return parseCalendarDate(date).getUTCDay() as DayOfWeek;
}

export function isWeekend(date: CalendarDate, weekendDays: ReadonlySet<DayOfWeek>): boolean {
  return weekendDays.has(getDayOfWeek(date));
}

export function dateRange(startDate: CalendarDate, endDate: CalendarDate): CalendarDate[] {
  let cursor = assertCalendarDate(startDate);
  const end = assertCalendarDate(endDate);
  const dates: CalendarDate[] = [];

  while (compareCalendarDates(cursor, end) <= 0) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return dates;
}

export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: DayOfWeek,
  occurrence: number
): CalendarDate {
  if (occurrence < 1 || occurrence > 5) {
    throw new Error(`Expected occurrence 1-5, got ${occurrence}.`);
  }

  const firstOfMonth = makeCalendarDate(year, month, 1);
  const firstDow = getDayOfWeek(firstOfMonth);
  const offset = (weekday - firstDow + 7) % 7;
  return addDays(firstOfMonth, offset + (occurrence - 1) * 7);
}

export function lastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: DayOfWeek
): CalendarDate {
  const firstOfNextMonth =
    month === 12 ? makeCalendarDate(year + 1, 1, 1) : makeCalendarDate(year, month + 1, 1);
  let cursor = addDays(firstOfNextMonth, -1);

  while (getDayOfWeek(cursor) !== weekday) {
    cursor = addDays(cursor, -1);
  }

  return cursor;
}

export function getFederalObservedDate(actualDate: CalendarDate): CalendarDate {
  const dow = getDayOfWeek(actualDate);
  if (dow === 6) return addDays(actualDate, -1);
  if (dow === 0) return addDays(actualDate, 1);
  return actualDate;
}

export function getSundayMondayObservedDate(actualDate: CalendarDate): CalendarDate {
  return getDayOfWeek(actualDate) === 0 ? addDays(actualDate, 1) : actualDate;
}

export function getWesternEasterDate(year: number): CalendarDate {
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
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;

  return makeCalendarDate(year, easterMonth, easterDay);
}
