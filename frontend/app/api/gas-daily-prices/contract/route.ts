import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/gas-daily-prices/contract",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "Local-dev ICE physical gas contract history detail",
  p95TargetMs: 1_500,
  freshnessSource: "ice_python.settlements trade_date",
} as const;

interface GasContractHistorySourceRow {
  trade_date: string | Date;
  settlement: number | string | null;
  vwap_close: number | string | null;
  volume: number | string | null;
  open: number | string | null;
  high: number | string | null;
  low: number | string | null;
  close: number | string | null;
  open_interest: number | string | null;
  updated_at: string | Date | null;
  prior_settlement: number | string | null;
  settlement_5d_ago: number | string | null;
  settlement_20d_ago: number | string | null;
}

const GAS_SYMBOL_PATTERN = /^[A-Z0-9]{2,4} (?:D1-IPG|B0-IUS|[FGHJKMNQUVXZ][0-9]{2}-IUS)$/;

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateString(value: unknown): string | null {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

function parseIsoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

function normalizeSymbols(searchParams: URLSearchParams): string[] {
  const raw =
    searchParams.getAll("symbols").join(",") ||
    searchParams.getAll("symbol").join(",");
  const symbols = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const uniqueSymbols = [...new Set(symbols)];

  if (uniqueSymbols.length < 1 || uniqueSymbols.length > 2) {
    throw new Error("Gas detail requires one symbol or a Henry plus basis symbol pair.");
  }

  for (const symbol of uniqueSymbols) {
    if (!GAS_SYMBOL_PATTERN.test(symbol)) {
      throw new Error("Invalid gas symbol.");
    }
  }

  return uniqueSymbols;
}

function normalizeRow(row: GasContractHistorySourceRow) {
  return {
    tradeDate: toDateString(row.trade_date),
    settlement: toNumber(row.settlement),
    vwapClose: toNumber(row.vwap_close),
    volume: toNumber(row.volume),
    open: toNumber(row.open),
    high: toNumber(row.high),
    low: toNumber(row.low),
    close: toNumber(row.close),
    openInterest: toNumber(row.open_interest),
    updatedAt: toDateString(row.updated_at),
    priorSettlement: toNumber(row.prior_settlement),
    settlement5dAgo: toNumber(row.settlement_5d_ago),
    settlement20dAgo: toNumber(row.settlement_20d_ago),
  };
}

const CONTRACT_HISTORY_SQL = `
with daily as (
    select
        s.trade_date::date as trade_date,
        sum(nullif(s.settlement::text, 'NaN')::double precision) as settlement,
        sum(nullif(s.vwap_close::text, 'NaN')::double precision) as vwap_close,
        sum(nullif(s.volume::text, 'NaN')::double precision) as volume,
        sum(nullif(s.open::text, 'NaN')::double precision) as open,
        sum(nullif(s.high::text, 'NaN')::double precision) as high,
        sum(nullif(s.low::text, 'NaN')::double precision) as low,
        sum(nullif(s.close::text, 'NaN')::double precision) as close,
        sum(nullif(s.open_interest::text, 'NaN')::double precision) as open_interest,
        max(s.updated_at) as updated_at
    from ice_python.settlements as s
    where s.symbol = any($1::text[])
      and ($2::date is null or s.trade_date::date <= $2::date)
    group by s.trade_date::date
    having count(distinct s.symbol) = cardinality($1::text[])
),
history as (
    select
        daily.*,
        lag(daily.settlement, 1) over (order by daily.trade_date) as prior_settlement,
        lag(daily.settlement, 5) over (order by daily.trade_date) as settlement_5d_ago,
        lag(daily.settlement, 20) over (order by daily.trade_date) as settlement_20d_ago
    from daily
),
limited as (
    select *
    from history
    order by trade_date desc
    limit 750
)
select *
from limited
order by trade_date;
`;

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  if (!isLocalOnlyFeatureEnabled()) {
    return {
      status: 404,
      payload: { error: "Gas pricing is local-only while the ICE price grid is being validated." },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  const { searchParams } = new URL(request.url);
  const endTradeDateParam = searchParams.get("endTradeDate");
  const endTradeDate = parseIsoDate(endTradeDateParam);
  if (endTradeDateParam && !endTradeDate) {
    return {
      status: 400,
      payload: { error: "endTradeDate must be YYYY-MM-DD." },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  let symbols: string[];
  try {
    symbols = normalizeSymbols(searchParams);
  } catch (error) {
    return {
      status: 400,
      payload: { error: error instanceof Error ? error.message : "Invalid gas symbol." },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  const rows = await query<GasContractHistorySourceRow>(CONTRACT_HISTORY_SQL, [symbols, endTradeDate]);
  const history = rows.map(normalizeRow);
  const latest = history.at(-1) ?? null;
  const settlements = history
    .map((row) => row.settlement)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const volumes = history
    .map((row) => row.volume)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const windowStart = history.at(0) ?? null;
  const latestPrice = latest?.settlement ?? null;
  const priorSettlement = latest?.priorSettlement ?? null;
  const settlement5dAgo = latest?.settlement5dAgo ?? null;
  const settlement20dAgo = latest?.settlement20dAgo ?? null;

  return {
    payload: {
      product: "gas",
      source: "ice_python.settlements",
      sourceSymbols: symbols,
      aggregation: symbols.length === 1 ? "single" : "henry_plus_basis",
      rowCount: history.length,
      dataAsOf: latest?.tradeDate ?? null,
      history,
      stats: {
        latestPrice,
        latestVolume: latest?.volume ?? null,
        latestTradeDate: latest?.tradeDate ?? null,
        dayMove:
          latestPrice !== null && priorSettlement !== null ? latestPrice - priorSettlement : null,
        fiveDayMove:
          latestPrice !== null && settlement5dAgo !== null ? latestPrice - settlement5dAgo : null,
        twentyDayMove:
          latestPrice !== null && settlement20dAgo !== null ? latestPrice - settlement20dAgo : null,
        windowStartTradeDate: windowStart?.tradeDate ?? null,
        windowHigh: settlements.length ? Math.max(...settlements) : null,
        windowLow: settlements.length ? Math.min(...settlements) : null,
        firstSettlement: windowStart?.settlement ?? null,
        avgVolume: volumes.length
          ? volumes.reduce((sum, value) => sum + value, 0) / volumes.length
          : null,
      },
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: rows.length,
    dataAsOf: latest?.tradeDate ?? null,
  };
});

export function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
