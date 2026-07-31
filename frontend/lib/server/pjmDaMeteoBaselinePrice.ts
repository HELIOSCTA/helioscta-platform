import "server-only";

import { queryWithStatementTimeout } from "@/lib/server/db";
import {
  bindPromotedSql,
  pjmDaPromotedSqlRoot,
  readPjmDaPromotedManifest,
  readPjmDaPromotedSql,
  type PjmDaSqlArtifact,
} from "@/lib/server/pjmDaPromotedSql";

export type MeteoBaselineHorizon = "tomorrow" | "next3" | "full";
type MeteoBaselineSqlArtifact = Extract<
  PjmDaSqlArtifact,
  "available_target_dates" | "meteo_da_price_forecast_hourly" | "actual_da_lmps_hourly"
>;

interface AvailableDateRow {
  forecast_date: string;
}

interface ForecastSqlRow {
  as_of_date: unknown;
  date: unknown;
  hour_ending: unknown;
  forecast_period_start: unknown;
  da_price_deterministic: unknown;
  da_price_ens_average: unknown;
  da_price_ens_bottom: unknown;
  da_price_ens_top: unknown;
  det_forecast_execution_datetime_local: unknown;
  ens_forecast_execution_datetime_local: unknown;
  ens_member_values: unknown;
}

interface ActualSqlRow {
  date: unknown;
  hour_ending: unknown;
  region: string;
  lmp: unknown;
  lmp_system_energy_price: unknown;
  updated_at: unknown;
}

export interface MeteoBaselineHourlyRow {
  targetDate: string;
  asOfDate: string | null;
  hourEnding: number;
  forecastPeriodStart: string | null;
  daPriceDeterministic: number | null;
  daPriceEnsAverage: number | null;
  daPriceEnsBottom: number | null;
  daPriceEnsTop: number | null;
  ensQ05: number | null;
  ensP10: number | null;
  ensQ25: number | null;
  ensP50: number | null;
  ensQ75: number | null;
  ensP90: number | null;
  ensQ95: number | null;
  ensMemberCount: number;
  actualDaLmp: number | null;
  detError: number | null;
  absDetError: number | null;
  crps: number | null;
}

export interface MeteoBaselineDailyRow {
  targetDate: string;
  leadDays: number | null;
  hourCount: number;
  actualHourCount: number;
  detIssueLocal: string | null;
  ensIssueLocal: string | null;
  detFlat: number | null;
  detOnPeak: number | null;
  detOffPeak: number | null;
  ensAvgFlat: number | null;
  ensAvgOnPeak: number | null;
  ensAvgOffPeak: number | null;
  ensBottomOnPeak: number | null;
  ensTopOnPeak: number | null;
  ensWidthOnPeak: number | null;
  actualFlat: number | null;
  actualOnPeak: number | null;
  detErrorFlat: number | null;
  detErrorOnPeak: number | null;
}

export interface MeteoBaselinePayload {
  modelFamily: "meteo_baseline_price";
  modelName: "Meteologica Baseline Price";
  runtime: "frontend-typescript-promoted-dbt-sql";
  hub: "WESTERN HUB";
  horizon: MeteoBaselineHorizon;
  runDate: string;
  targetDate: string | null;
  cutoffUtc: string;
  leadDays: number | null;
  includeActuals: boolean;
  availableTargetDates: string[];
  daily: MeteoBaselineDailyRow[];
  hourly: MeteoBaselineHourlyRow[];
  summary: {
    targetDateCount: number;
    hourlyRowCount: number;
    latestIssueLocal: string | null;
    latestActualUpdate: string | null;
    promotedSqlRoot: string;
  };
  diagnostics: {
    sourceSqlArtifacts: Record<MeteoBaselineSqlArtifact, string>;
    sourceManifest: unknown;
    parameters: {
      horizon: MeteoBaselineHorizon;
      runDate: string;
      targetDate: string | null;
      cutoffUtc: string;
      limit: number;
      leadDays: number | null;
    };
  };
}

const DEFAULT_HUB = "WESTERN HUB" as const;
const EASTERN_TZ = "America/New_York";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ONPEAK_HOURS = new Set(Array.from({ length: 16 }, (_value, index) => index + 8));
const QUERY_TIMEOUT = {
  statementTimeoutMs: 50_000,
  queryTimeoutMs: 55_000,
};

function parseDate(value: string | null): string | null {
  return value && DATE_RE.test(value) ? value : null;
}

function parseHorizon(value: string | null): MeteoBaselineHorizon {
  if (value === "next3" || value === "next_3_days") return "next3";
  if (value === "full" || value === "full_prediction_window") return "full";
  return "tomorrow";
}

function parseLimit(value: string | null, horizon: MeteoBaselineHorizon): number {
  const fallback = horizon === "full" ? 60 : horizon === "next3" ? 3 : 1;
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 60));
}

function parseLeadDays(value: string | null, fallback: number | null): number | null {
  if (value === "none" || value === "null") return null;
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 30)) : fallback;
}

function parseBool(value: string | null, fallback: boolean): boolean {
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return fallback;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function localParts(date: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const output: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") output[part.type] = Number.parseInt(part.value, 10);
  }
  return output;
}

function todayInEastern(): string {
  const parts = localParts(new Date(), EASTERN_TZ);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + days);
  return new Date(utc).toISOString().slice(0, 10);
}

function diffDays(left: string, right: string): number {
  const leftMs = Date.parse(`${left}T00:00:00Z`);
  const rightMs = Date.parse(`${right}T00:00:00Z`);
  return Math.round((leftMs - rightMs) / 86_400_000);
}

function zonedLocalTimeToUtcIso(date: string, hour: number, minute: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcMs = targetAsUtc;

  for (let index = 0; index < 4; index += 1) {
    const parts = localParts(new Date(utcMs), EASTERN_TZ);
    const renderedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    utcMs -= renderedAsUtc - targetAsUtc;
  }

  return new Date(utcMs).toISOString();
}

function defaultCutoffUtc(runDate: string): string {
  return zonedLocalTimeToUtcIso(runDate, 10, 0);
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function toTimestamp(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  return text ? text.replace(" ", "T") : null;
}

function toNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map(toNumber).filter((item): item is number => item !== null);
  }
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [];
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => (item.toUpperCase() === "NULL" ? null : Number(item)))
    .filter((item): item is number => item !== null && Number.isFinite(item));
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function empiricalCrps(members: number[], actual: number | null): number | null {
  if (actual === null || members.length < 2) return null;
  const termOne =
    members.reduce((sum, member) => sum + Math.abs(member - actual), 0) / members.length;
  let pairwiseSum = 0;
  for (const left of members) {
    for (const right of members) {
      pairwiseSum += Math.abs(left - right);
    }
  }
  const pairwise = pairwiseSum / (members.length * members.length);
  return termOne - 0.5 * pairwise;
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value !== null);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function avgHours(
  rows: MeteoBaselineHourlyRow[],
  pick: (row: MeteoBaselineHourlyRow) => number | null,
  mode: "flat" | "onpeak" | "offpeak",
): number | null {
  return avg(
    rows
      .filter((row) => {
        if (mode === "flat") return true;
        const isOnPeak = ONPEAK_HOURS.has(row.hourEnding);
        return mode === "onpeak" ? isOnPeak : !isOnPeak;
      })
      .map(pick),
  );
}

function maxTimestamp(values: Array<string | null>): string | null {
  const filtered = values.filter((value): value is string => Boolean(value));
  if (!filtered.length) return null;
  return filtered.sort().at(-1) ?? null;
}

async function runArtifactSql<T>(
  artifact: MeteoBaselineSqlArtifact,
  params: Record<string, unknown>,
): Promise<T[]> {
  const { text, values } = bindPromotedSql(readPjmDaPromotedSql(artifact), params);
  return queryWithStatementTimeout<T>(text, values, QUERY_TIMEOUT);
}

async function availableTargetDates({
  startDate,
  cutoffUtc,
  limit,
}: {
  startDate: string;
  cutoffUtc: string;
  limit: number;
}): Promise<string[]> {
  const rows = await runArtifactSql<AvailableDateRow>("available_target_dates", {
    start_date: startDate,
    cutoff_utc: cutoffUtc,
    limit,
  });
  return rows.map((row) => row.forecast_date).filter((value) => DATE_RE.test(value));
}

async function forecastRows({
  targetDate,
  cutoffUtc,
  leadDays,
}: {
  targetDate: string;
  cutoffUtc: string;
  leadDays: number | null;
}): Promise<ForecastSqlRow[]> {
  return runArtifactSql<ForecastSqlRow>("meteo_da_price_forecast_hourly", {
    target_date: targetDate,
    cutoff_utc: cutoffUtc,
    lead_days: leadDays,
  });
}

async function actualRows(targetDate: string): Promise<ActualSqlRow[]> {
  return runArtifactSql<ActualSqlRow>("actual_da_lmps_hourly", {
    target_date: targetDate,
    hub: DEFAULT_HUB,
  });
}

function hourlyFromRows(
  targetDate: string,
  rows: ForecastSqlRow[],
  actuals: ActualSqlRow[],
): MeteoBaselineHourlyRow[] {
  const actualByHour = new Map<number, number | null>();
  for (const actual of actuals) {
    const hour = toNumber(actual.hour_ending);
    if (hour !== null) actualByHour.set(hour, toNumber(actual.lmp));
  }

  return rows
    .map((row) => {
      const hourEnding = toNumber(row.hour_ending);
      if (hourEnding === null) return null;
      const members = toNumberArray(row.ens_member_values);
      const deterministic = toNumber(row.da_price_deterministic);
      const actual = actualByHour.get(hourEnding) ?? null;
      const detError =
        deterministic !== null && actual !== null ? deterministic - actual : null;
      return {
        targetDate,
        asOfDate: toIsoDate(row.as_of_date),
        hourEnding,
        forecastPeriodStart: toTimestamp(row.forecast_period_start),
        daPriceDeterministic: deterministic,
        daPriceEnsAverage: toNumber(row.da_price_ens_average),
        daPriceEnsBottom: toNumber(row.da_price_ens_bottom),
        daPriceEnsTop: toNumber(row.da_price_ens_top),
        ensQ05: percentile(members, 0.05),
        ensP10: percentile(members, 0.1),
        ensQ25: percentile(members, 0.25),
        ensP50: percentile(members, 0.5),
        ensQ75: percentile(members, 0.75),
        ensP90: percentile(members, 0.9),
        ensQ95: percentile(members, 0.95),
        ensMemberCount: members.length,
        actualDaLmp: actual,
        detError,
        absDetError: detError === null ? null : Math.abs(detError),
        crps: empiricalCrps(members, actual),
      };
    })
    .filter((row): row is MeteoBaselineHourlyRow => row !== null)
    .sort((left, right) => left.hourEnding - right.hourEnding);
}

function dailyFromHourly({
  targetDate,
  runDate,
  rows,
  forecastSqlRows,
}: {
  targetDate: string;
  runDate: string;
  rows: MeteoBaselineHourlyRow[];
  forecastSqlRows: ForecastSqlRow[];
}): MeteoBaselineDailyRow {
  return {
    targetDate,
    leadDays: diffDays(targetDate, runDate),
    hourCount: rows.length,
    actualHourCount: rows.filter((row) => row.actualDaLmp !== null).length,
    detIssueLocal: maxTimestamp(
      forecastSqlRows.map((row) => toTimestamp(row.det_forecast_execution_datetime_local)),
    ),
    ensIssueLocal: maxTimestamp(
      forecastSqlRows.map((row) => toTimestamp(row.ens_forecast_execution_datetime_local)),
    ),
    detFlat: avgHours(rows, (row) => row.daPriceDeterministic, "flat"),
    detOnPeak: avgHours(rows, (row) => row.daPriceDeterministic, "onpeak"),
    detOffPeak: avgHours(rows, (row) => row.daPriceDeterministic, "offpeak"),
    ensAvgFlat: avgHours(rows, (row) => row.daPriceEnsAverage, "flat"),
    ensAvgOnPeak: avgHours(rows, (row) => row.daPriceEnsAverage, "onpeak"),
    ensAvgOffPeak: avgHours(rows, (row) => row.daPriceEnsAverage, "offpeak"),
    ensBottomOnPeak: avgHours(rows, (row) => row.daPriceEnsBottom, "onpeak"),
    ensTopOnPeak: avgHours(rows, (row) => row.daPriceEnsTop, "onpeak"),
    ensWidthOnPeak: avgHours(
      rows,
      (row) =>
        row.daPriceEnsBottom !== null && row.daPriceEnsTop !== null
          ? row.daPriceEnsTop - row.daPriceEnsBottom
          : null,
      "onpeak",
    ),
    actualFlat: avgHours(rows, (row) => row.actualDaLmp, "flat"),
    actualOnPeak: avgHours(rows, (row) => row.actualDaLmp, "onpeak"),
    detErrorFlat: avgHours(rows, (row) => row.detError, "flat"),
    detErrorOnPeak: avgHours(rows, (row) => row.detError, "onpeak"),
  };
}

function sourceSqlArtifacts(): Record<MeteoBaselineSqlArtifact, string> {
  return {
    available_target_dates: "available_target_dates.sql",
    meteo_da_price_forecast_hourly: "meteo_da_price_forecast_hourly.sql",
    actual_da_lmps_hourly: "actual_da_lmps_hourly.sql",
  };
}

export async function loadMeteoBaselinePayload(
  searchParams: URLSearchParams,
): Promise<MeteoBaselinePayload> {
  const horizon = parseHorizon(searchParams.get("horizon"));
  const runDate = parseDate(searchParams.get("runDate")) ?? todayInEastern();
  const explicitTargetDate = parseDate(searchParams.get("targetDate"));
  const cutoffUtc = searchParams.get("cutoffUtc") || defaultCutoffUtc(runDate);
  const limit = parseLimit(searchParams.get("limit"), horizon);
  const defaultLeadDays = horizon === "tomorrow" ? 1 : null;
  const leadDays = parseLeadDays(searchParams.get("leadDays"), defaultLeadDays);
  const includeActuals = parseBool(searchParams.get("includeActuals"), true);

  let targetDates: string[];
  let availableDates: string[] = [];
  if (explicitTargetDate) {
    targetDates = [explicitTargetDate];
    availableDates = targetDates;
  } else if (horizon === "tomorrow") {
    targetDates = [addDays(runDate, 1)];
    availableDates = targetDates;
  } else {
    availableDates = await availableTargetDates({
      startDate: addDays(runDate, 1),
      cutoffUtc,
      limit,
    });
    targetDates = horizon === "next3" ? availableDates.slice(0, 3) : availableDates;
  }

  const daily: MeteoBaselineDailyRow[] = [];
  const hourly: MeteoBaselineHourlyRow[] = [];
  const latestActualUpdates: Array<string | null> = [];

  for (const targetDate of targetDates) {
    const forecastSqlRows = await forecastRows({ targetDate, cutoffUtc, leadDays });
    const actualSqlRows = includeActuals ? await actualRows(targetDate) : [];
    latestActualUpdates.push(
      maxTimestamp(actualSqlRows.map((row) => toTimestamp(row.updated_at))),
    );
    const hourlyRows = hourlyFromRows(targetDate, forecastSqlRows, actualSqlRows);
    hourly.push(...hourlyRows);
    daily.push(
      dailyFromHourly({
        targetDate,
        runDate,
        rows: hourlyRows,
        forecastSqlRows,
      }),
    );
  }

  const latestIssueLocal = maxTimestamp([
    ...daily.map((row) => row.detIssueLocal),
    ...daily.map((row) => row.ensIssueLocal),
  ]);

  return {
    modelFamily: "meteo_baseline_price",
    modelName: "Meteologica Baseline Price",
    runtime: "frontend-typescript-promoted-dbt-sql",
    hub: DEFAULT_HUB,
    horizon,
    runDate,
    targetDate: explicitTargetDate,
    cutoffUtc,
    leadDays,
    includeActuals,
    availableTargetDates: availableDates,
    daily,
    hourly,
    summary: {
      targetDateCount: targetDates.length,
      hourlyRowCount: hourly.length,
      latestIssueLocal,
      latestActualUpdate: maxTimestamp(latestActualUpdates),
      promotedSqlRoot: pjmDaPromotedSqlRoot(),
    },
    diagnostics: {
      sourceSqlArtifacts: sourceSqlArtifacts(),
      sourceManifest: readPjmDaPromotedManifest(),
      parameters: {
        horizon,
        runDate,
        targetDate: explicitTargetDate,
        cutoffUtc,
        limit,
        leadDays,
      },
    },
  };
}
