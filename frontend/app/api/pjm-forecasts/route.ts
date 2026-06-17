import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=600, stale-while-revalidate=120";
const DEFAULT_AREA = "RTO_COMBINED";
const ROUTE_CONFIG = {
  route: "/api/pjm-forecasts",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=600, stale-while-revalidate=120",
  owner: "frontend",
  purpose: "PJM seven-day load forecast dashboard data",
  p95TargetMs: 750,
  freshnessSource: "pjm.load_frcstd_7_day.evaluated_at_datetime_ept",
} as const;

interface AreaRow {
  forecast_area: string;
}

interface ForecastRow {
  evaluated_at_datetime_ept: string;
  forecast_area: string;
  forecast_date: string;
  datetime_beginning_ept: string;
  hour_ending: number | string;
  forecast_load_mw: number | string | null;
  updated_at: string | null;
}

function parseArea(value: string | null): string {
  if (!value) return DEFAULT_AREA;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z0-9_&/ -]{2,64}$/.test(trimmed) ? trimmed : DEFAULT_AREA;
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

function summarizeDay(forecastDate: string, rows: ForecastRow[]) {
  const hourly = rows.map((row) => ({
    hourEnding: Number(row.hour_ending),
    forecastLoadMw: toNumber(row.forecast_load_mw),
  }));
  const onPeak = hourly.filter((row) => row.hourEnding >= 8 && row.hourEnding <= 23);
  const offPeak = hourly.filter((row) => row.hourEnding < 8 || row.hourEnding > 23);
  const peak = hourly.reduce<(typeof hourly)[number] | null>((best, row) => {
    if (row.forecastLoadMw === null) return best;
    return !best || best.forecastLoadMw === null || row.forecastLoadMw > best.forecastLoadMw
      ? row
      : best;
  }, null);
  const trough = hourly.reduce<(typeof hourly)[number] | null>((best, row) => {
    if (row.forecastLoadMw === null) return best;
    return !best || best.forecastLoadMw === null || row.forecastLoadMw < best.forecastLoadMw
      ? row
      : best;
  }, null);

  return {
    forecastDate,
    flatAvg: avg(hourly.map((row) => row.forecastLoadMw)),
    onPeakAvg: avg(onPeak.map((row) => row.forecastLoadMw)),
    offPeakAvg: avg(offPeak.map((row) => row.forecastLoadMw)),
    peakHour: peak?.hourEnding ?? null,
    peakLoadMw: peak?.forecastLoadMw ?? null,
    troughHour: trough?.hourEnding ?? null,
    troughLoadMw: trough?.forecastLoadMw ?? null,
  };
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const requestedArea = parseArea(searchParams.get("area"));

  const areas = await query<AreaRow>(
    `
      with latest as (
        select max(evaluated_at_datetime_utc) as evaluated_at_datetime_utc
        from pjm.load_frcstd_7_day
      )
      select distinct forecast_area
      from pjm.load_frcstd_7_day
      join latest using (evaluated_at_datetime_utc)
      order by forecast_area
    `,
  );
  const availableAreas = areas.map((row) => row.forecast_area);
  const fallbackArea = availableAreas.includes(DEFAULT_AREA) ? DEFAULT_AREA : availableAreas[0];
  if (!fallbackArea) {
    return {
      status: 404,
      payload: { error: "No PJM load forecast data is available" },
      headers: { "Cache-Control": "no-store", "X-Pjm-Forecasts-Cache": "MISS" },
    };
  }
  const area = availableAreas.includes(requestedArea) ? requestedArea : fallbackArea;

  const rows = await query<ForecastRow>(
    `
      with latest as (
        select max(evaluated_at_datetime_utc) as evaluated_at_datetime_utc
        from pjm.load_frcstd_7_day
      )
      select
        to_char(evaluated_at_datetime_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_datetime_ept,
        forecast_area,
        forecast_datetime_beginning_ept::date::text as forecast_date,
        to_char(forecast_datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
        (extract(hour from forecast_datetime_beginning_ept)::int + 1) as hour_ending,
        forecast_load_mw::float8 as forecast_load_mw,
        to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
      from pjm.load_frcstd_7_day
      join latest using (evaluated_at_datetime_utc)
      where forecast_area = $1
      order by forecast_datetime_beginning_ept
    `,
    [area],
  );

  if (!rows.length) {
    return {
      status: 404,
      payload: { error: "No PJM load forecast data is available" },
      headers: { "Cache-Control": "no-store", "X-Pjm-Forecasts-Cache": "MISS" },
    };
  }

  const forecastDates = Array.from(new Set(rows.map((row) => row.forecast_date))).sort();
  const daily = forecastDates.map((forecastDate) =>
    summarizeDay(
      forecastDate,
      rows.filter((row) => row.forecast_date === forecastDate),
    ),
  );
  const asOf = rows[0]?.evaluated_at_datetime_ept ?? null;
  const latestUpdate = rows.reduce<string | null>(
    (best, row) => (row.updated_at && (!best || row.updated_at > best) ? row.updated_at : best),
    null,
  );

  return {
    payload: {
      iso: "pjm",
      area,
      areas: availableAreas,
      asOf,
      latestUpdate,
      source: "pjm.load_frcstd_7_day",
      forecastDates,
      rowCount: rows.length,
      daily,
      hourly: rows.map((row) => ({
        forecastDate: row.forecast_date,
        datetimeBeginningEpt: row.datetime_beginning_ept,
        hourEnding: Number(row.hour_ending),
        forecastLoadMw: toNumber(row.forecast_load_mw),
      })),
    },
    headers: { "Cache-Control": CACHE_HEADER, "X-Pjm-Forecasts-Cache": "MISS" },
    rowCount: rows.length,
    dataAsOf: asOf,
  };
});
