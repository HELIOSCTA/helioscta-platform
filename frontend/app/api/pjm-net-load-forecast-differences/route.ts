import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const DEFAULT_AREA = "RTO";
const DEFAULT_LOOKBACK_HOURS = 72;
const MIN_LOOKBACK_HOURS = 1;
const MAX_LOOKBACK_HOURS = 168;
const LAGS = [
  { label: "72h", hours: 72 },
  { label: "48h", hours: 48 },
  { label: "24h", hours: 24 },
  { label: "12h", hours: 12 },
  { label: "1h", hours: 1 },
] as const;
const ON_PEAK_HE_STARTS = Array.from({ length: 16 }, (_, index) => index + 7);
const ON_PEAK_HE_START_SET = new Set(ON_PEAK_HE_STARTS);
const ROUTE_CONFIG = {
  route: "/api/pjm-net-load-forecast-differences",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "PJM net load forecast vintage difference data",
  p95TargetMs: 1_500,
  freshnessSource:
    "pjm.load_frcstd_7_day.evaluated_at_datetime_ept or meteologica.pjm_forecast_hourly.issue_date",
} as const;

interface DateRow {
  forecast_date: string;
}

interface AreaRow {
  forecast_area: string;
}

interface SourceRow {
  evaluated_at_ept: string;
  forecast_date: string;
  he_start: number | string;
  load_mw: number | string | null;
  solar_mw: number | string | null;
  wind_mw: number | string | null;
  net_load_mw: number | string | null;
  updated_at: string | null;
}

interface VintageCurve {
  evaluatedAtEpt: string;
  tag: string;
  netPeakMw: number | null;
  netOnPeakAvg: number | null;
  netOffPeakAvg: number | null;
  netFlatAvg: number | null;
  loadPeakMw: number | null;
  loadOnPeakAvg: number | null;
  loadOffPeakAvg: number | null;
  loadFlatAvg: number | null;
  solarPeakMw: number | null;
  solarOnPeakAvg: number | null;
  solarOffPeakAvg: number | null;
  solarFlatAvg: number | null;
  windPeakMw: number | null;
  windOnPeakAvg: number | null;
  windOffPeakAvg: number | null;
  windFlatAvg: number | null;
  renewableFlatAvg: number | null;
  hourly: Array<number | null>;
  loadHourly: Array<number | null>;
  windHourly: Array<number | null>;
  solarHourly: Array<number | null>;
  netHourly: Array<number | null>;
}

interface VintageAccumulator {
  net: Array<number | null>;
  load: Array<number | null>;
  solar: Array<number | null>;
  wind: Array<number | null>;
}

type ForecastSourceMode = "pjm" | "meteologica";

interface SourceConfig {
  mode: ForecastSourceMode;
  source: string;
  sourceLabel: string;
  forecastDatesSql: string;
  forecastRowsSql: string;
  coverageNote: string;
  noDateMessage: string;
  noRowsMessage: string;
}

const FORMULA = "net_load_mw = load - solar - wind";
const METEOLOGICA_COVERAGE_NOTE =
  "Meteologica mode pairs each regional load issue to the latest prior non-null solar and wind forecast for the same forecast area and hour. Rows include only forecast hours where load, solar, and wind all have non-null MW values.";
const PJM_COVERAGE_NOTE =
  "PJM mode uses RTO_COMBINED load, solar_forecast_mwh, and wind_forecast_mwh. Rows include only forecast hours where load, solar, and wind all have non-null MW values.";

function parseArea(value: string | null): string {
  if (!value) return DEFAULT_AREA;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z0-9_&/ -]{2,64}$/.test(trimmed) ? trimmed : DEFAULT_AREA;
}

function parseDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseLookbackHours(value: string | null): number {
  const parsed = value ? Number(value) : DEFAULT_LOOKBACK_HOURS;
  if (!Number.isFinite(parsed)) return DEFAULT_LOOKBACK_HOURS;
  return Math.min(Math.max(Math.round(parsed), MIN_LOOKBACK_HOURS), MAX_LOOKBACK_HOURS);
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value !== null);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function timestampMs(value: string): number {
  return new Date(`${value}Z`).getTime();
}

function emptyHourly(): Array<number | null> {
  return Array.from({ length: 24 }, () => null);
}

function summarizeCurve(
  evaluatedAtEpt: string,
  tag: string,
  acc: VintageAccumulator,
): VintageCurve {
  const netValues = acc.net.filter((value): value is number => value !== null);
  const loadValues = acc.load.filter((value): value is number => value !== null);
  const solarValues = acc.solar.filter((value): value is number => value !== null);
  const windValues = acc.wind.filter((value): value is number => value !== null);
  return {
    evaluatedAtEpt,
    tag,
    netPeakMw: netValues.length ? Math.max(...netValues) : null,
    netOnPeakAvg: avg(ON_PEAK_HE_STARTS.map((hour) => acc.net[hour] ?? null)),
    netOffPeakAvg: avg(acc.net.map((value, hour) => (ON_PEAK_HE_START_SET.has(hour) ? null : value))),
    netFlatAvg: avg(acc.net),
    loadPeakMw: loadValues.length ? Math.max(...loadValues) : null,
    loadOnPeakAvg: avg(ON_PEAK_HE_STARTS.map((hour) => acc.load[hour] ?? null)),
    loadOffPeakAvg: avg(acc.load.map((value, hour) => (ON_PEAK_HE_START_SET.has(hour) ? null : value))),
    loadFlatAvg: avg(acc.load),
    solarPeakMw: solarValues.length ? Math.max(...solarValues) : null,
    solarOnPeakAvg: avg(ON_PEAK_HE_STARTS.map((hour) => acc.solar[hour] ?? null)),
    solarOffPeakAvg: avg(acc.solar.map((value, hour) => (ON_PEAK_HE_START_SET.has(hour) ? null : value))),
    solarFlatAvg: avg(acc.solar),
    windPeakMw: windValues.length ? Math.max(...windValues) : null,
    windOnPeakAvg: avg(ON_PEAK_HE_STARTS.map((hour) => acc.wind[hour] ?? null)),
    windOffPeakAvg: avg(acc.wind.map((value, hour) => (ON_PEAK_HE_START_SET.has(hour) ? null : value))),
    windFlatAvg: avg(acc.wind),
    renewableFlatAvg: avg(acc.solar.map((solar, hour) => {
      const wind = acc.wind[hour];
      return solar === null || wind === null ? null : solar + wind;
    })),
    hourly: acc.net,
    loadHourly: acc.load,
    windHourly: acc.wind,
    solarHourly: acc.solar,
    netHourly: acc.net,
  };
}

function deltaValue(latest: number | null, anchor: number | null): number | null {
  return latest === null || anchor === null ? null : latest - anchor;
}

function deltaCurve(label: string, latest: VintageCurve, anchor: VintageCurve): VintageCurve {
  const loadHourly = latest.loadHourly.map((value, index) =>
    deltaValue(value, anchor.loadHourly[index] ?? null),
  );
  const windHourly = latest.windHourly.map((value, index) =>
    deltaValue(value, anchor.windHourly[index] ?? null),
  );
  const solarHourly = latest.solarHourly.map((value, index) =>
    deltaValue(value, anchor.solarHourly[index] ?? null),
  );
  const netHourly = latest.netHourly.map((value, index) =>
    deltaValue(value, anchor.netHourly[index] ?? null),
  );
  return {
    evaluatedAtEpt: anchor.evaluatedAtEpt,
    tag: label,
    netPeakMw: deltaValue(latest.netPeakMw, anchor.netPeakMw),
    netOnPeakAvg: deltaValue(latest.netOnPeakAvg, anchor.netOnPeakAvg),
    netOffPeakAvg: deltaValue(latest.netOffPeakAvg, anchor.netOffPeakAvg),
    netFlatAvg: deltaValue(latest.netFlatAvg, anchor.netFlatAvg),
    loadPeakMw: deltaValue(latest.loadPeakMw, anchor.loadPeakMw),
    loadOnPeakAvg: deltaValue(latest.loadOnPeakAvg, anchor.loadOnPeakAvg),
    loadOffPeakAvg: deltaValue(latest.loadOffPeakAvg, anchor.loadOffPeakAvg),
    loadFlatAvg: deltaValue(latest.loadFlatAvg, anchor.loadFlatAvg),
    solarPeakMw: deltaValue(latest.solarPeakMw, anchor.solarPeakMw),
    solarOnPeakAvg: deltaValue(latest.solarOnPeakAvg, anchor.solarOnPeakAvg),
    solarOffPeakAvg: deltaValue(latest.solarOffPeakAvg, anchor.solarOffPeakAvg),
    solarFlatAvg: deltaValue(latest.solarFlatAvg, anchor.solarFlatAvg),
    windPeakMw: deltaValue(latest.windPeakMw, anchor.windPeakMw),
    windOnPeakAvg: deltaValue(latest.windOnPeakAvg, anchor.windOnPeakAvg),
    windOffPeakAvg: deltaValue(latest.windOffPeakAvg, anchor.windOffPeakAvg),
    windFlatAvg: deltaValue(latest.windFlatAvg, anchor.windFlatAvg),
    renewableFlatAvg: deltaValue(latest.renewableFlatAvg, anchor.renewableFlatAvg),
    hourly: netHourly,
    loadHourly,
    windHourly,
    solarHourly,
    netHourly,
  };
}

function pickAnchors(curves: VintageCurve[], latest: VintageCurve): VintageCurve[] {
  const latestMs = timestampMs(latest.evaluatedAtEpt);
  const prior = curves.filter((curve) => curve.evaluatedAtEpt !== latest.evaluatedAtEpt);
  const anchors: VintageCurve[] = [];

  LAGS.forEach((lag) => {
    const targetMs = latestMs - lag.hours * 3_600_000;
    const best = prior.reduce<{ curve: VintageCurve; diffMs: number } | null>((acc, curve) => {
      const diffMs = Math.abs(timestampMs(curve.evaluatedAtEpt) - targetMs);
      return !acc || diffMs < acc.diffMs ? { curve, diffMs } : acc;
    }, null);
    if (best && best.diffMs <= 6 * 3_600_000) {
      anchors.push({ ...best.curve, tag: lag.label });
    }
  });

  return anchors;
}

const METEOLOGICA_FORECAST_DATES_SQL = `
  with load_rows as (
    select
      forecast_period_start::date as forecast_date,
      issue_date,
      forecast_period_start,
      forecast_mw as load_mw
    from meteologica.pjm_forecast_hourly
    where region = 'PJM'
      and forecast_area = $1
      and metric = 'load'
      and issue_date is not null
      and forecast_mw is not null
      and forecast_period_start::date >= current_date
  ),
  paired_components as (
    select
      load_rows.forecast_date,
      load_rows.load_mw,
      solar_mw,
      wind_mw
    from load_rows
    join lateral (
      select forecast_mw as solar_mw
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
      select forecast_mw as wind_mw
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
  select distinct forecast_date::text as forecast_date
  from paired_components
  where load_mw is not null
    and solar_mw is not null
    and wind_mw is not null
  order by forecast_date
`;

const METEOLOGICA_FORECAST_ROWS_SQL = `
  with load_rows as (
    select
      forecast_period_start::date as forecast_date,
      issue_date,
      forecast_period_start,
      forecast_mw as load_mw,
      updated_at as load_updated_at
    from meteologica.pjm_forecast_hourly
    where region = 'PJM'
      and forecast_area = $1
      and metric = 'load'
      and issue_date is not null
      and forecast_mw is not null
      and forecast_period_start::date = $2::date
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
    to_char(issue_date, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
    forecast_date::text as forecast_date,
    extract(hour from forecast_period_start)::int as he_start,
    load_mw::float8 as load_mw,
    solar_mw::float8 as solar_mw,
    wind_mw::float8 as wind_mw,
    case
      when load_mw is null or solar_mw is null or wind_mw is null then null
      else (load_mw - solar_mw - wind_mw)::float8
    end as net_load_mw,
    to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
  from paired_components
  where load_mw is not null
    and solar_mw is not null
    and wind_mw is not null
  order by issue_date, forecast_period_start
`;

const METEOLOGICA_AVAILABLE_AREAS_SQL = `
  with metric_coverage as (
    select
      forecast_area,
      count(*) filter (where metric = 'load' and forecast_mw is not null) as load_rows,
      count(*) filter (where metric = 'solar' and forecast_mw is not null) as solar_rows,
      count(*) filter (where metric = 'wind' and forecast_mw is not null) as wind_rows
    from meteologica.pjm_forecast_hourly
    where region = 'PJM'
      and metric in ('load', 'solar', 'wind')
      and forecast_area is not null
      and forecast_period_start::date >= current_date
    group by forecast_area
  )
  select forecast_area
  from metric_coverage
  where load_rows > 0
    and solar_rows > 0
    and wind_rows > 0
  order by forecast_area
`;

const PJM_FORECAST_DATES_SQL = `
  with load_rows as (
    select
      forecast_datetime_beginning_ept::date as forecast_date,
      evaluated_at_datetime_ept,
      evaluated_at_datetime_utc,
      forecast_datetime_beginning_ept,
      forecast_datetime_beginning_utc,
      forecast_load_mw as load_mw
    from pjm.load_frcstd_7_day
    where forecast_area = 'RTO_COMBINED'
      and evaluated_at_datetime_ept is not null
      and evaluated_at_datetime_utc is not null
      and forecast_datetime_beginning_ept is not null
      and forecast_datetime_beginning_utc is not null
      and forecast_load_mw is not null
      and forecast_datetime_beginning_ept::date >= current_date
  ),
  paired_components as (
    select
      load_rows.forecast_date,
      load_rows.load_mw,
      solar_mw,
      wind_mw
    from load_rows
    join lateral (
      select solar_forecast_mwh as solar_mw
      from pjm.hourly_solar_power_forecast as solar
      where solar.datetime_beginning_utc = load_rows.forecast_datetime_beginning_utc
        and solar.evaluated_at_utc is not null
        and solar.evaluated_at_utc <= load_rows.evaluated_at_datetime_utc
        and solar.solar_forecast_mwh is not null
      order by solar.evaluated_at_utc desc
      limit 1
    ) solar on true
    join lateral (
      select wind_forecast_mwh as wind_mw
      from pjm.hourly_wind_power_forecast as wind
      where wind.datetime_beginning_utc = load_rows.forecast_datetime_beginning_utc
        and wind.evaluated_at_utc is not null
        and wind.evaluated_at_utc <= load_rows.evaluated_at_datetime_utc
        and wind.wind_forecast_mwh is not null
      order by wind.evaluated_at_utc desc
      limit 1
    ) wind on true
  )
  select distinct forecast_date::text as forecast_date
  from paired_components
  where load_mw is not null
    and solar_mw is not null
    and wind_mw is not null
  order by forecast_date
`;

const PJM_FORECAST_ROWS_SQL = `
  with load_rows as (
    select
      forecast_datetime_beginning_ept::date as forecast_date,
      evaluated_at_datetime_ept,
      evaluated_at_datetime_utc,
      forecast_datetime_beginning_ept,
      forecast_datetime_beginning_utc,
      forecast_load_mw as load_mw,
      updated_at as load_updated_at
    from pjm.load_frcstd_7_day
    where forecast_area = 'RTO_COMBINED'
      and evaluated_at_datetime_ept is not null
      and evaluated_at_datetime_utc is not null
      and forecast_datetime_beginning_ept is not null
      and forecast_datetime_beginning_utc is not null
      and forecast_load_mw is not null
      and forecast_datetime_beginning_ept::date = $1::date
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
    to_char(evaluated_at_datetime_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
    forecast_date::text as forecast_date,
    extract(hour from forecast_datetime_beginning_ept)::int as he_start,
    load_mw::float8 as load_mw,
    solar_mw::float8 as solar_mw,
    wind_mw::float8 as wind_mw,
    case
      when load_mw is null or solar_mw is null or wind_mw is null then null
      else (load_mw - solar_mw - wind_mw)::float8
    end as net_load_mw,
    to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
  from paired_components
  where load_mw is not null
    and solar_mw is not null
    and wind_mw is not null
  order by evaluated_at_datetime_ept, forecast_datetime_beginning_ept
`;

function parseSource(value: string | null): ForecastSourceMode {
  return value?.toLowerCase() === "meteologica" ? "meteologica" : "pjm";
}

function sourceConfig(mode: ForecastSourceMode): SourceConfig {
  if (mode === "meteologica") {
    return {
      mode,
      source: "meteologica.pjm_forecast_hourly",
      sourceLabel: "Meteologica",
      forecastDatesSql: METEOLOGICA_FORECAST_DATES_SQL,
      forecastRowsSql: METEOLOGICA_FORECAST_ROWS_SQL,
      coverageNote: METEOLOGICA_COVERAGE_NOTE,
      noDateMessage: "No current Meteologica regional net load forecast dates are available",
      noRowsMessage: "No Meteologica regional net load forecast vintage rows are available",
    };
  }

  return {
    mode,
    source:
      "pjm.load_frcstd_7_day + pjm.hourly_solar_power_forecast + pjm.hourly_wind_power_forecast",
    sourceLabel: "PJM Data Miner",
    forecastDatesSql: PJM_FORECAST_DATES_SQL,
    forecastRowsSql: PJM_FORECAST_ROWS_SQL,
    coverageNote: PJM_COVERAGE_NOTE,
    noDateMessage: "No current PJM Data Miner RTO net load forecast dates are available",
    noRowsMessage: "No PJM Data Miner RTO net load forecast vintage rows are available",
  };
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const config = sourceConfig(parseSource(searchParams.get("source")));
  const requestedArea = parseArea(searchParams.get("area"));
  const requestedDate = parseDate(searchParams.get("date"));
  const lookbackHours = parseLookbackHours(searchParams.get("lookbackHours"));

  const availableAreas =
    config.mode === "meteologica"
      ? (await query<AreaRow>(METEOLOGICA_AVAILABLE_AREAS_SQL)).map((row) => row.forecast_area)
      : [DEFAULT_AREA];
  const fallbackArea = availableAreas.includes(DEFAULT_AREA) ? DEFAULT_AREA : availableAreas[0];
  if (!fallbackArea) {
    return {
      status: 404,
      payload: { error: config.noDateMessage },
      headers: { "Cache-Control": "no-store" },
    };
  }
  const area = availableAreas.includes(requestedArea) ? requestedArea : fallbackArea;

  const dateParams = config.mode === "meteologica" ? [area] : [];
  const dates = await query<DateRow>(config.forecastDatesSql, dateParams);
  const forecastDates = dates.map((row) => row.forecast_date);
  const forecastDate =
    requestedDate && forecastDates.includes(requestedDate) ? requestedDate : forecastDates[0];
  if (!forecastDate) {
    return {
      status: 404,
      payload: { error: config.noDateMessage },
      headers: { "Cache-Control": "no-store" },
    };
  }

  const rows = await query<SourceRow>(
    config.forecastRowsSql,
    config.mode === "meteologica" ? [area, forecastDate] : [forecastDate],
  );
  const byVintage = new Map<string, VintageAccumulator>();
  rows.forEach((row) => {
    const key = row.evaluated_at_ept;
    const acc =
      byVintage.get(key) ?? {
        net: emptyHourly(),
        load: emptyHourly(),
        solar: emptyHourly(),
        wind: emptyHourly(),
      };
    const hour = Number(row.he_start);
    if (hour >= 0 && hour <= 23) {
      acc.net[hour] = toNumber(row.net_load_mw);
      acc.load[hour] = toNumber(row.load_mw);
      acc.solar[hour] = toNumber(row.solar_mw);
      acc.wind[hour] = toNumber(row.wind_mw);
    }
    byVintage.set(key, acc);
  });

  const curves = Array.from(byVintage.entries())
    .map(([evaluatedAtEpt, acc]) => summarizeCurve(evaluatedAtEpt, "", acc))
    .sort((a, b) => a.evaluatedAtEpt.localeCompare(b.evaluatedAtEpt));

  if (!curves.length) {
    return {
      status: 404,
      payload: { error: config.noRowsMessage },
      headers: { "Cache-Control": "no-store" },
    };
  }

  const latest = { ...curves.at(-1)!, tag: "LATEST" };
  const anchors = pickAnchors(curves, latest);
  const snapshotRows = [...anchors, latest];
  const deltaRows = anchors.map((anchor) => deltaCurve(`Delta vs ${anchor.tag}`, latest, anchor));
  const latestMs = timestampMs(latest.evaluatedAtEpt);
  const lookbackRows = curves
    .filter((curve) => latestMs - timestampMs(curve.evaluatedAtEpt) <= lookbackHours * 3_600_000)
    .map((curve) => ({
      ...curve,
      tag:
        curve.evaluatedAtEpt === latest.evaluatedAtEpt
          ? "LATEST"
          : `${Math.round((latestMs - timestampMs(curve.evaluatedAtEpt)) / 3_600_000)}h ago`,
    }));
  const latestUpdate = rows.reduce<string | null>(
    (best, row) => (row.updated_at && (!best || row.updated_at > best) ? row.updated_at : best),
    null,
  );

  return {
    payload: {
      iso: "pjm",
      area,
      areas: availableAreas,
      forecastDate,
      forecastDates,
      asOf: latest.evaluatedAtEpt,
      latestUpdate,
      source: config.source,
      sourceMode: config.mode,
      sourceLabel: config.sourceLabel,
      formula: FORMULA,
      coverageNote: config.coverageNote,
      rowCount: rows.length,
      lookbackHours,
      snapshotRows,
      deltaRows,
      lookbackRows,
      windowRows: lookbackRows,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: rows.length,
    dataAsOf: latest.evaluatedAtEpt,
  };
});

export async function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
