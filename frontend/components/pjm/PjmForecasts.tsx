"use client";

import type { CSSProperties, ReactNode } from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
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

interface ForecastVintageCurve {
  evaluatedAtEpt: string;
  tag: string;
  peak: number | null;
  onPeak: number | null;
  hourly: Array<number | null>;
}

interface PjmForecastDifferencesPayload {
  iso: "pjm";
  area: string;
  areas: string[];
  forecastDate: string;
  forecastDates: string[];
  asOf: string | null;
  latestUpdate: string | null;
  source: string;
  sourceComparisonAvailable: boolean;
  sourceComparisonNote: string;
  rowCount: number;
  lookbackHours: number;
  snapshotRows: ForecastVintageCurve[];
  deltaRows: ForecastVintageCurve[];
  lookbackRows: ForecastVintageCurve[];
  windowRows: ForecastVintageCurve[];
}

interface ExplorerMetricSummary {
  flatAvg: number | null;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  peakMw: number | null;
  minMw: number | null;
}

interface ForecastExplorerDeltaSummary extends ExplorerMetricSummary {
  hours: number;
  anchorEvaluatedAtEpt: string;
}

interface ForecastExplorerCell extends ExplorerMetricSummary {
  area: string;
  forecastDate: string;
  vintageCount: number;
  latestEvaluatedAtEpt: string;
  deltas: Record<string, ForecastExplorerDeltaSummary | null>;
  delta24h: ExplorerMetricSummary | null;
  delta48h: ExplorerMetricSummary | null;
}

interface PjmForecastExplorerPayload {
  iso: "pjm";
  source: string;
  asOf: string | null;
  latestUpdate: string | null;
  areas: string[];
  forecastDates: string[];
  rowCount: number;
  cellCount: number;
  cells: ForecastExplorerCell[];
}

export interface PjmForecastsFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

export type PjmForecastView = "explorer" | "profile" | "table" | "diffs";
type ExplorerMetric =
  | "peakMw"
  | "onPeakAvg"
  | "offPeakAvg";
type ExplorerViewMode = "latest" | "change";
type ChangeWindowKey = "1h" | "12h" | "24h" | "48h" | "72h";
type AreaGroupKey = "rto" | "west" | "midatl" | "south" | "other";

const API_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_LOOKBACK_HOURS = 72;
const LOOKBACK_OPTIONS = [1, 12, 24, 48, 72, 168] as const;
const COLORS = ["#38bdf8", "#22c55e", "#f97316", "#a78bfa", "#facc15", "#fb7185", "#2dd4bf"];
const EXPLORER_METRICS: Array<{ key: ExplorerMetric; label: string; signed: boolean }> = [
  { key: "peakMw", label: "Peak", signed: false },
  { key: "onPeakAvg", label: "OnPeak", signed: false },
  { key: "offPeakAvg", label: "OffPeak", signed: false },
];
const CHANGE_WINDOWS: Array<{ key: ChangeWindowKey; label: string; hours: number }> = [
  { key: "1h", label: "1h", hours: 1 },
  { key: "12h", label: "12h", hours: 12 },
  { key: "24h", label: "24h", hours: 24 },
  { key: "48h", label: "48h", hours: 48 },
  { key: "72h", label: "72h", hours: 72 },
];
const AREA_GROUPS: Array<{ key: AreaGroupKey; label: string }> = [
  { key: "rto", label: "RTO" },
  { key: "west", label: "West" },
  { key: "midatl", label: "Mid-Atlantic" },
  { key: "south", label: "South" },
  { key: "other", label: "Other" },
];
const WEST_AREAS = new Set([
  "AEP",
  "AP",
  "ATSI",
  "COMED",
  "DAYTON",
  "DEOK",
  "DUQUESNE",
  "EKPC",
  "WESTERN_REGION",
]);
const SOUTH_AREAS = new Set(["DOMINION", "SOUTHERN_REGION"]);

const DEFAULT_FRESHNESS: PjmForecastsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Forecasts --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

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

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function fmtMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString();
}

function fmtSignedMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString()}`;
}

function buildExplorerCacheKey(): string {
  return "api:pjm-forecast-explorer";
}

function buildDiffApiUrl({
  area,
  forecastDate,
  lookbackHours,
  refresh,
}: {
  area: string;
  forecastDate: string;
  lookbackHours: number;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({ area, date: forecastDate });
  params.set("lookbackHours", String(lookbackHours));
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-forecast-differences?${params.toString()}`;
}

function buildDiffCacheKey({
  area,
  forecastDate,
  lookbackHours,
}: {
  area: string;
  forecastDate: string;
  lookbackHours: number;
}): string {
  return ["api:pjm-forecast-differences", area, forecastDate, lookbackHours].join(":");
}

function metricValue(cell: ForecastExplorerCell, metric: ExplorerMetric): number | null {
  return cell[metric];
}

function deltaSummary(
  cell: ForecastExplorerCell,
  windowKey: ChangeWindowKey,
): ForecastExplorerDeltaSummary | null {
  return cell.deltas?.[windowKey] ?? null;
}

function explorerCellValue({
  cell,
  metric,
  viewMode,
  windowKey,
}: {
  cell: ForecastExplorerCell;
  metric: ExplorerMetric;
  viewMode: ExplorerViewMode;
  windowKey: ChangeWindowKey;
}): number | null {
  if (viewMode === "change") return deltaSummary(cell, windowKey)?.[metric] ?? null;
  return metricValue(cell, metric);
}

function fmtMetricValue(value: number | null | undefined, signed: boolean): string {
  return signed ? fmtSignedMw(value) : fmtMw(value);
}

function areaGroupKey(area: string): AreaGroupKey {
  if (area === "RTO_COMBINED") return "rto";
  if (area === "MID_ATLANTIC_REGION" || area.includes("/MIDATL")) return "midatl";
  if (SOUTH_AREAS.has(area)) return "south";
  if (WEST_AREAS.has(area)) return "west";
  return "other";
}

function areaSortValue(area: string): string {
  if (area === "RTO_COMBINED") return "000";
  if (area.endsWith("_REGION")) return `001-${area}`;
  return `100-${area}`;
}

function curveChartRows(curves: ForecastVintageCurve[]): Array<Record<string, number | null>> {
  const rows = Array.from(
    { length: 24 },
    (_, hour) => ({ heStart: hour } as Record<string, number | null>),
  );
  curves.forEach((curve) => {
    curve.hourly.forEach((value, hour) => {
      rows[hour][curve.evaluatedAtEpt] = value;
    });
  });
  return rows;
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

function deltaCellStyle(value: number | null, bound: number): CSSProperties {
  if (value === null || bound <= 0) return {};
  const intensity = Math.min(Math.abs(value) / bound, 1);
  const alpha = 0.08 + intensity * 0.25;
  const [r, g, b] = value >= 0 ? [34, 197, 94] : [248, 113, 113];
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`,
    color: "#f8fafc",
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

function TableHeatmapToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
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
      Heatmap
    </button>
  );
}

export default function PjmForecasts({
  refreshToken = 0,
  onFreshnessChange,
}: {
  initialView?: PjmForecastView;
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmForecastsFreshnessSummary) => void;
  onViewChange?: (view: PjmForecastView) => void;
}) {
  const [explorerViewMode, setExplorerViewMode] = useState<ExplorerViewMode>("latest");
  const [explorerMetric, setExplorerMetric] = useState<ExplorerMetric>("peakMw");
  const [changeWindow, setChangeWindow] = useState<ChangeWindowKey>("24h");
  const [tableHeatmapEnabled, setTableHeatmapEnabled] = useState(true);
  const [explorerData, setExplorerData] = useState<PjmForecastExplorerPayload | null>(null);
  const [diffData, setDiffData] = useState<PjmForecastDifferencesPayload | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [selectedExplorerCell, setSelectedExplorerCell] = useState<{
    area: string;
    forecastDate: string;
  } | null>(null);
  const [lookbackHours, setLookbackHours] = useState<number>(DEFAULT_LOOKBACK_HOURS);

  const selectChangeWindow = (windowKey: ChangeWindowKey) => {
    const window = CHANGE_WINDOWS.find((item) => item.key === windowKey)!;
    setChangeWindow(windowKey);
    setLookbackHours(window.hours);
  };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setExplorerLoading(true);
    setExplorerError(null);

    fetchJsonWithCache<PjmForecastExplorerPayload>({
      key: buildExplorerCacheKey(),
      url: `/api/pjm-forecast-explorer${refreshToken > 0 ? "?refresh=1" : ""}`,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setExplorerData(payload);
        onFreshnessChange?.({
          status: payload.asOf ? "Current" : "Unknown",
          statusClass: payload.asOf
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
            : "border-gray-700 bg-gray-900 text-gray-400",
          summary: `${payload.cellCount.toLocaleString()} cells | ${payload.rowCount.toLocaleString()} summaries`,
          targetDateLabel: `${payload.areas.length} areas`,
          latestDateLabel: fmtDate(payload.forecastDates.at(-1)),
          latestUpdateLabel: fmtDateTime(payload.asOf),
        });
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setExplorerError(err.message || "Failed to load PJM forecast explorer");
        setExplorerData(null);
        onFreshnessChange?.({
          ...DEFAULT_FRESHNESS,
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Forecast explorer query failed",
        });
      })
      .finally(() => {
        if (active) setExplorerLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshToken, onFreshnessChange]);

  useEffect(() => {
    if (!selectedExplorerCell) return;

    const controller = new AbortController();
    let active = true;
    setDiffLoading(true);
    setDiffError(null);

    fetchJsonWithCache<PjmForecastDifferencesPayload>({
      key: buildDiffCacheKey({
        area: selectedExplorerCell.area,
        forecastDate: selectedExplorerCell.forecastDate,
        lookbackHours,
      }),
      url: buildDiffApiUrl({
        area: selectedExplorerCell.area,
        forecastDate: selectedExplorerCell.forecastDate,
        lookbackHours,
        refresh: refreshToken > 0,
      }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setDiffData(payload);
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setDiffError(err.message || "Failed to load PJM forecast differences");
        setDiffData(null);
      })
      .finally(() => {
        if (active) setDiffLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [lookbackHours, refreshToken, selectedExplorerCell]);

  const visibleAreaGroups = useMemo(() => {
    const areas = explorerData?.areas ?? [];
    const groups = new Map<AreaGroupKey, string[]>();
    areas.forEach((area) => {
      const key = areaGroupKey(area);
      groups.set(key, [...(groups.get(key) ?? []), area]);
    });

    return AREA_GROUPS.map((group) => ({
      ...group,
      areas: (groups.get(group.key) ?? []).sort((a, b) =>
        areaSortValue(a).localeCompare(areaSortValue(b)),
      ),
    })).filter((group) => group.areas.length > 0);
  }, [explorerData]);
  const visibleAreaCount = visibleAreaGroups.reduce((count, group) => count + group.areas.length, 0);

  const explorerCellMap = useMemo(() => {
    const map = new Map<string, ForecastExplorerCell>();
    explorerData?.cells.forEach((cell) => {
      map.set(`${cell.area}|${cell.forecastDate}`, cell);
    });
    return map;
  }, [explorerData]);

  const explorerValues = useMemo(
    () =>
      (explorerData?.cells ?? [])
        .map((cell) =>
          explorerCellValue({
            cell,
            metric: explorerMetric,
            viewMode: explorerViewMode,
            windowKey: changeWindow,
          }),
        )
        .filter((value): value is number => value !== null),
    [changeWindow, explorerData, explorerMetric, explorerViewMode],
  );
  const explorerBound = explorerValues.length
    ? Math.max(...explorerValues.map((value) => Math.abs(value)))
    : 0;

  const lookbackRows = useMemo(
    () => diffData?.lookbackRows ?? diffData?.windowRows ?? [],
    [diffData],
  );
  const lookbackSeries: PlotSeries[] = useMemo(
    () =>
      lookbackRows.map((row, index) => ({
        key: row.evaluatedAtEpt,
        label: row.tag || fmtDateTime(row.evaluatedAtEpt),
        color: COLORS[index % COLORS.length],
        defaultVisible: true,
      })),
    [lookbackRows],
  );
  const lookbackChartRows = useMemo(() => curveChartRows(lookbackRows), [lookbackRows]);
  const diffBound = useMemo(() => {
    const values = (diffData?.deltaRows ?? [])
      .flatMap((row) => [row.peak, row.onPeak, ...row.hourly])
      .filter((value): value is number => value !== null)
      .map((value) => Math.abs(value));
    return values.length ? Math.max(...values) : 0;
  }, [diffData]);
  const selectedCell = selectedExplorerCell
    ? explorerCellMap.get(`${selectedExplorerCell.area}|${selectedExplorerCell.forecastDate}`) ?? null
    : null;
  const selectedDataLoaded = Boolean(
    selectedExplorerCell &&
      diffData &&
      diffData.area === selectedExplorerCell.area &&
      diffData.forecastDate === selectedExplorerCell.forecastDate,
  );
  const selectedMetric = EXPLORER_METRICS.find((item) => item.key === explorerMetric)!;
  const selectedWindow = CHANGE_WINDOWS.find((item) => item.key === changeWindow)!;
  const selectedMetricIsSigned = explorerViewMode === "change";
  const selectedDelta =
    selectedCell && explorerViewMode === "change" ? deltaSummary(selectedCell, changeWindow) : null;
  const explorerSubtitle = explorerData
    ? `${explorerData.cellCount.toLocaleString()} area/date cells | as of ${fmtDateTime(
        explorerData.asOf,
      )}`
    : undefined;

  const renderCurveChart = ({
    heightClass,
    rows,
    chartSeries,
    curves,
  }: {
    heightClass: string;
    rows: Array<Record<string, number | null>>;
    chartSeries: PlotSeries[];
    curves: ForecastVintageCurve[];
  }) => (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 12, right: 24, bottom: 12, left: 8 }}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
          <XAxis
            dataKey="heStart"
            ticks={[0, 3, 7, 11, 15, 19, 23]}
            tickFormatter={(value) => `HE ${Number(value) + 1}`}
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
            formatter={(value: unknown, name: unknown) => [
              typeof value === "number" ? `${Math.round(value).toLocaleString()} MW` : "-",
              typeof name === "string"
                ? (curves.find((row) => row.evaluatedAtEpt === name)?.tag || fmtDateTime(name))
                : String(name),
            ]}
            labelFormatter={(value) => `HE ${Number(value) + 1}`}
          />
          {chartSeries.map((item) => (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.key}
              stroke={item.color}
              dot={false}
              strokeWidth={item.label === "LATEST" ? 2.8 : 2}
              strokeDasharray={item.label === "LATEST" ? undefined : "5 3"}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const renderLookbackChart = (heightClass: string) =>
    renderCurveChart({
      heightClass,
      rows: lookbackChartRows,
      chartSeries: lookbackSeries,
      curves: lookbackRows,
    });

  const renderVintageTable = ({
    title,
    rows,
    includeDeltas = false,
  }: {
    title: string;
    rows: ForecastVintageCurve[];
    includeDeltas?: boolean;
  }) => (
    <DataTableShell
      title={title}
      subtitle={diffData ? `${diffData.area}: ${diffData.forecastDate}` : undefined}
    >
      <table className="w-full min-w-[1180px] border-collapse bg-[#0d1119] text-xs text-gray-200">
        <thead className="bg-gray-950 text-gray-500">
          <tr>
            <th className="sticky left-0 z-20 bg-gray-950 px-3 py-2 text-left font-semibold uppercase tracking-wide">
              Run
            </th>
            <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Tag</th>
            <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">Peak</th>
            <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">OnPeak</th>
            {Array.from({ length: 24 }, (_, hour) => (
              <th key={hour} className="px-1.5 py-2 text-right font-semibold uppercase tracking-wide">
                HE{hour + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {rows.map((row, index) => {
            const isDelta = includeDeltas && row.tag.startsWith("Delta");
            const numericValues = row.hourly.filter((value): value is number => value !== null);
            const min = numericValues.length ? Math.min(...numericValues) : 0;
            const max = numericValues.length ? Math.max(...numericValues) : 0;
            return (
              <tr key={`${row.evaluatedAtEpt}-${row.tag}-${index}`} className="hover:bg-gray-900/60">
                <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2 font-medium text-gray-300">
                  {fmtDateTime(row.evaluatedAtEpt)}
                </td>
                <td className="px-2 py-2 text-gray-400">{row.tag || "-"}</td>
                <td
                  className="px-3 py-2 text-right tabular-nums"
                  style={isDelta ? deltaCellStyle(row.peak, diffBound) : undefined}
                >
                  {isDelta && row.peak !== null && row.peak > 0 ? "+" : ""}
                  {fmtMw(row.peak)}
                </td>
                <td
                  className="px-3 py-2 text-right tabular-nums"
                  style={isDelta ? deltaCellStyle(row.onPeak, diffBound) : undefined}
                >
                  {isDelta && row.onPeak !== null && row.onPeak > 0 ? "+" : ""}
                  {fmtMw(row.onPeak)}
                </td>
                {row.hourly.map((value, hour) => (
                  <td
                    key={hour}
                    className="px-1.5 py-2 text-right tabular-nums text-gray-300"
                    style={
                      isDelta
                        ? deltaCellStyle(value, diffBound)
                        : heatCellStyle(value, min, max)
                    }
                  >
                    {isDelta && value !== null && value > 0 ? "+" : ""}
                    {fmtMw(value)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </DataTableShell>
  );

  const renderExplorerMatrix = () => {
    const datesToRender = explorerData?.forecastDates ?? [];

    return (
      <DataTableShell
        title="Forecast Explorer"
        subtitle={
          explorerData
            ? `${visibleAreaCount} areas x ${datesToRender.length} dates | ${selectedMetric.label} | ${
                explorerViewMode === "change" ? `change vs ${selectedWindow.label}` : "latest"
              } | row heatmap`
            : undefined
        }
        action={
          <TableHeatmapToggle
            enabled={tableHeatmapEnabled}
            onToggle={() => setTableHeatmapEnabled((enabled) => !enabled)}
          />
        }
      >
        <table className="w-full min-w-[1120px] border-collapse bg-[#0d1119] text-xs text-gray-200">
          <thead className="bg-gray-950 text-gray-500">
            <tr>
              <th className="sticky left-0 z-20 bg-gray-950 px-3 py-2 text-left font-semibold uppercase tracking-wide">
                Area
              </th>
              {datesToRender.map((date) => (
                <th key={date} className="px-3 py-2 text-right font-semibold uppercase tracking-wide">
                  {fmtShortDate(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {visibleAreaGroups.map((group) => (
              <Fragment key={group.key}>
                <tr>
                  <td
                    colSpan={datesToRender.length + 1}
                    className="sticky left-0 z-10 bg-gray-950/80 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-sky-200"
                  >
                    {group.label}
                  </td>
                </tr>
                {group.areas.map((rowArea) => {
                  const rowValues = datesToRender
                    .map((date) => {
                      const cell = explorerCellMap.get(`${rowArea}|${date}`);
                      return cell
                        ? explorerCellValue({
                            cell,
                            metric: explorerMetric,
                            viewMode: explorerViewMode,
                            windowKey: changeWindow,
                          })
                        : null;
                    })
                    .filter((value): value is number => value !== null);
                  const rowMin = rowValues.length ? Math.min(...rowValues) : 0;
                  const rowMax = rowValues.length ? Math.max(...rowValues) : 0;
                  const rowBound = rowValues.length
                    ? Math.max(...rowValues.map((value) => Math.abs(value)))
                    : 0;

                  return (
                    <tr key={rowArea} className="hover:bg-gray-900/60">
                      <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2 font-medium text-gray-300">
                        {rowArea}
                      </td>
                      {datesToRender.map((date) => {
                        const cell = explorerCellMap.get(`${rowArea}|${date}`);
                        const value = cell
                          ? explorerCellValue({
                              cell,
                              metric: explorerMetric,
                              viewMode: explorerViewMode,
                              windowKey: changeWindow,
                            })
                          : null;
                        const isSelected =
                          Boolean(cell) &&
                          selectedExplorerCell?.area === rowArea &&
                          selectedExplorerCell?.forecastDate === date;
                        return (
                          <td
                            key={date}
                            className="px-2 py-1.5 text-right align-top tabular-nums text-gray-300"
                            style={
                              tableHeatmapEnabled
                                ? selectedMetricIsSigned
                                  ? deltaCellStyle(value, rowBound)
                                  : heatCellStyle(value, rowMin, rowMax)
                                : undefined
                            }
                          >
                            <button
                              type="button"
                              disabled={!cell}
                              onClick={() => {
                                if (!cell) return;
                                setSelectedExplorerCell({
                                  area: cell.area,
                                  forecastDate: cell.forecastDate,
                                });
                              }}
                              className={`min-h-8 w-full rounded px-2 py-1.5 text-right transition-colors hover:bg-gray-950/50 disabled:cursor-default disabled:hover:bg-transparent ${
                                isSelected ? "ring-1 ring-sky-300/80" : ""
                              }`}
                              title={
                                cell
                                  ? `${cell.area} ${cell.forecastDate} | ${cell.vintageCount} vintages | ${fmtDateTime(
                                      cell.latestEvaluatedAtEpt,
                                    )}`
                                  : undefined
                              }
                            >
                              {fmtMetricValue(value, selectedMetricIsSigned)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </DataTableShell>
    );
  };

  const renderSelectedSummaryTable = () => (
    <DataTableShell
      title="Selected Forecast Summary"
      subtitle={`${selectedExplorerCell?.area ?? "-"} | ${fmtDate(
        selectedExplorerCell?.forecastDate,
      )}`}
    >
      <table className="w-full min-w-[760px] border-collapse bg-[#0d1119] text-xs text-gray-200">
        <thead className="bg-gray-950 text-gray-500">
          <tr>
            {[
              "Area",
              "Forecast Date",
              "Metric",
              "Mode",
              "Value",
              "Latest Run",
              "Anchor Run",
              "Vintages",
            ].map((label) => (
              <th
                key={label}
                className="px-3 py-2 text-right font-semibold uppercase tracking-wide first:text-left"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-gray-800">
            <td className="px-3 py-2 text-left font-medium text-gray-200">
              {selectedExplorerCell?.area ?? "-"}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {fmtDate(selectedExplorerCell?.forecastDate)}
            </td>
            <td className="px-3 py-2 text-right">{selectedMetric.label}</td>
            <td className="px-3 py-2 text-right">
              {explorerViewMode === "change" ? `Change ${selectedWindow.label}` : "Latest"}
            </td>
            <td
              className="px-3 py-2 text-right tabular-nums"
              style={
                selectedMetricIsSigned
                  ? deltaCellStyle(
                      selectedCell
                        ? explorerCellValue({
                            cell: selectedCell,
                            metric: explorerMetric,
                            viewMode: explorerViewMode,
                            windowKey: changeWindow,
                          })
                        : null,
                      explorerBound,
                    )
                  : undefined
              }
            >
              {fmtMetricValue(
                selectedCell
                  ? explorerCellValue({
                      cell: selectedCell,
                      metric: explorerMetric,
                      viewMode: explorerViewMode,
                      windowKey: changeWindow,
                    })
                  : null,
                selectedMetricIsSigned,
              )}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {fmtDateTime(selectedCell?.latestEvaluatedAtEpt)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {explorerViewMode === "change" ? fmtDateTime(selectedDelta?.anchorEvaluatedAtEpt) : "-"}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {selectedCell?.vintageCount?.toLocaleString() ?? "-"}
            </td>
          </tr>
        </tbody>
      </table>
    </DataTableShell>
  );

  const renderExplorerModal = () => {
    if (!selectedExplorerCell) return null;

    return (
      <div
        className="fixed inset-0 z-50 bg-black/70 p-1 sm:p-3"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedExplorerCell(null);
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="forecast-modal-title"
          className="mx-auto flex h-full w-full max-w-none flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#10131c] shadow-2xl shadow-black/50"
        >
          <div className="flex flex-col gap-3 border-b border-gray-800 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="forecast-modal-title" className="text-base font-semibold text-gray-100">
                Forecast Vintages
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {selectedExplorerCell.area} | {fmtDate(selectedExplorerCell.forecastDate)} |{" "}
                {lookbackHours} hour lookback
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="block w-36">
                <span className="sr-only">Lookback</span>
                <select
                  value={lookbackHours}
                  onChange={(event) => setLookbackHours(Number(event.target.value))}
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                >
                  {LOOKBACK_OPTIONS.map((hours) => (
                    <option key={hours} value={hours}>
                      {hours} hours
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setSelectedExplorerCell(null)}
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">
            {renderSelectedSummaryTable()}

            {diffError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {diffError}
              </div>
            )}
            {diffLoading && (
              <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
                Loading vintage detail...
              </div>
            )}
            {selectedDataLoaded && diffData && !diffLoading && (
              <>
                <PlotCard
                  title="All Vintages in Lookback"
                  subtitle={`${diffData.area}: ${diffData.forecastDate} | as of ${fmtDateTime(
                    diffData.asOf,
                  )}`}
                  series={lookbackSeries}
                  hiddenSeries={new Set()}
                  onToggleSeries={() => undefined}
                  focusedChildren={renderLookbackChart("h-[70vh]")}
                >
                  {renderLookbackChart("h-[360px]")}
                </PlotCard>
                {renderVintageTable({
                  title: `Runs in Last ${diffData.lookbackHours} Hours`,
                  rows: lookbackRows,
                })}
                {renderVintageTable({
                  title: "Snapshot and Delta Rows",
                  rows: [...diffData.snapshotRows, ...diffData.deltaRows],
                  includeDeltas: true,
                })}
              </>
            )}
          </div>
        </section>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Explorer Controls" subtitle={explorerSubtitle}>
        <div className="grid gap-3 xl:grid-cols-[170px_1fr_300px] xl:items-end">
          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              View
            </span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Explorer view">
              {[
                ["latest", "Latest"],
                ["change", "Change"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={explorerViewMode === key}
                  onClick={() => {
                    setExplorerViewMode(key as ExplorerViewMode);
                    if (key === "change") setLookbackHours(selectedWindow.hours);
                  }}
                  className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                    explorerViewMode === key
                      ? "border-sky-500/50 bg-sky-500/10 text-white"
                      : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Metric
            </span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Explorer metric">
              {EXPLORER_METRICS.map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  role="radio"
                  aria-checked={explorerMetric === metric.key}
                  onClick={() => setExplorerMetric(metric.key)}
                  className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                    explorerMetric === metric.key
                      ? "border-sky-500/50 bg-sky-500/10 text-white"
                      : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                  }`}
                >
                  {metric.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Window
            </span>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Change window">
              {CHANGE_WINDOWS.map((window) => (
                <button
                  key={window.key}
                  type="button"
                  role="radio"
                  aria-checked={changeWindow === window.key}
                  onClick={() => {
                    setExplorerViewMode("change");
                    selectChangeWindow(window.key);
                  }}
                  className={`rounded-md border px-2 py-2 text-xs font-semibold transition-colors ${
                    changeWindow === window.key
                      ? "border-sky-500/50 bg-sky-500/10 text-white"
                      : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                  }`}
                >
                  {window.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {explorerError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {explorerError}
        </div>
      )}
      {explorerLoading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading forecast explorer...
        </div>
      )}
      {explorerData && !explorerLoading && renderExplorerMatrix()}
      {renderExplorerModal()}
    </div>
  );
}
