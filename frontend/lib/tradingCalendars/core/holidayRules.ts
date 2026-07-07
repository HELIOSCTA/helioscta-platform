import {
  addDays,
  getFederalObservedDate,
  getWesternEasterDate,
  lastWeekdayOfMonth,
  makeCalendarDate,
  nthWeekdayOfMonth,
} from "./dates";
import type { CalendarHoliday } from "./types";

export const US_FEDERAL_HOLIDAY_SOURCE = "U.S. federal holiday rules";

function fixedActualAndObserved(
  year: number,
  month: number,
  day: number,
  name: string,
  source = US_FEDERAL_HOLIDAY_SOURCE
): CalendarHoliday[] {
  const actual = makeCalendarDate(year, month, day);
  const observed = getFederalObservedDate(actual);
  const holidays: CalendarHoliday[] = [{ date: actual, name, source }];

  if (observed !== actual) {
    holidays.push({ date: observed, name, source });
  }

  return holidays;
}

export function sortUniqueHolidays(holidays: CalendarHoliday[]): CalendarHoliday[] {
  const byDate = new Map<string, CalendarHoliday>();

  for (const holiday of holidays) {
    const existing = byDate.get(holiday.date);
    if (!existing) {
      byDate.set(holiday.date, holiday);
      continue;
    }

    byDate.set(holiday.date, {
      date: holiday.date,
      name:
        existing.name === holiday.name
          ? existing.name
          : `${existing.name}; ${holiday.name}`,
      source: existing.source ?? holiday.source,
    });
  }

  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function buildUsFederalActualAndObservedHolidays(year: number): CalendarHoliday[] {
  const holidays: CalendarHoliday[] = [
    ...fixedActualAndObserved(year, 1, 1, "New Year's Day"),
    {
      date: nthWeekdayOfMonth(year, 1, 1, 3),
      name: "Martin Luther King Jr. Day",
      source: US_FEDERAL_HOLIDAY_SOURCE,
    },
    {
      date: nthWeekdayOfMonth(year, 2, 1, 3),
      name: "Washington's Birthday",
      source: US_FEDERAL_HOLIDAY_SOURCE,
    },
    {
      date: lastWeekdayOfMonth(year, 5, 1),
      name: "Memorial Day",
      source: US_FEDERAL_HOLIDAY_SOURCE,
    },
    ...fixedActualAndObserved(year, 7, 4, "Independence Day"),
    {
      date: nthWeekdayOfMonth(year, 9, 1, 1),
      name: "Labor Day",
      source: US_FEDERAL_HOLIDAY_SOURCE,
    },
    {
      date: nthWeekdayOfMonth(year, 10, 1, 2),
      name: "Columbus Day",
      source: US_FEDERAL_HOLIDAY_SOURCE,
    },
    ...fixedActualAndObserved(year, 11, 11, "Veterans Day"),
    {
      date: nthWeekdayOfMonth(year, 11, 4, 4),
      name: "Thanksgiving Day",
      source: US_FEDERAL_HOLIDAY_SOURCE,
    },
    ...fixedActualAndObserved(year, 12, 25, "Christmas Day"),
  ];

  if (year >= 2021) {
    holidays.push(...fixedActualAndObserved(year, 6, 19, "Juneteenth National Independence Day"));
  }

  return sortUniqueHolidays(holidays);
}

export function buildGoodFriday(year: number, source?: string): CalendarHoliday {
  return {
    date: addDays(getWesternEasterDate(year), -2),
    name: "Good Friday",
    source,
  };
}

export function buildDayAfterThanksgiving(year: number, source?: string): CalendarHoliday {
  return {
    date: addDays(nthWeekdayOfMonth(year, 11, 4, 4), 1),
    name: "Day After Thanksgiving",
    source,
  };
}
