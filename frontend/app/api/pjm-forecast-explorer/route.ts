import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=600, stale-while-revalidate=120";
const ROUTE_CONFIG = {
  route: "/api/pjm-forecast-explorer",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=600, stale-while-revalidate=120",
  owner: "frontend",
  purpose: "PJM load forecast area/date explorer summary",
  p95TargetMs: 750,
  freshnessSource: "pjm.load_frcstd_7_day.evaluated_at_datetime_ept",
} as const;

interface SummaryRow {
  forecast_area: string;
  forecast_date: string;
  evaluated_at_ept: string;
  flat_avg: number | string | null;
  on_peak_avg: number | string | null;
  off_peak_avg: number | string | null;
  peak_mw: number | string | null;
  min_mw: number | string | null;
  updated_at: string | null;
}

interface MetricSummary {
  flatAvg: number | null;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  peakMw: number | null;
  minMw: number | null;
}

interface DeltaSummary extends MetricSummary {
  hours: number;
  anchorEvaluatedAtEpt: string;
}

interface ExplorerCell extends MetricSummary {
  area: string;
  forecastDate: string;
  vintageCount: number;
  latestEvaluatedAtEpt: string;
  deltas: Record<string, DeltaSummary | null>;
  delta24h: MetricSummary | null;
  delta48h: MetricSummary | null;
}

const ANCHOR_TOLERANCE_MS = 6 * 3_600_000;
const DELTA_WINDOWS = [1, 12, 24, 48, 72] as const;

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampMs(value: string): number {
  return new Date(`${value}Z`).getTime();
}

function metrics(row: SummaryRow): MetricSummary {
  return {
    flatAvg: toNumber(row.flat_avg),
    onPeakAvg: toNumber(row.on_peak_avg),
    offPeakAvg: toNumber(row.off_peak_avg),
    peakMw: toNumber(row.peak_mw),
    minMw: toNumber(row.min_mw),
  };
}

function diffMetrics(latest: MetricSummary, anchor: MetricSummary): MetricSummary {
  return {
    flatAvg:
      latest.flatAvg === null || anchor.flatAvg === null ? null : latest.flatAvg - anchor.flatAvg,
    onPeakAvg:
      latest.onPeakAvg === null || anchor.onPeakAvg === null
        ? null
        : latest.onPeakAvg - anchor.onPeakAvg,
    offPeakAvg:
      latest.offPeakAvg === null || anchor.offPeakAvg === null
        ? null
        : latest.offPeakAvg - anchor.offPeakAvg,
    peakMw: latest.peakMw === null || anchor.peakMw === null ? null : latest.peakMw - anchor.peakMw,
    minMw: latest.minMw === null || anchor.minMw === null ? null : latest.minMw - anchor.minMw,
  };
}

function pickAnchor(rows: SummaryRow[], latest: SummaryRow, hours: number): SummaryRow | null {
  const targetMs = timestampMs(latest.evaluated_at_ept) - hours * 3_600_000;
  const prior = rows.filter((row) => row.evaluated_at_ept !== latest.evaluated_at_ept);
  const best = prior.reduce<{ row: SummaryRow; diffMs: number } | null>((acc, row) => {
    const diffMs = Math.abs(timestampMs(row.evaluated_at_ept) - targetMs);
    return !acc || diffMs < acc.diffMs ? { row, diffMs } : acc;
  }, null);
  return best && best.diffMs <= ANCHOR_TOLERANCE_MS ? best.row : null;
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async () => {
  const rows = await query<SummaryRow>(
    `
      select
        forecast_area,
        forecast_datetime_beginning_ept::date::text as forecast_date,
        to_char(evaluated_at_datetime_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
        avg(forecast_load_mw)::float8 as flat_avg,
        avg(forecast_load_mw) filter (
          where extract(hour from forecast_datetime_beginning_ept)::int between 7 and 22
        )::float8 as on_peak_avg,
        avg(forecast_load_mw) filter (
          where extract(hour from forecast_datetime_beginning_ept)::int < 7
             or extract(hour from forecast_datetime_beginning_ept)::int > 22
        )::float8 as off_peak_avg,
        max(forecast_load_mw)::float8 as peak_mw,
        min(forecast_load_mw)::float8 as min_mw,
        to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
      from pjm.load_frcstd_7_day
      where forecast_datetime_beginning_ept::date >= current_date
      group by
        forecast_area,
        forecast_datetime_beginning_ept::date,
        evaluated_at_datetime_ept
      order by forecast_area, forecast_date, evaluated_at_ept
    `,
  );

  if (!rows.length) {
    return {
      status: 404,
      payload: { error: "No PJM load forecast summary data is available" },
      headers: { "Cache-Control": "no-store", "X-Pjm-Forecast-Explorer-Cache": "MISS" },
    };
  }

  const groups = new Map<string, SummaryRow[]>();
  rows.forEach((row) => {
    const key = `${row.forecast_area}|${row.forecast_date}`;
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  });

  const cells: ExplorerCell[] = [];
  groups.forEach((values) => {
    const sorted = values.sort((a, b) => a.evaluated_at_ept.localeCompare(b.evaluated_at_ept));
    const latest = sorted.at(-1)!;
    const latestMetrics = metrics(latest);
    const anchor24 = pickAnchor(sorted, latest, 24);
    const anchor48 = pickAnchor(sorted, latest, 48);
    const deltas = Object.fromEntries(
      DELTA_WINDOWS.map((hours) => {
        const anchor = pickAnchor(sorted, latest, hours);
        return [
          `${hours}h`,
          anchor
            ? {
                hours,
                anchorEvaluatedAtEpt: anchor.evaluated_at_ept,
                ...diffMetrics(latestMetrics, metrics(anchor)),
              }
            : null,
        ];
      }),
    ) as Record<string, DeltaSummary | null>;
    cells.push({
      area: latest.forecast_area,
      forecastDate: latest.forecast_date,
      vintageCount: sorted.length,
      latestEvaluatedAtEpt: latest.evaluated_at_ept,
      ...latestMetrics,
      deltas,
      delta24h: anchor24 ? diffMetrics(latestMetrics, metrics(anchor24)) : null,
      delta48h: anchor48 ? diffMetrics(latestMetrics, metrics(anchor48)) : null,
    });
  });

  const areas = Array.from(new Set(cells.map((row) => row.area))).sort();
  const forecastDates = Array.from(new Set(cells.map((row) => row.forecastDate))).sort();
  const asOf = cells
    .map((row) => row.latestEvaluatedAtEpt)
    .sort()
    .at(-1);
  const latestUpdate = rows
    .map((row) => row.updated_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return {
    payload: {
      iso: "pjm",
      source: "pjm.load_frcstd_7_day",
      asOf,
      latestUpdate,
      areas,
      forecastDates,
      rowCount: rows.length,
      cellCount: cells.length,
      cells: cells.sort((a, b) =>
        a.area === b.area
          ? a.forecastDate.localeCompare(b.forecastDate)
          : a.area.localeCompare(b.area),
      ),
    },
    headers: { "Cache-Control": CACHE_HEADER, "X-Pjm-Forecast-Explorer-Cache": "MISS" },
    rowCount: rows.length,
    dataAsOf: asOf,
  };
});
