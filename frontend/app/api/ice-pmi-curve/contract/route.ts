import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/ice-pmi-curve/contract",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "ICE PMI contract settlement history detail",
  p95TargetMs: 1_500,
  freshnessSource: "ice_python.settlements trade_date",
} as const;

interface ContractHistorySourceRow {
  trade_date: string | Date;
  settlement: number | string | null;
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

function normalizeSymbol(value: string | null): string {
  const symbol = (value ?? "").trim().toUpperCase();
  if (!/^PMI [FGHJKMNQUVXZ][0-9]{2}-IUS$/.test(symbol)) {
    throw new Error("Invalid PMI symbol.");
  }
  return symbol;
}

function normalizeRow(row: ContractHistorySourceRow) {
  return {
    tradeDate: toDateString(row.trade_date),
    settlement: toNumber(row.settlement),
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
with history as (
    select
        s.trade_date::date as trade_date,
        s.settlement::float8 as settlement,
        s.volume::float8 as volume,
        s.open::float8 as open,
        s.high::float8 as high,
        s.low::float8 as low,
        s.close::float8 as close,
        s.open_interest::float8 as open_interest,
        s.updated_at,
        lag(s.settlement::float8, 1) over (order by s.trade_date) as prior_settlement,
        lag(s.settlement::float8, 5) over (order by s.trade_date) as settlement_5d_ago,
        lag(s.settlement::float8, 20) over (order by s.trade_date) as settlement_20d_ago
    from ice_python.settlements as s
    where s.symbol = $1
      and s.settlement is not null
)
select *
from history
order by trade_date
limit 2500
`;

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const symbol = normalizeSymbol(searchParams.get("symbol"));
  const rows = await query<ContractHistorySourceRow>(CONTRACT_HISTORY_SQL, [symbol]);
  const history = rows.map(normalizeRow);
  const latest = history.at(-1) ?? null;
  const settlements = history
    .map((row) => row.settlement)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const volumes = history
    .map((row) => row.volume)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const windowStart = history.at(0) ?? null;
  const windowHigh = settlements.length ? Math.max(...settlements) : null;
  const windowLow = settlements.length ? Math.min(...settlements) : null;
  const avgVolume = volumes.length
    ? volumes.reduce((sum, value) => sum + value, 0) / volumes.length
    : null;
  const latestPrice = latest?.settlement ?? null;
  const priorSettlement = latest?.priorSettlement ?? null;
  const settlement5dAgo = latest?.settlement5dAgo ?? null;
  const settlement20dAgo = latest?.settlement20dAgo ?? null;
  const dayMove =
    latestPrice !== null && priorSettlement !== null ? latestPrice - priorSettlement : null;
  const fiveDayMove =
    latestPrice !== null && settlement5dAgo !== null ? latestPrice - settlement5dAgo : null;
  const twentyDayMove =
    latestPrice !== null && settlement20dAgo !== null ? latestPrice - settlement20dAgo : null;

  return {
    payload: {
      product: "PMI",
      symbol,
      source: "ice_python.settlements",
      rowCount: history.length,
      dataAsOf: latest?.tradeDate ?? null,
      history,
      stats: {
        latestPrice,
        latestVolume: latest?.volume ?? null,
        latestTradeDate: latest?.tradeDate ?? null,
        dayMove,
        fiveDayMove,
        twentyDayMove,
        windowStartTradeDate: windowStart?.tradeDate ?? null,
        windowHigh,
        windowLow,
        firstSettlement: windowStart?.settlement ?? null,
        avgVolume,
      },
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: rows.length,
    dataAsOf: latest?.tradeDate ?? null,
  };
});

export async function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
