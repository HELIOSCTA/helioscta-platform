"use client";

import type { CSSProperties, ReactNode } from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DataTableShell from "@/components/dashboard/DataTableShell";
import PlotCard, { type PlotSeries } from "@/components/dashboard/PlotCard";
import { ForecastHeatmapToggle } from "@/components/pjm/forecastShared";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

interface ForecastVintageCurve {
  evaluatedAtEpt: string;
  tag: string;
  peak: number | null;
  onPeak: number | null;
  offPeak: number | null;
  hourly: Array<number | null>;
}

interface ForecastVintageTableRow extends ForecastVintageCurve {
  rowType: "Snapshot" | "Delta";
  tableKey: string;
  isDelta: boolean;
  selectedFromChart?: boolean;
}

type ForecastVintageRowType = ForecastVintageTableRow["rowType"];

interface PjmForecastDifferencesPayload {
  iso: "pjm";
  area: string;
  areas: string[];
  forecastDate: string;
  forecastDates: string[];
  asOf: string | null;
  latestUpdate: string | null;
  source: string;
  sourceComparisonAvailable: boolean;
  sourceComparisonNote: string;
  rowCount: number;
  lookbackHours: number;
  snapshotRows: ForecastVintageCurve[];
  deltaRows: ForecastVintageCurve[];
  lookbackRows: ForecastVintageCurve[];
  windowRows: ForecastVintageCurve[];
}

interface ExplorerMetricSummary {
  flatAvg: number | null;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  peakMw: number | null;
  minMw: number | null;
}

interface ForecastExplorerDeltaSummary extends ExplorerMetricSummary {
  hours: number;
  anchorEvaluatedAtEpt: string;
}

interface ForecastExplorerCell extends ExplorerMetricSummary {
  area: string;
  forecastDate: string;
  vintageCount: number;
  latestEvaluatedAtEpt: string;
  deltas: Record<string, ForecastExplorerDeltaSummary | null>;
  delta24h: ExplorerMetricSummary | null;
  delta48h: ExplorerMetricSummary | null;
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

export interface PjmForecastsFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

export type PjmForecastView = "explorer" | "profile" | "table" | "diffs";
type ForecastSourceMode = "pjm" | "meteologica";
type ExplorerMetric =
  | "peakMw"
  | "onPeakAvg"
  | "offPeakAvg";
type ExplorerViewMode = "latest" | "change";
type ChangeWindowKey = "1h" | "12h" | "24h" | "48h" | "72h";
type AreaGroupKey = "rto" | "west" | "midatl" | "south" | "other";

const API_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_LOOKBACK_HOURS = 72;
const LOOKBACK_OPTIONS = [1, 12, 24, 48, 72, 168] as const;
const DEFAULT_VISIBLE_LOOKBACK_HOURS = new Set([1, 12, 24, 48, 72]);
const VINTAGE_ROW_TYPES: Array<{
  key: ForecastVintageRowType;
  label: string;
  description: string;
}> = [
  { key: "Snapshot", label: "Snapshots", description: "Latest and anchor runs" },
  { key: "Delta", label: "Deltas", description: "Change versus anchors" },
];
const COLORS = ["#38bdf8", "#22c55e", "#f97316", "#a78bfa", "#facc15", "#fb7185", "#2dd4bf"];
const EXPLORER_METRICS: Array<{ key: ExplorerMetric; label: string; signed: boolean }> = [
  { key: "peakMw", label: "Peak", signed: false },
  { key: "onPeakAvg", label: "OnPeak", signed: false },
  { key: "offPeakAvg", label: "OffPeak", signed: false },
];
const CHANGE_WINDOWS: Array<{ key: ChangeWindowKey; label: string; hours: number }> = [
  { key: "1h", label: "1h", hours: 1 },
  { key: "12h", label: "12h", hours: 12 },
  { key: "24h", label: "24h", hours: 24 },
  { key: "48h", label: "48h", hours: 48 },
  { key: "72h", label: "72h", hours: 72 },
];
const AREA_GROUPS: Array<{ key: AreaGroupKey; label: string }> = [
  { key: "rto", label: "RTO" },
  { key: "west", label: "West" },
  { key: "midatl", label: "Mid-Atlantic" },
  { key: "south", label: "South" },
  { key: "other", label: "Other" },
];
const FORECAST_SOURCE_TABS: Array<{
  key: ForecastSourceMode;
  label: string;
  scope: string;
}> = [
  { key: "pjm", label: "Load Forecasts", scope: "PJM Data Miner" },
  { key: "meteologica", label: "Meteologica", scope: "Load forecasts" },
];
const POPUP_FORECAST_COL_COUNT = 30;
const POPUP_FORECAST_TABLE_CLASS =
  "w-full min-w-[2060px] table-fixed border-collapse bg-[#0d1119] text-[11px] text-gray-200";
const POPUP_PINNED_SHADOW = "shadow-[2px_0_0_rgba(31,41,55,0.9)]";
const WEST_AREAS = new Set([
  "AEP",
  "AP",
  "ATSI",
  "COMED",
  "DAYTON",
  "DEOK",
  "DUQUESNE",
  "EKPC",
  "WESTERN_REGION",
]);
const SOUTH_AREAS = new Set(["DOMINION", "SOUTHERN_REGION"]);

const DEFAULT_FRESHNESS: PjmForecastsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Forecasts --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function fmtForecastHeaderDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return fmtDate(value);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.toLocaleDateString("en-US", { day: "2-digit" });
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  return `${weekday} ${month}-${day}${weekend ? " W" : ""}`;
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function fmtMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString();
}

function fmtSignedMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString()}`;
}

function sourceLabel(sourceMode: ForecastSourceMode): string {
  return sourceMode === "meteologica" ? "Meteologica" : "PJM Data Miner";
}

function buildExplorerApiUrl(sourceMode: ForecastSourceMode, refresh: boolean): string {
  const endpoint =
    sourceMode === "meteologica"
      ? "/api/pjm-meteologica-forecast-explorer"
      : "/api/pjm-forecast-explorer";
  return refresh ? `${endpoint}?refresh=1` : endpoint;
}

function buildExplorerCacheKey(sourceMode: ForecastSourceMode): string {
  return sourceMode === "meteologica"
    ? "api:pjm-meteologica-forecast-explorer"
    : "api:pjm-forecast-explorer";
}

function buildDiffApiUrl({
  sourceMode,
  area,
  forecastDate,
  lookbackHours,
  refresh,
}: {
  sourceMode: ForecastSourceMode;
  area: string;
  forecastDate: string;
  lookbackHours: number;
  refresh: boolean;
}): string {
  const endpoint =
    sourceMode === "meteologica"
      ? "/api/pjm-meteologica-forecast-differences"
      : "/api/pjm-forecast-differences";
  const params = new URLSearchParams({ area, date: forecastDate });
  params.set("lookbackHours", String(lookbackHours));
  if (refresh) params.set("refresh", "1");
  return `${endpoint}?${params.toString()}`;
}

function buildDiffCacheKey({
  sourceMode,
  area,
  forecastDate,
  lookbackHours,
}: {
  sourceMode: ForecastSourceMode;
  area: string;
  forecastDate: string;
  lookbackHours: number;
}): string {
  const sourceKey =
    sourceMode === "meteologica"
      ? "api:pjm-meteologica-forecast-differences"
      : "api:pjm-forecast-differences";
  return [sourceKey, area, forecastDate, lookbackHours].join(":");
}

function metricValue(cell: ForecastExplorerCell, metric: ExplorerMetric): number | null {
  return cell[metric];
}

function deltaSummary(
  cell: ForecastExplorerCell,
  windowKey: ChangeWindowKey,
): ForecastExplorerDeltaSummary | null {
  return cell.deltas?.[windowKey] ?? null;
}

function explorerCellValue({
  cell,
  metric,
  viewMode,
  windowKey,
}: {
  cell: ForecastExplorerCell;
  metric: ExplorerMetric;
  viewMode: ExplorerViewMode;
  windowKey: ChangeWindowKey;
}): number | null {
  if (viewMode === "change") return deltaSummary(cell, windowKey)?.[metric] ?? null;
  return metricValue(cell, metric);
}

function fmtMetricValue(value: number | null | undefined, signed: boolean): string {
  return signed ? fmtSignedMw(value) : fmtMw(value);
}

function areaGroupKey(area: string): AreaGroupKey {
  if (area === "RTO_COMBINED" || area === "RTO") return "rto";
  if (area === "MIDATL" || area === "MID_ATLANTIC_REGION" || area.includes("/MIDATL")) {
    return "midatl";
  }
  if (area === "SOUTH" || SOUTH_AREAS.has(area)) return "south";
  if (area === "WEST" || WEST_AREAS.has(area)) return "west";
  return "other";
}

function areaSortValue(area: string): string {
  if (area === "RTO_COMBINED" || area === "RTO") return "000";
  if (area.endsWith("_REGION")) return `001-${area}`;
  return `100-${area}`;
}

function curveChartRows(curves: ForecastVintageCurve[]): Array<Record<string, number | null>> {
  const rows = Array.from(
    { length: 24 },
    (_, hour) => ({ heStart: hour } as Record<string, number | null>),
  );
  curves.forEach((curve) => {
    curve.hourly.forEach((value, hour) => {
      rows[hour][curve.evaluatedAtEpt] = value;
    });
  });
  return rows;
}

function lookbackTagHour(tag: string | null | undefined): number | null {
  const match = tag?.trim().match(/^(\d+)\s*h(?:ours?)?\s+ago$/i);
  return match ? Number(match[1]) : null;
}

function snapshotTagHour(tag: string | null | undefined): number | null {
  const match = tag?.trim().match(/^(\d+)\s*h$/i);
  return match ? Number(match[1]) : null;
}

function deltaTagHour(tag: string | null | undefined): number | null {
  const match = tag?.trim().match(/^Delta\s+vs\s+(\d+)\s*h$/i);
  return match ? Number(match[1]) : null;
}

function vintageTableWindowHour(row: Pick<ForecastVintageTableRow, "rowType" | "tag">): number | null {
  return row.rowType === "Delta"
    ? deltaTagHour(row.tag)
    : (snapshotTagHour(row.tag) ?? lookbackTagHour(row.tag));
}

function isLatestSnapshot(row: Pick<ForecastVintageTableRow, "rowType" | "tag">): boolean {
  return row.rowType === "Snapshot" && row.tag.trim().toUpperCase() === "LATEST";
}

function vintageRowSortValue(row: Pick<ForecastVintageTableRow, "rowType" | "tag" | "evaluatedAtEpt">): string {
  if (isLatestSnapshot(row)) return "000000";
  const hour = vintageTableWindowHour(row);
  const hourRank = hour === null ? 9999 : hour;
  return `${String(hourRank).padStart(4, "0")}-${row.evaluatedAtEpt}`;
}

function sortVintageRows<T extends ForecastVintageTableRow>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const leftRank = vintageRowSortValue(left);
    const rightRank = vintageRowSortValue(right);
    if (leftRank !== rightRank) return leftRank.localeCompare(rightRank);
    return right.evaluatedAtEpt.localeCompare(left.evaluatedAtEpt);
  });
}

function vintageRowMatchesWindow(
  row: ForecastVintageTableRow,
  selectedWindows: Set<number>,
): boolean {
  if (isLatestSnapshot(row)) return true;
  if (row.selectedFromChart) return true;
  const hour = vintageTableWindowHour(row);
  return hour !== null && selectedWindows.has(hour);
}

function defaultHiddenLookbackSeries(rows: ForecastVintageCurve[]): Set<string> {
  return new Set(
    rows
      .filter((row) => {
        const tag = row.tag.trim();
        if (tag.toUpperCase() === "LATEST") return false;
        const tagHour = lookbackTagHour(tag);
        return tagHour === null || !DEFAULT_VISIBLE_LOOKBACK_HOURS.has(tagHour);
      })
      .map((row) => row.evaluatedAtEpt),
  );
}

function heatCellStyle(value: number | null, min: number, max: number): CSSProperties {
  if (value === null || min === max) return {};
  const midpoint = (min + max) / 2;
  const spread = Math.max(Math.abs(max - midpoint), Math.abs(midpoint - min));
  if (spread === 0) return {};
  const distance = Math.min(Math.abs(value - midpoint) / spread, 1);
  if (distance < 0.1) return {};
  const intensity = (distance - 0.1) / 0.9;
  const alpha = 0.06 + intensity * 0.2;
  const [r, g, b] = value >= midpoint ? [22, 163, 74] : [220, 38, 38];
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`,
    boxShadow: `inset 2px 0 0 rgba(${r}, ${g}, ${b}, ${(alpha + 0.12).toFixed(2)})`,
    color: "#e5e7eb",
  };
}

function deltaCellStyle(value: number | null, bound: number): CSSProperties {
  if (value === null || bound <= 0) return {};
  const intensity = Math.min(Math.abs(value) / bound, 1);
  const alpha = 0.08 + intensity * 0.25;
  const [r, g, b] = value >= 0 ? [34, 197, 94] : [248, 113, 113];
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`,
    color: "#f8fafc",
  };
}

function PopupForecastColGroup() {
  return (
    <colgroup>
      <col className="w-[104px]" />
      <col className="w-[142px]" />
      <col className="w-[78px]" />
      <col className="w-[82px]" />
      <col className="w-[82px]" />
      <col className="w-[82px]" />
      {Array.from({ length: 24 }, (_, hour) => (
        <col key={hour} className="w-[62px]" />
      ))}
    </colgroup>
  );
}

function hourDividerClass(hour: number): string {
  return hour % 6 === 0 ? "border-l border-gray-700/90" : "border-l border-gray-800/80";
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export default function PjmForecasts({
  refreshToken = 0,
  onFreshnessChange,
}: {
  initialView?: PjmForecastView;
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmForecastsFreshnessSummary) => void;
  onViewChange?: (view: PjmForecastView) => void;
}) {
  const [explorerViewMode, setExplorerViewMode] = useState<ExplorerViewMode>("latest");
  const [sourceMode, setSourceMode] = useState<ForecastSourceMode>("pjm");
  const [explorerMetric, setExplorerMetric] = useState<ExplorerMetric>("peakMw");
  const [changeWindow, setChangeWindow] = useState<ChangeWindowKey>("24h");
  const [tableHeatmapEnabled, setTableHeatmapEnabled] = useState(true);
  const [explorerData, setExplorerData] = useState<PjmForecastExplorerPayload | null>(null);
  const [diffData, setDiffData] = useState<PjmForecastDifferencesPayload | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [selectedExplorerCell, setSelectedExplorerCell] = useState<{
    area: string;
    forecastDate: string;
  } | null>(null);
  const [lookbackHours, setLookbackHours] = useState<number>(DEFAULT_LOOKBACK_HOURS);
  const [hiddenLookbackSeries, setHiddenLookbackSeries] = useState<Set<string>>(() => new Set());
  const [visibleVintageWindows, setVisibleVintageWindows] = useState<Set<number>>(
    () => new Set(DEFAULT_VISIBLE_LOOKBACK_HOURS),
  );
  const [visibleVintageRowTypes, setVisibleVintageRowTypes] = useState<Set<ForecastVintageRowType>>(
    () => new Set(VINTAGE_ROW_TYPES.map((type) => type.key)),
  );

  const selectChangeWindow = (windowKey: ChangeWindowKey) => {
    const window = CHANGE_WINDOWS.find((item) => item.key === windowKey)!;
    setChangeWindow(windowKey);
    setLookbackHours(window.hours);
  };

  useEffect(() => {
    setSelectedExplorerCell(null);
    setDiffData(null);
    setDiffError(null);
  }, [sourceMode]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setExplorerLoading(true);
    setExplorerError(null);

    fetchJsonWithCache<PjmForecastExplorerPayload>({
      key: buildExplorerCacheKey(sourceMode),
      url: buildExplorerApiUrl(sourceMode, refreshToken > 0),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setExplorerData(payload);
        onFreshnessChange?.({
          status: payload.asOf ? "Current" : "Unknown",
          statusClass: payload.asOf
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
            : "border-gray-700 bg-gray-900 text-gray-400",
          summary: `${sourceLabel(sourceMode)} | ${payload.cellCount.toLocaleString()} cells | ${payload.rowCount.toLocaleString()} summaries`,
          targetDateLabel: `${payload.areas.length} areas`,
          latestDateLabel: fmtDate(payload.forecastDates.at(-1)),
          latestUpdateLabel: fmtDateTime(payload.asOf),
        });
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setExplorerError(err.message || `Failed to load ${sourceLabel(sourceMode)} forecast explorer`);
        setExplorerData(null);
        onFreshnessChange?.({
          ...DEFAULT_FRESHNESS,
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Forecast explorer query failed",
        });
      })
      .finally(() => {
        if (active) setExplorerLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshToken, onFreshnessChange, sourceMode]);

  useEffect(() => {
    if (!selectedExplorerCell) return;

    const controller = new AbortController();
    let active = true;
    setDiffLoading(true);
    setDiffError(null);

    fetchJsonWithCache<PjmForecastDifferencesPayload>({
      key: buildDiffCacheKey({
        sourceMode,
        area: selectedExplorerCell.area,
        forecastDate: selectedExplorerCell.forecastDate,
        lookbackHours,
      }),
      url: buildDiffApiUrl({
        sourceMode,
        area: selectedExplorerCell.area,
        forecastDate: selectedExplorerCell.forecastDate,
        lookbackHours,
        refresh: refreshToken > 0,
      }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setDiffData(payload);
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setDiffError(err.message || `Failed to load ${sourceLabel(sourceMode)} forecast differences`);
        setDiffData(null);
      })
      .finally(() => {
        if (active) setDiffLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [lookbackHours, refreshToken, selectedExplorerCell, sourceMode]);

  const visibleAreaGroups = useMemo(() => {
    const areas = explorerData?.areas ?? [];
    const groups = new Map<AreaGroupKey, string[]>();
    areas.forEach((area) => {
      const key = areaGroupKey(area);
      groups.set(key, [...(groups.get(key) ?? []), area]);
    });

    return AREA_GROUPS.map((group) => ({
      ...group,
      areas: (groups.get(group.key) ?? []).sort((a, b) =>
        areaSortValue(a).localeCompare(areaSortValue(b)),
      ),
    })).filter((group) => group.areas.length > 0);
  }, [explorerData]);
  const visibleAreaCount = visibleAreaGroups.reduce((count, group) => count + group.areas.length, 0);

  const explorerCellMap = useMemo(() => {
    const map = new Map<string, ForecastExplorerCell>();
    explorerData?.cells.forEach((cell) => {
      map.set(`${cell.area}|${cell.forecastDate}`, cell);
    });
    return map;
  }, [explorerData]);

  const lookbackRows = useMemo(
    () => diffData?.lookbackRows ?? diffData?.windowRows ?? [],
    [diffData],
  );
  const lookbackSeries: PlotSeries[] = useMemo(
    () =>
      lookbackRows.map((row, index) => ({
        key: row.evaluatedAtEpt,
        label: row.tag || fmtDateTime(row.evaluatedAtEpt),
        color: COLORS[index % COLORS.length],
        defaultVisible: true,
      })),
    [lookbackRows],
  );

  useEffect(() => {
    setHiddenLookbackSeries(defaultHiddenLookbackSeries(lookbackRows));
  }, [lookbackRows]);

  const toggleLookbackSeries = (key: string) => {
    setHiddenLookbackSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const lookbackChartRows = useMemo(() => curveChartRows(lookbackRows), [lookbackRows]);
  const vintageDetailRows = useMemo<ForecastVintageTableRow[]>(() => {
    if (!diffData) return [];
    const snapshotRowsByRun = new Map<string, ForecastVintageTableRow>();
    diffData.snapshotRows.forEach((row) => {
      snapshotRowsByRun.set(row.evaluatedAtEpt, {
        ...row,
        rowType: "Snapshot" as const,
        tableKey: `snapshot-${row.evaluatedAtEpt}-${row.tag}`,
        isDelta: false,
      });
    });

    lookbackRows
      .filter((row) => !hiddenLookbackSeries.has(row.evaluatedAtEpt))
      .forEach((row) => {
        const tagHour = lookbackTagHour(row.tag);
        const selectedFromChart =
          tagHour !== null && !DEFAULT_VISIBLE_LOOKBACK_HOURS.has(tagHour);
        if (!selectedFromChart) return;
        snapshotRowsByRun.set(row.evaluatedAtEpt, {
          ...row,
          rowType: "Snapshot" as const,
          tableKey: `snapshot-chart-${row.evaluatedAtEpt}-${row.tag}`,
          isDelta: false,
          selectedFromChart,
        });
      });

    return [
      ...sortVintageRows(Array.from(snapshotRowsByRun.values())),
      ...sortVintageRows(
        diffData.deltaRows.map((row) => ({
          ...row,
          rowType: "Delta" as const,
          tableKey: `delta-${row.evaluatedAtEpt}-${row.tag}`,
          isDelta: true,
        })),
      ),
    ];
  }, [diffData, hiddenLookbackSeries, lookbackRows]);
  const windowFilteredVintageRows = useMemo(
    () => vintageDetailRows.filter((row) => vintageRowMatchesWindow(row, visibleVintageWindows)),
    [vintageDetailRows, visibleVintageWindows],
  );
  const visibleVintageDetailRows = useMemo(
    () => windowFilteredVintageRows.filter((row) => visibleVintageRowTypes.has(row.rowType)),
    [visibleVintageRowTypes, windowFilteredVintageRows],
  );
  const vintageRowTypeCounts = useMemo(() => {
    const counts = new Map<ForecastVintageRowType, number>();
    VINTAGE_ROW_TYPES.forEach((type) => counts.set(type.key, 0));
    windowFilteredVintageRows.forEach((row) =>
      counts.set(row.rowType, (counts.get(row.rowType) ?? 0) + 1),
    );
    return counts;
  }, [windowFilteredVintageRows]);
  const vintageWindowCounts = useMemo(() => {
    const counts = new Map<number, number>();
    CHANGE_WINDOWS.forEach((window) => counts.set(window.hours, 0));
    vintageDetailRows.forEach((row) => {
      const hour = vintageTableWindowHour(row);
      if (hour !== null && counts.has(hour)) counts.set(hour, (counts.get(hour) ?? 0) + 1);
    });
    return counts;
  }, [vintageDetailRows]);

  const toggleVintageRowType = (rowType: ForecastVintageRowType) => {
    setVisibleVintageRowTypes((prev) => {
      const next = new Set(prev);
      if (next.has(rowType) && next.size > 1) next.delete(rowType);
      else next.add(rowType);
      return next;
    });
  };

  const toggleVintageWindow = (hours: number) => {
    setVisibleVintageWindows((prev) => {
      const next = new Set(prev);
      if (next.has(hours)) next.delete(hours);
      else next.add(hours);
      return next;
    });
  };

  const diffBound = useMemo(() => {
    const values = (diffData?.deltaRows ?? [])
      .flatMap((row) => [row.peak, row.onPeak, row.offPeak, ...row.hourly])
      .filter((value): value is number => value !== null)
      .map((value) => Math.abs(value));
    return values.length ? Math.max(...values) : 0;
  }, [diffData]);
  const selectedDataLoaded = Boolean(
    selectedExplorerCell &&
      diffData &&
      diffData.area === selectedExplorerCell.area &&
      diffData.forecastDate === selectedExplorerCell.forecastDate,
  );
  const selectedMetric = EXPLORER_METRICS.find((item) => item.key === explorerMetric)!;
  const selectedWindow = CHANGE_WINDOWS.find((item) => item.key === changeWindow)!;
  const selectedMetricIsSigned = explorerViewMode === "change";
  const explorerSubtitle = explorerData
    ? `${explorerData.cellCount.toLocaleString()} area/date cells | as of ${fmtDateTime(
        explorerData.asOf,
      )}`
    : undefined;

  const renderCurveChart = ({
    heightClass,
    rows,
    chartSeries,
    curves,
    hiddenSeries,
  }: {
    heightClass: string;
    rows: Array<Record<string, number | null>>;
    chartSeries: PlotSeries[];
    curves: ForecastVintageCurve[];
    hiddenSeries: Set<string>;
  }) => (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 12, right: 24, bottom: 12, left: 8 }}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
          <XAxis
            dataKey="heStart"
            ticks={[0, 3, 7, 11, 15, 19, 23]}
            tickFormatter={(value) => `HE ${Number(value) + 1}`}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#334155" }}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#334155" }}
            tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
          />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 6,
              color: "#e5e7eb",
            }}
            formatter={(value: unknown, name: unknown) => [
              typeof value === "number" ? `${Math.round(value).toLocaleString()} MW` : "-",
              typeof name === "string"
                ? (curves.find((row) => row.evaluatedAtEpt === name)?.tag || fmtDateTime(name))
                : String(name),
            ]}
            labelFormatter={(value) => `HE ${Number(value) + 1}`}
          />
          {chartSeries.map((item) =>
            hiddenSeries.has(item.key) ? null : (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.key}
                stroke={item.color}
                dot={false}
                strokeWidth={item.label === "LATEST" ? 2.8 : 2}
                strokeDasharray={item.label === "LATEST" ? undefined : "5 3"}
                connectNulls
              />
            ),
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const renderLookbackChart = (heightClass: string) =>
    renderCurveChart({
      heightClass,
      rows: lookbackChartRows,
      chartSeries: lookbackSeries,
      curves: lookbackRows,
      hiddenSeries: hiddenLookbackSeries,
    });

  const renderVintageTable = () => (
    <DataTableShell
      title="Forecast Vintage Detail"
      subtitle={diffData ? `${diffData.area}: ${diffData.forecastDate} | snapshots and deltas` : undefined}
      action={
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {CHANGE_WINDOWS.map((window) => {
              const active = visibleVintageWindows.has(window.hours);
              return (
                <button
                  key={window.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleVintageWindow(window.hours)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                    active
                      ? "border-sky-500/40 bg-sky-500/10 text-sky-100"
                      : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
                  }`}
                >
                  {window.label}
                  <span className="text-gray-500">
                    {vintageWindowCounts.get(window.hours)?.toLocaleString() ?? "0"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {VINTAGE_ROW_TYPES.map((type) => {
              const active = visibleVintageRowTypes.has(type.key);
              return (
                <button
                  key={type.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleVintageRowType(type.key)}
                  title={type.description}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                    active
                      ? "border-gray-600 bg-gray-800 text-gray-100"
                      : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-sm ${
                      type.key === "Snapshot"
                        ? "bg-emerald-300"
                        : type.key === "Delta"
                          ? "bg-sky-300"
                          : "bg-gray-500"
                    }`}
                    aria-hidden="true"
                  />
                  {type.label}
                  <span className="text-gray-500">
                    {vintageRowTypeCounts.get(type.key)?.toLocaleString() ?? "0"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      }
      bodyClassName="max-h-[64vh] overflow-auto"
    >
      <div className="min-w-[2060px]">
        <table className={POPUP_FORECAST_TABLE_CLASS}>
          <PopupForecastColGroup />
          <thead className="sticky top-0 z-30 bg-gray-950 text-gray-500">
            <tr>
              <th
                className={`sticky left-0 top-0 z-40 bg-gray-950 px-2 py-1.5 text-left font-semibold uppercase tracking-wide ${POPUP_PINNED_SHADOW}`}
              >
                Type
              </th>
              <th
                className={`sticky left-[104px] top-0 z-40 bg-gray-950 px-2 py-1.5 text-left font-semibold uppercase tracking-wide ${POPUP_PINNED_SHADOW}`}
              >
                Run
              </th>
              <th
                className={`sticky left-[246px] top-0 z-40 bg-gray-950 px-2 py-1.5 text-left font-semibold uppercase tracking-wide ${POPUP_PINNED_SHADOW}`}
              >
                Tag
              </th>
              <th className="sticky top-0 z-30 border-l border-gray-700/90 bg-gray-950 px-2 py-1.5 text-right font-semibold uppercase tracking-wide">
                Peak
              </th>
              <th className="sticky top-0 z-30 border-l border-gray-800/80 bg-gray-950 px-2 py-1.5 text-right font-semibold uppercase tracking-wide">
                OnPeak
              </th>
              <th className="sticky top-0 z-30 border-l border-gray-800/80 bg-gray-950 px-2 py-1.5 text-right font-semibold uppercase tracking-wide">
                OffPeak
              </th>
              {Array.from({ length: 24 }, (_, hour) => (
                <th
                  key={hour}
                  className={`sticky top-0 z-30 bg-gray-950 px-1.5 py-1.5 text-right font-semibold uppercase tracking-wide ${hourDividerClass(
                    hour,
                  )}`}
                >
                  HE{hour + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {visibleVintageDetailRows.map((row, index) => {
              const isDelta = row.isDelta;
              const numericValues = row.hourly.filter((value): value is number => value !== null);
              const min = numericValues.length ? Math.min(...numericValues) : 0;
              const max = numericValues.length ? Math.max(...numericValues) : 0;
              const previousRow = visibleVintageDetailRows[index - 1];
              const startsGroup = !previousRow || previousRow.rowType !== row.rowType;
              return (
                <Fragment key={row.tableKey}>
                  {startsGroup && (
                    <tr className="border-t border-gray-700 bg-gray-950/80">
                      <td
                        colSpan={POPUP_FORECAST_COL_COUNT}
                        className="sticky left-0 z-20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-300"
                      >
                        {row.rowType} (
                        {vintageRowTypeCounts.get(row.rowType)?.toLocaleString() ?? 0})
                      </td>
                    </tr>
                  )}
                  <tr className="hover:bg-gray-900/60">
                    <td
                      className={`sticky left-0 z-20 bg-[#0d1119] px-2 py-1.5 font-medium text-gray-300 ${POPUP_PINNED_SHADOW}`}
                    >
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                          row.rowType === "Delta"
                            ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
                            : row.rowType === "Snapshot"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                              : "border-gray-700 bg-gray-900 text-gray-400"
                        }`}
                      >
                        {row.rowType}
                      </span>
                    </td>
                    <td
                      className={`sticky left-[104px] z-20 bg-[#0d1119] px-2 py-1.5 font-medium text-gray-300 ${POPUP_PINNED_SHADOW}`}
                    >
                      {fmtDateTime(row.evaluatedAtEpt)}
                    </td>
                    <td
                      className={`sticky left-[246px] z-20 bg-[#0d1119] px-2 py-1.5 text-gray-400 ${POPUP_PINNED_SHADOW}`}
                    >
                      {row.tag || "-"}
                    </td>
                    <td
                      className="border-l border-gray-700/90 px-2 py-1.5 text-right tabular-nums"
                      style={isDelta ? deltaCellStyle(row.peak, diffBound) : undefined}
                    >
                      {isDelta && row.peak !== null && row.peak > 0 ? "+" : ""}
                      {fmtMw(row.peak)}
                    </td>
                    <td
                      className="border-l border-gray-800/80 px-2 py-1.5 text-right tabular-nums"
                      style={isDelta ? deltaCellStyle(row.onPeak, diffBound) : undefined}
                    >
                      {isDelta && row.onPeak !== null && row.onPeak > 0 ? "+" : ""}
                      {fmtMw(row.onPeak)}
                    </td>
                    <td
                      className="border-l border-gray-800/80 px-2 py-1.5 text-right tabular-nums"
                      style={isDelta ? deltaCellStyle(row.offPeak, diffBound) : undefined}
                    >
                      {isDelta && row.offPeak !== null && row.offPeak > 0 ? "+" : ""}
                      {fmtMw(row.offPeak)}
                    </td>
                    {row.hourly.map((value, hour) => (
                      <td
                        key={hour}
                        className={`px-1.5 py-1.5 text-right tabular-nums text-gray-300 ${hourDividerClass(
                          hour,
                        )}`}
                        style={
                          isDelta
                            ? deltaCellStyle(value, diffBound)
                            : heatCellStyle(value, min, max)
                        }
                      >
                        {isDelta && value !== null && value > 0 ? "+" : ""}
                        {fmtMw(value)}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              );
            })}
            {visibleVintageDetailRows.length === 0 && (
              <tr>
                <td
                  colSpan={POPUP_FORECAST_COL_COUNT}
                  className="px-3 py-6 text-center text-sm text-gray-500"
                >
                  No rows match the selected change windows and row types.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DataTableShell>
  );

  const renderExplorerMatrix = () => {
    const datesToRender = explorerData?.forecastDates ?? [];

    return (
      <DataTableShell
        title="Forecast Explorer"
        subtitle={
          explorerData
            ? `${visibleAreaCount} areas x ${datesToRender.length} dates | ${selectedMetric.label} | ${
                explorerViewMode === "change" ? `change vs ${selectedWindow.label}` : "latest"
              } | row heatmap`
            : undefined
        }
        action={
          <ForecastHeatmapToggle
            enabled={tableHeatmapEnabled}
            onToggle={() => setTableHeatmapEnabled((enabled) => !enabled)}
          />
        }
        bodyClassName="max-h-[72vh] overflow-auto"
      >
        <table className="w-full min-w-[860px] table-fixed border-collapse bg-[#0d1119] text-[11px] text-gray-200">
          <colgroup>
            <col className="w-[132px]" />
            {datesToRender.map((date) => (
              <col key={date} className="w-[92px]" />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-30 bg-gray-950 text-gray-500">
            <tr>
              <th className="sticky left-0 top-0 z-40 bg-gray-950 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide shadow-[2px_0_0_rgba(31,41,55,0.9)]">
                Area
              </th>
              {datesToRender.map((date) => (
                <th
                  key={date}
                  className="sticky top-0 z-30 whitespace-nowrap bg-gray-950 px-2 py-1.5 text-right text-[10px] font-semibold uppercase leading-tight tracking-wide"
                >
                  {fmtForecastHeaderDate(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {visibleAreaGroups.map((group) => (
              <Fragment key={group.key}>
                <tr>
                  <td
                    colSpan={datesToRender.length + 1}
                    className="sticky left-0 z-20 bg-gray-950/90 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-sky-200 shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                  >
                    {group.label}
                  </td>
                </tr>
                {group.areas.map((rowArea) => {
                  const rowValues = datesToRender
                    .map((date) => {
                      const cell = explorerCellMap.get(`${rowArea}|${date}`);
                      return cell
                        ? explorerCellValue({
                            cell,
                            metric: explorerMetric,
                            viewMode: explorerViewMode,
                            windowKey: changeWindow,
                          })
                        : null;
                    })
                    .filter((value): value is number => value !== null);
                  const rowMin = rowValues.length ? Math.min(...rowValues) : 0;
                  const rowMax = rowValues.length ? Math.max(...rowValues) : 0;
                  const rowBound = rowValues.length
                    ? Math.max(...rowValues.map((value) => Math.abs(value)))
                    : 0;

                  return (
                    <tr key={rowArea} className="hover:bg-gray-900/60">
                      <td
                        className="sticky left-0 z-20 truncate bg-[#0d1119] px-2 py-1.5 font-medium text-gray-300 shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                        title={rowArea}
                      >
                        {rowArea}
                      </td>
                      {datesToRender.map((date) => {
                        const cell = explorerCellMap.get(`${rowArea}|${date}`);
                        const value = cell
                          ? explorerCellValue({
                              cell,
                              metric: explorerMetric,
                              viewMode: explorerViewMode,
                              windowKey: changeWindow,
                            })
                          : null;
                        const isSelected =
                          Boolean(cell) &&
                          selectedExplorerCell?.area === rowArea &&
                          selectedExplorerCell?.forecastDate === date;
                        return (
                          <td
                            key={date}
                            className="px-1 py-1 text-right align-top tabular-nums text-gray-300"
                            style={
                              tableHeatmapEnabled
                                ? selectedMetricIsSigned
                                  ? deltaCellStyle(value, rowBound)
                                  : heatCellStyle(value, rowMin, rowMax)
                                : undefined
                            }
                          >
                            <button
                              type="button"
                              disabled={!cell}
                              onClick={() => {
                                if (!cell) return;
                                setSelectedExplorerCell({
                                  area: cell.area,
                                  forecastDate: cell.forecastDate,
                                });
                              }}
                              className={`min-h-7 w-full rounded px-1.5 py-1 text-right text-[11px] transition-colors hover:bg-gray-950/50 disabled:cursor-default disabled:hover:bg-transparent ${
                                isSelected ? "ring-1 ring-sky-300/80" : ""
                              }`}
                              title={
                                cell
                                  ? `${cell.area} ${cell.forecastDate} | ${cell.vintageCount} vintages | ${fmtDateTime(
                                      cell.latestEvaluatedAtEpt,
                                    )}`
                                  : undefined
                              }
                            >
                              {fmtMetricValue(value, selectedMetricIsSigned)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </DataTableShell>
    );
  };

  const renderExplorerModal = () => {
    if (!selectedExplorerCell) return null;

    return (
      <div
        className="fixed inset-0 z-50 bg-black/70 p-1 sm:p-3"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedExplorerCell(null);
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="forecast-modal-title"
          className="mx-auto flex h-full w-full max-w-none flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#10131c] shadow-2xl shadow-black/50"
        >
          <div className="flex flex-col gap-3 border-b border-gray-800 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="forecast-modal-title" className="text-base font-semibold text-gray-100">
                Forecast Vintages
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {selectedExplorerCell.area} | {fmtDate(selectedExplorerCell.forecastDate)} |{" "}
                {lookbackHours} hour lookback
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="block w-36">
                <span className="sr-only">Lookback</span>
                <select
                  value={lookbackHours}
                  onChange={(event) => setLookbackHours(Number(event.target.value))}
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                >
                  {LOOKBACK_OPTIONS.map((hours) => (
                    <option key={hours} value={hours}>
                      {hours} hours
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setSelectedExplorerCell(null)}
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">
            {diffError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {diffError}
              </div>
            )}
            {diffLoading && (
              <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
                Loading vintage detail...
              </div>
            )}
            {selectedDataLoaded && diffData && !diffLoading && (
              <>
                <PlotCard
                  title="Forecast Vintages in Lookback"
                  subtitle={`${diffData.area}: ${diffData.forecastDate} | as of ${fmtDateTime(
                    diffData.asOf,
                  )}`}
                  series={lookbackSeries}
                  hiddenSeries={hiddenLookbackSeries}
                  onToggleSeries={toggleLookbackSeries}
                  onShowAll={() => setHiddenLookbackSeries(new Set())}
                  onHideAll={() =>
                    setHiddenLookbackSeries(new Set(lookbackSeries.map((series) => series.key)))
                  }
                  focusedChildren={renderLookbackChart("h-[70vh]")}
                >
                  {renderLookbackChart("h-[360px]")}
                </PlotCard>
                {renderVintageTable()}
              </>
            )}
          </div>
        </section>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Forecast Source">
        <div className="grid gap-2 md:grid-cols-2" role="tablist" aria-label="Forecast source">
          {FORECAST_SOURCE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={sourceMode === tab.key}
              onClick={() => setSourceMode(tab.key)}
              className={`rounded-md border px-3 py-2 text-left transition-colors ${
                sourceMode === tab.key
                  ? "border-sky-500/60 bg-sky-500/10 text-white shadow-[inset_0_-2px_0_rgba(56,189,248,0.75)]"
                  : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
              }`}
            >
              <span className="block text-xs font-semibold">{tab.label}</span>
              <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-gray-500">
                {tab.scope}
              </span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Explorer Controls" subtitle={explorerSubtitle}>
        <div className="grid gap-3 xl:grid-cols-[170px_1fr_300px] xl:items-end">
          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              View
            </span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Explorer view">
              {[
                ["latest", "Latest"],
                ["change", "Change"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={explorerViewMode === key}
                  onClick={() => {
                    setExplorerViewMode(key as ExplorerViewMode);
                    if (key === "change") setLookbackHours(selectedWindow.hours);
                  }}
                  className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                    explorerViewMode === key
                      ? "border-sky-500/50 bg-sky-500/10 text-white"
                      : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Metric
            </span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Explorer metric">
              {EXPLORER_METRICS.map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  role="radio"
                  aria-checked={explorerMetric === metric.key}
                  onClick={() => setExplorerMetric(metric.key)}
                  className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                    explorerMetric === metric.key
                      ? "border-sky-500/50 bg-sky-500/10 text-white"
                      : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                  }`}
                >
                  {metric.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Window
            </span>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Change window">
              {CHANGE_WINDOWS.map((window) => (
                <button
                  key={window.key}
                  type="button"
                  role="radio"
                  aria-checked={changeWindow === window.key}
                  onClick={() => {
                    setExplorerViewMode("change");
                    selectChangeWindow(window.key);
                  }}
                  className={`rounded-md border px-2 py-2 text-xs font-semibold transition-colors ${
                    changeWindow === window.key
                      ? "border-sky-500/50 bg-sky-500/10 text-white"
                      : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                  }`}
                >
                  {window.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {explorerError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {explorerError}
        </div>
      )}
      {explorerLoading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading forecast explorer...
        </div>
      )}
      {explorerData && !explorerLoading && renderExplorerMatrix()}
      {renderExplorerModal()}
    </div>
  );
}
