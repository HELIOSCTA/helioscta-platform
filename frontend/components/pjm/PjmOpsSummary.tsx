"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

interface FreshnessRow {
  tableName: string;
  rowCount: number;
  latestGeneratedAtEpt: string | null;
  latestUpdatedAt: string | null;
}

interface RtoPeakRow {
  peakDate: string | null;
  area: string;
  generatedAtEpt: string | null;
  projectedPeakDatetimeEpt: string | null;
  loadForecastMw: number | null;
  internalScheduledCapacityMw: number | null;
  totalScheduledCapacityMw: number | null;
  operatingReserveMw: number | null;
  scheduledTieFlowTotalMw: number | null;
  unscheduledSteamCapacityMw: number | null;
  capacityAdjustmentsMw: number | null;
  capacityMarginMw: number | null;
  internalCapacityMarginMw: number | null;
}

interface ZonePeakRow {
  peakDate: string | null;
  area: string;
  generatedAtEpt: string | null;
  projectedPeakDatetimeEpt: string | null;
  loadForecastMw: number | null;
  internalScheduledCapacityMw: number | null;
  unscheduledSteamCapacityMw: number | null;
  capacityMarginMw: number | null;
}

interface TransferLimitRow {
  peakDate: string | null;
  transferLimitName: string;
  generatedAtEpt: string | null;
  projectedPeakDatetimeEpt: string | null;
  transferLimitMw: number | null;
}

interface ProjectedTieFlowRow {
  peakDate: string | null;
  interfaceName: string;
  generatedAtEpt: string | null;
  projectedPeakDatetimeEpt: string | null;
  scheduledTieFlowMw: number | null;
}

interface PrevPeriodRow {
  periodDate: string | null;
  area: string;
  generatedAtEpt: string | null;
  datetimeBeginningEpt: string | null;
  datetimeBeginningUtc: string | null;
  datetimeEndingEpt: string | null;
  actualLoadMw: number | null;
  dispatchRate: number | null;
}

interface MetricStatRow {
  area: string | null;
  metricKey: MetricKey;
  sampleCount: number;
  minValue: number | null;
  minPeakDate: string | null;
  maxValue: number | null;
  maxPeakDate: string | null;
}

interface PjmOpsSummaryPayload {
  iso: "pjm";
  source: string;
  selectedDate: string | null;
  availableDates: string[];
  rowCount: number;
  freshness: FreshnessRow[];
  latestGeneratedAtEpt: string | null;
  rtoPeak: RtoPeakRow | null;
  recentRtoPeaks: RtoPeakRow[];
  rtoMetricStats: MetricStatRow[];
  availableZones: string[];
  zonePeaks: ZonePeakRow[];
  recentZonePeaks: ZonePeakRow[];
  zoneMetricStats: MetricStatRow[];
  transferLimits: TransferLimitRow[];
  recentTransferLimits: TransferLimitRow[];
  transferLimitStats: MetricStatRow[];
  projectedTieFlows: ProjectedTieFlowRow[];
  recentProjectedTieFlows: ProjectedTieFlowRow[];
  projectedTieFlowStats: MetricStatRow[];
  prevPeriodDate: string | null;
  prevPeriodRows: PrevPeriodRow[];
  recentPrevPeriodRows: PrevPeriodRow[];
  prevPeriodStats: MetricStatRow[];
}

export interface PjmOpsSummaryFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface PjmOpsSummaryProps {
  refreshToken: number;
  onFreshnessChange?: (freshness: PjmOpsSummaryFreshnessSummary) => void;
}

interface TrendPoint {
  date: string | null;
  value: number | null;
}

interface StatDisplay {
  value: string;
  date: string;
}

type MetricKey =
  | "internalScheduledCapacityMw"
  | "scheduledTieFlowTotalMw"
  | "capacityAdjustmentsMw"
  | "totalScheduledCapacityMw"
  | "loadForecastMw"
  | "operatingReserveMw"
  | "unscheduledSteamCapacityMw"
  | "capacityMarginMw"
  | "transferLimitMw"
  | "scheduledTieFlowMw"
  | "actualLoadMw"
  | "dispatchRate";

type MetricRow = RtoPeakRow | ZonePeakRow | TransferLimitRow | ProjectedTieFlowRow | PrevPeriodRow;

interface MetricColumn {
  key: MetricKey;
  label: string;
  signed?: boolean;
  decimals?: number;
  unit?: string;
  widthClass?: string;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;

const DEFAULT_FRESHNESS: PjmOpsSummaryFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Ops Sum --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const RTO_COLUMNS: MetricColumn[] = [
  { key: "internalScheduledCapacityMw", label: "Internal Scheduled Capacity" },
  { key: "scheduledTieFlowTotalMw", label: "Scheduled Tie Flow Total", signed: true },
  { key: "capacityAdjustmentsMw", label: "Capacity Adjustments", signed: true },
  { key: "totalScheduledCapacityMw", label: "Total Scheduled Capacity" },
  { key: "loadForecastMw", label: "Load Forecast" },
  { key: "operatingReserveMw", label: "Operating Reserve" },
  { key: "unscheduledSteamCapacityMw", label: "Unscheduled Steam Forecast" },
];

const ZONE_COLUMNS: MetricColumn[] = [
  { key: "internalScheduledCapacityMw", label: "Internal Scheduled Capacity" },
  { key: "loadForecastMw", label: "Load Forecast" },
  { key: "unscheduledSteamCapacityMw", label: "Unscheduled Steam Forecast" },
];

const TRANSFER_LIMIT_COLUMNS: MetricColumn[] = [
  { key: "transferLimitMw", label: "Transfer Limit" },
];

const PROJECTED_TIE_FLOW_COLUMNS: MetricColumn[] = [
  { key: "scheduledTieFlowMw", label: "Scheduled Tie Flow", signed: true },
];

const PREV_PERIOD_COLUMNS: MetricColumn[] = [
  { key: "actualLoadMw", label: "Actual Load" },
  {
    key: "dispatchRate",
    label: "Dispatch Rate ($/MWh)",
    decimals: 2,
    unit: "$/MWh",
    widthClass: "w-[112px]",
  },
];

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function fmtHourEnding(value: string | null | undefined): string {
  if (!value) return "-";
  const hour = Number(value.slice(11, 13));
  if (!Number.isFinite(hour)) return "-";
  return `HE${String(hour + 1).padStart(2, "0")}`;
}

function fmtMetricNumber(
  value: number | null | undefined,
  signed = false,
  decimals = 0,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const formatted = value.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
  return signed && value > 0 ? `+${formatted}` : formatted;
}

function fmtMaybeSigned(
  value: number | null | undefined,
  signed = false,
  decimals = 0,
): string {
  return fmtMetricNumber(value, signed, decimals);
}

function fmtMetricWithUnit(
  value: number | null | undefined,
  signed = false,
  decimals = 0,
  unit = "MW",
): string {
  const formatted = fmtMaybeSigned(value, signed, decimals);
  return formatted === "-" ? "-" : `${formatted} ${unit}`;
}

function getMetric(row: MetricRow, key: MetricKey): number | null {
  if (!(key in row)) return null;
  const value = row[key as keyof MetricRow];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function statDisplay(
  value: number | null | undefined,
  date: string | null | undefined,
  signed = false,
  decimals = 0,
): StatDisplay {
  if (value === null || value === undefined || !Number.isFinite(value) || !date) {
    return { value: "-", date: "-" };
  }
  return { value: fmtMaybeSigned(value, signed, decimals), date: fmtDate(date) };
}

function freshnessFromPayload(payload: PjmOpsSummaryPayload | null): PjmOpsSummaryFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  const hasRows = Boolean(
    payload.rtoPeak ||
      payload.zonePeaks.length > 0 ||
      payload.transferLimits.length > 0 ||
      payload.projectedTieFlows.length > 0 ||
      payload.prevPeriodRows.length > 0,
  );
  return {
    status: hasRows ? "Current" : "No Rows",
    statusClass: hasRows
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-gray-700 bg-gray-900 text-gray-400",
    summary: `${fmtDate(payload.selectedDate)} | ${payload.rowCount.toLocaleString()} rows`,
    targetDateLabel: fmtDate(payload.selectedDate),
    latestDateLabel: fmtDateTime(
      payload.rtoPeak?.projectedPeakDatetimeEpt ??
        payload.zonePeaks[0]?.projectedPeakDatetimeEpt ??
        payload.transferLimits[0]?.projectedPeakDatetimeEpt ??
        payload.projectedTieFlows[0]?.projectedPeakDatetimeEpt ??
        payload.prevPeriodRows[0]?.datetimeBeginningEpt,
    ),
    latestUpdateLabel: fmtDateTime(payload.latestGeneratedAtEpt),
  };
}

function buildApiUrl({ date, refresh }: { date: string; refresh: boolean }): string {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-ops-summary?${params.toString()}`;
}

function buildCacheKey(date: string): string {
  return ["api:pjm-ops-summary", date || "latest"].join(":");
}

function Sparkline({
  points,
  signed = false,
  decimals = 0,
  unit = "MW",
}: {
  points: TrendPoint[];
  signed?: boolean;
  decimals?: number;
  unit?: string;
}) {
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(
    null,
  );
  const numericPoints = points.filter(
    (point): point is { date: string | null; value: number } =>
      point.value !== null && point.value !== undefined && Number.isFinite(point.value),
  );

  if (numericPoints.length < 2) {
    return <span className="text-[10px] text-gray-600">-</span>;
  }

  const width = 42;
  const height = 16;
  const pad = 2;
  const values = numericPoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const lastIndex = numericPoints.length - 1;
  const coordinates = numericPoints
    .map((point, index) => {
      const x = pad + (index / lastIndex) * (width - pad * 2);
      const y = height - pad - ((point.value - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const delta = numericPoints[lastIndex].value - numericPoints[0].value;
  const stroke = delta >= 0 ? "#10b981" : "#f87171";

  function showTooltip(target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    const widthPx = 188;
    const heightPx = 174;
    const left = Math.min(Math.max(8, rect.right - widthPx), window.innerWidth - widthPx - 8);
    const below = rect.bottom + 8;
    const top =
      below + heightPx > window.innerHeight
        ? Math.max(8, rect.top - heightPx - 8)
        : below;
    setTooltipPosition({ left, top });
  }

  return (
    <div
      className="relative flex items-center justify-end gap-1"
      tabIndex={0}
      onMouseEnter={(event) => showTooltip(event.currentTarget)}
      onMouseLeave={() => setTooltipPosition(null)}
      onFocus={(event) => showTooltip(event.currentTarget)}
      onBlur={() => setTooltipPosition(null)}
    >
      <svg
        aria-hidden="true"
        className="h-4 w-[42px] shrink-0"
        viewBox={`0 0 ${width} ${height}`}
      >
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="#293241" />
        <polyline fill="none" points={coordinates} stroke={stroke} strokeLinecap="round" strokeWidth="1.8" />
      </svg>
      {tooltipPosition && (
        <div
          className="pointer-events-none fixed z-50 min-w-[188px] rounded-md border border-gray-700 bg-gray-950 p-2 text-xs shadow-2xl shadow-black/60"
          style={{ left: tooltipPosition.left, top: tooltipPosition.top }}
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Last 7 Days ({fmtMetricWithUnit(delta, true, decimals, unit)})
          </div>
          <div className="space-y-1">
          {[...numericPoints].reverse().map((point) => (
            <div key={`${point.date}-${point.value}`} className="flex items-center justify-between gap-4">
              <span className="text-gray-500">{fmtDate(point.date)}</span>
                <span className="font-semibold text-gray-100">
                  {fmtMetricWithUnit(point.value, signed, decimals, unit)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatLines({ max, min }: { max: StatDisplay; min: StatDisplay }) {
  return (
    <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[10px] leading-tight">
      <span className="text-gray-500">Max</span>
      <span className="text-right">
        <span className="font-semibold tabular-nums text-gray-300">{max.value}</span>
        <span className="block text-gray-600">{max.date}</span>
      </span>
      <span className="text-gray-500">Min</span>
      <span className="text-right">
        <span className="font-semibold tabular-nums text-gray-300">{min.value}</span>
        <span className="block text-gray-600">{min.date}</span>
      </span>
    </div>
  );
}

function MetricValue({
  current,
  trendPoints,
  max,
  min,
  showExtremes,
  signed = false,
  decimals = 0,
  unit = "MW",
}: {
  current: number | null;
  trendPoints: TrendPoint[];
  max: StatDisplay;
  min: StatDisplay;
  showExtremes: boolean;
  signed?: boolean;
  decimals?: number;
  unit?: string;
}) {
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-1.5">
        <span className="min-w-[54px] text-right font-semibold tabular-nums text-gray-100">
          {fmtMaybeSigned(current, signed, decimals)}
        </span>
        <Sparkline points={trendPoints} signed={signed} decimals={decimals} unit={unit} />
      </div>
      {showExtremes && <StatLines max={max} min={min} />}
    </div>
  );
}

function HeaderText({ children }: { children: string }) {
  return <span className="block max-w-[78px] whitespace-normal leading-tight">{children}</span>;
}

function CardHeader({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-gray-800 bg-[#1b1e27] px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-700 bg-gray-950 text-sm font-semibold text-gray-300">
            {open ? "-" : "+"}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-100">{title}</span>
            <span className="mt-1 block text-xs text-gray-500">{subtitle}</span>
          </span>
        </button>
        {children}
      </div>
    </div>
  );
}

function WindowHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="pt-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
        {title}
      </div>
      <div className="mt-1 text-xs text-gray-500">{subtitle}</div>
    </div>
  );
}

export default function PjmOpsSummary({
  refreshToken,
  onFreshnessChange,
}: PjmOpsSummaryProps) {
  const [selectedDate, setSelectedDate] = useState("");
  const [showExtremes, setShowExtremes] = useState(false);
  const [rtoOpen, setRtoOpen] = useState(true);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [transferLimitsOpen, setTransferLimitsOpen] = useState(true);
  const [tieFlowsOpen, setTieFlowsOpen] = useState(true);
  const [prevPeriodOpen, setPrevPeriodOpen] = useState(false);
  const [payload, setPayload] = useState<PjmOpsSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = useMemo(
    () => buildApiUrl({ date: selectedDate, refresh: refreshToken > 0 }),
    [selectedDate, refreshToken],
  );
  const cacheKey = useMemo(() => buildCacheKey(selectedDate), [selectedDate]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchJsonWithCache<PjmOpsSummaryPayload>({
      key: cacheKey,
      url: apiUrl,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((nextPayload) => {
        setPayload(nextPayload);
        if (!selectedDate && nextPayload.selectedDate) {
          setSelectedDate(nextPayload.selectedDate);
        }
        onFreshnessChange?.(freshnessFromPayload(nextPayload));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load PJM capacity peak forecasts");
        onFreshnessChange?.(DEFAULT_FRESHNESS);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [apiUrl, cacheKey, onFreshnessChange, refreshToken, selectedDate]);

  const recentRtoTrendByMetric = useMemo(() => {
    const map = new Map<MetricKey, TrendPoint[]>();
    for (const column of RTO_COLUMNS) {
      map.set(
        column.key,
        (payload?.recentRtoPeaks ?? []).map((row) => ({
          date: fmtDate(row.projectedPeakDatetimeEpt),
          value: getMetric(row, column.key),
        })),
      );
    }
    return map;
  }, [payload?.recentRtoPeaks]);

  const recentZoneTrendByAreaMetric = useMemo(() => {
    const map = new Map<string, TrendPoint[]>();
    for (const row of payload?.recentZonePeaks ?? []) {
      for (const column of ZONE_COLUMNS) {
        const key = `${row.area}:${column.key}`;
        map.set(key, [
          ...(map.get(key) ?? []),
          {
            date: fmtDate(row.projectedPeakDatetimeEpt),
            value: getMetric(row, column.key),
          },
        ]);
      }
    }
    return map;
  }, [payload?.recentZonePeaks]);

  const recentTransferTrendByNameMetric = useMemo(() => {
    const map = new Map<string, TrendPoint[]>();
    for (const row of payload?.recentTransferLimits ?? []) {
      for (const column of TRANSFER_LIMIT_COLUMNS) {
        const key = `${row.transferLimitName}:${column.key}`;
        map.set(key, [
          ...(map.get(key) ?? []),
          {
            date: fmtDate(row.projectedPeakDatetimeEpt),
            value: getMetric(row, column.key),
          },
        ]);
      }
    }
    return map;
  }, [payload?.recentTransferLimits]);

  const recentTieFlowTrendByInterfaceMetric = useMemo(() => {
    const map = new Map<string, TrendPoint[]>();
    for (const row of payload?.recentProjectedTieFlows ?? []) {
      for (const column of PROJECTED_TIE_FLOW_COLUMNS) {
        const key = `${row.interfaceName}:${column.key}`;
        map.set(key, [
          ...(map.get(key) ?? []),
          {
            date: fmtDate(row.projectedPeakDatetimeEpt),
            value: getMetric(row, column.key),
          },
        ]);
      }
    }
    return map;
  }, [payload?.recentProjectedTieFlows]);

  const recentPrevPeriodTrendByAreaMetric = useMemo(() => {
    const map = new Map<string, TrendPoint[]>();
    for (const row of payload?.recentPrevPeriodRows ?? []) {
      for (const column of PREV_PERIOD_COLUMNS) {
        const key = `${row.area}:${column.key}`;
        map.set(key, [
          ...(map.get(key) ?? []),
          {
            date: fmtDate(row.datetimeBeginningEpt),
            value: getMetric(row, column.key),
          },
        ]);
      }
    }
    return map;
  }, [payload?.recentPrevPeriodRows]);

  const rtoStatsByMetric = useMemo(() => {
    return new Map((payload?.rtoMetricStats ?? []).map((row) => [row.metricKey, row]));
  }, [payload?.rtoMetricStats]);

  const zoneStatsByAreaMetric = useMemo(() => {
    const map = new Map<string, MetricStatRow>();
    for (const stat of payload?.zoneMetricStats ?? []) {
      if (stat.area) map.set(`${stat.area}:${stat.metricKey}`, stat);
    }
    return map;
  }, [payload?.zoneMetricStats]);

  const transferStatsByNameMetric = useMemo(() => {
    const map = new Map<string, MetricStatRow>();
    for (const stat of payload?.transferLimitStats ?? []) {
      if (stat.area) map.set(`${stat.area}:${stat.metricKey}`, stat);
    }
    return map;
  }, [payload?.transferLimitStats]);

  const tieFlowStatsByInterfaceMetric = useMemo(() => {
    const map = new Map<string, MetricStatRow>();
    for (const stat of payload?.projectedTieFlowStats ?? []) {
      if (stat.area) map.set(`${stat.area}:${stat.metricKey}`, stat);
    }
    return map;
  }, [payload?.projectedTieFlowStats]);

  const prevPeriodStatsByAreaMetric = useMemo(() => {
    const map = new Map<string, MetricStatRow>();
    for (const stat of payload?.prevPeriodStats ?? []) {
      if (stat.area) map.set(`${stat.area}:${stat.metricKey}`, stat);
    }
    return map;
  }, [payload?.prevPeriodStats]);

  const forecastPeakDatetime =
    payload?.rtoPeak?.projectedPeakDatetimeEpt ??
    payload?.transferLimits[0]?.projectedPeakDatetimeEpt ??
    payload?.projectedTieFlows[0]?.projectedPeakDatetimeEpt ??
    payload?.zonePeaks[0]?.projectedPeakDatetimeEpt;

  if (loading && !payload) {
    return (
      <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-400">
        Loading capacity peak forecasts...
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-6 text-sm text-red-200">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <label className="min-w-[180px] sm:max-w-[260px]">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Date
            </span>
            <select
              value={selectedDate || payload?.selectedDate || ""}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-sky-500"
            >
              {(payload?.availableDates ?? []).map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <button
              type="button"
              aria-pressed={showExtremes}
              onClick={() => setShowExtremes((value) => !value)}
              className={`inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-semibold transition-colors ${
                showExtremes
                  ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
                  : "border-gray-700 bg-gray-950 text-gray-400 hover:border-gray-600 hover:text-gray-200"
              }`}
            >
              {showExtremes ? "Hide History Max/Min" : "Show History Max/Min"}
            </button>
            <div className="text-xs text-gray-500">
              Source update {fmtDateTime(payload?.latestGeneratedAtEpt)}
            </div>
          </div>
        </div>
      </section>

      <WindowHeader
        title="Forecast Peak Window"
        subtitle={`${fmtDate(forecastPeakDatetime)} | ${fmtHourEnding(
          forecastPeakDatetime,
        )} projected peak`}
      />

      <div className="grid max-w-full grid-cols-1 gap-4 xl:grid-cols-[max-content_max-content]">
        <section className="w-fit max-w-full overflow-hidden rounded-lg border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20">
          <CardHeader
            title="Capacity Peak Forecast - RTO"
          subtitle={`${fmtDate(payload?.selectedDate)} | ${fmtHourEnding(
            payload?.rtoPeak?.projectedPeakDatetimeEpt,
          )} projected peak`}
          open={rtoOpen}
          onToggle={() => setRtoOpen((open) => !open)}
          />
          {rtoOpen && (
          <div className="overflow-x-auto">
            <table className="w-max table-auto border-collapse text-xs text-gray-200">
              <thead className="bg-[#11141c] text-[11px] text-amber-300">
                <tr>
                  <th className="w-[76px] px-2 py-2 text-right font-semibold">
                    <HeaderText>Projected Peak Time</HeaderText>
                  </th>
                  {RTO_COLUMNS.map((column) => (
                    <th key={column.key} className="w-[102px] px-2 py-2 text-right font-semibold">
                      <HeaderText>{column.label}</HeaderText>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {payload?.rtoPeak && (
                  <tr className="bg-[#181b23]">
                    <td className="whitespace-nowrap px-2 py-2 text-right align-top">
                      <div className="font-semibold tabular-nums text-amber-300">
                        {fmtHourEnding(payload.rtoPeak.projectedPeakDatetimeEpt)}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {fmtDateTime(payload.rtoPeak.projectedPeakDatetimeEpt)}
                      </div>
                    </td>
                    {RTO_COLUMNS.map((column) => {
                      const stat = rtoStatsByMetric.get(column.key);
                      return (
                        <td key={column.key} className="px-2 py-2 text-right align-top">
                          <MetricValue
                            current={getMetric(payload.rtoPeak!, column.key)}
                            trendPoints={recentRtoTrendByMetric.get(column.key) ?? []}
                            max={statDisplay(
                              stat?.maxValue,
                              stat?.maxPeakDate,
                              column.signed,
                              column.decimals,
                            )}
                            min={statDisplay(
                              stat?.minValue,
                              stat?.minPeakDate,
                              column.signed,
                              column.decimals,
                            )}
                            showExtremes={showExtremes && Boolean(stat)}
                            signed={column.signed}
                            decimals={column.decimals}
                            unit={column.unit}
                          />
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
        </section>
      <section className="w-fit max-w-full overflow-hidden rounded-lg border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20">
        <CardHeader
          title="Capacity Peak Forecast - Zones"
          subtitle={`${fmtDate(payload?.selectedDate)} | ${(payload?.zonePeaks.length ?? 0).toLocaleString()} zonal projected peak rows`}
          open={zonesOpen}
          onToggle={() => setZonesOpen((open) => !open)}
        />
        {zonesOpen && (
          <div className="overflow-x-auto">
            <table className="w-max table-auto border-collapse text-xs text-gray-200">
              <thead className="bg-[#11141c] text-[11px] text-amber-300">
                <tr>
                  <th className="sticky left-0 z-20 w-[62px] bg-[#11141c] px-2 py-2 text-left font-semibold">
                    Area
                  </th>
                  <th className="w-[76px] px-2 py-2 text-right font-semibold">
                    <HeaderText>Projected Peak Time</HeaderText>
                  </th>
                  {ZONE_COLUMNS.map((column) => (
                    <th key={column.key} className="w-[112px] px-2 py-2 text-right font-semibold">
                      <HeaderText>{column.label}</HeaderText>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {(payload?.zonePeaks ?? []).map((row) => (
                  <tr key={row.area} className="bg-[#151820] odd:bg-[#181b23]">
                    <th className="sticky left-0 z-10 bg-inherit px-2 py-2 text-left font-semibold text-gray-100">
                      {row.area}
                    </th>
                    <td className="whitespace-nowrap px-2 py-2 text-right align-top">
                      <div className="font-semibold tabular-nums text-amber-300">
                        {fmtHourEnding(row.projectedPeakDatetimeEpt)}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {fmtDateTime(row.projectedPeakDatetimeEpt)}
                      </div>
                    </td>
                    {ZONE_COLUMNS.map((column) => {
                      const stat = zoneStatsByAreaMetric.get(`${row.area}:${column.key}`);
                      return (
                        <td key={column.key} className="px-2 py-2 text-right align-top">
                          <MetricValue
                            current={getMetric(row, column.key)}
                            trendPoints={recentZoneTrendByAreaMetric.get(`${row.area}:${column.key}`) ?? []}
                            max={statDisplay(
                              stat?.maxValue,
                              stat?.maxPeakDate,
                              column.signed,
                              column.decimals,
                            )}
                            min={statDisplay(
                              stat?.minValue,
                              stat?.minPeakDate,
                              column.signed,
                              column.decimals,
                            )}
                            showExtremes={showExtremes && Boolean(stat)}
                            signed={column.signed}
                            decimals={column.decimals}
                            unit={column.unit}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>

      <div className="grid max-w-full grid-cols-1 gap-4 xl:grid-cols-[max-content_max-content]">
        <section className="w-fit max-w-full overflow-hidden rounded-lg border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20">
          <CardHeader
            title="Forecast Transfer Limits"
            subtitle={`${fmtDate(payload?.selectedDate)} | ${(payload?.transferLimits.length ?? 0).toLocaleString()} transfer limits`}
            open={transferLimitsOpen}
            onToggle={() => setTransferLimitsOpen((open) => !open)}
          />
          {transferLimitsOpen && (
            <div className="overflow-x-auto">
              <table className="w-max table-auto border-collapse text-xs text-gray-200">
                <thead className="bg-[#11141c] text-[11px] text-amber-300">
                  <tr>
                    <th className="sticky left-0 z-20 w-[130px] bg-[#11141c] px-2 py-2 text-left font-semibold">
                      Transfer Limit
                    </th>
                    <th className="w-[76px] px-2 py-2 text-right font-semibold">
                      <HeaderText>Projected Peak Time</HeaderText>
                    </th>
                    {TRANSFER_LIMIT_COLUMNS.map((column) => (
                      <th key={column.key} className="w-[112px] px-2 py-2 text-right font-semibold">
                        <HeaderText>{column.label}</HeaderText>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {(payload?.transferLimits ?? []).map((row) => (
                    <tr key={row.transferLimitName} className="bg-[#151820] odd:bg-[#181b23]">
                      <th className="sticky left-0 z-10 bg-inherit px-2 py-2 text-left font-semibold text-gray-100">
                        {row.transferLimitName}
                      </th>
                      <td className="whitespace-nowrap px-2 py-2 text-right align-top">
                        <div className="font-semibold tabular-nums text-amber-300">
                          {fmtHourEnding(row.projectedPeakDatetimeEpt)}
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          {fmtDateTime(row.projectedPeakDatetimeEpt)}
                        </div>
                      </td>
                      {TRANSFER_LIMIT_COLUMNS.map((column) => {
                        const stat = transferStatsByNameMetric.get(
                          `${row.transferLimitName}:${column.key}`,
                        );
                        return (
                          <td key={column.key} className="px-2 py-2 text-right align-top">
                            <MetricValue
                              current={getMetric(row, column.key)}
                              trendPoints={
                                recentTransferTrendByNameMetric.get(
                                  `${row.transferLimitName}:${column.key}`,
                                ) ?? []
                              }
                              max={statDisplay(
                                stat?.maxValue,
                                stat?.maxPeakDate,
                                column.signed,
                                column.decimals,
                              )}
                              min={statDisplay(
                                stat?.minValue,
                                stat?.minPeakDate,
                                column.signed,
                                column.decimals,
                              )}
                              showExtremes={showExtremes && Boolean(stat)}
                              signed={column.signed}
                              decimals={column.decimals}
                              unit={column.unit}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {(payload?.transferLimits.length ?? 0) === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-gray-500" colSpan={3}>
                        No forecast transfer-limit rows for this date.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="w-fit max-w-full overflow-hidden rounded-lg border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20">
          <CardHeader
            title="Projected Scheduled Tie Flow"
            subtitle={`${fmtDate(payload?.selectedDate)} | ${(payload?.projectedTieFlows.length ?? 0).toLocaleString()} interfaces`}
            open={tieFlowsOpen}
            onToggle={() => setTieFlowsOpen((open) => !open)}
          />
          {tieFlowsOpen && (
            <div className="overflow-x-auto">
              <table className="w-max table-auto border-collapse text-xs text-gray-200">
                <thead className="bg-[#11141c] text-[11px] text-amber-300">
                  <tr>
                    <th className="sticky left-0 z-20 w-[78px] bg-[#11141c] px-2 py-2 text-left font-semibold">
                      Interface
                    </th>
                    <th className="w-[76px] px-2 py-2 text-right font-semibold">
                      <HeaderText>Projected Peak Time</HeaderText>
                    </th>
                    {PROJECTED_TIE_FLOW_COLUMNS.map((column) => (
                      <th key={column.key} className="w-[120px] px-2 py-2 text-right font-semibold">
                        <HeaderText>{column.label}</HeaderText>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {(payload?.projectedTieFlows ?? []).map((row) => (
                    <tr key={row.interfaceName} className="bg-[#151820] odd:bg-[#181b23]">
                      <th className="sticky left-0 z-10 bg-inherit px-2 py-2 text-left font-semibold text-gray-100">
                        {row.interfaceName}
                      </th>
                      <td className="whitespace-nowrap px-2 py-2 text-right align-top">
                        <div className="font-semibold tabular-nums text-amber-300">
                          {fmtHourEnding(row.projectedPeakDatetimeEpt)}
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          {fmtDateTime(row.projectedPeakDatetimeEpt)}
                        </div>
                      </td>
                      {PROJECTED_TIE_FLOW_COLUMNS.map((column) => {
                        const stat = tieFlowStatsByInterfaceMetric.get(
                          `${row.interfaceName}:${column.key}`,
                        );
                        return (
                          <td key={column.key} className="px-2 py-2 text-right align-top">
                            <MetricValue
                              current={getMetric(row, column.key)}
                              trendPoints={
                                recentTieFlowTrendByInterfaceMetric.get(
                                  `${row.interfaceName}:${column.key}`,
                                ) ?? []
                              }
                              max={statDisplay(
                                stat?.maxValue,
                                stat?.maxPeakDate,
                                column.signed,
                                column.decimals,
                              )}
                              min={statDisplay(
                                stat?.minValue,
                                stat?.minPeakDate,
                                column.signed,
                                column.decimals,
                              )}
                              showExtremes={showExtremes && Boolean(stat)}
                              signed={column.signed}
                              decimals={column.decimals}
                              unit={column.unit}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {(payload?.projectedTieFlows.length ?? 0) === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-gray-500" colSpan={3}>
                        No projected tie-flow rows for this date.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <WindowHeader
        title="Actuals Window"
        subtitle={`${fmtDate(payload?.prevPeriodDate)} | latest actual daily peak on or before selected date`}
      />

      <section className="w-fit max-w-full overflow-hidden rounded-lg border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20">
        <CardHeader
          title="Previous Period Actuals"
          subtitle={`${fmtDate(payload?.prevPeriodDate)} | ${(payload?.prevPeriodRows.length ?? 0).toLocaleString()} daily peak area rows`}
          open={prevPeriodOpen}
          onToggle={() => setPrevPeriodOpen((open) => !open)}
        />
        {prevPeriodOpen && (
          <div className="overflow-x-auto">
            <table className="w-max table-auto border-collapse text-xs text-gray-200">
              <thead className="bg-[#11141c] text-[11px] text-amber-300">
                <tr>
                  <th className="sticky left-0 z-20 w-[104px] bg-[#11141c] px-2 py-2 text-left font-semibold">
                    Area
                  </th>
                  <th className="w-[132px] px-2 py-2 text-right font-semibold">
                    <HeaderText>DateTime Beginning EPT</HeaderText>
                  </th>
                  <th className="w-[132px] px-2 py-2 text-right font-semibold">
                    <HeaderText>DateTime Beginning UTC</HeaderText>
                  </th>
                  {PREV_PERIOD_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      className={`${column.widthClass ?? "w-[112px]"} px-2 py-2 text-right font-semibold`}
                    >
                      <HeaderText>{column.label}</HeaderText>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {(payload?.prevPeriodRows ?? []).map((row) => (
                  <tr key={row.area} className="bg-[#151820] odd:bg-[#181b23]">
                    <th className="sticky left-0 z-10 bg-inherit px-2 py-2 text-left font-semibold text-gray-100">
                      {row.area}
                    </th>
                    <td className="whitespace-nowrap px-2 py-2 text-right align-top">
                      <div className="font-semibold tabular-nums text-amber-300">
                        {fmtDateTime(row.datetimeBeginningEpt)}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {fmtHourEnding(row.datetimeBeginningEpt)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right align-top">
                      <div className="font-semibold tabular-nums text-gray-200">
                        {fmtDateTime(row.datetimeBeginningUtc)}
                      </div>
                    </td>
                    {PREV_PERIOD_COLUMNS.map((column) => {
                      const stat = prevPeriodStatsByAreaMetric.get(`${row.area}:${column.key}`);
                      return (
                        <td key={column.key} className="px-2 py-2 text-right align-top">
                          <MetricValue
                            current={getMetric(row, column.key)}
                            trendPoints={
                              recentPrevPeriodTrendByAreaMetric.get(
                                `${row.area}:${column.key}`,
                              ) ?? []
                            }
                            max={statDisplay(
                              stat?.maxValue,
                              stat?.maxPeakDate,
                              column.signed,
                              column.decimals,
                            )}
                            min={statDisplay(
                              stat?.minValue,
                              stat?.minPeakDate,
                              column.signed,
                              column.decimals,
                            )}
                            showExtremes={showExtremes && Boolean(stat)}
                            signed={column.signed}
                            decimals={column.decimals}
                            unit={column.unit}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {(payload?.prevPeriodRows.length ?? 0) === 0 && (
                  <tr>
                    <td className="px-3 py-3 text-gray-500" colSpan={5}>
                      No previous-period rows available on or before this date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && <div className="text-xs text-amber-300">{error}</div>}
    </div>
  );
}
