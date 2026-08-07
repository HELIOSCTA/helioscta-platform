import { dateRange, getDayOfWeek } from "../core";
import type { CalendarDate, CalendarHoliday, TradingCalendar } from "../core";
import { ICE_PHYSICAL_GAS_TRADING_CALENDAR } from "./icePhysicalGas";
import { ICE_US_ENERGY_FUTURES_CALENDAR } from "./iceEnergyFutures";
import {
  CAISO_MARKET_CALENDAR,
  ERCOT_MARKET_CALENDAR,
  ISONE_MARKET_CALENDAR,
  MISO_MARKET_CALENDAR,
  NYISO_MARKET_CALENDAR,
  PJM_MARKET_CALENDAR,
  SPP_MARKET_CALENDAR,
} from "./isoMarkets";
import { NERC_OFF_PEAK_CALENDAR } from "./pjmPower";

export const TRADING_CALENDAR_IDS = [
  "nerc-power-offpeak",
  "ice-us-physical-gas",
  "ice-us-energy-futures",
  "pjm-market",
  "ercot-market",
  "isone-market",
  "caiso-market",
  "miso-market",
  "spp-market",
  "nyiso-market",
] as const;

export type TradingCalendarId = (typeof TRADING_CALENDAR_IDS)[number];

export interface TradingCalendarRegistryEntry {
  id: TradingCalendarId;
  calendar: TradingCalendar;
  sourceCoverage?: string;
}

export interface TradingCalendarDayRow {
  calendarId: TradingCalendarId;
  calendarLabel: string;
  category: string;
  date: CalendarDate;
  year: number;
  dayOfWeek: number;
  dayName: string;
  isWeekend: boolean;
  isHoliday: boolean;
  isTradingDay: boolean;
  eventName: string | null;
  eventNames: string[];
  eventCategory: string | null;
  tradingStatus: string;
  previousTradingDate: CalendarDate;
  nextTradingDate: CalendarDate;
  source: string | null;
  sourceUrl: string | null;
  notes: string | null;
}

export interface TradingCalendarPayloadCalendar {
  calendarId: TradingCalendarId;
  label: string;
  category: string;
  description: string;
  source: string | null;
  sourceUrl: string | null;
  coverageStartYear: number | null;
  coverageEndYear: number | null;
  sourceCoverage: string | null;
  notes: string | null;
  events: CalendarHoliday[];
  nonTradingDays: CalendarHoliday[];
  specialTradingDays: CalendarHoliday[];
  dayRows: TradingCalendarDayRow[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const TRADING_CALENDAR_REGISTRY: TradingCalendarRegistryEntry[] = [
  {
    id: "nerc-power-offpeak",
    calendar: NERC_OFF_PEAK_CALENDAR,
    sourceCoverage: "Rule-owned six-day NERC off-peak holiday set with Sunday-to-Monday observation.",
  },
  {
    id: "ice-us-physical-gas",
    calendar: ICE_PHYSICAL_GAS_TRADING_CALENDAR,
    sourceCoverage: "Rule-owned physical gas non-trading days with current ICE 2026 special-day notes.",
  },
  {
    id: "ice-us-energy-futures",
    calendar: ICE_US_ENERGY_FUTURES_CALENDAR,
    sourceCoverage: "ICE Futures U.S. 2026 Energy holiday-hours PDF; open1 rows are modeled as modified trading days.",
  },
  {
    id: "pjm-market",
    calendar: PJM_MARKET_CALENDAR,
    sourceCoverage: "Promoted PJM DA/RT frontend market-date context.",
  },
  {
    id: "ercot-market",
    calendar: ERCOT_MARKET_CALENDAR,
    sourceCoverage: "Promoted ERCOT DAM/RT frontend market-date context.",
  },
  {
    id: "isone-market",
    calendar: ISONE_MARKET_CALENDAR,
    sourceCoverage: "Promoted ISO-NE DA/RT frontend market-date context.",
  },
  {
    id: "caiso-market",
    calendar: CAISO_MARKET_CALENDAR,
    sourceCoverage: "Promoted CAISO DA/RT frontend market-date context.",
  },
  {
    id: "miso-market",
    calendar: MISO_MARKET_CALENDAR,
    sourceCoverage: "Promoted MISO DA/RT frontend market-date context.",
  },
  {
    id: "spp-market",
    calendar: SPP_MARKET_CALENDAR,
    sourceCoverage: "Promoted SPP DA/RT frontend market-date context.",
  },
  {
    id: "nyiso-market",
    calendar: NYISO_MARKET_CALENDAR,
    sourceCoverage: "Promoted NYISO DA/RT frontend market-date context.",
  },
];

const ENTRY_BY_ID = new Map<TradingCalendarId, TradingCalendarRegistryEntry>(
  TRADING_CALENDAR_REGISTRY.map((entry) => [entry.id, entry]),
);

const CALENDAR_ALIASES: Record<string, TradingCalendarId> = {
  "nerc-off-peak-days": "nerc-power-offpeak",
  "pjm-power": "nerc-power-offpeak",
};

function isTradingCalendarId(value: string): value is TradingCalendarId {
  return TRADING_CALENDAR_IDS.includes(value as TradingCalendarId);
}

export function getTradingCalendarEntry(
  calendarId: string,
): TradingCalendarRegistryEntry | null {
  const normalized = CALENDAR_ALIASES[calendarId] ?? calendarId;
  if (!isTradingCalendarId(normalized)) return null;
  return ENTRY_BY_ID.get(normalized) ?? null;
}

export function resolveTradingCalendarEntries(calendarId: string | null): TradingCalendarRegistryEntry[] {
  if (!calendarId || calendarId === "all") return TRADING_CALENDAR_REGISTRY;
  const entry = getTradingCalendarEntry(calendarId);
  return entry ? [entry] : [];
}

function eventNames(event: CalendarHoliday | null): string[] {
  return event?.name.split(";").map((name) => name.trim()).filter(Boolean) ?? [];
}

function eventTradingStatus(event: CalendarHoliday | null, isTradingDay: boolean): string {
  if (event?.tradingStatus) return event.tradingStatus;
  return isTradingDay ? "open" : "non-trading";
}

export function buildTradingCalendarDayRows(
  entry: TradingCalendarRegistryEntry,
  year: number,
): TradingCalendarDayRow[] {
  const { calendar, id } = entry;
  return dateRange(`${year}-01-01`, `${year}-12-31`).map((date) => {
    const event = calendar.getEvent(date);
    const isTradingDay = calendar.isTradingDay(date);
    const dayOfWeek = getDayOfWeek(date);

    return {
      calendarId: id,
      calendarLabel: calendar.label,
      category: calendar.category ?? "Calendar",
      date,
      year,
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek],
      isWeekend: calendar.isWeekend(date),
      isHoliday: Boolean(event),
      isTradingDay,
      eventName: event?.name ?? null,
      eventNames: eventNames(event),
      eventCategory: event?.category ?? null,
      tradingStatus: eventTradingStatus(event, isTradingDay),
      previousTradingDate: calendar.getPreviousTradingDay(date),
      nextTradingDate: calendar.getNextTradingDay(date),
      source: event?.source ?? calendar.source ?? null,
      sourceUrl: event?.sourceUrl ?? calendar.sourceUrl ?? null,
      notes: event?.notes ?? null,
    };
  });
}

export function buildTradingCalendarPayloadCalendar(
  entry: TradingCalendarRegistryEntry,
  year: number,
): TradingCalendarPayloadCalendar {
  const { calendar, id } = entry;
  const events = calendar.getEvents(year, year);
  const nonTradingDays = events.filter((event) => event.isTradingDay !== true);
  const specialTradingDays = events.filter(
    (event) => event.isTradingDay === true && event.tradingStatus !== "open",
  );

  return {
    calendarId: id,
    label: calendar.label,
    category: calendar.category ?? "Calendar",
    description: calendar.description,
    source: calendar.source ?? null,
    sourceUrl: calendar.sourceUrl ?? null,
    coverageStartYear: calendar.coverageStartYear ?? null,
    coverageEndYear: calendar.coverageEndYear ?? null,
    sourceCoverage: entry.sourceCoverage ?? null,
    notes: calendar.notes ?? null,
    events,
    nonTradingDays,
    specialTradingDays,
    dayRows: buildTradingCalendarDayRows(entry, year),
  };
}
