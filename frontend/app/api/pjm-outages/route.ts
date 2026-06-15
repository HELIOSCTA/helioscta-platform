import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=600, stale-while-revalidate=120";
const MAX_EXECUTION_LIMIT = 16;
const DEFAULT_EXECUTION_LIMIT = 8;
const MAX_SEASONAL_YEAR_LIMIT = 12;
const DEFAULT_SEASONAL_YEAR_LIMIT = 8;
const ROUTE_CONFIG = {
  route: "/api/pjm-outages",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=600, stale-while-revalidate=120",
  owner: "frontend",
  purpose: "PJM outage forecast and seasonal dashboard data",
  p95TargetMs: 1_500,
  freshnessSource: "pjm.gen_outages_by_type.forecast_execution_date_ept",
} as const;
type OutagesView = "forecast" | "seasonal";
type Region = "RTO" | "WEST" | "OTHER";

interface OutageSourceRow {
  forecast_execution_date: string;
  forecast_date: string;
  lead_days: number;
  total_outages_mw?: number | string | null;
  planned_outages_mw?: number | string | null;
  maintenance_outages_mw?: number | string | null;
  forced_outages_mw?: number | string | null;
  rto_mw: number | string | null;
  west_mw: number | string | null;
  other_mw: number | string | null;
}

const REGION_SOURCE_NAMES: Record<Region, string> = {
  RTO: "PJM RTO",
  WEST: "Western",
  OTHER: "Mid Atlantic - Dominion",
};

function parseView(value: string | null): OutagesView {
  return value === "seasonal" ? "seasonal" : "forecast";
}

function parseRegion(value: string | null): Region {
  return value === "WEST" || value === "OTHER" ? value : "RTO";
}

function parseBoundedInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function valueForRegion(row: OutageSourceRow, region: Region): number | null {
  if (region === "WEST") return toNumber(row.west_mw);
  if (region === "OTHER") return toNumber(row.other_mw);
  return toNumber(row.rto_mw);
}

function normalize(row: OutageSourceRow, region: Region, view: OutagesView) {
  const total = toNumber(row.total_outages_mw) ?? valueForRegion(row, region);
  const base = {
    region,
    total_outages_mw: total,
    planned_outages_mw: toNumber(row.planned_outages_mw),
    maintenance_outages_mw: toNumber(row.maintenance_outages_mw),
    forced_outages_mw: toNumber(row.forced_outages_mw),
  };
  if (view === "seasonal") {
    const d = new Date(`${row.forecast_date}T00:00:00Z`);
    return {
      ...base,
      date: row.forecast_date,
      year: d.getUTCFullYear(),
      day_of_year: Math.floor(
        (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000,
      ),
    };
  }
  return {
    ...base,
    as_of_date: row.forecast_execution_date,
    forecast_execution_date: row.forecast_execution_date,
    forecast_date: row.forecast_date,
    lead_days: row.lead_days,
  };
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const view = parseView(searchParams.get("view"));
  const region = parseRegion(searchParams.get("region"));
  const executionLimit = parseBoundedInt(
    searchParams.get("executionLimit"),
    DEFAULT_EXECUTION_LIMIT,
    1,
    MAX_EXECUTION_LIMIT,
  );
  const seasonalYearLimit = parseBoundedInt(
    searchParams.get("seasonalYearLimit"),
    DEFAULT_SEASONAL_YEAR_LIMIT,
    1,
    MAX_SEASONAL_YEAR_LIMIT,
  );

  const rows = await query<OutageSourceRow>(
    view === "forecast"
      ? `
          with recent_exec_dates as (
            select distinct forecast_execution_date_ept
            from pjm.gen_outages_by_type
            where region = $2
            order by forecast_execution_date_ept desc
            limit $1
          )
          select
            forecast_execution_date_ept::text as forecast_execution_date,
            forecast_date::text as forecast_date,
            (forecast_date - forecast_execution_date_ept)::int as lead_days,
            total_outages_mw::float8 as total_outages_mw,
            planned_outages_mw::float8 as planned_outages_mw,
            maintenance_outages_mw::float8 as maintenance_outages_mw,
            forced_outages_mw::float8 as forced_outages_mw,
            null::float8 as rto_mw,
            null::float8 as west_mw,
            null::float8 as other_mw
          from pjm.gen_outages_by_type
          where forecast_execution_date_ept in (select forecast_execution_date_ept from recent_exec_dates)
            and region = $2
            and (forecast_date - forecast_execution_date_ept)::int between 0 and 6
          order by forecast_execution_date_ept desc, forecast_date
        `
      : `
          with recent_years as (
            select distinct extract(year from forecast_date)::int as year
            from pjm.gen_outages_by_type
            where region = $2
            order by year desc
            limit $1
          )
          select distinct on (forecast_date)
            forecast_execution_date_ept::text as forecast_execution_date,
            forecast_date::text as forecast_date,
            (forecast_date - forecast_execution_date_ept)::int as lead_days,
            total_outages_mw::float8 as total_outages_mw,
            planned_outages_mw::float8 as planned_outages_mw,
            maintenance_outages_mw::float8 as maintenance_outages_mw,
            forced_outages_mw::float8 as forced_outages_mw,
            null::float8 as rto_mw,
            null::float8 as west_mw,
            null::float8 as other_mw
          from pjm.gen_outages_by_type
          where extract(year from forecast_date)::int in (select year from recent_years)
            and region = $2
          order by forecast_date, forecast_execution_date_ept desc
        `,
    [view === "forecast" ? executionLimit : seasonalYearLimit, REGION_SOURCE_NAMES[region]],
  );
  const normalized = rows.map((row) => normalize(row, region, view));
  const years = Array.from(
    new Set(
      normalized
        .map((row) => ("year" in row && typeof row.year === "number" ? row.year : null))
        .filter((year): year is number => year !== null),
    ),
  ).sort((a, b) => a - b);
  const asOf =
    normalized
      .map((row) =>
        view === "forecast"
          ? "as_of_date" in row
            ? row.as_of_date
            : null
          : "date" in row
            ? row.date
            : null,
      )
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return {
    payload: {
      view,
      region,
      regions: ["RTO", "WEST", "OTHER"],
      executionLimit,
      seasonalYearLimit,
      years,
      asOf,
      rowCount: normalized.length,
      rows: normalized,
    },
    headers: { "Cache-Control": CACHE_HEADER, "X-Pjm-Outages-Cache": "MISS" },
    rowCount: normalized.length,
    dataAsOf: asOf,
  };
});
