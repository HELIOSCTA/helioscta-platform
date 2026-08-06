"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type WddRegion =
  | "CONUS"
  | "EAST"
  | "MIDWEST"
  | "SOUTHCENTRAL"
  | "MOUNTAIN"
  | "PACIFIC"
  | "GASCONSEAST"
  | "GASCONSWEST"
  | "GASPRODUCING";
type WddMetric =
  | "tdd"
  | "gas_hdd"
  | "gas_cdd"
  | "oil_hdd"
  | "oil_cdd"
  | "electric_hdd"
  | "electric_cdd"
  | "population_hdd"
  | "population_cdd";
type WddModel =
  | "WSI"
  | "GFS_OP"
  | "GFS_ENS"
  | "ECMWF_OP"
  | "ECMWF_ENS"
  | "AIFS"
  | "AIFS_ENS";
type WddCycle = "latest" | "00Z" | "12Z";
type WddPeriodMode = "dayBuckets" | "eiaWeeks";
type IssueStatus = "complete" | "partial" | "missing";
type NormalBasis = "10yr" | "30yr" | "mixed" | "missing";
type WddTableMetric = "forecast" | "normal" | "vsNormal";
type WddForecastChangeKey = "change12h" | "change24h" | "change48h" | "change72h";

interface ModelIssueSummary {
  model: WddModel;
  status: IssueStatus;
  selectedIssueKey: string | null;
  selectionMode: "latest_complete" | "latest_partial" | "none";
  sourceIssueAtUtc: string | null;
  scrapeRunAtUtc: string | null;
  sourceInitAtUtc: string | null;
  sourceInitCycle: string | null;
  modelRunCycle: string | null;
  effectiveCycle: string | null;
  cycleFallbackUsed: boolean;
  forecastStartDate: string | null;
  forecastEndDate: string | null;
  forecastDayCount: number;
  expectedDayCount: number;
  metricValueCount: number;
  expectedMetricValueCount: number;
  completenessPct: number;
  missingMetricNames: string[];
  updatedAt: string | null;
}

interface WddModelCell {
  forecast: number | null;
  normal: number | null;
  normal10yr: number | null;
  normal30yr: number | null;
  normalBasis: "10yr" | "30yr" | null;
  vsNormal: number | null;
  change6h: number | null;
  change12h: number | null;
  change18h: number | null;
  change24h: number | null;
  change30h: number | null;
  change36h: number | null;
  change48h: number | null;
  change72h: number | null;
  dayCount?: number;
}

interface WddDailyRow {
  forecastDate: string;
  dateLabel: string;
  forecastDay: number;
  dayOfWeek: string;
  models: Record<string, WddModelCell>;
}

interface WddPeriodRow {
  periodKey: string;
  periodLabel: string;
  dateRange: string;
  dayCount: number;
  models: Record<string, WddModelCell>;
}

type WddTableDataRow = {
  models: Record<string, WddModelCell>;
};

interface WddForecastChangesPayload {
  source: "weather.wsi_daily_weighted_degree_day_forecasts";
  filters: {
    region: WddRegion;
    metric: WddMetric;
    models: WddModel[];
    cycle: WddCycle;
    periodMode: WddPeriodMode;
  };
  allowedFilters: {
    regions: WddRegion[];
    metrics: WddMetric[];
    models: WddModel[];
    cycles: WddCycle[];
    periodModes: WddPeriodMode[];
  };
  normal: {
    preferredBasis: "10yr";
    actualBasis: NormalBasis;
    source: "table" | "observations" | "forecast_30yr" | "mixed" | "none";
    tableExists: boolean;
    rowCount: number;
    lookbackYears: number;
    normalWindowEndYear: number | null;
    minSampleYearCount: number | null;
    maxSampleYearCount: number | null;
    updatedAt: string | null;
  };
  modelIssues: ModelIssueSummary[];
  dailyRows: WddDailyRow[];
  periodRows: WddPeriodRow[];
  rowCounts: {
    rawRows: number;
    dailyRows: number;
    periodRows: number;
    selectedModelCount: number;
  };
  asOf: {
    updatedAt: string | null;
    latestIssueAt: string | null;
  };
}

interface WddForecastRevisionTarget {
  key: string;
  label: string;
  dateRange: string;
  dayCount: number;
  forecastDates: string[];
  selectedForecast: number | null;
}

interface WddForecastRevisionPoint {
  targetKey: string;
  sourceIssueKey: string;
  issueSortAtUtc: string | null;
  sourceIssueAtUtc: string | null;
  scrapeRunAtUtc: string | null;
  sourceInitAtUtc: string | null;
  sourceInitCycle: string | null;
  modelRunCycle: string | null;
  effectiveCycle: string | null;
  cycleFallbackUsed: boolean;
  selected: boolean;
  forecast: number | null;
  coveredDayCount: number;
  expectedDayCount: number;
  coverageDates: string[];
}

interface WddForecastRevisionPayload {
  source: "weather.wsi_daily_weighted_degree_day_forecasts";
  filters: {
    region: WddRegion;
    metric: WddMetric;
    model: WddModel;
    models: WddModel[];
    cycle: WddCycle;
    periodMode: WddPeriodMode;
  };
  selectedIssue: ModelIssueSummary;
  targetMode: "dailyDates" | "eiaWeeks";
  targets: WddForecastRevisionTarget[];
  revisionsByTarget: Record<string, WddForecastRevisionPoint[]>;
  rowCounts: {
    rawRows: number;
    issueCount: number;
    targetCount: number;
  };
  asOf: {
    updatedAt: string | null;
    latestIssueAt: string | null;
  };
}

interface ForecastRevisionRequest {
  model: WddModel;
  periodMode: WddPeriodMode;
}

interface RevisionIssueSeries {
  issueKey: string;
  dataKey: string;
  color: string;
  issueLabel: string;
  issueTimeLabel: string;
  issueStampAtUtc: string | null;
  cycleLabel: string;
  issueSortAtUtc: string | null;
  selected: boolean;
}

interface RevisionComparisonMeta {
  label: string;
  sortOrder: number;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
function seasonalDefaultMetric(): WddMetric {
  const month = new Date().getUTCMonth() + 1;
  return month >= 4 && month <= 10 ? "population_cdd" : "gas_hdd";
}

const DEFAULT_METRIC = seasonalDefaultMetric();
const DEFAULT_MODELS: WddModel[] = [
  "WSI",
  "GFS_OP",
  "GFS_ENS",
  "ECMWF_OP",
  "ECMWF_ENS",
  "AIFS",
  "AIFS_ENS",
];
const REGION_OPTIONS: WddRegion[] = [
  "CONUS",
  "EAST",
  "MIDWEST",
  "SOUTHCENTRAL",
  "MOUNTAIN",
  "PACIFIC",
  "GASCONSEAST",
  "GASCONSWEST",
  "GASPRODUCING",
];
const METRIC_OPTIONS: Array<{ value: WddMetric; label: string }> = [
  { value: "tdd", label: "TDD" },
  { value: "population_cdd", label: "Pop CDD" },
  { value: "gas_hdd", label: "Gas HDD" },
  { value: "gas_cdd", label: "Gas CDD" },
  { value: "oil_hdd", label: "Oil HDD" },
  { value: "oil_cdd", label: "Oil CDD" },
  { value: "electric_hdd", label: "Electric HDD" },
  { value: "electric_cdd", label: "Electric CDD" },
  { value: "population_hdd", label: "Pop HDD" },
];
const CYCLE_OPTIONS: Array<{ value: WddCycle; label: string }> = [
  { value: "latest", label: "Latest" },
  { value: "00Z", label: "00Z First" },
  { value: "12Z", label: "12Z Other" },
];
const WSI_PERIOD_MODE: WddPeriodMode = "eiaWeeks";
const REGION_FILTER_OPTIONS = REGION_OPTIONS.map((region) => ({
  value: region,
  label: region,
}));
const MODEL_OPTIONS = DEFAULT_MODELS.map((model) => ({ value: model, label: model }));
const DEFAULT_SHOW_VS_NORMAL = false;
const DEFAULT_SHOW_TABLE_GRADIENT = true;
const DEFAULT_SHOW_FORECAST_CHANGES = false;
const REVISION_DEFAULT_HOUR_OFFSETS = [0, 12, 24, 48, 72] as const;
const FORECAST_CHANGE_FIELDS: Array<{ key: WddForecastChangeKey; label: string }> = [
  { key: "change12h", label: "12" },
  { key: "change24h", label: "24" },
  { key: "change48h", label: "48" },
  { key: "change72h", label: "72" },
];

function modelTableMetrics(
  vsNormalLabel: string,
  showVsNormal: boolean,
): Array<{
  key: WddTableMetric;
  label: string;
  signed: boolean;
}> {
  return [
    { key: "forecast", label: "Forecast", signed: false },
    ...(showVsNormal
      ? [{ key: "vsNormal" as const, label: vsNormalLabel, signed: true }]
      : []),
  ];
}

function buildApiUrl({
  region,
  metric,
  models,
  cycle,
  periodMode,
  refresh,
}: {
  region: WddRegion;
  metric: WddMetric;
  models: WddModel[];
  cycle: WddCycle;
  periodMode: WddPeriodMode;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({
    region,
    metric,
    models: models.join(","),
    cycle,
    periodMode,
  });
  if (refresh) params.set("refresh", "1");
  return `/api/weather/wsi-wdd-forecast-changes?${params.toString()}`;
}

function buildRevisionApiUrl({
  region,
  metric,
  model,
  cycle,
  periodMode,
  refresh,
}: {
  region: WddRegion;
  metric: WddMetric;
  model: WddModel;
  cycle: WddCycle;
  periodMode: WddPeriodMode;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({
    region,
    metric,
    models: model,
    cycle,
    periodMode,
    revisions: "1",
  });
  if (refresh) params.set("refresh", "1");
  return `/api/weather/wsi-wdd-forecast-changes?${params.toString()}`;
}

function buildCacheKey({
  region,
  metric,
  models,
  cycle,
  periodMode,
}: {
  region: WddRegion;
  metric: WddMetric;
  models: WddModel[];
  cycle: WddCycle;
  periodMode: WddPeriodMode;
}): string {
  return [
    "api:wsi-wdd-forecast-changes",
    region,
    metric,
    models.join("|"),
    cycle,
    periodMode,
  ].join(":");
}

function buildRevisionCacheKey({
  region,
  metric,
  model,
  cycle,
  periodMode,
}: {
  region: WddRegion;
  metric: WddMetric;
  model: WddModel;
  cycle: WddCycle;
  periodMode: WddPeriodMode;
}): string {
  return [
    "api:wsi-wdd-forecast-revisions",
    region,
    metric,
    model,
    cycle,
    periodMode,
  ].join(":");
}

function fmtNumber(value: number | null | undefined, signed = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  const rounded = Math.round(value * 10) / 10;
  const prefix = signed && rounded > 0 ? "+" : "";
  return `${prefix}${rounded.toLocaleString(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}`;
}

function fmtStamp(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value.replace("T", " ").slice(0, 16);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

const UTC_MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function fmtUtcIssueStamp(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value.replace("T", " ").slice(0, 16);

  const month = UTC_MONTH_LABELS[parsed.getUTCMonth()] ?? "";
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const hour = String(parsed.getUTCHours()).padStart(2, "0");
  const minute = String(parsed.getUTCMinutes()).padStart(2, "0");
  const time = minute === "00" ? `${hour}Z` : `${hour}:${minute}Z`;
  return `${month} ${day} ${time}`;
}

function revisionRunTimeLabel(stamp: string | null, cycleLabel: string): string {
  const stampLabel = fmtUtcIssueStamp(stamp);
  const canonicalCycle = cycleLabel.replace(" fallback", "");
  if (canonicalCycle === "--" || stampLabel.endsWith(` ${canonicalCycle}`)) {
    return stampLabel;
  }
  return `${stampLabel} / ${cycleLabel}`;
}

function normalBasisLabel(basis: NormalBasis | null | undefined): string {
  if (basis === "10yr") return "10yr";
  if (basis === "30yr") return "30yr Fallback";
  if (basis === "mixed") return "Mixed Norm";
  return "Normal";
}

function normalMetricLabel(basis: NormalBasis | null | undefined): string {
  const label = normalBasisLabel(basis);
  return label === "Normal" ? "Normal" : `${label} Norm`;
}

function vsNormalMetricLabel(basis: NormalBasis | null | undefined): string {
  const label = normalBasisLabel(basis);
  return label === "Normal" ? "Vs Normal" : `Vs ${label}`;
}

function normalSourceLabel(normal: WddForecastChangesPayload["normal"] | null | undefined): string {
  if (!normal) return "10yr normals";
  if (normal.source === "table") return "10yr table";
  if (normal.source === "observations") return "10yr observed";
  if (normal.source === "forecast_30yr") return "30yr fallback";
  if (normal.source === "mixed") return "mixed normals";
  return "normals missing";
}

function issueAgeHours(issue: ModelIssueSummary): number | null {
  const stamp = issue.sourceIssueAtUtc ?? issue.scrapeRunAtUtc;
  if (!stamp) return null;
  const ms = Date.parse(stamp);
  return Number.isFinite(ms) ? (Date.now() - ms) / 3_600_000 : null;
}

function displayStatus(issue: ModelIssueSummary): "complete" | "partial" | "missing" | "stale" {
  if (issue.status === "missing") return "missing";
  if (issue.status === "partial") return "partial";
  const ageHours = issueAgeHours(issue);
  return ageHours !== null && ageHours > 30 ? "stale" : "complete";
}

function statusClass(issue: ModelIssueSummary): string {
  const status = displayStatus(issue);
  if (status === "complete") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  if (status === "partial") return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  if (status === "stale") return "border-orange-500/30 bg-orange-500/10 text-orange-100";
  return "border-gray-700 bg-gray-950/60 text-gray-500";
}

function statusLabel(issue: ModelIssueSummary): string {
  const status = displayStatus(issue);
  if (status === "complete") return "Complete";
  if (status === "partial") return "Partial";
  if (status === "stale") return "Stale";
  return "Missing";
}

function signedClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "text-gray-600";
  if (value > 0) return "text-amber-200";
  if (value < 0) return "text-sky-200";
  return "text-gray-400";
}

function forecastChangeChipClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "border-gray-800 bg-gray-950/70 text-gray-600";
  }
  if (value > 0) return "border-emerald-500/30 bg-emerald-500/15 text-emerald-100";
  if (value < 0) return "border-red-500/35 bg-red-500/15 text-red-100";
  return "border-gray-700 bg-gray-900/80 text-gray-300";
}

function temperatureDeltaCellStyle(value: number | null | undefined): CSSProperties | undefined {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return undefined;
  }
  const magnitude = Math.min(1, Math.abs(value) / 8);
  const alpha = 0.18 + magnitude * 0.62;
  const softAlpha = 0.08 + magnitude * 0.22;
  const color = value > 0 ? "127, 29, 29" : "30, 64, 175";
  return {
    background: `linear-gradient(90deg, rgba(${color}, ${softAlpha}) 0%, rgba(${color}, ${alpha}) 100%)`,
    color: value > 0 ? "#fee2e2" : "#dbeafe",
  };
}

function tableMetricValue(cell: WddModelCell | undefined, metric: WddTableMetric): number | null {
  if (!cell) return null;
  if (metric === "forecast") return cell.forecast;
  if (metric === "normal") return cell.normal;
  if (metric === "vsNormal") return cell.vsNormal;
  return null;
}

function sumTableValues(values: Array<number | null | undefined>): number | null {
  const finiteValues = values.filter(
    (value): value is number => value !== null && value !== undefined && Number.isFinite(value),
  );
  if (!finiteValues.length) return null;
  return Math.round(finiteValues.reduce((total, value) => total + value, 0) * 10) / 10;
}

function tableNormalTotal(rows: WddTableDataRow[], models: WddModel[]): number | null {
  return sumTableValues(rows.map((row) => firstModelValue(models, row.models, (cell) => cell.normal)));
}

function aggregateModelTableCell(rows: WddTableDataRow[], model: WddModel): WddModelCell {
  const cells = rows.map((row) => row.models[model]);
  return {
    forecast: sumTableValues(cells.map((cell) => cell?.forecast)),
    normal: sumTableValues(cells.map((cell) => cell?.normal)),
    normal10yr: sumTableValues(cells.map((cell) => cell?.normal10yr)),
    normal30yr: sumTableValues(cells.map((cell) => cell?.normal30yr)),
    normalBasis: null,
    vsNormal: sumTableValues(cells.map((cell) => cell?.vsNormal)),
    change6h: sumTableValues(cells.map((cell) => cell?.change6h)),
    change12h: sumTableValues(cells.map((cell) => cell?.change12h)),
    change18h: sumTableValues(cells.map((cell) => cell?.change18h)),
    change24h: sumTableValues(cells.map((cell) => cell?.change24h)),
    change30h: sumTableValues(cells.map((cell) => cell?.change30h)),
    change36h: sumTableValues(cells.map((cell) => cell?.change36h)),
    change48h: sumTableValues(cells.map((cell) => cell?.change48h)),
    change72h: sumTableValues(cells.map((cell) => cell?.change72h)),
  };
}

function ForecastChangeChips({ cell }: { cell: WddModelCell | undefined }) {
  const availableFields = FORECAST_CHANGE_FIELDS.map((field) => ({
    ...field,
    value: cell?.[field.key] ?? null,
  })).filter(({ value }) => value !== null && value !== undefined && Number.isFinite(value));

  if (!availableFields.length) return null;

  return (
    <div className="mt-0.5 flex flex-wrap justify-end gap-0.5">
      {availableFields.map((field) => {
        const { value } = field;
        return (
          <span
            key={field.key}
            className={`inline-flex items-center justify-between gap-1 rounded border px-0.5 py-0 text-[9px] font-semibold leading-[11px] tabular-nums ${forecastChangeChipClass(
              value,
            )}`}
            title={`${field.label}h change ${fmtNumber(value, true)}`}
          >
            <span className="text-gray-400">{field.label}</span>
            <span>{fmtNumber(value, true)}</span>
          </span>
        );
      })}
    </div>
  );
}

function TableMetricCellValue({
  cell,
  metric,
  value,
  signed,
  showForecastChanges,
}: {
  cell: WddModelCell | undefined;
  metric: WddTableMetric;
  value: number | null;
  signed: boolean;
  showForecastChanges: boolean;
}) {
  if (metric !== "forecast" || !showForecastChanges) {
    return <span className="block text-right leading-3">{fmtNumber(value, signed)}</span>;
  }

  return (
    <div className="leading-3">
      <div className="text-right text-[11px] font-semibold leading-3 text-gray-100">
        {fmtNumber(value)}
      </div>
      <ForecastChangeChips cell={cell} />
    </div>
  );
}

function sameModelSelection(left: WddModel[], right: WddModel[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((model, index) => model === right[index]);
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `${Math.round(value)}%`;
}

function issueStamp(issue: ModelIssueSummary): string {
  return fmtStamp(issue.sourceIssueAtUtc ?? issue.scrapeRunAtUtc);
}

function issueCycleLabel(issue: ModelIssueSummary): string {
  const cycle = issue.effectiveCycle ?? issue.modelRunCycle ?? issue.sourceInitCycle ?? "--";
  return issue.cycleFallbackUsed ? `${cycle} fallback` : cycle;
}

function issueTitle(issue: ModelIssueSummary): string {
  const parts = [
    `${statusLabel(issue)} ${fmtPct(issue.completenessPct)}`,
    `Days ${issue.forecastDayCount}/${issue.expectedDayCount}`,
    `Values ${issue.metricValueCount}/${issue.expectedMetricValueCount}`,
    `Cycle ${issueCycleLabel(issue)}`,
    `Issue ${issueStamp(issue)}`,
    issue.forecastStartDate && issue.forecastEndDate
      ? `Forecast ${issue.forecastStartDate} to ${issue.forecastEndDate}`
      : null,
    issue.missingMetricNames.length
      ? `Missing ${issue.missingMetricNames.join(", ")}`
      : null,
    issue.selectedIssueKey ? `Issue key ${issue.selectedIssueKey}` : null,
  ];
  return parts.filter((part): part is string => Boolean(part)).join(" | ");
}

function ModelIssueCell({
  model,
  issue,
}: {
  model: WddModel;
  issue: ModelIssueSummary | undefined;
}) {
  if (!issue) {
    return (
      <div className="space-y-1">
        <span className="block font-semibold">{model}</span>
        <span className="inline-flex rounded border border-gray-700 bg-gray-950/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
          Missing issue
        </span>
      </div>
    );
  }

  const missingCount = issue.missingMetricNames.length;

  return (
    <div className="min-w-0" title={issueTitle(issue)}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-semibold">{model}</span>
        <span
          className={`inline-flex shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${statusClass(issue)}`}
        >
          {statusLabel(issue)} {fmtPct(issue.completenessPct)}
        </span>
      </div>
      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] leading-3 text-gray-500">
        <span className="max-w-[74px] truncate">{issueCycleLabel(issue)}</span>
        <span className="whitespace-nowrap">{issueStamp(issue)}</span>
        <span className="whitespace-nowrap">
          {issue.forecastDayCount}/{issue.expectedDayCount}d
        </span>
        <span className="whitespace-nowrap text-gray-600">
          {issue.metricValueCount}/{issue.expectedMetricValueCount}v
        </span>
        {missingCount > 0 && (
          <span
            className="whitespace-nowrap text-amber-300"
            title={`Missing ${issue.missingMetricNames.join(", ")}`}
          >
            miss {missingCount}
          </span>
        )}
      </div>
    </div>
  );
}

function ControlCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="w-full max-w-none rounded-lg border border-sky-950/70 bg-[#0d121b] p-3 shadow-xl shadow-black/20 ring-1 ring-white/[0.02] sm:p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function FilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
              active
                ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
                : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ModelFilterPills({
  selected,
  onChange,
}: {
  selected: WddModel[];
  onChange: (models: WddModel[]) => void;
}) {
  const allSelected = sameModelSelection(selected, DEFAULT_MODELS);

  const toggleModel = (model: WddModel) => {
    const selectedSet = new Set(selected);
    if (selectedSet.has(model)) {
      selectedSet.delete(model);
    } else {
      selectedSet.add(model);
    }
    const nextModels = DEFAULT_MODELS.filter((option) => selectedSet.has(option));
    onChange(nextModels.length > 0 ? nextModels : ["WSI"]);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
        Models
      </span>
      <button
        type="button"
        aria-pressed={allSelected}
        onClick={() => onChange(DEFAULT_MODELS)}
        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
          allSelected
            ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
            : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
        }`}
      >
        All Models
      </button>
      {MODEL_OPTIONS.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => toggleModel(option.value)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
              active
                ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
                : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function TableDisplayToggles({
  showVsNormal,
  vsNormalLabel,
  showForecastChanges,
  showGradient,
  onToggleVsNormal,
  onToggleForecastChanges,
  onToggleGradient,
}: {
  showVsNormal: boolean;
  vsNormalLabel: string;
  showForecastChanges: boolean;
  showGradient: boolean;
  onToggleVsNormal: () => void;
  onToggleForecastChanges: () => void;
  onToggleGradient: () => void;
}) {
  const rowOptions = [
    {
      key: "vsNormal",
      label: vsNormalLabel,
      active: showVsNormal,
      onClick: onToggleVsNormal,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
        Rows
      </span>
      {rowOptions.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={option.active}
          onClick={option.onClick}
          className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
            option.active
              ? "border-sky-500/45 bg-sky-500/10 text-sky-100"
              : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
          }`}
        >
          {option.label}
        </button>
      ))}
      <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        Forecast
      </span>
      <button
        type="button"
        aria-pressed={showForecastChanges}
        onClick={onToggleForecastChanges}
        className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
          showForecastChanges
            ? "border-sky-500/45 bg-sky-500/10 text-sky-100"
            : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
        }`}
      >
        Changes
      </button>
      <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        Style
      </span>
      <button
        type="button"
        aria-pressed={showGradient}
        onClick={onToggleGradient}
        className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
          showGradient
            ? "border-sky-500/45 bg-sky-500/10 text-sky-100"
            : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
        }`}
      >
        Gradient
      </button>
    </div>
  );
}

function firstModelValue(
  models: WddModel[],
  cells: Record<string, WddModelCell>,
  getter: (cell: WddModelCell) => number | null,
): number | null {
  for (const model of models) {
    const cell = cells[model];
    if (!cell) continue;
    const value = getter(cell);
    if (value !== null && value !== undefined && Number.isFinite(value)) return value;
  }
  return null;
}

function revisionPointIssueStamp(point: WddForecastRevisionPoint): string | null {
  return point.sourceInitAtUtc ?? point.sourceIssueAtUtc ?? point.scrapeRunAtUtc ?? point.issueSortAtUtc;
}

function revisionPointCycleLabel(point: WddForecastRevisionPoint, selectedCycle?: WddCycle): string {
  const cycle = point.effectiveCycle ?? point.modelRunCycle ?? point.sourceInitCycle ?? "--";
  if (cycle === "--" && selectedCycle && selectedCycle !== "latest") {
    return `${selectedCycle} fallback`;
  }
  return point.cycleFallbackUsed ? `${cycle} fallback` : cycle;
}

function revisionModeLabel(periodMode: WddPeriodMode): string {
  return periodMode === "eiaWeeks" ? "EIA Weeks" : "Daily";
}

const REVISION_SERIES_COLORS = [
  "#38bdf8",
  "#a78bfa",
  "#34d399",
  "#f97316",
  "#f43f5e",
  "#eab308",
  "#22d3ee",
  "#ec4899",
  "#84cc16",
  "#fb7185",
  "#2dd4bf",
  "#c084fc",
  "#60a5fa",
  "#f59e0b",
  "#94a3b8",
  "#f87171",
];

function revisionCoverageLabel(point: WddForecastRevisionPoint): string {
  return `${point.coveredDayCount}/${point.expectedDayCount}d`;
}

interface RevisionChartRow {
  targetKey: string;
  targetLabel: string;
  forecastDate: string;
  dateRange: string;
  selectedForecast: number | null;
  pointsByIssue: Record<string, WddForecastRevisionPoint>;
  [dataKey: string]:
    | string
    | number
    | null
    | Record<string, WddForecastRevisionPoint>;
}

function buildRevisionIssueSeries(payload: WddForecastRevisionPayload): RevisionIssueSeries[] {
  const pointsByIssue = new Map<string, WddForecastRevisionPoint>();

  for (const target of payload.targets) {
    for (const point of payload.revisionsByTarget[target.key] ?? []) {
      if (!pointsByIssue.has(point.sourceIssueKey) || point.selected) {
        pointsByIssue.set(point.sourceIssueKey, point);
      }
    }
  }

  return Array.from(pointsByIssue.values())
    .sort((left, right) =>
      (
        left.issueSortAtUtc ??
        left.sourceIssueAtUtc ??
        left.scrapeRunAtUtc ??
        left.sourceIssueKey
      ).localeCompare(
        right.issueSortAtUtc ??
          right.sourceIssueAtUtc ??
          right.scrapeRunAtUtc ??
          right.sourceIssueKey,
      ),
    )
    .map((point, index) => {
      const issueStampAtUtc = revisionPointIssueStamp(point);
      const cycleLabel = revisionPointCycleLabel(point, payload.filters.cycle);
      const issueTimeLabel = revisionRunTimeLabel(issueStampAtUtc, cycleLabel);
      return {
        issueKey: point.sourceIssueKey,
        dataKey: `issue_${index}`,
        color: REVISION_SERIES_COLORS[index % REVISION_SERIES_COLORS.length] ?? "#38bdf8",
        issueLabel: issueTimeLabel,
        issueTimeLabel,
        issueStampAtUtc,
        cycleLabel,
        issueSortAtUtc: point.issueSortAtUtc,
        selected: point.selected,
      };
    });
}

function revisionSeriesStampMs(series: RevisionIssueSeries): number | null {
  const stamp = series.issueSortAtUtc ?? series.issueStampAtUtc;
  if (!stamp) return null;
  const ms = Date.parse(stamp);
  return Number.isFinite(ms) ? ms : null;
}

function latestRevisionSeries(series: RevisionIssueSeries[]): RevisionIssueSeries | null {
  return [...series].sort((left, right) => {
    const leftMs = revisionSeriesStampMs(left) ?? Number.NEGATIVE_INFINITY;
    const rightMs = revisionSeriesStampMs(right) ?? Number.NEGATIVE_INFINITY;
    return rightMs - leftMs;
  })[0] ?? null;
}

function revisionRelativeLabel(offsetHours: number): string {
  return offsetHours === 0 ? "Latest" : `${offsetHours} hrs ago`;
}

function revisionComparisonIssueMap(
  series: RevisionIssueSeries[],
): Map<string, RevisionComparisonMeta> {
  const anchor = series.find((item) => item.selected) ?? latestRevisionSeries(series);
  const anchorMs = anchor ? revisionSeriesStampMs(anchor) : null;
  const labels = new Map<string, RevisionComparisonMeta>();
  if (!anchor || anchorMs === null) return labels;

  const hourMs = 3_600_000;
  const toleranceMs = 4 * hourMs;
  const pickedIssueKeys = new Set<string>();

  for (const offset of REVISION_DEFAULT_HOUR_OFFSETS) {
    const targetMs = anchorMs - offset * hourMs;
    const closest = series
      .filter((item) => !pickedIssueKeys.has(item.issueKey))
      .map((item) => ({ item, distanceMs: Math.abs((revisionSeriesStampMs(item) ?? NaN) - targetMs) }))
      .filter((item) => Number.isFinite(item.distanceMs) && item.distanceMs <= toleranceMs)
      .sort((left, right) => left.distanceMs - right.distanceMs)[0];

    if (!closest) continue;
    pickedIssueKeys.add(closest.item.issueKey);
    labels.set(closest.item.issueKey, {
      label: `${closest.item.issueTimeLabel} | ${revisionRelativeLabel(offset)}`,
      sortOrder: offset,
    });
  }

  return labels;
}

function defaultHiddenRevisionIssueKeys(series: RevisionIssueSeries[]): Set<string> {
  const comparisonIssueKeys = revisionComparisonIssueMap(series);
  if (!comparisonIssueKeys.size) return new Set();
  return new Set(
    series
      .filter((item) => !comparisonIssueKeys.has(item.issueKey))
      .map((item) => item.issueKey),
  );
}

function revisionIssueDisplayLabel(
  series: RevisionIssueSeries,
  comparisonMetaByIssueKey: Map<string, RevisionComparisonMeta>,
): string {
  return comparisonMetaByIssueKey.get(series.issueKey)?.label ?? series.issueLabel;
}

function sortRevisionSeriesForDisplay(
  series: RevisionIssueSeries[],
  comparisonMetaByIssueKey: Map<string, RevisionComparisonMeta>,
): RevisionIssueSeries[] {
  return [...series].sort((left, right) => {
    const leftMeta = comparisonMetaByIssueKey.get(left.issueKey);
    const rightMeta = comparisonMetaByIssueKey.get(right.issueKey);
    if (leftMeta && rightMeta) return leftMeta.sortOrder - rightMeta.sortOrder;
    if (leftMeta) return -1;
    if (rightMeta) return 1;

    const leftMs = revisionSeriesStampMs(left) ?? Number.NEGATIVE_INFINITY;
    const rightMs = revisionSeriesStampMs(right) ?? Number.NEGATIVE_INFINITY;
    return rightMs - leftMs;
  });
}

function buildRevisionChartRows(
  payload: WddForecastRevisionPayload,
  series: RevisionIssueSeries[],
): RevisionChartRow[] {
  const pointsByTargetIssue = new Map<string, WddForecastRevisionPoint>();

  for (const target of payload.targets) {
    const points = payload.revisionsByTarget[target.key] ?? [];
    for (const point of points) {
      pointsByTargetIssue.set(`${target.key}::${point.sourceIssueKey}`, point);
    }
  }

  return payload.targets.map((target) => {
    const row: RevisionChartRow = {
      targetKey: target.key,
      targetLabel: target.label,
      forecastDate: target.forecastDates[0] ?? target.key,
      dateRange: target.dateRange,
      selectedForecast: target.selectedForecast,
      pointsByIssue: {},
    };

    for (const item of series) {
      const point = pointsByTargetIssue.get(`${target.key}::${item.issueKey}`);
      row[item.dataKey] = point?.forecast ?? null;
      if (point) row.pointsByIssue[item.issueKey] = point;
    }

    return row;
  });
}

function revisionYAxisDomain(
  rows: RevisionChartRow[],
  visibleSeries: RevisionIssueSeries[],
): [number, number] | ["auto", "auto"] {
  const values: number[] = [];
  for (const row of rows) {
    for (const item of visibleSeries) {
      const value = row[item.dataKey];
      if (typeof value === "number" && Number.isFinite(value)) values.push(value);
    }
  }

  if (!values.length) return ["auto", "auto"];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;
  const padding = spread > 0 ? Math.max(0.2, spread * 0.08) : Math.max(0.5, Math.abs(max) * 0.02);
  return [Math.floor((min - padding) * 10) / 10, Math.ceil((max + padding) * 10) / 10];
}

function ForecastRevisionTooltip({
  active,
  payload,
  visibleSeries,
  comparisonMetaByIssueKey,
  periodMode,
}: {
  active?: boolean;
  payload?: Array<{
    color?: string;
    dataKey?: string | number;
    value?: number | string | null;
    payload: RevisionChartRow;
  }>;
  visibleSeries: RevisionIssueSeries[];
  comparisonMetaByIssueKey: Map<string, RevisionComparisonMeta>;
  periodMode: WddPeriodMode;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const visibleItems = visibleSeries.map((series) => {
    const point = row.pointsByIssue[series.issueKey];
    const value = row[series.dataKey];
    return {
      point,
      series,
      value: typeof value === "number" && Number.isFinite(value) ? value : null,
    };
  });

  return (
    <div className="max-w-sm rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-200 shadow-xl">
      <div className="font-semibold text-gray-100">
        {periodMode === "eiaWeeks" ? "EIA Week" : "Forecast Date"}{" "}
        {periodMode === "eiaWeeks" ? row.targetLabel : row.forecastDate}
      </div>
      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
        <span className="text-gray-500">Range</span>
        <span className="tabular-nums text-gray-200">{row.dateRange}</span>
        <span className="text-gray-500">Selected</span>
        <span className="tabular-nums text-gray-200">{fmtNumber(row.selectedForecast)}</span>
      </div>
      <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
        {visibleItems.map(({ point, series, value }) => {
          const applicable = point && value !== null;
          return (
            <div
              key={series.issueKey}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: series.color }}
                  aria-hidden="true"
                />
                <span className="truncate text-gray-300">
                  {revisionIssueDisplayLabel(series, comparisonMetaByIssueKey)}
                </span>
                {series.selected && (
                  <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-emerald-300">
                    Selected
                  </span>
                )}
              </span>
              <span className="tabular-nums text-gray-100">{fmtNumber(value)}</span>
              <span className="pl-3 text-[10px] text-gray-500">
                {series.cycleLabel} / {point ? revisionCoverageLabel(point) : "0/1d"} /{" "}
                {applicable ? "covered" : "not applicable"}
              </span>
              <span className="text-right text-[10px] text-gray-600">
                {applicable ? "value" : "missing"}
              </span>
              <span className="col-span-2 truncate pl-3 font-mono text-[10px] text-gray-600">
                {series.issueKey}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ForecastRevisionButton({
  model,
  issue,
  periodMode,
  onOpen,
}: {
  model: WddModel;
  issue: ModelIssueSummary | undefined;
  periodMode: WddPeriodMode;
  onOpen: (request: ForecastRevisionRequest) => void;
}) {
  const disabled = !issue?.selectedIssueKey;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onOpen({ model, periodMode })}
      className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
        disabled
          ? "cursor-not-allowed border-gray-800 bg-gray-950/40 text-gray-700"
          : "border-sky-500/45 bg-sky-500/10 text-sky-100 hover:border-sky-400/70 hover:bg-sky-500/20"
      }`}
      title={
        disabled
          ? "No selected issue is available"
          : `View ${model} ${revisionModeLabel(periodMode)} revision history`
      }
    >
      Plot
    </button>
  );
}

function ForecastRevisionModal({
  request,
  region,
  metric,
  cycle,
  refreshCount,
  onClose,
}: {
  request: ForecastRevisionRequest;
  region: WddRegion;
  metric: WddMetric;
  cycle: WddCycle;
  refreshCount: number;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<WddForecastRevisionPayload | null>(null);
  const [hiddenIssueKeys, setHiddenIssueKeys] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const forceRefresh = refreshCount > 0;

    setPayload(null);
    setHiddenIssueKeys(new Set());
    setLoading(true);
    setError(null);

    fetchJsonWithCache<WddForecastRevisionPayload>({
      key: buildRevisionCacheKey({
        region,
        metric,
        model: request.model,
        cycle,
        periodMode: request.periodMode,
      }),
      url: buildRevisionApiUrl({
        region,
        metric,
        model: request.model,
        cycle,
        periodMode: request.periodMode,
        refresh: forceRefresh,
      }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
    })
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setHiddenIssueKeys(defaultHiddenRevisionIssueKeys(buildRevisionIssueSeries(data)));
      })
      .catch((fetchError: unknown) => {
        if (!active) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load forecast revision history",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [cycle, metric, refreshCount, region, request.model, request.periodMode]);

  const allSeries = useMemo(
    () => (payload ? buildRevisionIssueSeries(payload) : []),
    [payload],
  );
  const comparisonMetaByIssueKey = useMemo(
    () => revisionComparisonIssueMap(allSeries),
    [allSeries],
  );
  const displaySeries = useMemo(
    () => sortRevisionSeriesForDisplay(allSeries, comparisonMetaByIssueKey),
    [allSeries, comparisonMetaByIssueKey],
  );
  const visibleSeries = useMemo(
    () => displaySeries.filter((item) => !hiddenIssueKeys.has(item.issueKey)),
    [displaySeries, hiddenIssueKeys],
  );
  const chartRows = useMemo(
    () => (payload ? buildRevisionChartRows(payload, allSeries) : []),
    [allSeries, payload],
  );
  const targetLabelByKey = useMemo(
    () => new Map(chartRows.map((row) => [row.targetKey, row.targetLabel])),
    [chartRows],
  );
  const yAxisDomain = revisionYAxisDomain(chartRows, visibleSeries);
  const totalPointCount = Object.values(payload?.revisionsByTarget ?? {}).reduce(
    (total, points) => total + points.length,
    0,
  );

  const toggleIssue = (issueKey: string) => {
    setHiddenIssueKeys((current) => {
      const next = new Set(current);
      if (next.has(issueKey)) {
        next.delete(issueKey);
      } else {
        next.add(issueKey);
      }
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${request.model} forecast revision history`}
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-gray-800 p-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-100">
              Forecast Revision - {request.model}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {revisionModeLabel(request.periodMode)} / {region} / {metric.toUpperCase()} /{" "}
              {cycle}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {payload && (
              <>
                <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1 text-[11px] font-semibold text-gray-400">
                  Issues{" "}
                  <span className="tabular-nums text-gray-200">
                    {payload.rowCounts.issueCount.toLocaleString()}
                  </span>
                </span>
                <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1 text-[11px] font-semibold text-gray-400">
                  As of <span className="tabular-nums text-gray-200">{fmtStamp(payload.asOf.updatedAt)}</span>
                </span>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
          {loading ? (
            <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-5 text-sm text-gray-500">
              Loading forecast revision history...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : payload && payload.targets.length ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Issue Runs
                </span>
                {displaySeries.map((series) => {
                  const active = !hiddenIssueKeys.has(series.issueKey);
                  return (
                    <button
                      key={series.issueKey}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleIssue(series.issueKey)}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                        active
                          ? "border-gray-600 bg-gray-800 text-gray-100"
                          : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                      }`}
                      title={`${revisionIssueDisplayLabel(
                        series,
                        comparisonMetaByIssueKey,
                      )} / ${series.issueKey}`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: active ? series.color : "#4b5563" }}
                        aria-hidden="true"
                      />
                      {revisionIssueDisplayLabel(series, comparisonMetaByIssueKey)}
                      {series.selected && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-300">
                          Selected
                        </span>
                      )}
                    </button>
                  );
                })}
                {allSeries.length >= 3 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setHiddenIssueKeys(new Set())}
                      className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1 text-[11px] font-semibold text-gray-400 transition-colors hover:border-gray-700 hover:bg-gray-900 hover:text-gray-200"
                    >
                      Show all
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setHiddenIssueKeys(new Set(allSeries.map((series) => series.issueKey)))
                      }
                      className="rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1 text-[11px] font-semibold text-gray-400 transition-colors hover:border-gray-700 hover:bg-gray-900 hover:text-gray-200"
                    >
                      Hide all
                    </button>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>
                  Runs{" "}
                  <span className="font-semibold tabular-nums text-gray-300">
                    {visibleSeries.length}/{allSeries.length}
                  </span>
                </span>
                <span className="text-gray-700">/</span>
                <span>
                  {request.periodMode === "eiaWeeks" ? "Periods" : "Dates"}{" "}
                  <span className="font-semibold tabular-nums text-gray-300">
                    {chartRows.length.toLocaleString()}
                  </span>
                </span>
                <span className="text-gray-700">/</span>
                <span>
                  Points{" "}
                  <span className="font-semibold tabular-nums text-gray-300">
                    {totalPointCount.toLocaleString()}
                  </span>
                </span>
              </div>

              {chartRows.length && visibleSeries.length ? (
                <div className="h-[360px] rounded-lg border border-gray-800 bg-[#0d1119] p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    {request.periodMode === "eiaWeeks" ? (
                      <BarChart
                        data={chartRows}
                        margin={{ top: 10, right: 18, bottom: 28, left: 0 }}
                        barCategoryGap="18%"
                      >
                        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="targetKey"
                          tickFormatter={(value) =>
                            targetLabelByKey.get(String(value)) ?? String(value)
                          }
                          interval={0}
                          angle={-25}
                          textAnchor="end"
                          height={48}
                          tickMargin={8}
                          tick={{ fill: "#d1d5db", fontSize: 10 }}
                          tickLine={false}
                          axisLine={{ stroke: "#374151" }}
                        />
                        <YAxis
                          domain={yAxisDomain}
                          tickFormatter={(value) => fmtNumber(Number(value))}
                          tick={{ fill: "#d1d5db", fontSize: 10 }}
                          tickLine={false}
                          axisLine={{ stroke: "#374151" }}
                          width={54}
                        />
                        <Tooltip
                          content={
                            <ForecastRevisionTooltip
                              visibleSeries={visibleSeries}
                              comparisonMetaByIssueKey={comparisonMetaByIssueKey}
                              periodMode={request.periodMode}
                            />
                          }
                        />
                        {visibleSeries.map((series) => (
                          <Bar
                            key={series.issueKey}
                            dataKey={series.dataKey}
                            name={revisionIssueDisplayLabel(series, comparisonMetaByIssueKey)}
                            fill={series.color}
                            radius={[2, 2, 0, 0]}
                            isAnimationActive={false}
                          />
                        ))}
                      </BarChart>
                    ) : (
                      <LineChart
                        data={chartRows}
                        margin={{ top: 10, right: 18, bottom: 28, left: 0 }}
                      >
                        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="targetKey"
                          tickFormatter={(value) =>
                            targetLabelByKey.get(String(value)) ?? String(value)
                          }
                          interval={0}
                          angle={-35}
                          textAnchor="end"
                          height={48}
                          tickMargin={8}
                          tick={{ fill: "#d1d5db", fontSize: 10 }}
                          tickLine={false}
                          axisLine={{ stroke: "#374151" }}
                        />
                        <YAxis
                          domain={yAxisDomain}
                          tickFormatter={(value) => fmtNumber(Number(value))}
                          tick={{ fill: "#d1d5db", fontSize: 10 }}
                          tickLine={false}
                          axisLine={{ stroke: "#374151" }}
                          width={54}
                        />
                        <Tooltip
                          content={
                            <ForecastRevisionTooltip
                              visibleSeries={visibleSeries}
                              comparisonMetaByIssueKey={comparisonMetaByIssueKey}
                              periodMode={request.periodMode}
                            />
                          }
                        />
                        {visibleSeries.map((series) => (
                          <Line
                            key={series.issueKey}
                            type="monotone"
                            dataKey={series.dataKey}
                            name={revisionIssueDisplayLabel(series, comparisonMetaByIssueKey)}
                            stroke={series.color}
                            strokeWidth={series.selected ? 2.5 : 1.7}
                            dot={{ r: 2, strokeWidth: 1 }}
                            activeDot={{ r: 4 }}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        ))}
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-5 text-sm text-gray-500">
                  No visible forecast revision series have historical issue points.
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-5 text-sm text-gray-500">
              No revision targets are available for the selected issue.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DailyTable({
  rows,
  models,
  issuesByModel,
  normalLabel,
  vsNormalLabel,
  showVsNormal,
  showForecastChanges,
  showGradient,
  onToggleVsNormal,
  onToggleForecastChanges,
  onToggleGradient,
  onOpenRevision,
}: {
  rows: WddDailyRow[];
  models: WddModel[];
  issuesByModel: Map<WddModel, ModelIssueSummary>;
  normalLabel: string;
  vsNormalLabel: string;
  showVsNormal: boolean;
  showForecastChanges: boolean;
  showGradient: boolean;
  onToggleVsNormal: () => void;
  onToggleForecastChanges: () => void;
  onToggleGradient: () => void;
  onOpenRevision: (request: ForecastRevisionRequest) => void;
}) {
  const metrics = modelTableMetrics(vsNormalLabel, showVsNormal);
  const [open, setOpen] = useState(true);

  return (
    <DataTableShell
      title="Daily"
      subtitle={`${rows.length} forecast dates`}
      className="w-max min-w-max"
      action={
        open ? (
          <TableDisplayToggles
            showVsNormal={showVsNormal}
            vsNormalLabel={vsNormalLabel}
            showForecastChanges={showForecastChanges}
            showGradient={showGradient}
            onToggleVsNormal={onToggleVsNormal}
            onToggleForecastChanges={onToggleForecastChanges}
            onToggleGradient={onToggleGradient}
          />
        ) : null
      }
      collapsible
      open={open}
      onToggle={() => setOpen((value) => !value)}
      bodyClassName="bg-[#0d1119]"
    >
      <table className="w-max min-w-full table-auto border-collapse bg-[#0d1119] text-[10px] leading-3 text-gray-200">
        <thead className="bg-gray-950 text-gray-400">
          <tr>
            <th
              className="sticky left-0 z-30 whitespace-nowrap border border-gray-800 bg-gray-950 px-1 py-0.5 text-left font-semibold uppercase tracking-wide"
            >
              Model
            </th>
            <th className="whitespace-nowrap border border-gray-800 bg-gray-950 px-1 py-0.5 text-left font-semibold uppercase tracking-wide">
              Metric
            </th>
            <th className="whitespace-nowrap border border-gray-800 bg-gray-950 px-1 py-0.5 text-center font-semibold uppercase tracking-wide">
              Revision
            </th>
            {rows.map((row) => (
              <th
                key={row.forecastDate}
                className="whitespace-nowrap border border-gray-800 px-0.5 py-0 text-center font-semibold"
              >
                <span className="block whitespace-nowrap text-[10px] text-gray-100">{row.dateLabel}</span>
                <span className="block text-[9px] text-gray-500">
                  D{row.forecastDay}
                </span>
              </th>
            ))}
            <th className="whitespace-nowrap border border-gray-800 bg-gray-900 px-0.5 py-0 text-center font-semibold">
              <span className="block text-[10px] text-gray-100">Total</span>
              <span className="block text-[9px] text-gray-500">D1-15</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-violet-500/5">
            <td className="sticky left-0 z-20 whitespace-nowrap border border-gray-800 bg-gray-950 px-1 py-0 font-semibold text-violet-100">
              Normal
            </td>
            <td className="whitespace-nowrap border border-gray-800 bg-gray-950 px-1 py-0 font-medium text-gray-400">
              {normalLabel}
            </td>
            <td className="border border-gray-800 bg-gray-950 px-0.5 py-0" />
            {rows.map((row) => (
              <td
                key={`normal-${row.forecastDate}`}
                className="border border-gray-800 px-0.5 py-0 text-right tabular-nums text-violet-100"
              >
                {fmtNumber(firstModelValue(models, row.models, (cell) => cell.normal))}
              </td>
            ))}
            <td className="border border-gray-800 bg-gray-900 px-0.5 py-0 text-right font-semibold tabular-nums text-violet-100">
              {fmtNumber(tableNormalTotal(rows, models))}
            </td>
          </tr>
          {models.map((model) =>
            metrics.map((metricRow, metricIndex) => {
              const issue = issuesByModel.get(model);
              return (
                <tr key={`${model}-${metricRow.key}`} className="odd:bg-gray-950/30">
                  {metricIndex === 0 && (
                    <td
                      rowSpan={metrics.length}
                      className="sticky left-0 z-20 whitespace-nowrap border border-gray-800 bg-gray-950 px-1 py-0 align-top text-gray-100"
                    >
                      <ModelIssueCell model={model} issue={issue} />
                    </td>
                  )}
                  <td className="whitespace-nowrap border border-gray-800 bg-gray-950 px-1 py-0 font-medium text-gray-400">
                    {metricRow.label}
                  </td>
                  <td className="border border-gray-800 bg-gray-950 px-0.5 py-0 text-center">
                    {metricRow.key === "forecast" ? (
                      <ForecastRevisionButton
                        model={model}
                        issue={issue}
                        periodMode="dayBuckets"
                        onOpen={onOpenRevision}
                      />
                    ) : null}
                  </td>
                  {rows.map((row) => {
                    const cell = row.models[model];
                    const value = tableMetricValue(cell, metricRow.key);
                    const gradientValue =
                      metricRow.key === "forecast"
                        ? cell?.vsNormal
                        : metricRow.key === "vsNormal"
                          ? value
                          : null;
                    return (
                      <td
                        key={`${model}-${metricRow.key}-${row.forecastDate}`}
                        className={`border border-gray-800 px-0.5 py-0 text-right align-top tabular-nums ${
                          metricRow.signed ? signedClass(value) : "text-gray-100"
                        }`}
                        style={
                          showGradient
                            ? temperatureDeltaCellStyle(gradientValue)
                            : undefined
                        }
                      >
                        <TableMetricCellValue
                          cell={cell}
                          metric={metricRow.key}
                          value={value}
                          signed={metricRow.signed}
                          showForecastChanges={showForecastChanges}
                        />
                      </td>
                    );
                  })}
                  {(() => {
                    const totalCell = aggregateModelTableCell(rows, model);
                    const value = tableMetricValue(totalCell, metricRow.key);
                    const gradientValue =
                      metricRow.key === "forecast"
                        ? totalCell.vsNormal
                        : metricRow.key === "vsNormal"
                          ? value
                          : null;
                    return (
                      <td
                        className={`border border-gray-800 bg-gray-900 px-0.5 py-0 text-right align-top font-semibold tabular-nums ${
                          metricRow.signed ? signedClass(value) : "text-gray-100"
                        }`}
                        style={
                          showGradient
                            ? temperatureDeltaCellStyle(gradientValue)
                            : undefined
                        }
                      >
                        <TableMetricCellValue
                          cell={totalCell}
                          metric={metricRow.key}
                          value={value}
                          signed={metricRow.signed}
                          showForecastChanges={showForecastChanges}
                        />
                      </td>
                    );
                  })()}
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </DataTableShell>
  );
}

function PeriodTable({
  rows,
  models,
  issuesByModel,
  normalLabel,
  vsNormalLabel,
  showVsNormal,
  showForecastChanges,
  showGradient,
  onToggleVsNormal,
  onToggleForecastChanges,
  onToggleGradient,
  onOpenRevision,
}: {
  rows: WddPeriodRow[];
  models: WddModel[];
  issuesByModel: Map<WddModel, ModelIssueSummary>;
  normalLabel: string;
  vsNormalLabel: string;
  showVsNormal: boolean;
  showForecastChanges: boolean;
  showGradient: boolean;
  onToggleVsNormal: () => void;
  onToggleForecastChanges: () => void;
  onToggleGradient: () => void;
  onOpenRevision: (request: ForecastRevisionRequest) => void;
}) {
  const metrics = modelTableMetrics(vsNormalLabel, showVsNormal);
  const [open, setOpen] = useState(true);
  const totalDayCount = rows.reduce((total, row) => total + row.dayCount, 0);

  return (
    <DataTableShell
      title="EIA Weeks"
      subtitle={`${rows.length} Friday week-ending buckets`}
      className="w-max min-w-max"
      action={
        open ? (
          <TableDisplayToggles
            showVsNormal={showVsNormal}
            vsNormalLabel={vsNormalLabel}
            showForecastChanges={showForecastChanges}
            showGradient={showGradient}
            onToggleVsNormal={onToggleVsNormal}
            onToggleForecastChanges={onToggleForecastChanges}
            onToggleGradient={onToggleGradient}
          />
        ) : null
      }
      collapsible
      open={open}
      onToggle={() => setOpen((value) => !value)}
      bodyClassName="bg-[#0d1119]"
    >
      <table className="w-max min-w-full table-auto border-collapse bg-[#0d1119] text-[10px] leading-3 text-gray-200">
        <thead className="bg-gray-950 text-gray-400">
          <tr>
            <th
              className="sticky left-0 z-30 whitespace-nowrap border border-gray-800 bg-gray-950 px-1 py-0.5 text-left font-semibold uppercase tracking-wide"
            >
              Model
            </th>
            <th className="whitespace-nowrap border border-gray-800 bg-gray-950 px-1 py-0.5 text-left font-semibold uppercase tracking-wide">
              Metric
            </th>
            <th className="whitespace-nowrap border border-gray-800 bg-gray-950 px-1 py-0.5 text-center font-semibold uppercase tracking-wide">
              Revision
            </th>
            {rows.map((row) => (
              <th
                key={row.periodKey}
                className="whitespace-nowrap border border-gray-800 px-0.5 py-0 text-center font-semibold"
              >
                <span className="block text-gray-100">{row.periodLabel}</span>
                <span className="block text-[9px] text-gray-500">{row.dayCount}d</span>
              </th>
            ))}
            <th className="whitespace-nowrap border border-gray-800 bg-gray-900 px-0.5 py-0 text-center font-semibold">
              <span className="block text-[10px] text-gray-100">Total</span>
              <span className="block text-[9px] text-gray-500">{totalDayCount}d</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-violet-500/5">
            <td className="sticky left-0 z-20 whitespace-nowrap border border-gray-800 bg-gray-950 px-1 py-0 font-semibold text-violet-100">
              Normal
            </td>
            <td className="whitespace-nowrap border border-gray-800 bg-gray-950 px-1 py-0 font-medium text-gray-400">
              {normalLabel}
            </td>
            <td className="border border-gray-800 bg-gray-950 px-0.5 py-0" />
            {rows.map((row) => (
              <td
                key={`normal-period-${row.periodKey}`}
                className="border border-gray-800 px-0.5 py-0 text-right tabular-nums text-violet-100"
                title={row.dateRange}
              >
                {fmtNumber(firstModelValue(models, row.models, (cell) => cell.normal))}
              </td>
            ))}
            <td className="border border-gray-800 bg-gray-900 px-0.5 py-0 text-right font-semibold tabular-nums text-violet-100">
              {fmtNumber(tableNormalTotal(rows, models))}
            </td>
          </tr>
          {models.map((model) =>
            metrics.map((metricRow, metricIndex) => {
              const issue = issuesByModel.get(model);
              return (
                <tr key={`${model}-period-${metricRow.key}`} className="odd:bg-gray-950/30">
                  {metricIndex === 0 && (
                    <td
                      rowSpan={metrics.length}
                      className="sticky left-0 z-20 whitespace-nowrap border border-gray-800 bg-gray-950 px-1 py-0 align-top text-gray-100"
                    >
                      <ModelIssueCell model={model} issue={issue} />
                    </td>
                  )}
                  <td className="whitespace-nowrap border border-gray-800 bg-gray-950 px-1 py-0 font-medium text-gray-400">
                    {metricRow.label}
                  </td>
                  <td className="border border-gray-800 bg-gray-950 px-0.5 py-0 text-center">
                    {metricRow.key === "forecast" ? (
                      <ForecastRevisionButton
                        model={model}
                        issue={issue}
                        periodMode="eiaWeeks"
                        onOpen={onOpenRevision}
                      />
                    ) : null}
                  </td>
                  {rows.map((row) => {
                    const cell = row.models[model];
                    const value = tableMetricValue(cell, metricRow.key);
                    const gradientValue =
                      metricRow.key === "forecast"
                        ? cell?.vsNormal
                        : metricRow.key === "vsNormal"
                          ? value
                          : null;
                    return (
                      <td
                        key={`${model}-period-${metricRow.key}-${row.periodKey}`}
                        className={`border border-gray-800 px-0.5 py-0 text-right align-top tabular-nums ${
                          metricRow.signed ? signedClass(value) : "text-gray-100"
                        }`}
                        style={
                          showGradient
                            ? temperatureDeltaCellStyle(gradientValue)
                            : undefined
                        }
                        title={row.dateRange}
                      >
                        <TableMetricCellValue
                          cell={cell}
                          metric={metricRow.key}
                          value={value}
                          signed={metricRow.signed}
                          showForecastChanges={showForecastChanges}
                        />
                      </td>
                    );
                  })}
                  {(() => {
                    const totalCell = aggregateModelTableCell(rows, model);
                    const value = tableMetricValue(totalCell, metricRow.key);
                    const gradientValue =
                      metricRow.key === "forecast"
                        ? totalCell.vsNormal
                        : metricRow.key === "vsNormal"
                          ? value
                          : null;
                    return (
                      <td
                        className={`border border-gray-800 bg-gray-900 px-0.5 py-0 text-right align-top font-semibold tabular-nums ${
                          metricRow.signed ? signedClass(value) : "text-gray-100"
                        }`}
                        style={
                          showGradient
                            ? temperatureDeltaCellStyle(gradientValue)
                            : undefined
                        }
                        title="Total"
                      >
                        <TableMetricCellValue
                          cell={totalCell}
                          metric={metricRow.key}
                          value={value}
                          signed={metricRow.signed}
                          showForecastChanges={showForecastChanges}
                        />
                      </td>
                    );
                  })()}
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </DataTableShell>
  );
}

export default function WsiWeatherDashboard() {
  const [region, setRegion] = useState<WddRegion>("CONUS");
  const [metric, setMetric] = useState<WddMetric>(DEFAULT_METRIC);
  const [cycle, setCycle] = useState<WddCycle>("latest");
  const [models, setModels] = useState<WddModel[]>(DEFAULT_MODELS);
  const [showVsNormal, setShowVsNormal] = useState(DEFAULT_SHOW_VS_NORMAL);
  const [showTableGradient, setShowTableGradient] = useState(DEFAULT_SHOW_TABLE_GRADIENT);
  const [showForecastChanges, setShowForecastChanges] = useState(
    DEFAULT_SHOW_FORECAST_CHANGES,
  );
  const [revisionRequest, setRevisionRequest] = useState<ForecastRevisionRequest | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [payload, setPayload] = useState<WddForecastChangesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const forceRefresh = refreshCount > 0;
    setLoading(true);
    setError(null);

    fetchJsonWithCache<WddForecastChangesPayload>({
      key: buildCacheKey({ region, metric, models, cycle, periodMode: WSI_PERIOD_MODE }),
      url: buildApiUrl({
        region,
        metric,
        models,
        cycle,
        periodMode: WSI_PERIOD_MODE,
        refresh: forceRefresh,
      }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
    })
      .then((data) => {
        if (!active) return;
        setPayload(data);
      })
      .catch((fetchError: unknown) => {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load WSI WDD rows");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [cycle, metric, models, refreshCount, region]);

  const displayedModels = payload?.filters.models ?? models;
  const issuesByModel = useMemo(
    () => new Map((payload?.modelIssues ?? []).map((issue) => [issue.model, issue])),
    [payload?.modelIssues],
  );
  const rowsAvailable = (payload?.dailyRows.length ?? 0) > 0;
  const completeModelCount =
    payload?.modelIssues.filter((issue) => displayStatus(issue) === "complete").length ?? 0;
  const normalLabel = normalMetricLabel(payload?.normal.actualBasis ?? "10yr");
  const vsNormalLabel = vsNormalMetricLabel(payload?.normal.actualBasis ?? "10yr");
  const normalStatusLabel = payload
    ? `${normalSourceLabel(payload.normal)}${
        payload.normal.minSampleYearCount && payload.normal.maxSampleYearCount
          ? ` ${payload.normal.minSampleYearCount}-${payload.normal.maxSampleYearCount}y`
          : ""
      }`
    : "10yr normals";
  const filtersChanged =
    region !== "CONUS" ||
    metric !== DEFAULT_METRIC ||
    cycle !== "latest" ||
    showVsNormal !== DEFAULT_SHOW_VS_NORMAL ||
    showTableGradient !== DEFAULT_SHOW_TABLE_GRADIENT ||
    showForecastChanges !== DEFAULT_SHOW_FORECAST_CHANGES ||
    !sameModelSelection(models, DEFAULT_MODELS);

  return (
    <div className="space-y-4">
      <ControlCard title="WSI Weather">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Filters
            </span>
            <span className="h-px flex-1 bg-gray-800" />
            <span className="text-xs text-gray-500">
              {payload
                ? `${completeModelCount}/${payload.modelIssues.length} models complete`
                : "Weighted degree-day changes"}
            </span>
          </div>

          <FilterPills
            label="Region"
            options={REGION_FILTER_OPTIONS}
            value={region}
            onChange={setRegion}
          />
          <FilterPills
            label="Metric"
            options={METRIC_OPTIONS}
            value={metric}
            onChange={setMetric}
          />
          <ModelFilterPills selected={models} onChange={setModels} />
          <FilterPills
            label="Cycle"
            options={CYCLE_OPTIONS}
            value={cycle}
            onChange={setCycle}
          />

          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>
              Rows{" "}
              <span className="font-semibold tabular-nums text-gray-300">
                {payload ? payload.rowCounts.rawRows.toLocaleString() : "--"}
              </span>
            </span>
            <span className="text-gray-700">/</span>
            <span>
              Normal{" "}
              <span className="font-semibold tabular-nums text-gray-300">
                {normalStatusLabel}
              </span>
            </span>
            <span className="text-gray-700">/</span>
            <span>
              Issue{" "}
              <span className="font-semibold tabular-nums text-gray-300">
                {fmtStamp(payload?.asOf.latestIssueAt)}
              </span>
            </span>
            <span className="text-gray-700">/</span>
            <span>
              Data{" "}
              <span className="font-semibold tabular-nums text-gray-300">
                {fmtStamp(payload?.asOf.updatedAt)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setRefreshCount((value) => value + 1)}
              className="rounded-full border border-gray-700 bg-transparent px-3 py-1 text-xs font-semibold text-gray-500 transition-all duration-150 hover:border-gray-600 hover:text-gray-300"
            >
              Refresh
            </button>
            {filtersChanged && (
              <button
                type="button"
                onClick={() => {
                  setRegion("CONUS");
                  setMetric(DEFAULT_METRIC);
                  setCycle("latest");
                  setModels(DEFAULT_MODELS);
                  setShowVsNormal(DEFAULT_SHOW_VS_NORMAL);
                  setShowTableGradient(DEFAULT_SHOW_TABLE_GRADIENT);
                  setShowForecastChanges(DEFAULT_SHOW_FORECAST_CHANGES);
                }}
                className="rounded-full border border-gray-700 bg-transparent px-3 py-1 text-xs font-semibold text-gray-500 transition-all duration-150 hover:border-gray-600 hover:text-gray-300"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </ControlCard>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && !payload ? (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-5 text-sm text-gray-500">
          Loading WDD forecast changes...
        </div>
      ) : payload && rowsAvailable ? (
        <>
          <div className="flex items-start gap-4 overflow-x-auto pb-1">
            <DailyTable
              rows={payload.dailyRows}
              models={displayedModels}
              issuesByModel={issuesByModel}
              normalLabel={normalLabel}
              vsNormalLabel={vsNormalLabel}
              showVsNormal={showVsNormal}
              showForecastChanges={showForecastChanges}
              showGradient={showTableGradient}
              onToggleVsNormal={() => setShowVsNormal((value) => !value)}
              onToggleForecastChanges={() => setShowForecastChanges((value) => !value)}
              onToggleGradient={() => setShowTableGradient((value) => !value)}
              onOpenRevision={setRevisionRequest}
            />
            <PeriodTable
              rows={payload.periodRows}
              models={displayedModels}
              issuesByModel={issuesByModel}
              normalLabel={normalLabel}
              vsNormalLabel={vsNormalLabel}
              showVsNormal={showVsNormal}
              showForecastChanges={showForecastChanges}
              showGradient={showTableGradient}
              onToggleVsNormal={() => setShowVsNormal((value) => !value)}
              onToggleForecastChanges={() => setShowForecastChanges((value) => !value)}
              onToggleGradient={() => setShowTableGradient((value) => !value)}
              onOpenRevision={setRevisionRequest}
            />
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-5 text-sm text-gray-500">
          No WSI weighted degree-day forecast rows match the selected filters.
        </div>
      )}
      {revisionRequest && (
        <ForecastRevisionModal
          request={revisionRequest}
          region={region}
          metric={metric}
          cycle={cycle}
          refreshCount={refreshCount}
          onClose={() => setRevisionRequest(null)}
        />
      )}
    </div>
  );
}
