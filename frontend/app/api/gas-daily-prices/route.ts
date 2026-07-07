import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import {
  NEXT_DAY_GAS_DAILY_HUBS,
  buildDailyGasHubValuesSql,
  type DailyGasPriceRow,
  type DailyGasPricesPayload,
} from "@/lib/gasPricing";
import { buildIcePhysicalGasNonTradingDaysValuesSql } from "@/lib/tradingCalendars";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const DEFAULT_RANGE_DAYS = 14;
const MAX_RANGE_DAYS = 120;

const ROUTE_CONFIG = {
  route: "/api/gas-daily-prices",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "Local-dev ICE physical gas daily gas-day WVAP Close grid",
  p95TargetMs: 2_500,
  freshnessSource: "ice_python.settlements updated_at",
} as const;

interface RawGasPriceRow {
  gas_day: string;
  trade_date: string;
  symbol: string;
  value: number | string | null;
  updated_at: string | null;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

function parseIsoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

function addDaysIso(value: string, days: number): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  const parsed = new Date();
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function inclusiveDays(startDate: string, endDate: string): number {
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const endMs = Date.parse(`${endDate}T00:00:00Z`);
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

function parseDateRange(searchParams: URLSearchParams): { range: DateRange | null; error: string | null } {
  const startParam = searchParams.get("startDate");
  const endParam = searchParams.get("endDate");
  const parsedStart = parseIsoDate(startParam);
  const parsedEnd = parseIsoDate(endParam);

  if (startParam && !parsedStart) {
    return { range: null, error: "startDate must be YYYY-MM-DD." };
  }
  if (endParam && !parsedEnd) {
    return { range: null, error: "endDate must be YYYY-MM-DD." };
  }

  const endDate = parsedEnd ?? defaultEndDate();
  const startDate = parsedStart ?? addDaysIso(endDate, -(DEFAULT_RANGE_DAYS - 1));
  const dayCount = inclusiveDays(startDate, endDate);

  if (dayCount < 1) {
    return { range: null, error: "startDate must be on or before endDate." };
  }
  if (dayCount > MAX_RANGE_DAYS) {
    return { range: null, error: `Date range cannot exceed ${MAX_RANGE_DAYS} gas days.` };
  }

  return { range: { startDate, endDate }, error: null };
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function maxString(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function dateParts(date: string): { year: number; month: number; label: string } {
  const parsed = new Date(`${date}T00:00:00Z`);
  const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][parsed.getUTCDay()];
  const monthName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    parsed.getUTCMonth()
  ];
  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    label: `${dayName} ${monthName}-${String(parsed.getUTCDate()).padStart(2, "0")} ${parsed.getUTCFullYear()}`,
  };
}

function buildSql(): string {
  return `
    with params as (
      select
        $1::date as start_date,
        $2::date as end_date
    ),
    hub_registry as (
      select *
      from (
        values
${buildDailyGasHubValuesSql()}
      ) as t(symbol, label, short_label, region, sort_order)
    ),
    non_trading_days as (
${buildIcePhysicalGasNonTradingDaysValuesSql(2020, 2030)}
    ),
    calendar_bounds as (
      select
        (start_date - interval '10 days')::date as calendar_start,
        (end_date + interval '15 days')::date as calendar_end
      from params
    ),
    date_spine as (
      select generate_series(calendar_start, calendar_end, interval '1 day')::date as calendar_date
      from calendar_bounds
    ),
    trading_days as (
      select calendar_date as trade_date
      from date_spine
      where extract(dow from calendar_date) between 1 and 5
        and calendar_date not in (select non_trading_date from non_trading_days)
    ),
    sessions as (
      select
        trade_date,
        lead(trade_date) over (order by trade_date) as next_trade_date
      from trading_days
    ),
    gas_day_trade_dates as (
      select
        s.trade_date,
        gas_day::date as gas_day
      from sessions s
      cross join lateral generate_series(
        (s.trade_date + interval '1 day')::date,
        s.next_trade_date::date,
        interval '1 day'
      ) as gas_day
      where s.next_trade_date is not null
    ),
    source_prices as (
      select
        s.trade_date::date as trade_date,
        h.symbol,
        max(s.vwap_close)::double precision as value,
        max(s.updated_at) as updated_at
      from ice_python.settlements s
      join hub_registry h
        on h.symbol = s.symbol
      cross join calendar_bounds b
      where s.trade_date::date between b.calendar_start and b.calendar_end
      group by s.trade_date::date, h.symbol
    )
    select
      g.gas_day::text as gas_day,
      g.trade_date::text as trade_date,
      h.symbol,
      sp.value,
      to_char(sp.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as updated_at
    from gas_day_trade_dates g
    cross join params p
    cross join hub_registry h
    left join source_prices sp
      on sp.trade_date = g.trade_date
     and sp.symbol = h.symbol
    where g.gas_day between p.start_date and p.end_date
    order by g.gas_day desc, h.sort_order;
  `;
}

function buildRows(rawRows: RawGasPriceRow[]): DailyGasPriceRow[] {
  const byGasDay = new Map<string, DailyGasPriceRow>();

  for (const raw of rawRows) {
    const gasDay = raw.gas_day;
    let row = byGasDay.get(gasDay);
    if (!row) {
      const parts = dateParts(gasDay);
      row = {
        gasDay,
        tradeDate: raw.trade_date,
        year: parts.year,
        month: parts.month,
        gasDayLabel: parts.label,
        values: Object.fromEntries(NEXT_DAY_GAS_DAILY_HUBS.map((hub) => [hub.symbol, null])),
      };
      byGasDay.set(gasDay, row);
    }
    row.values[raw.symbol] = toNumber(raw.value);
  }

  return [...byGasDay.values()].sort((left, right) => right.gasDay.localeCompare(left.gasDay));
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  if (!isLocalOnlyFeatureEnabled()) {
    return {
      status: 404,
      payload: { error: "Gas daily prices are local-only while the ICE price grid is being validated." },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  const { searchParams } = new URL(request.url);
  const parsedRange = parseDateRange(searchParams);
  if (!parsedRange.range) {
    return {
      status: 400,
      payload: { error: parsedRange.error ?? "Invalid gas-day date range." },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  const rawRows = await query<RawGasPriceRow>(buildSql(), [parsedRange.range.startDate, parsedRange.range.endDate]);
  const rows = buildRows(rawRows);

  if (!rows.length) {
    return {
      status: 404,
      payload: { error: "No ICE physical gas daily prices are available for the selected gas-day range." },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  const dataAsOf = maxString(rawRows.map((row) => row.updated_at));
  const payload: DailyGasPricesPayload = {
    priceBasis: "vwap_close",
    startDate: parsedRange.range.startDate,
    endDate: parsedRange.range.endDate,
    hubs: NEXT_DAY_GAS_DAILY_HUBS,
    rows,
  };

  return {
    payload,
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: rawRows.length,
    dataAsOf,
  };
});

export function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
