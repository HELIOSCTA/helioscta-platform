import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isWeatherDevEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

const CACHE_TTL_MS = 5 * 60 * 1000;
const FRESH_CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/weather/hourly-forecast",
  cacheHeader: FRESH_CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "WSI hourly forecast chart data",
  p95TargetMs: 1500,
  freshnessSource:
    "weather.wsi_hourly_forecasts.updated_at, weather.wsi_hourly_observed_temperatures.updated_at",
} as const;
const MAX_OBSERVED_WINDOW_DAYS = 60;
const MAX_FORECAST_WINDOW_DAYS = 16;

type ForecastRun = "primary" | "intraday";

interface RegionRow {
  region: string;
}

interface ForecastExecutionDateRow {
  execution_date: string;
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

interface StationRow {
  station_name: string;
}

interface ForecastRow {
  local_time: string;
  forecast_date: string;
  hour: string | number;
  region: string;
  site_id: string | null;
  station_name: string;
  temp: string | number | null;
  tempdiff: string | number | null;
  tempnormal: string | number | null;
  dewpoint: string | number | null;
  cloud_cover: string | number | null;
  feelsliketemp: string | number | null;
  feelsliketempdiff: string | number | null;
  precip: string | number | null;
  winddir: string | number | null;
  windspeed_mph: string | number | null;
  ghirradiance: string | number | null;
  pop: string | number | null;
  relative_humidity_rh: string | number | null;
  updated_at: string | null;
}

interface ObservedRow {
  local_time: string;
  observed_date: string;
  hour: string | number;
  region: string;
  site_id: string | null;
  station_name: string;
  temp_f: string | number | null;
  dew_point_f: string | number | null;
  cloud_cover_pct: string | number | null;
  feels_like_temp_f: string | number | null;
  precip_in: string | number | null;
  wind_dir: string | number | null;
  wind_speed_mph: string | number | null;
  rh: string | number | null;
  updated_at: string | null;
}

interface WeatherHourlyForecastPoint {
  localTime: string;
  date: string;
  hour: number;
  region: string;
  siteId: string | null;
  stationName: string;
  tempF: number | null;
  tempDiffF: number | null;
  tempNormalF: number | null;
  dewPointF: number | null;
  cloudCoverPct: number | null;
  feelsLikeTempF: number | null;
  feelsLikeTempDiffF: number | null;
  precipIn: number | null;
  windDirectionDeg: number | null;
  windSpeedMph: number | null;
  ghiWm2: number | null;
  probabilityOfPrecipPct: number | null;
  relativeHumidityPct: number | null;
  updatedAt: string | null;
}

interface WeatherHourlyObservedPoint {
  localTime: string;
  date: string;
  hour: number;
  region: string;
  siteId: string | null;
  stationName: string;
  tempF: number | null;
  dewPointF: number | null;
  cloudCoverPct: number | null;
  feelsLikeTempF: number | null;
  precipIn: number | null;
  windDirectionDeg: number | null;
  windSpeedMph: number | null;
  relativeHumidityPct: number | null;
  updatedAt: string | null;
}

interface WeatherHourlyForecastPayload {
  source: "weather.wsi_hourly_forecasts";
  filters: {
    region: string;
    station: string | null;
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
  rows: WeatherHourlyForecastPoint[];
  observedRows: WeatherHourlyObservedPoint[];
  rowCounts: {
    hourlyRows: number;
    observedRows: number;
  };
  asOf: {
    forecast: string | null;
    observed: string | null;
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

const RESPONSE_CACHE = new Map<
  string,
  { expiresAt: number; payload: WeatherHourlyForecastPayload }
>();

const REGIONS_SQL = `
  SELECT forecast.region
  FROM weather.wsi_hourly_forecasts AS forecast
  WHERE forecast.forecast_time_utc >= (CURRENT_DATE - INTERVAL '1 day')::timestamp
  GROUP BY forecast.region
  ORDER BY forecast.region
`;

const FORECAST_EXECUTION_DATES_SQL = `
  SELECT to_char(forecast.forecast_issued_at_utc::date, 'YYYY-MM-DD') AS execution_date
  FROM weather.wsi_hourly_forecasts AS forecast
  WHERE forecast.region = $1::text
  GROUP BY forecast.forecast_issued_at_utc::date
  ORDER BY forecast.forecast_issued_at_utc::date DESC
  LIMIT 45
`;

const FORECAST_EXECUTION_SQL = `
  WITH params AS (
    SELECT
      $1::text AS region,
      $2::date AS requested_execution_date,
      $3::text AS forecast_run
  ),
  execution_day AS (
    SELECT COALESCE(
      params.requested_execution_date,
      (
        SELECT MAX(forecast.forecast_issued_at_utc::date)
        FROM weather.wsi_hourly_forecasts AS forecast
        WHERE forecast.region = params.region
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
  SELECT forecast.station_name
  FROM weather.wsi_hourly_forecasts AS forecast
  WHERE forecast.region = $1::text
    AND forecast.forecast_issued_at_utc = $2::timestamp
  GROUP BY forecast.station_name
  ORDER BY
    CASE WHEN forecast.station_name = $1::text THEN 0 ELSE 1 END,
    forecast.station_name
`;

const FORECAST_ROWS_SQL = `
  SELECT
    to_char(forecast.forecast_time_utc, 'YYYY-MM-DD"T"HH24:MI:SS') AS local_time,
    to_char(forecast.forecast_time_utc::date, 'YYYY-MM-DD') AS forecast_date,
    EXTRACT(HOUR FROM forecast.forecast_time_utc)::int AS hour,
    forecast.region,
    forecast.station_id AS site_id,
    forecast.station_name,
    forecast.temp_f AS temp,
    forecast.temp_diff_f AS tempdiff,
    forecast.temp_normal_f AS tempnormal,
    forecast.dew_point_f AS dewpoint,
    forecast.cloud_cover_pct AS cloud_cover,
    forecast.feels_like_f AS feelsliketemp,
    forecast.feels_like_diff_f AS feelsliketempdiff,
    forecast.precip_in AS precip,
    forecast.wind_dir_degrees AS winddir,
    forecast.wind_speed_mph AS windspeed_mph,
    forecast.ghi_irradiance AS ghirradiance,
    forecast.probability_of_precip_pct AS pop,
    forecast.relative_humidity_pct AS relative_humidity_rh,
    to_char(forecast.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at
  FROM weather.wsi_hourly_forecasts AS forecast
  WHERE forecast.region = $1::text
    AND forecast.station_name = $2::text
    AND forecast.forecast_issued_at_utc = $3::timestamp
    AND forecast.forecast_time_utc >= $4::timestamp
    AND forecast.forecast_time_utc < ($5::date + INTERVAL '1 day')::timestamp
  ORDER BY forecast.forecast_time_utc
`;

const OBSERVED_ROWS_SQL = `
  SELECT
    to_char((observed.observation_date::timestamp + (observed.hour_beginning * INTERVAL '1 hour')), 'YYYY-MM-DD"T"HH24:MI:SS') AS local_time,
    to_char(observed.observation_date, 'YYYY-MM-DD') AS observed_date,
    observed.hour_beginning AS hour,
    observed.region,
    observed.station_id AS site_id,
    observed.station_name,
    observed.temp_f,
    observed.dew_point_f,
    observed.cloud_cover_pct,
    COALESCE(
      observed.heat_index_f,
      observed.wind_chill_f,
      observed.temp_f
    ) AS feels_like_temp_f,
    observed.precip_in,
    observed.wind_dir_degrees AS wind_dir,
    observed.wind_speed_mph,
    observed.relative_humidity_pct AS rh,
    to_char(observed.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at
  FROM weather.wsi_hourly_observed_temperatures AS observed
  WHERE observed.region = $1::text
    AND observed.station_name = $2::text
    AND observed.observation_date >= $3::date
    AND observed.observation_date < ($4::date + INTERVAL '1 day')::date
  ORDER BY observed.observation_date, observed.hour_beginning
`;

function parseRegion(raw: string | null): string {
  const value = raw?.trim();
  return value || "PJM";
}

function parseStation(raw: string | null): string | null {
  const value = raw?.trim();
  return value || null;
}

function parseForecastRun(raw: string | null): ForecastRun {
  return raw === "intraday" ? "intraday" : "primary";
}

function parseOptionalDate(raw: string | null): string | null {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

function todayDateString(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function clampDateWindow(startDate: string, endDate: string, maxDays: number): [string, string] {
  let start = startDate;
  let end = endDate;
  if (start > end) {
    [start, end] = [end, start];
  }

  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const diffDays = Math.round((endMs - startMs) / 86_400_000);
  if (diffDays <= maxDays - 1) return [start, end];
  return [start, addDays(start, maxDays - 1)];
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

function normalizeRow(row: ForecastRow): WeatherHourlyForecastPoint {
  return {
    localTime: row.local_time,
    date: row.forecast_date,
    hour: toInt(row.hour),
    region: row.region,
    siteId: row.site_id,
    stationName: row.station_name,
    tempF: toNumber(row.temp),
    tempDiffF: toNumber(row.tempdiff),
    tempNormalF: toNumber(row.tempnormal),
    dewPointF: toNumber(row.dewpoint),
    cloudCoverPct: toNumber(row.cloud_cover),
    feelsLikeTempF: toNumber(row.feelsliketemp),
    feelsLikeTempDiffF: toNumber(row.feelsliketempdiff),
    precipIn: toNumber(row.precip),
    windDirectionDeg: toNumber(row.winddir),
    windSpeedMph: toNumber(row.windspeed_mph),
    ghiWm2: toNumber(row.ghirradiance),
    probabilityOfPrecipPct: toNumber(row.pop),
    relativeHumidityPct: toNumber(row.relative_humidity_rh),
    updatedAt: row.updated_at,
  };
}

function normalizeObservedRow(row: ObservedRow): WeatherHourlyObservedPoint {
  return {
    localTime: row.local_time,
    date: row.observed_date,
    hour: toInt(row.hour),
    region: row.region,
    siteId: row.site_id,
    stationName: row.station_name,
    tempF: toNumber(row.temp_f),
    dewPointF: toNumber(row.dew_point_f),
    cloudCoverPct: toNumber(row.cloud_cover_pct),
    feelsLikeTempF: toNumber(row.feels_like_temp_f),
    precipIn: toNumber(row.precip_in),
    windDirectionDeg: toNumber(row.wind_dir),
    windSpeedMph: toNumber(row.wind_speed_mph),
    relativeHumidityPct: toNumber(row.rh),
    updatedAt: row.updated_at,
  };
}

function selectStation(requested: string | null, availableStations: string[]): string | null {
  if (requested && availableStations.includes(requested)) return requested;
  if (availableStations.includes("PJM")) return "PJM";
  return availableStations[0] ?? null;
}

function dataAsOf(payload: WeatherHourlyForecastPayload): string | null {
  return maxStamp(payload.asOf.observed, payload.asOf.forecast);
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const region = parseRegion(searchParams.get("region"));
  const requestedStation = parseStation(searchParams.get("station"));
  const forecastExecutionDate = parseOptionalDate(searchParams.get("forecastExecutionDate"));
  const forecastRun = parseForecastRun(searchParams.get("forecastRun"));
  const refresh = searchParams.get("refresh") === "1";

  const rawObservedStartDate = parseOptionalDate(searchParams.get("observedStartDate"));
  const rawObservedEndDate = parseOptionalDate(searchParams.get("observedEndDate"));
  const rawForecastStartDate = parseOptionalDate(searchParams.get("forecastStartDate"));
  const rawForecastEndDate = parseOptionalDate(searchParams.get("forecastEndDate"));
  const cacheKey = [
    "weather-hourly-forecast",
    region,
    requestedStation ?? "default",
    forecastRun,
    forecastExecutionDate ?? "latest",
    rawObservedStartDate ?? "default-obs-start",
    rawObservedEndDate ?? "default-obs-end",
    rawForecastStartDate ?? "default-fcst-start",
    rawForecastEndDate ?? "default-fcst-end",
  ].join(":");

  if (!refresh) {
    const cached = RESPONSE_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        payload: cached.payload,
        headers: {
          "Cache-Control": FRESH_CACHE_HEADER,
          "X-Weather-Hourly-Forecast-Cache": "HIT",
        },
        rowCount: cached.payload.rowCounts.hourlyRows + cached.payload.rowCounts.observedRows,
        dataAsOf: dataAsOf(cached.payload),
      };
    }
  }

  try {
    const [regionsResult, executionDatesResult, executionResult] = await Promise.all([
      query<RegionRow>(REGIONS_SQL),
      query<ForecastExecutionDateRow>(FORECAST_EXECUTION_DATES_SQL, [region]),
      query<ForecastExecutionRow>(FORECAST_EXECUTION_SQL, [
        region,
        forecastExecutionDate,
        forecastRun,
      ]),
    ]);

    const execution = executionResult[0] ?? null;
    if (!execution?.selected_execution) {
      return {
        payload: { error: "No WSI hourly forecast execution found for the selected filters" },
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "X-Weather-Hourly-Forecast-Cache": "ERROR",
        },
        rowCount: 0,
        dataAsOf: null,
      };
    }

    const stationsResult = await query<StationRow>(STATIONS_SQL, [
      region,
      execution.selected_execution,
    ]);
    const availableStations = stationsResult.map((row) => row.station_name);
    const station = selectStation(requestedStation, availableStations);
    if (!station) {
      return {
        payload: { error: "No WSI hourly forecast stations found for the selected filters" },
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "X-Weather-Hourly-Forecast-Cache": "ERROR",
        },
        rowCount: 0,
        dataAsOf: null,
      };
    }

    const boundsStart = execution.forecast_start_date ?? todayDateString();
    const defaultObservedEnd = rawObservedEndDate ?? todayDateString();
    const defaultObservedStart = rawObservedStartDate ?? defaultObservedEnd;
    const [observedStartDate, observedEndDate] = clampDateWindow(
      defaultObservedStart,
      defaultObservedEnd,
      MAX_OBSERVED_WINDOW_DAYS
    );
    const defaultForecastStart = rawForecastStartDate ?? boundsStart;
    const defaultForecastEnd =
      rawForecastEndDate ?? execution.forecast_end_date ?? addDays(defaultForecastStart, 15);
    const [forecastStartDate, forecastEndDate] = clampDateWindow(
      defaultForecastStart,
      defaultForecastEnd,
      MAX_FORECAST_WINDOW_DAYS
    );

    const [rowsResult, observedRowsResult] = await Promise.all([
      query<ForecastRow>(FORECAST_ROWS_SQL, [
        region,
        station,
        execution.selected_execution,
        `${forecastStartDate}T00:00:00`,
        forecastEndDate,
      ]),
      query<ObservedRow>(OBSERVED_ROWS_SQL, [
        region,
        station,
        observedStartDate,
        observedEndDate,
      ]),
    ]);
    const rows = rowsResult.map(normalizeRow);
    const observedRows = observedRowsResult.map(normalizeObservedRow);
    const forecastAsOf = rows.reduce<string | null>(
      (latest, row) => maxStamp(latest, row.updatedAt),
      null
    );
    const observedAsOf = observedRows.reduce<string | null>(
      (latest, row) => maxStamp(latest, row.updatedAt),
      null
    );

    const payload: WeatherHourlyForecastPayload = {
      source: "weather.wsi_hourly_forecasts",
      filters: {
        region,
        station,
        forecastRun,
        forecastExecutionDate,
        observedStartDate,
        observedEndDate,
        forecastStartDate,
        forecastEndDate,
      },
      availableRegions: regionsResult.map((row) => row.region),
      availableStations,
      availableForecastExecutionDates: executionDatesResult.map(
        (row) => row.execution_date
      ),
      rows,
      observedRows,
      rowCounts: {
        hourlyRows: rows.length,
        observedRows: observedRows.length,
      },
      asOf: {
        forecast: forecastAsOf,
        observed: observedAsOf,
      },
      forecastExecution: {
        requestedRun: forecastRun,
        selectedRun: execution.selected_run,
        executionDate: execution.execution_date,
        primary: execution.primary_execution,
        intraday: execution.intraday_execution,
        selected: execution.selected_execution,
        intradayAvailable: execution.intraday_available,
      },
    };

    RESPONSE_CACHE.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload,
    });

    return {
      payload,
      headers: {
        "Cache-Control": FRESH_CACHE_HEADER,
        "X-Weather-Hourly-Forecast-Cache": "MISS",
      },
      rowCount: payload.rowCounts.hourlyRows + payload.rowCounts.observedRows,
      dataAsOf: dataAsOf(payload),
    };
  } catch (error) {
    console.error("[weather-hourly-forecast] DB query failed:", error);
    return {
      payload: { error: "Failed to fetch WSI hourly forecast rows" },
      status: 500,
      headers: {
        "Cache-Control": "no-store",
        "X-Weather-Hourly-Forecast-Cache": "ERROR",
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
