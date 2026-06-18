import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=600, stale-while-revalidate=120";
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
  route: "/api/pjm-meteologica-forecast-differences",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=600, stale-while-revalidate=120",
  owner: "frontend",
  purpose: "PJM Meteologica load forecast vintage difference dashboard data",
  p95TargetMs: 1_000,
  freshnessSource: "meteologica.pjm_forecast_hourly.issue_date",
} as const;

interface AreaRow {
  forecast_area: string;
}

interface DateRow {
  forecast_date: string;
}

interface SourceRow {
  evaluated_at_datetime_ept: string;
  forecast_date: string;
  he_start: number | string;
  forecast_load_mw: number | string | null;
  updated_at: string | null;
}

interface VintageCurve {
  evaluatedAtEpt: string;
  tag: string;
  peak: number | null;
  onPeak: number | null;
  offPeak: number | null;
  hourly: Array<number | null>;
}

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

function summarizeCurve(evaluatedAtEpt: string, tag: string, hourly: Array<number | null>): VintageCurve {
  const nums = hourly.filter((value): value is number => value !== null);
  return {
    evaluatedAtEpt,
    tag,
    peak: nums.length ? Math.max(...nums) : null,
    onPeak: avg(ON_PEAK_HE_STARTS.map((hour) => hourly[hour] ?? null)),
    offPeak: avg(hourly.map((value, hour) => (ON_PEAK_HE_START_SET.has(hour) ? null : value))),
    hourly,
  };
}

function deltaCurve(label: string, latest: VintageCurve, anchor: VintageCurve): VintageCurve {
  const hourly = latest.hourly.map((value, index) => {
    const anchorValue = anchor.hourly[index];
    return value === null || anchorValue === null ? null : value - anchorValue;
  });
  const peak = latest.peak === null || anchor.peak === null ? null : latest.peak - anchor.peak;
  const onPeak =
    latest.onPeak === null || anchor.onPeak === null ? null : latest.onPeak - anchor.onPeak;
  const offPeak =
    latest.offPeak === null || anchor.offPeak === null ? null : latest.offPeak - anchor.offPeak;
  return {
    evaluatedAtEpt: anchor.evaluatedAtEpt,
    tag: label,
    peak,
    onPeak,
    offPeak,
    hourly,
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

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const requestedArea = parseArea(searchParams.get("area"));
  const requestedDate = parseDate(searchParams.get("date"));
  const lookbackHours = parseLookbackHours(searchParams.get("lookbackHours"));

  const areas = await query<AreaRow>(
    `
      select distinct forecast_area
      from meteologica.pjm_forecast_hourly
      where region = 'PJM'
        and metric = 'load'
      order by forecast_area
    `,
  );
  const availableAreas = areas.map((row) => row.forecast_area);
  const fallbackArea = availableAreas.includes(DEFAULT_AREA) ? DEFAULT_AREA : availableAreas[0];
  if (!fallbackArea) {
    return {
      status: 404,
      payload: { error: "No PJM Meteologica load forecast data is available" },
      headers: { "Cache-Control": "no-store", "X-Pjm-Meteologica-Forecast-Differences-Cache": "MISS" },
    };
  }
  const area = availableAreas.includes(requestedArea) ? requestedArea : fallbackArea;

  const dates = await query<DateRow>(
    `
      select distinct forecast_period_start::date::text as forecast_date
      from meteologica.pjm_forecast_hourly
      where region = 'PJM'
        and metric = 'load'
        and forecast_area = $1
        and forecast_period_start::date >= current_date
      order by forecast_date
    `,
    [area],
  );
  const forecastDates = dates.map((row) => row.forecast_date);
  const forecastDate =
    requestedDate && forecastDates.includes(requestedDate) ? requestedDate : forecastDates[0];
  if (!forecastDate) {
    return {
      status: 404,
      payload: { error: "No current PJM Meteologica load forecast dates are available" },
      headers: { "Cache-Control": "no-store", "X-Pjm-Meteologica-Forecast-Differences-Cache": "MISS" },
    };
  }

  const rows = await query<SourceRow>(
    `
      select
        to_char(issue_date, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_datetime_ept,
        forecast_period_start::date::text as forecast_date,
        extract(hour from forecast_period_start)::int as he_start,
        forecast_mw::float8 as forecast_load_mw,
        to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
      from meteologica.pjm_forecast_hourly
      where region = 'PJM'
        and metric = 'load'
        and issue_date is not null
        and forecast_area = $1
        and forecast_period_start::date = $2::date
      order by issue_date, forecast_period_start
    `,
    [area, forecastDate],
  );

  const byVintage = new Map<string, Array<number | null>>();
  rows.forEach((row) => {
    const key = row.evaluated_at_datetime_ept;
    const hourly = byVintage.get(key) ?? Array.from({ length: 24 }, () => null);
    const hour = Number(row.he_start);
    if (hour >= 0 && hour <= 23) hourly[hour] = toNumber(row.forecast_load_mw);
    byVintage.set(key, hourly);
  });

  const curves = Array.from(byVintage.entries()).map(([evaluatedAtEpt, hourly]) =>
    summarizeCurve(evaluatedAtEpt, "", hourly),
  );
  if (!curves.length) {
    return {
      status: 404,
      payload: { error: "No PJM Meteologica load forecast vintage data is available" },
      headers: { "Cache-Control": "no-store", "X-Pjm-Meteologica-Forecast-Differences-Cache": "MISS" },
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
  const asOf = latest.evaluatedAtEpt;
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
      asOf,
      latestUpdate,
      source: "meteologica.pjm_forecast_hourly",
      sourceComparisonAvailable: false,
      sourceComparisonNote: "Meteologica forecast source selected.",
      rowCount: rows.length,
      lookbackHours,
      snapshotRows,
      deltaRows,
      lookbackRows,
      windowRows: lookbackRows,
    },
    headers: { "Cache-Control": CACHE_HEADER, "X-Pjm-Meteologica-Forecast-Differences-Cache": "MISS" },
    rowCount: rows.length,
    dataAsOf: asOf,
  };
});
