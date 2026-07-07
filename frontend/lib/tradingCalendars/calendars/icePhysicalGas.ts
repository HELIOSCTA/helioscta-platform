import {
  addDays,
  buildDayAfterThanksgiving,
  buildGoodFriday,
  buildUsFederalActualAndObservedHolidays,
  createTradingCalendar,
  dateRange,
  getCalendarYear,
  sortUniqueHolidays,
} from "../core";
import type { CalendarDate, CalendarHoliday } from "../core";
import { buildHolidayValuesSelect } from "../sql";

export const ICE_PHYSICAL_GAS_CALENDAR_START_YEAR = 2020;
export const ICE_PHYSICAL_GAS_CALENDAR_END_YEAR = 2030;
export const ICE_PHYSICAL_GAS_CALENDAR_SOURCE =
  "ICE U.S. Next Day Gas Trading Calendar - Physical Natural Gas";

export function buildIcePhysicalGasNonTradingDays(year: number): CalendarHoliday[] {
  return sortUniqueHolidays([
    ...buildUsFederalActualAndObservedHolidays(year),
    buildGoodFriday(year, ICE_PHYSICAL_GAS_CALENDAR_SOURCE),
    buildDayAfterThanksgiving(year, ICE_PHYSICAL_GAS_CALENDAR_SOURCE),
  ]).map((holiday) => ({
    ...holiday,
    source: ICE_PHYSICAL_GAS_CALENDAR_SOURCE,
  }));
}

export const ICE_PHYSICAL_GAS_TRADING_CALENDAR = createTradingCalendar({
  calendarId: "ice-us-physical-gas",
  description: "ICE U.S. physical next-day natural gas trading calendar.",
  source: ICE_PHYSICAL_GAS_CALENDAR_SOURCE,
  weekendDays: [0, 6],
  holidaysForYear: buildIcePhysicalGasNonTradingDays,
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
