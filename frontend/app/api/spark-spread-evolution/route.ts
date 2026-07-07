import { NextResponse } from "next/server";

import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
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
  DEFAULT_POWER_SPARK_SPREAD_PRODUCT,
  getPowerSparkSpreadProduct,
} from "@/lib/sparkSpreads/products";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const DEFAULT_STRIP = "H";
const YEAR_LOOKBACK = 4;
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

function maxString(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  if (!isLocalOnlyFeatureEnabled()) {
    return {
      status: 404,
      payload: { error: "Spark spreads are local-only while the ICE settlement dashboard is being validated." },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  const { searchParams } = new URL(request.url);
  const strip = validStrip(searchParams.get("strip") ?? searchParams.get("sparkStrip")) ?? DEFAULT_STRIP;
  const product =
    getPowerSparkSpreadProduct(searchParams.get("sparkProduct")) ?? DEFAULT_POWER_SPARK_SPREAD_PRODUCT;
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

  if (!payload.data.length) {
    return {
      status: 404,
      payload: {
        error: "No complete spark spread rows are available for the selected ICE strip.",
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
