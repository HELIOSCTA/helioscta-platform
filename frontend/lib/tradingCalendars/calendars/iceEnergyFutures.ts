import {
  buildGoodFriday,
  buildUsFederalActualAndObservedHolidays,
  createTradingCalendar,
  getDayOfWeek,
  sortUniqueHolidays,
} from "../core";
import type { CalendarHoliday, CalendarTradingStatus } from "../core";

export const ICE_US_ENERGY_FUTURES_CALENDAR_SOURCE =
  "ICE Futures U.S. 2026 Trading Holiday Calendar - Energy and Environmental Contracts";
export const ICE_US_ENERGY_FUTURES_CALENDAR_SOURCE_URL =
  "https://www.ice.com/publicdocs/futures/IFUS_Trading_Hours_Holiday_Calendar.pdf";
export const ICE_HOLIDAY_HOURS_SOURCE_URL = "https://www.ice.com/holiday-hours";

const STATUS_BY_HOLIDAY_NAME: Record<
  string,
  { label: string; status: CalendarTradingStatus; isTradingDay: boolean; notes?: string }
> = {
  "New Year's Day": {
    label: "New Year's Day",
    status: "closed",
    isTradingDay: false,
  },
  "Martin Luther King Jr. Day": {
    label: "Martin Luther King Day",
    status: "modified",
    isTradingDay: true,
    notes: "ICE marks Energy and Environmental contracts open with holiday trading hours announced by notice.",
  },
  "Washington's Birthday": {
    label: "Presidents Day",
    status: "modified",
    isTradingDay: true,
    notes: "ICE marks Energy and Environmental contracts open with holiday trading hours announced by notice.",
  },
  "Good Friday": {
    label: "Good Friday",
    status: "closed",
    isTradingDay: false,
  },
  "Memorial Day": {
    label: "Memorial Day",
    status: "modified",
    isTradingDay: true,
    notes: "ICE marks Energy and Environmental contracts open with holiday trading hours announced by notice.",
  },
  "Juneteenth National Independence Day": {
    label: "Juneteenth",
    status: "modified",
    isTradingDay: true,
    notes: "ICE marks Energy and Environmental contracts open with holiday trading hours announced by notice.",
  },
  "Independence Day": {
    label: "Independence Day",
    status: "modified",
    isTradingDay: true,
    notes: "ICE marks Energy and Environmental contracts open with holiday trading hours announced by notice.",
  },
  "Labor Day": {
    label: "Labor Day",
    status: "modified",
    isTradingDay: true,
    notes: "ICE marks Energy and Environmental contracts open with holiday trading hours announced by notice.",
  },
  "Columbus Day": {
    label: "Columbus Day",
    status: "open",
    isTradingDay: true,
  },
  "Veterans Day": {
    label: "Veterans Day",
    status: "open",
    isTradingDay: true,
  },
  "Thanksgiving Day": {
    label: "Thanksgiving Day",
    status: "modified",
    isTradingDay: true,
    notes: "ICE marks Energy and Environmental contracts open with holiday trading hours announced by notice.",
  },
  "Christmas Day": {
    label: "Christmas Day",
    status: "closed",
    isTradingDay: false,
  },
};

function futuresHolidayEvent(holiday: CalendarHoliday): CalendarHoliday | null {
  const status = STATUS_BY_HOLIDAY_NAME[holiday.name];
  if (!status) return null;

  return {
    date: holiday.date,
    name: status.label,
    source: ICE_US_ENERGY_FUTURES_CALENDAR_SOURCE,
    sourceUrl: ICE_US_ENERGY_FUTURES_CALENDAR_SOURCE_URL,
    category: status.isTradingDay ? "Holiday hours" : "Closed holiday",
    tradingStatus: status.status,
    isTradingDay: status.isTradingDay,
    notes: status.notes,
  };
}

export function buildIceUsEnergyFuturesEvents(year: number): CalendarHoliday[] {
  const holidays = [
    ...buildUsFederalActualAndObservedHolidays(year),
    buildGoodFriday(year, ICE_US_ENERGY_FUTURES_CALENDAR_SOURCE),
  ];
  const events = holidays
    .map(futuresHolidayEvent)
    .filter((holiday): holiday is CalendarHoliday => Boolean(holiday));

  if (year === 2026) {
    events.push({
      date: "2026-12-28",
      name: "Boxing Day",
      source: ICE_US_ENERGY_FUTURES_CALENDAR_SOURCE,
      sourceUrl: ICE_US_ENERGY_FUTURES_CALENDAR_SOURCE_URL,
      category: "Holiday hours",
      tradingStatus: "modified",
      isTradingDay: true,
      notes: "ICE marks Energy and Environmental contracts open with holiday trading hours announced by notice.",
    });
  }

  return sortUniqueHolidays(events).filter((event) => {
    const dayOfWeek = getDayOfWeek(event.date);
    return dayOfWeek !== 0 && dayOfWeek !== 6;
  });
}

export const ICE_US_ENERGY_FUTURES_CALENDAR = createTradingCalendar({
  calendarId: "ice-us-energy-futures",
  label: "ICE Futures U.S. Energy",
  category: "Energy futures",
  description: "ICE Futures U.S. Energy and Environmental holiday-hours calendar.",
  source: ICE_US_ENERGY_FUTURES_CALENDAR_SOURCE,
  sourceUrl: ICE_US_ENERGY_FUTURES_CALENDAR_SOURCE_URL,
  coverageStartYear: 2026,
  coverageEndYear: 2027,
  notes: "Closed days are non-trading; open1 holidays are modeled as modified trading days because ICE publishes detailed hours by notice.",
  weekendDays: [0, 6],
  holidaysForYear: buildIceUsEnergyFuturesEvents,
});
