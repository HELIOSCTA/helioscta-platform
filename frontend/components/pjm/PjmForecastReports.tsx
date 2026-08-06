"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

interface ForecastMetricSummary {
  flatAvg: number | null;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  peakMw: number | null;
  minMw: number | null;
}

interface ForecastDeltaSummary extends ForecastMetricSummary {
  hours: number;
  anchorEvaluatedAtEpt: string;
}

interface ForecastExplorerCell extends ForecastMetricSummary {
  area: string;
  forecastDate: string;
  vintageCount: number;
  latestEvaluatedAtEpt: string;
  deltas: Record<string, ForecastDeltaSummary | null>;
  delta24h: ForecastMetricSummary | null;
  delta48h: ForecastMetricSummary | null;
}

interface PjmForecastExplorerPayload {
  iso: "pjm";
  source: string;
  asOf: string | null;
  latestUpdate: string | null;
  areas: string[];
  forecastDates: string[];
  rowCount: number;
  cellCount: number;
  cells: ForecastExplorerCell[];
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

interface PjmNetLoadForecastExplorerPayload {
  iso: "pjm";
  area: string;
  areas: string[];
  source: string;
  sourceMode: "pjm" | "meteologica";
  sourceLabel: string;
  formula: string;
  coverageNote: string;
  asOf: string | null;
  latestUpdate: string | null;
  forecastDates: string[];
  rowCount: number;
  cellCount: number;
  cells: NetLoadExplorerCell[];
}

export interface PjmForecastReportsFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

type ForecastMetricKey = "peakMw" | "onPeakAvg" | "offPeakAvg";
type NetLoadComponentKey = "netLoad" | "load" | "solar" | "wind";
type NetLoadStatisticKey = "peak" | "onPeak" | "offPeak";
type ForecastDeltaWindowKey = "12h" | "24h" | "48h" | "72h";
type ReportArea = { label: string; sourceArea: string; sourceAliases?: string[] };

const API_CACHE_TTL_MS = 10 * 60 * 1000;
const REPORT_AREAS: ReportArea[] = [
  { label: "RTO", sourceArea: "RTO_COMBINED" },
  { label: "West", sourceArea: "WESTERN_REGION" },
  { label: "MidAtl", sourceArea: "MID_ATLANTIC_REGION" },
  { label: "BGE", sourceArea: "BGE", sourceAliases: ["BG&E/MIDATL"] },
  { label: "PEPCO", sourceArea: "PEPCO", sourceAliases: ["PEPCO/MIDATL"] },
  { label: "South", sourceArea: "SOUTHERN_REGION" },
];
const NET_LOAD_REPORT_AREAS: ReportArea[] = [{ label: "RTO", sourceArea: "RTO" }];
const NET_LOAD_REPORT_COMPONENTS: Array<{ key: NetLoadComponentKey; label: string }> = [
  { key: "netLoad", label: "Net Load" },
  { key: "load", label: "Load" },
  { key: "solar", label: "Solar" },
  { key: "wind", label: "Wind" },
];
const REPORT_DELTA_WINDOWS: Array<{ key: ForecastDeltaWindowKey; label: string }> = [
  { key: "12h", label: "12" },
  { key: "24h", label: "24" },
  { key: "48h", label: "48" },
  { key: "72h", label: "72" },
];
const REPORT_METRICS: Array<{ key: ForecastMetricKey; label: string }> = [
  { key: "peakMw", label: "PK" },
  { key: "onPeakAvg", label: "OnPk" },
  { key: "offPeakAvg", label: "OffPeak" },
];
const NET_LOAD_REPORT_METRICS: Array<{
  label: string;
  statistic: NetLoadStatisticKey;
}> = [
  { label: "PK", statistic: "peak" },
  { label: "OnPk", statistic: "onPeak" },
  { label: "OffPeak", statistic: "offPeak" },
];
const REPORT_IDENTITY_COLUMN_WIDTH = 92;
const REPORT_TREND_COLUMN_WIDTH = 88;
const REPORT_DATE_COLUMN_WIDTH = 120;
const DEFAULT_FRESHNESS: PjmForecastReportsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Forecast reports --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

function buildLoadApiUrl(refresh: boolean): string {
  return refresh ? "/api/pjm-forecast-explorer?refresh=1" : "/api/pjm-forecast-explorer";
}

function buildNetLoadApiUrl(refresh: boolean): string {
  const params = new URLSearchParams({ source: "pjm" });
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-net-load-forecast-explorer?${params.toString()}`;
}

function fmtDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "-";
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function fmtForecastHeaderDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return fmtDate(value);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const day = date.toLocaleDateString("en-US", { day: "2-digit", timeZone: "UTC" });
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
  return `${weekday} ${month}-${day}${weekend ? " W" : ""}`;
}

function fmtLoad(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const absValue = Math.abs(value);
  if (absValue >= 1000) return `${(value / 1000).toFixed(1)} GW`;
  return `${Math.round(value).toLocaleString()} MW`;
}

function fmtSignedMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString()}`;
}

function ForecastTrendSparkline({
  dates,
  values,
  label,
}: {
  dates: string[];
  values: Array<number | null | undefined>;
  label: string;
}) {
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(
    null,
  );
  const valueRows = dates.map((date, index) => {
    const value = values[index];
    return {
      date,
      value: typeof value === "number" && Number.isFinite(value) ? value : null,
    };
  });
  const points = dates
    .map((date, index) => ({ date, value: values[index] }))
    .filter(
      (point): point is { date: string; value: number } =>
        typeof point.value === "number" && Number.isFinite(point.value),
    );
  const firstPoint = points[0];
  const latestPoint = points.at(-1) ?? firstPoint;
  const change =
    firstPoint && latestPoint ? latestPoint.value - firstPoint.value : null;
  const summary =
    firstPoint && latestPoint
      ? `${label} PK trend: ${fmtDate(firstPoint.date)} ${fmtLoad(
          firstPoint.value,
        )} to ${fmtDate(latestPoint.date)} ${fmtLoad(latestPoint.value)} | Net change ${fmtSignedMw(
          change,
        )} MW`
      : `${label} PK trend unavailable: fewer than two numeric forecast dates`;

  function showTooltip(target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    const widthPx = 224;
    const heightPx = Math.min(280, Math.max(124, valueRows.length * 22 + 54));
    const left = Math.min(Math.max(8, rect.right - widthPx), window.innerWidth - widthPx - 8);
    const below = rect.bottom + 8;
    const top =
      below + heightPx > window.innerHeight
        ? Math.max(8, rect.top - heightPx - 8)
        : below;
    setTooltipPosition({ left, top });
  }

  const tooltip = tooltipPosition ? (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[80] min-w-[224px] rounded-md border border-gray-700 bg-gray-950 p-2 text-xs shadow-2xl shadow-black/60"
      style={{ left: tooltipPosition.left, top: tooltipPosition.top }}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        PK Forecast Dates ({change === null ? "-" : `${fmtSignedMw(change)} MW`})
      </div>
      <div className="space-y-1">
        {[...valueRows].reverse().map((row) => (
          <div key={row.date} className="flex items-center justify-between gap-4">
            <span className="text-gray-500">{fmtForecastHeaderDate(row.date)}</span>
            <span
              className={`font-semibold tabular-nums ${
                row.value === null ? "text-gray-600" : "text-gray-100"
              }`}
            >
              {fmtLoad(row.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  if (points.length < 2) {
    return (
      <span
        className="relative inline-flex h-7 w-full items-center justify-center rounded border border-gray-800/70 bg-gray-950/35 text-[11px] font-semibold text-gray-600 outline-none focus:ring-1 focus:ring-gray-500/70"
        role="img"
        tabIndex={0}
        aria-label={summary}
        onMouseEnter={(event) => showTooltip(event.currentTarget)}
        onMouseLeave={() => setTooltipPosition(null)}
        onFocus={(event) => showTooltip(event.currentTarget)}
        onBlur={() => setTooltipPosition(null)}
      >
        -
        {tooltip}
      </span>
    );
  }

  const minValue = Math.min(...points.map((point) => point.value));
  const maxValue = Math.max(...points.map((point) => point.value));
  const range = maxValue - minValue;
  const numericChange = latestPoint.value - firstPoint.value;
  const stroke = numericChange > 0 ? "#34d399" : numericChange < 0 ? "#f87171" : "#94a3b8";
  const width = 72;
  const height = 28;
  const paddingX = 5;
  const paddingY = 5;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingY * 2;
  const linePoints = points
    .map((point, index) => {
      const x = paddingX + (points.length === 1 ? 0 : (index / (points.length - 1)) * plotWidth);
      const y =
        range === 0
          ? paddingY + plotHeight / 2
          : paddingY + (1 - (point.value - minValue) / range) * plotHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const latestIndex = points.length - 1;
  const latestX = paddingX + (latestIndex / (points.length - 1)) * plotWidth;
  const latestY =
    range === 0
      ? paddingY + plotHeight / 2
      : paddingY + (1 - (latestPoint.value - minValue) / range) * plotHeight;

  return (
    <span
      role="img"
      aria-label={summary}
      tabIndex={0}
      onMouseEnter={(event) => showTooltip(event.currentTarget)}
      onMouseLeave={() => setTooltipPosition(null)}
      onFocus={(event) => showTooltip(event.currentTarget)}
      onBlur={() => setTooltipPosition(null)}
      className="relative inline-flex h-7 w-full items-center justify-center rounded border border-gray-800/70 bg-gray-950/35 px-1 outline-none focus:ring-1 focus:ring-gray-500/70"
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="h-7 w-full" aria-hidden="true">
        <polyline
          fill="none"
          points={linePoints}
          stroke={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.25"
        />
        <circle cx={latestX} cy={latestY} fill={stroke} r="2.4" />
      </svg>
      {tooltip}
    </span>
  );
}

function metricValue(cell: ForecastExplorerCell | null | undefined, metric: ForecastMetricKey): number | null {
  return cell?.[metric] ?? null;
}

function netLoadComponentValue(
  row: NetLoadMetricSummary | null | undefined,
  component: NetLoadComponentKey,
  statistic: NetLoadStatisticKey,
): number | null {
  if (!row) return null;
  if (component === "load") {
    if (statistic === "peak") return row.loadPeakMw;
    if (statistic === "onPeak") return row.loadOnPeakAvg;
    return row.loadOffPeakAvg;
  }
  if (component === "solar") {
    if (statistic === "peak") return row.solarPeakMw;
    if (statistic === "onPeak") return row.solarOnPeakAvg;
    return row.solarOffPeakAvg;
  }
  if (component === "wind") {
    if (statistic === "peak") return row.windPeakMw;
    if (statistic === "onPeak") return row.windOnPeakAvg;
    return row.windOffPeakAvg;
  }
  if (statistic === "peak") return row.netPeakMw;
  if (statistic === "onPeak") return row.netOnPeakAvg;
  return row.netOffPeakAvg;
}

function deltaMetricValue({
  cell,
  windowKey,
  metric,
}: {
  cell: ForecastExplorerCell | null | undefined;
  windowKey: ForecastDeltaWindowKey;
  metric: ForecastMetricKey;
}): number | null {
  if (!cell) return null;
  return cell.deltas?.[windowKey]?.[metric] ?? null;
}

function netLoadDeltaMetricValue({
  cell,
  windowKey,
  component,
  statistic,
}: {
  cell: NetLoadExplorerCell | null | undefined;
  windowKey: ForecastDeltaWindowKey;
  component: NetLoadComponentKey;
  statistic: NetLoadStatisticKey;
}): number | null {
  if (!cell) return null;
  return netLoadComponentValue(cell.deltas?.[windowKey], component, statistic);
}

function deltaChipStyle(value: number | null, bound: number): CSSProperties | undefined {
  if (value === null || bound <= 0) return undefined;
  if (value === 0) {
    return {
      background: "linear-gradient(90deg, rgba(55, 65, 81, 0.22) 0%, rgba(55, 65, 81, 0.34) 100%)",
      borderColor: "rgba(75, 85, 99, 0.58)",
      color: "#e5e7eb",
    };
  }
  const ratio = Math.min(Math.abs(value) / bound, 1);
  const softAlpha = 0.18 + ratio * 0.22;
  const alpha = 0.34 + ratio * 0.42;
  const [r, g, b] = value > 0 ? [20, 83, 45] : [127, 29, 29];
  return {
    background: `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, ${softAlpha.toFixed(2)}) 0%, rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)}) 100%)`,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.72)`,
    boxShadow: `inset 0 -1px 0 rgba(${r}, ${g}, ${b}, 0.52)`,
    color: "#f8fafc",
  };
}

function deltaChipClass(value: number | null): string {
  if (value === null) return "border-gray-800 bg-gray-950/70 text-gray-600";
  if (value > 0) return "border-emerald-800/70 text-emerald-50";
  if (value < 0) return "border-red-800/80 text-red-50";
  return "border-gray-700 bg-gray-950/60 text-gray-400";
}

function buildForecastDrillHref(area: string, forecastDate: string): string {
  const params = new URLSearchParams({
    section: "pjm-forecasts",
    forecastType: "load",
    forecastSource: "pjm",
    forecastMode: "outright",
    area,
    date: forecastDate,
  });
  return `/?${params.toString()}`;
}

function buildNetLoadForecastDrillHref(
  area: string,
  forecastDate: string,
  component: NetLoadComponentKey,
  statistic: NetLoadStatisticKey,
): string {
  const params = new URLSearchParams({
    section: "pjm-forecasts",
    forecastType: "netLoad",
    forecastSource: "pjm",
    forecastMode: "outright",
    area,
    date: forecastDate,
    component,
    statistic,
  });
  return `/?${params.toString()}`;
}

function buildCellMap<TCell extends { area: string; forecastDate: string }>(
  payload: { cells: TCell[] } | null,
): Map<string, TCell> {
  const map = new Map<string, TCell>();
  payload?.cells.forEach((cell) => {
    map.set(`${cell.area}|${cell.forecastDate}`, cell);
  });
  return map;
}

function reportAreaSourceKeys(area: ReportArea): string[] {
  return [area.sourceArea, ...(area.sourceAliases ?? [])];
}

function hasReportArea(availableAreaSet: Set<string>, area: ReportArea): boolean {
  return reportAreaSourceKeys(area).some((sourceArea) => availableAreaSet.has(sourceArea));
}

function getReportCell(
  cellMap: Map<string, ForecastExplorerCell>,
  area: ReportArea,
  forecastDate: string,
): ForecastExplorerCell | undefined {
  for (const sourceArea of reportAreaSourceKeys(area)) {
    const cell = cellMap.get(`${sourceArea}|${forecastDate}`);
    if (cell) return cell;
  }
  return undefined;
}

function getNetLoadReportCell(
  cellMap: Map<string, NetLoadExplorerCell>,
  area: ReportArea,
  forecastDate: string,
): NetLoadExplorerCell | undefined {
  for (const sourceArea of reportAreaSourceKeys(area)) {
    const cell = cellMap.get(`${sourceArea}|${forecastDate}`);
    if (cell) return cell;
  }
  return undefined;
}

function reportAreaSourceLabel(
  cellMap: Map<string, ForecastExplorerCell>,
  area: ReportArea,
  forecastDates: string[],
): string {
  for (const forecastDate of forecastDates) {
    const cell = getReportCell(cellMap, area, forecastDate);
    if (cell) return cell.area;
  }
  return area.sourceArea;
}

function netLoadReportAreaSourceLabel(
  cellMap: Map<string, NetLoadExplorerCell>,
  area: ReportArea,
  forecastDates: string[],
): string {
  for (const forecastDate of forecastDates) {
    const cell = getNetLoadReportCell(cellMap, area, forecastDate);
    if (cell) return cell.area;
  }
  return area.sourceArea;
}

function freshnessFromLoadPayload(payload: PjmForecastExplorerPayload): PjmForecastReportsFreshnessSummary {
  const availableAreaSet = new Set(payload.cells.map((cell) => cell.area));
  const availableCount = REPORT_AREAS.filter((area) => hasReportArea(availableAreaSet, area)).length;
  const missingCount = REPORT_AREAS.length - availableCount;
  const status = missingCount > 0 ? "Partial" : payload.asOf ? "Current" : "Unknown";
  const statusClass =
    status === "Current"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : status === "Partial"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
        : "border-gray-700 bg-gray-900 text-gray-400";

  return {
    status,
    statusClass,
    summary: `PJM load report | ${availableCount}/${REPORT_AREAS.length} areas | ${payload.forecastDates.length} dates`,
    targetDateLabel: `${availableCount}/${REPORT_AREAS.length} report areas`,
    latestDateLabel: fmtDate(payload.forecastDates.at(-1)),
    latestUpdateLabel: fmtDateTime(payload.asOf ?? payload.latestUpdate),
  };
}

export default function PjmForecastReports({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmForecastReportsFreshnessSummary) => void;
}) {
  const [loadPayload, setLoadPayload] = useState<PjmForecastExplorerPayload | null>(null);
  const [loadLoading, setLoadLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [netLoadPayload, setNetLoadPayload] =
    useState<PjmNetLoadForecastExplorerPayload | null>(null);
  const [netLoadLoading, setNetLoadLoading] = useState(true);
  const [netLoadError, setNetLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoadLoading(true);
    setLoadError(null);

    fetchJsonWithCache<PjmForecastExplorerPayload>({
      key: "api:pjm-forecast-explorer",
      url: buildLoadApiUrl(refreshToken > 0),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((nextPayload) => {
        if (!active) return;
        setLoadPayload(nextPayload);
        onFreshnessChange?.(freshnessFromLoadPayload(nextPayload));
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setLoadPayload(null);
        setLoadError(err.message || "Failed to load PJM forecast report");
        onFreshnessChange?.({
          ...DEFAULT_FRESHNESS,
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Forecast report query failed",
        });
      })
      .finally(() => {
        if (active) setLoadLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshToken, onFreshnessChange]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setNetLoadLoading(true);
    setNetLoadError(null);

    fetchJsonWithCache<PjmNetLoadForecastExplorerPayload>({
      key: "api:pjm-net-load-forecast-explorer:pjm",
      url: buildNetLoadApiUrl(refreshToken > 0),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((nextPayload) => {
        if (!active) return;
        setNetLoadPayload(nextPayload);
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setNetLoadPayload(null);
        setNetLoadError(err.message || "Failed to load PJM net load forecast report");
      })
      .finally(() => {
        if (active) setNetLoadLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshToken]);

  const loadForecastDates = useMemo(() => loadPayload?.forecastDates ?? [], [loadPayload]);
  const netLoadForecastDates = useMemo(
    () => netLoadPayload?.forecastDates ?? [],
    [netLoadPayload],
  );
  const reportForecastDates = useMemo(
    () => Array.from(new Set([...loadForecastDates, ...netLoadForecastDates])).sort(),
    [loadForecastDates, netLoadForecastDates],
  );
  const reportTableStyle = useMemo<CSSProperties>(
    () => ({
      width:
        REPORT_IDENTITY_COLUMN_WIDTH +
        REPORT_TREND_COLUMN_WIDTH +
        reportForecastDates.length * REPORT_METRICS.length * REPORT_DATE_COLUMN_WIDTH,
    }),
    [reportForecastDates.length],
  );
  const cellMap = useMemo(() => buildCellMap(loadPayload), [loadPayload]);
  const netLoadCellMap = useMemo(() => buildCellMap(netLoadPayload), [netLoadPayload]);
  const missingAreas = useMemo(() => {
    if (!loadPayload) return [];
    const availableAreaSet = new Set(loadPayload.cells.map((cell) => cell.area));
    return REPORT_AREAS.filter((area) => !hasReportArea(availableAreaSet, area)).map(
      (area) => area.label,
    );
  }, [loadPayload]);
  const deltaBounds = useMemo(() => {
    const bounds = new Map<string, number>();
    REPORT_DELTA_WINDOWS.forEach((window) => {
      REPORT_METRICS.forEach((metric) => {
        const values = REPORT_AREAS.flatMap((area) =>
          reportForecastDates.map((date) => {
            const cell = getReportCell(cellMap, area, date);
            return deltaMetricValue({ cell, windowKey: window.key, metric: metric.key });
          }),
        )
          .filter((value): value is number => value !== null)
          .map((value) => Math.abs(value));
        bounds.set(`${window.key}|${metric.key}`, values.length ? Math.max(...values) : 0);
      });
    });
    return bounds;
  }, [cellMap, reportForecastDates]);
  const netLoadDeltaBounds = useMemo(() => {
    const bounds = new Map<string, number>();
    REPORT_DELTA_WINDOWS.forEach((window) => {
      NET_LOAD_REPORT_COMPONENTS.forEach((component) => {
        NET_LOAD_REPORT_METRICS.forEach((metric) => {
          const values = NET_LOAD_REPORT_AREAS.flatMap((area) =>
            reportForecastDates.map((date) => {
              const cell = getNetLoadReportCell(netLoadCellMap, area, date);
              return netLoadDeltaMetricValue({
                cell,
                windowKey: window.key,
                component: component.key,
                statistic: metric.statistic,
              });
            }),
          )
            .filter((value): value is number => value !== null)
            .map((value) => Math.abs(value));
          bounds.set(
            `${component.key}|${window.key}|${metric.statistic}`,
            values.length ? Math.max(...values) : 0,
          );
        });
      });
    });
    return bounds;
  }, [netLoadCellMap, reportForecastDates]);

  return (
    <div className="mx-auto w-full max-w-none space-y-4">
      <section className="w-full max-w-none rounded-lg border border-sky-950/70 bg-[#0d121b] p-3 shadow-xl shadow-black/20 ring-1 ring-white/[0.02] sm:p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Forecast Reports
            </span>
            <span className="h-px flex-1 bg-gray-800" />
            <span className="text-xs text-gray-500">
              {loadPayload || netLoadPayload
                ? `${reportForecastDates.length} aligned forecast dates`
                : "PJM load and net-load forecast changes"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1">
              Source: pjm.load_frcstd_7_day
            </span>
            <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1">
              Net Load: load - solar - wind
            </span>
            <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1">
              PJM Data Miner RTO only
            </span>
            <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1">
              Latest in GW
            </span>
            <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1">
              Changes in MW
            </span>
            {loadPayload?.asOf && (
              <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1">
                Load as of {fmtDateTime(loadPayload.asOf)}
              </span>
            )}
            {netLoadPayload?.asOf && (
              <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1">
                Net load as of {fmtDateTime(netLoadPayload.asOf)}
              </span>
            )}
            {missingAreas.length > 0 && (
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-100">
                Missing {missingAreas.join(", ")}
              </span>
            )}
          </div>
        </div>
      </section>

      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {loadError}
        </div>
      )}

      {loadLoading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading PJM forecast report...
        </div>
      )}

      {loadPayload && !loadLoading && loadForecastDates.length === 0 && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          No PJM forecast dates are available for the report.
        </div>
      )}

      {loadPayload && !loadLoading && loadForecastDates.length > 0 && (
        <DataTableShell
          title="PJM Load Forecast Change Report"
          subtitle={`${REPORT_AREAS.length} fixed load areas | ${reportForecastDates.length} aligned dates split into PK, OnPk, and OffPeak | Latest plus 12h/24h/48h/72h changes`}
          bodyClassName="max-h-[74vh] overflow-auto"
        >
          <table
            className="table-fixed border-collapse bg-[#0d1119] text-[11px] text-gray-200"
            style={reportTableStyle}
          >
            <colgroup>
              <col className="w-[92px]" />
              <col className="w-[88px]" />
              {REPORT_METRICS.flatMap((metric) =>
                reportForecastDates.map((date) => (
                  <col key={`${metric.key}-${date}`} className="w-[120px]" />
                )),
              )}
            </colgroup>
            <thead className="sticky top-0 z-30 bg-gray-950 text-gray-500">
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 top-0 z-50 bg-gray-950 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                >
                  Area
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-[92px] top-0 z-50 border-l border-gray-800 bg-gray-950 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                >
                  Trend
                </th>
                {REPORT_METRICS.map((metric) => (
                  <th
                    key={metric.key}
                    colSpan={reportForecastDates.length}
                    className="border-l border-gray-700 bg-gray-950 px-2 py-1.5 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide"
                  >
                    {metric.label}
                  </th>
                ))}
              </tr>
              <tr>
                {REPORT_METRICS.flatMap((metric) =>
                  reportForecastDates.map((date, dateIndex) => (
                    <th
                      key={`${metric.key}-${date}`}
                      className={`bg-gray-950 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide ${
                        dateIndex === 0 ? "border-l border-gray-700" : "border-l border-gray-800"
                      }`}
                    >
                      {fmtForecastHeaderDate(date)}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {REPORT_AREAS.map((area) => {
                const sourceAreaLabel = reportAreaSourceLabel(cellMap, area, reportForecastDates);
                const peakTrendValues = reportForecastDates.map((date) =>
                  metricValue(getReportCell(cellMap, area, date), "peakMw"),
                );
                return (
                  <tr
                    key={area.sourceArea}
                    className="group border-t border-gray-700 hover:bg-gray-900/60"
                  >
                    <td
                      className="sticky left-0 z-20 bg-[#0d1119] px-2 py-2 align-top font-semibold text-sky-100 shadow-[2px_0_0_rgba(31,41,55,0.9)] group-hover:bg-gray-900"
                      title={sourceAreaLabel}
                    >
                      <span className="block">{area.label}</span>
                      <span className="mt-1 block truncate text-[10px] font-medium text-gray-600">
                        {sourceAreaLabel}
                      </span>
                    </td>
                    <td className="sticky left-[92px] z-20 border-l border-gray-800 bg-[#0d1119] px-2 py-2 align-top shadow-[2px_0_0_rgba(31,41,55,0.9)] group-hover:bg-gray-900">
                      <ForecastTrendSparkline
                        dates={reportForecastDates}
                        values={peakTrendValues}
                        label={area.label}
                      />
                    </td>
                    {REPORT_METRICS.flatMap((metric) =>
                      reportForecastDates.map((date, dateIndex) => {
                        const cell = getReportCell(cellMap, area, date);
                        const latestValue = metricValue(cell, metric.key);
                        return (
                          <td
                            key={`${metric.key}-${date}`}
                            className={`px-1 py-1.5 text-right align-top tabular-nums ${
                              dateIndex === 0
                                ? "border-l border-gray-700"
                                : "border-l border-gray-800"
                            }`}
                          >
                            {cell ? (
                              <Link
                                href={buildForecastDrillHref(cell.area, cell.forecastDate)}
                                prefetch={false}
                                className="block min-h-[58px] rounded px-1.5 py-1.5 transition-colors hover:bg-gray-950/50 hover:text-white focus:outline-none focus:ring-1 focus:ring-sky-400/70"
                                title={`${area.label} ${fmtDate(date)} ${metric.label} | Latest ${fmtLoad(
                                  latestValue,
                                )} | ${cell.vintageCount} vintages | ${fmtDateTime(
                                  cell.latestEvaluatedAtEpt,
                                )}`}
                              >
                                <span className="block text-right text-[12px] font-semibold leading-tight text-gray-100">
                                  {fmtLoad(latestValue)}
                                </span>
                                <span className="mt-1 grid grid-cols-2 gap-1">
                                  {REPORT_DELTA_WINDOWS.map((window) => {
                                    const value = deltaMetricValue({
                                      cell,
                                      windowKey: window.key,
                                      metric: metric.key,
                                    });
                                    const bound = deltaBounds.get(`${window.key}|${metric.key}`) ?? 0;
                                    const delta = cell.deltas?.[window.key] ?? null;
                                    return (
                                      <span
                                        key={window.key}
                                        className={`flex min-h-[18px] items-center justify-between gap-1 rounded border px-1 py-0.5 text-[10px] font-semibold leading-none ${deltaChipClass(
                                          value,
                                        )}`}
                                        style={deltaChipStyle(value, bound)}
                                        title={
                                          delta
                                            ? `${window.key} change: ${fmtSignedMw(value)} MW vs ${fmtDateTime(
                                                delta.anchorEvaluatedAtEpt,
                                              )}`
                                            : `${window.key} change unavailable`
                                        }
                                      >
                                        <span className="text-[9px] font-bold text-gray-300/80">
                                          {window.label}
                                        </span>
                                        <span className="tabular-nums">{fmtSignedMw(value)}</span>
                                      </span>
                                    );
                                  })}
                                </span>
                              </Link>
                            ) : (
                              <span className="flex min-h-[58px] items-center justify-center rounded px-2 py-2 text-[11px] text-gray-700">
                                -
                              </span>
                            )}
                          </td>
                        );
                      }),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTableShell>
      )}

      {netLoadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {netLoadError}
        </div>
      )}

      {netLoadLoading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading PJM net load forecast report...
        </div>
      )}

      {netLoadPayload && !netLoadLoading && netLoadForecastDates.length === 0 && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          No PJM net-load forecast dates are available for the report.
        </div>
      )}

      {netLoadPayload && !netLoadLoading && netLoadForecastDates.length > 0 && (
        <DataTableShell
          title="PJM Net Load Forecast Change Report"
          subtitle={`RTO components: Net Load, Load, Solar, Wind | ${reportForecastDates.length} aligned dates | ${netLoadPayload.formula || "load - solar - wind"} | PJM Data Miner`}
          bodyClassName="max-h-[58vh] overflow-auto"
        >
          <table
            className="table-fixed border-collapse bg-[#0d1119] text-[11px] text-gray-200"
            style={reportTableStyle}
          >
            <colgroup>
              <col className="w-[92px]" />
              <col className="w-[88px]" />
              {NET_LOAD_REPORT_METRICS.flatMap((metric) =>
                reportForecastDates.map((date) => (
                  <col key={`${metric.statistic}-${date}`} className="w-[120px]" />
                )),
              )}
            </colgroup>
            <thead className="sticky top-0 z-30 bg-gray-950 text-gray-500">
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 top-0 z-50 bg-gray-950 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                >
                  Component
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-[92px] top-0 z-50 border-l border-gray-800 bg-gray-950 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                >
                  Trend
                </th>
                {NET_LOAD_REPORT_METRICS.map((metric) => (
                  <th
                    key={metric.statistic}
                    colSpan={reportForecastDates.length}
                    className="border-l border-gray-700 bg-gray-950 px-2 py-1.5 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide"
                  >
                    {metric.label}
                  </th>
                ))}
              </tr>
              <tr>
                {NET_LOAD_REPORT_METRICS.flatMap((metric) =>
                  reportForecastDates.map((date, dateIndex) => (
                    <th
                      key={`${metric.statistic}-${date}`}
                      className={`bg-gray-950 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide ${
                        dateIndex === 0 ? "border-l border-gray-700" : "border-l border-gray-800"
                      }`}
                    >
                      {fmtForecastHeaderDate(date)}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {NET_LOAD_REPORT_AREAS.flatMap((area) => {
                const sourceAreaLabel = netLoadReportAreaSourceLabel(
                  netLoadCellMap,
                  area,
                  reportForecastDates,
                );
                return NET_LOAD_REPORT_COMPONENTS.map((component) => (
                  <tr
                    key={`${area.sourceArea}-${component.key}`}
                    className="group border-t border-gray-700 hover:bg-gray-900/60"
                  >
                    <td
                      className="sticky left-0 z-20 bg-[#0d1119] px-2 py-2 align-top font-semibold text-emerald-100 shadow-[2px_0_0_rgba(31,41,55,0.9)] group-hover:bg-gray-900"
                      title={`${sourceAreaLabel} | ${netLoadPayload.coverageNote}`}
                    >
                      <span className="block">{component.label}</span>
                      <span className="mt-1 block truncate text-[10px] font-medium text-gray-600">
                        {area.label}
                      </span>
                    </td>
                    <td className="sticky left-[92px] z-20 border-l border-gray-800 bg-[#0d1119] px-2 py-2 align-top shadow-[2px_0_0_rgba(31,41,55,0.9)] group-hover:bg-gray-900">
                      <ForecastTrendSparkline
                        dates={reportForecastDates}
                        values={reportForecastDates.map((date) =>
                          netLoadComponentValue(
                            getNetLoadReportCell(netLoadCellMap, area, date),
                            component.key,
                            "peak",
                          ),
                        )}
                        label={`${component.label} ${area.label}`}
                      />
                    </td>
                    {NET_LOAD_REPORT_METRICS.flatMap((metric) =>
                      reportForecastDates.map((date, dateIndex) => {
                        const cell = getNetLoadReportCell(netLoadCellMap, area, date);
                        const latestValue = netLoadComponentValue(
                          cell,
                          component.key,
                          metric.statistic,
                        );
                        return (
                          <td
                            key={`${metric.statistic}-${date}`}
                            className={`px-1 py-1.5 text-right align-top tabular-nums ${
                              dateIndex === 0
                                ? "border-l border-gray-700"
                                : "border-l border-gray-800"
                            }`}
                          >
                            {cell ? (
                              <Link
                                href={buildNetLoadForecastDrillHref(
                                  cell.area,
                                  cell.forecastDate,
                                  component.key,
                                  metric.statistic,
                                )}
                                prefetch={false}
                                className="block min-h-[58px] rounded px-1.5 py-1.5 transition-colors hover:bg-gray-950/50 hover:text-white focus:outline-none focus:ring-1 focus:ring-emerald-400/70"
                                title={`${area.label} ${fmtDate(date)} ${component.label} ${metric.label} | Latest ${fmtLoad(
                                  latestValue,
                                )} | ${cell.vintageCount} vintages | ${fmtDateTime(
                                  cell.latestEvaluatedAtEpt,
                                )}`}
                              >
                                <span className="block text-right text-[12px] font-semibold leading-tight text-gray-100">
                                  {fmtLoad(latestValue)}
                                </span>
                                <span className="mt-1 grid grid-cols-2 gap-1">
                                  {REPORT_DELTA_WINDOWS.map((window) => {
                                    const value = netLoadDeltaMetricValue({
                                      cell,
                                      windowKey: window.key,
                                      component: component.key,
                                      statistic: metric.statistic,
                                    });
                                    const bound =
                                      netLoadDeltaBounds.get(
                                        `${component.key}|${window.key}|${metric.statistic}`,
                                      ) ?? 0;
                                    const delta = cell.deltas?.[window.key] ?? null;
                                    return (
                                      <span
                                        key={window.key}
                                        className={`flex min-h-[18px] items-center justify-between gap-1 rounded border px-1 py-0.5 text-[10px] font-semibold leading-none ${deltaChipClass(
                                          value,
                                        )}`}
                                        style={deltaChipStyle(value, bound)}
                                        title={
                                          delta
                                            ? `${window.key} change: ${fmtSignedMw(value)} MW vs ${fmtDateTime(
                                                delta.anchorEvaluatedAtEpt,
                                              )}`
                                            : `${window.key} change unavailable`
                                        }
                                      >
                                        <span className="text-[9px] font-bold text-gray-300/80">
                                          {window.label}
                                        </span>
                                        <span className="tabular-nums">{fmtSignedMw(value)}</span>
                                      </span>
                                    );
                                  })}
                                </span>
                              </Link>
                            ) : (
                              <span className="flex min-h-[58px] items-center justify-center rounded px-2 py-2 text-[11px] text-gray-700">
                                -
                              </span>
                            )}
                          </td>
                        );
                      }),
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </DataTableShell>
      )}
    </div>
  );
}
