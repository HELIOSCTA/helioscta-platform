"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import ControlCard from "@/components/dashboard/ControlCard";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import {
  MAX_POWER_LMP_SPARK_HEAT_RATE,
  MIN_POWER_LMP_SPARK_HEAT_RATE,
  normalizePowerLmpSparkHeatRate,
  parsePowerLmpSparkHeatRate,
} from "@/lib/powerLmpHeatRate";

type PowerIso = "pjm" | "ercot" | "isone" | "caiso" | "miso" | "spp" | "nyiso";
type RtLmpSource = "verified" | "unverified";
type PowerSettlesComponent = "total" | "energy" | "congestion" | "loss";
type DashboardStatus = "ok" | "partial" | "missing";
type RtSourceStatus = "requested" | "fallback" | "single-source";

interface ProductSummary {
  flatAvg: number | null;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  peakHour: number | null;
  peakPrice: number | null;
  observationCount: number;
}

interface PowerSettlesInputSummary {
  gasHub: string;
  gasHubLabel: string;
  gasSymbol: string;
  gasMetadataStatus: string;
  gasReviewStatus: string;
  units: "MMBtu/MWh";
  sparkUnits: "$/MWh";
  sparkHeatRate: number;
  sourceTable: "ice_python_next_day_gas";
  latestGasDay: string | null;
  latestTradeDate: string | null;
  latestAsOf: string | null;
  gas: ProductSummary;
  daHeatRate: ProductSummary;
  rtHeatRate: ProductSummary;
  daSpark: ProductSummary;
  rtSpark: ProductSummary;
}

interface DashboardIsoRow {
  iso: PowerIso;
  isoLabel: string;
  hub: string;
  effectiveComponent: PowerSettlesComponent;
  effectiveRtSource: RtLmpSource;
  rtSourceStatus: RtSourceStatus;
  targetDate: string | null;
  latestDaDate: string | null;
  latestRtDate: string | null;
  daAsOf: string | null;
  rtAsOf: string | null;
  dataAsOf: string | null;
  sourceTables: {
    da: string;
    rt: string;
  };
  status: DashboardStatus;
  statusDetail: string;
  detailUrl: string | null;
  products: {
    da: ProductSummary;
    rt: ProductSummary;
    dart: ProductSummary;
  };
  inputs?: PowerSettlesInputSummary | null;
}

interface PowerSettlesDashboardPayload {
  component: PowerSettlesComponent;
  rtSource: RtLmpSource;
  lookbackDays: number;
  sparkHeatRate: number;
  requestedDate: string | null;
  defaultDate: string;
  datePolicy: "requested" | "default-yesterday";
  rows: DashboardIsoRow[];
  summary: {
    isoCount: number;
    completeIsoCount: number;
    partialIsoCount: number;
    missingIsoCount: number;
    hubCount: number;
    completeHubCount: number;
    partialHubCount: number;
    missingHubCount: number;
    unverifiedFallbackHubCount: number;
    latestAsOf: string | null;
  };
}

const API_CACHE_SCHEMA_VERSION = "dashboard-spark-v5";
const API_CACHE_TTL_MS = 5 * 60 * 1000;
const COMPONENT_TABS: Array<{ value: PowerSettlesComponent; label: string }> = [
  { value: "total", label: "Total" },
  { value: "energy", label: "Energy" },
  { value: "congestion", label: "Congestion" },
  { value: "loss", label: "Loss" },
];
const PINNED_REPORT_ISO_ORDER: PowerIso[] = ["pjm", "ercot"];

function buildApiUrl({
  date,
  lookbackDays,
  rtSource,
  component,
  sparkHeatRate,
  refresh,
}: {
  date: string | null;
  lookbackDays: number;
  rtSource: RtLmpSource;
  component: PowerSettlesComponent;
  sparkHeatRate: number;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({
    lookbackDays: String(lookbackDays),
    rtSource,
    component,
    sparkHeatRate: sparkHeatRate.toFixed(1),
  });
  if (date) params.set("date", date);
  if (refresh) params.set("refresh", "1");
  return `/api/power-settles-dashboard?${params.toString()}`;
}

function buildCacheKey({
  date,
  lookbackDays,
  rtSource,
  component,
  sparkHeatRate,
}: {
  date: string | null;
  lookbackDays: number;
  rtSource: RtLmpSource;
  component: PowerSettlesComponent;
  sparkHeatRate: number;
}): string {
  return [
    "api:power-settles-dashboard",
    API_CACHE_SCHEMA_VERSION,
    date ?? "default-yesterday",
    lookbackDays,
    rtSource,
    component,
    sparkHeatRate.toFixed(1),
  ].join(":");
}

function parseInitialRtSource(value: string | null): RtLmpSource {
  return value === "unverified" ? "unverified" : "verified";
}

function parseInitialLookbackDays(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(Math.max(parsed, 1), 14);
}

function parseInitialComponent(value: string | null): PowerSettlesComponent {
  if (value === "energy" || value === "congestion" || value === "loss") return value;
  return "total";
}

function parseInitialDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseInitialSparkHeatRate(value: string | null): number {
  return parsePowerLmpSparkHeatRate(value);
}

function fmtPrice(value: number | null, signed = false): string {
  if (value === null || !Number.isFinite(value)) return "-";
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function fmtHeatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(2);
}

function fmtSparkHeatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(1);
}

function fmtStamp(value: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function fmtDate(value: string | null): string {
  return value ?? "-";
}

function statusClass(status: DashboardStatus): string {
  if (status === "ok") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "partial") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-red-500/30 bg-red-500/10 text-red-200";
}

function statusLabel(status: DashboardStatus): string {
  if (status === "ok") return "Complete";
  if (status === "partial") return "Partial";
  return "Missing";
}

function dartClass(value: number | null): string {
  if (value === null) return "text-gray-500";
  if (value > 0) return "text-emerald-200";
  if (value < 0) return "text-red-200";
  return "text-gray-200";
}

function metricCell(value: number | null, signed = false) {
  const unavailable = value === null || !Number.isFinite(value);
  return (
    <span className={`tabular-nums ${unavailable ? "text-gray-500" : signed ? dartClass(value) : "text-gray-200"}`}>
      {fmtPrice(value, signed)}
    </span>
  );
}

function sparkCell(value: number | null) {
  const unavailable = value === null || !Number.isFinite(value);
  const className = unavailable
    ? "text-gray-500"
    : value < 0
      ? "text-red-200"
      : value > 0
        ? "text-emerald-200"
        : "text-gray-200";
  return <span className={`tabular-nums ${className}`}>{fmtPrice(value)}</span>;
}

function periodValue(
  summary: ProductSummary,
  period: "onPeak" | "offPeak",
): number | null {
  return period === "onPeak" ? summary.onPeakAvg : summary.offPeakAvg;
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

function SparkHeatRateInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
        Spark HR
      </span>
      <input
        type="number"
        min={MIN_POWER_LMP_SPARK_HEAT_RATE}
        max={MAX_POWER_LMP_SPARK_HEAT_RATE}
        step={0.1}
        value={value.toFixed(1)}
        onChange={(event) => {
          if (event.target.value === "") return;
          onChange(Number(event.target.value));
        }}
        className="h-8 w-24 rounded-md border border-gray-700 bg-gray-900 px-2 text-xs tabular-nums text-gray-200 focus:border-gray-500 focus:outline-none"
      />
      <span className="text-[11px] text-gray-500">MMBtu/MWh</span>
    </div>
  );
}

function sourceBadge(row: DashboardIsoRow) {
  if (row.rtSourceStatus === "fallback") {
    const label = row.iso === "miso" ? "Prelim RT" : "Unverified RT";
    const title =
      row.iso === "miso"
        ? "Final RT was unavailable or less complete, so this hub uses preliminary RT."
        : "Verified RT was unavailable or less complete, so this hub uses unverified RT.";
    return {
      label,
      className: "border-amber-500/35 bg-amber-500/10 text-amber-200",
      title,
    };
  }
  if (row.rtSourceStatus === "single-source") {
    const label =
      row.iso === "ercot"
        ? "Settlement RT"
        : row.iso === "caiso"
          ? "Five-Min RT"
          : "Prelim RT";
    return {
      label,
      className: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
      title: "This ISO uses the single promoted RT source available in the LMP page.",
    };
  }
  if (row.effectiveRtSource === "verified") {
    return {
      label: row.iso === "miso" ? "Final RT" : "Verified RT",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      title: row.iso === "miso" ? "This hub uses final RT data." : "This hub uses verified RT data.",
    };
  }
  return {
    label: row.iso === "miso" ? "Prelim RT" : "Unverified RT",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-200",
    title: row.iso === "miso" ? "This hub uses preliminary RT data." : "This hub uses unverified RT data.",
  };
}

function isoStatus(rows: DashboardIsoRow[]): DashboardStatus {
  if (rows.length > 0 && rows.every((row) => row.status === "ok")) return "ok";
  if (rows.some((row) => row.status !== "missing")) return "partial";
  return "missing";
}

function summaryStatus(summary: PowerSettlesDashboardPayload["summary"]): DashboardStatus {
  if (summary.hubCount > 0 && summary.completeHubCount === summary.hubCount) return "ok";
  if (summary.completeHubCount > 0 || summary.partialHubCount > 0) return "partial";
  return "missing";
}

function isoDomId(iso: PowerIso): string {
  return iso.replace(/[^a-z0-9_-]/gi, "-");
}

function maxReportStamp(rows: DashboardIsoRow[]): string {
  const stamps = rows.map((row) => row.dataAsOf).filter((value): value is string => Boolean(value));
  return fmtStamp(stamps.sort().at(-1) ?? null);
}

function SummaryToken({
  label,
  value,
  tone = "neutral",
  title,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "partial" | "source";
  title?: string;
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
      : tone === "partial"
        ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
        : tone === "source"
          ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-100"
          : "border-gray-800 bg-gray-950/50 text-gray-300";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${toneClass}`}
      title={title}
    >
      <span className="font-semibold text-gray-500">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function IsoSummaryPill({ group }: { group: DashboardIsoGroup }) {
  const completeCount = group.rows.filter((row) => row.status === "ok").length;
  const fallbackCount = group.rows.filter((row) => row.rtSourceStatus === "fallback").length;
  const singleSourceCount = group.rows.filter((row) => row.rtSourceStatus === "single-source").length;
  const status = isoStatus(group.rows);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold ${statusClass(status)}`}
      title={`${group.isoLabel}: ${completeCount}/${group.rows.length} hubs complete${
        fallbackCount > 0 ? `; ${fallbackCount} RT fallback` : ""
      }${singleSourceCount > 0 ? `; ${singleSourceCount} single-source RT` : ""}.`}
    >
      <span>{group.isoLabel}</span>
      <span className="tabular-nums text-gray-200">
        {completeCount}/{group.rows.length}
      </span>
      {fallbackCount > 0 && (
        <span className="rounded-sm bg-amber-950/70 px-1 text-amber-100">
          {fallbackCount} fallback
        </span>
      )}
      {singleSourceCount > 0 && (
        <span className="rounded-sm bg-cyan-950/70 px-1 text-cyan-100">
          single RT
        </span>
      )}
    </span>
  );
}

function ReportBandHeader({
  title,
  meta,
}: {
  title: string;
  meta?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-700/80 pb-1.5">
      <h3 className="text-sm font-semibold tracking-wide text-sky-100">
        {title}
      </h3>
      {meta && (
        <span className="rounded-md border border-gray-700 bg-gray-950/70 px-2 py-0.5 text-[11px] font-semibold text-gray-300">
          {meta}
        </span>
      )}
    </div>
  );
}

function DetailLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return <span className="text-gray-600">-</span>;
  return (
    <a
      href={href}
      className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold text-gray-300 transition-colors hover:border-sky-500/50 hover:bg-gray-700 hover:text-white"
    >
      {label}
    </a>
  );
}

function LmpDetailLink({ href }: { href: string | null }) {
  return <DetailLink href={href} label="LMPs" />;
}

function heatRateDetailUrl(row: DashboardIsoRow): string | null {
  if (!row.detailUrl || !row.inputs) return null;
  const url = new URL(row.detailUrl, "https://helios.local");
  url.searchParams.set("product", "da");
  url.searchParams.set("metric", "heat-rate");
  url.searchParams.set("gasHub", row.inputs.gasHub);
  url.searchParams.set("refresh", "1");
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function HeatRateDetailLink({ row }: { row: DashboardIsoRow }) {
  return <DetailLink href={heatRateDetailUrl(row)} label="HRs" />;
}

function sparkDetailUrl(row: DashboardIsoRow): string | null {
  if (!row.detailUrl || !row.inputs) return null;
  const url = new URL(row.detailUrl, "https://helios.local");
  url.searchParams.set("product", "da");
  url.searchParams.set("metric", "spark-spread");
  url.searchParams.set("component", "total");
  url.searchParams.set("gasHub", row.inputs.gasHub);
  url.searchParams.set("sparkHeatRate", row.inputs.sparkHeatRate.toFixed(1));
  url.searchParams.set("refresh", "1");
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function SparkDetailLink({ row }: { row: DashboardIsoRow }) {
  return <DetailLink href={sparkDetailUrl(row)} label="Spark" />;
}

function HeatRateMetric({ value }: { value: number | null }) {
  return (
    <span className={`tabular-nums ${value === null || !Number.isFinite(value) ? "text-gray-500" : "text-gray-200"}`}>
      {fmtHeatRate(value)}
    </span>
  );
}

function LmpPeriodCells({
  row,
  period,
}: {
  row: DashboardIsoRow;
  period: "onPeak" | "offPeak";
}) {
  return (
    <>
      <td className="border-l border-gray-800 px-2 py-1.5 text-right">
        {metricCell(periodValue(row.products.da, period))}
      </td>
      <td className="px-2 py-1.5 text-right">
        {metricCell(periodValue(row.products.rt, period))}
      </td>
      <td className="px-2 py-1.5 text-right">
        {metricCell(periodValue(row.products.dart, period), true)}
      </td>
    </>
  );
}

function HeatRatePeriodCells({
  row,
  period,
}: {
  row: DashboardIsoRow;
  period: "onPeak" | "offPeak";
}) {
  const daHeatRate = row.inputs ? periodValue(row.inputs.daHeatRate, period) : null;
  const rtHeatRate = row.inputs ? periodValue(row.inputs.rtHeatRate, period) : null;
  const gas = row.inputs ? periodValue(row.inputs.gas, period) : null;

  return (
    <>
      <td className="border-l border-gray-800 px-2 py-1.5 text-right">
        <HeatRateMetric value={daHeatRate} />
      </td>
      <td className="px-2 py-1.5 text-right">
        <HeatRateMetric value={rtHeatRate} />
      </td>
      <td className="px-2 py-1.5 text-right">{metricCell(gas)}</td>
    </>
  );
}

function SparkPeriodCells({
  row,
  period,
}: {
  row: DashboardIsoRow;
  period: "onPeak" | "offPeak";
}) {
  const daSpark = row.inputs ? periodValue(row.inputs.daSpark, period) : null;
  const rtSpark = row.inputs ? periodValue(row.inputs.rtSpark, period) : null;
  const gas = row.inputs ? periodValue(row.inputs.gas, period) : null;

  return (
    <>
      <td className="border-l border-gray-800 px-2 py-1.5 text-right">
        {sparkCell(daSpark)}
      </td>
      <td className="px-2 py-1.5 text-right">
        {sparkCell(rtSpark)}
      </td>
      <td className="px-2 py-1.5 text-right">{metricCell(gas)}</td>
    </>
  );
}

function LmpReportBand({
  title,
  rows,
}: {
  title: string;
  rows: DashboardIsoRow[];
}) {
  return (
    <section className="w-max flex-none space-y-2" aria-label={title}>
      <ReportBandHeader title={title} meta={`${rows.length} ${rows.length === 1 ? "hub" : "hubs"}`} />
      <div>
        <table className="w-max table-auto border-collapse text-xs text-gray-200 whitespace-nowrap">
          <thead className="bg-gray-950/50 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            <tr className="border-b border-gray-800/80">
              <th rowSpan={2} className="bg-gray-950 px-2 py-1.5 text-left">
                Hub
              </th>
              <th rowSpan={2} className="px-2 py-1.5 text-left">Source</th>
              <th rowSpan={2} className="px-2 py-1.5 text-left">Status</th>
              <th rowSpan={2} className="px-2 py-1.5 text-right">LMPs</th>
              <th colSpan={3} className="border-l border-gray-800 px-2 py-1 text-center normal-case text-gray-500">
                OnPk
              </th>
              <th colSpan={3} className="border-l border-gray-800 px-2 py-1 text-center normal-case text-gray-500">
                OffPeak
              </th>
            </tr>
            <tr className="border-b border-gray-800/80">
              <th className="border-l border-gray-800 px-2 py-1 text-right">DA</th>
              <th className="px-2 py-1 text-right">RT</th>
              <th className="px-2 py-1 text-right">DART</th>
              <th className="border-l border-gray-800 px-2 py-1 text-right">DA</th>
              <th className="px-2 py-1 text-right">RT</th>
              <th className="px-2 py-1 text-right">DART</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/70 bg-[#0d1119]">
            {rows.map((row) => {
              const badge = sourceBadge(row);
              return (
                <tr key={`${row.iso}-${row.hub}-lmps`} className="hover:bg-gray-900/60" title={row.statusDetail}>
                  <td className="bg-[#0d1119] px-2 py-1.5 font-semibold text-gray-300" title={row.hub}>
                    {row.hub}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
                      title={badge.title}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${statusClass(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <LmpDetailLink href={row.detailUrl} />
                  </td>
                  <LmpPeriodCells row={row} period="onPeak" />
                  <LmpPeriodCells row={row} period="offPeak" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HeatRateReportBand({
  title,
  rows,
}: {
  title: string;
  rows: DashboardIsoRow[];
}) {
  return (
    <section className="w-max flex-none space-y-2" aria-label={title}>
      <ReportBandHeader title={title} meta="DA HR / RT HR / Gas" />
      <div>
        <table className="w-max table-auto border-collapse text-xs text-gray-200 whitespace-nowrap">
          <thead className="bg-gray-950/50 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            <tr className="border-b border-gray-800/80">
              <th rowSpan={2} className="bg-gray-950 px-2 py-1.5 text-left">
                Hub
              </th>
              <th rowSpan={2} className="px-2 py-1.5 text-left">Gas Hub</th>
              <th rowSpan={2} className="px-2 py-1.5 text-right">HRs</th>
              <th colSpan={3} className="border-l border-gray-800 px-2 py-1 text-center normal-case text-gray-500">
                OnPk
              </th>
              <th colSpan={3} className="border-l border-gray-800 px-2 py-1 text-center normal-case text-gray-500">
                OffPeak
              </th>
            </tr>
            <tr className="border-b border-gray-800/80">
              <th className="border-l border-gray-800 px-2 py-1 text-right">DA HR</th>
              <th className="px-2 py-1 text-right">RT HR</th>
              <th className="px-2 py-1 text-right">Gas</th>
              <th className="border-l border-gray-800 px-2 py-1 text-right">DA HR</th>
              <th className="px-2 py-1 text-right">RT HR</th>
              <th className="px-2 py-1 text-right">Gas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/70 bg-[#0d1119]">
            {rows.map((row) => (
              <tr key={`${row.iso}-${row.hub}-hrs`} className="hover:bg-gray-900/60">
                <td className="bg-[#0d1119] px-2 py-1.5 font-semibold text-gray-300" title={row.hub}>
                  {row.hub}
                </td>
                <td className="px-2 py-1.5 text-gray-400">
                  {row.inputs?.gasHubLabel ?? "-"}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <HeatRateDetailLink row={row} />
                </td>
                <HeatRatePeriodCells row={row} period="onPeak" />
                <HeatRatePeriodCells row={row} period="offPeak" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SparkReportBand({
  title,
  rows,
  sparkHeatRate,
}: {
  title: string;
  rows: DashboardIsoRow[];
  sparkHeatRate: number;
}) {
  return (
    <section className="w-max flex-none space-y-2" aria-label={title}>
      <ReportBandHeader title={title} meta={`Spark HR ${fmtSparkHeatRate(sparkHeatRate)}`} />
      <div>
        <table className="w-max table-auto border-collapse text-xs text-gray-200 whitespace-nowrap">
          <thead className="bg-gray-950/50 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            <tr className="border-b border-gray-800/80">
              <th rowSpan={2} className="bg-gray-950 px-2 py-1.5 text-left">
                Hub
              </th>
              <th rowSpan={2} className="px-2 py-1.5 text-left">Gas Hub</th>
              <th rowSpan={2} className="px-2 py-1.5 text-right">Spark HR</th>
              <th rowSpan={2} className="px-2 py-1.5 text-right">Sparks</th>
              <th colSpan={3} className="border-l border-gray-800 px-2 py-1 text-center normal-case text-gray-500">
                OnPk
              </th>
              <th colSpan={3} className="border-l border-gray-800 px-2 py-1 text-center normal-case text-gray-500">
                OffPeak
              </th>
            </tr>
            <tr className="border-b border-gray-800/80">
              <th className="border-l border-gray-800 px-2 py-1 text-right">DA</th>
              <th className="px-2 py-1 text-right">RT</th>
              <th className="px-2 py-1 text-right">Gas</th>
              <th className="border-l border-gray-800 px-2 py-1 text-right">DA</th>
              <th className="px-2 py-1 text-right">RT</th>
              <th className="px-2 py-1 text-right">Gas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/70 bg-[#0d1119]">
            {rows.map((row) => (
              <tr key={`${row.iso}-${row.hub}-sparks`} className="hover:bg-gray-900/60">
                <td className="bg-[#0d1119] px-2 py-1.5 font-semibold text-gray-300" title={row.hub}>
                  {row.hub}
                </td>
                <td className="px-2 py-1.5 text-gray-400">
                  {row.inputs?.gasHubLabel ?? "-"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-300">
                  {fmtSparkHeatRate(row.inputs?.sparkHeatRate ?? null)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <SparkDetailLink row={row} />
                </td>
                <SparkPeriodCells row={row} period="onPeak" />
                <SparkPeriodCells row={row} period="offPeak" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface DashboardIsoGroup {
  iso: PowerIso;
  isoLabel: string;
  rows: DashboardIsoRow[];
}

function orderedIsoGroups(data: PowerSettlesDashboardPayload): DashboardIsoGroup[] {
  const groups: DashboardIsoGroup[] = [];
  const byIso = new Map<PowerIso, DashboardIsoGroup>();

  for (const row of data.rows) {
    let group = byIso.get(row.iso);
    if (!group) {
      group = { iso: row.iso, isoLabel: row.isoLabel, rows: [] };
      byIso.set(row.iso, group);
      groups.push(group);
    }
    group.rows.push(row);
  }

  const ordered = [
    ...PINNED_REPORT_ISO_ORDER.map((iso) => byIso.get(iso)).filter(
      (group): group is DashboardIsoGroup => Boolean(group),
    ),
    ...groups.filter((group) => !PINNED_REPORT_ISO_ORDER.includes(group.iso)),
  ];

  return ordered;
}

function DashboardSummaryStrip({
  data,
  groups,
}: {
  data: PowerSettlesDashboardPayload;
  groups: DashboardIsoGroup[];
}) {
  const status = summaryStatus(data.summary);
  const fallbackCount = data.summary.unverifiedFallbackHubCount;
  const singleSourceCount = data.rows.filter((row) => row.rtSourceStatus === "single-source").length;
  const componentFallbackCount = data.rows.filter((row) => row.effectiveComponent !== data.component).length;

  return (
    <div className="space-y-2" aria-label="Power Settles report summary">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${statusClass(status)}`}>
          {statusLabel(status)}
        </span>
        <SummaryToken label="Date" value={data.requestedDate ?? data.defaultDate} />
        <SummaryToken label="Spark HR" value={fmtSparkHeatRate(data.sparkHeatRate)} />
        <SummaryToken label="ISOs" value={String(data.summary.isoCount)} />
        <SummaryToken
          label="Hubs"
          value={`${data.summary.completeHubCount}/${data.summary.hubCount}`}
          tone={status === "ok" ? "ok" : "partial"}
        />
        {fallbackCount > 0 && (
          <SummaryToken
            label="Fallback"
            value={`${fallbackCount} RT`}
            tone="partial"
            title="Verified/final RT was unavailable or less complete, so preliminary/unverified RT is shown for these hubs."
          />
        )}
        {componentFallbackCount > 0 && (
          <SummaryToken
            label="Component"
            value={`${componentFallbackCount} Total`}
            tone="partial"
            title="These rows use Total because the selected component is not promoted for that ISO."
          />
        )}
        {singleSourceCount > 0 && (
          <SummaryToken
            label="Single RT"
            value={String(singleSourceCount)}
            tone="source"
            title="These hubs use the only promoted RT source available for that ISO."
          />
        )}
        <SummaryToken label="As Of" value={fmtStamp(data.summary.latestAsOf)} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5" aria-label="ISO coverage summary">
        {groups.map((group) => (
          <IsoSummaryPill key={group.iso} group={group} />
        ))}
      </div>
    </div>
  );
}

function summaryHubRows(groups: DashboardIsoGroup[]): DashboardIsoRow[] {
  return groups.flatMap((group) => group.rows.slice(0, group.iso === "caiso" ? 2 : 1));
}

function SummaryLmpTable({ rows }: { rows: DashboardIsoRow[] }) {
  return (
    <section className="w-max flex-none space-y-2" aria-label="Summary LMPs">
      <ReportBandHeader title="Summary LMPs" meta={`${rows.length} hubs`} />
      <div>
        <table className="w-max table-auto border-collapse text-xs text-gray-200 whitespace-nowrap">
          <thead className="bg-gray-950/50 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            <tr className="border-b border-gray-800/80">
              <th rowSpan={2} className="bg-gray-950 px-2 py-1.5 text-left">ISO</th>
              <th rowSpan={2} className="px-2 py-1.5 text-left">Hub</th>
              <th rowSpan={2} className="px-2 py-1.5 text-left">Source</th>
              <th rowSpan={2} className="px-2 py-1.5 text-left">Status</th>
              <th rowSpan={2} className="px-2 py-1.5 text-right">LMPs</th>
              <th colSpan={3} className="border-l border-gray-800 px-2 py-1 text-center normal-case text-gray-500">
                OnPk
              </th>
              <th colSpan={3} className="border-l border-gray-800 px-2 py-1 text-center normal-case text-gray-500">
                OffPeak
              </th>
            </tr>
            <tr className="border-b border-gray-800/80">
              <th className="border-l border-gray-800 px-2 py-1 text-right">DA</th>
              <th className="px-2 py-1 text-right">RT</th>
              <th className="px-2 py-1 text-right">DART</th>
              <th className="border-l border-gray-800 px-2 py-1 text-right">DA</th>
              <th className="px-2 py-1 text-right">RT</th>
              <th className="px-2 py-1 text-right">DART</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/70 bg-[#0d1119]">
            {rows.map((row) => {
              const badge = sourceBadge(row);
              return (
                <tr key={`${row.iso}-${row.hub}-summary`} className="hover:bg-gray-900/60" title={row.statusDetail}>
                  <td className="bg-[#0d1119] px-2 py-1.5 font-semibold text-gray-300">
                    {row.isoLabel}
                  </td>
                  <td className="px-2 py-1.5 font-semibold text-gray-300" title={row.hub}>
                    {row.hub}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
                      title={badge.title}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${statusClass(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <LmpDetailLink href={row.detailUrl} />
                  </td>
                  <LmpPeriodCells row={row} period="onPeak" />
                  <LmpPeriodCells row={row} period="offPeak" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryHeatRateTable({ rows }: { rows: DashboardIsoRow[] }) {
  return (
    <section className="w-max flex-none space-y-2" aria-label="Summary HRs">
      <ReportBandHeader title="Summary HRs" meta="DA HR / RT HR / Gas" />
      <div>
        <table className="w-max table-auto border-collapse text-xs text-gray-200 whitespace-nowrap">
          <thead className="bg-gray-950/50 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            <tr className="border-b border-gray-800/80">
              <th rowSpan={2} className="bg-gray-950 px-2 py-1.5 text-left">ISO</th>
              <th rowSpan={2} className="px-2 py-1.5 text-left">Hub</th>
              <th rowSpan={2} className="px-2 py-1.5 text-left">Gas Hub</th>
              <th rowSpan={2} className="px-2 py-1.5 text-right">HRs</th>
              <th colSpan={3} className="border-l border-gray-800 px-2 py-1 text-center normal-case text-gray-500">
                OnPk
              </th>
              <th colSpan={3} className="border-l border-gray-800 px-2 py-1 text-center normal-case text-gray-500">
                OffPeak
              </th>
            </tr>
            <tr className="border-b border-gray-800/80">
              <th className="border-l border-gray-800 px-2 py-1 text-right">DA HR</th>
              <th className="px-2 py-1 text-right">RT HR</th>
              <th className="px-2 py-1 text-right">Gas</th>
              <th className="border-l border-gray-800 px-2 py-1 text-right">DA HR</th>
              <th className="px-2 py-1 text-right">RT HR</th>
              <th className="px-2 py-1 text-right">Gas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/70 bg-[#0d1119]">
            {rows.map((row) => (
              <tr key={`${row.iso}-${row.hub}-summary-hrs`} className="hover:bg-gray-900/60">
                <td className="bg-[#0d1119] px-2 py-1.5 font-semibold text-gray-300">
                  {row.isoLabel}
                </td>
                <td className="px-2 py-1.5 font-semibold text-gray-300" title={row.hub}>
                  {row.hub}
                </td>
                <td className="px-2 py-1.5 text-gray-400">
                  {row.inputs?.gasHubLabel ?? "-"}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <HeatRateDetailLink row={row} />
                </td>
                <HeatRatePeriodCells row={row} period="onPeak" />
                <HeatRatePeriodCells row={row} period="offPeak" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummarySparkTable({
  rows,
  sparkHeatRate,
}: {
  rows: DashboardIsoRow[];
  sparkHeatRate: number;
}) {
  return (
    <section className="w-max flex-none space-y-2" aria-label="Summary Sparks">
      <ReportBandHeader title="Summary Sparks" meta={`Spark HR ${fmtSparkHeatRate(sparkHeatRate)}`} />
      <div>
        <table className="w-max table-auto border-collapse text-xs text-gray-200 whitespace-nowrap">
          <thead className="bg-gray-950/50 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            <tr className="border-b border-gray-800/80">
              <th rowSpan={2} className="bg-gray-950 px-2 py-1.5 text-left">ISO</th>
              <th rowSpan={2} className="px-2 py-1.5 text-left">Hub</th>
              <th rowSpan={2} className="px-2 py-1.5 text-left">Gas Hub</th>
              <th rowSpan={2} className="px-2 py-1.5 text-right">Spark HR</th>
              <th rowSpan={2} className="px-2 py-1.5 text-right">Sparks</th>
              <th colSpan={3} className="border-l border-gray-800 px-2 py-1 text-center normal-case text-gray-500">
                OnPk
              </th>
              <th colSpan={3} className="border-l border-gray-800 px-2 py-1 text-center normal-case text-gray-500">
                OffPeak
              </th>
            </tr>
            <tr className="border-b border-gray-800/80">
              <th className="border-l border-gray-800 px-2 py-1 text-right">DA</th>
              <th className="px-2 py-1 text-right">RT</th>
              <th className="px-2 py-1 text-right">Gas</th>
              <th className="border-l border-gray-800 px-2 py-1 text-right">DA</th>
              <th className="px-2 py-1 text-right">RT</th>
              <th className="px-2 py-1 text-right">Gas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/70 bg-[#0d1119]">
            {rows.map((row) => (
              <tr key={`${row.iso}-${row.hub}-summary-sparks`} className="hover:bg-gray-900/60">
                <td className="bg-[#0d1119] px-2 py-1.5 font-semibold text-gray-300">
                  {row.isoLabel}
                </td>
                <td className="px-2 py-1.5 font-semibold text-gray-300" title={row.hub}>
                  {row.hub}
                </td>
                <td className="px-2 py-1.5 text-gray-400">
                  {row.inputs?.gasHubLabel ?? "-"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-300">
                  {fmtSparkHeatRate(row.inputs?.sparkHeatRate ?? null)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <SparkDetailLink row={row} />
                </td>
                <SparkPeriodCells row={row} period="onPeak" />
                <SparkPeriodCells row={row} period="offPeak" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DashboardSummaryCard({
  data,
  groups,
}: {
  data: PowerSettlesDashboardPayload;
  groups: DashboardIsoGroup[];
}) {
  const rows = summaryHubRows(groups);

  return (
    <article className="w-full overflow-hidden rounded-lg border border-gray-800 bg-[#0d1119] shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 bg-gray-950/30 px-2.5 py-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-100">Summary</h2>
            <span className="text-[11px] text-gray-600">
              {data.summary.isoCount} ISOs / {data.summary.hubCount} hubs
            </span>
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-gray-500">
            {data.requestedDate ?? data.defaultDate} / as of {fmtStamp(data.summary.latestAsOf)}
          </div>
        </div>
      </div>
      <div className="px-2.5 py-3 sm:px-3">
        <DashboardSummaryStrip data={data} groups={groups} />
        <div className="mt-3 overflow-x-auto">
          <div className="flex w-max min-w-full items-start gap-10">
            <SummaryLmpTable rows={rows} />
            <SummaryHeatRateTable rows={rows} />
            <SummarySparkTable rows={rows} sparkHeatRate={data.sparkHeatRate} />
          </div>
        </div>
      </div>
    </article>
  );
}

function IsoReportCard({
  group,
  requestedComponent,
  sparkHeatRate,
  open,
  onToggle,
}: {
  group: DashboardIsoGroup;
  requestedComponent: PowerSettlesComponent;
  sparkHeatRate: number;
  open: boolean;
  onToggle: () => void;
}) {
  const status = isoStatus(group.rows);
  const completeCount = group.rows.filter((row) => row.status === "ok").length;
  const fallbackComponent = group.rows.some((row) => row.effectiveComponent !== requestedComponent);
  const fallbackSourceCount = group.rows.filter((row) => row.rtSourceStatus === "fallback").length;
  const targetDate = fmtDate(group.rows[0]?.targetDate ?? null);
  const latestAsOf = maxReportStamp(group.rows);
  const bodyId = `power-settles-${isoDomId(group.iso)}-body`;

  return (
    <article className="w-full overflow-hidden rounded-lg border border-gray-800 bg-[#0d1119] shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 bg-gray-950/30 px-2.5 py-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-100">{group.isoLabel}</h2>
            <span className="text-[11px] text-gray-600">
              {group.rows.length} {group.rows.length === 1 ? "hub" : "hubs"}
            </span>
            <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusClass(status)}`}>
              {statusLabel(status)}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] tabular-nums text-gray-500">
            <span>{completeCount}/{group.rows.length} hubs complete</span>
            <span className="text-gray-700">/</span>
            <span>{targetDate}</span>
            <span className="text-gray-700">/</span>
            <span>as of {latestAsOf}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span
            className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
              fallbackSourceCount > 0
                ? "border-amber-500/35 bg-amber-500/10 text-amber-200"
                : "border-gray-700 bg-gray-950/70 text-gray-500"
            }`}
            title={`${fallbackSourceCount} hub${fallbackSourceCount === 1 ? "" : "s"} use RT fallback.`}
          >
            {fallbackSourceCount} Fallback
          </span>
          {fallbackComponent && (
            <span className="inline-flex rounded-md border border-gray-700 bg-gray-950/70 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
              Total
            </span>
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={bodyId}
            className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            {open ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {open && (
        <div id={bodyId} className="overflow-x-auto px-2.5 py-4 sm:px-3">
          <div className="flex w-max min-w-full items-start gap-10">
            <LmpReportBand title={`${group.isoLabel} LMPs`} rows={group.rows} />
            <HeatRateReportBand title={`${group.isoLabel} HRs`} rows={group.rows} />
            <SparkReportBand
              title={`${group.isoLabel} Sparks`}
              rows={group.rows}
              sparkHeatRate={sparkHeatRate}
            />
          </div>
        </div>
      )}
    </article>
  );
}

export default function PowerSettlesDashboard() {
  const searchParams = useSearchParams();
  const initialDate = parseInitialDate(searchParams.get("date"));
  const [rtSource] = useState<RtLmpSource>(() =>
    parseInitialRtSource(searchParams.get("rtSource")),
  );
  const [component, setComponent] = useState<PowerSettlesComponent>(() =>
    parseInitialComponent(searchParams.get("component")),
  );
  const [lookbackDays] = useState(() =>
    parseInitialLookbackDays(searchParams.get("lookbackDays")),
  );
  const [sparkHeatRate, setSparkHeatRate] = useState(() =>
    parseInitialSparkHeatRate(searchParams.get("sparkHeatRate")),
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(() => initialDate);
  const [dateInput, setDateInput] = useState(() => initialDate ?? "");
  const [refreshToken, setRefreshToken] = useState(() =>
    searchParams.get("refresh") === "1" ? 1 : 0,
  );
  const [data, setData] = useState<PowerSettlesDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedIsoCards, setCollapsedIsoCards] = useState<Set<string>>(() => new Set());

  const forceRefresh = refreshToken > 0;
  const apiUrl = useMemo(
    () =>
      buildApiUrl({
        date: selectedDate,
        lookbackDays,
        rtSource,
        component,
        sparkHeatRate,
        refresh: forceRefresh,
      }),
    [component, forceRefresh, lookbackDays, rtSource, selectedDate, sparkHeatRate],
  );
  const cacheKey = useMemo(
    () =>
      buildCacheKey({
        date: selectedDate,
        lookbackDays,
        rtSource,
        component,
        sparkHeatRate,
      }),
    [component, lookbackDays, rtSource, selectedDate, sparkHeatRate],
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchJsonWithCache<PowerSettlesDashboardPayload>({
      key: cacheKey,
      url: apiUrl,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
    })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        if (!selectedDate) {
          setDateInput(payload.defaultDate);
        }
      })
      .catch((nextError) => {
        if (cancelled) return;
        if (nextError instanceof Error && nextError.name === "AbortError") return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load Power Settles.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiUrl, cacheKey, forceRefresh, refreshToken, selectedDate]);

  const reportCards = useMemo(() => (data ? orderedIsoGroups(data) : []), [data]);

  const handleDateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSelectedDate(dateInput || null);
    setRefreshToken((value) => value + 1);
  };

  const handleSparkHeatRateChange = (nextSparkHeatRate: number) => {
    setSparkHeatRate(normalizePowerLmpSparkHeatRate(nextSparkHeatRate));
  };

  const toggleIsoCard = (iso: PowerIso) => {
    setCollapsedIsoCards((current) => {
      const next = new Set(current);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  };

  const ready = !loading;

  return (
    <div
      className="mx-auto w-full max-w-none space-y-4"
      data-perf-ready={ready ? "power-settles-dashboard" : undefined}
    >
      <ControlCard title="Power Settles">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Filters
            </span>
            <span className="h-px flex-1 bg-gray-800" />
            <span className="text-xs text-gray-500">
              {data
                ? `${data.summary.isoCount} ISOs / ${data.summary.hubCount} hubs`
                : "DA / RT / DART OnPk-OffPeak"}
            </span>
          </div>

          <div className="space-y-2">
            <form onSubmit={handleDateSubmit} className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Date
              </span>
              <input
                type="date"
                value={dateInput}
                onChange={(event) => setDateInput(event.target.value)}
                className="h-8 rounded-md border border-gray-700 bg-gray-900 px-2 text-xs text-gray-200 focus:border-gray-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Load
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateInput(data?.defaultDate ?? "");
                  setSelectedDate(null);
                  setRefreshToken((value) => value + 1);
                }}
                className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-200"
              >
                Yesterday
              </button>
            </form>
            <FilterPills
              label="Component"
              options={COMPONENT_TABS}
              value={component}
              onChange={setComponent}
            />
            <SparkHeatRateInput
              value={sparkHeatRate}
              onChange={handleSparkHeatRateChange}
            />
          </div>

        </div>
      </ControlCard>

      {loading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading Power Settles...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {data && (
        <section className="space-y-3" aria-label="Power Settles ISO report cards">
          <DashboardSummaryCard data={data} groups={reportCards} />
          {reportCards.map((card) => (
            <IsoReportCard
              key={card.iso}
              group={card}
              requestedComponent={data.component}
              sparkHeatRate={data.sparkHeatRate}
              open={!collapsedIsoCards.has(card.iso)}
              onToggle={() => toggleIsoCard(card.iso)}
            />
          ))}
        </section>
      )}
    </div>
  );
}
