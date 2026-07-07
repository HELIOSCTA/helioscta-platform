import {
  createTradingCalendar,
  getSundayMondayObservedDate,
  lastWeekdayOfMonth,
  makeCalendarDate,
  nthWeekdayOfMonth,
  sortUniqueHolidays,
} from "../core";
import type { CalendarDate, CalendarHoliday } from "../core";
import { buildHolidayValuesSelect } from "../sql";

export const NERC_OFF_PEAK_CALENDAR_SOURCE = "NERC additional off-peak day rules";

function fixedNercHoliday(year: number, month: number, day: number, name: string): CalendarHoliday {
  return {
    date: getSundayMondayObservedDate(makeCalendarDate(year, month, day)),
    name,
    source: NERC_OFF_PEAK_CALENDAR_SOURCE,
  };
}

export function buildNercOffPeakDays(year: number): CalendarHoliday[] {
  return sortUniqueHolidays([
    fixedNercHoliday(year, 1, 1, "New Year's Day"),
    {
      date: lastWeekdayOfMonth(year, 5, 1),
      name: "Memorial Day",
      source: NERC_OFF_PEAK_CALENDAR_SOURCE,
    },
    fixedNercHoliday(year, 7, 4, "Independence Day"),
    {
      date: nthWeekdayOfMonth(year, 9, 1, 1),
      name: "Labor Day",
      source: NERC_OFF_PEAK_CALENDAR_SOURCE,
    },
    {
      date: nthWeekdayOfMonth(year, 11, 4, 4),
      name: "Thanksgiving Day",
      source: NERC_OFF_PEAK_CALENDAR_SOURCE,
    },
    fixedNercHoliday(year, 12, 25, "Christmas Day"),
  ]);
}

export const NERC_OFF_PEAK_CALENDAR = createTradingCalendar({
  calendarId: "nerc-off-peak-days",
  description: "NERC holiday set used for power on-peak/off-peak classification.",
  source: NERC_OFF_PEAK_CALENDAR_SOURCE,
  weekendDays: [0, 6],
  holidaysForYear: buildNercOffPeakDays,
});

export function getNercOffPeakDays(startYear: number, endYear: number): CalendarHoliday[] {
  return NERC_OFF_PEAK_CALENDAR.getHolidays(startYear, endYear);
}

export function buildNercOffPeakDaysValuesSql(startYear: number, endYear: number): string {
  return buildHolidayValuesSelect(getNercOffPeakDays(startYear, endYear), {
    dateColumn: "holiday_date",
    nameColumn: "holiday_name",
    sourceColumn: "calendar_source",
  });
}

export function isNercOffPeakDay(date: CalendarDate): boolean {
  return NERC_OFF_PEAK_CALENDAR.isWeekend(date) || NERC_OFF_PEAK_CALENDAR.isHoliday(date);
}

export function isNercHoliday(date: CalendarDate): boolean {
  return NERC_OFF_PEAK_CALENDAR.isHoliday(date);
}

export function isPjmPowerOnPeakHour(operatingDate: CalendarDate, hourEnding: number): boolean {
  if (!Number.isInteger(hourEnding) || hourEnding < 1 || hourEnding > 24) {
    throw new Error(`Expected hour ending 1-24, got ${hourEnding}.`);
  }

  return hourEnding >= 8 && hourEnding <= 23 && !isNercOffPeakDay(operatingDate);
}

export function classifyPjmPowerHour(
  operatingDate: CalendarDate,
  hourEnding: number
): "onpeak" | "offpeak" {
  return isPjmPowerOnPeakHour(operatingDate, hourEnding) ? "onpeak" : "offpeak";
}
