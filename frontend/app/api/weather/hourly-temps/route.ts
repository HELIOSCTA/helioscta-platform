import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isWeatherDevEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

const CACHE_TTL_MS = 5 * 60 * 1000;
const FILTER_CACHE_TTL_MS = 30 * 60 * 1000;
const FRESH_CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/weather/hourly-temps",
  cacheHeader: FRESH_CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "WSI observed and forecast daily weather dashboard data",
  p95TargetMs: 1500,
  freshnessSource:
    "weather.wsi_hourly_observed_temperatures.updated_at, weather.wsi_hourly_forecasts.updated_at",
} as const;
const MAX_OBSERVED_WINDOW_DAYS = 60;
const MAX_STATIONS = 75;

type WeatherSource = "observed" | "forecast" | "both";
type ForecastRun = "primary" | "intraday";

interface SummaryRow {
  series_source: "observed" | "forecast";
  date: string;
  region: string;
  station_name: string;
  site_id: string | null;
  min_temp_f: string | number | null;
  max_temp_f: string | number | null;
  avg_temp_f: string | number | null;
  min_temp_diff_f: string | number | null;
  max_temp_diff_f: string | number | null;
  avg_temp_diff_f: string | number | null;
  min_temp_normal_f: string | number | null;
  max_temp_normal_f: string | number | null;
  avg_temp_normal_f: string | number | null;
  min_dew_point_f: string | number | null;
  max_dew_point_f: string | number | null;
  avg_dew_point_f: string | number | null;
  min_feels_like_temp_f: string | number | null;
  max_feels_like_temp_f: string | number | null;
  avg_feels_like_temp_f: string | number | null;
  hourly_count: string | number;
  updated_at: string | null;
}

interface RegionRow {
  region: string;
}

interface StationRow {
  station_name: string;
}

interface TempSummary {
  minTempF: number | null;
  maxTempF: number | null;
  avgTempF: number | null;
  minTempDiffF: number | null;
  maxTempDiffF: number | null;
  avgTempDiffF: number | null;
  minTempNormalF: number | null;
  maxTempNormalF: number | null;
  avgTempNormalF: number | null;
  minDewPointF: number | null;
  maxDewPointF: number | null;
  avgDewPointF: number | null;
  minFeelsLikeTempF: number | null;
  maxFeelsLikeTempF: number | null;
  avgFeelsLikeTempF: number | null;
  hourlyCount: number;
  updatedAt: string | null;
}

interface DailyTempCell {
  date: string;
  source: WeatherSource;
  primarySource: "observed" | "forecast";
  minTempF: number | null;
  maxTempF: number | null;
  avgTempF: number | null;
  minTempDiffF: number | null;
  maxTempDiffF: number | null;
  avgTempDiffF: number | null;
  minTempNormalF: number | null;
  maxTempNormalF: number | null;
  avgTempNormalF: number | null;
  minDewPointF: number | null;
  maxDewPointF: number | null;
  avgDewPointF: number | null;
  minFeelsLikeTempF: number | null;
  maxFeelsLikeTempF: number | null;
  avgFeelsLikeTempF: number | null;
  observed?: TempSummary;
  forecast?: TempSummary;
}

interface WeatherStationSummary {
  stationName: string;
  siteId: string | null;
  region: string;
  cells: Record<string, DailyTempCell>;
}

interface WeatherDateColumn {
  date: string;
  source: WeatherSource;
}

interface WeatherHourlyTempsPayload {
  source: "weather.wsi_hourly_forecasts+weather.wsi_hourly_observed_temperatures";
  filters: {
    region: string;
    stations: string[];
    forecastRun: ForecastRun;
    forecastExecutionDate: string | null;
    observedStartDate: string;
    observedEndDate: string;
    forecastStartDate: string;
    forecastEndDate: string;
  };
  availableRegions: string[];
  availableStations: string[];
  availableForecastExecutionDates: string[];
  dates: WeatherDateColumn[];
  stations: WeatherStationSummary[];
  rowCounts: {
    summaryRows: number;
    stationCount: number;
  };
  asOf: {
    observed: string | null;
    forecast: string | null;
  };
  forecastExecution: {
    requestedRun: ForecastRun;
    selectedRun: ForecastRun;
    executionDate: string | null;
    primary: string | null;
    intraday: string | null;
    selected: string | null;
    intradayAvailable: boolean;
  };
}

interface ForecastExecutionRow {
  execution_date: string | null;
  primary_execution: string | null;
  intraday_execution: string | null;
  selected_execution: string | null;
  selected_run: ForecastRun;
  intraday_available: boolean;
  forecast_start_date: string | null;
  forecast_end_date: string | null;
}

interface ForecastExecutionDateRow {
  execution_date: string;
}

const RESPONSE_CACHE = new Map<
  string,
  { expiresAt: number; payload: WeatherHourlyTempsPayload }
>();
let regionCache: { expiresAt: number; regions: string[] } | null = null;

const REGIONS_SQL = `
  WITH params AS (
    SELECT
      (CURRENT_DATE - INTERVAL '30 days')::date AS observed_start_date,
      CURRENT_DATE::timestamp AS forecast_start_datetime_local,
      (CURRENT_DATE + INTERVAL '16 days')::timestamp AS forecast_end_datetime_local
  )
  SELECT region
  FROM (
    SELECT observed.region
    FROM weather.wsi_hourly_observed_temperatures AS observed
    CROSS JOIN params
    WHERE observed.observation_date >= params.observed_start_date
      AND observed.observation_date < (params.forecast_start_datetime_local::date + INTERVAL '1 day')::date
    GROUP BY observed.region
    UNION
    SELECT forecast.region
    FROM weather.wsi_hourly_forecasts AS forecast
    CROSS JOIN params
    WHERE forecast.forecast_time_utc >= params.forecast_start_datetime_local
      AND forecast.forecast_time_utc < params.forecast_end_datetime_local
    GROUP BY forecast.region
  ) AS regions
  ORDER BY region
`;

const SUMMARY_SQL = `
  WITH params AS (
    SELECT
      $1::text AS region,
      $2::date AS observed_start_date,
      $3::date AS observed_end_date,
      $4::timestamp AS selected_execution,
      $5::date AS forecast_start_date,
      $6::date AS forecast_end_date,
      $7::text[] AS requested_stations,
      $8::int AS station_limit
  ),
  selected_forecast_execution AS (
    SELECT selected_execution
    FROM params
  ),
  observed_base AS (
    SELECT
      observed.observation_date,
      observed.region,
      observed.station_id AS site_id,
      observed.station_name,
      observed.temp_f::double precision AS temp_f,
      NULL::double precision AS temp_diff_f,
      NULL::double precision AS temp_normal_f,
      observed.dew_point_f::double precision AS dew_point_f,
      COALESCE(
        observed.heat_index_f,
        observed.wind_chill_f,
        observed.temp_f
      )::double precision AS feels_like_temp_f,
      observed.updated_at
    FROM weather.wsi_hourly_observed_temperatures AS observed
    CROSS JOIN params
    WHERE observed.region = params.region
      AND observed.observation_date >= params.observed_start_date
      AND observed.observation_date < (params.observed_end_date + INTERVAL '1 day')::date
  ),
  forecast_base AS (
    SELECT
      forecast.forecast_time_utc::date AS date,
      forecast.region,
      forecast.station_id AS site_id,
      forecast.station_name,
      forecast.temp_f::double precision AS temp_f,
      forecast.temp_diff_f::double precision AS temp_diff_f,
      forecast.temp_normal_f::double precision AS temp_normal_f,
      forecast.dew_point_f::double precision AS dew_point_f,
      forecast.feels_like_f::double precision AS feels_like_temp_f,
      forecast.updated_at
    FROM weather.wsi_hourly_forecasts AS forecast
    CROSS JOIN params
    CROSS JOIN selected_forecast_execution AS selected_execution
    WHERE forecast.region = params.region
      AND forecast.forecast_issued_at_utc = selected_execution.selected_execution
      AND forecast.forecast_time_utc >= params.forecast_start_date::timestamp
      AND forecast.forecast_time_utc < (params.forecast_end_date + INTERVAL '1 day')::timestamp
  ),
  candidate_stations AS (
    SELECT
      station_rows.region,
      station_rows.station_name,
      MIN(station_rows.site_id) AS site_id
    FROM (
      SELECT region, station_name, site_id FROM observed_base
      UNION ALL
      SELECT region, station_name, site_id FROM forecast_base
    ) AS station_rows
    CROSS JOIN params
    WHERE CARDINALITY(params.requested_stations) = 0
      OR station_rows.station_name = ANY(params.requested_stations)
    GROUP BY station_rows.region, station_rows.station_name, params.region
    ORDER BY
      CASE WHEN station_rows.station_name = params.region THEN 0 ELSE 1 END,
      station_rows.station_name
    LIMIT (SELECT station_limit FROM params)
  ),
  observed_summary AS (
    SELECT
      'observed'::text AS series_source,
      to_char(observed.observation_date, 'YYYY-MM-DD') AS date,
      observed.region,
      observed.station_name,
      MIN(observed.site_id) AS site_id,
      MIN(observed.temp_f) AS min_temp_f,
      MAX(observed.temp_f) AS max_temp_f,
      AVG(observed.temp_f) AS avg_temp_f,
      MIN(observed.temp_diff_f) AS min_temp_diff_f,
      MAX(observed.temp_diff_f) AS max_temp_diff_f,
      AVG(observed.temp_diff_f) AS avg_temp_diff_f,
      MIN(observed.temp_normal_f) AS min_temp_normal_f,
      MAX(observed.temp_normal_f) AS max_temp_normal_f,
      AVG(observed.temp_normal_f) AS avg_temp_normal_f,
      MIN(observed.dew_point_f) AS min_dew_point_f,
      MAX(observed.dew_point_f) AS max_dew_point_f,
      AVG(observed.dew_point_f) AS avg_dew_point_f,
      MIN(observed.feels_like_temp_f) AS min_feels_like_temp_f,
      MAX(observed.feels_like_temp_f) AS max_feels_like_temp_f,
      AVG(observed.feels_like_temp_f) AS avg_feels_like_temp_f,
      COUNT(*) AS hourly_count,
      to_char(MAX(observed.updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at
    FROM observed_base AS observed
    INNER JOIN candidate_stations AS stations
      ON stations.region = observed.region
      AND stations.station_name = observed.station_name
    GROUP BY observed.observation_date, observed.region, observed.station_name
  ),
  forecast_summary AS (
    SELECT
      'forecast'::text AS series_source,
      to_char(forecast.date, 'YYYY-MM-DD') AS date,
      forecast.region,
      forecast.station_name,
      MIN(forecast.site_id) AS site_id,
      MIN(forecast.temp_f) AS min_temp_f,
      MAX(forecast.temp_f) AS max_temp_f,
      AVG(forecast.temp_f) AS avg_temp_f,
      MIN(forecast.temp_diff_f) AS min_temp_diff_f,
      MAX(forecast.temp_diff_f) AS max_temp_diff_f,
      AVG(forecast.temp_diff_f) AS avg_temp_diff_f,
      MIN(forecast.temp_normal_f) AS min_temp_normal_f,
      MAX(forecast.temp_normal_f) AS max_temp_normal_f,
      AVG(forecast.temp_normal_f) AS avg_temp_normal_f,
      MIN(forecast.dew_point_f) AS min_dew_point_f,
      MAX(forecast.dew_point_f) AS max_dew_point_f,
      AVG(forecast.dew_point_f) AS avg_dew_point_f,
      MIN(forecast.feels_like_temp_f) AS min_feels_like_temp_f,
      MAX(forecast.feels_like_temp_f) AS max_feels_like_temp_f,
      AVG(forecast.feels_like_temp_f) AS avg_feels_like_temp_f,
      COUNT(*) AS hourly_count,
      to_char(MAX(forecast.updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at
    FROM forecast_base AS forecast
    INNER JOIN candidate_stations AS stations
      ON stations.region = forecast.region
      AND stations.station_name = forecast.station_name
    GROUP BY forecast.date, forecast.region, forecast.station_name
  )
  SELECT *
  FROM observed_summary
  UNION ALL
  SELECT *
  FROM forecast_summary
  ORDER BY
    station_name,
    date,
    series_source
`;

const FORECAST_EXECUTION_SQL = `
  WITH params AS (
    SELECT
      $1::text AS region,
      $2::date AS requested_execution_date,
      $3::text[] AS requested_stations,
      $4::text AS forecast_run
  ),
  execution_day AS (
    SELECT COALESCE(
      params.requested_execution_date,
      (
        SELECT MAX(forecast.forecast_issued_at_utc::date)
        FROM weather.wsi_hourly_forecasts AS forecast
        WHERE forecast.region = params.region
          AND (
            CARDINALITY(params.requested_stations) = 0
            OR forecast.station_name = ANY(params.requested_stations)
          )
      )
    ) AS execution_date
    FROM params
  ),
  executions AS (
    SELECT
      MIN(forecast.forecast_issued_at_utc) AS primary_execution,
      MAX(forecast.forecast_issued_at_utc) AS intraday_execution
    FROM weather.wsi_hourly_forecasts AS forecast
    CROSS JOIN params
    CROSS JOIN execution_day
    WHERE forecast.region = params.region
      AND forecast.forecast_issued_at_utc::date = execution_day.execution_date
      AND (
        CARDINALITY(params.requested_stations) = 0
        OR forecast.station_name = ANY(params.requested_stations)
      )
  ),
  selected_execution AS (
    SELECT
      execution_day.execution_date,
      primary_execution,
      intraday_execution,
      CASE
        WHEN params.forecast_run = 'intraday'
          AND intraday_execution IS DISTINCT FROM primary_execution
        THEN intraday_execution
        ELSE primary_execution
      END AS selected_execution,
      CASE
        WHEN params.forecast_run = 'intraday'
          AND intraday_execution IS DISTINCT FROM primary_execution
        THEN 'intraday'
        ELSE 'primary'
      END AS selected_run,
      (intraday_execution IS DISTINCT FROM primary_execution) AS intraday_available
    FROM executions
    CROSS JOIN params
    CROSS JOIN execution_day
  ),
  selected_bounds AS (
    SELECT
      MIN(forecast.forecast_time_utc)::date AS forecast_start_date,
      MAX(forecast.forecast_time_utc)::date AS forecast_end_date
    FROM weather.wsi_hourly_forecasts AS forecast
    CROSS JOIN params
    CROSS JOIN selected_execution
    WHERE forecast.region = params.region
      AND forecast.forecast_issued_at_utc = selected_execution.selected_execution
      AND (
        CARDINALITY(params.requested_stations) = 0
        OR forecast.station_name = ANY(params.requested_stations)
      )
  )
  SELECT
    to_char(execution_date, 'YYYY-MM-DD') AS execution_date,
    to_char(primary_execution, 'YYYY-MM-DD"T"HH24:MI:SS') AS primary_execution,
    to_char(intraday_execution, 'YYYY-MM-DD"T"HH24:MI:SS') AS intraday_execution,
    to_char(selected_execution.selected_execution, 'YYYY-MM-DD"T"HH24:MI:SS') AS selected_execution,
    selected_run,
    intraday_available,
    to_char(forecast_start_date, 'YYYY-MM-DD') AS forecast_start_date,
    to_char(forecast_end_date, 'YYYY-MM-DD') AS forecast_end_date
  FROM selected_execution
  CROSS JOIN selected_bounds
`;

const STATIONS_SQL = `
  WITH params AS (
    SELECT
      $1::text AS region,
      $2::date AS observed_start_date,
      $3::date AS observed_end_date,
      $4::timestamp AS selected_execution,
      $5::date AS forecast_start_date,
      $6::date AS forecast_end_date,
      $7::text[] AS requested_stations
  ),
  selected_forecast_execution AS (
    SELECT selected_execution
    FROM params
  ),
  station_rows AS (
    SELECT observed.station_name
    FROM weather.wsi_hourly_observed_temperatures AS observed
    CROSS JOIN params
    WHERE observed.region = params.region
      AND observed.observation_date >= params.observed_start_date
      AND observed.observation_date < (params.observed_end_date + INTERVAL '1 day')::date
    GROUP BY observed.station_name
    UNION
    SELECT forecast.station_name
    FROM weather.wsi_hourly_forecasts AS forecast
    CROSS JOIN params
    CROSS JOIN selected_forecast_execution
    WHERE forecast.region = params.region
      AND forecast.forecast_issued_at_utc = selected_forecast_execution.selected_execution
      AND forecast.forecast_time_utc >= params.forecast_start_date::timestamp
      AND forecast.forecast_time_utc < (params.forecast_end_date + INTERVAL '1 day')::timestamp
    GROUP BY forecast.station_name
  )
  SELECT station_name
  FROM station_rows
  CROSS JOIN params
  ORDER BY
    CASE WHEN station_name = params.region THEN 0 ELSE 1 END,
    station_name
  LIMIT $8::int
`;

const FORECAST_EXECUTION_DATES_SQL = `
  SELECT to_char(forecast.forecast_issued_at_utc::date, 'YYYY-MM-DD') AS execution_date
  FROM weather.wsi_hourly_forecasts AS forecast
  WHERE forecast.region = $1::text
    AND (
      CARDINALITY($2::text[]) = 0
      OR forecast.station_name = ANY($2::text[])
    )
  GROUP BY forecast.forecast_issued_at_utc::date
  ORDER BY forecast.forecast_issued_at_utc::date DESC
  LIMIT 45
`;

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseRegion(raw: string | null): string {
  const value = raw?.trim();
  return value || "PJM";
}

function parseStations(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const station = part.trim();
    if (station) seen.add(station);
    if (seen.size >= MAX_STATIONS) break;
  }
  return Array.from(seen);
}

function todayDateString(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function parseTargetDate(raw: string | null): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return todayDateString();
}

function parseDate(raw: string | null, fallback: string): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return fallback;
}

function parseOptionalDate(raw: string | null): string | null {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

function parseForecastRun(raw: string | null): ForecastRun {
  return raw === "intraday" ? "intraday" : "primary";
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

function clampDateWindow(startDate: string, endDate: string, maxDays: number): [string, string] {
  if (startDate > endDate) return [endDate, startDate];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (diffDays <= maxDays) return [startDate, endDate];
  return [startDate, addDays(startDate, maxDays)];
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function maxStamp(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function buildSummary(row: SummaryRow): TempSummary {
  return {
    minTempF: toNumber(row.min_temp_f),
    maxTempF: toNumber(row.max_temp_f),
    avgTempF: toNumber(row.avg_temp_f),
    minTempDiffF: toNumber(row.min_temp_diff_f),
    maxTempDiffF: toNumber(row.max_temp_diff_f),
    avgTempDiffF: toNumber(row.avg_temp_diff_f),
    minTempNormalF: toNumber(row.min_temp_normal_f),
    maxTempNormalF: toNumber(row.max_temp_normal_f),
    avgTempNormalF: toNumber(row.avg_temp_normal_f),
    minDewPointF: toNumber(row.min_dew_point_f),
    maxDewPointF: toNumber(row.max_dew_point_f),
    avgDewPointF: toNumber(row.avg_dew_point_f),
    minFeelsLikeTempF: toNumber(row.min_feels_like_temp_f),
    maxFeelsLikeTempF: toNumber(row.max_feels_like_temp_f),
    avgFeelsLikeTempF: toNumber(row.avg_feels_like_temp_f),
    hourlyCount: toInt(row.hourly_count),
    updatedAt: row.updated_at,
  };
}

async function getAvailableRegions(): Promise<string[]> {
  if (regionCache && regionCache.expiresAt > Date.now()) {
    return regionCache.regions;
  }

  const result = await query<RegionRow>(REGIONS_SQL);
  const regions = result.map((row) => row.region).filter(Boolean);
  regionCache = {
    expiresAt: Date.now() + FILTER_CACHE_TTL_MS,
    regions,
  };
  return regions;
}

function buildPayload({
  rows,
  availableRegions,
  availableStations,
  availableForecastExecutionDates,
  region,
  requestedStations,
  forecastRun,
  forecastExecutionDate,
  observedStartDate,
  observedEndDate,
  forecastStartDate,
  forecastEndDate,
  forecastExecution,
}: {
  rows: SummaryRow[];
  availableRegions: string[];
  availableStations: string[];
  availableForecastExecutionDates: string[];
  region: string;
  requestedStations: string[];
  forecastRun: ForecastRun;
  forecastExecutionDate: string | null;
  observedStartDate: string;
  observedEndDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  forecastExecution: ForecastExecutionRow | null;
}): WeatherHourlyTempsPayload {
  const stations = new Map<string, WeatherStationSummary>();
  let observedAsOf: string | null = null;
  let forecastAsOf: string | null = null;

  for (const row of rows) {
    const existing = stations.get(row.station_name);
    const station =
      existing ??
      {
        stationName: row.station_name,
        siteId: row.site_id,
        region: row.region,
        cells: {},
      };

    if (!existing) stations.set(row.station_name, station);

    const summary = buildSummary(row);
    const existingCell = station.cells[row.date];
    const observed =
      row.series_source === "observed" ? summary : existingCell?.observed;
    const forecast =
      row.series_source === "forecast" ? summary : existingCell?.forecast;
    const primarySource = observed ? "observed" : "forecast";
    const primary = primarySource === "observed" ? observed : forecast;

    station.cells[row.date] = {
      date: row.date,
      source: observed && forecast ? "both" : observed ? "observed" : "forecast",
      primarySource,
      minTempF: primary?.minTempF ?? null,
      maxTempF: primary?.maxTempF ?? null,
      avgTempF: primary?.avgTempF ?? null,
      minTempDiffF: primary?.minTempDiffF ?? null,
      maxTempDiffF: primary?.maxTempDiffF ?? null,
      avgTempDiffF: primary?.avgTempDiffF ?? null,
      minTempNormalF: primary?.minTempNormalF ?? null,
      maxTempNormalF: primary?.maxTempNormalF ?? null,
      avgTempNormalF: primary?.avgTempNormalF ?? null,
      minDewPointF: primary?.minDewPointF ?? null,
      maxDewPointF: primary?.maxDewPointF ?? null,
      avgDewPointF: primary?.avgDewPointF ?? null,
      minFeelsLikeTempF: primary?.minFeelsLikeTempF ?? null,
      maxFeelsLikeTempF: primary?.maxFeelsLikeTempF ?? null,
      avgFeelsLikeTempF: primary?.avgFeelsLikeTempF ?? null,
      observed,
      forecast,
    };

    if (row.series_source === "observed") {
      observedAsOf = maxStamp(observedAsOf, row.updated_at);
    } else {
      forecastAsOf = maxStamp(forecastAsOf, row.updated_at);
    }
  }

  const stationList = Array.from(stations.values()).sort((left, right) => {
    if (left.stationName === region) return -1;
    if (right.stationName === region) return 1;
    return left.stationName.localeCompare(right.stationName);
  });
  const allDates = dateRange(observedStartDate, forecastEndDate);
  const dates = allDates.map<WeatherDateColumn>((date) => {
    let hasObserved = false;
    let hasForecast = false;
    for (const station of stationList) {
      const cell = station.cells[date];
      hasObserved ||= Boolean(cell?.observed);
      hasForecast ||= Boolean(cell?.forecast);
      if (hasObserved && hasForecast) break;
    }
    return {
      date,
      source: hasObserved && hasForecast ? "both" : hasObserved ? "observed" : "forecast",
    };
  });

  return {
    source: "weather.wsi_hourly_forecasts+weather.wsi_hourly_observed_temperatures",
    filters: {
      region,
      stations: requestedStations,
      forecastRun,
      forecastExecutionDate,
      observedStartDate,
      observedEndDate,
      forecastStartDate,
      forecastEndDate,
    },
    availableRegions,
    availableStations:
      availableStations.length > 0
        ? availableStations
        : stationList.map((station) => station.stationName),
    availableForecastExecutionDates,
    dates,
    stations: stationList,
    rowCounts: {
      summaryRows: rows.length,
      stationCount: stationList.length,
    },
    asOf: {
      observed: observedAsOf,
      forecast: forecastAsOf,
    },
    forecastExecution: {
      requestedRun: forecastRun,
      selectedRun: forecastExecution?.selected_run ?? "primary",
      executionDate: forecastExecution?.execution_date ?? null,
      primary: forecastExecution?.primary_execution ?? null,
      intraday: forecastExecution?.intraday_execution ?? null,
      selected: forecastExecution?.selected_execution ?? null,
      intradayAvailable: forecastExecution?.intraday_available ?? false,
    },
  };
}

function dataAsOf(payload: WeatherHourlyTempsPayload): string | null {
  return maxStamp(payload.asOf.observed, payload.asOf.forecast);
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const region = parseRegion(searchParams.get("region"));
  const requestedStations = parseStations(searchParams.get("stations"));
  const targetDate = parseTargetDate(searchParams.get("targetDate"));
  const observedLookbackDays = clampInt(
    searchParams.get("observedLookbackDays") ?? searchParams.get("lookbackDays"),
    3,
    0,
    MAX_OBSERVED_WINDOW_DAYS
  );
  const forecastExecutionDate = parseOptionalDate(searchParams.get("forecastExecutionDate"));
  const forecastRun = parseForecastRun(searchParams.get("forecastRun"));
  const requestedForecastStartDate = parseOptionalDate(searchParams.get("forecastStartDate"));
  const requestedForecastEndDate = parseOptionalDate(searchParams.get("forecastEndDate"));
  const refresh = searchParams.get("refresh") === "1";

  const [observedStartDate, observedEndDate] = clampDateWindow(
    parseDate(searchParams.get("observedStartDate"), addDays(targetDate, -observedLookbackDays)),
    parseDate(searchParams.get("observedEndDate"), targetDate),
    MAX_OBSERVED_WINDOW_DAYS
  );
  const cacheKey = [
    "weather-hourly-temps",
    region,
    requestedStations.join("|") || "all",
    forecastRun,
    forecastExecutionDate ?? "latest",
    requestedForecastStartDate ?? "full-start",
    requestedForecastEndDate ?? "full-end",
    observedStartDate,
    observedEndDate,
  ].join(":");

  if (!refresh) {
    const cached = RESPONSE_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        payload: cached.payload,
        headers: {
          "Cache-Control": FRESH_CACHE_HEADER,
          "X-Weather-Hourly-Temps-Cache": "HIT",
        },
        rowCount: cached.payload.rowCounts.summaryRows,
        dataAsOf: dataAsOf(cached.payload),
      };
    }
  }

  try {
    const [regions, executionDatesResult, executionResult] = await Promise.all([
      getAvailableRegions(),
      query<ForecastExecutionDateRow>(FORECAST_EXECUTION_DATES_SQL, [
        region,
        requestedStations,
      ]),
      query<ForecastExecutionRow>(FORECAST_EXECUTION_SQL, [
        region,
        forecastExecutionDate,
        requestedStations,
        forecastRun,
      ]),
    ]);

    const forecastExecution = executionResult[0] ?? null;
    const selectedExecution = forecastExecution?.selected_execution ?? null;
    const fullForecastStartDate = forecastExecution?.forecast_start_date ?? targetDate;
    const fullForecastEndDate = forecastExecution?.forecast_end_date ?? targetDate;
    const [forecastStartDate, forecastEndDate] = clampDateWindow(
      requestedForecastStartDate ?? fullForecastStartDate,
      requestedForecastEndDate ?? fullForecastEndDate,
      16
    );

    const [stationsResult, summaryResult] = await Promise.all([
      query<StationRow>(STATIONS_SQL, [
        region,
        observedStartDate,
        observedEndDate,
        selectedExecution,
        forecastStartDate,
        forecastEndDate,
        requestedStations,
        MAX_STATIONS,
      ]),
      query<SummaryRow>(SUMMARY_SQL, [
        region,
        observedStartDate,
        observedEndDate,
        selectedExecution,
        forecastStartDate,
        forecastEndDate,
        requestedStations,
        MAX_STATIONS,
      ]),
    ]);

    const payload = buildPayload({
      rows: summaryResult,
      availableRegions: regions,
      availableStations: stationsResult.map((row) => row.station_name),
      availableForecastExecutionDates: executionDatesResult.map((row) => row.execution_date),
      region,
      requestedStations,
      forecastRun,
      forecastExecutionDate,
      observedStartDate,
      observedEndDate,
      forecastStartDate,
      forecastEndDate,
      forecastExecution,
    });

    RESPONSE_CACHE.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload,
    });

    return {
      payload,
      headers: {
        "Cache-Control": FRESH_CACHE_HEADER,
        "X-Weather-Hourly-Temps-Cache": "MISS",
      },
      rowCount: payload.rowCounts.summaryRows,
      dataAsOf: dataAsOf(payload),
    };
  } catch (error) {
    console.error("[weather-hourly-temps] DB query failed:", error);
    return {
      payload: { error: "Failed to fetch WSI hourly temperature summaries" },
      status: 500,
      headers: {
        "Cache-Control": "no-store",
        "X-Weather-Hourly-Temps-Cache": "ERROR",
      },
      rowCount: 0,
      dataAsOf: null,
    };
  }
});

export async function GET(request: Request): Promise<Response> {
  if (!isWeatherDevEnabled()) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return observedGET(request);
}
