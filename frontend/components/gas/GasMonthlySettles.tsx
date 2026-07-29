"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
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
import {
  DAILY_GAS_MARKETS,
  DAILY_GAS_PRICE_BASIS_LABELS,
  GAS_MONTHLY_FUTURES_DISPLAY_LABELS,
  GAS_MONTHLY_SETTLES_MODE_LABELS,
  GAS_REGION_LABELS,
  GAS_REGION_ORDER,
  type DailyGasMarket,
  type GasMonthlyFuturesDisplay,
  type GasMonthlySettlesCell,
  type GasMonthlySettlesColumn,
  type GasMonthlySettlesMode,
  type GasMonthlySettlesPayload,
  type GasMonthlySettlesRow,
  type GasPriceBasis,
  type GasRegion,
} from "@/lib/gasPricing";

const API_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_START_YEAR = DEFAULT_CURRENT_YEAR - 4;
const DEFAULT_END_YEAR = DEFAULT_CURRENT_YEAR + 2;
const DEFAULT_PRICE_BASIS: GasPriceBasis = "vwap_close";
const DEFAULT_FUTURES_DISPLAY: GasMonthlyFuturesDisplay = "outright";
const TABLE_ROW_HEADER_WIDTH = 64;
const TABLE_YEAR_COLUMN_WIDTH = 96;

interface SelectedMonthlyCell {
  row: GasMonthlySettlesRow;
  column: GasMonthlySettlesColumn;
  cell: GasMonthlySettlesCell;
  payload: GasMonthlySettlesPayload;
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

interface MonthlyChartRow {
  tradeDate: string;
  settlement: number | null;
  vwapClose: number | null;
  volume: number | null;
}

interface MonthlyHistoryTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ payload?: MonthlyChartRow }>;
}

interface MonthlyCellStatus {
  label: string;
  statusClass: string;
  valueClass: string;
  buttonClass: string;
  title?: string;
}

function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `$${value.toFixed(3)}`;
}

function fmtSignedPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  if (value > 0) return `+$${value.toFixed(3)}`;
  if (value < 0) return `-$${Math.abs(value).toFixed(3)}`;
  return "$0.000";
}

function fmtSigned(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const formatted = Math.abs(value).toFixed(3);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function fmtDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "-";
}

function fmtCellDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(2, 4)}`;
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

function pointTypeLabel(pointType: GasMonthlySettlesCell["pointType"]): string {
  if (pointType === "forward") return "Fwd";
  if (pointType === "settled") return "Settle";
  if (pointType === "balmo") return "BalMo";
  return "Cash";
}

function marketCacheToken(market: DailyGasMarket): string {
  return market.market.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function cellValueText(cell: GasMonthlySettlesCell | null | undefined, payload: GasMonthlySettlesPayload | null): string {
  if (!cell) return "-";
  if (payload?.mode === "futures" && payload.futuresDisplay === "basis") return fmtSignedPrice(cell.value);
  return fmtPrice(cell.value);
}

function contractMonthIndex(contractMonth: string | null | undefined): number | null {
  if (!contractMonth || !/^\d{4}-\d{2}-\d{2}$/.test(contractMonth)) return null;
  const year = Number(contractMonth.slice(0, 4));
  const month = Number(contractMonth.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return year * 12 + month;
}

function currentContractMonthIndex(): number {
  const now = new Date();
  return now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;
}

function latestPayloadTradeDate(payload: GasMonthlySettlesPayload | null): string | null {
  if (!payload) return null;
  return (
    payload.rows
      .flatMap((row) => Object.values(row.cells))
      .map((cell) => cell?.tradeDate ?? null)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  );
}

function monthlyCellStatus(
  cell: GasMonthlySettlesCell | null | undefined,
  payload: GasMonthlySettlesPayload | null,
  latestTradeDate: string | null,
): MonthlyCellStatus {
  if (!cell || cell.value === null) {
    return {
      label: "-",
      statusClass: "text-gray-600",
      valueClass: "text-gray-600",
      buttonClass: "border-white/5",
    };
  }

  const contractIndex = contractMonthIndex(cell.contractMonth);
  const settled = contractIndex !== null && contractIndex < currentContractMonthIndex();
  const stale = Boolean(
    !settled &&
      cell.tradeDate &&
      latestTradeDate &&
      cell.tradeDate.slice(0, 10) < latestTradeDate.slice(0, 10),
  );
  const dateText = fmtCellDate(cell.tradeDate);

  if (stale) {
    return {
      label: `Stale ${dateText}`,
      statusClass: "text-amber-200",
      valueClass: "text-amber-100",
      buttonClass: "border-amber-500/25 bg-amber-500/[0.04] hover:border-amber-300/70",
      title: latestTradeDate ? `Stale versus latest ${latestTradeDate.slice(0, 10)}` : undefined,
    };
  }

  if (settled || cell.pointType === "settled") {
    return {
      label: `Settled ${dateText}`,
      statusClass: "text-yellow-200",
      valueClass: "text-gray-100",
      buttonClass: "border-white/5 hover:border-yellow-300/55",
    };
  }

  return {
    label: `${pointTypeLabel(cell.pointType)} ${dateText}`,
    statusClass: "text-cyan-200",
    valueClass: "text-gray-100",
    buttonClass: "border-white/5 hover:border-cyan-400/50",
  };
}

function filterButtonClass(active: boolean): string {
  return `rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
    active
      ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
      : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
  }`;
}

function buildMonthlySettlesUrl({
  mode,
  market,
  priceBasis,
  futuresDisplay,
  startYear,
  endYear,
  refreshToken,
}: {
  mode: GasMonthlySettlesMode;
  market: DailyGasMarket;
  priceBasis: GasPriceBasis;
  futuresDisplay: GasMonthlyFuturesDisplay;
  startYear: number;
  endYear: number;
  refreshToken: number;
}): string {
  const params = new URLSearchParams({
    mode,
    market: market.market,
    startYear: String(Math.min(startYear, endYear)),
    endYear: String(Math.max(startYear, endYear)),
  });
  if (mode === "futures") {
    params.set("futuresDisplay", futuresDisplay);
  } else {
    params.set("priceBasis", priceBasis);
  }
  if (refreshToken > 0) params.set("refresh", String(refreshToken));
  return `/api/gas-daily-prices/monthly-settles?${params.toString()}`;
}

function buildMonthlySettlesCacheKey({
  mode,
  market,
  priceBasis,
  futuresDisplay,
  startYear,
  endYear,
}: {
  mode: GasMonthlySettlesMode;
  market: DailyGasMarket;
  priceBasis: GasPriceBasis;
  futuresDisplay: GasMonthlyFuturesDisplay;
  startYear: number;
  endYear: number;
}): string {
  return [
    "api:gas-monthly-settles:v2",
    mode,
    marketCacheToken(market),
    priceBasis,
    futuresDisplay,
    Math.min(startYear, endYear),
    Math.max(startYear, endYear),
  ].join(":");
}

function tableSubtitle({
  payload,
  mode,
  selectedMarket,
  priceBasis,
  futuresDisplay,
}: {
  payload: GasMonthlySettlesPayload | null;
  mode: GasMonthlySettlesMode;
  selectedMarket: DailyGasMarket;
  priceBasis: GasPriceBasis;
  futuresDisplay: GasMonthlyFuturesDisplay;
}): string {
  const market = payload?.market.market ?? selectedMarket.market;
  const dataAsOf = payload?.metadata.dataAsOf ? `Data as of ${fmtDateTime(payload.metadata.dataAsOf)}` : "Latest available";
  if (mode === "futures") {
    return `${market} | ${GAS_MONTHLY_FUTURES_DISPLAY_LABELS[payload?.futuresDisplay ?? futuresDisplay]} | ${dataAsOf}`;
  }
  return `${market} | Monthly avg ${DAILY_GAS_PRICE_BASIS_LABELS[payload?.priceBasis ?? priceBasis]} | ${dataAsOf}`;
}

function monthBounds(contractMonth: string | null | undefined): { start: string; end: string } | null {
  if (!contractMonth || !/^\d{4}-\d{2}-\d{2}$/.test(contractMonth)) return null;
  const year = Number(contractMonth.slice(0, 4));
  const month = Number(contractMonth.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end,
  };
}

function MonthlyHistoryTooltip({ active, payload, label }: MonthlyHistoryTooltipProps) {
  if (!active) return null;
  const row = payload?.find((item) => item.payload)?.payload;
  if (!row) return null;

  return (
    <div className="rounded-md border border-gray-700 bg-slate-950 px-3 py-2 text-xs shadow-xl shadow-black/40">
      <div className="mb-1 font-mono text-sm text-gray-100">{label}</div>
      <div className="space-y-1">
        <div className="text-emerald-300">Settlement: {fmtPrice(row.settlement)}</div>
        <div className="text-sky-300">VWAP: {fmtPrice(row.vwapClose)}</div>
        <div className="text-blue-300">Volume: {fmtVolume(row.volume)}</div>
      </div>
    </div>
  );
}

function MonthlyHistoryChart({ history }: { history: GasContractHistoryPoint[] }) {
  const chartData = useMemo(
    () =>
      history
        .filter((point) => point.tradeDate)
        .slice(-220)
        .map((point) => ({
          tradeDate: point.tradeDate?.slice(0, 10) ?? "",
          settlement: point.settlement,
          vwapClose: point.vwapClose,
          volume: point.volume,
        })),
    [history],
  );

  if (chartData.length < 2) {
    return (
      <div className="rounded-md border border-gray-800 bg-gray-950/25 px-3 py-8 text-sm text-gray-500">
        Not enough history to chart.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-800 bg-gray-950/25 p-3">
      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold text-gray-100">Settlement, VWAP, and Volume</div>
        <div className="font-mono text-xs text-gray-500">
          {chartData[0].tradeDate} to {chartData.at(-1)?.tradeDate}
        </div>
      </div>
      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: 18, bottom: 12, left: 8 }}>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.14)" vertical={false} />
            <XAxis
              dataKey="tradeDate"
              minTickGap={34}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              yAxisId="price"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              width={58}
              tickFormatter={(value) => fmtPrice(Number(value))}
            />
            <YAxis
              yAxisId="volume"
              orientation="right"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              width={62}
              tickFormatter={(value) => fmtVolume(Number(value))}
            />
            <Tooltip content={<MonthlyHistoryTooltip />} />
            <Bar yAxisId="volume" dataKey="volume" fill="#38bdf8" opacity={0.16} barSize={12} />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="settlement"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="vwapClose"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MonthlyHistoryTable({ history }: { history: GasContractHistoryPoint[] }) {
  const rows = useMemo(() => [...history].reverse().slice(0, 160), [history]);

  return (
    <div className="rounded-md border border-gray-800 bg-gray-950/25">
      <div className="flex flex-col gap-1 border-b border-gray-800 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold text-gray-100">History</div>
        <div className="text-xs text-gray-500">{history.length.toLocaleString()} source rows</div>
      </div>
      <div className="max-h-[320px] overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-xs text-gray-200">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {rows.map((row, index) => (
              <tr key={`${row.tradeDate ?? "missing"}-${index}`}>
                <td className="px-3 py-2 font-mono text-gray-300">{fmtDate(row.tradeDate)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-100">{fmtPrice(row.settlement)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-100">{fmtPrice(row.vwapClose)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-400">{fmtPrice(row.open)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-400">{fmtPrice(row.high)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-400">{fmtPrice(row.low)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-400">{fmtPrice(row.close)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-300">{fmtVolume(row.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthlySettlesTable({
  title,
  mode,
  payload,
  fallbackYears,
  selectedMarket,
  priceBasis,
  futuresDisplay,
  loading,
  onSelectCell,
  className = "",
}: {
  title: string;
  mode: GasMonthlySettlesMode;
  payload: GasMonthlySettlesPayload | null;
  fallbackYears: number[];
  selectedMarket: DailyGasMarket;
  priceBasis: GasPriceBasis;
  futuresDisplay: GasMonthlyFuturesDisplay;
  loading: boolean;
  onSelectCell: (selection: SelectedMonthlyCell) => void;
  className?: string;
}) {
  const fallbackColumns = useMemo(
    () => fallbackYears.map((year) => ({ key: String(year), year, label: String(year) })),
    [fallbackYears],
  );
  const columns = payload?.columns ?? fallbackColumns;
  const rows = payload?.rows ?? [];
  const latestTradeDate = useMemo(() => latestPayloadTradeDate(payload), [payload]);
  const tableMinWidth = TABLE_ROW_HEADER_WIDTH + Math.max(columns.length, 1) * TABLE_YEAR_COLUMN_WIDTH;

  return (
    <DataTableShell
      title={title}
      subtitle={tableSubtitle({
        payload,
        mode,
        selectedMarket,
        priceBasis,
        futuresDisplay,
      })}
      className={`min-w-0 ${className}`}
      bodyClassName="w-full overflow-auto"
      action={
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 font-mono text-gray-400">
            {(payload?.metadata.valueCount ?? 0).toLocaleString()} values
          </span>
          <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 font-mono text-gray-500">
            {(payload?.metadata.missingValueCount ?? 0).toLocaleString()} missing
          </span>
        </div>
      }
    >
      <table
        className="w-full table-fixed border-collapse text-xs text-gray-200"
        style={{ minWidth: tableMinWidth }}
      >
        <colgroup>
          <col style={{ width: TABLE_ROW_HEADER_WIDTH }} />
          {columns.map((column) => (
            <col key={column.key} style={{ width: TABLE_YEAR_COLUMN_WIDTH }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-20 bg-gray-950 text-[10px] uppercase tracking-wider text-gray-500">
          <tr>
            <th className="sticky left-0 z-30 bg-gray-950 px-2 py-2 text-left font-semibold shadow-[2px_0_0_rgba(31,41,55,0.9)]">
              Month
            </th>
            {columns.map((column) => (
              <th key={column.key} className="border-l border-gray-800 px-2 py-2 text-right font-semibold">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={Math.max(2, columns.length + 1)} className="px-3 py-10 text-center text-sm text-gray-500">
                Loading {title.toLowerCase()}...
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row) => (
              <tr key={row.key} className="h-[44px] border-t border-gray-800 bg-[#151820] odd:bg-[#181b23] hover:bg-gray-900/70">
                <th className="sticky left-0 z-10 bg-inherit px-2 py-1 text-left text-sm font-semibold text-gray-100 shadow-[2px_0_0_rgba(31,41,55,0.9)]">
                  {row.label}
                </th>
                {columns.map((column) => {
                  const cell = row.cells[column.key] ?? null;
                  const disabled = !payload || !cell || cell.value === null || cell.sourceSymbols.length === 0;
                  const status = monthlyCellStatus(cell, payload, latestTradeDate);
                  return (
                    <td key={`${row.key}-${column.key}`} className="border-l border-gray-800 p-1">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (!cell || !payload) return;
                          onSelectCell({ row, column, cell, payload });
                        }}
                        title={[cell?.displaySymbol, status.title].filter(Boolean).join(" | ") || undefined}
                        className={`block h-full min-h-[34px] w-full rounded border px-1.5 py-1 text-right transition-colors enabled:hover:bg-white/10 disabled:cursor-default disabled:opacity-45 ${status.buttonClass}`}
                      >
                        <div className={`font-mono text-xs font-semibold leading-tight tabular-nums ${status.valueClass}`}>
                          {cellValueText(cell, payload)}
                        </div>
                        <div className={`mt-0.5 truncate text-[9px] font-semibold leading-tight tabular-nums ${status.statusClass}`}>
                          {status.label}
                        </div>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          {!loading && !rows.length && (
            <tr>
              <td colSpan={Math.max(2, columns.length + 1)} className="px-3 py-10 text-center text-sm text-gray-500">
                No {title.toLowerCase()} returned.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </DataTableShell>
  );
}

export default function GasMonthlySettles() {
  const [marketName, setMarketName] = useState("Henry Hub");
  const [selectedRegion, setSelectedRegion] = useState<GasRegion | "all">("south_central");
  const [refreshToken, setRefreshToken] = useState(0);
  const [payloads, setPayloads] = useState<Partial<Record<GasMonthlySettlesMode, GasMonthlySettlesPayload>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedMonthlyCell | null>(null);
  const [detailPayload, setDetailPayload] = useState<GasContractHistoryPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const selectedMarket = useMemo(
    () => DAILY_GAS_MARKETS.find((market) => market.market === marketName) ?? DAILY_GAS_MARKETS[0],
    [marketName],
  );
  const regionOptions = useMemo<Array<{ key: GasRegion | "all"; label: string }>>(
    () => {
      const configuredRegions = new Set(DAILY_GAS_MARKETS.map((market) => market.region));
      return [
        { key: "all", label: "All Regions" },
        ...GAS_REGION_ORDER.filter((region) => configuredRegions.has(region)).map((region) => ({
          key: region,
          label: GAS_REGION_LABELS[region],
        })),
      ];
    },
    [],
  );
  const visibleMarkets = useMemo(
    () =>
      selectedRegion === "all"
        ? DAILY_GAS_MARKETS
        : DAILY_GAS_MARKETS.filter((market) => market.region === selectedRegion),
    [selectedRegion],
  );
  const orderedYears = useMemo(
    () =>
      Array.from(
        { length: Math.max(0, DEFAULT_END_YEAR - DEFAULT_START_YEAR + 1) },
        (_, index) => DEFAULT_START_YEAR + index,
      ),
    [],
  );

  useEffect(() => {
    if (visibleMarkets.length > 0 && !visibleMarkets.some((market) => market.market === marketName)) {
      setMarketName(visibleMarkets[0].market);
    }
  }, [marketName, visibleMarkets]);

  useEffect(() => {
    const controller = new AbortController();
    const forceRefresh = refreshToken > 0;
    const modes: GasMonthlySettlesMode[] = ["futures", "cash", "balmo"];

    setLoading(true);
    setError(null);
    setSelectedCell(null);

    Promise.all(
      modes.map(async (mode) => {
        const payload = await fetchJsonWithCache<GasMonthlySettlesPayload>({
          key: buildMonthlySettlesCacheKey({
            mode,
            market: selectedMarket,
            priceBasis: DEFAULT_PRICE_BASIS,
            futuresDisplay: DEFAULT_FUTURES_DISPLAY,
            startYear: DEFAULT_START_YEAR,
            endYear: DEFAULT_END_YEAR,
          }),
          url: buildMonthlySettlesUrl({
            mode,
            market: selectedMarket,
            priceBasis: DEFAULT_PRICE_BASIS,
            futuresDisplay: DEFAULT_FUTURES_DISPLAY,
            startYear: DEFAULT_START_YEAR,
            endYear: DEFAULT_END_YEAR,
            refreshToken,
          }),
          ttlMs: API_TTL_MS,
          signal: controller.signal,
          forceRefresh,
          cacheMode: forceRefresh ? "no-store" : "default",
        });
        return [mode, payload] as const;
      }),
    )
      .then((entries) => {
        setPayloads(Object.fromEntries(entries));
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setPayloads({});
        setError(caught instanceof Error ? caught.message : "Failed to load monthly gas settles");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [refreshToken, selectedMarket]);

  useEffect(() => {
    const symbols = selectedCell?.cell.sourceSymbols ?? [];
    if (!selectedCell || symbols.length === 0) {
      setDetailPayload(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    const bounds =
      selectedCell.payload.mode === "cash" || selectedCell.payload.mode === "balmo"
        ? monthBounds(selectedCell.cell.contractMonth)
        : null;
    params.set("symbols", symbols.join(","));
    if (bounds) {
      params.set("startTradeDate", bounds.start);
      params.set("endTradeDate", bounds.end);
    } else if (selectedCell.cell.tradeDate) {
      params.set("endTradeDate", selectedCell.cell.tradeDate);
    }

    setDetailLoading(true);
    setDetailError(null);

    fetchJsonWithCache<GasContractHistoryPayload>({
      key: `api:gas-monthly-settles:contract:${symbols.join("|")}:${bounds?.start ?? "open"}:${bounds?.end ?? selectedCell.cell.tradeDate ?? "latest"}`,
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
  }, [selectedCell]);

  useEffect(() => {
    if (!selectedCell) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedCell(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCell]);

  const selectedSourceText = selectedCell?.cell.sourceSymbols.join(" + ") ?? "-";
  const selectedRegionLabel = selectedRegion === "all" ? "All Regions" : GAS_REGION_LABELS[selectedRegion];
  const filterSubtitle = `${selectedRegionLabel} | ${selectedMarket.market} | ${DEFAULT_START_YEAR}-${DEFAULT_END_YEAR}`;

  return (
    <div className="space-y-3">
      <section className="w-full rounded-lg border border-sky-950/70 bg-[#0d121b] p-3 shadow-xl shadow-black/20 ring-1 ring-white/[0.02] sm:p-4">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
          Monthly Settles Filters
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Filters
            </span>
            <span className="h-px min-w-[80px] flex-1 bg-gray-800" />
            <span className="font-mono text-xs text-gray-500">{filterSubtitle}</span>
            <button
              type="button"
              onClick={() => setRefreshToken((value) => value + 1)}
              className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Refresh
            </button>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Region
            </span>
            {regionOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={selectedRegion === option.key}
                onClick={() => setSelectedRegion(option.key)}
                className={filterButtonClass(selectedRegion === option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-wrap items-start gap-2">
            <span className="pt-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Market
            </span>
            <div className="flex max-h-28 min-w-0 flex-1 flex-wrap gap-2 overflow-y-auto pr-1">
              {visibleMarkets.map((market) => (
                <button
                  key={market.market}
                  type="button"
                  aria-pressed={selectedMarket.market === market.market}
                  onClick={() => {
                    setMarketName(market.market);
                    setSelectedCell(null);
                  }}
                  className={filterButtonClass(selectedMarket.market === market.market)}
                >
                  {market.market}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          {error}
        </div>
      )}

      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        <MonthlySettlesTable
          title="Futures"
          mode="futures"
          payload={payloads.futures ?? null}
          fallbackYears={orderedYears}
          selectedMarket={selectedMarket}
          priceBasis={DEFAULT_PRICE_BASIS}
          futuresDisplay={DEFAULT_FUTURES_DISPLAY}
          loading={loading}
          onSelectCell={setSelectedCell}
        />
        <MonthlySettlesTable
          title="Cash"
          mode="cash"
          payload={payloads.cash ?? null}
          fallbackYears={orderedYears}
          selectedMarket={selectedMarket}
          priceBasis={DEFAULT_PRICE_BASIS}
          futuresDisplay={DEFAULT_FUTURES_DISPLAY}
          loading={loading}
          onSelectCell={setSelectedCell}
        />
        <MonthlySettlesTable
          title="BalMo"
          mode="balmo"
          payload={payloads.balmo ?? null}
          fallbackYears={orderedYears}
          selectedMarket={selectedMarket}
          priceBasis={DEFAULT_PRICE_BASIS}
          futuresDisplay={DEFAULT_FUTURES_DISPLAY}
          loading={loading}
          onSelectCell={setSelectedCell}
        />
      </div>

      {selectedCell && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedCell.payload.market.market} ${selectedCell.row.label} ${selectedCell.column.label} detail`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedCell(null);
          }}
        >
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#11141d] shadow-2xl shadow-black/70">
            <div className="flex items-start justify-between gap-3 border-b border-gray-800 bg-[#151820] p-4">
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold text-gray-100">
                  {selectedCell.payload.market.market} | {GAS_MONTHLY_SETTLES_MODE_LABELS[selectedCell.payload.mode]} | {selectedCell.row.label} {selectedCell.column.label}
                </div>
                <div className="mt-1 truncate text-xs text-gray-500">
                  {selectedSourceText} | {selectedCell.cell.formula}
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
                  <p className="mt-2 font-mono text-xl font-semibold text-gray-100">
                    {cellValueText(selectedCell.cell, selectedCell.payload)}
                  </p>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/35 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Trade Date</p>
                  <p className="mt-2 font-mono text-sm font-semibold text-gray-100">{fmtDate(selectedCell.cell.tradeDate)}</p>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/35 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Volume</p>
                  <p className="mt-2 font-mono text-sm font-semibold text-gray-100">{fmtVolume(selectedCell.cell.volume)}</p>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/35 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Updated</p>
                  <p className="mt-2 font-mono text-sm font-semibold text-gray-100">{fmtDateTime(selectedCell.cell.updatedAt)}</p>
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
                  <MonthlyHistoryChart history={detailPayload.history} />
                  <MonthlyHistoryTable history={detailPayload.history} />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
