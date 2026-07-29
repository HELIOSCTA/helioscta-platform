import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import {
  buildGasCurveEvolutionData,
  buildGasCurveSettlementSymbols,
  currentGasCurveStrip,
  defaultGasCurveYearWindow,
  nextGasCurveStrip,
  normalizeGasCurveEvolutionView,
  resolveGasCurveMarket,
  validGasCurveStrip,
  yearsBetween,
  type GasCurveSettlementRow,
} from "@/lib/gasPricing";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const MAX_YEAR_SPAN = 15;

const ROUTE_CONFIG = {
  route: "/api/gas-curve-evolution",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "ICE gas outright and calendar-spread evolution",
  p95TargetMs: 2_500,
  freshnessSource: "ice_python.settlements updated_at",
} as const;

interface RawGasCurveSettlementRow {
  symbol: string;
  trade_date: string;
  value: number | string | null;
  updated_at: string | null;
}

function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeYearWindow(searchParams: URLSearchParams): { startYear: number; endYear: number } {
  const currentYear = new Date().getUTCFullYear();
  const defaults = defaultGasCurveYearWindow(currentYear);
  const minYear = currentYear - 20;
  const maxYear = currentYear + 10;
  let startYear = intParam(searchParams.get("startYear"), defaults.startYear, minYear, maxYear);
  let endYear = intParam(searchParams.get("endYear"), defaults.endYear, minYear, maxYear);
  if (startYear > endYear) {
    [startYear, endYear] = [endYear, startYear];
  }
  if (endYear - startYear + 1 > MAX_YEAR_SPAN) {
    endYear = startYear + MAX_YEAR_SPAN - 1;
  }
  return { startYear, endYear };
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function maxString(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const view = normalizeGasCurveEvolutionView(searchParams.get("view"));
  const market = resolveGasCurveMarket(searchParams.get("market"));
  const gasStrip =
    validGasCurveStrip(searchParams.get("gasStrip") ?? searchParams.get("sparkStrip")) ??
    currentGasCurveStrip();
  const gasNear = validGasCurveStrip(searchParams.get("gasNear")) ?? gasStrip;
  const requestedGasFar = validGasCurveStrip(searchParams.get("gasFar"));
  const gasFar = requestedGasFar && requestedGasFar !== gasNear ? requestedGasFar : nextGasCurveStrip(gasNear);
  const { startYear, endYear } = normalizeYearWindow(searchParams);
  const years = yearsBetween(startYear, endYear);
  const symbols = buildGasCurveSettlementSymbols({
    market,
    view,
    gasStrip,
    gasNear,
    gasFar,
    years,
  });

  const sourceRows = symbols.length
    ? await query<RawGasCurveSettlementRow>(
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
      )
    : [];

  const rows: GasCurveSettlementRow[] = [];
  for (const row of sourceRows) {
    const value = toNumber(row.value);
    if (value === null) continue;
    rows.push({
      symbol: row.symbol,
      trade_date: row.trade_date,
      value,
      updated_at: row.updated_at,
    });
  }

  const dataAsOf = maxString(
    sourceRows.map((row) => row.updated_at ?? row.trade_date ?? null),
  );
  const payload = buildGasCurveEvolutionData({
    rows,
    market,
    view,
    gasStrip,
    gasNear,
    gasFar,
    years,
    latestUpdatedAt: maxString(sourceRows.map((row) => row.updated_at)),
  });

  return {
    payload,
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: sourceRows.length,
    dataAsOf,
  };
});

export function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
