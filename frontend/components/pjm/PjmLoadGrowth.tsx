"use client";

import type { ReactNode } from "react";
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
import DataTableShell from "@/components/dashboard/DataTableShell";
import PlotCard, { type PlotSeries } from "@/components/dashboard/PlotCard";
import MultiSelect from "@/components/ui/MultiSelect";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type WeatherMetric = "tempF" | "dewPointF" | "feelsLikeF";
type LoadShape = "flat" | "onpeak" | "offpeak" | "peak";
type DayType = "all" | "weekdays" | "weekends";
type DateMode = "lookback" | "range" | "month-years";
type LoadAreaGroupKey = "rto" | "west" | "midatl" | "south" | "other";
type LoadGrowthTableKey =
  | "dailyFitStats"
  | "dailyGrowthBands"
  | "dailyPairs";

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

interface PjmLoadGrowthYoyPayload {
  iso: "pjm";
  source: string;
  selected: {
    loadArea: string;
    stationId: string;
    stationName: string;
    region: string;
    lookbackDays: number;
    asOfDate: string | null;
    dateMode: DateMode;
    startDate: string | null;
    endDate: string | null;
    month: number;
    years: number[];
    loadShape: LoadShape;
    dayType: DayType;
  };
  availableAreas: AvailableArea[];
  weatherStations: WeatherStation[];
  windows: {
    currentStart: string | null;
    currentEndExclusive: string | null;
    lastYearStart: string | null;
    lastYearEndExclusive: string | null;
  };
  coverage: {
    loadMinEpt: string | null;
    loadMaxEpt: string | null;
    weatherMinLocal: string | null;
    weatherMaxLocal: string | null;
  };
  freshness: {
    status: string;
    runAt: string;
    reason: string | null;
  };
  summary: {
    matchedDays: number;
    currentAvgLoadMw: number | null;
    lastYearAvgLoadMw: number | null;
    avgLoadDiffMw: number | null;
    avgLoadGrowthPct: number | null;
    currentAvgTempF: number | null;
    lastYearAvgTempF: number | null;
    currentAvgFeelsLikeF: number | null;
    lastYearAvgFeelsLikeF: number | null;
    currentHourCount: number;
    lastYearHourCount: number;
    currentUnverifiedHours: number;
    currentPrelimHours: number;
    lastYearUnverifiedHours: number;
    lastYearPrelimHours: number;
  };
  daily: Array<{
    mmDd: string;
    currentDate: string | null;
    lastYearDate: string | null;
    currentLoadMw: number | null;
    lastYearLoadMw: number | null;
    diffMw: number | null;
    growthPct: number | null;
    currentTempF: number | null;
    lastYearTempF: number | null;
    currentFeelsLikeF: number | null;
    lastYearFeelsLikeF: number | null;
    currentHourCount: number;
    lastYearHourCount: number;
    currentUnverifiedHours: number;
    currentPrelimHours: number;
    lastYearUnverifiedHours: number;
    lastYearPrelimHours: number;
  }>;
}

interface FitMetricRow {
  dataSource: string;
  degree: number | null;
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  spearmanCorrelation: number | null;
  explainedVariance: number | null;
  rSquared: number | null;
  adjustedRSquared: number | null;
}

interface GrowthBandRow {
  weatherValue: number;
  currentFit: number;
  lastYearFit: number;
  diff: number;
  growthPct: number | null;
  averageDiff?: number;
  averageGrowthPct?: number | null;
}

interface FitSeries {
  degree: number | null;
  coeffs: number[] | null;
  line: Array<{ x: number; y: number }>;
  stats: FitMetricRow;
}

interface DailyFitPoint {
  x: number;
  y: number;
  date: string;
  label: string;
  loadSourceDetail: string;
  hourEnding?: number;
}

interface DailyFitResult {
  currentPoints: DailyFitPoint[];
  lastYearPoints: DailyFitPoint[];
  lookbackPoints: Array<DailyFitPoint & { size: number }>;
  currentFit: FitSeries;
  lastYearFit: FitSeries;
  fitStats: FitMetricRow[];
  growthBands: GrowthBandRow[];
}

interface ChartTooltipPayload {
  name?: string | number;
  value?: unknown;
  color?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: readonly ChartTooltipPayload[];
}

export interface PjmLoadGrowthFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_AREA = "DOM";
const DEFAULT_REGION = "PJM";
const DEFAULT_WEATHER_STATION = "KRIC";
const DEFAULT_LOOKBACK_DAYS = 56;
const DEFAULT_PLOT_LOOKBACK_DAYS = 10;
const DEFAULT_LOAD_SHAPE: LoadShape = "flat";
const DEFAULT_DAY_TYPE: DayType = "all";
const DEFAULT_DATE_MODE: DateMode = "range";
const DEFAULT_MONTH = 1;
const DEFAULT_YEARS = ["2024", "2025", "2026"];
const DEFAULT_END = addDaysIsoDate(todayIsoDate(), -1);
const DEFAULT_START = addDaysIsoDate(DEFAULT_END, -(DEFAULT_LOOKBACK_DAYS - 1));
const STATION_NAME_FALLBACK: Record<string, string> = {
  KRIC: "Richmond",
  KDCA: "Washington",
};
const WEATHER_METRICS: Array<{ key: WeatherMetric; label: string; unit: string; color: string }> = [
  { key: "tempF", label: "Temp", unit: "F", color: "#f97316" },
  { key: "dewPointF", label: "Dew Point", unit: "F", color: "#38bdf8" },
  { key: "feelsLikeF", label: "Feels Like", unit: "F", color: "#facc15" },
];
const LOAD_SHAPES: Array<{ key: LoadShape; label: string }> = [
  { key: "flat", label: "Flat" },
  { key: "onpeak", label: "Onpeak" },
  { key: "offpeak", label: "Offpeak" },
  { key: "peak", label: "Peak" },
];
const DAY_TYPES: Array<{ key: DayType; label: string }> = [
  { key: "all", label: "All Days" },
  { key: "weekdays", label: "Weekdays" },
  { key: "weekends", label: "Weekends" },
];
const DATE_MODES: Array<{ key: DateMode; label: string }> = [
  { key: "range", label: "Date Range" },
  { key: "month-years", label: "Month + Years" },
];
const LOAD_AREA_GROUPS: Array<{ key: LoadAreaGroupKey; label: string }> = [
  { key: "rto", label: "RTO" },
  { key: "west", label: "West" },
  { key: "midatl", label: "Mid-Atlantic" },
  { key: "south", label: "South" },
  { key: "other", label: "Other" },
];
const WEST_LOAD_AREAS = new Set(["AEP", "AP", "ATSI", "COMED", "DAYTON", "DEOK", "DUQ", "DUQUESNE", "EKPC", "WEST", "WESTERN_REGION"]);
const MIDATL_LOAD_AREAS = new Set(["AECO", "BGE", "DPL", "JCPL", "METED", "MIDATL", "MID_ATLANTIC_REGION", "PECO", "PEPCO", "PPL", "PSEG", "RECO"]);
const SOUTH_LOAD_AREAS = new Set(["DOM", "DOMINION", "SOUTH", "SOUTHERN_REGION"]);
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
const YEAR_OPTIONS = Array.from({ length: 8 }, (_, index) => String(new Date().getFullYear() - index)).sort();
const DAILY_FIT_SERIES: PlotSeries[] = [
  { key: "currentYear", label: "Current Year", color: "#ef4444", defaultVisible: true },
  { key: "lastYear", label: "Last Year", color: "#a855f7", defaultVisible: true },
  { key: "lookback", label: "Lookback", color: "#7dd3fc", defaultVisible: true },
  { key: "currentFit", label: "Current Fit", color: "#ef4444", defaultVisible: true },
  { key: "lastYearFit", label: "Last Year Fit", color: "#a855f7", defaultVisible: true },
];
const DEFAULT_FRESHNESS: PjmLoadGrowthFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Load-weather --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

function fmtMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString()} MW`;
}

function fmtShortMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString();
}

function fmtNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function fmtTemp(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value)}F`;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function fmtTooltipDate(value: string | null | undefined): string {
  if (!value) return "-";
  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return datePart;
  const weekday = date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${weekday} ${month}-${String(date.getUTCDate()).padStart(2, "0")} ${date.getUTCFullYear()}`;
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function loadSourceMixLabel(unverifiedHours: number, prelimHours: number): string {
  if (unverifiedHours > 0 && prelimHours === 0) return "Unverified Metered";
  if (prelimHours > 0 && unverifiedHours === 0) return "Prelim";
  if (unverifiedHours > 0 && prelimHours > 0) return `Mixed: ${unverifiedHours} unverified / ${prelimHours} prelim`;
  return "-";
}

function loadAreaGroupKey(loadArea: string): LoadAreaGroupKey {
  if (loadArea === "RTO" || loadArea === "RTO_COMBINED" || loadArea === "PJM") return "rto";
  if (SOUTH_LOAD_AREAS.has(loadArea)) return "south";
  if (MIDATL_LOAD_AREAS.has(loadArea) || loadArea.includes("MIDATL")) return "midatl";
  if (WEST_LOAD_AREAS.has(loadArea)) return "west";
  return "other";
}

function loadAreaSortValue(loadArea: string): string {
  if (loadArea === "RTO" || loadArea === "RTO_COMBINED" || loadArea === "PJM") return `000-${loadArea}`;
  if (loadArea.endsWith("_REGION")) return `001-${loadArea}`;
  return `100-${loadArea}`;
}

function stationDisplayName(
  station: { stationId: string; stationName?: string | null },
  includeCode = true,
): string {
  const name = (station.stationName ?? STATION_NAME_FALLBACK[station.stationId] ?? station.stationId).trim();
  const fallbackName = STATION_NAME_FALLBACK[station.stationId] ?? name;
  const displayName = name === station.stationId ? fallbackName : name;
  if (!includeCode || displayName === station.stationId) return displayName;
  return `${displayName} (${station.stationId})`;
}

function metricConfig(metric: WeatherMetric) {
  return WEATHER_METRICS.find((item) => item.key === metric) ?? WEATHER_METRICS[0];
}

function dailyWeatherValue(
  row: PjmLoadGrowthYoyPayload["daily"][number],
  metric: WeatherMetric,
  period: "current" | "lastYear",
): number | null {
  if (metric === "feelsLikeF") {
    return period === "current" ? row.currentFeelsLikeF : row.lastYearFeelsLikeF;
  }
  return period === "current" ? row.currentTempF : row.lastYearTempF;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function determinant3(matrix: number[][]): number {
  return (
    matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1]) -
    matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0]) +
    matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0])
  );
}

function solveQuadratic(points: Array<{ x: number; y: number }>): number[] | null {
  const n = points.length;
  const sx = points.reduce((sum, point) => sum + point.x, 0);
  const sx2 = points.reduce((sum, point) => sum + point.x ** 2, 0);
  const sx3 = points.reduce((sum, point) => sum + point.x ** 3, 0);
  const sx4 = points.reduce((sum, point) => sum + point.x ** 4, 0);
  const sy = points.reduce((sum, point) => sum + point.y, 0);
  const sxy = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sx2y = points.reduce((sum, point) => sum + point.x ** 2 * point.y, 0);
  const matrix = [
    [sx4, sx3, sx2],
    [sx3, sx2, sx],
    [sx2, sx, n],
  ];
  const det = determinant3(matrix);
  if (Math.abs(det) < 1e-9) return null;
  const detA = determinant3([
    [sx2y, sx3, sx2],
    [sxy, sx2, sx],
    [sy, sx, n],
  ]);
  const detB = determinant3([
    [sx4, sx2y, sx2],
    [sx3, sxy, sx],
    [sx2, sy, n],
  ]);
  const detC = determinant3([
    [sx4, sx3, sx2y],
    [sx3, sx2, sxy],
    [sx2, sx, sy],
  ]);
  return [detA / det, detB / det, detC / det];
}

function fitCoefficients(points: Array<{ x: number; y: number }>, degree: 1 | 2): number[] | null {
  if (points.length < degree + 1) return null;
  if (degree === 2) return solveQuadratic(points);
  const xAvg = mean(points.map((point) => point.x));
  const yAvg = mean(points.map((point) => point.y));
  if (xAvg === null || yAvg === null) return null;
  const numerator = points.reduce((sum, point) => sum + (point.x - xAvg) * (point.y - yAvg), 0);
  const denominator = points.reduce((sum, point) => sum + (point.x - xAvg) ** 2, 0);
  if (Math.abs(denominator) < 1e-9) return null;
  const slope = numerator / denominator;
  return [slope, yAvg - slope * xAvg];
}

function evalPoly(coeffs: number[], x: number): number {
  if (coeffs.length === 3) return coeffs[0] * x ** 2 + coeffs[1] * x + coeffs[2];
  return coeffs[0] * x + coeffs[1];
}

function aic(points: Array<{ x: number; y: number }>, coeffs: number[]): number {
  const mse = mean(points.map((point) => (point.y - evalPoly(coeffs, point.x)) ** 2));
  if (mse === null || mse <= 0) return Number.POSITIVE_INFINITY;
  return points.length * Math.log(mse) + 2 * coeffs.length;
}

function rank(values: number[]): number[] {
  return values.map((value) => 1 + values.filter((other) => other < value).length + (values.filter((other) => other === value).length - 1) / 2);
}

function correlation(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = mean(left);
  const rightMean = mean(right);
  if (leftMean === null || rightMean === null) return null;
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const leftVariance = left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0);
  const rightVariance = right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0);
  if (leftVariance === 0 || rightVariance === 0) return null;
  return numerator / Math.sqrt(leftVariance * rightVariance);
}

function regressionStats(points: Array<{ x: number; y: number }>, coeffs: number[] | null, label: string, degree: number | null): FitMetricRow {
  if (!coeffs || points.length < 3) {
    return {
      dataSource: label,
      degree,
      mae: null,
      rmse: null,
      mape: null,
      spearmanCorrelation: null,
      explainedVariance: null,
      rSquared: null,
      adjustedRSquared: null,
    };
  }
  const actual = points.map((point) => point.y);
  const predicted = points.map((point) => evalPoly(coeffs, point.x));
  const residuals = actual.map((value, index) => value - predicted[index]);
  const yMean = mean(actual) ?? 0;
  const mae = mean(residuals.map((value) => Math.abs(value)));
  const mse = mean(residuals.map((value) => value ** 2));
  const rmse = mse === null ? null : Math.sqrt(mse);
  const mape = mean(actual.map((value, index) => Math.abs((value - predicted[index]) / Math.max(Math.abs(value), Number.EPSILON)))) ?? null;
  const ssRes = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const ssTot = actual.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  const rSquared = ssTot === 0 ? null : 1 - ssRes / ssTot;
  const residualVariance = mean(residuals.map((value) => (value - (mean(residuals) ?? 0)) ** 2));
  const actualVariance = mean(actual.map((value) => (value - yMean) ** 2));
  const adjustedRSquared =
    rSquared === null || points.length <= 2 ? null : 1 - ((1 - rSquared) * (points.length - 1)) / (points.length - 2);
  return {
    dataSource: label,
    degree,
    mae,
    rmse,
    mape: mape === null ? null : mape * 100,
    spearmanCorrelation: correlation(rank(actual), rank(predicted)),
    explainedVariance: actualVariance && residualVariance !== null ? 1 - residualVariance / actualVariance : null,
    rSquared,
    adjustedRSquared,
  };
}

function fitSeries(points: Array<{ x: number; y: number }>, label: string): FitSeries {
  const linear = fitCoefficients(points, 1);
  const quadratic = fitCoefficients(points, 2);
  const selected =
    quadratic && linear && aic(points, quadratic) < aic(points, linear)
      ? { degree: 2, coeffs: quadratic }
      : linear
        ? { degree: 1, coeffs: linear }
        : { degree: null, coeffs: null };
  const xs = points.map((point) => point.x);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;
  const line =
    selected.coeffs && maxX > minX
      ? Array.from({ length: 80 }, (_, index) => {
          const x = minX + ((maxX - minX) * index) / 79;
          return { x, y: evalPoly(selected.coeffs!, x) };
        })
      : [];
  return {
    degree: selected.degree,
    coeffs: selected.coeffs,
    line,
    stats: regressionStats(points, selected.coeffs, label, selected.degree),
  };
}

function buildDailyFit(data: PjmLoadGrowthYoyPayload | null, metric: WeatherMetric, selectedLookbackDays: number): DailyFitResult | null {
  if (!data?.daily.length) return null;
  const sorted = [...data.daily].sort((left, right) => String(left.currentDate).localeCompare(String(right.currentDate)));
  const currentPoints = sorted
    .map((row) => ({
      x: dailyWeatherValue(row, metric, "current"),
      y: row.currentLoadMw,
      date: row.currentDate ?? row.mmDd,
      label: row.currentDate ?? row.mmDd,
      loadSourceDetail: loadSourceMixLabel(row.currentUnverifiedHours, row.currentPrelimHours),
    }))
    .filter((point): point is DailyFitPoint => point.x !== null && point.y !== null);
  const lastYearPoints = sorted
    .map((row) => ({
      x: dailyWeatherValue(row, metric, "lastYear"),
      y: row.lastYearLoadMw,
      date: row.lastYearDate ?? row.mmDd,
      label: row.lastYearDate ?? row.mmDd,
      loadSourceDetail: loadSourceMixLabel(row.lastYearUnverifiedHours, row.lastYearPrelimHours),
    }))
    .filter((point): point is DailyFitPoint => point.x !== null && point.y !== null);
  const currentFit = fitSeries(currentPoints, "Current Year");
  const lastYearFit = fitSeries(lastYearPoints, "Last Year");
  const minX = Math.max(Math.min(...currentPoints.map((point) => point.x)), Math.min(...lastYearPoints.map((point) => point.x)));
  const maxX = Math.min(Math.max(...currentPoints.map((point) => point.x)), Math.max(...lastYearPoints.map((point) => point.x)));
  const bandStart = Math.floor(minX / 2) * 2;
  const bandEnd = Math.ceil(maxX / 2) * 2;
  const growthBands: GrowthBandRow[] =
    currentFit.coeffs && lastYearFit.coeffs && Number.isFinite(bandStart) && Number.isFinite(bandEnd)
      ? Array.from({ length: Math.max(0, Math.floor((bandEnd - bandStart) / 2) + 1) }, (_, index) => {
          const weatherValue = bandStart + index * 2;
          const currentFitValue = evalPoly(currentFit.coeffs!, weatherValue);
          const lastYearFitValue = evalPoly(lastYearFit.coeffs!, weatherValue);
          return {
            weatherValue,
            currentFit: currentFitValue,
            lastYearFit: lastYearFitValue,
            diff: currentFitValue - lastYearFitValue,
            growthPct: lastYearFitValue === 0 ? null : ((currentFitValue - lastYearFitValue) / lastYearFitValue) * 100,
          };
        })
      : [];
  const avgDiff = mean(growthBands.map((row) => row.diff));
  const avgGrowth = mean(growthBands.map((row) => row.growthPct).filter((value): value is number => value !== null));
  if (growthBands[0]) {
    growthBands[0] = { ...growthBands[0], averageDiff: avgDiff ?? undefined, averageGrowthPct: avgGrowth };
  }
  return {
    currentPoints,
    lastYearPoints,
    lookbackPoints: currentPoints
      .slice(-Math.max(1, selectedLookbackDays))
      .map((point, index, rows) => ({ ...point, size: 9 + index * (10 / Math.max(rows.length - 1, 1)) })),
    currentFit,
    lastYearFit,
    fitStats: [currentFit.stats, lastYearFit.stats],
    growthBands,
  };
}

function buildYoyApiUrl({
  area,
  weatherStation,
  region,
  lookbackDays,
  dateMode,
  startDate,
  endDate,
  month,
  years,
  loadShape,
  dayType,
  refresh,
}: {
  area: string;
  weatherStation: string;
  region: string;
  lookbackDays: number;
  dateMode: DateMode;
  startDate: string;
  endDate: string;
  month: number;
  years: string[];
  loadShape: LoadShape;
  dayType: DayType;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({
    loadArea: area || DEFAULT_AREA,
    stationId: weatherStation || DEFAULT_WEATHER_STATION,
    region,
    lookbackDays: String(lookbackDays),
    dateMode,
    month: String(month),
    loadShape,
    dayType,
  });
  if (dateMode === "range" && startDate) params.set("start", startDate);
  if (dateMode === "range" && endDate) params.set("end", endDate);
  if (years.length) params.set("years", years.join(","));
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-load-growth-yoy?${params.toString()}`;
}

function yoyCacheKey({
  area,
  weatherStation,
  region,
  lookbackDays,
  dateMode,
  startDate,
  endDate,
  month,
  years,
  loadShape,
  dayType,
}: {
  area: string;
  weatherStation: string;
  region: string;
  lookbackDays: number;
  dateMode: DateMode;
  startDate: string;
  endDate: string;
  month: number;
  years: string[];
  loadShape: LoadShape;
  dayType: DayType;
}): string {
  return [
    "api:pjm-load-growth-yoy",
    area || DEFAULT_AREA,
    weatherStation || DEFAULT_WEATHER_STATION,
    region,
    lookbackDays,
    dateMode,
    startDate,
    endDate,
    month,
    years.join(","),
    loadShape,
    dayType,
  ].join(":");
}

function statusClass(status: string): string {
  if (status === "Limited") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (status === "No overlap") return "border-orange-500/40 bg-orange-500/10 text-orange-100";
  if (status === "Error") return "border-red-500/40 bg-red-500/10 text-red-200";
  return "border-gray-700 bg-gray-900 text-gray-400";
}

function freshnessFromYoyPayload(payload: PjmLoadGrowthYoyPayload | null): PjmLoadGrowthFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  return {
    status: payload.freshness.status,
    statusClass: payload.freshness.status === "Ready"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
      : "border-amber-500/40 bg-amber-500/10 text-amber-100",
    summary: `${payload.summary.matchedDays.toLocaleString()} paired days | ${payload.summary.currentHourCount.toLocaleString()} current hours`,
    targetDateLabel: `${payload.selected.loadArea} ${stationDisplayName({
      stationId: payload.selected.stationId,
      stationName: payload.selected.stationName,
    })}`,
    latestDateLabel: fmtDate(payload.windows.currentEndExclusive),
    latestUpdateLabel: fmtDateTime(payload.freshness.runAt),
  };
}

export default function PjmLoadGrowth({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmLoadGrowthFreshnessSummary) => void;
}) {
  const [area, setArea] = useState(DEFAULT_AREA);
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DEFAULT_END);
  const [weatherStation, setWeatherStation] = useState(DEFAULT_WEATHER_STATION);
  const [region] = useState(DEFAULT_REGION);
  const [weatherMetric, setWeatherMetric] = useState<WeatherMetric>("feelsLikeF");
  const [lookbackDays, setLookbackDays] = useState(DEFAULT_LOOKBACK_DAYS);
  const [plotLookbackDays, setPlotLookbackDays] = useState(DEFAULT_PLOT_LOOKBACK_DAYS);
  const [loadShape, setLoadShape] = useState<LoadShape>(DEFAULT_LOAD_SHAPE);
  const [dayType, setDayType] = useState<DayType>(DEFAULT_DAY_TYPE);
  const [dateMode, setDateMode] = useState<DateMode>(DEFAULT_DATE_MODE);
  const [selectedMonth, setSelectedMonth] = useState(DEFAULT_MONTH);
  const [selectedYears, setSelectedYears] = useState<string[]>(DEFAULT_YEARS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hiddenDailyFitSeries, setHiddenDailyFitSeries] = useState<Set<string>>(() => new Set());
  const [openTables, setOpenTables] = useState<Record<LoadGrowthTableKey, boolean>>({
    dailyFitStats: true,
    dailyGrowthBands: true,
    dailyPairs: false,
  });
  const [yoyData, setYoyData] = useState<PjmLoadGrowthYoyPayload | null>(null);
  const [yoyLoading, setYoyLoading] = useState(true);
  const [yoyError, setYoyError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setYoyLoading(true);
    setYoyError(null);

    fetchJsonWithCache<PjmLoadGrowthYoyPayload>({
      key: yoyCacheKey({
        area,
        weatherStation,
        region,
        lookbackDays,
        dateMode,
        startDate,
        endDate,
        month: selectedMonth,
        years: selectedYears,
        loadShape,
        dayType,
      }),
      url: buildYoyApiUrl({
        area,
        weatherStation,
        region,
        lookbackDays,
        dateMode,
        startDate,
        endDate,
        month: selectedMonth,
        years: selectedYears,
        loadShape,
        dayType,
        refresh: refreshToken > 0,
      }),
      ttlMs: API_CACHE_TTL_MS,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setYoyData(payload);
        onFreshnessChange?.(freshnessFromYoyPayload(payload));
        if (payload.selected.loadArea !== area) setArea(payload.selected.loadArea);
        if (payload.selected.stationId !== weatherStation) setWeatherStation(payload.selected.stationId);
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setYoyError(err.message || "Failed to load PJM daily load-growth data");
        setYoyData(null);
        onFreshnessChange?.({
          ...DEFAULT_FRESHNESS,
          status: "Error",
          statusClass: statusClass("Error"),
          summary: err.message || "Load-growth query failed",
        });
      })
      .finally(() => {
        if (active) setYoyLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    area,
    dateMode,
    dayType,
    endDate,
    loadShape,
    lookbackDays,
    onFreshnessChange,
    refreshToken,
    region,
    selectedMonth,
    selectedYears,
    startDate,
    weatherStation,
  ]);

  const selectedMetric = metricConfig(weatherMetric);
  const dailyFit = useMemo(
    () => buildDailyFit(yoyData, weatherMetric, plotLookbackDays),
    [plotLookbackDays, weatherMetric, yoyData],
  );
  const sharedAreas = useMemo(
    () => (yoyData?.availableAreas.length ? yoyData.availableAreas : [{ area, rowCount: 0, minEpt: null, maxEpt: null }]),
    [area, yoyData],
  );
  const groupedLoadAreas = useMemo(() => {
    const groups = new Map<LoadAreaGroupKey, AvailableArea[]>();
    sharedAreas.forEach((item) => {
      const key = loadAreaGroupKey(item.area);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });

    return LOAD_AREA_GROUPS.map((group) => ({
      ...group,
      areas: (groups.get(group.key) ?? []).sort((left, right) =>
        loadAreaSortValue(left.area).localeCompare(loadAreaSortValue(right.area)),
      ),
    })).filter((group) => group.areas.length > 0);
  }, [sharedAreas]);
  const sharedStations = yoyData?.weatherStations.length
    ? yoyData.weatherStations
    : [{ stationId: weatherStation, stationName: weatherStation, region }];
  const selectedStation =
    sharedStations.find((station) => station.stationId === weatherStation) ??
    (yoyData
      ? {
          stationId: yoyData.selected.stationId,
          stationName: yoyData.selected.stationName,
          region: yoyData.selected.region,
        }
      : { stationId: weatherStation, stationName: weatherStation, region });
  const selectedStationName = stationDisplayName(selectedStation, false);
  const selectedStationLabel = stationDisplayName(selectedStation);
  const selectedShapeLabel = LOAD_SHAPES.find((item) => item.key === loadShape)?.label ?? "Flat";
  const selectedDayTypeLabel = DAY_TYPES.find((item) => item.key === dayType)?.label ?? "All Days";
  const selectedMonthLabel = MONTHS.find((item) => item.value === selectedMonth)?.label ?? "Jan";
  const dateSelectionLabel =
    dateMode === "month-years"
      ? `${selectedMonthLabel} ${selectedYears.join(", ")}`
      : `${startDate || "Start"} to ${endDate || "End"}`;
  const plotLookbackLabel = `Highlight ${plotLookbackDays}d`;
  const dailyFitSummary = {
    averageDiff: dailyFit?.growthBands[0]?.averageDiff,
    averageGrowthPct: dailyFit?.growthBands[0]?.averageGrowthPct,
    currentR2: dailyFit?.currentFit.stats.rSquared,
    lastYearR2: dailyFit?.lastYearFit.stats.rSquared,
    currentMae: dailyFit?.currentFit.stats.mae,
  };

  const toggleDailyFitSeries = (key: string) => {
    setHiddenDailyFitSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleTable = (key: LoadGrowthTableKey) => {
    setOpenTables((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const applyDataLookback = (days: number) => {
    const anchorEnd = endDate || DEFAULT_END;
    setDateMode("range");
    setLookbackDays(days);
    setEndDate(anchorEnd);
    setStartDate(addDaysIsoDate(anchorEnd, -(days - 1)));
  };

  const renderTooltipRow = (label: string, value: string, color?: string) => (
    <div key={label} className="mt-1 flex items-center justify-between gap-6">
      <span className="flex items-center gap-2 text-gray-600">
        {color && <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />}
        {label}
      </span>
      <span className="font-semibold tabular-nums text-gray-950">{value}</span>
    </div>
  );

  const renderWhiteTooltip = (header: string, rows: ReactNode) => (
    <div className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 shadow-xl">
      <div className="border-b border-gray-200 pb-1 font-semibold tabular-nums text-gray-950">{header}</div>
      {rows}
    </div>
  );

  const renderDailyFitTooltip = ({ active, payload }: ChartTooltipProps) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload ?? {};
    const header =
      typeof point.date === "string"
        ? fmtTooltipDate(point.date)
        : typeof point.label === "string"
          ? fmtTooltipDate(point.label)
          : "Fit";
    const hourEnding = typeof point.hourEnding === "number" ? ` HE${String(point.hourEnding).padStart(2, "0")}` : "";
    const weatherValue = typeof point.x === "number" ? fmtTemp(point.x) : "-";
    const loadValue = typeof point.y === "number" ? fmtMw(point.y) : "-";
    return renderWhiteTooltip(
      `${header}${hourEnding}`,
      <>
        {renderTooltipRow("Load Source", typeof point.loadSourceDetail === "string" ? point.loadSourceDetail : "-")}
        {renderTooltipRow(selectedMetric.label, weatherValue, selectedMetric.color)}
        {renderTooltipRow("Load", loadValue, "#38bdf8")}
      </>,
    );
  };

  const renderDailyFitChart = (
    heightClass: string,
    fit: DailyFitResult | null = dailyFit,
    summary: {
      averageDiff: number | undefined;
      averageGrowthPct: number | null | undefined;
      currentR2: number | null | undefined;
      lastYearR2: number | null | undefined;
      currentMae: number | null | undefined;
    } = dailyFitSummary,
    hiddenSeries: Set<string> = hiddenDailyFitSeries,
  ) => (
    <div className={`${heightClass} relative min-h-[420px] overflow-hidden rounded-md border border-gray-800 bg-[#0d1119]`}>
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 grid grid-cols-5 gap-2">
        <div className="rounded-md border border-gray-700/80 bg-gray-950/90 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Avg Fit Diff</div>
          <div className={`mt-0.5 text-lg font-semibold tabular-nums ${(summary.averageDiff ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {fmtMw(summary.averageDiff)}
          </div>
        </div>
        <div className="rounded-md border border-gray-700/80 bg-gray-950/90 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Avg Growth</div>
          <div className={`mt-0.5 text-lg font-semibold tabular-nums ${(summary.averageGrowthPct ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {fmtPct(summary.averageGrowthPct)}
          </div>
        </div>
        <div className="rounded-md border border-gray-700/80 bg-gray-950/90 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Current R2</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-gray-100">{fmtNumber(summary.currentR2, 2)}</div>
        </div>
        <div className="rounded-md border border-gray-700/80 bg-gray-950/90 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Last Year R2</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-gray-100">{fmtNumber(summary.lastYearR2, 2)}</div>
        </div>
        <div className="rounded-md border border-gray-700/80 bg-gray-950/90 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Current MAE</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-gray-100">{fmtMw(summary.currentMae)}</div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 96, right: 28, bottom: 30, left: 12 }}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" />
          <XAxis
            type="number"
            dataKey="x"
            name={selectedMetric.label}
            unit={selectedMetric.unit}
            domain={["auto", "auto"]}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#334155" }}
            label={{ value: `${selectedMetric.label} (${selectedMetric.unit})`, position: "insideBottom", offset: -18, fill: "#94a3b8", fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Load"
            domain={["auto", "auto"]}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#334155" }}
            tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
            label={{ value: "Load (MW)", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={(props) => renderDailyFitTooltip(props as unknown as ChartTooltipProps)}
          />
          {!hiddenSeries.has("currentYear") && (
            <Scatter name="Current Year" data={fit?.currentPoints ?? []} fill="#ef4444" shape="square" fillOpacity={0.72} />
          )}
          {!hiddenSeries.has("lastYear") && (
            <Scatter name="Last Year" data={fit?.lastYearPoints ?? []} fill="#a855f7" shape="square" fillOpacity={0.64} />
          )}
          {!hiddenSeries.has("lookback") && (
            <Scatter
              name="Lookback"
              data={fit?.lookbackPoints ?? []}
              shape={(props: unknown) => {
                const point = props as { cx?: number; cy?: number; payload?: { size?: number } };
                const radius = (point.payload?.size ?? 12) / 2;
                return (
                  <circle
                    cx={point.cx}
                    cy={point.cy}
                    r={radius}
                    fill="#7dd3fc"
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    opacity={0.95}
                  />
                );
              }}
            />
          )}
          {!hiddenSeries.has("currentFit") && (
            <Scatter
              name="Current Year Fit"
              data={fit?.currentFit.line ?? []}
              fill="none"
              line={{ stroke: "#ef4444", strokeWidth: 2.5 }}
              shape={() => null}
            />
          )}
          {!hiddenSeries.has("lastYearFit") && (
            <Scatter
              name="Last Year Fit"
              data={fit?.lastYearFit.line ?? []}
              fill="none"
              line={{ stroke: "#a855f7", strokeWidth: 2.5 }}
              shape={() => null}
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-100">Edit Load Growth View</h2>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Edit View
          </button>
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
          {[
            area,
            selectedStationName,
            selectedMetric.label,
            selectedShapeLabel,
            selectedDayTypeLabel,
            dateSelectionLabel,
            plotLookbackLabel,
          ].filter((label): label is string => Boolean(label)).map((label) => (
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
          aria-label="Edit load growth view"
          onMouseDown={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-5xl rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-100">Edit Load Growth View</h2>
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
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Dates</div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Date View
                    </span>
                    <select
                      value={dateMode}
                      onChange={(event) => setDateMode(event.target.value as DateMode)}
                      className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                    >
                      {DATE_MODES.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {dateMode === "range" && (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          Start
                        </span>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(event) => setStartDate(event.target.value)}
                          className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          End
                        </span>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(event) => {
                            const nextEnd = event.target.value;
                            setEndDate(nextEnd);
                            setStartDate(addDaysIsoDate(nextEnd, -(lookbackDays - 1)));
                          }}
                          className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                        />
                      </label>

                    <label className="block">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        Quick Lookback
                      </span>
                      <select
                        value={lookbackDays}
                        onChange={(event) => applyDataLookback(Number(event.target.value))}
                        className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                      >
                        {[10, 28, 56, 60, 90, 120].map((days) => (
                          <option key={days} value={days}>
                            {days} days
                          </option>
                        ))}
                      </select>
                    </label>
                    </>
                  )}

                  {dateMode === "month-years" && (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          Month
                        </span>
                        <select
                          value={selectedMonth}
                          onChange={(event) => setSelectedMonth(Number(event.target.value))}
                          className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                        >
                          {MONTHS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <MultiSelect
                        label="Years"
                        options={YEAR_OPTIONS}
                        selected={selectedYears}
                        onChange={(years) => setSelectedYears(years.length ? years : DEFAULT_YEARS)}
                        width="w-full"
                      />
                    </>
                  )}
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Plot Highlight
                    </span>
                    <select
                      value={plotLookbackDays}
                      onChange={(event) => setPlotLookbackDays(Number(event.target.value))}
                      className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                    >
                      {[5, 10, 14, 21, 28, 56].map((days) => (
                        <option key={days} value={days}>
                          {days} days
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Load</div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
                <label className="block md:col-span-2">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Load Area
                  </div>
                  <select
                    value={area}
                    onChange={(event) => setArea(event.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                  >
                    {groupedLoadAreas.map((group) => (
                      <optgroup key={group.key} label={group.label}>
                        {group.areas.map((item) => (
                          <option key={item.area} value={item.area}>
                            {`${item.area} - ${group.label}`}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Load Shape
                  </span>
                  <select
                    value={loadShape}
                    onChange={(event) => setLoadShape(event.target.value as LoadShape)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                  >
                    {LOAD_SHAPES.map((item) => (
                      <option
                        key={item.key}
                        value={item.key}
                      >
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Days
                  </span>
                  <select
                    value={dayType}
                    onChange={(event) => setDayType(event.target.value as DayType)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                  >
                    {DAY_TYPES.map((item) => (
                      <option
                        key={item.key}
                        value={item.key}
                      >
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Weather</div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Weather Station
                  </span>
                  <select
                    value={weatherStation}
                    onChange={(event) => setWeatherStation(event.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                  >
                    {sharedStations.map((station) => (
                      <option key={station.stationId} value={station.stationId}>
                        {stationDisplayName(station)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Weather Metric
                  </span>
                  <select
                    value={weatherMetric}
                    onChange={(event) => setWeatherMetric(event.target.value as WeatherMetric)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                  >
                    {WEATHER_METRICS.map((item) => (
                      <option
                        key={item.key}
                        value={item.key}
                      >
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {yoyError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {yoyError}
        </div>
      )}
      {yoyLoading && (
        <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4 text-sm text-gray-500">
          Loading daily load-growth data...
        </div>
      )}
      {yoyData && !yoyLoading && yoyData.daily.length === 0 && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500 shadow-xl shadow-black/20">
          No paired daily load-weather rows are available for this selection.
        </div>
      )}
      {yoyData && !yoyLoading && yoyData.daily.length > 0 && (
        <>
              <PlotCard
                title={`${yoyData.selected.loadArea}. Load per ${selectedMetric.label}`}
                subtitle={`${selectedShapeLabel} ${selectedDayTypeLabel} | ${selectedStationLabel} | ${fmtDate(yoyData.windows.currentStart)} to ${fmtDate(yoyData.windows.currentEndExclusive)} | ${dateSelectionLabel}`}
                series={DAILY_FIT_SERIES}
                hiddenSeries={hiddenDailyFitSeries}
                onToggleSeries={toggleDailyFitSeries}
                onShowAll={() => setHiddenDailyFitSeries(new Set())}
                onHideAll={() =>
                  setHiddenDailyFitSeries(new Set(DAILY_FIT_SERIES.map((series) => series.key)))
                }
                focusedChildren={renderDailyFitChart("h-[72vh]")}
              >
                {renderDailyFitChart("h-[520px]")}
              </PlotCard>

              <DataTableShell
                title="Fit Statistics"
                subtitle={`${dailyFit?.currentPoints.length ?? 0} current points | ${dailyFit?.lastYearPoints.length ?? 0} last-year points`}
                collapsible
                open={openTables.dailyFitStats}
                onToggle={() => toggleTable("dailyFitStats")}
                bodyClassName="max-h-[360px] overflow-y-auto"
              >
                <table className="w-full min-w-[980px] border-collapse bg-[#0d1119] text-[11px] text-gray-200">
                  <thead className="sticky top-0 z-10 bg-gray-950 text-gray-500">
                    <tr>
                      {[
                        "Data Source",
                        "Degree",
                        "MAE",
                        "RMSE",
                        "MAPE",
                        "Spearman",
                        "Explained Var",
                        "R2",
                        "Adj R2",
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
                    {(dailyFit?.fitStats ?? []).map((row) => (
                      <tr key={row.dataSource} className="hover:bg-gray-900/60">
                        <td className="px-3 py-2 text-left font-medium text-gray-300">{row.dataSource}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.degree ?? "-"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtShortMw(row.mae)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtShortMw(row.rmse)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.mape, 2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.spearmanCorrelation, 2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.explainedVariance, 2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.rSquared, 2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.adjustedRSquared, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>

              <DataTableShell
                title="YoY Growth"
                subtitle={`${selectedShapeLabel} ${selectedDayTypeLabel} fitted load difference by ${selectedMetric.label.toLowerCase()} band`}
                collapsible
                open={openTables.dailyGrowthBands}
                onToggle={() => toggleTable("dailyGrowthBands")}
                bodyClassName="max-h-[360px] overflow-y-auto"
              >
                <table className="w-full min-w-[780px] border-collapse bg-[#0d1119] text-[11px] text-gray-200">
                  <thead className="sticky top-0 z-10 bg-gray-950 text-gray-500">
                    <tr>
                      {[
                        `${selectedMetric.label} Range`,
                        "Current Fit",
                        "Last Year Fit",
                        "Diff",
                        "Growth",
                        "Avg Diff",
                        "Avg Growth",
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
                    {(dailyFit?.growthBands ?? []).map((row) => (
                      <tr key={row.weatherValue} className="hover:bg-gray-900/60">
                        <td className="px-3 py-2 text-left font-medium text-gray-300">{fmtTemp(row.weatherValue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtShortMw(row.currentFit)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtShortMw(row.lastYearFit)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${row.diff >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                          {fmtShortMw(row.diff)}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${(row.growthPct ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                          {fmtPct(row.growthPct)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                          {row.averageDiff === undefined ? "-" : fmtShortMw(row.averageDiff)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                          {row.averageGrowthPct === undefined ? "-" : fmtPct(row.averageGrowthPct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>

              <DataTableShell
                title={`${selectedMetric.label} vs Load`}
                subtitle={`${selectedShapeLabel} ${selectedDayTypeLabel} | ${yoyData.daily.length.toLocaleString()} daily pairs | current, recent, and last-year comparison rows`}
                collapsible
                open={openTables.dailyPairs}
                onToggle={() => toggleTable("dailyPairs")}
                bodyClassName="max-h-[440px] overflow-y-auto"
              >
                <table className="w-full min-w-[1120px] border-collapse bg-[#0d1119] text-[11px] text-gray-200">
                  <thead className="sticky top-0 z-10 bg-gray-950 text-gray-500">
                    <tr>
                      {[
                        "Date",
                        `Highlight Wx`,
                        `Highlight Load`,
                        "Current Wx",
                        "Current Load",
                        "Current Hrs",
                        "LY Wx",
                        "LY Load",
                        "LY Hrs",
                        "Diff",
                        "Growth",
                      ].map((label) => (
                        <th
                          key={label}
                          className="px-3 py-2 text-right font-semibold uppercase tracking-wide first:sticky first:left-0 first:z-20 first:bg-gray-950 first:text-left"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {[...yoyData.daily].reverse().map((row, index, rows) => {
                      const currentWx = dailyWeatherValue(row, weatherMetric, "current");
                      const lastYearWx = dailyWeatherValue(row, weatherMetric, "lastYear");
                      const inLookback = index >= rows.length - plotLookbackDays;
                      return (
                        <tr key={`${row.currentDate}-${row.lastYearDate}`} className="group hover:bg-gray-900/60">
                          <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2 text-left font-medium text-gray-300 group-hover:bg-gray-900">
                            {fmtDate(row.currentDate)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{inLookback ? fmtTemp(currentWx) : "-"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{inLookback ? fmtShortMw(row.currentLoadMw) : "-"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtTemp(currentWx)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtShortMw(row.currentLoadMw)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">{row.currentHourCount}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtTemp(lastYearWx)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtShortMw(row.lastYearLoadMw)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">{row.lastYearHourCount}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${(row.diffMw ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                            {fmtShortMw(row.diffMw)}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums ${(row.growthPct ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                            {fmtPct(row.growthPct)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </DataTableShell>
        </>
      )}
    </div>
  );
}
