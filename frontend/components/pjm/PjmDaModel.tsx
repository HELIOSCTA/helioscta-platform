"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
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

import DataTableShell from "@/components/dashboard/DataTableShell";
import PlotCard, { type PlotSeries } from "@/components/dashboard/PlotCard";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type RowKind = "series" | "dispersion";

interface PjmDaModelHourly {
  hourEnding: number;
  actualDatetimeEpt: string | null;
  actualDaLmp: number | null;
  pointForecast: number | null;
  ensAvg: number | null;
  ensBottom: number | null;
  ensTop: number | null;
  membersP25: number | null;
  membersP75: number | null;
}

interface PjmDaModelTableRow {
  key: string;
  label: string;
  kind: RowKind;
  values: Array<number | null>;
  onPeak: number | null;
  offPeak: number | null;
  flat: number | null;
}

interface PjmDaModelPayload {
  iso: "pjm";
  source: string;
  sourceContract: string;
  targetDate: string | null;
  defaultTargetDate: string | null;
  availableTargetDates: string[];
  cutoffUtc: string | null;
  hub: string | null;
  detIssueUtc: string | null;
  ensIssueUtc: string | null;
  actualAsOf: string | null;
  asOf: string | null;
  headlineOnPeak: number | null;
  hourly: PjmDaModelHourly[];
  rows: PjmDaModelTableRow[];
}

export interface PjmDaModelFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
  cutoffLabel: string;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const HOURS = Array.from({ length: 24 }, (_, index) => index + 1);
const DEFAULT_FRESHNESS: PjmDaModelFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "DA model --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
  cutoffLabel: "--",
};

const CHART_SERIES_BASE: PlotSeries[] = [
  { key: "actualDa", label: "Actual DA", color: "#34d399", defaultVisible: true },
  { key: "envelope", label: "ENS Bottom-Top", color: "#f97316", defaultVisible: true },
  { key: "members", label: "Members P25-P75", color: "#facc15", defaultVisible: true },
  { key: "det", label: "Det", color: "#38bdf8", defaultVisible: true },
  { key: "ensAvg", label: "ENS Avg", color: "#fde047", defaultVisible: true },
];

function buildApiUrl(date: string | null, cutoffUtc: string | null, refresh: boolean): string {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (cutoffUtc) params.set("cutoff", cutoffUtc);
  if (refresh) params.set("refresh", "1");
  const query = params.toString();
  return query ? `/api/pjm-da-model?${query}` : "/api/pjm-da-model";
}

function buildCacheKey(date: string | null, cutoffUtc: string | null): string {
  return `api:pjm-da-model:${date ?? "default"}:${cutoffUtc ?? "latest"}`;
}

function fmtDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "-";
}

function fmtStamp(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function fmtPrice(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(decimals);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function utcNowInput(): string {
  const now = new Date();
  return [
    now.getUTCFullYear(),
    "-",
    pad2(now.getUTCMonth() + 1),
    "-",
    pad2(now.getUTCDate()),
    "T",
    pad2(now.getUTCHours()),
    ":",
    pad2(now.getUTCMinutes()),
  ].join("");
}

function freshnessFromPayload(data: PjmDaModelPayload): PjmDaModelFreshnessSummary {
  if (!data.targetDate || data.rows.length === 0) {
    return {
      status: "No Data",
      statusClass: "border-amber-500/40 bg-amber-500/10 text-amber-200",
      summary: "Meteo DA price forecast is unavailable",
      targetDateLabel: data.targetDate ?? "--",
      latestDateLabel: data.defaultTargetDate ?? "--",
      latestUpdateLabel: fmtStamp(data.asOf),
      cutoffLabel: fmtStamp(data.cutoffUtc),
    };
  }

  return {
    status: "Available",
    statusClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    summary: `${fmtDate(data.targetDate)} | Det OnPeak ${fmtPrice(data.headlineOnPeak, 2)}`,
    targetDateLabel: data.targetDate,
    latestDateLabel: fmtDate(data.defaultTargetDate),
    latestUpdateLabel: fmtStamp(data.asOf),
    cutoffLabel: fmtStamp(data.cutoffUtc),
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
    <div className="rounded-md border border-gray-800 bg-gray-950/40 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gray-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-600">{sub}</p>}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function rowMarkerColor(row: PjmDaModelTableRow): string {
  if (row.key === "Actual DA") return "#34d399";
  if (row.key === "Det") return "#38bdf8";
  if (row.key === "ENS Avg") return "#fde047";
  if (row.key === "ENS Bottom" || row.key === "ENS Top") return "#f97316";
  return "#94a3b8";
}

function rowTextClass(row: PjmDaModelTableRow): string {
  if (row.key === "Actual DA") return "text-emerald-200";
  if (row.key === "Det") return "text-sky-200";
  if (row.key === "ENS Avg") return "text-yellow-100";
  if (row.key === "ENS Bottom" || row.key === "ENS Top") return "text-orange-200";
  return "text-gray-300";
}

function levelHeatStyle(value: number | null, min: number, max: number): CSSProperties | undefined {
  if (value === null || min === max) return undefined;
  const ratio = Math.min(Math.max((value - min) / (max - min), 0), 1);
  const alpha = 0.06 + ratio * 0.22;
  return {
    backgroundColor: `rgba(56, 189, 248, ${alpha.toFixed(2)})`,
    color: "#f8fafc",
  };
}

function cellStyle(row: PjmDaModelTableRow, value: number | null): CSSProperties | undefined {
  const nums = row.values.filter((entry): entry is number => entry !== null);
  if (!nums.length) return undefined;
  return levelHeatStyle(value, Math.min(...nums), Math.max(...nums));
}

function chartRows(hourly: PjmDaModelHourly[]) {
  return hourly.map((entry) => ({
    hourEnding: entry.hourEnding,
    envelope:
      entry.ensBottom !== null && entry.ensTop !== null
        ? [entry.ensBottom, entry.ensTop]
        : null,
    members:
      entry.membersP25 !== null && entry.membersP75 !== null
        ? [entry.membersP25, entry.membersP75]
        : null,
    actualDa: entry.actualDaLmp,
    det: entry.pointForecast,
    ensAvg: entry.ensAvg,
  }));
}

function tooltipValue(value: unknown): string {
  if (Array.isArray(value)) {
    const [left, right] = value as Array<number | null>;
    return `${fmtPrice(left, 2)} to ${fmtPrice(right, 2)}`;
  }
  return fmtPrice(typeof value === "number" ? value : Number(value), 2);
}

export default function PjmDaModel({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmDaModelFreshnessSummary) => void;
}) {
  const [data, setData] = useState<PjmDaModelPayload | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedCutoff, setSelectedCutoff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    const forceRefresh = refreshToken > 0;

    setLoading(true);
    setError(null);

    fetchJsonWithCache<PjmDaModelPayload>({
      key: buildCacheKey(selectedDate, selectedCutoff),
      url: buildApiUrl(selectedDate, selectedCutoff, forceRefresh),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      forceRefresh,
    })
      .then((payload) => {
        setData(payload);
        onFreshnessChange?.(freshnessFromPayload(payload));
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        const message = caught instanceof Error ? caught.message : "Failed to load DA model";
        setError(message);
        onFreshnessChange?.({
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "DA model request failed",
          targetDateLabel: selectedDate ?? "--",
          latestDateLabel: "--",
          latestUpdateLabel: "--",
          cutoffLabel: fmtStamp(selectedCutoff),
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [onFreshnessChange, refreshToken, selectedCutoff, selectedDate]);

  useEffect(() => {
    if (!data) {
      onFreshnessChange?.(DEFAULT_FRESHNESS);
    }
  }, [data, onFreshnessChange]);

  const tableRows = data?.rows ?? [];
  const actualRow = tableRows.find((row) => row.key === "Actual DA") ?? null;
  const detRow = tableRows.find((row) => row.key === "Det") ?? null;
  const avgRow = tableRows.find((row) => row.key === "ENS Avg") ?? null;
  const widthRow = tableRows.find((row) => row.key === "Width") ?? null;
  const iqrRow = tableRows.find((row) => row.key === "IQR") ?? null;

  const chartSeries = useMemo(() => [...CHART_SERIES_BASE], []);

  const rowsForChart = useMemo(() => chartRows(data?.hourly ?? []), [data?.hourly]);

  const toggleSeries = (key: string) => {
    setHiddenSeries((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderChart = (heightClass: string) => (
    <div className={`${heightClass} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rowsForChart} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
          <XAxis
            dataKey="hourEnding"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            stroke="#4b5563"
            ticks={[1, 4, 8, 12, 16, 20, 24]}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            stroke="#4b5563"
            tickFormatter={(value) => `$${Math.round(Number(value))}`}
            width={48}
          />
          <ReferenceArea x1={8} x2={23} fill="#0ea5e9" fillOpacity={0.08} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#111827",
              border: "1px solid #374151",
              color: "#f9fafb",
              fontSize: 12,
            }}
            labelFormatter={(value) => `HE${value}`}
            formatter={(value, name) => [tooltipValue(value), String(name)]}
          />
          {!hiddenSeries.has("envelope") && (
            <Area
              type="monotone"
              dataKey="envelope"
              name="ENS Bottom-Top"
              stroke="none"
              fill="#f97316"
              fillOpacity={0.18}
              isAnimationActive={false}
            />
          )}
          {!hiddenSeries.has("members") && (
            <Area
              type="monotone"
              dataKey="members"
              name="Members P25-P75"
              stroke="none"
              fill="#facc15"
              fillOpacity={0.16}
              isAnimationActive={false}
            />
          )}
          {!hiddenSeries.has("actualDa") && (
            <Line
              type="monotone"
              dataKey="actualDa"
              name="Actual DA"
              stroke="#34d399"
              strokeWidth={2.6}
              dot={{ r: 2.6, fill: "#34d399", strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
          {!hiddenSeries.has("det") && (
            <Line
              type="monotone"
              dataKey="det"
              name="Det"
              stroke="#38bdf8"
              strokeWidth={2.4}
              dot={false}
              isAnimationActive={false}
            />
          )}
          {!hiddenSeries.has("ensAvg") && (
            <Line
              type="monotone"
              dataKey="ensAvg"
              name="ENS Avg"
              stroke="#fde047"
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionCard
        title="DA Model Controls"
        subtitle="Meteologica Western Hub day-ahead price forecast"
      >
        <div className="grid gap-3 lg:grid-cols-[220px_260px_auto] lg:items-end">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Target Date
            </span>
            <select
              value={selectedDate ?? ""}
              onChange={(event) => {
                setSelectedDate(event.target.value || null);
              }}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            >
              <option value="">Latest target</option>
              {(data?.availableTargetDates ?? []).map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Cutoff UTC
            </span>
            <input
              type="datetime-local"
              step={60}
              value={selectedCutoff ?? ""}
              onChange={(event) => setSelectedCutoff(event.target.value || null)}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedDate(null);
              }}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Latest Target
            </button>
            <button
              type="button"
              onClick={() => setSelectedCutoff(utcNowInput())}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Cutoff Now
            </button>
            <button
              type="button"
              onClick={() => setSelectedCutoff(null)}
              disabled={!selectedCutoff}
              className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm font-semibold text-gray-400 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>
      </SectionCard>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading DA model...
        </div>
      )}

      {data && data.rows.length === 0 && !loading && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          No Meteologica Western Hub DA price forecast was found
          {data.cutoffUtc ? " before this cutoff." : " for this selection."}
        </div>
      )}

      {data && data.rows.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              label="Actual DA OnPeak"
              value={fmtPrice(actualRow?.onPeak, 2)}
              sub={`PJM ${fmtStamp(data.actualAsOf)}`}
            />
            <StatTile
              label="Det OnPeak"
              value={fmtPrice(detRow?.onPeak, 2)}
              sub={`${data.hub ?? "Hub"} | ${fmtDate(data.targetDate)}`}
            />
            <StatTile
              label="ENS Avg OnPeak"
              value={fmtPrice(avgRow?.onPeak, 2)}
              sub={`Default ${fmtDate(data.defaultTargetDate)}`}
            />
            <StatTile
              label="ENS Width"
              value={fmtPrice(widthRow?.onPeak, 2)}
              sub="OnPeak top minus bottom"
            />
            <StatTile
              label="Members IQR"
              value={fmtPrice(iqrRow?.onPeak, 2)}
              sub={data.cutoffUtc ? `Cutoff ${fmtStamp(data.cutoffUtc)}` : `As of ${fmtStamp(data.asOf)}`}
            />
          </div>

          <SectionCard title="Source Metadata" subtitle={`${data.source} | ${data.sourceContract}`}>
            <div className="grid gap-2 text-xs text-gray-400 sm:grid-cols-2 xl:grid-cols-6">
              <div>
                <span className="text-gray-600">Hub</span>
                <p className="mt-1 text-gray-200">{data.hub ?? "-"}</p>
              </div>
              <div>
                <span className="text-gray-600">Det issue</span>
                <p className="mt-1 text-gray-200">{fmtStamp(data.detIssueUtc)}</p>
              </div>
              <div>
                <span className="text-gray-600">ENS issue</span>
                <p className="mt-1 text-gray-200">{fmtStamp(data.ensIssueUtc)}</p>
              </div>
              <div>
                <span className="text-gray-600">Actual DA update</span>
                <p className="mt-1 text-gray-200">{fmtStamp(data.actualAsOf)}</p>
              </div>
              <div>
                <span className="text-gray-600">Data as of</span>
                <p className="mt-1 text-gray-200">{fmtStamp(data.asOf)}</p>
              </div>
              <div>
                <span className="text-gray-600">Cutoff UTC</span>
                <p className="mt-1 text-gray-200">{fmtStamp(data.cutoffUtc)}</p>
              </div>
            </div>
          </SectionCard>

          <PlotCard
            title="Hourly Forecast vs Actual"
            subtitle={`Raw Meteo + PJM DA ${data.hub ?? ""} | ${fmtDate(data.targetDate)} | $/MWh`}
            series={chartSeries}
            hiddenSeries={hiddenSeries}
            onToggleSeries={toggleSeries}
            onShowAll={() => setHiddenSeries(new Set())}
            onHideAll={() => setHiddenSeries(new Set(chartSeries.map((series) => series.key)))}
            focusedChildren={renderChart("h-[70vh]")}
          >
            {renderChart("h-[340px]")}
          </PlotCard>

          <DataTableShell
            title="Forecast And Actual Bands"
            subtitle="Actual DA is from PJM DA hourly LMPs; forecast rows mirror the Meteologica DA price report layout."
            bodyClassName="max-h-[70vh] overflow-auto"
          >
            <table className="w-max min-w-[1680px] border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="sticky top-0 z-30 bg-gray-950 text-gray-500">
                <tr>
                  <th className="sticky left-0 top-0 z-40 w-[130px] bg-gray-950 px-3 py-2 text-left font-semibold uppercase tracking-wide shadow-[2px_0_0_rgba(31,41,55,0.9)]">
                    Series
                  </th>
                  {HOURS.map((hour) => (
                    <th
                      key={hour}
                      className={`w-[58px] px-2 py-2 text-right font-semibold uppercase tracking-wide ${
                        hour >= 8 && hour <= 23 ? "bg-sky-500/10 text-sky-200" : ""
                      } ${hour === 8 ? "border-l border-dotted border-sky-700/70" : ""} ${
                        hour === 23 ? "border-r border-dotted border-sky-700/70" : ""
                      }`}
                    >
                      HE{hour}
                    </th>
                  ))}
                  <th className="border-l border-gray-700 bg-gray-950 px-3 py-2 text-right font-semibold uppercase tracking-wide">
                    OnPeak
                  </th>
                  <th className="bg-gray-950 px-3 py-2 text-right font-semibold uppercase tracking-wide">
                    OffPeak
                  </th>
                  <th className="bg-gray-950 px-3 py-2 text-right font-semibold uppercase tracking-wide">
                    Flat
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {tableRows.map((row) => (
                  <tr key={row.key} className="hover:bg-gray-900/60">
                    <td
                      className={`sticky left-0 z-20 bg-[#0d1119] px-3 py-2 font-semibold shadow-[2px_0_0_rgba(31,41,55,0.9)] ${rowTextClass(row)}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: rowMarkerColor(row) }}
                          aria-hidden="true"
                        />
                        {row.label}
                      </span>
                    </td>
                    {HOURS.map((hour) => {
                      const value = row.values[hour - 1] ?? null;
                      return (
                        <td
                          key={hour}
                          className={`px-2 py-2 text-right tabular-nums ${
                            hour === 8 ? "border-l border-dotted border-sky-700/70" : ""
                          } ${hour === 23 ? "border-r border-dotted border-sky-700/70" : ""}`}
                          style={cellStyle(row, value)}
                        >
                          {fmtPrice(value)}
                        </td>
                      );
                    })}
                    <td className="border-l border-gray-700 bg-gray-950/70 px-3 py-2 text-right font-semibold tabular-nums text-gray-100">
                      {fmtPrice(row.onPeak, 2)}
                    </td>
                    <td className="bg-gray-950/70 px-3 py-2 text-right font-semibold tabular-nums text-gray-100">
                      {fmtPrice(row.offPeak, 2)}
                    </td>
                    <td className="bg-gray-950/70 px-3 py-2 text-right font-semibold tabular-nums text-gray-100">
                      {fmtPrice(row.flat, 2)}
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
