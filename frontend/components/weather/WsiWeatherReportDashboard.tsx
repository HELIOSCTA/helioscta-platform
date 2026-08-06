"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import DataTableShell from "@/components/dashboard/DataTableShell";
import DashboardTabs, { type DashboardTabOption } from "@/components/dashboard/DashboardTabs";
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
type NormalSource = "table" | "observations" | "forecast_30yr" | "mixed" | "none";

interface WsiReportRow {
  key: string;
  label: string;
  dateRange: string;
  dayCount: number;
  forecast: number | null;
  change12h: number | null;
  change24h: number | null;
  thermalChange12h?: number | null;
  thermalChange24h?: number | null;
  normal10yr: number | null;
  priorYear: number | null;
  vsNormal: number | null;
  vsPriorYear: number | null;
  thermalDeparture: number | null;
  priorYearDayCount: number;
}

interface WsiReportModelSpread {
  supportingModelCount: number;
  lowModel: WddModel | null;
  lowForecast: number | null;
  highModel: WddModel | null;
  highForecast: number | null;
  spread: number | null;
  supportingAverage: number | null;
  primaryVsSupportingAverage: number | null;
}

interface WsiReportModelChange {
  model: WddModel;
  status: IssueStatus;
  issueKey: string | null;
  issueAtUtc: string | null;
  scrapeRunAtUtc: string | null;
  cycle: string | null;
  completenessPct: number;
  forecastDayCount: number;
  expectedDayCount: number;
  forecast: number | null;
  vsWsiForecast: number | null;
  change12h: number | null;
  change24h: number | null;
  change48h: number | null;
  change72h: number | null;
  thermalVsWsiForecast: number | null;
  thermalChange12h: number | null;
  thermalChange24h: number | null;
  thermalChange48h: number | null;
  thermalChange72h: number | null;
}

interface WsiWeatherReport {
  primaryModel: "WSI";
  supportingModels: WddModel[];
  metricLabel: string;
  status: {
    issueKey: string | null;
    issueAtUtc: string | null;
    scrapeRunAtUtc: string | null;
    cycle: string | null;
    normalSource: NormalSource;
    normalBasis: NormalBasis;
    normalUpdatedAt: string | null;
    priorYearCoverageDays: number;
    expectedPriorYearDays: number;
    completenessPct: number;
    forecastWindow: string;
    show12hChange: boolean;
  };
  headlines: string[];
  eiaWeeks: WsiReportRow[];
  dayBuckets: WsiReportRow[];
  modelChanges: WsiReportModelChange[];
  modelSpread: WsiReportModelSpread;
}

interface WsiWeatherReportPayload {
  source: "weather.wsi_daily_weighted_degree_day_forecasts";
  filters: {
    region: WddRegion;
    metric: WddMetric;
    models: WddModel[];
    cycle: WddCycle;
    periodMode: WddPeriodMode;
  };
  normal: {
    preferredBasis: "10yr";
    actualBasis: NormalBasis;
    source: NormalSource;
    tableExists: boolean;
    rowCount: number;
    lookbackYears: number;
    normalWindowEndYear: number | null;
    minSampleYearCount: number | null;
    maxSampleYearCount: number | null;
    updatedAt: string | null;
  };
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
  report?: WsiWeatherReport;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
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
const REGION_TAB_OPTIONS: Array<DashboardTabOption<WddRegion>> = REGION_OPTIONS.map((region) => ({
  value: region,
  label: region,
}));

function seasonalDefaultMetric(): WddMetric {
  const month = new Date().getUTCMonth() + 1;
  return month >= 4 && month <= 10 ? "population_cdd" : "gas_hdd";
}

const DEFAULT_REGION: WddRegion = "CONUS";
const DEFAULT_METRIC = seasonalDefaultMetric();
const DEFAULT_CYCLE: WddCycle = "latest";

function parseInitialRegion(value: string | null): WddRegion {
  const normalized = value?.trim().toUpperCase();
  return normalized && (REGION_OPTIONS as string[]).includes(normalized)
    ? (normalized as WddRegion)
    : DEFAULT_REGION;
}

function parseInitialMetric(value: string | null): WddMetric {
  const normalized = value?.trim().toLowerCase();
  return normalized && METRIC_OPTIONS.some((option) => option.value === normalized)
    ? (normalized as WddMetric)
    : DEFAULT_METRIC;
}

function parseInitialCycle(value: string | null): WddCycle {
  const normalized = value?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
  if (!normalized || normalized === "LATEST") return DEFAULT_CYCLE;
  if (
    normalized === "00" ||
    normalized === "0" ||
    normalized === "0Z" ||
    normalized === "00Z" ||
    normalized === "FIRST" ||
    normalized === "FIRSTFORECAST" ||
    normalized === "FIRSTRUN" ||
    normalized === "PRIMARY"
  ) {
    return "00Z";
  }
  if (
    normalized === "12" ||
    normalized === "12Z" ||
    normalized === "OTHER" ||
    normalized === "OTHERFORECAST" ||
    normalized === "OTHERRUN" ||
    normalized === "SECOND" ||
    normalized === "SECONDFORECAST" ||
    normalized === "SECONDRUN" ||
    normalized === "INTRADAY"
  ) {
    return "12Z";
  }
  return DEFAULT_CYCLE;
}

function buildApiUrl({
  region,
  metric,
  cycle,
  refresh,
}: {
  region: WddRegion;
  metric: WddMetric;
  cycle: WddCycle;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({
    region,
    metric,
    cycle,
    periodMode: "eiaWeeks",
    report: "1",
  });
  if (refresh) params.set("refresh", "1");
  return `/api/weather/wsi-wdd-forecast-changes?${params.toString()}`;
}

function buildCacheKey({
  region,
  metric,
  cycle,
}: {
  region: WddRegion;
  metric: WddMetric;
  cycle: WddCycle;
}): string {
  return ["api:wsi-weather-report", region, metric, cycle].join(":");
}

function fmtNumber(value: number | null | undefined, signed = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  const rounded = Math.round(value * 10) / 10;
  const prefix = signed && rounded > 0 ? "+" : "";
  return `${prefix}${rounded.toLocaleString("en-US", {
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

function normalBasisLabel(basis: NormalBasis): string {
  if (basis === "10yr") return "10yr";
  if (basis === "30yr") return "30yr fallback";
  if (basis === "mixed") return "mixed";
  return "missing";
}

function normalSourceLabel(source: NormalSource): string {
  if (source === "table") return "normal table";
  if (source === "observations") return "observations";
  if (source === "forecast_30yr") return "forecast 30yr";
  if (source === "mixed") return "mixed";
  return "none";
}

function signedValueClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "text-gray-600";
  if (value > 0) return "text-amber-200";
  if (value < 0) return "text-sky-200";
  return "text-gray-400";
}

function thermalTextClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "text-gray-600";
  if (value > 0) return "text-red-100";
  if (value < 0) return "text-blue-100";
  return "text-gray-400";
}

function thermalCellStyle(value: number | null | undefined): CSSProperties | undefined {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return undefined;
  }
  const magnitude = Math.min(1, Math.abs(value) / 12);
  const alpha = 0.18 + magnitude * 0.56;
  const softAlpha = 0.08 + magnitude * 0.2;
  const color = value > 0 ? "127, 29, 29" : "30, 64, 175";
  return {
    background: `linear-gradient(90deg, rgba(${color}, ${softAlpha}) 0%, rgba(${color}, ${alpha}) 100%)`,
  };
}

function coverageClass(done: number, expected: number): string {
  if (expected > 0 && done >= expected) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  if (done > 0) return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-gray-700 bg-gray-950/60 text-gray-500";
}

function completenessClass(value: number): string {
  if (value >= 100) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (value > 0) return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-red-500/30 bg-red-500/10 text-red-200";
}

function modelStatusClass(status: IssueStatus): string {
  if (status === "complete") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "partial") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-gray-700 bg-gray-950/60 text-gray-500";
}

function modelStatusLabel(status: IssueStatus): string {
  if (status === "complete") return "Complete";
  if (status === "partial") return "Partial";
  return "Missing";
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

function StatusStrip({
  payload,
  report,
}: {
  payload: WsiWeatherReportPayload;
  report: WsiWeatherReport;
}) {
  const issueStamp = report.status.issueAtUtc ?? report.status.scrapeRunAtUtc;
  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] px-3 py-2 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-100">
          WSI primary
        </span>
        <span className="rounded-md border border-gray-700 bg-gray-950/60 px-2 py-1 text-[11px] text-gray-400">
          Region{" "}
          <span className="font-semibold tabular-nums text-gray-200">
            {payload.filters.region}
          </span>
        </span>
        <span className="rounded-md border border-gray-700 bg-gray-950/60 px-2 py-1 text-[11px] text-gray-400">
          Metric{" "}
          <span className="font-semibold text-gray-200">
            {report.metricLabel}
          </span>
        </span>
        <span className="rounded-md border border-gray-700 bg-gray-950/60 px-2 py-1 text-[11px] text-gray-400">
          Issue{" "}
          <span className="font-semibold tabular-nums text-gray-200">
            {fmtStamp(issueStamp)}
          </span>
        </span>
        <span className="rounded-md border border-gray-700 bg-gray-950/60 px-2 py-1 text-[11px] text-gray-400">
          Cycle{" "}
          <span className="font-semibold tabular-nums text-gray-200">
            {report.status.cycle ?? payload.filters.cycle}
          </span>
        </span>
        <span className="rounded-md border border-gray-700 bg-gray-950/60 px-2 py-1 text-[11px] text-gray-400">
          Normal{" "}
          <span className="font-semibold text-gray-200">
            {normalBasisLabel(report.status.normalBasis)} / {normalSourceLabel(report.status.normalSource)}
          </span>
        </span>
        <span
          className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${coverageClass(
            report.status.priorYearCoverageDays,
            report.status.expectedPriorYearDays,
          )}`}
        >
          Prior Yr {report.status.priorYearCoverageDays}/{report.status.expectedPriorYearDays}d
        </span>
        <span
          className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${completenessClass(
            report.status.completenessPct,
          )}`}
        >
          Complete {report.status.completenessPct}%
        </span>
        <span className="rounded-md border border-gray-700 bg-gray-950/60 px-2 py-1 text-[11px] text-gray-400">
          Window{" "}
          <span className="font-semibold tabular-nums text-gray-200">
            {report.status.forecastWindow}
          </span>
        </span>
      </div>
    </section>
  );
}

function HeadlineCard({ headlines }: { headlines: string[] }) {
  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-100">Auto Headlines</h2>
        <span className="h-px flex-1 bg-gray-800" />
      </div>
      <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {headlines.map((headline, index) => (
          <li
            key={`${index}-${headline}`}
            className="flex min-w-0 gap-2 rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-2 text-xs leading-5 text-gray-300"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-700 bg-gray-900 text-[10px] font-semibold text-gray-500">
              {index + 1}
            </span>
            <span className="min-w-0">{headline}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function priorYearCell(row: WsiReportRow): ReactNode {
  const partial = row.priorYearDayCount !== row.dayCount;
  return (
    <span className="tabular-nums">
      {fmtNumber(row.priorYear)}
      {partial && (
        <span className="ml-1 text-[9px] font-normal text-gray-600">
          {row.priorYearDayCount}/{row.dayCount}d
        </span>
      )}
    </span>
  );
}

function ReportTable({
  title,
  subtitle,
  rows,
  show12hChange,
}: {
  title: string;
  subtitle: string;
  rows: WsiReportRow[];
  show12hChange: boolean;
}) {
  const totalRow = rows.find((row) => row.key === "total");
  return (
    <DataTableShell
      title={title}
      subtitle={subtitle}
      className="min-w-0"
      bodyClassName="bg-[#0d1119]"
      action={
        totalRow ? (
          <span className="rounded-md border border-gray-700 bg-gray-950/70 px-2 py-0.5 text-[11px] font-semibold text-gray-400">
            {totalRow.dayCount}d total
          </span>
        ) : null
      }
    >
      <table className="min-w-[760px] w-full table-fixed border-collapse bg-[#0d1119] text-[11px] text-gray-200">
        <thead className="bg-gray-950 text-gray-400">
          <tr>
            <th className="w-[150px] border border-gray-800 px-2 py-2 text-left font-semibold uppercase tracking-wide">
              Period
            </th>
            <th className="w-[48px] border border-gray-800 px-1.5 py-2 text-right font-semibold uppercase tracking-wide">
              Days
            </th>
            <th className="w-[88px] border border-gray-800 px-1.5 py-2 text-right font-semibold uppercase tracking-wide">
              Forecast
            </th>
            {show12hChange && (
              <th className="w-[74px] border border-gray-800 px-1.5 py-2 text-right font-semibold uppercase tracking-wide">
                12h
              </th>
            )}
            <th className="w-[74px] border border-gray-800 px-1.5 py-2 text-right font-semibold uppercase tracking-wide">
              24h
            </th>
            <th className="w-[88px] border border-gray-800 px-1.5 py-2 text-right font-semibold uppercase tracking-wide">
              10yr Norm
            </th>
            <th className="w-[96px] border border-gray-800 px-1.5 py-2 text-right font-semibold uppercase tracking-wide">
              Prior Yr
            </th>
            <th className="w-[86px] border border-gray-800 px-1.5 py-2 text-right font-semibold uppercase tracking-wide">
              Vs 10yr
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isTotal = row.key === "total";
            const thermalChange12h = row.thermalChange12h ?? row.change12h;
            const thermalChange24h = row.thermalChange24h ?? row.change24h;
            return (
              <tr
                key={row.key}
                className={isTotal ? "bg-gray-900/80 font-semibold" : "odd:bg-gray-950/30"}
                title={row.dateRange}
              >
                <td className="border border-gray-800 px-2 py-1.5 align-top">
                  <span className="block truncate text-gray-100">{row.label}</span>
                  <span className="block truncate text-[9px] font-normal text-gray-600">
                    {row.dateRange}
                  </span>
                </td>
                <td className="border border-gray-800 px-1.5 py-1.5 text-right tabular-nums text-gray-400">
                  {row.dayCount}
                </td>
                <td className="border border-gray-800 px-1.5 py-1.5 text-right tabular-nums text-gray-100">
                  {fmtNumber(row.forecast)}
                </td>
                {show12hChange && (
                  <td
                    className={`border border-gray-800 px-1.5 py-1.5 text-right tabular-nums ${thermalTextClass(
                      thermalChange12h,
                    )}`}
                    style={thermalCellStyle(thermalChange12h)}
                  >
                    {fmtNumber(row.change12h, true)}
                  </td>
                )}
                <td
                  className={`border border-gray-800 px-1.5 py-1.5 text-right tabular-nums ${thermalTextClass(
                    thermalChange24h,
                  )}`}
                  style={thermalCellStyle(thermalChange24h)}
                >
                  {fmtNumber(row.change24h, true)}
                </td>
                <td className="border border-gray-800 px-1.5 py-1.5 text-right tabular-nums text-violet-100">
                  {fmtNumber(row.normal10yr)}
                </td>
                <td className="border border-gray-800 px-1.5 py-1.5 text-right text-gray-200">
                  {priorYearCell(row)}
                </td>
                <td
                  className={`border border-gray-800 px-1.5 py-1.5 text-right tabular-nums ${thermalTextClass(
                    row.thermalDeparture,
                  )}`}
                  style={thermalCellStyle(row.thermalDeparture)}
                >
                  {fmtNumber(row.vsNormal, true)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DataTableShell>
  );
}

function KpiStrip({ report }: { report: WsiWeatherReport }) {
  const total = report.dayBuckets.find((row) => row.key === "total");
  const spread = report.modelSpread;
  const kpis = [
    {
      label: "15d WSI vs 10yr",
      value: total
        ? `${fmtNumber(total.forecast)} / ${fmtNumber(total.normal10yr)}`
        : "--",
      detail: total ? `Vs 10yr ${fmtNumber(total.vsNormal, true)}` : "Vs 10yr --",
      detailClass: total ? thermalTextClass(total.thermalDeparture) : "text-gray-600",
      detailStyle: total ? thermalCellStyle(total.thermalDeparture) : undefined,
    },
    {
      label: "24h WSI Change",
      value: total ? fmtNumber(total.change24h, true) : "--",
      detail: `${report.metricLabel} issue-over-issue`,
      detailClass: total ? thermalTextClass(total.thermalChange24h ?? total.change24h) : "text-gray-600",
      detailStyle: total ? thermalCellStyle(total.thermalChange24h ?? total.change24h) : undefined,
    },
    {
      label: "Prior Year",
      value:
        total?.vsPriorYear !== null && total?.vsPriorYear !== undefined
          ? fmtNumber(total.vsPriorYear, true)
          : "--",
      detail: total
        ? `${total.priorYearDayCount}/${total.dayCount} matched days`
        : "matched days --",
      detailClass: total ? signedValueClass(total.vsPriorYear) : "text-gray-600",
      detailStyle: undefined,
    },
    {
      label: "Model Spread",
      value: fmtNumber(spread.spread),
      detail:
        spread.lowModel && spread.highModel
          ? `${spread.lowModel} to ${spread.highModel} / ${spread.supportingModelCount} supporting`
          : `${spread.supportingModelCount} supporting models`,
      detailClass: "text-gray-400",
      detailStyle: undefined,
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-lg border border-gray-800 bg-[#12141d] px-3 py-2 shadow-xl shadow-black/20"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {kpi.label}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-gray-100">
            {kpi.value}
          </p>
          <p
            className={`mt-1 w-fit rounded px-1.5 py-0.5 text-[11px] tabular-nums ${kpi.detailClass}`}
            style={kpi.detailStyle}
          >
            {kpi.detail}
          </p>
        </div>
      ))}
    </section>
  );
}

function MatrixSignedCell({
  value,
  thermalValue,
}: {
  value: number | null;
  thermalValue: number | null;
}) {
  return (
    <td
      className={`border border-gray-800 px-1.5 py-1.5 text-right tabular-nums ${thermalTextClass(
        thermalValue,
      )}`}
      style={thermalCellStyle(thermalValue)}
    >
      {fmtNumber(value, true)}
    </td>
  );
}

function ModelChangeMatrix({
  rows,
  metricLabel,
}: {
  rows: WsiReportModelChange[];
  metricLabel: string;
}) {
  return (
    <DataTableShell
      title="Model Change Matrix"
      subtitle={`${metricLabel} 15-day totals and source-provided change fields. WSI is the baseline forecast.`}
      bodyClassName="bg-[#0d1119]"
      action={
        <span className="rounded-md border border-gray-700 bg-gray-950/70 px-2 py-0.5 text-[11px] font-semibold text-gray-400">
          {rows.length} models
        </span>
      }
    >
      <table className="min-w-[980px] w-full table-fixed border-collapse bg-[#0d1119] text-[11px] text-gray-200">
        <thead className="bg-gray-950 text-gray-400">
          <tr>
            <th className="w-[124px] border border-gray-800 px-2 py-2 text-left font-semibold uppercase tracking-wide">
              Model
            </th>
            <th className="w-[116px] border border-gray-800 px-2 py-2 text-left font-semibold uppercase tracking-wide">
              Status
            </th>
            <th className="w-[170px] border border-gray-800 px-2 py-2 text-left font-semibold uppercase tracking-wide">
              Issue / Cycle
            </th>
            <th className="w-[96px] border border-gray-800 px-1.5 py-2 text-right font-semibold uppercase tracking-wide">
              15d Fcst
            </th>
            <th className="w-[84px] border border-gray-800 px-1.5 py-2 text-right font-semibold uppercase tracking-wide">
              Vs WSI
            </th>
            <th className="w-[74px] border border-gray-800 px-1.5 py-2 text-right font-semibold uppercase tracking-wide">
              12h
            </th>
            <th className="w-[74px] border border-gray-800 px-1.5 py-2 text-right font-semibold uppercase tracking-wide">
              24h
            </th>
            <th className="w-[74px] border border-gray-800 px-1.5 py-2 text-right font-semibold uppercase tracking-wide">
              48h
            </th>
            <th className="w-[74px] border border-gray-800 px-1.5 py-2 text-right font-semibold uppercase tracking-wide">
              72h
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isPrimary = row.model === "WSI";
            return (
              <tr
                key={row.model}
                className={isPrimary ? "bg-sky-500/10 font-semibold" : "odd:bg-gray-950/30"}
                title={row.issueKey ?? undefined}
              >
                <td className="border border-gray-800 px-2 py-1.5 text-gray-100">
                  <span className="flex items-center gap-2">
                    {row.model}
                    {isPrimary && (
                      <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-100">
                        Base
                      </span>
                    )}
                  </span>
                </td>
                <td className="border border-gray-800 px-2 py-1.5">
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${modelStatusClass(
                      row.status,
                    )}`}
                  >
                    {modelStatusLabel(row.status)} {row.completenessPct}%
                  </span>
                  <span className="mt-0.5 block text-[9px] text-gray-600">
                    {row.forecastDayCount}/{row.expectedDayCount}d
                  </span>
                </td>
                <td className="border border-gray-800 px-2 py-1.5 text-gray-400">
                  <span className="block truncate font-semibold text-gray-200">
                    {row.cycle ?? "--"}
                  </span>
                  <span className="block truncate text-[9px] text-gray-600">
                    {fmtStamp(row.issueAtUtc ?? row.scrapeRunAtUtc)}
                  </span>
                </td>
                <td className="border border-gray-800 px-1.5 py-1.5 text-right tabular-nums text-gray-100">
                  {fmtNumber(row.forecast)}
                </td>
                <MatrixSignedCell
                  value={row.vsWsiForecast}
                  thermalValue={row.thermalVsWsiForecast}
                />
                <MatrixSignedCell
                  value={row.change12h}
                  thermalValue={row.thermalChange12h}
                />
                <MatrixSignedCell
                  value={row.change24h}
                  thermalValue={row.thermalChange24h}
                />
                <MatrixSignedCell
                  value={row.change48h}
                  thermalValue={row.thermalChange48h}
                />
                <MatrixSignedCell
                  value={row.change72h}
                  thermalValue={row.thermalChange72h}
                />
              </tr>
            );
          })}
        </tbody>
      </table>
    </DataTableShell>
  );
}
export default function WsiWeatherReportDashboard() {
  const searchParams = useSearchParams();
  const [region, setRegion] = useState<WddRegion>(() =>
    parseInitialRegion(searchParams.get("region")),
  );
  const [metric, setMetric] = useState<WddMetric>(() =>
    parseInitialMetric(searchParams.get("metric")),
  );
  const [cycle, setCycle] = useState<WddCycle>(() =>
    parseInitialCycle(searchParams.get("cycle")),
  );
  const [refreshCount, setRefreshCount] = useState(() =>
    searchParams.get("refresh") === "1" ? 1 : 0,
  );
  const [payload, setPayload] = useState<WsiWeatherReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const forceRefresh = refreshCount > 0;
  const apiUrl = useMemo(
    () => buildApiUrl({ region, metric, cycle, refresh: forceRefresh }),
    [cycle, forceRefresh, metric, region],
  );
  const cacheKey = useMemo(
    () => buildCacheKey({ region, metric, cycle }),
    [cycle, metric, region],
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchJsonWithCache<WsiWeatherReportPayload>({
      key: cacheKey,
      url: apiUrl,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
    })
      .then((data) => {
        if (!active) return;
        setPayload(data);
        if (!data.report) {
          setError("WSI report payload is missing from the API response.");
        }
      })
      .catch((fetchError: unknown) => {
        if (!active) return;
        if (fetchError instanceof Error && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load WSI report.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [apiUrl, cacheKey, forceRefresh, refreshCount]);

  const report = payload?.report;
  const filtersChanged =
    region !== DEFAULT_REGION || metric !== DEFAULT_METRIC || cycle !== DEFAULT_CYCLE;
  const ready = !loading;

  return (
    <div
      className="space-y-4"
      data-perf-ready={ready ? "wsi-weather-report" : undefined}
    >
      <ControlCard title="WSI Report">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Filters
            </span>
            <span className="h-px flex-1 bg-gray-800" />
            <span className="text-xs text-gray-500">
              {report
                ? `${report.status.completenessPct}% WSI / ${report.status.priorYearCoverageDays}/${report.status.expectedPriorYearDays} prior-year days`
                : "WSI primary forecast report"}
            </span>
          </div>

          <div className="space-y-2 rounded-md border border-gray-800 bg-gray-950/30 p-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Region
            </span>
            <DashboardTabs
              tabs={REGION_TAB_OPTIONS}
              activeValue={region}
              onChange={setRegion}
              ariaLabel="WSI report region"
            />
          </div>
          <FilterPills
            label="Metric"
            options={METRIC_OPTIONS}
            value={metric}
            onChange={setMetric}
          />
          <FilterPills
            label="Cycle"
            options={CYCLE_OPTIONS}
            value={cycle}
            onChange={setCycle}
          />

          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>
              Region{" "}
              <span className="font-semibold tabular-nums text-gray-300">
                {payload?.filters.region ?? region}
              </span>
            </span>
            <span className="text-gray-700">/</span>
            <span>
              Metric{" "}
              <span className="font-semibold tabular-nums text-gray-300">
                {report?.metricLabel ?? metric}
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
              Rows{" "}
              <span className="font-semibold tabular-nums text-gray-300">
                {payload ? payload.rowCounts.rawRows.toLocaleString() : "--"}
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
                  setRegion(DEFAULT_REGION);
                  setMetric(DEFAULT_METRIC);
                  setCycle(DEFAULT_CYCLE);
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

      {loading && !report ? (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-5 text-sm text-gray-500">
          Loading WSI report...
        </div>
      ) : report && payload ? (
        <>
          <StatusStrip payload={payload} report={report} />
          <KpiStrip report={report} />
          <HeadlineCard headlines={report.headlines} />
          <ModelChangeMatrix rows={report.modelChanges ?? []} metricLabel={report.metricLabel} />
          <section className="grid w-full grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.85fr)]">
            <ReportTable
              title="EIA Weeks"
              subtitle="Friday week-ending WSI forecast summary."
              rows={report.eiaWeeks}
              show12hChange={report.status.show12hChange}
            />
            <ReportTable
              title="Day Buckets"
              subtitle="Fixed Days 1-5, 6-10, and 11-15 buckets."
              rows={report.dayBuckets}
              show12hChange={report.status.show12hChange}
            />
          </section>
        </>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-5 text-sm text-gray-500">
          No WSI report rows match the selected filters.
        </div>
      )}
    </div>
  );
}
