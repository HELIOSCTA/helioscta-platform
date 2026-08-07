"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import DashboardTabs, { type DashboardTabOption } from "@/components/dashboard/DashboardTabs";
import DataTableShell from "@/components/dashboard/DataTableShell";
import PjmTermBible from "@/components/pjm/PjmTermBible";
import type {
  MarketOption,
  PjmTermBibleExternalFilters,
  TermBibleMode,
  TermPeriod,
} from "@/components/pjm/PjmTermBible";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type Market = "RT_VERIFIED" | "RT_UNVERIFIED" | "DA" | "DART";
type HistoricalTab = "mtd-summary" | "term-bible" | "settlements";
type VisibleHistoricalTab = "mtd-summary" | "term-bible";
type ComponentKey = "total" | "energy" | "congestion" | "loss";
type ViewMode = TermBibleMode;
type Strip = "all" | TermPeriod;
type ValueMap = Record<string, number | null>;
type CountMap = Record<string, number>;

interface SettlementBlock {
  key: string;
  label: string;
  code: string;
  description: string;
  values: ValueMap;
  counts: CountMap;
  mean: number | null;
  median: number | null;
}

interface HourlyBreakdownRow {
  hourEnding: number;
  values: ValueMap;
  counts: CountMap;
  mean: number | null;
  median: number | null;
}

interface ScarcityHourRow {
  rank: number;
  date: string;
  datetimeBeginningEpt: string;
  year: number;
  hourEnding: number;
  price: number | null;
  total: number | null;
  energy: number | null;
  congestion: number | null;
  loss: number | null;
}

interface HistoricalSettlementsPayload {
  iso: "pjm";
  market: Market;
  component: ComponentKey;
  location: string;
  month: number;
  monthLabel: string;
  startYear: number;
  endYear: number;
  years: number[];
  sourceTable: string;
  asOf: string | null;
  rowCount: number;
  minDate: string | null;
  maxDate: string | null;
  settlementBlocks: SettlementBlock[];
  hourlyBreakdown: HourlyBreakdownRow[];
  scarcityHours: ScarcityHourRow[];
  metadata: {
    availableLocations: readonly string[];
    holidayAdjustment: string;
    maxYearSpan: number;
    scarcityLimit: number;
    view: ViewMode;
    period: Strip;
    periodDefinition: string;
    spread?: {
      fromLocation: string;
      toLocation: string;
      formula: string;
    };
  };
}

interface ProductSettlesSummaryRow {
  product: string;
  contract: string;
  contractCode: string | null;
  contractType: string | null;
  productName: string;
  description: string | null;
  hub: string;
  pjmPnodeName: string;
  market: "DA" | "RT";
  shape: string;
  period: TermPeriod;
  hours: string;
  mtdAvg: number | null;
  obs: number;
  hourlyObs: number;
  expectedDays: number;
  expectedHours: number;
  status: "Complete" | "Partial" | "Missing" | "No hours";
  iceProductUrl: string | null;
  metadataStatus: string | null;
  registrySource: string;
  minDate: string | null;
  maxDate: string | null;
  asOf: string | null;
}

interface ProductSettlesSummaryPayload {
  iso: "pjm";
  source: string;
  marketTimeZone: string;
  startDate: string;
  endDate: string;
  component: ComponentKey;
  rtSource: "verified" | "unverified";
  rowCount: number;
  rows: ProductSettlesSummaryRow[];
  metadata: {
    registryGeneratedAt: string | null;
    registryProductCount: number;
    sourceTables: {
      da: string;
      rt: string;
    };
  };
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const CURRENT_YEAR = new Date().getUTCFullYear();
const CURRENT_MONTH = new Date().getUTCMonth() + 1;
const MONTHS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
] as const;
const MARKETS: Array<{ value: Market; label: string }> = [
  { value: "RT_VERIFIED", label: "RT Verified" },
  { value: "RT_UNVERIFIED", label: "RT Unverified" },
  { value: "DA", label: "DA" },
];
const PRODUCT_SETTLES_TABS: Array<DashboardTabOption<VisibleHistoricalTab>> = [
  { value: "mtd-summary", label: "MTD Summary" },
  { value: "term-bible", label: "Term Bible" },
];
const SUMMARY_COMPONENTS: Array<{ value: ComponentKey; label: string }> = [
  { value: "total", label: "Total" },
  { value: "energy", label: "Energy" },
  { value: "congestion", label: "Congestion" },
  { value: "loss", label: "Loss" },
];
const SUMMARY_RT_SOURCES: Array<{ value: "verified" | "unverified"; label: string }> = [
  { value: "verified", label: "Verified RT" },
  { value: "unverified", label: "Unverified RT" },
];
const VIEW_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: "single", label: "Single" },
  { value: "spread", label: "Spread" },
];
const STRIP_OPTIONS: Array<{ value: Strip; label: string; shortLabel: string }> = [
  { value: "all", label: "All - All settlement strips, HE1-24", shortLabel: "All" },
  { value: "5x16", label: "5x16 - Business-day HE8-23", shortLabel: "5x16" },
  { value: "7x16", label: "7x16 - All days HE8-23", shortLabel: "7x16" },
  { value: "7x8", label: "7x8 - All days HE1-7, HE24", shortLabel: "7x8" },
  { value: "wrap", label: "Wrap - 7x8 plus weekend HE8-23", shortLabel: "Wrap" },
  { value: "7x24", label: "7x24 - All hours", shortLabel: "7x24" },
];
const DEFAULT_END_YEAR = CURRENT_YEAR;
const DEFAULT_COMPONENT: ComponentKey = "total";
const DEFAULT_SCARCITY_LIMIT = 25;
const DEFAULT_TERM_START_YEAR = 2020;
const DEFAULT_LOCATIONS = [
  "WESTERN HUB",
  "DOMINION HUB",
  "EASTERN HUB",
  "NEW JERSEY HUB",
  "CHICAGO HUB",
  "OHIO HUB",
  "AEP-DAYTON HUB",
  "N ILLINOIS HUB",
  "AEP GEN HUB",
  "ATSI GEN HUB",
  "CHICAGO GEN HUB",
  "WEST INT HUB",
] as const;

type SummarySortKey =
  | "product"
  | "contract"
  | "hub"
  | "market"
  | "shape"
  | "mtdAvg"
  | "obs"
  | "status";
type SummarySortDirection = "asc" | "desc";

interface SummarySortState {
  key: SummarySortKey;
  direction: SummarySortDirection;
}

function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;
}

function fmtSummaryPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function fmtStamp(value: string | null | undefined): string {
  if (!value) return "--";
  return value.replace("T", " ").slice(0, 16);
}

function marketShortLabel(market: Market): string {
  if (market === "RT_VERIFIED") return "RT Verified";
  if (market === "RT_UNVERIFIED") return "RT Unverified";
  return market;
}

function summaryMarketLabel(row: ProductSettlesSummaryRow, rtSource: "verified" | "unverified"): string {
  if (row.market === "DA") return "DA";
  return rtSource === "verified" ? "RT Verified" : "RT Unverified";
}

function termMarketFromSummary(row: ProductSettlesSummaryRow, rtSource: "verified" | "unverified"): MarketOption {
  if (row.market === "DA") return "da";
  return rtSource === "unverified" ? "rt-unverified" : "rt-verified";
}

function statusClass(status: ProductSettlesSummaryRow["status"]): string {
  if (status === "Complete") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (status === "Partial") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (status === "Missing") return "border-red-500/40 bg-red-500/10 text-red-200";
  return "border-gray-700 bg-gray-950/50 text-gray-400";
}

function buildSummaryApiUrl({
  component,
  rtSource,
  endDate,
  refreshToken,
}: {
  component: ComponentKey;
  rtSource: "verified" | "unverified";
  endDate: string | null;
  refreshToken: number;
}): string {
  const params = new URLSearchParams({ component, rtSource });
  if (endDate) params.set("end", endDate);
  if (refreshToken > 0) params.set("refresh", "1");
  return `/api/pjm-product-settles-summary?${params.toString()}`;
}

function summaryCacheKey({
  component,
  rtSource,
  endDate,
}: {
  component: ComponentKey;
  rtSource: "verified" | "unverified";
  endDate: string | null;
}): string {
  return ["api:pjm-product-settles-summary", component, rtSource, endDate ?? "default"].join(":");
}

function compareNullableNumbers(
  left: number | null,
  right: number | null,
  direction: SummarySortDirection,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return direction === "asc" ? 1 : -1;
  if (right === null) return direction === "asc" ? -1 : 1;
  return left - right;
}

function compareSummaryRows(
  left: ProductSettlesSummaryRow,
  right: ProductSettlesSummaryRow,
  sort: SummarySortState,
): number {
  const directionFactor = sort.direction === "asc" ? 1 : -1;
  if (sort.key === "mtdAvg") {
    return compareNullableNumbers(left.mtdAvg, right.mtdAvg, sort.direction) * directionFactor;
  }
  if (sort.key === "obs") return (left.obs - right.obs) * directionFactor;
  const leftValue =
    sort.key === "product" ? left.product :
    sort.key === "contract" ? left.contract :
    sort.key === "hub" ? left.pjmPnodeName :
    sort.key === "market" ? left.market :
    sort.key === "shape" ? left.period :
    left.status;
  const rightValue =
    sort.key === "product" ? right.product :
    sort.key === "contract" ? right.contract :
    sort.key === "hub" ? right.pjmPnodeName :
    sort.key === "market" ? right.market :
    sort.key === "shape" ? right.period :
    right.status;
  return leftValue.localeCompare(rightValue) * directionFactor;
}

function sortIndicator(key: SummarySortKey, sort: SummarySortState): string {
  if (sort.key !== key) return "";
  return sort.direction === "asc" ? " ^" : " v";
}

function marketSlug(market: Market): string {
  return market.toLowerCase().replace(/_/g, "-");
}

function termMarketFromHistoricalMarket(market: Market): MarketOption {
  if (market === "DA") return "da";
  if (market === "RT_UNVERIFIED") return "rt-unverified";
  return "rt-verified";
}

function buildApiUrl({
  view,
  location,
  fromLocation,
  toLocation,
  market,
  period,
  month,
  startYear,
  endYear,
  component,
  scarcityLimit,
  refresh,
}: {
  view: ViewMode;
  location: string;
  fromLocation: string;
  toLocation: string;
  market: Market;
  period: Strip;
  month: number;
  startYear: number;
  endYear: number;
  component: ComponentKey;
  scarcityLimit: number;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({
    view,
    location,
    fromLocation,
    toLocation,
    market,
    period,
    month: String(month),
    startYear: String(startYear),
    endYear: String(endYear),
    component,
    scarcityLimit: String(scarcityLimit),
  });
  if (refresh) params.set("refresh", "1");
  return `/api/pjm-historical-settlements?${params.toString()}`;
}

function cacheKey({
  view,
  location,
  fromLocation,
  toLocation,
  market,
  period,
  month,
  startYear,
  endYear,
  component,
  scarcityLimit,
}: {
  view: ViewMode;
  location: string;
  fromLocation: string;
  toLocation: string;
  market: Market;
  period: Strip;
  month: number;
  startYear: number;
  endYear: number;
  component: ComponentKey;
  scarcityLimit: number;
}): string {
  return [
    "api:pjm-historical-settlements",
    view,
    location,
    fromLocation,
    toLocation,
    market,
    period,
    month,
    startYear,
    endYear,
    component,
    scarcityLimit,
  ].join(":");
}

function yearRange(startYear: number, endYear: number): number[] {
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

function cellValue(values: ValueMap, year: number): string {
  return fmtPrice(values[String(year)]);
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function heatStyle(value: number | null | undefined, min: number, max: number): CSSProperties | undefined {
  if (!isFiniteNumber(value) || !Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return undefined;
  }
  const intensity = Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (intensity >= 0.72) {
    return {
      backgroundColor: "rgba(76, 5, 25, 0.45)",
      color: "rgb(255, 228, 230)",
    };
  }
  if (intensity >= 0.45) {
    return {
      backgroundColor: "rgba(66, 32, 6, 0.35)",
      color: "rgb(254, 249, 195)",
    };
  }
  return {
    backgroundColor: "rgba(2, 44, 34, 0.35)",
    color: "rgb(209, 250, 229)",
  };
}

function countTitle(counts: CountMap, year: number): string {
  const count = counts[String(year)] ?? 0;
  return `${count.toLocaleString()} hourly rows`;
}

function yearHasData(payload: HistoricalSettlementsPayload, year: number): boolean {
  const key = String(year);
  return payload.settlementBlocks.some((row) => (row.counts[key] ?? 0) > 0);
}

function latestYearWithData(payload: HistoricalSettlementsPayload): number | null {
  for (const year of [...payload.years].sort((a, b) => b - a)) {
    if (yearHasData(payload, year)) return year;
  }
  return null;
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function makeCsv(payload: HistoricalSettlementsPayload): string {
  const lines: string[] = [];
  const yearHeaders = payload.years.map(String);

  lines.push("Settlement Blocks");
  lines.push(["Block", "Code", "Description", ...yearHeaders].map(csvEscape).join(","));
  for (const row of payload.settlementBlocks) {
    lines.push(
      [
        row.label,
        row.code,
        row.description,
        ...payload.years.map((year) => row.values[String(year)]),
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  lines.push("");
  lines.push("Hourly Breakdown");
  lines.push(["HE", ...yearHeaders].map(csvEscape).join(","));
  for (const row of payload.hourlyBreakdown) {
    lines.push(
      [
        `HE${row.hourEnding}`,
        ...payload.years.map((year) => row.values[String(year)]),
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  lines.push("");
  lines.push("Scarcity Hours");
  lines.push(["Rank", "Date", "HE", "Price", "Total", "Energy", "Congestion", "Loss"].map(csvEscape).join(","));
  for (const row of payload.scarcityHours) {
    lines.push(
      [
        row.rank,
        row.date,
        `HE${row.hourEnding}`,
        row.price,
        row.total,
        row.energy,
        row.congestion,
        row.loss,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}

function downloadCsv(payload: HistoricalSettlementsPayload): void {
  const blob = new Blob([makeCsv(payload)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pjm-historical-settlements-${payload.location
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}-${marketSlug(payload.market)}-${payload.metadata.period}-${payload.monthLabel.toLowerCase()}-${payload.startYear}-${payload.endYear}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const labelClass = "mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500";
const controlClass =
  "h-10 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 text-sm font-semibold text-gray-100 outline-none transition-colors focus:border-gray-500";
const headerCellClass =
  "border border-gray-800 bg-[#0a0f16] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500";
const bodyCellClass = "border border-gray-900 px-3 py-3 tabular-nums";
const compactBodyCellClass = "border border-gray-900 px-3 py-1.5 tabular-nums";

function Badge({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: "gray" | "green" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
      : tone === "red"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
        : "border-gray-700 bg-gray-950/70 text-gray-300";

  return (
    <span className={`inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-semibold uppercase ${toneClass}`}>
      {children}
    </span>
  );
}

function TableSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-800 bg-[#10151d] shadow-xl shadow-black/20">
      <div className="flex flex-col gap-3 border-b border-gray-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.24em] text-gray-100">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center justify-end gap-2">{action}</div>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  align = "left",
  onSort,
}: {
  label: string;
  sortKey: SummarySortKey;
  sort: SummarySortState;
  align?: "left" | "right";
  onSort: (key: SummarySortKey) => void;
}) {
  return (
    <th className={`px-3 py-2 font-semibold uppercase tracking-wide ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`text-[10px] text-gray-500 transition-colors hover:text-gray-300 ${align === "right" ? "text-right" : "text-left"}`}
      >
        {label}{sortIndicator(sortKey, sort)}
      </button>
    </th>
  );
}

function ProductSettlesMtdSummary({
  onOpenTermBible,
}: {
  onOpenTermBible: (filters: PjmTermBibleExternalFilters) => void;
}) {
  const [component, setComponent] = useState<ComponentKey>("total");
  const [rtSource, setRtSource] = useState<"verified" | "unverified">("verified");
  const [endDateInput, setEndDateInput] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [data, setData] = useState<ProductSettlesSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SummarySortState>({ key: "product", direction: "asc" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const forceRefresh = refreshToken > 0;
    setLoading(true);
    setError(null);

    fetchJsonWithCache<ProductSettlesSummaryPayload>({
      key: summaryCacheKey({ component, rtSource, endDate: appliedEndDate }),
      url: buildSummaryApiUrl({ component, rtSource, endDate: appliedEndDate, refreshToken }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        if (!appliedEndDate) setEndDateInput(payload.endDate);
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setData(null);
        setError(err.message || "Failed to load product settles summary");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [appliedEndDate, component, refreshToken, rtSource]);

  const filteredRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((row) =>
          [
            row.product,
            row.contract,
            row.productName,
            row.hub,
            row.pjmPnodeName,
            row.market,
            row.shape,
            row.hours,
            row.status,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(needle),
        )
      : rows;
    return [...filtered].sort((left, right) => compareSummaryRows(left, right, sort));
  }, [data?.rows, search, sort]);

  const handleSort = (key: SummarySortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };

  const handleLoadEndDate = () => {
    setAppliedEndDate(/^\d{4}-\d{2}-\d{2}$/.test(endDateInput) ? endDateInput : null);
  };

  const handleReset = () => {
    setComponent("total");
    setRtSource("verified");
    setAppliedEndDate(null);
    setEndDateInput("");
    setSearch("");
  };

  const openTermBible = (row: ProductSettlesSummaryRow) => {
    if (!data) return;
    const endYear = Number(data.endDate.slice(0, 4));
    const detailMonth = Number(data.endDate.slice(5, 7));
    onOpenTermBible({
      mode: "single",
      month: detailMonth,
      startYear: Math.min(DEFAULT_TERM_START_YEAR, endYear),
      endYear,
      hub: row.pjmPnodeName,
      spreadFromHub: "WESTERN HUB",
      spreadToHub: "EASTERN HUB",
      market: termMarketFromSummary(row, data.rtSource),
      period: row.period,
      component: data.component,
    });
  };

  const resetVisible =
    component !== "total" ||
    rtSource !== "verified" ||
    appliedEndDate !== null ||
    search.trim().length > 0;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className={labelClass}>Component</span>
            <select
              value={component}
              onChange={(event) => setComponent(event.target.value as ComponentKey)}
              className={controlClass}
            >
              {SUMMARY_COMPONENTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>RT Source</span>
            <select
              value={rtSource}
              onChange={(event) => setRtSource(event.target.value as "verified" | "unverified")}
              className={controlClass}
            >
              {SUMMARY_RT_SOURCES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>End</span>
            <input
              type="date"
              value={endDateInput}
              onChange={(event) => setEndDateInput(event.target.value)}
              className={controlClass}
            />
          </label>
          <button
            type="button"
            onClick={handleLoadEndDate}
            className="h-10 rounded-lg border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Load
          </button>
          <button
            type="button"
            onClick={() => setRefreshToken((value) => value + 1)}
            className="h-10 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20"
          >
            Refresh
          </button>
          {resetVisible && (
            <button
              type="button"
              onClick={handleReset}
              className="h-10 rounded-lg border border-gray-800 bg-gray-950/40 px-3 text-xs font-semibold text-gray-500 transition-colors hover:border-gray-700 hover:text-gray-300"
            >
              Clear Filters
            </button>
          )}
        </div>
        <div className="mt-3 flex min-h-8 flex-wrap items-center gap-2 border-t border-gray-800 pt-3 text-xs text-gray-500">
          <Badge>{data ? `${data.startDate} to ${data.endDate}` : "MTD"}</Badge>
          <Badge>{SUMMARY_COMPONENTS.find((item) => item.value === component)?.label ?? component}</Badge>
          <Badge>{rtSource === "verified" ? "Verified RT" : "Unverified RT"}</Badge>
          <Badge>{data ? `${data.rowCount} products` : "-- products"}</Badge>
          <span>As of {fmtStamp(data?.rows.map((row) => row.asOf).filter(Boolean).sort().at(-1))}</span>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <DataTableShell
        title="MTD Summary"
        subtitle={
          data
            ? `${data.startDate} to ${data.endDate} | ${data.source}`
            : "PJM product settlement summary"
        }
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter products"
              className="h-8 w-44 rounded-md border border-gray-700 bg-gray-950 px-2.5 text-xs font-semibold text-gray-200 outline-none transition-colors placeholder:text-gray-600 focus:border-gray-500"
            />
            <span className="rounded-md border border-gray-800 bg-gray-950/50 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500">
              {filteredRows.length} rows
            </span>
          </div>
        }
        bodyClassName="bg-[#0d1119]"
      >
        <table className="w-full min-w-[1180px] border-collapse text-xs text-gray-200">
          <thead className="bg-gray-950">
            <tr>
              <SortHeader label="Product" sortKey="product" sort={sort} onSort={handleSort} />
              <SortHeader label="Contract" sortKey="contract" sort={sort} onSort={handleSort} />
              <SortHeader label="Hub" sortKey="hub" sort={sort} onSort={handleSort} />
              <SortHeader label="Market" sortKey="market" sort={sort} onSort={handleSort} />
              <SortHeader label="Shape" sortKey="shape" sort={sort} onSort={handleSort} />
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Hours
              </th>
              <SortHeader label="MTD Avg" sortKey="mtdAvg" sort={sort} align="right" onSort={handleSort} />
              <SortHeader label="Obs" sortKey="obs" sort={sort} align="right" onSort={handleSort} />
              <SortHeader label="Status" sortKey="status" sort={sort} onSort={handleSort} />
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                ICE Link
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading && !data && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-sm text-gray-500">
                  Loading product settles...
                </td>
              </tr>
            )}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-sm text-gray-500">
                  No product rows match the selected filters.
                </td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <tr
                key={`${row.product}-${row.contract}-${row.market}-${row.pjmPnodeName}-${row.period}-${row.iceProductUrl ?? row.registrySource}`}
                tabIndex={0}
                title={`${row.productName} | ${row.registrySource}`}
                onClick={() => openTermBible(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") openTermBible(row);
                }}
                className="cursor-pointer hover:bg-gray-900/70 focus:bg-gray-900/70 focus:outline-none"
              >
                <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2 font-semibold text-gray-100">
                  <div className="flex min-w-[88px] flex-col">
                    <span>{row.product}</span>
                    {row.contractCode && (
                      <span className="text-[10px] font-medium text-gray-600">{row.contractCode}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 font-medium text-gray-300">{row.contract}</td>
                <td className="px-3 py-2">
                  <div className="flex min-w-[150px] flex-col">
                    <span className="font-semibold text-gray-200">{row.pjmPnodeName}</span>
                    <span className="text-[10px] text-gray-600">{row.hub}</span>
                  </div>
                </td>
                <td className="px-3 py-2 font-semibold text-gray-300">{summaryMarketLabel(row, data?.rtSource ?? rtSource)}</td>
                <td className="px-3 py-2">
                  <div className="flex min-w-[86px] flex-col">
                    <span className="font-semibold text-gray-200">{row.period}</span>
                    <span className="text-[10px] text-gray-600">{row.shape}</span>
                  </div>
                </td>
                <td className="max-w-[240px] px-3 py-2 text-[11px] leading-4 text-gray-500">{row.hours}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-100">
                  {fmtSummaryPrice(row.mtdAvg)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-300" title={`${row.hourlyObs}/${row.expectedHours} hours`}>
                  {row.obs}/{row.expectedDays}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusClass(row.status)}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {row.iceProductUrl ? (
                    <a
                      href={row.iceProductUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="font-semibold text-cyan-300 transition-colors hover:text-cyan-100"
                    >
                      ICE
                    </a>
                  ) : (
                    <span className="text-gray-600">--</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableShell>

      {data && (
        <div className="rounded-lg border border-gray-800 bg-[#0d1118] px-3 py-2 text-[11px] text-gray-500">
          Registry {fmtStamp(data.metadata.registryGeneratedAt)} | DA {data.metadata.sourceTables.da} | RT {data.metadata.sourceTables.rt}
        </div>
      )}
    </div>
  );
}

export default function PjmHistoricalSettlements({
  refreshToken = 0,
  initialTab = "mtd-summary",
}: {
  refreshToken?: number;
  initialTab?: HistoricalTab;
}) {
  const [activeTab, setActiveTab] = useState<HistoricalTab>(initialTab);
  const [view, setView] = useState<ViewMode>("single");
  const [location, setLocation] = useState("WESTERN HUB");
  const [fromLocation, setFromLocation] = useState("WESTERN HUB");
  const [toLocation, setToLocation] = useState("EASTERN HUB");
  const [market, setMarket] = useState<Market>("RT_VERIFIED");
  const [strip, setStrip] = useState<Strip>(() =>
    initialTab === "term-bible" ? "5x16" : "all",
  );
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [startYear, setStartYear] = useState(2020);
  const [endYear, setEndYear] = useState(DEFAULT_END_YEAR);
  const [endYearMode, setEndYearMode] = useState<"auto" | "manual">("auto");
  const [data, setData] = useState<HistoricalSettlementsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinnedTermBibleFilters, setPinnedTermBibleFilters] =
    useState<PjmTermBibleExternalFilters | null>(null);

  const effectiveStartYear = Math.min(startYear, endYear);
  const effectiveEndYear = Math.max(startYear, endYear);
  const visibleYears = data?.years ?? yearRange(effectiveStartYear, effectiveEndYear);
  const yearOptions = yearRange(2014, CURRENT_YEAR);
  const availableLocations = data?.metadata.availableLocations ?? DEFAULT_LOCATIONS;
  const displayLocation = view === "spread" ? `${toLocation} - ${fromLocation}` : location;
  const hourlyHeatBoundsByHour = useMemo(() => {
    const bounds = new Map<number, { min: number; max: number }>();
    if (!data) return bounds;

    for (const row of data.hourlyBreakdown) {
      const values = data.years
        .map((year) => row.values[String(year)])
        .filter(isFiniteNumber);
      if (values.length) {
        bounds.set(row.hourEnding, { min: Math.min(...values), max: Math.max(...values) });
      }
    }

    return bounds;
  }, [data]);

  const historicalTermBibleFilters = useMemo<PjmTermBibleExternalFilters>(
    () => ({
      mode: view,
      month,
      startYear: effectiveStartYear,
      endYear: effectiveEndYear,
      hub: location,
      spreadFromHub: fromLocation,
      spreadToHub: toLocation,
      market: termMarketFromHistoricalMarket(market),
      period: strip === "all" ? "5x16" : strip,
      component: DEFAULT_COMPONENT,
    }),
    [effectiveEndYear, effectiveStartYear, fromLocation, location, market, month, strip, toLocation, view],
  );
  const termBibleFilters = pinnedTermBibleFilters ?? historicalTermBibleFilters;

  useEffect(() => {
    if (activeTab !== "settlements") {
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    const request = {
      view,
      location,
      fromLocation,
      toLocation,
      market,
      period: strip,
      month,
      startYear: effectiveStartYear,
      endYear: effectiveEndYear,
      component: DEFAULT_COMPONENT,
      scarcityLimit: DEFAULT_SCARCITY_LIMIT,
    };
    const key = cacheKey(request);
    const url = buildApiUrl({ ...request, refresh: refreshToken > 0 });

    fetchJsonWithCache<HistoricalSettlementsPayload>({
      key,
      url,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setData(null);
        setError(err.message || "Failed to load historical settlements");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    activeTab,
    effectiveEndYear,
    effectiveStartYear,
    fromLocation,
    location,
    market,
    month,
    refreshToken,
    strip,
    toLocation,
    view,
  ]);

  useEffect(() => {
    if (endYearMode !== "auto") return;
    setEndYear(CURRENT_YEAR);
  }, [endYearMode, fromLocation, location, market, month, refreshToken, strip, toLocation, view]);

  useEffect(() => {
    if (!data || endYearMode !== "auto" || effectiveEndYear !== CURRENT_YEAR) return;
    if (yearHasData(data, CURRENT_YEAR)) return;

    const latestYear = latestYearWithData(data);
    if (latestYear !== null && latestYear !== endYear) {
      setEndYear(latestYear);
    }
  }, [data, effectiveEndYear, endYear, endYearMode]);

  const csvAction = data ? (
    <button
      type="button"
      onClick={() => downloadCsv(data)}
      className="h-8 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20"
    >
      Export CSV
    </button>
  ) : null;

  const handleMarketChange = (nextMarket: Market) => {
    setMarket(nextMarket);
  };

  useEffect(() => {
    setActiveTab(initialTab);
    if (initialTab === "term-bible") {
      setStrip((currentStrip) => (currentStrip === "all" ? "5x16" : currentStrip));
    }
  }, [initialTab]);

  const activeVisibleTab: VisibleHistoricalTab =
    activeTab === "term-bible" ? "term-bible" : "mtd-summary";
  const handleVisibleTabChange = (nextTab: VisibleHistoricalTab) => {
    if (nextTab === "term-bible") {
      setStrip((currentStrip) => (currentStrip === "all" ? "5x16" : currentStrip));
    }
    setActiveTab(nextTab);
  };
  const handleOpenTermBible = (filters: PjmTermBibleExternalFilters) => {
    setPinnedTermBibleFilters(filters);
    setView(filters.mode);
    setMonth(filters.month);
    setStartYear(filters.startYear);
    setEndYear(filters.endYear);
    setLocation(filters.hub);
    setFromLocation(filters.spreadFromHub);
    setToLocation(filters.spreadToHub);
    setStrip(filters.period);
    setMarket(
      filters.market === "da"
        ? "DA"
        : filters.market === "rt-unverified"
          ? "RT_UNVERIFIED"
          : "RT_VERIFIED",
    );
    setActiveTab("term-bible");
  };

  if (activeTab !== "settlements") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-2 shadow-xl shadow-black/20">
          <DashboardTabs
            tabs={PRODUCT_SETTLES_TABS}
            activeValue={activeVisibleTab}
            onChange={handleVisibleTabChange}
            ariaLabel="Power Product Settles views"
          />
        </div>

        {activeTab === "mtd-summary" ? (
          <ProductSettlesMtdSummary onOpenTermBible={handleOpenTermBible} />
        ) : (
          <PjmTermBible externalFilters={termBibleFilters} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-gray-800 bg-[#0a0f16] p-1 shadow-xl shadow-black/20">
        {[
          { key: "settlements", label: "Settlement Blocks" },
          { key: "term-bible", label: "Term Bible" },
        ].map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                const nextTab = tab.key as HistoricalTab;
                if (nextTab === "term-bible") {
                  setStrip((currentStrip) => (
                    currentStrip === "all" ? "5x16" : currentStrip
                  ));
                }
                setActiveTab(nextTab);
              }}
              className={`h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
                selected
                  ? "bg-gray-800 text-gray-100 shadow-inner shadow-black/20"
                  : "text-gray-500 hover:bg-gray-900/60 hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <section className="rounded-lg border border-gray-800 bg-[#0d1118] p-4 shadow-xl shadow-black/20">
        <div className="space-y-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-gray-600">
              Power Product Settles
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-100">
              {displayLocation} {MONTHS.find((item) => item.value === month)?.label} {marketShortLabel(market)}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge>
                {effectiveStartYear}-{effectiveEndYear}
              </Badge>
              <Badge>{STRIP_OPTIONS.find((item) => item.value === strip)?.shortLabel ?? strip}</Badge>
              <Badge tone="green">Actuals</Badge>
              <Badge tone="red">Scarcity Ranked</Badge>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-[96px_112px_minmax(150px,1fr)_minmax(170px,1fr)_minmax(220px,1.2fr)_96px_96px_96px]">
            <label>
              <span className={labelClass}>ISO</span>
              <select value="PJM" disabled onChange={() => undefined} className={controlClass}>
                <option value="PJM">PJM</option>
              </select>
            </label>

            <label>
              <span className={labelClass}>View</span>
              <select
                value={view}
                onChange={(event) => setView(event.target.value as ViewMode)}
                className={controlClass}
              >
                {VIEW_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={labelClass}>Location</span>
              <select
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className={controlClass}
                disabled={view === "spread"}
              >
                {availableLocations.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={labelClass}>Market</span>
              <select
                value={market}
                onChange={(event) => handleMarketChange(event.target.value as Market)}
                className={controlClass}
              >
                {MARKETS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={labelClass}>Strip</span>
              <select
                value={strip}
                onChange={(event) => setStrip(event.target.value as Strip)}
                className={controlClass}
              >
                {STRIP_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={labelClass}>Month</span>
              <select
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
                className={controlClass}
              >
                {MONTHS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={labelClass}>Start</span>
              <select
                value={startYear}
                onChange={(event) => setStartYear(Number(event.target.value))}
                className={controlClass}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={labelClass}>End</span>
              <select
                value={endYear}
                onChange={(event) => {
                  setEndYearMode("manual");
                  setEndYear(Number(event.target.value));
                }}
                className={controlClass}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            {view === "spread" && (
              <>
              <label>
                <span className={labelClass}>From</span>
                <select
                  value={fromLocation}
                  onChange={(event) => setFromLocation(event.target.value)}
                  className={controlClass}
                >
                  {availableLocations.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelClass}>To</span>
                <select
                  value={toLocation}
                  onChange={(event) => setToLocation(event.target.value)}
                  className={controlClass}
                >
                  {availableLocations.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              </>
            )}
          </div>
        </div>
      </section>

      {activeTab === "term-bible" ? (
        <PjmTermBible tableOnly hideControls externalFilters={termBibleFilters} />
      ) : (
        <>
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {loading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading historical settlements...
        </div>
      )}

      {data && !loading && (
        <>
          <TableSection
            title="Settlement Blocks"
            subtitle={`${data.monthLabel} ${data.metadata.periodDefinition}${data.metadata.spread ? ` | ${data.metadata.spread.formula}` : ""}`}
            action={csvAction}
          >
            <table className="w-full min-w-[980px] border-collapse bg-[#0d1118] text-sm text-gray-100">
              <thead>
                <tr>
                  <th className={`${headerCellClass} sticky left-0 z-20 w-[210px] text-left`}>
                    Block
                  </th>
                  {visibleYears.map((year) => (
                    <th
                      key={year}
                      className={`${headerCellClass} text-right ${year === effectiveEndYear ? "bg-[#151c29] text-gray-100" : ""}`}
                    >
                      {year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.settlementBlocks.map((row) => (
                  <tr key={row.key} className="hover:bg-gray-900/60">
                    <td className={`${bodyCellClass} sticky left-0 z-10 w-[210px] bg-[#0d1118] text-left align-middle`}>
                      <div className="border-l border-gray-700 pl-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-100">{row.label}</span>
                          <Badge>{row.code}</Badge>
                          <Badge>{marketShortLabel(data.market)}</Badge>
                        </div>
                        <p className="mt-2 text-[11px] leading-4 text-gray-500">{row.description}</p>
                      </div>
                    </td>
                    {visibleYears.map((year) => (
                      <td
                        key={year}
                        title={countTitle(row.counts, year)}
                        className={`${bodyCellClass} text-right font-semibold text-gray-100 ${year === effectiveEndYear ? "bg-[#101620]" : ""}`}
                      >
                        {cellValue(row.values, year)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableSection>

          <TableSection
            title="Hourly Breakdown"
            subtitle={`${data.monthLabel} ${data.metadata.periodDefinition}`}
          >
            <table className="w-full min-w-[980px] border-collapse bg-[#0d1118] text-sm text-gray-100">
              <thead>
                <tr>
                  <th className={`${headerCellClass} sticky left-0 z-20 w-[56px] text-left`}>
                    HE
                  </th>
                  {visibleYears.map((year) => (
                    <th key={year} className={`${headerCellClass} text-right`}>
                      {year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.hourlyBreakdown.map((row) => (
                  <tr key={row.hourEnding} className="hover:bg-gray-900/60">
                    <td className={`${compactBodyCellClass} sticky left-0 z-10 bg-[#0d1118] text-left font-semibold text-gray-100`}>
                      HE{row.hourEnding}
                    </td>
                    {visibleYears.map((year) => {
                      const value = row.values[String(year)];
                      const bounds = hourlyHeatBoundsByHour.get(row.hourEnding);
                      return (
                        <td
                          key={year}
                          title={countTitle(row.counts, year)}
                          className={`${compactBodyCellClass} text-right font-semibold text-gray-200`}
                          style={heatStyle(value, bounds?.min ?? Number.NaN, bounds?.max ?? Number.NaN)}
                        >
                          {fmtPrice(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableSection>

          <TableSection
            title="Scarcity Hours"
            subtitle={`Top settled hourly ${data.component} prices | ${data.metadata.periodDefinition}`}
          >
            <table className="w-full min-w-[900px] border-collapse bg-[#0d1118] text-sm text-gray-100">
              <thead>
                <tr>
                  {["Rank", "Date", "HE", "Price", "Energy", "Cong", "Loss", "Total"].map((label) => (
                    <th
                      key={label}
                      className={`${headerCellClass} text-right first:text-left`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.scarcityHours.map((row) => (
                  <tr key={`${row.rank}-${row.datetimeBeginningEpt}`} className="hover:bg-gray-900/60">
                    <td className={`${compactBodyCellClass} text-left font-semibold text-gray-100`}>{row.rank}</td>
                    <td className={`${compactBodyCellClass} text-right`}>{row.date}</td>
                    <td className={`${compactBodyCellClass} text-right`}>HE{row.hourEnding}</td>
                    <td className={`${compactBodyCellClass} text-right font-semibold text-rose-100`}>
                      {fmtPrice(row.price)}
                    </td>
                    <td className={`${compactBodyCellClass} text-right`}>{fmtPrice(row.energy)}</td>
                    <td className={`${compactBodyCellClass} text-right`}>{fmtPrice(row.congestion)}</td>
                    <td className={`${compactBodyCellClass} text-right`}>{fmtPrice(row.loss)}</td>
                    <td className={`${compactBodyCellClass} text-right`}>{fmtPrice(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableSection>
        </>
      )}
        </>
      )}
    </div>
  );
}
