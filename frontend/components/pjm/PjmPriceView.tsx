"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import MultiSelect from "@/components/ui/MultiSelect";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

export interface PjmPriceViewFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface PriceViewRow {
  metric: string;
  dataSource: string;
  verified: string;
  note: string;
  values: Array<number | string | null>;
}

interface SelectedHourPoint {
  he: number | string | null;
  netLoadGw: number | string | null;
  rtPrice: number | string | null;
  tetcoM3Gas?: number | string | null;
  heatRate?: number | string | null;
  gasDay?: string | null;
  gasTradeDate?: string | null;
}

interface PriceViewPayload {
  iso: "pjm";
  selectedDate: string | null;
  requestedDate: string | null;
  defaultDate: string | null;
  availableDates: string[];
  asOf: string | null;
  source: string;
  formula: string;
  rows: PriceViewRow[];
  selectedHours?: SelectedHourPoint[];
}

interface DaNetLoadScatterApiPoint {
  date: string;
  datetimeBeginningEpt: string;
  he: number | string | null;
  hub: string;
  daLmp: number | string | null;
  westernHubDaLmp?: number | string | null;
  loadGw: number | string | null;
  windGw: number | string | null;
  solarGw: number | string | null;
  netLoadGw: number | string | null;
  tetcoM3Gas?: number | string | null;
  daHeatRate?: number | string | null;
  gasDay?: string | null;
  gasTradeDate?: string | null;
  loadDataSource?: string | null;
  loadSourceStatus?: string | null;
  asOf?: string | null;
}

interface DaNetLoadScatterPayload {
  iso: "pjm";
  view: "da-net-load-scatter";
  hub: string;
  lookbackDays: number;
  dateMode: ScatterDateMode;
  months: number[];
  years: number[];
  availableHubs: string[];
  startDate: string | null;
  endDate: string | null;
  completeDates: string[];
  asOf: string | null;
  source: string;
  formula: string;
  rows: DaNetLoadScatterApiPoint[];
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_VERSION = "v6";
const HOURS = Array.from({ length: 24 }, (_, index) => index + 1);
type ChartMetric = "heatRate" | "rtPrice";
type PriceViewTab = "matrix" | "da-net-load-scatter";
type HourGroupKey = "overnight" | "morning" | "afternoon" | "evening";
type ScatterDateMode = "latest" | "month-years";
type DaScatterXMetric = "netLoadGw" | "loadGw" | "windGw" | "solarGw";
type DaScatterYMetric = "daLmp" | "daHeatRate";
type DayFilter = "all" | "weekdays" | "weekends";

const DEFAULT_SCATTER_LOOKBACK_DAYS = 30;
const MIN_SCATTER_LOOKBACK_DAYS = 7;
const MAX_SCATTER_LOOKBACK_DAYS = 90;
const DEFAULT_HUB = "WESTERN HUB";
const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_SCATTER_MONTHS = [String(new Date().getMonth() + 1)];
const DEFAULT_SCATTER_YEARS = [String(CURRENT_YEAR - 1), String(CURRENT_YEAR)];
const SCATTER_DATE_MODES: Array<{ key: ScatterDateMode; label: string }> = [
  { key: "latest", label: "Latest Complete" },
  { key: "month-years", label: "Month + Years" },
];
const MONTHS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];
const MONTH_OPTIONS = MONTHS.map((month) => ({ value: String(month.value), label: month.label }));
const YEAR_OPTIONS = Array.from({ length: 8 }, (_, index) => String(CURRENT_YEAR - index)).sort();
const DEFAULT_HUBS = [
  "WESTERN HUB",
  "EASTERN HUB",
  "AEP-DAYTON HUB",
  "DOMINION HUB",
  "NEW JERSEY HUB",
  "CHICAGO HUB",
  "OHIO HUB",
  "N ILLINOIS HUB",
  "AEP GEN HUB",
  "ATSI GEN HUB",
  "CHICAGO GEN HUB",
  "WEST INT HUB",
] as const;
const HOUR_GROUPS: Array<{ key: HourGroupKey; label: string; description: string; color: string }> = [
  { key: "overnight", label: "Overnight", description: "HE1-7, HE24", color: "#38bdf8" },
  { key: "morning", label: "Morning", description: "HE8-11", color: "#facc15" },
  { key: "afternoon", label: "Afternoon", description: "HE12-17", color: "#fb923c" },
  { key: "evening", label: "Evening", description: "HE18-23", color: "#a78bfa" },
];
const HOUR_GROUP_OPTIONS = HOUR_GROUPS.map((group) => ({ value: group.key, label: group.label }));
const HOUR_OPTIONS = HOURS.map((hour) => ({ value: String(hour), label: `HE${hour}` }));
const DAY_FILTERS: Array<{ key: DayFilter; label: string }> = [
  { key: "all", label: "All Days" },
  { key: "weekdays", label: "Weekdays" },
  { key: "weekends", label: "Weekends" },
];
const X_METRICS: Record<DaScatterXMetric, { label: string; unit: string; formatter: (value: number) => string }> = {
  netLoadGw: { label: "Net Load", unit: "GW", formatter: (value) => value.toFixed(0) },
  loadGw: { label: "Load", unit: "GW", formatter: (value) => value.toFixed(0) },
  windGw: { label: "Wind", unit: "GW", formatter: (value) => value.toFixed(0) },
  solarGw: { label: "Solar", unit: "GW", formatter: (value) => value.toFixed(0) },
};
const Y_METRICS: Record<DaScatterYMetric, { label: string; unit: string; formatter: (value: number) => string }> = {
  daLmp: { label: "DA LMP", unit: "$/MWh", formatter: (value) => `$${value.toFixed(0)}` },
  daHeatRate: { label: "DA Heat Rate", unit: "MMBtu/MWh", formatter: (value) => value.toFixed(0) },
};

const DEFAULT_FRESHNESS: PjmPriceViewFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Price view --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

function buildApiUrl(date: string | null, refresh: boolean): string {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (refresh) params.set("refresh", "1");
  const query = params.toString();
  return query ? `/api/pjm-price-view?${query}` : "/api/pjm-price-view";
}

function buildCacheKey(date: string | null): string {
  return `api:pjm-price-view:${CACHE_VERSION}:${date ?? "latest"}`;
}

function buildScatterApiUrl({
  lookbackDays,
  hub,
  dateMode,
  months,
  years,
  refresh,
}: {
  lookbackDays: number;
  hub: string;
  dateMode: ScatterDateMode;
  months: string[];
  years: string[];
  refresh: boolean;
}): string {
  const params = new URLSearchParams({
    view: "da-net-load-scatter",
    lookbackDays: String(lookbackDays),
    hub,
    dateMode,
  });
  if (dateMode === "month-years") {
    params.set("months", months.join(","));
    params.set("years", years.join(","));
  }
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-price-view?${params.toString()}`;
}

function buildScatterCacheKey({
  lookbackDays,
  hub,
  dateMode,
  months,
  years,
}: {
  lookbackDays: number;
  hub: string;
  dateMode: ScatterDateMode;
  months: string[];
  years: string[];
}): string {
  return [
    "api:pjm-price-view",
    CACHE_VERSION,
    "da-net-load-scatter",
    lookbackDays,
    hub,
    dateMode,
    months.join(","),
    years.join(","),
  ].join(":");
}

function fmtDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "-";
}

function fmtStamp(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function fmtValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPrice(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? `$${parsed.toFixed(2)}` : "-";
}

function fmtGasPrice(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? `$${parsed.toFixed(3)}` : "-";
}

function fmtHeatRate(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "-";
}

function fmtGw(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(2)} GW` : "-";
}

function fmtMetricValue(metric: string, value: number | string | null | undefined): string {
  if (metric === "RT LMP") return fmtPrice(value);
  if (metric === "Tetco M3 Gas") return fmtGasPrice(value);
  if (metric === "Heat Rate") return fmtHeatRate(value);
  return fmtValue(value);
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampLookbackDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SCATTER_LOOKBACK_DAYS;
  return Math.min(Math.max(Math.trunc(value), MIN_SCATTER_LOOKBACK_DAYS), MAX_SCATTER_LOOKBACK_DAYS);
}

function normalizeMonthSelection(months: string[]): string[] {
  const valid = Array.from(
    new Set(
      months.filter((month) => {
        const parsed = Number(month);
        return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12;
      }),
    ),
  ).sort((left, right) => Number(left) - Number(right));
  return valid.length ? valid : DEFAULT_SCATTER_MONTHS;
}

function normalizeYearSelection(years: string[]): string[] {
  const valid = Array.from(
    new Set(
      years
        .map((year) => Number(year))
        .filter((year) => Number.isInteger(year) && year >= 2000 && year <= CURRENT_YEAR + 1),
    ),
  ).sort((left, right) => left - right);
  return valid.length ? valid.slice(-8).map(String) : DEFAULT_SCATTER_YEARS;
}

function monthSelectionLabel(months: string[]): string {
  const labels = normalizeMonthSelection(months).map(
    (value) => MONTHS.find((item) => item.value === Number(value))?.label ?? value,
  );
  return labels.length <= 3 ? labels.join(", ") : `${labels.length} months`;
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isWeekendDate(value: string): boolean {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function hourGroupForHe(he: number): HourGroupKey {
  if (he >= 8 && he <= 11) return "morning";
  if (he >= 12 && he <= 17) return "afternoon";
  if (he >= 18 && he <= 23) return "evening";
  return "overnight";
}

function freshnessFromPayload(data: PriceViewPayload): PjmPriceViewFreshnessSummary {
  if (!data.rows.length) return DEFAULT_FRESHNESS;
  return {
    status: "Available",
    statusClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    summary: `${fmtDate(data.selectedDate)} | ${data.rows.length} sources x 24 HE`,
    targetDateLabel: fmtDate(data.selectedDate),
    latestDateLabel: fmtDate(data.defaultDate),
    latestUpdateLabel: fmtStamp(data.asOf),
  };
}

function scatterFreshnessFromPayload(data: DaNetLoadScatterPayload): PjmPriceViewFreshnessSummary {
  if (!data.rows.length) return DEFAULT_FRESHNESS;
  const dateLabel =
    data.startDate && data.endDate
      ? `${fmtDate(data.startDate)} to ${fmtDate(data.endDate)}`
      : `${data.lookbackDays}D`;
  return {
    status: "Available",
    statusClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    summary: `${data.hub} DA scatter | ${data.rows.length} hours`,
    targetDateLabel: dateLabel,
    latestDateLabel: fmtDate(data.endDate),
    latestUpdateLabel: fmtStamp(data.asOf),
  };
}

interface ScatterPoint {
  he: number;
  netLoadGw: number;
  yValue: number;
  rtPrice: number | null;
  heatRate: number | null;
  tetcoM3Gas: number | null;
  gasDay: string | null | undefined;
  gasTradeDate: string | null | undefined;
}

interface ChartTooltipEntry {
  name?: string;
  value?: number | string | null;
  color?: string;
  payload?: ScatterPoint;
}

interface DaScatterPoint {
  date: string;
  datetimeBeginningEpt: string;
  he: number;
  hourGroup: HourGroupKey;
  daLmp: number;
  daHeatRate: number | null;
  tetcoM3Gas: number | null;
  loadGw: number;
  windGw: number;
  solarGw: number;
  netLoadGw: number;
  xValue: number;
  yValue: number;
  gasDay?: string | null;
  gasTradeDate?: string | null;
  loadDataSource?: string | null;
  loadSourceStatus?: string | null;
}

interface DaScatterTooltipEntry {
  name?: string;
  value?: number | string | null;
  color?: string;
  payload?: DaScatterPoint;
}

function PriceScatterTooltip({
  active,
  payload,
  chartMetric,
}: {
  active?: boolean;
  payload?: ChartTooltipEntry[];
  chartMetric: ChartMetric;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ScatterPoint | undefined;
  if (!point) return null;
  const isHeatRate = chartMetric === "heatRate";
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-gray-100">HE{point.he}</p>
      <p className="mt-1 text-gray-400">Net load: {fmtGw(point.netLoadGw)}</p>
      <p className="text-gray-400">
        {isHeatRate ? "Heat rate" : "RT price"}:{" "}
        {isHeatRate ? `${fmtHeatRate(point.heatRate)} MMBtu/MWh` : fmtPrice(point.rtPrice)}
      </p>
      <p className="text-gray-500">RT price: {fmtPrice(point.rtPrice)}</p>
      <p className="text-gray-500">Tetco M3: {fmtGasPrice(point.tetcoM3Gas)}</p>
      {point.gasDay && <p className="text-gray-600">Gas day: {point.gasDay}</p>}
    </div>
  );
}

function DaNetLoadScatterTooltip({
  active,
  payload,
  hub,
  yMetric,
}: {
  active?: boolean;
  payload?: DaScatterTooltipEntry[];
  hub: string;
  yMetric: DaScatterYMetric;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as DaScatterPoint | undefined;
  if (!point) return null;
  const yMetricConfig = Y_METRICS[yMetric];
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-gray-100">
        {fmtDate(point.date)} HE{point.he}
      </p>
      <p className="mt-1 text-gray-400">
        {hub} DA LMP: {fmtPrice(point.daLmp)}
      </p>
      {point.daHeatRate !== null && (
        <p className="text-gray-400">DA heat rate: {fmtHeatRate(point.daHeatRate)} MMBtu/MWh</p>
      )}
      <p className="text-gray-500">Load: {fmtGw(point.loadGw)}</p>
      <p className="text-gray-500">Wind: {fmtGw(point.windGw)}</p>
      <p className="text-gray-500">Solar: {fmtGw(point.solarGw)}</p>
      <p className="text-gray-400">Net load: {fmtGw(point.netLoadGw)}</p>
      <p className="text-gray-500">Tetco M3: {fmtGasPrice(point.tetcoM3Gas)}</p>
      <p className="text-gray-500">
        Y selected: {yMetricConfig.label}{" "}
        {yMetric === "daLmp" ? fmtPrice(point.yValue) : `${fmtHeatRate(point.yValue)} ${yMetricConfig.unit}`}
      </p>
    </div>
  );
}

function buildSelectedHoursFromRows(rows: PriceViewRow[]): SelectedHourPoint[] {
  const netLoad = rows.find((row) => row.metric === "Net Load")?.values ?? [];
  const rtPrice = rows.find((row) => row.metric === "RT LMP")?.values ?? [];
  const tetcoM3Gas = rows.find((row) => row.metric === "Tetco M3 Gas")?.values ?? [];
  const heatRate = rows.find((row) => row.metric === "Heat Rate")?.values ?? [];

  return HOURS.map((hour, index) => ({
    he: hour,
    netLoadGw: toNumber(netLoad[index]),
    rtPrice: toNumber(rtPrice[index]),
    tetcoM3Gas: toNumber(tetcoM3Gas[index]),
    heatRate: toNumber(heatRate[index]),
  }));
}

function paddedDomain(values: Array<number | null | undefined>, paddingPct = 0.08): [number, number] | undefined {
  const finiteValues = values.filter((value): value is number => Number.isFinite(value));
  if (!finiteValues.length) return undefined;
  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const span = max - min;
  const padding = span > 0 ? span * paddingPct : Math.max(Math.abs(max) * paddingPct, 1);
  return [min - padding, max + padding];
}

function verifiedClass(value: string): string {
  if (value === "Verified RT") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  if (value === "Metered RTO") {
    return "border-violet-500/30 bg-violet-500/10 text-violet-200";
  }
  if (value === "Prelim fallback") {
    return "border-gray-600 bg-gray-900 text-gray-300";
  }
  if (value === "Actual") {
    return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  }
  if (value === "ICE WVAP") {
    return "border-cyan-500/30 bg-cyan-500/10 text-cyan-100";
  }
  if (value === "Derived") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  }
  return "border-gray-700 bg-gray-900 text-gray-300";
}

function metricTextClass(metric: string): string {
  if (metric === "Net Load") return "text-amber-100";
  if (metric === "RT LMP") return "text-rose-100";
  if (metric === "Tetco M3 Gas") return "text-cyan-100";
  if (metric === "Heat Rate") return "text-emerald-100";
  return "text-gray-200";
}

export default function PjmPriceView({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmPriceViewFreshnessSummary) => void;
}) {
  const [activeView, setActiveView] = useState<PriceViewTab>("matrix");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [data, setData] = useState<PriceViewPayload | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showDataSource, setShowDataSource] = useState(true);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("heatRate");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scatterData, setScatterData] = useState<DaNetLoadScatterPayload | null>(null);
  const [scatterLookbackDays, setScatterLookbackDays] = useState(DEFAULT_SCATTER_LOOKBACK_DAYS);
  const [scatterHub, setScatterHub] = useState(DEFAULT_HUB);
  const [scatterDateMode, setScatterDateMode] = useState<ScatterDateMode>("latest");
  const [scatterMonths, setScatterMonths] = useState<string[]>(DEFAULT_SCATTER_MONTHS);
  const [scatterYears, setScatterYears] = useState<string[]>(DEFAULT_SCATTER_YEARS);
  const [scatterDayFilter, setScatterDayFilter] = useState<DayFilter>("all");
  const [scatterHourGroups, setScatterHourGroups] = useState<string[]>(HOUR_GROUPS.map((group) => group.key));
  const [scatterHours, setScatterHours] = useState<string[]>([]);
  const [scatterXMetric, setScatterXMetric] = useState<DaScatterXMetric>("netLoadGw");
  const [scatterYMetric, setScatterYMetric] = useState<DaScatterYMetric>("daLmp");
  const [scatterXMin, setScatterXMin] = useState("");
  const [scatterXMax, setScatterXMax] = useState("");
  const [scatterYMin, setScatterYMin] = useState("");
  const [scatterYMax, setScatterYMax] = useState("");
  const [scatterLoading, setScatterLoading] = useState(false);
  const [scatterError, setScatterError] = useState<string | null>(null);

  useEffect(() => {
    if (activeView !== "matrix") return;
    const controller = new AbortController();
    const forceRefresh = refreshToken > 0;

    setLoading(true);
    setError(null);

    fetchJsonWithCache<PriceViewPayload>({
      key: buildCacheKey(selectedDate),
      url: buildApiUrl(selectedDate, forceRefresh),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      forceRefresh,
    })
      .then((payload) => {
        setData(payload);
        onFreshnessChange?.(freshnessFromPayload(payload));
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        const message = caught instanceof Error ? caught.message : "Failed to load PJM price view";
        setError(message);
        onFreshnessChange?.({
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Price view request failed",
          targetDateLabel: fmtDate(selectedDate),
          latestDateLabel: "--",
          latestUpdateLabel: "--",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [activeView, onFreshnessChange, refreshToken, selectedDate]);

  useEffect(() => {
    if (activeView !== "da-net-load-scatter") return;
    const controller = new AbortController();
    const forceRefresh = refreshToken > 0;
    const lookbackDays = clampLookbackDays(scatterLookbackDays);
    const months = normalizeMonthSelection(scatterMonths);
    const years = normalizeYearSelection(scatterYears);

    setScatterLoading(true);
    setScatterError(null);

    fetchJsonWithCache<DaNetLoadScatterPayload>({
      key: buildScatterCacheKey({
        lookbackDays,
        hub: scatterHub,
        dateMode: scatterDateMode,
        months,
        years,
      }),
      url: buildScatterApiUrl({
        lookbackDays,
        hub: scatterHub,
        dateMode: scatterDateMode,
        months,
        years,
        refresh: forceRefresh,
      }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      forceRefresh,
    })
      .then((payload) => {
        setScatterData(payload);
        onFreshnessChange?.(scatterFreshnessFromPayload(payload));
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        const message = caught instanceof Error ? caught.message : "Failed to load PJM DA scatter";
        setScatterError(message);
        onFreshnessChange?.({
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "DA scatter request failed",
          targetDateLabel: scatterDateMode === "month-years" ? `${monthSelectionLabel(months)} ${years.join(", ")}` : `${scatterLookbackDays}D`,
          latestDateLabel: "--",
          latestUpdateLabel: "--",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setScatterLoading(false);
      });

    return () => controller.abort();
  }, [
    activeView,
    onFreshnessChange,
    refreshToken,
    scatterDateMode,
    scatterHub,
    scatterLookbackDays,
    scatterMonths,
    scatterYears,
  ]);

  useEffect(() => {
    if (activeView === "matrix" && !data) onFreshnessChange?.(DEFAULT_FRESHNESS);
    if (activeView === "da-net-load-scatter" && !scatterData) onFreshnessChange?.(DEFAULT_FRESHNESS);
  }, [activeView, data, onFreshnessChange, scatterData]);

  const activeDate = selectedDate ?? data?.selectedDate ?? "";
  const availableDates = useMemo(() => data?.availableDates ?? [], [data?.availableDates]);
  const emptyColSpan = showDataSource ? 26 : 25;
  const selectedScatterRows = useMemo<ScatterPoint[]>(() => {
    const points =
      data?.selectedHours?.length
        ? data.selectedHours
        : buildSelectedHoursFromRows(data?.rows ?? []);

    return points
      .map((point) => {
        const he = toNumber(point.he);
        const netLoadGw = toNumber(point.netLoadGw);
        const rtPrice = toNumber(point.rtPrice);
        const heatRate = toNumber(point.heatRate);
        const tetcoM3Gas = toNumber(point.tetcoM3Gas);
        const yValue = chartMetric === "heatRate" ? heatRate : rtPrice;
        if (he === null || netLoadGw === null || yValue === null) return null;
        return {
          he,
          netLoadGw,
          yValue,
          rtPrice,
          heatRate,
          tetcoM3Gas,
          gasDay: point.gasDay,
          gasTradeDate: point.gasTradeDate,
        };
      })
      .filter((point): point is ScatterPoint => point !== null);
  }, [chartMetric, data?.rows, data?.selectedHours]);
  const scatterXDomain = useMemo(
    () => paddedDomain(selectedScatterRows.map((row) => row.netLoadGw)),
    [selectedScatterRows],
  );
  const scatterYDomain = useMemo(
    () => paddedDomain(selectedScatterRows.map((row) => row.yValue), 0.1),
    [selectedScatterRows],
  );
  const chartLabel = chartMetric === "heatRate" ? "Heat Rate" : "RT Price";
  const chartUnitLabel = chartMetric === "heatRate" ? "MMBtu/MWh" : "$/MWh";
  const scatterHubs = scatterData?.availableHubs?.length ? scatterData.availableHubs : [...DEFAULT_HUBS];
  const daScatterRows = useMemo<DaScatterPoint[]>(() => {
    const points: DaScatterPoint[] = [];
    const selectedGroups = new Set(scatterHourGroups);
    const selectedHours = new Set(scatterHours.map(Number));
    const xMin = parseOptionalNumber(scatterXMin);
    const xMax = parseOptionalNumber(scatterXMax);
    const yMin = parseOptionalNumber(scatterYMin);
    const yMax = parseOptionalNumber(scatterYMax);
    for (const row of scatterData?.rows ?? []) {
      const he = toNumber(row.he);
      const daLmp = toNumber(row.daLmp ?? row.westernHubDaLmp);
      const loadGw = toNumber(row.loadGw);
      const windGw = toNumber(row.windGw);
      const solarGw = toNumber(row.solarGw);
      const netLoadGw = toNumber(row.netLoadGw);
      const tetcoM3Gas = toNumber(row.tetcoM3Gas);
      const daHeatRate = toNumber(row.daHeatRate);
      if (
        he === null ||
        daLmp === null ||
        loadGw === null ||
        windGw === null ||
        solarGw === null ||
        netLoadGw === null
      ) {
        continue;
      }
      const hourGroup = hourGroupForHe(he);
      const metricValues: Record<DaScatterXMetric | DaScatterYMetric, number | null> = {
        netLoadGw,
        loadGw,
        windGw,
        solarGw,
        daLmp,
        daHeatRate,
      };
      const xValue = metricValues[scatterXMetric];
      const yValue = metricValues[scatterYMetric];
      if (xValue === null || yValue === null) continue;
      if (scatterDayFilter === "weekdays" && isWeekendDate(row.date)) continue;
      if (scatterDayFilter === "weekends" && !isWeekendDate(row.date)) continue;
      if (selectedGroups.size > 0 && !selectedGroups.has(hourGroup)) continue;
      if (selectedHours.size > 0 && !selectedHours.has(he)) continue;
      if (xMin !== null && xValue < xMin) continue;
      if (xMax !== null && xValue > xMax) continue;
      if (yMin !== null && yValue < yMin) continue;
      if (yMax !== null && yValue > yMax) continue;
      points.push({
        date: row.date,
        datetimeBeginningEpt: row.datetimeBeginningEpt,
        he,
        hourGroup,
        daLmp,
        daHeatRate,
        tetcoM3Gas,
        loadGw,
        windGw,
        solarGw,
        netLoadGw,
        xValue,
        yValue,
        gasDay: row.gasDay,
        gasTradeDate: row.gasTradeDate,
        loadDataSource: row.loadDataSource ?? null,
        loadSourceStatus: row.loadSourceStatus ?? null,
      });
    }
    return points;
  }, [
    scatterData?.rows,
    scatterDayFilter,
    scatterHourGroups,
    scatterHours,
    scatterXMax,
    scatterXMetric,
    scatterXMin,
    scatterYMax,
    scatterYMetric,
    scatterYMin,
  ]);
  const daScatterXDomain = useMemo(
    () => paddedDomain(daScatterRows.map((row) => row.xValue)),
    [daScatterRows],
  );
  const daScatterYDomain = useMemo(
    () => paddedDomain(daScatterRows.map((row) => row.yValue), 0.1),
    [daScatterRows],
  );
  const selectedXMetric = X_METRICS[scatterXMetric];
  const selectedYMetric = Y_METRICS[scatterYMetric];
  const scatterSelectionLabel =
    scatterDateMode === "month-years"
      ? `${monthSelectionLabel(scatterMonths)} ${normalizeYearSelection(scatterYears).join(", ")}`
      : `${scatterData?.lookbackDays ?? scatterLookbackDays}D latest complete`;
  const selectedDayFilterLabel = DAY_FILTERS.find((filter) => filter.key === scatterDayFilter)?.label ?? "All Days";
  const selectedHourLabel =
    scatterHours.length > 0
      ? `${scatterHours.length} HEs`
      : scatterHourGroups.length > 0 && scatterHourGroups.length < HOUR_GROUPS.length
        ? `${scatterHourGroups.length} hour groups`
        : "All hours";
  const activeViewLabel = activeView === "matrix" ? "Single-Day Matrix" : "DA Scatter";
  const priceViewSummaryLabels =
    activeView === "matrix"
      ? [
          activeViewLabel,
          activeDate ? fmtDate(activeDate) : "Latest complete",
          `${data?.rows.length ?? 0} source rows`,
        ]
      : [
          activeViewLabel,
          scatterData?.hub ?? scatterHub,
          scatterSelectionLabel,
          `${selectedXMetric.label} x ${selectedYMetric.label}`,
          selectedDayFilterLabel,
          selectedHourLabel,
          `${daScatterRows.length.toLocaleString()} hours`,
        ];

  const dateControl = (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-end">
      <label className="block w-full sm:w-auto">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Date
        </span>
        <select
          value={activeDate}
          onChange={(event) => setSelectedDate(event.target.value || null)}
          className="h-9 w-full rounded-md border border-gray-700 bg-gray-900 px-3 text-sm text-gray-200 focus:border-gray-500 focus:outline-none sm:w-auto"
        >
          {availableDates.length === 0 && <option value="">Latest complete</option>}
          {availableDates.map((date) => (
            <option key={date} value={date}>
              {date}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => setSelectedDate(null)}
        className="h-9 w-full rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white sm:w-auto"
      >
        Latest
      </button>
    </div>
  );

  const scatterControls = (
    <>
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Date View
        </span>
        <select
          value={scatterDateMode}
          onChange={(event) => setScatterDateMode(event.target.value as ScatterDateMode)}
          className="h-9 w-full rounded-md border border-gray-600 bg-gray-950 px-3 text-sm text-gray-100 focus:border-gray-400 focus:outline-none"
        >
          {SCATTER_DATE_MODES.map((mode) => (
            <option key={mode.key} value={mode.key}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
          lookbackDays
        </span>
        <input
          type="number"
          min={MIN_SCATTER_LOOKBACK_DAYS}
          max={MAX_SCATTER_LOOKBACK_DAYS}
          value={scatterLookbackDays}
          onChange={(event) => setScatterLookbackDays(clampLookbackDays(Number(event.target.value)))}
          disabled={scatterDateMode === "month-years"}
          className="h-9 w-full rounded-md border border-gray-600 bg-gray-950 px-3 text-sm text-gray-100 focus:border-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
        />
      </label>
      {scatterDateMode === "month-years" && (
        <>
          <MultiSelect
            label="Months"
            options={MONTH_OPTIONS}
            selected={scatterMonths}
            onChange={(months) => setScatterMonths(normalizeMonthSelection(months))}
            placeholder="Select months"
            width="w-full"
          />
          <MultiSelect
            label="Years"
            options={YEAR_OPTIONS}
            selected={scatterYears}
            onChange={(years) => setScatterYears(normalizeYearSelection(years))}
            placeholder="Select years"
            width="w-full"
          />
        </>
      )}
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Hub
        </span>
        <select
          value={scatterHub}
          onChange={(event) => setScatterHub(event.target.value)}
          className="h-9 w-full rounded-md border border-gray-600 bg-gray-950 px-3 text-sm text-gray-100 focus:border-gray-400 focus:outline-none"
        >
          {scatterHubs.map((hub) => (
            <option key={hub} value={hub}>
              {hub}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Day Type
        </span>
        <select
          value={scatterDayFilter}
          onChange={(event) => setScatterDayFilter(event.target.value as DayFilter)}
          className="h-9 w-full rounded-md border border-gray-600 bg-gray-950 px-3 text-sm text-gray-100 focus:border-gray-400 focus:outline-none"
        >
          {DAY_FILTERS.map((filter) => (
            <option key={filter.key} value={filter.key}>
              {filter.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
          X Axis
        </span>
        <select
          value={scatterXMetric}
          onChange={(event) => setScatterXMetric(event.target.value as DaScatterXMetric)}
          className="h-9 w-full rounded-md border border-gray-600 bg-gray-950 px-3 text-sm text-gray-100 focus:border-gray-400 focus:outline-none"
        >
          {(Object.keys(X_METRICS) as DaScatterXMetric[]).map((key) => (
            <option key={key} value={key}>
              {X_METRICS[key].label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Y Axis
        </span>
        <select
          value={scatterYMetric}
          onChange={(event) => setScatterYMetric(event.target.value as DaScatterYMetric)}
          className="h-9 w-full rounded-md border border-gray-600 bg-gray-950 px-3 text-sm text-gray-100 focus:border-gray-400 focus:outline-none"
        >
          {(Object.keys(Y_METRICS) as DaScatterYMetric[]).map((key) => (
            <option key={key} value={key}>
              {Y_METRICS[key].label}
            </option>
          ))}
        </select>
      </label>
      <MultiSelect
        label="Hour Groups"
        options={HOUR_GROUP_OPTIONS}
        selected={scatterHourGroups}
        onChange={setScatterHourGroups}
        placeholder="All groups"
        width="w-full"
      />
      <MultiSelect
        label="Hours"
        options={HOUR_OPTIONS}
        selected={scatterHours}
        onChange={setScatterHours}
        placeholder="All HEs"
        width="w-full"
      />
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
          X Min
        </span>
        <input
          type="number"
          value={scatterXMin}
          onChange={(event) => setScatterXMin(event.target.value)}
          placeholder="Auto"
          className="h-9 w-full rounded-md border border-gray-600 bg-gray-950 px-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-gray-400 focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
          X Max
        </span>
        <input
          type="number"
          value={scatterXMax}
          onChange={(event) => setScatterXMax(event.target.value)}
          placeholder="Auto"
          className="h-9 w-full rounded-md border border-gray-600 bg-gray-950 px-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-gray-400 focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Y Min
        </span>
        <input
          type="number"
          value={scatterYMin}
          onChange={(event) => setScatterYMin(event.target.value)}
          placeholder="Auto"
          className="h-9 w-full rounded-md border border-gray-600 bg-gray-950 px-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-gray-400 focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Y Max
        </span>
        <input
          type="number"
          value={scatterYMax}
          onChange={(event) => setScatterYMax(event.target.value)}
          placeholder="Auto"
          className="h-9 w-full rounded-md border border-gray-600 bg-gray-950 px-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-gray-400 focus:outline-none"
        />
      </label>
      <div className="flex items-end">
        <button
          type="button"
          onClick={() => {
            setScatterDayFilter("all");
            setScatterHourGroups(HOUR_GROUPS.map((group) => group.key));
            setScatterHours([]);
            setScatterXMetric("netLoadGw");
            setScatterYMetric("daLmp");
            setScatterXMin("");
            setScatterXMax("");
            setScatterYMin("");
            setScatterYMax("");
          }}
          className="h-9 w-full rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
        >
          Reset Filters
        </button>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-100">Edit Price View</h2>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Edit View
          </button>
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
          {priceViewSummaryLabels.filter(Boolean).map((label) => (
            <span
              key={label}
              className="rounded-md border border-gray-800 bg-gray-950/50 px-2.5 py-1 text-xs font-semibold text-gray-300"
            >
              {label}
            </span>
          ))}
        </div>
      </section>

      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Edit price view"
          onMouseDown={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-5xl rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-100">Edit Price View</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-700 hover:text-white"
              >
                Done
              </button>
            </div>

            <div className="space-y-5 p-4">
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">View</div>
                <div className="inline-flex w-full rounded-md border border-gray-700 bg-gray-950 p-0.5 text-xs font-semibold sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setActiveView("matrix")}
                    className={`flex-1 rounded px-3 py-1.5 transition-colors sm:flex-none ${
                      activeView === "matrix"
                        ? "bg-sky-500/20 text-sky-100"
                        : "text-gray-400 hover:text-gray-100"
                    }`}
                  >
                    Single-Day Matrix
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView("da-net-load-scatter")}
                    className={`flex-1 rounded px-3 py-1.5 transition-colors sm:flex-none ${
                      activeView === "da-net-load-scatter"
                        ? "bg-sky-500/20 text-sky-100"
                        : "text-gray-400 hover:text-gray-100"
                    }`}
                  >
                    30D DA Scatter
                  </button>
                </div>
              </div>

              {activeView === "matrix" ? (
                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Dates</div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
                    {dateControl}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Dates</div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
                    {scatterControls}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeView === "matrix" && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {activeView === "da-net-load-scatter" && scatterError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {scatterError}
        </div>
      )}

      {activeView === "da-net-load-scatter" ? (
        <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-100">
                DA Net Load Scatter
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {scatterData?.hub ?? scatterHub} | {scatterSelectionLabel} | {fmtDate(scatterData?.startDate)} to{" "}
                {fmtDate(scatterData?.endDate)} | {selectedXMetric.label} vs {selectedYMetric.label} |{" "}
                {daScatterRows.length} hours
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {HOUR_GROUPS.map((group) => (
                <div key={group.key} className="inline-flex items-center gap-2 text-xs text-gray-300">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: group.color }}
                    aria-hidden="true"
                  />
                  <span className="font-semibold">{group.label}</span>
                  <span className="text-gray-500">{group.description}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="h-[560px] min-h-[360px]">
            {daScatterRows.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 12, right: 24, bottom: 28, left: 8 }}>
                  <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="xValue"
                    name={selectedXMetric.label}
                    domain={daScatterXDomain}
                    allowDataOverflow
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    axisLine={{ stroke: "#4b5563" }}
                    tickLine={false}
                    tickFormatter={selectedXMetric.formatter}
                    label={{
                      value: `${selectedXMetric.label} (${selectedXMetric.unit})`,
                      position: "insideBottom",
                      offset: -16,
                      fill: "#6b7280",
                      fontSize: 12,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="yValue"
                    name={selectedYMetric.label}
                    domain={daScatterYDomain}
                    allowDataOverflow
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    axisLine={{ stroke: "#4b5563" }}
                    tickLine={false}
                    tickFormatter={selectedYMetric.formatter}
                    label={{
                      value: `${selectedYMetric.label} (${selectedYMetric.unit})`,
                      angle: -90,
                      position: "insideLeft",
                      offset: 10,
                      fill: "#6b7280",
                      fontSize: 12,
                    }}
                  />
                  <Tooltip
                    content={<DaNetLoadScatterTooltip hub={scatterData?.hub ?? scatterHub} yMetric={scatterYMetric} />}
                    cursor={{ stroke: "#64748b", strokeDasharray: "4 4", strokeWidth: 1 }}
                  />
                  {HOUR_GROUPS.map((group) => (
                    <Scatter
                      key={group.key}
                      name={group.label}
                      data={daScatterRows.filter((row) => row.hourGroup === group.key)}
                      fill={group.color}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                {scatterLoading ? "Loading 30D DA scatter..." : "No complete DA scatter data is available."}
              </div>
            )}
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-100">Selected Day Net Load vs {chartLabel}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {fmtDate(data?.selectedDate)} | Western Hub RT / Tetco M3 WVAP | HE1-HE24
                </p>
              </div>
              <div className="inline-flex rounded-md border border-gray-700 bg-gray-950 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setChartMetric("heatRate")}
                  className={`rounded px-3 py-1.5 transition-colors ${
                    chartMetric === "heatRate"
                      ? "bg-emerald-500/20 text-emerald-100"
                      : "text-gray-400 hover:text-gray-100"
                  }`}
                >
                  Heat Rate
                </button>
                <button
                  type="button"
                  onClick={() => setChartMetric("rtPrice")}
                  className={`rounded px-3 py-1.5 transition-colors ${
                    chartMetric === "rtPrice"
                      ? "bg-rose-500/20 text-rose-100"
                      : "text-gray-400 hover:text-gray-100"
                  }`}
                >
                  RT Price
                </button>
              </div>
            </div>
            <div className="h-[420px]">
              {selectedScatterRows.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 12, right: 24, bottom: 24, left: 8 }}>
                    <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="netLoadGw"
                      name="Net Load"
                      domain={scatterXDomain}
                      allowDataOverflow
                      tick={{ fill: "#9ca3af", fontSize: 12 }}
                      axisLine={{ stroke: "#4b5563" }}
                      tickLine={false}
                      tickFormatter={(value: number) => value.toFixed(0)}
                      label={{
                        value: "Net Load (GW)",
                        position: "insideBottom",
                        offset: -14,
                        fill: "#6b7280",
                        fontSize: 12,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="yValue"
                      name={chartLabel}
                      domain={scatterYDomain}
                      allowDataOverflow
                      tick={{ fill: "#9ca3af", fontSize: 12 }}
                      axisLine={{ stroke: "#4b5563" }}
                      tickLine={false}
                      tickFormatter={(value: number) =>
                        chartMetric === "heatRate" ? value.toFixed(0) : `$${value.toFixed(0)}`
                      }
                      label={{
                        value: chartUnitLabel,
                        angle: -90,
                        position: "insideLeft",
                        offset: 10,
                        fill: "#6b7280",
                        fontSize: 12,
                      }}
                    />
                    <Tooltip
                      content={<PriceScatterTooltip chartMetric={chartMetric} />}
                      cursor={{ stroke: "#64748b", strokeDasharray: "4 4", strokeWidth: 1 }}
                    />
                    <Scatter
                      name={chartLabel}
                      data={selectedScatterRows}
                      fill={chartMetric === "heatRate" ? "#34d399" : "#fb7185"}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  No selected-day chart data is available.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-100">Hourly Source Matrix</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {fmtDate(data?.selectedDate)} | {data?.rows.length ?? 0} rows x 24 HE
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-300">
                <input
                  type="checkbox"
                  checked={showDataSource}
                  onChange={(event) => setShowDataSource(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-700 bg-gray-900 text-sky-500 focus:ring-sky-500/40"
                />
                Data Source
              </label>
            </div>
            <div className="max-h-[72vh] overflow-auto rounded-md border border-gray-800">
              <table
                className={`w-max border-collapse bg-[#0d1119] text-xs text-gray-200 ${
                  showDataSource ? "min-w-[1800px]" : "min-w-[1500px]"
                }`}
              >
                <thead className="sticky top-0 z-30 bg-gray-950 text-gray-500">
                  <tr>
                    <th className="sticky left-0 top-0 z-50 w-[105px] bg-gray-950 px-3 py-2 text-left font-semibold uppercase tracking-wide shadow-[2px_0_0_rgba(31,41,55,0.9)]">
                      Metric
                    </th>
                    {showDataSource && (
                      <th className="sticky left-[105px] top-0 z-50 w-[305px] bg-gray-950 px-3 py-2 text-left font-semibold uppercase tracking-wide shadow-[2px_0_0_rgba(31,41,55,0.9)]">
                        Data Source
                      </th>
                    )}
                    {HOURS.map((hour) => (
                      <th
                        key={hour}
                        className="w-[58px] px-2 py-2 text-right font-semibold uppercase tracking-wide"
                      >
                        HE{hour}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data?.rows.map((row) => (
                    <tr key={`${row.metric}-${row.dataSource}`} className="hover:bg-gray-900/60">
                      <td
                        className={`sticky left-0 z-20 w-[105px] bg-[#0d1119] px-3 py-2 font-semibold shadow-[2px_0_0_rgba(31,41,55,0.9)] ${metricTextClass(row.metric)}`}
                      >
                        {row.metric}
                      </td>
                      {showDataSource && (
                        <td className="sticky left-[105px] z-20 w-[305px] bg-[#0d1119] px-3 py-2 shadow-[2px_0_0_rgba(31,41,55,0.9)]">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${verifiedClass(row.verified)}`}
                            >
                              {row.verified}
                            </span>
                            <span className="truncate font-semibold text-gray-100">{row.dataSource}</span>
                          </div>
                          <div className="mt-1 truncate text-[11px] font-normal text-gray-500">
                            {row.note}
                          </div>
                        </td>
                      )}
                      {HOURS.map((hour, index) => (
                        <td key={`${row.metric}-${hour}`} className="px-2 py-2 text-right tabular-nums">
                          {fmtMetricValue(row.metric, row.values[index])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!data?.rows.length && (
                    <tr>
                      <td colSpan={emptyColSpan} className="px-3 py-8 text-center text-sm text-gray-500">
                        {loading ? "Loading hourly price view..." : "No complete hourly matrix is available."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
