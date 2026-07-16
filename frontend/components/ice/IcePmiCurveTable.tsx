"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  Brush,
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

interface PriorSettlementPoint {
  contractYear: number | null;
  pointType?: "settlement" | "forward" | null;
  symbol: string | null;
  finalTradeDate: string | null;
  settlement: number | null;
  volume: number | null;
}

interface TrendPoint {
  date: string | null;
  value: number | null;
}

interface IcePmiCurveRow {
  strip: string;
  stripOrder: number;
  currentSymbol: string | null;
  priceTrend?: TrendPoint[];
  volumeTrend?: TrendPoint[];
  cal27Symbol?: string | null;
  cal27PriceTrend?: TrendPoint[];
  cal27VolumeTrend?: TrendPoint[];
  cal28Symbol?: string | null;
  cal28PriceTrend?: TrendPoint[];
  cal28VolumeTrend?: TrendPoint[];
  monthCurvePoints: PriorSettlementPoint[];
}

interface IcePmiCurvePayload {
  product: "PMI";
  source: string;
  dataAsOf: string | null;
  rows: IcePmiCurveRow[];
}

interface ContractHistoryPoint {
  tradeDate: string | null;
  settlement: number | null;
  volume: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  openInterest?: number | null;
}

interface ContractHistoryPayload {
  product: "PMI";
  symbol: string;
  source: string;
  rowCount: number;
  dataAsOf: string | null;
  history: ContractHistoryPoint[];
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

interface MatrixCell {
  point: PriorSettlementPoint | null;
  scan: ActiveScan | null;
}

interface SelectedContract {
  strip: string;
  year: number;
  point: PriorSettlementPoint;
}

interface ActiveScan {
  priceMove: number | null;
  priceMovePct: number | null;
  latestVolume: number | null;
  avgVolume: number | null;
  attentionScore: number | null;
  isHighVolume: boolean;
  isBigMove: boolean;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;

function fmtDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "-";
}

function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function fmtVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtSigned(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const formatted = Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function finiteTrendValues(points: TrendPoint[] | undefined): number[] {
  return (points ?? [])
    .map((point) => point.value)
    .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
}

function percentile(values: number[], ratio: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function buildActiveScan(
  priceTrend: TrendPoint[] | undefined,
  volumeTrend: TrendPoint[] | undefined,
): Omit<ActiveScan, "attentionScore" | "isHighVolume" | "isBigMove"> {
  const prices = finiteTrendValues(priceTrend);
  const volumes = finiteTrendValues(volumeTrend);
  const firstPrice = prices.at(0) ?? null;
  const latestPrice = prices.at(-1) ?? null;
  const priceMove = firstPrice !== null && latestPrice !== null ? latestPrice - firstPrice : null;
  const priceMovePct =
    priceMove !== null && firstPrice !== null && firstPrice !== 0 ? priceMove / firstPrice : null;
  const latestVolume = volumes.at(-1) ?? null;
  const avgVolume =
    volumes.length > 0 ? volumes.reduce((sum, value) => sum + value, 0) / volumes.length : null;

  return { priceMove, priceMovePct, latestVolume, avgVolume };
}

function activeAttentionBorder(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return "rgba(34, 197, 94, 0.18)";
  const clamped = Math.max(0, Math.min(1, score));
  const alpha = 0.18 + clamped * 0.52;
  return `rgba(34, 197, 94, ${alpha.toFixed(2)})`;
}

function activeAttentionBackground(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return "rgba(34, 197, 94, 0.08)";
  const clamped = Math.max(0, Math.min(1, score));
  const alpha = 0.08 + clamped * 0.24;
  return `rgba(34, 197, 94, ${alpha.toFixed(2)})`;
}

function isActiveForwardPoint(point: PriorSettlementPoint | null, dataAsOf: string | null | undefined): boolean {
  return (
    point?.pointType === "forward" &&
    point.finalTradeDate !== null &&
    dataAsOf !== null &&
    dataAsOf !== undefined &&
    point.finalTradeDate.slice(0, 10) === dataAsOf.slice(0, 10)
  );
}

function pointTypeLabel(point: PriorSettlementPoint | null, dataAsOf: string | null | undefined): string {
  if (!point) return "-";
  if (isActiveForwardPoint(point, dataAsOf)) return "Fwd";
  return point.pointType === "forward" ? "Settled" : "Settle";
}

function ContractCombinedChart({ history }: { history: ContractHistoryPoint[] }) {
  const [focused, setFocused] = useState(false);
  const [visibleSeries, setVisibleSeries] = useState({
    settlement: true,
    volume: true,
    openInterest: true,
  });
  const chartData = history
    .filter((point) => point.tradeDate && point.settlement !== null)
    .map((point) => ({
      tradeDate: fmtDate(point.tradeDate),
      settlement: point.settlement,
      volume: point.volume,
      openInterest: point.openInterest ?? null,
    }));
  const hasOpenInterest = chartData.some(
    (point) => point.openInterest !== null && Number.isFinite(point.openInterest),
  );

  if (chartData.length < 2) {
    return <div className="px-3 py-8 text-sm text-gray-500">Not enough history to chart.</div>;
  }

  const legendItems = [
    { key: "settlement", label: "Settlement", color: "#22c55e", available: true },
    { key: "volume", label: "Volume", color: "#38bdf8", available: true },
    { key: "openInterest", label: "Open Interest", color: "#f59e0b", available: hasOpenInterest },
  ] as const;

  return (
    <div className="rounded-md border border-gray-800 bg-gray-950/25 p-3">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-100">Settlement, Volume, and Open Interest</div>
          <div className="text-xs text-gray-500">
            Settlement price, daily volume bars, optional open interest, and zoom brush.
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
      <div className="mb-2 flex flex-wrap gap-2">
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
            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 6,
                color: "#e5e7eb",
              }}
              labelStyle={{ color: "#cbd5e1" }}
              formatter={(value, name) => {
                const numeric = Number(value);
                const label = String(name);
                if (label === "volume" || label === "openInterest") return [fmtVolume(numeric), label];
                return [fmtPrice(numeric), label];
              }}
            />
            {visibleSeries.volume && (
              <Bar
                yAxisId="activity"
                dataKey="volume"
                name="Volume"
                fill="#38bdf8"
                fillOpacity={0.42}
                maxBarSize={10}
              />
            )}
            {hasOpenInterest && visibleSeries.openInterest && (
              <Line
                yAxisId="activity"
                type="monotone"
                dataKey="openInterest"
                name="Open Interest"
                stroke="#f59e0b"
                strokeWidth={1.8}
                dot={false}
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
              />
            )}
            <Brush
              dataKey="tradeDate"
              height={28}
              travellerWidth={8}
              stroke="#38bdf8"
              fill="#111827"
              tickFormatter={(value) => String(value).slice(5)}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {!hasOpenInterest && (
        <div className="mt-2 text-xs text-amber-200">
          Open interest is not available for this contract history window.
        </div>
      )}
    </div>
  );
}

export default function IcePmiCurveTable() {
  const [payload, setPayload] = useState<IcePmiCurvePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lookbackDays, setLookbackDays] = useState(7);
  const [selectedContract, setSelectedContract] = useState<SelectedContract | null>(null);
  const [contractPayload, setContractPayload] = useState<ContractHistoryPayload | null>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);

  const apiUrl = useMemo(
    () => `/api/ice-pmi-curve?currentYear=2026&endYear=2028&tradingDays=${lookbackDays}&priorYears=5`,
    [lookbackDays],
  );
  const cacheKey = useMemo(
    () => `api:ice-pmi-curve:2026:2028:${lookbackDays}:5`,
    [lookbackDays],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchJsonWithCache<IcePmiCurvePayload>({
      key: cacheKey,
      url: apiUrl,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
    })
      .then(setPayload)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load ICE PMI curve");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [apiUrl, cacheKey]);

  useEffect(() => {
    if (!selectedContract?.point.symbol) {
      setContractPayload(null);
      return;
    }

    const controller = new AbortController();
    const symbol = selectedContract.point.symbol;
    setContractLoading(true);
    setContractError(null);

    fetchJsonWithCache<ContractHistoryPayload>({
      key: `api:ice-pmi-contract:${symbol}`,
      url: `/api/ice-pmi-curve/contract?symbol=${encodeURIComponent(symbol)}`,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
    })
      .then(setContractPayload)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setContractError(err instanceof Error ? err.message : "Failed to load contract history");
      })
      .finally(() => {
        if (!controller.signal.aborted) setContractLoading(false);
      });

    return () => controller.abort();
  }, [selectedContract]);

  const matrixYears = useMemo(() => {
    const years = new Set<number>();
    for (const row of payload?.rows ?? []) {
      for (const point of row.monthCurvePoints) {
        if (point.contractYear !== null && Number.isFinite(point.contractYear)) {
          years.add(point.contractYear);
        }
      }
    }
    return [...years].sort((a, b) => a - b);
  }, [payload?.rows]);

  const matrixRows = useMemo(() => {
    const baseRows = [...(payload?.rows ?? [])]
      .sort((a, b) => a.stripOrder - b.stripOrder)
      .map((row) => {
        const pointsByYear = new Map<number, PriorSettlementPoint>();
        for (const point of row.monthCurvePoints) {
          if (point.contractYear !== null && Number.isFinite(point.contractYear)) {
            pointsByYear.set(point.contractYear, point);
          }
        }

        const cells = new Map<number, MatrixCell>();
        for (const year of matrixYears) {
          const point = pointsByYear.get(year) ?? null;
          let scan: ActiveScan | null = null;

          if (isActiveForwardPoint(point, payload?.dataAsOf) && point?.symbol) {
            if (point.symbol === row.currentSymbol) {
              scan = {
                ...buildActiveScan(row.priceTrend, row.volumeTrend),
                attentionScore: null,
                isHighVolume: false,
                isBigMove: false,
              };
            } else if (point.symbol === row.cal27Symbol) {
              scan = {
                ...buildActiveScan(row.cal27PriceTrend, row.cal27VolumeTrend),
                attentionScore: null,
                isHighVolume: false,
                isBigMove: false,
              };
            } else if (point.symbol === row.cal28Symbol) {
              scan = {
                ...buildActiveScan(row.cal28PriceTrend, row.cal28VolumeTrend),
                attentionScore: null,
                isHighVolume: false,
                isBigMove: false,
              };
            }
          }

          cells.set(year, { point, scan });
        }

        return {
          strip: row.strip,
          stripOrder: row.stripOrder,
          cells,
          points: row.monthCurvePoints,
        };
      });

    const activeScans = baseRows.flatMap((row) =>
      matrixYears.map((year) => row.cells.get(year)?.scan ?? null),
    );
    const highVolumeThreshold = percentile(
      activeScans
        .map((scan) => scan?.latestVolume ?? null)
        .filter((value): value is number => value !== null && Number.isFinite(value)),
      0.75,
    );
    const maxVolume = Math.max(
      0,
      ...activeScans
        .map((scan) => scan?.latestVolume ?? null)
        .filter((value): value is number => value !== null && Number.isFinite(value)),
    );
    const bigMoveThreshold = percentile(
      activeScans
        .map((scan) => (scan?.priceMove === null || scan?.priceMove === undefined ? null : Math.abs(scan.priceMove)))
        .filter((value): value is number => value !== null && Number.isFinite(value)),
      0.75,
    );
    const maxAbsMove = Math.max(
      0,
      ...activeScans
        .map((scan) => (scan?.priceMove === null || scan?.priceMove === undefined ? null : Math.abs(scan.priceMove)))
        .filter((value): value is number => value !== null && Number.isFinite(value)),
    );

    for (const row of baseRows) {
      for (const year of matrixYears) {
        const cell = row.cells.get(year);
        if (!cell?.scan) continue;
        cell.scan.isHighVolume =
          highVolumeThreshold !== null &&
          cell.scan.latestVolume !== null &&
          cell.scan.latestVolume >= highVolumeThreshold;
        cell.scan.isBigMove =
          bigMoveThreshold !== null &&
          cell.scan.priceMove !== null &&
          Math.abs(cell.scan.priceMove) >= bigMoveThreshold;
        const volumeScore =
          maxVolume > 0 && cell.scan.latestVolume !== null ? cell.scan.latestVolume / maxVolume : 0;
        const moveScore =
          maxAbsMove > 0 && cell.scan.priceMove !== null ? Math.abs(cell.scan.priceMove) / maxAbsMove : 0;
        cell.scan.attentionScore = (volumeScore + moveScore) / 2;
      }
    }

    return baseRows;
  }, [matrixYears, payload?.dataAsOf, payload?.rows]);

  const selectedSameMonthPoints = useMemo(() => {
    if (!selectedContract) return [];
    return (
      matrixRows
        .find((row) => row.strip === selectedContract.strip)
        ?.points.filter((point) => point.contractYear !== null)
        .sort((a, b) => (a.contractYear ?? 0) - (b.contractYear ?? 0)) ?? []
    );
  }, [matrixRows, selectedContract]);

  const activeSymbol = selectedContract?.point.symbol;

  useEffect(() => {
    if (!selectedContract) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedContract(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedContract]);

  return (
    <div className="space-y-4">
      <DataTableShell
        title="PMI Month x Year"
        subtitle={`Cells with Vol or Move badges shade green by ${lookbackDays}-day move plus volume; settled contracts stay neutral`}
        action={
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <span>Lookback</span>
            <select
              value={lookbackDays}
              onChange={(event) => setLookbackDays(Number(event.target.value))}
              className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-xs font-semibold text-gray-100 outline-none focus:border-cyan-400"
            >
              <option value={5}>5 days</option>
              <option value={7}>7 days</option>
              <option value={10}>10 days</option>
              <option value={14}>14 days</option>
              <option value={20}>20 days</option>
            </select>
          </label>
        }
        bodyClassName="border-gray-800"
      >
        <table className="w-max min-w-full table-fixed border-collapse text-xs text-gray-200">
          <thead className="bg-gray-950/60 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="sticky left-0 z-20 w-[64px] bg-gray-950 px-2 py-1.5 text-left font-semibold">
                Month
              </th>
              {matrixYears.map((year) => (
                <th key={year} className="w-[96px] px-2 py-1.5 text-right font-semibold">
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading && (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={Math.max(2, matrixYears.length + 1)}>
                  Loading ICE PMI matrix...
                </td>
              </tr>
            )}
            {!loading && matrixRows.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={Math.max(2, matrixYears.length + 1)}>
                  No PMI matrix rows returned.
                </td>
              </tr>
            )}
            {!loading &&
              matrixRows.map((row) => (
                <tr key={row.strip} className="bg-[#151820] odd:bg-[#181b23]">
                  <th className="sticky left-0 z-10 bg-inherit px-2 py-1 text-left text-sm font-semibold text-gray-100">
                    {row.strip}
                  </th>
                  {matrixYears.map((year) => {
                    const cell = row.cells.get(year) ?? { point: null, scan: null };
                    const selected = activeSymbol && cell.point?.symbol === activeSymbol;
                    const pointLabel = pointTypeLabel(cell.point, payload?.dataAsOf);
                    const activeForward = isActiveForwardPoint(cell.point, payload?.dataAsOf);
                    const attentionWorthy = Boolean(cell.scan?.isHighVolume || cell.scan?.isBigMove);
                    const statusClass = activeForward
                      ? "text-cyan-200"
                      : cell.point
                        ? "text-yellow-200"
                        : "text-gray-500";
                    const moveTone =
                      (cell.scan?.priceMove ?? 0) > 0
                        ? "text-emerald-200"
                        : (cell.scan?.priceMove ?? 0) < 0
                          ? "text-red-200"
                          : "text-gray-400";
                    return (
                      <td key={`${row.strip}-${year}`} className="px-1 py-0.5 align-top">
                        <button
                          type="button"
                          disabled={!cell.point?.symbol}
                          onClick={() => {
                            if (!cell.point?.symbol) return;
                            setSelectedContract({ strip: row.strip, year, point: cell.point });
                          }}
                          className={`min-h-[42px] w-full rounded border px-1.5 py-1 text-right transition-colors disabled:cursor-not-allowed ${
                            selected
                              ? "border-cyan-300 shadow-[0_0_0_1px_rgba(34,211,238,0.55)]"
                              : attentionWorthy
                                ? "hover:border-green-300"
                                : "border-white/5 hover:border-cyan-400/50"
                          }`}
                          style={{
                            borderColor:
                              !selected && attentionWorthy && cell.scan
                                ? activeAttentionBorder(cell.scan.attentionScore)
                                : undefined,
                            backgroundColor:
                              !selected && attentionWorthy && cell.scan
                                ? activeAttentionBackground(cell.scan.attentionScore)
                                : undefined,
                          }}
                        >
                          <div className="text-xs font-semibold leading-tight tabular-nums text-gray-100">
                            {fmtPrice(cell.point?.settlement)}
                          </div>
                          <div className={`text-[9px] font-semibold leading-tight tabular-nums ${statusClass}`}>
                            {cell.point ? `${pointLabel} ${fmtDate(cell.point.finalTradeDate)}` : "-"}
                          </div>
                          {cell.scan ? (
                            <div className={`text-[9px] font-semibold leading-tight tabular-nums ${moveTone}`}>
                              {lookbackDays}d {fmtSigned(cell.scan.priceMove)} · V {fmtVolume(cell.scan.latestVolume)}
                              {cell.scan.isHighVolume && <span className="ml-1 text-cyan-100">Vol</span>}
                              {cell.scan.isBigMove && <span className="ml-1 text-amber-100">Move</span>}
                            </div>
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </DataTableShell>

      {error && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {error}
        </div>
      )}

      {selectedContract && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedContract.strip} ${selectedContract.year} contract detail`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedContract(null);
          }}
        >
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#11141d] shadow-2xl shadow-black/70">
            <div className="flex flex-col gap-3 border-b border-gray-800 bg-[#151820] p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-gray-100">
                  {selectedContract.strip} {selectedContract.year} Detail
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {selectedContract.point.symbol} |{" "}
                  {isActiveForwardPoint(selectedContract.point, payload?.dataAsOf)
                    ? "active forward mark"
                    : selectedContract.point.pointType === "forward"
                      ? "settled contract"
                      : "settled contract"}{" "}
                  | latest mark{" "}
                  {fmtDate(selectedContract.point.finalTradeDate)}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedContract(null)}
                  className="rounded-md border border-gray-700 bg-gray-950 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="overflow-auto">
              {contractLoading && (
                <div className="px-4 py-10 text-sm text-gray-500">Loading contract history...</div>
              )}
              {contractError && <div className="px-4 py-4 text-sm text-amber-200">{contractError}</div>}
              {contractPayload && !contractLoading && (
                <div className="space-y-4 bg-[#0d1118] p-4">
                  <ContractCombinedChart history={contractPayload.history} />

                  <div className="rounded-md border border-gray-800 bg-gray-950/25">
                    <div className="border-b border-gray-800 px-3 py-2 text-sm font-semibold text-gray-100">
                      Same Month Contract Marks
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] border-collapse text-xs text-gray-200">
                        <thead className="bg-gray-950/60 text-[11px] uppercase tracking-wider text-gray-500">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">Year</th>
                            <th className="px-3 py-2 text-left font-semibold">Type</th>
                            <th className="px-3 py-2 text-left font-semibold">Symbol</th>
                            <th className="px-3 py-2 text-right font-semibold">Price</th>
                            <th className="px-3 py-2 text-right font-semibold">Volume</th>
                            <th className="px-3 py-2 text-right font-semibold">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {selectedSameMonthPoints.map((point) => (
                            <tr
                              key={`${point.symbol}-${point.contractYear}`}
                              className={point.symbol === selectedContract.point.symbol ? "bg-cyan-500/10" : ""}
                            >
                              <td className="px-3 py-2 font-semibold text-gray-100">{point.contractYear}</td>
                              <td
                                className={
                                  isActiveForwardPoint(point, payload?.dataAsOf)
                                    ? "px-3 py-2 text-cyan-200"
                                    : "px-3 py-2 text-orange-200"
                                }
                              >
                                {isActiveForwardPoint(point, payload?.dataAsOf)
                                  ? "Forward"
                                  : point.pointType === "forward"
                                    ? "Settled"
                                    : "Settlement"}
                              </td>
                              <td className="px-3 py-2 text-gray-400">{point.symbol}</td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-100">
                                {fmtPrice(point.settlement)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                                {fmtVolume(point.volume)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-400">
                                {fmtDate(point.finalTradeDate)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
