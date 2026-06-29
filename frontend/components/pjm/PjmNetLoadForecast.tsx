"use client";

import {
  Fragment,
  startTransition,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DataTableShell from "@/components/dashboard/DataTableShell";
import PlotCard, { type PlotSeries } from "@/components/dashboard/PlotCard";
import {
  FORECAST_EXPLORER_DATE_COL_CLASS,
  FORECAST_EXPLORER_ROW_HEADER_COL_CLASS,
  FORECAST_EXPLORER_TABLE_CLASS,
  FORECAST_POPUP_PINNED_SHADOW,
  FORECAST_POPUP_PINNED_LEFT_CLASSES,
  FORECAST_POPUP_TABLE_CLASS,
  ForecastHeatmapToggle,
  ForecastPopupColGroup,
  compareDeltaCellStyle,
  compareLevelCellStyle,
  deltaCellStyle,
  forecastPopupColCount,
  forecastPopupHourDividerClass,
  forecastPopupMetricBorderClass,
  forecastPopupMinWidthClass,
  fmtDateTime,
  fmtMw,
  fmtSignedMw,
} from "@/components/pjm/forecastShared";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

interface MetricSummary {
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

interface DeltaSummary extends MetricSummary {
  hours: number;
  anchorEvaluatedAtEpt: string;
}

interface NetLoadExplorerCell extends MetricSummary {
  area: string;
  forecastDate: string;
  vintageCount: number;
  latestEvaluatedAtEpt: string;
  completeHourCount: number;
  deltas: Record<string, DeltaSummary | null>;
}

interface NetLoadExplorerPayload {
  iso: "pjm";
  area: string;
  areas: string[];
  source: string;
  sourceMode: ForecastSourceMode;
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

interface NetLoadVintageCurve extends MetricSummary {
  evaluatedAtEpt: string;
  tag: string;
  hourly: Array<number | null>;
  loadHourly: Array<number | null>;
  windHourly: Array<number | null>;
  solarHourly: Array<number | null>;
  netHourly: Array<number | null>;
}

interface NetLoadDifferencesPayload {
  iso: "pjm";
  area: string;
  areas?: string[];
  forecastDate: string;
  forecastDates: string[];
  asOf: string | null;
  latestUpdate: string | null;
  source: string;
  sourceMode: ForecastSourceMode;
  sourceLabel: string;
  formula: string;
  coverageNote: string;
  rowCount: number;
  lookbackHours: number;
  snapshotRows: NetLoadVintageCurve[];
  deltaRows: NetLoadVintageCurve[];
  lookbackRows: NetLoadVintageCurve[];
  windowRows: NetLoadVintageCurve[];
}

interface NetLoadDateCompareHour {
  he: number;
  loadBaseMw: number | null;
  loadCompareMw: number | null;
  loadDeltaMw: number | null;
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

interface NetLoadDateComparePayload {
  iso: "pjm";
  area: string;
  baseDate: string;
  compareDate: string;
  baseIssue: string | null;
  compareIssue: string | null;
  sourceMode: ForecastSourceMode;
  sourceLabel: string;
  source: string;
  formula: string;
  completeHourCount: number;
  latestUpdate: string | null;
  rows: NetLoadDateCompareHour[];
}

export interface PjmNetLoadForecastFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

type ComponentKey = "load" | "wind" | "solar" | "netLoad";
export type ForecastSourceMode = "pjm" | "meteologica";
type AreaGroupKey = "rto" | "west" | "midatl" | "south" | "other";
export type NetLoadForecastTab = "outright" | "compareDay";
type StatisticKey = "peak" | "onPeak" | "offPeak" | "flat";
type ViewMode = "latest" | "change";
type ChangeWindowKey = "1h" | "12h" | "24h" | "48h" | "72h";
type DetailRowType = "Snapshot" | "Delta";
type CompareMwField = Exclude<keyof NetLoadDateCompareHour, "he">;

interface DetailTableRow extends NetLoadVintageCurve {
  rowType: DetailRowType;
  tableKey: string;
  isDelta: boolean;
}

const API_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_LOOKBACK_HOURS = 72;
const LOOKBACK_OPTIONS = [1, 12, 24, 48, 72, 168] as const;
const DEFAULT_VISIBLE_LOOKBACK_HOURS = new Set([1, 12, 24, 48, 72]);
const VINTAGE_ROW_TYPES: Array<{
  key: DetailRowType;
  label: string;
  description: string;
}> = [
  { key: "Snapshot", label: "Snapshots", description: "Latest and anchor runs" },
  { key: "Delta", label: "Deltas", description: "Change versus anchors" },
];
const CHANGE_WINDOWS: Array<{ key: ChangeWindowKey; label: string; hours: number }> = [
  { key: "1h", label: "1h", hours: 1 },
  { key: "12h", label: "12h", hours: 12 },
  { key: "24h", label: "24h", hours: 24 },
  { key: "48h", label: "48h", hours: 48 },
  { key: "72h", label: "72h", hours: 72 },
];
const FORECAST_SOURCE_TABS: Array<{
  key: ForecastSourceMode;
  label: string;
  scope: string;
}> = [
  { key: "pjm", label: "PJM", scope: "Data Miner load, wind, solar" },
  { key: "meteologica", label: "Meteologica", scope: "Load, wind, solar" },
];
const NET_LOAD_FORECAST_TABS: Array<{
  key: NetLoadForecastTab;
  label: string;
  scope: string;
}> = [
  { key: "outright", label: "Outright", scope: "Matrix and vintage detail" },
  { key: "compareDay", label: "Compare Day", scope: "A/B forecast-date plots" },
];
const COMPONENT_ROWS: Array<{ key: ComponentKey; label: string }> = [
  { key: "load", label: "Load" },
  { key: "wind", label: "Wind" },
  { key: "solar", label: "Solar" },
  { key: "netLoad", label: "Net Load" },
];
const COMPARE_COMPONENTS: Array<{
  key: ComponentKey;
  label: string;
  baseKey: CompareMwField;
  compareKey: CompareMwField;
  deltaKey: CompareMwField;
}> = [
  {
    key: "load",
    label: "Load",
    baseKey: "loadBaseMw",
    compareKey: "loadCompareMw",
    deltaKey: "loadDeltaMw",
  },
  {
    key: "solar",
    label: "Solar",
    baseKey: "solarBaseMw",
    compareKey: "solarCompareMw",
    deltaKey: "solarDeltaMw",
  },
  {
    key: "wind",
    label: "Wind",
    baseKey: "windBaseMw",
    compareKey: "windCompareMw",
    deltaKey: "windDeltaMw",
  },
  {
    key: "netLoad",
    label: "Net Load",
    baseKey: "netBaseMw",
    compareKey: "netCompareMw",
    deltaKey: "netDeltaMw",
  },
];
const STATISTICS: Array<{ key: StatisticKey; label: string }> = [
  { key: "peak", label: "Peak" },
  { key: "onPeak", label: "OnPeak" },
  { key: "offPeak", label: "OffPeak" },
  { key: "flat", label: "Flat" },
];
const AREA_GROUPS: Array<{ key: AreaGroupKey; label: string }> = [
  { key: "rto", label: "RTO" },
  { key: "west", label: "West" },
  { key: "midatl", label: "Mid-Atlantic" },
  { key: "south", label: "South" },
  { key: "other", label: "Other" },
];
const DETAIL_METRIC_COUNT = 4;
const DETAIL_COL_COUNT = forecastPopupColCount(DETAIL_METRIC_COUNT);
const COLORS = ["#38bdf8", "#22c55e", "#f97316", "#a78bfa", "#facc15", "#fb7185", "#2dd4bf"];
const COMPARE_BASE_COLOR = "#60a5fa";
const COMPARE_TARGET_COLOR = "#fb923c";
const COMPONENT_HEATMAP_HUES: Record<ComponentKey, number> = {
  load: 205,
  wind: 160,
  solar: 42,
  netLoad: 330,
};

const DEFAULT_FRESHNESS: PjmNetLoadForecastFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Net load --",
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

function fmtCompactMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const absValue = Math.abs(value);
  if (absValue >= 1000) return `${Math.round(value / 1000).toLocaleString()}k`;
  return Math.round(value).toLocaleString();
}

function forecastDateOffsetLabel(baseDate: string | null | undefined, date: string | null | undefined): string {
  if (!baseDate || !date) return "D+0";
  const [baseYear, baseMonth, baseDay] = baseDate.split("-").map(Number);
  const [year, month, day] = date.split("-").map(Number);
  const baseTime = Date.UTC(baseYear, baseMonth - 1, baseDay);
  const dateTime = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(baseTime) || !Number.isFinite(dateTime)) return "D+0";
  const dayOffset = Math.round((dateTime - baseTime) / 86_400_000);
  return dayOffset >= 0 ? `D+${dayOffset}` : `D${dayOffset}`;
}

function componentLabel(component: ComponentKey): string {
  return COMPONENT_ROWS.find((item) => item.key === component)?.label ?? component;
}

function statisticLabel(statistic: StatisticKey): string {
  return STATISTICS.find((item) => item.key === statistic)?.label ?? statistic;
}

function sourceLabel(sourceMode: ForecastSourceMode): string {
  return FORECAST_SOURCE_TABS.find((item) => item.key === sourceMode)?.label ?? sourceMode;
}

function changeWindowHours(key: ChangeWindowKey): number {
  return CHANGE_WINDOWS.find((item) => item.key === key)?.hours ?? 24;
}

function areaGroupKey(area: string): AreaGroupKey {
  if (area === "RTO" || area === "RTO_COMBINED") return "rto";
  if (area === "WEST" || area === "WESTERN_REGION") return "west";
  if (area === "MIDATL" || area === "MID_ATLANTIC_REGION") return "midatl";
  if (area === "SOUTH" || area === "SOUTHERN_REGION" || area === "DOMINION") return "south";
  return "other";
}

function areaSortValue(area: string): string {
  if (area === "RTO" || area === "RTO_COMBINED") return "000";
  if (area === "WEST" || area === "WESTERN_REGION") return "010";
  if (area === "MIDATL" || area === "MID_ATLANTIC_REGION") return "020";
  if (area === "SOUTH" || area === "SOUTHERN_REGION") return "030";
  return `100-${area}`;
}

function deltaSummary(
  cell: NetLoadExplorerCell,
  windowKey: ChangeWindowKey,
): DeltaSummary | null {
  return cell.deltas?.[windowKey] ?? null;
}

function componentStatisticValue(
  row: MetricSummary,
  component: ComponentKey,
  statistic: StatisticKey,
): number | null {
  if (component === "load") {
    if (statistic === "peak") return row.loadPeakMw;
    if (statistic === "onPeak") return row.loadOnPeakAvg;
    if (statistic === "offPeak") return row.loadOffPeakAvg;
    return row.loadFlatAvg;
  }
  if (component === "wind") {
    if (statistic === "peak") return row.windPeakMw;
    if (statistic === "onPeak") return row.windOnPeakAvg;
    if (statistic === "offPeak") return row.windOffPeakAvg;
    return row.windFlatAvg;
  }
  if (component === "solar") {
    if (statistic === "peak") return row.solarPeakMw;
    if (statistic === "onPeak") return row.solarOnPeakAvg;
    if (statistic === "offPeak") return row.solarOffPeakAvg;
    return row.solarFlatAvg;
  }
  if (statistic === "peak") return row.netPeakMw;
  if (statistic === "onPeak") return row.netOnPeakAvg;
  if (statistic === "offPeak") return row.netOffPeakAvg;
  return row.netFlatAvg;
}

function matrixValue(
  cell: NetLoadExplorerCell,
  component: ComponentKey,
  statistic: StatisticKey,
  viewMode: ViewMode,
  windowKey: ChangeWindowKey,
): number | null {
  if (viewMode === "change") {
    const delta = deltaSummary(cell, windowKey);
    return delta ? componentStatisticValue(delta, component, statistic) : null;
  }
  return componentStatisticValue(cell, component, statistic);
}

function fmtMatrixValue(value: number | null | undefined, signed: boolean): string {
  return signed ? fmtSignedMw(value) : fmtMw(value);
}

function componentHeatCellStyle(
  value: number | null,
  min: number,
  max: number,
  component: ComponentKey,
): CSSProperties | undefined {
  if (value === null || max === min) return undefined;
  const ratio = Math.max(0, Math.min((value - min) / (max - min), 1));
  const hue = COMPONENT_HEATMAP_HUES[component];
  return {
    backgroundColor: `hsla(${hue}, 72%, 38%, ${0.12 + ratio * 0.42})`,
    color: "#f8fafc",
  };
}

function buildExplorerUrl(sourceMode: ForecastSourceMode, refresh: boolean): string {
  const params = new URLSearchParams({ source: sourceMode });
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-net-load-forecast-explorer?${params.toString()}`;
}

function buildExplorerCacheKey(sourceMode: ForecastSourceMode): string {
  return `api:pjm-net-load-forecast-explorer:${sourceMode}`;
}

function buildDiffUrl({
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
  const params = new URLSearchParams({
    source: sourceMode,
    area,
    date: forecastDate,
    lookbackHours: String(lookbackHours),
  });
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-net-load-forecast-differences?${params.toString()}`;
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
  return [
    "api:pjm-net-load-forecast-differences",
    sourceMode,
    area,
    forecastDate,
    lookbackHours,
  ].join(":");
}

function buildCompareUrl({
  sourceMode,
  area,
  baseDate,
  compareDate,
  refresh,
}: {
  sourceMode: ForecastSourceMode;
  area: string;
  baseDate: string;
  compareDate: string;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({
    source: sourceMode,
    area,
    baseDate,
    compareDate,
  });
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-net-load-forecast-date-compare?${params.toString()}`;
}

function buildCompareCacheKey({
  sourceMode,
  area,
  baseDate,
  compareDate,
}: {
  sourceMode: ForecastSourceMode;
  area: string;
  baseDate: string;
  compareDate: string;
}): string {
  return [
    "api:pjm-net-load-forecast-date-compare",
    sourceMode,
    area,
    baseDate,
    compareDate,
  ].join(":");
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

function detailTableWindowHour(row: Pick<DetailTableRow, "rowType" | "tag">): number | null {
  return row.rowType === "Delta"
    ? deltaTagHour(row.tag)
    : (snapshotTagHour(row.tag) ?? lookbackTagHour(row.tag));
}

function isLatestSnapshot(row: Pick<DetailTableRow, "rowType" | "tag">): boolean {
  return row.rowType === "Snapshot" && row.tag.trim().toUpperCase() === "LATEST";
}

function detailRowSortValue(
  row: Pick<DetailTableRow, "rowType" | "tag" | "evaluatedAtEpt">,
): string {
  if (isLatestSnapshot(row)) return "000000";
  const hour = detailTableWindowHour(row);
  const hourRank = hour === null ? 9999 : hour;
  return `${String(hourRank).padStart(4, "0")}-${row.evaluatedAtEpt}`;
}

function sortDetailRows<T extends DetailTableRow>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const leftRank = detailRowSortValue(left);
    const rightRank = detailRowSortValue(right);
    if (leftRank !== rightRank) return leftRank.localeCompare(rightRank);
    return right.evaluatedAtEpt.localeCompare(left.evaluatedAtEpt);
  });
}

function detailRowMatchesWindow(
  row: DetailTableRow,
  selectedWindows: Set<number>,
): boolean {
  if (isLatestSnapshot(row)) return true;
  const hour = detailTableWindowHour(row);
  return hour !== null && selectedWindows.has(hour);
}

function defaultHiddenLookbackSeries(rows: NetLoadVintageCurve[]): Set<string> {
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

function freshnessFromPayload(
  payload: NetLoadExplorerPayload | null,
): PjmNetLoadForecastFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  const areaCount = payload.areas?.length ?? (payload.area ? 1 : 0);
  const areaLabel = areaCount === 1 ? (payload.areas?.[0] ?? payload.area) : `${areaCount} areas`;
  return {
    status: payload.asOf ? "Current" : "No Data",
    statusClass: payload.asOf
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
    summary: `${payload.sourceLabel} net load | ${areaLabel} | ${payload.cellCount.toLocaleString()} cells | ${payload.rowCount.toLocaleString()} vintages`,
    targetDateLabel: areaLabel,
    latestDateLabel: fmtDate(payload.forecastDates.at(-1)),
    latestUpdateLabel: fmtDateTime(payload.asOf),
  };
}

function componentHourly(
  curve: NetLoadVintageCurve,
  component: ComponentKey,
): Array<number | null> {
  if (component === "load") return curve.loadHourly;
  if (component === "wind") return curve.windHourly;
  if (component === "solar") return curve.solarHourly;
  return curve.netHourly;
}

function chartRows(
  curves: NetLoadVintageCurve[],
  component: ComponentKey,
): Array<Record<string, number | null>> {
  const rows = Array.from(
    { length: 24 },
    (_, hour) => ({ he: hour + 1 } as Record<string, number | null>),
  );
  curves.forEach((curve) => {
    componentHourly(curve, component).forEach((value, hour) => {
      rows[hour][curve.evaluatedAtEpt] = value;
    });
  });
  return rows;
}

function chartSeries(curves: NetLoadVintageCurve[]): PlotSeries[] {
  return curves.map((curve, index) => ({
    key: curve.evaluatedAtEpt,
    label: curve.tag ? `${curve.tag} | ${fmtDateTime(curve.evaluatedAtEpt)}` : fmtDateTime(curve.evaluatedAtEpt),
    color: COLORS[index % COLORS.length],
  }));
}

function tooltipMw(value: unknown): string {
  return typeof value === "number" ? fmtMw(value) : fmtMw(Number(value));
}

function tooltipSignedMw(value: unknown): string {
  return typeof value === "number" ? fmtSignedMw(value) : fmtSignedMw(Number(value));
}

function compareValue(row: NetLoadDateCompareHour, field: CompareMwField): number | null {
  return row[field];
}

function compareChartRows(
  rows: NetLoadDateCompareHour[],
  component: (typeof COMPARE_COMPONENTS)[number],
): Array<Record<string, number | null>> {
  return rows.map((row, index) => {
    const previousRow = rows[index - 1];
    const base = compareValue(row, component.baseKey);
    const compare = compareValue(row, component.compareKey);
    const previousBase = previousRow ? compareValue(previousRow, component.baseKey) : null;
    const previousCompare = previousRow ? compareValue(previousRow, component.compareKey) : null;
    const baseRamp = base === null || previousBase === null ? null : base - previousBase;
    const compareRamp =
      compare === null || previousCompare === null ? null : compare - previousCompare;

    return {
      he: row.he,
      base,
      compare,
      delta: compareValue(row, component.deltaKey),
      baseRamp,
      compareRamp,
      rampDelta: baseRamp === null || compareRamp === null ? null : compareRamp - baseRamp,
    };
  });
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

export default function PjmNetLoadForecast({
  refreshToken = 0,
  onFreshnessChange,
  sourceMode: controlledSourceMode,
  onSourceModeChange,
  activeTab: controlledActiveTab,
  onActiveTabChange,
  embedded = false,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmNetLoadForecastFreshnessSummary) => void;
  sourceMode?: ForecastSourceMode;
  onSourceModeChange?: (sourceMode: ForecastSourceMode) => void;
  activeTab?: NetLoadForecastTab;
  onActiveTabChange?: (activeTab: NetLoadForecastTab) => void;
  embedded?: boolean;
}) {
  const [internalSourceMode, setInternalSourceMode] = useState<ForecastSourceMode>("pjm");
  const [internalActiveTab, setInternalActiveTab] = useState<NetLoadForecastTab>("outright");
  const sourceMode = controlledSourceMode ?? internalSourceMode;
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setSourceMode = useCallback(
    (nextSourceMode: ForecastSourceMode) => {
      startTransition(() => {
        if (controlledSourceMode === undefined) setInternalSourceMode(nextSourceMode);
        onSourceModeChange?.(nextSourceMode);
      });
    },
    [controlledSourceMode, onSourceModeChange],
  );
  const setActiveTab = useCallback(
    (nextActiveTab: NetLoadForecastTab) => {
      startTransition(() => {
        if (controlledActiveTab === undefined) setInternalActiveTab(nextActiveTab);
        onActiveTabChange?.(nextActiveTab);
      });
    },
    [controlledActiveTab, onActiveTabChange],
  );
  const [viewMode, setViewMode] = useState<ViewMode>("latest");
  const [changeWindow, setChangeWindow] = useState<ChangeWindowKey>("24h");
  const [tableHeatmapEnabled, setTableHeatmapEnabled] = useState(true);
  const [selectedStatistic, setSelectedStatistic] = useState<StatisticKey>("peak");
  const [explorerData, setExplorerData] = useState<NetLoadExplorerPayload | null>(null);
  const [diffData, setDiffData] = useState<NetLoadDifferencesPayload | null>(null);
  const [compareData, setCompareData] = useState<NetLoadDateComparePayload | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [selectedForecastDate, setSelectedForecastDate] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState("RTO");
  const [compareArea, setCompareArea] = useState("RTO");
  const [compareBaseDate, setCompareBaseDate] = useState<string | null>(null);
  const [compareTargetDate, setCompareTargetDate] = useState<string | null>(null);
  const [compareRampingEnabled, setCompareRampingEnabled] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<ComponentKey>("netLoad");
  const [lookbackHours, setLookbackHours] = useState(DEFAULT_LOOKBACK_HOURS);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => new Set());
  const [visibleDetailWindows, setVisibleDetailWindows] = useState<Set<number>>(
    () => new Set(CHANGE_WINDOWS.map((window) => window.hours)),
  );
  const [visibleDetailRowTypes, setVisibleDetailRowTypes] = useState<Set<DetailRowType>>(
    () => new Set(VINTAGE_ROW_TYPES.map((type) => type.key)),
  );

  useEffect(() => {
    setSelectedForecastDate(null);
    setSelectedArea("RTO");
    setExplorerData(null);
    setDiffData(null);
    setCompareData(null);
    setDiffError(null);
    setCompareError(null);
    setHiddenSeries(new Set());
    setCompareArea("RTO");
    setCompareBaseDate(null);
    setCompareTargetDate(null);
    setCompareRampingEnabled(false);
  }, [sourceMode]);

  useEffect(() => {
    let active = true;
    setExplorerLoading(true);
    setExplorerError(null);

    fetchJsonWithCache<NetLoadExplorerPayload>({
      key: buildExplorerCacheKey(sourceMode),
      url: buildExplorerUrl(sourceMode, refreshToken > 0),
      ttlMs: API_CACHE_TTL_MS,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setExplorerData(payload);
        onFreshnessChange?.(freshnessFromPayload(payload));
      })
      .catch((err: Error) => {
        if (!active) return;
        setExplorerError(
          err.message || `Failed to load ${sourceLabel(sourceMode)} net load forecast explorer`,
        );
        setExplorerData(null);
        onFreshnessChange?.({
          ...DEFAULT_FRESHNESS,
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Net load forecast query failed",
        });
      })
      .finally(() => {
        if (active) setExplorerLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshToken, onFreshnessChange, sourceMode]);

  useEffect(() => {
    if (!selectedForecastDate) return;

    let active = true;
    setDiffLoading(true);
    setDiffError(null);

    fetchJsonWithCache<NetLoadDifferencesPayload>({
      key: buildDiffCacheKey({
        sourceMode,
        area: selectedArea,
        forecastDate: selectedForecastDate,
        lookbackHours,
      }),
      url: buildDiffUrl({
        sourceMode,
        area: selectedArea,
        forecastDate: selectedForecastDate,
        lookbackHours,
        refresh: refreshToken > 0,
      }),
      ttlMs: API_CACHE_TTL_MS,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setDiffData(payload);
        setHiddenSeries(defaultHiddenLookbackSeries(payload.lookbackRows));
      })
      .catch((err: Error) => {
        if (!active) return;
        setDiffError(
          err.message ||
            `Failed to load ${sourceLabel(sourceMode)} ${selectedArea} net load forecast vintages`,
        );
        setDiffData(null);
      })
      .finally(() => {
        if (active) setDiffLoading(false);
      });

    return () => {
      active = false;
    };
  }, [lookbackHours, refreshToken, selectedArea, selectedForecastDate, sourceMode]);

  useEffect(() => {
    if (!explorerData) return;

    const dates = explorerData.forecastDates ?? [];
    const areas = explorerData.areas ?? [];
    setCompareArea((current) => {
      if (areas.includes(current)) return current;
      if (areas.includes("RTO")) return "RTO";
      return areas[0] ?? "RTO";
    });
    setCompareBaseDate((current) => (current && dates.includes(current) ? current : dates[0] ?? null));
    setCompareTargetDate((current) =>
      current && dates.includes(current) ? current : dates[1] ?? dates[0] ?? null,
    );
  }, [explorerData]);

  useEffect(() => {
    if (activeTab !== "compareDay" || !compareBaseDate || !compareTargetDate) {
      setCompareData(null);
      setCompareLoading(false);
      return;
    }

    let active = true;
    setCompareLoading(true);
    setCompareError(null);

    fetchJsonWithCache<NetLoadDateComparePayload>({
      key: buildCompareCacheKey({
        sourceMode,
        area: compareArea,
        baseDate: compareBaseDate,
        compareDate: compareTargetDate,
      }),
      url: buildCompareUrl({
        sourceMode,
        area: compareArea,
        baseDate: compareBaseDate,
        compareDate: compareTargetDate,
        refresh: refreshToken > 0,
      }),
      ttlMs: API_CACHE_TTL_MS,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setCompareData(payload);
      })
      .catch((err: Error) => {
        if (!active) return;
        setCompareError(
          err.message ||
            `Failed to load ${sourceLabel(sourceMode)} ${compareArea} net load date comparison`,
        );
        setCompareData(null);
      })
      .finally(() => {
        if (active) setCompareLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeTab, compareArea, compareBaseDate, compareTargetDate, refreshToken, sourceMode]);

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

  const explorerCellMap = useMemo(
    () =>
      new Map(
        (explorerData?.cells ?? []).map((cell) => [`${cell.area}|${cell.forecastDate}`, cell] as const),
      ),
    [explorerData],
  );
  const selectedWindow = CHANGE_WINDOWS.find((item) => item.key === changeWindow) ?? CHANGE_WINDOWS[2];
  const explorerSubtitle = `${sourceLabel(sourceMode)} | ${statisticLabel(selectedStatistic)} by area/component | ${
    viewMode === "change" ? `change vs ${selectedWindow.label}` : "latest issue"
  } | complete load, wind, and solar hours only`;
  const compareDateOptions = explorerData?.forecastDates ?? [];
  const compareAreaOptions = explorerData?.areas ?? [];
  const comparePlotRows = useMemo(() => {
    const rows = compareData?.rows ?? [];
    return new Map(
      COMPARE_COMPONENTS.map((component) => [component.key, compareChartRows(rows, component)]),
    );
  }, [compareData]);
  const compareBaseDateLabel = fmtDate(compareBaseDate);
  const compareTargetDateLabel = fmtDate(compareTargetDate);
  const compareBaseLegend = `${compareBaseDateLabel} (${forecastDateOffsetLabel(
    compareBaseDate,
    compareBaseDate,
  )})`;
  const compareTargetLegend = `${compareTargetDateLabel} (${forecastDateOffsetLabel(
    compareBaseDate,
    compareTargetDate,
  )})`;
  const compareSubtitle = compareData
    ? `${compareData.sourceLabel} | ${compareData.area} | ${compareBaseLegend} vs ${compareTargetLegend} | ${
        compareData.completeHourCount
      }/24 complete hours`
    : `${sourceLabel(sourceMode)} | ${compareArea} | ${compareBaseLegend} vs ${compareTargetLegend}`;
  const compareRenewableVintageNote =
    "Solar and wind use the latest non-null forecast at or before the selected load issue.";

  const detailRows = useMemo<DetailTableRow[]>(() => {
    if (!diffData) return [];
    return [
      ...sortDetailRows(
        diffData.snapshotRows.map((row) => ({
          ...row,
          rowType: "Snapshot" as const,
          tableKey: `snapshot-${row.evaluatedAtEpt}-${row.tag}`,
          isDelta: false,
        })),
      ),
      ...sortDetailRows(
        diffData.deltaRows.map((row) => ({
          ...row,
          rowType: "Delta" as const,
          tableKey: `delta-${row.evaluatedAtEpt}-${row.tag}`,
          isDelta: true,
        })),
      ),
    ];
  }, [diffData]);
  const windowFilteredDetailRows = useMemo(
    () => detailRows.filter((row) => detailRowMatchesWindow(row, visibleDetailWindows)),
    [detailRows, visibleDetailWindows],
  );
  const visibleDetailRows = useMemo(
    () => windowFilteredDetailRows.filter((row) => visibleDetailRowTypes.has(row.rowType)),
    [visibleDetailRowTypes, windowFilteredDetailRows],
  );
  const detailRowTypeCounts = useMemo(() => {
    const counts = new Map<DetailRowType, number>();
    VINTAGE_ROW_TYPES.forEach((type) => counts.set(type.key, 0));
    windowFilteredDetailRows.forEach((row) => {
      counts.set(row.rowType, (counts.get(row.rowType) ?? 0) + 1);
    });
    return counts;
  }, [windowFilteredDetailRows]);
  const detailWindowCounts = useMemo(() => {
    const counts = new Map<number, number>();
    CHANGE_WINDOWS.forEach((window) => counts.set(window.hours, 0));
    detailRows.forEach((row) => {
      const hour = detailTableWindowHour(row);
      if (hour !== null && counts.has(hour)) counts.set(hour, (counts.get(hour) ?? 0) + 1);
    });
    return counts;
  }, [detailRows]);

  const lookbackSeries = useMemo(
    () => chartSeries(diffData?.lookbackRows ?? []),
    [diffData],
  );
  const lookbackChartRows = useMemo(
    () => chartRows(diffData?.lookbackRows ?? [], selectedComponent),
    [diffData, selectedComponent],
  );

  const toggleSeries = useCallback((key: string) => {
    startTransition(() => {
      setHiddenSeries((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    });
  }, []);

  const toggleDetailWindow = useCallback((hours: number) => {
    startTransition(() => {
      setVisibleDetailWindows((prev) => {
        const next = new Set(prev);
        if (next.has(hours)) next.delete(hours);
        else next.add(hours);
        return next;
      });
    });
  }, []);

  const toggleDetailRowType = useCallback((rowType: DetailRowType) => {
    startTransition(() => {
      setVisibleDetailRowTypes((prev) => {
        const next = new Set(prev);
        if (next.has(rowType) && next.size > 1) next.delete(rowType);
        else next.add(rowType);
        return next;
      });
    });
  }, []);

  const renderLookbackChart = (heightClass: string) => (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={lookbackChartRows} margin={{ top: 12, right: 20, bottom: 12, left: 8 }}>
          <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
          <XAxis
            dataKey="he"
            type="number"
            domain={[1, 24]}
            ticks={[1, 4, 8, 12, 16, 20, 24]}
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            label={{ value: "Hour Ending", position: "insideBottom", offset: -4, fill: "#6b7280" }}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickFormatter={(value) => fmtMw(Number(value))}
            width={86}
            label={{ value: "MW", angle: -90, position: "insideLeft", fill: "#6b7280" }}
          />
          <Tooltip
            contentStyle={{
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: 8,
              color: "#e5e7eb",
            }}
            labelFormatter={(value) => `HE ${value}`}
            formatter={(value, name) => [
              tooltipMw(value),
              lookbackSeries.find((item) => item.key === name)?.label ?? String(name),
            ]}
          />
          {lookbackSeries
            .filter((item) => !hiddenSeries.has(item.key))
            .map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const renderCompareProfileChart = (component: (typeof COMPARE_COMPONENTS)[number]) => {
    const rows = comparePlotRows.get(component.key) ?? [];

    return (
      <div
        key={`${component.key}-profile`}
        className="rounded-md border border-gray-800 bg-gray-950/30 p-2"
      >
        <h3 className="mb-1 text-center text-xs font-semibold text-gray-100">{component.label}</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
              <XAxis
                dataKey="he"
                type="number"
                domain={[1, 24]}
                ticks={[2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]}
                tick={{ fill: "#d1d5db", fontSize: 10 }}
                label={{ value: "HE", position: "insideBottom", offset: -8, fill: "#d1d5db" }}
              />
              <YAxis
                tick={{ fill: "#d1d5db", fontSize: 10 }}
                tickFormatter={(value) => fmtCompactMw(Number(value))}
                width={60}
                label={{ value: "MW", angle: -90, position: "insideLeft", fill: "#d1d5db" }}
              />
              <Tooltip
                contentStyle={{
                  background: "#111827",
                  border: "1px solid #374151",
                  borderRadius: 8,
                  color: "#e5e7eb",
                }}
                labelFormatter={(value) => `HE ${value}`}
                formatter={(value, name) => [tooltipMw(value), String(name)]}
              />
              <Line
                type="monotone"
                dataKey="base"
                name={compareBaseDateLabel}
                stroke={COMPARE_BASE_COLOR}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="compare"
                name={compareTargetDateLabel}
                stroke={COMPARE_TARGET_COLOR}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderCompareRampChart = (component: (typeof COMPARE_COMPONENTS)[number]) => {
    const rows = comparePlotRows.get(component.key) ?? [];

    return (
      <div
        key={`${component.key}-ramp`}
        className="rounded-md border border-gray-800 bg-gray-950/30 p-2"
      >
        <h3 className="mb-1 text-center text-xs font-semibold text-gray-100">
          {component.label} Ramp
        </h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              margin={{ top: 8, right: 12, bottom: 18, left: 0 }}
              barGap={1}
              barCategoryGap="18%"
            >
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
              <XAxis
                dataKey="he"
                type="number"
                domain={[1, 24]}
                ticks={[2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]}
                tick={{ fill: "#d1d5db", fontSize: 10 }}
                label={{ value: "HE", position: "insideBottom", offset: -8, fill: "#d1d5db" }}
              />
              <YAxis
                tick={{ fill: "#d1d5db", fontSize: 10 }}
                tickFormatter={(value) => fmtCompactMw(Number(value))}
                width={60}
                label={{ value: "MW/hr", angle: -90, position: "insideLeft", fill: "#d1d5db" }}
              />
              <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{
                  background: "#111827",
                  border: "1px solid #374151",
                  borderRadius: 8,
                  color: "#e5e7eb",
                }}
                labelFormatter={(value) => `HE ${value}`}
                formatter={(value, name) => [tooltipSignedMw(value), String(name)]}
              />
              <Bar
                dataKey="baseRamp"
                name={compareBaseDateLabel}
                fill={COMPARE_BASE_COLOR}
                isAnimationActive={false}
              />
              <Bar
                dataKey="compareRamp"
                name={compareTargetDateLabel}
                fill={COMPARE_TARGET_COLOR}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderCompareDataTable = () => {
    const baseKey = compareRampingEnabled ? "baseRamp" : "base";
    const compareKey = compareRampingEnabled ? "compareRamp" : "compare";
    const deltaKey = compareRampingEnabled ? "rampDelta" : "delta";
    const formatBaseValue = compareRampingEnabled ? fmtSignedMw : fmtMw;
    const valueUnit = compareRampingEnabled ? "MW/hr" : "MW";
    const compareValueStats = (rows: Array<Record<string, number | null>>, valueKey: string) => {
      const values = rows
        .map((row) => row[valueKey])
        .filter((value): value is number => typeof value === "number");
      const absBound = values.length
        ? Math.max(...values.map((value) => Math.abs(value)))
        : 0;
      return {
        min: values.length ? Math.min(...values) : 0,
        max: values.length ? Math.max(...values) : 0,
        absBound,
      };
    };

    return (
      <div className="mt-3 rounded-md border border-gray-800 bg-gray-950/30">
        <div className="border-b border-gray-800 px-3 py-2">
          <h3 className="text-sm font-semibold text-gray-100">Compare Day Data</h3>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {compareRampingEnabled ? "Hourly ramps" : "Hourly levels"} | {valueUnit}
          </p>
        </div>
        <div className="max-h-[52vh] overflow-auto">
          <table className="w-full min-w-[1600px] table-fixed border-separate border-spacing-0 text-[11px]">
            <colgroup>
              <col className="w-[96px]" />
              <col className="w-[116px]" />
              {Array.from({ length: 24 }, (_, hour) => (
                <col key={hour} className="w-[58px]" />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-20 bg-gray-950 text-gray-500">
              <tr>
                <th className="sticky left-0 z-30 bg-gray-950 px-2 py-1.5 text-left font-semibold uppercase tracking-wide shadow-[2px_0_0_rgba(31,41,55,0.9)]">
                  Component
                </th>
                <th className="sticky left-24 z-30 border-r border-gray-700 bg-gray-950 px-2 py-1.5 text-left font-semibold uppercase tracking-wide shadow-[2px_0_0_rgba(31,41,55,0.9)]">
                  Series
                </th>
                {Array.from({ length: 24 }, (_, hour) => (
                  <th
                    key={hour}
                    className={`px-2 py-1.5 text-right font-semibold uppercase tracking-wide ${forecastPopupHourDividerClass(
                      hour,
                    )}`}
                  >
                    HE{hour + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_COMPONENTS.flatMap((component) => {
                const rows = comparePlotRows.get(component.key) ?? [];
                const seriesRows = [
                  {
                    key: "base",
                    label: compareBaseDateLabel,
                    formatter: formatBaseValue,
                    valueKey: baseKey,
                    isDelta: false,
                    swatch: COMPARE_BASE_COLOR,
                    tone: "base" as const,
                  },
                  {
                    key: "compare",
                    label: compareTargetDateLabel,
                    formatter: formatBaseValue,
                    valueKey: compareKey,
                    isDelta: false,
                    swatch: COMPARE_TARGET_COLOR,
                    tone: "compare" as const,
                  },
                  {
                    key: "delta",
                    label: "Delta",
                    formatter: fmtSignedMw,
                    valueKey: deltaKey,
                    isDelta: true,
                    swatch: "#94a3b8",
                    tone: "base" as const,
                  },
                ].map((series) => ({
                  ...series,
                  ...compareValueStats(rows, series.valueKey),
                }));

                return seriesRows.map((series, seriesIndex) => (
                  <tr
                    key={`${component.key}-${series.key}`}
                    className={`hover:bg-gray-900/60 ${
                      seriesIndex === 0 ? "border-t border-gray-700" : "border-t border-gray-800"
                    }`}
                  >
                    {seriesIndex === 0 && (
                      <td
                        rowSpan={seriesRows.length}
                        className="sticky left-0 z-10 border-t border-gray-600 bg-[#0d1119] px-2 py-1.5 align-top font-semibold text-gray-100 shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                      >
                        {component.label}
                      </td>
                    )}
                    <td
                      className={`sticky left-24 z-10 border-r border-gray-700 bg-[#0d1119] px-2 py-1.5 font-medium shadow-[2px_0_0_rgba(31,41,55,0.9)] ${
                        seriesIndex === 0 ? "border-t border-gray-600" : "border-t border-gray-800"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-sm"
                          style={{ backgroundColor: series.swatch }}
                          aria-hidden="true"
                        />
                        <span className={series.isDelta ? "text-sky-200" : "text-gray-300"}>
                          {series.label}
                        </span>
                      </span>
                    </td>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const value = rows[hour]?.[series.valueKey] ?? null;
                      const signedClass =
                        series.isDelta && typeof value === "number"
                          ? value > 0
                            ? "text-emerald-200"
                            : value < 0
                              ? "text-rose-200"
                              : "text-gray-400"
                          : "text-gray-300";
                      const cellStyle = series.isDelta
                        ? compareDeltaCellStyle(value, series.absBound)
                        : compareLevelCellStyle(value, series.min, series.max, series.tone);
                      return (
                        <td
                          key={hour}
                          className={`border-t px-2 py-1.5 text-right tabular-nums ${signedClass} ${
                            seriesIndex === 0 ? "border-gray-600" : "border-gray-800"
                          } ${forecastPopupHourDividerClass(hour)}`}
                          style={cellStyle}
                        >
                          {series.formatter(value)}
                        </td>
                      );
                    })}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderDateCompareSection = () => (
    <SectionCard title="Forecast Date Compare" subtitle={compareSubtitle}>
      <div className="mb-3 grid gap-3 lg:grid-cols-[160px_170px_170px_130px_1fr] lg:items-end">
        <label>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Area
          </span>
          <select
            value={compareArea}
            disabled={compareAreaOptions.length <= 1}
            onChange={(event) => {
              const nextArea = event.target.value;
              startTransition(() => setCompareArea(nextArea));
            }}
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none disabled:cursor-default disabled:text-gray-500"
          >
            {(compareAreaOptions.length ? compareAreaOptions : [compareArea]).map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Date A
          </span>
          <select
            value={compareBaseDate ?? ""}
            disabled={!compareDateOptions.length}
            onChange={(event) => {
              const nextDate = event.target.value || null;
              startTransition(() => setCompareBaseDate(nextDate));
            }}
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none disabled:cursor-default disabled:text-gray-500"
          >
            {!compareDateOptions.length && <option value="">--</option>}
            {compareDateOptions.map((date) => (
              <option key={date} value={date}>
                {fmtDate(date)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Date B
          </span>
          <select
            value={compareTargetDate ?? ""}
            disabled={!compareDateOptions.length}
            onChange={(event) => {
              const nextDate = event.target.value || null;
              startTransition(() => setCompareTargetDate(nextDate));
            }}
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none disabled:cursor-default disabled:text-gray-500"
          >
            {!compareDateOptions.length && <option value="">--</option>}
            {compareDateOptions.map((date) => (
              <option key={date} value={date}>
                {fmtDate(date)}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Mode
          </span>
          <button
            type="button"
            aria-pressed={compareRampingEnabled}
            onClick={() => {
              startTransition(() => setCompareRampingEnabled((enabled) => !enabled));
            }}
            className={`w-full rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
              compareRampingEnabled
                ? "border-sky-500/50 bg-sky-500/10 text-white"
                : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
            }`}
          >
            Ramping
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-gray-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm" style={{ backgroundColor: COMPARE_BASE_COLOR }} />
            {compareBaseLegend}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-4 rounded-sm"
              style={{ backgroundColor: COMPARE_TARGET_COLOR }}
            />
            {compareTargetLegend}
          </span>
          {compareData && (
            <span className="text-gray-500">
              Updated {fmtDateTime(compareData.latestUpdate)}
            </span>
          )}
        </div>
      </div>

      {compareError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {compareError}
        </div>
      )}
      {compareLoading && (
        <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-6 text-sm text-gray-500">
          Loading date comparison...
        </div>
      )}
      {compareData && !compareLoading && (
        <div className="rounded-lg border border-gray-800 bg-[#0d1119] p-3">
          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <h3 className="text-base font-semibold text-gray-100">{compareData.area}</h3>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-gray-400">
              <span className="rounded-md border border-gray-800 bg-gray-950/50 px-2 py-1">
                {compareBaseDateLabel} load issue: {fmtDateTime(compareData.baseIssue)}
              </span>
              <span className="rounded-md border border-gray-800 bg-gray-950/50 px-2 py-1">
                {compareTargetDateLabel} load issue: {fmtDateTime(compareData.compareIssue)}
              </span>
              <span
                className="rounded-md border border-gray-800 bg-gray-950/50 px-2 py-1 text-gray-500"
                title={compareRenewableVintageNote}
              >
                Renewables latest {"<="} load issue
              </span>
            </div>
          </div>
          <div className="grid gap-3 xl:grid-cols-4">
            {COMPARE_COMPONENTS.map((component) =>
              compareRampingEnabled
                ? renderCompareRampChart(component)
                : renderCompareProfileChart(component),
            )}
          </div>
          {renderCompareDataTable()}
        </div>
      )}
    </SectionCard>
  );

  const renderMatrix = () => {
    const dates = explorerData?.forecastDates ?? [];
    const isSigned = viewMode === "change";

    return (
      <DataTableShell
        title="Net Load Forecast Explorer"
        subtitle={
          explorerData
            ? `${explorerData.sourceLabel} | ${visibleAreaCount} areas x ${dates.length} dates | ${statisticLabel(
                selectedStatistic,
              )} over complete component hours | ${
                viewMode === "change" ? `change vs ${selectedWindow.label}` : "latest issue"
              } | ${explorerData.formula}`
            : undefined
        }
        action={
          <ForecastHeatmapToggle
            enabled={tableHeatmapEnabled}
            onToggle={() => {
              startTransition(() => setTableHeatmapEnabled((enabled) => !enabled));
            }}
          />
        }
        bodyClassName="max-h-[72vh] overflow-auto"
      >
        <table className={FORECAST_EXPLORER_TABLE_CLASS}>
          <colgroup>
            <col className={FORECAST_EXPLORER_ROW_HEADER_COL_CLASS} />
            {dates.map((date) => (
              <col key={date} className={FORECAST_EXPLORER_DATE_COL_CLASS} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-30 bg-gray-950 text-gray-500">
            <tr>
              <th className="sticky left-0 top-0 z-40 bg-gray-950 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide shadow-[2px_0_0_rgba(31,41,55,0.9)]">
                Area / Component
              </th>
              {dates.map((date) => (
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
                    colSpan={dates.length + 1}
                    className="sticky left-0 z-20 bg-gray-950/90 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-sky-200 shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                  >
                    {group.label}
                  </td>
                </tr>
                {group.areas.flatMap((area) =>
                  COMPONENT_ROWS.map((component) => {
                    const rowValues = dates
                      .map((date) => {
                        const cell = explorerCellMap.get(`${area}|${date}`);
                        return cell
                          ? matrixValue(
                              cell,
                              component.key,
                              selectedStatistic,
                              viewMode,
                              changeWindow,
                            )
                          : null;
                      })
                      .filter((value): value is number => value !== null);
                    const rowMin = rowValues.length ? Math.min(...rowValues) : 0;
                    const rowMax = rowValues.length ? Math.max(...rowValues) : 0;
                    const rowBound = rowValues.length
                      ? Math.max(...rowValues.map((value) => Math.abs(value)))
                      : 0;

                    return (
                      <tr key={`${area}-${component.key}`} className="hover:bg-gray-900/60">
                        <td className="sticky left-0 z-20 bg-[#0d1119] px-2 py-1.5 font-medium text-gray-300 shadow-[2px_0_0_rgba(31,41,55,0.9)]">
                          <span className="text-gray-500">{area}</span>
                          <span className="mx-1 text-gray-700">/</span>
                          {component.label}
                        </td>
                        {dates.map((date) => {
                          const cell = explorerCellMap.get(`${area}|${date}`);
                          const value = cell
                            ? matrixValue(
                                cell,
                                component.key,
                                selectedStatistic,
                                viewMode,
                                changeWindow,
                              )
                            : null;
                          const isSelected =
                            selectedArea === area &&
                            selectedForecastDate === date &&
                            selectedComponent === component.key;
                          return (
                            <td
                              key={date}
                              className="px-1 py-1 text-right align-top tabular-nums text-gray-300"
                              style={
                                tableHeatmapEnabled
                                  ? isSigned
                                    ? deltaCellStyle(value, rowBound)
                                    : componentHeatCellStyle(
                                        value,
                                        rowMin,
                                        rowMax,
                                        component.key,
                                      )
                                  : undefined
                              }
                            >
                              <button
                                type="button"
                                disabled={!cell}
                                onClick={() => {
                                  if (!cell) return;
                                  startTransition(() => {
                                    setSelectedArea(cell.area);
                                    setSelectedForecastDate(date);
                                    setSelectedComponent(component.key);
                                  });
                                }}
                                className={`min-h-7 w-full rounded px-1.5 py-1 text-right text-[11px] transition-colors hover:bg-gray-950/50 disabled:cursor-default disabled:hover:bg-transparent ${
                                  isSelected ? "ring-1 ring-sky-300/80" : ""
                                }`}
                                title={
                                  cell
                                    ? `${cell.area} ${date} | ${component.label} ${statisticLabel(
                                        selectedStatistic,
                                      )} | ${cell.vintageCount} vintages | ${cell.completeHourCount}/24 complete hours | ${fmtDateTime(
                                        cell.latestEvaluatedAtEpt,
                                      )}`
                                    : undefined
                                }
                              >
                                {fmtMatrixValue(value, isSigned)}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  }),
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </DataTableShell>
    );
  };

  const renderDetailTable = () => (
    <DataTableShell
      title="Forecast Vintage Detail"
      subtitle={
        diffData
          ? `${diffData.sourceLabel} | ${diffData.area}: ${
              diffData.forecastDate
            } | ${componentLabel(selectedComponent)} snapshots and deltas`
          : undefined
      }
      action={
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {CHANGE_WINDOWS.map((window) => {
              const active = visibleDetailWindows.has(window.hours);
              return (
                <button
                  key={window.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDetailWindow(window.hours)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                    active
                      ? "border-sky-500/40 bg-sky-500/10 text-sky-100"
                      : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
                  }`}
                >
                  {window.label}
                  <span className="text-gray-500">
                    {detailWindowCounts.get(window.hours)?.toLocaleString() ?? "0"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {VINTAGE_ROW_TYPES.map((type) => {
              const active = visibleDetailRowTypes.has(type.key);
              return (
                <button
                  key={type.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDetailRowType(type.key)}
                  title={type.description}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                    active
                      ? "border-gray-600 bg-gray-800 text-gray-100"
                      : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-sm ${
                      type.key === "Snapshot" ? "bg-emerald-300" : "bg-sky-300"
                    }`}
                    aria-hidden="true"
                  />
                  {type.label}
                  <span className="text-gray-500">
                    {detailRowTypeCounts.get(type.key)?.toLocaleString() ?? "0"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      }
      bodyClassName="max-h-[64vh] overflow-auto"
    >
      <div className={forecastPopupMinWidthClass(DETAIL_METRIC_COUNT)}>
        <table className={FORECAST_POPUP_TABLE_CLASS}>
          <ForecastPopupColGroup metricCount={DETAIL_METRIC_COUNT} />
          <thead className="sticky top-0 z-30 bg-gray-950 text-gray-500">
            <tr>
              <th
                className={`sticky ${FORECAST_POPUP_PINNED_LEFT_CLASSES[0]} top-0 z-40 bg-gray-950 px-2 py-1.5 text-left font-semibold uppercase tracking-wide ${FORECAST_POPUP_PINNED_SHADOW}`}
              >
                Type
              </th>
              <th
                className={`sticky ${FORECAST_POPUP_PINNED_LEFT_CLASSES[1]} top-0 z-40 bg-gray-950 px-2 py-1.5 text-left font-semibold uppercase tracking-wide ${FORECAST_POPUP_PINNED_SHADOW}`}
              >
                Run
              </th>
              <th
                className={`sticky ${FORECAST_POPUP_PINNED_LEFT_CLASSES[2]} top-0 z-40 bg-gray-950 px-2 py-1.5 text-left font-semibold uppercase tracking-wide ${FORECAST_POPUP_PINNED_SHADOW}`}
              >
                Tag
              </th>
              <th className={`sticky top-0 z-30 bg-gray-950 px-2 py-1.5 text-right font-semibold uppercase tracking-wide ${forecastPopupMetricBorderClass(0)}`}>
                Peak
              </th>
              <th className={`sticky top-0 z-30 bg-gray-950 px-2 py-1.5 text-right font-semibold uppercase tracking-wide ${forecastPopupMetricBorderClass(1)}`}>
                OnPeak
              </th>
              <th className={`sticky top-0 z-30 bg-gray-950 px-2 py-1.5 text-right font-semibold uppercase tracking-wide ${forecastPopupMetricBorderClass(2)}`}>
                OffPeak
              </th>
              <th className={`sticky top-0 z-30 bg-gray-950 px-2 py-1.5 text-right font-semibold uppercase tracking-wide ${forecastPopupMetricBorderClass(3)}`}>
                Flat
              </th>
              {Array.from({ length: 24 }, (_, hour) => (
                <th
                  key={hour}
                  className={`sticky top-0 z-30 bg-gray-950 px-1.5 py-1.5 text-right font-semibold uppercase tracking-wide ${forecastPopupHourDividerClass(
                    hour,
                  )}`}
                >
                  HE{hour + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {visibleDetailRows.map((row, index) => {
              const selectedHourly = componentHourly(row, selectedComponent);
              const numericValues = selectedHourly.filter((value): value is number => value !== null);
              const min = numericValues.length ? Math.min(...numericValues) : 0;
              const max = numericValues.length ? Math.max(...numericValues) : 0;
              const bound = numericValues.length
                ? Math.max(...numericValues.map((value) => Math.abs(value)))
                : 0;
              const previousRow = visibleDetailRows[index - 1];
              const startsGroup = !previousRow || previousRow.rowType !== row.rowType;
              return (
                <Fragment key={row.tableKey}>
                  {startsGroup && (
                    <tr className="border-t border-gray-700 bg-gray-950/80">
                      <td
                        colSpan={DETAIL_COL_COUNT}
                        className="sticky left-0 z-20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-300"
                      >
                        {row.rowType} (
                        {detailRowTypeCounts.get(row.rowType)?.toLocaleString() ?? 0})
                      </td>
                    </tr>
                  )}
                  <tr className="hover:bg-gray-900/60">
                    <td
                      className={`sticky ${FORECAST_POPUP_PINNED_LEFT_CLASSES[0]} z-20 bg-[#0d1119] px-2 py-1.5 font-medium text-gray-300 ${FORECAST_POPUP_PINNED_SHADOW}`}
                    >
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                          row.isDelta
                            ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        }`}
                      >
                        {row.rowType}
                      </span>
                    </td>
                    <td
                      className={`sticky ${FORECAST_POPUP_PINNED_LEFT_CLASSES[1]} z-20 bg-[#0d1119] px-2 py-1.5 font-medium text-gray-300 ${FORECAST_POPUP_PINNED_SHADOW}`}
                    >
                      {fmtDateTime(row.evaluatedAtEpt)}
                    </td>
                    <td
                      className={`sticky ${FORECAST_POPUP_PINNED_LEFT_CLASSES[2]} z-20 bg-[#0d1119] px-2 py-1.5 text-gray-400 ${FORECAST_POPUP_PINNED_SHADOW}`}
                    >
                      {row.tag || "-"}
                    </td>
                    {(
                      [
                        componentStatisticValue(row, selectedComponent, "peak"),
                        componentStatisticValue(row, selectedComponent, "onPeak"),
                        componentStatisticValue(row, selectedComponent, "offPeak"),
                        componentStatisticValue(row, selectedComponent, "flat"),
                      ] as Array<number | null>
                    ).map((value, metricIndex) => (
                      <td
                        key={metricIndex}
                        className={`px-2 py-1.5 text-right tabular-nums ${forecastPopupMetricBorderClass(
                          metricIndex,
                        )}`}
                        style={row.isDelta ? deltaCellStyle(value, bound) : undefined}
                      >
                        {row.isDelta ? fmtSignedMw(value) : fmtMw(value)}
                      </td>
                    ))}
                    {selectedHourly.map((value, hour) => (
                      <td
                        key={hour}
                        className={`px-1.5 py-1.5 text-right tabular-nums text-gray-300 ${forecastPopupHourDividerClass(
                          hour,
                        )}`}
                        style={
                          row.isDelta
                            ? deltaCellStyle(value, bound)
                            : componentHeatCellStyle(value, min, max, selectedComponent)
                        }
                      >
                        {row.isDelta ? fmtSignedMw(value) : fmtMw(value)}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              );
            })}
            {!visibleDetailRows.length && (
              <tr>
                <td
                  colSpan={DETAIL_COL_COUNT}
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

  const renderModal = () => {
    if (!selectedForecastDate) return null;

    return (
      <div
        className="fixed inset-0 z-50 bg-black/70 p-1 sm:p-3"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            startTransition(() => setSelectedForecastDate(null));
          }
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="net-load-modal-title"
          className="mx-auto flex h-full w-full max-w-none flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#10131c] shadow-2xl shadow-black/50"
        >
          <div className="flex flex-col gap-3 border-b border-gray-800 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="net-load-modal-title" className="text-base font-semibold text-gray-100">
                {selectedArea} {componentLabel(selectedComponent)} Vintages
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {sourceLabel(sourceMode)} | {selectedArea} | {fmtDate(selectedForecastDate)} |
                matrix statistic {statisticLabel(selectedStatistic)} | {lookbackHours} hour
                lookback
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="block w-36">
                <span className="sr-only">Lookback</span>
                <select
                  value={lookbackHours}
                  onChange={(event) => {
                    const nextHours = Number(event.target.value);
                    startTransition(() => setLookbackHours(nextHours));
                  }}
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
                onClick={() => {
                  startTransition(() => setSelectedForecastDate(null));
                }}
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
                Loading {selectedArea} net load vintages...
              </div>
            )}
            {diffData && !diffLoading && (
              <>
                <PlotCard
                  title={`${componentLabel(selectedComponent)} Forecast Vintages`}
                  subtitle={`${diffData.sourceLabel} | ${diffData.area}: ${
                    diffData.forecastDate
                  } | as of ${fmtDateTime(diffData.asOf)}`}
                  series={lookbackSeries}
                  hiddenSeries={hiddenSeries}
                  onToggleSeries={toggleSeries}
                  onShowAll={() => {
                    startTransition(() => setHiddenSeries(new Set()));
                  }}
                  onHideAll={() =>
                    startTransition(() =>
                      setHiddenSeries(new Set(lookbackSeries.map((series) => series.key))),
                    )
                  }
                  focusedChildren={renderLookbackChart("h-[70vh]")}
                >
                  {renderLookbackChart("h-[360px]")}
                </PlotCard>
                {renderDetailTable()}
              </>
            )}
          </div>
        </section>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {!embedded && (
        <SectionCard title="Forecast View">
          <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <div>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Source
              </span>
              <div className="grid gap-2 md:grid-cols-2" role="tablist" aria-label="Forecast source">
                {FORECAST_SOURCE_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={sourceMode === tab.key}
                    onClick={() => {
                      if (sourceMode === tab.key) return;
                      setSourceMode(tab.key);
                    }}
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
            </div>

            <div>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                View
              </span>
              <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Net load view">
                {NET_LOAD_FORECAST_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    onClick={() => {
                      if (activeTab === tab.key) return;
                      setActiveTab(tab.key);
                      if (tab.key === "compareDay") {
                        startTransition(() => setSelectedForecastDate(null));
                      }
                    }}
                    className={`rounded-md border px-3 py-2 text-left transition-colors ${
                      activeTab === tab.key
                        ? "border-emerald-500/50 bg-emerald-500/10 text-white shadow-[inset_0_-2px_0_rgba(52,211,153,0.75)]"
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
            </div>
          </div>
        </SectionCard>
      )}

      {activeTab === "compareDay" ? (
        renderDateCompareSection()
      ) : (
        <>
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
                      aria-checked={viewMode === key}
                      onClick={() => {
                        if (viewMode === key) return;
                        startTransition(() => {
                          setViewMode(key as ViewMode);
                          if (key === "change") setLookbackHours(selectedWindow.hours);
                        });
                      }}
                      className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                        viewMode === key
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
                  Statistic
                </span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Statistic">
                  {STATISTICS.map((statistic) => (
                    <button
                      key={statistic.key}
                      type="button"
                      role="radio"
                      aria-checked={selectedStatistic === statistic.key}
                      onClick={() => {
                        if (selectedStatistic === statistic.key) return;
                        startTransition(() => setSelectedStatistic(statistic.key));
                      }}
                      className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                        selectedStatistic === statistic.key
                          ? "border-sky-500/50 bg-sky-500/10 text-white"
                          : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                      }`}
                    >
                      {statistic.label}
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
                        if (viewMode === "change" && changeWindow === window.key) return;
                        startTransition(() => {
                          setViewMode("change");
                          setChangeWindow(window.key);
                          setLookbackHours(changeWindowHours(window.key));
                        });
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
              Loading net load forecast explorer...
            </div>
          )}
          {explorerData && !explorerLoading && renderMatrix()}
          {renderModal()}
        </>
      )}
    </div>
  );
}
