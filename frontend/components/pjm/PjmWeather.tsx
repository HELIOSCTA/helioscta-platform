"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DataTableShell from "@/components/dashboard/DataTableShell";
import PlotCard, { type PlotSeries } from "@/components/dashboard/PlotCard";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type WeatherMetric = "tempF" | "dewPointF" | "feelsLikeF" | "windSpeedMph" | "windGustMph";

interface WeatherObservation {
  stationId: string;
  stationName: string;
  region: string;
  observationTimeUtc: string;
  observationHourUtc: string;
  tempF: number | null;
  dewPointF: number | null;
  feelsLikeF: number | null;
  windSpeedMph: number | null;
  windGustMph: number | null;
  windDirDegrees: number | null;
  pressureMb: number | null;
  visibilityMiles: number | null;
  rawMetar: string | null;
  updatedAt: string | null;
}

interface WeatherStation {
  stationId: string;
  stationName: string;
  region: string;
  latest: WeatherObservation | null;
  ageMinutes: number | null;
  stale: boolean;
}

interface WeatherExtreme {
  stationId: string;
  stationName: string;
  tempF: number | null;
}

interface PjmWeatherPayload {
  iso: "pjm";
  region: string;
  source: string;
  runAt: string;
  elapsedMs: number;
  asOf: string | null;
  hours: number;
  freshness: {
    status: string;
    latestObservationTimeUtc: string | null;
    stationCount: number;
    reportingStationCount: number;
    staleStationCount: number;
    staleThresholdMinutes: number;
    reason: string | null;
  };
  stations: WeatherStation[];
  latest: {
    avgTempF: number | null;
    avgDewPointF: number | null;
    avgFeelsLikeF: number | null;
    maxGustMph: number | null;
    hottestStation: WeatherExtreme | null;
    coldestStation: WeatherExtreme | null;
  };
  hourly: WeatherObservation[];
}

export interface PjmWeatherFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_REGION = "PJM";
const HOUR_OPTIONS = [12, 24, 36, 48] as const;
const METRICS: Array<{ key: WeatherMetric; label: string; unit: string; color: string }> = [
  { key: "tempF", label: "Temp", unit: "F", color: "#f97316" },
  { key: "dewPointF", label: "Dew Point", unit: "F", color: "#38bdf8" },
  { key: "feelsLikeF", label: "Feels Like", unit: "F", color: "#facc15" },
  { key: "windSpeedMph", label: "Wind", unit: "mph", color: "#22c55e" },
  { key: "windGustMph", label: "Gust", unit: "mph", color: "#a78bfa" },
];
const TEMP_SERIES: PlotSeries[] = [
  { key: "tempF", label: "Temp", color: "#f97316", defaultVisible: true },
  { key: "dewPointF", label: "Dew Point", color: "#38bdf8", defaultVisible: true },
  { key: "feelsLikeF", label: "Feels Like", color: "#facc15", defaultVisible: true },
];
const WIND_SERIES: PlotSeries[] = [
  { key: "windSpeedMph", label: "Wind", color: "#22c55e", defaultVisible: true },
  { key: "windGustMph", label: "Gust", color: "#a78bfa", defaultVisible: true },
];
const DEFAULT_FRESHNESS: PjmWeatherFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Weather --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

function metricValue(row: WeatherObservation | null | undefined, metric: WeatherMetric): number | null {
  return row?.[metric] ?? null;
}

function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function fmtMetric(value: number | null | undefined, metric: WeatherMetric): string {
  const config = METRICS.find((item) => item.key === metric);
  if (!config) return fmtNumber(value);
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value)}${config.unit === "F" ? "°" : ""}`;
}

function fmtTemp(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value)}°F`;
}

function fmtWind(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value)} mph`;
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(0, 16);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function fmtHour(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16);
  return date.toLocaleString("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function fmtAge(value: number | null): string {
  if (value === null) return "-";
  if (value < 90) return `${value}m`;
  return `${Math.round(value / 60)}h`;
}

function buildApiUrl({
  region,
  hours,
  refresh,
}: {
  region: string;
  hours: number;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({ region, hours: String(hours) });
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-weather?${params.toString()}`;
}

function buildCacheKey({ region, hours }: { region: string; hours: number }): string {
  return ["api:pjm-weather", region, hours].join(":");
}

function statusClass(status: string): string {
  if (status === "Current") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (status === "Partial") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (status === "Stale") return "border-orange-500/40 bg-orange-500/10 text-orange-200";
  if (status === "Unavailable" || status === "Empty") {
    return "border-gray-700 bg-gray-900 text-gray-400";
  }
  if (status === "Error") return "border-red-500/40 bg-red-500/10 text-red-200";
  return "border-gray-700 bg-gray-900 text-gray-400";
}

function freshnessFromPayload(payload: PjmWeatherPayload | null): PjmWeatherFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  return {
    status: payload.freshness.status,
    statusClass: statusClass(payload.freshness.status),
    summary: `${payload.freshness.reportingStationCount}/${payload.freshness.stationCount} stations | ${payload.freshness.staleStationCount} stale`,
    targetDateLabel: payload.region,
    latestDateLabel: fmtDateTime(payload.asOf),
    latestUpdateLabel: `${payload.elapsedMs}ms API`,
  };
}

function hourColumns(asOf: string | null, hours: number): string[] {
  const end = asOf ? new Date(asOf) : new Date();
  if (Number.isNaN(end.getTime())) return [];
  end.setUTCMinutes(0, 0, 0);
  return Array.from({ length: hours }, (_, index) => {
    const date = new Date(end);
    date.setUTCHours(end.getUTCHours() - (hours - index - 1));
    return date.toISOString();
  });
}

function observationHourKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

function heatCellStyle(value: number | null, min: number, max: number): CSSProperties {
  if (value === null || min === max) return {};
  const midpoint = (min + max) / 2;
  const spread = Math.max(Math.abs(max - midpoint), Math.abs(midpoint - min));
  if (spread === 0) return {};
  const distance = Math.min(Math.abs(value - midpoint) / spread, 1);
  if (distance < 0.08) return {};
  const intensity = (distance - 0.08) / 0.92;
  const alpha = 0.05 + intensity * 0.18;
  const [r, g, b] = value >= midpoint ? [22, 163, 74] : [220, 38, 38];
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`,
    boxShadow: `inset 2px 0 0 rgba(${r}, ${g}, ${b}, ${(alpha + 0.12).toFixed(2)})`,
    color: "#e5e7eb",
  };
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

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-gray-800 bg-gray-950/40 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gray-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-600">{sub}</p>}
    </div>
  );
}

function TableHeatmapToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
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
      Heatmap
    </button>
  );
}

export default function PjmWeather({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmWeatherFreshnessSummary) => void;
}) {
  const [region] = useState(DEFAULT_REGION);
  const [hours, setHours] = useState<number>(24);
  const [metric, setMetric] = useState<WeatherMetric>("tempF");
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [tableHeatmapEnabled, setTableHeatmapEnabled] = useState(true);
  const [hiddenTempSeries, setHiddenTempSeries] = useState<Set<string>>(() => new Set());
  const [hiddenWindSeries, setHiddenWindSeries] = useState<Set<string>>(() => new Set());
  const [data, setData] = useState<PjmWeatherPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    fetchJsonWithCache<PjmWeatherPayload>({
      key: buildCacheKey({ region, hours }),
      url: buildApiUrl({ region, hours, refresh: refreshToken > 0 }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        onFreshnessChange?.(freshnessFromPayload(payload));
        setSelectedStationId((current) => {
          if (current && payload.stations.some((station) => station.stationId === current)) {
            return current;
          }
          return payload.stations.find((station) => station.latest)?.stationId ?? payload.stations[0]?.stationId ?? null;
        });
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setError(err.message || "Failed to load PJM weather");
        setData(null);
        onFreshnessChange?.({
          ...DEFAULT_FRESHNESS,
          status: "Error",
          statusClass: statusClass("Error"),
          summary: "Weather query failed",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [hours, region, refreshToken, onFreshnessChange]);

  const selectedMetric = METRICS.find((item) => item.key === metric)!;
  const columns = useMemo(() => hourColumns(data?.asOf ?? null, data?.hours ?? hours), [data, hours]);
  const hourlyByStationHour = useMemo(() => {
    const map = new Map<string, WeatherObservation>();
    data?.hourly.forEach((row) => {
      map.set(`${row.stationId}|${observationHourKey(row.observationHourUtc)}`, row);
    });
    return map;
  }, [data]);
  const metricValues = useMemo(
    () =>
      (data?.hourly ?? [])
        .map((row) => metricValue(row, metric))
        .filter((value): value is number => value !== null),
    [data, metric],
  );
  const metricMin = metricValues.length ? Math.min(...metricValues) : 0;
  const metricMax = metricValues.length ? Math.max(...metricValues) : 0;
  const selectedStation = data?.stations.find((station) => station.stationId === selectedStationId) ?? null;
  const selectedRows = useMemo(
    () =>
      (data?.hourly ?? [])
        .filter((row) => row.stationId === selectedStationId)
        .sort((left, right) => left.observationTimeUtc.localeCompare(right.observationTimeUtc)),
    [data, selectedStationId],
  );
  const chartRows = useMemo(
    () =>
      selectedRows.map((row) => ({
        ...row,
        label: fmtHour(row.observationTimeUtc),
      })),
    [selectedRows],
  );

  const toggleTempSeries = (key: string) => {
    setHiddenTempSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleWindSeries = (key: string) => {
    setHiddenWindSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderChart = ({
    heightClass,
    series,
    hiddenSeries,
    unit,
  }: {
    heightClass: string;
    series: PlotSeries[];
    hiddenSeries: Set<string>;
    unit: string;
  }) => (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartRows} margin={{ top: 12, right: 24, bottom: 12, left: 8 }}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#334155" }}
            minTickGap={20}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#334155" }}
            tickFormatter={(value) => `${Math.round(Number(value))}${unit}`}
          />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 6,
              color: "#e5e7eb",
            }}
            formatter={(value: unknown, name: unknown) => [
              typeof value === "number" ? `${Math.round(value)}${unit}` : "-",
              series.find((item) => item.key === name)?.label ?? String(name),
            ]}
            labelFormatter={(_, payload) => fmtDateTime(payload?.[0]?.payload?.observationTimeUtc)}
          />
          {series.map((item) =>
            hiddenSeries.has(item.key) ? null : (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.key}
                stroke={item.color}
                dot={false}
                strokeWidth={2.2}
                connectNulls
              />
            ),
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionCard
        title="Weather Controls"
        subtitle={
          data
            ? `${data.region} METAR observations | ${data.hourly.length.toLocaleString()} station-hour rows`
            : undefined
        }
      >
        <div className="grid gap-3 lg:grid-cols-[140px_160px_1fr] lg:items-end">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Region
            </span>
            <select
              value={region}
              disabled
              className="w-full rounded-md border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-500"
            >
              <option value={DEFAULT_REGION}>PJM</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              History
            </span>
            <select
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            >
              {HOUR_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} hours
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Metric
            </span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Weather metric">
              {METRICS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="radio"
                  aria-checked={metric === item.key}
                  onClick={() => setMetric(item.key)}
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                    metric === item.key
                      ? "border-sky-500/50 bg-sky-500/10 text-white"
                      : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                  {item.label}
                </button>
              ))}
            </div>
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
          Loading weather observations...
        </div>
      )}

      {data && !loading && (
        <>
          {data.freshness.reason && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              {data.freshness.reason}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <StatTile label="Avg Temp" value={fmtTemp(data.latest.avgTempF)} sub={fmtDateTime(data.asOf)} />
            <StatTile label="Avg Dew Point" value={fmtTemp(data.latest.avgDewPointF)} />
            <StatTile label="Feels Like" value={fmtTemp(data.latest.avgFeelsLikeF)} />
            <StatTile label="Max Gust" value={fmtWind(data.latest.maxGustMph)} />
            <StatTile
              label="Hottest"
              value={fmtTemp(data.latest.hottestStation?.tempF)}
              sub={data.latest.hottestStation?.stationId ?? "-"}
            />
            <StatTile
              label="Coldest"
              value={fmtTemp(data.latest.coldestStation?.tempF)}
              sub={data.latest.coldestStation?.stationId ?? "-"}
            />
          </div>

          {data.hourly.length === 0 && (
            <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
              No METAR observations are available for the PJM station basket yet.
            </div>
          )}

          <DataTableShell
            title="Station Observation Heatmap"
            subtitle={`${selectedMetric.label} by UTC hour | ${data.freshness.reportingStationCount}/${data.freshness.stationCount} reporting stations`}
            action={
              <TableHeatmapToggle
                enabled={tableHeatmapEnabled}
                onToggle={() => setTableHeatmapEnabled((enabled) => !enabled)}
              />
            }
          >
            <table className="w-full min-w-[1180px] border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr>
                  <th className="sticky left-0 z-20 bg-gray-950 px-3 py-2 text-left font-semibold uppercase tracking-wide">
                    Station
                  </th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Age</th>
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">Latest</th>
                  {columns.map((column) => (
                    <th key={column} className="px-2 py-2 text-right font-semibold uppercase tracking-wide">
                      {fmtHour(column)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.stations.map((station) => {
                  const isSelected = selectedStationId === station.stationId;
                  return (
                    <tr key={station.stationId} className="hover:bg-gray-900/60">
                      <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setSelectedStationId(station.stationId)}
                          className={`w-full rounded px-2 py-1 text-left transition-colors ${
                            isSelected
                              ? "bg-sky-500/10 text-sky-100 ring-1 ring-sky-400/60"
                              : "text-gray-300 hover:bg-gray-950/50"
                          }`}
                        >
                          <span className="block font-semibold">{station.stationId}</span>
                          <span className="block text-[11px] text-gray-500">{station.stationName}</span>
                        </button>
                      </td>
                      <td className={`px-3 py-2 text-left tabular-nums ${station.stale ? "text-amber-200" : "text-gray-400"}`}>
                        {fmtAge(station.ageMinutes)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-100">
                        {fmtMetric(metricValue(station.latest, metric), metric)}
                      </td>
                      {columns.map((column) => {
                        const row = hourlyByStationHour.get(`${station.stationId}|${column}`);
                        const value = metricValue(row, metric);
                        return (
                          <td
                            key={column}
                            className="px-2 py-2 text-right tabular-nums text-gray-300"
                            style={
                              tableHeatmapEnabled
                                ? heatCellStyle(value, metricMin, metricMax)
                                : undefined
                            }
                          >
                            {fmtMetric(value, metric)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataTableShell>

          {selectedStation && (
            <div className="grid gap-4 xl:grid-cols-2">
              <PlotCard
                title={`${selectedStation.stationId} Temperature Detail`}
                subtitle={`${selectedStation.stationName} | latest ${fmtDateTime(selectedStation.latest?.observationTimeUtc)}`}
                series={TEMP_SERIES}
                hiddenSeries={hiddenTempSeries}
                onToggleSeries={toggleTempSeries}
                onShowAll={() => setHiddenTempSeries(new Set())}
                onHideAll={() => setHiddenTempSeries(new Set(TEMP_SERIES.map((series) => series.key)))}
                focusedChildren={renderChart({
                  heightClass: "h-[70vh]",
                  series: TEMP_SERIES,
                  hiddenSeries: hiddenTempSeries,
                  unit: "°",
                })}
              >
                {renderChart({
                  heightClass: "h-[320px]",
                  series: TEMP_SERIES,
                  hiddenSeries: hiddenTempSeries,
                  unit: "°",
                })}
              </PlotCard>

              <PlotCard
                title={`${selectedStation.stationId} Wind Detail`}
                subtitle={`Direction ${fmtNumber(selectedStation.latest?.windDirDegrees)}° | visibility ${fmtNumber(
                  selectedStation.latest?.visibilityMiles,
                  1,
                )} mi`}
                series={WIND_SERIES}
                hiddenSeries={hiddenWindSeries}
                onToggleSeries={toggleWindSeries}
                focusedChildren={renderChart({
                  heightClass: "h-[70vh]",
                  series: WIND_SERIES,
                  hiddenSeries: hiddenWindSeries,
                  unit: " mph",
                })}
              >
                {renderChart({
                  heightClass: "h-[320px]",
                  series: WIND_SERIES,
                  hiddenSeries: hiddenWindSeries,
                  unit: " mph",
                })}
              </PlotCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}
