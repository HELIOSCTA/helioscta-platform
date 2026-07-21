import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isWeatherDevEnabled } from "@/lib/server/devFeatures";
import {
  WSI_STATION_METADATA,
  WSI_STATION_METADATA_BY_ID,
} from "@/lib/weather/wsiStationMetadata";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

const CACHE_TTL_MS = 5 * 60 * 1000;
const FRESH_CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/weather/wsi-forecast-map",
  cacheHeader: FRESH_CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "WSI single-day station forecast map data",
  p95TargetMs: 1800,
  freshnessSource:
    "weather.wsi_hourly_forecasts.updated_at, weather.wsi_hourly_observed_temperatures.updated_at",
} as const;

type ForecastRun = "primary" | "intraday";

interface RegionRow {
  region: string;
}

interface ForecastExecutionDateRow {
  execution_date: string;
}

interface ForecastExecutionRow {
  execution_date: string | null;
  primary_execution: Date | string | null;
  intraday_execution: Date | string | null;
  selected_execution: Date | string | null;
  selected_run: ForecastRun;
  intraday_available: boolean;
}

interface MapRawRow {
  region: string;
  station_id: string;
  station_name: string;
  forecast_time_utc: string | null;
  observed_time_utc: string | null;
  local_time_ept: string;
  local_date_ept: string;
  hour_beginning_ept: string | number;
  hour_ending_ept: string | number;
  forecast_temp_f: string | number | null;
  forecast_temp_diff_f: string | number | null;
  forecast_temp_normal_f: string | number | null;
  forecast_dew_point_f: string | number | null;
  forecast_cloud_cover_pct: string | number | null;
  forecast_feels_like_f: string | number | null;
  forecast_feels_like_diff_f: string | number | null;
  forecast_precip_in: string | number | null;
  forecast_wind_dir_degrees: string | number | null;
  forecast_wind_speed_mph: string | number | null;
  forecast_ghi_irradiance: string | number | null;
  forecast_probability_of_precip_pct: string | number | null;
  forecast_relative_humidity_pct: string | number | null;
  forecast_updated_at: string | null;
  observed_temp_f: string | number | null;
  observed_dew_point_f: string | number | null;
  observed_cloud_cover_pct: string | number | null;
  observed_feels_like_f: string | number | null;
  observed_precip_in: string | number | null;
  observed_wind_dir_degrees: string | number | null;
  observed_wind_speed_mph: string | number | null;
  observed_relative_humidity_pct: string | number | null;
  observed_updated_at: string | null;
}

interface WsiForecastMapHour {
  hourBeginning: number;
  hourEnding: number;
  label: string;
}

interface WsiForecastMapStation {
  stationId: string;
  stationName: string;
  region: string;
  latitude: number | null;
  longitude: number | null;
  timeZone: string | null;
  state: string | null;
  isAggregate: boolean;
  coordinateSource: "static" | null;
}

interface WsiForecastMapPoint {
  region: string;
  stationId: string;
  stationName: string;
  forecastTimeUtc: string | null;
  observedTimeUtc: string | null;
  localTimeEpt: string;
  localDateEpt: string;
  hourBeginningEpt: number;
  hourEndingEpt: number;
  forecastTempF: number | null;
  forecastTempDiffF: number | null;
  forecastTempNormalF: number | null;
  forecastDewPointF: number | null;
  forecastCloudCoverPct: number | null;
  forecastFeelsLikeF: number | null;
  forecastFeelsLikeDiffF: number | null;
  forecastPrecipIn: number | null;
  forecastWindDirectionDeg: number | null;
  forecastWindSpeedMph: number | null;
  forecastGhiWm2: number | null;
  forecastProbabilityOfPrecipPct: number | null;
  forecastRelativeHumidityPct: number | null;
  forecastUpdatedAt: string | null;
  observedTempF: number | null;
  observedDewPointF: number | null;
  observedCloudCoverPct: number | null;
  observedFeelsLikeF: number | null;
  observedPrecipIn: number | null;
  observedWindDirectionDeg: number | null;
  observedWindSpeedMph: number | null;
  observedRelativeHumidityPct: number | null;
  observedUpdatedAt: string | null;
  tempErrorF: number | null;
  feelsLikeErrorF: number | null;
  dewPointErrorF: number | null;
  cloudCoverErrorPct: number | null;
  precipErrorIn: number | null;
  windSpeedErrorMph: number | null;
  relativeHumidityErrorPct: number | null;
}

interface WsiForecastMapPayload {
  source: "weather.wsi_hourly_forecasts+weather.wsi_hourly_observed_temperatures";
  filters: {
    region: string;
    date: string;
    forecastRun: ForecastRun;
    forecastExecutionDate: string | null;
  };
  availableRegions: string[];
  availableForecastExecutionDates: string[];
  hours: WsiForecastMapHour[];
  stations: WsiForecastMapStation[];
  rows: WsiForecastMapPoint[];
  rowCounts: {
    hourlyRows: number;
    stationCount: number;
    mappedStationCount: number;
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
  { expiresAt: number; payload: WsiForecastMapPayload }
>();

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const STATION_TIMEZONE_VALUES_SQL = WSI_STATION_METADATA.map(
  (station) => `(${sqlLiteral(station.stationId)}, ${sqlLiteral(station.timeZone)})`
).join(",\n    ");

const HOURS: WsiForecastMapHour[] = Array.from({ length: 24 }, (_, hourBeginning) => ({
  hourBeginning,
  hourEnding: hourBeginning + 1,
  label: `HE ${hourBeginning + 1}`,
}));

const REGIONS_SQL = `
  SELECT region
  FROM (
    SELECT forecast.region
    FROM weather.wsi_hourly_forecasts AS forecast
    WHERE forecast.forecast_time_utc >= now() - INTERVAL '1 day'
    GROUP BY forecast.region
    UNION
    SELECT observed.region
    FROM weather.wsi_hourly_observed_temperatures AS observed
    WHERE observed.observation_date >= (CURRENT_DATE - INTERVAL '1 day')::date
    GROUP BY observed.region
  ) AS regions
  ORDER BY region
`;

const FORECAST_EXECUTION_DATES_SQL = `
  WITH params AS (
    SELECT
      $1::text AS region,
      $2::date AS target_date
  ),
  bounds AS (
    SELECT
      (params.target_date::timestamp AT TIME ZONE 'America/New_York') AS start_utc,
      ((params.target_date + INTERVAL '1 day')::timestamp AT TIME ZONE 'America/New_York') AS end_utc
    FROM params
  )
  SELECT to_char(forecast.forecast_issued_at_utc::date, 'YYYY-MM-DD') AS execution_date
  FROM weather.wsi_hourly_forecasts AS forecast
  CROSS JOIN params
  CROSS JOIN bounds
  WHERE forecast.region = params.region
    AND forecast.forecast_time_utc >= bounds.start_utc
    AND forecast.forecast_time_utc < bounds.end_utc
  GROUP BY forecast.forecast_issued_at_utc::date
  ORDER BY forecast.forecast_issued_at_utc::date DESC
  LIMIT 45
`;

const FORECAST_EXECUTION_SQL = `
  WITH params AS (
    SELECT
      $1::text AS region,
      $2::date AS target_date,
      $3::date AS requested_execution_date,
      $4::text AS forecast_run
  ),
  bounds AS (
    SELECT
      (params.target_date::timestamp AT TIME ZONE 'America/New_York') AS start_utc,
      ((params.target_date + INTERVAL '1 day')::timestamp AT TIME ZONE 'America/New_York') AS end_utc
    FROM params
  ),
  execution_day AS (
    SELECT COALESCE(
      params.requested_execution_date,
      (
        SELECT MAX(forecast.forecast_issued_at_utc::date)
        FROM weather.wsi_hourly_forecasts AS forecast
        CROSS JOIN bounds
        WHERE forecast.region = params.region
          AND forecast.forecast_time_utc >= bounds.start_utc
          AND forecast.forecast_time_utc < bounds.end_utc
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
    CROSS JOIN bounds
    WHERE forecast.region = params.region
      AND forecast.forecast_issued_at_utc::date = execution_day.execution_date
      AND forecast.forecast_time_utc >= bounds.start_utc
      AND forecast.forecast_time_utc < bounds.end_utc
  ),
  selected_execution AS (
    SELECT
      to_char(execution_day.execution_date, 'YYYY-MM-DD') AS execution_date,
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
  )
  SELECT
    execution_date,
    primary_execution,
    intraday_execution,
    selected_execution,
    selected_run,
    intraday_available
  FROM selected_execution
`;

const MAP_ROWS_SQL = `
  WITH params AS (
    SELECT
      $1::text AS region,
      $2::date AS target_date,
      $3::timestamptz AS selected_execution
  ),
  station_meta(station_id, station_time_zone) AS (
    VALUES
    ${STATION_TIMEZONE_VALUES_SQL}
  ),
  bounds AS (
    SELECT
      (params.target_date::timestamp AT TIME ZONE 'America/New_York') AS start_utc,
      ((params.target_date + INTERVAL '1 day')::timestamp AT TIME ZONE 'America/New_York') AS end_utc
    FROM params
  ),
  forecast_base AS (
    SELECT
      forecast.region,
      forecast.station_id,
      forecast.station_name,
      forecast.forecast_time_utc,
      forecast.forecast_time_utc AT TIME ZONE 'America/New_York' AS local_time_ept,
      forecast.temp_f,
      forecast.temp_diff_f,
      forecast.temp_normal_f,
      forecast.dew_point_f,
      forecast.cloud_cover_pct,
      forecast.feels_like_f,
      forecast.feels_like_diff_f,
      forecast.precip_in,
      forecast.wind_dir_degrees,
      forecast.wind_speed_mph,
      forecast.ghi_irradiance,
      forecast.probability_of_precip_pct,
      forecast.relative_humidity_pct,
      forecast.updated_at
    FROM weather.wsi_hourly_forecasts AS forecast
    CROSS JOIN params
    CROSS JOIN bounds
    WHERE forecast.region = params.region
      AND forecast.forecast_issued_at_utc = params.selected_execution
      AND forecast.forecast_time_utc >= bounds.start_utc
      AND forecast.forecast_time_utc < bounds.end_utc
  ),
  observed_base AS (
    SELECT
      observed.region,
      observed.station_id,
      observed.station_name,
      observed.observation_time_local AT TIME ZONE COALESCE(
        station_meta.station_time_zone,
        'America/New_York'
      ) AS observed_time_utc,
      (observed.observation_time_local AT TIME ZONE COALESCE(
        station_meta.station_time_zone,
        'America/New_York'
      )) AT TIME ZONE 'America/New_York' AS local_time_ept,
      observed.temp_f,
      observed.dew_point_f,
      observed.cloud_cover_pct,
      COALESCE(
        observed.feels_like_f,
        observed.heat_index_f,
        observed.wind_chill_f,
        observed.temp_f
      ) AS feels_like_f,
      observed.precip_in,
      observed.wind_dir_degrees,
      observed.wind_speed_mph,
      observed.relative_humidity_pct,
      observed.updated_at
    FROM weather.wsi_hourly_observed_temperatures AS observed
    CROSS JOIN params
    LEFT JOIN station_meta
      ON station_meta.station_id = observed.station_id
    WHERE observed.region = params.region
      AND observed.observation_date >= (params.target_date - INTERVAL '1 day')::date
      AND observed.observation_date <= (params.target_date + INTERVAL '1 day')::date
      AND ((observed.observation_time_local AT TIME ZONE COALESCE(
        station_meta.station_time_zone,
        'America/New_York'
      )) AT TIME ZONE 'America/New_York')::date = params.target_date
  )
  SELECT
    COALESCE(forecast.region, observed.region) AS region,
    COALESCE(forecast.station_id, observed.station_id) AS station_id,
    COALESCE(forecast.station_name, observed.station_name) AS station_name,
    to_char(forecast.forecast_time_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS forecast_time_utc,
    to_char(observed.observed_time_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS observed_time_utc,
    to_char(COALESCE(forecast.local_time_ept, observed.local_time_ept), 'YYYY-MM-DD"T"HH24:MI:SS') AS local_time_ept,
    to_char(COALESCE(forecast.local_time_ept, observed.local_time_ept)::date, 'YYYY-MM-DD') AS local_date_ept,
    EXTRACT(HOUR FROM COALESCE(forecast.local_time_ept, observed.local_time_ept))::int AS hour_beginning_ept,
    EXTRACT(HOUR FROM COALESCE(forecast.local_time_ept, observed.local_time_ept))::int + 1 AS hour_ending_ept,
    forecast.temp_f AS forecast_temp_f,
    forecast.temp_diff_f AS forecast_temp_diff_f,
    forecast.temp_normal_f AS forecast_temp_normal_f,
    forecast.dew_point_f AS forecast_dew_point_f,
    forecast.cloud_cover_pct AS forecast_cloud_cover_pct,
    forecast.feels_like_f AS forecast_feels_like_f,
    forecast.feels_like_diff_f AS forecast_feels_like_diff_f,
    forecast.precip_in AS forecast_precip_in,
    forecast.wind_dir_degrees AS forecast_wind_dir_degrees,
    forecast.wind_speed_mph AS forecast_wind_speed_mph,
    forecast.ghi_irradiance AS forecast_ghi_irradiance,
    forecast.probability_of_precip_pct AS forecast_probability_of_precip_pct,
    forecast.relative_humidity_pct AS forecast_relative_humidity_pct,
    to_char(forecast.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS forecast_updated_at,
    observed.temp_f AS observed_temp_f,
    observed.dew_point_f AS observed_dew_point_f,
    observed.cloud_cover_pct AS observed_cloud_cover_pct,
    observed.feels_like_f AS observed_feels_like_f,
    observed.precip_in AS observed_precip_in,
    observed.wind_dir_degrees AS observed_wind_dir_degrees,
    observed.wind_speed_mph AS observed_wind_speed_mph,
    observed.relative_humidity_pct AS observed_relative_humidity_pct,
    to_char(observed.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS observed_updated_at
  FROM forecast_base AS forecast
  FULL OUTER JOIN observed_base AS observed
    ON observed.region = forecast.region
    AND observed.station_id = forecast.station_id
    AND observed.local_time_ept = forecast.local_time_ept
  ORDER BY
    COALESCE(forecast.station_name, observed.station_name),
    COALESCE(forecast.local_time_ept, observed.local_time_ept)
`;

function parseRegion(raw: string | null): string {
  const value = raw?.trim();
  return value || "PJM";
}

function parseForecastRun(raw: string | null): ForecastRun {
  return raw === "intraday" ? "intraday" : "primary";
}

function parseOptionalDate(raw: string | null): string | null {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

function dateStringInTimeZone(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "01";
  return `${part("year")}-${part("month")}-${part("day")}`;
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

function toIsoString(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value;
}

function maxStamp(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function diff(observed: number | null, forecast: number | null): number | null {
  if (observed === null || forecast === null) return null;
  return Math.round((observed - forecast) * 10) / 10;
}

function normalizePoint(row: MapRawRow): WsiForecastMapPoint {
  const forecastTempF = toNumber(row.forecast_temp_f);
  const observedTempF = toNumber(row.observed_temp_f);
  const forecastFeelsLikeF = toNumber(row.forecast_feels_like_f);
  const observedFeelsLikeF = toNumber(row.observed_feels_like_f);
  const forecastDewPointF = toNumber(row.forecast_dew_point_f);
  const observedDewPointF = toNumber(row.observed_dew_point_f);
  const forecastCloudCoverPct = toNumber(row.forecast_cloud_cover_pct);
  const observedCloudCoverPct = toNumber(row.observed_cloud_cover_pct);
  const forecastPrecipIn = toNumber(row.forecast_precip_in);
  const observedPrecipIn = toNumber(row.observed_precip_in);
  const forecastWindSpeedMph = toNumber(row.forecast_wind_speed_mph);
  const observedWindSpeedMph = toNumber(row.observed_wind_speed_mph);
  const forecastRelativeHumidityPct = toNumber(row.forecast_relative_humidity_pct);
  const observedRelativeHumidityPct = toNumber(row.observed_relative_humidity_pct);

  return {
    region: row.region,
    stationId: row.station_id,
    stationName: row.station_name,
    forecastTimeUtc: row.forecast_time_utc,
    observedTimeUtc: row.observed_time_utc,
    localTimeEpt: row.local_time_ept,
    localDateEpt: row.local_date_ept,
    hourBeginningEpt: toInt(row.hour_beginning_ept),
    hourEndingEpt: toInt(row.hour_ending_ept),
    forecastTempF,
    forecastTempDiffF: toNumber(row.forecast_temp_diff_f),
    forecastTempNormalF: toNumber(row.forecast_temp_normal_f),
    forecastDewPointF,
    forecastCloudCoverPct,
    forecastFeelsLikeF,
    forecastFeelsLikeDiffF: toNumber(row.forecast_feels_like_diff_f),
    forecastPrecipIn,
    forecastWindDirectionDeg: toNumber(row.forecast_wind_dir_degrees),
    forecastWindSpeedMph,
    forecastGhiWm2: toNumber(row.forecast_ghi_irradiance),
    forecastProbabilityOfPrecipPct: toNumber(row.forecast_probability_of_precip_pct),
    forecastRelativeHumidityPct,
    forecastUpdatedAt: row.forecast_updated_at,
    observedTempF,
    observedDewPointF,
    observedCloudCoverPct,
    observedFeelsLikeF,
    observedPrecipIn,
    observedWindDirectionDeg: toNumber(row.observed_wind_dir_degrees),
    observedWindSpeedMph,
    observedRelativeHumidityPct,
    observedUpdatedAt: row.observed_updated_at,
    tempErrorF: diff(observedTempF, forecastTempF),
    feelsLikeErrorF: diff(observedFeelsLikeF, forecastFeelsLikeF),
    dewPointErrorF: diff(observedDewPointF, forecastDewPointF),
    cloudCoverErrorPct: diff(observedCloudCoverPct, forecastCloudCoverPct),
    precipErrorIn: diff(observedPrecipIn, forecastPrecipIn),
    windSpeedErrorMph: diff(observedWindSpeedMph, forecastWindSpeedMph),
    relativeHumidityErrorPct: diff(observedRelativeHumidityPct, forecastRelativeHumidityPct),
  };
}

function buildStations(points: WsiForecastMapPoint[]): WsiForecastMapStation[] {
  const stationRows = new Map<string, WsiForecastMapStation>();

  for (const point of points) {
    if (stationRows.has(point.stationId)) continue;
    const metadata = WSI_STATION_METADATA_BY_ID.get(point.stationId);
    const latitude = metadata?.latitude ?? null;
    const longitude = metadata?.longitude ?? null;
    stationRows.set(point.stationId, {
      stationId: point.stationId,
      stationName: point.stationName || metadata?.stationName || point.stationId,
      region: point.region,
      latitude,
      longitude,
      timeZone: metadata?.timeZone ?? null,
      state: metadata?.state ?? null,
      isAggregate: point.stationId === point.region,
      coordinateSource:
        latitude !== null && longitude !== null ? "static" : null,
    });
  }

  return Array.from(stationRows.values()).sort((left, right) => {
    if (left.isAggregate && !right.isAggregate) return -1;
    if (!left.isAggregate && right.isAggregate) return 1;
    return left.stationName.localeCompare(right.stationName);
  });
}

function dataAsOf(payload: WsiForecastMapPayload): string | null {
  return maxStamp(payload.asOf.forecast, payload.asOf.observed);
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const region = parseRegion(searchParams.get("region"));
  const date = parseOptionalDate(searchParams.get("date")) ?? dateStringInTimeZone("America/New_York");
  const forecastExecutionDate = parseOptionalDate(searchParams.get("forecastExecutionDate"));
  const forecastRun = parseForecastRun(searchParams.get("forecastRun"));
  const refresh = searchParams.get("refresh") === "1";
  const cacheKey = [
    "weather-wsi-forecast-map",
    region,
    date,
    forecastExecutionDate ?? "latest",
    forecastRun,
  ].join(":");

  if (!refresh) {
    const cached = RESPONSE_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        payload: cached.payload,
        headers: {
          "Cache-Control": FRESH_CACHE_HEADER,
          "X-Weather-Wsi-Forecast-Map-Cache": "HIT",
        },
        rowCount: cached.payload.rowCounts.hourlyRows,
        dataAsOf: dataAsOf(cached.payload),
      };
    }
  }

  try {
    const [regionsResult, executionDatesResult, executionResult] = await Promise.all([
      query<RegionRow>(REGIONS_SQL),
      query<ForecastExecutionDateRow>(FORECAST_EXECUTION_DATES_SQL, [region, date]),
      query<ForecastExecutionRow>(FORECAST_EXECUTION_SQL, [
        region,
        date,
        forecastExecutionDate,
        forecastRun,
      ]),
    ]);
    const execution = executionResult[0] ?? null;

    if (!execution?.selected_execution) {
      return {
        payload: { error: "No WSI hourly forecast execution found for the selected day" },
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "X-Weather-Wsi-Forecast-Map-Cache": "ERROR",
        },
        rowCount: 0,
        dataAsOf: null,
      };
    }

    const selectedExecution = toIsoString(execution.selected_execution);
    const rowsResult = await query<MapRawRow>(MAP_ROWS_SQL, [region, date, selectedExecution]);
    const rows = rowsResult.map(normalizePoint);
    const stations = buildStations(rows);
    const forecastAsOf = rows.reduce<string | null>(
      (latest, row) => maxStamp(latest, row.forecastUpdatedAt),
      null
    );
    const observedAsOf = rows.reduce<string | null>(
      (latest, row) => maxStamp(latest, row.observedUpdatedAt),
      null
    );
    const payload: WsiForecastMapPayload = {
      source: "weather.wsi_hourly_forecasts+weather.wsi_hourly_observed_temperatures",
      filters: {
        region,
        date,
        forecastRun,
        forecastExecutionDate,
      },
      availableRegions: regionsResult.map((row) => row.region),
      availableForecastExecutionDates: executionDatesResult.map(
        (row) => row.execution_date
      ),
      hours: HOURS,
      stations,
      rows,
      rowCounts: {
        hourlyRows: rows.length,
        stationCount: stations.length,
        mappedStationCount: stations.filter(
          (station) => station.latitude !== null && station.longitude !== null
        ).length,
      },
      asOf: {
        forecast: forecastAsOf,
        observed: observedAsOf,
      },
      forecastExecution: {
        requestedRun: forecastRun,
        selectedRun: execution.selected_run,
        executionDate: execution.execution_date,
        primary: toIsoString(execution.primary_execution),
        intraday: toIsoString(execution.intraday_execution),
        selected: selectedExecution,
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
        "X-Weather-Wsi-Forecast-Map-Cache": "MISS",
      },
      rowCount: payload.rowCounts.hourlyRows,
      dataAsOf: dataAsOf(payload),
    };
  } catch (error) {
    console.error("[weather-wsi-forecast-map] DB query failed:", error);
    return {
      payload: { error: "Failed to fetch WSI forecast map rows" },
      status: 500,
      headers: {
        "Cache-Control": "no-store",
        "X-Weather-Wsi-Forecast-Map-Cache": "ERROR",
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
