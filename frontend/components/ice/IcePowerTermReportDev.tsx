"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import ControlCard from "@/components/dashboard/ControlCard";
import DashboardTabs, { type DashboardTabOption } from "@/components/dashboard/DashboardTabs";
import DataTableShell from "@/components/dashboard/DataTableShell";
import {
  ICE_POWER_TERM_MARKETS,
  ICE_POWER_TERM_PRODUCTS,
  ICE_POWER_TERM_PRODUCTS_BY_MARKET,
} from "@/lib/icePowerTerm/products";
import { DAILY_GAS_MARKETS } from "@/lib/gasPricing/iceGasRegistry";
import {
  GAS_REGION_LABELS,
  GAS_REGION_ORDER,
  type GasRegion,
} from "@/lib/gasPricing/dailyGasPriceView";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

interface TrendPoint {
  date: string | null;
  value: number | null;
}

interface PriorSettlementPoint {
  contractYear: number | null;
  pointType?: "settlement" | "forward" | null;
  symbol: string | null;
  finalTradeDate: string | null;
  settlement: number | null;
  volume: number | null;
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
  product: string;
  source: string;
  dataAsOf: string | null;
  requestedTradeDate: string | null;
  datePolicy: "latest" | "as-of";
  rows: IcePmiCurveRow[];
}

interface ProductLoadResult {
  product: ReportProduct;
  payload: IcePmiCurvePayload | null;
  error: string | null;
}

interface IceTermReportBatchResult {
  mode: "power" | "gas";
  root: string;
  payload: IcePmiCurvePayload | null;
  error: string | null;
}

interface IceTermReportBatchPayload {
  source: "ice_python.settlements";
  currentYear: number;
  endYear: number;
  tradingDays: number;
  priorYears: number;
  requestedTradeDate: string | null;
  datePolicy: "latest" | "as-of";
  dataAsOf: string | null;
  rowCount: number;
  results: IceTermReportBatchResult[];
}

type TermReportTab = "power" | "gas";

interface ReportMarket {
  id: string;
  label: string;
}

interface ReportProduct {
  root: string;
  market: string;
  title: string;
  subtitle: string;
  mode: "power" | "gas";
  productLabel?: string;
}

interface ReportConfig {
  tab: TermReportTab;
  title: string;
  markets: ReportMarket[];
  products: ReportProduct[];
  productsByMarket: Record<string, ReportProduct[]>;
  primaryProducts: ReportProduct[];
}

interface MarketCell {
  point: PriorSettlementPoint | null;
  priceTrend: TrendPoint[];
  volumeTrend: TrendPoint[];
}

interface SummaryRow {
  key: string;
  product: string;
  contract: string;
  contractYear: number;
  monthOrder: number;
  last: number;
  priceTrend: TrendPoint[];
  volumeTrend: TrendPoint[];
  trendMove: number;
  absTrendMove: number;
}

interface SummaryProductGroup {
  market: ReportMarket;
  product: ReportProduct;
  rows: SummaryRow[];
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const LOOKBACK_DAYS = 7;
const SUMMARY_ROWS_PER_MARKET_LIMIT = 6;
const REPORT_TABS: Array<DashboardTabOption<TermReportTab>> = [
  { value: "power", label: "Power" },
  { value: "gas", label: "Gas" },
];
const POWER_REPORT_PRODUCTS: ReportProduct[] = ICE_POWER_TERM_PRODUCTS.map((product) => ({
  ...product,
  mode: "power",
}));
const POWER_REPORT_MARKETS: ReportMarket[] = ICE_POWER_TERM_MARKETS;
const POWER_REPORT_PRODUCTS_BY_MARKET = Object.fromEntries(
  ICE_POWER_TERM_MARKETS.map((market) => [
    market.id,
    (ICE_POWER_TERM_PRODUCTS_BY_MARKET[market.id] ?? []).map((product) => ({
      ...product,
      mode: "power" as const,
    })),
  ]),
) as Record<string, ReportProduct[]>;
const PRIMARY_POWER_REPORT_PRODUCTS = POWER_REPORT_MARKETS.map(
  (market) => POWER_REPORT_PRODUCTS_BY_MARKET[market.id]?.[0],
).filter((product): product is ReportProduct => Boolean(product));
const GAS_REPORT_PRODUCTS: ReportProduct[] = DAILY_GAS_MARKETS.filter(
  (market) => Boolean(market.futuresProduct),
).map((market) => ({
  root: market.futuresProduct!,
  market: market.region,
  title: `${market.market} Monthly Matrix`,
  subtitle:
    market.curveStyle === "basis"
      ? `${market.market} all-in monthly futures from HNG plus ${market.futuresProduct} basis.`
      : `${market.market} fixed-price monthly futures.`,
  mode: "gas",
  productLabel: market.curveStyle === "basis" ? `HNG + ${market.futuresProduct}` : market.futuresProduct!,
}));
const GAS_REPORT_MARKETS: ReportMarket[] = GAS_REGION_ORDER.filter((region) =>
  GAS_REPORT_PRODUCTS.some((product) => product.market === region),
).map((region) => ({ id: region, label: GAS_REGION_LABELS[region as GasRegion] }));
const GAS_REPORT_PRODUCTS_BY_MARKET = Object.fromEntries(
  GAS_REPORT_MARKETS.map((market) => [
    market.id,
    GAS_REPORT_PRODUCTS.filter((product) => product.market === market.id),
  ]),
) as Record<string, ReportProduct[]>;
const PRIMARY_GAS_REPORT_PRODUCTS = GAS_REPORT_MARKETS.map(
  (market) => GAS_REPORT_PRODUCTS_BY_MARKET[market.id]?.[0],
).filter((product): product is ReportProduct => Boolean(product));
const REPORT_CONFIGS: Record<TermReportTab, ReportConfig> = {
  power: {
    tab: "power",
    title: "ICE Power Term Report",
    markets: POWER_REPORT_MARKETS,
    products: POWER_REPORT_PRODUCTS,
    productsByMarket: POWER_REPORT_PRODUCTS_BY_MARKET,
    primaryProducts: PRIMARY_POWER_REPORT_PRODUCTS,
  },
  gas: {
    tab: "gas",
    title: "ICE Gas Term Report",
    markets: GAS_REPORT_MARKETS,
    products: GAS_REPORT_PRODUCTS,
    productsByMarket: GAS_REPORT_PRODUCTS_BY_MARKET,
    primaryProducts: PRIMARY_GAS_REPORT_PRODUCTS,
  },
};
const ALL_REPORT_PRODUCTS = [...POWER_REPORT_PRODUCTS, ...GAS_REPORT_PRODUCTS];
const ALL_REPORT_PRODUCT_COUNT = ALL_REPORT_PRODUCTS.length;
const MONTHS = [
  { strip: "Jan", stripOrder: 1 },
  { strip: "Feb", stripOrder: 2 },
  { strip: "Mar", stripOrder: 3 },
  { strip: "Apr", stripOrder: 4 },
  { strip: "May", stripOrder: 5 },
  { strip: "Jun", stripOrder: 6 },
  { strip: "Jul", stripOrder: 7 },
  { strip: "Aug", stripOrder: 8 },
  { strip: "Sep", stripOrder: 9 },
  { strip: "Oct", stripOrder: 10 },
  { strip: "Nov", stripOrder: 11 },
  { strip: "Dec", stripOrder: 12 },
];
const COMPACT_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseTradeDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  if (!Number.isInteger(year) || year < 1) return null;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function fmtDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "-";
}

function fmtCompactDate(value: string | null | undefined): string {
  const isoDate = value?.slice(0, 10);
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "-";
  const monthIndex = Number(isoDate.slice(5, 7)) - 1;
  const month = COMPACT_MONTH_LABELS[monthIndex];
  if (!month) return "-";
  return `${month}-${isoDate.slice(8, 10)}`;
}

function fmtSignedPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const formatted = Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function signedPriceClass(value: number): string {
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-red-300";
  return "text-gray-400";
}

function fmtTrendValue(value: number, colorMode: "move" | "volume"): string {
  if (colorMode === "volume") {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return fmtPrice(value);
}

function fmtSignedTrendValue(value: number, colorMode: "move" | "volume"): string {
  if (colorMode === "volume") {
    const formatted = Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (value > 0) return `+${formatted}`;
    if (value < 0) return `-${formatted}`;
    return formatted;
  }
  return fmtSignedPrice(value);
}

function trendMoveClass(value: number): string {
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-red-300";
  return "text-gray-400";
}

function trendMoveStroke(value: number): string {
  if (value > 0) return "#34d399";
  if (value < 0) return "#f87171";
  return "#94a3b8";
}

function latestLoadedDataAsOf(results: ProductLoadResult[]): string | null {
  return results
    .map((result) => result.payload?.dataAsOf)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function filterStatus(results: ProductLoadResult[], loading: boolean, totalProducts: number): string {
  const loadedCount = results.filter((result) => result.payload).length;
  const dataAsOf = latestLoadedDataAsOf(results);
  const loadLabel = loading
    ? `Loading ${loadedCount}/${totalProducts}`
    : `${loadedCount}/${totalProducts} roots loaded`;
  return dataAsOf ? `${loadLabel} / as of ${dataAsOf}` : loadLabel;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load ICE term data";
}

function finiteTrendPoints(points: TrendPoint[] | undefined): Array<{ date: string | null; value: number }> {
  return (points ?? [])
    .map((point) => ({
      date: point.date,
      value: point.value,
    }))
    .filter((point): point is { date: string | null; value: number } =>
      point.value !== null && Number.isFinite(point.value),
    );
}

function isSameMarketDate(first: string | null | undefined, second: string | null | undefined): boolean {
  return Boolean(first && second && first.slice(0, 10) === second.slice(0, 10));
}

function isActiveForwardPoint(point: PriorSettlementPoint | null, dataAsOf: string | null | undefined): boolean {
  return (
    point?.pointType === "forward" &&
    point.finalTradeDate !== null &&
    isSameMarketDate(point.finalTradeDate, dataAsOf)
  );
}

function pointStatusLabel(point: PriorSettlementPoint | null): string {
  if (!point) return "-";
  return fmtCompactDate(point.finalTradeDate);
}

function pointStatusClass(point: PriorSettlementPoint | null, dataAsOf: string | null | undefined): string {
  if (!point) return "text-gray-500";
  return isActiveForwardPoint(point, dataAsOf) ? "text-cyan-200" : "text-yellow-200";
}

function trendsForPoint(
  row: IcePmiCurveRow | undefined,
  point: PriorSettlementPoint | null,
  year: number,
  currentYear: number,
): Pick<MarketCell, "priceTrend" | "volumeTrend"> {
  if (!row || !point) return { priceTrend: [], volumeTrend: [] };
  if (point.symbol && point.symbol === row.currentSymbol) {
    return { priceTrend: row.priceTrend ?? [], volumeTrend: row.volumeTrend ?? [] };
  }
  if (point.symbol && point.symbol === row.cal27Symbol) {
    return {
      priceTrend: row.cal27PriceTrend ?? [],
      volumeTrend: row.cal27VolumeTrend ?? [],
    };
  }
  if (point.symbol && point.symbol === row.cal28Symbol) {
    return {
      priceTrend: row.cal28PriceTrend ?? [],
      volumeTrend: row.cal28VolumeTrend ?? [],
    };
  }
  if (year === currentYear) {
    return { priceTrend: row.priceTrend ?? [], volumeTrend: row.volumeTrend ?? [] };
  }
  if (year === 2027) {
    return {
      priceTrend: row.cal27PriceTrend ?? [],
      volumeTrend: row.cal27VolumeTrend ?? [],
    };
  }
  if (year === 2028) {
    return {
      priceTrend: row.cal28PriceTrend ?? [],
      volumeTrend: row.cal28VolumeTrend ?? [],
    };
  }
  return { priceTrend: [], volumeTrend: [] };
}

function cellForProductYear(
  payload: IcePmiCurvePayload | null,
  monthStrip: string,
  year: number,
  currentYear: number,
): MarketCell {
  const row = payload?.rows.find((candidate) => candidate.strip === monthStrip);
  const point =
    row?.monthCurvePoints.find((candidate) => candidate.contractYear === year) ?? null;
  const trends = trendsForPoint(row, point, year, currentYear);
  return {
    point,
    ...trends,
  };
}

function TrendSparkline({
  points,
  colorMode = "move",
  compact = false,
}: {
  points: TrendPoint[];
  colorMode?: "move" | "volume";
  compact?: boolean;
}) {
  const [tooltipPosition, setTooltipPosition] = useState<{
    left: number;
    top: number;
    placement: "above" | "below";
  } | null>(null);
  const values = finiteTrendPoints(points);
  if (values.length < 2) {
    return (
      <span
        aria-label="Not enough trend points"
        className={
          compact
            ? "block h-4 text-center text-[9px] leading-4 text-gray-600"
            : "block h-5 text-center text-[10px] leading-5 text-gray-600"
        }
      >
        -
      </span>
    );
  }

  const width = compact ? 64 : 88;
  const height = compact ? 18 : 22;
  const paddingX = 2;
  const paddingY = 3;
  const numericValues = values.map((point) => point.value);
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = max - min || 1;
  const coordinates = numericValues.map((value, index) => {
    const x = paddingX + (index / Math.max(1, numericValues.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - ((value - min) / range) * (height - paddingY * 2);
    return { x, y };
  });
  const path = coordinates
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const move = numericValues.at(-1)! - numericValues[0];
  const stroke = trendMoveStroke(move);
  const latest = coordinates.at(-1)!;
  const tooltipLabel = colorMode === "volume" ? "Vol 7d" : "Price 7d";
  const tooltipWidth = 208;

  const showTooltip = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const cardHeight = 58 + values.length * 19;
    const placement = rect.bottom + cardHeight + 10 < window.innerHeight ? "below" : "above";
    setTooltipPosition({
      left: Math.min(
        Math.max(8, rect.left + rect.width / 2 - tooltipWidth / 2),
        Math.max(8, window.innerWidth - tooltipWidth - 8),
      ),
      top: placement === "below" ? rect.bottom + 6 : Math.max(8, rect.top - 6),
      placement,
    });
  };

  return (
    <span
      className="block w-full outline-none"
      tabIndex={0}
      aria-label={`${tooltipLabel} trend`}
      onMouseEnter={(event) => showTooltip(event.currentTarget)}
      onMouseMove={(event) => showTooltip(event.currentTarget)}
      onMouseLeave={() => setTooltipPosition(null)}
      onFocus={(event) => showTooltip(event.currentTarget)}
      onBlur={() => setTooltipPosition(null)}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={`${compact ? "h-4" : "h-5"} w-full overflow-visible`}
      >
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
        />
        <circle cx={latest.x} cy={latest.y} r={2} fill={stroke} />
      </svg>
      {tooltipPosition && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 w-52 rounded-md border border-gray-700 bg-gray-950/95 p-2 text-left shadow-2xl shadow-black/50"
          style={{
            left: tooltipPosition.left,
            top: tooltipPosition.top,
            transform: tooltipPosition.placement === "above" ? "translateY(-100%)" : undefined,
          }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-gray-800 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {tooltipLabel}
            </span>
            <span className={`text-[11px] font-semibold tabular-nums ${trendMoveClass(move)}`}>
              {fmtSignedTrendValue(move, colorMode)}
            </span>
          </div>
          <div className="mt-1.5 space-y-0.5">
            {values.map((point) => (
              <div
                key={`${point.date ?? "missing"}-${point.value}`}
                className="flex items-center justify-between gap-3 text-[11px]"
              >
                <span className="tabular-nums text-gray-500">{fmtDate(point.date)}</span>
                <span className="font-semibold tabular-nums text-gray-100">
                  {fmtTrendValue(point.value, colorMode)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 border-t border-gray-800 pt-1 text-[10px] tabular-nums text-gray-500">
            {fmtDate(values[0].date)} to {fmtDate(values.at(-1)?.date)}
          </div>
        </div>
      )}
    </span>
  );
}

function LoadStatusPill({
  results,
  loading,
  totalProducts,
}: {
  results: ProductLoadResult[];
  loading: boolean;
  totalProducts: number;
}) {
  const loadedCount = results.filter((result) => result.payload).length;
  const errorCount = results.filter((result) => result.error).length;
  const statusClass =
    errorCount > 0
      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
      : loadedCount === totalProducts
        ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
        : "border-gray-700 bg-gray-950/50 text-gray-400";

  return (
    <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${statusClass}`}>
      {loading ? "Loading" : `${loadedCount}/${totalProducts} roots loaded`}
    </span>
  );
}

function SummaryTable({
  powerGroups,
  gasGroups,
  loading,
  results,
  totalProducts,
}: {
  powerGroups: SummaryProductGroup[];
  gasGroups: SummaryProductGroup[];
  loading: boolean;
  results: ProductLoadResult[];
  totalProducts: number;
}) {
  const dataAsOf = latestLoadedDataAsOf(results);

  return (
    <DataTableShell
      title="Summary"
      subtitle="Top active forwards by absolute 7d price move, with Power first and Gas second."
      className="p-2 sm:p-3"
      action={
        <>
          <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-100">
            7d = last {LOOKBACK_DAYS} ICE settlement dates ending as of {dataAsOf ?? "-"}
          </span>
          <LoadStatusPill results={results} loading={loading} totalProducts={totalProducts} />
        </>
      }
      bodyClassName="border-gray-800 bg-[#0d1119]"
    >
      <div className="space-y-3 p-1.5">
        <SummaryCommodityRow label="Power" groups={powerGroups} loading={loading} />
        <SummaryCommodityRow label="Gas" groups={gasGroups} loading={loading} />
      </div>
    </DataTableShell>
  );
}

function SummaryCommodityRow({
  label,
  groups,
  loading,
}: {
  label: string;
  groups: SummaryProductGroup[];
  loading: boolean;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          {label}
        </span>
        <span className="h-px flex-1 bg-gray-800" />
      </div>
      <div className="flex flex-wrap items-start gap-1.5">
        {groups.map((group) => (
          <SummaryProductBlock
            key={`${label}-${group.market.id}-${group.product.root}`}
            group={group}
            loading={loading}
          />
        ))}
      </div>
    </section>
  );
}

function SummaryProductBlock({
  group,
  loading,
}: {
  group: SummaryProductGroup;
  loading: boolean;
}) {
  const visibleRows = group.rows.slice(0, SUMMARY_ROWS_PER_MARKET_LIMIT);

  return (
    <section className="w-fit max-w-full overflow-hidden rounded-md border border-gray-800 bg-[#101722]">
      <div className="flex items-center justify-between gap-1.5 border-b border-gray-800 bg-gray-950 px-2 py-1">
        <span className="text-xs font-semibold text-gray-100">{group.market.label}</span>
        <span
          className="rounded border border-sky-500/30 bg-sky-500/10 px-1 py-px text-[9px] font-semibold text-sky-100"
          title={group.product.title}
        >
          {group.product.productLabel ?? group.product.root}
        </span>
      </div>
      <table className="w-max border-collapse text-xs text-gray-200 whitespace-nowrap">
        <thead className="bg-gray-950/70 text-[10px] uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-1.5 py-1 text-left font-semibold">Contract</th>
            <th className="w-[48px] px-1 py-1 text-right font-semibold">Last</th>
            <th className="w-[46px] px-1 py-1 text-right font-semibold">7d</th>
            <th className="w-[52px] px-0.5 py-1 text-left font-semibold">Price</th>
            <th className="w-[52px] px-0.5 py-1 text-left font-semibold">Vol</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {loading && (
            <tr>
              <td className="px-1.5 py-2 text-gray-500" colSpan={5}>
                Loading...
              </td>
            </tr>
          )}
          {!loading && visibleRows.length === 0 && (
            <tr>
              <td className="px-1.5 py-2 text-gray-500" colSpan={5}>
                No current movers.
              </td>
            </tr>
          )}
          {!loading &&
            visibleRows.map((row) => (
              <tr key={row.key} className="bg-[#111722] odd:bg-[#151b26]">
                <td className="px-1.5 py-1">
                  <div className="text-[11px] font-semibold text-gray-100">
                    {row.contract}
                  </div>
                </td>
                <td className="w-[48px] px-1 py-1 text-right text-[11px] font-semibold tabular-nums text-gray-100">
                  {fmtPrice(row.last)}
                </td>
                <td
                  className={`w-[46px] px-1 py-1 text-right text-[11px] font-semibold tabular-nums ${signedPriceClass(
                    row.trendMove,
                  )}`}
                  title={`Ranked by absolute 7d price move ${fmtSignedPrice(row.trendMove)}`}
                >
                  {fmtSignedPrice(row.trendMove)}
                </td>
                <td className="w-[52px] px-0.5 py-1">
                  <TrendSparkline points={row.priceTrend} compact />
                </td>
                <td className="w-[52px] px-0.5 py-1">
                  <TrendSparkline points={row.volumeTrend} colorMode="volume" compact />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}

function MarketSection({
  market,
  products,
  payloads,
  matrixYears,
  currentYear,
  loading,
}: {
  market: ReportMarket;
  products: ReportProduct[];
  payloads: Map<ReportProduct["root"], IcePmiCurvePayload>;
  matrixYears: number[];
  currentYear: number;
  loading: boolean;
}) {
  const rootLabel = products.map((product) => product.root).join(" / ");

  return (
    <DataTableShell
      title={market.label}
      subtitle={`${rootLabel} monthly futures`}
      className="p-2 sm:p-3"
      bodyClassName="border-gray-800 bg-[#0d1119]"
    >
      <div className="flex flex-wrap items-start gap-2 p-1.5">
        {products.map((product) => (
          <MarketProductTable
            key={product.root}
            product={product}
            payload={payloads.get(product.root) ?? null}
            matrixYears={matrixYears}
            currentYear={currentYear}
            loading={loading}
          />
        ))}
      </div>
    </DataTableShell>
  );
}

function MarketProductTable({
  product,
  payload,
  matrixYears,
  currentYear,
  loading,
}: {
  product: ReportProduct;
  payload: IcePmiCurvePayload | null;
  matrixYears: number[];
  currentYear: number;
  loading: boolean;
}) {
  const monthColumnWidth = 58;
  const yearColumnWidth = 122;
  const tableWidth = monthColumnWidth + matrixYears.length * yearColumnWidth;

  return (
    <section
      className="flex-none overflow-hidden rounded-md border border-gray-800 bg-[#101722]"
      style={{ width: tableWidth }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-gray-800 bg-gray-950/85 px-2 py-1">
        <span className="text-xs font-semibold text-sky-100" title={product.title}>
          {product.productLabel ?? product.root}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-600">
          Monthly
        </span>
      </div>
      <div className="overflow-hidden">
        <table
          className="table-fixed border-collapse text-xs text-gray-200"
          style={{ width: tableWidth }}
        >
          <colgroup>
            <col style={{ width: monthColumnWidth }} />
            {matrixYears.map((year) => (
              <col key={year} style={{ width: yearColumnWidth }} />
            ))}
          </colgroup>
          <thead className="bg-gray-950 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="sticky left-0 z-20 bg-gray-950 px-1.5 py-1.5 text-left font-semibold">
                Month
              </th>
              {matrixYears.map((year) => (
                <th
                  key={year}
                  className="border-l border-gray-800/70 px-1 py-1.5 text-right font-semibold"
                >
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading && (
              <tr>
                <td className="px-2 py-3 text-gray-500" colSpan={matrixYears.length + 1}>
                  Loading {product.root}...
                </td>
              </tr>
            )}
            {!loading &&
              MONTHS.map((month) => (
                <tr key={month.strip} className="h-[30px] bg-[#101722] odd:bg-[#141a25]">
                  <th className="sticky left-0 z-10 bg-inherit px-1.5 py-1 text-left text-xs font-semibold text-gray-100">
                    {month.strip}
                  </th>
                  {matrixYears.map((year) => {
                    const cell = cellForProductYear(payload, month.strip, year, currentYear);
                    const hasPoint = cell.point !== null;
                    return (
                      <td
                        key={`${month.strip}-${product.root}-${year}`}
                        className="h-[30px] border-l border-gray-800/60 px-1 py-0.5 align-middle"
                      >
                        <div
                          className="flex h-[26px] min-w-0 items-center gap-1 whitespace-nowrap"
                          title={cell.point?.symbol ?? undefined}
                        >
                          <span className="w-[36px] shrink-0">
                            <TrendSparkline points={hasPoint ? cell.priceTrend : []} compact />
                          </span>
                          <span
                            className={`min-w-[34px] flex-1 text-right text-[10px] font-semibold leading-none tabular-nums ${
                              hasPoint ? "text-gray-100" : "text-gray-500"
                            }`}
                          >
                            {fmtPrice(cell.point?.settlement)}
                          </span>
                          <span
                            className={`w-[34px] shrink-0 text-right text-[9px] font-semibold leading-none tabular-nums ${pointStatusClass(
                              cell.point,
                              payload?.dataAsOf,
                            )}`}
                          >
                            {pointStatusLabel(cell.point)}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function compareSummaryRows(first: SummaryRow, second: SummaryRow): number {
  const scoreDiff = second.absTrendMove - first.absTrendMove;
  if (scoreDiff !== 0) return scoreDiff;

  const productDiff = first.product.localeCompare(second.product);
  if (productDiff !== 0) return productDiff;

  const yearDiff = first.contractYear - second.contractYear;
  if (yearDiff !== 0) return yearDiff;

  const monthDiff = first.monthOrder - second.monthOrder;
  if (monthDiff !== 0) return monthDiff;

  return first.key.localeCompare(second.key);
}

function buildSummaryGroups({
  results,
  matrixYears,
  currentYear,
  config,
}: {
  results: ProductLoadResult[];
  matrixYears: number[];
  currentYear: number;
  config: ReportConfig;
}): SummaryProductGroup[] {
  const rowsByProduct = new Map(
    config.primaryProducts.map((product) => [product.root, [] as SummaryRow[]]),
  );

  for (const result of results) {
    if (!result.payload) continue;
    const productRows = rowsByProduct.get(result.product.root);
    if (!productRows) continue;

    for (const month of MONTHS) {
      for (const year of matrixYears) {
        const cell = cellForProductYear(result.payload, month.strip, year, currentYear);
        const last = cell.point?.settlement;
        if (!isActiveForwardPoint(cell.point, result.payload.dataAsOf)) {
          continue;
        }
        if (last === null || last === undefined || !Number.isFinite(last)) {
          continue;
        }

        const trendPoints = finiteTrendPoints(cell.priceTrend);
        const firstTrend = trendPoints.at(0);
        const lastTrend = trendPoints.at(-1);
        if (
          trendPoints.length < 2 ||
          !firstTrend ||
          !lastTrend ||
          !isSameMarketDate(lastTrend.date, result.payload.dataAsOf)
        ) {
          continue;
        }

        const move = lastTrend.value - firstTrend.value;
        productRows.push({
          key: `${result.product.root}-${month.strip}-${year}`,
          product: result.product.root,
          contract: `${result.product.root} ${month.strip} ${year}`,
          contractYear: year,
          monthOrder: month.stripOrder,
          last,
          priceTrend: cell.priceTrend,
          volumeTrend: cell.volumeTrend,
          trendMove: move,
          absTrendMove: Math.abs(move),
        });
      }
    }
  }

  return config.markets.flatMap((market) => {
    const product = config.productsByMarket[market.id]?.[0];
    if (!product) return [];

    return [
      {
        market,
        product,
        rows: [...(rowsByProduct.get(product.root) ?? [])].sort(compareSummaryRows),
      },
    ];
  });
}

function ErrorStrip({ results }: { results: ProductLoadResult[] }) {
  const errors = results.filter((result) => result.error);
  if (!errors.length) return null;

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      {errors.map((result) => (
        <div key={result.product.root}>
          {result.product.root}: {result.error}
        </div>
      ))}
    </div>
  );
}

function parseReportTab(value: string | null): TermReportTab {
  return value === "gas" ? "gas" : "power";
}

export default function IcePowerTermReportDev() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialTradeDate = parseTradeDate(searchParams.get("tradeDate"));
  const [activeTab, setActiveTab] = useState<TermReportTab>(() => parseReportTab(searchParams.get("tab")));
  const currentYear = useMemo(() => new Date().getUTCFullYear(), []);
  const matrixYears = useMemo(
    () => Array.from({ length: 3 }, (_, index) => currentYear + index),
    [currentYear],
  );
  const activeConfig = REPORT_CONFIGS[activeTab];
  const [selectedTradeDate, setSelectedTradeDate] = useState<string | null>(
    () => initialTradeDate,
  );
  const [tradeDateInput, setTradeDateInput] = useState(() => initialTradeDate ?? "");
  const [refreshToken, setRefreshToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<ProductLoadResult[]>(() =>
    ALL_REPORT_PRODUCTS.map((product) => ({ product, payload: null, error: null })),
  );

  const updateReportRoute = useCallback(
    (nextTab: TermReportTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("section", "ice-term-report");
      if (nextTab === "gas") {
        params.set("tab", "gas");
      } else {
        params.delete("tab");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const routedTab = parseReportTab(searchParams.get("tab"));
    setActiveTab((current) => (current === routedTab ? current : routedTab));
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    const endYear = matrixYears.at(-1) ?? currentYear + 2;
    const tradeDateKey = selectedTradeDate ?? "latest";
    const forceRefresh = refreshToken > 0;
    const params = new URLSearchParams({
      currentYear: String(currentYear),
      endYear: String(endYear),
      tradingDays: String(LOOKBACK_DAYS),
      priorYears: "1",
      tab: "all",
    });
    if (selectedTradeDate) params.set("tradeDate", selectedTradeDate);
    if (forceRefresh) params.set("refresh", "1");

    setLoading(true);
    setResults(ALL_REPORT_PRODUCTS.map((product) => ({ product, payload: null, error: null })));
    fetchJsonWithCache<IceTermReportBatchPayload>({
      key: `api:ice-term-report:batch:v1:all:${currentYear}:${endYear}:${LOOKBACK_DAYS}:${tradeDateKey}`,
      url: `/api/ice-term-report?${params.toString()}`,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
    })
      .then((batch) => {
        if (!controller.signal.aborted) {
          const batchResultsByProduct = new Map(
            batch.results.map((result) => [`${result.mode}:${result.root}`, result]),
          );
          const nextResults = ALL_REPORT_PRODUCTS.map((product) => {
            const batchResult = batchResultsByProduct.get(`${product.mode}:${product.root}`);
            return {
              product,
              payload: batchResult?.payload ?? null,
              error: batchResult?.error ?? (batchResult ? null : "No batch result returned for root."),
            };
          });
          setResults(nextResults);
          if (!selectedTradeDate) {
            setTradeDateInput(latestLoadedDataAsOf(nextResults) ?? "");
          }
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setResults(
            ALL_REPORT_PRODUCTS.map((product) => ({
              product,
              payload: null,
              error: errorMessage(error),
            })),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [currentYear, matrixYears, refreshToken, selectedTradeDate]);

  const payloads = useMemo(
    () =>
      new Map(
        results
          .filter((result): result is ProductLoadResult & { payload: IcePmiCurvePayload } =>
            result.payload !== null,
          )
          .map((result) => [result.product.root, result.payload]),
      ),
    [results],
  );
  const powerSummaryGroups = useMemo(
    () => buildSummaryGroups({ results, matrixYears, currentYear, config: REPORT_CONFIGS.power }),
    [currentYear, matrixYears, results],
  );
  const gasSummaryGroups = useMemo(
    () => buildSummaryGroups({ results, matrixYears, currentYear, config: REPORT_CONFIGS.gas }),
    [currentYear, matrixYears, results],
  );
  const statusText = filterStatus(results, loading, ALL_REPORT_PRODUCT_COUNT);

  const handleTabChange = (nextTab: TermReportTab) => {
    setActiveTab(nextTab);
    updateReportRoute(nextTab);
  };

  const handleTradeDateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTradeDate = parseTradeDate(tradeDateInput);
    setSelectedTradeDate(nextTradeDate);
    setTradeDateInput(nextTradeDate ?? "");
    setRefreshToken((value) => value + 1);
  };

  const handleLatestClick = () => {
    setSelectedTradeDate(null);
    setTradeDateInput("");
    setRefreshToken((value) => value + 1);
  };

  return (
    <div className="w-full space-y-4">
      <ControlCard title="ICE Term Report">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Filters
            </span>
            <span className="h-px flex-1 bg-gray-800" />
            <span className="text-xs tabular-nums text-gray-500">
              {statusText}
            </span>
          </div>

          <form onSubmit={handleTradeDateSubmit} className="flex flex-wrap items-center gap-2">
            <label className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Trade Date
              </span>
              <input
                type="date"
                value={tradeDateInput}
                onChange={(event) => setTradeDateInput(event.target.value)}
                className="h-8 rounded-md border border-gray-700 bg-gray-900 px-2 text-xs tabular-nums text-gray-200 focus:border-gray-500 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="h-8 rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Load
            </button>
            <button
              type="button"
              onClick={handleLatestClick}
              className="h-8 rounded-md border border-gray-800 bg-gray-950/40 px-3 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-200"
            >
              Latest
            </button>
          </form>
        </div>
      </ControlCard>

      <SummaryTable
        powerGroups={powerSummaryGroups}
        gasGroups={gasSummaryGroups}
        loading={loading}
        results={results}
        totalProducts={ALL_REPORT_PRODUCT_COUNT}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <DashboardTabs
          tabs={REPORT_TABS}
          activeValue={activeTab}
          onChange={handleTabChange}
          ariaLabel="ICE term report tabs"
        />
        <span className="text-xs tabular-nums text-gray-500">
          Showing {activeConfig.title} detail tables
        </span>
      </div>

      <ErrorStrip results={results} />
      {activeConfig.markets.map((market) => (
        <MarketSection
          key={market.id}
          market={market}
          products={activeConfig.productsByMarket[market.id] ?? []}
          payloads={payloads}
          matrixYears={matrixYears}
          currentYear={currentYear}
          loading={loading}
        />
      ))}
    </div>
  );
}
