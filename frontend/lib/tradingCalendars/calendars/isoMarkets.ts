import { createTradingCalendar } from "../core";
import type { CalendarHoliday } from "../core";

const ISO_MARKET_CALENDAR_SOURCE = "Promoted ISO DA/RT market-date metadata";
const ISO_MARKET_CALENDAR_NOTES =
  "ISO DA/RT LMP market dates are calendar-day markets in v1; exchange holidays do not suppress ISO market dates.";

function noIsoMarketClosures(): CalendarHoliday[] {
  return [];
}

function isoMarketCalendar({
  calendarId,
  label,
  description,
}: {
  calendarId: string;
  label: string;
  description: string;
}) {
  return createTradingCalendar({
    calendarId,
    label,
    category: "ISO market dates",
    description,
    source: ISO_MARKET_CALENDAR_SOURCE,
    notes: ISO_MARKET_CALENDAR_NOTES,
    weekendDays: [0, 6],
    weekendsAreTradingDays: true,
    holidaysForYear: noIsoMarketClosures,
  });
}

export const PJM_MARKET_CALENDAR = isoMarketCalendar({
  calendarId: "pjm-market",
  label: "PJM Market Dates",
  description: "Promoted PJM DA/RT hourly LMP market-date metadata.",
});

export const ERCOT_MARKET_CALENDAR = isoMarketCalendar({
  calendarId: "ercot-market",
  label: "ERCOT Market Dates",
  description: "Promoted ERCOT DAM/RT settlement-point market-date metadata.",
});

export const ISONE_MARKET_CALENDAR = isoMarketCalendar({
  calendarId: "isone-market",
  label: "ISO-NE Market Dates",
  description: "Promoted ISO-NE DA/final/preliminary RT hourly LMP market-date metadata.",
});

export const CAISO_MARKET_CALENDAR = isoMarketCalendar({
  calendarId: "caiso-market",
  label: "CAISO Market Dates",
  description: "Promoted CAISO DA/RT OASIS LMP operating-date metadata.",
});

export const MISO_MARKET_CALENDAR = isoMarketCalendar({
  calendarId: "miso-market",
  label: "MISO Market Dates",
  description: "Promoted MISO DA/prelim/final RT LMP operating-date metadata.",
});

export const SPP_MARKET_CALENDAR = isoMarketCalendar({
  calendarId: "spp-market",
  label: "SPP Market Dates",
  description: "Promoted SPP DA/preliminary RT LMP operating-date metadata.",
});

export const NYISO_MARKET_CALENDAR = isoMarketCalendar({
  calendarId: "nyiso-market",
  label: "NYISO Market Dates",
  description: "Promoted NYISO DA/preliminary RT LBMP operating-date metadata.",
});
