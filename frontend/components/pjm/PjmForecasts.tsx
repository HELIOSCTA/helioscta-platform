"use client";

import type { CSSProperties, ReactNode } from "react";
import { Fragment, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ForecastControlGroup,
  ForecastFilterCard,
  ForecastHeatmapToggle,
  ForecastPopupColGroup,
  ForecastSegmentedControl,
  ForecastSelectControl,
  autoscaledYAxisDomain,
  compareDeltaCellStyle,
  compareLevelCellStyle,
  forecastPopupColCount,
  forecastPopupHourDividerClass,
  forecastPopupMetricBorderClass,
  forecastPopupMinWidthClass,
} from "@/components/pjm/forecastShared";
import PjmNetLoadForecast, {
  type ComponentKey as NetLoadComponentKey,
  type NetLoadChangeWindowKey,
  type PjmNetLoadForecastFreshnessSummary,
  type NetLoadForecastViewMode,
  type NetLoadForecastTab,
  type StatisticKey as NetLoadStatisticKey,
} from "@/components/pjm/PjmNetLoadForecast";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import {
  POWER_FORECAST_ISO_TABS,
  effectivePowerForecastSource,
  powerForecastIsoLabel,
  powerForecastSourceLabel,
  type PowerForecastIso,
  type PowerForecastSourceMode,
} from "@/lib/powerForecasts";

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
  iso: PowerForecastIso;
  isoLabel?: string;
  type?: ForecastType;
  area: string;
  areas: string[];
  forecastDate: string;
  forecastDates: string[];
  asOf: string | null;
  latestUpdate: string | null;
  source: string;
  sourceMode?: ForecastSourceMode;
  sourceLabel?: string;
  forecastTimeBasis?: string;
  issueTimeBasis?: string;
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
  iso: PowerForecastIso;
  isoLabel?: string;
  type?: "load";
  source: string;
  sourceMode?: ForecastSourceMode;
  sourceLabel?: string;
  forecastTimeBasis?: string;
  issueTimeBasis?: string;
  asOf: string | null;
  latestUpdate: string | null;
  areas: string[];
  forecastDates: string[];
  rowCount: number;
  cellCount: number;
  cells: ForecastExplorerCell[];
}

interface ForecastDateCompareHour {
  he: number;
  loadBaseMw: number | null;
  loadCompareMw: number | null;
  loadDeltaMw: number | null;
}

interface ForecastDateComparePayload {
  iso: PowerForecastIso;
  type: "load";
  area: string;
  baseDate: string;
  compareDate: string;
  baseIssue: string | null;
  compareIssue: string | null;
  sourceMode: ForecastSourceMode;
  sourceLabel: string;
  source: string;
  forecastTimeBasis?: string;
  issueTimeBasis?: string;
  completeHourCount: number;
  latestUpdate: string | null;
  rows: ForecastDateCompareHour[];
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
export type { PowerForecastIso };
export type ForecastSourceMode = PowerForecastSourceMode;
export type ForecastType = "load" | "netLoad";
export type ForecastMode = "outright" | "compareDay";
export type NetLoadForecastComponent = NetLoadComponentKey;
export type NetLoadForecastStatistic = NetLoadStatisticKey;
type ExplorerMetric =
  | "peakMw"
  | "onPeakAvg"
  | "offPeakAvg";
type ExplorerViewMode = "latest" | "change";
type ChangeWindowKey = "1h" | "12h" | "24h" | "48h" | "72h";
type CompareProfileMode = "levels" | "ramps";
type AreaGroupKey = "rto" | "west" | "midatl" | "south" | "other";
type CompareChartRow = Record<string, number | null>;
type CompareYAxisDomain = [number, number];

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
const EXPLORER_VIEW_OPTIONS: Array<{ value: ExplorerViewMode; label: string }> = [
  { value: "latest", label: "Latest" },
  { value: "change", label: "Change" },
];
const NET_LOAD_STATISTIC_OPTIONS: Array<{ value: NetLoadStatisticKey; label: string }> = [
  { value: "peak", label: "Peak" },
  { value: "onPeak", label: "OnPeak" },
  { value: "offPeak", label: "OffPeak" },
  { value: "flat", label: "Flat" },
];
const COMPARE_PROFILE_OPTIONS: Array<{ value: CompareProfileMode; label: string }> = [
  { value: "levels", label: "Levels" },
  { value: "ramps", label: "Ramps" },
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
  { key: "pjm", label: "PJM Data Miner", scope: "PJM only" },
  { key: "meteologica", label: "Meteologica", scope: "xTraders hourly forecasts" },
];
const FORECAST_TYPE_TABS: Array<{
  key: ForecastType;
  label: string;
  scope: string;
}> = [
  { key: "load", label: "Load", scope: "Load forecast" },
  { key: "netLoad", label: "Net Load", scope: "Load minus solar and wind" },
];
const FORECAST_MODE_TABS: Array<{
  key: ForecastMode;
  label: string;
  scope: string;
}> = [
  { key: "outright", label: "Outright", scope: "Explorer and vintages" },
  { key: "compareDay", label: "Compare Day", scope: "A/B forecast dates" },
];
const FORECAST_PREFETCH_DELAY_MS = 1_500;
const FORECAST_PREFETCH_SOURCES: ForecastSourceMode[] = ["pjm", "meteologica"];
const POPUP_FORECAST_METRIC_COUNT = 3;
const POPUP_FORECAST_COL_COUNT = forecastPopupColCount(POPUP_FORECAST_METRIC_COUNT);
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

function fmtCompactMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const absValue = Math.abs(value);
  if (absValue >= 1000) return `${Math.round(value / 1000).toLocaleString()}k`;
  return Math.round(value).toLocaleString();
}

function sourceLabel(sourceMode: ForecastSourceMode): string {
  return powerForecastSourceLabel(sourceMode);
}

function buildExplorerApiUrl({
  iso,
  sourceMode,
  refresh,
}: {
  iso: PowerForecastIso;
  sourceMode: ForecastSourceMode;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({ iso, source: sourceMode, type: "load" });
  if (refresh) params.set("refresh", "1");
  return `/api/power-forecast-explorer?${params.toString()}`;
}

function buildExplorerCacheKey({
  iso,
  sourceMode,
}: {
  iso: PowerForecastIso;
  sourceMode: ForecastSourceMode;
}): string {
  return ["api:power-forecast-explorer", iso, sourceMode, "load"].join(":");
}

function buildNetLoadExplorerApiUrl({
  iso,
  sourceMode,
  refresh = false,
}: {
  iso: PowerForecastIso;
  sourceMode: ForecastSourceMode;
  refresh?: boolean;
}): string {
  const params = new URLSearchParams({ iso, source: sourceMode, type: "netLoad" });
  if (refresh) params.set("refresh", "1");
  return `/api/power-forecast-explorer?${params.toString()}`;
}

function buildNetLoadExplorerCacheKey({
  iso,
  sourceMode,
}: {
  iso: PowerForecastIso;
  sourceMode: ForecastSourceMode;
}): string {
  return ["api:power-forecast-explorer", iso, sourceMode, "netLoad"].join(":");
}

function buildDiffApiUrl({
  iso,
  sourceMode,
  area,
  forecastDate,
  lookbackHours,
  refresh,
}: {
  iso: PowerForecastIso;
  sourceMode: ForecastSourceMode;
  area: string;
  forecastDate: string;
  lookbackHours: number;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({ iso, source: sourceMode, type: "load", area, date: forecastDate });
  params.set("lookbackHours", String(lookbackHours));
  if (refresh) params.set("refresh", "1");
  return `/api/power-forecast-differences?${params.toString()}`;
}

function buildDiffCacheKey({
  iso,
  sourceMode,
  area,
  forecastDate,
  lookbackHours,
}: {
  iso: PowerForecastIso;
  sourceMode: ForecastSourceMode;
  area: string;
  forecastDate: string;
  lookbackHours: number;
}): string {
  return ["api:power-forecast-differences", iso, sourceMode, "load", area, forecastDate, lookbackHours].join(":");
}

function buildCompareApiUrl({
  iso,
  sourceMode,
  area,
  baseDate,
  compareDate,
  refresh,
}: {
  iso: PowerForecastIso;
  sourceMode: ForecastSourceMode;
  area: string;
  baseDate: string;
  compareDate: string;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({
    iso,
    source: sourceMode,
    type: "load",
    area,
    baseDate,
    compareDate,
  });
  if (refresh) params.set("refresh", "1");
  return `/api/power-forecast-date-compare?${params.toString()}`;
}

function buildCompareCacheKey({
  iso,
  sourceMode,
  area,
  baseDate,
  compareDate,
}: {
  iso: PowerForecastIso;
  sourceMode: ForecastSourceMode;
  area: string;
  baseDate: string;
  compareDate: string;
}): string {
  return ["api:power-forecast-date-compare", iso, sourceMode, "load", area, baseDate, compareDate].join(":");
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

function compareChartRows(rows: ForecastDateCompareHour[]): Array<Record<string, number | null>> {
  return rows.map((row, index) => {
    const previousRow = rows[index - 1];
    const baseRamp =
      row.loadBaseMw === null || previousRow === undefined || previousRow.loadBaseMw === null
        ? null
        : row.loadBaseMw - previousRow.loadBaseMw;
    const compareRamp =
      row.loadCompareMw === null ||
      previousRow === undefined ||
      previousRow.loadCompareMw === null
        ? null
        : row.loadCompareMw - previousRow.loadCompareMw;

    return {
      he: row.he,
      base: row.loadBaseMw,
      compare: row.loadCompareMw,
      delta: row.loadDeltaMw,
      baseRamp,
      compareRamp,
      rampDelta: baseRamp === null || compareRamp === null ? null : compareRamp - baseRamp,
    };
  });
}

function compareYAxisDomain({
  rows,
  keys,
  includeZero = false,
  minPadding = 250,
  clampNonNegative = false,
}: {
  rows: CompareChartRow[];
  keys: string[];
  includeZero?: boolean;
  minPadding?: number;
  clampNonNegative?: boolean;
}): CompareYAxisDomain | undefined {
  const values = rows.flatMap((row) =>
    keys
      .map((key) => row[key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
  );
  if (!values.length) return undefined;

  const domainValues = includeZero ? [...values, 0] : values;
  const min = Math.min(...domainValues);
  const max = Math.max(...domainValues);
  const range = max - min;
  const magnitude = Math.max(Math.abs(min), Math.abs(max), 1);
  const padding =
    range > 0 ? Math.max(range * 0.08, minPadding) : Math.max(magnitude * 0.02, minPadding);
  let lower = min - padding;
  let upper = max + padding;

  if (clampNonNegative && min >= 0 && lower < 0) lower = 0;
  if (includeZero) {
    lower = Math.min(lower, 0);
    upper = Math.max(upper, 0);
  }

  return [Math.floor(lower), Math.ceil(upper)];
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
  initialIso = "pjm",
  initialForecastType = "load",
  initialMode = "outright",
  initialSourceMode = "pjm",
  initialArea,
  initialDate,
  initialNetLoadComponent,
  initialNetLoadStatistic,
  refreshToken = 0,
  onFreshnessChange,
}: {
  initialView?: PjmForecastView;
  initialIso?: PowerForecastIso;
  initialForecastType?: ForecastType;
  initialMode?: ForecastMode;
  initialSourceMode?: ForecastSourceMode;
  initialArea?: string;
  initialDate?: string;
  initialNetLoadComponent?: NetLoadComponentKey;
  initialNetLoadStatistic?: NetLoadStatisticKey;
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmForecastsFreshnessSummary) => void;
  onViewChange?: (view: PjmForecastView) => void;
}) {
  const [forecastIso, setForecastIso] = useState<PowerForecastIso>(initialIso);
  const [forecastType, setForecastType] = useState<ForecastType>(initialForecastType);
  const [forecastMode, setForecastMode] = useState<ForecastMode>(initialMode);
  const [explorerViewMode, setExplorerViewMode] = useState<ExplorerViewMode>("latest");
  const [sourceMode, setSourceMode] = useState<ForecastSourceMode>(initialSourceMode);
  const [explorerMetric, setExplorerMetric] = useState<ExplorerMetric>("peakMw");
  const [changeWindow, setChangeWindow] = useState<ChangeWindowKey>("24h");
  const [netLoadViewMode, setNetLoadViewMode] = useState<NetLoadForecastViewMode>("latest");
  const [netLoadStatistic, setNetLoadStatistic] = useState<NetLoadStatisticKey>(
    initialNetLoadStatistic ?? "peak",
  );
  const [netLoadChangeWindow, setNetLoadChangeWindow] =
    useState<NetLoadChangeWindowKey>("24h");
  const [netLoadCompareBaseDate, setNetLoadCompareBaseDate] = useState<string | null>(null);
  const [netLoadCompareTargetDate, setNetLoadCompareTargetDate] = useState<string | null>(null);
  const [netLoadCompareRampingEnabled, setNetLoadCompareRampingEnabled] = useState(false);
  const [netLoadCompareDateOptions, setNetLoadCompareDateOptions] = useState<string[]>([]);
  const [netLoadControlFreshness, setNetLoadControlFreshness] =
    useState<PjmNetLoadForecastFreshnessSummary | null>(null);
  const [tableHeatmapEnabled, setTableHeatmapEnabled] = useState(true);
  const [explorerData, setExplorerData] = useState<PjmForecastExplorerPayload | null>(null);
  const [diffData, setDiffData] = useState<PjmForecastDifferencesPayload | null>(null);
  const [compareDataByArea, setCompareDataByArea] = useState<Record<string, ForecastDateComparePayload>>({});
  const [explorerLoading, setExplorerLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [selectedExplorerCell, setSelectedExplorerCell] = useState<{
    area: string;
    forecastDate: string;
  } | null>(() =>
    initialForecastType === "load" && initialMode === "outright" && initialArea && initialDate
      ? { area: initialArea, forecastDate: initialDate }
      : null,
  );
  const activeSourceMode = effectivePowerForecastSource(forecastIso, sourceMode);
  const selectedIsoLabel = powerForecastIsoLabel(forecastIso);
  const previousForecastSourceKey = useRef(`${forecastIso}|${activeSourceMode}`);
  const [compareBaseDate, setCompareBaseDate] = useState<string | null>(null);
  const [compareTargetDate, setCompareTargetDate] = useState<string | null>(null);
  const [compareRampingEnabled, setCompareRampingEnabled] = useState(false);
  const [focusedLoadCompareArea, setFocusedLoadCompareArea] = useState<string | null>(null);
  const [collapsedCompareCards, setCollapsedCompareCards] = useState<Set<string>>(() => new Set());
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

  const selectNetLoadChangeWindow = (windowKey: NetLoadChangeWindowKey) => {
    setNetLoadViewMode("change");
    setNetLoadChangeWindow(windowKey);
  };

  useEffect(() => {
    if (forecastType !== "netLoad") setNetLoadCompareDateOptions([]);
  }, [forecastType]);

  useEffect(() => {
    const nextKey = `${forecastIso}|${activeSourceMode}`;
    if (previousForecastSourceKey.current === nextKey) return;
    previousForecastSourceKey.current = nextKey;
    setSelectedExplorerCell(null);
    setDiffData(null);
    setDiffError(null);
    setCompareDataByArea({});
    setCompareError(null);
    setCompareRampingEnabled(false);
    setFocusedLoadCompareArea(null);
    setCollapsedCompareCards(new Set());
    setCompareBaseDate(null);
    setCompareTargetDate(null);
    setNetLoadControlFreshness(null);
  }, [activeSourceMode, forecastIso]);

  useEffect(() => {
    if (forecastType !== "load" || forecastMode !== "compareDay") {
      setFocusedLoadCompareArea(null);
    }
  }, [forecastMode, forecastType]);

  useEffect(() => {
    if (focusedLoadCompareArea && !compareDataByArea[focusedLoadCompareArea]) {
      setFocusedLoadCompareArea(null);
    }
  }, [compareDataByArea, focusedLoadCompareArea]);

  useEffect(() => {
    if (!focusedLoadCompareArea) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusedLoadCompareArea(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focusedLoadCompareArea]);

  useEffect(() => {
    if (refreshToken > 0) return;
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      const prefetchSources =
        forecastIso === "pjm" ? FORECAST_PREFETCH_SOURCES : (["meteologica"] as ForecastSourceMode[]);
      const requests = prefetchSources.flatMap((prefetchSource) => [
        fetchJsonWithCache<unknown>({
          key: buildExplorerCacheKey({ iso: forecastIso, sourceMode: prefetchSource }),
          url: buildExplorerApiUrl({ iso: forecastIso, sourceMode: prefetchSource, refresh: false }),
          ttlMs: API_CACHE_TTL_MS,
        }),
        fetchJsonWithCache<unknown>({
          key: buildNetLoadExplorerCacheKey({ iso: forecastIso, sourceMode: prefetchSource }),
          url: buildNetLoadExplorerApiUrl({ iso: forecastIso, sourceMode: prefetchSource }),
          ttlMs: API_CACHE_TTL_MS,
        }),
      ]);
      void Promise.allSettled(requests);
    }, FORECAST_PREFETCH_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [forecastIso, refreshToken]);

  useEffect(() => {
    if (!explorerData || forecastType !== "load") return;

    const dates = explorerData.forecastDates ?? [];
    setCompareBaseDate((current) => (current && dates.includes(current) ? current : dates[0] ?? null));
    setCompareTargetDate((current) =>
      current && dates.includes(current) ? current : dates[1] ?? dates[0] ?? null,
    );
  }, [explorerData, forecastType]);

  useEffect(() => {
    const compareAreas = explorerData?.areas ?? [];
    if (
      forecastType !== "load" ||
      forecastMode !== "compareDay" ||
      !compareBaseDate ||
      !compareTargetDate ||
      !compareAreas.length
    ) {
      setCompareLoading(false);
      setCompareDataByArea({});
      return;
    }

    let active = true;
    const areas = [...compareAreas];
    setCompareLoading(true);
    setCompareError(null);

    Promise.allSettled(
      areas.map((area) =>
        fetchJsonWithCache<ForecastDateComparePayload>({
          key: buildCompareCacheKey({
            iso: forecastIso,
            sourceMode: activeSourceMode,
            area,
            baseDate: compareBaseDate,
            compareDate: compareTargetDate,
          }),
          url: buildCompareApiUrl({
            iso: forecastIso,
            sourceMode: activeSourceMode,
            area,
            baseDate: compareBaseDate,
            compareDate: compareTargetDate,
            refresh: refreshToken > 0,
          }),
          ttlMs: API_CACHE_TTL_MS,
          cacheMode: refreshToken > 0 ? "no-store" : "default",
          forceRefresh: refreshToken > 0,
        }),
      ),
    )
      .then((results) => {
        if (!active) return;
        const nextData: Record<string, ForecastDateComparePayload> = {};
        const failures: string[] = [];
        results.forEach((result, index) => {
          const area = areas[index] ?? "Unknown";
          if (result.status === "fulfilled") {
            nextData[area] = result.value;
          } else {
            const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
            failures.push(`${area}: ${reason}`);
          }
        });

        setCompareDataByArea(nextData);
        if (failures.length) {
          setCompareError(
            `Some regions failed to load: ${failures.slice(0, 3).join("; ")}${
              failures.length > 3 ? "..." : ""
            }`,
          );
        }
      })
      .catch((err: Error) => {
        if (!active) return;
        setCompareError(err.message || `Failed to load ${sourceLabel(activeSourceMode)} load date comparison`);
        setCompareDataByArea({});
      })
      .finally(() => {
        if (active) setCompareLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    compareBaseDate,
    compareTargetDate,
    explorerData,
    forecastMode,
    forecastType,
    refreshToken,
    activeSourceMode,
    forecastIso,
  ]);

  useEffect(() => {
    if (forecastType !== "load") {
      setExplorerLoading(false);
      setExplorerError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setExplorerLoading(true);
    setExplorerError(null);

    fetchJsonWithCache<PjmForecastExplorerPayload>({
      key: buildExplorerCacheKey({ iso: forecastIso, sourceMode: activeSourceMode }),
      url: buildExplorerApiUrl({ iso: forecastIso, sourceMode: activeSourceMode, refresh: refreshToken > 0 }),
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
          summary: `${payload.isoLabel ?? selectedIsoLabel} | ${sourceLabel(activeSourceMode)} | ${payload.cellCount.toLocaleString()} cells | ${payload.rowCount.toLocaleString()} summaries`,
          targetDateLabel: `${payload.areas.length} load areas`,
          latestDateLabel: fmtDate(payload.forecastDates.at(-1)),
          latestUpdateLabel: fmtDateTime(payload.asOf),
        });
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setExplorerError(err.message || `Failed to load ${sourceLabel(activeSourceMode)} forecast explorer`);
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
  }, [activeSourceMode, forecastIso, forecastType, onFreshnessChange, refreshToken, selectedIsoLabel]);

  useEffect(() => {
    if (forecastType !== "load" || forecastMode !== "outright" || !selectedExplorerCell) return;

    const controller = new AbortController();
    let active = true;
    setDiffLoading(true);
    setDiffError(null);

    fetchJsonWithCache<PjmForecastDifferencesPayload>({
      key: buildDiffCacheKey({
        iso: forecastIso,
        sourceMode: activeSourceMode,
        area: selectedExplorerCell.area,
        forecastDate: selectedExplorerCell.forecastDate,
        lookbackHours,
      }),
      url: buildDiffApiUrl({
        iso: forecastIso,
        sourceMode: activeSourceMode,
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
        setDiffError(err.message || `Failed to load ${sourceLabel(activeSourceMode)} forecast differences`);
        setDiffData(null);
      })
      .finally(() => {
        if (active) setDiffLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [activeSourceMode, forecastIso, forecastMode, forecastType, lookbackHours, refreshToken, selectedExplorerCell]);

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
  const visibleAreas = useMemo(
    () => visibleAreaGroups.flatMap((group) => group.areas),
    [visibleAreaGroups],
  );
  const visibleAreaCount = visibleAreaGroups.reduce((count, group) => count + group.areas.length, 0);

  useEffect(() => {
    const visibleAreaSet = new Set(visibleAreas);
    setCollapsedCompareCards((current) => {
      const next = new Set<string>();
      current.forEach((area) => {
        if (visibleAreaSet.has(area)) next.add(area);
      });
      return next.size === current.size ? current : next;
    });
  }, [visibleAreas]);

  const toggleCompareCard = useCallback((area: string) => {
    startTransition(() => {
      setCollapsedCompareCards((current) => {
        const next = new Set(current);
        if (next.has(area)) next.delete(area);
        else next.add(area);
        return next;
      });
    });
  }, []);

  const expandAllCompareCards = useCallback(() => {
    startTransition(() => setCollapsedCompareCards(new Set()));
  }, []);

  const collapseAllCompareCards = useCallback(() => {
    startTransition(() => setCollapsedCompareCards(new Set(visibleAreas)));
  }, [visibleAreas]);

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
  const compareDateOptions = explorerData?.forecastDates ?? [];
  const compareDataList = visibleAreas
    .map((area) => compareDataByArea[area])
    .filter((payload): payload is ForecastDateComparePayload => Boolean(payload));
  const compareLatestUpdate = compareDataList
    .map((payload) => payload.latestUpdate)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const compareBaseDateLabel = fmtDate(compareBaseDate);
  const compareTargetDateLabel = fmtDate(compareTargetDate);
  const compareValueKey = compareRampingEnabled ? "baseRamp" : "base";
  const compareTargetValueKey = compareRampingEnabled ? "compareRamp" : "compare";
  const compareDeltaValueKey = compareRampingEnabled ? "rampDelta" : "delta";
  const forecastHourBasis = activeSourceMode === "meteologica" ? "source-local hours" : "PJM/EPT hours";
  const issueBasis = activeSourceMode === "meteologica" ? "UTC issues" : "PJM/EPT issues";
  const loadCompareSubtitle = `${selectedIsoLabel} | ${sourceLabel(activeSourceMode)} | ${compareDataList.length}/${
    visibleAreaCount || visibleAreas.length
  } regions loaded | ${compareBaseDateLabel} vs ${compareTargetDateLabel} | ${forecastHourBasis}`;

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
  }) => {
    const visibleKeys = chartSeries
      .filter((item) => !hiddenSeries.has(item.key))
      .map((item) => item.key);
    const yAxisDomain = autoscaledYAxisDomain({ rows, keys: visibleKeys });

    return (
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
              domain={yAxisDomain}
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
  };

  const renderLookbackChart = (heightClass: string) =>
    renderCurveChart({
      heightClass,
      rows: lookbackChartRows,
      chartSeries: lookbackSeries,
      curves: lookbackRows,
      hiddenSeries: hiddenLookbackSeries,
    });

  const renderLoadCompareChart = (
    payload: ForecastDateComparePayload,
    loadCompareRows: CompareChartRow[],
    options: { heightClass?: string; showFocusButton?: boolean } = {},
  ) => {
    const heightClass = options.heightClass ?? "h-[300px]";
    const showFocusButton = options.showFocusButton ?? true;
    const yAxisDomain = compareRampingEnabled
      ? compareYAxisDomain({
          rows: loadCompareRows,
          keys: ["baseRamp", "compareRamp"],
          includeZero: true,
          minPadding: 100,
        })
      : compareYAxisDomain({
          rows: loadCompareRows,
          keys: ["base", "compare"],
          clampNonNegative: true,
        });

    return (
      <div className="rounded-lg border border-gray-800 bg-[#0d1119] p-3">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <h3 className="text-base font-semibold text-gray-100">{payload.area}</h3>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-gray-400">
            <span className="rounded-md border border-gray-800 bg-gray-950/50 px-2 py-1">
              {compareBaseDateLabel} issue: {fmtDateTime(payload.baseIssue)}
            </span>
            <span className="rounded-md border border-gray-800 bg-gray-950/50 px-2 py-1">
              {compareTargetDateLabel} issue: {fmtDateTime(payload.compareIssue)}
            </span>
            {showFocusButton && (
              <button
                type="button"
                onClick={() => setFocusedLoadCompareArea(payload.area)}
                className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                aria-label={`Focus ${payload.area} compare-day chart`}
              >
                Focus
              </button>
            )}
          </div>
        </div>
        <div className={heightClass}>
          <ResponsiveContainer width="100%" height="100%">
            {compareRampingEnabled ? (
              <BarChart
                data={loadCompareRows}
                margin={{ top: 8, right: 20, bottom: 18, left: 8 }}
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
                domain={yAxisDomain}
                tick={{ fill: "#d1d5db", fontSize: 10 }}
                tickFormatter={(value) => fmtCompactMw(Number(value))}
                width={62}
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
                formatter={(value, name) => [fmtSignedMw(Number(value)), String(name)]}
              />
              <Bar dataKey="baseRamp" name={compareBaseDateLabel} fill="#60a5fa" isAnimationActive={false} />
              <Bar dataKey="compareRamp" name={compareTargetDateLabel} fill="#fb923c" isAnimationActive={false} />
            </BarChart>
          ) : (
            <LineChart data={loadCompareRows} margin={{ top: 8, right: 20, bottom: 18, left: 8 }}>
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
                domain={yAxisDomain}
                tick={{ fill: "#d1d5db", fontSize: 10 }}
                tickFormatter={(value) => fmtCompactMw(Number(value))}
                width={62}
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
                formatter={(value, name) => [fmtMw(Number(value)), String(name)]}
              />
              <Line
                type="monotone"
                dataKey="base"
                name={compareBaseDateLabel}
                stroke="#60a5fa"
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="compare"
                name={compareTargetDateLabel}
                stroke="#fb923c"
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
  };

  const renderLoadCompareTable = (loadCompareRows: Array<Record<string, number | null>>) => {
    const valueFormatter = compareRampingEnabled ? fmtSignedMw : fmtMw;
    const loadCompareValueStats = (valueKey: string) => {
      const values = loadCompareRows
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
    const seriesRows = [
      {
        key: "base",
        label: compareBaseDateLabel,
        valueKey: compareValueKey,
        formatter: valueFormatter,
        swatch: "#60a5fa",
        isDelta: false,
        tone: "base" as const,
      },
      {
        key: "compare",
        label: compareTargetDateLabel,
        valueKey: compareTargetValueKey,
        formatter: valueFormatter,
        swatch: "#fb923c",
        isDelta: false,
        tone: "compare" as const,
      },
      {
        key: "delta",
        label: "Delta",
        valueKey: compareDeltaValueKey,
        formatter: fmtSignedMw,
        swatch: "#94a3b8",
        isDelta: true,
        tone: "base" as const,
      },
    ].map((series) => ({
      ...series,
      ...loadCompareValueStats(series.valueKey),
    }));

    return (
      <div className="rounded-md border border-gray-800 bg-gray-950/30">
        <div className="border-b border-gray-800 px-3 py-2">
          <h3 className="text-sm font-semibold text-gray-100">Compare Day Data</h3>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {compareRampingEnabled ? "Hourly ramps" : "Hourly levels"} | {compareRampingEnabled ? "MW/hr" : "MW"}
          </p>
        </div>
        <div className="max-h-[48vh] overflow-auto">
          <table className="w-full min-w-[1520px] table-fixed border-separate border-spacing-0 text-[11px]">
            <colgroup>
              <col className="w-[128px]" />
              {Array.from({ length: 24 }, (_, hour) => (
                <col key={hour} className="w-[58px]" />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-20 bg-gray-950 text-gray-500">
              <tr>
                <th className="sticky left-0 z-30 border-r border-gray-700 bg-gray-950 px-2 py-1.5 text-left font-semibold uppercase tracking-wide shadow-[2px_0_0_rgba(31,41,55,0.9)]">
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
              {seriesRows.map((series, seriesIndex) => (
                <tr key={series.key} className="hover:bg-gray-900/60">
                  <td
                    className={`sticky left-0 z-10 border-r border-gray-700 bg-[#0d1119] px-2 py-1.5 font-medium shadow-[2px_0_0_rgba(31,41,55,0.9)] ${
                      seriesIndex === 0 ? "border-t border-gray-600" : "border-t border-gray-800"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: series.swatch }} aria-hidden="true" />
                      <span className={series.isDelta ? "text-sky-200" : "text-gray-300"}>
                        {series.label}
                      </span>
                    </span>
                  </td>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const value = loadCompareRows[hour]?.[series.valueKey] ?? null;
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderFocusedLoadCompareChart = () => {
    const payload = focusedLoadCompareArea ? compareDataByArea[focusedLoadCompareArea] : null;
    if (!payload) return null;

    const rows = compareChartRows(payload.rows);

    return (
      <div
        className="fixed inset-0 z-50 bg-black/75 p-2 sm:p-4"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setFocusedLoadCompareArea(null);
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="load-compare-focus-title"
          className="mx-auto flex h-full max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl shadow-black/50"
        >
          <div className="flex flex-col gap-3 border-b border-gray-800 p-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 id="load-compare-focus-title" className="text-sm font-semibold text-gray-100">
                {payload.area} Compare Day
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {compareRampingEnabled ? "Hourly ramps" : "Hourly levels"} | {compareBaseDateLabel} vs{" "}
                {compareTargetDateLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFocusedLoadCompareArea(null)}
              className="self-start rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
            {renderLoadCompareChart(payload, rows, {
              heightClass: "h-[70vh]",
              showFocusButton: false,
            })}
          </div>
        </section>
      </div>
    );
  };

  const renderLoadCompareSection = () => {
    const compareCardControlClass =
      "rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-100";

    return (
      <SectionCard title="Forecast Date Compare" subtitle={loadCompareSubtitle}>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-gray-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-[#60a5fa]" />
            {compareBaseDateLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-[#fb923c]" />
            {compareTargetDateLabel}
          </span>
          {compareLatestUpdate && (
            <span className="text-gray-500">Updated {fmtDateTime(compareLatestUpdate)}</span>
          )}
          <button type="button" onClick={expandAllCompareCards} className={compareCardControlClass}>
            Expand all
          </button>
          <button type="button" onClick={collapseAllCompareCards} className={compareCardControlClass}>
            Collapse all
          </button>
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
        {!compareLoading && compareDataList.length === 0 && !compareError && (
          <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-6 text-sm text-gray-500">
            No complete date comparison regions are available for these dates.
          </div>
        )}
        {!compareLoading && compareDataList.length > 0 && (
          <div className="space-y-3">
            {visibleAreaGroups.flatMap((group) =>
              group.areas.map((area) => {
                const payload = compareDataByArea[area];
                if (!payload) return null;
                const open = !collapsedCompareCards.has(area);
                const rows = compareChartRows(payload.rows);

                return (
                  <DataTableShell
                    key={area}
                    title={area}
                    subtitle={`${group.label} | ${payload.completeHourCount}/24 complete hours | ${
                      open ? "expanded" : "collapsed"
                    }`}
                    action={
                      <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-xs font-semibold text-gray-300">
                        Updated {fmtDateTime(payload.latestUpdate)}
                      </span>
                    }
                    collapsible
                    open={open}
                    onToggle={() => toggleCompareCard(area)}
                    bodyClassName="bg-[#0d1119] p-3"
                  >
                    <div className="space-y-3">
                      {renderLoadCompareChart(payload, rows)}
                      {renderLoadCompareTable(rows)}
                    </div>
                  </DataTableShell>
                );
              }),
            )}
          </div>
        )}
      </SectionCard>
    );
  };

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
      <div className={forecastPopupMinWidthClass(POPUP_FORECAST_METRIC_COUNT)}>
        <table className={FORECAST_POPUP_TABLE_CLASS}>
          <ForecastPopupColGroup metricCount={POPUP_FORECAST_METRIC_COUNT} />
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
                      className={`sticky ${FORECAST_POPUP_PINNED_LEFT_CLASSES[0]} z-20 bg-[#0d1119] px-2 py-1.5 font-medium text-gray-300 ${FORECAST_POPUP_PINNED_SHADOW}`}
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
                      className={`sticky ${FORECAST_POPUP_PINNED_LEFT_CLASSES[1]} z-20 bg-[#0d1119] px-2 py-1.5 font-medium text-gray-300 ${FORECAST_POPUP_PINNED_SHADOW}`}
                    >
                      {fmtDateTime(row.evaluatedAtEpt)}
                    </td>
                    <td
                      className={`sticky ${FORECAST_POPUP_PINNED_LEFT_CLASSES[2]} z-20 bg-[#0d1119] px-2 py-1.5 text-gray-400 ${FORECAST_POPUP_PINNED_SHADOW}`}
                    >
                      {row.tag || "-"}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right tabular-nums ${forecastPopupMetricBorderClass(0)}`}
                      style={isDelta ? deltaCellStyle(row.peak, diffBound) : undefined}
                    >
                      {isDelta && row.peak !== null && row.peak > 0 ? "+" : ""}
                      {fmtMw(row.peak)}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right tabular-nums ${forecastPopupMetricBorderClass(1)}`}
                      style={isDelta ? deltaCellStyle(row.onPeak, diffBound) : undefined}
                    >
                      {isDelta && row.onPeak !== null && row.onPeak > 0 ? "+" : ""}
                      {fmtMw(row.onPeak)}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right tabular-nums ${forecastPopupMetricBorderClass(2)}`}
                      style={isDelta ? deltaCellStyle(row.offPeak, diffBound) : undefined}
                    >
                      {isDelta && row.offPeak !== null && row.offPeak > 0 ? "+" : ""}
                      {fmtMw(row.offPeak)}
                    </td>
                    {row.hourly.map((value, hour) => (
                      <td
                        key={hour}
                        className={`px-1.5 py-1.5 text-right tabular-nums text-gray-300 ${forecastPopupHourDividerClass(
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
            ? `${selectedIsoLabel} | ${sourceLabel(activeSourceMode)} | ${visibleAreaCount} areas x ${datesToRender.length} dates | ${selectedMetric.label} | ${
                explorerViewMode === "change" ? `change vs ${selectedWindow.label}` : "latest"
              } | ${forecastHourBasis} | row heatmap`
            : undefined
        }
        action={
          <ForecastHeatmapToggle
            enabled={tableHeatmapEnabled}
            onToggle={() => setTableHeatmapEnabled((enabled) => !enabled)}
          />
        }
      >
        <table className={FORECAST_EXPLORER_TABLE_CLASS}>
          <colgroup>
            <col className={FORECAST_EXPLORER_ROW_HEADER_COL_CLASS} />
            {datesToRender.map((date) => (
              <col key={date} className={FORECAST_EXPLORER_DATE_COL_CLASS} />
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
                {lookbackHours} hour lookback | {issueBasis}
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
                  subtitle={`${diffData.area}: ${diffData.forecastDate} | ${issueBasis} ${fmtDateTime(
                    diffData.asOf,
                  )} | ${forecastHourBasis}`}
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

  const handleNetLoadFreshnessChange = useCallback((freshness: PjmNetLoadForecastFreshnessSummary) => {
    setNetLoadControlFreshness(freshness);
    onFreshnessChange?.({
      status: freshness.status,
      statusClass: freshness.statusClass,
      summary: `Net Load | ${freshness.summary}`,
      targetDateLabel: freshness.targetDateLabel,
      latestDateLabel: freshness.latestDateLabel,
      latestUpdateLabel: freshness.latestUpdateLabel,
    });
  }, [onFreshnessChange]);

  const sourceFilterLabel =
    FORECAST_SOURCE_TABS.find((tab) => tab.key === activeSourceMode)?.label ?? activeSourceMode;
  const forecastTypeFilterLabel =
    FORECAST_TYPE_TABS.find((tab) => tab.key === forecastType)?.label ?? forecastType;
  const forecastModeFilterLabel =
    FORECAST_MODE_TABS.find((tab) => tab.key === forecastMode)?.label ?? forecastMode;
  const filterSummary = `${selectedIsoLabel} / ${sourceFilterLabel} / ${forecastTypeFilterLabel} / ${forecastModeFilterLabel}`;
  const isoOptions = POWER_FORECAST_ISO_TABS.map((tab) => ({
    value: tab.key,
    label: tab.label,
    title: tab.scope,
  }));
  const sourceOptions = FORECAST_SOURCE_TABS.filter(
    (tab) => forecastIso === "pjm" || tab.key === "meteologica",
  ).map((tab) => ({
    value: tab.key,
    label: tab.label,
    title: tab.scope,
  }));
  const forecastTypeOptions = FORECAST_TYPE_TABS.map((tab) => ({
    value: tab.key,
    label: tab.label,
    title: tab.scope,
  }));
  const forecastModeOptions = FORECAST_MODE_TABS.map((tab) => ({
    value: tab.key,
    label: tab.label,
    title: tab.scope,
  }));
  const explorerMetricOptions = EXPLORER_METRICS.map((metric) => ({
    value: metric.key,
    label: metric.label,
  }));
  const changeWindowOptions = CHANGE_WINDOWS.map((window) => ({
    value: window.key,
    label: window.label,
  }));
  const compareProfileMode: CompareProfileMode = compareRampingEnabled ? "ramps" : "levels";
  const netLoadCompareProfileMode: CompareProfileMode = netLoadCompareRampingEnabled
    ? "ramps"
    : "levels";
  const loadAreaDenominator = visibleAreaCount || visibleAreas.length;
  const netLoadLatestUpdateLabel = netLoadControlFreshness?.latestUpdateLabel;
  const netLoadAreaLabel = netLoadControlFreshness?.targetDateLabel;
  const controlLatestIssueLabel =
    forecastType === "netLoad"
      ? netLoadLatestUpdateLabel &&
        netLoadLatestUpdateLabel !== "--" &&
        netLoadLatestUpdateLabel !== "-"
        ? netLoadLatestUpdateLabel
        : null
      : forecastMode === "compareDay"
        ? compareLatestUpdate
          ? fmtDateTime(compareLatestUpdate)
          : null
        : explorerData?.asOf
          ? fmtDateTime(explorerData.asOf)
          : explorerData?.latestUpdate
            ? fmtDateTime(explorerData.latestUpdate)
            : null;
  const controlAreaLabel =
    forecastType === "netLoad"
      ? netLoadAreaLabel && netLoadAreaLabel !== "--" && netLoadAreaLabel !== "-"
        ? `${netLoadAreaLabel} loaded`
        : null
      : forecastMode === "compareDay"
        ? loadAreaDenominator
          ? `${compareDataList.length}/${loadAreaDenominator} areas loaded`
          : null
        : explorerData
          ? `${visibleAreaCount || explorerData.areas.length} areas loaded`
          : null;
  const controlFooterItems = [
    controlLatestIssueLabel ? `As of ${controlLatestIssueLabel}` : null,
    controlAreaLabel,
    forecastHourBasis,
  ].filter((item): item is string => Boolean(item));

  const renderForecastFilterCard = () => (
    <ForecastFilterCard summary={filterSummary}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            Scope
          </span>
          <span className="h-px flex-1 bg-gray-800" />
        </div>
        <ForecastControlGroup label="ISO">
          <ForecastSegmentedControl
            options={isoOptions}
            value={forecastIso}
            onChange={(nextIso) => {
              startTransition(() => {
                setForecastIso(nextIso);
                if (nextIso !== "pjm") setSourceMode("meteologica");
                setSelectedExplorerCell(null);
              });
            }}
            ariaLabel="Forecast ISO"
          />
        </ForecastControlGroup>

        <div className="flex flex-wrap items-center gap-2">
          {forecastIso === "pjm" && (
            <ForecastControlGroup label="Source">
              <ForecastSegmentedControl
                options={sourceOptions}
                value={activeSourceMode}
                onChange={(nextSourceMode) => {
                  startTransition(() => setSourceMode(nextSourceMode));
                }}
                ariaLabel="Forecast source"
              />
            </ForecastControlGroup>
          )}
          <ForecastControlGroup label="Type">
            <ForecastSegmentedControl
              options={forecastTypeOptions}
              value={forecastType}
              onChange={(nextForecastType) => {
                startTransition(() => {
                  setForecastType(nextForecastType);
                  setSelectedExplorerCell(null);
                });
              }}
              ariaLabel="Forecast type"
            />
          </ForecastControlGroup>
        </div>
      </div>

      <div className="space-y-2 border-t border-gray-800 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            Analysis
          </span>
          <span className="h-px flex-1 bg-gray-800" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ForecastControlGroup label="View">
            <ForecastSegmentedControl
              options={forecastModeOptions}
              value={forecastMode}
              onChange={(nextForecastMode) => {
                startTransition(() => {
                  setForecastMode(nextForecastMode);
                  if (nextForecastMode === "compareDay") setSelectedExplorerCell(null);
                });
              }}
              ariaLabel="Forecast view"
            />
          </ForecastControlGroup>

          {forecastMode === "compareDay" ? (
            <>
              <ForecastSelectControl
                label="Date A"
                value={
                  forecastType === "netLoad"
                    ? netLoadCompareBaseDate ?? ""
                    : compareBaseDate ?? ""
                }
                options={forecastType === "netLoad" ? netLoadCompareDateOptions : compareDateOptions}
                disabled={
                  forecastType === "netLoad"
                    ? !netLoadCompareDateOptions.length
                    : !compareDateOptions.length
                }
                onChange={(nextDate) => {
                  const value = nextDate || null;
                  if (forecastType === "netLoad") setNetLoadCompareBaseDate(value);
                  else startTransition(() => setCompareBaseDate(value));
                }}
              />
              <ForecastSelectControl
                label="Date B"
                value={
                  forecastType === "netLoad"
                    ? netLoadCompareTargetDate ?? ""
                    : compareTargetDate ?? ""
                }
                options={forecastType === "netLoad" ? netLoadCompareDateOptions : compareDateOptions}
                disabled={
                  forecastType === "netLoad"
                    ? !netLoadCompareDateOptions.length
                    : !compareDateOptions.length
                }
                onChange={(nextDate) => {
                  const value = nextDate || null;
                  if (forecastType === "netLoad") setNetLoadCompareTargetDate(value);
                  else startTransition(() => setCompareTargetDate(value));
                }}
              />
              <ForecastControlGroup label="Profile">
                <ForecastSegmentedControl
                  options={COMPARE_PROFILE_OPTIONS}
                  value={forecastType === "netLoad" ? netLoadCompareProfileMode : compareProfileMode}
                  onChange={(nextProfileMode) => {
                    const enabled = nextProfileMode === "ramps";
                    if (forecastType === "netLoad") setNetLoadCompareRampingEnabled(enabled);
                    else startTransition(() => setCompareRampingEnabled(enabled));
                  }}
                  ariaLabel="Compare profile"
                />
              </ForecastControlGroup>
            </>
          ) : forecastType === "netLoad" ? (
            <>
              <ForecastControlGroup label="Mode">
                <ForecastSegmentedControl
                  options={EXPLORER_VIEW_OPTIONS}
                  value={netLoadViewMode}
                  onChange={setNetLoadViewMode}
                  ariaLabel="Net load explorer view"
                />
              </ForecastControlGroup>
              <ForecastControlGroup label="Statistic">
                <ForecastSegmentedControl
                  options={NET_LOAD_STATISTIC_OPTIONS}
                  value={netLoadStatistic}
                  onChange={setNetLoadStatistic}
                  ariaLabel="Net load statistic"
                />
              </ForecastControlGroup>
              {netLoadViewMode === "change" && (
                <ForecastControlGroup label="Window">
                  <ForecastSegmentedControl
                    options={changeWindowOptions}
                    value={netLoadChangeWindow}
                    onChange={selectNetLoadChangeWindow}
                    ariaLabel="Net load change window"
                  />
                </ForecastControlGroup>
              )}
            </>
          ) : (
            <>
              <ForecastControlGroup label="Mode">
                <ForecastSegmentedControl
                  options={EXPLORER_VIEW_OPTIONS}
                  value={explorerViewMode}
                  onChange={(nextViewMode) => {
                    setExplorerViewMode(nextViewMode);
                    if (nextViewMode === "change") setLookbackHours(selectedWindow.hours);
                  }}
                  ariaLabel="Load explorer view"
                />
              </ForecastControlGroup>
              <ForecastControlGroup label="Metric">
                <ForecastSegmentedControl
                  options={explorerMetricOptions}
                  value={explorerMetric}
                  onChange={setExplorerMetric}
                  ariaLabel="Load explorer metric"
                />
              </ForecastControlGroup>
              {explorerViewMode === "change" && (
                <ForecastControlGroup label="Window">
                  <ForecastSegmentedControl
                    options={changeWindowOptions}
                    value={changeWindow}
                    onChange={(nextWindow) => {
                      setExplorerViewMode("change");
                      selectChangeWindow(nextWindow);
                    }}
                    ariaLabel="Load change window"
                  />
                </ForecastControlGroup>
              )}
            </>
          )}
        </div>
      </div>

      {controlFooterItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-800 pt-2 text-[11px] font-medium text-gray-500">
          {controlFooterItems.map((item) => (
            <span key={item} className="whitespace-nowrap">
              {item}
            </span>
          ))}
        </div>
      )}
    </ForecastFilterCard>
  );

  return (
    <div className="space-y-4">
      {renderForecastFilterCard()}

      {forecastType === "netLoad" ? (
        <PjmNetLoadForecast
          iso={forecastIso}
          refreshToken={refreshToken}
          sourceMode={activeSourceMode}
          activeTab={forecastMode as NetLoadForecastTab}
          viewMode={netLoadViewMode}
          onViewModeChange={setNetLoadViewMode}
          changeWindow={netLoadChangeWindow}
          onChangeWindowChange={setNetLoadChangeWindow}
          selectedStatistic={netLoadStatistic}
          onSelectedStatisticChange={setNetLoadStatistic}
          compareBaseDate={netLoadCompareBaseDate}
          onCompareBaseDateChange={setNetLoadCompareBaseDate}
          compareTargetDate={netLoadCompareTargetDate}
          onCompareTargetDateChange={setNetLoadCompareTargetDate}
          compareRampingEnabled={netLoadCompareRampingEnabled}
          onCompareRampingEnabledChange={setNetLoadCompareRampingEnabled}
          onCompareDateOptionsChange={setNetLoadCompareDateOptions}
          initialArea={initialArea}
          initialDate={initialDate}
          initialComponent={initialNetLoadComponent}
          initialStatistic={initialNetLoadStatistic}
          embedded
          filterControlsPlacement="external"
          onFreshnessChange={handleNetLoadFreshnessChange}
        />
      ) : forecastMode === "compareDay" ? (
        <>
          {explorerError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {explorerError}
            </div>
          )}
          {explorerLoading && (
            <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
              Loading forecast dates...
            </div>
          )}
          {!explorerLoading && renderLoadCompareSection()}
        </>
      ) : (
        <>
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
        </>
      )}
      {renderFocusedLoadCompareChart()}
    </div>
  );
}
