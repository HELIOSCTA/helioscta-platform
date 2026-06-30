"use client";

import type {
  MouseEvent as ReactMouseEvent,
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
type ForecastSourceMode = "pjm" | "meteologica";

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
const FORECAST_SOURCES: Array<{ key: ForecastSourceMode; label: string; description: string }> = [
  { key: "pjm", label: "PJM", description: "PJM Data Miner RTO net load" },
  { key: "meteologica", label: "METEO", description: "Meteologica RTO load, wind, solar" },
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
    outagesEnabled: false,
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

function freshnessFromForecastAnalogPayload(
  payload: ForecastAnalogPayload | null,
  config: ScatterConfig,
  componentLabel: string,
): PjmActualsRegimeScatterFreshnessSummary {
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
}: {
  config: ScatterConfig;
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
  config: ScatterConfig;
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
    config.minPrice,
    config.maxPrice,
    config.outagesEnabled ? config.minOutages : "",
    config.outagesEnabled ? config.maxOutages : "",
    analogsPerHour,
  ].join(":");
}

function forecastAnalogDatesCacheKey({
  config,
  forecastSource,
  hourStart,
  hourEnd,
}: {
  config: ScatterConfig;
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
      const radius = 3;
      return {
        point,
        x: p.x,
        y: p.y,
        depth: 0,
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
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500">No point selected.</p>
            )}
          </div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Color Groups</p>
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
            {!regimes.length && <p className="text-xs text-gray-500">No color groups.</p>}
          </div>
        </div>
      </div>
    </div>
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
  onFreshnessChange,
}: {
  config: ScatterConfig;
  componentLabel: string;
  onFreshnessChange?: (freshness: PjmActualsRegimeScatterFreshnessSummary) => void;
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
      url: buildForecastAnalogUrl(request),
      ttlMs: API_CACHE_TTL_MS,
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
            <h2 className="text-base font-semibold text-gray-100">Forward Analog Prices</h2>
            <p className="mt-1 max-w-4xl text-sm text-gray-500">
              Latest forecast fundamentals are matched against similar historical actual hours to form a
              forward RT price distribution for {config.hub} {componentLabel}.
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
              <p className="text-sm font-semibold text-gray-100">Forward Analog View</p>
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
            aria-label="Edit forward analog prices view"
            onMouseDown={closeForwardSettings}
          >
            <div
              className="w-full max-w-5xl rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-100">Edit Forward Analog Prices View</h2>
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
  const [activeTab] = useState<ActualsScatterTab>("forecast_analog_distribution");
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
    hourFilter,
    dayType,
    regimeColor,
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
    if (activeTab !== "historical_scatter") {
      setLoading(false);
      setError(null);
      setData(null);
      onFreshnessChange?.({
        ...DEFAULT_FRESHNESS,
        summary: "Forward analog prices",
        targetDateLabel: `${hub} | ${rtSource} ${component}`,
      });
      return;
    }

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
  }, [activeTab, appliedConfig, component, hub, onFreshnessChange, refreshToken, rtSource]);

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
  const draftHourFilterLabel =
    HOUR_FILTERS.find((item) => item.key === draftConfig.hourFilter)?.label ?? draftConfig.hourFilter;
  const draftDayTypeLabel = DAY_TYPES.find((item) => item.key === draftConfig.dayType)?.label ?? draftConfig.dayType;
  const draftRegimeColors = REGIME_COLORS.filter((item) => item.key !== "outage");
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
    hourFilterLabel,
    dayTypeLabel,
    `Color ${regimeColorLabel}`,
  ].filter((label): label is string => Boolean(label));

  return (
    <div className="space-y-4">
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
                summary="Load, wind, solar, weather, and RT price actuals"
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <DataSourceCard
                    title="Load Actuals"
                    description="Hourly gross load"
                    enabled
                    required
                    meta={draftConfig.loadArea}
                  />
                  <DataSourceCard
                    title="Wind Actuals"
                    description="Hourly wind output"
                    enabled
                    required
                    meta={draftConfig.generationArea}
                  />
                  <DataSourceCard
                    title="Solar Actuals"
                    description="Hourly solar output"
                    enabled
                    required
                    meta={draftConfig.generationArea}
                  />
                  <DataSourceCard
                    title="Temp Actuals"
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
                title="View Filters"
                summary={`${draftHourFilterLabel}, ${draftDayTypeLabel}, color ${draftRegimeColorLabel}`}
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
        <ForecastAnalogDistributionPanel
          config={appliedConfig}
          componentLabel={componentLabel}
          onFreshnessChange={onFreshnessChange}
        />
      )}
    </div>
  );
}
