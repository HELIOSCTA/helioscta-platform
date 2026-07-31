"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type Horizon = "tomorrow" | "next3" | "full";
type LoadState = "loading" | "ready" | "error";
type ModelPage = "overview" | "daForecast" | "inputs" | "replay";

interface DailyRow {
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

interface HourlyRow {
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

interface MeteoBaselinePayload {
  modelName: string;
  runtime: string;
  hub: "WESTERN HUB";
  horizon: Horizon;
  runDate: string;
  targetDate: string | null;
  cutoffUtc: string;
  leadDays: number | null;
  includeActuals: boolean;
  availableTargetDates: string[];
  daily: DailyRow[];
  hourly: HourlyRow[];
  summary: {
    targetDateCount: number;
    hourlyRowCount: number;
    latestIssueLocal: string | null;
    latestActualUpdate: string | null;
    promotedSqlRoot: string;
  };
  diagnostics: {
    sourceSqlArtifacts: Record<string, string>;
    parameters: Record<string, unknown>;
  };
  cache: {
    status: "hit" | "miss" | "stale";
    ttlSeconds: number;
    scope: string;
  };
}

type InputStatus = "OK" | "PARTIAL" | "PENDING" | "MISSING";

interface InputCoverageRow {
  label: string;
  contract: string;
  coverage: string;
  freshness: string;
  status: InputStatus;
  detail: string;
}

type BackendTableKind = "price" | "signed" | "absolute" | "percent" | "flag" | "crps";
type BackendTableCell = number | string | null;
type ForecastSeriesKey = "ensBand" | "det" | "ensAvg" | "actual";

interface BackendTableRow {
  key: string;
  targetDate: string;
  type: string;
  kind: BackendTableKind;
  values: BackendTableCell[];
  onPeak: BackendTableCell;
  offPeak: BackendTableCell;
  flat: BackendTableCell;
}

interface ForecastChartRow {
  hour: number;
  label: string;
  det: number | null;
  ensAvg: number | null;
  ensBottom: number | null;
  ensTop: number | null;
  ensRange: [number, number] | null;
  actual: number | null;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const HOURS = Array.from({ length: 24 }, (_value, index) => index + 1);
const ONPEAK_HOURS = HOURS.filter((hour) => hour >= 8 && hour <= 23);
const OFFPEAK_HOURS = HOURS.filter((hour) => !ONPEAK_HOURS.includes(hour));
const HORIZON_OPTIONS: Array<{ value: Horizon; label: string }> = [
  { value: "tomorrow", label: "Tomorrow" },
  { value: "next3", label: "Next 3 days" },
  { value: "full", label: "Full window" },
];
const MODEL_PAGE_OPTIONS: Array<{ value: ModelPage; label: string; detail: string }> = [
  { value: "overview", label: "Overview", detail: "Fundamentals dashboard" },
  { value: "daForecast", label: "DA Forecast", detail: "Western Hub LMP stack" },
  { value: "inputs", label: "Inputs", detail: "Promoted SQL coverage" },
  { value: "replay", label: "Replay", detail: "Prediction review" },
];
const FORECAST_SERIES_OPTIONS: Array<{
  key: ForecastSeriesKey;
  label: string;
  color: string;
}> = [
  { key: "ensBand", label: "ENS Band", color: "#155e75" },
  { key: "det", label: "Det", color: "#22d3ee" },
  { key: "ensAvg", label: "ENS Avg", color: "#f59e0b" },
  { key: "actual", label: "Actual", color: "#d946ef" },
];
const DEFAULT_FORECAST_SERIES: Record<ForecastSeriesKey, boolean> = {
  ensBand: true,
  det: true,
  ensAvg: true,
  actual: true,
};

function parseHorizon(value: string | null): Horizon {
  if (value === "next3" || value === "next_3_days") return "next3";
  if (value === "full" || value === "full_prediction_window") return "full";
  return "tomorrow";
}

function parseDate(value: string | null): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function fmtPrice(value: number | null, signed = false): string {
  if (value === null || !Number.isFinite(value)) return "--";
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function fmtStamp(value: string | null): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.replace("T", " ").slice(0, 16);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function fmtDateInput(value: string | null): string {
  return value ?? "";
}

function minutesOld(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 60_000));
}

function numericCells(values: BackendTableCell[]): number[] {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function meanCells(values: BackendTableCell[], hours: number[]): number | null {
  const scoped = numericCells(hours.map((hour) => values[hour - 1] ?? null));
  if (!scoped.length) return null;
  return scoped.reduce((sum, value) => sum + value, 0) / scoped.length;
}

function percentFlags(values: BackendTableCell[], hours: number[]): string | null {
  const scoped = hours
    .map((hour) => values[hour - 1])
    .filter((value): value is string => typeof value === "string");
  if (!scoped.length) return null;
  const passCount = scoped.filter((value) => value === "Y").length;
  return `${Math.round((passCount / scoped.length) * 100)}%`;
}

function rowByHour(rows: HourlyRow[]): Map<number, HourlyRow> {
  return new Map(rows.map((row) => [row.hourEnding, row]));
}

function buildNumericOutputRow({
  targetDate,
  type,
  kind = "price",
  rows,
  pick,
}: {
  targetDate: string;
  type: string;
  kind?: BackendTableKind;
  rows: HourlyRow[];
  pick: (row: HourlyRow) => number | null;
}): BackendTableRow {
  const byHour = rowByHour(rows);
  const values = HOURS.map((hour) => {
    const row = byHour.get(hour);
    return row ? pick(row) : null;
  });
  return {
    key: `${targetDate}-${type}`,
    targetDate,
    type,
    kind,
    values,
    onPeak: meanCells(values, ONPEAK_HOURS),
    offPeak: meanCells(values, OFFPEAK_HOURS),
    flat: meanCells(values, HOURS),
  };
}

function buildInBandOutputRow(targetDate: string, rows: HourlyRow[]): BackendTableRow {
  const byHour = rowByHour(rows);
  const values = HOURS.map((hour) => {
    const row = byHour.get(hour);
    if (
      !row ||
      row.actualDaLmp === null ||
      row.daPriceEnsBottom === null ||
      row.daPriceEnsTop === null
    ) {
      return null;
    }
    return row.actualDaLmp >= row.daPriceEnsBottom && row.actualDaLmp <= row.daPriceEnsTop
      ? "Y"
      : "N";
  });
  return {
    key: `${targetDate}-InBand`,
    targetDate,
    type: "InBand",
    kind: "flag",
    values,
    onPeak: percentFlags(values, ONPEAK_HOURS),
    offPeak: percentFlags(values, OFFPEAK_HOURS),
    flat: percentFlags(values, HOURS),
  };
}

function buildDispersionRows(targetDate: string, rows: HourlyRow[]): BackendTableRow[] {
  const p50ByHour = rowByHour(rows);
  return [
    buildNumericOutputRow({
      targetDate,
      type: "Width",
      kind: "absolute",
      rows,
      pick: (row) =>
        row.daPriceEnsBottom !== null && row.daPriceEnsTop !== null
          ? row.daPriceEnsTop - row.daPriceEnsBottom
          : null,
    }),
    buildNumericOutputRow({
      targetDate,
      type: "IQR",
      kind: "absolute",
      rows,
      pick: (row) =>
        row.ensQ25 !== null && row.ensQ75 !== null ? row.ensQ75 - row.ensQ25 : null,
    }),
    buildNumericOutputRow({
      targetDate,
      type: "Skew",
      kind: "signed",
      rows,
      pick: (row) =>
        row.daPriceEnsBottom !== null && row.daPriceEnsTop !== null && row.ensP50 !== null
          ? row.daPriceEnsTop - row.ensP50 - (row.ensP50 - row.daPriceEnsBottom)
          : null,
    }),
    buildNumericOutputRow({
      targetDate,
      type: "Delta P50",
      kind: "signed",
      rows,
      pick: (row) => {
        const previous = p50ByHour.get(row.hourEnding - 1)?.ensP50 ?? null;
        return row.ensP50 !== null && previous !== null ? row.ensP50 - previous : null;
      },
    }),
  ];
}

function sortByOnPeak(rows: BackendTableRow[]): BackendTableRow[] {
  return [...rows].sort((left, right) => {
    const leftValue = typeof left.onPeak === "number" ? left.onPeak : Number.POSITIVE_INFINITY;
    const rightValue = typeof right.onPeak === "number" ? right.onPeak : Number.POSITIVE_INFINITY;
    return leftValue - rightValue;
  });
}

function buildBandsRows(targetDate: string | null, rows: HourlyRow[]): BackendTableRow[] {
  if (!targetDate || rows.length === 0) return [];
  const bandRows = sortByOnPeak([
    buildNumericOutputRow({
      targetDate,
      type: "Det",
      rows,
      pick: (row) => row.daPriceDeterministic,
    }),
    buildNumericOutputRow({
      targetDate,
      type: "ENS Avg",
      rows,
      pick: (row) => row.daPriceEnsAverage,
    }),
    buildNumericOutputRow({
      targetDate,
      type: "ENS Bottom",
      rows,
      pick: (row) => row.daPriceEnsBottom,
    }),
    buildNumericOutputRow({
      targetDate,
      type: "ENS Top",
      rows,
      pick: (row) => row.daPriceEnsTop,
    }),
  ]);
  return [...bandRows, ...buildDispersionRows(targetDate, rows)];
}

function buildForecastVsActualRows(targetDate: string | null, rows: HourlyRow[]): BackendTableRow[] {
  if (!targetDate || rows.every((row) => row.actualDaLmp === null)) return [];
  return [
    buildNumericOutputRow({
      targetDate,
      type: "Actual",
      rows,
      pick: (row) => row.actualDaLmp,
    }),
    buildNumericOutputRow({
      targetDate,
      type: "Forecast",
      rows,
      pick: (row) => row.daPriceDeterministic,
    }),
    buildNumericOutputRow({
      targetDate,
      type: "Error",
      kind: "signed",
      rows,
      pick: (row) => row.detError,
    }),
    buildNumericOutputRow({
      targetDate,
      type: "|Err|",
      kind: "absolute",
      rows,
      pick: (row) => row.absDetError,
    }),
    buildNumericOutputRow({
      targetDate,
      type: "MAPE %",
      kind: "percent",
      rows,
      pick: (row) =>
        row.absDetError !== null && row.actualDaLmp !== null && Math.abs(row.actualDaLmp) > 1e-9
          ? (row.absDetError / Math.abs(row.actualDaLmp)) * 100
          : null,
    }),
  ];
}

function buildBandsVsActualRows(targetDate: string | null, rows: HourlyRow[]): BackendTableRow[] {
  if (!targetDate || rows.every((row) => row.actualDaLmp === null)) return [];
  return [
    buildNumericOutputRow({
      targetDate,
      type: "ENS Bottom",
      rows,
      pick: (row) => row.daPriceEnsBottom,
    }),
    buildNumericOutputRow({
      targetDate,
      type: "Actual",
      rows,
      pick: (row) => row.actualDaLmp,
    }),
    buildNumericOutputRow({
      targetDate,
      type: "ENS Top",
      rows,
      pick: (row) => row.daPriceEnsTop,
    }),
    buildInBandOutputRow(targetDate, rows),
    buildNumericOutputRow({
      targetDate,
      type: "CRPS",
      kind: "crps",
      rows,
      pick: (row) => row.crps ?? null,
    }),
  ];
}

function buildForecastChartRows(rows: HourlyRow[]): ForecastChartRow[] {
  const byHour = rowByHour(rows);
  return HOURS.map((hour) => {
    const row = byHour.get(hour);
    return {
      hour,
      label: `HE${hour}`,
      det: row?.daPriceDeterministic ?? null,
      ensAvg: row?.daPriceEnsAverage ?? null,
      ensBottom: row?.daPriceEnsBottom ?? null,
      ensTop: row?.daPriceEnsTop ?? null,
      ensRange:
        row?.daPriceEnsBottom !== null &&
        row?.daPriceEnsBottom !== undefined &&
        row?.daPriceEnsTop !== null &&
        row?.daPriceEnsTop !== undefined
          ? [row.daPriceEnsBottom, row.daPriceEnsTop]
          : null,
      actual: row?.actualDaLmp ?? null,
    };
  });
}

function forecastChartDomain(
  rows: ForecastChartRow[],
  visibleSeries: Record<ForecastSeriesKey, boolean>,
): [number | "auto", number | "auto"] {
  const values: number[] = [];
  for (const row of rows) {
    if (visibleSeries.ensBand && row.ensBottom !== null) values.push(row.ensBottom);
    if (visibleSeries.ensBand && row.ensTop !== null) values.push(row.ensTop);
    if (visibleSeries.det && row.det !== null) values.push(row.det);
    if (visibleSeries.ensAvg && row.ensAvg !== null) values.push(row.ensAvg);
    if (visibleSeries.actual && row.actual !== null) values.push(row.actual);
  }

  if (!values.length) return ["auto", "auto"];
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = maxValue - minValue;
  const padding = span > 0 ? Math.max(span * 0.08, 1) : Math.max(Math.abs(maxValue) * 0.05, 5);
  return [
    Math.floor((minValue - padding) * 10) / 10,
    Math.ceil((maxValue + padding) * 10) / 10,
  ];
}

function buildApiUrl({
  horizon,
  runDate,
  targetDate,
  includeActuals,
  limit,
  refreshToken,
}: {
  horizon: Horizon;
  runDate: string;
  targetDate: string;
  includeActuals: boolean;
  limit: number;
  refreshToken: number;
}): string {
  const params = new URLSearchParams({
    horizon,
    includeActuals: includeActuals ? "1" : "0",
  });
  if (runDate) params.set("runDate", runDate);
  if (targetDate) params.set("targetDate", targetDate);
  if (horizon === "full") params.set("limit", String(limit));
  if (refreshToken > 0) params.set("refresh", String(refreshToken));
  return `/api/pjm-da-meteo-baseline-price?${params.toString()}`;
}

function buildCacheKey({
  horizon,
  runDate,
  targetDate,
  includeActuals,
  limit,
}: {
  horizon: Horizon;
  runDate: string;
  targetDate: string;
  includeActuals: boolean;
  limit: number;
}): string {
  return [
    "api:pjm-da-model",
    horizon,
    runDate || "default-run-date",
    targetDate || "default-target-date",
    includeActuals ? "actuals" : "no-actuals",
    horizon === "full" ? limit : "bounded",
  ].join(":");
}

function ModelPageTab({
  selected,
  label,
  detail,
  onClick,
}: {
  selected: boolean;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md border px-5 py-3 text-left transition-colors ${
        selected
          ? "border-gray-700 bg-gray-800/80 text-gray-100 shadow-inner"
          : "border-transparent text-gray-500 hover:border-gray-800 hover:bg-gray-900/70 hover:text-gray-300"
      }`}
    >
      <span className="block text-sm font-semibold leading-tight">{label}</span>
      <span className="mt-0.5 block text-xs leading-tight text-gray-500">{detail}</span>
    </button>
  );
}

function KpiCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "teal" | "rose" | "green";
}) {
  const valueClass =
    tone === "teal"
      ? "text-cyan-300"
      : tone === "rose"
        ? "text-rose-300"
        : tone === "green"
          ? "text-emerald-300"
          : "text-gray-100";

  return (
    <div className="rounded-lg border border-gray-800 bg-[#070b15] p-4 shadow-xl shadow-black/20">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  );
}

function FieldLabel({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function inputStatusClass(status: InputStatus): string {
  if (status === "OK") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "PARTIAL") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (status === "PENDING") return "border-cyan-500/30 bg-cyan-500/10 text-cyan-200";
  return "border-rose-500/30 bg-rose-500/10 text-rose-200";
}

function InputStatusPill({ status }: { status: InputStatus }) {
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${inputStatusClass(
        status,
      )}`}
    >
      {status}
    </span>
  );
}

function PlaceholderPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="mt-5 rounded-xl border border-dashed border-gray-700 bg-[#0d1421] p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Placeholder</p>
      <h3 className="mt-2 text-lg font-bold text-gray-100">{title}</h3>
      <p className="mt-2 max-w-full text-sm text-gray-500">{detail}</p>
    </section>
  );
}

function formatPlainNumber(value: number, decimals: number, signed = false): string {
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  return `${sign}${Math.abs(value).toFixed(decimals)}`;
}

function formatBackendCell(
  row: BackendTableRow,
  value: BackendTableCell,
  {
    summary = false,
  }: {
    summary?: boolean;
  } = {},
): string {
  if (value === null || value === undefined) return "--";
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "--";
  if (row.kind === "percent") return `${value.toFixed(1)}%`;
  if (row.kind === "crps") return value.toFixed(3);
  if (row.kind === "signed") return formatPlainNumber(value, summary ? 2 : 1, true);
  return value.toFixed(summary ? 2 : 1);
}

function backendRowClass(type: string): string {
  if (type === "Actual") return "text-fuchsia-200";
  if (type === "Det" || type === "Forecast") return "text-cyan-200";
  if (type === "ENS Avg") return "text-amber-200";
  if (type === "ENS Bottom" || type === "ENS Top") return "text-orange-200";
  if (type === "Error") return "text-gray-200";
  return "text-gray-300";
}

function ForecastPriceChart({
  targetDate,
  rows,
}: {
  targetDate: string | null;
  rows: ForecastChartRow[];
}) {
  const [focused, setFocused] = useState(false);
  const [visibleSeries, setVisibleSeries] =
    useState<Record<ForecastSeriesKey, boolean>>(DEFAULT_FORECAST_SERIES);
  const hasRows = rows.some(
    (row) =>
      row.det !== null ||
      row.ensAvg !== null ||
      row.ensRange !== null ||
      row.actual !== null,
  );
  const yDomain = useMemo(
    () => forecastChartDomain(rows, visibleSeries),
    [rows, visibleSeries],
  );

  const toggleSeries = (key: ForecastSeriesKey) => {
    setVisibleSeries((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  return (
    <section
      className={`mt-4 rounded-xl border bg-[#0d1421] p-3 ${
        focused ? "border-cyan-500/40 shadow-2xl shadow-cyan-950/30" : "border-gray-800"
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-100">Forecast Profile</h3>
          <p className="mt-1 text-xs text-gray-500">
            {targetDate ?? "--"} | shaded hours are HE8-HE23
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FORECAST_SERIES_OPTIONS.map((series) => {
            const active = visibleSeries[series.key];
            return (
              <button
                key={series.key}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSeries(series.key)}
                className={`flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold transition-colors ${
                  active
                    ? "border-gray-700 bg-gray-950 text-gray-100"
                    : "border-gray-800 bg-gray-950/60 text-gray-600"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: active ? series.color : "#4b5563" }}
                />
                {series.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setFocused((value) => !value)}
            className="h-8 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20"
          >
            {focused ? "Exit Focus" : "Focus"}
          </button>
        </div>
      </div>
      <div
        className={`mt-3 rounded-lg border border-gray-800 bg-[#070b15] p-3 ${
          focused ? "h-[620px]" : "h-[360px]"
        }`}
      >
        {!hasRows ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            No forecast rows
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 18, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
              <ReferenceArea x1={8} x2={23} fill="#f59e0b" fillOpacity={0.08} />
              <XAxis
                dataKey="hour"
                type="number"
                domain={[1, 24]}
                ticks={HOURS}
                tickFormatter={(value) => `HE${value}`}
                stroke="#6b7280"
                tick={{ fill: "#9ca3af", fontSize: 10 }}
                axisLine={{ stroke: "#374151" }}
                tickLine={{ stroke: "#374151" }}
              />
              <YAxis
                domain={yDomain}
                stroke="#6b7280"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                tickFormatter={(value) => `$${value}`}
                axisLine={{ stroke: "#374151" }}
                tickLine={{ stroke: "#374151" }}
                width={54}
              />
              <Tooltip
                cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }}
                contentStyle={{
                  background: "#020617",
                  border: "1px solid #1f2937",
                  borderRadius: 8,
                  color: "#e5e7eb",
                }}
                labelFormatter={(value) => `HE${value}`}
                formatter={(value, name) => {
                  const labels: Record<string, string> = {
                    det: "Det",
                    ensAvg: "ENS Avg",
                    ensRange: "ENS Band",
                    actual: "Actual",
                  };
                  if (Array.isArray(value)) {
                    return [`${fmtPrice(value[0] as number)} - ${fmtPrice(value[1] as number)}`, labels[String(name)] ?? name];
                  }
                  return [typeof value === "number" ? fmtPrice(value) : value, labels[String(name)] ?? name];
                }}
              />
              {visibleSeries.ensBand && (
                <Area
                  type="monotone"
                  dataKey="ensRange"
                  name="ENS Band"
                  stroke="#0e7490"
                  fill="#155e75"
                  fillOpacity={0.22}
                  connectNulls
                />
              )}
              {visibleSeries.det && (
                <Line
                  type="monotone"
                  dataKey="det"
                  name="Det"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              )}
              {visibleSeries.ensAvg && (
                <Line
                  type="monotone"
                  dataKey="ensAvg"
                  name="ENS Avg"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              )}
              {visibleSeries.actual && (
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Actual"
                  stroke="#d946ef"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function BackendOutputTable({
  title,
  rows,
  emptyText,
  defaultOpen = true,
}: {
  title: string;
  rows: BackendTableRow[];
  emptyText: string;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="mt-4 rounded-xl border border-gray-800 bg-[#0d1421] p-3">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-base font-bold text-gray-100">{title}</span>
        <span className="rounded-md border border-gray-800 bg-gray-950 px-2 py-1 text-xs font-semibold text-gray-400">
          {isOpen ? "Hide" : "Show"}
        </span>
      </button>
      {!isOpen ? null : rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-gray-800 bg-[#070b15] px-4 py-6 text-sm text-gray-500">
          {emptyText}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-800 bg-[#070b15]">
          <table className="min-w-[1080px] w-full table-fixed text-left text-[11px] leading-tight">
            <colgroup>
              <col className="w-[76px]" />
              <col className="w-[76px]" />
              <col className="w-[52px]" />
              <col className="w-[52px]" />
              <col className="w-[52px]" />
              {HOURS.map((hour) => (
                <col key={hour} className="w-[32px]" />
              ))}
            </colgroup>
            <thead className="bg-gray-950/80 text-[10px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-950/95 px-2 py-2">Date</th>
                <th className="sticky left-[76px] z-10 bg-gray-950/95 px-2 py-2">Type</th>
                <th className="px-1 py-2 text-right text-amber-200">OnPk</th>
                <th className="px-1 py-2 text-right">OffPk</th>
                <th className="px-1 py-2 text-right">Flat</th>
                {HOURS.map((hour) => (
                  <th
                    key={hour}
                    className={`px-0.5 py-2 text-right ${
                      ONPEAK_HOURS.includes(hour) ? "bg-amber-500/10 text-amber-200" : ""
                    }`}
                  >
                    HE{hour}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.map((row) => (
                <tr key={row.key} className="hover:bg-gray-900/60">
                  <td className="sticky left-0 z-10 bg-[#070b15] px-2 py-1.5 font-semibold text-gray-400">
                    {row.targetDate}
                  </td>
                  <td
                    className={`sticky left-[76px] z-10 bg-[#070b15] px-2 py-1.5 font-semibold ${backendRowClass(
                      row.type,
                    )}`}
                  >
                    {row.type}
                  </td>
                  <td className="bg-amber-500/5 px-1 py-1.5 text-right tabular-nums text-amber-100">
                    {formatBackendCell(row, row.onPeak, { summary: true })}
                  </td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-gray-200">
                    {formatBackendCell(row, row.offPeak, { summary: true })}
                  </td>
                  <td className="px-1 py-1.5 text-right tabular-nums text-gray-200">
                    {formatBackendCell(row, row.flat, { summary: true })}
                  </td>
                  {row.values.map((value, index) => (
                    <td
                      key={`${row.key}-HE${index + 1}`}
                      className={`whitespace-nowrap px-0.5 py-1.5 text-right tabular-nums text-gray-300 ${
                        ONPEAK_HOURS.includes(index + 1) ? "bg-amber-500/5" : ""
                      }`}
                    >
                      {formatBackendCell(row, value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const controlClass =
  "h-10 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 text-sm font-semibold text-gray-100 outline-none focus:border-gray-500";

export default function PjmDaMeteoBaselinePrice() {
  const searchParams = useSearchParams();
  const [activePage, setActivePage] = useState<ModelPage>("daForecast");
  const [horizon, setHorizon] = useState<Horizon>(() => parseHorizon(searchParams.get("horizon")));
  const [runDate, setRunDate] = useState(() => parseDate(searchParams.get("runDate")));
  const [targetDate, setTargetDate] = useState(() => parseDate(searchParams.get("targetDate")));
  const [includeActuals, setIncludeActuals] = useState(true);
  const [limit, setLimit] = useState(60);
  const [refreshToken, setRefreshToken] = useState(0);
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<MeteoBaselinePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = useMemo(
    () =>
      buildApiUrl({
        horizon,
        runDate,
        targetDate,
        includeActuals,
        limit,
        refreshToken,
      }),
    [horizon, includeActuals, limit, refreshToken, runDate, targetDate],
  );
  const cacheKey = useMemo(
    () => buildCacheKey({ horizon, runDate, targetDate, includeActuals, limit }),
    [horizon, includeActuals, limit, runDate, targetDate],
  );

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setError(null);

    fetchJsonWithCache<MeteoBaselinePayload>({
      key: cacheKey,
      url: apiUrl,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: "no-store",
      forceRefresh: refreshToken > 0,
      persist: "session",
    })
      .then((payload) => {
        setData(payload);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load PJM DA model data");
        setState("error");
      });

    return () => controller.abort();
  }, [apiUrl, cacheKey, refreshToken]);

  const activeDay = data?.daily[0] ?? null;
  const activeDate = activeDay?.targetDate ?? (targetDate || null);
  const activeHourly = useMemo(
    () =>
      data?.hourly
        .filter((row) => !activeDate || row.targetDate === activeDate)
        .slice(0, 24) ?? [],
    [activeDate, data?.hourly],
  );
  const forecastRunLabel = `${fmtStamp(data?.summary.latestIssueLocal ?? null)} / ${
    activeDay?.actualHourCount ?? 0
  }/24 actual`;
  const oldMinutes = minutesOld(data?.summary.latestIssueLocal ?? null);
  const chartRows = useMemo(() => buildForecastChartRows(activeHourly), [activeHourly]);
  const deterministicHours = activeHourly.filter((row) => row.daPriceDeterministic !== null).length;
  const ensembleHours = activeHourly.filter((row) => row.ensMemberCount > 0).length;
  const actualHours = activeDay?.actualHourCount ?? activeHourly.filter((row) => row.actualDaLmp !== null).length;
  const bandsRows = useMemo(() => buildBandsRows(activeDate, activeHourly), [activeDate, activeHourly]);
  const forecastActualRows = useMemo(
    () => buildForecastVsActualRows(activeDate, activeHourly),
    [activeDate, activeHourly],
  );
  const bandsActualRows = useMemo(
    () => buildBandsVsActualRows(activeDate, activeHourly),
    [activeDate, activeHourly],
  );
  const availableDateCount = data?.availableTargetDates.length ?? 0;
  const inputCoverageRows = useMemo<InputCoverageRow[]>(() => {
    const hourlyStatus = (hours: number): InputStatus =>
      hours >= 24 ? "OK" : hours > 0 ? "PARTIAL" : state === "loading" ? "PENDING" : "MISSING";
    const actualStatusForInputs: InputStatus =
      !includeActuals ? "PENDING" : actualHours >= 24 ? "OK" : actualHours > 0 ? "PARTIAL" : "PENDING";

    return [
      {
        label: "Meteologica deterministic DA price",
        contract: "forecast target date x hour ending x Western Hub",
        coverage: `${deterministicHours}/24 hours`,
        freshness: fmtStamp(data?.summary.latestIssueLocal ?? null),
        status: hourlyStatus(deterministicHours),
        detail: "Latest deterministic run at or before the configured EPT cutoff.",
      },
      {
        label: "Meteologica ensemble DA price",
        contract: "forecast target date x hour ending x ensemble members",
        coverage: `${ensembleHours}/24 hours`,
        freshness: fmtStamp(activeDay?.ensIssueLocal ?? data?.summary.latestIssueLocal ?? null),
        status: hourlyStatus(ensembleHours),
        detail: "Quantile surface used for q05, q50, and q95 forecast bands.",
      },
      {
        label: "PJM DA LMP actuals",
        contract: "delivery date x hour ending x Western Hub",
        coverage: includeActuals ? `${actualHours}/24 hours` : "disabled",
        freshness: fmtStamp(data?.summary.latestActualUpdate ?? null),
        status: actualStatusForInputs,
        detail: "Matched posted DA prices for replay and model error columns.",
      },
      {
        label: "Available forecast dates",
        contract: "forecast target date eligibility from promoted SQL",
        coverage: `${availableDateCount} dates`,
        freshness: data?.runDate ?? "--",
        status: availableDateCount > 0 ? "OK" : state === "loading" ? "PENDING" : "MISSING",
        detail: "Candidate prediction window after the selected run date and cutoff.",
      },
    ];
  }, [
    actualHours,
    activeDay?.ensIssueLocal,
    availableDateCount,
    data?.runDate,
    data?.summary.latestActualUpdate,
    data?.summary.latestIssueLocal,
    deterministicHours,
    ensembleHours,
    includeActuals,
    state,
  ]);
  const modelLabel = "meteo_baseline_price";

  return (
    <div className="space-y-6">
      <div className="mb-2 grid w-full grid-cols-2 gap-1 rounded-lg border border-gray-700 bg-gray-900 p-1 lg:grid-cols-4">
        {MODEL_PAGE_OPTIONS.map((page) => (
          <ModelPageTab
            key={page.value}
            selected={activePage === page.value}
            label={page.label}
            detail={page.detail}
            onClick={() => setActivePage(page.value)}
          />
        ))}
      </div>

      <section className="rounded-xl border border-gray-800 bg-[#101622]/70 p-3 shadow-2xl shadow-black/30">
        <div className="rounded-xl border border-gray-800 bg-[#0d1421] p-4 sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-500">
                DA Model
              </p>
              <h2 className="mt-2 text-2xl font-bold text-gray-100">
                Trader Forecast Dashboard
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                {data?.hub ?? "WESTERN HUB"} for {activeDate ?? "--"} using {modelLabel}.
              </p>
            </div>
            <div className="w-fit rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              <p className="font-semibold text-amber-300">
                {state === "error" ? "error" : state === "loading" ? "loading" : "success"}
              </p>
              <p className="mt-0.5 text-amber-200/80">
                {oldMinutes === null ? data?.cache.status ?? "--" : `${oldMinutes} min old`}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-[1.1fr_1fr_0.8fr_1.4fr_auto] md:items-end">
            <FieldLabel label="Model">
              <select className={controlClass} value={modelLabel} onChange={() => undefined}>
                <option value={modelLabel}>{modelLabel}</option>
              </select>
            </FieldLabel>

            <FieldLabel label="Location">
              <select className={controlClass} value="WESTERN HUB" onChange={() => undefined}>
                <option value="WESTERN HUB">WESTERN HUB</option>
              </select>
            </FieldLabel>

            <FieldLabel label="Delivery Date">
              <input
                type="date"
                value={targetDate || fmtDateInput(activeDate)}
                onChange={(event) => setTargetDate(event.target.value)}
                className={controlClass}
              />
            </FieldLabel>

            <FieldLabel label="Forecast Run">
              <select className={controlClass} value="current" onChange={() => undefined}>
                <option value="current">{forecastRunLabel}</option>
              </select>
            </FieldLabel>

            <button
              type="button"
              onClick={() => setRefreshToken((value) => value + 1)}
              className="h-10 rounded-lg bg-gray-700 px-4 text-sm font-semibold text-gray-100 transition-colors hover:bg-gray-600"
            >
              Refresh
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <FieldLabel label="Window" className="w-44">
              <select
                value={horizon}
                onChange={(event) => {
                  setHorizon(event.target.value as Horizon);
                  setTargetDate("");
                }}
                className={controlClass}
              >
                {HORIZON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FieldLabel>

            {horizon === "full" && (
              <FieldLabel label="Days" className="w-28">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value))}
                  className={controlClass}
                />
              </FieldLabel>
            )}

            <FieldLabel label="Run Date" className="w-40">
              <input
                type="date"
                value={runDate}
                onChange={(event) => setRunDate(event.target.value)}
                className={controlClass}
              />
            </FieldLabel>

            <label className="flex h-10 items-center gap-2 rounded-lg border border-gray-700 bg-gray-950 px-3 text-sm font-semibold text-gray-100">
              <input
                type="checkbox"
                checked={includeActuals}
                onChange={(event) => setIncludeActuals(event.target.checked)}
                className="h-4 w-4 accent-cyan-500"
              />
              Actuals
            </label>
          </div>
        </div>

        {state === "error" && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        )}

        {activePage === "overview" && (
          <PlaceholderPanel
            title="Fundamentals Overview"
            detail="Reserved for the top-level PJM DA Model dashboard across load, weather, outages, gas, and forecast quality."
          />
        )}

        {activePage === "daForecast" && (
          <>
            <ForecastPriceChart targetDate={activeDate} rows={chartRows} />

            <BackendOutputTable
              title="ENS Bands ($/MWh)"
              rows={bandsRows}
              emptyText={state === "loading" ? "Loading" : "No Meteologica DA forecast rows for the selected target date."}
            />

            <BackendOutputTable
              title="Forecast vs Actuals"
              rows={forecastActualRows}
              emptyText={
                includeActuals
                  ? "No posted PJM DA LMP rows are available for the selected target date."
                  : "Actuals are disabled."
              }
            />

            <BackendOutputTable
              title="ENS Bands vs Actuals"
              rows={bandsActualRows}
              emptyText={
                includeActuals
                  ? "No posted PJM DA LMP rows are available for the selected target date."
                  : "Actuals are disabled."
              }
            />

            {data && data.daily.length > 1 && (
              <section className="mt-5 rounded-xl border border-gray-800 bg-[#0d1421] p-4 sm:p-5">
                <h3 className="text-base font-bold text-gray-100">Forward OnPeak Summary</h3>
                <div className="mt-4 overflow-x-auto rounded-lg border border-gray-800 bg-[#070b15]">
                  <table className="min-w-[820px] w-full text-left text-sm">
                    <thead className="bg-gray-950/80 text-[10px] uppercase tracking-wider text-gray-500">
                      <tr>
                        <th className="px-3 py-2">Target Date</th>
                        <th className="px-3 py-2 text-right">Lead</th>
                        <th className="px-3 py-2 text-right">Det OnPeak</th>
                        <th className="px-3 py-2 text-right">ENS Avg</th>
                        <th className="px-3 py-2 text-right">ENS Bottom</th>
                        <th className="px-3 py-2 text-right">ENS Top</th>
                        <th className="px-3 py-2">Det Issue</th>
                        <th className="px-3 py-2">ENS Issue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {data.daily.map((row) => (
                        <tr key={row.targetDate} className="hover:bg-gray-900/60">
                          <td className="px-3 py-2 font-semibold text-gray-200">{row.targetDate}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-400">{row.leadDays ?? "--"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmtPrice(row.detOnPeak)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmtPrice(row.ensAvgOnPeak)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtPrice(row.ensBottomOnPeak)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtPrice(row.ensTopOnPeak)}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{fmtStamp(row.detIssueLocal)}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{fmtStamp(row.ensIssueLocal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        {activePage === "inputs" && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard label="Forecast Dates" value={String(availableDateCount || "--")} detail={horizon} tone="teal" />
              <KpiCard label="Forecast Hours" value={`${activeHourly.length}/24`} detail={activeDate ?? "--"} />
              <KpiCard
                label="Actual Coverage"
                value={includeActuals ? `${actualHours}/24` : "Off"}
                detail="PJM posted DA"
              />
              <KpiCard
                label="Cutoff"
                value={data?.cutoffUtc ? `${data.cutoffUtc.slice(11, 16)} UTC` : "--"}
                detail="Default EPT cutoff"
              />
              <KpiCard label="Route Cache" value={data?.cache.status ?? "--"} detail={`${API_CACHE_TTL_MS / 60_000} min TTL`} tone="green" />
            </div>

            <section className="mt-5 rounded-xl border border-gray-800 bg-[#0d1421] p-4 sm:p-5">
              <h3 className="text-base font-bold text-gray-100">Input Coverage</h3>
              <div className="mt-4 overflow-x-auto rounded-lg border border-gray-800 bg-[#070b15]">
                <table className="min-w-[900px] w-full text-left text-sm">
                  <thead className="bg-gray-950/80 text-[10px] uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Input</th>
                      <th className="px-3 py-2">Contract</th>
                      <th className="px-3 py-2 text-right">Coverage</th>
                      <th className="px-3 py-2">Freshness</th>
                      <th className="px-3 py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {inputCoverageRows.map((row) => (
                      <tr key={row.label} className="hover:bg-gray-900/60">
                        <td className="px-3 py-2">
                          <p className="font-semibold text-gray-200">{row.label}</p>
                          <p className="mt-0.5 text-xs text-gray-600">{row.detail}</p>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">{row.contract}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-300">{row.coverage}</td>
                        <td className="px-3 py-2 text-gray-400">{row.freshness}</td>
                        <td className="px-3 py-2 text-right">
                          <InputStatusPill status={row.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="mt-5 grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
              <section className="rounded-xl border border-gray-800 bg-[#0d1421] p-4 sm:p-5">
                <h3 className="text-base font-bold text-gray-100">Available Target Dates</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(data?.availableTargetDates.slice(0, 18) ?? []).map((date) => (
                    <span
                      key={date}
                      className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
                        date === activeDate
                          ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
                          : "border-gray-800 bg-gray-950 text-gray-400"
                      }`}
                    >
                      {date}
                    </span>
                  ))}
                  {state === "loading" && <span className="text-sm text-gray-500">Loading</span>}
                  {state === "ready" && availableDateCount === 0 && (
                    <span className="text-sm text-gray-500">No target dates</span>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-gray-800 bg-[#0d1421] p-4 sm:p-5">
                <h3 className="text-base font-bold text-gray-100">Promoted SQL Inputs</h3>
                <div className="mt-4 overflow-hidden rounded-lg border border-gray-800 bg-[#070b15]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-950/80 text-[10px] uppercase tracking-wider text-gray-500">
                      <tr>
                        <th className="px-3 py-2">Runtime Query</th>
                        <th className="px-3 py-2">Frontend Use</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      <tr>
                        <td className="px-3 py-2 font-semibold text-gray-200">available_target_dates</td>
                        <td className="px-3 py-2 text-gray-500">Resolves tomorrow, next-three, and full-window delivery dates.</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-semibold text-gray-200">meteo_da_price_forecast_hourly</td>
                        <td className="px-3 py-2 text-gray-500">Builds deterministic and ensemble hourly forecast rows.</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-semibold text-gray-200">actual_da_lmps_hourly</td>
                        <td className="px-3 py-2 text-gray-500">Optionally joins posted PJM DA prices for comparison fields.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        )}

        {activePage === "replay" && (
          <PlaceholderPanel
            title="Replay"
            detail="Reserved for historical prediction review, matched posted prices, and model-error bucketing."
          />
        )}
      </section>
    </div>
  );
}
