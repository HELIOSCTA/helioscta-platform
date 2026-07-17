"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  GAS_REGION_LABELS,
  getIceGasRegistryEntry,
  getIceGasVerificationLabel,
  type DailyGasCurveColumn,
  type DailyGasPriceRow,
  type DailyGasPricesPayload,
  type IceGasRegistryEntry,
} from "@/lib/gasPricing";

const API_TTL_MS = 5 * 60 * 1000;
const EMPTY_FILTER_VALUES: string[] = [];
const PRICE_FIELD_LABEL = "Cash/BalMo VWAP | Contracts Settlement";
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

interface SelectedGasCell {
  row: DailyGasPriceRow;
  column: DailyGasCurveColumn;
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

function buildGasMatrixApiUrl(refresh: boolean): string {
  const params = new URLSearchParams();
  if (refresh) params.set("refresh", "1");
  const query = params.toString();
  return query ? `/api/gas-daily-prices?${query}` : "/api/gas-daily-prices";
}

function buildCacheKey(): string {
  return "api:gas-daily-prices:v10:latest-mixed-fields";
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

function priceFieldLabel(column: DailyGasCurveColumn): string {
  return column.kind === "cash" || column.kind === "balmo" ? "VWAP" : "Settlement";
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

export default function GasDailyPrices() {
  const infoHeaderRef = useRef<HTMLTableCellElement | null>(null);
  const regionHeaderRef = useRef<HTMLTableCellElement | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [infoColumnWidth, setInfoColumnWidth] = useState(42);
  const [regionColumnWidth, setRegionColumnWidth] = useState(96);
  const [freshnessOpen, setFreshnessOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<GasMatrixDisplayMode>("price");
  const [showGradient, setShowGradient] = useState(false);
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

  useEffect(() => {
    const controller = new AbortController();
    const forceRefresh = refreshToken > 0;

    setLoading(true);
    setError(null);

    fetchJsonWithCache<DailyGasPricesPayload>({
      key: buildCacheKey(),
      url: buildGasMatrixApiUrl(forceRefresh),
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
  }, [refreshToken]);

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
      key: `api:gas-daily-prices:contract:v2:${symbols.join("|")}:${data?.tradeDate ?? "latest"}`,
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

  const matrixValueLabel =
    displayMode === "basisVsHenry"
      ? "Basis vs Henry"
      : displayMode === "cashSpread"
        ? "Cash Spread"
        : PRICE_FIELD_LABEL;
  const formatMatrixValue = useCallback(
    (value: number | null): string => (displayMode === "price" ? fmtPrice(value) : fmtSpreadPrice(value)),
    [displayMode],
  );

  useEffect(() => {
    if (sortState && sortState.key !== "region" && sortState.key !== "market" && !columns.some((column) => column.key === sortState.key)) {
      setSortState(null);
    }
  }, [sortState, columns]);

  useEffect(() => {
    const visibleFilterKeys = new Set(["region", "market", ...columns.map((column) => column.key)]);
    setColumnFilters((filters) =>
      Object.fromEntries(Object.entries(filters).filter(([key]) => visibleFilterKeys.has(key))),
    );
  }, [columns]);

  useEffect(() => {
    setColumnFilters((filters) =>
      Object.fromEntries(Object.entries(filters).filter(([key]) => key === "region" || key === "market")),
    );
  }, [displayMode]);

  const filterOptions = useMemo(() => {
    const entries: Array<[string, string[]]> = [
      [
        "region",
        [...new Set(rows.map((row) => GAS_REGION_LABELS[row.region]))].sort(sortFilterOption),
      ],
      ["market", [...new Set(rows.map((row) => row.market))].sort(sortFilterOption)],
      ...columns.map((column): [string, string[]] => [
        column.key,
        [...new Set(rows.map((row) => formatMatrixValue(displayValueForKey(row, column.key))).filter((value) => value !== "-"))].sort(
          sortFilterOption,
        ),
      ]),
    ];
    return Object.fromEntries(entries);
  }, [columns, displayValueForKey, formatMatrixValue, rows]);

  const visibleRows = useMemo(() => {
    const activeFilters = Object.entries(columnFilters).filter(([, values]) => values.length > 0);
    const filteredRows =
      activeFilters.length === 0
        ? rows
        : rows.filter((row) =>
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
  }, [columnFilters, displayValueForKey, formatMatrixValue, rows, sortState]);
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
        formula: "Cash VWAP",
        sourceSymbols: selectedInfoRow.sourceSymbols.cash ?? [selectedInfoRow.cashSymbol],
      },
      {
        bucket: "BalMo",
        symbol: selectedInfoRow.balmoSymbol,
        entry: balmoEntry,
        formula: selectedInfoRow.balmoSymbol ? "BalMo VWAP" : "No BalMo configured",
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
  }, [selectedInfoRow]);

  useEffect(() => {
    const infoElement = infoHeaderRef.current;
    const regionElement = regionHeaderRef.current;
    if (!infoElement || !regionElement) return;

    const updateWidth = () => {
      const infoMeasured = Math.ceil(infoElement.getBoundingClientRect().width);
      const regionMeasured = Math.ceil(regionElement.getBoundingClientRect().width);
      if (infoMeasured > 0) setInfoColumnWidth(infoMeasured);
      if (regionMeasured > 0) setRegionColumnWidth(regionMeasured);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(infoElement);
    observer.observe(regionElement);
    return () => observer.disconnect();
  }, [visibleRows.length]);

  return (
    <div className="relative w-full max-w-none space-y-3 pt-16">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="absolute right-0 top-0 flex justify-end">
        <div className="w-fit max-w-full rounded-lg border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20">
          <div className="flex w-full min-w-0 items-center justify-between gap-3 px-3 py-2">
            <button
              type="button"
              onClick={() => setFreshnessOpen((open) => !open)}
              className="min-w-0 flex-1 text-left transition-colors"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Freshness
                  </span>
                  <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-100">
                    {data?.tradeDate ? "Latest" : "Unknown"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-gray-500">
                  {data?.tradeDate ? `Gas pricing ${data.tradeDate}` : "Gas pricing --"}
                </p>
              </div>
            </button>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setRefreshToken((value) => value + 1)}
                className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setFreshnessOpen((open) => !open)}
                className="text-xs text-gray-500 transition-colors hover:text-gray-300"
              >
                {freshnessOpen ? "Hide v" : "Show >"}
              </button>
            </div>
          </div>
          {freshnessOpen && (
            <div className="flex min-w-0 flex-wrap items-stretch gap-2 border-t border-gray-800 p-2">
              <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Latest Trade</p>
                <p className="mt-1 text-sm font-semibold break-words text-gray-200">{data?.tradeDate ?? "--"}</p>
              </div>
              <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Fields</p>
                <p className="mt-1 text-sm font-semibold break-words text-gray-200">{PRICE_FIELD_LABEL}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <DataTableShell
        title="Gas Pricing Matrix"
        subtitle={`${data?.tradeDate ? `Latest ${data.tradeDate}` : "Latest"} | ${matrixValueLabel}`}
        className="mx-auto w-fit max-w-full"
        bodyClassName="max-h-[82vh] overflow-auto"
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
                setColumnFilters({});
                setSortState(null);
              }}
              className="h-8 rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Reset Table
            </button>
          </div>
        }
      >
          <table className="mx-auto w-max table-auto border-collapse bg-[#0d1119] text-xs text-gray-200">
            <thead className="sticky top-0 z-30 bg-gray-950">
              <tr>
                <th
                  ref={infoHeaderRef}
                  className="sticky left-0 top-0 z-50 whitespace-nowrap bg-gray-950 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-gray-500 shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                >
                  Info
                </th>
                <th
                  ref={regionHeaderRef}
                  style={{ left: infoColumnWidth }}
                  className="sticky top-0 z-50 whitespace-nowrap bg-gray-950 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSortState({
                          key: "region",
                          direction: sortState?.key === "region" && sortState.direction === "asc" ? "desc" : "asc",
                        })
                      }
                      className={sortState?.key === "region" ? "text-sky-200" : ""}
                      title="Sort Region"
                    >
                      Region {sortState?.key === "region" ? (sortState.direction === "asc" ? "A" : "D") : ""}
                    </button>
                    <ColumnFilterMenu
                      label="Region"
                      options={filterOptions.region ?? EMPTY_FILTER_VALUES}
                      selected={columnFilters.region ?? EMPTY_FILTER_VALUES}
                      sortDirection={sortState?.key === "region" ? sortState.direction : null}
                      onSort={(direction) => setSortState({ key: "region", direction })}
                      onChange={(values) => setColumnFilters((filters) => ({ ...filters, region: values }))}
                    />
                  </div>
                </th>
                <th
                  style={{ left: infoColumnWidth + regionColumnWidth }}
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
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={`border-l border-gray-800 px-1.5 py-2 text-center text-[10px] font-bold text-gray-100 ${
                      column.kind === "month" ? "bg-gray-900" : "bg-gray-950"
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
                    <div className="mt-0.5 text-[9px] font-semibold text-gray-500">
                      {displayMode === "basisVsHenry"
                        ? "vs Henry"
                        : displayMode === "cashSpread"
                          ? "vs Cash"
                          : priceFieldLabel(column)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={columns.length + 3 || 30} className="px-3 py-10 text-center text-sm text-gray-500">
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
                        onClick={() => setSelectedInfoRow(row)}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold transition-colors ${
                          fullyVerified
                            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:border-emerald-300 hover:bg-emerald-500/25"
                            : "border-red-500/50 bg-red-500/15 text-red-100 hover:border-red-300 hover:bg-red-500/25"
                        }`}
                        title={`${row.market}: ${
                          fullyVerified ? "all configured symbols verified" : "one or more configured symbols need review"
                        }`}
                        aria-label={`Show symbols for ${row.market}`}
                      >
                        i
                      </button>
                    </th>
                    <th
                      style={{ left: infoColumnWidth }}
                      className="sticky z-10 whitespace-nowrap bg-[#0d1119] px-2 py-1.5 text-left text-[11px] font-semibold text-red-300 shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                    >
                      {GAS_REGION_LABELS[row.region]}
                    </th>
                    <th
                      style={{ left: infoColumnWidth + regionColumnWidth }}
                      className="sticky z-10 whitespace-nowrap bg-[#0d1119] px-2 py-1.5 text-left shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                    >
                      <div className="truncate font-semibold text-gray-100" title={row.market}>{row.market}</div>
                    </th>
                    {columns.map((column) => {
                      const value = displayValueForKey(row, column.key);
                      const valueDate = displayDateForKey(row, column.key);
                      const sourceSymbol = row.symbols[column.key] ?? undefined;
                      const stale = Boolean(valueDate && data?.tradeDate && valueDate < data.tradeDate);
                      const gradientDomain = rowGradientDomains.get(row.market) ?? { min: Number.NaN, max: Number.NaN };
                      const rawValue = row.values[column.key] ?? null;
                      const rawDate = row.valueDates[column.key] ?? null;
                      const cashValue = row.values.cash ?? null;
                      const henryValue = henryRow?.values[column.key] ?? null;
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
                            backgroundColor: showGradient
                              ? rowGradientColor(value, gradientDomain.min, gradientDomain.max)
                              : undefined,
                          }}
                          className={`border-l border-gray-800 p-0 ${showGradient ? "" : "bg-slate-950/45"}`}
                        >
                          <button
                            type="button"
                            title={cellTitle}
                            onClick={() => setSelectedCell({ row, column })}
                            className="block h-full min-h-[42px] w-full whitespace-nowrap px-1.5 py-1.5 text-right font-mono text-[11px] tabular-nums text-gray-100 transition-colors hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                          >
                            <div className="font-semibold">{formatMatrixValue(value)}</div>
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
                  <td colSpan={columns.length + 3} className="px-3 py-10 text-center text-sm text-gray-500">
                    No gas pricing is available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </DataTableShell>

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
                  Latest trade date {fmtDate(data?.tradeDate)} | {PRICE_FIELD_LABEL}
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
  );
}
