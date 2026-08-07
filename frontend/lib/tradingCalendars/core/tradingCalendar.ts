import {
  addDays,
  assertCalendarDate,
  dateRange,
  getCalendarYear,
  getDayOfWeek,
} from "./dates";
import type {
  CalendarDate,
  CalendarHoliday,
  DayOfWeek,
  TradingCalendar,
  TradingCalendarConfig,
} from "./types";
import { sortUniqueHolidays } from "./holidayRules";

const DEFAULT_WEEKEND_DAYS: DayOfWeek[] = [0, 6];
const MAX_TRADING_DAY_WALK = 3700;

function holidaysForRange(config: TradingCalendarConfig, startYear: number, endYear: number) {
  const holidays: CalendarHoliday[] = [];

  for (let year = startYear - 1; year <= endYear + 1; year += 1) {
    holidays.push(...config.holidaysForYear(year));
  }

  return sortUniqueHolidays(holidays).filter((holiday) => {
    const holidayYear = getCalendarYear(holiday.date);
    return holidayYear >= startYear && holidayYear <= endYear;
  });
}

export function createTradingCalendar(config: TradingCalendarConfig): TradingCalendar {
  const weekendDays = new Set<DayOfWeek>(config.weekendDays ?? DEFAULT_WEEKEND_DAYS);
  const weekendsAreTradingDays = config.weekendsAreTradingDays ?? false;

  function getHoliday(date: CalendarDate): CalendarHoliday | null {
    const normalizedDate = assertCalendarDate(date);
    const year = getCalendarYear(normalizedDate);
    return (
      holidaysForRange(config, year, year).find((holiday) => holiday.date === normalizedDate) ??
      null
    );
  }

  function isWeekendDate(date: CalendarDate): boolean {
    return weekendDays.has(getDayOfWeek(date));
  }

  function isTradingDay(date: CalendarDate): boolean {
    if (!weekendsAreTradingDays && isWeekendDate(date)) return false;
    const holiday = getHoliday(date);
    if (!holiday) return true;
    return holiday.isTradingDay === true;
  }

  function walkTradingDay(date: CalendarDate, direction: 1 | -1): CalendarDate {
    let cursor = addDays(assertCalendarDate(date), direction);

    for (let attempts = 0; attempts < MAX_TRADING_DAY_WALK; attempts += 1) {
      if (isTradingDay(cursor)) return cursor;
      cursor = addDays(cursor, direction);
    }

    throw new Error(`Could not find trading day near ${date} for calendar ${config.calendarId}.`);
  }

  return {
    calendarId: config.calendarId,
    label: config.label ?? config.calendarId,
    category: config.category,
    description: config.description,
    source: config.source,
    sourceUrl: config.sourceUrl,
    coverageStartYear: config.coverageStartYear,
    coverageEndYear: config.coverageEndYear,
    notes: config.notes,
    getHolidays: (startYear, endYear) => holidaysForRange(config, startYear, endYear),
    getEvents: (startYear, endYear) => holidaysForRange(config, startYear, endYear),
    getHoliday,
    getEvent: getHoliday,
    isHoliday: (date) => getHoliday(date) !== null,
    isWeekend: isWeekendDate,
    isTradingDay,
    getNextTradingDay: (date) => walkTradingDay(date, 1),
    getPreviousTradingDay: (date) => walkTradingDay(date, -1),
    getTradingDays: (startDate, endDate) =>
      dateRange(startDate, endDate).filter((date) => isTradingDay(date)),
    getNonTradingDays: (startYear, endYear) =>
      holidaysForRange(config, startYear, endYear).filter(
        (holiday) =>
          holiday.isTradingDay !== true &&
          (weekendsAreTradingDays || !weekendDays.has(getDayOfWeek(holiday.date)))
      ),
  };
}
