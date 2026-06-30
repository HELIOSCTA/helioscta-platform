"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import PjmTermBible from "@/components/pjm/PjmTermBible";
import type {
  MarketOption,
  PjmTermBibleExternalFilters,
  TermBibleMode,
  TermPeriod,
} from "@/components/pjm/PjmTermBible";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type Market = "RT_VERIFIED" | "RT_UNVERIFIED" | "DA" | "DART";
type HistoricalTab = "settlements" | "term-bible";
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

function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;
}

function marketShortLabel(market: Market): string {
  if (market === "RT_VERIFIED") return "RT Verified";
  if (market === "RT_UNVERIFIED") return "RT Unverified";
  return market;
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

export default function PjmHistoricalSettlements({
  refreshToken = 0,
  initialTab = "settlements",
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

  const termBibleFilters = useMemo<PjmTermBibleExternalFilters>(
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

  useEffect(() => {
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
    if (initialTab === "term-bible" && strip === "all") {
      setStrip("5x16");
    }
  }, [initialTab, strip]);

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-gray-800 bg-[#0a0f16] p-1 shadow-xl shadow-black/20">
        {[
          { key: "settlements", label: "Historical Settlements" },
          { key: "term-bible", label: "Term Bible" },
        ].map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                if (tab.key === "term-bible" && strip === "all") {
                  setStrip("5x16");
                }
                setActiveTab(tab.key as HistoricalTab);
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
              Historical Settlements
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
