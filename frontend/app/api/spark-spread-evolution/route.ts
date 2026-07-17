import { NextResponse } from "next/server";

import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import {
  buildSettlementSymbols,
  buildSparkEvolutionData,
  resolveStrip,
  validStrip,
  type SettlementValueRow,
} from "@/lib/sparkSpreads/evolution";
import {
  DEFAULT_SPARK_GAS_LEG,
  DEFAULT_POWER_SPARK_SPREAD_PRODUCT,
  getSparkGasLeg,
  getPowerSparkSpreadProduct,
} from "@/lib/sparkSpreads/products";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const MONTH_STRIP_CODES = ["F", "G", "H", "J", "K", "M", "N", "Q", "U", "V", "X", "Z"] as const;
const YEAR_LOOKBACK = 6;
const YEAR_LOOKAHEAD = 3;

const ROUTE_CONFIG = {
  route: "/api/spark-spread-evolution",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "ICE Python settlement-backed spark spread evolution",
  p95TargetMs: 2_500,
  freshnessSource: "ice_python.settlements updated_at",
} as const;

interface RawSettlementValueRow {
  symbol: string;
  trade_date: string;
  value: number | string | null;
  updated_at: string | null;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberParam(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function maxString(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function currentMonthStrip(): string {
  const today = new Date();
  const currentMonthIndex = today.getUTCMonth();
  const currentYear = today.getUTCFullYear();
  const expiry = secondBusinessDayAfterDeliveryMonth(currentMonthIndex + 1, currentYear);
  const todayUtc = Date.UTC(currentYear, currentMonthIndex, today.getUTCDate());
  const defaultMonthIndex = todayUtc > expiry.getTime() ? currentMonthIndex + 1 : currentMonthIndex;
  return MONTH_STRIP_CODES[defaultMonthIndex % MONTH_STRIP_CODES.length] ?? "F";
}

function secondBusinessDayAfterDeliveryMonth(month: number, year: number): Date {
  const date = new Date(Date.UTC(year, month, 1));
  let count = 0;
  while (count < 2) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    if (count < 2) date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const strip = validStrip(searchParams.get("strip") ?? searchParams.get("sparkStrip")) ?? currentMonthStrip();
  const baseProduct =
    getPowerSparkSpreadProduct(searchParams.get("sparkProduct")) ?? DEFAULT_POWER_SPARK_SPREAD_PRODUCT;
  const gasLeg = getSparkGasLeg(searchParams.get("sparkGasLeg")) ?? DEFAULT_SPARK_GAS_LEG;
  const product = {
    ...baseProduct,
    gasRoot: gasLeg.gasRoot,
    basisRoot: gasLeg.basisRoot,
    gasLabel: gasLeg.gasLabel,
    heatRate: numberParam(searchParams.get("heatRate"), baseProduct.heatRate, 3, 20),
  };
  const currentYear = new Date().getUTCFullYear();
  const startYear = currentYear - YEAR_LOOKBACK;
  const endYear = currentYear + YEAR_LOOKAHEAD;
  const resolvedStrip = resolveStrip(strip);
  const symbols = buildSettlementSymbols({
    product,
    stripCodes: resolvedStrip.codes,
    startYear,
    endYear,
  });

  const rows = await query<RawSettlementValueRow>(
    `
      SELECT
        symbol,
        trade_date::text AS trade_date,
        NULLIF(settlement::text, 'NaN')::double precision AS value,
        to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at
      FROM ice_python.settlements
      WHERE symbol = ANY($1::text[])
        AND settlement IS NOT NULL
        AND settlement::text <> 'NaN'
      ORDER BY trade_date ASC, symbol ASC
    `,
    [symbols],
  );

  const normalizedRows: SettlementValueRow[] = [];
  for (const row of rows) {
    const value = toNumber(row.value);
    if (value === null) continue;
    normalizedRows.push({
      symbol: row.symbol,
      trade_date: row.trade_date,
      value,
    });
  }
  const latestUpdatedAt = maxString(rows.map((row) => row.updated_at));
  const payload = buildSparkEvolutionData({
    rows: normalizedRows,
    strip,
    product,
    latestUpdatedAt,
  });

  if (!payload.data.length && !payload.powerData.length) {
    return {
      status: 404,
      payload: {
        error: "No ICE settlement rows are available for the selected power pricing strip.",
        strip,
        product: product.id,
        sourceTable: "ice_python.settlements",
      },
      headers: { "Cache-Control": "no-store" },
      rowCount: rows.length,
      dataAsOf: latestUpdatedAt,
    };
  }

  return {
    payload,
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: rows.length,
    dataAsOf: latestUpdatedAt,
  };
});

export function GET(request: Request): Promise<NextResponse> {
  return observedGET(request);
}
