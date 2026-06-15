"use client";

import type { CSSProperties, ReactNode } from "react";
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
import PlotCard, { type PlotSeries } from "@/components/dashboard/PlotCard";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type OutagesView = "forecast" | "seasonal";
type OutageMetricKey =
  | "total_outages_mw"
  | "planned_outages_mw"
  | "forced_outages_mw"
  | "maintenance_outages_mw";

interface OutageRow {
  as_of_date?: string | null;
  forecast_execution_date?: string | null;
  forecast_date?: string | null;
  date?: string | null;
  lead_days?: number | null;
  region: string;
  total_outages_mw?: number | null;
  planned_outages_mw?: number | null;
  maintenance_outages_mw?: number | null;
  forced_outages_mw?: number | null;
  year?: number | null;
  day_of_year?: number | null;
}

interface PjmOutagesPayload {
  view: OutagesView;
  region: string;
  regions: string[];
  years: number[];
  asOf: string | null;
  rowCount: number;
  rows: OutageRow[];
}

export interface PjmOutagesFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

const API_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_REGION = "RTO";

const OUTAGE_METRICS: Array<{ key: OutageMetricKey; label: string; color: string }> = [
  { key: "total_outages_mw", label: "Total", color: "#e5e7eb" },
  { key: "planned_outages_mw", label: "Planned", color: "#38bdf8" },
  { key: "forced_outages_mw", label: "Forced", color: "#f97316" },
  { key: "maintenance_outages_mw", label: "Maintenance", color: "#a78bfa" },
];

const DEFAULT_FRESHNESS: PjmOutagesFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Outages --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

function fmtMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString();
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function fmtShortDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return fmtDate(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function labelExecutionDate(value: string, execDates: string[]): string {
  const index = execDates.indexOf(value);
  if (index === 0) return "Current";
  if (index === 1) return "24hrs Ago";
  return fmtShortDate(value);
}

function buildApiUrl({
  region,
  refresh,
}: {
  region: string;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({ view: "forecast", region });
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-outages?${params.toString()}`;
}

function buildCacheKey({ region }: { region: string }): string {
  return ["api:pjm-outages", "forecast", region].join(":");
}

function freshnessFromPayload(payload: PjmOutagesPayload | null): PjmOutagesFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  return {
    status: payload.asOf ? "Current" : "Unknown",
    statusClass: payload.asOf
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-gray-700 bg-gray-900 text-gray-400",
    summary: `${payload.region} vintages | ${payload.rowCount.toLocaleString()} rows`,
    targetDateLabel: payload.region,
    latestDateLabel: fmtDate(payload.asOf),
    latestUpdateLabel: fmtDate(payload.asOf),
  };
}

function metricValue(row: OutageRow, metric: OutageMetricKey): number | null {
  return row[metric] ?? null;
}

function hasMetricValues(rows: OutageRow[], metric: OutageMetricKey): boolean {
  return rows.some((row) => metricValue(row, metric) !== null);
}

interface HeatBounds {
  min: number;
  max: number;
}

interface SeasonalChartPoint {
  dayOfYear: number;
  monthLabel: string;
  [series: string]: number | string | [number, number] | null;
}

interface OutagesData {
  forecast: PjmOutagesPayload;
  seasonal: PjmOutagesPayload;
}

function heatCellStyle(value: number | null, min: number, max: number): CSSProperties {
  if (value === null || min === max) return {};
  const midpoint = (min + max) / 2;
  const spread = Math.max(Math.abs(max - midpoint), Math.abs(midpoint - min));
  if (spread === 0) return {};
  const distance = Math.min(Math.abs(value - midpoint) / spread, 1);
  if (distance < 0.1) return {};
  const intensity = (distance - 0.1) / 0.9;
  const alpha = 0.06 + intensity * 0.2;
  const [r, g, b] = value >= midpoint ? [22, 163, 74] : [220, 38, 38];
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`,
    boxShadow: `inset 2px 0 0 rgba(${r}, ${g}, ${b}, ${(alpha + 0.12).toFixed(2)})`,
    color: "#e5e7eb",
  };
}

function uniqueSorted(values: Array<string | null | undefined>, desc = false): string[] {
  const sorted = Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
  return desc ? sorted.reverse() : sorted;
}

function dayOfYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86_400_000);
}

function monthLabel(day: number): string {
  const labels = [
    [1, "Jan"],
    [32, "Feb"],
    [60, "Mar"],
    [91, "Apr"],
    [121, "May"],
    [152, "Jun"],
    [182, "Jul"],
    [213, "Aug"],
    [244, "Sep"],
    [274, "Oct"],
    [305, "Nov"],
    [335, "Dec"],
  ] as const;
  return labels.findLast(([start]) => day >= start)?.[1] ?? "";
}

function renderTooltipValue(value: unknown) {
  if (Array.isArray(value) && value.length === 2) {
    const [min, max] = value;
    if (typeof min === "number" && typeof max === "number") {
      return `${Math.round(min).toLocaleString()} - ${Math.round(max).toLocaleString()} MW`;
    }
  }
  if (typeof value !== "number") return "-";
  return `${Math.round(value).toLocaleString()} MW`;
}

function buildDateHeatBounds(rows: OutageRow[], metric: OutageMetricKey): Map<string, HeatBounds> {
  const valuesByDate = new Map<string, number[]>();

  rows.forEach((row) => {
    if (!row.forecast_date) return;
    const value = metricValue(row, metric);
    if (value === null) return;
    const values = valuesByDate.get(row.forecast_date) ?? [];
    values.push(value);
    valuesByDate.set(row.forecast_date, values);
  });

  const bounds = new Map<string, HeatBounds>();
  valuesByDate.forEach((values, date) => {
    bounds.set(date, {
      min: Math.min(...values),
      max: Math.max(...values),
    });
  });
  return bounds;
}

function buildSeasonalChartRows({
  seasonalRows,
  forecastRows,
  metric,
  currentYear,
  lastYear,
  averageYears,
  latestExecDate,
}: {
  seasonalRows: OutageRow[];
  forecastRows: OutageRow[];
  metric: OutageMetricKey;
  currentYear: number | null;
  lastYear: number | null;
  averageYears: number[];
  latestExecDate: string | undefined;
}): SeasonalChartPoint[] {
  const byDay = new Map<number, SeasonalChartPoint>();
  for (let day = 1; day <= 366; day += 1) {
    byDay.set(day, { dayOfYear: day, monthLabel: monthLabel(day) });
  }

  const valuesByDayYear = new Map<number, Map<number, number>>();
  seasonalRows.forEach((row) => {
    if (!row.year || !row.day_of_year) return;
    const value = metricValue(row, metric);
    if (value === null) return;
    const valuesByYear = valuesByDayYear.get(row.day_of_year) ?? new Map<number, number>();
    valuesByYear.set(row.year, value);
    valuesByDayYear.set(row.day_of_year, valuesByYear);
  });

  byDay.forEach((point, day) => {
    const valuesByYear = valuesByDayYear.get(day);
    if (!valuesByYear) return;

    point.currentYear = currentYear ? valuesByYear.get(currentYear) ?? null : null;
    point.lastYear = lastYear ? valuesByYear.get(lastYear) ?? null : null;

    const rangeValues = averageYears
      .map((year) => valuesByYear.get(year))
      .filter((value): value is number => value !== undefined);
    point.fiveYearRange = rangeValues.length
      ? [Math.min(...rangeValues), Math.max(...rangeValues)]
      : null;
  });

  forecastRows
    .filter((row) => row.forecast_execution_date === latestExecDate)
    .forEach((row) => {
      const day = dayOfYear(row.forecast_date);
      if (!day) return;
      const point = byDay.get(day);
      if (!point) return;
      point.currentYearForecast = metricValue(row, metric);
    });

  return Array.from(byDay.values());
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

function TableHeatmapToggle({
  enabled,
  onToggle,
  label = "Heatmap",
}: {
  enabled: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={onToggle}
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
        enabled
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${enabled ? "bg-emerald-300" : "bg-gray-600"}`}
        aria-hidden="true"
      />
      {label}
    </button>
  );
}

export default function PjmOutages({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmOutagesFreshnessSummary) => void;
}) {
  const [activeView, setActiveView] = useState<OutagesView>("forecast");
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [data, setData] = useState<OutagesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenSeasonalSeries, setHiddenSeasonalSeries] = useState<Set<string>>(() => new Set());
  const [tableHeatmapEnabled, setTableHeatmapEnabled] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchJsonWithCache<PjmOutagesPayload>({
        key: buildCacheKey({ region }),
        url: buildApiUrl({ region, refresh: refreshToken > 0 }),
        ttlMs: API_CACHE_TTL_MS,
        signal: controller.signal,
        cacheMode: refreshToken > 0 ? "no-store" : "default",
        forceRefresh: refreshToken > 0,
      }),
      fetchJsonWithCache<PjmOutagesPayload>({
        key: ["api:pjm-outages", "seasonal", region].join(":"),
        url: `/api/pjm-outages?${new URLSearchParams({
          view: "seasonal",
          region,
          ...(refreshToken > 0 ? { refresh: "1" } : {}),
        }).toString()}`,
        ttlMs: API_CACHE_TTL_MS,
        signal: controller.signal,
        cacheMode: refreshToken > 0 ? "no-store" : "default",
        forceRefresh: refreshToken > 0,
      }),
    ])
      .then(([forecast, seasonal]) => {
        if (!active) return;
        setData({ forecast, seasonal });
        onFreshnessChange?.(freshnessFromPayload(forecast));
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setError(err.message || "Failed to load PJM outages");
        setData(null);
        onFreshnessChange?.({
          ...DEFAULT_FRESHNESS,
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Outage query failed",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [region, refreshToken, onFreshnessChange]);

  const regions = data?.forecast.regions.length ? data.forecast.regions : [region];
  const rows = useMemo(() => data?.forecast.rows ?? [], [data]);
  const seasonalRows = useMemo(() => data?.seasonal.rows ?? [], [data]);
  const execDates = useMemo(
    () => uniqueSorted(rows.map((row) => row.forecast_execution_date), true),
    [rows]
  );
  const forecastDates = useMemo(
    () => uniqueSorted(rows.map((row) => row.forecast_date)),
    [rows]
  );
  const forecastMetrics = useMemo(
    () => OUTAGE_METRICS.filter((item) => hasMetricValues(rows, item.key)),
    [rows]
  );
  const seasonalMetrics = useMemo(
    () => OUTAGE_METRICS.filter((item) => hasMetricValues(seasonalRows, item.key)),
    [seasonalRows]
  );
  const heatBoundsByMetric = useMemo(
    () =>
      new Map(
        forecastMetrics.map((item) => [item.key, buildDateHeatBounds(rows, item.key)] as const)
      ),
    [forecastMetrics, rows]
  );
  const seasonalYears = useMemo(() => data?.seasonal.years ?? [], [data]);
  const currentYear = seasonalYears.at(-1) ?? null;
  const lastYear = seasonalYears.length >= 2 ? seasonalYears.at(-2) ?? null : null;
  const averageYears = useMemo(
    () => seasonalYears.filter((year) => currentYear === null || year < currentYear).slice(-5),
    [currentYear, seasonalYears]
  );
  const seasonalSeries: PlotSeries[] = useMemo(
    () => [
      ...(currentYear
        ? [{ key: "currentYear", label: String(currentYear), color: "#22c55e", defaultVisible: true }]
        : []),
      ...(lastYear
        ? [{ key: "lastYear", label: String(lastYear), color: "#38bdf8", defaultVisible: true }]
        : []),
      { key: "fiveYearRange", label: "5Y Range", color: "#facc15", defaultVisible: true },
    ],
    [currentYear, lastYear]
  );

  const toggleSeasonalSeries = (key: string) => {
    setHiddenSeasonalSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderSeasonalChart = (metric: OutageMetricKey, heightClass: string) => {
    const chartRows = buildSeasonalChartRows({
      seasonalRows,
      forecastRows: rows,
      metric,
      currentYear,
      lastYear,
      averageYears,
      latestExecDate: execDates[0],
    });
    const currentYearSeries = seasonalSeries.find((series) => series.key === "currentYear");
    const lastYearSeries = seasonalSeries.find((series) => series.key === "lastYear");

    return (
      <div className={heightClass}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartRows} margin={{ top: 12, right: 24, bottom: 12, left: 8 }}>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
            <XAxis
              dataKey="dayOfYear"
              ticks={[1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]}
              tickFormatter={(value) => monthLabel(Number(value))}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#334155" }}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#334155" }}
              tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
            />
            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 6,
                color: "#e5e7eb",
              }}
              formatter={renderTooltipValue}
              labelFormatter={(value) => `Day ${value}`}
            />
            {!hiddenSeasonalSeries.has("fiveYearRange") && (
              <Area
                type="monotone"
                dataKey="fiveYearRange"
                name="5Y Range"
                stroke="none"
                fill="#facc15"
                fillOpacity={0.14}
                connectNulls
              />
            )}
            {currentYearSeries && !hiddenSeasonalSeries.has("currentYear") && (
              <Line
                type="monotone"
                dataKey="currentYear"
                name={currentYearSeries.label}
                stroke={currentYearSeries.color}
                dot={false}
                strokeWidth={2.5}
                connectNulls
              />
            )}
            {currentYearSeries && !hiddenSeasonalSeries.has("currentYear") && (
              <Line
                type="monotone"
                dataKey="currentYearForecast"
                name={`${currentYearSeries.label} Forecast`}
                stroke={currentYearSeries.color}
                dot={false}
                strokeWidth={2.5}
                strokeDasharray="5 3"
                connectNulls
              />
            )}
            {lastYearSeries && !hiddenSeasonalSeries.has("lastYear") && (
              <Line
                type="monotone"
                dataKey="lastYear"
                name={lastYearSeries.label}
                stroke={lastYearSeries.color}
                dot={false}
                strokeWidth={1.8}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Controls"
        subtitle={
          data
            ? `${data.forecast.region} | ${data.forecast.rowCount.toLocaleString()} forecast rows | ${data.seasonal.rowCount.toLocaleString()} seasonal rows`
            : undefined
        }
      >
        <div className="grid gap-3 md:grid-cols-[180px]">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Region
            </span>
            <select
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            >
              {regions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </SectionCard>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {loading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading outages...
        </div>
      )}

      {data && !loading && (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="PJM outage views">
            {[
              { key: "forecast" as const, label: "Forecast Tables" },
              { key: "seasonal" as const, label: "Seasonal Plots" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeView === tab.key}
                onClick={() => setActiveView(tab.key)}
                className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                  activeView === tab.key
                    ? "border-sky-500/50 bg-sky-500/10 text-white"
                    : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeView === "seasonal" &&
            seasonalMetrics.map((item) => (
              <div key={item.key} className="space-y-4">
                <PlotCard
                  title={`${item.label} Seasonal Overlay`}
                  subtitle={`${region}: ${currentYear ?? "current"} includes latest forecast | ${lastYear ?? "prior"} and 5Y min/max range`}
                  series={seasonalSeries}
                  hiddenSeries={hiddenSeasonalSeries}
                  onToggleSeries={toggleSeasonalSeries}
                  onShowAll={() => setHiddenSeasonalSeries(new Set())}
                  onHideAll={() =>
                    setHiddenSeasonalSeries(new Set(seasonalSeries.map((series) => series.key)))
                  }
                  focusedChildren={renderSeasonalChart(item.key, "h-[70vh]")}
                >
                  {renderSeasonalChart(item.key, "h-[360px]")}
                </PlotCard>
              </div>
            ))}

          {activeView === "forecast" &&
            forecastMetrics.map((item) => (
              <DataTableShell
                key={item.key}
                title={`${item.label} Forecast Vintage Heatmap`}
                subtitle={`${region}: latest ${execDates.length} forecast publications`}
                action={
                  <TableHeatmapToggle
                    enabled={tableHeatmapEnabled}
                    onToggle={() => setTableHeatmapEnabled((enabled) => !enabled)}
                  />
                }
              >
                <table className="w-full min-w-[900px] border-collapse bg-[#0d1119] text-xs text-gray-200">
                  <thead className="bg-gray-950 text-gray-500">
                    <tr>
                      <th className="sticky left-0 z-20 bg-gray-950 px-3 py-2 text-left font-semibold uppercase tracking-wide">
                        Forecast Exec
                      </th>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Label</th>
                      {forecastDates.map((date) => (
                        <th
                          key={date}
                          className="px-3 py-2 text-right font-semibold uppercase tracking-wide"
                        >
                          {fmtShortDate(date)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {execDates.map((execDate) => {
                      const byForecastDate = new Map(
                        rows
                          .filter((row) => row.forecast_execution_date === execDate)
                          .map((row) => [row.forecast_date, row])
                      );
                      return (
                        <tr key={execDate} className="hover:bg-gray-900/60">
                          <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2 font-medium text-gray-300">
                            {fmtShortDate(execDate)}
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {labelExecutionDate(execDate, execDates)}
                          </td>
                          {forecastDates.map((date) => {
                            const row = byForecastDate.get(date);
                            const value = row ? metricValue(row, item.key) : null;
                            const bounds = heatBoundsByMetric.get(item.key)?.get(date);
                            return (
                              <td
                                key={date}
                                className="px-3 py-2 text-right tabular-nums text-gray-300"
                                style={
                                  tableHeatmapEnabled && bounds
                                    ? heatCellStyle(value, bounds.min, bounds.max)
                                    : undefined
                                }
                              >
                                {fmtMw(value)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </DataTableShell>
            ))}
        </>
      )}
    </div>
  );
}
