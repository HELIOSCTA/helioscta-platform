"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type Dispatch,
  type MouseEventHandler,
  type SetStateAction,
} from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type SaltForecastRegion = "salt-main" | "se-salt";
export type SaltForecastWeatherRegion =
  | "CONUS"
  | "EAST"
  | "MIDWEST"
  | "MOUNTAIN"
  | "PACIFIC"
  | "SOUTHCENTRAL";

interface SaltForecastWeeklyPoint {
  weekEnding: string;
  label: string;
  year: number;
  actualChangeBcf: number | null;
  modelPredictedChangeBcf: number | null;
  residualBcf: number | null;
  looseTightZScore: number | null;
  weatherImpactBcf: number | null;
  saltSumBcf: number | null;
  gasHddObserved: number | null;
  gasCddObserved: number | null;
  weatherAnomaly: number | null;
  isRecent: boolean;
}

interface SaltForecastScatterPoint {
  weekEnding: string;
  year: number;
  x: number | null;
  y: number | null;
  isRecent: boolean;
}

interface SaltForecastPendingScatterAnnotation {
  releaseDate: string | null;
  weekEnding: string;
  year: number;
  status: string;
  xValue: number | null;
  xLabel: string;
  forecastActualWx: number | null;
  forecastNormalWx: number | null;
  weatherImpact: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  coverage: number | null;
  saltSumBcf: number | null;
  weatherAnomaly: number | null;
  annotationNote: string;
}

interface SaltForecastModelWeight {
  key?: "saltBaseline" | "momentumLinear" | "shapeRegime" | "weatherAdjusted";
  model: string;
  weight: number | null;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
}

interface SaltForecastDriver {
  driver: string;
  value: number;
}

interface SaltForecastQueueRow {
  weekEnding: string;
  releaseDate: string | null;
  weekNumber?: number;
  saltSumBcf: number | null;
  saltObservedBcf: number | null;
  saltCoverage: number | null;
  saltDayCount: number | null;
  lastActualChangeBcf?: number | null;
  gasHddObserved: number | null;
  gasCddObserved: number | null;
  weatherCoverage: number | null;
  weatherDayCount: number | null;
  forecastActualWx: number | null;
  forecastNormalWx: number | null;
  weatherImpact: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  coverage: number | null;
  weatherAnomaly: number | null;
  modelLegs?: SaltForecastModelLeg[];
  weatherAdjustedDriverContributions?: SaltForecastWeatherAdjustedDriverContribution[];
  status: string;
}

interface SaltForecastModelLeg {
  key: "saltBaseline" | "momentumLinear" | "shapeRegime" | "weatherAdjusted";
  model: string;
  weight: number | null;
  forecastActualWx: number | null;
  forecastNormalWx: number | null;
  weightedContributionActualWx: number | null;
  weightedContributionNormalWx: number | null;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
}

interface SaltForecastWeatherAdjustedDriverContribution {
  key: string;
  driver: string;
  inputValue: number | null;
  coefficient: number | null;
  contributionBcf: number | null;
}

export interface SaltForecastPayload {
  selected: {
    saltRegion: SaltForecastRegion;
    saltRegionLabel: string;
    weatherRegion: SaltForecastWeatherRegion;
    lookbackWeeks: number;
  };
  summary: {
    minWeek: string | null;
    maxWeek: string | null;
    latestReportWeek: string | null;
    liveEiaChecked: string | null;
    ensembleMae: number | null;
    ensembleRmse: number | null;
    hitRate: number | null;
    latestLooseTight: number | null;
    latestLooseTightZ: number | null;
    nextForecast: number | null;
    rangeLow: number | null;
    rangeHigh: number | null;
    signalCoverage: number | null;
    nextWeatherImpact: number | null;
    weeklyRowCount: number;
    eiaRowCount: number;
    saltRowCount: number;
    weatherRowCount: number;
  };
  weeklySeries: SaltForecastWeeklyPoint[];
  expectedActualScatter: SaltForecastScatterPoint[];
  weatherLooseTightScatter: SaltForecastScatterPoint[];
  modelWeights: SaltForecastModelWeight[];
  leadDrivers: SaltForecastDriver[];
  pendingQueue: SaltForecastQueueRow[];
  sourceStatus: {
    status: "ok" | "partial" | "missing_model_inputs";
    warnings: string[];
    lineage: string;
  };
}

interface ForecastScatterTooltipPayloadItem {
  payload?: Partial<SaltForecastScatterPoint>;
}

interface ForecastWeeklyTooltipPayloadItem {
  payload?: Partial<SaltForecastWeeklyPoint>;
}

interface SimpleRegressionPoint {
  weekEnding: string;
  label: string;
  seasonYear: number;
  seasonLabel: string;
  x: number;
  y: number;
  isRecent: boolean;
}

interface SimpleRegressionFitPoint {
  kind: "fit";
  seasonYear: number;
  seasonLabel: string;
  slope: number;
  intercept: number;
  rSquared: number | null;
  pointCount: number;
  x: number;
  y: number;
}

interface SimpleRegressionFit {
  seasonYear: number;
  seasonLabel: string;
  slope: number;
  intercept: number;
  rSquared: number | null;
  pointCount: number;
  data: SimpleRegressionFitPoint[];
}

interface SimplePendingForecastPoint {
  kind: "pending";
  weekEnding: string;
  releaseDate: string | null;
  seasonYear: number;
  seasonLabel: string;
  x: number;
  y: number;
  inputObservedValue: number | null;
  inputCoverage: number | null;
  inputDayCount: number | null;
  status: string;
  slope: number;
  intercept: number;
  rSquared: number | null;
  pointCount: number;
}

interface SimpleDiagnosticRow {
  weekEnding: string;
  label: string;
  seasonYear: number | null;
  seasonLabel: string;
  actualChangeBcf: number | null;
  saltPredictionBcf: number | null;
  saltResidualBcf: number | null;
  saltZScore: number | null;
  isRecent: boolean;
  isSeasonRow: boolean;
}

type SimpleRegressionSeason = "summer" | "winter";
type SimpleFocusChart = "salts" | "weather" | "actual-model" | "z-score";
type SimpleRegressionHover =
  | { kind: "point"; point: SimpleRegressionPoint; left: number; top: number }
  | { kind: "fit"; point: SimpleRegressionFitPoint; left: number; top: number }
  | { kind: "pending"; point: SimplePendingForecastPoint; left: number; top: number };

interface SimpleDiagnosticTooltipPayloadItem {
  payload?: Partial<SimpleDiagnosticRow>;
  value?: number | string | null;
  name?: string;
  dataKey?: string;
}

const SALT_FORECAST_REGION_OPTIONS: Array<{ value: SaltForecastRegion; label: string }> = [
  { value: "salt-main", label: "Salt Main" },
  { value: "se-salt", label: "SE Salt" },
];
const SALT_FORECAST_WEATHER_REGION_OPTIONS: SaltForecastWeatherRegion[] = [
  "CONUS",
  "EAST",
  "MIDWEST",
  "MOUNTAIN",
  "PACIFIC",
  "SOUTHCENTRAL",
];
const SALT_FORECAST_YEAR_FILTERS = [2023, 2024, 2025, 2026] as const;
const SALT_FORECAST_YEAR_COLORS: Record<(typeof SALT_FORECAST_YEAR_FILTERS)[number], string> = {
  2023: "#22d3ee",
  2024: "#f59e0b",
  2025: "#a78bfa",
  2026: "#34d399",
};
const SIMPLE_REGRESSION_SEASON_OPTIONS: Array<{ value: SimpleRegressionSeason; label: string }> = [
  { value: "summer", label: "Summer" },
  { value: "winter", label: "Winter" },
];

const labelClass = "mb-1 block text-[10px] font-semibold uppercase text-gray-500";
const controlClass =
  "h-9 w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-sm text-gray-100 outline-none transition-colors focus:border-cyan-500";

export function makeSaltForecastApiUrl({
  saltRegion,
  weatherRegion,
  lookbackWeeks,
}: {
  saltRegion: SaltForecastRegion;
  weatherRegion: SaltForecastWeatherRegion;
  lookbackWeeks: number;
}): string {
  const params = new URLSearchParams({
    saltRegion,
    weatherRegion,
    lookbackWeeks: String(Math.max(52, Math.min(520, lookbackWeeks))),
  });
  return `/api/salts/forecast?${params.toString()}`;
}

function fmtNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function fmtAxisTick(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return value.toFixed(0);
  return value.toFixed(1);
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function fmtChange(value: number | null | undefined, digits: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const formatted = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function fmtRatioPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${fmtNumber(value * 100, 0)}%`;
}

function fmtMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString()} ms`;
}

function flowTone(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || Math.abs(value) < 1e-9) {
    return "text-gray-300";
  }
  return value > 0 ? "text-emerald-300" : "text-rose-300";
}

function fmtSignedBcf(value: number | null | undefined): string {
  return fmtChange(value, 1);
}

function initialChartDimension(height: CSSProperties["height"]) {
  return {
    width: 640,
    height: typeof height === "number" ? height : 420,
  };
}

function forecastYearColor(year: number): string {
  return SALT_FORECAST_YEAR_COLORS[year as (typeof SALT_FORECAST_YEAR_FILTERS)[number]] ?? "#94a3b8";
}

interface ScatterShapeProps {
  cx?: number;
  cy?: number;
  fill?: string;
  onClick?: MouseEventHandler<SVGElement>;
  onMouseEnter?: MouseEventHandler<SVGElement>;
  onMouseLeave?: MouseEventHandler<SVGElement>;
  onMouseMove?: MouseEventHandler<SVGElement>;
}

function scatterShapeEvents({
  onClick,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
}: ScatterShapeProps) {
  return { onClick, onMouseEnter, onMouseLeave, onMouseMove };
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function initialSimpleRegressionSeason(): SimpleRegressionSeason {
  const month = new Date().getMonth() + 1;
  return month >= 11 || month <= 3 ? "winter" : "summer";
}

function simpleSeasonYear(weekEnding: string, season: SimpleRegressionSeason): number | null {
  const calendarYear = Number.parseInt(weekEnding.slice(0, 4), 10);
  const month = Number.parseInt(weekEnding.slice(5, 7), 10);
  if (!Number.isFinite(calendarYear) || !Number.isFinite(month)) return null;
  if (season === "winter") {
    if (month >= 11) return calendarYear + 1;
    if (month <= 3) return calendarYear;
    return null;
  }
  if (month >= 4 && month <= 10) return calendarYear;
  return null;
}

function simpleSeasonLabel(seasonYear: number, season: SimpleRegressionSeason): string {
  return `${season === "winter" ? "XH" : "SUM"}-${String(seasonYear).slice(-2)}`;
}

function simpleSeasonWindowLabel(season: SimpleRegressionSeason): string {
  return season === "winter" ? "Nov-Mar" : "Apr-Oct";
}

function simpleSeasonForWeek(weekEnding: string | null | undefined): SimpleRegressionSeason | null {
  if (!weekEnding) return null;
  const month = Number.parseInt(weekEnding.slice(5, 7), 10);
  if (!Number.isFinite(month)) return null;
  if (month >= 11 || month <= 3) return "winter";
  if (month >= 4 && month <= 10) return "summer";
  return null;
}

function simpleWeatherLabel(season: SimpleRegressionSeason): string {
  return season === "winter" ? "South Central Gas HDD" : "South Central Gas CDD";
}

function simpleRegressionTitle(season: SimpleRegressionSeason, xLabel: string): string {
  const seasonTitle = season === "winter" ? "Winter XH Regression" : "Summer Regression";
  return `${seasonTitle} - EIA Salts vs ${xLabel}`;
}

function buildSimpleRegressionPoints(
  series: SaltForecastWeeklyPoint[],
  getXValue: (point: SaltForecastWeeklyPoint) => number | null,
  season: SimpleRegressionSeason,
): SimpleRegressionPoint[] {
  return series
    .map((point) => {
      const seasonYear = simpleSeasonYear(point.weekEnding, season);
      const x = getXValue(point);
      const y = point.actualChangeBcf;
      if (seasonYear === null || !isFiniteNumber(x) || !isFiniteNumber(y)) return null;
      return {
        weekEnding: point.weekEnding,
        label: point.label,
        seasonYear,
        seasonLabel: simpleSeasonLabel(seasonYear, season),
        x,
        y,
        isRecent: point.isRecent,
      };
    })
    .filter((point): point is SimpleRegressionPoint => point !== null)
    .sort((left, right) => left.weekEnding.localeCompare(right.weekEnding));
}

function simpleSeasonYears(points: SimpleRegressionPoint[]): number[] {
  return Array.from(new Set(points.map((point) => point.seasonYear)))
    .sort((left, right) => left - right);
}

function defaultSimpleActiveSeasonYears(years: number[]): Set<number> {
  return new Set(years.slice(-2));
}

function fitSimpleRegression(points: SimpleRegressionPoint[]): SimpleRegressionFit | null {
  if (points.length < 3) return null;

  const xMean = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const yMean = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const xVariance = points.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0);
  if (Math.abs(xVariance) < 1e-9) return null;

  const covariance = points.reduce(
    (sum, point) => sum + (point.x - xMean) * (point.y - yMean),
    0,
  );
  const slope = covariance / xVariance;
  const intercept = yMean - slope * xMean;
  const sse = points.reduce(
    (sum, point) => sum + (point.y - (slope * point.x + intercept)) ** 2,
    0,
  );
  const sst = points.reduce((sum, point) => sum + (point.y - yMean) ** 2, 0);
  const rSquared = Math.abs(sst) < 1e-9 ? null : 1 - sse / sst;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const seasonYear = points[0].seasonYear;
  const seasonLabel = points[0].seasonLabel;
  const sampleCount = 49;
  const data = Array.from({ length: sampleCount }, (_, index) => {
    const x = minX + ((maxX - minX) * index) / (sampleCount - 1);
    return {
      kind: "fit" as const,
      seasonYear,
      seasonLabel,
      slope,
      intercept,
      rSquared,
      pointCount: points.length,
      x,
      y: slope * x + intercept,
    };
  });

  return {
    seasonYear,
    seasonLabel,
    slope,
    intercept,
    rSquared,
    pointCount: points.length,
    data,
  };
}

function fitSimpleYear(points: SimpleRegressionPoint[], seasonYear: number): SimpleRegressionFit | null {
  return fitSimpleRegression(points.filter((point) => point.seasonYear === seasonYear));
}

function simpleAverage(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function simpleStandardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = simpleAverage(values);
  if (mean === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function simplePrediction(fit: SimpleRegressionFit | null, x: number): number | null {
  return fit === null ? null : fit.slope * x + fit.intercept;
}

function sumFiniteNullable(values: Array<number | null | undefined>): number | null {
  const finiteValues = values.filter((value): value is number => isFiniteNumber(value));
  if (!finiteValues.length) return null;
  return finiteValues.reduce((sum, value) => sum + value, 0);
}

function bridgeDiffTone(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "text-gray-500";
  return Math.abs(value) <= 0.05 ? "text-emerald-300" : "text-amber-300";
}

function assignSimpleZScores(
  rows: SimpleDiagnosticRow[],
  residualKey: "saltResidualBcf",
  zKey: "saltZScore",
): void {
  const residuals = rows
    .map((row) => row[residualKey])
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const mean = simpleAverage(residuals);
  const std = simpleStandardDeviation(residuals);
  if (mean === null || std === null || std <= 0) return;
  rows.forEach((row) => {
    const residual = row[residualKey];
    row[zKey] = residual === null ? null : (residual - mean) / std;
  });
}

function buildSimpleDiagnostics({
  series,
  saltPoints,
  season,
}: {
  series: SaltForecastWeeklyPoint[];
  saltPoints: SimpleRegressionPoint[];
  season: SimpleRegressionSeason;
}): {
  rows: SimpleDiagnosticRow[];
} {
  const saltFits = new Map(
    simpleSeasonYears(saltPoints).map((seasonYear) => [seasonYear, fitSimpleYear(saltPoints, seasonYear)]),
  );
  const saltPointsByWeek = new Map(saltPoints.map((point) => [point.weekEnding, point]));
  const rows: SimpleDiagnosticRow[] = series
    .map((point): SimpleDiagnosticRow => {
      const seasonYear = simpleSeasonYear(point.weekEnding, season);
      const saltPoint = saltPointsByWeek.get(point.weekEnding);
      const actualChangeBcf = isFiniteNumber(point.actualChangeBcf) ? point.actualChangeBcf : null;
      const prediction =
        saltPoint && seasonYear !== null
          ? simplePrediction(saltFits.get(seasonYear) ?? null, saltPoint.x)
          : null;
      const row: SimpleDiagnosticRow = {
        weekEnding: point.weekEnding,
        label: point.label,
        seasonYear,
        seasonLabel: seasonYear === null ? "-" : simpleSeasonLabel(seasonYear, season),
        actualChangeBcf,
        saltPredictionBcf: prediction,
        saltResidualBcf:
          prediction === null || actualChangeBcf === null ? null : actualChangeBcf - prediction,
        saltZScore: null,
        isRecent: point.isRecent,
        isSeasonRow: seasonYear !== null,
      };
      return row;
    })
    .filter((row): row is SimpleDiagnosticRow => row.actualChangeBcf !== null || row.saltPredictionBcf !== null)
    .sort((left, right) => left.weekEnding.localeCompare(right.weekEnding));
  assignSimpleZScores(rows, "saltResidualBcf", "saltZScore");

  return {
    rows,
  };
}

function ForecastNumberInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label>
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          if (Number.isFinite(parsed)) onChange(Math.max(min, Math.min(max, parsed)));
        }}
        className={controlClass}
      />
    </label>
  );
}

function ForecastKpi({
  label,
  value,
  detail,
  valueClassName = "text-gray-100",
}: {
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-800 bg-gray-950/60 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 truncate text-xl font-semibold tabular-nums ${valueClassName}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-gray-500">{detail}</p>
    </div>
  );
}

function ForecastHelpButton({ label }: { label: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-xs font-bold text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-8 z-20 hidden w-64 rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-left text-xs font-normal leading-snug text-gray-300 shadow-xl shadow-black/40 group-hover:block group-focus-within:block"
      >
        {label}
      </span>
    </span>
  );
}

function ForecastFocusButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:bg-gray-800 hover:text-white"
    >
      Focus Mode
    </button>
  );
}

function RecentPointShape(props: ScatterShapeProps) {
  const { cx, cy, fill } = props;
  if (typeof cx !== "number" || typeof cy !== "number") return null;
  return (
    <g {...scatterShapeEvents(props)}>
      <circle cx={cx} cy={cy} r={10} fill="transparent" style={{ pointerEvents: "all" }} />
      <circle cx={cx} cy={cy} r={6.2} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={0.95} />
      <circle cx={cx} cy={cy} r={3.2} fill={fill ?? "#fbbf24"} opacity={0.95} />
    </g>
  );
}

function SimpleRecentLineDot({
  cx,
  cy,
  payload,
  enabled,
  color,
}: ScatterShapeProps & {
  payload?: Partial<SimpleDiagnosticRow>;
  enabled: boolean;
  color: string;
}) {
  if (!enabled || !payload?.isRecent || typeof cx !== "number" || typeof cy !== "number") return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={6.2} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={0.95} />
      <circle cx={cx} cy={cy} r={3.2} fill={color} opacity={0.95} />
    </g>
  );
}

function SimpleObservationShape(props: ScatterShapeProps) {
  const { cx, cy, fill } = props;
  if (typeof cx !== "number" || typeof cy !== "number") return null;
  return (
    <g {...scatterShapeEvents(props)}>
      <circle cx={cx} cy={cy} r={8} fill="transparent" style={{ pointerEvents: "all" }} />
      <circle cx={cx} cy={cy} r={3.8} fill={fill ?? "#94a3b8"} opacity={0.88} />
    </g>
  );
}

function ForecastRecentLineDot({
  cx,
  cy,
  payload,
  enabled,
  color,
}: ScatterShapeProps & {
  payload?: Partial<SaltForecastWeeklyPoint>;
  enabled: boolean;
  color: string;
}) {
  if (!enabled || !payload?.isRecent || typeof cx !== "number" || typeof cy !== "number") return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={6.2} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={0.95} />
      <circle cx={cx} cy={cy} r={3.2} fill={color} opacity={0.95} />
    </g>
  );
}

function ForecastActualModelTooltip({
  active,
  payload,
  showActual,
  showModel,
}: {
  active?: boolean;
  payload?: ForecastWeeklyTooltipPayloadItem[];
  showActual: boolean;
  showModel: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload.find((item) => item.payload?.weekEnding)?.payload;
  if (!row?.weekEnding) return null;

  return (
    <div className="rounded-md border border-slate-600 bg-gray-950/95 px-4 py-3 text-xs text-gray-100 shadow-xl shadow-black/40">
      <div className="font-semibold text-white">{row.weekEnding}</div>
      <div className="mt-2 grid grid-cols-[auto_auto] gap-x-2 gap-y-1">
        {showActual && (
          <>
            <span className="text-gray-100">Actual EIA Change:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-slate-100">
              {fmtChange(row.actualChangeBcf, 2)}
            </span>
          </>
        )}
        {showModel && (
          <>
            <span className="text-gray-100">Model Predicted Change:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-cyan-300">
              {fmtChange(row.modelPredictedChangeBcf, 2)}
            </span>
          </>
        )}
        {showActual && showModel && (
          <>
            <span className="text-gray-100">Loose/Tight Adj:</span>
            <span className={`text-right font-mono font-semibold tabular-nums ${flowTone(row.residualBcf)}`}>
              {fmtSignedBcf(row.residualBcf)}
            </span>
          </>
        )}
        <span className="text-gray-100">Weather Impact:</span>
        <span className={`text-right font-mono font-semibold tabular-nums ${flowTone(row.weatherImpactBcf)}`}>
          {fmtSignedBcf(row.weatherImpactBcf)}
        </span>
        <span className="text-gray-100">Loose/Tight Z:</span>
        <span className="text-right font-mono font-semibold tabular-nums text-gray-200">
          {fmtNumber(row.looseTightZScore, 2)}
        </span>
      </div>
      <div className="mt-2 text-[11px] text-sky-300">
        {row.year ?? "-"}
        {row.isRecent ? " | Last 8 Weeks" : ""}
      </div>
    </div>
  );
}

function ForecastActualModelChart({
  series,
  height = 360,
}: {
  series: SaltForecastWeeklyPoint[];
  height?: CSSProperties["height"];
}) {
  const [showActual, setShowActual] = useState(true);
  const [showModel, setShowModel] = useState(true);
  const [showLastEightWeeks, setShowLastEightWeeks] = useState(true);
  const hasVisibleElement = showActual || showModel;

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <SimpleChartToggle
          active={showActual}
          label="Actual EIA"
          color="#f8fafc"
          onClick={() => setShowActual((value) => !value)}
        />
        <SimpleChartToggle
          active={showModel}
          label="Blend Model"
          color="#22d3ee"
          dashed
          onClick={() => setShowModel((value) => !value)}
        />
        <SimpleChartToggle
          active={showLastEightWeeks}
          label="Last 8 Weeks"
          color="#fbbf24"
          onClick={() => setShowLastEightWeeks((value) => !value)}
        />
      </div>
      <div className="relative min-w-0" style={{ height, minHeight: height }}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={1}
          minHeight={1}
          debounce={50}
          initialDimension={initialChartDimension(height)}
        >
          <ComposedChart data={series} margin={{ top: 18, right: 22, bottom: 24, left: 0 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis
              dataKey="weekEnding"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              minTickGap={22}
              tickFormatter={(value) => String(value).slice(5)}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              tickFormatter={(value) => fmtAxisTick(Number(value))}
            />
            <Tooltip
              content={<ForecastActualModelTooltip showActual={showActual} showModel={showModel} />}
              cursor={{ stroke: "#cbd5e1", strokeDasharray: "3 3" }}
            />
            <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
            {showActual && (
              <Line
                type="monotone"
                dataKey="actualChangeBcf"
                name="Actual EIA Change"
                stroke="#f8fafc"
                strokeWidth={2.2}
                dot={<ForecastRecentLineDot enabled={showLastEightWeeks} color="#f8fafc" />}
                activeDot={{ r: 5, stroke: "#e5e7eb", strokeWidth: 1.4 }}
                connectNulls
                isAnimationActive={false}
              />
            )}
            {showModel && (
              <Line
                type="monotone"
                dataKey="modelPredictedChangeBcf"
                name="Blend Model Predicted Change"
                stroke="#22d3ee"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={<ForecastRecentLineDot enabled={showLastEightWeeks} color="#22d3ee" />}
                activeDot={{ r: 5, stroke: "#e5e7eb", strokeWidth: 1.4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        {(!series.length || !hasVisibleElement) && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
            {series.length ? "No chart elements are enabled." : "No weekly forecast rows are available."}
          </div>
        )}
      </div>
    </>
  );
}

function ForecastZScoreTooltip({
  active,
  payload,
  showZScore,
}: {
  active?: boolean;
  payload?: ForecastWeeklyTooltipPayloadItem[];
  showZScore: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload.find((item) => item.payload?.weekEnding)?.payload;
  if (!row?.weekEnding) return null;

  return (
    <div className="rounded-md border border-slate-600 bg-gray-950/95 px-4 py-3 text-xs text-gray-100 shadow-xl shadow-black/40">
      <div className="font-semibold text-white">{row.weekEnding}</div>
      <div className="mt-2 grid grid-cols-[auto_auto] gap-x-2 gap-y-1">
        {showZScore && (
          <>
            <span className="text-gray-100">Loose/Tight Z:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-cyan-300">
              {fmtNumber(row.looseTightZScore, 2)}
            </span>
          </>
        )}
        <span className="text-gray-100">Loose/Tight Adj:</span>
        <span className={`text-right font-mono font-semibold tabular-nums ${flowTone(row.residualBcf)}`}>
          {fmtSignedBcf(row.residualBcf)}
        </span>
        <span className="text-gray-100">Actual EIA Change:</span>
        <span className="text-right font-mono font-semibold tabular-nums text-slate-100">
          {fmtChange(row.actualChangeBcf, 2)}
        </span>
        <span className="text-gray-100">Model Predicted Change:</span>
        <span className="text-right font-mono font-semibold tabular-nums text-cyan-300">
          {fmtChange(row.modelPredictedChangeBcf, 2)}
        </span>
        <span className="text-gray-100">Weather Impact:</span>
        <span className={`text-right font-mono font-semibold tabular-nums ${flowTone(row.weatherImpactBcf)}`}>
          {fmtSignedBcf(row.weatherImpactBcf)}
        </span>
      </div>
      <div className="mt-2 text-[11px] text-sky-300">
        {row.year ?? "-"}
        {row.isRecent ? " | Last 8 Weeks" : ""}
      </div>
    </div>
  );
}

function ForecastZScoreChart({
  series,
  height = 300,
}: {
  series: SaltForecastWeeklyPoint[];
  height?: CSSProperties["height"];
}) {
  const [showZScore, setShowZScore] = useState(true);
  const [showBands, setShowBands] = useState(true);
  const [showLastEightWeeks, setShowLastEightWeeks] = useState(true);
  const chartSeries = series.filter(
    (point) =>
      point.looseTightZScore !== null &&
      Number.isFinite(point.looseTightZScore) &&
      SALT_FORECAST_YEAR_FILTERS.includes(point.year as (typeof SALT_FORECAST_YEAR_FILTERS)[number]),
  );
  const hasVisibleElement = showZScore || showBands;

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <SimpleChartToggle
          active={showZScore}
          label="Loose/Tight Z"
          color="#22d3ee"
          onClick={() => setShowZScore((value) => !value)}
        />
        <SimpleChartToggle
          active={showBands}
          label="Threshold Bands"
          color="#f59e0b"
          dashed
          onClick={() => setShowBands((value) => !value)}
        />
        <SimpleChartToggle
          active={showLastEightWeeks}
          label="Last 8 Weeks"
          color="#fbbf24"
          onClick={() => setShowLastEightWeeks((value) => !value)}
        />
      </div>
      <div className="relative min-w-0" style={{ height, minHeight: height }}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={1}
          minHeight={1}
          debounce={50}
          initialDimension={initialChartDimension(height)}
        >
          <ComposedChart data={chartSeries} margin={{ top: 12, right: 22, bottom: 24, left: 0 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis
              dataKey="weekEnding"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              minTickGap={22}
              tickFormatter={(value) => String(value).slice(5)}
            />
            <YAxis
              domain={[-4, 4]}
              allowDataOverflow
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              tickFormatter={(value) => fmtAxisTick(Number(value))}
            />
            {showBands && (
              <>
                <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
                <ReferenceLine y={1} stroke="#38bdf8" strokeDasharray="3 3" />
                <ReferenceLine y={-1} stroke="#38bdf8" strokeDasharray="3 3" />
                <ReferenceLine y={2} stroke="#f59e0b" strokeDasharray="3 3" />
                <ReferenceLine y={-2} stroke="#f59e0b" strokeDasharray="3 3" />
              </>
            )}
            <Tooltip
              content={<ForecastZScoreTooltip showZScore={showZScore} />}
              cursor={{ stroke: "#cbd5e1", strokeDasharray: "3 3" }}
            />
            <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
            {showZScore && (
              <Line
                type="linear"
                dataKey="looseTightZScore"
                name="Loose/Tight Z-Score"
                stroke="#22d3ee"
                strokeWidth={1.8}
                dot={<ForecastRecentLineDot enabled={showLastEightWeeks} color="#22d3ee" />}
                activeDot={{ r: 5, stroke: "#e5e7eb", strokeWidth: 1.4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        {(!chartSeries.length || !hasVisibleElement) && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
            {chartSeries.length ? "No chart elements are enabled." : "No loose/tight rows are available."}
          </div>
        )}
      </div>
    </>
  );
}

function ForecastYearControls({
  activeYears,
  setActiveYears,
}: {
  activeYears: Set<number>;
  setActiveYears: Dispatch<SetStateAction<Set<number>>>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Salt forecast scatter year filters">
      {SALT_FORECAST_YEAR_FILTERS.map((year) => {
        const active = activeYears.has(year);
        return (
          <button
            key={year}
            type="button"
            aria-pressed={active}
            onClick={() =>
              setActiveYears((previous) => {
                const next = new Set(previous);
                if (next.has(year)) next.delete(year);
                else next.add(year);
                return next;
              })
            }
            className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
              active
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: forecastYearColor(year) }}
            />
            {year}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setActiveYears(new Set(SALT_FORECAST_YEAR_FILTERS))}
        className="h-7 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-[11px] font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
      >
        All On
      </button>
      <button
        type="button"
        onClick={() => setActiveYears(new Set())}
        className="h-7 rounded-md border border-gray-800 bg-gray-950/40 px-2.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-700 hover:text-gray-400"
      >
        All Off
      </button>
      <span
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-[11px] font-semibold text-gray-100"
        aria-label="Last 8 weeks are always highlighted"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-slate-100" />
        Last 8 Weeks
      </span>
    </div>
  );
}

function scatterTooltipLabel(label: string): string {
  if (label === "Loose/Tight") return "Loose/Tight Adj (BCF)";
  return `${label} (BCF)`;
}

function ForecastScatterTooltip({
  active,
  payload,
  xLabel,
  yLabel,
}: {
  active?: boolean;
  payload?: ForecastScatterTooltipPayloadItem[];
  xLabel: string;
  yLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload.find((item) => item.payload?.weekEnding)?.payload;
  if (!point?.weekEnding) return null;

  return (
    <div className="rounded-md border border-slate-600 bg-gray-950/95 px-4 py-3 text-xs text-gray-100 shadow-xl shadow-black/40">
      <div className="font-semibold text-white">{point.weekEnding}</div>
      <div className="mt-2 grid grid-cols-[auto_auto] gap-x-2 gap-y-1">
        <span className="text-gray-100">{scatterTooltipLabel(xLabel)}:</span>
        <span className="text-right font-mono font-semibold tabular-nums text-cyan-300">
          {fmtChange(point.x, 2)}
        </span>
        <span className="text-gray-100">{scatterTooltipLabel(yLabel)}:</span>
        <span className="text-right font-mono font-semibold tabular-nums text-amber-300">
          {fmtChange(point.y, 2)}
        </span>
      </div>
      <div className="mt-2 text-[11px] text-sky-300">
        {point.year ?? "-"}
        {point.isRecent ? " | Last 8 Weeks" : ""}
      </div>
    </div>
  );
}

function ForecastScatterPanel({
  title,
  help,
  data,
  xLabel,
  yLabel,
  activeYears,
  setActiveYears,
  pendingForecast,
  onFocus,
  showFocusButton = true,
  height = 300,
}: {
  title: string;
  help: string;
  data: SaltForecastScatterPoint[];
  xLabel: string;
  yLabel: string;
  activeYears: Set<number>;
  setActiveYears: Dispatch<SetStateAction<Set<number>>>;
  pendingForecast?: SaltForecastPendingScatterAnnotation | null;
  onFocus: () => void;
  showFocusButton?: boolean;
  height?: CSSProperties["height"];
}) {
  const [showPendingForecast, setShowPendingForecast] = useState(true);
  const regularData = data.filter(
    (point) =>
      point.x !== null &&
      point.y !== null &&
      activeYears.has(point.year) &&
      !point.isRecent,
  );
  const recentData = data.filter(
    (point) => point.x !== null && point.y !== null && point.isRecent,
  );
  const visiblePendingForecast =
    showPendingForecast && pendingForecast && activeYears.has(pendingForecast.year)
      ? pendingForecast
      : null;
  const visibleDataCount = regularData.length + recentData.length;
  const pendingRange =
    pendingForecast?.rangeLow === null ||
    pendingForecast?.rangeLow === undefined ||
    pendingForecast.rangeHigh === null ||
    pendingForecast.rangeHigh === undefined
      ? "-"
      : `${fmtSignedBcf(pendingForecast.rangeLow)} to ${fmtSignedBcf(pendingForecast.rangeHigh)}`;

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
            <ForecastHelpButton label={help} />
          </div>
        </div>
        {showFocusButton && <ForecastFocusButton onClick={onFocus} />}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <ForecastYearControls activeYears={activeYears} setActiveYears={setActiveYears} />
        {pendingForecast && (
          <button
            type="button"
            aria-pressed={showPendingForecast}
            onClick={() => setShowPendingForecast((value) => !value)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
              showPendingForecast
                ? "border-red-400/60 bg-red-500/10 text-red-100"
                : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
            }`}
          >
            <span
              className="h-0 w-0"
              style={{
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderBottom: `9px solid ${showPendingForecast ? "#ef4444" : "#4b5563"}`,
              }}
            />
            Forecast
          </button>
        )}
      </div>
      {visiblePendingForecast && (
        <div className="mb-3 rounded-md border border-red-400/30 bg-red-500/5 px-3 py-2 text-xs text-gray-200">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-semibold text-red-100">
              <span
                className="h-0 w-0"
                style={{
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderBottom: "9px solid #ef4444",
                }}
              />
              Upcoming Forecast
            </span>
            <span className="text-gray-500">
              EIA week {fmtDate(visiblePendingForecast.weekEnding)} | Release{" "}
              {fmtDate(visiblePendingForecast.releaseDate)}
            </span>
            <span className="font-mono font-semibold tabular-nums text-cyan-200">
              {visiblePendingForecast.xLabel} {fmtChange(visiblePendingForecast.xValue, 2)}
            </span>
            <span className="font-mono font-semibold tabular-nums text-red-200">
              Forecast EIA {fmtSignedBcf(visiblePendingForecast.forecastActualWx)}
            </span>
            <span className={`font-mono font-semibold tabular-nums ${flowTone(visiblePendingForecast.weatherImpact)}`}>
              Wx impact {fmtSignedBcf(visiblePendingForecast.weatherImpact)}
            </span>
            <span className="font-mono font-semibold tabular-nums text-gray-200">
              80% {pendingRange}
            </span>
            <span className="font-mono font-semibold tabular-nums text-gray-200">
              Coverage {fmtRatioPercent(visiblePendingForecast.coverage)}
            </span>
            <span className="text-sky-300">
              {visiblePendingForecast.status} | {visiblePendingForecast.annotationNote}
            </span>
          </div>
        </div>
      )}
      <div className="relative min-w-0" style={{ height, minHeight: height }}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={1}
          minHeight={1}
          debounce={50}
          initialDimension={initialChartDimension(height)}
        >
          <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 0 }}>
            <CartesianGrid stroke="#1f2937" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              tickFormatter={(value) => fmtAxisTick(Number(value))}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              tickFormatter={(value) => fmtAxisTick(Number(value))}
            />
            <Tooltip
              content={<ForecastScatterTooltip xLabel={xLabel} yLabel={yLabel} />}
              cursor={{ stroke: "#cbd5e1", strokeDasharray: "3 3" }}
            />
            {visiblePendingForecast && isFiniteNumber(visiblePendingForecast.xValue) && (
              <ReferenceLine
                x={visiblePendingForecast.xValue}
                stroke="#ef4444"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: "Forecast", fill: "#fecaca", fontSize: 10, position: "top" }}
              />
            )}
            {SALT_FORECAST_YEAR_FILTERS.map((year) => (
              <Scatter
                key={year}
                name={String(year)}
                data={regularData.filter((point) => point.year === year)}
                fill={forecastYearColor(year)}
                fillOpacity={0.82}
                isAnimationActive={false}
              />
            ))}
            <Scatter
              name="Last 8 Weeks"
              data={recentData}
              fill="#f8fafc"
              shape={<RecentPointShape />}
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
        {visibleDataCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
            No scatter rows match the selected filters.
          </div>
        )}
      </div>
    </section>
  );
}

function ForecastWeightsTable({
  rows,
  embedded = false,
}: {
  rows: SaltForecastModelWeight[];
  embedded?: boolean;
}) {
  return (
    <section className={embedded ? "min-w-0" : "rounded-xl border border-gray-800 bg-gray-950/60 p-4"}>
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-100">Model Blend Weights</h3>
        <ForecastHelpButton label="Weights are inverse-MAE shares from the walk-forward backtest." />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[620px] w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-gray-500">
            <tr>
              {["Model", "Weight", "MAE", "RMSE", "Bias"].map((header) => (
                <th key={header} className="border-b border-gray-800 px-2 py-2 text-right first:text-left">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.model} className="hover:bg-gray-900/45">
                <td className="border-t border-gray-900 px-2 py-2 font-semibold text-gray-100">{row.model}</td>
                <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-cyan-200">
                  {fmtRatioPercent(row.weight)}
                </td>
                <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                  {fmtNumber(row.mae, 2)}
                </td>
                <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                  {fmtNumber(row.rmse, 2)}
                </td>
                <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(row.bias)}`}>
                  {fmtSignedBcf(row.bias)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ForecastWeatherAdjustedDriverContributionsPanel({
  rows,
  embedded = false,
}: {
  rows: SaltForecastWeatherAdjustedDriverContribution[];
  embedded?: boolean;
}) {
  return (
    <section className={embedded ? "min-w-0" : "rounded-xl border border-gray-800 bg-gray-950/60 p-4"}>
      <h3 className="mb-4 text-sm font-semibold text-gray-100">Weather Adjusted Driver Contributions</h3>
      <div className="overflow-x-auto">
        <table className="min-w-[560px] w-full text-left text-[11px]">
          <thead className="uppercase tracking-wider text-gray-500">
            <tr>
              {["Driver", "Pending Input", "Coefficient", "Contribution"].map((header) => (
                <th key={header} className="border-b border-gray-800 px-2 py-2 text-right first:text-left">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.key}>
                  <td className="border-t border-gray-900 px-2 py-2 text-left font-semibold text-gray-100">
                    {row.driver}
                  </td>
                  <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                    {fmtNumber(row.inputValue, row.key === "intercept" ? 0 : 2)}
                  </td>
                  <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(row.coefficient)}`}>
                    {fmtChange(row.coefficient, 4)}
                  </td>
                  <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(row.contributionBcf)}`}>
                    {fmtSignedBcf(row.contributionBcf)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="border-t border-gray-900 px-2 py-4 text-sm text-gray-500">
                  No pending-week weather-adjusted contribution rows are available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ForecastPendingQueue({
  rows,
  embedded = false,
}: {
  rows: SaltForecastQueueRow[];
  embedded?: boolean;
}) {
  return (
    <section className={embedded ? "min-w-0" : "rounded-xl border border-gray-800 bg-gray-950/60 p-4"}>
      <h3 className="mb-4 text-sm font-semibold text-gray-100">Pending Weekly Forecast Queue</h3>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-left text-[11px]">
          <thead className="uppercase tracking-wider text-gray-500">
            <tr>
              {[
                "Week Ending",
                "Release Date",
                "Forecast (Actual Wx)",
                "Forecast (Normal Wx)",
                "Weather Impact",
                "80% Range",
                "Coverage",
                "Wx Anom",
                "Status",
              ].map((header) => (
                <th key={header} className="border-b border-gray-800 px-2 py-2 text-right first:text-left">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.weekEnding}>
                  <td className="border-t border-gray-900 px-2 py-2 text-left text-gray-100">
                    {fmtDate(row.weekEnding)}
                  </td>
                  <td className="border-t border-gray-900 px-2 py-2 text-right text-gray-300">
                    {fmtDate(row.releaseDate)}
                  </td>
                  <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                    {fmtSignedBcf(row.forecastActualWx)}
                  </td>
                  <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                    {fmtSignedBcf(row.forecastNormalWx)}
                  </td>
                  <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(row.weatherImpact)}`}>
                    {fmtSignedBcf(row.weatherImpact)}
                  </td>
                  <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                    {row.rangeLow === null || row.rangeHigh === null
                      ? "-"
                      : `${fmtSignedBcf(row.rangeLow)} to ${fmtSignedBcf(row.rangeHigh)}`}
                  </td>
                  <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                    {fmtRatioPercent(row.coverage)}
                  </td>
                  <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(row.weatherAnomaly)}`}>
                    {fmtNumber(row.weatherAnomaly, 2)}
                  </td>
                  <td className="border-t border-gray-900 px-2 py-2 text-right text-gray-300">
                    {row.status}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="border-t border-gray-900 px-2 py-4 text-sm text-gray-500">
                  No pending week is available from the promoted inputs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SimpleRegressionYearControls({
  years,
  activeSeasonYears,
  setActiveSeasonYears,
  season,
}: {
  years: number[];
  activeSeasonYears: Set<number>;
  setActiveSeasonYears: Dispatch<SetStateAction<Set<number>>>;
  season: SimpleRegressionSeason;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Simple regression season filters">
      {years.map((year) => {
        const active = activeSeasonYears.has(year);
        return (
          <button
            key={year}
            type="button"
            aria-pressed={active}
            onClick={() =>
              setActiveSeasonYears((previous) => {
                const next = new Set(previous);
                if (next.has(year)) next.delete(year);
                else next.add(year);
                return next;
              })
            }
            className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
              active
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: forecastYearColor(year) }}
            />
            {simpleSeasonLabel(year, season)}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setActiveSeasonYears(new Set(years))}
        className="h-7 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-[11px] font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
      >
        All On
      </button>
      <button
        type="button"
        onClick={() => setActiveSeasonYears(new Set())}
        className="h-7 rounded-md border border-gray-800 bg-gray-950/40 px-2.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-700 hover:text-gray-400"
      >
        All Off
      </button>
    </div>
  );
}

function SimpleFitHoverShape(props: ScatterShapeProps) {
  const { cx, cy } = props;
  if (typeof cx !== "number" || typeof cy !== "number") return null;
  return (
    <circle
      {...scatterShapeEvents(props)}
      cx={cx}
      cy={cy}
      r={8}
      fill="transparent"
      stroke="transparent"
      style={{ pointerEvents: "all" }}
    />
  );
}

function SimplePendingForecastShape(props: ScatterShapeProps) {
  const { cx, cy } = props;
  if (typeof cx !== "number" || typeof cy !== "number") return null;
  return (
    <g {...scatterShapeEvents(props)}>
      <circle cx={cx} cy={cy} r={12} fill="transparent" style={{ pointerEvents: "all" }} />
      <path
        d={`M ${cx} ${cy - 9} L ${cx - 8} ${cy + 7} L ${cx + 8} ${cy + 7} Z`}
        fill="#ef4444"
        stroke="#fecaca"
        strokeWidth={1.8}
      />
    </g>
  );
}

function SimpleRegressionHoverTooltip({
  hover,
  xLabel,
}: {
  hover: SimpleRegressionHover | null;
  xLabel: string;
}) {
  if (!hover) return null;
  const tooltipWidth = hover.kind === "pending" ? 288 : 224;
  const left = hover.left > tooltipWidth + 16 ? hover.left - tooltipWidth - 8 : hover.left + 12;
  const top = Math.max(8, hover.top - (hover.kind === "pending" ? 132 : 92));

  return (
    <div
      className={`pointer-events-none absolute z-10 rounded-md border border-slate-600 bg-gray-950/95 px-3 py-2 text-xs text-gray-100 shadow-xl shadow-black/40 ${
        hover.kind === "pending" ? "w-72" : "w-56"
      }`}
      style={{ left, top }}
    >
      {hover.kind === "point" ? (
        <>
          <div className="font-semibold text-white">{hover.point.weekEnding}</div>
          <div className="mt-2 grid grid-cols-[auto_auto] gap-x-2 gap-y-1">
            <span className="text-gray-100">{xLabel}:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-cyan-300">
              {fmtNumber(hover.point.x, 2)}
            </span>
            <span className="text-gray-100">EIA Salts Change:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-amber-300">
              {fmtChange(hover.point.y, 2)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-sky-300">
            {hover.point.seasonLabel}
            {hover.point.isRecent ? " | Last 8 Weeks" : ""}
          </div>
        </>
      ) : hover.kind === "fit" ? (
        <>
          <div className="font-semibold text-white">{hover.point.seasonLabel} Regression Line</div>
          <div className="mt-2 grid grid-cols-[auto_auto] gap-x-2 gap-y-1">
            <span className="text-gray-100">{xLabel}:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-cyan-300">
              {fmtNumber(hover.point.x, 2)}
            </span>
            <span className="text-gray-100">Fitted EIA Change:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-amber-300">
              {fmtChange(hover.point.y, 2)}
            </span>
            <span className="text-gray-100">Slope:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-gray-200">
              {fmtNumber(hover.point.slope, 2)}
            </span>
            <span className="text-gray-100">R2:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-gray-200">
              {fmtNumber(hover.point.rSquared, 2)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-sky-300">
            Intercept {fmtNumber(hover.point.intercept, 1)} | n {hover.point.pointCount}
          </div>
        </>
      ) : (
        <>
          <div className="font-semibold text-red-200">
            {hover.point.seasonLabel} Upcoming Forecast
          </div>
          <div className="mt-1 text-[11px] text-gray-400">
            EIA week {fmtDate(hover.point.weekEnding)} | Release {fmtDate(hover.point.releaseDate)}
          </div>
          <div className="mt-2 grid grid-cols-[auto_auto] gap-x-2 gap-y-1">
            <span className="text-gray-100">{xLabel}:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-cyan-300">
              {fmtNumber(hover.point.x, 2)}
            </span>
            <span className="text-gray-100">Forecast EIA Change:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-red-200">
              {fmtChange(hover.point.y, 2)}
            </span>
            <span className="text-gray-100">Observed Input:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-gray-200">
              {fmtNumber(hover.point.inputObservedValue, 2)}
            </span>
            <span className="text-gray-100">Input Coverage:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-gray-200">
              {fmtRatioPercent(hover.point.inputCoverage)}
            </span>
            <span className="text-gray-100">Equation:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-gray-200">
              {fmtNumber(hover.point.intercept, 1)} + {fmtNumber(hover.point.slope, 2)}x
            </span>
            <span className="text-gray-100">R2 / n:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-gray-200">
              {fmtNumber(hover.point.rSquared, 2)} / {hover.point.pointCount}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-sky-300">
            {hover.point.status} | {hover.point.inputDayCount ?? "-"} input days
          </div>
        </>
      )}
    </div>
  );
}

function SimpleRegressionStats({ fits }: { fits: SimpleRegressionFit[] }) {
  if (!fits.length) {
    return (
      <div className="mt-3 rounded-md border border-gray-800 bg-gray-900/70 px-3 py-2 text-xs text-gray-500">
        No fitted line is available for the selected seasons.
      </div>
    );
  }

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {fits.map((fit) => (
        <div key={fit.seasonYear} className="rounded-md border border-gray-800 bg-gray-900/70 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-gray-100">{fit.seasonLabel}</span>
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: forecastYearColor(fit.seasonYear) }}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-gray-500">
            <span>Slope</span>
            <span className="text-right font-mono text-gray-200">{fmtNumber(fit.slope, 2)}</span>
            <span>Intercept</span>
            <span className="text-right font-mono text-gray-200">{fmtNumber(fit.intercept, 1)}</span>
            <span>R2</span>
            <span className="text-right font-mono text-gray-200">{fmtNumber(fit.rSquared, 2)}</span>
            <span>n</span>
            <span className="text-right font-mono text-gray-200">{fit.pointCount}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SimpleRegressionChart({
  title,
  help,
  xLabel,
  points,
  season,
  pendingForecast,
  onFocus,
  showFocusButton = true,
  height = 340,
}: {
  title: string;
  help: string;
  xLabel: string;
  points: SimpleRegressionPoint[];
  season: SimpleRegressionSeason;
  pendingForecast?: SimplePendingForecastPoint | null;
  onFocus: () => void;
  showFocusButton?: boolean;
  height?: CSSProperties["height"];
}) {
  const availableYears = useMemo(
    () =>
      Array.from(new Set(points.map((point) => point.seasonYear))).sort(
        (left, right) => left - right,
      ),
    [points],
  );
  const [activeSeasonYears, setActiveSeasonYears] = useState<Set<number>>(
    () => defaultSimpleActiveSeasonYears(availableYears),
  );
  const [showRegressionLines, setShowRegressionLines] = useState(true);
  const [showLastEightWeeks, setShowLastEightWeeks] = useState(true);
  const [showPendingForecast, setShowPendingForecast] = useState(true);
  const [hover, setHover] = useState<SimpleRegressionHover | null>(null);

  useEffect(() => {
    setActiveSeasonYears(defaultSimpleActiveSeasonYears(availableYears));
  }, [availableYears]);

  const regularPoints = points.filter(
    (point) =>
      activeSeasonYears.has(point.seasonYear) &&
      (!point.isRecent || !showLastEightWeeks),
  );
  const recentPoints = showLastEightWeeks
    ? points.filter((point) => point.isRecent)
    : [];
  const visibleYears = Array.from(new Set(regularPoints.map((point) => point.seasonYear))).sort(
    (left, right) => left - right,
  );
  const fitYears = availableYears.filter((year) => activeSeasonYears.has(year));
  const fits = fitYears
    .map((year) => fitSimpleYear(points, year))
    .filter((fit): fit is SimpleRegressionFit => fit !== null);
  const visiblePendingForecast =
    showPendingForecast && pendingForecast && activeSeasonYears.has(pendingForecast.seasonYear)
      ? pendingForecast
      : null;
  const visiblePointCount = regularPoints.length + recentPoints.length + (visiblePendingForecast ? 1 : 0);
  const observationShape = (shapeProps: ScatterShapeProps & { payload?: SimpleRegressionPoint }) => (
    <SimpleObservationShape
      {...shapeProps}
      onMouseEnter={() => {
        if (shapeProps.payload && typeof shapeProps.cx === "number" && typeof shapeProps.cy === "number") {
          setHover({ kind: "point", point: shapeProps.payload, left: shapeProps.cx, top: shapeProps.cy });
        }
      }}
      onMouseMove={() => {
        if (shapeProps.payload && typeof shapeProps.cx === "number" && typeof shapeProps.cy === "number") {
          setHover({ kind: "point", point: shapeProps.payload, left: shapeProps.cx, top: shapeProps.cy });
        }
      }}
      onMouseLeave={() => setHover(null)}
    />
  );
  const pendingShape = (shapeProps: ScatterShapeProps & { payload?: SimplePendingForecastPoint }) => (
    <SimplePendingForecastShape
      {...shapeProps}
      onMouseEnter={() => {
        if (shapeProps.payload && typeof shapeProps.cx === "number" && typeof shapeProps.cy === "number") {
          setHover({ kind: "pending", point: shapeProps.payload, left: shapeProps.cx, top: shapeProps.cy });
        }
      }}
      onMouseMove={() => {
        if (shapeProps.payload && typeof shapeProps.cx === "number" && typeof shapeProps.cy === "number") {
          setHover({ kind: "pending", point: shapeProps.payload, left: shapeProps.cx, top: shapeProps.cy });
        }
      }}
      onMouseLeave={() => setHover(null)}
    />
  );
  const recentShape = (shapeProps: ScatterShapeProps & { payload?: SimpleRegressionPoint }) => (
    <RecentPointShape
      {...shapeProps}
      onMouseEnter={() => {
        if (shapeProps.payload && typeof shapeProps.cx === "number" && typeof shapeProps.cy === "number") {
          setHover({ kind: "point", point: shapeProps.payload, left: shapeProps.cx, top: shapeProps.cy });
        }
      }}
      onMouseMove={() => {
        if (shapeProps.payload && typeof shapeProps.cx === "number" && typeof shapeProps.cy === "number") {
          setHover({ kind: "point", point: shapeProps.payload, left: shapeProps.cx, top: shapeProps.cy });
        }
      }}
      onMouseLeave={() => setHover(null)}
    />
  );
  const fitHoverShape = (shapeProps: ScatterShapeProps & { payload?: SimpleRegressionFitPoint }) => (
    <SimpleFitHoverShape
      {...shapeProps}
      onMouseEnter={() => {
        if (shapeProps.payload && typeof shapeProps.cx === "number" && typeof shapeProps.cy === "number") {
          setHover({ kind: "fit", point: shapeProps.payload, left: shapeProps.cx, top: shapeProps.cy });
        }
      }}
      onMouseMove={() => {
        if (shapeProps.payload && typeof shapeProps.cx === "number" && typeof shapeProps.cy === "number") {
          setHover({ kind: "fit", point: shapeProps.payload, left: shapeProps.cx, top: shapeProps.cy });
        }
      }}
      onMouseLeave={() => setHover(null)}
    />
  );

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
            <ForecastHelpButton label={help} />
          </div>
        </div>
        {showFocusButton && <ForecastFocusButton onClick={onFocus} />}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <SimpleRegressionYearControls
          years={availableYears}
          activeSeasonYears={activeSeasonYears}
          setActiveSeasonYears={setActiveSeasonYears}
          season={season}
        />
        <button
          type="button"
          aria-pressed={showRegressionLines}
          onClick={() => setShowRegressionLines((value) => !value)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
            showRegressionLines
              ? "border-gray-600 bg-gray-800 text-white"
              : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
          }`}
        >
          <span className="h-px w-4 border-t-2 border-dashed border-current" />
          Regression Lines
        </button>
        <button
          type="button"
          aria-pressed={showLastEightWeeks}
          onClick={() => setShowLastEightWeeks((value) => !value)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
            showLastEightWeeks
              ? "border-amber-400/50 bg-amber-400/10 text-amber-100"
              : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full border-2 border-amber-300 bg-slate-100" />
          Last 8 Weeks
        </button>
        {pendingForecast && (
          <button
            type="button"
            aria-pressed={showPendingForecast}
            onClick={() => setShowPendingForecast((value) => !value)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
              showPendingForecast
                ? "border-red-400/60 bg-red-500/10 text-red-100"
                : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
            }`}
          >
            <span
              className="h-0 w-0"
              style={{
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderBottom: `9px solid ${showPendingForecast ? "#ef4444" : "#4b5563"}`,
              }}
            />
            Forecast
          </button>
        )}
      </div>
      <div
        className="relative min-w-0"
        style={{ height, minHeight: height }}
        onMouseLeave={() => setHover(null)}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={1}
          minHeight={1}
          debounce={50}
          initialDimension={initialChartDimension(height)}
        >
          <ComposedChart margin={{ top: 10, right: 16, bottom: 24, left: 0 }}>
            <CartesianGrid stroke="#1f2937" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              tickFormatter={(value) => fmtAxisTick(Number(value))}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="EIA Salts Change"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              tickFormatter={(value) => fmtAxisTick(Number(value))}
            />
            <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
            {showRegressionLines && fits.map((fit) => (
              <Line
                key={`fit:${fit.seasonYear}`}
                type="linear"
                data={fit.data}
                dataKey="y"
                name={`${fit.seasonLabel} fit`}
                stroke={forecastYearColor(fit.seasonYear)}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ))}
            {showRegressionLines && fits.map((fit) => (
              <Scatter
                key={`fit-hover:${fit.seasonYear}`}
                name={`${fit.seasonLabel} fit hover`}
                data={fit.data}
                fill="transparent"
                shape={fitHoverShape}
                isAnimationActive={false}
              />
            ))}
            {visibleYears.map((year) => (
              <Scatter
                key={year}
                name={regularPoints.find((point) => point.seasonYear === year)?.seasonLabel ?? String(year)}
                data={regularPoints.filter((point) => point.seasonYear === year)}
                fill={forecastYearColor(year)}
                fillOpacity={0.82}
                shape={observationShape}
                isAnimationActive={false}
              />
            ))}
            {showLastEightWeeks && (
              <Scatter
                name="Last 8 Weeks"
                data={recentPoints}
                fill="#f8fafc"
                shape={recentShape}
                isAnimationActive={false}
              />
            )}
            {visiblePendingForecast && (
              <Scatter
                name="Upcoming Forecast"
                data={[visiblePendingForecast]}
                fill="#ef4444"
                shape={pendingShape}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        {visiblePointCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
            No regression rows match the selected season filters.
          </div>
        )}
        <SimpleRegressionHoverTooltip hover={hover} xLabel={xLabel} />
      </div>
      <SimpleRegressionStats fits={fits} />
    </section>
  );
}

function SimpleChartToggle({
  active,
  label,
  color,
  dashed = false,
  onClick,
}: {
  active: boolean;
  label: string;
  color: string;
  dashed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
        active
          ? "border-gray-600 bg-gray-800 text-white"
          : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
      }`}
    >
      <span
        className={`h-2.5 w-2.5 ${dashed ? "border-t-2" : "rounded-full"}`}
        style={dashed ? { borderColor: color } : { backgroundColor: color }}
      />
      {label}
    </button>
  );
}

function SimpleActualModelTooltip({
  active,
  payload,
  showActual,
  showFit,
}: {
  active?: boolean;
  payload?: SimpleDiagnosticTooltipPayloadItem[];
  showActual: boolean;
  showFit: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload.find((item) => item.payload?.weekEnding)?.payload;
  if (!row?.weekEnding) return null;

  return (
    <div className="rounded-md border border-slate-600 bg-gray-950/95 px-4 py-3 text-xs text-gray-100 shadow-xl shadow-black/40">
      <div className="font-semibold text-white">{row.weekEnding}</div>
      <div className="mt-2 grid grid-cols-[auto_auto] gap-x-2 gap-y-1">
        {showActual && (
          <>
            <span className="text-gray-100">Actual EIA Change:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-slate-100">
              {fmtChange(row.actualChangeBcf, 2)}
            </span>
          </>
        )}
        {showFit && (
          <>
            <span className="text-gray-100">Salt Total Fit:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-cyan-300">
              {fmtChange(row.saltPredictionBcf, 2)}
            </span>
          </>
        )}
        {showActual && showFit && (
          <>
            <span className="text-gray-100">Residual:</span>
            <span className={`text-right font-mono font-semibold tabular-nums ${flowTone(row.saltResidualBcf)}`}>
              {fmtSignedBcf(row.saltResidualBcf)}
            </span>
          </>
        )}
      </div>
      <div className="mt-2 text-[11px] text-sky-300">
        {row.seasonLabel ?? "-"}
        {row.isRecent ? " | Last 8 Weeks" : ""}
      </div>
    </div>
  );
}

function SimpleResidualTooltip({
  active,
  payload,
  showZScore,
}: {
  active?: boolean;
  payload?: SimpleDiagnosticTooltipPayloadItem[];
  showZScore: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload.find((item) => item.payload?.weekEnding)?.payload;
  if (!row?.weekEnding) return null;

  return (
    <div className="rounded-md border border-slate-600 bg-gray-950/95 px-4 py-3 text-xs text-gray-100 shadow-xl shadow-black/40">
      <div className="font-semibold text-white">{row.weekEnding}</div>
      <div className="mt-2 grid grid-cols-[auto_auto] gap-x-2 gap-y-1">
        {showZScore && (
          <>
            <span className="text-gray-100">Salt Residual Z:</span>
            <span className="text-right font-mono font-semibold tabular-nums text-cyan-300">
              {fmtNumber(row.saltZScore, 2)}
            </span>
          </>
        )}
        <span className="text-gray-100">Residual (BCF):</span>
        <span className={`text-right font-mono font-semibold tabular-nums ${flowTone(row.saltResidualBcf)}`}>
          {fmtSignedBcf(row.saltResidualBcf)}
        </span>
        <span className="text-gray-100">Actual EIA Change:</span>
        <span className="text-right font-mono font-semibold tabular-nums text-slate-100">
          {fmtChange(row.actualChangeBcf, 2)}
        </span>
        <span className="text-gray-100">Salt Total Fit:</span>
        <span className="text-right font-mono font-semibold tabular-nums text-cyan-300">
          {fmtChange(row.saltPredictionBcf, 2)}
        </span>
      </div>
      <div className="mt-2 text-[11px] text-sky-300">
        {row.seasonLabel ?? "-"}
        {row.isRecent ? " | Last 8 Weeks" : ""}
      </div>
    </div>
  );
}

function SimpleActualModelChart({
  rows,
  height = 340,
}: {
  rows: SimpleDiagnosticRow[];
  height?: CSSProperties["height"];
}) {
  const [showActual, setShowActual] = useState(true);
  const [showFit, setShowFit] = useState(true);
  const [showLastEightWeeks, setShowLastEightWeeks] = useState(true);
  const hasVisibleElement = showActual || showFit;

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <SimpleChartToggle
          active={showActual}
          label="Actual EIA"
          color="#f8fafc"
          onClick={() => setShowActual((value) => !value)}
        />
        <SimpleChartToggle
          active={showFit}
          label="Salt Total Fit"
          color="#22d3ee"
          dashed
          onClick={() => setShowFit((value) => !value)}
        />
        <SimpleChartToggle
          active={showLastEightWeeks}
          label="Last 8 Weeks"
          color="#fbbf24"
          onClick={() => setShowLastEightWeeks((value) => !value)}
        />
      </div>
      <div className="relative min-w-0" style={{ height, minHeight: height }}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={1}
          minHeight={1}
          debounce={50}
          initialDimension={initialChartDimension(height)}
        >
          <ComposedChart data={rows} margin={{ top: 18, right: 22, bottom: 24, left: 0 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis
              dataKey="weekEnding"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              minTickGap={22}
              tickFormatter={(value) => String(value).slice(5)}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              tickFormatter={(value) => fmtAxisTick(Number(value))}
            />
            <Tooltip
              content={<SimpleActualModelTooltip showActual={showActual} showFit={showFit} />}
              cursor={{ stroke: "#cbd5e1", strokeDasharray: "3 3" }}
            />
            <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
            {showActual && (
              <Line
                type="monotone"
                dataKey="actualChangeBcf"
                name="Actual EIA Change"
                stroke="#f8fafc"
                strokeWidth={2.2}
                dot={<SimpleRecentLineDot enabled={showLastEightWeeks} color="#f8fafc" />}
                activeDot={{ r: 5, stroke: "#e5e7eb", strokeWidth: 1.4 }}
                connectNulls
                isAnimationActive={false}
              />
            )}
            {showFit && (
              <Line
                type="monotone"
                dataKey="saltPredictionBcf"
                name="Salt Total Fit"
                stroke="#22d3ee"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={<SimpleRecentLineDot enabled={showLastEightWeeks} color="#22d3ee" />}
                activeDot={{ r: 5, stroke: "#e5e7eb", strokeWidth: 1.4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        {(!rows.length || !hasVisibleElement) && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
            {rows.length ? "No chart elements are enabled." : "No simple model rows are available."}
          </div>
        )}
      </div>
    </>
  );
}

function SimpleResidualZScoreChart({
  rows,
  height = 300,
}: {
  rows: SimpleDiagnosticRow[];
  height?: CSSProperties["height"];
}) {
  const [showZScore, setShowZScore] = useState(true);
  const [showBands, setShowBands] = useState(true);
  const [showLastEightWeeks, setShowLastEightWeeks] = useState(true);
  const chartRows = rows.filter((row) => row.saltZScore !== null && Number.isFinite(row.saltZScore));

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <SimpleChartToggle
          active={showZScore}
          label="Residual Z"
          color="#22d3ee"
          onClick={() => setShowZScore((value) => !value)}
        />
        <SimpleChartToggle
          active={showBands}
          label="Threshold Bands"
          color="#f59e0b"
          dashed
          onClick={() => setShowBands((value) => !value)}
        />
        <SimpleChartToggle
          active={showLastEightWeeks}
          label="Last 8 Weeks"
          color="#fbbf24"
          onClick={() => setShowLastEightWeeks((value) => !value)}
        />
      </div>
      <div className="relative min-w-0" style={{ height, minHeight: height }}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={1}
          minHeight={1}
          debounce={50}
          initialDimension={initialChartDimension(height)}
        >
          <ComposedChart data={rows} margin={{ top: 12, right: 22, bottom: 24, left: 0 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis
              dataKey="weekEnding"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              minTickGap={22}
              tickFormatter={(value) => String(value).slice(5)}
            />
            <YAxis
              domain={[-4, 4]}
              allowDataOverflow
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              tickFormatter={(value) => fmtAxisTick(Number(value))}
            />
            {showBands && (
              <>
                <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
                <ReferenceLine y={1} stroke="#38bdf8" strokeDasharray="3 3" />
                <ReferenceLine y={-1} stroke="#38bdf8" strokeDasharray="3 3" />
                <ReferenceLine y={2} stroke="#f59e0b" strokeDasharray="3 3" />
                <ReferenceLine y={-2} stroke="#f59e0b" strokeDasharray="3 3" />
              </>
            )}
            <Tooltip
              content={<SimpleResidualTooltip showZScore={showZScore} />}
              cursor={{ stroke: "#cbd5e1", strokeDasharray: "3 3" }}
            />
            <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
            {showZScore && (
              <Line
                type="linear"
                dataKey="saltZScore"
                name="Salt Total Residual Z"
                stroke="#22d3ee"
                strokeWidth={1.8}
                dot={<SimpleRecentLineDot enabled={showLastEightWeeks} color="#22d3ee" />}
                activeDot={{ r: 5, stroke: "#e5e7eb", strokeWidth: 1.4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        {(!chartRows.length || !showZScore) && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
            {chartRows.length ? "No chart elements are enabled." : "No simple residual rows are available."}
          </div>
        )}
      </div>
    </>
  );
}

function BlendDiagnosticsPanel({
  weights,
  pendingRows,
}: {
  weights: SaltForecastModelWeight[];
  pendingRows: SaltForecastQueueRow[];
}) {
  const [expanded, setExpanded] = useState(false);
  const driverContributions = pendingRows.at(0)?.weatherAdjustedDriverContributions ?? [];

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-gray-100">Blend Diagnostics</h3>
          <p className="mt-1 text-xs text-gray-500">
            Model weights, pending-week driver contributions, and the pending weekly forecast queue.
          </p>
        </div>
        <span className="shrink-0 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-300">
          {expanded ? "Collapse" : "Expand"}
        </span>
      </button>
      {expanded && (
        <div className="mt-4 space-y-5 border-t border-gray-800 pt-4">
          <div className="grid gap-5 xl:grid-cols-2">
            <ForecastWeightsTable rows={weights} embedded />
            <ForecastWeatherAdjustedDriverContributionsPanel rows={driverContributions} embedded />
          </div>
          <ForecastPendingQueue rows={pendingRows} embedded />
        </div>
      )}
    </section>
  );
}

function BlendPendingForecastPanel({ pending }: { pending: SaltForecastQueueRow | null }) {
  const range =
    pending?.rangeLow === null ||
    pending?.rangeLow === undefined ||
    pending.rangeHigh === null ||
    pending.rangeHigh === undefined
      ? "-"
      : `${fmtSignedBcf(pending.rangeLow)} to ${fmtSignedBcf(pending.rangeHigh)}`;
  const saltDays = pending?.saltDayCount ?? "-";
  const weatherDays = pending?.weatherDayCount ?? "-";

  return (
    <section className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 xl:flex-nowrap">
        <div className="min-w-[220px] flex-1">
          <h3 className="text-sm font-semibold text-cyan-100">Upcoming Salts Forecast Blend</h3>
          <p className="mt-0.5 text-[11px] text-gray-500">
            EIA week {fmtDate(pending?.weekEnding)} | Release {fmtDate(pending?.releaseDate)}
          </p>
        </div>
        <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Forecast</span>
          <span className="font-mono text-xl font-semibold tabular-nums text-cyan-300">
            {fmtSignedBcf(pending?.forecastActualWx)}
          </span>
          <span className="text-[11px] text-gray-500">Bcf</span>
        </div>
        <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">80% Range</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-gray-100">{range}</span>
        </div>
        <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Weather Impact</span>
          <span className={`font-mono text-sm font-semibold tabular-nums ${flowTone(pending?.weatherImpact)}`}>
            {fmtSignedBcf(pending?.weatherImpact)}
          </span>
          <span className="text-[11px] text-gray-500">
            normal {fmtSignedBcf(pending?.forecastNormalWx)}
          </span>
        </div>
        <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Coverage</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-gray-100">
            {fmtRatioPercent(pending?.coverage)}
          </span>
          <span className="text-[11px] text-gray-500">
            salt {saltDays}d | wx {weatherDays}d
          </span>
        </div>
        <span className="shrink-0 rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
          {pending?.status ?? "No pending week"}
        </span>
      </div>
    </section>
  );
}

interface BlendSimpleComparator {
  forecastBcf: number | null;
  blendForecastBcf: number | null;
  deltaBcf: number | null;
  seasonLabel: string | null;
  rSquared: number | null;
  pointCount: number | null;
}

function BlendForecastBridge({
  pending,
  simpleComparator,
}: {
  pending: SaltForecastQueueRow | null;
  simpleComparator: BlendSimpleComparator;
}) {
  const legs = pending?.modelLegs ?? [];
  const actualContributionSum = sumFiniteNullable(
    legs.map((leg) => leg.weightedContributionActualWx),
  );
  const normalContributionSum = sumFiniteNullable(
    legs.map((leg) => leg.weightedContributionNormalWx),
  );
  const actualDiff =
    isFiniteNumber(actualContributionSum) && isFiniteNumber(pending?.forecastActualWx)
      ? actualContributionSum - pending.forecastActualWx
      : null;
  const normalDiff =
    isFiniteNumber(normalContributionSum) && isFiniteNumber(pending?.forecastNormalWx)
      ? normalContributionSum - pending.forecastNormalWx
      : null;

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">Blend Forecast Bridge</h3>
          <p className="mt-1 text-xs text-gray-500">
            sum(weight * leg forecast) = {fmtSignedBcf(actualContributionSum)} Bcf = blend{" "}
            {fmtSignedBcf(pending?.forecastActualWx)} Bcf
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded border border-gray-800 bg-gray-900/70 px-2 py-1 text-gray-400">
            Week {pending?.weekNumber ?? "-"}
          </span>
          <span className="rounded border border-gray-800 bg-gray-900/70 px-2 py-1 text-gray-400">
            Last actual {fmtSignedBcf(pending?.lastActualChangeBcf)}
          </span>
          <span className={`rounded border border-gray-800 bg-gray-900/70 px-2 py-1 ${bridgeDiffTone(actualDiff)}`}>
            Actual diff {fmtNumber(actualDiff, 3)}
          </span>
          <span className={`rounded border border-gray-800 bg-gray-900/70 px-2 py-1 ${bridgeDiffTone(normalDiff)}`}>
            Normal diff {fmtNumber(normalDiff, 3)}
          </span>
        </div>
      </div>

      <div className="mb-4 grid gap-px overflow-hidden rounded-md border border-gray-800 bg-gray-800 md:grid-cols-3">
        <div className="bg-gray-950 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Simple seasonal Salt Total forecast
          </p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-gray-100">
            {fmtSignedBcf(simpleComparator.forecastBcf)}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {simpleComparator.seasonLabel ?? "-"} | R2 {fmtNumber(simpleComparator.rSquared, 2)} | n{" "}
            {simpleComparator.pointCount ?? "-"}
          </p>
        </div>
        <div className="bg-gray-950 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Blend forecast
          </p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-cyan-300">
            {fmtSignedBcf(simpleComparator.blendForecastBcf)}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Actual weather case | {legs.length || "-"} legs
          </p>
        </div>
        <div className="bg-gray-950 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Blend minus Simple
          </p>
          <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${flowTone(simpleComparator.deltaBcf)}`}>
            {fmtSignedBcf(simpleComparator.deltaBcf)}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500">Comparator only</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1040px] w-full text-left text-[11px]">
          <thead className="uppercase tracking-wider text-gray-500">
            <tr>
              {[
                "Model Leg",
                "Weight",
                "Actual Wx Forecast",
                "Actual Wx Contribution",
                "Normal Wx Forecast",
                "Normal Wx Contribution",
                "MAE",
                "RMSE",
                "Bias",
              ].map((header) => (
                <th key={header} className="border-b border-gray-800 px-2 py-2 text-right first:text-left">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {legs.length ? (
              <>
                {legs.map((leg) => (
                  <tr key={leg.key} className="hover:bg-gray-900/45">
                    <td className="border-t border-gray-900 px-2 py-2 text-left font-semibold text-gray-100">
                      {leg.model}
                    </td>
                    <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-cyan-200">
                      {fmtRatioPercent(leg.weight)}
                    </td>
                    <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                      {fmtSignedBcf(leg.forecastActualWx)}
                    </td>
                    <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(leg.weightedContributionActualWx)}`}>
                      {fmtSignedBcf(leg.weightedContributionActualWx)}
                    </td>
                    <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                      {fmtSignedBcf(leg.forecastNormalWx)}
                    </td>
                    <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(leg.weightedContributionNormalWx)}`}>
                      {fmtSignedBcf(leg.weightedContributionNormalWx)}
                    </td>
                    <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                      {fmtNumber(leg.mae, 2)}
                    </td>
                    <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-200">
                      {fmtNumber(leg.rmse, 2)}
                    </td>
                    <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(leg.bias)}`}>
                      {fmtSignedBcf(leg.bias)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-900/60">
                  <td className="border-t border-gray-800 px-2 py-2 text-left font-semibold text-gray-100">
                    Weighted contribution total
                  </td>
                  <td className="border-t border-gray-800 px-2 py-2 text-right text-gray-500">-</td>
                  <td className="border-t border-gray-800 px-2 py-2 text-right text-gray-500">-</td>
                  <td className={`border-t border-gray-800 px-2 py-2 text-right font-semibold tabular-nums ${flowTone(actualContributionSum)}`}>
                    {fmtSignedBcf(actualContributionSum)}
                  </td>
                  <td className="border-t border-gray-800 px-2 py-2 text-right text-gray-500">-</td>
                  <td className={`border-t border-gray-800 px-2 py-2 text-right font-semibold tabular-nums ${flowTone(normalContributionSum)}`}>
                    {fmtSignedBcf(normalContributionSum)}
                  </td>
                  <td className="border-t border-gray-800 px-2 py-2 text-right text-gray-500">-</td>
                  <td className="border-t border-gray-800 px-2 py-2 text-right text-gray-500">-</td>
                  <td className="border-t border-gray-800 px-2 py-2 text-right text-gray-500">-</td>
                </tr>
              </>
            ) : (
              <tr>
                <td colSpan={9} className="border-t border-gray-900 px-2 py-4 text-sm text-gray-500">
                  No pending-week model leg decomposition is available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SimplePendingForecastPanel({
  pending,
  forecastBcf,
  fit,
  seasonLabel,
}: {
  pending: SaltForecastQueueRow | null;
  forecastBcf: number | null;
  fit: SimpleRegressionFit | null;
  seasonLabel: string | null;
}) {
  const pendingSaltTotal =
    pending?.saltSumBcf === null || pending?.saltSumBcf === undefined
      ? "-"
      : fmtNumber(pending.saltSumBcf, 1);
  const inputDays = pending?.saltDayCount ?? "-";
  const equation = fit
    ? `EIA = ${fmtNumber(fit.intercept, 1)} + ${fmtNumber(fit.slope, 2)} * Salt Total`
    : "EIA = -";

  return (
    <section className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 xl:flex-nowrap">
        <div className="min-w-[220px] flex-1">
          <h3 className="text-sm font-semibold text-cyan-100">
            Upcoming {seasonLabel ?? "Simple"} Salt Total Forecast
          </h3>
          <p className="mt-0.5 text-[11px] text-gray-500">
            EIA week {fmtDate(pending?.weekEnding)} | Release {fmtDate(pending?.releaseDate)}
          </p>
        </div>
        <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Forecast</span>
          <span className="font-mono text-xl font-semibold tabular-nums text-cyan-300">
            {fmtSignedBcf(forecastBcf)}
          </span>
          <span className="text-[11px] text-gray-500">Bcf</span>
        </div>
        <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Pending Salt Total</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-gray-100">{pendingSaltTotal}</span>
          <span className="text-[11px] text-gray-500">
            Bcf | {fmtRatioPercent(pending?.saltCoverage)} | {inputDays} days
          </span>
        </div>
        <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Fit</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-gray-100">
            R2 {fmtNumber(fit?.rSquared, 2)}
          </span>
          <span className="text-[11px] text-gray-500">
            slope {fmtNumber(fit?.slope, 2)} | n {fit?.pointCount ?? "-"}
          </span>
        </div>
        <div className="min-w-[210px] flex-[1_1_260px] font-mono text-sm font-semibold text-gray-100">
          {equation}
        </div>
        <span className="shrink-0 rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
          {pending?.status ?? "No pending week"}
        </span>
      </div>
    </section>
  );
}

export function SimpleSaltRegressionTab({
  data,
  loading,
  error,
  apiElapsedMs,
  lookbackWeeks,
  setLookbackWeeks,
}: {
  data: SaltForecastPayload | null;
  loading: boolean;
  error: string | null;
  apiElapsedMs: number | null;
  lookbackWeeks: number;
  setLookbackWeeks: Dispatch<SetStateAction<number>>;
}) {
  const [regressionSeason, setRegressionSeason] = useState<SimpleRegressionSeason>(
    () => initialSimpleRegressionSeason(),
  );
  const weatherLabel = simpleWeatherLabel(regressionSeason);
  const simpleRegression = useMemo(() => {
    const weeklySeries = data?.weeklySeries ?? [];
    const saltsPoints = buildSimpleRegressionPoints(
      weeklySeries,
      (point) => point.saltSumBcf,
      regressionSeason,
    );
    const weatherPoints = buildSimpleRegressionPoints(
      weeklySeries,
      (point) => (regressionSeason === "winter" ? point.gasHddObserved : point.gasCddObserved),
      regressionSeason,
    );
    const seasonYears = simpleSeasonYears(saltsPoints);
    const diagnostics = buildSimpleDiagnostics({
      series: weeklySeries,
      saltPoints: saltsPoints,
      season: regressionSeason,
    });
    return { saltsPoints, weatherPoints, seasonYears, diagnostics };
  }, [data?.weeklySeries, regressionSeason]);
  const [focusedChart, setFocusedChart] = useState<SimpleFocusChart | null>(null);
  const warnings = data?.sourceStatus.warnings ?? [];
  const saltsTitle = simpleRegressionTitle(regressionSeason, "Salts Total");
  const weatherTitle = simpleRegressionTitle(regressionSeason, weatherLabel);
  const seasonFitLabel = regressionSeason === "winter" ? "XH season" : "summer year";
  const latestSeasonYear = simpleRegression.seasonYears.at(-1) ?? null;
  const latestDiagnosticRow = simpleRegression.diagnostics.rows.at(-1) ?? null;
  const latestSaltsFit =
    latestSeasonYear === null ? null : fitSimpleYear(simpleRegression.saltsPoints, latestSeasonYear);
  const pendingSimpleForecast = useMemo(() => {
    const pending = data?.pendingQueue.at(0) ?? null;
    const seasonYear = pending ? simpleSeasonYear(pending.weekEnding, regressionSeason) : null;
    const seasonLabel = seasonYear === null ? null : simpleSeasonLabel(seasonYear, regressionSeason);
    const fit = seasonYear === null ? null : fitSimpleYear(simpleRegression.saltsPoints, seasonYear);
    const forecastBcf =
      fit && isFiniteNumber(pending?.saltSumBcf)
        ? simplePrediction(fit, pending.saltSumBcf)
        : null;
    const marker =
      pending &&
      fit &&
      seasonYear !== null &&
      seasonLabel !== null &&
      isFiniteNumber(pending.saltSumBcf) &&
      isFiniteNumber(forecastBcf)
        ? {
            kind: "pending" as const,
            weekEnding: pending.weekEnding,
            releaseDate: pending.releaseDate,
            seasonYear,
            seasonLabel,
            x: pending.saltSumBcf,
            y: forecastBcf,
            inputObservedValue: pending.saltObservedBcf,
            inputCoverage: pending.saltCoverage,
            inputDayCount: pending.saltDayCount,
            status: pending.status,
            slope: fit.slope,
            intercept: fit.intercept,
            rSquared: fit.rSquared,
            pointCount: fit.pointCount,
          }
        : null;
    const weatherFit =
      seasonYear === null ? null : fitSimpleYear(simpleRegression.weatherPoints, seasonYear);
    const weatherInput =
      pending === null ? null : regressionSeason === "winter" ? pending.gasHddObserved : pending.gasCddObserved;
    const weatherForecastBcf =
      weatherFit && isFiniteNumber(weatherInput) ? simplePrediction(weatherFit, weatherInput) : null;
    const weatherMarker =
      pending &&
      weatherFit &&
      seasonYear !== null &&
      seasonLabel !== null &&
      isFiniteNumber(weatherInput) &&
      isFiniteNumber(weatherForecastBcf)
        ? {
            kind: "pending" as const,
            weekEnding: pending.weekEnding,
            releaseDate: pending.releaseDate,
            seasonYear,
            seasonLabel,
            x: weatherInput,
            y: weatherForecastBcf,
            inputObservedValue: weatherInput,
            inputCoverage: pending.weatherCoverage,
            inputDayCount: pending.weatherDayCount,
            status: pending.status,
            slope: weatherFit.slope,
            intercept: weatherFit.intercept,
            rSquared: weatherFit.rSquared,
            pointCount: weatherFit.pointCount,
          }
        : null;
    return { pending, seasonYear, seasonLabel, fit, forecastBcf, marker, weatherMarker };
  }, [data?.pendingQueue, simpleRegression.saltsPoints, simpleRegression.weatherPoints, regressionSeason]);

  useEffect(() => {
    if (!focusedChart) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusedChart(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focusedChart]);

  return (
    <section className="space-y-5 rounded-xl border border-gray-800 bg-gray-900/60 p-5 shadow-2xl">
      <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:max-w-md xl:grid-cols-[140px_150px]">
            <label>
              <span className={labelClass}>Season</span>
              <select
                value={regressionSeason}
                aria-label="Simple regression season"
                onChange={(event) => setRegressionSeason(event.target.value as SimpleRegressionSeason)}
                className={controlClass}
              >
                {SIMPLE_REGRESSION_SEASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <ForecastNumberInput
              label="Lookback Weeks"
              value={lookbackWeeks}
              onChange={setLookbackWeeks}
              min={52}
              max={520}
            />
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
            <span className="rounded border border-gray-800 bg-gray-900/70 px-2 py-0.5">
              Salt Main
            </span>
            <span className="rounded border border-gray-800 bg-gray-900/70 px-2 py-0.5">
              {weatherLabel}
            </span>
            <span className="rounded border border-gray-800 bg-gray-900/70 px-2 py-0.5">
              OLS by {seasonFitLabel}
            </span>
            <span className="rounded border border-gray-800 bg-gray-900/70 px-2 py-0.5">
              API {fmtMs(apiElapsedMs)}
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Latest report week {fmtDate(data?.summary.latestReportWeek)} | Weekly rows{" "}
          {(data?.summary.weeklyRowCount ?? 0).toLocaleString()} | {simpleSeasonWindowLabel(regressionSeason)}{" "}
          weeks only.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {data?.sourceStatus.lineage ?? "Derived local Salts Forecast route will report source lineage after load."}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {warnings.join(" ")}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-4 text-sm text-gray-500">
          Loading simple salt regressions...
        </div>
      )}

      {data && !loading && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ForecastKpi
              label="Regression Sample"
              value={simpleRegression.saltsPoints.length.toLocaleString()}
              detail={`${simpleSeasonWindowLabel(regressionSeason)} weeks only`}
              valueClassName="text-gray-100"
            />
            <ForecastKpi
              label="Latest EIA Actual"
              value={fmtSignedBcf(latestDiagnosticRow?.actualChangeBcf)}
              detail={
                latestDiagnosticRow
                  ? `${fmtDate(latestDiagnosticRow.weekEnding)} | ${latestDiagnosticRow.seasonLabel}`
                  : "No seasonal row"
              }
              valueClassName={flowTone(latestDiagnosticRow?.actualChangeBcf)}
            />
            <ForecastKpi
              label="Salts Total Fit"
              value={`R2 ${fmtNumber(latestSaltsFit?.rSquared, 2)}`}
              detail={
                latestSaltsFit
                  ? `${latestSaltsFit.seasonLabel} slope ${fmtNumber(latestSaltsFit.slope, 2)} | n ${latestSaltsFit.pointCount}`
                  : "No selected season fit"
              }
              valueClassName="text-gray-100"
            />
            <ForecastKpi
              label="Latest Salt Residual"
              value={fmtSignedBcf(latestDiagnosticRow?.saltResidualBcf)}
              detail="Actual minus Salt Total fit"
              valueClassName={flowTone(latestDiagnosticRow?.saltResidualBcf)}
            />
          </section>

          <SimplePendingForecastPanel
            pending={pendingSimpleForecast.pending}
            forecastBcf={pendingSimpleForecast.forecastBcf}
            fit={pendingSimpleForecast.fit}
            seasonLabel={pendingSimpleForecast.seasonLabel}
          />

          <div className="grid gap-5 xl:grid-cols-2">
            <SimpleRegressionChart
              title={saltsTitle}
              help={`Simple one-variable OLS: weekly EIA salt working gas change against weekly salt nomination total, fit separately for each ${seasonFitLabel}.`}
              xLabel="Salts Total (Bcf)"
              points={simpleRegression.saltsPoints}
              season={regressionSeason}
              pendingForecast={pendingSimpleForecast.marker}
              onFocus={() => setFocusedChart("salts")}
            />
            <SimpleRegressionChart
              title={weatherTitle}
              help={`Simple one-variable OLS: weekly EIA salt working gas change against ${weatherLabel}, fit separately for each ${seasonFitLabel}.`}
              xLabel={weatherLabel}
              points={simpleRegression.weatherPoints}
              season={regressionSeason}
              pendingForecast={pendingSimpleForecast.weatherMarker}
              onFocus={() => setFocusedChart("weather")}
            />
          </div>

          <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-100">
                  Weekly EIA Salt Activity: Actual vs Salt Total Simple Model
                </h3>
                <ForecastHelpButton
                  label="Actual weekly EIA salt change against same-season fitted values from the Salt Total simple regression."
                />
              </div>
              <ForecastFocusButton onClick={() => setFocusedChart("actual-model")} />
            </div>
            <SimpleActualModelChart rows={simpleRegression.diagnostics.rows} />
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-100">Simple Residual Z-Score</h3>
                <ForecastHelpButton
                  label="Standardized actual-minus-fit residuals for the Salt Total simple regression."
                />
              </div>
              <ForecastFocusButton onClick={() => setFocusedChart("z-score")} />
            </div>
            <SimpleResidualZScoreChart rows={simpleRegression.diagnostics.rows} />
          </section>

        </>
      )}

      {focusedChart && data && (
        <div
          className="fixed inset-0 z-50 bg-black/75 p-2 sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFocusedChart(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="salt-simple-focus-title"
            className="mx-auto flex h-full max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl shadow-black/50"
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-800 p-3">
              <div>
                <h2 id="salt-simple-focus-title" className="text-sm font-semibold text-gray-100">
                  {focusedChart === "salts"
                    ? saltsTitle
                    : focusedChart === "weather"
                      ? weatherTitle
                      : focusedChart === "actual-model"
                        ? "Weekly EIA Salt Activity: Actual vs Salt Total Simple Model"
                        : "Simple Residual Z-Score"}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {data.summary.weeklyRowCount.toLocaleString()} weekly rows | {fmtDate(data.summary.minWeek)} to{" "}
                  {fmtDate(data.summary.maxWeek)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFocusedChart(null)}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {focusedChart === "salts" && (
                <SimpleRegressionChart
                  title={saltsTitle}
                  help={`Simple one-variable OLS: weekly EIA salt working gas change against weekly salt nomination total, fit separately for each ${seasonFitLabel}.`}
                  xLabel="Salts Total (Bcf)"
                  points={simpleRegression.saltsPoints}
                  season={regressionSeason}
                  pendingForecast={pendingSimpleForecast.marker}
                  onFocus={() => undefined}
                  showFocusButton={false}
                  height="62vh"
                />
              )}
              {focusedChart === "weather" && (
                <SimpleRegressionChart
                  title={weatherTitle}
                  help={`Simple one-variable OLS: weekly EIA salt working gas change against ${weatherLabel}, fit separately for each ${seasonFitLabel}.`}
                  xLabel={weatherLabel}
                  points={simpleRegression.weatherPoints}
                  season={regressionSeason}
                  pendingForecast={pendingSimpleForecast.weatherMarker}
                  onFocus={() => undefined}
                  showFocusButton={false}
                  height="62vh"
                />
              )}
              {focusedChart === "actual-model" && (
                <SimpleActualModelChart rows={simpleRegression.diagnostics.rows} height="70vh" />
              )}
              {focusedChart === "z-score" && (
                <SimpleResidualZScoreChart rows={simpleRegression.diagnostics.rows} height="70vh" />
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default function SaltForecastTab({
  data,
  loading,
  error,
  apiElapsedMs,
  saltRegion,
  setSaltRegion,
  weatherRegion,
  setWeatherRegion,
  lookbackWeeks,
  setLookbackWeeks,
}: {
  data: SaltForecastPayload | null;
  loading: boolean;
  error: string | null;
  apiElapsedMs: number | null;
  saltRegion: SaltForecastRegion;
  setSaltRegion: Dispatch<SetStateAction<SaltForecastRegion>>;
  weatherRegion: SaltForecastWeatherRegion;
  setWeatherRegion: Dispatch<SetStateAction<SaltForecastWeatherRegion>>;
  lookbackWeeks: number;
  setLookbackWeeks: Dispatch<SetStateAction<number>>;
}) {
  const [activeYears, setActiveYears] = useState<Set<number>>(
    () => new Set(SALT_FORECAST_YEAR_FILTERS),
  );
  const [focusedChart, setFocusedChart] = useState<
    "actual-model" | "z-score" | "expected-actual" | "weather-loose-tight" | null
  >(null);
  const warnings = data?.sourceStatus.warnings ?? [];
  const pendingBlendForecast = useMemo(() => {
    const pending = data?.pendingQueue.at(0) ?? null;
    const pendingYear = pending ? Number.parseInt(pending.weekEnding.slice(0, 4), 10) : null;
    if (!pending || pendingYear === null || !Number.isFinite(pendingYear)) {
      return { expectedActual: null, weatherLooseTight: null };
    }

    const common = {
      weekEnding: pending.weekEnding,
      releaseDate: pending.releaseDate,
      year: pendingYear,
      status: pending.status,
      forecastActualWx: pending.forecastActualWx,
      forecastNormalWx: pending.forecastNormalWx,
      weatherImpact: pending.weatherImpact,
      rangeLow: pending.rangeLow,
      rangeHigh: pending.rangeHigh,
      coverage: pending.coverage,
      saltSumBcf: pending.saltSumBcf,
      weatherAnomaly: pending.weatherAnomaly,
    };

    const expectedActual =
      isFiniteNumber(pending.forecastActualWx)
        ? {
            ...common,
            xValue: pending.forecastActualWx,
            xLabel: "Expected",
            annotationNote: "actual EIA pending",
          }
        : null;
    const weatherLooseTight =
      isFiniteNumber(pending.weatherImpact)
        ? {
            ...common,
            xValue: pending.weatherImpact,
            xLabel: "Weather Impact",
            annotationNote: "loose/tight pending",
          }
        : null;

    return { expectedActual, weatherLooseTight };
  }, [data?.pendingQueue]);
  const bridgeSimpleComparator = useMemo((): BlendSimpleComparator => {
    const pending = data?.pendingQueue.at(0) ?? null;
    const season = simpleSeasonForWeek(pending?.weekEnding);
    const seasonYear = pending && season ? simpleSeasonYear(pending.weekEnding, season) : null;
    const seasonLabel =
      seasonYear === null || season === null ? null : simpleSeasonLabel(seasonYear, season);
    const saltPoints = season
      ? buildSimpleRegressionPoints(data?.weeklySeries ?? [], (point) => point.saltSumBcf, season)
      : [];
    const fit = seasonYear === null ? null : fitSimpleYear(saltPoints, seasonYear);
    const forecastBcf =
      fit && isFiniteNumber(pending?.saltSumBcf) ? simplePrediction(fit, pending.saltSumBcf) : null;
    const blendForecastBcf = pending?.forecastActualWx ?? null;
    return {
      forecastBcf,
      blendForecastBcf,
      deltaBcf:
        isFiniteNumber(blendForecastBcf) && isFiniteNumber(forecastBcf)
          ? blendForecastBcf - forecastBcf
          : null,
      seasonLabel,
      rSquared: fit?.rSquared ?? null,
      pointCount: fit?.pointCount ?? null,
    };
  }, [data?.pendingQueue, data?.weeklySeries]);

  useEffect(() => {
    if (!focusedChart) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusedChart(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focusedChart]);

  return (
    <section className="space-y-5 rounded-xl border border-gray-800 bg-gray-900/60 p-5 shadow-2xl">
      <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
        <div className="grid gap-3 md:grid-cols-[170px_190px_140px]">
          <label>
            <span className={labelClass}>Salt Region</span>
            <select
              value={saltRegion}
              aria-label="Salt Region"
              onChange={(event) => setSaltRegion(event.target.value as SaltForecastRegion)}
              className={controlClass}
            >
              {SALT_FORECAST_REGION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Weather Region</span>
            <select
              value={weatherRegion}
              aria-label="Weather Region"
              onChange={(event) => setWeatherRegion(event.target.value as SaltForecastWeatherRegion)}
              className={controlClass}
            >
              {SALT_FORECAST_WEATHER_REGION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <ForecastNumberInput
            label="Lookback Weeks"
            value={lookbackWeeks}
            onChange={setLookbackWeeks}
            min={52}
            max={520}
          />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          EIA Salt | Weather {weatherRegion} | Latest report week {fmtDate(data?.summary.latestReportWeek)} | Live
          EIA checked {fmtDate(data?.summary.liveEiaChecked)} | API {fmtMs(apiElapsedMs)}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {data?.sourceStatus.lineage ?? "Derived local Salts Forecast route will report source lineage after load."}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {warnings.join(" ")}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-4 text-sm text-gray-500">
          Loading Salts Forecast diagnostics...
        </div>
      )}

      {data && !loading && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <ForecastKpi
              label="Next EIA Forecast (Bcf)"
              value={fmtSignedBcf(data.summary.nextForecast)}
              detail={data.summary.nextForecast === null ? "No pending week" : "Actual weather case"}
              valueClassName="text-cyan-300"
            />
            <ForecastKpi
              label="80% Range"
              value={
                data.summary.rangeLow === null || data.summary.rangeHigh === null
                  ? "-"
                  : `${fmtSignedBcf(data.summary.rangeLow)} to ${fmtSignedBcf(data.summary.rangeHigh)}`
              }
              detail="Walk-forward residual envelope"
              valueClassName="text-gray-100"
            />
            <ForecastKpi
              label="Ensemble Backtest"
              value={`MAE ${fmtNumber(data.summary.ensembleMae, 2)}`}
              detail={`OOS RMSE ${fmtNumber(data.summary.ensembleRmse, 2)} | Hit ${fmtRatioPercent(data.summary.hitRate)}`}
              valueClassName="text-gray-100"
            />
            <ForecastKpi
              label="Signal Coverage"
              value={fmtRatioPercent(data.summary.signalCoverage)}
              detail={data.summary.signalCoverage === null ? "No pending week" : "Pending-week source coverage"}
              valueClassName="text-gray-100"
            />
            <ForecastKpi
              label="Weather Impact / Loose-Tight"
              value={fmtSignedBcf(data.summary.nextWeatherImpact)}
              detail={`LT adj ${fmtSignedBcf(data.summary.latestLooseTight)} | z ${fmtNumber(data.summary.latestLooseTightZ, 2)}`}
              valueClassName={flowTone(data.summary.nextWeatherImpact)}
            />
          </section>

          <BlendPendingForecastPanel pending={data.pendingQueue.at(0) ?? null} />
          <BlendForecastBridge
            pending={data.pendingQueue.at(0) ?? null}
            simpleComparator={bridgeSimpleComparator}
          />

          <BlendDiagnosticsPanel
            weights={data.modelWeights}
            pendingRows={data.pendingQueue}
          />

          <div className="grid gap-5 xl:grid-cols-2">
            <ForecastScatterPanel
              title="Scatter: Expected vs Actual (Weather Adjusted)"
              help="Expected is the derived walk-forward ensemble prediction; actual is EIA weekly salt working gas change."
              data={data.expectedActualScatter}
              xLabel="Expected"
              yLabel="Actual"
              activeYears={activeYears}
              setActiveYears={setActiveYears}
              pendingForecast={pendingBlendForecast.expectedActual}
              onFocus={() => setFocusedChart("expected-actual")}
            />
            <ForecastScatterPanel
              title="Scatter: Weather Impact vs Loose/Tight"
              help="Weather impact is the weather-adjusted model component; loose/tight is actual minus predicted."
              data={data.weatherLooseTightScatter}
              xLabel="Weather Impact"
              yLabel="Loose/Tight"
              activeYears={activeYears}
              setActiveYears={setActiveYears}
              pendingForecast={pendingBlendForecast.weatherLooseTight}
              onFocus={() => setFocusedChart("weather-loose-tight")}
            />
          </div>

          <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <h3 className="text-sm font-semibold text-gray-100">
                Weekly EIA Salt Activity: Actual vs Model
              </h3>
              <ForecastFocusButton onClick={() => setFocusedChart("actual-model")} />
            </div>
            <ForecastActualModelChart series={data.weeklySeries} />
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <h3 className="text-sm font-semibold text-gray-100">
                Loose/Tight Z-Score (Weather Adjusted) | Last 8 weeks highlighted
              </h3>
              <div className="flex items-center gap-2">
                <ForecastFocusButton onClick={() => setFocusedChart("z-score")} />
                <ForecastHelpButton label="Z-score is actual minus walk-forward ensemble prediction, standardized by residual history." />
              </div>
            </div>
            <ForecastZScoreChart series={data.weeklySeries} />
          </section>

        </>
      )}

      {focusedChart && data && (
        <div
          className="fixed inset-0 z-50 bg-black/75 p-2 sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFocusedChart(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="salt-forecast-focus-title"
            className="mx-auto flex h-full max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl shadow-black/50"
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-800 p-3">
              <div>
                <h2 id="salt-forecast-focus-title" className="text-sm font-semibold text-gray-100">
                  {focusedChart === "actual-model"
                    ? "Weekly EIA Salt Activity: Actual vs Model"
                    : focusedChart === "z-score"
                      ? "Loose/Tight Z-Score"
                      : focusedChart === "expected-actual"
                        ? "Expected vs Actual"
                        : "Weather Impact vs Loose/Tight"}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {data.summary.weeklyRowCount.toLocaleString()} weekly rows | {fmtDate(data.summary.minWeek)} to{" "}
                  {fmtDate(data.summary.maxWeek)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFocusedChart(null)}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {focusedChart === "actual-model" && (
                <ForecastActualModelChart series={data.weeklySeries} height="70vh" />
              )}
              {focusedChart === "z-score" && <ForecastZScoreChart series={data.weeklySeries} height="70vh" />}
              {focusedChart === "expected-actual" && (
                <ForecastScatterPanel
                  title="Scatter: Expected vs Actual (Weather Adjusted)"
                  help="Expected is the derived walk-forward ensemble prediction; actual is EIA weekly salt working gas change."
                  data={data.expectedActualScatter}
                  xLabel="Expected"
                  yLabel="Actual"
                  activeYears={activeYears}
                  setActiveYears={setActiveYears}
                  pendingForecast={pendingBlendForecast.expectedActual}
                  onFocus={() => undefined}
                  showFocusButton={false}
                  height="62vh"
                />
              )}
              {focusedChart === "weather-loose-tight" && (
                <ForecastScatterPanel
                  title="Scatter: Weather Impact vs Loose/Tight"
                  help="Weather impact is the weather-adjusted model component; loose/tight is actual minus predicted."
                  data={data.weatherLooseTightScatter}
                  xLabel="Weather Impact"
                  yLabel="Loose/Tight"
                  activeYears={activeYears}
                  setActiveYears={setActiveYears}
                  pendingForecast={pendingBlendForecast.weatherLooseTight}
                  onFocus={() => undefined}
                  showFocusButton={false}
                  height="62vh"
                />
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
