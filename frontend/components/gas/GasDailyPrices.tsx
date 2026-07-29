"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import ColumnFilterMenu, { type SortDirection } from "@/components/dashboard/ColumnFilterMenu";
import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import {
  DAILY_GAS_PRICE_BASIS_LABELS,
  GAS_REGION_LABELS,
  GAS_REGION_ORDER,
  getIceGasRegistryEntry,
  getIceGasVerificationLabel,
  type DailyGasCurveColumn,
  type DailyGasPriceRow,
  type DailyGasPricesPayload,
  type DailyGasTrendPoint,
  type GasPriceBasis,
  type GasRegion,
  type IceGasRegistryEntry,
} from "@/lib/gasPricing";
import GasMonthlySettles from "./GasMonthlySettles";

const API_TTL_MS = 5 * 60 * 1000;
const EMPTY_FILTER_VALUES: string[] = [];
const DEFAULT_CASH_BALMO_BASIS: GasPriceBasis = "vwap_close";
const MATRIX_INFO_COLUMN_WIDTH = 52;
const MATRIX_MARKET_COLUMN_WIDTH = 240;
const MATRIX_PRICE_COLUMN_WIDTH = 92;
const GAS_PRICE_FIELD_OPTIONS: Array<{ key: GasPriceBasis; label: string }> = [
  { key: "vwap_close", label: DAILY_GAS_PRICE_BASIS_LABELS.vwap_close },
  { key: "settlement", label: DAILY_GAS_PRICE_BASIS_LABELS.settlement },
  { key: "open", label: DAILY_GAS_PRICE_BASIS_LABELS.open },
  { key: "high", label: DAILY_GAS_PRICE_BASIS_LABELS.high },
  { key: "low", label: DAILY_GAS_PRICE_BASIS_LABELS.low },
  { key: "close", label: DAILY_GAS_PRICE_BASIS_LABELS.close },
];
const GAS_HISTORY_LOOKBACK_OPTIONS = [
  { key: "30", label: "30D", days: 30 },
  { key: "90", label: "90D", days: 90 },
  { key: "180", label: "180D", days: 180 },
  { key: "all", label: "All", days: null },
] as const;

interface SortState {
  key: string;
  direction: SortDirection;
}

type ColumnFilters = Record<string, string[]>;
type GasHistoryLookbackKey = (typeof GAS_HISTORY_LOOKBACK_OPTIONS)[number]["key"];
type GasMatrixDisplayMode = "price" | "basisVsHenry" | "cashSpread";
type GasPricingTab = "matrix" | "monthlySettles";
type GasRegionFilterOption = { key: GasRegion | "all"; label: string };

interface SelectedGasCell {
  row: DailyGasPriceRow;
  column: DailyGasCurveColumn;
}

interface GasInfoHoverCardState {
  row: DailyGasPriceRow;
  fullyVerified: boolean;
  top: number;
  left: number;
}

interface GasTrendHoverCardState {
  title: string;
  points: Array<{ tradeDate: string | null; value: number }>;
  delta: number;
  top: number;
  left: number;
}

interface GasContractHistoryPoint {
  tradeDate: string | null;
  settlement: number | null;
  vwapClose: number | null;
  volume: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  openInterest?: number | null;
  updatedAt?: string | null;
}

interface GasContractHistoryPayload {
  product: "gas";
  source: string;
  sourceSymbols: string[];
  aggregation: "single" | "henry_plus_basis";
  rowCount: number;
  dataAsOf: string | null;
  history: GasContractHistoryPoint[];
  stats: {
    latestPrice: number | null;
    latestVolume: number | null;
    latestTradeDate: string | null;
    dayMove: number | null;
    fiveDayMove: number | null;
    twentyDayMove: number | null;
    windowStartTradeDate: string | null;
    windowHigh: number | null;
    windowLow: number | null;
    firstSettlement: number | null;
    avgVolume: number | null;
  };
}

interface GasSymbolInfoRow {
  bucket: string;
  symbol: string | null;
  entry: IceGasRegistryEntry | null;
  formula: string;
  sourceSymbols: string[];
}

export interface GasDailyPricesFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
  fieldLabel: string;
  rowCountLabel: string;
}

interface GasDailyPricesProps {
  refreshToken?: number;
  onFreshnessChange?: (freshness: GasDailyPricesFreshnessSummary) => void;
}

function buildGasMatrixApiUrl(refresh: boolean, cashBasis: GasPriceBasis, balmoBasis: GasPriceBasis): string {
  const params = new URLSearchParams();
  params.set("cashBasis", cashBasis);
  params.set("balmoBasis", balmoBasis);
  if (refresh) params.set("refresh", "1");
  const query = params.toString();
  return query ? `/api/gas-daily-prices?${query}` : "/api/gas-daily-prices";
}

function buildCacheKey(cashBasis: GasPriceBasis, balmoBasis: GasPriceBasis): string {
  return `api:gas-daily-prices:v13:latest-mixed-fields-24-months-cash-balmo-trends:${cashBasis}:${balmoBasis}`;
}

function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `$${value.toFixed(3)}`;
}

function fmtSpreadPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  if (value > 0) return `+$${value.toFixed(3)}`;
  if (value < 0) return `-$${Math.abs(value).toFixed(3)}`;
  return "$0.000";
}

function fmtDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "-";
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtSigned(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const formatted = Math.abs(value).toFixed(3);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function ControlCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="w-full max-w-none rounded-lg border border-sky-950/70 bg-[#0d121b] p-3 shadow-xl shadow-black/20 ring-1 ring-white/[0.02] sm:p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function rowGradientColor(value: number | null, min: number, max: number): string {
  if (value === null || !Number.isFinite(min) || !Number.isFinite(max)) {
    return "rgba(15, 23, 42, 0.45)";
  }
  if (max <= min) return "rgba(31, 41, 55, 0.72)";
  const pct = (value - min) / (max - min);
  if (pct >= 0.5) {
    const alpha = 0.16 + (pct - 0.5) * 0.88;
    return `rgba(34, 197, 94, ${alpha})`;
  }
  const alpha = 0.16 + (0.5 - pct) * 0.88;
  return `rgba(248, 113, 113, ${alpha})`;
}

function sortFilterOption(left: string, right: string): number {
  const leftNumber = Number(left.replace(/[$,]/g, ""));
  const rightNumber = Number(right.replace(/[$,]/g, ""));
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return left.localeCompare(right);
}

function priceFieldLabel(
  column: DailyGasCurveColumn,
  cashBasis: GasPriceBasis,
  balmoBasis: GasPriceBasis,
): string {
  if (column.kind === "cash") return DAILY_GAS_PRICE_BASIS_LABELS[cashBasis];
  if (column.kind === "balmo") return DAILY_GAS_PRICE_BASIS_LABELS[balmoBasis];
  return "Settlement";
}

function verificationClassName(entry: IceGasRegistryEntry | null): string {
  if (!entry) return "border-gray-700 bg-gray-900/50 text-gray-400";
  if (entry.metadata_status === "ice_product_url_verified") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  if (entry.metadata_status === "unverified_legacy_symbol") {
    return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  }
  return "border-gray-700 bg-gray-900/50 text-gray-300";
}

function registryProductText(entry: IceGasRegistryEntry | null): string {
  if (!entry) return "-";
  return entry.product_name || entry.description || entry.hub || "-";
}

function registryScreenText(entry: IceGasRegistryEntry | null): string {
  if (!entry) return "-";
  return [entry.ice_trading_screen_product_name, entry.ice_trading_screen_hub_name].filter(Boolean).join(" | ") || "-";
}

function isVerifiedIceEntry(entry: IceGasRegistryEntry | null): boolean {
  return entry?.metadata_status === "ice_product_url_verified";
}

function hasFullyVerifiedConfiguredSymbols(row: DailyGasPriceRow): boolean {
  const configuredEntries = [
    getIceGasRegistryEntry(row.cashSymbol),
    row.balmoSymbol ? getIceGasRegistryEntry(row.balmoSymbol) : null,
    row.futuresProduct ? getIceGasRegistryEntry(row.futuresProduct) : null,
    row.curveStyle === "basis" ? getIceGasRegistryEntry("HNG") : null,
  ].filter((entry): entry is IceGasRegistryEntry => Boolean(entry));

  return configuredEntries.length > 0 && configuredEntries.every(isVerifiedIceEntry);
}

function gasInfoHoverRows(row: DailyGasPriceRow, fullyVerified: boolean) {
  return [
    { label: "Market", value: row.market },
    { label: "Region", value: GAS_REGION_LABELS[row.region] },
    { label: "Cash Symbol", value: row.cashSymbol },
    { label: "BalMo Symbol", value: row.balmoSymbol ?? "-" },
    { label: "Futures", value: row.futuresProduct ?? "-" },
    { label: "Curve", value: row.curveStyle },
    { label: "ICE Status", value: fullyVerified ? "Verified symbols" : "Needs symbol review" },
  ];
}

function numericTrendPoints(points: DailyGasTrendPoint[]): Array<{ tradeDate: string | null; value: number }> {
  return points.filter(
    (point): point is { tradeDate: string | null; value: number } =>
      point.value !== null && point.value !== undefined && Number.isFinite(point.value),
  );
}

function GasPriceSparkline({
  points,
  onHover,
  onLeave,
}: {
  points: DailyGasTrendPoint[];
  onHover: (element: HTMLElement) => void;
  onLeave: () => void;
}) {
  const numericPoints = numericTrendPoints(points);
  if (numericPoints.length < 2) return null;

  const width = 36;
  const height = 14;
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

  return (
    <span
      className="relative inline-flex shrink-0 items-center"
      onMouseEnter={(event) => onHover(event.currentTarget)}
      onMouseLeave={onLeave}
    >
      <svg
        aria-hidden="true"
        className="h-3.5 w-9"
        viewBox={`0 0 ${width} ${height}`}
      >
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="#293241" />
        <polyline fill="none" points={coordinates} stroke={stroke} strokeLinecap="round" strokeWidth="1.7" />
      </svg>
    </span>
  );
}

function compareNullablePrices(
  left: number | null | undefined,
  right: number | null | undefined,
  direction: SortDirection,
): number {
  const leftFinite = left !== null && left !== undefined && Number.isFinite(left);
  const rightFinite = right !== null && right !== undefined && Number.isFinite(right);
  if (!leftFinite && !rightFinite) return 0;
  if (!leftFinite) return 1;
  if (!rightFinite) return -1;
  return direction === "asc" ? left - right : right - left;
}

function filterValueForColumn(
  row: DailyGasPriceRow,
  key: string,
  valueForKey?: (row: DailyGasPriceRow, key: string) => number | null,
  formatValue: (value: number | null) => string = fmtPrice,
): string {
  if (key === "region") return GAS_REGION_LABELS[row.region];
  if (key === "market") return row.market;
  return formatValue(valueForKey ? valueForKey(row, key) : row.values[key]);
}

function compareRowsByColumn(
  left: DailyGasPriceRow,
  right: DailyGasPriceRow,
  key: string,
  direction: SortDirection,
  valueForKey?: (row: DailyGasPriceRow, key: string) => number | null,
): number {
  if (key === "region") {
    const comparison = GAS_REGION_LABELS[left.region].localeCompare(GAS_REGION_LABELS[right.region]);
    return direction === "asc" ? comparison : -comparison;
  }
  if (key === "market") {
    const comparison = left.market.localeCompare(right.market);
    return direction === "asc" ? comparison : -comparison;
  }
  return compareNullablePrices(
    valueForKey ? valueForKey(left, key) : left.values[key],
    valueForKey ? valueForKey(right, key) : right.values[key],
    direction,
  );
}

interface GasChartRow {
  tradeDate: string;
  settlement: number | null;
  vwapClose: number | null;
  volume: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  openInterest: number | null;
  hasTrade: boolean;
}

interface GasNoTradeRange {
  start: string;
  end: string;
}

interface GasHistoryTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ payload?: GasChartRow }>;
}

function utcDay(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

function addUtcDays(value: string, days: number): string {
  const date = utcDay(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildCalendarGasChartRows(history: GasContractHistoryPoint[], lookbackKey: GasHistoryLookbackKey) {
  const points = history
    .filter((point) => point.tradeDate && point.tradeDate.slice(0, 10))
    .map((point) => ({
      ...point,
      tradeDate: point.tradeDate?.slice(0, 10) ?? "",
    }))
    .filter((point) => point.tradeDate)
    .sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));

  const tradablePoints = points.filter(
    (point) =>
      point.settlement !== null ||
      point.vwapClose !== null ||
      point.volume !== null ||
      point.openInterest !== null,
  );
  const latestTradeDate = tradablePoints.at(-1)?.tradeDate ?? points.at(-1)?.tradeDate ?? null;
  if (!latestTradeDate) return { rows: [] as GasChartRow[], noTradeRanges: [] as GasNoTradeRange[] };

  const lookback = GAS_HISTORY_LOOKBACK_OPTIONS.find((option) => option.key === lookbackKey);
  const firstHistoryDate = points[0]?.tradeDate ?? latestTradeDate;
  const startDate =
    lookback?.days === null || lookback?.days === undefined
      ? firstHistoryDate
      : addUtcDays(latestTradeDate, -(lookback.days - 1));
  const selectedPoints = points.filter((point) => point.tradeDate >= startDate && point.tradeDate <= latestTradeDate);
  const byDate = new Map(selectedPoints.map((point) => [point.tradeDate, point]));
  const rows: GasChartRow[] = [];

  for (let cursor = startDate; cursor <= latestTradeDate; cursor = addUtcDays(cursor, 1)) {
    const point = byDate.get(cursor);
    rows.push({
      tradeDate: cursor,
      settlement: point?.settlement ?? null,
      vwapClose: point?.vwapClose ?? null,
      volume: point?.volume ?? null,
      open: point?.open ?? null,
      high: point?.high ?? null,
      low: point?.low ?? null,
      close: point?.close ?? null,
      openInterest: point?.openInterest ?? null,
      hasTrade: Boolean(point),
    });
  }

  const noTradeRanges: GasNoTradeRange[] = [];
  let currentStart: string | null = null;
  let currentEnd: string | null = null;
  for (const row of rows) {
    if (!row.hasTrade) {
      currentStart ??= row.tradeDate;
      currentEnd = row.tradeDate;
    } else if (currentStart && currentEnd) {
      noTradeRanges.push({ start: currentStart, end: currentEnd });
      currentStart = null;
      currentEnd = null;
    }
  }
  if (currentStart && currentEnd) noTradeRanges.push({ start: currentStart, end: currentEnd });

  return { rows, noTradeRanges };
}

function GasHistoryTooltip({ active, payload, label }: GasHistoryTooltipProps) {
  if (!active) return null;
  const row = payload?.find((item) => item.payload)?.payload;
  if (!row) return null;

  return (
    <div className="rounded-md border border-gray-700 bg-slate-950 px-3 py-2 text-xs shadow-xl shadow-black/40">
      <div className="mb-1 font-mono text-sm text-gray-100">{label}</div>
      {!row.hasTrade ? (
        <div className="text-gray-500">No trade</div>
      ) : (
        <div className="space-y-1">
          <div className="text-emerald-300">Settlement: {fmtPrice(row.settlement)}</div>
          <div className="text-sky-300">VWAP: {fmtPrice(row.vwapClose)}</div>
          <div className="text-gray-400">Open: {fmtPrice(row.open)}</div>
          <div className="text-gray-400">High: {fmtPrice(row.high)}</div>
          <div className="text-gray-400">Low: {fmtPrice(row.low)}</div>
          <div className="text-gray-400">Close: {fmtPrice(row.close)}</div>
          <div className="text-blue-300">Volume: {fmtVolume(row.volume)}</div>
          <div className="text-amber-300">Open Interest: {fmtVolume(row.openInterest)}</div>
        </div>
      )}
    </div>
  );
}

function GasHistoryChart({ history }: { history: GasContractHistoryPoint[] }) {
  const [focused, setFocused] = useState(false);
  const [lookbackKey, setLookbackKey] = useState<GasHistoryLookbackKey>("90");
  const [visibleSeries, setVisibleSeries] = useState({
    settlement: true,
    vwapClose: true,
    volume: true,
    openInterest: true,
  });

  const { rows: chartData, noTradeRanges } = useMemo(
    () => buildCalendarGasChartRows(history, lookbackKey),
    [history, lookbackKey],
  );

  if (chartData.length < 2) {
    return <div className="px-3 py-8 text-sm text-gray-500">Not enough history to chart.</div>;
  }

  const legendItems = [
    { key: "settlement", label: "Settlement", color: "#22c55e", available: chartData.some((point) => point.settlement !== null) },
    { key: "vwapClose", label: "VWAP", color: "#38bdf8", available: chartData.some((point) => point.vwapClose !== null) },
    { key: "volume", label: "Volume", color: "#38bdf8", available: chartData.some((point) => point.volume !== null) },
    { key: "openInterest", label: "Open Interest", color: "#f59e0b", available: chartData.some((point) => point.openInterest !== null) },
  ] as const;
  const activeLookbackIndex = Math.max(
    0,
    GAS_HISTORY_LOOKBACK_OPTIONS.findIndex((option) => option.key === lookbackKey),
  );

  return (
    <div className="rounded-md border border-gray-800 bg-gray-950/25 p-3">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-100">Settlement, VWAP, Volume, and Open Interest</div>
          <div className="text-xs text-gray-500">
            OHLC is muted from the plot and available in hover. Non-trading dates are shaded.
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="text-xs text-gray-500">
            {chartData[0].tradeDate} to {chartData.at(-1)?.tradeDate}
          </div>
          <button
            type="button"
            onClick={() => setFocused((value) => !value)}
            className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-xs font-semibold text-gray-300 transition-colors hover:border-cyan-400 hover:text-white"
          >
            {focused ? "Exit Focus" : "Focus"}
          </button>
        </div>
      </div>
      <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {legendItems.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={!item.available}
              onClick={() =>
                setVisibleSeries((current) => ({
                  ...current,
                  [item.key]: !current[item.key],
                }))
              }
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                visibleSeries[item.key]
                  ? "border-gray-600 bg-gray-900 text-gray-100"
                  : "border-gray-800 bg-gray-950/40 text-gray-500"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </button>
          ))}
          <span className="inline-flex items-center rounded-md border border-gray-800 bg-gray-950/40 px-2 py-1 text-xs font-semibold text-gray-500">
            OHLC in hover
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-gray-800 bg-gray-950 p-0.5">
            {GAS_HISTORY_LOOKBACK_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setLookbackKey(option.key)}
                className={`h-7 min-w-12 rounded px-2 text-xs font-semibold ${
                  lookbackKey === option.key ? "bg-gray-100 text-gray-950" : "text-gray-400 hover:text-gray-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={GAS_HISTORY_LOOKBACK_OPTIONS.length - 1}
            step={1}
            value={activeLookbackIndex}
            onChange={(event) =>
              setLookbackKey(GAS_HISTORY_LOOKBACK_OPTIONS[Number(event.target.value)]?.key ?? "90")
            }
            className="h-2 w-40 accent-cyan-400"
            aria-label="Chart lookback"
          />
          <span className="w-9 text-right text-xs font-semibold text-gray-500">
            {GAS_HISTORY_LOOKBACK_OPTIONS[activeLookbackIndex]?.label}
          </span>
        </div>
      </div>
      <div className={`${focused ? "h-[72vh]" : "h-[430px]"} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: 20, bottom: 12, left: 8 }}>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.14)" vertical={false} />
            <XAxis
              dataKey="tradeDate"
              minTickGap={34}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              label={{ value: "Trade Date", position: "insideBottom", offset: -4, fill: "#94a3b8" }}
            />
            <YAxis
              yAxisId="price"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              width={58}
              label={{ value: "Price", angle: -90, position: "insideLeft", fill: "#94a3b8" }}
              tickFormatter={(value) => fmtPrice(Number(value))}
            />
            <YAxis
              yAxisId="activity"
              orientation="right"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              width={62}
              label={{ value: "Volume / OI", angle: 90, position: "insideRight", fill: "#94a3b8" }}
              tickFormatter={(value) => fmtVolume(Number(value))}
            />
            <Tooltip content={<GasHistoryTooltip />} />
            {noTradeRanges.map((range) => (
              <ReferenceArea
                key={`${range.start}-${range.end}`}
                yAxisId="price"
                x1={range.start}
                x2={range.end}
                fill="rgba(148, 163, 184, 0.08)"
                strokeOpacity={0}
              />
            ))}
            {visibleSeries.volume && (
              <Bar yAxisId="activity" dataKey="volume" name="Volume" fill="#38bdf8" fillOpacity={0.38} maxBarSize={10} />
            )}
            {visibleSeries.openInterest && (
              <Line
                yAxisId="activity"
                type="monotone"
                dataKey="openInterest"
                name="Open Interest"
                stroke="#f59e0b"
                strokeWidth={1.8}
                dot={false}
                connectNulls
              />
            )}
            {visibleSeries.vwapClose && (
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="vwapClose"
                name="VWAP"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            )}
            {visibleSeries.settlement && (
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="settlement"
                name="Settlement"
                stroke="#22c55e"
                strokeWidth={2.4}
                dot={false}
                activeDot={{ r: 4, fill: "#22c55e" }}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GasHistoryTable({ history }: { history: GasContractHistoryPoint[] }) {
  const rows = useMemo(
    () =>
      history
        .filter((point) => point.tradeDate)
        .slice()
        .sort((left, right) => fmtDate(right.tradeDate).localeCompare(fmtDate(left.tradeDate)))
        .slice(0, 120),
    [history],
  );

  if (!rows.length) {
    return (
      <div className="rounded-md border border-gray-800 bg-gray-950/25 px-3 py-8 text-sm text-gray-500">
        No history rows are available.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-800 bg-gray-950/25">
      <div className="flex flex-col gap-1 border-b border-gray-800 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-100">History Values</div>
          <div className="text-xs text-gray-500">Latest {rows.length.toLocaleString()} rows from the selected source symbols.</div>
        </div>
      </div>
      <div className="max-h-[360px] overflow-auto">
        <table className="w-full min-w-[980px] border-collapse text-xs text-gray-200">
          <thead className="sticky top-0 z-10 bg-gray-950 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Trade Date</th>
              <th className="px-3 py-2 text-right font-semibold">Settlement</th>
              <th className="px-3 py-2 text-right font-semibold">VWAP</th>
              <th className="px-3 py-2 text-right font-semibold">Open</th>
              <th className="px-3 py-2 text-right font-semibold">High</th>
              <th className="px-3 py-2 text-right font-semibold">Low</th>
              <th className="px-3 py-2 text-right font-semibold">Close</th>
              <th className="px-3 py-2 text-right font-semibold">Volume</th>
              <th className="px-3 py-2 text-right font-semibold">Open Interest</th>
              <th className="px-3 py-2 text-right font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {rows.map((point) => (
              <tr key={`${point.tradeDate}-${point.updatedAt ?? ""}`} className="hover:bg-gray-900/60">
                <td className="px-3 py-2 font-mono font-semibold text-gray-100">{fmtDate(point.tradeDate)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-200">{fmtPrice(point.settlement)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-sky-200">{fmtPrice(point.vwapClose)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-400">{fmtPrice(point.open)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-400">{fmtPrice(point.high)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-400">{fmtPrice(point.low)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-400">{fmtPrice(point.close)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-300">{fmtVolume(point.volume)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-300">{fmtVolume(point.openInterest)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-500">{fmtDateTime(point.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function GasDailyPrices({
  refreshToken = 0,
  onFreshnessChange,
}: GasDailyPricesProps) {
  const [activeTab, setActiveTab] = useState<GasPricingTab>("matrix");
  const [displayMode, setDisplayMode] = useState<GasMatrixDisplayMode>("price");
  const [showGradient, setShowGradient] = useState(false);
  const [cashBasis, setCashBasis] = useState<GasPriceBasis>(DEFAULT_CASH_BALMO_BASIS);
  const [balmoBasis, setBalmoBasis] = useState<GasPriceBasis>(DEFAULT_CASH_BALMO_BASIS);
  const [quickRegionFilters, setQuickRegionFilters] = useState<GasRegion[]>([]);
  const [data, setData] = useState<DailyGasPricesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedGasCell | null>(null);
  const [selectedInfoRow, setSelectedInfoRow] = useState<DailyGasPriceRow | null>(null);
  const [detailPayload, setDetailPayload] = useState<GasContractHistoryPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [infoHoverCard, setInfoHoverCard] = useState<GasInfoHoverCardState | null>(null);
  const [trendHoverCard, setTrendHoverCard] = useState<GasTrendHoverCardState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const forceRefresh = refreshToken > 0;

    setLoading(true);
    setError(null);

    fetchJsonWithCache<DailyGasPricesPayload>({
      key: buildCacheKey(cashBasis, balmoBasis),
      url: buildGasMatrixApiUrl(forceRefresh, cashBasis, balmoBasis),
      ttlMs: API_TTL_MS,
      signal: controller.signal,
      forceRefresh,
    })
      .then(setData)
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setData(null);
        setError(caught instanceof Error ? caught.message : "Failed to load gas pricing");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [balmoBasis, cashBasis, refreshToken]);

  useEffect(() => {
    const symbols = selectedCell?.row.sourceSymbols[selectedCell.column.key] ?? [];
    if (!selectedCell || symbols.length === 0) {
      setDetailPayload(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("symbols", symbols.join(","));
    if (data?.tradeDate) params.set("endTradeDate", data.tradeDate);
    setDetailLoading(true);
    setDetailError(null);

    fetchJsonWithCache<GasContractHistoryPayload>({
      key: `api:gas-daily-prices:contract:${symbols.join("|")}:${data?.tradeDate ?? "latest"}`,
      url: `/api/gas-daily-prices/contract?${params.toString()}`,
      ttlMs: API_TTL_MS,
      signal: controller.signal,
    })
      .then(setDetailPayload)
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setDetailPayload(null);
        setDetailError(caught instanceof Error ? caught.message : "Failed to load gas contract history");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });

    return () => controller.abort();
  }, [data?.tradeDate, selectedCell]);

  useEffect(() => {
    if (!selectedCell && !selectedInfoRow) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedCell(null);
        setSelectedInfoRow(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCell, selectedInfoRow]);

  const columns = useMemo(() => data?.columns ?? [], [data]);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const henryRow = useMemo(() => rows.find((row) => row.market === "Henry Hub") ?? null, [rows]);
  const quickRegionOptions = useMemo<GasRegionFilterOption[]>(() => {
    const configuredRegions = new Set(rows.map((row) => row.region));
    return [
      { key: "all", label: "All Regions" },
      ...GAS_REGION_ORDER.filter((region) => configuredRegions.has(region)).map((region) => ({
        key: region,
        label: GAS_REGION_LABELS[region],
      })),
    ];
  }, [rows]);

  const displayValueForKey = useMemo(
    () =>
      (row: DailyGasPriceRow, key: string): number | null => {
        const value = row.values[key] ?? null;
        if (value === null) return null;
        if (displayMode === "basisVsHenry") {
          const henryValue = henryRow?.values[key] ?? null;
          return henryValue === null ? null : value - henryValue;
        }
        if (displayMode === "cashSpread") {
          const cashValue = row.values.cash ?? null;
          return cashValue === null ? null : value - cashValue;
        }
        return value;
      },
    [displayMode, henryRow],
  );

  const displayDateForKey = useMemo(
    () =>
      (row: DailyGasPriceRow, key: string): string | null => {
        const valueDate = row.valueDates[key] ?? null;
        if (displayMode === "basisVsHenry") {
          const henryDate = henryRow?.valueDates[key] ?? null;
          if (!valueDate || !henryDate) return valueDate ?? henryDate;
          return valueDate < henryDate ? valueDate : henryDate;
        }
        if (displayMode === "cashSpread") {
          const cashDate = row.valueDates.cash ?? null;
          if (!valueDate || !cashDate) return valueDate ?? cashDate;
          return valueDate < cashDate ? valueDate : cashDate;
        }
        return valueDate;
      },
    [displayMode, henryRow],
  );

  const cashBasisLabel = DAILY_GAS_PRICE_BASIS_LABELS[cashBasis];
  const balmoBasisLabel = DAILY_GAS_PRICE_BASIS_LABELS[balmoBasis];
  const matrixPriceFieldLabel = `Cash ${cashBasisLabel} | BalMo ${balmoBasisLabel} | Contracts Settlement`;
  const matrixValueLabel =
    displayMode === "basisVsHenry"
      ? "Basis vs Henry"
      : displayMode === "cashSpread"
        ? "Cash Spread"
        : matrixPriceFieldLabel;
  const formatMatrixValue = useCallback(
    (value: number | null): string => (displayMode === "price" ? fmtPrice(value) : fmtSpreadPrice(value)),
    [displayMode],
  );

  useEffect(() => {
    if (sortState && sortState.key !== "market" && !columns.some((column) => column.key === sortState.key)) {
      setSortState(null);
    }
  }, [sortState, columns]);

  useEffect(() => {
    const visibleFilterKeys = new Set(["market", ...columns.map((column) => column.key)]);
    setColumnFilters((filters) =>
      Object.fromEntries(Object.entries(filters).filter(([key]) => visibleFilterKeys.has(key))),
    );
  }, [columns]);

  useEffect(() => {
    setColumnFilters((filters) =>
      Object.fromEntries(Object.entries(filters).filter(([key]) => key === "market")),
    );
  }, [displayMode]);

  useEffect(() => {
    const validRegions = new Set(quickRegionOptions.map((option) => option.key));
    setQuickRegionFilters((filters) => filters.filter((key) => validRegions.has(key)));
  }, [quickRegionOptions]);

  const quickFilteredRows = useMemo(() => {
    const selectedRegions = new Set(quickRegionFilters);
    return rows.filter((row) => {
      if (selectedRegions.size > 0 && !selectedRegions.has(row.region)) return false;
      return true;
    });
  }, [quickRegionFilters, rows]);

  const quickFiltersActive = quickRegionFilters.length > 0;

  const filterOptions = useMemo(() => {
    const entries: Array<[string, string[]]> = [
      ["market", [...new Set(quickFilteredRows.map((row) => row.market))].sort(sortFilterOption)],
      ...columns.map((column): [string, string[]] => [
        column.key,
        [...new Set(quickFilteredRows.map((row) => formatMatrixValue(displayValueForKey(row, column.key))).filter((value) => value !== "-"))].sort(
          sortFilterOption,
        ),
      ]),
    ];
    return Object.fromEntries(entries);
  }, [columns, displayValueForKey, formatMatrixValue, quickFilteredRows]);

  const visibleRows = useMemo(() => {
    const activeFilters = Object.entries(columnFilters).filter(([, values]) => values.length > 0);
    const filteredRows =
      activeFilters.length === 0
        ? quickFilteredRows
        : quickFilteredRows.filter((row) =>
            activeFilters.every(([key, values]) =>
              values.includes(filterValueForColumn(row, key, displayValueForKey, formatMatrixValue)),
            ),
          );
    if (!sortState) return filteredRows;
    return [...filteredRows].sort((left, right) => {
      const columnComparison = compareRowsByColumn(
        left,
        right,
        sortState.key,
        sortState.direction,
        displayValueForKey,
      );
      if (columnComparison !== 0) return columnComparison;
      return left.market.localeCompare(right.market);
    });
  }, [columnFilters, displayValueForKey, formatMatrixValue, quickFilteredRows, sortState]);
  const rowGradientDomains = useMemo(() => {
    return new Map(
      visibleRows.map((row) => {
        const values = columns
          .map((column) => displayValueForKey(row, column.key))
          .filter((value): value is number => value !== null && Number.isFinite(value));
        return [
          row.market,
          {
            min: values.length ? Math.min(...values) : Number.NaN,
            max: values.length ? Math.max(...values) : Number.NaN,
          },
        ];
      }),
    );
  }, [columns, displayValueForKey, visibleRows]);
  const selectedValue = selectedCell ? selectedCell.row.values[selectedCell.column.key] ?? null : null;
  const selectedUpdatedAt = selectedCell ? selectedCell.row.updatedAt[selectedCell.column.key] ?? null : null;
  const selectedInfoRows = useMemo<GasSymbolInfoRow[]>(() => {
    if (!selectedInfoRow) return [];

    const cashEntry = getIceGasRegistryEntry(selectedInfoRow.cashSymbol);
    const balmoEntry = getIceGasRegistryEntry(selectedInfoRow.balmoSymbol);
    const curveEntry = getIceGasRegistryEntry(selectedInfoRow.futuresProduct);
    const henryEntry = selectedInfoRow.curveStyle === "basis" ? getIceGasRegistryEntry("HNG") : null;
    const rowsForInfo: GasSymbolInfoRow[] = [
      {
        bucket: "Cash",
        symbol: selectedInfoRow.cashSymbol,
        entry: cashEntry,
        formula: `Cash ${cashBasisLabel}`,
        sourceSymbols: selectedInfoRow.sourceSymbols.cash ?? [selectedInfoRow.cashSymbol],
      },
      {
        bucket: "BalMo",
        symbol: selectedInfoRow.balmoSymbol,
        entry: balmoEntry,
        formula: selectedInfoRow.balmoSymbol ? `BalMo ${balmoBasisLabel}` : "No BalMo configured",
        sourceSymbols: selectedInfoRow.sourceSymbols.balmo ?? (selectedInfoRow.balmoSymbol ? [selectedInfoRow.balmoSymbol] : []),
      },
      {
        bucket: selectedInfoRow.curveStyle === "basis" ? "Curve Basis" : "Curve",
        symbol: selectedInfoRow.futuresProduct,
        entry: curveEntry,
        formula:
          selectedInfoRow.curveStyle === "basis"
            ? `Henry fixed price + ${selectedInfoRow.futuresProduct ?? "basis"} settlement`
            : selectedInfoRow.futuresProduct
              ? "Contract settlement"
              : "No curve configured",
        sourceSymbols: selectedInfoRow.futuresProduct ? [selectedInfoRow.futuresProduct] : [],
      },
    ];

    if (henryEntry) {
      rowsForInfo.push({
        bucket: "Henry Benchmark",
        symbol: "HNG",
        entry: henryEntry,
        formula: "Benchmark fixed-price settlement used for basis curves",
        sourceSymbols: ["HNG"],
      });
    }

    return rowsForInfo;
  }, [balmoBasisLabel, cashBasisLabel, selectedInfoRow]);

  const freshnessTradeDate = data?.tradeDate ?? null;
  const freshnessDataAsOf = data?.metadata.dataAsOf ?? null;
  useEffect(() => {
    if (error) {
      onFreshnessChange?.({
        status: "Error",
        statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
        summary: "Gas pricing unavailable",
        latestDateLabel: freshnessTradeDate ?? "--",
        latestUpdateLabel: fmtDateTime(freshnessDataAsOf),
        fieldLabel: matrixPriceFieldLabel,
        rowCountLabel: data ? `${data.rows.length.toLocaleString()} markets` : "--",
      });
      return;
    }

    onFreshnessChange?.({
      status: freshnessTradeDate ? "Latest" : "Unknown",
      statusClass: freshnessTradeDate
        ? "border-sky-500/40 bg-sky-500/10 text-sky-100"
        : "border-gray-700 bg-gray-950/40 text-gray-400",
      summary: freshnessTradeDate ? `Gas pricing ${freshnessTradeDate}` : "Gas pricing --",
      latestDateLabel: freshnessTradeDate ?? "--",
      latestUpdateLabel: fmtDateTime(freshnessDataAsOf),
      fieldLabel: matrixPriceFieldLabel,
      rowCountLabel: data ? `${data.rows.length.toLocaleString()} markets` : loading ? "Loading" : "--",
    });
  }, [
    data,
    error,
    freshnessDataAsOf,
    freshnessTradeDate,
    loading,
    matrixPriceFieldLabel,
    onFreshnessChange,
  ]);
  const matrixTableWidth =
    MATRIX_INFO_COLUMN_WIDTH +
    MATRIX_MARKET_COLUMN_WIDTH +
    columns.length * MATRIX_PRICE_COLUMN_WIDTH;
  const stickyLeftForColumn = (column: DailyGasCurveColumn): number | undefined => {
    if (column.kind === "cash") return MATRIX_INFO_COLUMN_WIDTH + MATRIX_MARKET_COLUMN_WIDTH;
    if (column.kind === "balmo") {
      return MATRIX_INFO_COLUMN_WIDTH + MATRIX_MARKET_COLUMN_WIDTH + MATRIX_PRICE_COLUMN_WIDTH;
    }
    return undefined;
  };
  const showInfoHoverCard = (
    row: DailyGasPriceRow,
    fullyVerified: boolean,
    element: HTMLElement,
  ) => {
    const rect = element.getBoundingClientRect();
    setInfoHoverCard({
      row,
      fullyVerified,
      top: Math.max(12, rect.top - 10),
      left: Math.max(12, Math.min(window.innerWidth - 340, rect.right + 12)),
    });
  };
  const showTrendHoverCard = (
    row: DailyGasPriceRow,
    column: DailyGasCurveColumn,
    points: DailyGasTrendPoint[],
    element: HTMLElement,
  ) => {
    const numericPoints = numericTrendPoints(points);
    if (numericPoints.length < 2) return;
    const rect = element.getBoundingClientRect();
    const delta = numericPoints.at(-1)!.value - numericPoints[0].value;
    const widthPx = 184;
    const heightPx = 170;
    const left = Math.min(Math.max(8, rect.right - widthPx), window.innerWidth - widthPx - 8);
    const below = rect.bottom + 8;
    const top = below + heightPx > window.innerHeight ? Math.max(8, rect.top - heightPx - 8) : below;
    setTrendHoverCard({
      title: `${row.market} ${column.label}`,
      points: numericPoints,
      delta,
      top,
      left,
    });
  };
  const clearQuickFilters = () => {
    setQuickRegionFilters([]);
  };
  const toggleQuickRegionFilter = (region: GasRegion | "all") => {
    if (region === "all") {
      setQuickRegionFilters([]);
      return;
    }
    setQuickRegionFilters((filters) =>
      filters.includes(region)
        ? filters.filter((value) => value !== region)
        : [...filters, region],
    );
  };
  const switchTab = (tab: GasPricingTab) => {
    setActiveTab(tab);
    setSelectedCell(null);
    setSelectedInfoRow(null);
    setTrendHoverCard(null);
  };
  return (
    <div className="w-full max-w-none space-y-3">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-gray-800 pb-2">
        {[
          { key: "matrix" as const, label: "Gas Pricing Matrix" },
          { key: "monthlySettles" as const, label: "Monthly Settles" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => switchTab(tab.key)}
            aria-pressed={activeTab === tab.key}
            className={`rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
                : "border-gray-800 bg-gray-950/35 text-gray-500 hover:border-gray-700 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "matrix" && (
        <div className="space-y-3">
      <ControlCard title="Matrix Filters">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Filters
            </span>
            <span className="h-px flex-1 bg-gray-800" />
            <span className="text-xs text-gray-500">
              {quickFilteredRows.length.toLocaleString()} / {rows.length.toLocaleString()} markets
            </span>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Region
            </span>
            {quickRegionOptions.map((option) => {
              const active =
                option.key === "all"
                  ? quickRegionFilters.length === 0
                  : quickRegionFilters.includes(option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleQuickRegionFilter(option.key)}
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

          {quickFiltersActive && (
            <button
              type="button"
              onClick={clearQuickFilters}
              className="rounded-full border border-gray-700 bg-transparent px-3 py-1 text-xs font-semibold text-gray-500 transition-all duration-150 hover:border-gray-600 hover:text-gray-300"
            >
              Clear Filters
            </button>
          )}
        </div>
      </ControlCard>

      <DataTableShell
        title="Gas Pricing Matrix"
        subtitle={`${data?.tradeDate ? `Latest ${data.tradeDate}` : "Latest"} | ${matrixValueLabel}`}
        className="w-full max-w-none"
        bodyClassName="max-h-[82vh] w-full overflow-auto"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDisplayMode("price")}
              className={`h-8 rounded-md border px-3 text-xs font-semibold transition-colors ${
                displayMode === "price"
                  ? "border-sky-500/50 bg-sky-500/15 text-sky-100"
                  : "border-gray-700 bg-gray-950 text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              Outright
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("basisVsHenry")}
              className={`h-8 rounded-md border px-3 text-xs font-semibold transition-colors ${
                displayMode === "basisVsHenry"
                  ? "border-sky-500/50 bg-sky-500/15 text-sky-100"
                  : "border-gray-700 bg-gray-950 text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              Basis vs Henry
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("cashSpread")}
              className={`h-8 rounded-md border px-3 text-xs font-semibold transition-colors ${
                displayMode === "cashSpread"
                  ? "border-sky-500/50 bg-sky-500/15 text-sky-100"
                  : "border-gray-700 bg-gray-950 text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              Cash Spread
            </button>
            <button
              type="button"
              onClick={() => setShowGradient((current) => !current)}
              className={`h-8 rounded-md border px-3 text-xs font-semibold transition-colors ${
                showGradient
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100"
                  : "border-gray-700 bg-gray-950 text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              Gradient
            </button>
            <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs text-gray-400">
              {visibleRows.length.toLocaleString()} / {rows.length.toLocaleString()} shown
            </div>
            <button
              type="button"
              onClick={() => {
                clearQuickFilters();
                setColumnFilters({});
                setSortState(null);
                setCashBasis(DEFAULT_CASH_BALMO_BASIS);
                setBalmoBasis(DEFAULT_CASH_BALMO_BASIS);
                setSelectedCell(null);
                setTrendHoverCard(null);
              }}
              className="h-8 rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Reset Table
            </button>
          </div>
        }
      >
          <table
            className="table-fixed border-collapse bg-[#0d1119] text-xs text-gray-200"
            style={{ width: matrixTableWidth }}
          >
            <colgroup>
              <col style={{ width: MATRIX_INFO_COLUMN_WIDTH }} />
              <col style={{ width: MATRIX_MARKET_COLUMN_WIDTH }} />
              {columns.map((column) => (
                <col key={column.key} style={{ width: MATRIX_PRICE_COLUMN_WIDTH }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-30 bg-gray-950">
              <tr>
                <th
                  style={{ left: 0 }}
                  className="sticky left-0 top-0 z-50 whitespace-nowrap bg-gray-950 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-gray-500 shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                >
                  Info
                </th>
                <th
                  style={{ left: MATRIX_INFO_COLUMN_WIDTH }}
                  className="sticky top-0 z-50 whitespace-nowrap bg-gray-950 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSortState({
                          key: "market",
                          direction: sortState?.key === "market" && sortState.direction === "asc" ? "desc" : "asc",
                        })
                      }
                      className={sortState?.key === "market" ? "text-sky-200" : ""}
                      title="Sort Market"
                    >
                      Market {sortState?.key === "market" ? (sortState.direction === "asc" ? "A" : "D") : ""}
                    </button>
                    <ColumnFilterMenu
                      label="Market"
                      options={filterOptions.market ?? EMPTY_FILTER_VALUES}
                      selected={columnFilters.market ?? EMPTY_FILTER_VALUES}
                      sortDirection={sortState?.key === "market" ? sortState.direction : null}
                      onSort={(direction) => setSortState({ key: "market", direction })}
                      onChange={(values) => setColumnFilters((filters) => ({ ...filters, market: values }))}
                    />
                  </div>
                </th>
                {columns.map((column) => {
                  const stickyLeft = stickyLeftForColumn(column);
                  const selectedColumnBasis =
                    column.kind === "cash" ? cashBasis : column.kind === "balmo" ? balmoBasis : null;
                  return (
                    <th
                      key={column.key}
                      style={stickyLeft !== undefined ? { left: stickyLeft } : undefined}
                      className={`border-l border-gray-800 px-1.5 py-2 text-center text-[10px] font-bold text-gray-100 ${
                        column.kind === "month" ? "bg-gray-900" : "bg-gray-950"
                      } ${
                        stickyLeft !== undefined
                          ? `sticky top-0 z-50 ${column.kind === "balmo" ? "shadow-[2px_0_0_rgba(31,41,55,0.9)]" : ""}`
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setSortState({
                              key: column.key,
                              direction: sortState?.key === column.key && sortState.direction === "asc" ? "desc" : "asc",
                            })
                          }
                          className={`whitespace-nowrap ${sortState?.key === column.key ? "text-sky-200" : ""}`}
                          title={`Sort ${column.label}`}
                        >
                          {column.label} {sortState?.key === column.key ? (sortState.direction === "asc" ? "A" : "D") : ""}
                        </button>
                        <ColumnFilterMenu
                          label={column.label}
                          options={filterOptions[column.key] ?? EMPTY_FILTER_VALUES}
                          selected={columnFilters[column.key] ?? EMPTY_FILTER_VALUES}
                          sortDirection={sortState?.key === column.key ? sortState.direction : null}
                          onSort={(direction) => setSortState({ key: column.key, direction })}
                          onChange={(values) =>
                            setColumnFilters((filters) => ({ ...filters, [column.key]: values }))
                          }
                        />
                      </div>
                      {selectedColumnBasis ? (
                        <select
                          aria-label={`${column.label} pricing field`}
                          title={`${column.label} pricing field`}
                          value={selectedColumnBasis}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            const nextBasis = event.target.value as GasPriceBasis;
                            if (column.kind === "cash") setCashBasis(nextBasis);
                            if (column.kind === "balmo") setBalmoBasis(nextBasis);
                            setSelectedCell(null);
                            setTrendHoverCard(null);
                          }}
                          className="mt-1 h-6 w-full rounded border border-gray-700 bg-gray-950 px-1 text-[9px] font-semibold text-gray-300 outline-none transition-colors hover:border-gray-600 focus:border-sky-500 focus:text-gray-100"
                        >
                          {GAS_PRICE_FIELD_OPTIONS.map((option) => (
                            <option key={option.key} value={option.key}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="mt-0.5 text-[9px] font-semibold text-gray-500">
                          {displayMode === "basisVsHenry"
                            ? "vs Henry"
                            : displayMode === "cashSpread"
                              ? "vs Cash"
                              : priceFieldLabel(column, cashBasis, balmoBasis)}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={columns.length + 2 || 30} className="px-3 py-10 text-center text-sm text-gray-500">
                    Loading gas pricing...
                  </td>
                </tr>
              )}
              {!loading &&
                visibleRows.map((row) => {
                  const fullyVerified = hasFullyVerifiedConfiguredSymbols(row);
                  return (
                  <tr key={row.market} className="border-t border-gray-800 hover:bg-gray-900/60">
                    <th className="sticky left-0 z-10 whitespace-nowrap bg-[#0d1119] px-1.5 py-1.5 text-center shadow-[2px_0_0_rgba(31,41,55,0.9)]">
                      <button
                        type="button"
                        onClick={() => {
                          setInfoHoverCard(null);
                          setSelectedInfoRow(row);
                        }}
                        onMouseEnter={(event) => showInfoHoverCard(row, fullyVerified, event.currentTarget)}
                        onMouseLeave={() => setInfoHoverCard(null)}
                        onFocus={(event) => showInfoHoverCard(row, fullyVerified, event.currentTarget)}
                        onBlur={() => setInfoHoverCard(null)}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold transition-colors ${
                          fullyVerified
                            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:border-emerald-300 hover:bg-emerald-500/25"
                            : "border-red-500/50 bg-red-500/15 text-red-100 hover:border-red-300 hover:bg-red-500/25"
                        }`}
                        aria-label={`Show symbols for ${row.market}`}
                      >
                        i
                      </button>
                    </th>
                    <th
                      style={{ left: MATRIX_INFO_COLUMN_WIDTH }}
                      className="sticky z-10 whitespace-nowrap bg-[#0d1119] px-2 py-1.5 text-left shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                    >
                      <div className="truncate font-semibold text-gray-100" title={row.market}>{row.market}</div>
                    </th>
                    {columns.map((column) => {
                      const stickyLeft = stickyLeftForColumn(column);
                      const value = displayValueForKey(row, column.key);
                      const valueDate = displayDateForKey(row, column.key);
                      const sourceSymbol = row.symbols[column.key] ?? undefined;
                      const stale = Boolean(valueDate && data?.tradeDate && valueDate < data.tradeDate);
                      const gradientDomain = rowGradientDomains.get(row.market) ?? { min: Number.NaN, max: Number.NaN };
                      const rawValue = row.values[column.key] ?? null;
                      const rawDate = row.valueDates[column.key] ?? null;
                      const cashValue = row.values.cash ?? null;
                      const henryValue = henryRow?.values[column.key] ?? null;
                      const trendPoints =
                        column.kind === "cash" || column.kind === "balmo"
                          ? row.trends[column.key] ?? []
                          : [];
                      const cellTitle =
                        displayMode === "basisVsHenry"
                          ? `${sourceSymbol ?? column.label}: ${fmtPrice(rawValue)} (${fmtDate(rawDate)}) - Henry ${fmtPrice(henryValue)}`
                          : displayMode === "cashSpread"
                            ? `${sourceSymbol ?? column.label}: ${fmtPrice(rawValue)} (${fmtDate(rawDate)}) - Cash ${fmtPrice(cashValue)}`
                            : sourceSymbol;
                      return (
                        <td
                          key={`${row.market}-${column.key}`}
                          style={{
                            left: stickyLeft,
                            backgroundColor: showGradient
                              ? rowGradientColor(value, gradientDomain.min, gradientDomain.max)
                              : undefined,
                          }}
                          className={`border-l border-gray-800 p-0 ${
                            stickyLeft !== undefined
                              ? `sticky z-10 ${column.kind === "balmo" ? "shadow-[2px_0_0_rgba(31,41,55,0.9)]" : ""}`
                              : ""
                          } ${showGradient ? "" : stickyLeft !== undefined ? "bg-[#0d1119]" : "bg-slate-950/45"}`}
                        >
                          <button
                            type="button"
                            title={cellTitle}
                            onClick={() => setSelectedCell({ row, column })}
                            className="block h-full min-h-[42px] w-full whitespace-nowrap px-1.5 py-1.5 text-right font-mono text-[11px] tabular-nums text-gray-100 transition-colors hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                          >
                            <div className="flex items-center justify-end gap-1 font-semibold">
                              <GasPriceSparkline
                                points={trendPoints}
                                onHover={(element) => showTrendHoverCard(row, column, trendPoints, element)}
                                onLeave={() => setTrendHoverCard(null)}
                              />
                              <span>{formatMatrixValue(value)}</span>
                            </div>
                            <div
                              className={`mt-0.5 text-[9px] font-semibold ${
                                stale ? "text-amber-300" : "text-gray-500"
                              }`}
                              title={stale ? `Stale versus latest ${data?.tradeDate}` : undefined}
                            >
                              {fmtDate(valueDate)}
                            </div>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              {!loading && data && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 2} className="px-3 py-10 text-center text-sm text-gray-500">
                    No gas pricing is available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </DataTableShell>

      {trendHoverCard && (
        <div
          className="pointer-events-none fixed z-[80] min-w-[184px] rounded-md border border-gray-700 bg-gray-950 p-2 text-xs shadow-2xl shadow-black/60"
          style={{ left: trendHoverCard.left, top: trendHoverCard.top }}
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {trendHoverCard.title}
          </div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Last 7 Days ({fmtSpreadPrice(trendHoverCard.delta)})
          </div>
          <div className="space-y-1">
            {[...trendHoverCard.points].reverse().map((point) => (
              <div key={`${point.tradeDate}-${point.value}`} className="flex items-center justify-between gap-4">
                <span className="text-gray-500">{fmtDate(point.tradeDate)}</span>
                <span className="font-semibold text-gray-100">{fmtPrice(point.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {infoHoverCard && (
        <div
          className="pointer-events-none fixed z-[70] w-[340px] rounded-lg border border-sky-900/80 bg-[#101722] p-3 text-xs shadow-2xl shadow-black/60 ring-1 ring-white/[0.03]"
          style={{ top: infoHoverCard.top, left: infoHoverCard.left }}
          role="tooltip"
        >
          <div className="mb-2 truncate text-sm font-semibold text-gray-100">
            {infoHoverCard.row.market}
          </div>
          <div className="space-y-1.5">
            {gasInfoHoverRows(infoHoverCard.row, infoHoverCard.fullyVerified).map((item) => (
              <div
                key={item.label}
                className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 border-t border-gray-800/70 pt-1.5 first:border-t-0 first:pt-0"
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  {item.label}
                </div>
                <div className="min-w-0 truncate font-mono font-semibold text-gray-100" title={item.value}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedInfoRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedInfoRow.market} gas symbols`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedInfoRow(null);
          }}
        >
          <div className="flex max-h-[88vh] w-[min(96vw,1280px)] flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#11141d] shadow-2xl shadow-black/70">
            <div className="flex items-start justify-between gap-3 border-b border-gray-800 bg-[#151820] p-4">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-gray-100">{selectedInfoRow.market} Symbols</div>
                <div className="mt-1 text-xs text-gray-500">
                  {GAS_REGION_LABELS[selectedInfoRow.region]} | Cash, BalMo, and forward curve source symbols
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInfoRow(null)}
                className="rounded-md border border-gray-700 bg-gray-950 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="overflow-auto bg-[#0d1118] p-4">
              <table className="w-full table-auto border-collapse text-xs text-gray-200">
                <thead className="bg-gray-950/80 text-[10px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="w-[110px] px-3 py-2 text-left font-semibold">Bucket</th>
                    <th className="w-[130px] px-3 py-2 text-left font-semibold">Symbol</th>
                    <th className="px-3 py-2 text-left font-semibold">Product</th>
                    <th className="w-[170px] px-3 py-2 text-left font-semibold">ICE Status</th>
                    <th className="w-[190px] px-3 py-2 text-left font-semibold">Source Symbols</th>
                    <th className="w-[260px] px-3 py-2 text-left font-semibold">Formula</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {selectedInfoRows.map((infoRow) => (
                    <tr key={infoRow.bucket}>
                      <td className="px-3 py-2 font-semibold text-gray-100">{infoRow.bucket}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-gray-300">{infoRow.symbol ?? "-"}</td>
                      <td className="px-3 py-2 text-gray-300">
                        <div className="font-semibold text-gray-100">{registryProductText(infoRow.entry)}</div>
                        <div className="mt-0.5 text-[11px] text-gray-500">{registryScreenText(infoRow.entry)}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <div
                          className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${verificationClassName(
                            infoRow.entry,
                          )}`}
                        >
                          {getIceGasVerificationLabel(infoRow.entry)}
                        </div>
                        {infoRow.entry?.ice_product_url && (
                          <a
                            href={infoRow.entry.ice_product_url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-2 text-[11px] font-semibold text-sky-300 hover:text-sky-100"
                          >
                            ICE
                          </a>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-300">
                        {infoRow.sourceSymbols.length ? infoRow.sourceSymbols.join(" + ") : "-"}
                      </td>
                      <td className="px-3 py-2 text-gray-400">{infoRow.formula}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 rounded-md border border-gray-800 bg-gray-950/35 px-3 py-2 text-xs text-gray-500">
                Verified products match ICE&apos;s public product guide. Legacy settlement symbols are kept because they are
                present in the settlement source but absent from the current public ICE product-code CSV.
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedCell && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedCell.row.market} ${selectedCell.column.label} gas detail`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedCell(null);
          }}
        >
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#11141d] shadow-2xl shadow-black/70">
            <div className="flex items-start justify-between gap-3 border-b border-gray-800 bg-[#151820] p-4">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-gray-100">
                  {selectedCell.row.market} | {selectedCell.column.label}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Latest trade date {fmtDate(data?.tradeDate)} | {matrixPriceFieldLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="rounded-md border border-gray-700 bg-gray-950 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 overflow-auto bg-[#0d1118] p-4">
              <div className="grid gap-3 sm:grid-cols-5">
                <div className="rounded-md border border-gray-800 bg-gray-950/35 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Value</p>
                  <p className="mt-2 font-mono text-xl font-semibold text-gray-100">{fmtPrice(selectedValue)}</p>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/35 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Trade Date</p>
                  <p className="mt-2 font-mono text-sm font-semibold text-gray-100">{fmtDate(data?.tradeDate)}</p>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/35 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Region</p>
                  <p className="mt-2 text-sm font-semibold text-gray-100">{GAS_REGION_LABELS[selectedCell.row.region]}</p>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/35 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Updated</p>
                  <p className="mt-2 font-mono text-sm font-semibold text-gray-100">{fmtDateTime(selectedUpdatedAt)}</p>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/35 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">20d Move</p>
                  <p className="mt-2 font-mono text-sm font-semibold text-gray-100">
                    {fmtSigned(detailPayload?.stats.twentyDayMove)}
                  </p>
                </div>
              </div>

              {detailLoading && (
                <div className="rounded-md border border-gray-800 bg-gray-950/25 px-3 py-8 text-sm text-gray-500">
                  Loading history...
                </div>
              )}
              {detailError && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  {detailError}
                </div>
              )}
              {detailPayload && !detailLoading && (
                <>
                  <GasHistoryChart history={detailPayload.history} />
                  <GasHistoryTable history={detailPayload.history} />
                </>
              )}

            </div>
          </div>
        </div>
      )}
        </div>
      )}

      {activeTab === "monthlySettles" && <GasMonthlySettles />}
    </div>
  );
}
