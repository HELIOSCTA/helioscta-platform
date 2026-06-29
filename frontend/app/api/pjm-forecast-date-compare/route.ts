import { GET as getNetLoadDateCompare } from "@/app/api/pjm-net-load-forecast-date-compare/route";
import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=600, stale-while-revalidate=600, stale-if-error=3600";
const DEFAULT_PJM_AREA = "RTO_COMBINED";
const DEFAULT_METEOLOGICA_AREA = "RTO";
const ROUTE_CONFIG = {
  route: "/api/pjm-forecast-date-compare",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=600, stale-while-revalidate=600, stale-if-error=3600",
  owner: "frontend",
  purpose: "PJM load forecast date comparison",
  p95TargetMs: 1_500,
  freshnessSource:
    "pjm.load_frcstd_7_day.evaluated_at_datetime_ept or meteologica.pjm_forecast_hourly.issue_date",
} as const;

type ForecastSourceMode = "pjm" | "meteologica";
type ForecastCompareType = "load" | "netLoad";

interface SourceRow {
  forecast_date: string;
  evaluated_at_ept: string;
  he_start: number | string;
  load_mw: number | string | null;
  updated_at: string | null;
}

interface CompareHour {
  he: number;
  loadBaseMw: number | null;
  loadCompareMw: number | null;
  loadDeltaMw: number | null;
}

const PJM_LOAD_COMPARE_SQL = `
  with requested_dates as (
    select unnest(array[$2::date, $3::date]) as forecast_date
  ),
  latest_load_issues as (
    select
      requested_dates.forecast_date,
      max(load.evaluated_at_datetime_ept) as evaluated_at_ept
    from requested_dates
    join pjm.load_frcstd_7_day as load
      on load.forecast_area = $1
      and load.forecast_datetime_beginning_ept::date = requested_dates.forecast_date
      and load.evaluated_at_datetime_ept is not null
      and load.forecast_load_mw is not null
    group by requested_dates.forecast_date
  )
  select
    latest_load_issues.forecast_date::text as forecast_date,
    to_char(load.evaluated_at_datetime_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
    extract(hour from load.forecast_datetime_beginning_ept)::int as he_start,
    load.forecast_load_mw::float8 as load_mw,
    to_char(load.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
  from latest_load_issues
  join pjm.load_frcstd_7_day as load
    on load.forecast_area = $1
    and load.evaluated_at_datetime_ept = latest_load_issues.evaluated_at_ept
    and load.forecast_datetime_beginning_ept::date = latest_load_issues.forecast_date
    and load.forecast_load_mw is not null
  order by latest_load_issues.forecast_date, load.forecast_datetime_beginning_ept
`;

const METEOLOGICA_LOAD_COMPARE_SQL = `
  with requested_dates as (
    select unnest(array[$2::date, $3::date]) as forecast_date
  ),
  latest_load_issues as (
    select
      requested_dates.forecast_date,
      max(load.issue_date) as issue_date
    from requested_dates
    join meteologica.pjm_forecast_hourly as load
      on load.region = 'PJM'
      and load.forecast_area = $1
      and load.metric = 'load'
      and load.forecast_period_start::date = requested_dates.forecast_date
      and load.issue_date is not null
      and load.forecast_mw is not null
    group by requested_dates.forecast_date
  )
  select
    latest_load_issues.forecast_date::text as forecast_date,
    to_char(latest_load_issues.issue_date, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
    extract(hour from forecast_hours.forecast_period_start)::int as he_start,
    load.forecast_mw::float8 as load_mw,
    to_char(load.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
  from latest_load_issues
  join lateral (
    select distinct load_hour.forecast_period_start
    from meteologica.pjm_forecast_hourly as load_hour
    where load_hour.region = 'PJM'
      and load_hour.forecast_area = $1
      and load_hour.metric = 'load'
      and load_hour.forecast_period_start::date = latest_load_issues.forecast_date
      and load_hour.forecast_mw is not null
      and (
        (latest_load_issues.forecast_date = current_date and load_hour.issue_date <= latest_load_issues.issue_date)
        or (latest_load_issues.forecast_date <> current_date and load_hour.issue_date = latest_load_issues.issue_date)
      )
  ) forecast_hours on true
  join lateral (
    select
      load.forecast_mw,
      load.updated_at
    from meteologica.pjm_forecast_hourly as load
    where load.region = 'PJM'
      and load.forecast_area = $1
      and load.metric = 'load'
      and load.forecast_period_start = forecast_hours.forecast_period_start
      and load.forecast_mw is not null
      and (
        (latest_load_issues.forecast_date = current_date and load.issue_date <= latest_load_issues.issue_date)
        or (latest_load_issues.forecast_date <> current_date and load.issue_date = latest_load_issues.issue_date)
      )
    order by load.issue_date desc
    limit 1
  ) load on true
  order by latest_load_issues.forecast_date, forecast_hours.forecast_period_start
`;

function parseSource(value: string | null): ForecastSourceMode {
  return value?.toLowerCase() === "meteologica" ? "meteologica" : "pjm";
}

function parseType(value: string | null): ForecastCompareType {
  return value?.toLowerCase() === "netload" ? "netLoad" : "load";
}

function parseDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseArea(value: string | null, sourceMode: ForecastSourceMode): string {
  const fallback = sourceMode === "meteologica" ? DEFAULT_METEOLOGICA_AREA : DEFAULT_PJM_AREA;
  if (!value) return fallback;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z0-9_&/ -]{2,64}$/.test(trimmed) ? trimmed : fallback;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function diff(compare: number | null, base: number | null): number | null {
  return compare === null || base === null ? null : compare - base;
}

function emptyCompareHour(he: number): CompareHour {
  return {
    he,
    loadBaseMw: null,
    loadCompareMw: null,
    loadDeltaMw: null,
  };
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const sourceMode = parseSource(searchParams.get("source"));
  const area = parseArea(searchParams.get("area"), sourceMode);
  const baseDate = parseDate(searchParams.get("baseDate"));
  const compareDate = parseDate(searchParams.get("compareDate"));

  if (!baseDate || !compareDate) {
    return {
      status: 400,
      payload: { error: "baseDate and compareDate are required as YYYY-MM-DD" },
      headers: { "Cache-Control": "no-store" },
    };
  }

  const rows = await query<SourceRow>(
    sourceMode === "meteologica" ? METEOLOGICA_LOAD_COMPARE_SQL : PJM_LOAD_COMPARE_SQL,
    [area, baseDate, compareDate],
  );
  const byDateHour = new Map<string, SourceRow>();
  rows.forEach((row) => byDateHour.set(`${row.forecast_date}|${Number(row.he_start)}`, row));

  const compareRows = Array.from({ length: 24 }, (_, hour) => {
    const base = byDateHour.get(`${baseDate}|${hour}`);
    const compare = byDateHour.get(`${compareDate}|${hour}`);
    const output = emptyCompareHour(hour + 1);
    output.loadBaseMw = toNumber(base?.load_mw);
    output.loadCompareMw = toNumber(compare?.load_mw);
    output.loadDeltaMw = diff(output.loadCompareMw, output.loadBaseMw);
    return output;
  });
  const completeHourCount = compareRows.filter(
    (row) => row.loadBaseMw !== null && row.loadCompareMw !== null,
  ).length;
  const baseIssue = rows
    .filter((row) => row.forecast_date === baseDate)
    .map((row) => row.evaluated_at_ept)
    .sort()
    .at(-1);
  const compareIssue = rows
    .filter((row) => row.forecast_date === compareDate)
    .map((row) => row.evaluated_at_ept)
    .sort()
    .at(-1);
  const latestUpdate = rows
    .map((row) => row.updated_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  if (!completeHourCount) {
    return {
      status: 404,
      payload: { error: "No complete load forecast comparison rows are available" },
      headers: { "Cache-Control": "no-store" },
    };
  }

  return {
    payload: {
      iso: "pjm",
      type: "load",
      area,
      baseDate,
      compareDate,
      baseIssue,
      compareIssue,
      sourceMode,
      sourceLabel: sourceMode === "meteologica" ? "Meteologica" : "PJM Data Miner",
      source:
        sourceMode === "meteologica"
          ? "meteologica.pjm_forecast_hourly"
          : "pjm.load_frcstd_7_day",
      completeHourCount,
      latestUpdate,
      rows: compareRows,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: rows.length,
    dataAsOf: compareIssue ?? baseIssue,
  };
});

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  if (parseType(requestUrl.searchParams.get("type")) === "netLoad") {
    const netLoadUrl = new URL("/api/pjm-net-load-forecast-date-compare", request.url);
    requestUrl.searchParams.forEach((value, key) => {
      if (key !== "type") netLoadUrl.searchParams.set(key, value);
    });
    return getNetLoadDateCompare(new Request(netLoadUrl.toString(), request));
  }

  return observedGET(request);
}
