import {
  observedJsonRoute,
  type ObservedRouteResult,
} from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import { localOnlyObservedNotFound } from "@/lib/server/localOnlyApi";
import { mssqlQuery } from "@/lib/server/mssql";
import {
  buildSaltFacilitiesForecastSql,
  loadPromotedSaltFacilitiesBcfSql,
} from "@/lib/salts/sql";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "private, no-store";
const ROUTE = "/api/salts/forecast";
const DEFAULT_LOOKBACK_WEEKS = 340;
const MIN_LOOKBACK_WEEKS = 52;
const MAX_LOOKBACK_WEEKS = 520;
const RECENT_WEEK_COUNT = 8;
const MIN_TRAINING_WEEKS = 24;
const FULL_WEEK_DAYS = 7;
const WEATHER_FIT_COEFFICIENT_INDEX = {
  intercept: 0,
  saltSumBcf: 1,
  saltLastBcf: 2,
  gasHddObserved: 3,
  gasCddObserved: 4,
  weatherAnomaly: 5,
} as const;

type SaltForecastRegion = "salt-main" | "se-salt";
type WeatherRegion = "CONUS" | "EAST" | "MIDWEST" | "MOUNTAIN" | "PACIFIC" | "SOUTHCENTRAL";

const WEATHER_REGIONS: readonly WeatherRegion[] = [
  "CONUS",
  "EAST",
  "MIDWEST",
  "MOUNTAIN",
  "PACIFIC",
  "SOUTHCENTRAL",
];

const SALT_REGION_CONFIG: Record<
  SaltForecastRegion,
  {
    label: string;
    saltMetrics: readonly string[];
  }
> = {
  "salt-main": {
    label: "Salt Main",
    saltMetrics: ["salts_total"],
  },
  "se-salt": {
    label: "SE Salt",
    saltMetrics: ["salts_la", "salts_ms", "salts_al"],
  },
};

const ROUTE_CONFIG = {
  route: ROUTE,
  cacheHeader: CACHE_HEADER,
  cachePolicy: "no-store",
  owner: "gas",
  purpose: "Local-dev Salt Fc weekly EIA salt storage forecast diagnostics.",
  p95TargetMs: 3_000,
  freshnessSource:
    "eia.weekly_underground_storage, promoted dbt salts mart SQL over GenscapeDataFeed.natgas, and weather.wsi_daily_weighted_degree_day_observations",
} as const;

interface RawSaltFlowRow extends Record<string, unknown> {
  date: string | Date | null;
}

interface RawEiaStorageRow {
  eia_week_ending: string | Date | null;
  duoarea: string | null;
  area_name: string | null;
  region: string | null;
  product: string | null;
  product_name: string | null;
  process: string | null;
  process_name: string | null;
  series: string | null;
  series_description: string | null;
  value_bcf: number | string | null;
  updated_at: string | Date | null;
}

interface RawWeatherRow {
  date: string | Date | null;
  gas_hdd: number | string | null;
  population_cdd: number | string | null;
}

interface WeeklyActualRow {
  weekEnding: string;
  valueBcf: number;
  actualChangeBcf: number | null;
}

interface WeeklySaltFeature {
  weekEnding: string;
  saltSumBcf: number;
  dayCount: number;
}

interface WeeklyWeatherFeature {
  weekEnding: string;
  gasHddObserved: number | null;
  gasCddObserved: number | null;
  weatherIndex: number | null;
  weatherAnomaly: number | null;
  dayCount: number;
}

interface ModelRecord {
  weekEnding: string;
  label: string;
  year: number;
  weekNumber: number;
  actualChangeBcf: number;
  saltSumBcf: number;
  lastActualChangeBcf: number | null;
  gasHddObserved: number | null;
  gasCddObserved: number | null;
  weatherAnomaly: number | null;
  saltBaseline: number | null;
  momentumLinear: number | null;
  shapeRegime: number | null;
  weatherAdjusted: number | null;
  modelPredictedChangeBcf: number | null;
  residualBcf: number | null;
  looseTightZScore: number | null;
  weatherImpactBcf: number | null;
  isRecent: boolean;
}

interface ModelStats {
  key: "saltBaseline" | "momentumLinear" | "shapeRegime" | "weatherAdjusted";
  model: string;
  weight: number | null;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
}

interface SimpleFit {
  intercept: number;
  slope: number;
  predict: (x: number | null) => number | null;
}

interface MultiFit {
  coefficients: number[];
  predict: (row: ModelRecord) => number | null;
}

interface ModelFitBundle {
  saltFit: SimpleFit | null;
  momentumFit: SimpleFit | null;
  weatherFit: MultiFit | null;
  globalMean: number;
  byWeekNumber: Map<number, number[]>;
}

interface Driver {
  driver: string;
  value: number;
}

interface PendingForecastRow {
  weekEnding: string;
  releaseDate: string | null;
  forecastActualWx: number | null;
  forecastNormalWx: number | null;
  weatherImpact: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  coverage: number | null;
  weatherAnomaly: number | null;
  status: string;
}

function parseInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseSaltRegion(value: string | null): SaltForecastRegion {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  return normalized === "se-salt" ? "se-salt" : "salt-main";
}

function parseWeatherRegion(value: string | null): WeatherRegion {
  const normalized = (value ?? "").trim().toUpperCase();
  return WEATHER_REGIONS.includes(normalized as WeatherRegion)
    ? (normalized as WeatherRegion)
    : "SOUTHCENTRAL";
}

function dateString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return null;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function numberValue(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metricValue(row: Record<string, unknown> | undefined, key: string): number | null {
  if (!row) return null;
  return numberValue(row[key]);
}

function weekEndingFriday(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  const day = parsed.getUTCDay();
  const offset = (5 - day + 7) % 7;
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return parsed.toISOString().slice(0, 10);
}

function weekNumber(date: string): number {
  const parsed = new Date(`${date}T00:00:00Z`);
  const start = new Date(Date.UTC(parsed.getUTCFullYear(), 0, 1));
  const days = Math.floor((parsed.getTime() - start.getTime()) / 86_400_000);
  return Math.floor(days / 7) + 1;
}

function maxIsoDate(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function minIsoDate(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(0) ?? null;
}

function average(values: Array<number | null | undefined>): number | null {
  const finiteValues = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  if (!finiteValues.length) return null;
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function quantile(values: number[], percentile: number): number | null {
  const sortedValues = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sortedValues.length) return null;
  const index = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = average(values);
  if (avg === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function eiaStorageSql(): string {
  return `
    SELECT
      eia_week_ending,
      duoarea,
      area_name,
      region,
      product,
      product_name,
      process,
      process_name,
      series,
      series_description,
      value_bcf,
      updated_at
    FROM eia.weekly_underground_storage
    WHERE eia_week_ending >= current_date - (($1::int + 12) * interval '1 week')
      AND value_bcf IS NOT NULL
    ORDER BY eia_week_ending ASC, series ASC;
  `;
}

function observedWeatherSql(): string {
  return `
    SELECT
      to_char(observation_date::date, 'YYYY-MM-DD') AS date,
      AVG(metric_value) FILTER (WHERE metric_name = 'gas_hdd') AS gas_hdd,
      AVG(metric_value) FILTER (WHERE metric_name = 'population_cdd') AS population_cdd
    FROM weather.wsi_daily_weighted_degree_day_observations
    WHERE observation_date >= current_date - (($1::int + 12) * interval '1 week')
      AND observation_date <= current_date
      AND entity_id = $2::text
      AND metric_name IN ('gas_hdd', 'population_cdd')
    GROUP BY observation_date::date
    ORDER BY observation_date::date ASC;
  `;
}

async function sourceRowsOrEmpty<T>(
  run: () => Promise<T[]>,
  warnings: string[],
  label: string,
): Promise<T[]> {
  try {
    return await run();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown source error";
    warnings.push(`${label}: ${detail}`);
    return [];
  }
}

function isSaltStorageRow(row: RawEiaStorageRow): boolean {
  const text = [
    row.duoarea,
    row.area_name,
    row.region,
    row.product,
    row.product_name,
    row.process,
    row.process_name,
    row.series,
    row.series_description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    text.includes("salt") &&
    !text.includes("nonsalt") &&
    !text.includes("non-salt") &&
    text.includes("working")
  );
}

function buildActualRows(rows: RawEiaStorageRow[], lookbackWeeks: number): WeeklyActualRow[] {
  const byWeek = new Map<string, number>();
  for (const row of rows) {
    if (!isSaltStorageRow(row)) continue;
    const weekEnding = dateString(row.eia_week_ending);
    const value = numberValue(row.value_bcf);
    if (!weekEnding || value === null) continue;
    byWeek.set(weekEnding, (byWeek.get(weekEnding) ?? 0) + value);
  }

  const stockRows = Array.from(byWeek.entries())
    .map(([weekEnding, valueBcf]) => ({ weekEnding, valueBcf }))
    .sort((left, right) => left.weekEnding.localeCompare(right.weekEnding));

  return stockRows
    .map((row, index): WeeklyActualRow => ({
      ...row,
      actualChangeBcf: index === 0 ? null : row.valueBcf - stockRows[index - 1].valueBcf,
    }))
    .filter((row) => row.actualChangeBcf !== null)
    .slice(-lookbackWeeks);
}

function buildSaltFeatures(rows: RawSaltFlowRow[], saltRegion: SaltForecastRegion): WeeklySaltFeature[] {
  const metrics = SALT_REGION_CONFIG[saltRegion].saltMetrics;
  const byWeek = new Map<string, { saltSumBcf: number; dates: Set<string> }>();
  for (const row of rows) {
    const date = dateString(row.date);
    if (!date) continue;
    const dailyValue = metrics.reduce((sum, metric) => sum + (metricValue(row, metric) ?? 0), 0);
    const weekEnding = weekEndingFriday(date);
    const bucket = byWeek.get(weekEnding) ?? { saltSumBcf: 0, dates: new Set<string>() };
    bucket.saltSumBcf += dailyValue;
    bucket.dates.add(date);
    byWeek.set(weekEnding, bucket);
  }
  return Array.from(byWeek.entries())
    .map(([weekEnding, bucket]) => ({
      weekEnding,
      saltSumBcf: bucket.saltSumBcf,
      dayCount: bucket.dates.size,
    }))
    .sort((left, right) => left.weekEnding.localeCompare(right.weekEnding));
}

function buildWeatherFeatures(rows: RawWeatherRow[]): WeeklyWeatherFeature[] {
  const weekly = new Map<string, { gasHdd: number[]; gasCdd: number[]; dates: Set<string> }>();
  for (const row of rows) {
    const date = dateString(row.date);
    if (!date) continue;
    const weekEnding = weekEndingFriday(date);
    const bucket = weekly.get(weekEnding) ?? { gasHdd: [], gasCdd: [], dates: new Set<string>() };
    const gasHdd = numberValue(row.gas_hdd);
    const gasCdd = numberValue(row.population_cdd);
    if (gasHdd !== null) bucket.gasHdd.push(gasHdd);
    if (gasCdd !== null) bucket.gasCdd.push(gasCdd);
    bucket.dates.add(date);
    weekly.set(weekEnding, bucket);
  }

  const preliminary = Array.from(weekly.entries())
    .map(([weekEnding, bucket]) => {
      const gasHddObserved = average(bucket.gasHdd);
      const gasCddObserved = average(bucket.gasCdd);
      const weatherIndex =
        gasHddObserved === null && gasCddObserved === null
          ? null
          : (gasHddObserved ?? 0) + (gasCddObserved ?? 0);
      return {
        weekEnding,
        gasHddObserved,
        gasCddObserved,
        weatherIndex,
        weatherAnomaly: null,
        dayCount: bucket.dates.size,
      };
    })
    .sort((left, right) => left.weekEnding.localeCompare(right.weekEnding));

  const climatology = new Map<number, number[]>();
  for (const row of preliminary) {
    if (row.weatherIndex === null) continue;
    const key = weekNumber(row.weekEnding);
    climatology.set(key, [...(climatology.get(key) ?? []), row.weatherIndex]);
  }

  return preliminary.map((row) => {
    const normal = average(climatology.get(weekNumber(row.weekEnding)) ?? []);
    return {
      ...row,
      weatherAnomaly:
        row.weatherIndex !== null && normal !== null ? row.weatherIndex - normal : null,
    };
  });
}

function fitSimple(
  rows: ModelRecord[],
  xSelector: (row: ModelRecord) => number | null,
): SimpleFit | null {
  const points = rows
    .map((row) => ({ x: xSelector(row), y: row.actualChangeBcf }))
    .filter((point): point is { x: number; y: number } => point.x !== null && Number.isFinite(point.x));
  if (points.length < 3) return null;
  const xMean = average(points.map((point) => point.x));
  const yMean = average(points.map((point) => point.y));
  if (xMean === null || yMean === null) return null;
  const denominator = points.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0);
  if (Math.abs(denominator) < 1e-9) return null;
  const numerator = points.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0);
  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;
  return {
    intercept,
    slope,
    predict: (x) => (x === null || !Number.isFinite(x) ? null : intercept + slope * x),
  };
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-9) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const pivotValue = augmented[column][column];
    for (let col = column; col <= n; col += 1) augmented[column][col] /= pivotValue;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let col = column; col <= n; col += 1) {
        augmented[row][col] -= factor * augmented[column][col];
      }
    }
  }
  return augmented.map((row) => row[n]);
}

function fitMulti(
  rows: ModelRecord[],
  selectors: Array<(row: ModelRecord) => number | null>,
): MultiFit | null {
  const samples = rows
    .map((row) => ({
      x: [1, ...selectors.map((selector) => selector(row))],
      y: row.actualChangeBcf,
    }))
    .filter((sample): sample is { x: number[]; y: number } =>
      sample.x.every((value) => value !== null && Number.isFinite(value)),
    );
  const featureCount = selectors.length + 1;
  if (samples.length < featureCount + 2) return null;

  const xtx = Array.from({ length: featureCount }, () => Array.from({ length: featureCount }, () => 0));
  const xty = Array.from({ length: featureCount }, () => 0);
  for (const sample of samples) {
    for (let i = 0; i < featureCount; i += 1) {
      xty[i] += sample.x[i] * sample.y;
      for (let j = 0; j < featureCount; j += 1) {
        xtx[i][j] += sample.x[i] * sample.x[j];
      }
    }
  }
  for (let i = 1; i < featureCount; i += 1) xtx[i][i] += 1e-6;
  const coefficients = solveLinearSystem(xtx, xty);
  if (!coefficients) return null;
  return {
    coefficients,
    predict: (row) => {
      const maybeFeatures = [1, ...selectors.map((selector) => selector(row))];
      if (maybeFeatures.some((value) => value === null || !Number.isFinite(value))) return null;
      const features = maybeFeatures.filter((value): value is number => value !== null);
      let prediction = 0;
      for (let index = 0; index < features.length; index += 1) {
        const coefficient = coefficients[index];
        const value = features[index];
        if (coefficient === undefined || value === undefined) return null;
        prediction += value * coefficient;
      }
      return prediction;
    },
  };
}

function predictionStats(
  rows: ModelRecord[],
  key: ModelStats["key"],
  model: string,
): ModelStats {
  const errors = rows
    .map((row) => {
      const prediction = row[key];
      return prediction === null ? null : prediction - row.actualChangeBcf;
    })
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (!errors.length) {
    return { key, model, weight: null, mae: null, rmse: null, bias: null };
  }
  const mae = average(errors.map((value) => Math.abs(value)));
  const mse = average(errors.map((value) => value ** 2));
  return {
    key,
    model,
    weight: null,
    mae,
    rmse: mse === null ? null : Math.sqrt(mse),
    bias: average(errors),
  };
}

function computeWeights(stats: ModelStats[]): ModelStats[] {
  const rawWeights = stats.map((stat) =>
    stat.mae !== null && stat.mae > 0 ? 1 / stat.mae : 0,
  );
  const total = rawWeights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    const fallback = stats.length ? 1 / stats.length : null;
    return stats.map((stat) => ({ ...stat, weight: fallback }));
  }
  return stats.map((stat, index) => ({ ...stat, weight: rawWeights[index] / total }));
}

function buildFitBundle(rows: ModelRecord[]): ModelFitBundle {
  const saltFit = fitSimple(rows, (row) => row.saltSumBcf);
  const momentumFit = fitSimple(rows, (row) => row.lastActualChangeBcf);
  const weatherFit = fitMulti(rows, [
    (row) => row.saltSumBcf,
    (row) => row.lastActualChangeBcf,
    (row) => row.gasHddObserved,
    (row) => row.gasCddObserved,
    (row) => row.weatherAnomaly,
  ]);
  const globalMean = average(rows.map((row) => row.actualChangeBcf)) ?? 0;
  const byWeekNumber = new Map<number, number[]>();
  for (const row of rows) {
    byWeekNumber.set(row.weekNumber, [...(byWeekNumber.get(row.weekNumber) ?? []), row.actualChangeBcf]);
  }
  return { saltFit, momentumFit, weatherFit, globalMean, byWeekNumber };
}

function assignLegPredictions(row: ModelRecord, fit: ModelFitBundle): void {
  row.saltBaseline = fit.saltFit?.predict(row.saltSumBcf) ?? row.saltSumBcf;
  row.momentumLinear = fit.momentumFit?.predict(row.lastActualChangeBcf) ?? row.saltBaseline;
  row.shapeRegime = average(fit.byWeekNumber.get(row.weekNumber) ?? []) ?? fit.globalMean;
  row.weatherAdjusted = fit.weatherFit?.predict(row) ?? row.saltBaseline;
  if (!fit.weatherFit) {
    row.weatherImpactBcf = null;
    return;
  }
  const coefficients = fit.weatherFit.coefficients;
  const weatherContributions = [
    row.gasHddObserved === null
      ? null
      : coefficients[WEATHER_FIT_COEFFICIENT_INDEX.gasHddObserved] * row.gasHddObserved,
    row.gasCddObserved === null
      ? null
      : coefficients[WEATHER_FIT_COEFFICIENT_INDEX.gasCddObserved] * row.gasCddObserved,
    row.weatherAnomaly === null
      ? null
      : coefficients[WEATHER_FIT_COEFFICIENT_INDEX.weatherAnomaly] * row.weatherAnomaly,
  ].filter((value): value is number => value !== null && Number.isFinite(value));
  row.weatherImpactBcf = weatherContributions.length
    ? weatherContributions.reduce((sum, value) => sum + value, 0)
    : null;
}

function blendModelPrediction(row: ModelRecord, modelWeights: ModelStats[]): number | null {
  const weightedPredictions = modelWeights
    .map((stat) => {
      const value = row[stat.key];
      return value === null || stat.weight === null ? null : { value, weight: stat.weight };
    })
    .filter((item): item is { value: number; weight: number } => item !== null);
  const weightTotal = weightedPredictions.reduce((sum, item) => sum + item.weight, 0);
  if (weightTotal > 0) {
    return weightedPredictions.reduce((sum, item) => sum + item.value * item.weight, 0) / weightTotal;
  }

  return average(modelWeights.map((stat) => row[stat.key]));
}

function statsForRows(rows: ModelRecord[]): ModelStats[] {
  return computeWeights([
    predictionStats(rows, "saltBaseline", "Salt Sum Baseline"),
    predictionStats(rows, "momentumLinear", "Momentum Linear"),
    predictionStats(rows, "shapeRegime", "Shape + Regime"),
    predictionStats(rows, "weatherAdjusted", "Weather Adjusted"),
  ]);
}

function buildPendingForecastRow({
  records,
  saltFeatures,
  weatherFeatures,
  modelWeights,
  residuals,
  finalFit,
}: {
  records: ModelRecord[];
  saltFeatures: WeeklySaltFeature[];
  weatherFeatures: WeeklyWeatherFeature[];
  modelWeights: ModelStats[];
  residuals: number[];
  finalFit: ModelFitBundle;
}): PendingForecastRow | null {
  const latestRecord = records.at(-1);
  if (!latestRecord) return null;

  const saltByWeek = new Map(saltFeatures.map((row) => [row.weekEnding, row]));
  const weatherByWeek = new Map(weatherFeatures.map((row) => [row.weekEnding, row]));
  const pendingWeek = saltFeatures
    .map((row) => row.weekEnding)
    .filter((weekEnding) => weekEnding > latestRecord.weekEnding)
    .sort()
    .at(0);
  if (!pendingWeek) return null;

  const saltFeature = saltByWeek.get(pendingWeek);
  if (!saltFeature || saltFeature.dayCount <= 0) return null;

  const weatherFeature = weatherByWeek.get(pendingWeek);
  const saltCoverage = Math.min(1, saltFeature.dayCount / FULL_WEEK_DAYS);
  const weatherCoverage = weatherFeature ? Math.min(1, weatherFeature.dayCount / FULL_WEEK_DAYS) : null;
  const signalCoverage = weatherCoverage === null ? saltCoverage : Math.min(saltCoverage, weatherCoverage);
  const fullWeekSaltEstimate = saltFeature.saltSumBcf / Math.max(saltCoverage, 1 / FULL_WEEK_DAYS);

  const pendingRecord: ModelRecord = {
    weekEnding: pendingWeek,
    label: pendingWeek.slice(5),
    year: Number.parseInt(pendingWeek.slice(0, 4), 10),
    weekNumber: weekNumber(pendingWeek),
    actualChangeBcf: 0,
    saltSumBcf: fullWeekSaltEstimate,
    lastActualChangeBcf: latestRecord.actualChangeBcf,
    gasHddObserved: weatherFeature?.gasHddObserved ?? null,
    gasCddObserved: weatherFeature?.gasCddObserved ?? null,
    weatherAnomaly: weatherFeature?.weatherAnomaly ?? null,
    saltBaseline: null,
    momentumLinear: null,
    shapeRegime: null,
    weatherAdjusted: null,
    modelPredictedChangeBcf: null,
    residualBcf: null,
    looseTightZScore: null,
    weatherImpactBcf: null,
    isRecent: false,
  };
  assignLegPredictions(pendingRecord, finalFit);
  const forecastActualWx = blendModelPrediction(pendingRecord, modelWeights);

  const normalWeatherRecord: ModelRecord = {
    ...pendingRecord,
    weatherAnomaly: 0,
    saltBaseline: null,
    momentumLinear: null,
    shapeRegime: null,
    weatherAdjusted: null,
    weatherImpactBcf: null,
  };
  assignLegPredictions(normalWeatherRecord, finalFit);
  const forecastNormalWx =
    pendingRecord.weatherAnomaly === null ? null : blendModelPrediction(normalWeatherRecord, modelWeights);

  const residualLow = quantile(residuals, 0.1);
  const residualHigh = quantile(residuals, 0.9);

  return {
    weekEnding: pendingWeek,
    releaseDate: addDays(pendingWeek, 6),
    forecastActualWx,
    forecastNormalWx,
    weatherImpact:
      forecastActualWx === null || forecastNormalWx === null ? null : forecastActualWx - forecastNormalWx,
    rangeLow: forecastActualWx === null || residualLow === null ? null : forecastActualWx + residualLow,
    rangeHigh: forecastActualWx === null || residualHigh === null ? null : forecastActualWx + residualHigh,
    coverage: signalCoverage,
    weatherAnomaly: pendingRecord.weatherAnomaly,
    status:
      forecastActualWx === null
        ? "insufficient model"
        : signalCoverage >= 1
          ? "ready"
          : "partial inputs",
  };
}

function buildModelPayload({
  actualRows,
  saltFeatures,
  weatherFeatures,
}: {
  actualRows: WeeklyActualRow[];
  saltFeatures: WeeklySaltFeature[];
  weatherFeatures: WeeklyWeatherFeature[];
}): {
  records: ModelRecord[];
  modelWeights: ModelStats[];
  leadDrivers: Driver[];
  ensembleMae: number | null;
  ensembleRmse: number | null;
  hitRate: number | null;
  pendingQueue: PendingForecastRow[];
  nextForecast: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  signalCoverage: number | null;
  nextWeatherImpact: number | null;
} {
  const saltByWeek = new Map(saltFeatures.map((row) => [row.weekEnding, row]));
  const weatherByWeek = new Map(weatherFeatures.map((row) => [row.weekEnding, row]));
  const records = actualRows
    .map((row, index): ModelRecord | null => {
      if (row.actualChangeBcf === null) return null;
      const weather = weatherByWeek.get(row.weekEnding);
      return {
        weekEnding: row.weekEnding,
        label: row.weekEnding.slice(5),
        year: Number.parseInt(row.weekEnding.slice(0, 4), 10),
        weekNumber: weekNumber(row.weekEnding),
        actualChangeBcf: row.actualChangeBcf,
        saltSumBcf: saltByWeek.get(row.weekEnding)?.saltSumBcf ?? 0,
        lastActualChangeBcf: index > 0 ? actualRows[index - 1].actualChangeBcf : null,
        gasHddObserved: weather?.gasHddObserved ?? null,
        gasCddObserved: weather?.gasCddObserved ?? null,
        weatherAnomaly: weather?.weatherAnomaly ?? null,
        saltBaseline: null,
        momentumLinear: null,
        shapeRegime: null,
        weatherAdjusted: null,
        modelPredictedChangeBcf: null,
        residualBcf: null,
        looseTightZScore: null,
        weatherImpactBcf: null,
        isRecent: false,
      };
    })
    .filter((row): row is ModelRecord => row !== null);

  for (let index = 0; index < records.length; index += 1) {
    const row = records[index];
    const trainingRows = records.slice(0, index);
    if (trainingRows.length < MIN_TRAINING_WEEKS) continue;
    assignLegPredictions(row, buildFitBundle(trainingRows));
    row.modelPredictedChangeBcf = blendModelPrediction(row, statsForRows(trainingRows));
    row.residualBcf =
      row.modelPredictedChangeBcf === null ? null : row.actualChangeBcf - row.modelPredictedChangeBcf;
  }

  const modelWeights = statsForRows(records);
  const finalFit = buildFitBundle(records);
  const residuals = records
    .map((row) => row.residualBcf)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const residualMean = average(residuals) ?? 0;
  const residualStd = standardDeviation(residuals) ?? null;
  records.forEach((row, index) => {
    row.looseTightZScore =
      row.residualBcf !== null && residualStd !== null && residualStd > 0
        ? (row.residualBcf - residualMean) / residualStd
        : null;
    row.isRecent = index >= records.length - RECENT_WEEK_COUNT;
  });

  const ensembleErrors = records
    .map((row) =>
      row.modelPredictedChangeBcf === null
        ? null
        : row.modelPredictedChangeBcf - row.actualChangeBcf,
    )
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const hitRows = records.filter((row) => row.modelPredictedChangeBcf !== null);
  const hitRate = hitRows.length
    ? hitRows.filter((row) => Math.sign(row.modelPredictedChangeBcf ?? 0) === Math.sign(row.actualChangeBcf)).length /
      hitRows.length
    : null;

  const weatherCoefficients = finalFit.weatherFit?.coefficients;
  const leadDrivers: Driver[] = [
    {
      driver: "SALTSUMBCF",
      value:
        weatherCoefficients?.[WEATHER_FIT_COEFFICIENT_INDEX.saltSumBcf] ??
        finalFit.saltFit?.slope ??
        0,
    },
    {
      driver: "INTERCEPT",
      value:
        weatherCoefficients?.[WEATHER_FIT_COEFFICIENT_INDEX.intercept] ??
        finalFit.saltFit?.intercept ??
        finalFit.globalMean,
    },
    {
      driver: "SALTLASTBCF",
      value:
        weatherCoefficients?.[WEATHER_FIT_COEFFICIENT_INDEX.saltLastBcf] ??
        finalFit.momentumFit?.slope ??
        0,
    },
    {
      driver: "WEATHERGASHDDOBSERVED",
      value: weatherCoefficients?.[WEATHER_FIT_COEFFICIENT_INDEX.gasHddObserved] ?? 0,
    },
    {
      driver: "WEATHERGASCDDOBSERVED",
      value: weatherCoefficients?.[WEATHER_FIT_COEFFICIENT_INDEX.gasCddObserved] ?? 0,
    },
    {
      driver: "WEATHERGASHDDANOM",
      value: weatherCoefficients?.[WEATHER_FIT_COEFFICIENT_INDEX.weatherAnomaly] ?? 0,
    },
  ].sort((left, right) => Math.abs(right.value) - Math.abs(left.value));

  const ensembleMse = average(ensembleErrors.map((value) => value ** 2));
  const pendingForecast = buildPendingForecastRow({
    records,
    saltFeatures,
    weatherFeatures,
    modelWeights,
    residuals,
    finalFit,
  });
  const pendingQueue = pendingForecast ? [pendingForecast] : [];

  return {
    records,
    modelWeights,
    leadDrivers,
    ensembleMae: average(ensembleErrors.map((value) => Math.abs(value))),
    ensembleRmse: ensembleMse === null ? null : Math.sqrt(ensembleMse),
    hitRate,
    pendingQueue,
    nextForecast: pendingForecast?.forecastActualWx ?? null,
    rangeLow: pendingForecast?.rangeLow ?? null,
    rangeHigh: pendingForecast?.rangeHigh ?? null,
    signalCoverage: pendingForecast?.coverage ?? null,
    nextWeatherImpact: pendingForecast?.weatherImpact ?? null,
  };
}

const observedGET = observedJsonRoute(
  ROUTE_CONFIG,
  async (request: Request): Promise<ObservedRouteResult> => {
    if (!isLocalOnlyFeatureEnabled()) {
      return localOnlyObservedNotFound();
    }

    const { searchParams } = new URL(request.url);
    const saltRegion = parseSaltRegion(searchParams.get("saltRegion"));
    const weatherRegion = parseWeatherRegion(searchParams.get("weatherRegion"));
    const lookbackWeeks = parseInteger(
      searchParams.get("lookbackWeeks"),
      DEFAULT_LOOKBACK_WEEKS,
      MIN_LOOKBACK_WEEKS,
      MAX_LOOKBACK_WEEKS,
    );
    const warnings: string[] = [];
    const lookbackDays = (lookbackWeeks + 16) * 7;
    const promotedSql = await loadPromotedSaltFacilitiesBcfSql();

    const [eiaRows, saltRows, weatherRows] = await Promise.all([
      sourceRowsOrEmpty<RawEiaStorageRow>(
        () => query<RawEiaStorageRow>(eiaStorageSql(), [lookbackWeeks]),
        warnings,
        "EIA weekly underground storage source unavailable",
      ),
      sourceRowsOrEmpty<RawSaltFlowRow>(
        () =>
          mssqlQuery<RawSaltFlowRow>(buildSaltFacilitiesForecastSql(promotedSql.sql), {
            lookbackDays,
          }),
        warnings,
        "Promoted daily salts source unavailable",
      ),
      sourceRowsOrEmpty<RawWeatherRow>(
        () => query<RawWeatherRow>(observedWeatherSql(), [lookbackWeeks, weatherRegion]),
        warnings,
        "Observed WSI weather source unavailable",
      ),
    ]);

    const actualRows = buildActualRows(eiaRows, lookbackWeeks);
    const saltFeatures = buildSaltFeatures(saltRows, saltRegion);
    const weatherFeatures = buildWeatherFeatures(weatherRows);
    const model = buildModelPayload({ actualRows, saltFeatures, weatherFeatures });
    const dates = model.records.map((row) => row.weekEnding);
    const latest = model.records.at(-1) ?? null;

    if (actualRows.length === 0) warnings.push("No EIA salt working gas rows were found.");
    if (saltFeatures.length === 0) warnings.push("No daily salts flow rows were found.");
    if (weatherFeatures.length === 0) warnings.push(`No observed weather rows were found for ${weatherRegion}.`);
    const sourceStatus =
      actualRows.length === 0 || saltFeatures.length === 0
        ? "missing_model_inputs"
        : warnings.length
          ? "partial"
          : "ok";

    return {
      payload: {
        selected: {
          saltRegion,
          saltRegionLabel: SALT_REGION_CONFIG[saltRegion].label,
          weatherRegion,
          lookbackWeeks,
        },
        summary: {
          minWeek: minIsoDate(dates),
          maxWeek: maxIsoDate(dates),
          latestReportWeek: latest?.weekEnding ?? null,
          liveEiaChecked: maxIsoDate(eiaRows.map((row) => dateString(row.updated_at))),
          ensembleMae: model.ensembleMae,
          ensembleRmse: model.ensembleRmse,
          hitRate: model.hitRate,
          latestLooseTight: latest?.residualBcf ?? null,
          latestLooseTightZ: latest?.looseTightZScore ?? null,
          nextForecast: model.nextForecast,
          rangeLow: model.rangeLow,
          rangeHigh: model.rangeHigh,
          signalCoverage: model.signalCoverage,
          nextWeatherImpact: model.nextWeatherImpact,
          weeklyRowCount: model.records.length,
          eiaRowCount: eiaRows.length,
          saltRowCount: saltRows.length,
          weatherRowCount: weatherRows.length,
        },
        weeklySeries: model.records,
        expectedActualScatter: model.records.map((row) => ({
          weekEnding: row.weekEnding,
          year: row.year,
          x: row.modelPredictedChangeBcf,
          y: row.actualChangeBcf,
          isRecent: row.isRecent,
        })),
        weatherLooseTightScatter: model.records.map((row) => ({
          weekEnding: row.weekEnding,
          year: row.year,
          x: row.weatherImpactBcf,
          y: row.residualBcf,
          isRecent: row.isRecent,
        })),
        modelWeights: model.modelWeights,
        leadDrivers: model.leadDrivers,
        pendingQueue: model.pendingQueue,
        sourceStatus: {
          status: sourceStatus,
          warnings,
          lineage:
            "Derived local API walk-forward backtest from EIA salt working gas stock changes, promoted daily salt nominations, and observed WSI degree days; not a persisted legacy Salt Fc model artifact.",
          promotedSql: {
            path: promotedSql.promotedSqlPath,
            dbtModel: promotedSql.dbtModelPath,
            dbtCompiledSql: promotedSql.dbtCompiledPath,
          },
        },
      },
      headers: {
        "Cache-Control": CACHE_HEADER,
        "X-Salts-Forecast-Cache": "ORIGIN",
      },
      rowCount: eiaRows.length + saltRows.length + weatherRows.length,
      dataAsOf: latest?.weekEnding ?? null,
    };
  },
);

export function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
