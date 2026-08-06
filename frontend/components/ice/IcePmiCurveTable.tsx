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

type PricingMode = "power" | "cal" | "spark";

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
  cal27Symbol?: string | null;
  cal27PriceTrend?: TrendPoint[];
  cal28Symbol?: string | null;
  cal28PriceTrend?: TrendPoint[];
  monthCurvePoints: PriorSettlementPoint[];
}

interface IcePmiCurvePayload {
  product: string;
  pricingMode?: PricingMode;
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
  product: string;
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

interface IcePmiCurveTableProps {
  mode?: PricingMode;
  sparkProduct?: string;
  selectedYears?: number[];
  className?: string;
  title?: string;
  subtitle?: string;
  pairedLayout?: boolean;
  defaultShowTrend?: boolean;
}

interface MatrixCell {
  point: PriorSettlementPoint | null;
  priceTrend: TrendPoint[] | null;
}

interface MatrixRow {
  strip: string;
  stripOrder: number;
  legLabel?: string;
  cells: Map<number, MatrixCell>;
  points: PriorSettlementPoint[];
}

interface SelectedContract {
  strip: string;
  year: number;
  point: PriorSettlementPoint;
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

function chartDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isFinite(time) ? time : null;
}

function chartDaysBetween(startMs: number, endMs: number): number {
  return Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)));
}

function finiteTrendValues(points: TrendPoint[] | undefined): number[] {
  return (points ?? [])
    .map((point) => point.value)
    .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
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

function PriceTrendSparkline({ priceTrend }: { priceTrend: TrendPoint[] }) {
  const values = finiteTrendValues(priceTrend);
  if (values.length < 2) return null;

  const width = 72;
  const height = 16;
  const paddingX = 1;
  const paddingY = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coordinates = values.map((value, index) => {
    const x = paddingX + (index / Math.max(1, values.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - ((value - min) / range) * (height - paddingY * 2);
    return { x, y };
  });
  const path = coordinates
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="mt-1 h-3.5 w-full overflow-visible"
    >
      <path d={path} fill="none" stroke="#38bdf8" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
    </svg>
  );
}

function ContractCombinedChart({ history }: { history: ContractHistoryPoint[] }) {
  const [focused, setFocused] = useState(false);
  const [chartWindowDays, setChartWindowDays] = useState<number | "all">(90);
  const [visibleSeries, setVisibleSeries] = useState({
    settlement: true,
    volume: true,
    openInterest: true,
  });
  const chartData = history
    .filter((point) => point.tradeDate && point.settlement !== null)
    .map((point) => ({
      tradeDate: fmtDate(point.tradeDate),
      tradeDateMs: chartDateMs(point.tradeDate) ?? 0,
      settlement: point.settlement,
      volume: point.volume,
      openInterest: point.openInterest ?? null,
    }));
  const dateExtent = chartData.length
    ? [
        Math.min(...chartData.map((point) => point.tradeDateMs)),
        Math.max(...chartData.map((point) => point.tradeDateMs)),
      ]
    : [Date.now(), Date.now()] as const;
  const maxWindowDays = chartDaysBetween(dateExtent[0], dateExtent[1]);
  const sliderValue = chartWindowDays === "all" ? maxWindowDays : chartWindowDays;
  const visibleChartData =
    chartWindowDays === "all"
      ? chartData
      : chartData.filter((point) => point.tradeDateMs >= dateExtent[1] - chartWindowDays * 24 * 60 * 60 * 1000);
  const hasOpenInterest = chartData.some(
    (point) => point.openInterest !== null && Number.isFinite(point.openInterest),
  );

  if (visibleChartData.length < 2) {
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
            {visibleChartData[0].tradeDate} to {visibleChartData.at(-1)?.tradeDate}
          </div>
          <button
            type="button"
            onClick={() => setFocused((value) => !value)}
            className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-xs font-semibold text-gray-300 transition-colors hover:border-cyan-400 hover:text-white"
          >
            {focused ? "Collapse" : "Expand"}
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
      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap gap-1 rounded-md border border-gray-800 bg-gray-950/55 p-1">
          {[
            { label: "30D", days: 30 },
            { label: "90D", days: 90 },
            { label: "180D", days: 180 },
            { label: "All", days: "all" as const },
          ].map(({ label, days }) => (
            <button
              key={label}
              type="button"
              onClick={() => setChartWindowDays(days)}
              className={`min-w-12 rounded px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                chartWindowDays === days ? "bg-gray-100 text-gray-950" : "text-gray-400 hover:bg-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex min-w-[220px] items-center gap-2">
          <input
            type="range"
            min={30}
            max={Math.max(30, maxWindowDays)}
            step={10}
            value={sliderValue}
            onChange={(event) => setChartWindowDays(Number(event.target.value))}
            className="h-2 flex-1 accent-cyan-400"
            aria-label="Contract chart date lookback window"
          />
          <span className="w-14 text-right text-xs font-semibold text-gray-400">
            {chartWindowDays === "all" ? "All" : `${chartWindowDays}D`}
          </span>
        </div>
      </div>
      <div className={`${focused ? "h-[72vh]" : "h-[430px]"} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visibleChartData} margin={{ top: 12, right: 20, bottom: 12, left: 8 }}>
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

function pricingModeLabel(mode: PricingMode): string {
  if (mode === "cal") return "Calendar";
  if (mode === "spark") return "Sparks";
  return "Power Outright";
}

export default function IcePmiCurveTable({
  mode = "power",
  sparkProduct,
  selectedYears,
  className = "",
  title,
  subtitle,
  pairedLayout = false,
  defaultShowTrend = true,
}: IcePmiCurveTableProps = {}) {
  const [payload, setPayload] = useState<IcePmiCurvePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTrend, setShowTrend] = useState(defaultShowTrend);
  const lookbackDays = 7;
  const [selectedContract, setSelectedContract] = useState<SelectedContract | null>(null);
  const [contractPayload, setContractPayload] = useState<ContractHistoryPayload | null>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);
  const matrixCurrentYear = useMemo(() => new Date().getFullYear(), []);
  const selectedYearsKey = selectedYears?.join(",") ?? "";
  const selectedYearValues = useMemo(
    () =>
      selectedYearsKey
        ? selectedYearsKey.split(",").map(Number).filter((year) => Number.isFinite(year))
        : [],
    [selectedYearsKey],
  );
  const matrixEndYear = Math.max(matrixCurrentYear + 2, ...selectedYearValues);
  const priorYears =
    selectedYearValues.length > 0
      ? Math.max(1, matrixCurrentYear - Math.min(matrixCurrentYear, ...selectedYearValues))
      : 5;
  const selectedYearSet = useMemo(
    () => (selectedYearValues.length ? new Set(selectedYearValues) : null),
    [selectedYearValues],
  );

  const apiUrl = useMemo(
    () => {
      const params = new URLSearchParams({
        currentYear: String(matrixCurrentYear),
        endYear: String(matrixEndYear),
        tradingDays: String(lookbackDays),
        priorYears: String(priorYears),
        mode,
      });
      if (sparkProduct) params.set("sparkProduct", sparkProduct);
      return `/api/ice-pmi-curve?${params.toString()}`;
    },
    [lookbackDays, matrixCurrentYear, matrixEndYear, mode, priorYears, sparkProduct],
  );
  const cacheKey = useMemo(
    () => `api:ice-pmi-curve:${mode}:${sparkProduct ?? "default"}:${matrixCurrentYear}:${matrixEndYear}:${lookbackDays}:${priorYears}`,
    [lookbackDays, matrixCurrentYear, matrixEndYear, mode, priorYears, sparkProduct],
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
        if (
          point.contractYear !== null &&
          Number.isFinite(point.contractYear) &&
          (!selectedYearSet || selectedYearSet.has(point.contractYear))
        ) {
          years.add(point.contractYear);
        }
      }
    }
    return [...years].sort((a, b) => a - b);
  }, [payload?.rows, selectedYearSet]);

  const monthlyMatrixRows = useMemo<MatrixRow[]>(() => {
    return [...(payload?.rows ?? [])]
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
          let priceTrend: TrendPoint[] | null = null;

          if (point && isActiveForwardPoint(point, payload?.dataAsOf)) {
            if (point.symbol === row.currentSymbol || (!point.symbol && point.contractYear === matrixCurrentYear)) {
              priceTrend = row.priceTrend ?? null;
            } else if (point.symbol === row.cal27Symbol || (!point.symbol && point.contractYear === 2027)) {
              priceTrend = row.cal27PriceTrend ?? null;
            } else if (point.symbol === row.cal28Symbol || (!point.symbol && point.contractYear === 2028)) {
              priceTrend = row.cal28PriceTrend ?? null;
            }
          }

          cells.set(year, { point, priceTrend });
        }

        return {
          strip: row.strip,
          stripOrder: row.stripOrder,
          cells,
          points: row.monthCurvePoints,
        };
      });
  }, [matrixCurrentYear, matrixYears, payload?.dataAsOf, payload?.rows]);

  const selectedSameMonthPoints = useMemo(() => {
    if (!selectedContract) return [];
    return (
      monthlyMatrixRows
        .find((row) => row.strip === selectedContract.strip)
        ?.points.filter((point) => point.contractYear !== null)
        .sort((a, b) => (a.contractYear ?? 0) - (b.contractYear ?? 0)) ?? []
    );
  }, [monthlyMatrixRows, selectedContract]);

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

  useEffect(() => {
    setSelectedContract(null);
  }, [mode]);

  const monthColumnWidth = 64;
  const yearColumnWidth = 96;
  const tableMinWidth = monthColumnWidth + matrixYears.length * yearColumnWidth;

  return (
    <div className={`space-y-4 ${pairedLayout ? "h-full min-w-0" : ""} ${className}`}>
      <DataTableShell
        title={title ?? `${pricingModeLabel(mode)} Month x Year`}
        subtitle={
          subtitle ??
          (showTrend
            ? `${lookbackDays}d price trends shown for active forwards`
            : "Trend hidden; cells show settlement marks only")
        }
        action={
          <button
            type="button"
            aria-pressed={showTrend}
            aria-label="Toggle 7-day price trend"
            onClick={() => setShowTrend((value) => !value)}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
              showTrend
                ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100"
                : "border-gray-700 bg-gray-950 text-gray-400 hover:border-gray-500 hover:text-gray-200"
            }`}
          >
            7d Trend
          </button>
        }
        className={pairedLayout ? "h-full min-w-0" : ""}
        bodyClassName="border-gray-800"
      >
        <table
          className={`min-w-full table-fixed border-collapse text-xs text-gray-200 ${pairedLayout ? "w-full" : "w-max"}`}
          style={pairedLayout ? { minWidth: tableMinWidth } : undefined}
        >
          <colgroup>
            <col style={{ width: monthColumnWidth }} />
            {matrixYears.map((year) => (
              <col key={year} style={{ width: yearColumnWidth }} />
            ))}
          </colgroup>
          <thead className="bg-gray-950/60 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="sticky left-0 z-20 bg-gray-950 px-2 py-1.5 text-left font-semibold">
                Month
              </th>
              {matrixYears.map((year) => (
                <th key={year} className="px-2 py-1.5 text-right font-semibold">
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading && (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={Math.max(2, matrixYears.length + 1)}>
                  Loading {pricingModeLabel(mode).toLowerCase()} matrix...
                </td>
              </tr>
            )}
            {!loading && monthlyMatrixRows.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={Math.max(2, matrixYears.length + 1)}>
                  No {pricingModeLabel(mode).toLowerCase()} matrix rows returned.
                </td>
              </tr>
            )}
            {!loading &&
              monthlyMatrixRows.map((row) => (
                <tr key={row.strip} className="h-[54px] bg-[#151820] odd:bg-[#181b23]">
                  <th className="sticky left-0 z-10 bg-inherit px-2 py-1 text-left text-sm font-semibold text-gray-100">
                    <span className="block">{row.strip}</span>
                    {row.legLabel ? (
                      <span className="block text-[9px] font-medium leading-tight text-gray-500">{row.legLabel}</span>
                    ) : null}
                  </th>
                  {matrixYears.map((year) => {
                    const cell = row.cells.get(year) ?? { point: null, priceTrend: null };
                    const selected = activeSymbol && cell.point?.symbol === activeSymbol;
                    const pointLabel = pointTypeLabel(cell.point, payload?.dataAsOf);
                    const activeForward = isActiveForwardPoint(cell.point, payload?.dataAsOf);
                    const statusClass = activeForward
                      ? "text-cyan-200"
                      : cell.point
                        ? "text-yellow-200"
                        : "text-gray-500";
                    return (
                      <td key={`${row.strip}-${year}`} className="h-[54px] px-1 py-0.5 align-top">
                        <button
                          type="button"
                          disabled={!cell.point?.symbol}
                          onClick={() => {
                            if (!cell.point?.symbol) return;
                            setSelectedContract({ strip: row.strip, year, point: cell.point });
                          }}
                          title={
                            cell.point?.symbol
                              ? undefined
                              : cell.point
                                ? "Derived analytics cell; contract history is available only for outright PMI contracts"
                                : undefined
                          }
                          className={`min-h-[42px] w-full rounded border px-1.5 py-1 text-right transition-colors disabled:cursor-not-allowed ${
                            selected
                              ? "border-cyan-300 shadow-[0_0_0_1px_rgba(34,211,238,0.55)]"
                              : "border-white/5 hover:border-cyan-400/50"
                          }`}
                        >
                          <div className="text-xs font-semibold leading-tight tabular-nums text-gray-100">
                            {fmtPrice(cell.point?.settlement)}
                          </div>
                          <div className={`text-[9px] font-semibold leading-tight tabular-nums ${statusClass}`}>
                            {cell.point ? `${pointLabel} ${fmtDate(cell.point.finalTradeDate)}` : "-"}
                          </div>
                          {showTrend && cell.priceTrend ? (
                            <PriceTrendSparkline priceTrend={cell.priceTrend} />
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
