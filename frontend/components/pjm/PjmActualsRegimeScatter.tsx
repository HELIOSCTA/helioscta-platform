"use client";

import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type RtSource = "verified" | "unverified";
type PriceComponent = "total" | "energy" | "congestion" | "loss";
type SeasonFilter = "all" | "winter" | "spring" | "summer" | "fall";
type HourFilter = "all_hours" | "weekday_onpeak" | "all_he8_23" | "offpeak";
type DayType = "all" | "weekdays" | "weekends";
type RegimeColor = "season" | "outage" | "hour" | "year" | "price";
type ScatterMetric = "temp" | "load" | "price";
type ScatterProjection = "temp_load" | "temp_price" | "load_price";
type ActualsScatterTab = "historical_scatter" | "forecast_analog_distribution";
type DateMode = "exact" | "seasonal";

interface AvailableArea {
  area: string;
  rowCount: number;
  minEpt: string | null;
  maxEpt: string | null;
}

interface WeatherStation {
  stationId: string;
  stationName: string;
  region: string;
}

interface ScatterPoint {
  datetimeBeginningEpt: string | null;
  hourEnding: number;
  year: number;
  season: string;
  hourRegime: string;
  priceRegime: string;
  outageRegime: string;
  loadSource: string;
  grossLoadMw: number | null;
  windMw: number | null;
  solarMw: number | null;
  netLoadMw: number | null;
  tempF: number | null;
  dewPointF: number | null;
  feelsLikeF: number | null;
  rtPrice: number | null;
  totalOutagesMw: number | null;
  plannedOutagesMw: number | null;
  forcedOutagesMw: number | null;
  maintenanceOutagesMw: number | null;
  colorRegime: string;
}

interface ScatterPayload {
  iso: "pjm";
  source: string;
  formula: string;
  selected: {
    loadArea: string;
    generationArea: string;
    stationId: string;
    stationName: string;
    region: string;
    hub: string;
    rtSource: RtSource;
    component: PriceComponent;
    startDate: string | null;
    endDate: string | null;
    dateMode?: DateMode;
    seasonStart?: string;
    seasonEnd?: string;
    lookbackYears?: number;
    includeCurrentYear?: boolean;
    months: number[];
    years: number[];
    season: SeasonFilter;
    hourFilter: HourFilter;
    dayType: DayType;
    minPrice: number | null;
    maxPrice: number | null;
    minOutages: number | null;
    maxOutages: number | null;
    maxPoints: number;
    regimeColor: RegimeColor;
    regimeColorLabel: string;
  };
  availableLoadAreas: AvailableArea[];
  availableGenerationAreas: AvailableArea[];
  weatherStations: WeatherStation[];
  availableHubs: readonly string[];
  summary: {
    matchedCount: number;
    returnedCount: number;
    minEpt: string | null;
    maxEpt: string | null;
    avgTempF: number | null;
    avgNetLoadMw: number | null;
    avgRtPrice: number | null;
    minRtPrice: number | null;
    maxRtPrice: number | null;
    avgTotalOutagesMw: number | null;
    sampleStep: number;
    asOf: string | null;
  };
  priceDistribution: PriceDistributionPayload;
  points: ScatterPoint[];
}

export interface PjmActualsRegimeScatterFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface ProjectedPoint {
  point: ScatterPoint;
  x: number;
  y: number;
  depth: number;
  radius: number;
  color: string;
}

interface ScatterConfig {
  loadArea: string;
  generationArea: string;
  stationId: string;
  region: string;
  hub: string;
  rtSource: RtSource;
  component: PriceComponent;
  dateMode: DateMode;
  startDate: string;
  endDate: string;
  seasonStart: string;
  seasonEnd: string;
  lookbackYears: number;
  includeCurrentYear: boolean;
  season: SeasonFilter;
  hourFilter: HourFilter;
  dayType: DayType;
  regimeColor: RegimeColor;
  maxPoints: number;
  minPrice: string;
  maxPrice: string;
  minOutages: string;
  maxOutages: string;
  outagesEnabled: boolean;
}

interface Range {
  min: number;
  max: number;
}

interface PriceDistributionStats {
  count: number;
  minPrice: number | null;
  p05: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p95: number | null;
  maxPrice: number | null;
  meanPrice: number | null;
  stdDev: number | null;
  skewness: number | null;
}

interface PriceHistogramBin {
  binIndex: number;
  binStart: number | null;
  binEnd: number | null;
  count: number;
  pct: number | null;
}

interface PriceDistributionLatest {
  datetimeBeginningEpt: string | null;
  hourEnding: number;
  season: string | null;
  hourRegime: string | null;
  rtPrice: number | null;
  tempF: number | null;
  netLoadMw: number | null;
  totalOutagesMw: number | null;
  percentileRank: number | null;
  zScore: number | null;
}

interface PriceDistributionAnalogPoint {
  datetimeBeginningEpt: string | null;
  hourEnding: number;
  season: string | null;
  hourRegime: string | null;
  rtPrice: number | null;
  tempF: number | null;
  netLoadMw: number | null;
  totalOutagesMw: number | null;
  distance: number | null;
}

interface PriceDistributionPayload {
  stats: PriceDistributionStats;
  tails: {
    belowZero: number | null;
    above100: number | null;
    above250: number | null;
    above500: number | null;
  };
  histogram: PriceHistogramBin[];
  latest: PriceDistributionLatest | null;
  analog: {
    count: number;
    percentileRank: number | null;
    stats: PriceDistributionStats;
    points: PriceDistributionAnalogPoint[];
  };
}

interface ForecastAnalogHour {
  forecastDatetimeEpt: string | null;
  hourEnding: number;
  loadMw: number | null;
  windMw: number | null;
  solarMw: number | null;
  netLoadMw: number | null;
  tempF: number | null;
  totalOutagesMw: number | null;
  evaluatedAtEpt: string | null;
}

interface ForecastAnalogHourlyDistribution {
  forecastDatetimeEpt: string | null;
  hourEnding: number;
  analogCount: number;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p95: number | null;
}

interface ForecastAnalogPoint {
  targetDatetimeEpt: string | null;
  targetHourEnding: number;
  datetimeBeginningEpt: string | null;
  hourEnding: number;
  actualYear: number;
  rtPrice: number | null;
  tempF: number | null;
  netLoadMw: number | null;
  totalOutagesMw: number | null;
  distance: number | null;
}

interface ForecastAnalogPayload {
  iso: "pjm";
  source: string;
  formula: string;
  selected: {
    forecastDate?: string;
    hourStart?: number;
    hourEnd?: number;
    seasonStart?: string;
    seasonEnd?: string;
    lookbackYears?: number;
    includeCurrentYear?: boolean;
    analogsPerHour?: number;
  };
  availableForecastDates: string[];
  forecastHours: ForecastAnalogHour[];
  priceDistribution: {
    stats: PriceDistributionStats;
    tails: PriceDistributionPayload["tails"];
    histogram: PriceHistogramBin[];
  };
  hourlyDistributions: ForecastAnalogHourlyDistribution[];
  yearShift: {
    currentYear: number;
    currentYearCount: number;
    priorYearCount: number;
    currentYearMedian: number | null;
    priorYearMedian: number | null;
    medianShift: number | null;
  } | null;
  analogPoints: ForecastAnalogPoint[];
  summary: {
    forecastHourCount: number;
    historicalPoolCount: number;
    analogCount: number;
    asOf: string | null;
  };
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LOAD_AREA = "RTO";
const DEFAULT_GENERATION_AREA = "RTO";
const DEFAULT_STATION_ID = "PJM";
const DEFAULT_REGION = "PJM";
const DEFAULT_HUB = "WESTERN HUB";
const DEFAULT_MAX_POINTS = 1800;
const PALETTE = [
  "#38bdf8",
  "#f97316",
  "#22c55e",
  "#a78bfa",
  "#f43f5e",
  "#eab308",
  "#14b8a6",
  "#60a5fa",
  "#fb7185",
  "#c084fc",
  "#84cc16",
  "#f59e0b",
];
const COMPONENTS: Array<{ key: PriceComponent; label: string }> = [
  { key: "total", label: "Total LMP" },
  { key: "energy", label: "Energy" },
  { key: "congestion", label: "Congestion" },
  { key: "loss", label: "Loss" },
];
const SEASONS: Array<{ key: SeasonFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "winter", label: "Winter" },
  { key: "spring", label: "Spring" },
  { key: "summer", label: "Summer" },
  { key: "fall", label: "Fall" },
];
const HOUR_FILTERS: Array<{ key: HourFilter; label: string }> = [
  { key: "weekday_onpeak", label: "Weekday HE8-23" },
  { key: "all_he8_23", label: "All HE8-23" },
  { key: "offpeak", label: "Off-peak" },
  { key: "all_hours", label: "All hours" },
];
const DAY_TYPES: Array<{ key: DayType; label: string }> = [
  { key: "all", label: "All Days" },
  { key: "weekdays", label: "Weekdays" },
  { key: "weekends", label: "Weekends" },
];
const REGIME_COLORS: Array<{ key: RegimeColor; label: string }> = [
  { key: "season", label: "Season" },
  { key: "outage", label: "Outage" },
  { key: "hour", label: "Hour" },
  { key: "year", label: "Year" },
  { key: "price", label: "Price" },
];
const SCATTER_PROJECTIONS: Array<{
  key: ScatterProjection;
  label: string;
  xMetric: ScatterMetric;
  yMetric: ScatterMetric;
}> = [
  { key: "temp_load", label: "Temp x Load", xMetric: "temp", yMetric: "load" },
  { key: "temp_price", label: "Temp x Price", xMetric: "temp", yMetric: "price" },
  { key: "load_price", label: "Load x Price", xMetric: "load", yMetric: "price" },
];
const ACTUALS_SCATTER_TABS: Array<{ key: ActualsScatterTab; label: string }> = [
  { key: "historical_scatter", label: "Historical Scatter" },
  { key: "forecast_analog_distribution", label: "Forward Analog Prices" },
];
const FIELD_LABEL_CLASS = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500";
const FIELD_CONTROL_CLASS =
  "w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none";
const DEFAULT_FRESHNESS: PjmActualsRegimeScatterFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Price distributions --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  return addDaysIsoDate(todayIsoDate(), -1);
}

function defaultStartDate(): string {
  return addDaysIsoDate(defaultEndDate(), -364);
}

function defaultScatterConfig(): ScatterConfig {
  return {
    loadArea: DEFAULT_LOAD_AREA,
    generationArea: DEFAULT_GENERATION_AREA,
    stationId: DEFAULT_STATION_ID,
    region: DEFAULT_REGION,
    hub: DEFAULT_HUB,
    rtSource: "verified",
    component: "total",
    dateMode: "exact",
    startDate: defaultStartDate(),
    endDate: defaultEndDate(),
    seasonStart: "05-01",
    seasonEnd: "08-31",
    lookbackYears: 3,
    includeCurrentYear: true,
    season: "all",
    hourFilter: "weekday_onpeak",
    dayType: "all",
    regimeColor: "season",
    maxPoints: DEFAULT_MAX_POINTS,
    minPrice: "",
    maxPrice: "",
    minOutages: "",
    maxOutages: "",
    outagesEnabled: true,
  };
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function fmtNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function fmtMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString()} MW`;
}

function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const digits = value > 0 && value < 0.1 ? 1 : 0;
  return `${(value * 100).toFixed(digits)}%`;
}

function metricLabel(metric: ScatterMetric): string {
  if (metric === "temp") return "Temp F";
  if (metric === "load") return "Net Load";
  return "RT Price";
}

function metricColor(metric: ScatterMetric): string {
  if (metric === "temp") return "#f97316";
  if (metric === "load") return "#22c55e";
  return "#38bdf8";
}

function metricValue(point: ScatterPoint, metric: ScatterMetric): number | null {
  if (metric === "temp") return point.tempF;
  if (metric === "load") return point.netLoadMw;
  return point.rtPrice;
}

function fmtMetric(metric: ScatterMetric, value: number | null | undefined): string {
  if (metric === "temp") return `${fmtNumber(value, 1)} F`;
  if (metric === "load") return fmtMw(value);
  return fmtPrice(value);
}

function maybeNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? String(parsed) : null;
}

function bounds(values: number[]): Range {
  if (!values.length) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return { min: min - 1, max: max + 1 };
  return { min, max };
}

function scale(value: number, range: Range): number {
  return ((value - range.min) / (range.max - range.min)) * 2 - 1;
}

function colorMap(regimes: string[]): Map<string, string> {
  return new Map(regimes.map((regime, index) => [regime, PALETTE[index % PALETTE.length]]));
}

function pointColor(point: ScatterPoint, colors: Map<string, string>): string {
  return colors.get(point.colorRegime) ?? "#94a3b8";
}

function freshnessFromPayload(
  payload: ScatterPayload | null,
): PjmActualsRegimeScatterFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  return {
    status: payload.summary.asOf ? "Current" : "No Data",
    statusClass: payload.summary.asOf
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
    summary: `${payload.summary.returnedCount.toLocaleString()} plotted | ${payload.summary.matchedCount.toLocaleString()} matched`,
    targetDateLabel: `${payload.selected.loadArea} | ${payload.selected.hub}`,
    latestDateLabel: `${fmtDate(payload.summary.minEpt)} to ${fmtDate(payload.summary.maxEpt)}`,
    latestUpdateLabel: fmtDateTime(payload.summary.asOf),
  };
}

function buildUrl({
  loadArea,
  generationArea,
  stationId,
  region,
  hub,
  rtSource,
  component,
  dateMode,
  startDate,
  endDate,
  seasonStart,
  seasonEnd,
  lookbackYears,
  includeCurrentYear,
  season,
  hourFilter,
  dayType,
  regimeColor,
  maxPoints,
  minPrice,
  maxPrice,
  minOutages,
  maxOutages,
  refresh,
}: {
  loadArea: string;
  generationArea: string;
  stationId: string;
  region: string;
  hub: string;
  rtSource: RtSource;
  component: PriceComponent;
  dateMode: DateMode;
  startDate: string;
  endDate: string;
  seasonStart: string;
  seasonEnd: string;
  lookbackYears: number;
  includeCurrentYear: boolean;
  season: SeasonFilter;
  hourFilter: HourFilter;
  dayType: DayType;
  regimeColor: RegimeColor;
  maxPoints: number;
  minPrice: string;
  maxPrice: string;
  minOutages: string;
  maxOutages: string;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({
    loadArea,
    generationArea,
    stationId,
    region,
    hub,
    rtSource,
    component,
    dateMode,
    start: startDate,
    end: endDate,
    season,
    hourFilter,
    dayType,
    regimeColor,
    maxPoints: String(maxPoints),
  });
  if (dateMode === "seasonal") {
    params.set("seasonStart", seasonStart);
    params.set("seasonEnd", seasonEnd);
    params.set("lookbackYears", String(lookbackYears));
    params.set("includeCurrentYear", includeCurrentYear ? "1" : "0");
  }
  const minPriceParam = maybeNumber(minPrice);
  const maxPriceParam = maybeNumber(maxPrice);
  const minOutagesParam = maybeNumber(minOutages);
  const maxOutagesParam = maybeNumber(maxOutages);
  if (minPriceParam !== null) params.set("minPrice", minPriceParam);
  if (maxPriceParam !== null) params.set("maxPrice", maxPriceParam);
  if (minOutagesParam !== null) params.set("minOutages", minOutagesParam);
  if (maxOutagesParam !== null) params.set("maxOutages", maxOutagesParam);
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-actuals-regime-scatter?${params.toString()}`;
}

function cacheKey({
  loadArea,
  generationArea,
  stationId,
  region,
  hub,
  rtSource,
  component,
  dateMode,
  startDate,
  endDate,
  seasonStart,
  seasonEnd,
  lookbackYears,
  includeCurrentYear,
  season,
  hourFilter,
  dayType,
  regimeColor,
  maxPoints,
  minPrice,
  maxPrice,
  minOutages,
  maxOutages,
}: {
  loadArea: string;
  generationArea: string;
  stationId: string;
  region: string;
  hub: string;
  rtSource: RtSource;
  component: PriceComponent;
  dateMode: DateMode;
  startDate: string;
  endDate: string;
  seasonStart: string;
  seasonEnd: string;
  lookbackYears: number;
  includeCurrentYear: boolean;
  season: SeasonFilter;
  hourFilter: HourFilter;
  dayType: DayType;
  regimeColor: RegimeColor;
  maxPoints: number;
  minPrice: string;
  maxPrice: string;
  minOutages: string;
  maxOutages: string;
}): string {
  return [
    "api:pjm-actuals-regime-scatter",
    loadArea,
    generationArea,
    stationId,
    region,
    hub,
    rtSource,
    component,
    dateMode,
    startDate,
    endDate,
    seasonStart,
    seasonEnd,
    lookbackYears,
    includeCurrentYear,
    season,
    hourFilter,
    dayType,
    regimeColor,
    maxPoints,
    minPrice,
    maxPrice,
    minOutages,
    maxOutages,
  ].join(":");
}

function buildForecastAnalogUrl({
  config,
  forecastDate,
  hourStart,
  hourEnd,
  seasonStart,
  seasonEnd,
  lookbackYears,
  includeCurrentYear,
  analogsPerHour,
}: {
  config: ScatterConfig;
  forecastDate: string;
  hourStart: number;
  hourEnd: number;
  seasonStart: string;
  seasonEnd: string;
  lookbackYears: number;
  includeCurrentYear: boolean;
  analogsPerHour: number;
}): string {
  const params = new URLSearchParams({
    loadArea: config.loadArea,
    generationArea: config.generationArea,
    stationId: config.stationId,
    region: config.region,
    hub: config.hub,
    rtSource: config.rtSource,
    component: config.component,
    hourStart: String(hourStart),
    hourEnd: String(hourEnd),
    seasonStart,
    seasonEnd,
    lookbackYears: String(lookbackYears),
    includeCurrentYear: includeCurrentYear ? "1" : "0",
    dayType: config.dayType,
    analogsPerHour: String(analogsPerHour),
  });
  if (forecastDate) params.set("forecastDate", forecastDate);
  const minPriceParam = maybeNumber(config.minPrice);
  const maxPriceParam = maybeNumber(config.maxPrice);
  const minOutagesParam = config.outagesEnabled ? maybeNumber(config.minOutages) : null;
  const maxOutagesParam = config.outagesEnabled ? maybeNumber(config.maxOutages) : null;
  if (minPriceParam !== null) params.set("minPrice", minPriceParam);
  if (maxPriceParam !== null) params.set("maxPrice", maxPriceParam);
  if (minOutagesParam !== null) params.set("minOutages", minOutagesParam);
  if (maxOutagesParam !== null) params.set("maxOutages", maxOutagesParam);
  return `/api/pjm-forecast-price-analogs?${params.toString()}`;
}

function forecastAnalogCacheKey({
  config,
  forecastDate,
  hourStart,
  hourEnd,
  seasonStart,
  seasonEnd,
  lookbackYears,
  includeCurrentYear,
  analogsPerHour,
}: {
  config: ScatterConfig;
  forecastDate: string;
  hourStart: number;
  hourEnd: number;
  seasonStart: string;
  seasonEnd: string;
  lookbackYears: number;
  includeCurrentYear: boolean;
  analogsPerHour: number;
}): string {
  return [
    "api:pjm-forecast-price-analogs",
    config.loadArea,
    config.generationArea,
    config.stationId,
    config.region,
    config.hub,
    config.rtSource,
    config.component,
    forecastDate || "default",
    hourStart,
    hourEnd,
    seasonStart,
    seasonEnd,
    lookbackYears,
    includeCurrentYear,
    config.dayType,
    config.minPrice,
    config.maxPrice,
    config.outagesEnabled ? config.minOutages : "",
    config.outagesEnabled ? config.maxOutages : "",
    analogsPerHour,
  ].join(":");
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gray-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function ConfigSection({
  step,
  title,
  summary,
  children,
}: {
  step: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <details open className="group rounded-lg border border-gray-800 bg-gray-950/30">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-700 bg-gray-900 text-xs font-bold text-gray-200">
          {step}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-100">{title}</span>
          <span className="mt-0.5 block text-xs text-gray-500">{summary}</span>
        </span>
      </summary>
      <div className="border-t border-gray-800 p-4">{children}</div>
    </details>
  );
}

function ConfigField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

function SourceSwitch({
  enabled,
  disabled,
  onChange,
  label,
}: {
  enabled: boolean;
  disabled?: boolean;
  onChange?: (enabled: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!enabled)}
      className={`relative h-6 w-11 rounded-full border transition-colors ${
        enabled
          ? "border-emerald-500/40 bg-emerald-500/25"
          : "border-gray-700 bg-gray-900"
      } ${disabled ? "cursor-not-allowed opacity-70" : "hover:border-gray-500"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-gray-100 transition-transform ${
          enabled ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function DataSourceCard({
  title,
  description,
  enabled,
  required,
  meta,
  onToggle,
}: {
  title: string;
  description: string;
  enabled: boolean;
  required?: boolean;
  meta: string;
  onToggle?: (enabled: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-[#0d1119] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-100">{title}</p>
          <p className="mt-1 text-xs text-gray-500">{description}</p>
        </div>
        <SourceSwitch
          enabled={enabled}
          disabled={required}
          onChange={onToggle}
          label={`${title} ${enabled ? "enabled" : "disabled"}`}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
            enabled
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-gray-700 bg-gray-900 text-gray-500"
          }`}
        >
          {enabled ? "Enabled" : "Disabled"}
        </span>
        {required && (
          <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-200">
            Required
          </span>
        )}
        <span className="min-w-0 truncate text-xs text-gray-500">{meta}</span>
      </div>
    </div>
  );
}

function ActualPriceDistributionPanel({
  distribution,
  componentLabel,
  sourceWindow,
}: {
  distribution: PriceDistributionPayload;
  componentLabel: string;
  sourceWindow: string;
}) {
  const stats = distribution.stats;
  const histogram = distribution.histogram;
  const latest = distribution.latest;
  const analog = distribution.analog;
  const tailRows = [
    { label: "Below $0", value: distribution.tails.belowZero },
    { label: "Above $100", value: distribution.tails.above100 },
    { label: "Above $250", value: distribution.tails.above250 },
    { label: "Above $500", value: distribution.tails.above500 },
  ];

  if (!stats.count) {
    return (
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500 shadow-xl shadow-black/20">
        No actual RT price distribution is available for the selected filters.
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20">
      <div className="flex flex-col gap-3 border-b border-gray-800 p-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-100">Actual RT Price Distribution</h2>
          <p className="mt-1 text-xs text-gray-500">
            {componentLabel} | {sourceWindow} | {stats.count.toLocaleString()} matched hours
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs tabular-nums sm:grid-cols-4">
          {tailRows.map((row) => (
            <div key={row.label} className="rounded-md border border-gray-800 bg-gray-950/50 px-3 py-2">
              <p className="text-gray-500">{row.label}</p>
              <p className="mt-1 font-semibold text-gray-100">{fmtPct(row.value)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <StatTile label="P05" value={fmtPrice(stats.p05)} />
            <StatTile label="P25" value={fmtPrice(stats.p25)} />
            <StatTile label="Median" value={fmtPrice(stats.median)} />
            <StatTile label="P75" value={fmtPrice(stats.p75)} />
            <StatTile label="P95" value={fmtPrice(stats.p95)} />
            <StatTile label="Std Dev" value={fmtPrice(stats.stdDev)} sub={`Skew ${fmtNumber(stats.skewness, 2)}`} />
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Histogram</p>
              <p className="text-xs tabular-nums text-gray-500">
                {fmtPrice(stats.minPrice)} to {fmtPrice(stats.maxPrice)}
              </p>
            </div>
            <div className="space-y-1.5">
              {histogram.map((bin) => (
                <div key={bin.binIndex} className="grid grid-cols-[112px_1fr_54px] items-center gap-2 text-xs">
                  <span className="truncate text-gray-500">
                    {fmtPrice(bin.binStart)} to {fmtPrice(bin.binEnd)}
                  </span>
                  <div className="h-5 overflow-hidden rounded-sm bg-gray-900">
                    <div
                      className="h-full bg-sky-400/70"
                      style={{ width: `${Math.max((bin.pct ?? 0) * 100, bin.count ? 2 : 0)}%` }}
                    />
                  </div>
                  <span className="text-right tabular-nums text-gray-400">{bin.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Latest Actual Position</p>
            {latest ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-500">Hour</dt>
                  <dd className="text-right font-semibold text-gray-200">{fmtDateTime(latest.datetimeBeginningEpt)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-500">RT Price</dt>
                  <dd className="text-right font-semibold text-gray-200">{fmtPrice(latest.rtPrice)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-500">Overall Rank</dt>
                  <dd className="text-right font-semibold text-gray-200">{fmtPct(latest.percentileRank)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-500">Z Score</dt>
                  <dd className="text-right font-semibold text-gray-200">{fmtNumber(latest.zScore, 2)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-500">Temp</dt>
                  <dd className="text-right font-semibold text-gray-200">{fmtNumber(latest.tempF, 1)} F</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-500">Net Load</dt>
                  <dd className="text-right font-semibold text-gray-200">{fmtMw(latest.netLoadMw)}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-gray-500">No latest actual hour is available.</p>
            )}
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Nearest Analog Set</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-gray-500">Analog Hours</dt>
                <dd className="text-right font-semibold text-gray-200">
                  {analog.count.toLocaleString()}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-gray-500">Analog Rank</dt>
                <dd className="text-right font-semibold text-gray-200">{fmtPct(analog.percentileRank)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-gray-500">Analog Median</dt>
                <dd className="text-right font-semibold text-gray-200">{fmtPrice(analog.stats.median)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-gray-500">Analog P95</dt>
                <dd className="text-right font-semibold text-gray-200">{fmtPrice(analog.stats.p95)}</dd>
              </div>
            </dl>
            <div className="mt-3 space-y-1.5">
              {analog.points.slice(0, 5).map((point) => (
                <div
                  key={`${point.datetimeBeginningEpt}-${point.hourEnding}`}
                  className="grid grid-cols-[1fr_auto] gap-2 rounded-md border border-gray-800 bg-[#0d1119] px-2.5 py-2 text-xs"
                >
                  <span className="truncate text-gray-400">{fmtDateTime(point.datetimeBeginningEpt)}</span>
                  <span className="tabular-nums text-gray-200">{fmtPrice(point.rtPrice)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Scatter2DCanvas({
  points,
  widthClass,
}: {
  points: ScatterPoint[];
  widthClass?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
  }>({
    active: false,
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
    moved: false,
  });
  const projectedRef = useRef<ProjectedPoint[]>([]);
  const [size, setSize] = useState({ width: 360, height: 540 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [projection, setProjection] = useState<ScatterProjection>("temp_load");
  const [swapAxes, setSwapAxes] = useState(false);
  const [hover, setHover] = useState<ProjectedPoint | null>(null);
  const [selected, setSelected] = useState<ProjectedPoint | null>(null);

  const validPoints = useMemo(
    () =>
      points.filter(
        (point) =>
          point.tempF !== null && point.netLoadMw !== null && point.rtPrice !== null,
      ),
    [points],
  );
  const regimes = useMemo(
    () => Array.from(new Set(validPoints.map((point) => point.colorRegime))).sort(),
    [validPoints],
  );
  const colors = useMemo(() => colorMap(regimes), [regimes]);
  const regimeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const point of validPoints) {
      counts.set(point.colorRegime, (counts.get(point.colorRegime) ?? 0) + 1);
    }
    return counts;
  }, [validPoints]);
  const inspectedPoint = selected ?? hover;
  const projectionConfig =
    SCATTER_PROJECTIONS.find((item) => item.key === projection) ?? SCATTER_PROJECTIONS[0];
  const xMetric = swapAxes ? projectionConfig.yMetric : projectionConfig.xMetric;
  const yMetric = swapAxes ? projectionConfig.xMetric : projectionConfig.yMetric;
  const ranges = useMemo<Record<ScatterMetric, Range>>(
    () => ({
      temp: bounds(validPoints.map((point) => point.tempF ?? 0)),
      load: bounds(validPoints.map((point) => point.netLoadMw ?? 0)),
      price: bounds(validPoints.map((point) => point.rtPrice ?? 0)),
    }),
    [validPoints],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(Math.round(rect.width), 360),
        height: Math.max(Math.round(rect.height), 420),
      });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = "#0d1119";
    ctx.fillRect(0, 0, size.width, size.height);

    const left = 70;
    const right = size.width - 24;
    const top = 28;
    const bottom = size.height - 64;
    const plotWidth = Math.max(right - left, 120);
    const plotHeight = Math.max(bottom - top, 120);
    const centerX = left + plotWidth / 2 + pan.x;
    const centerY = top + plotHeight / 2 + pan.y;
    const effectiveWidth = plotWidth * zoom;
    const effectiveHeight = plotHeight * zoom;
    const xRange = ranges[xMetric];
    const yRange = ranges[yMetric];

    const project = (xValue: number, yValue: number) => {
      return {
        x: centerX + scale(xValue, xRange) * (effectiveWidth / 2),
        y: centerY - scale(yValue, yRange) * (effectiveHeight / 2),
      };
    };

    ctx.fillStyle = "#101623";
    ctx.fillRect(left, top, plotWidth, plotHeight);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.26)";
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, plotWidth, plotHeight);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px system-ui, sans-serif";
    for (let tick = 0; tick <= 4; tick += 1) {
      const ratio = tick / 4;
      const x = left + ratio * plotWidth;
      const y = bottom - ratio * plotHeight;
      const xValue = xRange.min + (xRange.max - xRange.min) * ratio;
      const yValue = yRange.min + (yRange.max - yRange.min) * ratio;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "center";
      ctx.fillText(fmtMetric(xMetric, xValue), x, bottom + 18);
      ctx.textAlign = "right";
      ctx.fillText(fmtMetric(yMetric, yValue), left - 8, y + 4);
    }

    ctx.textAlign = "center";
    ctx.fillStyle = metricColor(xMetric);
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(metricLabel(xMetric), left + plotWidth / 2, size.height - 18);
    ctx.save();
    ctx.translate(18, top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = metricColor(yMetric);
    ctx.fillText(metricLabel(yMetric), 0, 0);
    ctx.restore();

    const projected = validPoints.map<ProjectedPoint>((point) => {
      const xValue = metricValue(point, xMetric) ?? 0;
      const yValue = metricValue(point, yMetric) ?? 0;
      const p = project(xValue, yValue);
      const outage = Math.max(point.totalOutagesMw ?? 0, 0);
      const radius = 2.5 + Math.min(Math.sqrt(outage) / 95, 3);
      return {
        point,
        x: p.x,
        y: p.y,
        depth: outage,
        radius,
        color: pointColor(point, colors),
      };
    });
    projected.sort((leftPoint, rightPoint) => leftPoint.depth - rightPoint.depth);
    projectedRef.current = projected;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, plotWidth, plotHeight);
    ctx.clip();
    for (const item of projected) {
      ctx.globalAlpha = inspectedPoint?.point === item.point ? 1 : 0.72;
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(
        item.x,
        item.y,
        inspectedPoint?.point === item.point ? item.radius + 2.5 : item.radius,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.textAlign = "left";
    ctx.fillStyle = "#9ca3af";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(
      `${metricLabel(xMetric)}: ${fmtMetric(xMetric, xRange.min)} to ${fmtMetric(xMetric, xRange.max)}`,
      left,
      18,
    );
    ctx.textAlign = "right";
    ctx.fillText(
      `${metricLabel(yMetric)}: ${fmtMetric(yMetric, yRange.min)} to ${fmtMetric(yMetric, yRange.max)}`,
      right,
      18,
    );
  }, [
    colors,
    inspectedPoint?.point,
    pan.x,
    pan.y,
    ranges,
    size,
    validPoints,
    xMetric,
    yMetric,
    zoom,
  ]);

  useEffect(() => {
    setHover(null);
    setSelected(null);
  }, [points]);

  useEffect(() => {
    setHover(null);
    setSelected(null);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [projection, swapAxes]);

  const nearestPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return projectedRef.current.reduce<ProjectedPoint | null>((best, item) => {
      const distance = Math.hypot(item.x - x, item.y - y);
      if (distance > Math.max(14, item.radius + 8)) return best;
      if (!best) return item;
      return distance < Math.hypot(best.x - x, best.y - y) ? item : best;
    }, null);
  };

  const updateHover = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const nearest = nearestPoint(event);
    setHover(nearest);
    return nearest;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active) {
      const dx = event.clientX - dragRef.current.x;
      const dy = event.clientY - dragRef.current.y;
      const totalMove = Math.hypot(
        event.clientX - dragRef.current.startX,
        event.clientY - dragRef.current.startY,
      );
      dragRef.current = {
        ...dragRef.current,
        x: event.clientX,
        y: event.clientY,
        moved: dragRef.current.moved || totalMove > 4,
      };
      setPan((value) => ({ x: value.x + dx, y: value.y + dy }));
    }
    updateHover(event);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const wasClick = !dragRef.current.moved;
    dragRef.current.active = false;
    if (wasClick) {
      setSelected(updateHover(event));
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    setZoom((value) => Math.max(0.65, Math.min(3, value + (event.deltaY < 0 ? 0.1 : -0.1))));
  };

  const rotatePane = () => {
    const currentIndex = SCATTER_PROJECTIONS.findIndex((item) => item.key === projection);
    const nextIndex = (Math.max(currentIndex, 0) + 1) % SCATTER_PROJECTIONS.length;
    setProjection(SCATTER_PROJECTIONS[nextIndex].key);
    setSwapAxes(false);
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20">
      <div className="flex flex-col gap-3 border-b border-gray-800 p-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-100">Actuals 2D Scatter</h2>
          <p className="mt-1 text-xs text-gray-500">
            {validPoints.length.toLocaleString()} points | X {metricLabel(xMetric)}, Y {metricLabel(yMetric)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-gray-700">
            {SCATTER_PROJECTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setProjection(item.key);
                  setSwapAxes(false);
                }}
                className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                  projection === item.key && !swapAxes
                    ? "bg-gray-200 text-gray-950"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={rotatePane}
            className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Rotate Pane
          </button>
          <button
            type="button"
            onClick={() => setSwapAxes((value) => !value)}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
              swapAxes
                ? "border-gray-200 bg-gray-200 text-gray-950"
                : "border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
            }`}
          >
            Swap Axes
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Reset View
          </button>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(value + 0.12, 1.8))}
            className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Zoom In
          </button>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(value - 0.12, 0.7))}
            className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Zoom Out
          </button>
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Clear Point
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-0 xl:grid-cols-[1fr_220px]">
        <div ref={containerRef} className={`relative h-[540px] min-h-[420px] w-full ${widthClass ?? ""}`}>
          <canvas
            ref={canvasRef}
            className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={() => {
              dragRef.current.active = false;
              setHover(null);
            }}
            onWheel={handleWheel}
            aria-label="2D scatter plot of hourly actual temp, net load, and RT price"
          />
        </div>
        <div className="border-t border-gray-800 p-3 xl:border-l xl:border-t-0">
          <div className="mb-4 rounded-md border border-gray-800 bg-gray-950/50 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Point Detail
            </p>
            {inspectedPoint ? (
              <>
                <p className="truncate text-xs font-semibold text-gray-100">
                  {fmtDateTime(inspectedPoint.point.datetimeBeginningEpt)}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
                  <span className="text-gray-500">Temp</span>
                  <span className="text-right text-gray-200">
                    {fmtNumber(inspectedPoint.point.tempF, 1)} F
                  </span>
                  <span className="text-gray-500">Net Load</span>
                  <span className="text-right text-gray-200">{fmtMw(inspectedPoint.point.netLoadMw)}</span>
                  <span className="text-gray-500">RT Price</span>
                  <span className="text-right text-gray-200">{fmtPrice(inspectedPoint.point.rtPrice)}</span>
                  <span className="text-gray-500">Gross Load</span>
                  <span className="text-right text-gray-200">{fmtMw(inspectedPoint.point.grossLoadMw)}</span>
                  <span className="text-gray-500">Wind</span>
                  <span className="text-right text-gray-200">{fmtMw(inspectedPoint.point.windMw)}</span>
                  <span className="text-gray-500">Solar</span>
                  <span className="text-right text-gray-200">{fmtMw(inspectedPoint.point.solarMw)}</span>
                  <span className="text-gray-500">Outages</span>
                  <span className="text-right text-gray-200">{fmtMw(inspectedPoint.point.totalOutagesMw)}</span>
                  <span className="text-gray-500">Regime</span>
                  <span className="truncate text-right text-gray-200">{inspectedPoint.point.colorRegime}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500">No point selected.</p>
            )}
          </div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Regimes</p>
          <div className="space-y-1.5">
            {regimes.map((regime) => (
              <div key={regime} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-gray-300">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: colors.get(regime) ?? "#94a3b8" }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{regime}</span>
                </span>
                <span className="shrink-0 tabular-nums text-gray-500">
                  {(regimeCounts.get(regime) ?? 0).toLocaleString()}
                </span>
              </div>
            ))}
            {!regimes.length && <p className="text-xs text-gray-500">No regimes.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ForecastAnalogDistributionPanel({
  config,
  componentLabel,
}: {
  config: ScatterConfig;
  componentLabel: string;
}) {
  const [forecastDate, setForecastDate] = useState("");
  const [hourStart, setHourStart] = useState(8);
  const [hourEnd, setHourEnd] = useState(23);
  const [seasonStart, setSeasonStart] = useState(config.seasonStart);
  const [seasonEnd, setSeasonEnd] = useState(config.seasonEnd);
  const [lookbackYears, setLookbackYears] = useState(config.lookbackYears);
  const [includeCurrentYear, setIncludeCurrentYear] = useState(true);
  const [analogsPerHour, setAnalogsPerHour] = useState(20);
  const [data, setData] = useState<ForecastAnalogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    const request = {
      config,
      forecastDate,
      hourStart,
      hourEnd,
      seasonStart,
      seasonEnd,
      lookbackYears,
      includeCurrentYear,
      analogsPerHour,
    };

    fetchJsonWithCache<ForecastAnalogPayload>({
      key: forecastAnalogCacheKey(request),
      url: buildForecastAnalogUrl(request),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setError(err.message || "Failed to load forecast analog distribution");
        setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    analogsPerHour,
    config,
    forecastDate,
    hourEnd,
    hourStart,
    includeCurrentYear,
    lookbackYears,
    seasonEnd,
    seasonStart,
  ]);

  const selectedForecastDate = data?.selected.forecastDate ?? forecastDate;
  const stats = data?.priceDistribution.stats;
  const tails = data?.priceDistribution.tails;
  const yearShift = data?.yearShift;

  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20">
      <div className="border-b border-gray-800 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Forward Analog Prices</h2>
            <p className="mt-1 max-w-4xl text-sm text-gray-500">
              Latest forecast fundamentals are matched against similar historical actual hours to form a
              forward RT price distribution for {config.hub} {componentLabel}.
            </p>
          </div>
          <div className="rounded-md border border-gray-800 bg-gray-950/50 px-3 py-2 text-xs text-gray-400">
            {config.rtSource} RT | {config.loadArea} load | {config.generationArea} renewables
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-3 xl:grid-cols-[1fr_96px_96px_96px_110px_130px_130px] xl:items-end">
          <ConfigField label="Forecast date">
            <select
              value={selectedForecastDate ?? ""}
              onChange={(event) => setForecastDate(event.target.value)}
              className={FIELD_CONTROL_CLASS}
            >
              {(data?.availableForecastDates ?? []).map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
              {!data?.availableForecastDates.length && <option value="">Latest available</option>}
            </select>
          </ConfigField>
          <ConfigField label="HE start">
            <input
              type="number"
              min={1}
              max={24}
              value={hourStart}
              onChange={(event) => setHourStart(Number(event.target.value))}
              className={FIELD_CONTROL_CLASS}
            />
          </ConfigField>
          <ConfigField label="HE end">
            <input
              type="number"
              min={1}
              max={24}
              value={hourEnd}
              onChange={(event) => setHourEnd(Number(event.target.value))}
              className={FIELD_CONTROL_CLASS}
            />
          </ConfigField>
          <ConfigField label="Years">
            <input
              type="number"
              min={1}
              max={5}
              value={lookbackYears}
              onChange={(event) => setLookbackYears(Number(event.target.value))}
              className={FIELD_CONTROL_CLASS}
            />
          </ConfigField>
          <ConfigField label="Analogs / HE">
            <input
              type="number"
              min={5}
              max={60}
              value={analogsPerHour}
              onChange={(event) => setAnalogsPerHour(Number(event.target.value))}
              className={FIELD_CONTROL_CLASS}
            />
          </ConfigField>
          <ConfigField label="MM-DD start">
            <input
              inputMode="numeric"
              value={seasonStart}
              onChange={(event) => setSeasonStart(event.target.value)}
              className={FIELD_CONTROL_CLASS}
            />
          </ConfigField>
          <ConfigField label="MM-DD end">
            <input
              inputMode="numeric"
              value={seasonEnd}
              onChange={(event) => setSeasonEnd(event.target.value)}
              className={FIELD_CONTROL_CLASS}
            />
          </ConfigField>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
          <div>
            <p className="text-sm font-semibold text-gray-100">Include Current Year In Analog Pool</p>
            <p className="mt-1 text-xs text-gray-500">
              Keeps this year visible so shifts versus prior years can show up in the distribution.
            </p>
          </div>
          <SourceSwitch
            enabled={includeCurrentYear}
            onChange={setIncludeCurrentYear}
            label="Include current year in forecast analog distribution"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {loading && (
          <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-6 text-sm text-gray-500">
            Loading forecast analog distribution...
          </div>
        )}

        {data && !loading && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <StatTile
                label="Forecast Hours"
                value={data.summary.forecastHourCount.toLocaleString()}
                sub={`${data.selected.forecastDate ?? "-"} HE${data.selected.hourStart}-${data.selected.hourEnd}`}
              />
              <StatTile
                label="Historical Pool"
                value={data.summary.historicalPoolCount.toLocaleString()}
                sub={`${seasonStart} to ${seasonEnd}`}
              />
              <StatTile label="Analog Hours" value={data.summary.analogCount.toLocaleString()} />
              <StatTile label="Median RT" value={fmtPrice(stats?.median)} />
              <StatTile label="P95 RT" value={fmtPrice(stats?.p95)} />
              <StatTile
                label={`${yearShift?.currentYear ?? new Date().getFullYear()} Shift`}
                value={fmtPrice(yearShift?.medianShift)}
                sub={`${yearShift?.currentYearCount ?? 0} current-year analogs`}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Forecast-Conditioned RT Price Histogram
                  </p>
                  <p className="text-xs tabular-nums text-gray-500">
                    {fmtPrice(stats?.minPrice)} to {fmtPrice(stats?.maxPrice)}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {data.priceDistribution.histogram.map((bin) => (
                    <div key={bin.binIndex} className="grid grid-cols-[112px_1fr_54px] items-center gap-2 text-xs">
                      <span className="truncate text-gray-500">
                        {fmtPrice(bin.binStart)} to {fmtPrice(bin.binEnd)}
                      </span>
                      <div className="h-5 overflow-hidden rounded-sm bg-gray-900">
                        <div
                          className="h-full bg-sky-400/70"
                          style={{ width: `${Math.max((bin.pct ?? 0) * 100, bin.count ? 2 : 0)}%` }}
                        />
                      </div>
                      <span className="text-right tabular-nums text-gray-400">{bin.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Tail Risk</p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Below $0</dt>
                      <dd className="font-semibold text-gray-200">{fmtPct(tails?.belowZero)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Above $100</dt>
                      <dd className="font-semibold text-gray-200">{fmtPct(tails?.above100)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Above $250</dt>
                      <dd className="font-semibold text-gray-200">{fmtPct(tails?.above250)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Above $500</dt>
                      <dd className="font-semibold text-gray-200">{fmtPct(tails?.above500)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Year Shift</p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Current Median</dt>
                      <dd className="font-semibold text-gray-200">{fmtPrice(yearShift?.currentYearMedian)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Prior Median</dt>
                      <dd className="font-semibold text-gray-200">{fmtPrice(yearShift?.priorYearMedian)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Median Shift</dt>
                      <dd className="font-semibold text-gray-200">{fmtPrice(yearShift?.medianShift)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            <DataTableShell
              title="Forecast Fundamentals"
              subtitle={`${data.forecastHours.length.toLocaleString()} target hours from latest forecast issue`}
              bodyClassName="max-h-[360px] overflow-y-auto"
            >
              <table className="w-full min-w-[840px] border-collapse bg-[#0d1119] text-[11px] text-gray-200">
                <thead className="sticky top-0 z-10 bg-gray-950 text-gray-500">
                  <tr>
                    {["Hour", "HE", "Net Load", "Temp", "Outages", "Load", "Wind", "Solar", "Issue"].map((label) => (
                      <th key={label} className="px-3 py-2 text-right font-semibold uppercase tracking-wide first:text-left">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.forecastHours.map((hour) => (
                    <tr key={`${hour.forecastDatetimeEpt}-${hour.hourEnding}`} className="hover:bg-gray-900/60">
                      <td className="px-3 py-2 text-left font-medium text-gray-300">{fmtDateTime(hour.forecastDatetimeEpt)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{hour.hourEnding}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMw(hour.netLoadMw)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(hour.tempF, 1)} F</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMw(hour.totalOutagesMw)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMw(hour.loadMw)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMw(hour.windMw)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMw(hour.solarMw)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{fmtDateTime(hour.evaluatedAtEpt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>

            <DataTableShell
              title="Hourly Price Quantiles"
              subtitle="Analog distribution by target delivery hour"
              bodyClassName="max-h-[360px] overflow-y-auto"
            >
              <table className="w-full min-w-[720px] border-collapse bg-[#0d1119] text-[11px] text-gray-200">
                <thead className="sticky top-0 z-10 bg-gray-950 text-gray-500">
                  <tr>
                    {["Target Hour", "HE", "Analogs", "P25", "Median", "P75", "P95"].map((label) => (
                      <th key={label} className="px-3 py-2 text-right font-semibold uppercase tracking-wide first:text-left">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.hourlyDistributions.map((hour) => (
                    <tr key={`${hour.forecastDatetimeEpt}-${hour.hourEnding}`} className="hover:bg-gray-900/60">
                      <td className="px-3 py-2 text-left font-medium text-gray-300">{fmtDateTime(hour.forecastDatetimeEpt)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{hour.hourEnding}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{hour.analogCount.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(hour.p25)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(hour.median)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(hour.p75)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(hour.p95)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>

            <DataTableShell
              title="Nearest Historical Analogs"
              subtitle={`${data.analogPoints.length.toLocaleString()} closest rows shown from ${data.summary.analogCount.toLocaleString()} analog rows`}
              bodyClassName="max-h-[420px] overflow-y-auto"
              collapsible
            >
              <table className="w-full min-w-[960px] border-collapse bg-[#0d1119] text-[11px] text-gray-200">
                <thead className="sticky top-0 z-10 bg-gray-950 text-gray-500">
                  <tr>
                    {["Target", "Analog Hour", "Year", "RT Price", "Temp", "Net Load", "Outages", "Distance"].map((label) => (
                      <th key={label} className="px-3 py-2 text-right font-semibold uppercase tracking-wide first:text-left">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.analogPoints.map((point) => (
                    <tr
                      key={`${point.targetDatetimeEpt}-${point.datetimeBeginningEpt}-${point.distance}`}
                      className="hover:bg-gray-900/60"
                    >
                      <td className="px-3 py-2 text-left font-medium text-gray-300">{fmtDateTime(point.targetDatetimeEpt)}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{fmtDateTime(point.datetimeBeginningEpt)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{point.actualYear}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(point.rtPrice)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(point.tempF, 1)} F</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMw(point.netLoadMw)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMw(point.totalOutagesMw)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(point.distance, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </>
        )}
      </div>
    </section>
  );
}

export default function PjmActualsRegimeScatter({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmActualsRegimeScatterFreshnessSummary) => void;
}) {
  const [appliedConfig, setAppliedConfig] = useState<ScatterConfig>(() => defaultScatterConfig());
  const [draftConfig, setDraftConfig] = useState<ScatterConfig>(() => defaultScatterConfig());
  const [data, setData] = useState<ScatterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sampleRowsOpen, setSampleRowsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActualsScatterTab>("historical_scatter");
  const {
    loadArea,
    generationArea,
    stationId,
    region,
    hub,
    rtSource,
    component,
    dateMode,
    startDate,
    endDate,
    seasonStart,
    seasonEnd,
    lookbackYears,
    includeCurrentYear,
    season,
    hourFilter,
    dayType,
    regimeColor,
    minPrice,
    maxPrice,
    minOutages,
    maxOutages,
    outagesEnabled,
  } = appliedConfig;

  const updateDraftConfig = <Key extends keyof ScatterConfig>(
    key: Key,
    value: ScatterConfig[Key],
  ) => {
    setDraftConfig((current) => ({ ...current, [key]: value }));
  };

  const openSettings = () => {
    setDraftConfig(appliedConfig);
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    setDraftConfig(appliedConfig);
    setSettingsOpen(false);
  };

  const applySettings = () => {
    const outagesEnabled = draftConfig.outagesEnabled;
    setAppliedConfig({
      ...draftConfig,
      minOutages: outagesEnabled ? draftConfig.minOutages : "",
      maxOutages: outagesEnabled ? draftConfig.maxOutages : "",
      regimeColor:
        !outagesEnabled && draftConfig.regimeColor === "outage"
          ? "season"
          : draftConfig.regimeColor,
      maxPoints: Number.isFinite(draftConfig.maxPoints)
        ? Math.trunc(draftConfig.maxPoints)
        : DEFAULT_MAX_POINTS,
      lookbackYears: Number.isFinite(draftConfig.lookbackYears)
        ? Math.min(Math.max(Math.trunc(draftConfig.lookbackYears), 1), 5)
        : 3,
    });
    setSettingsOpen(false);
  };

  const setDraftDateMode = (nextMode: DateMode) => {
    setDraftConfig((current) => ({
      ...current,
      dateMode: nextMode,
      regimeColor: nextMode === "seasonal" && current.regimeColor === "season" ? "year" : current.regimeColor,
    }));
  };

  const setDraftOutagesEnabled = (enabled: boolean) => {
    setDraftConfig((current) => ({
      ...current,
      outagesEnabled: enabled,
      minOutages: enabled ? current.minOutages : "",
      maxOutages: enabled ? current.maxOutages : "",
      regimeColor: !enabled && current.regimeColor === "outage" ? "season" : current.regimeColor,
    }));
  };

  const applyDraftDatePreset = (preset: "last_30" | "last_90" | "last_365" | "ytd") => {
    setDraftConfig((current) => {
      const end = current.endDate || defaultEndDate();
      const nextStart =
        preset === "ytd" ? `${end.slice(0, 4)}-01-01` : addDaysIsoDate(end, preset === "last_30" ? -29 : preset === "last_90" ? -89 : -364);
      return {
        ...current,
        dateMode: "exact",
        startDate: nextStart,
        endDate: end,
      };
    });
  };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    const request = appliedConfig;
    fetchJsonWithCache<ScatterPayload>({
      key: cacheKey(request),
      url: buildUrl({ ...request, refresh: refreshToken > 0 }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        onFreshnessChange?.(freshnessFromPayload(payload));
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setError(err.message || "Failed to load PJM actuals regime scatter");
        setData(null);
        onFreshnessChange?.({
          ...DEFAULT_FRESHNESS,
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Price distributions query failed",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [appliedConfig, onFreshnessChange, refreshToken]);

  const loadAreas = data?.availableLoadAreas.length
    ? data.availableLoadAreas
    : [{ area: loadArea, rowCount: 0, minEpt: null, maxEpt: null }];
  const generationAreas = data?.availableGenerationAreas.length
    ? data.availableGenerationAreas
    : [{ area: generationArea, rowCount: 0, minEpt: null, maxEpt: null }];
  const stations = data?.weatherStations.length
    ? data.weatherStations
    : [{ stationId, stationName: stationId, region }];
  const hubs = data?.availableHubs.length ? data.availableHubs : [hub];
  const sourceWindow = data
    ? `${fmtDate(data.summary.minEpt)} to ${fmtDate(data.summary.maxEpt)}`
    : `${startDate} to ${endDate}`;
  const selectedStation = stations.find((station) => station.stationId === stationId);
  const selectedStationLabel = selectedStation
    ? selectedStation.stationName === selectedStation.stationId
      ? selectedStation.stationId
      : `${selectedStation.stationName} (${selectedStation.stationId})`
    : stationId;
  const draftSelectedStation = stations.find((station) => station.stationId === draftConfig.stationId);
  const draftSelectedStationLabel = draftSelectedStation
    ? draftSelectedStation.stationName === draftSelectedStation.stationId
      ? draftSelectedStation.stationId
      : `${draftSelectedStation.stationName} (${draftSelectedStation.stationId})`
    : draftConfig.stationId;
  const componentLabel = COMPONENTS.find((item) => item.key === component)?.label ?? component;
  const draftComponentLabel =
    COMPONENTS.find((item) => item.key === draftConfig.component)?.label ?? draftConfig.component;
  const draftSeasonLabel = SEASONS.find((item) => item.key === draftConfig.season)?.label ?? draftConfig.season;
  const draftHourFilterLabel =
    HOUR_FILTERS.find((item) => item.key === draftConfig.hourFilter)?.label ?? draftConfig.hourFilter;
  const draftDayTypeLabel = DAY_TYPES.find((item) => item.key === draftConfig.dayType)?.label ?? draftConfig.dayType;
  const draftRegimeColors = draftConfig.outagesEnabled
    ? REGIME_COLORS
    : REGIME_COLORS.filter((item) => item.key !== "outage");
  const draftRegimeColor =
    draftRegimeColors.find((item) => item.key === draftConfig.regimeColor)?.key ?? "season";
  const draftRegimeColorLabel =
    REGIME_COLORS.find((item) => item.key === draftRegimeColor)?.label ?? draftRegimeColor;
  const appliedDateLabel =
    dateMode === "seasonal"
      ? `${seasonStart} to ${seasonEnd} | ${lookbackYears}Y lookback${includeCurrentYear ? " + current" : ""}`
      : `${startDate} to ${endDate}`;
  const draftDateLabel =
    draftConfig.dateMode === "seasonal"
      ? `${draftConfig.seasonStart} to ${draftConfig.seasonEnd} | ${draftConfig.lookbackYears}Y lookback${
          draftConfig.includeCurrentYear ? " + current" : ""
        }`
      : `${draftConfig.startDate || "-"} to ${draftConfig.endDate || "-"}`;
  const seasonLabel = SEASONS.find((item) => item.key === season)?.label ?? season;
  const hourFilterLabel = HOUR_FILTERS.find((item) => item.key === hourFilter)?.label ?? hourFilter;
  const dayTypeLabel = DAY_TYPES.find((item) => item.key === dayType)?.label ?? dayType;
  const regimeColorLabel = REGIME_COLORS.find((item) => item.key === regimeColor)?.label ?? regimeColor;
  const filterChips = [
    loadArea,
    `Gen ${generationArea}`,
    selectedStationLabel,
    hub,
    `${rtSource} ${componentLabel}`,
    appliedDateLabel,
    seasonLabel,
    hourFilterLabel,
    dayTypeLabel,
    `Color ${regimeColorLabel}`,
    minPrice.trim() ? `Min ${fmtPrice(Number(minPrice))}` : null,
    maxPrice.trim() ? `Max ${fmtPrice(Number(maxPrice))}` : null,
    outagesEnabled ? "Outages enabled" : "Outages disabled",
    outagesEnabled && minOutages.trim() ? `Outages >= ${Number(minOutages).toLocaleString()}` : null,
    outagesEnabled && maxOutages.trim() ? `Outages <= ${Number(maxOutages).toLocaleString()}` : null,
  ].filter((label): label is string => Boolean(label));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-lg border border-gray-800 bg-[#12141d] p-2 shadow-xl shadow-black/20">
        {ACTUALS_SCATTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setActiveTab(tab.key);
              setSettingsOpen(false);
            }}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? "bg-gray-200 text-gray-950"
                : "bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "historical_scatter" ? (
        <>
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Edit Price Distributions View</h2>
            <p className="mt-1 text-xs text-gray-500">
              {data
                ? `${data.summary.returnedCount.toLocaleString()} plotted from ${data.summary.matchedCount.toLocaleString()} matched hours`
                : "Configure actual net load, weather, price, and regime filters."}
            </p>
          </div>
          <button
            type="button"
            onClick={openSettings}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Edit View
          </button>
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
          {filterChips.map((label) => (
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
          aria-label="Edit price distributions view"
          onMouseDown={closeSettings}
        >
          <div
            className="w-full max-w-6xl rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-100">Edit Price Distributions View</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeSettings}
                  className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-700 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applySettings}
                  className="rounded-md border border-gray-200 bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-950 hover:bg-white"
                >
                  Apply
                </button>
              </div>
            </div>

            <div className="max-h-[calc(100vh-116px)] space-y-4 overflow-y-auto p-4">
              <ConfigSection
                step="1"
                title="Date Window"
                summary={draftDateLabel}
              >
                <div className="space-y-4">
                  <div>
                    <span className={FIELD_LABEL_CLASS}>Date mode</span>
                    <div className="flex flex-wrap gap-2">
                      {[
                        ["exact", "Exact"],
                        ["seasonal", "Seasonal"],
                      ].map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setDraftDateMode(mode as DateMode)}
                          className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                            draftConfig.dateMode === mode
                              ? "border-gray-200 bg-gray-200 text-gray-950"
                              : "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {draftConfig.dateMode === "seasonal" ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.5fr] xl:items-end">
                      <ConfigField label="Window start">
                        <input
                          inputMode="numeric"
                          pattern="\\d{2}-\\d{2}"
                          placeholder="05-01"
                          value={draftConfig.seasonStart}
                          onChange={(event) => updateDraftConfig("seasonStart", event.target.value)}
                          className={FIELD_CONTROL_CLASS}
                        />
                      </ConfigField>
                      <ConfigField label="Window end">
                        <input
                          inputMode="numeric"
                          pattern="\\d{2}-\\d{2}"
                          placeholder="08-31"
                          value={draftConfig.seasonEnd}
                          onChange={(event) => updateDraftConfig("seasonEnd", event.target.value)}
                          className={FIELD_CONTROL_CLASS}
                        />
                      </ConfigField>
                      <ConfigField label="Lookback years">
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={draftConfig.lookbackYears}
                          onChange={(event) => updateDraftConfig("lookbackYears", Number(event.target.value))}
                          className={FIELD_CONTROL_CLASS}
                        />
                      </ConfigField>
                      <div className="rounded-lg border border-gray-800 bg-[#0d1119] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-100">Include Current Year</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {draftConfig.includeCurrentYear ? "Current partial year included" : "Historical years only"}
                            </p>
                          </div>
                          <SourceSwitch
                            enabled={draftConfig.includeCurrentYear}
                            onChange={(enabled) => updateDraftConfig("includeCurrentYear", enabled)}
                            label="Include current year"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr] xl:items-end">
                      <ConfigField label="Start">
                        <input
                          type="date"
                          value={draftConfig.startDate}
                          onChange={(event) => updateDraftConfig("startDate", event.target.value)}
                          className={FIELD_CONTROL_CLASS}
                        />
                      </ConfigField>
                      <ConfigField label="End">
                        <input
                          type="date"
                          value={draftConfig.endDate}
                          onChange={(event) => updateDraftConfig("endDate", event.target.value)}
                          className={FIELD_CONTROL_CLASS}
                        />
                      </ConfigField>
                      <div className="min-w-0">
                        <span className={FIELD_LABEL_CLASS}>Presets</span>
                        <div className="flex flex-wrap gap-2">
                          {[
                            ["last_30", "30D"],
                            ["last_90", "90D"],
                            ["last_365", "1Y"],
                            ["ytd", "YTD"],
                          ].map(([preset, label]) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() =>
                                applyDraftDatePreset(preset as "last_30" | "last_90" | "last_365" | "ytd")
                              }
                              className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-800 hover:text-white"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ConfigSection>

              <ConfigSection
                step="2"
                title="Data Sources"
                summary="Required sources are locked on; outages can be used as an optional regime filter."
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <DataSourceCard
                    title="Load Actuals"
                    description="Hourly gross load"
                    enabled
                    required
                    meta={draftConfig.loadArea}
                  />
                  <DataSourceCard
                    title="Wind + Solar Actuals"
                    description="Hourly renewable output"
                    enabled
                    required
                    meta={draftConfig.generationArea}
                  />
                  <DataSourceCard
                    title="Weather Actuals"
                    description="Hourly observed temperature"
                    enabled
                    required
                    meta={draftSelectedStationLabel}
                  />
                  <DataSourceCard
                    title="RT Price Actuals"
                    description="Hourly real-time LMP"
                    enabled
                    required
                    meta={`${draftConfig.hub} | ${draftConfig.rtSource}`}
                  />
                  <DataSourceCard
                    title="Outages"
                    description="Daily outage regime proxy"
                    enabled={draftConfig.outagesEnabled}
                    meta={draftConfig.outagesEnabled ? "Regime filter available" : "Excluded from filters"}
                    onToggle={setDraftOutagesEnabled}
                  />
                </div>
              </ConfigSection>

              <ConfigSection
                step="3"
                title="Source Filters"
                summary={`${draftConfig.loadArea} load, ${draftConfig.generationArea} wind/solar, ${draftSelectedStationLabel} weather, ${draftConfig.hub} price`}
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <ConfigField label="Load area">
                    <select
                      value={draftConfig.loadArea}
                      onChange={(event) => updateDraftConfig("loadArea", event.target.value)}
                      className={FIELD_CONTROL_CLASS}
                    >
                      {loadAreas.map((item) => (
                        <option key={item.area} value={item.area}>
                          {item.area}
                        </option>
                      ))}
                    </select>
                  </ConfigField>
                  <ConfigField label="Wind/Solar area">
                    <select
                      value={draftConfig.generationArea}
                      onChange={(event) => updateDraftConfig("generationArea", event.target.value)}
                      className={FIELD_CONTROL_CLASS}
                    >
                      {generationAreas.map((item) => (
                        <option key={item.area} value={item.area}>
                          {item.area}
                        </option>
                      ))}
                    </select>
                  </ConfigField>
                  <ConfigField label="Weather station">
                    <select
                      value={draftConfig.stationId}
                      onChange={(event) => updateDraftConfig("stationId", event.target.value)}
                      className={FIELD_CONTROL_CLASS}
                    >
                      {stations.map((station) => (
                        <option key={station.stationId} value={station.stationId}>
                          {station.stationName === station.stationId
                            ? station.stationId
                            : `${station.stationName} (${station.stationId})`}
                        </option>
                      ))}
                    </select>
                  </ConfigField>
                  <ConfigField label="Price hub">
                    <select
                      value={draftConfig.hub}
                      onChange={(event) => updateDraftConfig("hub", event.target.value)}
                      className={FIELD_CONTROL_CLASS}
                    >
                      {hubs.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </ConfigField>
                  <ConfigField label="RT source">
                    <select
                      value={draftConfig.rtSource}
                      onChange={(event) => updateDraftConfig("rtSource", event.target.value as RtSource)}
                      className={FIELD_CONTROL_CLASS}
                    >
                      <option value="verified">Verified</option>
                      <option value="unverified">Unverified</option>
                    </select>
                  </ConfigField>
                  <ConfigField label="Component">
                    <select
                      value={draftConfig.component}
                      onChange={(event) => updateDraftConfig("component", event.target.value as PriceComponent)}
                      className={FIELD_CONTROL_CLASS}
                    >
                      {COMPONENTS.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </ConfigField>
                </div>
              </ConfigSection>

              <ConfigSection
                step="4"
                title="Regime Filters"
                summary={`${draftSeasonLabel}, ${draftHourFilterLabel}, ${draftDayTypeLabel}, color ${draftRegimeColorLabel}`}
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <ConfigField label="Season">
                    <select
                      value={draftConfig.season}
                      onChange={(event) => updateDraftConfig("season", event.target.value as SeasonFilter)}
                      className={FIELD_CONTROL_CLASS}
                    >
                      {SEASONS.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </ConfigField>
                  <ConfigField label="Hours">
                    <select
                      value={draftConfig.hourFilter}
                      onChange={(event) => updateDraftConfig("hourFilter", event.target.value as HourFilter)}
                      className={FIELD_CONTROL_CLASS}
                    >
                      {HOUR_FILTERS.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </ConfigField>
                  <ConfigField label="Days">
                    <select
                      value={draftConfig.dayType}
                      onChange={(event) => updateDraftConfig("dayType", event.target.value as DayType)}
                      className={FIELD_CONTROL_CLASS}
                    >
                      {DAY_TYPES.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </ConfigField>
                  <ConfigField label="Color by">
                    <select
                      value={draftRegimeColor}
                      onChange={(event) => updateDraftConfig("regimeColor", event.target.value as RegimeColor)}
                      className={FIELD_CONTROL_CLASS}
                    >
                      {draftRegimeColors.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </ConfigField>
                  <ConfigField label="Min price">
                    <input
                      inputMode="decimal"
                      value={draftConfig.minPrice}
                      onChange={(event) => updateDraftConfig("minPrice", event.target.value)}
                      className={FIELD_CONTROL_CLASS}
                    />
                  </ConfigField>
                  <ConfigField label="Max price">
                    <input
                      inputMode="decimal"
                      value={draftConfig.maxPrice}
                      onChange={(event) => updateDraftConfig("maxPrice", event.target.value)}
                      className={FIELD_CONTROL_CLASS}
                    />
                  </ConfigField>
                  {draftConfig.outagesEnabled && (
                    <>
                      <ConfigField label="Min outages">
                        <input
                          inputMode="decimal"
                          value={draftConfig.minOutages}
                          onChange={(event) => updateDraftConfig("minOutages", event.target.value)}
                          className={FIELD_CONTROL_CLASS}
                        />
                      </ConfigField>
                      <ConfigField label="Max outages">
                        <input
                          inputMode="decimal"
                          value={draftConfig.maxOutages}
                          onChange={(event) => updateDraftConfig("maxOutages", event.target.value)}
                          className={FIELD_CONTROL_CLASS}
                        />
                      </ConfigField>
                    </>
                  )}
                </div>
              </ConfigSection>

              <ConfigSection
                step="5"
                title="Output"
                summary={`${draftConfig.maxPoints.toLocaleString()} plotted points; distribution uses all matched hours`}
              >
                <div className="grid gap-3 xl:grid-cols-[1fr_240px]">
                  <div className="rounded-lg border border-gray-800 bg-[#0d1119] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Preview</p>
                    <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
                      <div>
                        <dt className="text-gray-500">Formula</dt>
                        <dd className="mt-1 font-semibold text-gray-200">Net Load = Load - Wind - Solar</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Price</dt>
                        <dd className="mt-1 font-semibold text-gray-200">
                          {draftConfig.hub} | {draftComponentLabel}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Historical window</dt>
                        <dd className="mt-1 font-semibold text-gray-200">{draftDateLabel}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Matched hours now</dt>
                        <dd className="mt-1 font-semibold text-gray-200">
                          {data ? data.summary.matchedCount.toLocaleString() : "-"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Exact distribution</dt>
                        <dd className="mt-1 font-semibold text-gray-200">
                          {data ? data.priceDistribution.stats.count.toLocaleString() : "-"} hours
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Outages</dt>
                        <dd className="mt-1 font-semibold text-gray-200">
                          {draftConfig.outagesEnabled ? "Enabled" : "Disabled"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <ConfigField label="Max plotted points">
                    <input
                      type="number"
                      min={250}
                      max={7500}
                      value={draftConfig.maxPoints}
                      onChange={(event) => updateDraftConfig("maxPoints", Number(event.target.value))}
                      className={FIELD_CONTROL_CLASS}
                    />
                  </ConfigField>
                </div>
              </ConfigSection>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {loading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading actuals regime scatter...
        </div>
      )}
      {data && !loading && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile label="Matched Hours" value={data.summary.matchedCount.toLocaleString()} sub={sourceWindow} />
            <StatTile label="Plotted Points" value={data.summary.returnedCount.toLocaleString()} sub={`Sample step ${data.summary.sampleStep}`} />
            <StatTile label="Avg Net Load" value={fmtMw(data.summary.avgNetLoadMw)} />
            <StatTile label="Avg Temp" value={`${fmtNumber(data.summary.avgTempF, 1)} F`} />
            <StatTile label="Avg RT Price" value={fmtPrice(data.summary.avgRtPrice)} sub={`${fmtPrice(data.summary.minRtPrice)} to ${fmtPrice(data.summary.maxRtPrice)}`} />
          </div>

          <ActualPriceDistributionPanel
            distribution={data.priceDistribution}
            componentLabel={componentLabel}
            sourceWindow={sourceWindow}
          />

          {data.points.length ? (
            <Scatter2DCanvas points={data.points} />
          ) : (
            <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500 shadow-xl shadow-black/20">
              No hourly actual rows match the selected filters.
            </div>
          )}

          <DataTableShell
            title="Sampled Points"
            subtitle={`${data.points.length.toLocaleString()} returned rows from ${data.summary.matchedCount.toLocaleString()} matched hours`}
            bodyClassName="max-h-[420px] overflow-y-auto"
            collapsible
            open={sampleRowsOpen}
            onToggle={() => setSampleRowsOpen((open) => !open)}
          >
            <table className="w-full min-w-[1120px] border-collapse bg-[#0d1119] text-[11px] text-gray-200">
              <thead className="sticky top-0 z-10 bg-gray-950 text-gray-500">
                <tr>
                  {[
                    "DateTime",
                    "HE",
                    "Temp",
                    "Net Load",
                    "RT Price",
                    "Gross Load",
                    "Wind",
                    "Solar",
                    "Outages",
                    "Regime",
                    "Source",
                  ].map((label) => (
                    <th
                      key={label}
                      className="px-3 py-2 text-right font-semibold uppercase tracking-wide first:text-left"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.points.slice(0, 250).map((point) => (
                  <tr key={`${point.datetimeBeginningEpt}-${point.hourEnding}`} className="hover:bg-gray-900/60">
                    <td className="px-3 py-2 text-left font-medium text-gray-300">
                      {fmtDateTime(point.datetimeBeginningEpt)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{point.hourEnding}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(point.tempF, 1)} F</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMw(point.netLoadMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(point.rtPrice)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMw(point.grossLoadMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMw(point.windMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMw(point.solarMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMw(point.totalOutagesMw)}</td>
                    <td className="px-3 py-2 text-right">{point.colorRegime}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{point.loadSource}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        </>
      )}
        </>
      ) : (
        <ForecastAnalogDistributionPanel config={appliedConfig} componentLabel={componentLabel} />
      )}
    </div>
  );
}
