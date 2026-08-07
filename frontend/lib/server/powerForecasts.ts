import "server-only";

import { query } from "@/lib/server/db";

export type PowerForecastIso = "pjm" | "ercot" | "isone" | "caiso" | "miso" | "spp" | "nyiso";
export type PowerForecastSource = "pjm" | "meteologica";
export type PowerForecastType = "load" | "netLoad";

export interface PowerForecastIsoConfig {
  iso: PowerForecastIso;
  label: string;
  region: string;
  meteologicaTable: string;
  defaultMeteologicaArea: string;
  pjmDataMinerLoadArea?: string;
  pjmDataMinerNetLoadArea?: string;
  peakWindow: {
    startHourEnding: number;
    endHourEnding: number;
  };
}

interface SummaryRow {
  forecast_area: string;
  forecast_date: string;
  evaluated_at_ept: string;
  vintage_count?: number | string;
  flat_avg: number | string | null;
  on_peak_avg: number | string | null;
  off_peak_avg: number | string | null;
  peak_mw: number | string | null;
  min_mw: number | string | null;
  updated_at: string | null;
}

interface LoadMetricSummary {
  flatAvg: number | null;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  peakMw: number | null;
  minMw: number | null;
}

interface LoadDeltaSummary extends LoadMetricSummary {
  hours: number;
  anchorEvaluatedAtEpt: string;
}

interface LoadExplorerCell extends LoadMetricSummary {
  area: string;
  forecastDate: string;
  vintageCount: number;
  latestEvaluatedAtEpt: string;
  deltas: Record<string, LoadDeltaSummary | null>;
  delta24h: LoadMetricSummary | null;
  delta48h: LoadMetricSummary | null;
}

interface NetLoadSummaryRow {
  forecast_area: string;
  forecast_date: string;
  evaluated_at_ept: string;
  vintage_count: number | string;
  net_flat_avg: number | string | null;
  net_on_peak_avg: number | string | null;
  net_off_peak_avg: number | string | null;
  net_peak_mw: number | string | null;
  net_min_mw: number | string | null;
  load_peak_mw: number | string | null;
  load_on_peak_avg: number | string | null;
  load_off_peak_avg: number | string | null;
  load_flat_avg: number | string | null;
  solar_peak_mw: number | string | null;
  solar_on_peak_avg: number | string | null;
  solar_off_peak_avg: number | string | null;
  solar_flat_avg: number | string | null;
  wind_peak_mw: number | string | null;
  wind_on_peak_avg: number | string | null;
  wind_off_peak_avg: number | string | null;
  wind_flat_avg: number | string | null;
  renewable_flat_avg: number | string | null;
  complete_hour_count: number | string;
  updated_at: string | null;
}

interface NetLoadMetricSummary {
  netFlatAvg: number | null;
  netOnPeakAvg: number | null;
  netOffPeakAvg: number | null;
  netPeakMw: number | null;
  netMinMw: number | null;
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
}

interface NetLoadDeltaSummary extends NetLoadMetricSummary {
  hours: number;
  anchorEvaluatedAtEpt: string;
}

interface NetLoadExplorerCell extends NetLoadMetricSummary {
  area: string;
  forecastDate: string;
  vintageCount: number;
  latestEvaluatedAtEpt: string;
  completeHourCount: number;
  deltas: Record<string, NetLoadDeltaSummary | null>;
}

interface AreaRow {
  forecast_area: string;
}

interface DateRow {
  forecast_date: string;
}

interface LoadSourceRow {
  evaluated_at_ept: string;
  forecast_date: string;
  he_start: number | string;
  load_mw: number | string | null;
  updated_at: string | null;
}

interface NetLoadSourceRow extends LoadSourceRow {
  solar_mw: number | string | null;
  wind_mw: number | string | null;
  net_load_mw: number | string | null;
}

interface LoadVintageCurve {
  evaluatedAtEpt: string;
  tag: string;
  peak: number | null;
  onPeak: number | null;
  offPeak: number | null;
  hourly: Array<number | null>;
}

interface NetLoadVintageCurve extends NetLoadMetricSummary {
  evaluatedAtEpt: string;
  tag: string;
  hourly: Array<number | null>;
  loadHourly: Array<number | null>;
  windHourly: Array<number | null>;
  solarHourly: Array<number | null>;
  netHourly: Array<number | null>;
}

interface NetLoadAccumulator {
  net: Array<number | null>;
  load: Array<number | null>;
  solar: Array<number | null>;
  wind: Array<number | null>;
}

interface LoadCompareHour {
  he: number;
  loadBaseMw: number | null;
  loadCompareMw: number | null;
  loadDeltaMw: number | null;
}

interface NetLoadCompareHour extends LoadCompareHour {
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

const CACHE_HEADER = "public, s-maxage=600, stale-while-revalidate=600, stale-if-error=3600";
const DIFFERENCES_CACHE_HEADER = "public, s-maxage=600, stale-while-revalidate=120";
const DEFAULT_LOOKBACK_HOURS = 72;
const MIN_LOOKBACK_HOURS = 1;
const MAX_LOOKBACK_HOURS = 168;
const ANCHOR_TOLERANCE_MS = 6 * 3_600_000;
const DELTA_WINDOWS = [1, 12, 24, 48, 72] as const;
const LAGS = [
  { label: "72h", hours: 72 },
  { label: "48h", hours: 48 },
  { label: "24h", hours: 24 },
  { label: "12h", hours: 12 },
  { label: "1h", hours: 1 },
] as const;
const FORMULA = "net_load_mw = load - solar - wind";

export const POWER_FORECAST_ISO_ORDER: PowerForecastIso[] = [
  "pjm",
  "ercot",
  "isone",
  "caiso",
  "miso",
  "spp",
  "nyiso",
];

const ISO_CONFIGS: Record<PowerForecastIso, PowerForecastIsoConfig> = {
  pjm: {
    iso: "pjm",
    label: "PJM",
    region: "PJM",
    meteologicaTable: "meteologica.pjm_forecast_hourly",
    defaultMeteologicaArea: "RTO",
    pjmDataMinerLoadArea: "RTO_COMBINED",
    pjmDataMinerNetLoadArea: "RTO",
    peakWindow: { startHourEnding: 8, endHourEnding: 23 },
  },
  ercot: {
    iso: "ercot",
    label: "ERCOT",
    region: "ERCOT",
    meteologicaTable: "meteologica.ercot_forecast_hourly",
    defaultMeteologicaArea: "ERCOT",
    peakWindow: { startHourEnding: 7, endHourEnding: 22 },
  },
  isone: {
    iso: "isone",
    label: "ISO-NE",
    region: "ISONE",
    meteologicaTable: "meteologica.isone_forecast_hourly",
    defaultMeteologicaArea: "ISONE",
    peakWindow: { startHourEnding: 8, endHourEnding: 23 },
  },
  caiso: {
    iso: "caiso",
    label: "CAISO",
    region: "CAISO",
    meteologicaTable: "meteologica.caiso_forecast_hourly",
    defaultMeteologicaArea: "CAISO",
    peakWindow: { startHourEnding: 7, endHourEnding: 22 },
  },
  miso: {
    iso: "miso",
    label: "MISO",
    region: "MISO",
    meteologicaTable: "meteologica.miso_forecast_hourly",
    defaultMeteologicaArea: "MISO",
    peakWindow: { startHourEnding: 7, endHourEnding: 22 },
  },
  spp: {
    iso: "spp",
    label: "SPP",
    region: "SPP",
    meteologicaTable: "meteologica.spp_forecast_hourly",
    defaultMeteologicaArea: "SPP",
    peakWindow: { startHourEnding: 7, endHourEnding: 22 },
  },
  nyiso: {
    iso: "nyiso",
    label: "NYISO",
    region: "NYISO",
    meteologicaTable: "meteologica.nyiso_forecast_hourly",
    defaultMeteologicaArea: "NYISO",
    peakWindow: { startHourEnding: 8, endHourEnding: 23 },
  },
};

export function powerForecastIsoConfig(iso: PowerForecastIso): PowerForecastIsoConfig {
  return ISO_CONFIGS[iso];
}

export function parsePowerForecastIso(value: string | null): PowerForecastIso {
  const normalized = value?.trim().toLowerCase();
  return POWER_FORECAST_ISO_ORDER.includes(normalized as PowerForecastIso)
    ? (normalized as PowerForecastIso)
    : "pjm";
}

export function parsePowerForecastSource(
  value: string | null,
  iso: PowerForecastIso,
): PowerForecastSource {
  if (iso !== "pjm") return "meteologica";
  return value?.trim().toLowerCase() === "meteologica" ? "meteologica" : "pjm";
}

export function parsePowerForecastType(value: string | null): PowerForecastType {
  return value?.trim().toLowerCase() === "netload" ? "netLoad" : "load";
}

export function parsePowerForecastDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function parsePowerForecastArea(
  value: string | null,
  fallback: string,
): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_&./ -]{2,80}$/.test(trimmed) ? trimmed : fallback;
}

export function parsePowerForecastLookbackHours(value: string | null): number {
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

function maxStamp(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function emptyHourly(): Array<number | null> {
  return Array.from({ length: 24 }, () => null);
}

function onPeakSql(config: PowerForecastIsoConfig, timestampExpr: string): string {
  return `(extract(hour from ${timestampExpr})::int + 1) between ${config.peakWindow.startHourEnding} and ${config.peakWindow.endHourEnding}`;
}

function offPeakSql(config: PowerForecastIsoConfig, timestampExpr: string): string {
  return `not (${onPeakSql(config, timestampExpr)})`;
}

function onPeakHourIndexes(config: PowerForecastIsoConfig): number[] {
  const start = config.peakWindow.startHourEnding - 1;
  const end = config.peakWindow.endHourEnding - 1;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function metrics(row: SummaryRow): LoadMetricSummary {
  return {
    flatAvg: toNumber(row.flat_avg),
    onPeakAvg: toNumber(row.on_peak_avg),
    offPeakAvg: toNumber(row.off_peak_avg),
    peakMw: toNumber(row.peak_mw),
    minMw: toNumber(row.min_mw),
  };
}

function netLoadMetrics(row: NetLoadSummaryRow): NetLoadMetricSummary {
  return {
    netFlatAvg: toNumber(row.net_flat_avg),
    netOnPeakAvg: toNumber(row.net_on_peak_avg),
    netOffPeakAvg: toNumber(row.net_off_peak_avg),
    netPeakMw: toNumber(row.net_peak_mw),
    netMinMw: toNumber(row.net_min_mw),
    loadPeakMw: toNumber(row.load_peak_mw),
    loadOnPeakAvg: toNumber(row.load_on_peak_avg),
    loadOffPeakAvg: toNumber(row.load_off_peak_avg),
    loadFlatAvg: toNumber(row.load_flat_avg),
    solarPeakMw: toNumber(row.solar_peak_mw),
    solarOnPeakAvg: toNumber(row.solar_on_peak_avg),
    solarOffPeakAvg: toNumber(row.solar_off_peak_avg),
    solarFlatAvg: toNumber(row.solar_flat_avg),
    windPeakMw: toNumber(row.wind_peak_mw),
    windOnPeakAvg: toNumber(row.wind_on_peak_avg),
    windOffPeakAvg: toNumber(row.wind_off_peak_avg),
    windFlatAvg: toNumber(row.wind_flat_avg),
    renewableFlatAvg: toNumber(row.renewable_flat_avg),
  };
}

function diffMetric(latest: number | null, anchor: number | null): number | null {
  return latest === null || anchor === null ? null : latest - anchor;
}

function diffMetrics(latest: LoadMetricSummary, anchor: LoadMetricSummary): LoadMetricSummary {
  return {
    flatAvg: diffMetric(latest.flatAvg, anchor.flatAvg),
    onPeakAvg: diffMetric(latest.onPeakAvg, anchor.onPeakAvg),
    offPeakAvg: diffMetric(latest.offPeakAvg, anchor.offPeakAvg),
    peakMw: diffMetric(latest.peakMw, anchor.peakMw),
    minMw: diffMetric(latest.minMw, anchor.minMw),
  };
}

function diffNetLoadMetrics(
  latest: NetLoadMetricSummary,
  anchor: NetLoadMetricSummary,
): NetLoadMetricSummary {
  return {
    netFlatAvg: diffMetric(latest.netFlatAvg, anchor.netFlatAvg),
    netOnPeakAvg: diffMetric(latest.netOnPeakAvg, anchor.netOnPeakAvg),
    netOffPeakAvg: diffMetric(latest.netOffPeakAvg, anchor.netOffPeakAvg),
    netPeakMw: diffMetric(latest.netPeakMw, anchor.netPeakMw),
    netMinMw: diffMetric(latest.netMinMw, anchor.netMinMw),
    loadPeakMw: diffMetric(latest.loadPeakMw, anchor.loadPeakMw),
    loadOnPeakAvg: diffMetric(latest.loadOnPeakAvg, anchor.loadOnPeakAvg),
    loadOffPeakAvg: diffMetric(latest.loadOffPeakAvg, anchor.loadOffPeakAvg),
    loadFlatAvg: diffMetric(latest.loadFlatAvg, anchor.loadFlatAvg),
    solarPeakMw: diffMetric(latest.solarPeakMw, anchor.solarPeakMw),
    solarOnPeakAvg: diffMetric(latest.solarOnPeakAvg, anchor.solarOnPeakAvg),
    solarOffPeakAvg: diffMetric(latest.solarOffPeakAvg, anchor.solarOffPeakAvg),
    solarFlatAvg: diffMetric(latest.solarFlatAvg, anchor.solarFlatAvg),
    windPeakMw: diffMetric(latest.windPeakMw, anchor.windPeakMw),
    windOnPeakAvg: diffMetric(latest.windOnPeakAvg, anchor.windOnPeakAvg),
    windOffPeakAvg: diffMetric(latest.windOffPeakAvg, anchor.windOffPeakAvg),
    windFlatAvg: diffMetric(latest.windFlatAvg, anchor.windFlatAvg),
    renewableFlatAvg: diffMetric(latest.renewableFlatAvg, anchor.renewableFlatAvg),
  };
}

function pickAnchor<T extends { evaluated_at_ept: string }>(
  rows: T[],
  latest: T,
  hours: number,
): T | null {
  const targetMs = timestampMs(latest.evaluated_at_ept) - hours * 3_600_000;
  const prior = rows.filter((row) => row.evaluated_at_ept !== latest.evaluated_at_ept);
  const best = prior.reduce<{ row: T; diffMs: number } | null>((acc, row) => {
    const diffMs = Math.abs(timestampMs(row.evaluated_at_ept) - targetMs);
    return !acc || diffMs < acc.diffMs ? { row, diffMs } : acc;
  }, null);
  return best && best.diffMs <= ANCHOR_TOLERANCE_MS ? best.row : null;
}

function groupByAreaDate<T extends { forecast_area: string; forecast_date: string }>(
  rows: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = `${row.forecast_area}|${row.forecast_date}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  return groups;
}

function loadExplorerCells(rows: SummaryRow[]): LoadExplorerCell[] {
  const cells: LoadExplorerCell[] = [];
  groupByAreaDate(rows).forEach((values) => {
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
    ) as Record<string, LoadDeltaSummary | null>;

    cells.push({
      area: latest.forecast_area,
      forecastDate: latest.forecast_date,
      vintageCount: latest.vintage_count == null ? sorted.length : Number(latest.vintage_count),
      latestEvaluatedAtEpt: latest.evaluated_at_ept,
      ...latestMetrics,
      deltas,
      delta24h: anchor24 ? diffMetrics(latestMetrics, metrics(anchor24)) : null,
      delta48h: anchor48 ? diffMetrics(latestMetrics, metrics(anchor48)) : null,
    });
  });

  return cells.sort((a, b) =>
    a.area === b.area
      ? a.forecastDate.localeCompare(b.forecastDate)
      : a.area.localeCompare(b.area),
  );
}

function netLoadExplorerCells(rows: NetLoadSummaryRow[]): NetLoadExplorerCell[] {
  const cells: NetLoadExplorerCell[] = [];
  groupByAreaDate(rows).forEach((values) => {
    const sorted = values.sort((a, b) => a.evaluated_at_ept.localeCompare(b.evaluated_at_ept));
    const latest = sorted.at(-1)!;
    const latestMetrics = netLoadMetrics(latest);
    const deltas = Object.fromEntries(
      DELTA_WINDOWS.map((hours) => {
        const anchor = pickAnchor(sorted, latest, hours);
        return [
          `${hours}h`,
          anchor
            ? {
                hours,
                anchorEvaluatedAtEpt: anchor.evaluated_at_ept,
                ...diffNetLoadMetrics(latestMetrics, netLoadMetrics(anchor)),
              }
            : null,
        ];
      }),
    ) as Record<string, NetLoadDeltaSummary | null>;

    cells.push({
      area: latest.forecast_area,
      forecastDate: latest.forecast_date,
      vintageCount: Number(latest.vintage_count),
      latestEvaluatedAtEpt: latest.evaluated_at_ept,
      completeHourCount: Number(latest.complete_hour_count),
      ...latestMetrics,
      deltas,
    });
  });

  return cells.sort((a, b) =>
    a.area === b.area
      ? a.forecastDate.localeCompare(b.forecastDate)
      : a.area.localeCompare(b.area),
  );
}

function payloadSource(config: PowerForecastIsoConfig, source: PowerForecastSource): string {
  if (source === "pjm") {
    return "pjm.load_frcstd_7_day";
  }
  return config.meteologicaTable;
}

function netLoadPayloadSource(
  config: PowerForecastIsoConfig,
  source: PowerForecastSource,
): string {
  if (source === "pjm") {
    return "pjm.load_frcstd_7_day + pjm.hourly_solar_power_forecast + pjm.hourly_wind_power_forecast";
  }
  return config.meteologicaTable;
}

function sourceLabel(source: PowerForecastSource): string {
  return source === "pjm" ? "PJM Data Miner" : "Meteologica";
}

function netLoadCoverageNote(config: PowerForecastIsoConfig, source: PowerForecastSource): string {
  if (source === "pjm") {
    return "PJM mode uses RTO_COMBINED load, solar_forecast_mwh, and wind_forecast_mwh. Rows include only forecast hours where load, solar, and wind all have non-null MW values.";
  }
  return `${config.label} Meteologica mode pairs each load issue to the latest prior non-null solar and wind forecast for the same forecast area and source-local forecast hour. Rows include only forecast hours where load, solar, and wind all have non-null MW values.`;
}

function noData(message: string, cacheHeader = "no-store") {
  return {
    status: 404,
    payload: { error: message },
    headers: { "Cache-Control": cacheHeader },
    rowCount: 0,
    dataAsOf: null,
  };
}

function loadExplorerPayload({
  config,
  source,
  rows,
}: {
  config: PowerForecastIsoConfig;
  source: PowerForecastSource;
  rows: SummaryRow[];
}) {
  const cells = loadExplorerCells(rows);
  const areas = Array.from(new Set(cells.map((row) => row.area))).sort();
  const forecastDates = Array.from(new Set(cells.map((row) => row.forecastDate))).sort();
  const asOf = maxStamp(cells.map((row) => row.latestEvaluatedAtEpt));
  const latestUpdate = maxStamp(rows.map((row) => row.updated_at));
  const totalVintageCount = cells.reduce((sum, row) => sum + row.vintageCount, 0);

  return {
    payload: {
      iso: config.iso,
      isoLabel: config.label,
      type: "load",
      source: payloadSource(config, source),
      sourceMode: source,
      sourceLabel: sourceLabel(source),
      forecastTimeBasis: source === "pjm" ? "PJM/EPT" : "source-local",
      issueTimeBasis: source === "pjm" ? "PJM/EPT" : "UTC",
      asOf,
      latestUpdate,
      areas,
      forecastDates,
      rowCount: totalVintageCount,
      cellCount: cells.length,
      cells,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: totalVintageCount,
    dataAsOf: asOf,
  };
}

function netLoadExplorerPayload({
  config,
  source,
  rows,
}: {
  config: PowerForecastIsoConfig;
  source: PowerForecastSource;
  rows: NetLoadSummaryRow[];
}) {
  const cells = netLoadExplorerCells(rows);
  const areas = Array.from(new Set(cells.map((row) => row.area))).sort();
  const forecastDates = Array.from(new Set(cells.map((row) => row.forecastDate))).sort();
  const asOf = maxStamp(cells.map((row) => row.latestEvaluatedAtEpt));
  const latestUpdate = maxStamp(rows.map((row) => row.updated_at));
  const totalVintageCount = cells.reduce((sum, row) => sum + row.vintageCount, 0);

  return {
    payload: {
      iso: config.iso,
      isoLabel: config.label,
      type: "netLoad",
      area: source === "pjm" ? "RTO" : "ALL",
      areas,
      source: netLoadPayloadSource(config, source),
      sourceMode: source,
      sourceLabel: sourceLabel(source),
      formula: FORMULA,
      coverageNote: netLoadCoverageNote(config, source),
      forecastTimeBasis: source === "pjm" ? "PJM/EPT" : "source-local",
      issueTimeBasis: source === "pjm" ? "PJM/EPT" : "UTC",
      asOf,
      latestUpdate,
      forecastDates,
      rowCount: totalVintageCount,
      cellCount: cells.length,
      cells,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: totalVintageCount,
    dataAsOf: asOf,
  };
}

function pjmLoadExplorerSql(config: PowerForecastIsoConfig): string {
  return `
    select
      forecast_area,
      forecast_datetime_beginning_ept::date::text as forecast_date,
      to_char(evaluated_at_datetime_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
      avg(forecast_load_mw)::float8 as flat_avg,
      avg(forecast_load_mw) filter (
        where ${onPeakSql(config, "forecast_datetime_beginning_ept")}
      )::float8 as on_peak_avg,
      avg(forecast_load_mw) filter (
        where ${offPeakSql(config, "forecast_datetime_beginning_ept")}
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
  `;
}

function meteologicaLoadExplorerSql(config: PowerForecastIsoConfig): string {
  return `
    with ${meteologicaSelectedLoadRowsCte(config)}
    select
      forecast_area,
      forecast_date::text as forecast_date,
      to_char(evaluated_at_utc at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
      max(vintage_count) as vintage_count,
      avg(load_mw)::float8 as flat_avg,
      avg(load_mw) filter (
        where ${onPeakSql(config, "forecast_period_start")}
      )::float8 as on_peak_avg,
      avg(load_mw) filter (
        where ${offPeakSql(config, "forecast_period_start")}
      )::float8 as off_peak_avg,
      max(load_mw)::float8 as peak_mw,
      min(load_mw)::float8 as min_mw,
      to_char(max(load_updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
    from load_rows
    group by
      forecast_area,
      forecast_date,
      evaluated_at_utc
    order by forecast_area, forecast_date, evaluated_at_ept
  `;
}

function meteologicaSelectedLoadRowsCte(config: PowerForecastIsoConfig): string {
  return `
    load_issues as (
      select
        forecast_area,
        forecast_period_start::date as forecast_date,
        issue_date
      from ${config.meteologicaTable}
      where region = $1
        and metric = 'load'
        and forecast_area is not null
        and issue_date is not null
        and forecast_mw is not null
        and forecast_period_start::date >= current_date
      group by
        forecast_area,
        forecast_period_start::date,
        issue_date
    ),
    issue_stats as (
      select
        forecast_area,
        forecast_date,
        max(issue_date) as latest_issue_date,
        count(*) as vintage_count
      from load_issues
      group by
        forecast_area,
        forecast_date
    ),
    selected_issues as (
      select
        forecast_area,
        forecast_date,
        latest_issue_date as issue_date,
        vintage_count,
        forecast_date = current_date as use_latest_hourly
      from issue_stats
      union
      select
        issue_stats.forecast_area,
        issue_stats.forecast_date,
        anchor.issue_date,
        issue_stats.vintage_count,
        false as use_latest_hourly
      from issue_stats
      cross join (values (1), (12), (24), (48), (72)) as lag_hours(hours)
      join lateral (
        select load_issues.issue_date
        from load_issues
        where load_issues.forecast_area = issue_stats.forecast_area
          and load_issues.forecast_date = issue_stats.forecast_date
          and load_issues.issue_date <> issue_stats.latest_issue_date
          and abs(
            extract(
              epoch from (
                load_issues.issue_date
                - (issue_stats.latest_issue_date - (lag_hours.hours::text || ' hours')::interval)
              )
            )
          ) <= ${ANCHOR_TOLERANCE_MS / 1000}
        order by
          abs(
            extract(
              epoch from (
                load_issues.issue_date
                - (issue_stats.latest_issue_date - (lag_hours.hours::text || ' hours')::interval)
              )
            )
          ),
          load_issues.issue_date desc
        limit 1
      ) anchor on true
    ),
    exact_load_rows as (
      select
        selected_issues.forecast_area,
        selected_issues.forecast_date,
        selected_issues.issue_date as evaluated_at_utc,
        selected_issues.vintage_count,
        load.issue_date as load_issue_date,
        load.forecast_period_start,
        load.forecast_mw as load_mw,
        load.updated_at as load_updated_at
      from selected_issues
      join ${config.meteologicaTable} as load
        on load.region = $1
       and load.forecast_area = selected_issues.forecast_area
       and load.metric = 'load'
       and load.issue_date = selected_issues.issue_date
       and load.forecast_period_start::date = selected_issues.forecast_date
       and load.forecast_mw is not null
      where not selected_issues.use_latest_hourly
    ),
    stitched_load_rows as (
      select
        selected_issues.forecast_area,
        selected_issues.forecast_date,
        selected_issues.issue_date as evaluated_at_utc,
        selected_issues.vintage_count,
        load.issue_date as load_issue_date,
        forecast_hours.forecast_period_start,
        load.forecast_mw as load_mw,
        load.updated_at as load_updated_at
      from selected_issues
      join lateral (
        select distinct load_hour.forecast_period_start
        from ${config.meteologicaTable} as load_hour
        where load_hour.region = $1
          and load_hour.forecast_area = selected_issues.forecast_area
          and load_hour.metric = 'load'
          and load_hour.forecast_period_start::date = selected_issues.forecast_date
          and load_hour.forecast_mw is not null
          and (
            (selected_issues.use_latest_hourly and load_hour.issue_date <= selected_issues.issue_date)
            or (not selected_issues.use_latest_hourly and load_hour.issue_date = selected_issues.issue_date)
          )
      ) forecast_hours on true
      join lateral (
        select
          load.issue_date,
          load.forecast_mw,
          load.updated_at
        from ${config.meteologicaTable} as load
        where load.region = $1
          and load.forecast_area = selected_issues.forecast_area
          and load.metric = 'load'
          and load.forecast_period_start = forecast_hours.forecast_period_start
          and load.forecast_mw is not null
          and (
            (selected_issues.use_latest_hourly and load.issue_date <= selected_issues.issue_date)
            or (not selected_issues.use_latest_hourly and load.issue_date = selected_issues.issue_date)
          )
        order by load.issue_date desc
        limit 1
      ) load on true
      where selected_issues.use_latest_hourly
    ),
    load_rows as (
      select * from exact_load_rows
      union all
      select * from stitched_load_rows
    )
  `;
}

function meteologicaNetLoadExplorerSql(config: PowerForecastIsoConfig): string {
  return `
    with ${meteologicaSelectedLoadRowsCte(config)},
    paired_components as (
      select
        load_rows.forecast_date,
        load_rows.forecast_area,
        load_rows.evaluated_at_utc,
        load_rows.vintage_count,
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
        from ${config.meteologicaTable} as solar
        where solar.region = $1
          and solar.forecast_area = load_rows.forecast_area
          and solar.metric = 'solar'
          and solar.forecast_period_start = load_rows.forecast_period_start
          and solar.issue_date <= load_rows.load_issue_date
          and solar.forecast_mw is not null
        order by solar.issue_date desc
        limit 1
      ) solar on true
      join lateral (
        select
          forecast_mw as wind_mw,
          updated_at as wind_updated_at
        from ${config.meteologicaTable} as wind
        where wind.region = $1
          and wind.forecast_area = load_rows.forecast_area
          and wind.metric = 'wind'
          and wind.forecast_period_start = load_rows.forecast_period_start
          and wind.issue_date <= load_rows.load_issue_date
          and wind.forecast_mw is not null
        order by wind.issue_date desc
        limit 1
      ) wind on true
    ),
    net_hourly as (
      select
        forecast_date,
        forecast_area,
        evaluated_at_utc,
        vintage_count,
        forecast_period_start,
        load_mw,
        solar_mw,
        wind_mw,
        case
          when load_mw is null or solar_mw is null or wind_mw is null then null
          else load_mw - solar_mw - wind_mw
        end as net_load_mw,
        updated_at
      from paired_components
    )
    select
      forecast_date::text as forecast_date,
      forecast_area,
      to_char(evaluated_at_utc at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
      max(vintage_count) as vintage_count,
      avg(net_load_mw)::float8 as net_flat_avg,
      avg(net_load_mw) filter (
        where ${onPeakSql(config, "forecast_period_start")}
      )::float8 as net_on_peak_avg,
      avg(net_load_mw) filter (
        where ${offPeakSql(config, "forecast_period_start")}
      )::float8 as net_off_peak_avg,
      max(net_load_mw)::float8 as net_peak_mw,
      min(net_load_mw)::float8 as net_min_mw,
      max(load_mw)::float8 as load_peak_mw,
      avg(load_mw) filter (
        where ${onPeakSql(config, "forecast_period_start")}
      )::float8 as load_on_peak_avg,
      avg(load_mw) filter (
        where ${offPeakSql(config, "forecast_period_start")}
      )::float8 as load_off_peak_avg,
      avg(load_mw)::float8 as load_flat_avg,
      max(solar_mw)::float8 as solar_peak_mw,
      avg(solar_mw) filter (
        where ${onPeakSql(config, "forecast_period_start")}
      )::float8 as solar_on_peak_avg,
      avg(solar_mw) filter (
        where ${offPeakSql(config, "forecast_period_start")}
      )::float8 as solar_off_peak_avg,
      avg(solar_mw)::float8 as solar_flat_avg,
      max(wind_mw)::float8 as wind_peak_mw,
      avg(wind_mw) filter (
        where ${onPeakSql(config, "forecast_period_start")}
      )::float8 as wind_on_peak_avg,
      avg(wind_mw) filter (
        where ${offPeakSql(config, "forecast_period_start")}
      )::float8 as wind_off_peak_avg,
      avg(wind_mw)::float8 as wind_flat_avg,
      avg(solar_mw + wind_mw)::float8 as renewable_flat_avg,
      count(*) filter (where net_load_mw is not null) as complete_hour_count,
      to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
    from net_hourly
    where net_load_mw is not null
    group by
      forecast_area,
      forecast_date,
      evaluated_at_utc
    order by forecast_area, forecast_date, evaluated_at_ept
  `;
}

function pjmNetLoadExplorerSql(config: PowerForecastIsoConfig): string {
  return `
    with load_rows as (
      select
        'RTO'::text as forecast_area,
        forecast_datetime_beginning_ept::date as forecast_date,
        evaluated_at_datetime_ept as evaluated_at_ept,
        evaluated_at_datetime_utc as evaluated_at_utc,
        forecast_datetime_beginning_ept as forecast_period_start_ept,
        forecast_datetime_beginning_utc as forecast_period_start_utc,
        forecast_load_mw as load_mw,
        updated_at as load_updated_at
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
        load_rows.forecast_area,
        load_rows.evaluated_at_ept,
        load_rows.forecast_period_start_ept,
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
        where solar.datetime_beginning_utc = load_rows.forecast_period_start_utc
          and solar.evaluated_at_utc is not null
          and solar.evaluated_at_utc <= load_rows.evaluated_at_utc
          and solar.solar_forecast_mwh is not null
        order by solar.evaluated_at_utc desc
        limit 1
      ) solar on true
      join lateral (
        select
          wind_forecast_mwh as wind_mw,
          updated_at as wind_updated_at
        from pjm.hourly_wind_power_forecast as wind
        where wind.datetime_beginning_utc = load_rows.forecast_period_start_utc
          and wind.evaluated_at_utc is not null
          and wind.evaluated_at_utc <= load_rows.evaluated_at_utc
          and wind.wind_forecast_mwh is not null
        order by wind.evaluated_at_utc desc
        limit 1
      ) wind on true
    ),
    net_hourly as (
      select
        forecast_date,
        forecast_area,
        evaluated_at_ept,
        forecast_period_start_ept,
        load_mw,
        solar_mw,
        wind_mw,
        case
          when load_mw is null or solar_mw is null or wind_mw is null then null
          else load_mw - solar_mw - wind_mw
        end as net_load_mw,
        updated_at
      from paired_components
    )
    select
      forecast_date::text as forecast_date,
      forecast_area,
      to_char(evaluated_at_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
      count(*) over (partition by forecast_area, forecast_date) as vintage_count,
      avg(net_load_mw)::float8 as net_flat_avg,
      avg(net_load_mw) filter (
        where ${onPeakSql(config, "forecast_period_start_ept")}
      )::float8 as net_on_peak_avg,
      avg(net_load_mw) filter (
        where ${offPeakSql(config, "forecast_period_start_ept")}
      )::float8 as net_off_peak_avg,
      max(net_load_mw)::float8 as net_peak_mw,
      min(net_load_mw)::float8 as net_min_mw,
      max(load_mw)::float8 as load_peak_mw,
      avg(load_mw) filter (
        where ${onPeakSql(config, "forecast_period_start_ept")}
      )::float8 as load_on_peak_avg,
      avg(load_mw) filter (
        where ${offPeakSql(config, "forecast_period_start_ept")}
      )::float8 as load_off_peak_avg,
      avg(load_mw)::float8 as load_flat_avg,
      max(solar_mw)::float8 as solar_peak_mw,
      avg(solar_mw) filter (
        where ${onPeakSql(config, "forecast_period_start_ept")}
      )::float8 as solar_on_peak_avg,
      avg(solar_mw) filter (
        where ${offPeakSql(config, "forecast_period_start_ept")}
      )::float8 as solar_off_peak_avg,
      avg(solar_mw)::float8 as solar_flat_avg,
      max(wind_mw)::float8 as wind_peak_mw,
      avg(wind_mw) filter (
        where ${onPeakSql(config, "forecast_period_start_ept")}
      )::float8 as wind_on_peak_avg,
      avg(wind_mw) filter (
        where ${offPeakSql(config, "forecast_period_start_ept")}
      )::float8 as wind_off_peak_avg,
      avg(wind_mw)::float8 as wind_flat_avg,
      avg(solar_mw + wind_mw)::float8 as renewable_flat_avg,
      count(*) filter (where net_load_mw is not null) as complete_hour_count,
      to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
    from net_hourly
    where net_load_mw is not null
    group by
      forecast_area,
      forecast_date,
      evaluated_at_ept
    order by forecast_area, forecast_date, evaluated_at_ept
  `;
}

export async function buildPowerForecastExplorerPayload({
  iso,
  source,
  type,
}: {
  iso: PowerForecastIso;
  source: PowerForecastSource;
  type: PowerForecastType;
}) {
  const config = powerForecastIsoConfig(iso);
  const effectiveSource = parsePowerForecastSource(source, iso);

  if (type === "netLoad") {
    const rows = await query<NetLoadSummaryRow>(
      effectiveSource === "pjm"
        ? pjmNetLoadExplorerSql(config)
        : meteologicaNetLoadExplorerSql(config),
      effectiveSource === "pjm" ? undefined : [config.region],
    );
    if (!rows.length) {
      return noData(`No ${config.label} ${sourceLabel(effectiveSource)} net load forecast data is available`);
    }
    return netLoadExplorerPayload({ config, source: effectiveSource, rows });
  }

  const rows = await query<SummaryRow>(
    effectiveSource === "pjm" ? pjmLoadExplorerSql(config) : meteologicaLoadExplorerSql(config),
    effectiveSource === "pjm" ? undefined : [config.region],
  );
  if (!rows.length) {
    return noData(`No ${config.label} ${sourceLabel(effectiveSource)} load forecast summary data is available`);
  }
  return loadExplorerPayload({ config, source: effectiveSource, rows });
}

function pjmLoadAreasSql(): string {
  return `
    select distinct forecast_area
    from pjm.load_frcstd_7_day
    order by forecast_area
  `;
}

function meteologicaLoadAreasSql(config: PowerForecastIsoConfig): string {
  return `
    select distinct forecast_area
    from ${config.meteologicaTable}
    where region = $1
      and metric = 'load'
      and forecast_mw is not null
    order by forecast_area
  `;
}

function meteologicaNetLoadAreasSql(config: PowerForecastIsoConfig): string {
  return `
    with metric_coverage as (
      select
        forecast_area,
        count(*) filter (where metric = 'load' and forecast_mw is not null) as load_rows,
        count(*) filter (where metric = 'solar' and forecast_mw is not null) as solar_rows,
        count(*) filter (where metric = 'wind' and forecast_mw is not null) as wind_rows
      from ${config.meteologicaTable}
      where region = $1
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
}

function pjmLoadDatesSql(): string {
  return `
    select distinct forecast_datetime_beginning_ept::date::text as forecast_date
    from pjm.load_frcstd_7_day
    where forecast_area = $1
      and forecast_datetime_beginning_ept::date >= current_date
    order by forecast_date
    limit 10
  `;
}

function meteologicaLoadDatesSql(config: PowerForecastIsoConfig): string {
  return `
    select distinct forecast_period_start::date::text as forecast_date
    from ${config.meteologicaTable}
    where region = $1
      and metric = 'load'
      and forecast_area = $2
      and forecast_period_start::date >= current_date
      and forecast_mw is not null
    order by forecast_date
  `;
}

function pjmNetLoadDatesSql(): string {
  return `
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
}

function meteologicaNetLoadDatesSql(config: PowerForecastIsoConfig): string {
  return `
    with load_rows as (
      select
        forecast_period_start::date as forecast_date,
        issue_date,
        forecast_period_start,
        forecast_mw as load_mw
      from ${config.meteologicaTable}
      where region = $1
        and forecast_area = $2
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
        from ${config.meteologicaTable} as solar
        where solar.region = $1
          and solar.forecast_area = $2
          and solar.metric = 'solar'
          and solar.forecast_period_start = load_rows.forecast_period_start
          and solar.issue_date <= load_rows.issue_date
          and solar.forecast_mw is not null
        order by solar.issue_date desc
        limit 1
      ) solar on true
      join lateral (
        select forecast_mw as wind_mw
        from ${config.meteologicaTable} as wind
        where wind.region = $1
          and wind.forecast_area = $2
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
}

function pjmLoadRowsSql(): string {
  return `
    select
      to_char(evaluated_at_datetime_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
      forecast_datetime_beginning_ept::date::text as forecast_date,
      extract(hour from forecast_datetime_beginning_ept)::int as he_start,
      forecast_load_mw::float8 as load_mw,
      to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
    from pjm.load_frcstd_7_day
    where forecast_area = $1
      and forecast_datetime_beginning_ept::date = $2::date
    order by evaluated_at_datetime_ept, forecast_datetime_beginning_ept
  `;
}

function meteologicaLoadRowsSql(config: PowerForecastIsoConfig): string {
  return `
    select
      to_char(issue_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
      forecast_period_start::date::text as forecast_date,
      extract(hour from forecast_period_start)::int as he_start,
      forecast_mw::float8 as load_mw,
      to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
    from ${config.meteologicaTable}
    where region = $1
      and metric = 'load'
      and issue_date is not null
      and forecast_area = $2
      and forecast_period_start::date = $3::date
      and forecast_mw is not null
    order by issue_date, forecast_period_start
  `;
}

function pjmNetLoadRowsSql(): string {
  return `
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
}

function meteologicaNetLoadRowsSql(config: PowerForecastIsoConfig): string {
  return `
    with load_rows as (
      select
        forecast_period_start::date as forecast_date,
        issue_date,
        forecast_period_start,
        forecast_mw as load_mw,
        updated_at as load_updated_at
      from ${config.meteologicaTable}
      where region = $1
        and forecast_area = $2
        and metric = 'load'
        and issue_date is not null
        and forecast_mw is not null
        and forecast_period_start::date = $3::date
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
        from ${config.meteologicaTable} as solar
        where solar.region = $1
          and solar.forecast_area = $2
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
        from ${config.meteologicaTable} as wind
        where wind.region = $1
          and wind.forecast_area = $2
          and wind.metric = 'wind'
          and wind.forecast_period_start = load_rows.forecast_period_start
          and wind.issue_date <= load_rows.issue_date
          and wind.forecast_mw is not null
        order by wind.issue_date desc
        limit 1
      ) wind on true
    )
    select
      to_char(issue_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
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
}

function summarizeLoadCurve(
  config: PowerForecastIsoConfig,
  evaluatedAtEpt: string,
  tag: string,
  hourly: Array<number | null>,
): LoadVintageCurve {
  const nums = hourly.filter((value): value is number => value !== null);
  const onPeakIndexes = onPeakHourIndexes(config);
  const onPeakIndexSet = new Set(onPeakIndexes);
  return {
    evaluatedAtEpt,
    tag,
    peak: nums.length ? Math.max(...nums) : null,
    onPeak: avg(onPeakIndexes.map((hour) => hourly[hour] ?? null)),
    offPeak: avg(hourly.map((value, hour) => (onPeakIndexSet.has(hour) ? null : value))),
    hourly,
  };
}

function deltaLoadCurve(
  label: string,
  latest: LoadVintageCurve,
  anchor: LoadVintageCurve,
): LoadVintageCurve {
  const hourly = latest.hourly.map((value, index) => {
    const anchorValue = anchor.hourly[index];
    return value === null || anchorValue === null ? null : value - anchorValue;
  });
  return {
    evaluatedAtEpt: anchor.evaluatedAtEpt,
    tag: label,
    peak: diffMetric(latest.peak, anchor.peak),
    onPeak: diffMetric(latest.onPeak, anchor.onPeak),
    offPeak: diffMetric(latest.offPeak, anchor.offPeak),
    hourly,
  };
}

function summarizeNetLoadCurve(
  config: PowerForecastIsoConfig,
  evaluatedAtEpt: string,
  tag: string,
  acc: NetLoadAccumulator,
): NetLoadVintageCurve {
  const onPeakIndexes = onPeakHourIndexes(config);
  const onPeakIndexSet = new Set(onPeakIndexes);
  const netValues = acc.net.filter((value): value is number => value !== null);
  const loadValues = acc.load.filter((value): value is number => value !== null);
  const solarValues = acc.solar.filter((value): value is number => value !== null);
  const windValues = acc.wind.filter((value): value is number => value !== null);

  return {
    evaluatedAtEpt,
    tag,
    netPeakMw: netValues.length ? Math.max(...netValues) : null,
    netOnPeakAvg: avg(onPeakIndexes.map((hour) => acc.net[hour] ?? null)),
    netOffPeakAvg: avg(acc.net.map((value, hour) => (onPeakIndexSet.has(hour) ? null : value))),
    netFlatAvg: avg(acc.net),
    netMinMw: netValues.length ? Math.min(...netValues) : null,
    loadPeakMw: loadValues.length ? Math.max(...loadValues) : null,
    loadOnPeakAvg: avg(onPeakIndexes.map((hour) => acc.load[hour] ?? null)),
    loadOffPeakAvg: avg(acc.load.map((value, hour) => (onPeakIndexSet.has(hour) ? null : value))),
    loadFlatAvg: avg(acc.load),
    solarPeakMw: solarValues.length ? Math.max(...solarValues) : null,
    solarOnPeakAvg: avg(onPeakIndexes.map((hour) => acc.solar[hour] ?? null)),
    solarOffPeakAvg: avg(acc.solar.map((value, hour) => (onPeakIndexSet.has(hour) ? null : value))),
    solarFlatAvg: avg(acc.solar),
    windPeakMw: windValues.length ? Math.max(...windValues) : null,
    windOnPeakAvg: avg(onPeakIndexes.map((hour) => acc.wind[hour] ?? null)),
    windOffPeakAvg: avg(acc.wind.map((value, hour) => (onPeakIndexSet.has(hour) ? null : value))),
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

function deltaNetLoadCurve(
  label: string,
  latest: NetLoadVintageCurve,
  anchor: NetLoadVintageCurve,
): NetLoadVintageCurve {
  const loadHourly = latest.loadHourly.map((value, index) =>
    diffMetric(value, anchor.loadHourly[index] ?? null),
  );
  const windHourly = latest.windHourly.map((value, index) =>
    diffMetric(value, anchor.windHourly[index] ?? null),
  );
  const solarHourly = latest.solarHourly.map((value, index) =>
    diffMetric(value, anchor.solarHourly[index] ?? null),
  );
  const netHourly = latest.netHourly.map((value, index) =>
    diffMetric(value, anchor.netHourly[index] ?? null),
  );

  return {
    evaluatedAtEpt: anchor.evaluatedAtEpt,
    tag: label,
    ...diffNetLoadMetrics(latest, anchor),
    hourly: netHourly,
    loadHourly,
    windHourly,
    solarHourly,
    netHourly,
  };
}

function pickCurveAnchors<T extends { evaluatedAtEpt: string }>(curves: T[], latest: T): T[] {
  const latestMs = timestampMs(latest.evaluatedAtEpt);
  const prior = curves.filter((curve) => curve.evaluatedAtEpt !== latest.evaluatedAtEpt);
  const anchors: T[] = [];

  LAGS.forEach((lag) => {
    const targetMs = latestMs - lag.hours * 3_600_000;
    const best = prior.reduce<{ curve: T; diffMs: number } | null>((acc, curve) => {
      const diffMs = Math.abs(timestampMs(curve.evaluatedAtEpt) - targetMs);
      return !acc || diffMs < acc.diffMs ? { curve, diffMs } : acc;
    }, null);
    if (best && best.diffMs <= ANCHOR_TOLERANCE_MS) {
      anchors.push({ ...best.curve, tag: lag.label });
    }
  });

  return anchors;
}

function loadCurvesFromRows(
  config: PowerForecastIsoConfig,
  rows: LoadSourceRow[],
): LoadVintageCurve[] {
  const byVintage = new Map<string, Array<number | null>>();
  rows.forEach((row) => {
    const key = row.evaluated_at_ept;
    const hourly = byVintage.get(key) ?? emptyHourly();
    const hour = Number(row.he_start);
    if (hour >= 0 && hour <= 23) hourly[hour] = toNumber(row.load_mw);
    byVintage.set(key, hourly);
  });

  return Array.from(byVintage.entries())
    .map(([evaluatedAtEpt, hourly]) => summarizeLoadCurve(config, evaluatedAtEpt, "", hourly))
    .sort((a, b) => a.evaluatedAtEpt.localeCompare(b.evaluatedAtEpt));
}

function netLoadCurvesFromRows(
  config: PowerForecastIsoConfig,
  rows: NetLoadSourceRow[],
): NetLoadVintageCurve[] {
  const byVintage = new Map<string, NetLoadAccumulator>();
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

  return Array.from(byVintage.entries())
    .map(([evaluatedAtEpt, acc]) => summarizeNetLoadCurve(config, evaluatedAtEpt, "", acc))
    .sort((a, b) => a.evaluatedAtEpt.localeCompare(b.evaluatedAtEpt));
}

function loadDifferencesPayload({
  config,
  source,
  area,
  availableAreas,
  forecastDate,
  forecastDates,
  rows,
  lookbackHours,
}: {
  config: PowerForecastIsoConfig;
  source: PowerForecastSource;
  area: string;
  availableAreas: string[];
  forecastDate: string;
  forecastDates: string[];
  rows: LoadSourceRow[];
  lookbackHours: number;
}) {
  const curves = loadCurvesFromRows(config, rows);
  if (!curves.length) {
    return noData(`No ${config.label} ${sourceLabel(source)} load forecast vintage data is available`);
  }

  const latest = { ...curves.at(-1)!, tag: "LATEST" };
  const anchors = pickCurveAnchors(curves, latest);
  const snapshotRows = [...anchors, latest];
  const deltaRows = anchors.map((anchor) => deltaLoadCurve(`Delta vs ${anchor.tag}`, latest, anchor));
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
  const latestUpdate = maxStamp(rows.map((row) => row.updated_at));

  return {
    payload: {
      iso: config.iso,
      isoLabel: config.label,
      type: "load",
      area,
      areas: availableAreas,
      forecastDate,
      forecastDates,
      asOf: latest.evaluatedAtEpt,
      latestUpdate,
      source: payloadSource(config, source),
      sourceMode: source,
      sourceLabel: sourceLabel(source),
      sourceComparisonAvailable: false,
      sourceComparisonNote:
        source === "pjm" ? "Meteologica comparisons are available through source=meteologica." : "Meteologica forecast source selected.",
      forecastTimeBasis: source === "pjm" ? "PJM/EPT" : "source-local",
      issueTimeBasis: source === "pjm" ? "PJM/EPT" : "UTC",
      rowCount: rows.length,
      lookbackHours,
      snapshotRows,
      deltaRows,
      lookbackRows,
      windowRows: lookbackRows,
    },
    headers: { "Cache-Control": DIFFERENCES_CACHE_HEADER },
    rowCount: rows.length,
    dataAsOf: latest.evaluatedAtEpt,
  };
}

function netLoadDifferencesPayload({
  config,
  source,
  area,
  availableAreas,
  forecastDate,
  forecastDates,
  rows,
  lookbackHours,
}: {
  config: PowerForecastIsoConfig;
  source: PowerForecastSource;
  area: string;
  availableAreas: string[];
  forecastDate: string;
  forecastDates: string[];
  rows: NetLoadSourceRow[];
  lookbackHours: number;
}) {
  const curves = netLoadCurvesFromRows(config, rows);
  if (!curves.length) {
    return noData(`No ${config.label} ${sourceLabel(source)} net load forecast vintage data is available`);
  }

  const latest = { ...curves.at(-1)!, tag: "LATEST" };
  const anchors = pickCurveAnchors(curves, latest);
  const snapshotRows = [...anchors, latest];
  const deltaRows = anchors.map((anchor) => deltaNetLoadCurve(`Delta vs ${anchor.tag}`, latest, anchor));
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
  const latestUpdate = maxStamp(rows.map((row) => row.updated_at));

  return {
    payload: {
      iso: config.iso,
      isoLabel: config.label,
      type: "netLoad",
      area,
      areas: availableAreas,
      forecastDate,
      forecastDates,
      asOf: latest.evaluatedAtEpt,
      latestUpdate,
      source: netLoadPayloadSource(config, source),
      sourceMode: source,
      sourceLabel: sourceLabel(source),
      formula: FORMULA,
      coverageNote: netLoadCoverageNote(config, source),
      forecastTimeBasis: source === "pjm" ? "PJM/EPT" : "source-local",
      issueTimeBasis: source === "pjm" ? "PJM/EPT" : "UTC",
      rowCount: rows.length,
      lookbackHours,
      snapshotRows,
      deltaRows,
      lookbackRows,
      windowRows: lookbackRows,
    },
    headers: { "Cache-Control": DIFFERENCES_CACHE_HEADER },
    rowCount: rows.length,
    dataAsOf: latest.evaluatedAtEpt,
  };
}

export async function buildPowerForecastDifferencesPayload({
  iso,
  source,
  type,
  requestedArea,
  requestedDate,
  lookbackHours,
}: {
  iso: PowerForecastIso;
  source: PowerForecastSource;
  type: PowerForecastType;
  requestedArea: string | null;
  requestedDate: string | null;
  lookbackHours: number;
}) {
  const config = powerForecastIsoConfig(iso);
  const effectiveSource = parsePowerForecastSource(source, iso);
  const fallbackArea =
    type === "netLoad"
      ? effectiveSource === "pjm"
        ? config.pjmDataMinerNetLoadArea ?? "RTO"
        : config.defaultMeteologicaArea
      : effectiveSource === "pjm"
        ? config.pjmDataMinerLoadArea ?? "RTO_COMBINED"
        : config.defaultMeteologicaArea;
  const parsedArea = parsePowerForecastArea(requestedArea, fallbackArea);
  const availableAreas =
    type === "netLoad"
      ? effectiveSource === "pjm"
        ? [config.pjmDataMinerNetLoadArea ?? "RTO"]
        : (await query<AreaRow>(meteologicaNetLoadAreasSql(config), [config.region])).map((row) => row.forecast_area)
      : (await query<AreaRow>(
          effectiveSource === "pjm" ? pjmLoadAreasSql() : meteologicaLoadAreasSql(config),
          effectiveSource === "pjm" ? undefined : [config.region],
        )).map((row) => row.forecast_area);

  const area = availableAreas.includes(parsedArea)
    ? parsedArea
    : availableAreas.includes(fallbackArea)
      ? fallbackArea
      : availableAreas[0];

  if (!area) {
    return noData(`No ${config.label} ${sourceLabel(effectiveSource)} ${type === "netLoad" ? "net load" : "load"} forecast data is available`);
  }

  const dateRows =
    type === "netLoad"
      ? await query<DateRow>(
          effectiveSource === "pjm" ? pjmNetLoadDatesSql() : meteologicaNetLoadDatesSql(config),
          effectiveSource === "pjm" ? undefined : [config.region, area],
        )
      : await query<DateRow>(
          effectiveSource === "pjm" ? pjmLoadDatesSql() : meteologicaLoadDatesSql(config),
          effectiveSource === "pjm" ? [area] : [config.region, area],
        );
  const forecastDates = dateRows.map((row) => row.forecast_date);
  const forecastDate =
    requestedDate && forecastDates.includes(requestedDate) ? requestedDate : forecastDates[0];

  if (!forecastDate) {
    return noData(`No current ${config.label} ${sourceLabel(effectiveSource)} forecast dates are available`);
  }

  if (type === "netLoad") {
    const rows = await query<NetLoadSourceRow>(
      effectiveSource === "pjm" ? pjmNetLoadRowsSql() : meteologicaNetLoadRowsSql(config),
      effectiveSource === "pjm" ? [forecastDate] : [config.region, area, forecastDate],
    );
    return netLoadDifferencesPayload({
      config,
      source: effectiveSource,
      area,
      availableAreas,
      forecastDate,
      forecastDates,
      rows,
      lookbackHours,
    });
  }

  const rows = await query<LoadSourceRow>(
    effectiveSource === "pjm" ? pjmLoadRowsSql() : meteologicaLoadRowsSql(config),
    effectiveSource === "pjm" ? [area, forecastDate] : [config.region, area, forecastDate],
  );
  return loadDifferencesPayload({
    config,
    source: effectiveSource,
    area,
    availableAreas,
    forecastDate,
    forecastDates,
    rows,
    lookbackHours,
  });
}

function pjmLoadCompareSql(): string {
  return `
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
}

function meteologicaLoadCompareSql(config: PowerForecastIsoConfig): string {
  return `
    with requested_dates as (
      select unnest(array[$3::date, $4::date]) as forecast_date
    ),
    latest_load_issues as (
      select
        requested_dates.forecast_date,
        max(load.issue_date) as issue_date
      from requested_dates
      join ${config.meteologicaTable} as load
        on load.region = $1
       and load.forecast_area = $2
       and load.metric = 'load'
       and load.forecast_period_start::date = requested_dates.forecast_date
       and load.issue_date is not null
       and load.forecast_mw is not null
      group by requested_dates.forecast_date
    )
    select
      latest_load_issues.forecast_date::text as forecast_date,
      to_char(latest_load_issues.issue_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
      extract(hour from forecast_hours.forecast_period_start)::int as he_start,
      load.forecast_mw::float8 as load_mw,
      to_char(load.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
    from latest_load_issues
    join lateral (
      select distinct load_hour.forecast_period_start
      from ${config.meteologicaTable} as load_hour
      where load_hour.region = $1
        and load_hour.forecast_area = $2
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
      from ${config.meteologicaTable} as load
      where load.region = $1
        and load.forecast_area = $2
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
}

function pjmNetLoadCompareSql(): string {
  return `
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
}

function meteologicaNetLoadCompareSql(config: PowerForecastIsoConfig): string {
  return `
    with requested_dates as (
      select unnest(array[$3::date, $4::date]) as forecast_date
    ),
    latest_load_issues as (
      select
        requested_dates.forecast_date,
        max(load.issue_date) as issue_date
      from requested_dates
      join ${config.meteologicaTable} as load
        on load.region = $1
       and load.forecast_area = $2
       and load.metric = 'load'
       and load.forecast_period_start::date = requested_dates.forecast_date
       and load.issue_date is not null
       and load.forecast_mw is not null
      group by requested_dates.forecast_date
    ),
    load_rows as (
      select
        latest_load_issues.forecast_date,
        latest_load_issues.issue_date as evaluated_at_ept,
        load.issue_date as load_issue_date,
        forecast_hours.forecast_period_start,
        load.forecast_mw as load_mw,
        load.updated_at as load_updated_at
      from latest_load_issues
      join lateral (
        select distinct load_hour.forecast_period_start
        from ${config.meteologicaTable} as load_hour
        where load_hour.region = $1
          and load_hour.forecast_area = $2
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
          load.issue_date,
          load.forecast_mw,
          load.updated_at
        from ${config.meteologicaTable} as load
        where load.region = $1
          and load.forecast_area = $2
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
    ),
    paired_components as (
      select
        load_rows.forecast_date,
        load_rows.evaluated_at_ept,
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
        from ${config.meteologicaTable} as solar
        where solar.region = $1
          and solar.forecast_area = $2
          and solar.metric = 'solar'
          and solar.forecast_period_start = load_rows.forecast_period_start
          and solar.issue_date <= load_rows.load_issue_date
          and solar.forecast_mw is not null
        order by solar.issue_date desc
        limit 1
      ) solar on true
      join lateral (
        select
          forecast_mw as wind_mw,
          updated_at as wind_updated_at
        from ${config.meteologicaTable} as wind
        where wind.region = $1
          and wind.forecast_area = $2
          and wind.metric = 'wind'
          and wind.forecast_period_start = load_rows.forecast_period_start
          and wind.issue_date <= load_rows.load_issue_date
          and wind.forecast_mw is not null
        order by wind.issue_date desc
        limit 1
      ) wind on true
    )
    select
      forecast_date::text as forecast_date,
      to_char(evaluated_at_ept at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
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
}

function diff(compare: number | null, base: number | null): number | null {
  return compare === null || base === null ? null : compare - base;
}

function emptyLoadCompareHour(he: number): LoadCompareHour {
  return {
    he,
    loadBaseMw: null,
    loadCompareMw: null,
    loadDeltaMw: null,
  };
}

function emptyNetLoadCompareHour(he: number): NetLoadCompareHour {
  return {
    ...emptyLoadCompareHour(he),
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

function compareIssue(rows: Array<LoadSourceRow | NetLoadSourceRow>, date: string): string | null {
  return maxStamp(
    rows
      .filter((row) => row.forecast_date === date)
      .map((row) => row.evaluated_at_ept),
  );
}

function loadComparePayload({
  config,
  source,
  area,
  baseDate,
  compareDate,
  rows,
}: {
  config: PowerForecastIsoConfig;
  source: PowerForecastSource;
  area: string;
  baseDate: string;
  compareDate: string;
  rows: LoadSourceRow[];
}) {
  const byDateHour = new Map<string, LoadSourceRow>();
  rows.forEach((row) => byDateHour.set(`${row.forecast_date}|${Number(row.he_start)}`, row));

  const compareRows = Array.from({ length: 24 }, (_, hour) => {
    const base = byDateHour.get(`${baseDate}|${hour}`);
    const compare = byDateHour.get(`${compareDate}|${hour}`);
    const output = emptyLoadCompareHour(hour + 1);
    output.loadBaseMw = toNumber(base?.load_mw);
    output.loadCompareMw = toNumber(compare?.load_mw);
    output.loadDeltaMw = diff(output.loadCompareMw, output.loadBaseMw);
    return output;
  });
  const completeHourCount = compareRows.filter(
    (row) => row.loadBaseMw !== null && row.loadCompareMw !== null,
  ).length;
  if (!completeHourCount) {
    return noData(`No complete ${config.label} load forecast comparison rows are available`);
  }
  const baseIssue = compareIssue(rows, baseDate);
  const compareIssueDate = compareIssue(rows, compareDate);
  const latestUpdate = maxStamp(rows.map((row) => row.updated_at));

  return {
    payload: {
      iso: config.iso,
      isoLabel: config.label,
      type: "load",
      area,
      baseDate,
      compareDate,
      baseIssue,
      compareIssue: compareIssueDate,
      sourceMode: source,
      sourceLabel: sourceLabel(source),
      source: payloadSource(config, source),
      forecastTimeBasis: source === "pjm" ? "PJM/EPT" : "source-local",
      issueTimeBasis: source === "pjm" ? "PJM/EPT" : "UTC",
      completeHourCount,
      latestUpdate,
      rows: compareRows,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: rows.length,
    dataAsOf: compareIssueDate ?? baseIssue,
  };
}

function netLoadComparePayload({
  config,
  source,
  area,
  baseDate,
  compareDate,
  rows,
}: {
  config: PowerForecastIsoConfig;
  source: PowerForecastSource;
  area: string;
  baseDate: string;
  compareDate: string;
  rows: NetLoadSourceRow[];
}) {
  const byDateHour = new Map<string, NetLoadSourceRow>();
  rows.forEach((row) => byDateHour.set(`${row.forecast_date}|${Number(row.he_start)}`, row));

  const compareRows = Array.from({ length: 24 }, (_, hour) => {
    const base = byDateHour.get(`${baseDate}|${hour}`);
    const compare = byDateHour.get(`${compareDate}|${hour}`);
    const output = emptyNetLoadCompareHour(hour + 1);
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
  if (!completeHourCount) {
    return noData(`No complete ${config.label} net load forecast comparison rows are available`);
  }
  const baseIssue = compareIssue(rows, baseDate);
  const compareIssueDate = compareIssue(rows, compareDate);
  const latestUpdate = maxStamp(rows.map((row) => row.updated_at));

  return {
    payload: {
      iso: config.iso,
      isoLabel: config.label,
      type: "netLoad",
      area,
      baseDate,
      compareDate,
      baseIssue,
      compareIssue: compareIssueDate,
      sourceMode: source,
      sourceLabel: sourceLabel(source),
      source: netLoadPayloadSource(config, source),
      formula: FORMULA,
      coverageNote: netLoadCoverageNote(config, source),
      forecastTimeBasis: source === "pjm" ? "PJM/EPT" : "source-local",
      issueTimeBasis: source === "pjm" ? "PJM/EPT" : "UTC",
      completeHourCount,
      latestUpdate,
      rows: compareRows,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: rows.length,
    dataAsOf: compareIssueDate ?? baseIssue,
  };
}

export async function buildPowerForecastDateComparePayload({
  iso,
  source,
  type,
  requestedArea,
  baseDate,
  compareDate,
}: {
  iso: PowerForecastIso;
  source: PowerForecastSource;
  type: PowerForecastType;
  requestedArea: string | null;
  baseDate: string | null;
  compareDate: string | null;
}) {
  const config = powerForecastIsoConfig(iso);
  const effectiveSource = parsePowerForecastSource(source, iso);

  if (!baseDate || !compareDate) {
    return {
      status: 400,
      payload: { error: "baseDate and compareDate are required as YYYY-MM-DD" },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
      dataAsOf: null,
    };
  }

  const fallbackArea =
    type === "netLoad"
      ? effectiveSource === "pjm"
        ? config.pjmDataMinerNetLoadArea ?? "RTO"
        : config.defaultMeteologicaArea
      : effectiveSource === "pjm"
        ? config.pjmDataMinerLoadArea ?? "RTO_COMBINED"
        : config.defaultMeteologicaArea;
  const area =
    effectiveSource === "pjm" && type === "netLoad"
      ? config.pjmDataMinerNetLoadArea ?? "RTO"
      : parsePowerForecastArea(requestedArea, fallbackArea);

  if (type === "netLoad") {
    const rows = await query<NetLoadSourceRow>(
      effectiveSource === "pjm" ? pjmNetLoadCompareSql() : meteologicaNetLoadCompareSql(config),
      effectiveSource === "pjm" ? [baseDate, compareDate] : [config.region, area, baseDate, compareDate],
    );
    return netLoadComparePayload({
      config,
      source: effectiveSource,
      area,
      baseDate,
      compareDate,
      rows,
    });
  }

  const rows = await query<LoadSourceRow>(
    effectiveSource === "pjm" ? pjmLoadCompareSql() : meteologicaLoadCompareSql(config),
    effectiveSource === "pjm" ? [area, baseDate, compareDate] : [config.region, area, baseDate, compareDate],
  );
  return loadComparePayload({
    config,
    source: effectiveSource,
    area,
    baseDate,
    compareDate,
    rows,
  });
}
