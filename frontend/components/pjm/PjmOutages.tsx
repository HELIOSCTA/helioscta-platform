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
const REGION_LABELS: Record<string, string> = {
  RTO: "RTO",
  MIDATL_DOM: "Mid-Atlantic / Dominion",
  WEST: "West",
};

const YEAR_SERIES_COLORS: Record<number, string> = {
  2024: "#94a3b8",
  2025: "#60a5fa",
  2026: "#f8fafc",
  2027: "#fb923c",
  2028: "#a78bfa",
  2029: "#34d399",
  2030: "#facc15",
  2031: "#f472b6",
  2032: "#22d3ee",
};
const FALLBACK_YEAR_COLORS = [
  "#60a5fa",
  "#fb923c",
  "#a78bfa",
  "#34d399",
  "#facc15",
  "#f472b6",
  "#22d3ee",
  "#94a3b8",
];
const FIVE_YEAR_RANGE_KEY = "five_year_range";
const FIVE_YEAR_AVG_KEY = "five_year_avg";
const FIVE_YEAR_MIN_KEY = "fiveYearMin";
const FIVE_YEAR_MAX_KEY = "fiveYearMax";
const FIVE_YEAR_AVG_DATA_KEY = "fiveYearAvg";
const FIVE_YEAR_RANGE_DATA_KEY = "fiveYearRange";
const FIVE_YEAR_RANGE_COLOR = "#64748b";
const FIVE_YEAR_AVG_COLOR = "#cbd5e1";

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

interface SeasonalTooltipPayloadItem {
  payload?: SeasonalChartPoint;
}

interface SeasonalTooltipProps {
  active?: boolean;
  payload?: SeasonalTooltipPayloadItem[];
  series: PlotSeries[];
  hiddenSeries: Set<string>;
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

function yearSeriesColor(year: number, sortedYears: number[]): string {
  return (
    YEAR_SERIES_COLORS[year] ??
    FALLBACK_YEAR_COLORS[Math.max(sortedYears.indexOf(year), 0) % FALLBACK_YEAR_COLORS.length]
  );
}

function latestSeasonalYear(years: number[]): number | null {
  return years.length ? Math.max(...years) : null;
}

function previousSeasonalYear(years: number[], latestYear: number | null): number | null {
  if (latestYear === null) return null;
  if (years.includes(latestYear - 1)) return latestYear - 1;
  return [...years].filter((year) => year < latestYear).sort((left, right) => right - left)[0] ?? null;
}

function defaultVisibleSeasonalYears(years: number[]): Set<number> {
  const latestYear = latestSeasonalYear(years);
  const previousYear = previousSeasonalYear(years, latestYear);
  return new Set([latestYear, previousYear].filter((year): year is number => year !== null));
}

function historicalFiveYearWindow(years: number[]): number[] {
  const latestYear = latestSeasonalYear(years);
  const previousYear = previousSeasonalYear(years, latestYear);
  const newestHistoricalYear = previousYear ?? latestYear;
  if (newestHistoricalYear === null) return [];
  return [...years]
    .filter((year) => year < newestHistoricalYear)
    .sort((left, right) => right - left)
    .slice(0, 5)
    .sort((left, right) => left - right);
}

function defaultHiddenSeries(series: PlotSeries[]): Set<string> {
  return new Set(
    series
      .filter((item) => item.defaultVisible === false)
      .map((item) => item.key),
  );
}

function dateFromYearDay(year: number, dayOfYear: number): string {
  const date = new Date(Date.UTC(year, 0, dayOfYear));
  return date.toISOString().slice(0, 10);
}

function fmtSeasonalHoverDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return fmtDate(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
    year: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("weekday")} ${part("month")}-${part("day")} ${part("year")}`;
}

function fmtOutageValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString()} MW`;
}

function SeasonalTooltip({ active, payload, series, hiddenSeries }: SeasonalTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload.find((item) => item.payload)?.payload;
  if (!point) return null;

  const visibleSeries = series.filter((item) => !hiddenSeries.has(item.key));
  const rows = visibleSeries.flatMap((item) => {
    if (item.key === FIVE_YEAR_RANGE_KEY) {
      const min = point[FIVE_YEAR_MIN_KEY];
      const max = point[FIVE_YEAR_MAX_KEY];
      return [
        typeof min === "number"
          ? { key: `${item.key}:min`, color: item.color, label: "5Y Min", value: fmtOutageValue(min) }
          : null,
        typeof max === "number"
          ? { key: `${item.key}:max`, color: item.color, label: "5Y Max", value: fmtOutageValue(max) }
          : null,
      ].filter((row): row is { key: string; color: string; label: string; value: string } => row !== null);
    }

    if (item.key === FIVE_YEAR_AVG_KEY) {
      const value = point[FIVE_YEAR_AVG_DATA_KEY];
      return typeof value === "number"
        ? [{ key: item.key, color: item.color, label: "5Y Avg", value: fmtOutageValue(value) }]
        : [];
    }

    const value = point[item.key];
    const date = point[`${item.key}_date`];
    if (typeof value !== "number") return [];
    return [
      {
        key: item.key,
        color: item.color,
        label: typeof date === "string" ? fmtSeasonalHoverDate(date) : item.label,
        value: fmtOutageValue(value),
      },
    ];
  });

  if (!rows.length) return null;

  return (
    <div className="min-w-[210px] rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-200 shadow-xl shadow-black/30">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        Seasonal Day {point.dayOfYear}
      </div>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: row.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-gray-300">{row.label}</span>
            <span className="pl-3 text-right font-medium tabular-nums text-gray-100">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildMetricHeatBounds(rows: OutageRow[], metric: OutageMetricKey): HeatBounds | null {
  const values = rows
    .map((row) => metricValue(row, metric))
    .filter((value): value is number => value !== null);
  if (!values.length) return null;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function buildSeasonalChartRows({
  seasonalRows,
  metric,
  years,
}: {
  seasonalRows: OutageRow[];
  metric: OutageMetricKey;
  years: number[];
}): SeasonalChartPoint[] {
  const byDay = new Map<number, SeasonalChartPoint>();
  for (let day = 1; day <= 366; day += 1) {
    byDay.set(day, { dayOfYear: day, monthLabel: monthLabel(day) });
  }

  const valuesByDayYear = new Map<number, Map<number, number>>();
  const datesByDayYear = new Map<number, Map<number, string>>();
  seasonalRows.forEach((row) => {
    if (!row.year || !row.day_of_year) return;
    const value = metricValue(row, metric);
    if (value === null) return;
    const valuesByYear = valuesByDayYear.get(row.day_of_year) ?? new Map<number, number>();
    valuesByYear.set(row.year, value);
    valuesByDayYear.set(row.day_of_year, valuesByYear);
    const datesByYear = datesByDayYear.get(row.day_of_year) ?? new Map<number, string>();
    datesByYear.set(row.year, row.date ?? dateFromYearDay(row.year, row.day_of_year));
    datesByDayYear.set(row.day_of_year, datesByYear);
  });

  const historicalYears = new Set(historicalFiveYearWindow(years));
  byDay.forEach((point, day) => {
    const valuesByYear = valuesByDayYear.get(day);
    const datesByYear = datesByDayYear.get(day);
    years.forEach((year) => {
      point[`year_${year}`] = valuesByYear?.get(year) ?? null;
      point[`year_${year}_date`] = datesByYear?.get(year) ?? dateFromYearDay(year, day);
    });
    const historicalValues = [...historicalYears]
      .map((year) => valuesByYear?.get(year) ?? null)
      .filter((value): value is number => value !== null);
    if (!historicalValues.length) {
      point[FIVE_YEAR_MIN_KEY] = null;
      point[FIVE_YEAR_MAX_KEY] = null;
      point[FIVE_YEAR_AVG_DATA_KEY] = null;
      point[FIVE_YEAR_RANGE_DATA_KEY] = null;
      return;
    }
    const min = Math.min(...historicalValues);
    const max = Math.max(...historicalValues);
    point[FIVE_YEAR_MIN_KEY] = min;
    point[FIVE_YEAR_MAX_KEY] = max;
    point[FIVE_YEAR_AVG_DATA_KEY] =
      historicalValues.reduce((sum, value) => sum + value, 0) / historicalValues.length;
    point[FIVE_YEAR_RANGE_DATA_KEY] = [min, max];
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

  useEffect(() => {
    if (data?.forecast) onFreshnessChange?.(freshnessFromPayload(data.forecast));
  }, [data?.forecast, onFreshnessChange]);

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
        forecastMetrics.map((item) => [item.key, buildMetricHeatBounds(rows, item.key)] as const)
      ),
    [forecastMetrics, rows]
  );
  const seasonalYears = useMemo(() => data?.seasonal.years ?? [], [data]);
  const visibleSeasonalYears = useMemo(() => defaultVisibleSeasonalYears(seasonalYears), [seasonalYears]);
  const historicalSeasonalYears = useMemo(() => historicalFiveYearWindow(seasonalYears), [seasonalYears]);
  const seasonalSeries: PlotSeries[] = useMemo(
    () => [
      {
        key: FIVE_YEAR_RANGE_KEY,
        label: "5Y Min/Max",
        color: FIVE_YEAR_RANGE_COLOR,
        defaultVisible: true,
      },
      {
        key: FIVE_YEAR_AVG_KEY,
        label: "5Y Avg",
        color: FIVE_YEAR_AVG_COLOR,
        defaultVisible: true,
      },
      ...seasonalYears.map((year) => ({
        key: `year_${year}`,
        label:
          year === latestSeasonalYear(seasonalYears)
            ? `${year} Current`
            : year === previousSeasonalYear(seasonalYears, latestSeasonalYear(seasonalYears))
              ? `${year} Last Year`
              : String(year),
        color: yearSeriesColor(year, seasonalYears),
        defaultVisible: visibleSeasonalYears.has(year),
      })),
    ],
    [seasonalYears, visibleSeasonalYears]
  );
  const seasonalSubtitle = useMemo(
    () =>
      [
        `${REGION_LABELS[region] ?? region}: same-day PJM publication by operating date`,
        `Default current + last year`,
        `${historicalSeasonalYears.length.toLocaleString()}Y historical envelope`,
      ].join(" | "),
    [historicalSeasonalYears.length, region]
  );

  const seasonalSeriesDefaultsKey = useMemo(
    () =>
      [
        region,
        ...seasonalSeries.map((series) => `${series.key}:${series.defaultVisible ? "1" : "0"}`),
      ].join("|"),
    [region, seasonalSeries],
  );

  useEffect(() => {
    if (!seasonalSeries.length) return;
    setHiddenSeasonalSeries(defaultHiddenSeries(seasonalSeries));
  }, [seasonalSeriesDefaultsKey, seasonalSeries]);

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
      metric,
      years: seasonalYears,
    });
    const currentYear = latestSeasonalYear(seasonalYears);
    const previousYear = previousSeasonalYear(seasonalYears, currentYear);
    const showFiveYearRange = !hiddenSeasonalSeries.has(FIVE_YEAR_RANGE_KEY);
    const showFiveYearAvg = !hiddenSeasonalSeries.has(FIVE_YEAR_AVG_KEY);

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
              content={
                <SeasonalTooltip
                  series={seasonalSeries}
                  hiddenSeries={hiddenSeasonalSeries}
                />
              }
              cursor={{ stroke: "#64748b", strokeDasharray: "3 3" }}
            />
            {showFiveYearRange && (
              <>
                <Area
                  type="monotone"
                  dataKey={FIVE_YEAR_RANGE_DATA_KEY}
                  name="5Y Min/Max"
                  stroke="none"
                  fill={FIVE_YEAR_RANGE_COLOR}
                  fillOpacity={0.14}
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey={FIVE_YEAR_MAX_KEY}
                  name="5Y Max"
                  stroke={FIVE_YEAR_RANGE_COLOR}
                  strokeOpacity={0.45}
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey={FIVE_YEAR_MIN_KEY}
                  name="5Y Min"
                  stroke={FIVE_YEAR_RANGE_COLOR}
                  strokeOpacity={0.45}
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </>
            )}
            {showFiveYearAvg && (
              <Line
                type="monotone"
                dataKey={FIVE_YEAR_AVG_DATA_KEY}
                name="5Y Avg"
                stroke={FIVE_YEAR_AVG_COLOR}
                strokeDasharray="4 4"
                strokeOpacity={0.9}
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
            {seasonalSeries.map((series) =>
              hiddenSeasonalSeries.has(series.key) || !series.key.startsWith("year_") ? null : (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke={series.color}
                  dot={false}
                  activeDot={{ r: 3 }}
                  strokeWidth={
                    series.key === `year_${currentYear}`
                      ? 2.5
                      : series.key === `year_${previousYear}`
                        ? 1.9
                        : 1.4
                  }
                  strokeOpacity={visibleSeasonalYears.has(Number(series.key.replace("year_", ""))) ? 1 : 0.7}
                  connectNulls
                  isAnimationActive={false}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="space-y-4">
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

      <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs font-medium text-sky-100">
        Transmission outage tickets are shown in Constraints under the Transmission Outages view.
      </div>

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
                  {REGION_LABELS[item] ?? item}
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
          {activeView === "seasonal" &&
            seasonalMetrics.map((item) => (
              <div key={item.key} className="space-y-4">
                <PlotCard
                  title={`${item.label} Seasonal Overlay`}
                  subtitle={seasonalSubtitle}
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
                subtitle={`${REGION_LABELS[region] ?? region}: latest ${execDates.length} forecast publications`}
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
                            const bounds = heatBoundsByMetric.get(item.key);
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
