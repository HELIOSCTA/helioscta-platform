import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isWeatherDevEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=120";
const DEFAULT_REGION = "PJM";
const DEFAULT_HOURS = 24;
const MAX_HOURS = 48;
const STALE_THRESHOLD_MINUTES = 120;
const ROUTE_CONFIG = {
  route: "/api/pjm-weather",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=120",
  owner: "frontend",
  purpose: "PJM realtime METAR observation dashboard data",
  p95TargetMs: 750,
  freshnessSource: "weather.noaa_metar_observations.observation_time_utc",
} as const;

const PJM_STATIONS = [
  { stationId: "KABE", stationName: "Allentown, PA" },
  { stationId: "KACY", stationName: "Atlantic City, NJ" },
  { stationId: "KBWI", stationName: "Baltimore, MD" },
  { stationId: "KCAK", stationName: "Akron-Canton, OH" },
  { stationId: "KCRW", stationName: "Charleston, WV" },
  { stationId: "KMDW", stationName: "Chicago Midway, IL" },
  { stationId: "KORD", stationName: "Chicago O'Hare, IL" },
  { stationId: "KLUK", stationName: "Cincinnati Lunken, OH" },
  { stationId: "KCLE", stationName: "Cleveland, OH" },
  { stationId: "KCMH", stationName: "Columbus, OH" },
  { stationId: "KCVG", stationName: "Cincinnati, OH" },
  { stationId: "KDAY", stationName: "Dayton, OH" },
  { stationId: "KFWA", stationName: "Fort Wayne, IN" },
  { stationId: "KHGR", stationName: "Hagerstown, MD" },
  { stationId: "KMDT", stationName: "Harrisburg, PA" },
  { stationId: "KHTS", stationName: "Huntington, WV" },
  { stationId: "KMGW", stationName: "Morgantown, WV" },
  { stationId: "KEWR", stationName: "Newark, NJ" },
  { stationId: "KORF", stationName: "Norfolk, VA" },
  { stationId: "KPKB", stationName: "Parkersburg, WV" },
  { stationId: "KPHL", stationName: "Philadelphia, PA" },
  { stationId: "KPIT", stationName: "Pittsburgh, PA" },
  { stationId: "KRIC", stationName: "Richmond, VA" },
  { stationId: "KROA", stationName: "Roanoke, VA" },
  { stationId: "KRFD", stationName: "Rockford, IL" },
  { stationId: "KAVP", stationName: "Scranton/Wilkes-Barre, PA" },
  { stationId: "KTOL", stationName: "Toledo, OH" },
  { stationId: "KDCA", stationName: "Washington Reagan, DC" },
  { stationId: "KIAD", stationName: "Washington Dulles, VA" },
  { stationId: "KIPT", stationName: "Williamsport, PA" },
  { stationId: "KILG", stationName: "Wilmington, DE" },
  { stationId: "KDOV", stationName: "Dover, DE" },
  { stationId: "KWAL", stationName: "Wallops Island, VA" },
] as const;

interface SourceRow {
  station_id: string;
  station_name: string | null;
  region: string | null;
  observation_time_utc: string;
  observation_hour_utc: string;
  temp_f: number | string | null;
  dew_point_f: number | string | null;
  feels_like_f: number | string | null;
  wind_speed_mph: number | string | null;
  wind_gust_mph: number | string | null;
  wind_dir_degrees: number | string | null;
  pressure_mb: number | string | null;
  visibility_miles: number | string | null;
  relative_humidity_pct: number | string | null;
  flight_category: string | null;
  raw_metar: string | null;
  updated_at: string | null;
}

interface WeatherObservation {
  stationId: string;
  stationName: string;
  region: string;
  observationTimeUtc: string;
  observationHourUtc: string;
  tempF: number | null;
  dewPointF: number | null;
  feelsLikeF: number | null;
  windSpeedMph: number | null;
  windGustMph: number | null;
  windDirDegrees: number | null;
  pressureMb: number | null;
  visibilityMiles: number | null;
  relativeHumidityPct: number | null;
  flightCategory: string | null;
  rawMetar: string | null;
  updatedAt: string | null;
}

function parseRegion(value: string | null): string {
  const trimmed = value?.trim().toUpperCase();
  return trimmed === DEFAULT_REGION ? DEFAULT_REGION : DEFAULT_REGION;
}

function parseHours(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_HOURS;
  return Math.min(Math.max(parsed, 1), MAX_HOURS);
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

function maxBy<T>(values: T[], getter: (value: T) => number | null): T | null {
  return values.reduce<T | null>((best, item) => {
    const value = getter(item);
    if (value === null) return best;
    const bestValue = best ? getter(best) : null;
    return bestValue === null || value > bestValue ? item : best;
  }, null);
}

function minBy<T>(values: T[], getter: (value: T) => number | null): T | null {
  return values.reduce<T | null>((best, item) => {
    const value = getter(item);
    if (value === null) return best;
    const bestValue = best ? getter(best) : null;
    return bestValue === null || value < bestValue ? item : best;
  }, null);
}

function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function stationName(stationId: string, sourceName?: string | null): string {
  return sourceName || PJM_STATIONS.find((station) => station.stationId === stationId)?.stationName || stationId;
}

function normalize(row: SourceRow, region: string): WeatherObservation {
  return {
    stationId: row.station_id,
    stationName: stationName(row.station_id, row.station_name),
    region: row.region ?? region,
    observationTimeUtc: isoOrNull(row.observation_time_utc) ?? row.observation_time_utc,
    observationHourUtc: isoOrNull(row.observation_hour_utc) ?? row.observation_hour_utc,
    tempF: toNumber(row.temp_f),
    dewPointF: toNumber(row.dew_point_f),
    feelsLikeF: toNumber(row.feels_like_f),
    windSpeedMph: toNumber(row.wind_speed_mph),
    windGustMph: toNumber(row.wind_gust_mph),
    windDirDegrees: toNumber(row.wind_dir_degrees),
    pressureMb: toNumber(row.pressure_mb),
    visibilityMiles: toNumber(row.visibility_miles),
    relativeHumidityPct: toNumber(row.relative_humidity_pct),
    flightCategory: row.flight_category,
    rawMetar: row.raw_metar,
    updatedAt: isoOrNull(row.updated_at),
  };
}

function emptyPayload({
  region,
  hours,
  runAt,
  elapsedMs,
  reason,
}: {
  region: string;
  hours: number;
  runAt: string;
  elapsedMs: number;
  reason: string;
}) {
  return {
    iso: "pjm",
    region,
    source: "weather.noaa_metar_observations",
    runAt,
    elapsedMs,
    asOf: null,
    hours,
    freshness: {
      status: "Unavailable",
      latestObservationTimeUtc: null,
      stationCount: PJM_STATIONS.length,
      reportingStationCount: 0,
      staleStationCount: PJM_STATIONS.length,
      staleThresholdMinutes: STALE_THRESHOLD_MINUTES,
      reason,
    },
    stations: PJM_STATIONS.map((station) => ({
      stationId: station.stationId,
      stationName: station.stationName,
      region,
      latest: null,
      ageMinutes: null,
      stale: true,
    })),
    latest: {
      avgTempF: null,
      avgDewPointF: null,
      avgFeelsLikeF: null,
      maxGustMph: null,
      hottestStation: null,
      coldestStation: null,
    },
    hourly: [],
  };
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const startedAt = performance.now();
  const runAt = new Date().toISOString();
  const { searchParams } = new URL(request.url);
  const region = parseRegion(searchParams.get("region"));
  const hours = parseHours(searchParams.get("hours"));

  const tableCheck = await query<{ table_name: string | null }>(
    "select to_regclass('weather.noaa_metar_observations')::text as table_name",
  );
  if (!tableCheck[0]?.table_name) {
    const payload = emptyPayload({
      region,
      hours,
      runAt,
      elapsedMs: Math.round(performance.now() - startedAt),
      reason: "weather.noaa_metar_observations is not available",
    });
    return {
      payload,
      headers: { "Cache-Control": CACHE_HEADER, "X-Pjm-Weather-Cache": "MISS" },
      rowCount: 0,
      dataAsOf: "unavailable",
    };
  }

  const stationIds = PJM_STATIONS.map((station) => station.stationId);
  const rows = await query<SourceRow>(
    `
      with recent as (
        select
          station_id,
          station_name,
          region,
          observation_time_utc,
          date_trunc('hour', observation_time_utc) as observation_hour_utc,
          temp_f,
          dew_point_f,
          feels_like_f,
          wind_speed_mph,
          wind_gust_mph,
          wind_dir_degrees,
          pressure_mb,
          visibility_miles,
          relative_humidity_pct,
          flight_category,
          raw_metar,
          updated_at
        from weather.noaa_metar_observations
        where upper(region) = $1
          and station_id = any($2::text[])
          and observation_time_utc >= now() - (($3::int + 2) * interval '1 hour')
      )
      select distinct on (station_id, observation_hour_utc)
        station_id,
        station_name,
        region,
        observation_time_utc::text as observation_time_utc,
        observation_hour_utc::text as observation_hour_utc,
        temp_f::float8 as temp_f,
        dew_point_f::float8 as dew_point_f,
        feels_like_f::float8 as feels_like_f,
        wind_speed_mph::float8 as wind_speed_mph,
        wind_gust_mph::float8 as wind_gust_mph,
        wind_dir_degrees::float8 as wind_dir_degrees,
        pressure_mb::float8 as pressure_mb,
        visibility_miles::float8 as visibility_miles,
        relative_humidity_pct::float8 as relative_humidity_pct,
        flight_category,
        raw_metar,
        updated_at::text as updated_at
      from recent
      order by station_id, observation_hour_utc, observation_time_utc desc
    `,
    [region, stationIds, hours],
  );

  const hourly = rows.map((row) => normalize(row, region));
  const latestByStation = new Map<string, WeatherObservation>();
  hourly.forEach((row) => {
    const existing = latestByStation.get(row.stationId);
    if (!existing || row.observationTimeUtc > existing.observationTimeUtc) {
      latestByStation.set(row.stationId, row);
    }
  });

  const latestRows = Array.from(latestByStation.values());
  const asOf = latestRows
    .map((row) => row.observationTimeUtc)
    .sort()
    .at(-1) ?? null;
  const runAtMs = Date.parse(runAt);
  const stations = PJM_STATIONS.map((station) => {
    const latest = latestByStation.get(station.stationId) ?? null;
    const ageMinutes = latest
      ? Math.max(0, Math.round((runAtMs - Date.parse(latest.observationTimeUtc)) / 60_000))
      : null;
    return {
      stationId: station.stationId,
      stationName: latest?.stationName ?? station.stationName,
      region,
      latest,
      ageMinutes,
      stale: ageMinutes === null || ageMinutes > STALE_THRESHOLD_MINUTES,
    };
  });
  const reportingStationCount = stations.filter((station) => station.latest).length;
  const staleStationCount = stations.filter((station) => station.stale).length;
  const hottestStation = maxBy(latestRows, (row) => row.tempF);
  const coldestStation = minBy(latestRows, (row) => row.tempF);
  const maxGustStation = maxBy(latestRows, (row) => row.windGustMph);

  const payload = {
    iso: "pjm",
    region,
    source: "weather.noaa_metar_observations",
    runAt,
    elapsedMs: Math.round(performance.now() - startedAt),
    asOf,
    hours,
    freshness: {
      status:
        reportingStationCount === 0
          ? "Empty"
          : staleStationCount === 0
            ? "Current"
            : staleStationCount < PJM_STATIONS.length
              ? "Partial"
              : "Stale",
      latestObservationTimeUtc: asOf,
      stationCount: PJM_STATIONS.length,
      reportingStationCount,
      staleStationCount,
      staleThresholdMinutes: STALE_THRESHOLD_MINUTES,
      reason: null,
    },
    stations,
    latest: {
      avgTempF: avg(latestRows.map((row) => row.tempF)),
      avgDewPointF: avg(latestRows.map((row) => row.dewPointF)),
      avgFeelsLikeF: avg(latestRows.map((row) => row.feelsLikeF)),
      maxGustMph: maxGustStation?.windGustMph ?? null,
      hottestStation: hottestStation
        ? {
            stationId: hottestStation.stationId,
            stationName: hottestStation.stationName,
            tempF: hottestStation.tempF,
          }
        : null,
      coldestStation: coldestStation
        ? {
            stationId: coldestStation.stationId,
            stationName: coldestStation.stationName,
            tempF: coldestStation.tempF,
          }
        : null,
    },
    hourly,
  };

  return {
    payload,
    headers: { "Cache-Control": CACHE_HEADER, "X-Pjm-Weather-Cache": "MISS" },
    rowCount: hourly.length,
    dataAsOf: asOf ?? "empty",
  };
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
