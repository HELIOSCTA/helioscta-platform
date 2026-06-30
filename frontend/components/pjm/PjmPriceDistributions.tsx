"use client";

import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type RtSource = "verified" | "unverified";
type PriceComponent = "total" | "energy" | "congestion" | "loss";
type DayType = "all" | "weekdays" | "weekends";
type ForecastSourceMode = "pjm" | "meteologica";

export interface PjmPriceDistributionsFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface PriceDistributionsConfig {
  loadArea: string;
  generationArea: string;
  stationId: string;
  region: string;
  hub: string;
  rtSource: RtSource;
  component: PriceComponent;
  seasonStart: string;
  seasonEnd: string;
  lookbackYears: number;
  dayType: DayType;
}

interface ForwardAnalogConfig {
  forecastSource: ForecastSourceMode;
  forecastDate: string;
  hourStart: number;
  hourEnd: number;
  seasonStart: string;
  seasonEnd: string;
  lookbackYears: number;
  includeCurrentYear: boolean;
  analogsPerHour: number;
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
  grossLoadMw: number | null;
  windMw: number | null;
  solarMw: number | null;
  netLoadMw: number | null;
  totalOutagesMw: number | null;
  distance: number | null;
}

interface ForecastAnalogYearCount {
  year: number;
  rowCount: number;
}

interface ForecastAnalogPayload {
  iso: "pjm";
  source: string;
  formula: string;
  selected: {
    forecastSource?: ForecastSourceMode;
    forecastSourceLabel?: string;
    sourceArea?: string;
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
  yearCounts: {
    historicalPool: ForecastAnalogYearCount[];
    analogPool: ForecastAnalogYearCount[];
  };
  analogPoints: ForecastAnalogPoint[];
  summary: {
    forecastHourCount: number;
    historicalPoolCount: number;
    analogCount: number;
    asOf: string | null;
  };
}

interface ForecastAnalogDateOptionsPayload {
  iso: "pjm";
  source: string;
  selected?: ForecastAnalogPayload["selected"];
  availableForecastDates: string[];
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LOAD_AREA = "RTO";
const DEFAULT_GENERATION_AREA = "RTO";
const DEFAULT_STATION_ID = "PJM";
const DEFAULT_REGION = "PJM";
const DEFAULT_HUB = "WESTERN HUB";
const COMPONENTS: Array<{ key: PriceComponent; label: string }> = [
  { key: "total", label: "Total LMP" },
  { key: "energy", label: "Energy" },
  { key: "congestion", label: "Congestion" },
  { key: "loss", label: "Loss" },
];
const FORECAST_SOURCES: Array<{ key: ForecastSourceMode; label: string; description: string }> = [
  { key: "pjm", label: "PJM", description: "PJM Data Miner RTO net load" },
  { key: "meteologica", label: "METEO", description: "Meteologica RTO load, wind, solar" },
];
const FIELD_LABEL_CLASS = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500";
const FIELD_CONTROL_CLASS =
  "w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none";
const DEFAULT_FRESHNESS: PjmPriceDistributionsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Price distributions --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

function defaultPriceDistributionsConfig(): PriceDistributionsConfig {
  return {
    loadArea: DEFAULT_LOAD_AREA,
    generationArea: DEFAULT_GENERATION_AREA,
    stationId: DEFAULT_STATION_ID,
    region: DEFAULT_REGION,
    hub: DEFAULT_HUB,
    rtSource: "verified",
    component: "total",
    seasonStart: "05-01",
    seasonEnd: "08-31",
    lookbackYears: 3,
    dayType: "all",
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

function fmtCompactMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value / 1000).toLocaleString()}k`;
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

function percentile(sortedValues: number[], percentileValue: number): number | null {
  if (!sortedValues.length) return null;
  const bounded = Math.min(Math.max(percentileValue, 0), 1);
  const position = (sortedValues.length - 1) * bounded;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function emptyPriceStats(): PriceDistributionStats {
  return {
    count: 0,
    minPrice: null,
    p05: null,
    p25: null,
    median: null,
    p75: null,
    p95: null,
    maxPrice: null,
    meanPrice: null,
    stdDev: null,
    skewness: null,
  };
}

function priceDistributionFromAnalogPoints(points: ForecastAnalogPoint[]): {
  stats: PriceDistributionStats;
  tails: PriceDistributionPayload["tails"];
  histogram: PriceHistogramBin[];
} {
  const prices = points
    .map((point) => point.rtPrice)
    .filter((price): price is number => price !== null && Number.isFinite(price))
    .sort((a, b) => a - b);

  if (!prices.length) {
    return {
      stats: emptyPriceStats(),
      tails: { belowZero: null, above100: null, above250: null, above500: null },
      histogram: [],
    };
  }

  const count = prices.length;
  const minPrice = prices[0];
  const maxPrice = prices[count - 1];
  const meanPrice = prices.reduce((sum, price) => sum + price, 0) / count;
  const variance = prices.reduce((sum, price) => sum + (price - meanPrice) ** 2, 0) / count;
  const stdDev = Math.sqrt(variance);
  const skewness =
    stdDev > 0
      ? prices.reduce((sum, price) => sum + ((price - meanPrice) / stdDev) ** 3, 0) / count
      : null;
  const binCount = minPrice === maxPrice ? 1 : Math.min(12, Math.max(4, Math.ceil(Math.sqrt(count) * 2)));
  const binSize = minPrice === maxPrice ? 1 : (maxPrice - minPrice) / binCount;
  const binCounts = Array.from({ length: binCount }, () => 0);

  prices.forEach((price) => {
    const rawIndex = minPrice === maxPrice ? 0 : Math.floor((price - minPrice) / binSize);
    const index = Math.min(Math.max(rawIndex, 0), binCount - 1);
    binCounts[index] += 1;
  });

  return {
    stats: {
      count,
      minPrice,
      p05: percentile(prices, 0.05),
      p25: percentile(prices, 0.25),
      median: percentile(prices, 0.5),
      p75: percentile(prices, 0.75),
      p95: percentile(prices, 0.95),
      maxPrice,
      meanPrice,
      stdDev,
      skewness,
    },
    tails: {
      belowZero: prices.filter((price) => price < 0).length / count,
      above100: prices.filter((price) => price > 100).length / count,
      above250: prices.filter((price) => price > 250).length / count,
      above500: prices.filter((price) => price > 500).length / count,
    },
    histogram: binCounts.map((binCountValue, index) => ({
      binIndex: index,
      binStart: minPrice === maxPrice ? minPrice : minPrice + binSize * index,
      binEnd: minPrice === maxPrice ? maxPrice : minPrice + binSize * (index + 1),
      count: binCountValue,
      pct: binCountValue / count,
    })),
  };
}

function distanceStatsFromAnalogPoints(points: ForecastAnalogPoint[]): {
  medianDistance: number | null;
  maxDistance: number | null;
} {
  const distances = points
    .map((point) => point.distance)
    .filter((distance): distance is number => distance !== null && Number.isFinite(distance))
    .sort((left, right) => left - right);

  return {
    medianDistance: percentile(distances, 0.5),
    maxDistance: distances.length ? distances[distances.length - 1] : null,
  };
}

function bounds(values: number[]): Range {
  if (!values.length) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return { min: min - 1, max: max + 1 };
  return { min, max };
}

function freshnessFromForecastAnalogPayload(
  payload: ForecastAnalogPayload | null,
  config: PriceDistributionsConfig,
  componentLabel: string,
): PjmPriceDistributionsFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  return {
    status: payload.summary.asOf ? "Current" : "No Data",
    statusClass: payload.summary.asOf
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
    summary: `${payload.summary.forecastHourCount.toLocaleString()} forecast hours | ${payload.summary.analogCount.toLocaleString()} analog rows`,
    targetDateLabel: `${payload.selected.forecastSourceLabel ?? "Forecast"} RTO | ${config.hub}`,
    latestDateLabel: `${payload.selected.forecastDate ?? "latest"} | ${componentLabel}`,
    latestUpdateLabel: fmtDateTime(payload.summary.asOf),
  };
}

function buildForecastAnalogUrl({
  config,
  forecastSource,
  forecastDate,
  hourStart,
  hourEnd,
  seasonStart,
  seasonEnd,
  lookbackYears,
  includeCurrentYear,
  analogsPerHour,
  datesOnly = false,
  refresh = false,
}: {
  config: PriceDistributionsConfig;
  forecastSource: ForecastSourceMode;
  forecastDate: string;
  hourStart: number;
  hourEnd: number;
  seasonStart: string;
  seasonEnd: string;
  lookbackYears: number;
  includeCurrentYear: boolean;
  analogsPerHour: number;
  datesOnly?: boolean;
  refresh?: boolean;
}): string {
  const params = new URLSearchParams({
    source: forecastSource,
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
  if (datesOnly) params.set("datesOnly", "1");
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-forecast-price-analogs?${params.toString()}`;
}

function forecastAnalogCacheKey({
  config,
  forecastSource,
  forecastDate,
  hourStart,
  hourEnd,
  seasonStart,
  seasonEnd,
  lookbackYears,
  includeCurrentYear,
  analogsPerHour,
}: {
  config: PriceDistributionsConfig;
  forecastSource: ForecastSourceMode;
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
    forecastSource,
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
    analogsPerHour,
  ].join(":");
}

function forecastAnalogDatesCacheKey({
  config,
  forecastSource,
  hourStart,
  hourEnd,
}: {
  config: PriceDistributionsConfig;
  forecastSource: ForecastSourceMode;
  hourStart: number;
  hourEnd: number;
}): string {
  return [
    "api:pjm-forecast-price-analogs:dates",
    forecastSource,
    config.stationId,
    config.region,
    hourStart,
    hourEnd,
  ].join(":");
}

function forecastDateOptionsErrorMessage(error: Error): string {
  if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
    return "Could not reach the complete-date lookup. Retry after the dev server finishes reloading.";
  }
  if (error.message.trim()) return error.message;
  return "Could not load complete forecast dates.";
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

function paddedRange(values: number[], paddingRatio = 0.08): Range {
  const range = bounds(values);
  const padding = (range.max - range.min) * paddingRatio;
  return { min: range.min - padding, max: range.max + padding };
}

function fmtAxisMw(value: number): string {
  return `${Math.round(value / 1000).toLocaleString()}k`;
}

function targetHourKey(datetimeEpt: string | null | undefined, hourEnding: number | null | undefined): string {
  return `${datetimeEpt ?? "unknown"}|${hourEnding ?? 0}`;
}

function forecastHourKey(hour: ForecastAnalogHour): string {
  return targetHourKey(hour.forecastDatetimeEpt, hour.hourEnding);
}

function analogPointTargetKey(point: ForecastAnalogPoint): string {
  return targetHourKey(point.targetDatetimeEpt, point.targetHourEnding);
}

function analogPointKey(point: ForecastAnalogPoint, index: number): string {
  return `${point.targetDatetimeEpt ?? "target"}|${point.datetimeBeginningEpt ?? "analog"}|${point.distance ?? index}`;
}

function hourlyDistributionKey(hour: ForecastAnalogHourlyDistribution): string {
  return targetHourKey(hour.forecastDatetimeEpt, hour.hourEnding);
}

interface LoadTempHoverState {
  kind: "forecast" | "analog";
  x: number;
  y: number;
  forecastHour?: ForecastAnalogHour;
  analogPoint?: ForecastAnalogPoint;
  distribution?: ForecastAnalogHourlyDistribution | null;
}

function ForecastLoadTempPlot({
  forecastHours,
  analogPoints,
  hourlyDistributions,
  selectedTargetKey,
  onSelectTarget,
}: {
  forecastHours: ForecastAnalogHour[];
  analogPoints: ForecastAnalogPoint[];
  hourlyDistributions: ForecastAnalogHourlyDistribution[];
  selectedTargetKey: string | null;
  onSelectTarget: (targetKey: string) => void;
}) {
  const [hover, setHover] = useState<LoadTempHoverState | null>(null);
  const forecastPoints = forecastHours.filter(
    (hour) => hour.tempF !== null && hour.netLoadMw !== null,
  );
  const analogCandidates = analogPoints.filter((point) => point.tempF !== null && point.netLoadMw !== null);
  const selectedAnalogRows = selectedTargetKey
    ? analogCandidates.filter((point) => analogPointTargetKey(point) === selectedTargetKey)
    : [];
  const contextAnalogRows = analogCandidates
    .filter((point) => !selectedTargetKey || analogPointTargetKey(point) !== selectedTargetKey)
    .slice(0, 420);
  const contextAnalogKeys = new Set(contextAnalogRows.map((point, index) => analogPointKey(point, index)));
  const analogRows = [
    ...contextAnalogRows,
    ...selectedAnalogRows.filter((point, index) => !contextAnalogKeys.has(analogPointKey(point, index))),
  ];
  const allTemps = [
    ...forecastPoints.map((hour) => hour.tempF ?? 0),
    ...analogRows.map((point) => point.tempF ?? 0),
  ];
  const allLoads = [
    ...forecastPoints.map((hour) => hour.netLoadMw ?? 0),
    ...analogRows.map((point) => point.netLoadMw ?? 0),
  ];
  const xRange = paddedRange(allTemps);
  const yRange = paddedRange(allLoads);
  const width = 980;
  const height = 440;
  const left = 72;
  const right = width - 34;
  const top = 34;
  const bottom = height - 62;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const ticks = [0, 1, 2, 3, 4];
  const x = (value: number) => left + ((value - xRange.min) / (xRange.max - xRange.min)) * plotWidth;
  const y = (value: number) => bottom - ((value - yRange.min) / (yRange.max - yRange.min)) * plotHeight;
  const forecastPolyline = forecastPoints
    .map((hour) => `${x(hour.tempF ?? 0).toFixed(1)},${y(hour.netLoadMw ?? 0).toFixed(1)}`)
    .join(" ");
  const distributionByTarget = new Map(
    hourlyDistributions.map((hour) => [hourlyDistributionKey(hour), hour]),
  );
  const selectedDistribution = selectedTargetKey ? distributionByTarget.get(selectedTargetKey) ?? null : null;
  const selectedForecastHour =
    forecastPoints.find((hour) => forecastHourKey(hour) === selectedTargetKey) ?? forecastPoints[0] ?? null;
  const updateHoverPosition = (
    event: ReactMouseEvent<SVGCircleElement>,
    state: Omit<LoadTempHoverState, "x" | "y">,
  ) => {
    const svg = event.currentTarget.ownerSVGElement;
    const rect = svg?.getBoundingClientRect();
    const xPos = rect ? event.clientX - rect.left + 14 : 20;
    const yPos = rect ? event.clientY - rect.top + 14 : 20;
    setHover({
      ...state,
      x: Math.min(Math.max(xPos, 12), 720),
      y: Math.min(Math.max(yPos, 12), 318),
    });
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Load vs Temp</p>
          <p className="mt-1 text-xs text-gray-500">
            Forecast hours against the nearest historical analog pool
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-sky-300" />
            Forecast
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-500/70" />
            Context
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
            Selected Pool
          </span>
        </div>
      </div>
      {!forecastPoints.length ? (
        <div className="flex h-[320px] items-center justify-center rounded-md border border-gray-800 bg-[#0d1119] text-sm text-gray-500">
          No forecast load-temperature points are available.
        </div>
      ) : (
        <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[440px] w-full rounded-md border border-gray-800 bg-[#0d1119]"
          role="img"
          aria-label="Forecast and historical analog load versus temperature scatter plot"
        >
          <rect x={left} y={top} width={plotWidth} height={plotHeight} fill="#101623" />
          {ticks.map((tick) => {
            const ratio = tick / 4;
            const gridX = left + ratio * plotWidth;
            const gridY = bottom - ratio * plotHeight;
            const temp = xRange.min + (xRange.max - xRange.min) * ratio;
            const load = yRange.min + (yRange.max - yRange.min) * ratio;
            return (
              <g key={tick}>
                <line x1={gridX} y1={top} x2={gridX} y2={bottom} stroke="rgba(148, 163, 184, 0.14)" />
                <line x1={left} y1={gridY} x2={right} y2={gridY} stroke="rgba(148, 163, 184, 0.14)" />
                <text x={gridX} y={bottom + 22} textAnchor="middle" fill="#64748b" fontSize="11">
                  {fmtNumber(temp, 0)} F
                </text>
                <text x={left - 10} y={gridY + 4} textAnchor="end" fill="#64748b" fontSize="11">
                  {fmtAxisMw(load)}
                </text>
              </g>
            );
          })}
          <rect x={left} y={top} width={plotWidth} height={plotHeight} fill="none" stroke="rgba(148, 163, 184, 0.28)" />
          {analogRows.map((point, index) => (
            (() => {
              const targetKey = analogPointTargetKey(point);
              const selected = targetKey === selectedTargetKey;
              return (
            <circle
              key={analogPointKey(point, index)}
              cx={x(point.tempF ?? 0)}
              cy={y(point.netLoadMw ?? 0)}
              r={selected ? 4.5 : 3}
              fill={selected ? "#f59e0b" : "#64748b"}
              opacity={selected || !selectedTargetKey ? 0.64 : 0.2}
              stroke={selected ? "#fbbf24" : "transparent"}
              strokeWidth={selected ? 1 : 0}
              className="cursor-pointer"
              onMouseEnter={(event) => {
                updateHoverPosition(event, {
                  kind: "analog",
                  analogPoint: point,
                  distribution: distributionByTarget.get(targetKey) ?? null,
                });
              }}
              onMouseMove={(event) =>
                updateHoverPosition(event, {
                  kind: "analog",
                  analogPoint: point,
                  distribution: distributionByTarget.get(targetKey) ?? null,
                })
              }
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelectTarget(targetKey)}
            />
              );
            })()
          ))}
          {forecastPolyline && (
            <polyline
              points={forecastPolyline}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity="0.78"
            />
          )}
          {forecastPoints.map((hour) => {
            const targetKey = forecastHourKey(hour);
            const selected = targetKey === selectedTargetKey;
            return (
            <g key={`${hour.forecastDatetimeEpt}-${hour.hourEnding}`}>
              <circle
                cx={x(hour.tempF ?? 0)}
                cy={y(hour.netLoadMw ?? 0)}
                r={selected ? 7 : 5}
                fill={selected ? "#f59e0b" : "#38bdf8"}
                stroke="#0f172a"
                strokeWidth="1.5"
                className="cursor-pointer"
                onMouseEnter={(event) => {
                  updateHoverPosition(event, {
                    kind: "forecast",
                    forecastHour: hour,
                    distribution: distributionByTarget.get(targetKey) ?? null,
                  });
                }}
                onMouseMove={(event) =>
                  updateHoverPosition(event, {
                    kind: "forecast",
                    forecastHour: hour,
                    distribution: distributionByTarget.get(targetKey) ?? null,
                  })
                }
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelectTarget(targetKey)}
              />
              <text
                x={x(hour.tempF ?? 0) + 8}
                y={y(hour.netLoadMw ?? 0) - 8}
                fill={selected ? "#fbbf24" : "#7dd3fc"}
                fontSize="10"
                opacity={selected ? 1 : 0.72}
              >
                HE{hour.hourEnding}
              </text>
            </g>
            );
          })}
          <text x={(left + right) / 2} y={height - 16} textAnchor="middle" fill="#94a3b8" fontSize="12">
            Temperature F
          </text>
          <text
            x={18}
            y={(top + bottom) / 2}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="12"
            transform={`rotate(-90 18 ${(top + bottom) / 2})`}
          >
            Net Load MW
          </text>
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-72 rounded-md border border-gray-700 bg-gray-950/95 p-3 text-xs shadow-2xl shadow-black/40"
            style={{ left: hover.x, top: hover.y }}
          >
            {hover.kind === "forecast" && hover.forecastHour ? (
              <>
                <p className="font-semibold text-gray-100">
                  Forecast HE{hover.forecastHour.hourEnding} | {fmtDateTime(hover.forecastHour.forecastDatetimeEpt)}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
                  <dt className="text-gray-500">Temp</dt>
                  <dd className="text-right text-gray-200">{fmtNumber(hover.forecastHour.tempF, 1)} F</dd>
                  <dt className="text-gray-500">Net Load</dt>
                  <dd className="text-right text-gray-200">{fmtMw(hover.forecastHour.netLoadMw)}</dd>
                  <dt className="text-gray-500">Load</dt>
                  <dd className="text-right text-gray-200">{fmtMw(hover.forecastHour.loadMw)}</dd>
                  <dt className="text-gray-500">Wind</dt>
                  <dd className="text-right text-gray-200">{fmtMw(hover.forecastHour.windMw)}</dd>
                  <dt className="text-gray-500">Solar</dt>
                  <dd className="text-right text-gray-200">{fmtMw(hover.forecastHour.solarMw)}</dd>
                  <dt className="text-gray-500">Issue</dt>
                  <dd className="text-right text-gray-200">{fmtDateTime(hover.forecastHour.evaluatedAtEpt)}</dd>
                  <dt className="text-gray-500">Median RT</dt>
                  <dd className="text-right text-gray-200">{fmtPrice(hover.distribution?.median)}</dd>
                  <dt className="text-gray-500">P95 RT</dt>
                  <dd className="text-right text-gray-200">{fmtPrice(hover.distribution?.p95)}</dd>
                </dl>
              </>
            ) : hover.analogPoint ? (
              <>
                <p className="font-semibold text-gray-100">
                  Analog HE{hover.analogPoint.hourEnding} | {fmtDateTime(hover.analogPoint.datetimeBeginningEpt)}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
                  <dt className="text-gray-500">RT Price</dt>
                  <dd className="text-right text-gray-200">{fmtPrice(hover.analogPoint.rtPrice)}</dd>
                  <dt className="text-gray-500">Temp</dt>
                  <dd className="text-right text-gray-200">{fmtNumber(hover.analogPoint.tempF, 1)} F</dd>
                  <dt className="text-gray-500">Load</dt>
                  <dd className="text-right text-gray-200">{fmtMw(hover.analogPoint.grossLoadMw)}</dd>
                  <dt className="text-gray-500">Wind</dt>
                  <dd className="text-right text-gray-200">{fmtMw(hover.analogPoint.windMw)}</dd>
                  <dt className="text-gray-500">Solar</dt>
                  <dd className="text-right text-gray-200">{fmtMw(hover.analogPoint.solarMw)}</dd>
                  <dt className="text-gray-500">Net Load</dt>
                  <dd className="text-right text-gray-200">{fmtMw(hover.analogPoint.netLoadMw)}</dd>
                  <dt className="text-gray-500">Target HE</dt>
                  <dd className="text-right text-gray-200">HE{hover.analogPoint.targetHourEnding}</dd>
                  <dt className="text-gray-500">Year</dt>
                  <dd className="text-right text-gray-200">{hover.analogPoint.actualYear}</dd>
                  <dt className="text-gray-500">Distance</dt>
                  <dd className="text-right text-gray-200">{fmtNumber(hover.analogPoint.distance, 3)}</dd>
                  <dt className="text-gray-500">Target Median</dt>
                  <dd className="text-right text-gray-200">{fmtPrice(hover.distribution?.median)}</dd>
                  <dt className="text-gray-500">Target P95</dt>
                  <dd className="text-right text-gray-200">{fmtPrice(hover.distribution?.p95)}</dd>
                </dl>
              </>
            ) : null}
          </div>
        )}
        </div>
      )}
      {selectedForecastHour && (
        <div className="mt-3 grid gap-3 rounded-md border border-gray-800 bg-[#0d1119] p-3 text-xs xl:grid-cols-[1fr_1fr]">
          <div>
            <p className="font-semibold text-gray-100">
              Selected HE{selectedForecastHour.hourEnding} | {fmtDateTime(selectedForecastHour.forecastDatetimeEpt)}
            </p>
            <p className="mt-1 tabular-nums text-gray-500">
              {fmtNumber(selectedForecastHour.tempF, 1)} F | {fmtMw(selectedForecastHour.netLoadMw)}
            </p>
          </div>
          <dl className="grid grid-cols-4 gap-2 tabular-nums">
            <div>
              <dt className="text-gray-500">Analogs</dt>
              <dd className="mt-1 font-semibold text-gray-200">{selectedDistribution?.analogCount.toLocaleString() ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">P25</dt>
              <dd className="mt-1 font-semibold text-gray-200">{fmtPrice(selectedDistribution?.p25)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Median</dt>
              <dd className="mt-1 font-semibold text-gray-200">{fmtPrice(selectedDistribution?.median)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">P95</dt>
              <dd className="mt-1 font-semibold text-gray-200">{fmtPrice(selectedDistribution?.p95)}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

function AnalogPoolHeatmap({
  forecastHours,
  analogPoints,
  selectedTargetKey,
  onSelectTarget,
}: {
  forecastHours: ForecastAnalogHour[];
  analogPoints: ForecastAnalogPoint[];
  selectedTargetKey: string | null;
  onSelectTarget: (targetKey: string) => void;
}) {
  const columns = forecastHours
    .slice()
    .sort((left, right) => left.hourEnding - right.hourEnding || fmtDateTime(left.forecastDatetimeEpt).localeCompare(fmtDateTime(right.forecastDatetimeEpt)));
  const validDistances = analogPoints
    .map((point) => point.distance)
    .filter((distance): distance is number => distance !== null && Number.isFinite(distance));
  const distanceRange = bounds(validDistances);
  const cellByDateAndTarget = new Map<string, ForecastAnalogPoint>();

  analogPoints.forEach((point) => {
    const date = fmtDate(point.datetimeBeginningEpt);
    const targetKey = analogPointTargetKey(point);
    const key = `${date}|${targetKey}`;
    const current = cellByDateAndTarget.get(key);
    if (!current || (point.distance ?? Number.POSITIVE_INFINITY) < (current.distance ?? Number.POSITIVE_INFINITY)) {
      cellByDateAndTarget.set(key, point);
    }
  });

  const rows = Array.from(
    analogPoints.reduce((dates, point) => {
      dates.add(fmtDate(point.datetimeBeginningEpt));
      return dates;
    }, new Set<string>()),
  )
    .map((date) => {
      const cells = columns
        .map((hour) => cellByDateAndTarget.get(`${date}|${forecastHourKey(hour)}`) ?? null)
        .filter((point): point is ForecastAnalogPoint => point !== null);
      const avgDistance =
        cells.length > 0
          ? cells.reduce((sum, point) => sum + (point.distance ?? 0), 0) / cells.length
          : Number.POSITIVE_INFINITY;
      return { date, cells, avgDistance };
    })
    .sort((left, right) => left.avgDistance - right.avgDistance || left.date.localeCompare(right.date));

  const similarityForPoint = (point: ForecastAnalogPoint): number => {
    if (point.distance === null || !Number.isFinite(point.distance)) return 0;
    if (distanceRange.max === distanceRange.min) return 1;
    return 1 - (point.distance - distanceRange.min) / (distanceRange.max - distanceRange.min);
  };

  return (
    <DataTableShell
      title="Analog Similarity Heatmap"
      subtitle="Rows are historical analog dates; columns are target HEs. Darker cells are closer load-temperature matches."
      bodyClassName="max-h-[520px] overflow-auto"
    >
      <table
        className="w-full border-collapse bg-[#0d1119] text-[11px] text-gray-200"
        style={{ minWidth: `${Math.max(760, 190 + columns.length * 118)}px` }}
      >
        <thead className="sticky top-0 z-10 bg-gray-950 text-gray-500">
          <tr>
            <th className="sticky left-0 z-20 w-28 bg-gray-950 px-3 py-2 text-left font-semibold uppercase tracking-wide">
              Date
            </th>
            <th className="w-20 px-2 py-2 text-right font-semibold uppercase tracking-wide">Avg Dist</th>
            {columns.map((hour) => {
              const targetKey = forecastHourKey(hour);
              const selected = targetKey === selectedTargetKey;
              return (
                <th
                  key={targetKey}
                  className={`px-1.5 py-2 text-center font-semibold uppercase tracking-wide ${
                    selected ? "bg-amber-500/10 text-amber-100" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectTarget(targetKey)}
                    className="w-full rounded-sm px-1 py-1 text-center hover:bg-gray-800"
                  >
                    <span className="block">HE{hour.hourEnding}</span>
                    <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-gray-500">
                      {fmtNumber(hour.tempF, 0)} F | {fmtCompactMw(hour.netLoadMw)}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-900">
          {rows.map((row) => (
            <tr key={row.date} className="hover:bg-gray-900/40">
              <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2 text-left font-semibold text-gray-200">
                {row.date}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-gray-500">
                {Number.isFinite(row.avgDistance) ? fmtNumber(row.avgDistance, 3) : "-"}
              </td>
              {columns.map((hour) => {
                const targetKey = forecastHourKey(hour);
                const point = cellByDateAndTarget.get(`${row.date}|${targetKey}`);
                const selected = targetKey === selectedTargetKey;
                if (!point) {
                  return (
                    <td key={`${row.date}|${targetKey}`} className="border-l border-gray-900 px-1.5 py-1.5 text-center text-gray-700">
                      -
                    </td>
                  );
                }
                const similarity = similarityForPoint(point);
                const backgroundColor = selected
                  ? `rgba(245, 158, 11, ${0.14 + similarity * 0.44})`
                  : `rgba(16, 185, 129, ${0.08 + similarity * 0.48})`;
                return (
                  <td
                    key={`${row.date}|${targetKey}`}
                    className={`border-l px-1.5 py-1.5 ${
                      selected ? "border-amber-400/40" : "border-gray-900"
                    }`}
                    style={{ backgroundColor }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectTarget(targetKey)}
                      className="block w-full rounded-sm px-1 py-1 text-left transition-colors hover:bg-black/20"
                      title={`${fmtDateTime(point.datetimeBeginningEpt)} HE${point.hourEnding} | Price ${fmtPrice(point.rtPrice)} | Load ${fmtMw(point.grossLoadMw)} | Net Load ${fmtMw(point.netLoadMw)} | Distance ${fmtNumber(point.distance, 3)}`}
                    >
                      <span className="block text-sm font-semibold tabular-nums text-gray-50">
                        {fmtPrice(point.rtPrice)}
                      </span>
                      <span className="mt-1 grid grid-cols-2 gap-x-1 tabular-nums text-[10px] leading-4 text-gray-200/90">
                        <span>L {fmtCompactMw(point.grossLoadMw)}</span>
                        <span>NL {fmtCompactMw(point.netLoadMw)}</span>
                        <span>T {fmtNumber(point.tempF, 0)} F</span>
                        <span>D {fmtNumber(point.distance, 2)}</span>
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={columns.length + 2} className="px-3 py-6 text-center text-sm text-gray-500">
                No analog rows are available for the selected forecast window.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </DataTableShell>
  );
}

function ForecastAnalogDistributionPanel({
  config,
  componentLabel,
  refreshToken = 0,
  onFreshnessChange,
}: {
  config: PriceDistributionsConfig;
  componentLabel: string;
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmPriceDistributionsFreshnessSummary) => void;
}) {
  const [forecastSource, setForecastSource] = useState<ForecastSourceMode>("pjm");
  const [forecastDate, setForecastDate] = useState("");
  const [hourStart, setHourStart] = useState(8);
  const [hourEnd, setHourEnd] = useState(23);
  const [seasonStart, setSeasonStart] = useState(config.seasonStart);
  const [seasonEnd, setSeasonEnd] = useState(config.seasonEnd);
  const [lookbackYears, setLookbackYears] = useState(config.lookbackYears);
  const [includeCurrentYear, setIncludeCurrentYear] = useState(true);
  const [analogsPerHour, setAnalogsPerHour] = useState(40);
  const [forwardSettingsOpen, setForwardSettingsOpen] = useState(false);
  const [forwardDraft, setForwardDraft] = useState<ForwardAnalogConfig>({
    forecastSource: "pjm",
    forecastDate: "",
    hourStart: 8,
    hourEnd: 23,
    seasonStart: config.seasonStart,
    seasonEnd: config.seasonEnd,
    lookbackYears: config.lookbackYears,
    includeCurrentYear: true,
    analogsPerHour: 40,
  });
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);
  const [data, setData] = useState<ForecastAnalogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forecastDateOptionsByKey, setForecastDateOptionsByKey] = useState<Record<string, string[]>>({});
  const [forecastDateOptionsLoadingKey, setForecastDateOptionsLoadingKey] = useState<string | null>(null);
  const [forecastDateOptionsError, setForecastDateOptionsError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [forecastDateOptionsRefreshToken, setForecastDateOptionsRefreshToken] = useState(0);

  const currentForwardConfig: ForwardAnalogConfig = {
    forecastSource,
    forecastDate,
    hourStart,
    hourEnd,
    seasonStart,
    seasonEnd,
    lookbackYears,
    includeCurrentYear,
    analogsPerHour,
  };
  const normalizedForwardDraft: ForwardAnalogConfig = useMemo(
    () => ({
      ...forwardDraft,
      hourStart: Math.min(Math.max(Math.trunc(forwardDraft.hourStart), 1), 24),
      hourEnd: Math.min(Math.max(Math.trunc(forwardDraft.hourEnd), 1), 24),
      lookbackYears: Math.min(Math.max(Math.trunc(forwardDraft.lookbackYears), 1), 5),
      analogsPerHour: Math.min(Math.max(Math.trunc(forwardDraft.analogsPerHour), 20), 100),
    }),
    [forwardDraft],
  );
  const draftDateOptionsRequest = useMemo(
    () => ({
      config,
      forecastSource: normalizedForwardDraft.forecastSource,
      forecastDate: "",
      hourStart: normalizedForwardDraft.hourStart,
      hourEnd: normalizedForwardDraft.hourEnd,
      seasonStart: normalizedForwardDraft.seasonStart,
      seasonEnd: normalizedForwardDraft.seasonEnd,
      lookbackYears: normalizedForwardDraft.lookbackYears,
      includeCurrentYear: normalizedForwardDraft.includeCurrentYear,
      analogsPerHour: normalizedForwardDraft.analogsPerHour,
    }),
    [config, normalizedForwardDraft],
  );
  const draftDateOptionsKey = forecastAnalogDatesCacheKey(draftDateOptionsRequest);
  const cachedDraftAvailableForecastDates = forecastDateOptionsByKey[draftDateOptionsKey];
  const hasAppliedDraftDateOptions =
    normalizedForwardDraft.forecastSource === forecastSource && data?.availableForecastDates !== undefined;
  const draftAvailableForecastDates =
    cachedDraftAvailableForecastDates ?? (hasAppliedDraftDateOptions ? data?.availableForecastDates ?? [] : []);
  const draftDateOptionsLoaded = cachedDraftAvailableForecastDates !== undefined || hasAppliedDraftDateOptions;
  const draftDateOptionsLoading =
    forecastDateOptionsLoadingKey === draftDateOptionsKey && cachedDraftAvailableForecastDates === undefined;
  const draftDateOptionsErrorMessage =
    forecastDateOptionsError?.key === draftDateOptionsKey ? forecastDateOptionsError.message : null;

  const updateForwardDraft = <Key extends keyof ForwardAnalogConfig>(
    key: Key,
    value: ForwardAnalogConfig[Key],
  ) => {
    setForwardDraft((current) => ({ ...current, [key]: value }));
  };

  const openForwardSettings = () => {
    setForwardDraft(currentForwardConfig);
    setForecastDateOptionsError(null);
    setForwardSettingsOpen(true);
  };

  const closeForwardSettings = () => {
    setForwardDraft(currentForwardConfig);
    setForwardSettingsOpen(false);
  };

  const applyForwardSettings = () => {
    const next: ForwardAnalogConfig = {
      ...forwardDraft,
      hourStart: Math.min(Math.max(Math.trunc(forwardDraft.hourStart), 1), 24),
      hourEnd: Math.min(Math.max(Math.trunc(forwardDraft.hourEnd), 1), 24),
      lookbackYears: Math.min(Math.max(Math.trunc(forwardDraft.lookbackYears), 1), 5),
      analogsPerHour: Math.min(Math.max(Math.trunc(forwardDraft.analogsPerHour), 20), 100),
    };
    setForecastSource(next.forecastSource);
    setForecastDate(next.forecastDate);
    setHourStart(next.hourStart);
    setHourEnd(next.hourEnd);
    setSeasonStart(next.seasonStart);
    setSeasonEnd(next.seasonEnd);
    setLookbackYears(next.lookbackYears);
    setIncludeCurrentYear(next.includeCurrentYear);
    setAnalogsPerHour(next.analogsPerHour);
    setForwardSettingsOpen(false);
  };

  const retryForecastDateOptions = () => {
    setForecastDateOptionsError(null);
    setForecastDateOptionsByKey((current) => {
      if (current[draftDateOptionsKey] === undefined) return current;
      const next = { ...current };
      delete next[draftDateOptionsKey];
      return next;
    });
    setForecastDateOptionsRefreshToken((current) => current + 1);
  };

  useEffect(() => {
    if (!data?.availableForecastDates) return;
    const appliedDateOptionsKey = forecastAnalogDatesCacheKey({ config, forecastSource, hourStart, hourEnd });
    setForecastDateOptionsByKey((current) => ({
      ...current,
      [appliedDateOptionsKey]: data.availableForecastDates,
    }));
  }, [config, data?.availableForecastDates, forecastSource, hourEnd, hourStart]);

  useEffect(() => {
    if (!forwardSettingsOpen || forecastDateOptionsByKey[draftDateOptionsKey] !== undefined) return;

    const controller = new AbortController();
    let active = true;
    setForecastDateOptionsLoadingKey(draftDateOptionsKey);
    setForecastDateOptionsError(null);

    fetchJsonWithCache<ForecastAnalogDateOptionsPayload>({
      key: draftDateOptionsKey,
      url: buildForecastAnalogUrl({ ...draftDateOptionsRequest, datesOnly: true }),
      ttlMs: API_CACHE_TTL_MS,
      cacheMode: "no-store",
      forceRefresh: forecastDateOptionsRefreshToken > 0,
      signal: controller.signal,
    })
      .then((payload) => {
        if (!active) return;
        const dates = payload.availableForecastDates ?? [];
        setForecastDateOptionsError(null);
        setForecastDateOptionsByKey((current) => ({ ...current, [draftDateOptionsKey]: dates }));
        setForwardDraft((current) => {
          if (current.forecastSource !== draftDateOptionsRequest.forecastSource) return current;
          if (!current.forecastDate || dates.includes(current.forecastDate)) return current;
          return { ...current, forecastDate: "" };
        });
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setForecastDateOptionsError({
          key: draftDateOptionsKey,
          message: forecastDateOptionsErrorMessage(err),
        });
      })
      .finally(() => {
        if (active) setForecastDateOptionsLoadingKey(null);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    draftDateOptionsKey,
    draftDateOptionsRequest,
    forecastDateOptionsByKey,
    forecastDateOptionsRefreshToken,
    forwardSettingsOpen,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);

    const request = {
      config,
      forecastSource,
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
      url: buildForecastAnalogUrl({ ...request, refresh: refreshToken > 0 }),
      ttlMs: API_CACHE_TTL_MS,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
      signal: controller.signal,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        onFreshnessChange?.(freshnessFromForecastAnalogPayload(payload, config, componentLabel));
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setError(err.message || "Failed to load forecast analog distribution");
        setData(null);
        onFreshnessChange?.({
          ...DEFAULT_FRESHNESS,
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Forward analog price query failed",
        });
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
    componentLabel,
    forecastSource,
    forecastDate,
    hourEnd,
    hourStart,
    includeCurrentYear,
    lookbackYears,
    onFreshnessChange,
    refreshToken,
    seasonEnd,
    seasonStart,
  ]);

  const selectedForecastDate = data?.selected.forecastDate ?? forecastDate;
  const hourlyDistributionByTarget = new Map(
    (data?.hourlyDistributions ?? []).map((hour) => [hourlyDistributionKey(hour), hour]),
  );
  const selectedForecastHour =
    data?.forecastHours.find((hour) => forecastHourKey(hour) === selectedTargetKey) ??
    data?.forecastHours[0] ??
    null;
  const effectiveSelectedTargetKey = selectedForecastHour ? forecastHourKey(selectedForecastHour) : selectedTargetKey;
  const selectedHourlyDistribution =
    effectiveSelectedTargetKey ? hourlyDistributionByTarget.get(effectiveSelectedTargetKey) ?? null : null;
  const selectedAnalogPoints = (data?.analogPoints ?? [])
    .filter((point) => analogPointTargetKey(point) === effectiveSelectedTargetKey)
    .sort((left, right) => (left.distance ?? Number.POSITIVE_INFINITY) - (right.distance ?? Number.POSITIVE_INFINITY));
  const selectedPriceDistribution = priceDistributionFromAnalogPoints(selectedAnalogPoints);
  const selectedStats = selectedPriceDistribution.stats;
  const selectedDistanceStats = distanceStatsFromAnalogPoints(selectedAnalogPoints);
  const yearCounts = data?.yearCounts ?? { historicalPool: [], analogPool: [] };
  const forwardChips = [
    `${data?.selected.forecastSourceLabel ?? FORECAST_SOURCES.find((source) => source.key === forecastSource)?.label} RTO`,
    selectedForecastDate || "Latest forecast",
    `HE${hourStart}-${hourEnd}`,
    `${seasonStart} to ${seasonEnd}`,
    `${lookbackYears}Y lookback${includeCurrentYear ? " + current" : ""}`,
    `${analogsPerHour} analogs / HE`,
  ];

  useEffect(() => {
    if (!data?.forecastHours.length) {
      setSelectedTargetKey(null);
      return;
    }
    setSelectedTargetKey((current) => {
      if (current && data.forecastHours.some((hour) => forecastHourKey(hour) === current)) return current;
      return forecastHourKey(data.forecastHours[0]);
    });
  }, [data]);

  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20">
      <div className="border-b border-gray-800 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Price Distributions</h2>
            <p className="mt-1 max-w-4xl text-sm text-gray-500">
              Selected forecast hours are matched against similar historical actual hours to build the
              RT price distribution for {config.hub} {componentLabel}.
            </p>
          </div>
          <div className="rounded-md border border-gray-800 bg-gray-950/50 px-3 py-2 text-xs text-gray-400">
            {data?.selected.forecastSourceLabel ?? FORECAST_SOURCES.find((source) => source.key === forecastSource)?.label} RTO forecast |{" "}
            {config.rtSource} RT | {config.hub}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-100">Analog Setup</p>
              <p className="mt-1 text-xs text-gray-500">
                {data
                  ? `${data.summary.forecastHourCount.toLocaleString()} forecast hours | ${data.summary.analogCount.toLocaleString()} analog rows`
                  : "Configure forecast source, target hours, and analog pool."}
              </p>
            </div>
            <button
              type="button"
              onClick={openForwardSettings}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Edit View
            </button>
          </div>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
            {forwardChips.map((label) => (
              <span
                key={label}
                className="rounded-md border border-gray-800 bg-[#0d1119] px-2.5 py-1 text-xs font-semibold text-gray-300"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {forwardSettingsOpen && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Edit price distributions view"
            onMouseDown={closeForwardSettings}
          >
            <div
              className="w-full max-w-5xl rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-100">Edit Price Distributions View</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeForwardSettings}
                    className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-700 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyForwardSettings}
                    className="rounded-md border border-gray-200 bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-950 hover:bg-white"
                  >
                    Apply
                  </button>
                </div>
              </div>
              <div className="max-h-[calc(100vh-116px)] space-y-4 overflow-y-auto p-4">
                <ConfigSection
                  step="1"
                  title="Forecast"
                  summary={`${FORECAST_SOURCES.find((source) => source.key === forwardDraft.forecastSource)?.label ?? forwardDraft.forecastSource} RTO | ${forwardDraft.forecastDate || "Latest available"} | HE${forwardDraft.hourStart}-${forwardDraft.hourEnd}`}
                >
                  <div className="grid gap-3 xl:grid-cols-[160px_1fr_120px_120px]">
                    <ConfigField label="Source">
                      <select
                        value={forwardDraft.forecastSource}
                        onChange={(event) =>
                          setForwardDraft((current) => ({
                            ...current,
                            forecastSource: event.target.value as ForecastSourceMode,
                            forecastDate: "",
                          }))
                        }
                        className={FIELD_CONTROL_CLASS}
                      >
                        {FORECAST_SOURCES.map((source) => (
                          <option key={source.key} value={source.key}>
                            {source.label}
                          </option>
                        ))}
                      </select>
                    </ConfigField>
                    <ConfigField label="Forecast date">
                      <div>
                        <select
                          value={forwardDraft.forecastDate}
                          onChange={(event) => updateForwardDraft("forecastDate", event.target.value)}
                          className={FIELD_CONTROL_CLASS}
                        >
                          <option value="">Latest complete date</option>
                          {draftAvailableForecastDates.map((date) => (
                            <option key={date} value={date}>
                              {date}
                            </option>
                          ))}
                          {draftDateOptionsLoading && <option disabled>Loading complete dates...</option>}
                          {draftDateOptionsErrorMessage && !draftAvailableForecastDates.length && (
                            <option disabled>Date list unavailable</option>
                          )}
                          {!draftDateOptionsLoading &&
                            !draftDateOptionsErrorMessage &&
                            draftDateOptionsLoaded &&
                            !draftAvailableForecastDates.length && (
                            <option disabled>No complete dates for these HEs</option>
                          )}
                        </select>
                        <p className="mt-1 text-[11px] leading-4 text-gray-500">
                          Dates require complete load, wind, solar, and WSI temp rows for every selected HE.
                        </p>
                        {draftDateOptionsErrorMessage && (
                          <div className="mt-1 flex items-center gap-2">
                            <p className="text-[11px] leading-4 text-red-300">{draftDateOptionsErrorMessage}</p>
                            <button
                              type="button"
                              onClick={retryForecastDateOptions}
                              className="rounded border border-red-400/40 px-2 py-0.5 text-[11px] font-semibold text-red-100 hover:bg-red-500/10"
                            >
                              Retry
                            </button>
                          </div>
                        )}
                      </div>
                    </ConfigField>
                    <ConfigField label="HE start">
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={forwardDraft.hourStart}
                        onChange={(event) => updateForwardDraft("hourStart", Number(event.target.value))}
                        className={FIELD_CONTROL_CLASS}
                      />
                    </ConfigField>
                    <ConfigField label="HE end">
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={forwardDraft.hourEnd}
                        onChange={(event) => updateForwardDraft("hourEnd", Number(event.target.value))}
                        className={FIELD_CONTROL_CLASS}
                      />
                    </ConfigField>
                  </div>
                </ConfigSection>

                <ConfigSection
                  step="2"
                  title="Analog Window"
                  summary={`${forwardDraft.seasonStart} to ${forwardDraft.seasonEnd} | ${forwardDraft.lookbackYears}Y${forwardDraft.includeCurrentYear ? " + current" : ""}`}
                >
                  <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr_1.4fr] xl:items-end">
                    <ConfigField label="MM-DD start">
                      <input
                        inputMode="numeric"
                        value={forwardDraft.seasonStart}
                        onChange={(event) => updateForwardDraft("seasonStart", event.target.value)}
                        className={FIELD_CONTROL_CLASS}
                      />
                    </ConfigField>
                    <ConfigField label="MM-DD end">
                      <input
                        inputMode="numeric"
                        value={forwardDraft.seasonEnd}
                        onChange={(event) => updateForwardDraft("seasonEnd", event.target.value)}
                        className={FIELD_CONTROL_CLASS}
                      />
                    </ConfigField>
                    <ConfigField label="Lookback years">
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={forwardDraft.lookbackYears}
                        onChange={(event) => updateForwardDraft("lookbackYears", Number(event.target.value))}
                        className={FIELD_CONTROL_CLASS}
                      />
                    </ConfigField>
                    <div className="rounded-lg border border-gray-800 bg-[#0d1119] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-100">Include Current Year</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {forwardDraft.includeCurrentYear ? "Current partial year included" : "Historical years only"}
                          </p>
                        </div>
                        <SourceSwitch
                          enabled={forwardDraft.includeCurrentYear}
                          onChange={(enabled) => updateForwardDraft("includeCurrentYear", enabled)}
                          label="Include current year in forecast analog distribution"
                        />
                      </div>
                    </div>
                  </div>
                </ConfigSection>

                <ConfigSection
                  step="3"
                  title="Output"
                  summary={`${forwardDraft.analogsPerHour} analogs per target hour`}
                >
                  <div className="grid gap-3 xl:grid-cols-[220px_1fr]">
                    <ConfigField label="Analogs / HE">
                      <input
                        type="number"
                        min={20}
                        max={100}
                        value={forwardDraft.analogsPerHour}
                        onChange={(event) => updateForwardDraft("analogsPerHour", Number(event.target.value))}
                        className={FIELD_CONTROL_CLASS}
                      />
                      <p className="mt-1 text-[11px] text-gray-500">
                        40 is the default; 20 minimum; use 80-100 for tail checks.
                      </p>
                    </ConfigField>
                    <div className="rounded-lg border border-gray-800 bg-[#0d1119] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Price Output</p>
                      <p className="mt-2 text-sm font-semibold text-gray-200">
                        {config.hub} | {componentLabel} | {config.rtSource} RT
                      </p>
                    </div>
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
          <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-6 text-sm text-gray-500">
            Loading forecast analog distribution...
          </div>
        )}

        {data && !loading && (
          <>
            <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-3">
              <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
                <div className="min-w-0">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Forecast Hour</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {data.summary.forecastHourCount.toLocaleString()} target hours | {data.summary.analogCount.toLocaleString()} analog rows
                      </p>
                    </div>
                    <div className="text-right text-xs tabular-nums text-gray-500">
                      <p>{data.selected.forecastDate ?? "-"}</p>
                      <p className="mt-1">{seasonStart} to {seasonEnd}</p>
                    </div>
                  </div>
                  <div className="flex overflow-x-auto rounded-md border border-gray-800 bg-[#0d1119] p-1">
                    {data.forecastHours.map((hour) => {
                      const targetKey = forecastHourKey(hour);
                      const selected = targetKey === effectiveSelectedTargetKey;
                      const distribution = hourlyDistributionByTarget.get(targetKey);
                      return (
                        <button
                          key={targetKey}
                          type="button"
                          onClick={() => setSelectedTargetKey(targetKey)}
                          className={`min-w-[112px] border-r border-gray-800 px-3 py-2 text-left text-xs transition-colors last:border-r-0 ${
                            selected
                              ? "rounded-sm bg-amber-500/20 text-amber-100 shadow-inner shadow-amber-500/10"
                              : "text-gray-400 hover:bg-gray-900 hover:text-gray-100"
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-semibold">HE{hour.hourEnding}</span>
                            <span className={selected ? "text-amber-200" : "text-gray-600"}>
                              {fmtNumber(hour.tempF, 0)} F
                            </span>
                          </span>
                          <span className="mt-1 block tabular-nums text-gray-500">
                            {fmtCompactMw(hour.netLoadMw)} NL | {fmtPrice(distribution?.median)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-2 rounded-md border border-gray-800 bg-[#0d1119] p-3 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-100">
                        {selectedForecastHour ? `HE${selectedForecastHour.hourEnding}` : "No HE"}
                      </p>
                      <p className="mt-1 tabular-nums text-gray-500">
                        {fmtDateTime(selectedForecastHour?.forecastDatetimeEpt)}
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="font-semibold text-gray-100">
                        {fmtPrice(selectedHourlyDistribution?.median ?? selectedStats.median)}
                      </p>
                      <p className="mt-1 text-gray-500">Median RT</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 tabular-nums">
                    <div>
                      <p className="text-gray-500">Net Load</p>
                      <p className="mt-1 font-semibold text-gray-200">{fmtCompactMw(selectedForecastHour?.netLoadMw)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Analogs</p>
                      <p className="mt-1 font-semibold text-gray-200">{selectedAnalogPoints.length.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">P95</p>
                      <p className="mt-1 font-semibold text-gray-200">
                        {fmtPrice(selectedHourlyDistribution?.p95 ?? selectedStats.p95)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-md border border-gray-800 bg-gray-950/40 p-2 tabular-nums">
                    <div>
                      <p className="text-gray-500">Median Dist</p>
                      <p className="mt-1 font-semibold text-gray-200">
                        {fmtNumber(selectedDistanceStats.medianDistance, 3)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Max Dist</p>
                      <p className="mt-1 font-semibold text-gray-200">
                        {fmtNumber(selectedDistanceStats.maxDistance, 3)}
                      </p>
                    </div>
                  </div>
                  {yearCounts.historicalPool.length === 1 && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-100">
                      Only {yearCounts.historicalPool[0].year} complete historical rows
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 text-[10px] tabular-nums text-gray-500">
                    {yearCounts.historicalPool.map((item) => (
                      <span key={`historical-${item.year}`} className="rounded-sm bg-gray-900 px-1.5 py-0.5">
                        {item.year}: {item.rowCount.toLocaleString()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_430px]">
              <ForecastLoadTempPlot
                forecastHours={data.forecastHours}
                analogPoints={data.analogPoints}
                hourlyDistributions={data.hourlyDistributions}
                selectedTargetKey={effectiveSelectedTargetKey}
                onSelectTarget={setSelectedTargetKey}
              />

              <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Selected Hour Price Distribution
                  </p>
                  <p className="text-xs tabular-nums text-gray-500">
                    {fmtPrice(selectedStats.minPrice)} to {fmtPrice(selectedStats.maxPrice)}
                  </p>
                </div>
                {selectedForecastHour && (
                  <div className="mb-3 rounded-md border border-gray-800 bg-[#0d1119] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-100">
                          Selected HE{selectedForecastHour.hourEnding} Price Slice
                        </p>
                        <p className="mt-1 text-xs tabular-nums text-gray-500">
                          {fmtDateTime(selectedForecastHour.forecastDatetimeEpt)} |{" "}
                          {(selectedHourlyDistribution?.analogCount ?? selectedAnalogPoints.length).toLocaleString()} analogs
                        </p>
                      </div>
                      <div className="text-right text-xs tabular-nums">
                        <p className="font-semibold text-gray-100">
                          {fmtPrice(selectedHourlyDistribution?.median ?? selectedStats.median)}
                        </p>
                        <p className="mt-1 text-gray-500">
                          P95 {fmtPrice(selectedHourlyDistribution?.p95 ?? selectedStats.p95)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-xs tabular-nums">
                      <div>
                        <p className="text-gray-500">P25</p>
                        <p className="mt-1 font-semibold text-gray-200">
                          {fmtPrice(selectedHourlyDistribution?.p25 ?? selectedStats.p25)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Median</p>
                        <p className="mt-1 font-semibold text-gray-200">
                          {fmtPrice(selectedHourlyDistribution?.median ?? selectedStats.median)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">P75</p>
                        <p className="mt-1 font-semibold text-gray-200">
                          {fmtPrice(selectedHourlyDistribution?.p75 ?? selectedStats.p75)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">P95</p>
                        <p className="mt-1 font-semibold text-gray-200">
                          {fmtPrice(selectedHourlyDistribution?.p95 ?? selectedStats.p95)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  {selectedPriceDistribution.histogram.map((bin) => (
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
                  {!selectedPriceDistribution.histogram.length && (
                    <div className="rounded-md border border-gray-800 bg-[#0d1119] p-4 text-sm text-gray-500">
                      No selected-hour analog prices are available.
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-xs tabular-nums">
                  <div className="rounded-md border border-gray-800 bg-[#0d1119] p-2">
                    <p className="text-gray-500">Mean</p>
                    <p className="mt-1 font-semibold text-gray-200">{fmtPrice(selectedStats.meanPrice)}</p>
                  </div>
                  <div className="rounded-md border border-gray-800 bg-[#0d1119] p-2">
                    <p className="text-gray-500">Std Dev</p>
                    <p className="mt-1 font-semibold text-gray-200">{fmtPrice(selectedStats.stdDev)}</p>
                  </div>
                  <div className="rounded-md border border-gray-800 bg-[#0d1119] p-2">
                    <p className="text-gray-500">Above $100</p>
                    <p className="mt-1 font-semibold text-gray-200">{fmtPct(selectedPriceDistribution.tails.above100)}</p>
                  </div>
                  <div className="rounded-md border border-gray-800 bg-[#0d1119] p-2">
                    <p className="text-gray-500">Below $0</p>
                    <p className="mt-1 font-semibold text-gray-200">{fmtPct(selectedPriceDistribution.tails.belowZero)}</p>
                  </div>
                </div>
              </div>
            </div>

            <AnalogPoolHeatmap
              forecastHours={data.forecastHours}
              analogPoints={data.analogPoints}
              selectedTargetKey={effectiveSelectedTargetKey}
              onSelectTarget={setSelectedTargetKey}
            />
          </>
        )}
      </div>
    </section>
  );
}
export default function PjmPriceDistributions({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmPriceDistributionsFreshnessSummary) => void;
}) {
  const config = useMemo(() => defaultPriceDistributionsConfig(), []);
  const componentLabel = COMPONENTS.find((item) => item.key === config.component)?.label ?? config.component;

  return (
    <div className="space-y-4">
      <ForecastAnalogDistributionPanel
        config={config}
        componentLabel={componentLabel}
        refreshToken={refreshToken}
        onFreshnessChange={onFreshnessChange}
      />
    </div>
  );
}
