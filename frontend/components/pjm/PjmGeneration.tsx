"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

export interface PjmGenerationFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface SourceFreshness {
  sourceTable: string;
  rowCount: number;
  minEpt: string | null;
  maxEpt: string | null;
  latestUpdateAt: string | null;
}

interface FuelHour {
  fuelType: string;
  mw: number | null;
  share: number | null;
  isRenewable: boolean | null;
}

interface HourlyGenerationRow {
  hourEpt: string;
  hourUtc: string;
  hourBeginning: number;
  totalGenerationMw: number | null;
  renewableMw: number | null;
  nonrenewableMw: number | null;
  renewableSharePct: number | null;
  fuels: FuelHour[];
  ecoMaxMw: number | null;
  emergencyMaxMw: number | null;
  totalCommittedMw: number | null;
  rtEcomaxMw: number | null;
  rtEcomaxSuppressed: boolean;
  confidentialityDisclaimer: string | null;
  selfScheduledEcomaxMw: number | null;
}

interface FuelSummaryRow {
  fuelType: string;
  isRenewable: boolean | null;
  hourlyRows: number;
  avgMw: number | null;
  minMw: number | null;
  maxMw: number | null;
  totalMwh: number | null;
  avgSharePct: number | null;
}

interface GenerationSummary {
  hourCount: number;
  fuelCount: number;
  avgGenerationMw: number | null;
  peakGenerationMw: number | null;
  peakGenerationHourEpt: string | null;
  avgRenewableSharePct: number | null;
  avgEcoMaxMw: number | null;
  avgEmergencyMaxMw: number | null;
  avgTotalCommittedMw: number | null;
  avgRtEcomaxMw: number | null;
  avgSelfScheduledEcomaxMw: number | null;
  avgGenerationToEcoMaxPct: number | null;
  avgGenerationToCommittedPct: number | null;
  rtEcomaxAvailableHours: number;
  rtEcomaxSuppressedHours: number;
}

interface GenerationPayload {
  iso: "pjm";
  source: string;
  requestedDate: string | null;
  selectedDate: string | null;
  latestCommonDate: string | null;
  availableDates: string[];
  asOf: string | null;
  freshness: SourceFreshness[];
  summary: GenerationSummary;
  hourly: HourlyGenerationRow[];
  fuelSummary: FuelSummaryRow[];
}

interface GenerationChartRow {
  hourLabel: string;
  hourEpt: string;
  totalGenerationMw: number | null;
  ecoMaxMw: number | null;
  emergencyMaxMw: number | null;
  totalCommittedMw: number | null;
  rtEcomaxMw: number | null;
  selfScheduledEcomaxMw: number | null;
  [key: string]: string | number | null;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const FUEL_COLORS: Record<string, string> = {
  Coal: "#9ca3af",
  Gas: "#38bdf8",
  Hydro: "#06b6d4",
  Multiple: "#c084fc",
  "Multiple Fuels": "#c084fc",
  Nuclear: "#facc15",
  Oil: "#ef4444",
  Other: "#a78bfa",
  "Other Renewables": "#84cc16",
  Solar: "#f97316",
  Storage: "#f43f5e",
  Wind: "#22c55e",
};
const FALLBACK_COLORS = [
  "#38bdf8",
  "#f97316",
  "#22c55e",
  "#f43f5e",
  "#a78bfa",
  "#facc15",
  "#14b8a6",
  "#fb7185",
  "#60a5fa",
  "#c084fc",
];

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmtMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString()} MW`;
}

function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString();
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").replace("Z", "").slice(0, 16);
}

function fmtHour(value: string): string {
  return value.replace("T", " ").slice(11, 16);
}

function fmtHe(hourBeginning: number): string {
  return `HE${(hourBeginning % 24) + 1}`;
}

function fuelKey(fuelType: string): string {
  return `fuel:${fuelType}`;
}

function fuelLabel(key: string): string {
  return key.startsWith("fuel:") ? key.slice(5) : key;
}

function fuelColor(fuelType: string, index: number): string {
  return FUEL_COLORS[fuelType] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function fuelMw(row: HourlyGenerationRow, fuelType: string): number | null {
  return row.fuels.find((fuel) => fuel.fuelType === fuelType)?.mw ?? null;
}

function buildApiUrl(date: string, refresh: boolean): string {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (refresh) params.set("refresh", "1");
  const query = params.toString();
  return query ? `/api/pjm-generation?${query}` : "/api/pjm-generation";
}

function cacheKey(date: string): string {
  return ["api:pjm-generation", date || "latest"].join(":");
}

function freshnessFromPayload(payload: GenerationPayload | null): PjmGenerationFreshnessSummary {
  if (!payload) {
    return {
      status: "Unknown",
      statusClass: "border-gray-700 bg-gray-900 text-gray-400",
      summary: "Generation --",
      targetDateLabel: "--",
      latestDateLabel: "--",
      latestUpdateLabel: "--",
    };
  }

  const hasData = payload.summary.hourCount > 0;
  return {
    status: hasData ? "Current" : "No Data",
    statusClass: hasData
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
    summary: `${payload.selectedDate ?? "--"} | ${payload.summary.hourCount} hours | ${payload.summary.fuelCount} fuels`,
    targetDateLabel: payload.selectedDate ?? "--",
    latestDateLabel: payload.latestCommonDate ?? "--",
    latestUpdateLabel: fmtDateTime(payload.asOf),
  };
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gray-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "good" | "warn" | "neutral" }) {
  const className =
    tone === "good"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
        ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
        : "border-gray-700 bg-gray-900 text-gray-400";
  return (
    <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

export default function PjmGeneration({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmGenerationFreshnessSummary) => void;
}) {
  const [selectedDate, setSelectedDate] = useState("");
  const [data, setData] = useState<GenerationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    const url = buildApiUrl(selectedDate, refreshToken > 0);

    fetchJsonWithCache<GenerationPayload>({
      key: cacheKey(selectedDate),
      url,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        onFreshnessChange?.(freshnessFromPayload(payload));
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setError(err.message || "Failed to load PJM generation data");
        setData(null);
        onFreshnessChange?.({
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Generation query failed",
          targetDateLabel: selectedDate || "--",
          latestDateLabel: "--",
          latestUpdateLabel: "-",
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
  const topFuels = useMemo(() => data?.fuelSummary.slice(0, 12) ?? [], [data]);
  const chartRows = useMemo<GenerationChartRow[]>(() => {
    if (!data) return [];
    return data.hourly.map((row) => {
      const chartRow: GenerationChartRow = {
        hourLabel: fmtHe(row.hourBeginning),
        hourEpt: row.hourEpt,
        totalGenerationMw: row.totalGenerationMw,
        ecoMaxMw: row.ecoMaxMw,
        emergencyMaxMw: row.emergencyMaxMw,
        totalCommittedMw: row.totalCommittedMw,
        rtEcomaxMw: row.rtEcomaxMw,
        selfScheduledEcomaxMw: row.selfScheduledEcomaxMw,
      };
      for (const fuel of row.fuels) {
        chartRow[fuelKey(fuel.fuelType)] = fuel.mw;
      }
      return chartRow;
    });
  }, [data]);

  const chartSubtitle = data?.selectedDate
    ? `${data.selectedDate} EPT | ${data.summary.hourCount} hourly records`
    : "Latest common complete operating day";
  const rtAvailabilityTone =
    data && data.summary.rtEcomaxAvailableHours === data.summary.hourCount ? "good" : "warn";

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
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
              {(data?.availableDates ?? []).map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusBadge
              label={`${data?.availableDates.length ?? 0} common days`}
              tone={data?.availableDates.length ? "good" : "warn"}
            />
            <StatusBadge
              label={`RT ecomax ${data?.summary.rtEcomaxAvailableHours ?? 0}/${data?.summary.hourCount ?? 0}`}
              tone={rtAvailabilityTone}
            />
            <StatusBadge label={`As of ${fmtDateTime(data?.asOf)}`} tone="neutral" />
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {loading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading generation data...
        </div>
      )}

      {data && !loading && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <StatTile
              label="Avg Generation"
              value={fmtMw(data.summary.avgGenerationMw)}
              sub={data.selectedDate ?? undefined}
            />
            <StatTile
              label="Peak Generation"
              value={fmtMw(data.summary.peakGenerationMw)}
              sub={fmtDateTime(data.summary.peakGenerationHourEpt)}
            />
            <StatTile
              label="Renewable Share"
              value={fmtPct(data.summary.avgRenewableSharePct)}
              sub={`${data.summary.fuelCount} fuel buckets`}
            />
            <StatTile
              label="Economic Max"
              value={fmtMw(data.summary.avgEcoMaxMw)}
              sub={`${fmtPct(data.summary.avgGenerationToEcoMaxPct)} utilized`}
            />
            <StatTile
              label="Committed"
              value={fmtMw(data.summary.avgTotalCommittedMw)}
              sub={`${fmtPct(data.summary.avgGenerationToCommittedPct)} utilized`}
            />
            <StatTile
              label="Self Scheduled"
              value={fmtMw(data.summary.avgSelfScheduledEcomaxMw)}
              sub={`RT ecomax ${data.summary.rtEcomaxAvailableHours}/${data.summary.hourCount}`}
            />
          </div>

          {data.summary.rtEcomaxSuppressedHours > 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
              RT load and reserve economic max is suppressed for{" "}
              {data.summary.rtEcomaxSuppressedHours} hourly records by the source confidentiality
              disclaimer.
            </div>
          )}

          <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-100">Fuel Mix And Capacity</h2>
                <p className="mt-1 text-xs text-gray-500">{chartSubtitle}</p>
              </div>
              <div className="flex max-w-full flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                {topFuels.map((fuel, index) => (
                  <span key={fuel.fuelType} className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: fuelColor(fuel.fuelType, index) }}
                      aria-hidden="true"
                    />
                    {fuel.fuelType}
                  </span>
                ))}
              </div>
            </div>

            {chartRows.length ? (
              <div className="h-[430px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartRows}
                    margin={{ top: 12, right: 18, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="hourLabel"
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      minTickGap={14}
                    />
                    <YAxis
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                      width={58}
                      label={{ value: "MW", angle: -90, position: "insideLeft", fill: "#6b7280" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#111827",
                        border: "1px solid #374151",
                        borderRadius: 8,
                        color: "#e5e7eb",
                      }}
                      labelFormatter={(label) => `${String(label)} EPT`}
                      formatter={(value, name) => [
                        fmtMw(toNumber(value)),
                        fuelLabel(String(name))
                          .replace("totalGenerationMw", "Total generation")
                          .replace("ecoMaxMw", "Economic max")
                          .replace("emergencyMaxMw", "Emergency max")
                          .replace("totalCommittedMw", "Total committed")
                          .replace("rtEcomaxMw", "RT load/reserve ecomax")
                          .replace("selfScheduledEcomaxMw", "Self-scheduled ecomax"),
                      ]}
                    />
                    {topFuels.map((fuel, index) => (
                      <Area
                        key={fuel.fuelType}
                        type="monotone"
                        dataKey={fuelKey(fuel.fuelType)}
                        name={fuel.fuelType}
                        stackId="fuel"
                        stroke={fuelColor(fuel.fuelType, index)}
                        fill={fuelColor(fuel.fuelType, index)}
                        fillOpacity={0.68}
                        strokeWidth={1}
                        isAnimationActive={false}
                      />
                    ))}
                    <Line
                      type="monotone"
                      dataKey="totalGenerationMw"
                      name="Total generation"
                      stroke="#ffffff"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="ecoMaxMw"
                      name="Economic max"
                      stroke="#60a5fa"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="emergencyMaxMw"
                      name="Emergency max"
                      stroke="#fb7185"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="totalCommittedMw"
                      name="Total committed"
                      stroke="#a3e635"
                      strokeWidth={2}
                      strokeDasharray="8 5"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="selfScheduledEcomaxMw"
                      name="Self-scheduled ecomax"
                      stroke="#f97316"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="rtEcomaxMw"
                      name="RT load/reserve ecomax"
                      stroke="#c084fc"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[320px] items-center justify-center rounded-md border border-gray-800 bg-gray-950/40 text-sm text-gray-500">
                No generation rows are available for the selected day.
              </div>
            )}
          </section>

          <DataTableShell
            title="Hourly Generation Matrix"
            subtitle="HE rows with PJM fuel buckets and joined capacity and scheduled-generation fields across columns. MW unless noted."
          >
            <table className="w-full min-w-[1540px] border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr>
                  <th className="sticky left-0 z-20 bg-gray-950 px-3 py-2 text-left font-semibold uppercase tracking-wide">
                    HE
                  </th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                    EPT Begin
                  </th>
                  {topFuels.map((fuel, index) => (
                    <th
                      key={fuel.fuelType}
                      className="px-3 py-2 text-right font-semibold uppercase tracking-wide"
                    >
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: fuelColor(fuel.fuelType, index) }}
                          aria-hidden="true"
                        />
                        {fuel.fuelType}
                      </span>
                    </th>
                  ))}
                  {[
                    "Generation",
                    "Renew %",
                    "Eco Max",
                    "Emergency Max",
                    "Committed",
                    "RT Ecomax",
                    "Self Ecomax",
                  ].map((label) => (
                    <th
                      key={label}
                      className="px-3 py-2 text-right font-semibold uppercase tracking-wide"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.hourly.map((row) => (
                  <tr key={row.hourUtc} className="hover:bg-gray-900/60">
                    <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2 text-left font-semibold text-gray-100">
                      {fmtHe(row.hourBeginning)}
                    </td>
                    <td className="px-3 py-2 text-left tabular-nums text-gray-400">
                      {fmtHour(row.hourEpt)}
                    </td>
                    {topFuels.map((fuel) => (
                      <td key={fuel.fuelType} className="px-3 py-2 text-right tabular-nums">
                        {fmtNumber(fuelMw(row, fuel.fuelType))}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-100">
                      {fmtNumber(row.totalGenerationMw)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtPct(row.renewableSharePct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtNumber(row.ecoMaxMw)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtNumber(row.emergencyMaxMw)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtNumber(row.totalCommittedMw)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.rtEcomaxSuppressed ? "Suppressed" : fmtNumber(row.rtEcomaxMw)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtNumber(row.selfScheduledEcomaxMw)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>

          <DataTableShell title="Source Windows" subtitle="Raw table coverage behind the view.">
            <table className="w-full min-w-[760px] border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr>
                  {["Source", "Rows", "Min EPT", "Max EPT", "Updated"].map((label) => (
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
                {data.freshness.map((row) => (
                  <tr key={row.sourceTable} className="hover:bg-gray-900/60">
                    <td className="px-3 py-2 text-left font-semibold text-gray-100">
                      {row.sourceTable}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtNumber(row.rowCount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtDateTime(row.minEpt)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtDateTime(row.maxEpt)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtDateTime(row.latestUpdateAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        </>
      )}
    </div>
  );
}
