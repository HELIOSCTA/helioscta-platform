import {
  addDays,
  buildDayAfterThanksgiving,
  buildGoodFriday,
  buildUsFederalActualAndObservedHolidays,
  createTradingCalendar,
  dateRange,
  getCalendarYear,
  getDayOfWeek,
  sortUniqueHolidays,
} from "../core";
import type { CalendarDate, CalendarHoliday } from "../core";
import { buildHolidayValuesSelect } from "../sql";

export const ICE_PHYSICAL_GAS_CALENDAR_START_YEAR = 2020;
export const ICE_PHYSICAL_GAS_CALENDAR_END_YEAR = 2030;
export const ICE_PHYSICAL_GAS_CALENDAR_SOURCE =
  "ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas";
export const ICE_PHYSICAL_GAS_CALENDAR_SOURCE_URL =
  "https://www.ice.com/publicdocs/support/phys_gas_calendar.pdf";

function icePhysicalGasEvent(holiday: CalendarHoliday): CalendarHoliday {
  return {
    ...holiday,
    source: ICE_PHYSICAL_GAS_CALENDAR_SOURCE,
    sourceUrl: ICE_PHYSICAL_GAS_CALENDAR_SOURCE_URL,
    category: "Non-trading day",
    tradingStatus: "closed",
    isTradingDay: false,
  };
}

export function buildIcePhysicalGasNonTradingDays(year: number): CalendarHoliday[] {
  return sortUniqueHolidays([
    ...buildUsFederalActualAndObservedHolidays(year),
    buildGoodFriday(year, ICE_PHYSICAL_GAS_CALENDAR_SOURCE),
    buildDayAfterThanksgiving(year, ICE_PHYSICAL_GAS_CALENDAR_SOURCE),
  ])
    .filter((holiday) => {
      const dayOfWeek = getDayOfWeek(holiday.date);
      return dayOfWeek !== 0 && dayOfWeek !== 6;
    })
    .map(icePhysicalGasEvent);
}

export function buildIcePhysicalGasSpecialTradingDays(year: number): CalendarHoliday[] {
  if (year !== 2026) return [];

  return [
    {
      date: "2026-05-22",
      name: "Special Next Day Trading Day",
      source: ICE_PHYSICAL_GAS_CALENDAR_SOURCE,
      sourceUrl: ICE_PHYSICAL_GAS_CALENDAR_SOURCE_URL,
      category: "Special trading day",
      tradingStatus: "special",
      isTradingDay: true,
      notes: "ICE 2026 physical gas calendar marks this as a special trading day and Day 1 of bidweek.",
    },
    {
      date: "2026-12-24",
      name: "Special Next Day Trading Day",
      source: ICE_PHYSICAL_GAS_CALENDAR_SOURCE,
      sourceUrl: ICE_PHYSICAL_GAS_CALENDAR_SOURCE_URL,
      category: "Special trading day",
      tradingStatus: "special",
      isTradingDay: true,
      notes: "ICE 2026 physical gas calendar marks this as a special trading day and Day 1 of bidweek.",
    },
  ];
}

export function buildIcePhysicalGasCalendarEvents(year: number): CalendarHoliday[] {
  return sortUniqueHolidays([
    ...buildIcePhysicalGasNonTradingDays(year),
    ...buildIcePhysicalGasSpecialTradingDays(year),
  ]);
}

export const ICE_PHYSICAL_GAS_TRADING_CALENDAR = createTradingCalendar({
  calendarId: "ice-us-physical-gas",
  label: "ICE U.S. Physical Gas",
  category: "Gas",
  description: "ICE U.S. physical next-day natural gas trading calendar.",
  source: ICE_PHYSICAL_GAS_CALENDAR_SOURCE,
  sourceUrl: ICE_PHYSICAL_GAS_CALENDAR_SOURCE_URL,
  coverageStartYear: ICE_PHYSICAL_GAS_CALENDAR_START_YEAR,
  coverageEndYear: ICE_PHYSICAL_GAS_CALENDAR_END_YEAR,
  notes: "Rule-owned U.S. physical gas non-trading calendar; 2026 special trading-day notes are sourced from ICE's current calendar PDF.",
  weekendDays: [0, 6],
  holidaysForYear: buildIcePhysicalGasCalendarEvents,
});

export function getIcePhysicalGasNonTradingDays(
  startYear = ICE_PHYSICAL_GAS_CALENDAR_START_YEAR,
  endYear = ICE_PHYSICAL_GAS_CALENDAR_END_YEAR
): CalendarHoliday[] {
  return ICE_PHYSICAL_GAS_TRADING_CALENDAR.getNonTradingDays(startYear, endYear);
}

export function buildIcePhysicalGasNonTradingDaysValuesSql(
  startYear = ICE_PHYSICAL_GAS_CALENDAR_START_YEAR,
  endYear = ICE_PHYSICAL_GAS_CALENDAR_END_YEAR
): string {
  return buildHolidayValuesSelect(getIcePhysicalGasNonTradingDays(startYear, endYear), {
    dateColumn: "non_trading_date",
    nameColumn: "holiday_name",
    sourceColumn: "calendar_source",
  });
}

export function getGasDaysPricedByIceTradeDate(tradeDate: CalendarDate): CalendarDate[] {
  const nextTradingDay = ICE_PHYSICAL_GAS_TRADING_CALENDAR.getNextTradingDay(tradeDate);
  return dateRange(addDays(tradeDate, 1), nextTradingDay);
}

export function getIceTradeDateForGasDay(gasDay: CalendarDate): CalendarDate {
  let cursor = addDays(gasDay, -1);

  while (!ICE_PHYSICAL_GAS_TRADING_CALENDAR.isTradingDay(cursor)) {
    cursor = addDays(cursor, -1);
  }

  return cursor;
}

export function getIcePhysicalGasCalendarYearRange(
  startDate: CalendarDate,
  endDate?: CalendarDate | null
): { startYear: number; endYear: number } {
  const startYear = Math.min(
    getCalendarYear(startDate),
    ICE_PHYSICAL_GAS_CALENDAR_START_YEAR
  );
  const endYear = Math.max(
    endDate ? getCalendarYear(endDate) + 1 : ICE_PHYSICAL_GAS_CALENDAR_END_YEAR,
    ICE_PHYSICAL_GAS_CALENDAR_END_YEAR
  );

  return { startYear, endYear };
}
