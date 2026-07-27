"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

export interface PjmTightnessLookbackFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface CoverageRow {
  sourceTable: string;
  rowCount: number;
  intervalCount: number;
  minEpt: string | null;
  maxEpt: string | null;
  latestUpdateAt: string | null;
}

interface HourlyRow {
  hourEpt: string | null;
  hourUtc: string | null;
  hourEnding: number;
  loadSource: string | null;
  actualLoadMw: number | null;
  reserveArea: string | null;
  reserveType: string | null;
  reserveRequirementMw: number | null;
  reliabilityRequirementMw: number | null;
  totalReserveMw: number | null;
  reserveDeficitMw: number | null;
  reserveMarginMw: number | null;
  shortageIndicator: boolean;
  dispatchedReserveMcp: number | null;
  reserveMarketService: string | null;
  reserveMarketLocale: string | null;
  reserveMarketMcp: number | null;
  westernHubRtLmp: number | null;
  easternHubRtLmp: number | null;
  aepDaytonHubRtLmp: number | null;
  westernHubRtLmpMax: number | null;
  rtPriceSource: string | null;
  generationMw: number | null;
  renewableMw: number | null;
  ecoMaxMw: number | null;
  emergencyMaxMw: number | null;
  totalCommittedMw: number | null;
  rtEcomaxMw: number | null;
  selfEcomaxMw: number | null;
  loadToCommittedPct: number | null;
  interchangeActualMw: number | null;
  interchangeScheduledMw: number | null;
  interchangeSource: string | null;
  constraintCount: number;
  maxShadowPrice: number | null;
  topConstraintName: string | null;
  topContingencyName: string | null;
  rowAsOf: string | null;
}

interface ConstraintRow {
  monitoredFacility: string;
  contingencyFacility: string;
  intervals: number;
  firstEpt: string | null;
  lastEpt: string | null;
  maxShadowPrice: number | null;
  totalAbsShadowPrice: number | null;
  maxLimitControlPercentage: number | null;
}

interface OutageRow {
  sourceTable: string;
  forecastExecutionDate: string | null;
  forecastDate: string | null;
  totalOutagesMw: number | null;
  plannedOutagesMw: number | null;
  maintenanceOutagesMw: number | null;
  forcedOutagesMw: number | null;
  forecastGenOutageMwRto: number | null;
  forecastGenOutageMwWest: number | null;
  forecastGenOutageMwOther: number | null;
  updatedAt: string | null;
}

interface LookbackSummary {
  hourCount: number;
  hoursWithLoad: number;
  hoursWithReserveMargin: number;
  hoursWithShortage: number;
  peakLoadHour: HourlyRow | null;
  tightestReserveHour: HourlyRow | null;
  maxDeficitHour: HourlyRow | null;
  maxReservePriceHour: HourlyRow | null;
  maxWesternHubPriceHour: HourlyRow | null;
  outageContext: OutageRow | null;
}

interface LookbackPayload {
  iso: "pjm";
  source: string;
  selectedDate: string;
  defaultDate: string;
  latestAvailableDate: string | null;
  availableDates: string[];
  asOf: string | null;
  coverage: CoverageRow[];
  summary: LookbackSummary;
  hourly: HourlyRow[];
  constraints: ConstraintRow[];
  outages: OutageRow[];
}

interface ChartRow {
  hourLabel: string;
  hourEpt: string | null;
  actualLoadMw: number | null;
  reserveMarginMw: number | null;
  reserveDeficitMw: number | null;
  totalReserveMw: number | null;
  reserveRequirementMw: number | null;
  dispatchedReserveMcp: number | null;
  reserveMarketMcp: number | null;
  westernHubRtLmp: number | null;
  easternHubRtLmp: number | null;
  aepDaytonHubRtLmp: number | null;
  maxShadowPrice: number | null;
  constraintCount: number;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_FRESHNESS: PjmTightnessLookbackFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Tightness --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

function buildApiUrl(date: string, refresh: boolean): string {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (refresh) params.set("refresh", "1");
  const query = params.toString();
  return query ? `/api/pjm-tightness-lookback?${query}` : "/api/pjm-tightness-lookback";
}

function cacheKey(date: string): string {
  return ["api:pjm-tightness-lookback", date || "default"].join(":");
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").replace("Z", "").slice(0, 16);
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function fmtMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString()} MW`;
}

function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString();
}

function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function fmtHe(hourEnding: number | null | undefined): string {
  if (!hourEnding || !Number.isFinite(hourEnding)) return "-";
  return `HE${String(hourEnding).padStart(2, "0")}`;
}

function sourceLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace(/^pjm\./, "").replaceAll("_", " ");
}

function tightnessStatus(payload: LookbackPayload | null): PjmTightnessLookbackFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  const hasReserve = payload.summary.hoursWithReserveMargin > 0;
  const hasLoad = payload.summary.hoursWithLoad > 0;
  const hasDeficit = (payload.summary.maxDeficitHour?.reserveDeficitMw ?? 0) > 0;
  const status = hasDeficit ? "Deficit" : hasLoad && hasReserve ? "Ready" : "Partial";
  const statusClass = hasDeficit
    ? "border-red-500/40 bg-red-500/10 text-red-200"
    : hasLoad && hasReserve
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-yellow-500/40 bg-yellow-500/10 text-yellow-200";
  return {
    status,
    statusClass,
    summary: `${payload.selectedDate} | ${payload.summary.hoursWithLoad}/${payload.summary.hourCount} load hrs | ${payload.summary.hoursWithReserveMargin} reserve hrs`,
    targetDateLabel: payload.selectedDate,
    latestDateLabel: payload.latestAvailableDate ?? "--",
    latestUpdateLabel: fmtDateTime(payload.asOf),
  };
}

function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "bad"
      ? "border-red-500/30 bg-red-500/10"
      : tone === "warn"
        ? "border-yellow-500/30 bg-yellow-500/10"
        : tone === "good"
          ? "border-emerald-500/30 bg-emerald-500/10"
          : "border-gray-800 bg-[#12141d]";
  return (
    <div className={`rounded-lg border p-3 shadow-xl shadow-black/20 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gray-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  const className =
    tone === "good"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : tone === "bad"
        ? "border-red-500/40 bg-red-500/10 text-red-200"
        : tone === "warn"
          ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
          : "border-gray-700 bg-gray-900 text-gray-400";
  return (
    <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function metricPrice(row: HourlyRow | null | undefined): number | null {
  if (!row) return null;
  const values = [row.dispatchedReserveMcp, row.reserveMarketMcp].filter(
    (value): value is number => value !== null,
  );
  return values.length ? Math.max(...values) : null;
}

export default function PjmTightnessLookback({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmTightnessLookbackFreshnessSummary) => void;
}) {
  const [selectedDate, setSelectedDate] = useState("");
  const [data, setData] = useState<LookbackPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    fetchJsonWithCache<LookbackPayload>({
      key: cacheKey(selectedDate),
      url: buildApiUrl(selectedDate, refreshToken > 0),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        onFreshnessChange?.(tightnessStatus(payload));
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setError(err.message || "Failed to load PJM tightness lookback");
        setData(null);
        onFreshnessChange?.({
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Tightness query failed",
          targetDateLabel: selectedDate || "--",
          latestDateLabel: "--",
          latestUpdateLabel: "--",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [onFreshnessChange, refreshToken, selectedDate]);

  const selectedDateValue = selectedDate || data?.selectedDate || "";
  const chartRows = useMemo<ChartRow[]>(
    () =>
      (data?.hourly ?? []).map((row) => ({
        hourLabel: fmtHe(row.hourEnding),
        hourEpt: row.hourEpt,
        actualLoadMw: row.actualLoadMw,
        reserveMarginMw: row.reserveMarginMw,
        reserveDeficitMw: row.reserveDeficitMw,
        totalReserveMw: row.totalReserveMw,
        reserveRequirementMw: row.reserveRequirementMw,
        dispatchedReserveMcp: row.dispatchedReserveMcp,
        reserveMarketMcp: row.reserveMarketMcp,
        westernHubRtLmp: row.westernHubRtLmp,
        easternHubRtLmp: row.easternHubRtLmp,
        aepDaytonHubRtLmp: row.aepDaytonHubRtLmp,
        maxShadowPrice: row.maxShadowPrice,
        constraintCount: row.constraintCount,
      })),
    [data],
  );
  const coverageBySource = useMemo(
    () => new Map((data?.coverage ?? []).map((row) => [row.sourceTable, row])),
    [data],
  );
  const reserveCoverage = coverageBySource.get("pjm.rt_dispatch_reserves");
  const loadCoverage =
    coverageBySource.get("pjm.hrl_load_metered") ?? coverageBySource.get("pjm.hrl_load_prelim");
  const priceCoverage =
    coverageBySource.get("pjm.rt_fivemin_hrl_lmps") ??
    coverageBySource.get("pjm.rt_unverified_hrl_lmps");
  const shortageTone = data?.summary.hoursWithShortage ? "bad" : "good";
  const maxDeficit = data?.summary.maxDeficitHour?.reserveDeficitMw ?? null;
  const maxReservePrice = metricPrice(data?.summary.maxReservePriceHour);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Controls"
        subtitle={
          data
            ? `${data.selectedDate} EPT | default yesterday ${data.defaultDate} | as of ${fmtDateTime(data.asOf)}`
            : undefined
        }
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <label className="w-full lg:max-w-[260px]">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Operating Day
            </span>
            <select
              value={selectedDateValue}
              onChange={(event) => setSelectedDate(event.target.value)}
              disabled={!data?.availableDates.length}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 disabled:cursor-not-allowed disabled:text-gray-600 focus:border-gray-500 focus:outline-none"
            >
              {(data?.availableDates.length ? data.availableDates : [selectedDateValue])
                .filter(Boolean)
                .map((date) => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
            </select>
          </label>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusBadge
              label={`Load ${loadCoverage?.intervalCount ?? 0} hrs`}
              tone={(loadCoverage?.intervalCount ?? 0) >= 23 ? "good" : "warn"}
            />
            <StatusBadge
              label={`Reserve ${reserveCoverage?.intervalCount ?? 0} hrs`}
              tone={(reserveCoverage?.intervalCount ?? 0) >= 23 ? "good" : "warn"}
            />
            <StatusBadge
              label={`Price ${priceCoverage?.intervalCount ?? 0} intervals`}
              tone={(priceCoverage?.intervalCount ?? 0) > 0 ? "good" : "warn"}
            />
            <StatusBadge
              label={`Shortage ${data?.summary.hoursWithShortage ?? 0} hrs`}
              tone={shortageTone}
            />
          </div>
        </div>
      </SectionCard>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {loading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading PJM tightness lookback...
        </div>
      )}

      {data && !loading && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <StatTile
              label="Peak Load"
              value={fmtMw(data.summary.peakLoadHour?.actualLoadMw)}
              sub={`${fmtHe(data.summary.peakLoadHour?.hourEnding)} | ${sourceLabel(data.summary.peakLoadHour?.loadSource)}`}
            />
            <StatTile
              label="Tightest Margin"
              value={fmtMw(data.summary.tightestReserveHour?.reserveMarginMw)}
              sub={`${fmtHe(data.summary.tightestReserveHour?.hourEnding)} | ${data.summary.tightestReserveHour?.reserveType ?? "-"}`}
              tone={(data.summary.tightestReserveHour?.reserveMarginMw ?? 1) < 0 ? "bad" : "neutral"}
            />
            <StatTile
              label="Max Deficit"
              value={fmtMw(maxDeficit)}
              sub={`${fmtHe(data.summary.maxDeficitHour?.hourEnding)} | ${data.summary.maxDeficitHour?.reserveType ?? "-"}`}
              tone={(maxDeficit ?? 0) > 0 ? "bad" : "good"}
            />
            <StatTile
              label="Reserve MCP"
              value={fmtPrice(maxReservePrice)}
              sub={`${fmtHe(data.summary.maxReservePriceHour?.hourEnding)} | max reserve price`}
              tone={(maxReservePrice ?? 0) >= 100 ? "warn" : "neutral"}
            />
            <StatTile
              label="Western Hub RT"
              value={fmtPrice(data.summary.maxWesternHubPriceHour?.westernHubRtLmpMax)}
              sub={`${fmtHe(data.summary.maxWesternHubPriceHour?.hourEnding)} | hourly max`}
              tone={(data.summary.maxWesternHubPriceHour?.westernHubRtLmpMax ?? 0) >= 100 ? "warn" : "neutral"}
            />
            <StatTile
              label="Outages"
              value={fmtMw(data.summary.outageContext?.totalOutagesMw)}
              sub={`As of ${fmtDate(data.summary.outageContext?.forecastExecutionDate)}`}
            />
          </div>

          <SectionCard
            title="Hourly Adequacy"
            subtitle="Reserve margin is selected from the tightest PJM reserve row for each EPT hour."
          >
            {chartRows.length ? (
              <div className="h-[390px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartRows} margin={{ top: 12, right: 18, bottom: 8, left: 8 }}>
                    <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="hourLabel"
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      minTickGap={10}
                    />
                    <YAxis
                      yAxisId="mw"
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                      width={58}
                    />
                    <YAxis
                      yAxisId="count"
                      orientation="right"
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      width={44}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#111827",
                        border: "1px solid #374151",
                        borderRadius: 8,
                        color: "#e5e7eb",
                      }}
                      labelFormatter={(label) => `${String(label)} EPT`}
                      formatter={(value, name) => {
                        const key = String(name);
                        if (key === "constraintCount") return [fmtNumber(Number(value)), "Constraint count"];
                        return [
                          fmtMw(typeof value === "number" ? value : Number(value)),
                          key
                            .replace("actualLoadMw", "Actual load")
                            .replace("reserveMarginMw", "Reserve margin")
                            .replace("reserveDeficitMw", "Reserve deficit")
                            .replace("totalReserveMw", "Total reserve")
                            .replace("reserveRequirementMw", "Reserve requirement"),
                        ];
                      }}
                    />
                    <ReferenceLine yAxisId="mw" y={0} stroke="#f87171" strokeDasharray="4 4" />
                    <Bar
                      yAxisId="mw"
                      dataKey="reserveDeficitMw"
                      name="reserveDeficitMw"
                      fill="#ef4444"
                      fillOpacity={0.65}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="mw"
                      type="monotone"
                      dataKey="actualLoadMw"
                      name="actualLoadMw"
                      stroke="#f8fafc"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="mw"
                      type="monotone"
                      dataKey="reserveMarginMw"
                      name="reserveMarginMw"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="mw"
                      type="monotone"
                      dataKey="totalReserveMw"
                      name="totalReserveMw"
                      stroke="#38bdf8"
                      strokeWidth={1.8}
                      strokeDasharray="5 5"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="mw"
                      type="monotone"
                      dataKey="reserveRequirementMw"
                      name="reserveRequirementMw"
                      stroke="#f97316"
                      strokeWidth={1.8}
                      strokeDasharray="6 4"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="count"
                      type="monotone"
                      dataKey="constraintCount"
                      name="constraintCount"
                      stroke="#c084fc"
                      strokeWidth={1.8}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[280px] items-center justify-center rounded-md border border-gray-800 bg-gray-950/40 text-sm text-gray-500">
                No hourly rows are available for the selected day.
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Price Confirmation"
            subtitle="RT hub prices and reserve market clearing prices over the same EPT hours."
          >
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRows} margin={{ top: 12, right: 18, bottom: 8, left: 8 }}>
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                  <XAxis dataKey="hourLabel" tick={{ fill: "#9ca3af", fontSize: 11 }} minTickGap={10} />
                  <YAxis
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickFormatter={(value) => `$${Math.round(Number(value))}`}
                    width={58}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#111827",
                      border: "1px solid #374151",
                      borderRadius: 8,
                      color: "#e5e7eb",
                    }}
                    formatter={(value, name) => [
                      fmtPrice(typeof value === "number" ? value : Number(value)),
                      String(name)
                        .replace("westernHubRtLmp", "Western Hub RT")
                        .replace("easternHubRtLmp", "Eastern Hub RT")
                        .replace("aepDaytonHubRtLmp", "AEP-Dayton Hub RT")
                        .replace("dispatchedReserveMcp", "Dispatched reserve MCP")
                        .replace("reserveMarketMcp", "Reserve market MCP"),
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="westernHubRtLmp"
                    name="westernHubRtLmp"
                    stroke="#f8fafc"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="easternHubRtLmp"
                    name="easternHubRtLmp"
                    stroke="#38bdf8"
                    strokeWidth={1.8}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="aepDaytonHubRtLmp"
                    name="aepDaytonHubRtLmp"
                    stroke="#f97316"
                    strokeWidth={1.8}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="dispatchedReserveMcp"
                    name="dispatchedReserveMcp"
                    stroke="#ef4444"
                    strokeWidth={1.8}
                    strokeDasharray="5 5"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="reserveMarketMcp"
                    name="reserveMarketMcp"
                    stroke="#c084fc"
                    strokeWidth={1.8}
                    strokeDasharray="4 4"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <DataTableShell
            title="Hourly Tightness Matrix"
            subtitle="Actual load, reserves, shortage, prices, interchange, capacity, and top hourly constraint."
          >
            <table className="w-full min-w-[1680px] border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr>
                  {[
                    "HE",
                    "Load",
                    "Reserve Req",
                    "Total Reserve",
                    "Margin",
                    "Deficit",
                    "Reserve MCP",
                    "Shortage",
                    "Western RT",
                    "Eastern RT",
                    "AEP-Dayton RT",
                    "Generation",
                    "Committed",
                    "Load/Committed",
                    "Tie Actual",
                    "Constraints",
                    "Top Constraint",
                  ].map((label, index) => (
                    <th
                      key={label}
                      className={`px-3 py-2 font-semibold uppercase tracking-wide ${
                        index === 0 || index === 16 ? "text-left" : "text-right"
                      } ${index === 0 ? "sticky left-0 z-20 bg-gray-950" : ""}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.hourly.map((row) => (
                  <tr key={row.hourEpt ?? row.hourEnding} className="hover:bg-gray-900/60">
                    <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2 text-left font-semibold text-gray-100">
                      <div>{fmtHe(row.hourEnding)}</div>
                      <div className="mt-1 text-[10px] font-normal text-gray-600">
                        {fmtDateTime(row.hourEpt).slice(11)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.actualLoadMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.reserveRequirementMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.totalReserveMw)}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-semibold ${
                        (row.reserveMarginMw ?? 1) < 0 ? "text-red-300" : "text-gray-100"
                      }`}
                    >
                      {fmtNumber(row.reserveMarginMw)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-200">
                      {fmtNumber(row.reserveDeficitMw)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtPrice(metricPrice(row))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.shortageIndicator ? (
                        <span className="rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-red-200">
                          Yes
                        </span>
                      ) : (
                        <span className="text-gray-500">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(row.westernHubRtLmp)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(row.easternHubRtLmp)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(row.aepDaytonHubRtLmp)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.generationMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.totalCommittedMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPct(row.loadToCommittedPct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.interchangeActualMw)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.constraintCount ? `${row.constraintCount} / ${fmtPrice(row.maxShadowPrice)}` : "-"}
                    </td>
                    <td className="max-w-[260px] px-3 py-2 text-left">
                      <div className="truncate text-gray-200" title={row.topConstraintName ?? undefined}>
                        {row.topConstraintName ?? "-"}
                      </div>
                      {row.topContingencyName && (
                        <div className="truncate text-[10px] text-gray-600" title={row.topContingencyName}>
                          {row.topContingencyName}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
            <DataTableShell
              title="Constraint Leaderboard"
              subtitle="RT marginal-value constraints ranked by total absolute shadow price."
            >
              <table className="w-full min-w-[820px] border-collapse bg-[#0d1119] text-xs text-gray-200">
                <thead className="bg-gray-950 text-gray-500">
                  <tr>
                    {["Monitored", "Contingency", "Intervals", "Window", "Max Shadow", "Total Abs Shadow"].map(
                      (label, index) => (
                        <th
                          key={label}
                          className={`px-3 py-2 font-semibold uppercase tracking-wide ${
                            index < 2 ? "text-left" : "text-right"
                          }`}
                        >
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.constraints.map((row) => (
                    <tr key={`${row.monitoredFacility}:${row.contingencyFacility}`} className="hover:bg-gray-900/60">
                      <td className="max-w-[240px] px-3 py-2 text-left">
                        <span className="block truncate" title={row.monitoredFacility}>
                          {row.monitoredFacility}
                        </span>
                      </td>
                      <td className="max-w-[240px] px-3 py-2 text-left text-gray-400">
                        <span className="block truncate" title={row.contingencyFacility}>
                          {row.contingencyFacility}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.intervals)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtDateTime(row.firstEpt).slice(11)}-{fmtDateTime(row.lastEpt).slice(11)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(row.maxShadowPrice)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(row.totalAbsShadowPrice)}</td>
                    </tr>
                  ))}
                  {!data.constraints.length && (
                    <tr>
                      <td className="px-3 py-3 text-gray-500" colSpan={6}>
                        No positive RT marginal-value shadow prices were found for this day.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </DataTableShell>

            <DataTableShell title="Source Coverage" subtitle="Selected-day row and interval counts by table.">
              <table className="w-full min-w-[620px] border-collapse bg-[#0d1119] text-xs text-gray-200">
                <thead className="bg-gray-950 text-gray-500">
                  <tr>
                    {["Source", "Rows", "Intervals", "Window", "Updated"].map((label, index) => (
                      <th
                        key={label}
                        className={`px-3 py-2 font-semibold uppercase tracking-wide ${
                          index === 0 ? "text-left" : "text-right"
                        }`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.coverage.map((row) => (
                    <tr key={row.sourceTable} className="hover:bg-gray-900/60">
                      <td className="px-3 py-2 text-left font-semibold text-gray-100">
                        {row.sourceTable}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.rowCount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(row.intervalCount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtDateTime(row.minEpt).slice(11)}-{fmtDateTime(row.maxEpt).slice(11)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtDateTime(row.latestUpdateAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        </>
      )}
    </div>
  );
}
