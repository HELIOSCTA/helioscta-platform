import {
  addDays,
  assertCalendarDate,
  compareCalendarDates,
  formatCalendarDate,
  makeCalendarDate,
} from "./tradingCalendars/core";
import type { CalendarDate } from "./tradingCalendars/core";

export const FIXED_POWER_SEASONS = [
  "summer",
  "winter",
  "spring-shoulder",
  "fall-shoulder",
] as const;

export type FixedPowerSeason = (typeof FIXED_POWER_SEASONS)[number];
export type PowerSeasonSelection = "current" | FixedPowerSeason;
export type ShapeSummaryStatus = "ok" | "partial" | "missing";

interface SeasonOccurrence {
  season: FixedPowerSeason;
  startYear: number;
  start: CalendarDate;
  end: CalendarDate;
  baseLabel: string;
}

export interface ResolvedPowerSeasonWindow {
  requestedSeason: PowerSeasonSelection;
  season: FixedPowerSeason;
  label: string;
  asOfDate: CalendarDate;
  referenceDate: CalendarDate;
  currentStart: CalendarDate;
  currentEnd: CalendarDate;
  currentEndExclusive: CalendarDate;
  lastYearStart: CalendarDate;
  lastYearEnd: CalendarDate;
  lastYearEndExclusive: CalendarDate;
  seasonStartYear: number;
  isSeasonToDate: boolean;
}

export interface WeatherLoadPoint {
  date: CalendarDate;
  weatherValue: number | null;
  loadMw: number | null;
}

export interface WeatherNormalizedShapeSummary {
  status: ShapeSummaryStatus;
  normalizedCurrentMw: number | null;
  normalizedLastYearMw: number | null;
  deltaMw: number | null;
  deltaPct: number | null;
  currentFitDays: number;
  lastYearFitDays: number;
  evaluationDays: number;
  currentFitDegree: number | null;
  lastYearFitDegree: number | null;
  error: string | null;
}

interface FitPoint {
  x: number;
  y: number;
}

interface FitResult {
  coeffs: number[] | null;
  degree: number | null;
  fitDays: number;
}

const MIN_FIT_DAYS = 2;

function todayInTimeZoneIsoDate(timeZone = "America/New_York"): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return assertCalendarDate(`${year}-${month}-${day}`);
}

function calendarYear(date: CalendarDate): number {
  return Number(assertCalendarDate(date).slice(0, 4));
}

function calendarMonth(date: CalendarDate): number {
  return Number(assertCalendarDate(date).slice(5, 7));
}

function calendarDay(date: CalendarDate): number {
  return Number(assertCalendarDate(date).slice(8, 10));
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addYearsClamped(date: CalendarDate, years: number): CalendarDate {
  const year = calendarYear(date) + years;
  const month = calendarMonth(date);
  const day = Math.min(calendarDay(date), lastDayOfMonth(year, month));
  return makeCalendarDate(year, month, day);
}

function minCalendarDate(left: CalendarDate, right: CalendarDate): CalendarDate {
  return compareCalendarDates(left, right) <= 0 ? left : right;
}

function seasonOccurrence(season: FixedPowerSeason, startYear: number): SeasonOccurrence {
  if (season === "summer") {
    return {
      season,
      startYear,
      start: makeCalendarDate(startYear, 6, 1),
      end: makeCalendarDate(startYear, 9, 30),
      baseLabel: `Summer ${startYear}`,
    };
  }

  if (season === "spring-shoulder") {
    return {
      season,
      startYear,
      start: makeCalendarDate(startYear, 4, 1),
      end: makeCalendarDate(startYear, 5, 31),
      baseLabel: `Spring Shoulder ${startYear}`,
    };
  }

  if (season === "fall-shoulder") {
    return {
      season,
      startYear,
      start: makeCalendarDate(startYear, 10, 1),
      end: makeCalendarDate(startYear, 10, 31),
      baseLabel: `Fall Shoulder ${startYear}`,
    };
  }

  return {
    season,
    startYear,
    start: makeCalendarDate(startYear, 11, 1),
    end: makeCalendarDate(startYear + 1, 3, 31),
    baseLabel: `Winter ${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`,
  };
}

function seasonContaining(date: CalendarDate): SeasonOccurrence {
  const year = calendarYear(date);
  const month = calendarMonth(date);

  if (month >= 6 && month <= 9) return seasonOccurrence("summer", year);
  if (month >= 4 && month <= 5) return seasonOccurrence("spring-shoulder", year);
  if (month === 10) return seasonOccurrence("fall-shoulder", year);
  if (month >= 11) return seasonOccurrence("winter", year);
  return seasonOccurrence("winter", year - 1);
}

function latestOccurrenceStartingOnOrBefore(
  season: FixedPowerSeason,
  referenceDate: CalendarDate,
): SeasonOccurrence {
  const referenceYear = calendarYear(referenceDate);
  const candidates = [
    seasonOccurrence(season, referenceYear + 1),
    seasonOccurrence(season, referenceYear),
    seasonOccurrence(season, referenceYear - 1),
  ];

  return (
    candidates.find((candidate) => compareCalendarDates(candidate.start, referenceDate) <= 0) ??
    seasonOccurrence(season, referenceYear - 1)
  );
}

export function parsePowerSeasonSelection(value: string | null): PowerSeasonSelection {
  if (value === "summer" || value === "winter" || value === "spring-shoulder" || value === "fall-shoulder") {
    return value;
  }
  return "current";
}

export function resolvePowerSeasonWindow(
  requestedSeason: PowerSeasonSelection = "current",
  asOfDate: CalendarDate = todayInTimeZoneIsoDate(),
): ResolvedPowerSeasonWindow {
  const normalizedAsOfDate = assertCalendarDate(asOfDate);
  const referenceDate = addDays(normalizedAsOfDate, -1);
  const occurrence =
    requestedSeason === "current"
      ? seasonContaining(referenceDate)
      : latestOccurrenceStartingOnOrBefore(requestedSeason, referenceDate);
  const currentEnd = minCalendarDate(referenceDate, occurrence.end);
  const isSeasonToDate = compareCalendarDates(currentEnd, occurrence.end) < 0;

  return {
    requestedSeason,
    season: occurrence.season,
    label: `${occurrence.baseLabel}${isSeasonToDate ? " STTD" : ""}`,
    asOfDate: normalizedAsOfDate,
    referenceDate,
    currentStart: occurrence.start,
    currentEnd,
    currentEndExclusive: addDays(currentEnd, 1),
    lastYearStart: addYearsClamped(occurrence.start, -1),
    lastYearEnd: addYearsClamped(currentEnd, -1),
    lastYearEndExclusive: addDays(addYearsClamped(currentEnd, -1), 1),
    seasonStartYear: occurrence.startYear,
    isSeasonToDate,
  };
}

function toFitPoints(points: WeatherLoadPoint[]): FitPoint[] {
  return points
    .map((point) => ({ x: point.weatherValue, y: point.loadMw }))
    .filter(
      (point): point is FitPoint =>
        typeof point.x === "number" &&
        Number.isFinite(point.x) &&
        typeof point.y === "number" &&
        Number.isFinite(point.y),
    );
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

function solveQuadratic(points: FitPoint[]): number[] | null {
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

  return [
    determinant3([
      [sx2y, sx3, sx2],
      [sxy, sx2, sx],
      [sy, sx, n],
    ]) / det,
    determinant3([
      [sx4, sx2y, sx2],
      [sx3, sxy, sx],
      [sx2, sy, n],
    ]) / det,
    determinant3([
      [sx4, sx3, sx2y],
      [sx3, sx2, sxy],
      [sx2, sx, sy],
    ]) / det,
  ];
}

function solveLinear(points: FitPoint[]): number[] | null {
  const xAvg = mean(points.map((point) => point.x));
  const yAvg = mean(points.map((point) => point.y));
  if (xAvg === null || yAvg === null) return null;

  const numerator = points.reduce((sum, point) => sum + (point.x - xAvg) * (point.y - yAvg), 0);
  const denominator = points.reduce((sum, point) => sum + (point.x - xAvg) ** 2, 0);
  if (Math.abs(denominator) < 1e-9) return null;

  return [numerator / denominator, yAvg - (numerator / denominator) * xAvg];
}

function evaluatePolynomial(coeffs: number[], x: number): number {
  if (coeffs.length === 3) return coeffs[0] * x ** 2 + coeffs[1] * x + coeffs[2];
  return coeffs[0] * x + coeffs[1];
}

function fitAic(points: FitPoint[], coeffs: number[]): number {
  const mse = mean(points.map((point) => (point.y - evaluatePolynomial(coeffs, point.x)) ** 2));
  if (mse === null || mse <= 0) return Number.POSITIVE_INFINITY;
  return points.length * Math.log(mse) + 2 * coeffs.length;
}

function fitPoints(points: FitPoint[]): FitResult {
  const linear = points.length >= 2 ? solveLinear(points) : null;
  const quadratic = points.length >= 3 ? solveQuadratic(points) : null;
  const selected =
    linear && quadratic && fitAic(points, quadratic) < fitAic(points, linear)
      ? { coeffs: quadratic, degree: 2 }
      : linear
        ? { coeffs: linear, degree: 1 }
        : { coeffs: null, degree: null };

  return {
    ...selected,
    fitDays: points.length,
  };
}

export function buildWeatherNormalizedShapeSummary(
  currentPoints: WeatherLoadPoint[],
  lastYearPoints: WeatherLoadPoint[],
): WeatherNormalizedShapeSummary {
  const currentFitPoints = toFitPoints(currentPoints);
  const lastYearFitPoints = toFitPoints(lastYearPoints);
  const currentFit = fitPoints(currentFitPoints);
  const lastYearFit = fitPoints(lastYearFitPoints);
  const errors = [
    currentFit.fitDays < MIN_FIT_DAYS ? `CY has ${currentFit.fitDays} fit day${currentFit.fitDays === 1 ? "" : "s"}` : null,
    lastYearFit.fitDays < MIN_FIT_DAYS ? `LY has ${lastYearFit.fitDays} fit day${lastYearFit.fitDays === 1 ? "" : "s"}` : null,
  ].filter((value): value is string => value !== null);

  if (!currentFit.coeffs || !lastYearFit.coeffs || errors.length) {
    return {
      status: currentFit.fitDays === 0 && lastYearFit.fitDays === 0 ? "missing" : "partial",
      normalizedCurrentMw: null,
      normalizedLastYearMw: null,
      deltaMw: null,
      deltaPct: null,
      currentFitDays: currentFit.fitDays,
      lastYearFitDays: lastYearFit.fitDays,
      evaluationDays: currentFitPoints.length,
      currentFitDegree: currentFit.degree,
      lastYearFitDegree: lastYearFit.degree,
      error: errors.join("; "),
    };
  }

  const weatherPoints = currentFitPoints.map((point) => point.x);
  const normalizedCurrentMw = mean(weatherPoints.map((value) => evaluatePolynomial(currentFit.coeffs!, value)));
  const normalizedLastYearMw = mean(weatherPoints.map((value) => evaluatePolynomial(lastYearFit.coeffs!, value)));
  const deltaMw =
    normalizedCurrentMw !== null && normalizedLastYearMw !== null
      ? normalizedCurrentMw - normalizedLastYearMw
      : null;
  const deltaPct =
    deltaMw !== null && normalizedLastYearMw !== null && Math.abs(normalizedLastYearMw) > Number.EPSILON
      ? (deltaMw / normalizedLastYearMw) * 100
      : null;

  return {
    status: normalizedCurrentMw !== null && normalizedLastYearMw !== null ? "ok" : "missing",
    normalizedCurrentMw,
    normalizedLastYearMw,
    deltaMw,
    deltaPct,
    currentFitDays: currentFit.fitDays,
    lastYearFitDays: lastYearFit.fitDays,
    evaluationDays: weatherPoints.length,
    currentFitDegree: currentFit.degree,
    lastYearFitDegree: lastYearFit.degree,
    error: null,
  };
}

export function formatPowerSeasonDate(date: Date): CalendarDate {
  return assertCalendarDate(formatCalendarDate(date));
}
