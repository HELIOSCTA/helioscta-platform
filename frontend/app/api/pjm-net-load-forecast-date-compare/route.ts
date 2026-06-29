import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const DEFAULT_AREA = "RTO";
const ROUTE_CONFIG = {
  route: "/api/pjm-net-load-forecast-date-compare",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "PJM net load forecast date comparison",
  p95TargetMs: 1_500,
  freshnessSource:
    "pjm.load_frcstd_7_day.evaluated_at_datetime_ept or meteologica.pjm_forecast_hourly.issue_date",
} as const;

type ForecastSourceMode = "pjm" | "meteologica";

interface SourceRow {
  forecast_date: string;
  evaluated_at_ept: string;
  he_start: number | string;
  load_mw: number | string | null;
  solar_mw: number | string | null;
  wind_mw: number | string | null;
  net_load_mw: number | string | null;
  updated_at: string | null;
}

interface CompareHour {
  he: number;
  loadBaseMw: number | null;
  loadCompareMw: number | null;
  loadDeltaMw: number | null;
  windBaseMw: number | null;
  windCompareMw: number | null;
  windDeltaMw: number | null;
  solarBaseMw: number | null;
  solarCompareMw: number | null;
  solarDeltaMw: number | null;
  netBaseMw: number | null;
  netCompareMw: number | null;
  netDeltaMw: number | null;
}

const FORMULA = "net_load_mw = load - solar - wind";

const METEOLOGICA_COMPARE_SQL = `
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
  ),
  load_rows as (
    select
      latest_load_issues.forecast_date,
      latest_load_issues.issue_date,
      load.forecast_period_start,
      load.forecast_mw as load_mw,
      load.updated_at as load_updated_at
    from latest_load_issues
    join meteologica.pjm_forecast_hourly as load
      on load.region = 'PJM'
      and load.forecast_area = $1
      and load.metric = 'load'
      and load.issue_date = latest_load_issues.issue_date
      and load.forecast_period_start::date = latest_load_issues.forecast_date
      and load.forecast_mw is not null
  ),
  paired_components as (
    select
      load_rows.forecast_date,
      load_rows.issue_date,
      load_rows.forecast_period_start,
      load_rows.load_mw,
      solar_mw,
      wind_mw,
      greatest(
        load_rows.load_updated_at,
        coalesce(solar_updated_at, load_rows.load_updated_at),
        coalesce(wind_updated_at, load_rows.load_updated_at)
      ) as updated_at
    from load_rows
    join lateral (
      select
        forecast_mw as solar_mw,
        updated_at as solar_updated_at
      from meteologica.pjm_forecast_hourly as solar
      where solar.region = 'PJM'
        and solar.forecast_area = $1
        and solar.metric = 'solar'
        and solar.forecast_period_start = load_rows.forecast_period_start
        and solar.issue_date <= load_rows.issue_date
        and solar.forecast_mw is not null
      order by solar.issue_date desc
      limit 1
    ) solar on true
    join lateral (
      select
        forecast_mw as wind_mw,
        updated_at as wind_updated_at
      from meteologica.pjm_forecast_hourly as wind
      where wind.region = 'PJM'
        and wind.forecast_area = $1
        and wind.metric = 'wind'
        and wind.forecast_period_start = load_rows.forecast_period_start
        and wind.issue_date <= load_rows.issue_date
        and wind.forecast_mw is not null
      order by wind.issue_date desc
      limit 1
    ) wind on true
  )
  select
    forecast_date::text as forecast_date,
    to_char(issue_date, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
    extract(hour from forecast_period_start)::int as he_start,
    load_mw::float8 as load_mw,
    solar_mw::float8 as solar_mw,
    wind_mw::float8 as wind_mw,
    (load_mw - solar_mw - wind_mw)::float8 as net_load_mw,
    to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
  from paired_components
  where load_mw is not null
    and solar_mw is not null
    and wind_mw is not null
  order by forecast_date, forecast_period_start
`;

const PJM_COMPARE_SQL = `
  with requested_dates as (
    select unnest(array[$1::date, $2::date]) as forecast_date
  ),
  latest_load_issues as (
    select
      requested_dates.forecast_date,
      max(load.evaluated_at_datetime_ept) as evaluated_at_ept
    from requested_dates
    join pjm.load_frcstd_7_day as load
      on load.forecast_area = 'RTO_COMBINED'
      and load.forecast_datetime_beginning_ept::date = requested_dates.forecast_date
      and load.evaluated_at_datetime_ept is not null
      and load.evaluated_at_datetime_utc is not null
      and load.forecast_datetime_beginning_ept is not null
      and load.forecast_datetime_beginning_utc is not null
      and load.forecast_load_mw is not null
    group by requested_dates.forecast_date
  ),
  load_rows as (
    select
      latest_load_issues.forecast_date,
      load.evaluated_at_datetime_ept,
      load.evaluated_at_datetime_utc,
      load.forecast_datetime_beginning_ept,
      load.forecast_datetime_beginning_utc,
      load.forecast_load_mw as load_mw,
      load.updated_at as load_updated_at
    from latest_load_issues
    join pjm.load_frcstd_7_day as load
      on load.forecast_area = 'RTO_COMBINED'
      and load.evaluated_at_datetime_ept = latest_load_issues.evaluated_at_ept
      and load.forecast_datetime_beginning_ept::date = latest_load_issues.forecast_date
      and load.forecast_load_mw is not null
  ),
  paired_components as (
    select
      load_rows.forecast_date,
      load_rows.evaluated_at_datetime_ept,
      load_rows.forecast_datetime_beginning_ept,
      load_rows.load_mw,
      solar_mw,
      wind_mw,
      greatest(
        load_rows.load_updated_at,
        coalesce(solar_updated_at, load_rows.load_updated_at),
        coalesce(wind_updated_at, load_rows.load_updated_at)
      ) as updated_at
    from load_rows
    join lateral (
      select
        solar_forecast_mwh as solar_mw,
        updated_at as solar_updated_at
      from pjm.hourly_solar_power_forecast as solar
      where solar.datetime_beginning_utc = load_rows.forecast_datetime_beginning_utc
        and solar.evaluated_at_utc is not null
        and solar.evaluated_at_utc <= load_rows.evaluated_at_datetime_utc
        and solar.solar_forecast_mwh is not null
      order by solar.evaluated_at_utc desc
      limit 1
    ) solar on true
    join lateral (
      select
        wind_forecast_mwh as wind_mw,
        updated_at as wind_updated_at
      from pjm.hourly_wind_power_forecast as wind
      where wind.datetime_beginning_utc = load_rows.forecast_datetime_beginning_utc
        and wind.evaluated_at_utc is not null
        and wind.evaluated_at_utc <= load_rows.evaluated_at_datetime_utc
        and wind.wind_forecast_mwh is not null
      order by wind.evaluated_at_utc desc
      limit 1
    ) wind on true
  )
  select
    forecast_date::text as forecast_date,
    to_char(evaluated_at_datetime_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
    extract(hour from forecast_datetime_beginning_ept)::int as he_start,
    load_mw::float8 as load_mw,
    solar_mw::float8 as solar_mw,
    wind_mw::float8 as wind_mw,
    (load_mw - solar_mw - wind_mw)::float8 as net_load_mw,
    to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
  from paired_components
  where load_mw is not null
    and solar_mw is not null
    and wind_mw is not null
  order by forecast_date, forecast_datetime_beginning_ept
`;

function parseSource(value: string | null): ForecastSourceMode {
  return value?.toLowerCase() === "meteologica" ? "meteologica" : "pjm";
}

function parseArea(value: string | null): string {
  if (!value) return DEFAULT_AREA;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z0-9_&/ -]{2,64}$/.test(trimmed) ? trimmed : DEFAULT_AREA;
}

function parseDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
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
    windBaseMw: null,
    windCompareMw: null,
    windDeltaMw: null,
    solarBaseMw: null,
    solarCompareMw: null,
    solarDeltaMw: null,
    netBaseMw: null,
    netCompareMw: null,
    netDeltaMw: null,
  };
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const sourceMode = parseSource(searchParams.get("source"));
  const area = sourceMode === "meteologica" ? parseArea(searchParams.get("area")) : DEFAULT_AREA;
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
    sourceMode === "meteologica" ? METEOLOGICA_COMPARE_SQL : PJM_COMPARE_SQL,
    sourceMode === "meteologica" ? [area, baseDate, compareDate] : [baseDate, compareDate],
  );
  const byDateHour = new Map<string, SourceRow>();
  rows.forEach((row) => {
    byDateHour.set(`${row.forecast_date}|${Number(row.he_start)}`, row);
  });

  const compareRows = Array.from({ length: 24 }, (_, hour) => {
    const base = byDateHour.get(`${baseDate}|${hour}`);
    const compare = byDateHour.get(`${compareDate}|${hour}`);
    const output = emptyCompareHour(hour + 1);
    output.loadBaseMw = toNumber(base?.load_mw);
    output.loadCompareMw = toNumber(compare?.load_mw);
    output.loadDeltaMw = diff(output.loadCompareMw, output.loadBaseMw);
    output.windBaseMw = toNumber(base?.wind_mw);
    output.windCompareMw = toNumber(compare?.wind_mw);
    output.windDeltaMw = diff(output.windCompareMw, output.windBaseMw);
    output.solarBaseMw = toNumber(base?.solar_mw);
    output.solarCompareMw = toNumber(compare?.solar_mw);
    output.solarDeltaMw = diff(output.solarCompareMw, output.solarBaseMw);
    output.netBaseMw = toNumber(base?.net_load_mw);
    output.netCompareMw = toNumber(compare?.net_load_mw);
    output.netDeltaMw = diff(output.netCompareMw, output.netBaseMw);
    return output;
  });
  const completeHourCount = compareRows.filter(
    (row) => row.netBaseMw !== null && row.netCompareMw !== null,
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
      payload: { error: "No complete net load forecast comparison rows are available" },
      headers: { "Cache-Control": "no-store" },
    };
  }

  return {
    payload: {
      iso: "pjm",
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
          : "pjm.load_frcstd_7_day + pjm.hourly_solar_power_forecast + pjm.hourly_wind_power_forecast",
      formula: FORMULA,
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
  return observedGET(request);
}
