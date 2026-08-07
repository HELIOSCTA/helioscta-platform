import { observedJsonRoute } from "@/lib/server/apiObservability";
import {
  buildTradingCalendarPayloadCalendar,
  resolveTradingCalendarEntries,
  type TradingCalendarId,
} from "@/lib/tradingCalendars";

export const runtime = "nodejs";
export const maxDuration = 10;

const CACHE_HEADER = "public, s-maxage=3600, stale-while-revalidate=300";
const MIN_YEAR = 2020;
const MAX_YEAR = 2030;

const ROUTE_CONFIG = {
  route: "/api/trading-calendars",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=3600, stale-while-revalidate=300",
  owner: "frontend",
  purpose: "Code-owned trading calendar registry for promoted frontend exchange and ISO contexts",
  p95TargetMs: 300,
  freshnessSource: "code-owned trading calendar registry",
} as const;

function parseYear(value: string | null): number {
  const currentYear = new Date().getUTCFullYear();
  const parsed = Number.parseInt(value ?? "", 10);
  const year = Number.isInteger(parsed) ? parsed : currentYear;
  return Math.min(Math.max(year, MIN_YEAR), MAX_YEAR);
}

function parseIncludeObserved(value: string | null): boolean {
  return value !== "0" && value !== "false";
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const requestedCalendar = searchParams.get("calendar") ?? "all";
  const year = parseYear(searchParams.get("year"));
  const includeObserved = parseIncludeObserved(searchParams.get("includeObserved"));
  const entries = resolveTradingCalendarEntries(requestedCalendar);

  if (entries.length === 0) {
    return {
      status: 400,
      payload: { error: `Unknown trading calendar: ${requestedCalendar}` },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
      dataAsOf: null,
    };
  }

  const calendars = entries.map((entry) => buildTradingCalendarPayloadCalendar(entry, year));
  const dayRows = calendars.flatMap((calendar) => calendar.dayRows);
  const eventCount = calendars.reduce((total, calendar) => total + calendar.events.length, 0);
  const nonTradingDayCount = calendars.reduce(
    (total, calendar) => total + calendar.nonTradingDays.length,
    0,
  );
  const specialTradingDayCount = calendars.reduce(
    (total, calendar) => total + calendar.specialTradingDays.length,
    0,
  );

  return {
    payload: {
      year,
      includeObserved,
      requestedCalendar: requestedCalendar as TradingCalendarId | "all",
      calendars,
      dayRows,
      summary: {
        calendarCount: calendars.length,
        dayCount: dayRows.length,
        eventCount,
        nonTradingDayCount,
        specialTradingDayCount,
      },
      sourceNotes: {
        iceHolidayHours:
          "ICE holiday-hours pages and PDFs can change; this v1 calendar is code-owned and updates through frontend/dbt deploys.",
        isoMarketDates:
          "Promoted ISO calendars are market-date metadata, so weekends remain valid market dates.",
      },
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: dayRows.length,
    dataAsOf: new Date(Date.UTC(year, 0, 1)).toISOString().slice(0, 10),
  };
});
