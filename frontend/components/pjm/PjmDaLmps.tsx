"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DashboardTabs, { type DashboardTabOption } from "@/components/dashboard/DashboardTabs";
import PlotCard, { type PlotSeries } from "@/components/dashboard/PlotCard";
import LmpColumnFilterMenu, {
  EMPTY_COLUMN_FILTER,
  type ColumnFilters,
  matchesColumnFilter,
  uniqueColumnOptions,
  updateColumnFilter,
} from "@/components/pjm/LmpColumnFilterMenu";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import { buildPjmDaSingleDateReport } from "@/lib/pjm-da-lmps/single-date-view";

interface HourlyLmp {
  hourEnding: number;
  datetimeBeginningEpt: string;
  total: number | null;
  systemEnergy: number | null;
  congestion: number | null;
  marginalLoss: number | null;
}

interface HubLmpSummary {
  hub: string;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  flatAvg: number | null;
  peakHour: number | null;
  peakPrice: number | null;
  hourly: HourlyLmp[];
}

interface PjmLmpsPayload {
  iso: PowerIso;
  isoLabel: string;
  defaultHub?: string;
  supportsComponents?: boolean;
  targetDate: string;
  latestDate: string | null;
  asOf: string | null;
  source: string;
  rtSource?: RtLmpSource;
  hubs: HubLmpSummary[];
}

export interface PjmDaLmpsFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

const HOURS = Array.from({ length: 24 }, (_, index) => index + 1);
const API_CACHE_TTL_MS = 5 * 60 * 1000;

export type ComponentKey = "energy" | "congestion" | "loss" | "total";
export type ComponentSelection = ComponentKey | "all";
export type PowerIso = "pjm" | "ercot" | "isone";
export type LmpProduct = "da" | "rt" | "dart";
export type LmpView = "single-day" | "compare-dates" | "compare-hubs" | "daily-settles";
export type RtLmpSource = "verified" | "unverified";

const PEAK_WINDOW_BY_ISO: Record<PowerIso, { start: number; end: number }> = {
  pjm: { start: 8, end: 23 },
  ercot: { start: 7, end: 22 },
  isone: { start: 8, end: 23 },
};

function onPeakHoursForIso(iso: PowerIso): number[] {
  const window = PEAK_WINDOW_BY_ISO[iso];
  return HOURS.filter((hour) => hour >= window.start && hour <= window.end);
}

function offPeakHoursForIso(iso: PowerIso): number[] {
  const window = PEAK_WINDOW_BY_ISO[iso];
  return HOURS.filter((hour) => hour < window.start || hour > window.end);
}

function isOnPeakHour(iso: PowerIso, hourEnding: number): boolean {
  const window = PEAK_WINDOW_BY_ISO[iso];
  return hourEnding >= window.start && hourEnding <= window.end;
}

type SettleDayType = "all" | "weekday" | "weekend" | "holiday";
type SettleSortDirection = "asc" | "desc";
// Sort/selection column keys for the daily settles grid: the three period summaries
// plus one per hour-ending ("he1" … "he24"). "date" sorts the leading column.
type SettleColumnKey = "onpeak" | "offpeak" | "flat" | `he${number}`;
type SettleSortKey = "date" | SettleColumnKey;
type SettleFilterKey = "dayType" | SettleSortKey;
type MetricTableId = "single-day" | "compare-dates" | "compare-hubs";
interface SettleSortState {
  key: SettleSortKey;
  direction: SettleSortDirection;
}

interface LastMetricCell {
  tableId: MetricTableId;
  rowKey: string;
  column: SettleColumnKey;
}

interface SelectionStats {
  cells: number;
  observations: number;
  avg: number | null;
  sum: number | null;
  min: number | null;
  max: number | null;
}

interface ComponentConfig {
  key: ComponentKey;
  label: string;
  color: string;
  getValue: (row: HourlyLmp) => number | null;
}

interface ComponentRow {
  key: string;
  label: string;
  color: string;
  values: Map<number, number | null>;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  flatAvg: number | null;
  min: number;
  max: number;
}

interface LmpSourceFeed {
  iso: PowerIso;
  market: string;
  sourceLabel: string;
  sourceUrl: string;
}

interface PjmLmpSettleDayRow {
  date: string;
  hub: string;
  isWeekend: boolean;
  isNercHoliday: boolean;
  holidayName: string | null;
  // 24-element arrays indexed by hour-ending (HE1 at index 0 … HE24 at index 23),
  // carrying the selected component's value for that hour.
  daHourly: Array<number | string | null>;
  rtHourly: Array<number | string | null>;
  daAsOf: string | null;
  rtAsOf: string | null;
}

interface PjmLmpSettlesPayload {
  startDate: string;
  endDate: string;
  hub: string;
  component: ComponentKey;
  rtSource: RtLmpSource | "best";
  rowCount: number;
  summary: {
    rowCount: number;
    latestDate: string | null;
    latestAsOf: string | null;
  };
  rows: PjmLmpSettleDayRow[];
}

const COMPONENTS: ComponentConfig[] = [
  {
    key: "energy",
    label: "Energy",
    color: "#38bdf8",
    getValue: (row) => row.systemEnergy,
  },
  {
    key: "congestion",
    label: "Congestion",
    color: "#f97316",
    getValue: (row) => row.congestion,
  },
  {
    key: "loss",
    label: "Loss",
    color: "#a78bfa",
    getValue: (row) => row.marginalLoss,
  },
  {
    key: "total",
    label: "Total",
    color: "#e5e7eb",
    getValue: (row) => row.total,
  },
];

const PLOT_SERIES: PlotSeries[] = COMPONENTS.map((component) => ({
  key: component.key,
  label: component.label,
  color: component.color,
  defaultVisible: true,
}));

const COMPARISON_COLORS = {
  reference: "#38bdf8",
  compare: "#f97316",
  delta: "#22c55e",
} as const;

const PRODUCT_LABELS: Record<LmpProduct, string> = {
  da: "DA LMPs",
  rt: "RT",
  dart: "DART",
};

const ISO_LABELS: Record<PowerIso, string> = {
  pjm: "PJM",
  ercot: "ERCOT",
  isone: "ISO-NE",
};

const ISO_DEFAULT_HUBS: Record<PowerIso, string> = {
  pjm: "WESTERN HUB",
  ercot: "HB_NORTH",
  isone: ".H.INTERNAL_HUB",
};

const ISO_TABS: Array<DashboardTabOption<PowerIso>> = [
  { value: "pjm", label: "PJM" },
  { value: "ercot", label: "ERCOT" },
  { value: "isone", label: "ISO-NE" },
];

const TOTAL_COMPONENT = COMPONENTS.find((component) => component.key === "total") ?? COMPONENTS[3];

const RT_SOURCE_LABELS_BY_ISO: Record<PowerIso, Record<RtLmpSource, string>> = {
  pjm: {
    verified: "Verified Hourly",
    unverified: "Unverified Hourly",
  },
  ercot: {
    verified: "Hourly Avg",
    unverified: "Hourly Avg",
  },
  isone: {
    verified: "Final Hourly",
    unverified: "Prelim Hourly",
  },
};

const LMP_SOURCE_FEEDS: LmpSourceFeed[] = [
  {
    iso: "pjm",
    market: "DA hourly",
    sourceLabel: "PJM Data Miner da_hrl_lmps",
    sourceUrl: "https://dataminer2.pjm.com/feed/da_hrl_lmps/definition",
  },
  {
    iso: "pjm",
    market: "RT verified hourly",
    sourceLabel: "PJM Data Miner rt_hrl_lmps",
    sourceUrl: "https://dataminer2.pjm.com/feed/rt_hrl_lmps/definition",
  },
  {
    iso: "pjm",
    market: "RT unverified hourly",
    sourceLabel: "PJM Data Miner rt_unverified_hrl_lmps",
    sourceUrl: "https://dataminer2.pjm.com/feed/rt_unverified_hrl_lmps/definition",
  },
  {
    iso: "ercot",
    market: "DAM settlement point",
    sourceLabel: "ERCOT NP4-190-CD",
    sourceUrl: "https://www.ercot.com/mp/data-products/data-product-details?id=NP4-190-CD",
  },
  {
    iso: "ercot",
    market: "RT settlement point",
    sourceLabel: "ERCOT NP6-905-CD",
    sourceUrl: "https://www.ercot.com/mp/data-products/data-product-details?id=NP6-905-CD",
  },
  {
    iso: "isone",
    market: "DA hourly",
    sourceLabel: "ISO-NE Hourly Day-Ahead LMPs",
    sourceUrl: "https://www.iso-ne.com/isoexpress/web/reports/pricing/-/tree/lmps-da-hourly",
  },
  {
    iso: "isone",
    market: "RT final hourly",
    sourceLabel: "ISO-NE Final Real-Time Hourly LMPs",
    sourceUrl:
      "https://www.iso-ne.com/isoexpress/web/reports/pricing/-/tree/lmps-rt-hourly-final",
  },
  {
    iso: "isone",
    market: "RT preliminary hourly",
    sourceLabel: "ISO-NE Preliminary Real-Time Hourly LMPs",
    sourceUrl:
      "https://www.iso-ne.com/isoexpress/web/reports/pricing/-/tree/lmps-rt-hourly-prelim",
  },
];

const LMP_VIEW_TABS: Array<DashboardTabOption<LmpView>> = [
  { value: "daily-settles", label: "Daily Settles" },
  { value: "single-day", label: "Single Day" },
  { value: "compare-dates", label: "Compare Dates" },
  { value: "compare-hubs", label: "Compare Hubs" },
];

const SETTLE_DAY_TYPE_LABELS: Record<SettleDayType, string> = {
  all: "All",
  weekday: "Weekday",
  weekend: "Weekend",
  holiday: "Holiday",
};
const METRIC_TABLE_COLUMNS: SettleColumnKey[] = [
  "onpeak",
  "offpeak",
  "flat",
  ...HOURS.map((hour) => `he${hour}` as SettleColumnKey),
];

function settleCellKey(date: string, column: SettleColumnKey): string {
  return `${date}|${column}`;
}

function metricCellKey(tableId: MetricTableId, rowKey: string, column: SettleColumnKey): string {
  return `${tableId}|${rowKey}|${column}`;
}

function fmtPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `$${value.toFixed(2)}`;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmtStamp(value: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function todayDate(): string {
  const date = new Date();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function offsetDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildLmpsApiUrl({
  iso,
  product,
  date,
  rtSource,
  refresh = false,
}: {
  iso: PowerIso;
  product: LmpProduct;
  date?: string | null;
  rtSource: RtLmpSource;
  refresh?: boolean;
}): string {
  const params = new URLSearchParams({ iso, product: product === "dart" ? "da" : product });
  if (date) params.set("date", date);
  if (product === "rt") params.set("source", rtSource);
  if (refresh) params.set("refresh", "1");

  const query = params.toString();
  return `/api/power-lmps?${query}`;
}

function buildLmpsCacheKey({
  iso,
  product,
  date,
  rtSource,
}: {
  iso: PowerIso;
  product: LmpProduct;
  date?: string | null;
  rtSource: RtLmpSource;
}): string {
  return `api:power-${iso}-${product}-lmps:${product === "rt" ? rtSource : "hourly"}:${date ?? "latest"}`;
}

function buildSettlesApiUrl({
  iso,
  startDate,
  endDate,
  hub,
  component,
  rtSource,
  refresh = false,
}: {
  iso: PowerIso;
  startDate: string;
  endDate: string;
  hub: string;
  component: ComponentKey;
  rtSource: RtLmpSource;
  refresh?: boolean;
}): string {
  const params = new URLSearchParams({
    iso,
    start: startDate,
    end: endDate,
    hub,
    component,
    rtSource,
  });
  if (refresh) params.set("refresh", "1");
  return `/api/power-lmp-settles?${params.toString()}`;
}

function selectedLmpSourceFeeds({
  iso,
  product,
  rtSource,
}: {
  iso: PowerIso;
  product: LmpProduct;
  rtSource: RtLmpSource;
}): LmpSourceFeed[] {
  const daMarketByIso: Record<PowerIso, string> = {
    pjm: "DA hourly",
    ercot: "DAM settlement point",
    isone: "DA hourly",
  };
  const rtMarketByIso: Record<PowerIso, Record<RtLmpSource, string>> = {
    pjm: {
      verified: "RT verified hourly",
      unverified: "RT unverified hourly",
    },
    ercot: {
      verified: "RT settlement point",
      unverified: "RT settlement point",
    },
    isone: {
      verified: "RT final hourly",
      unverified: "RT preliminary hourly",
    },
  };
  const findFeed = (market: string) =>
    LMP_SOURCE_FEEDS.find((feed) => feed.iso === iso && feed.market === market);
  const daFeed = findFeed(daMarketByIso[iso]);
  const rtFeed = findFeed(rtMarketByIso[iso][rtSource]);

  if (product === "da") return daFeed ? [daFeed] : [];
  if (product === "rt") return rtFeed ? [rtFeed] : [];
  return [daFeed, rtFeed].filter((feed): feed is LmpSourceFeed => Boolean(feed));
}

// Resolve a day's 24 hourly values for the active product. DART is the per-hour
// DA - RT difference, matching how the single-day view builds its DART hub.
function settleHourlyForProduct(
  row: PjmLmpSettleDayRow,
  product: LmpProduct
): Array<number | null> {
  const da = HOURS.map((_, index) => toNumber(row.daHourly?.[index] ?? null));
  const rt = HOURS.map((_, index) => toNumber(row.rtHourly?.[index] ?? null));
  if (product === "da") return da;
  if (product === "rt") return rt;
  return HOURS.map((_, index) => subtractValue(da[index], rt[index]));
}

// Plain intraday hour-window averages with no calendar logic. Weekend / holiday
// status is surfaced as a row badge only and never changes the daily block values.
function settlePeriodAverages(
  iso: PowerIso,
  hourly: Array<number | null>
): { onPeak: number | null; offPeak: number | null; flat: number | null } {
  return {
    onPeak: avg(onPeakHoursForIso(iso).map((hour) => hourly[hour - 1] ?? null)),
    offPeak: avg(offPeakHoursForIso(iso).map((hour) => hourly[hour - 1] ?? null)),
    flat: avg(hourly),
  };
}

function settleDayAsOf(row: PjmLmpSettleDayRow, product: LmpProduct): string | null {
  if (product === "da") return row.daAsOf;
  if (product === "rt") return row.rtAsOf;
  return maxStamp(row.daAsOf, row.rtAsOf);
}

// Read a settles grid cell value by column key (summary or "heN" hour column).
function settleColumnValue(
  day: {
    onPeak: number | null;
    offPeak: number | null;
    flat: number | null;
    hourly: Array<number | null>;
  },
  column: SettleColumnKey
): number | null {
  if (column === "onpeak") return day.onPeak;
  if (column === "offpeak") return day.offPeak;
  if (column === "flat") return day.flat;
  const hour = Number(column.slice(2));
  return Number.isFinite(hour) ? day.hourly[hour - 1] ?? null : null;
}

function settleDayTypeLabels(day: {
  isWeekend: boolean;
  isNercHoliday: boolean;
}): string[] {
  const labels: string[] = [];
  if (!day.isWeekend && !day.isNercHoliday) labels.push(SETTLE_DAY_TYPE_LABELS.weekday);
  if (day.isWeekend) labels.push(SETTLE_DAY_TYPE_LABELS.weekend);
  if (day.isNercHoliday) labels.push(SETTLE_DAY_TYPE_LABELS.holiday);
  return labels;
}

function settleFilterValue(
  day: {
    date: string;
    onPeak: number | null;
    offPeak: number | null;
    flat: number | null;
    hourly: Array<number | null>;
  },
  key: SettleSortKey
): string {
  if (key === "date") return day.date;
  return fmtPrice(settleColumnValue(day, key));
}

function componentRowColumnValue(row: ComponentRow, column: SettleColumnKey): number | null {
  if (column === "onpeak") return row.onPeakAvg;
  if (column === "offpeak") return row.offPeakAvg;
  if (column === "flat") return row.flatAvg;
  const hour = Number(column.slice(2));
  return Number.isFinite(hour) ? row.values.get(hour) ?? null : null;
}

function buildSelectionStats(
  selectedKeys: Set<string>,
  visibleValues: Map<string, number | null>
): SelectionStats | null {
  const visibleSelectedKeys = Array.from(selectedKeys).filter((key) => visibleValues.has(key));
  if (visibleSelectedKeys.length === 0) return null;

  const values = visibleSelectedKeys
    .map((key) => visibleValues.get(key) ?? null)
    .filter((value): value is number => value !== null);
  const sum = values.reduce((total, value) => total + value, 0);

  return {
    cells: visibleSelectedKeys.length,
    observations: values.length,
    avg: values.length > 0 ? sum / values.length : null,
    sum: values.length > 0 ? sum : null,
    min: values.length > 0 ? Math.min(...values) : null,
    max: values.length > 0 ? Math.max(...values) : null,
  };
}

function subtractValue(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  return left - right;
}

function maxStamp(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value !== null);
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function buildTableRow({
  key,
  label,
  color,
  values,
  iso,
}: {
  key: string;
  label: string;
  color: string;
  values: Map<number, number | null>;
  iso: PowerIso;
}): ComponentRow {
  const allValues = HOURS.map((hour) => values.get(hour) ?? null);
  const nums = allValues.filter((value): value is number => value !== null);

  return {
    key,
    label,
    color,
    values,
    onPeakAvg: avg(onPeakHoursForIso(iso).map((hour) => values.get(hour) ?? null)),
    offPeakAvg: avg(offPeakHoursForIso(iso).map((hour) => values.get(hour) ?? null)),
    flatAvg: avg(allValues),
    min: nums.length > 0 ? Math.min(...nums) : 0,
    max: nums.length > 0 ? Math.max(...nums) : 0,
  };
}

function heatStyle(value: number | null, min: number, max: number): React.CSSProperties {
  if (value === null || min === max) return {};
  const midpoint = (min + max) / 2;
  const spread = Math.max(Math.abs(max - midpoint), Math.abs(midpoint - min));
  if (spread === 0) return {};

  const neutralBand = 0.14;
  const distance = Math.min(Math.abs(value - midpoint) / spread, 1);
  if (distance < neutralBand) return {};

  const intensity = (distance - neutralBand) / (1 - neutralBand);
  const alpha = 0.04 + intensity * 0.16;
  const [r, g, b] = value >= midpoint ? [22, 163, 74] : [220, 38, 38];
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`,
    boxShadow: `inset 2px 0 0 rgba(${r}, ${g}, ${b}, ${(alpha + 0.14).toFixed(2)})`,
    color: "#e5e7eb",
  };
}

function deltaHeatStyle(value: number | null, maxAbs: number): React.CSSProperties {
  if (value === null || maxAbs === 0) return {};

  const neutralBand = 0.08;
  const distance = Math.min(Math.abs(value) / maxAbs, 1);
  if (distance < neutralBand) return {};

  const intensity = (distance - neutralBand) / (1 - neutralBand);
  const alpha = 0.05 + intensity * 0.18;
  const [r, g, b] = value >= 0 ? [22, 163, 74] : [220, 38, 38];
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`,
    boxShadow: `inset 2px 0 0 rgba(${r}, ${g}, ${b}, ${(alpha + 0.14).toFixed(2)})`,
    color: "#e5e7eb",
  };
}

function tableHeatStyle(row: ComponentRow, value: number | null): React.CSSProperties {
  if (row.key !== "delta") return heatStyle(value, row.min, row.max);
  return deltaHeatStyle(value, Math.max(Math.abs(row.min), Math.abs(row.max)));
}

function fallbackHourStamp(targetDate: string, hourEnding: number): string {
  const hourBeginning = `${hourEnding - 1}`.padStart(2, "0");
  return `${targetDate}T${hourBeginning}:00:00`;
}

function buildDartHub(
  iso: PowerIso,
  hubName: string,
  daHub: HubLmpSummary | null,
  rtHub: HubLmpSummary | null,
  targetDate: string
): HubLmpSummary {
  const hourly = HOURS.map((hour) => {
    const daRow = daHub?.hourly.find((row) => row.hourEnding === hour) ?? null;
    const rtRow = rtHub?.hourly.find((row) => row.hourEnding === hour) ?? null;

    return {
      hourEnding: hour,
      datetimeBeginningEpt:
        daRow?.datetimeBeginningEpt ??
        rtRow?.datetimeBeginningEpt ??
        fallbackHourStamp(targetDate, hour),
      total: subtractValue(daRow?.total ?? null, rtRow?.total ?? null),
      systemEnergy: subtractValue(daRow?.systemEnergy ?? null, rtRow?.systemEnergy ?? null),
      congestion: subtractValue(daRow?.congestion ?? null, rtRow?.congestion ?? null),
      marginalLoss: subtractValue(daRow?.marginalLoss ?? null, rtRow?.marginalLoss ?? null),
    };
  });

  const onPeak = hourly.filter((row) => isOnPeakHour(iso, row.hourEnding));
  const offPeak = hourly.filter((row) => !isOnPeakHour(iso, row.hourEnding));
  const peak = hourly.reduce<HourlyLmp | null>((best, row) => {
    if (row.total === null) return best;
    if (!best || best.total === null || row.total > best.total) return row;
    return best;
  }, null);

  return {
    hub: hubName,
    onPeakAvg: avg(onPeak.map((row) => row.total)),
    offPeakAvg: avg(offPeak.map((row) => row.total)),
    flatAvg: avg(hourly.map((row) => row.total)),
    peakHour: peak?.hourEnding ?? null,
    peakPrice: peak?.total ?? null,
    hourly,
  };
}

function buildDartPayload(
  iso: PowerIso,
  daPayload: PjmLmpsPayload,
  rtPayload: PjmLmpsPayload,
  rtSource: RtLmpSource
): PjmLmpsPayload {
  const targetDate = daPayload.targetDate;
  const hubNames = daPayload.hubs.map((hub) => hub.hub);
  const hubs = hubNames.map((hubName) =>
    buildDartHub(
      iso,
      hubName,
      daPayload.hubs.find((hub) => hub.hub === hubName) ?? null,
      rtPayload.hubs.find((hub) => hub.hub === hubName) ?? null,
      targetDate
    )
  );

  return {
    iso,
    isoLabel: daPayload.isoLabel,
    defaultHub: daPayload.defaultHub,
    supportsComponents: daPayload.supportsComponents,
    targetDate,
    latestDate: rtPayload.latestDate,
    asOf: maxStamp(daPayload.asOf, rtPayload.asOf),
    source: `${iso}.dart_lmps`,
    rtSource,
    hubs,
  };
}

function fetchDirectLmpsPayload({
  iso,
  product,
  date,
  rtSource,
  signal,
  cacheMode = "default",
  forceRefresh = false,
}: {
  iso: PowerIso;
  product: Exclude<LmpProduct, "dart">;
  date?: string | null;
  rtSource: RtLmpSource;
  signal?: AbortSignal;
  cacheMode?: RequestCache;
  forceRefresh?: boolean;
}): Promise<PjmLmpsPayload> {
  return fetchJsonWithCache<PjmLmpsPayload>({
    key: buildLmpsCacheKey({ iso, product, date, rtSource }),
    url: buildLmpsApiUrl({ iso, product, date, rtSource, refresh: forceRefresh }),
    ttlMs: API_CACHE_TTL_MS,
    signal,
    cacheMode,
    forceRefresh,
  });
}

async function fetchLmpsPayload({
  iso,
  product,
  date,
  rtSource,
  signal,
  cacheMode = "default",
  forceRefresh = false,
}: {
  iso: PowerIso;
  product: LmpProduct;
  date?: string | null;
  rtSource: RtLmpSource;
  signal?: AbortSignal;
  cacheMode?: RequestCache;
  forceRefresh?: boolean;
}): Promise<PjmLmpsPayload> {
  if (product !== "dart") {
    return fetchDirectLmpsPayload({
      iso,
      product,
      date,
      rtSource,
      signal,
      cacheMode,
      forceRefresh,
    });
  }

  const rtSeed = await fetchDirectLmpsPayload({
    iso,
    product: "rt",
    date,
    rtSource,
    signal,
    cacheMode,
    forceRefresh,
  });
  const targetDate = date ?? rtSeed.targetDate;
  const [daPayload, rtPayload] = await Promise.all([
    fetchDirectLmpsPayload({
      iso,
      product: "da",
      date: targetDate,
      rtSource,
      signal,
      cacheMode,
      forceRefresh,
    }),
    rtSeed.targetDate === targetDate
      ? Promise.resolve(rtSeed)
      : fetchDirectLmpsPayload({
          iso,
          product: "rt",
          date: targetDate,
          rtSource,
          signal,
          cacheMode,
          forceRefresh,
        }),
  ]);

  return buildDartPayload(iso, daPayload, rtPayload, rtSource);
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-gray-800 bg-gray-950/40 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gray-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-600">{sub}</p>}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
        </div>
        {action}
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

function LmpComponentCard({
  value,
  onChange,
  allowAll = false,
  components = COMPONENTS,
}: {
  value: ComponentSelection;
  onChange: (value: ComponentSelection) => void;
  allowAll?: boolean;
  components?: ComponentConfig[];
}) {
  const options: Array<{ key: ComponentSelection; label: string; color?: string }> = [
    ...(allowAll ? [{ key: "all" as const, label: "All Components" }] : []),
    ...components.map((component) => ({
      key: component.key,
      label: component.label,
      color: component.color,
    })),
  ];

  return (
    <SectionCard title="LMP Component">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="LMP component">
        {options.map((option) => {
          const selected = value === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.key)}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                selected
                  ? "border-sky-500/50 bg-sky-500/10 text-white"
                  : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
              }`}
            >
              {option.color && (
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: option.color }}
                  aria-hidden="true"
                />
              )}
              {option.label}
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

function RtDatasetCard({
  iso,
  value,
  onChange,
}: {
  iso: PowerIso;
  value: RtLmpSource;
  onChange: (value: RtLmpSource) => void;
}) {
  const options: RtLmpSource[] = iso === "ercot" ? ["unverified"] : ["unverified", "verified"];
  const labels = RT_SOURCE_LABELS_BY_ISO[iso];

  return (
    <SectionCard title="RT Dataset" subtitle="Real-time LMP source">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="RT LMP dataset">
        {options.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option)}
              className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                selected
                  ? "border-sky-500/50 bg-sky-500/10 text-white"
                  : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
              }`}
            >
              {labels[option]}
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

function LmpSourceLinksModal({
  open,
  activeIso,
  onClose,
}: {
  open: boolean;
  activeIso: PowerIso;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lmp-source-links-title"
        className="max-h-[82vh] w-full max-w-3xl overflow-hidden rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl shadow-black"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-4 py-3">
          <div>
            <h2 id="lmp-source-links-title" className="text-sm font-semibold text-gray-100">
              LMP Source Links
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              DART is derived from the listed DA and selected RT feeds.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close source links"
            className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-100"
          >
            Close
          </button>
        </div>

        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead className="sticky top-0 bg-gray-950 text-[10px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-bold">ISO</th>
                <th className="px-4 py-2 text-left font-bold">Market</th>
                <th className="px-4 py-2 text-left font-bold">Source Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-gray-300">
              {LMP_SOURCE_FEEDS.map((feed) => {
                const active = feed.iso === activeIso;
                return (
                  <tr key={`${feed.iso}-${feed.market}`} className={active ? "bg-sky-500/5" : ""}>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-gray-100">
                      {ISO_LABELS[feed.iso]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">{feed.market}</td>
                    <td className="px-4 py-3 text-xs">
                      <a
                        href={feed.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-300 underline decoration-sky-500/40 underline-offset-4 transition-colors hover:text-sky-100"
                      >
                        {feed.sourceLabel}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SelectedLmpSource({
  feeds,
  sourceTable,
  onOpenAll,
}: {
  feeds: LmpSourceFeed[];
  sourceTable: string;
  onOpenAll: () => void;
}) {
  return (
    <div className="flex w-full justify-start">
      <div className="inline-flex max-w-full flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20 sm:flex-row sm:items-stretch">
        <button
          type="button"
          onClick={onOpenAll}
          className="shrink-0 bg-gray-950/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:bg-gray-900 hover:text-gray-100"
        >
          All Sources
        </button>
        <div className="h-px bg-gray-800 sm:hidden" aria-hidden="true" />
        <div className="hidden w-px bg-gray-800 sm:block" aria-hidden="true" />
        <div className="min-w-0 px-3 py-2 text-left">
          <div className="flex min-w-0 flex-col items-start gap-1 text-xs sm:flex-row sm:items-center sm:gap-2">
            <span className="shrink-0 font-bold uppercase tracking-wider text-gray-500">Selected Source</span>
            {feeds.length > 0 ? (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {feeds.map((feed, index) => (
                  <span
                    key={`${feed.iso}-${feed.market}`}
                    className="inline-flex min-w-0 items-center gap-1.5"
                  >
                    {index > 0 && <span className="text-gray-600">+</span>}
                    <a
                      href={feed.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-w-0 max-w-[260px] items-center rounded-md border border-sky-500/50 bg-sky-500/10 px-2 py-1 font-semibold text-sky-200 underline decoration-sky-300/80 underline-offset-4 shadow-sm shadow-sky-950/40 transition-colors hover:border-sky-300 hover:bg-sky-500/20 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                      title={feed.sourceLabel}
                    >
                      <span className="truncate">{feed.sourceLabel}</span>
                    </a>
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-gray-400">{sourceTable}</span>
            )}
          </div>
          <p className="mt-1 max-w-full truncate text-[11px] text-gray-500">{sourceTable}</p>
        </div>
      </div>
    </div>
  );
}

// Sortable column header for the daily settles grid: click to sort, arrow shows the
// active key + direction (↕ = inactive).
function SettleHeaderButton({
  label,
  sortKey,
  activeSort,
  onSort,
}: {
  label: string;
  sortKey: SettleSortKey;
  activeSort: SettleSortState;
  onSort: (key: SettleSortKey) => void;
}) {
  const active = activeSort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide transition-colors hover:text-gray-200"
    >
      {label}
      <span className={`text-[9px] ${active ? "text-sky-300" : "text-gray-700"}`} aria-hidden="true">
        {active ? (activeSort.direction === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}

function FilteredSettleHeader({
  label,
  sortKey,
  activeSort,
  filterOptions,
  selectedFilters,
  onSort,
  onFilterChange,
  align = "left",
}: {
  label: string;
  sortKey: SettleSortKey;
  activeSort: SettleSortState;
  filterOptions: string[];
  selectedFilters: string[];
  onSort: (key: SettleSortKey) => void;
  onFilterChange: (values: string[]) => void;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`flex min-w-[72px] items-center gap-1.5 ${
        align === "right" ? "justify-end" : "justify-between"
      }`}
    >
      <SettleHeaderButton
        label={label}
        sortKey={sortKey}
        activeSort={activeSort}
        onSort={onSort}
      />
      <LmpColumnFilterMenu
        label={label}
        options={filterOptions}
        selected={selectedFilters}
        onChange={onFilterChange}
      />
    </div>
  );
}

// Selectable price cell for the daily settles grid. Click toggles, shift-click extends
// a range within the same column; selection drives the live stats popover. When
// selected, the sky highlight replaces the heatmap tint.
function SettleCell({
  value,
  date,
  column,
  selected,
  heatmapEnabled,
  heatRange,
  onSelect,
  extraClass = "",
}: {
  value: number | null;
  date: string;
  column: SettleColumnKey;
  selected: boolean;
  heatmapEnabled: boolean;
  heatRange: { min: number; max: number };
  onSelect: (date: string, column: SettleColumnKey, shiftKey: boolean) => void;
  extraClass?: string;
}) {
  const stateClass = selected
    ? "bg-sky-500/25 text-sky-50 outline outline-1 -outline-offset-1 outline-sky-400/70"
    : "text-gray-200 hover:bg-sky-500/10";
  return (
    <td
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={(event) => onSelect(date, column, event.shiftKey)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(date, column, event.shiftKey);
        }
      }}
      className={`cursor-pointer select-none px-2 py-2 text-right tabular-nums transition-colors ${extraClass} ${stateClass}`}
      style={!selected && heatmapEnabled ? heatStyle(value, heatRange.min, heatRange.max) : undefined}
    >
      {fmtPrice(value)}
    </td>
  );
}

function SelectableMetricCell({
  value,
  selected,
  heatmapEnabled,
  heatStyleValue,
  onSelect,
  extraClass = "",
}: {
  value: number | null;
  selected: boolean;
  heatmapEnabled: boolean;
  heatStyleValue: React.CSSProperties;
  onSelect: (shiftKey: boolean) => void;
  extraClass?: string;
}) {
  const stateClass = selected
    ? "bg-sky-500/25 text-sky-50 outline outline-1 -outline-offset-1 outline-sky-400/70"
    : "text-gray-200 hover:bg-sky-500/10";

  return (
    <td
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={(event) => onSelect(event.shiftKey)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(event.shiftKey);
        }
      }}
      className={`cursor-pointer select-none px-2 py-2 text-right tabular-nums transition-colors ${extraClass} ${stateClass}`}
      style={!selected && heatmapEnabled ? heatStyleValue : undefined}
    >
      {fmtPrice(value)}
    </td>
  );
}

function SelectionStatsBar({
  label,
  stats,
  onClear,
  extra,
}: {
  label: string;
  stats: SelectionStats;
  onClear: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100vw-2rem)] max-w-4xl -translate-x-1/2 rounded-lg border border-sky-500/30 bg-[#090d15]/95 px-3 py-2 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-300">
        <span className="font-semibold text-sky-100">{label}</span>
        <span>
          <span className="text-gray-500">Count:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">
            {stats.observations.toLocaleString()}
          </span>
        </span>
        <span>
          <span className="text-gray-500">Avg:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">{fmtPrice(stats.avg)}</span>
        </span>
        <span>
          <span className="text-gray-500">Sum:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">{fmtPrice(stats.sum)}</span>
        </span>
        <span>
          <span className="text-gray-500">Min:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">{fmtPrice(stats.min)}</span>
        </span>
        <span>
          <span className="text-gray-500">Max:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">{fmtPrice(stats.max)}</span>
        </span>
        <span>
          <span className="text-gray-500">Cells:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">
            {stats.cells.toLocaleString()}
          </span>
        </span>
        {extra}
        <button
          type="button"
          onClick={onClear}
          className="ml-auto rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export default function PjmDaLmps({
  initialIso = null,
  initialDate = null,
  initialView = null,
  initialProduct = null,
  initialRtSource = null,
  initialHub = null,
  initialComponent = null,
  refreshToken = 0,
  onFreshnessChange,
}: {
  initialIso?: PowerIso | null;
  initialDate?: string | null;
  initialView?: LmpView | null;
  initialProduct?: LmpProduct | null;
  initialRtSource?: RtLmpSource | null;
  initialHub?: string | null;
  initialComponent?: ComponentSelection | null;
  refreshToken?: number;
  onFreshnessChange?: (freshness: PjmDaLmpsFreshnessSummary) => void;
}) {
  const [activeIso, setActiveIso] = useState<PowerIso>(initialIso ?? "pjm");
  const [activeProduct, setActiveProduct] = useState<LmpProduct>(initialProduct ?? "da");
  const [rtSource, setRtSource] = useState<RtLmpSource>(initialRtSource ?? "unverified");
  const [data, setData] = useState<PjmLmpsPayload | null>(null);
  const [selectedHub, setSelectedHub] = useState(initialHub ?? ISO_DEFAULT_HUBS[activeIso]);
  const [date, setDate] = useState<string | null>(initialDate);
  const [dateInput, setDateInput] = useState("");
  const [activeView, setActiveView] = useState<LmpView>(initialView ?? "daily-settles");
  // Empty until seeded from the latest available date (see the seeding effect below).
  // The settles fetch is gated on these being set, so we never issue a wasted query
  // for a guessed "today" window.
  const [settlesStartDate, setSettlesStartDate] = useState("");
  const [settlesEndDate, setSettlesEndDate] = useState("");
  const [settlesComponent, setSettlesComponent] = useState<ComponentKey>("total");
  const [settlesData, setSettlesData] = useState<PjmLmpSettlesPayload | null>(null);
  const [settlesLoading, setSettlesLoading] = useState(false);
  const [settlesError, setSettlesError] = useState<string | null>(null);
  const [settleColumnFilters, setSettleColumnFilters] =
    useState<ColumnFilters<SettleFilterKey>>({});
  const [settlesSort, setSettlesSort] = useState<SettleSortState>({
    key: "date",
    direction: "desc",
  });
  const [selectedSettleCells, setSelectedSettleCells] = useState<Set<string>>(() => new Set());
  const [lastSelectedSettleCell, setLastSelectedSettleCell] = useState<string | null>(null);
  const [selectedMetricCells, setSelectedMetricCells] = useState<Set<string>>(() => new Set());
  const [lastSelectedMetricCell, setLastSelectedMetricCell] = useState<LastMetricCell | null>(null);
  // Seed the settles range to the latest available date once, the first time PJM data
  // loads — so we don't land on an empty "today" window before settles are posted.
  const settlesRangeSeededRef = useRef(false);
  const isoInitializedRef = useRef(false);
  const [singleComponent, setSingleComponent] = useState<ComponentSelection>(
    initialComponent ?? "all",
  );
  const [compareBaseDate, setCompareBaseDate] = useState(() => todayDate());
  const [compareDate, setCompareDate] = useState(() => offsetDate(todayDate(), -1));
  const [compareComponent, setCompareComponent] = useState<ComponentKey>("total");
  const [compareBaseData, setCompareBaseData] = useState<PjmLmpsPayload | null>(null);
  const [compareData, setCompareData] = useState<PjmLmpsPayload | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareHubA, setCompareHubA] = useState(ISO_DEFAULT_HUBS[activeIso]);
  const [compareHubB, setCompareHubB] = useState(ISO_DEFAULT_HUBS[activeIso]);
  const [compareHubComponent, setCompareHubComponent] = useState<ComponentKey>("total");
  const [latestRefreshToken, setLatestRefreshToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableHeatmapEnabled, setTableHeatmapEnabled] = useState(true);
  const [sourceLinksOpen, setSourceLinksOpen] = useState(false);
  const [hiddenPlotSeries, setHiddenPlotSeries] = useState<Set<string>>(() => new Set());
  const [hiddenCompareSeries, setHiddenCompareSeries] = useState<Set<string>>(() => new Set());
  const [hiddenHubCompareSeries, setHiddenHubCompareSeries] = useState<Set<string>>(
    () => new Set()
  );
  const effectiveRefreshToken = refreshToken + latestRefreshToken;
  const supportsComponents = activeIso !== "ercot";
  const activeComponents = useMemo(
    () => (supportsComponents ? COMPONENTS : [TOTAL_COMPONENT]),
    [supportsComponents],
  );

  useEffect(() => {
    if (!supportsComponents) {
      setSingleComponent("total");
      setSettlesComponent("total");
      setCompareComponent("total");
      setCompareHubComponent("total");
    }
  }, [supportsComponents]);

  useEffect(() => {
    if (!isoInitializedRef.current) {
      isoInitializedRef.current = true;
      return;
    }
    settlesRangeSeededRef.current = false;
    setSettlesStartDate("");
    setSettlesEndDate("");
    setDate(null);
    setSelectedHub(ISO_DEFAULT_HUBS[activeIso]);
    setCompareHubA(ISO_DEFAULT_HUBS[activeIso]);
    setCompareHubB(ISO_DEFAULT_HUBS[activeIso]);
    if (activeIso === "ercot") {
      setRtSource("unverified");
    }
  }, [activeIso]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);
    setData(null);
    fetchLmpsPayload({
      iso: activeIso,
      product: activeProduct,
      date,
      rtSource,
      signal: controller.signal,
      cacheMode: effectiveRefreshToken > 0 ? "no-store" : "default",
      forceRefresh: effectiveRefreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setDateInput(payload.targetDate);
        setCompareBaseDate((prev) => prev || payload.targetDate);
        setCompareDate((prev) => prev || offsetDate(payload.targetDate, -1));
        setSelectedHub((prev) =>
          payload.hubs.some((hub) => hub.hub === prev)
            ? prev
            : (payload.defaultHub ?? payload.hubs[0]?.hub ?? ISO_DEFAULT_HUBS[activeIso])
        );
        setCompareHubA((prev) =>
          payload.hubs.some((hub) => hub.hub === prev)
            ? prev
            : (payload.defaultHub ?? payload.hubs[0]?.hub ?? ISO_DEFAULT_HUBS[activeIso])
        );
        setCompareHubB((prev) => {
          if (payload.hubs.some((hub) => hub.hub === prev)) return prev;
          return (
            payload.hubs.find((hub) => hub.hub === ISO_DEFAULT_HUBS[activeIso])?.hub ??
            payload.hubs[1]?.hub ??
            payload.hubs[0]?.hub ??
            ISO_DEFAULT_HUBS[activeIso]
          );
        });
      })
      .catch((err) => {
        if (!active) return;
        if (err.name !== "AbortError") {
          setError(err.message ?? "Failed to load LMPs");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [activeIso, activeProduct, date, effectiveRefreshToken, rtSource]);

  useEffect(() => {
    if (activeView !== "daily-settles") return;
    // Wait until the range is seeded from the latest date, so the first request targets
    // the populated window rather than a guessed "today" range.
    if (!settlesStartDate || !settlesEndDate) return;

    const controller = new AbortController();
    let active = true;
    const url = buildSettlesApiUrl({
      iso: activeIso,
      startDate: settlesStartDate,
      endDate: settlesEndDate,
      hub: selectedHub,
      component: settlesComponent,
      rtSource,
      refresh: effectiveRefreshToken > 0,
    });

    setSettlesLoading(true);
    setSettlesError(null);
    fetchJsonWithCache<PjmLmpSettlesPayload>({
      key: `power-lmp-settles:${activeIso}:${settlesStartDate}:${settlesEndDate}:${selectedHub}:${settlesComponent}:${rtSource}`,
      url,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: effectiveRefreshToken > 0 ? "no-store" : "default",
      forceRefresh: effectiveRefreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setSettlesData(payload);
      })
      .catch((err) => {
        if (!active) return;
        if (err.name !== "AbortError") {
          setSettlesError(err.message ?? "Failed to load PJM LMP settles");
        }
      })
      .finally(() => {
        if (active) setSettlesLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    activeView,
    activeIso,
    effectiveRefreshToken,
    rtSource,
    selectedHub,
    settlesComponent,
    settlesEndDate,
    settlesStartDate,
  ]);

  // A new settles payload invalidates any prior cell selection (dates/values changed).
  useEffect(() => {
    setSelectedSettleCells(new Set());
    setLastSelectedSettleCell(null);
  }, [settlesData]);

  // Default the settles window to end on the latest available market date (start = 30
  // days prior), seeded once from the PJM single-day payload's latestDate — which is
  // already fetched for the hub grid, so the settles request goes out a single time
  // with a valid range (the API skips its own latest-date lookup). Runs before the
  // user touches the inputs; after that their range is preserved.
  useEffect(() => {
    if (settlesRangeSeededRef.current) return;
    if (!data) return;
    settlesRangeSeededRef.current = true;
    const end = data.latestDate ?? todayDate();
    setSettlesEndDate(end);
    setSettlesStartDate(offsetDate(end, -30));
  }, [data]);

  const selected = useMemo(
    () => (data ? buildPjmDaSingleDateReport(data, selectedHub).selectedHub : null),
    [data, selectedHub]
  );

  const chartData = useMemo(
    () =>
      selected?.hourly.map((row) => ({
        he: row.hourEnding,
        energy: row.systemEnergy,
        congestion: row.congestion,
        loss: row.marginalLoss,
        total: row.total,
      })) ?? [],
    [selected]
  );

  const componentRows = useMemo(
    () => (data ? buildPjmDaSingleDateReport(data, selectedHub).componentRows : []),
    [data, selectedHub]
  );
  const visibleComponentRows = useMemo(
    () =>
      singleComponent === "all"
        ? componentRows.filter((row) => activeComponents.some((component) => component.key === row.key))
        : componentRows.filter(
            (row) =>
              row.key === singleComponent &&
              activeComponents.some((component) => component.key === row.key)
          ),
    [activeComponents, componentRows, singleComponent]
  );
  const singlePlotSeries = useMemo(
    () =>
      singleComponent === "all"
        ? PLOT_SERIES.filter((series) =>
            activeComponents.some((component) => component.key === series.key)
          )
        : PLOT_SERIES.filter(
            (series) =>
              series.key === singleComponent &&
              activeComponents.some((component) => component.key === series.key)
          ),
    [activeComponents, singleComponent]
  );
  const isLatestDay = data?.latestDate && data.targetDate === data.latestDate;
  const freshnessStatus = loading ? "Refreshing" : isLatestDay ? "Current" : "Selected Day";
  const freshnessClass = loading
    ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
    : isLatestDay
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-sky-500/40 bg-sky-500/10 text-sky-200";
  const freshnessSummary = useMemo<PjmDaLmpsFreshnessSummary | null>(() => {
    if (!data) return null;
    const productLabel =
      activeProduct === "dart"
        ? `${ISO_LABELS[activeIso]} DART ${RT_SOURCE_LABELS_BY_ISO[activeIso][rtSource]}`
        : activeProduct === "rt"
        ? `${ISO_LABELS[activeIso]} RT ${RT_SOURCE_LABELS_BY_ISO[activeIso][rtSource]}`
        : `${ISO_LABELS[activeIso]} DA`;
    return {
      status: freshnessStatus,
      statusClass: freshnessClass,
      summary: `${productLabel} day ${data.targetDate}`,
      targetDateLabel: data.targetDate,
      latestDateLabel: data.latestDate ?? "--",
      latestUpdateLabel: fmtStamp(data.asOf),
    };
  }, [activeIso, activeProduct, data, freshnessClass, freshnessStatus, rtSource]);

  useEffect(() => {
    if (freshnessSummary) {
      onFreshnessChange?.(freshnessSummary);
    }
  }, [freshnessSummary, onFreshnessChange]);

  useEffect(() => {
    if (activeView !== "compare-dates" || !compareBaseDate || !compareDate) return;

    const controller = new AbortController();
    let active = true;

    setCompareLoading(true);
    setCompareError(null);
    setCompareBaseData(null);
    setCompareData(null);

    const fetchDate = (targetDate: string) =>
      fetchLmpsPayload({
        iso: activeIso,
        product: activeProduct,
        date: targetDate,
        rtSource,
        signal: controller.signal,
      });

    Promise.all([fetchDate(compareBaseDate), fetchDate(compareDate)])
      .then(([basePayload, comparePayload]) => {
        if (!active) return;
        setCompareBaseData(basePayload);
        setCompareData(comparePayload);
      })
      .catch((err) => {
        if (!active) return;
        if (err.name !== "AbortError") {
          setCompareError(err.message ?? "Failed to load comparison LMPs");
        }
      })
      .finally(() => {
        if (active) setCompareLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [activeIso, activeProduct, activeView, compareBaseDate, compareDate, rtSource]);

  const applyDate = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      setDate(dateInput);
    }
  };
  const tableHeatmapAction = (
    <TableHeatmapToggle
      enabled={tableHeatmapEnabled}
      onToggle={() => setTableHeatmapEnabled((enabled) => !enabled)}
    />
  );

  const compareConfig =
    activeComponents.find((component) => component.key === compareComponent) ?? TOTAL_COMPONENT;
  const compareBaseHub = useMemo(
    () => compareBaseData?.hubs.find((hub) => hub.hub === selectedHub) ?? null,
    [compareBaseData, selectedHub]
  );
  const compareHub = useMemo(
    () => compareData?.hubs.find((hub) => hub.hub === selectedHub) ?? null,
    [compareData, selectedHub]
  );
  const compareChartData = useMemo(
    () =>
      HOURS.map((hour) => {
        const baseRow = compareBaseHub?.hourly.find((row) => row.hourEnding === hour) ?? null;
        const compareRow = compareHub?.hourly.find((row) => row.hourEnding === hour) ?? null;
        const base = baseRow ? compareConfig.getValue(baseRow) : null;
        const compare = compareRow ? compareConfig.getValue(compareRow) : null;
        return {
          he: hour,
          base,
          compare,
          delta: base !== null && compare !== null ? base - compare : null,
        };
      }),
    [compareBaseHub, compareConfig, compareHub]
  );
  const compareTableRows = useMemo(
    () => [
      buildTableRow({
        key: "base",
        label: compareBaseDate || "Reference Date",
        color: COMPARISON_COLORS.reference,
        values: new Map(compareChartData.map((row) => [row.he, row.base] as const)),
        iso: activeIso,
      }),
      buildTableRow({
        key: "compare",
        label: compareDate || "Compare Date",
        color: COMPARISON_COLORS.compare,
        values: new Map(compareChartData.map((row) => [row.he, row.compare] as const)),
        iso: activeIso,
      }),
      buildTableRow({
        key: "delta",
        label: "Delta",
        color: COMPARISON_COLORS.delta,
        values: new Map(compareChartData.map((row) => [row.he, row.delta] as const)),
        iso: activeIso,
      }),
    ],
    [activeIso, compareChartData, compareBaseDate, compareDate]
  );
  const compareSeries: PlotSeries[] = [
    {
      key: "base",
      label: compareBaseDate || "Reference",
      color: COMPARISON_COLORS.reference,
      defaultVisible: true,
    },
    {
      key: "compare",
      label: compareDate || "Compare",
      color: COMPARISON_COLORS.compare,
      defaultVisible: true,
    },
    { key: "delta", label: "Delta", color: COMPARISON_COLORS.delta, defaultVisible: true },
  ];
  const hubCompareConfig =
    activeComponents.find((component) => component.key === compareHubComponent) ?? TOTAL_COMPONENT;
  const compareHubAData = useMemo(
    () => data?.hubs.find((hub) => hub.hub === compareHubA) ?? data?.hubs[0] ?? null,
    [compareHubA, data]
  );
  const compareHubBData = useMemo(
    () => data?.hubs.find((hub) => hub.hub === compareHubB) ?? data?.hubs[1] ?? data?.hubs[0] ?? null,
    [compareHubB, data]
  );
  const hubCompareChartData = useMemo(
    () =>
      HOURS.map((hour) => {
        const hubARow = compareHubAData?.hourly.find((row) => row.hourEnding === hour) ?? null;
        const hubBRow = compareHubBData?.hourly.find((row) => row.hourEnding === hour) ?? null;
        const hubA = hubARow ? hubCompareConfig.getValue(hubARow) : null;
        const hubB = hubBRow ? hubCompareConfig.getValue(hubBRow) : null;
        return {
          he: hour,
          hubA,
          hubB,
          delta: hubA !== null && hubB !== null ? hubA - hubB : null,
        };
      }),
    [compareHubAData, compareHubBData, hubCompareConfig]
  );
  const hubCompareTableRows = useMemo(
    () => [
      buildTableRow({
        key: "hubA",
        label: compareHubAData?.hub ?? "Hub A",
        color: COMPARISON_COLORS.reference,
        values: new Map(hubCompareChartData.map((row) => [row.he, row.hubA] as const)),
        iso: activeIso,
      }),
      buildTableRow({
        key: "hubB",
        label: compareHubBData?.hub ?? "Hub B",
        color: COMPARISON_COLORS.compare,
        values: new Map(hubCompareChartData.map((row) => [row.he, row.hubB] as const)),
        iso: activeIso,
      }),
      buildTableRow({
        key: "delta",
        label: "Delta",
        color: COMPARISON_COLORS.delta,
        values: new Map(hubCompareChartData.map((row) => [row.he, row.delta] as const)),
        iso: activeIso,
      }),
    ],
    [activeIso, compareHubAData, compareHubBData, hubCompareChartData]
  );
  const hubCompareSeries: PlotSeries[] = [
    {
      key: "hubA",
      label: compareHubAData?.hub ?? "Hub A",
      color: COMPARISON_COLORS.reference,
      defaultVisible: true,
    },
    {
      key: "hubB",
      label: compareHubBData?.hub ?? "Hub B",
      color: COMPARISON_COLORS.compare,
      defaultVisible: true,
    },
    { key: "delta", label: "Delta", color: COMPARISON_COLORS.delta, defaultVisible: true },
  ];
  const settleRows = useMemo(() => settlesData?.rows ?? [], [settlesData]);
  const settleComponentConfig =
    activeComponents.find((component) => component.key === settlesComponent) ?? TOTAL_COMPONENT;
  const settleMetricLabel =
    activeProduct === "dart" ? "DART (DA - RT)" : activeProduct === "rt" ? "RT" : "DA";
  // One enriched record per day: the active product's hourly values for the selected
  // component, plus that day's on-peak / off-peak / flat averages.
  const settleDays = useMemo(
    () =>
      settleRows.map((row) => {
        const hourly = settleHourlyForProduct(row, activeProduct);
        const periods = settlePeriodAverages(activeIso, hourly);
        return {
          date: row.date,
          isWeekend: row.isWeekend,
          isNercHoliday: row.isNercHoliday,
          holidayName: row.holidayName,
          hourly,
          onPeak: periods.onPeak,
          offPeak: periods.offPeak,
          flat: periods.flat,
          hoursPresent: hourly.filter((value) => value !== null).length,
          asOf: settleDayAsOf(row, activeProduct),
        };
      }),
    [activeIso, activeProduct, settleRows]
  );
  // Shared color scale across the whole day×hour grid so magnitudes are comparable
  // between days (a per-row scale would flatten every day to the same gradient).
  const settleHeatRange = useMemo(() => {
    const nums = settleDays
      .flatMap((day) => day.hourly)
      .filter((value): value is number => value !== null);
    return {
      min: nums.length > 0 ? Math.min(...nums) : 0,
      max: nums.length > 0 ? Math.max(...nums) : 0,
    };
  }, [settleDays]);
  const settleColumnFilterOptions = useMemo(() => {
    const options: Record<SettleFilterKey, string[]> = {
      dayType: [
        SETTLE_DAY_TYPE_LABELS.weekday,
        SETTLE_DAY_TYPE_LABELS.weekend,
        SETTLE_DAY_TYPE_LABELS.holiday,
      ],
      date: uniqueColumnOptions(settleDays.map((day) => day.date)),
      onpeak: uniqueColumnOptions(settleDays.map((day) => fmtPrice(day.onPeak))),
      offpeak: uniqueColumnOptions(settleDays.map((day) => fmtPrice(day.offPeak))),
      flat: uniqueColumnOptions(settleDays.map((day) => fmtPrice(day.flat))),
      ...Object.fromEntries(
        HOURS.map((hour) => [
          `he${hour}`,
          uniqueColumnOptions(
            settleDays.map((day) => fmtPrice(day.hourly[hour - 1] ?? null)),
          ),
        ]),
      ),
    } as Record<SettleFilterKey, string[]>;
    return options;
  }, [settleDays]);
  const filteredSettleDays = useMemo(() => {
    const activeFilters = Object.entries(settleColumnFilters).filter(
      (entry): entry is [SettleFilterKey, string[]] =>
        Array.isArray(entry[1]) && entry[1].length > 0
    );
    if (activeFilters.length === 0) return settleDays;

    return settleDays.filter((day) =>
      activeFilters.every(([key, selected]) => {
        if (key === "dayType") {
          const labels = settleDayTypeLabels(day);
          return selected.some((value) => labels.includes(value));
        }
        return matchesColumnFilter(settleFilterValue(day, key), selected);
      })
    );
  }, [settleColumnFilters, settleDays]);
  const displayedSettleDays = useMemo(() => {
    const direction = settlesSort.direction === "asc" ? 1 : -1;
    const rows = [...filteredSettleDays];
    rows.sort((a, b) => {
      if (settlesSort.key === "date") {
        return a.date < b.date ? -direction : a.date > b.date ? direction : 0;
      }
      const aValue = settleColumnValue(a, settlesSort.key);
      const bValue = settleColumnValue(b, settlesSort.key);
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1; // nulls always sort last
      if (bValue === null) return -1;
      return (aValue - bValue) * direction;
    });
    return rows;
  }, [filteredSettleDays, settlesSort]);
  const settleSelectionStats = useMemo(() => {
    if (selectedSettleCells.size === 0) return null;
    const dayByDate = new Map(settleDays.map((day) => [day.date, day] as const));
    const values: number[] = [];
    let nercCells = 0;
    selectedSettleCells.forEach((key) => {
      const [date, column] = key.split("|");
      const day = dayByDate.get(date);
      if (!day) return;
      const value = settleColumnValue(day, column as SettleColumnKey);
      if (value !== null) values.push(value);
      if (day.isNercHoliday) nercCells += 1;
    });
    const sum = values.reduce((total, value) => total + value, 0);
    return {
      cells: selectedSettleCells.size,
      observations: values.length,
      avg: values.length > 0 ? sum / values.length : null,
      sum: values.length > 0 ? sum : null,
      min: values.length > 0 ? Math.min(...values) : null,
      max: values.length > 0 ? Math.max(...values) : null,
      nercCells,
    };
  }, [selectedSettleCells, settleDays]);
  const toggleSettleSort = (key: SettleSortKey) => {
    setSettlesSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "desc" }
    );
  };
  const toggleSettleCell = (date: string, column: SettleColumnKey, shiftKey: boolean) => {
    const key = settleCellKey(date, column);
    const order = displayedSettleDays.map((day) => day.date);
    const last = lastSelectedSettleCell ? lastSelectedSettleCell.split("|") : null;
    if (shiftKey && last && last[1] === column && order.includes(last[0])) {
      const start = order.indexOf(last[0]);
      const end = order.indexOf(date);
      const [from, to] = start <= end ? [start, end] : [end, start];
      setSelectedSettleCells((prev) => {
        const next = new Set(prev);
        for (let index = from; index <= to; index += 1) {
          next.add(settleCellKey(order[index], column));
        }
        return next;
      });
    } else {
      setSelectedSettleCells((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    }
    setLastSelectedSettleCell(key);
  };
  const clearSettleSelection = () => {
    setSelectedSettleCells(new Set());
    setLastSelectedSettleCell(null);
  };
  const hasSettleColumnFilters = Object.values(settleColumnFilters).some(
    (values) => values && values.length > 0
  );
  const updateSettleColumnFilter = (key: SettleFilterKey, values: string[]) => {
    setSettleColumnFilters((filters) => updateColumnFilter(filters, key, values));
  };

  const metricCellValues = useMemo(() => {
    const values = new Map<string, number | null>();
    const rows =
      activeView === "single-day"
        ? visibleComponentRows.map((row) => ({ tableId: "single-day" as const, row }))
        : activeView === "compare-dates"
          ? compareTableRows.map((row) => ({ tableId: "compare-dates" as const, row }))
          : activeView === "compare-hubs"
            ? hubCompareTableRows.map((row) => ({ tableId: "compare-hubs" as const, row }))
            : [];

    rows.forEach(({ tableId, row }) => {
      METRIC_TABLE_COLUMNS.forEach((column) => {
        values.set(metricCellKey(tableId, row.key, column), componentRowColumnValue(row, column));
      });
    });

    return values;
  }, [activeView, compareTableRows, hubCompareTableRows, visibleComponentRows]);
  const metricRowOrder = useMemo(() => {
    if (activeView === "single-day") return visibleComponentRows.map((row) => row.key);
    if (activeView === "compare-dates") return compareTableRows.map((row) => row.key);
    if (activeView === "compare-hubs") return hubCompareTableRows.map((row) => row.key);
    return [];
  }, [activeView, compareTableRows, hubCompareTableRows, visibleComponentRows]);
  const metricSelectionStats = useMemo(
    () => buildSelectionStats(selectedMetricCells, metricCellValues),
    [metricCellValues, selectedMetricCells]
  );
  const toggleMetricCell = (
    tableId: MetricTableId,
    rowKey: string,
    column: SettleColumnKey,
    shiftKey: boolean
  ) => {
    const key = metricCellKey(tableId, rowKey, column);
    if (
      shiftKey &&
      lastSelectedMetricCell?.tableId === tableId &&
      lastSelectedMetricCell.column === column &&
      metricRowOrder.includes(lastSelectedMetricCell.rowKey) &&
      metricRowOrder.includes(rowKey)
    ) {
      const start = metricRowOrder.indexOf(lastSelectedMetricCell.rowKey);
      const end = metricRowOrder.indexOf(rowKey);
      const [from, to] = start <= end ? [start, end] : [end, start];
      setSelectedMetricCells((prev) => {
        const next = new Set(prev);
        for (let index = from; index <= to; index += 1) {
          next.add(metricCellKey(tableId, metricRowOrder[index], column));
        }
        return next;
      });
    } else {
      setSelectedMetricCells((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    }
    setLastSelectedMetricCell({ tableId, rowKey, column });
  };
  const clearMetricSelection = () => {
    setSelectedMetricCells(new Set());
    setLastSelectedMetricCell(null);
  };

  useEffect(() => {
    setSelectedMetricCells(new Set());
    setLastSelectedMetricCell(null);
  }, [
    activeIso,
    activeProduct,
    activeView,
    compareBaseDate,
    compareComponent,
    compareDate,
    compareHubA,
    compareHubB,
    compareHubComponent,
    data?.targetDate,
    rtSource,
    selectedHub,
    singleComponent,
  ]);

  const handleViewChange = (nextView: LmpView) => {
    setActiveView(nextView);
  };

  const handleIsoChange = (nextIso: PowerIso) => {
    setActiveIso(nextIso);
  };

  const togglePlotSeries = (key: string) => {
    setHiddenPlotSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const showAllPlotSeries = () => setHiddenPlotSeries(new Set());

  const hideAllPlotSeries = () =>
    setHiddenPlotSeries(new Set(singlePlotSeries.map((series) => series.key)));

  const shouldShowSingleSeries = (key: ComponentKey) =>
    activeComponents.some((component) => component.key === key) &&
    (singleComponent === "all" || singleComponent === key) &&
    !hiddenPlotSeries.has(key);

  const renderChart = (heightClass: string) => (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="rgba(75,85,99,0.25)" />
          <XAxis
            dataKey="he"
            stroke="#9ca3af"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            interval={1}
            label={{ value: "Hour Ending", position: "insideBottom", offset: -4, fill: "#6b7280" }}
          />
          <YAxis
            yAxisId="lmp"
            stroke="#9ca3af"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip
            contentStyle={{
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: "6px",
              color: "#e5e7eb",
            }}
            formatter={(value) =>
              typeof value === "number" ? [`$${value.toFixed(2)}`, ""] : [value, ""]
            }
            labelFormatter={(value) => `HE ${value}`}
          />
          {shouldShowSingleSeries("energy") && (
            <Line
              yAxisId="lmp"
              type="monotone"
              dataKey="energy"
              name="Energy"
              stroke="#38bdf8"
              dot={false}
              strokeWidth={2}
            />
          )}
          {shouldShowSingleSeries("congestion") && (
            <Line
              yAxisId="lmp"
              type="monotone"
              dataKey="congestion"
              name="Congestion"
              stroke="#f97316"
              dot={false}
              strokeWidth={2}
            />
          )}
          {shouldShowSingleSeries("loss") && (
            <Line
              yAxisId="lmp"
              type="monotone"
              dataKey="loss"
              name="Loss"
              stroke="#a78bfa"
              dot={false}
              strokeWidth={2}
            />
          )}
          {shouldShowSingleSeries("total") && (
            <Line
              yAxisId="lmp"
              type="monotone"
              dataKey="total"
              name="Total"
              stroke="#e5e7eb"
              dot={false}
              strokeWidth={2.5}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );

  const toggleCompareSeries = (key: string) => {
    setHiddenCompareSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const showAllCompareSeries = () => setHiddenCompareSeries(new Set());
  const hideAllCompareSeries = () =>
    setHiddenCompareSeries(new Set(compareSeries.map((series) => series.key)));
  const renderCompareChart = (heightClass: string) => (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={compareChartData} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="rgba(75,85,99,0.25)" />
          <XAxis
            dataKey="he"
            stroke="#9ca3af"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            interval={1}
            label={{ value: "Hour Ending", position: "insideBottom", offset: -4, fill: "#6b7280" }}
          />
          <YAxis
            yAxisId="lmp"
            stroke="#9ca3af"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip
            contentStyle={{
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: "6px",
              color: "#e5e7eb",
            }}
            formatter={(value) =>
              typeof value === "number" ? [`$${value.toFixed(2)}`, ""] : [value, ""]
            }
            labelFormatter={(value) => `HE ${value}`}
          />
          {!hiddenCompareSeries.has("base") && (
            <Line
              yAxisId="lmp"
              type="monotone"
              dataKey="base"
              name={compareBaseDate || "Base"}
              stroke={COMPARISON_COLORS.reference}
              dot={false}
              strokeWidth={2.5}
            />
          )}
          {!hiddenCompareSeries.has("compare") && (
            <Line
              yAxisId="lmp"
              type="monotone"
              dataKey="compare"
              name={compareDate || "Compare"}
              stroke={COMPARISON_COLORS.compare}
              dot={false}
              strokeDasharray="2 4"
              strokeWidth={2}
            />
          )}
          {!hiddenCompareSeries.has("delta") && (
            <Line
              yAxisId="lmp"
              type="monotone"
              dataKey="delta"
              name="Delta"
              stroke={COMPARISON_COLORS.delta}
              dot={false}
              strokeDasharray="4 4"
              strokeWidth={2}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );

  const toggleHubCompareSeries = (key: string) => {
    setHiddenHubCompareSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const showAllHubCompareSeries = () => setHiddenHubCompareSeries(new Set());
  const hideAllHubCompareSeries = () =>
    setHiddenHubCompareSeries(new Set(hubCompareSeries.map((series) => series.key)));
  const renderHubCompareChart = (heightClass: string) => (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={hubCompareChartData}
          margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
        >
          <CartesianGrid stroke="rgba(75,85,99,0.25)" />
          <XAxis
            dataKey="he"
            stroke="#9ca3af"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            interval={1}
            label={{ value: "Hour Ending", position: "insideBottom", offset: -4, fill: "#6b7280" }}
          />
          <YAxis
            yAxisId="lmp"
            stroke="#9ca3af"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip
            contentStyle={{
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: "6px",
              color: "#e5e7eb",
            }}
            formatter={(value) =>
              typeof value === "number" ? [`$${value.toFixed(2)}`, ""] : [value, ""]
            }
            labelFormatter={(value) => `HE ${value}`}
          />
          {!hiddenHubCompareSeries.has("hubA") && (
            <Line
              yAxisId="lmp"
              type="monotone"
              dataKey="hubA"
              name={compareHubAData?.hub ?? "Hub A"}
              stroke={COMPARISON_COLORS.reference}
              dot={false}
              strokeWidth={2.5}
            />
          )}
          {!hiddenHubCompareSeries.has("hubB") && (
            <Line
              yAxisId="lmp"
              type="monotone"
              dataKey="hubB"
              name={compareHubBData?.hub ?? "Hub B"}
              stroke={COMPARISON_COLORS.compare}
              dot={false}
              strokeWidth={2}
            />
          )}
          {!hiddenHubCompareSeries.has("delta") && (
            <Line
              yAxisId="lmp"
              type="monotone"
              dataKey="delta"
              name="Delta"
              stroke={COMPARISON_COLORS.delta}
              dot={false}
              strokeDasharray="4 4"
              strokeWidth={2}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );


  const activeProductLabel =
    activeProduct === "dart"
      ? `${ISO_LABELS[activeIso]} DART (${RT_SOURCE_LABELS_BY_ISO[activeIso][rtSource]} RT)`
      : activeProduct === "rt"
      ? `${ISO_LABELS[activeIso]} RT ${RT_SOURCE_LABELS_BY_ISO[activeIso][rtSource]}`
      : `${ISO_LABELS[activeIso]} ${PRODUCT_LABELS[activeProduct]}`;
  const metricSelectionLabel =
    activeView === "single-day"
      ? `${selected?.hub ?? selectedHub} ${activeProductLabel} selection`
      : activeView === "compare-dates"
        ? `${selectedHub} ${compareConfig.label} comparison selection`
        : activeView === "compare-hubs"
          ? `${hubCompareConfig.label} hub comparison selection`
          : "";

  if (loading && !data) {
    return <p className="text-sm text-gray-500">Loading LMPs...</p>;
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (!data || data.hubs.length === 0) {
    return <p className="text-sm text-gray-500">No {activeProductLabel} data is available.</p>;
  }

  const productTabs: Array<DashboardTabOption<LmpProduct>> = (
    ["da", "rt", "dart"] as LmpProduct[]
  ).map((product) => ({
    value: product,
    label: PRODUCT_LABELS[product],
  }));
  const viewTabs: Array<DashboardTabOption<LmpView>> = LMP_VIEW_TABS;
  const currentSourceFeeds = selectedLmpSourceFeeds({
    iso: activeIso,
    product: activeProduct,
    rtSource,
  });

  return (
    <div className="space-y-4">
      <LmpSourceLinksModal
        open={sourceLinksOpen}
        activeIso={activeIso}
        onClose={() => setSourceLinksOpen(false)}
      />
      {error && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {error}
        </div>
      )}
      <div className="rounded-lg border border-gray-800 bg-[#12141d] p-2 shadow-xl shadow-black/20">
        <div className="border-b border-gray-800 pb-2">
          <DashboardTabs
            tabs={ISO_TABS}
            activeValue={activeIso}
            onChange={handleIsoChange}
            ariaLabel="Power ISO"
          />
        </div>
        <DashboardTabs
          tabs={productTabs}
          activeValue={activeProduct}
          onChange={setActiveProduct}
          ariaLabel="LMP products"
          variant="secondary"
          className="border-b border-gray-800 py-2"
        />
        <DashboardTabs
          tabs={viewTabs}
          activeValue={activeView}
          onChange={handleViewChange}
          ariaLabel={`${PRODUCT_LABELS[activeProduct]} views`}
          variant="secondary"
          className="pt-2"
        />
      </div>

      {activeProduct !== "da" && (
        <RtDatasetCard iso={activeIso} value={rtSource} onChange={setRtSource} />
      )}

      <SelectedLmpSource
        feeds={currentSourceFeeds}
        sourceTable={data.source}
        onOpenAll={() => setSourceLinksOpen(true)}
      />

      {activeView === "daily-settles" && (
        <>
          <SectionCard title="Date Range" subtitle="Inclusive market dates">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={settlesStartDate}
                max={settlesEndDate}
                onChange={(event) => setSettlesStartDate(event.target.value)}
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              />
              <span className="text-xs text-gray-500">to</span>
              <input
                type="date"
                value={settlesEndDate}
                min={settlesStartDate}
                onChange={(event) => setSettlesEndDate(event.target.value)}
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              />
            </div>
          </SectionCard>

          <SectionCard title="Hub Selection" subtitle={`${selectedHub} selected`}>
            <div className="flex flex-wrap gap-2">
              {data.hubs.map((hub) => (
                <button
                  key={hub.hub}
                  onClick={() => setSelectedHub(hub.hub)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedHub === hub.hub
                      ? "border-sky-500/50 bg-sky-500/10 text-white"
                      : "border-gray-800 bg-gray-950/30 text-gray-400 hover:border-gray-700 hover:bg-gray-900 hover:text-gray-200"
                  }`}
                >
                  {hub.hub}
                </button>
              ))}
            </div>
          </SectionCard>

          <LmpComponentCard
            value={settlesComponent}
            components={activeComponents}
            onChange={(value) => {
              if (value !== "all") setSettlesComponent(value);
            }}
          />

          {settlesError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              {settlesError}
            </div>
          )}

          <SectionCard
            title="Daily Hourly Settles"
            subtitle={`${displayedSettleDays.length.toLocaleString()} of ${settleDays.length.toLocaleString()} dates | ${settleComponentConfig.label} | ${settleMetricLabel} | click cells to aggregate`}
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSettleColumnFilters({})}
                  disabled={!hasSettleColumnFilters}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    hasSettleColumnFilters
                      ? "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white"
                      : "cursor-not-allowed border-gray-800 bg-gray-950/40 text-gray-600"
                  }`}
                >
                  Clear Filters
                </button>
                {tableHeatmapAction}
              </div>
            }
          >
            <div className="overflow-x-auto rounded-lg border border-gray-800 bg-[#0d1119]">
              <table className="w-full min-w-[1180px] border-collapse text-xs text-gray-200">
                <thead className="bg-gray-950 text-gray-500">
                  <tr>
                    <th className="sticky left-0 z-20 w-20 bg-gray-950 px-2 py-2 text-center font-semibold uppercase tracking-wide">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-[10px]">Type</span>
                        <LmpColumnFilterMenu
                          label="Day Type"
                          options={settleColumnFilterOptions.dayType}
                          selected={settleColumnFilters.dayType ?? EMPTY_COLUMN_FILTER}
                          onChange={(values) => updateSettleColumnFilter("dayType", values)}
                        />
                      </div>
                    </th>
                    <th className="sticky left-20 z-20 bg-gray-950 px-3 py-2 text-left">
                      <FilteredSettleHeader
                        label="Date"
                        sortKey="date"
                        activeSort={settlesSort}
                        onSort={toggleSettleSort}
                        filterOptions={settleColumnFilterOptions.date}
                        selectedFilters={settleColumnFilters.date ?? EMPTY_COLUMN_FILTER}
                        onFilterChange={(values) => updateSettleColumnFilter("date", values)}
                      />
                    </th>
                    <th className="border-l border-gray-700 px-3 py-2 text-right">
                      <FilteredSettleHeader
                        label="OnPeak"
                        sortKey="onpeak"
                        activeSort={settlesSort}
                        onSort={toggleSettleSort}
                        filterOptions={settleColumnFilterOptions.onpeak}
                        selectedFilters={settleColumnFilters.onpeak ?? EMPTY_COLUMN_FILTER}
                        onFilterChange={(values) => updateSettleColumnFilter("onpeak", values)}
                        align="right"
                      />
                    </th>
                    <th className="px-3 py-2 text-right">
                      <FilteredSettleHeader
                        label="OffPeak"
                        sortKey="offpeak"
                        activeSort={settlesSort}
                        onSort={toggleSettleSort}
                        filterOptions={settleColumnFilterOptions.offpeak}
                        selectedFilters={settleColumnFilters.offpeak ?? EMPTY_COLUMN_FILTER}
                        onFilterChange={(values) => updateSettleColumnFilter("offpeak", values)}
                        align="right"
                      />
                    </th>
                    <th className="px-3 py-2 text-right">
                      <FilteredSettleHeader
                        label="Flat"
                        sortKey="flat"
                        activeSort={settlesSort}
                        onSort={toggleSettleSort}
                        filterOptions={settleColumnFilterOptions.flat}
                        selectedFilters={settleColumnFilters.flat ?? EMPTY_COLUMN_FILTER}
                        onFilterChange={(values) => updateSettleColumnFilter("flat", values)}
                        align="right"
                      />
                    </th>
                    {HOURS.map((hour) => (
                      <th
                        key={hour}
                        className={`px-2 py-2 text-right ${
                          hour === 1 ? "border-l border-gray-700" : ""
                        } ${isOnPeakHour(activeIso, hour) ? "bg-sky-500/10 text-sky-200" : ""}`}
                      >
                        <FilteredSettleHeader
                          label={`HE${hour}`}
                          sortKey={`he${hour}` as SettleSortKey}
                          activeSort={settlesSort}
                          onSort={toggleSettleSort}
                          filterOptions={settleColumnFilterOptions[`he${hour}` as SettleFilterKey]}
                          selectedFilters={
                            settleColumnFilters[`he${hour}` as SettleFilterKey] ??
                            EMPTY_COLUMN_FILTER
                          }
                          onFilterChange={(values) =>
                            updateSettleColumnFilter(`he${hour}` as SettleFilterKey, values)
                          }
                          align="right"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {displayedSettleDays.length === 0 ? (
                    <tr>
                      <td colSpan={5 + HOURS.length} className="px-3 py-8 text-center text-sm text-gray-500">
                        {settlesLoading && !settlesData
                          ? "Loading settles..."
                          : "No daily settles match the selected filters."}
                      </td>
                    </tr>
                  ) : (
                    displayedSettleDays.map((day) => (
                      <tr
                        key={day.date}
                        className={day.isNercHoliday ? "bg-amber-500/[0.06]" : "hover:bg-gray-900/40"}
                      >
                        <td className="sticky left-0 z-10 w-20 bg-[#0d1119] px-2 py-2 text-center">
                          {day.isNercHoliday ? (
                            <span
                              title={day.holidayName ?? "NERC holiday"}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 text-[10px] font-bold text-amber-200"
                            >
                              H
                            </span>
                          ) : day.isWeekend ? (
                            <span
                              title="Weekend"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-slate-500/40 bg-slate-500/10 text-[10px] font-bold text-slate-300"
                            >
                              W
                            </span>
                          ) : (
                            <span className="text-gray-700" aria-hidden="true">
                              ·
                            </span>
                          )}
                        </td>
                        <td className="sticky left-20 z-10 bg-[#0d1119] px-3 py-2 font-medium text-gray-300">
                          {day.date}
                        </td>
                        <SettleCell
                          value={day.onPeak}
                          date={day.date}
                          column="onpeak"
                          selected={selectedSettleCells.has(settleCellKey(day.date, "onpeak"))}
                          heatmapEnabled={tableHeatmapEnabled}
                          heatRange={settleHeatRange}
                          onSelect={toggleSettleCell}
                          extraClass="border-l border-gray-700 font-semibold"
                        />
                        <SettleCell
                          value={day.offPeak}
                          date={day.date}
                          column="offpeak"
                          selected={selectedSettleCells.has(settleCellKey(day.date, "offpeak"))}
                          heatmapEnabled={tableHeatmapEnabled}
                          heatRange={settleHeatRange}
                          onSelect={toggleSettleCell}
                          extraClass="font-semibold"
                        />
                        <SettleCell
                          value={day.flat}
                          date={day.date}
                          column="flat"
                          selected={selectedSettleCells.has(settleCellKey(day.date, "flat"))}
                          heatmapEnabled={tableHeatmapEnabled}
                          heatRange={settleHeatRange}
                          onSelect={toggleSettleCell}
                          extraClass="border-r border-gray-800 font-semibold"
                        />
                        {HOURS.map((hour) => {
                          const column = `he${hour}` as SettleColumnKey;
                          return (
                            <SettleCell
                              key={hour}
                              value={day.hourly[hour - 1] ?? null}
                              date={day.date}
                              column={column}
                              selected={selectedSettleCells.has(settleCellKey(day.date, column))}
                              heatmapEnabled={tableHeatmapEnabled}
                              heatRange={settleHeatRange}
                              onSelect={toggleSettleCell}
                              extraClass={`${hour === 1 ? "border-l border-gray-700" : ""} ${
                                hour === PEAK_WINDOW_BY_ISO[activeIso].start
                                  ? "border-l border-dotted border-sky-700/70"
                                  : ""
                              } ${
                                hour === PEAK_WINDOW_BY_ISO[activeIso].end
                                  ? "border-r border-dotted border-sky-700/70"
                                  : ""
                              }`}
                            />
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {settleSelectionStats && (
            <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100vw-2rem)] max-w-4xl -translate-x-1/2 rounded-lg border border-sky-500/30 bg-[#090d15]/95 px-3 py-2 shadow-2xl shadow-black/40 backdrop-blur">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-300">
                <span className="font-semibold text-sky-100">
                  {settleComponentConfig.label} {settleMetricLabel} selection
                </span>
                <span>
                  <span className="text-gray-500">Count:</span>{" "}
                  <span className="font-semibold tabular-nums text-gray-100">
                    {settleSelectionStats.observations.toLocaleString()}
                  </span>
                </span>
                <span>
                  <span className="text-gray-500">Avg:</span>{" "}
                  <span className="font-semibold tabular-nums text-gray-100">
                    {fmtPrice(settleSelectionStats.avg)}
                  </span>
                </span>
                <span>
                  <span className="text-gray-500">Sum:</span>{" "}
                  <span className="font-semibold tabular-nums text-gray-100">
                    {fmtPrice(settleSelectionStats.sum)}
                  </span>
                </span>
                <span>
                  <span className="text-gray-500">Min:</span>{" "}
                  <span className="font-semibold tabular-nums text-gray-100">
                    {fmtPrice(settleSelectionStats.min)}
                  </span>
                </span>
                <span>
                  <span className="text-gray-500">Max:</span>{" "}
                  <span className="font-semibold tabular-nums text-gray-100">
                    {fmtPrice(settleSelectionStats.max)}
                  </span>
                </span>
                <span>
                  <span className="text-gray-500">Cells:</span>{" "}
                  <span className="font-semibold tabular-nums text-gray-100">
                    {settleSelectionStats.cells.toLocaleString()}
                  </span>
                </span>
                {settleSelectionStats.nercCells > 0 && (
                  <span className="font-semibold text-amber-200">
                    {settleSelectionStats.nercCells} NERC
                  </span>
                )}
                <button
                  type="button"
                  onClick={clearSettleSelection}
                  className="ml-auto rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {activeView === "single-day" && (
        <>
      <SectionCard title="Date Selection" subtitle="Market date">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateInput}
            onChange={(event) => setDateInput(event.target.value)}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
          />
          <button
            onClick={applyDate}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Load
          </button>
          <button
            onClick={() => {
              setDate(null);
              setLatestRefreshToken((value) => value + 1);
            }}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
          >
            Latest
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Hub Selection" subtitle={selected ? `${selected.hub} selected` : undefined}>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid max-h-[250px] grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {data.hubs.map((hub) => (
              <button
                key={hub.hub}
                onClick={() => setSelectedHub(hub.hub)}
                className={`flex min-h-12 items-center justify-between rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  selected?.hub === hub.hub
                    ? "border-sky-500/50 bg-sky-500/10 text-white"
                    : "border-gray-800 bg-gray-950/30 text-gray-400 hover:border-gray-700 hover:bg-gray-900 hover:text-gray-200"
                }`}
              >
                <span className="font-medium">{hub.hub}</span>
                <span className="text-right text-gray-500">
                  <span className="tabular-nums">OnPk: {fmtPrice(hub.onPeakAvg)}</span>
                  <span className="ml-2 tabular-nums">
                    {hub.peakHour ? `| Peak HE ${hub.peakHour}` : "| Peak HE -"}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {selected && (
            <div className="grid grid-cols-2 gap-2">
              <StatTile label="OnPeak" value={fmtPrice(selected.onPeakAvg)} />
              <StatTile label="OffPeak" value={fmtPrice(selected.offPeakAvg)} />
              <StatTile label="Flat" value={fmtPrice(selected.flatAvg)} />
              <StatTile
                label="Peak Hour"
                value={selected.peakHour ? `HE ${selected.peakHour}` : "-"}
                sub={fmtPrice(selected.peakPrice)}
              />
            </div>
          )}
        </div>
      </SectionCard>

      <LmpComponentCard
        value={singleComponent}
        onChange={setSingleComponent}
        allowAll
        components={activeComponents}
      />

      <PlotCard
        title={`${selected?.hub ?? "Hub"} Plot`}
        subtitle={`Hourly ${activeProductLabel} components`}
        series={singlePlotSeries}
        hiddenSeries={hiddenPlotSeries}
        onToggleSeries={togglePlotSeries}
        onShowAll={showAllPlotSeries}
        onHideAll={hideAllPlotSeries}
        focusedChildren={renderChart("h-[70vh]")}
      >
        {renderChart("h-[340px]")}
      </PlotCard>

      <SectionCard
        title="Hourly Table"
        subtitle="Hourly component values"
        action={tableHeatmapAction}
      >
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-[#0d1119]">
          <table className="w-full min-w-[1080px] border-collapse text-xs text-gray-200">
            <thead className="bg-gray-950 text-gray-500">
              <tr>
                <th className="sticky left-0 z-20 bg-gray-950 px-3 py-2 text-left font-semibold uppercase tracking-wide">
                  Date
                </th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Hub</th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Component</th>
                <th className="border-l border-gray-700 px-3 py-2 text-right font-semibold uppercase tracking-wide">
                  OnPeak
                </th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">OffPeak</th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">Flat</th>
                {HOURS.map((hour) => (
                  <th
                    key={hour}
                    className={`px-2 py-2 text-right font-semibold uppercase tracking-wide ${
                      hour === 1 ? "border-l border-gray-700" : ""
                    } ${isOnPeakHour(activeIso, hour) ? "bg-sky-500/10 text-sky-200" : ""}`}
                  >
                    HE{hour}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {visibleComponentRows.map((row) => (
                <tr key={row.key} className="hover:bg-gray-900/60">
                  <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2 font-medium text-gray-300">
                    {data.targetDate}
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-300">{selected?.hub}</td>
                  <td className="px-3 py-2 font-semibold text-gray-100">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: row.color }}
                        aria-hidden="true"
                      />
                      {row.label}
                    </span>
                  </td>
                  <SelectableMetricCell
                    value={row.onPeakAvg}
                    selected={selectedMetricCells.has(metricCellKey("single-day", row.key, "onpeak"))}
                    heatmapEnabled={tableHeatmapEnabled}
                    heatStyleValue={tableHeatStyle(row, row.onPeakAvg)}
                    onSelect={(shiftKey) => toggleMetricCell("single-day", row.key, "onpeak", shiftKey)}
                    extraClass="border-l border-gray-700 bg-gray-950/70 font-semibold text-gray-100"
                  />
                  <SelectableMetricCell
                    value={row.offPeakAvg}
                    selected={selectedMetricCells.has(metricCellKey("single-day", row.key, "offpeak"))}
                    heatmapEnabled={tableHeatmapEnabled}
                    heatStyleValue={tableHeatStyle(row, row.offPeakAvg)}
                    onSelect={(shiftKey) => toggleMetricCell("single-day", row.key, "offpeak", shiftKey)}
                    extraClass="bg-gray-950/70 font-semibold text-gray-100"
                  />
                  <SelectableMetricCell
                    value={row.flatAvg}
                    selected={selectedMetricCells.has(metricCellKey("single-day", row.key, "flat"))}
                    heatmapEnabled={tableHeatmapEnabled}
                    heatStyleValue={tableHeatStyle(row, row.flatAvg)}
                    onSelect={(shiftKey) => toggleMetricCell("single-day", row.key, "flat", shiftKey)}
                    extraClass="bg-gray-950/70 font-semibold text-gray-100"
                  />
                  {HOURS.map((hour) => {
                    const value = row.values.get(hour) ?? null;
                    const column = `he${hour}` as SettleColumnKey;
                    return (
                      <SelectableMetricCell
                        key={hour}
                        value={value}
                        selected={selectedMetricCells.has(metricCellKey("single-day", row.key, column))}
                        heatmapEnabled={tableHeatmapEnabled}
                        heatStyleValue={tableHeatStyle(row, value)}
                        onSelect={(shiftKey) => toggleMetricCell("single-day", row.key, column, shiftKey)}
                        extraClass={`text-gray-300 ${
                          hour === 1 ? "border-l border-gray-700" : ""
                        } ${
                          hour === 8 ? "border-l border-dotted border-sky-700/70" : ""
                        } ${
                          hour === 23 ? "border-r border-dotted border-sky-700/70" : ""
                        }`}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
        </>
      )}

      {activeView === "compare-dates" && (
        <>
          <SectionCard title="Date Selection" subtitle={`Compare ${activeProductLabel} across dates`}>
            <div className="grid gap-3 lg:grid-cols-[repeat(2,minmax(0,220px))] lg:items-end">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Reference Date
                </span>
                <input
                  type="date"
                  value={compareBaseDate}
                  onChange={(event) => setCompareBaseDate(event.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Compare Date
                </span>
                <input
                  type="date"
                  value={compareDate}
                  onChange={(event) => setCompareDate(event.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                />
              </label>
            </div>
          </SectionCard>

          <SectionCard title="Hub Selection" subtitle={selected ? `${selected.hub} selected` : undefined}>
            <div className="grid max-h-[250px] grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {data.hubs.map((hub) => (
                <button
                  key={hub.hub}
                  onClick={() => setSelectedHub(hub.hub)}
                  className={`flex min-h-12 items-center justify-between rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                    selected?.hub === hub.hub
                      ? "border-sky-500/50 bg-sky-500/10 text-white"
                      : "border-gray-800 bg-gray-950/30 text-gray-400 hover:border-gray-700 hover:bg-gray-900 hover:text-gray-200"
                  }`}
                >
                  <span className="font-medium">{hub.hub}</span>
                  <span className="text-right text-gray-500">
                    <span className="tabular-nums">OnPk: {fmtPrice(hub.onPeakAvg)}</span>
                    <span className="ml-2 tabular-nums">
                      {hub.peakHour ? `| Peak HE ${hub.peakHour}` : "| Peak HE -"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </SectionCard>

          <LmpComponentCard
            value={compareComponent}
            components={activeComponents}
            onChange={(value) => {
              if (value !== "all") setCompareComponent(value);
            }}
          />

          {compareError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              {compareError}
            </div>
          )}

          {compareLoading ? (
            <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
              Loading comparison...
            </div>
          ) : (
            <PlotCard
              title={`${selectedHub} Comparison`}
              subtitle={`${compareConfig.label}: ${compareBaseDate || "-"} vs ${compareDate || "-"}`}
              series={compareSeries}
              hiddenSeries={hiddenCompareSeries}
              onToggleSeries={toggleCompareSeries}
              onShowAll={showAllCompareSeries}
              onHideAll={hideAllCompareSeries}
              focusedChildren={renderCompareChart("h-[70vh]")}
            >
              {renderCompareChart("h-[340px]")}
            </PlotCard>
          )}

          <SectionCard
            title="Comparison Table"
            subtitle={`${compareConfig.label} by hour`}
            action={tableHeatmapAction}
          >
            <div className="overflow-x-auto rounded-lg border border-gray-800 bg-[#0d1119]">
              <table className="w-full min-w-[1180px] border-collapse text-xs text-gray-200">
                <thead className="bg-gray-950 text-gray-500">
                  <tr>
                    <th className="sticky left-0 z-20 bg-gray-950 px-3 py-2 text-left font-semibold uppercase tracking-wide">
                      Series
                    </th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                      Hub
                    </th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                      Component
                    </th>
                    <th className="border-l border-gray-700 px-3 py-2 text-right font-semibold uppercase tracking-wide">
                      OnPeak
                    </th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">OffPeak</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">Flat</th>
                    {HOURS.map((hour) => (
                      <th
                        key={hour}
                        className={`px-2 py-2 text-right font-semibold uppercase tracking-wide ${
                          hour === 1 ? "border-l border-gray-700" : ""
                        } ${isOnPeakHour(activeIso, hour) ? "bg-sky-500/10 text-sky-200" : ""}`}
                      >
                        HE{hour}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {compareTableRows.map((row) => (
                    <tr key={row.key} className="hover:bg-gray-900/60">
                      <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2 font-medium text-gray-300">
                        {row.key === "base" ? "Reference" : row.key === "compare" ? "Compare" : "Delta"}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-300">
                        {row.key === "base"
                          ? compareBaseDate
                          : row.key === "compare"
                            ? compareDate
                            : `${compareBaseDate} - ${compareDate}`}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-300">{selectedHub}</td>
                      <td className="px-3 py-2 font-semibold text-gray-100">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: row.color }}
                            aria-hidden="true"
                          />
                          {compareConfig.label}
                        </span>
                      </td>
                      <SelectableMetricCell
                        value={row.onPeakAvg}
                        selected={selectedMetricCells.has(metricCellKey("compare-dates", row.key, "onpeak"))}
                        heatmapEnabled={tableHeatmapEnabled}
                        heatStyleValue={tableHeatStyle(row, row.onPeakAvg)}
                        onSelect={(shiftKey) =>
                          toggleMetricCell("compare-dates", row.key, "onpeak", shiftKey)
                        }
                        extraClass="border-l border-gray-700 bg-gray-950/70 font-semibold text-gray-100"
                      />
                      <SelectableMetricCell
                        value={row.offPeakAvg}
                        selected={selectedMetricCells.has(metricCellKey("compare-dates", row.key, "offpeak"))}
                        heatmapEnabled={tableHeatmapEnabled}
                        heatStyleValue={tableHeatStyle(row, row.offPeakAvg)}
                        onSelect={(shiftKey) =>
                          toggleMetricCell("compare-dates", row.key, "offpeak", shiftKey)
                        }
                        extraClass="bg-gray-950/70 font-semibold text-gray-100"
                      />
                      <SelectableMetricCell
                        value={row.flatAvg}
                        selected={selectedMetricCells.has(metricCellKey("compare-dates", row.key, "flat"))}
                        heatmapEnabled={tableHeatmapEnabled}
                        heatStyleValue={tableHeatStyle(row, row.flatAvg)}
                        onSelect={(shiftKey) =>
                          toggleMetricCell("compare-dates", row.key, "flat", shiftKey)
                        }
                        extraClass="bg-gray-950/70 font-semibold text-gray-100"
                      />
                      {HOURS.map((hour) => {
                        const value = row.values.get(hour) ?? null;
                        const column = `he${hour}` as SettleColumnKey;
                        return (
                          <SelectableMetricCell
                            key={hour}
                            value={value}
                            selected={selectedMetricCells.has(
                              metricCellKey("compare-dates", row.key, column)
                            )}
                            heatmapEnabled={tableHeatmapEnabled}
                            heatStyleValue={tableHeatStyle(row, value)}
                            onSelect={(shiftKey) =>
                              toggleMetricCell("compare-dates", row.key, column, shiftKey)
                            }
                            extraClass={`text-gray-300 ${
                              hour === 1 ? "border-l border-gray-700" : ""
                            } ${
                              hour === 8 ? "border-l border-dotted border-sky-700/70" : ""
                            } ${
                              hour === 23 ? "border-r border-dotted border-sky-700/70" : ""
                            }`}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}

      {activeView === "compare-hubs" && (
        <>
          <SectionCard title="Date Selection" subtitle="Market date for hub comparison">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dateInput}
                onChange={(event) => setDateInput(event.target.value)}
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              />
              <button
                onClick={applyDate}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Load
              </button>
              <button
                onClick={() => {
                  setDate(null);
                  setLatestRefreshToken((value) => value + 1);
                }}
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
              >
                Latest
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Hub Selection" subtitle={`Date: ${data.targetDate}`}>
            <div className="grid gap-3 lg:grid-cols-[repeat(2,minmax(0,240px))] lg:items-end">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Hub A
                </span>
                <select
                  value={compareHubAData?.hub ?? compareHubA}
                  onChange={(event) => setCompareHubA(event.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                >
                  {data.hubs.map((hub) => (
                    <option key={hub.hub} value={hub.hub}>
                      {hub.hub}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Hub B
                </span>
                <select
                  value={compareHubBData?.hub ?? compareHubB}
                  onChange={(event) => setCompareHubB(event.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                >
                  {data.hubs.map((hub) => (
                    <option key={hub.hub} value={hub.hub}>
                      {hub.hub}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </SectionCard>

          <LmpComponentCard
            value={compareHubComponent}
            components={activeComponents}
            onChange={(value) => {
              if (value !== "all") setCompareHubComponent(value);
            }}
          />

          <PlotCard
            title={`${compareHubAData?.hub ?? "Hub A"} vs ${compareHubBData?.hub ?? "Hub B"}`}
            subtitle={`${hubCompareConfig.label}: ${data.targetDate}`}
            series={hubCompareSeries}
            hiddenSeries={hiddenHubCompareSeries}
            onToggleSeries={toggleHubCompareSeries}
            onShowAll={showAllHubCompareSeries}
            onHideAll={hideAllHubCompareSeries}
            focusedChildren={renderHubCompareChart("h-[70vh]")}
          >
            {renderHubCompareChart("h-[340px]")}
          </PlotCard>

          <SectionCard
            title="Hub Comparison Table"
            subtitle={`${hubCompareConfig.label} by hour`}
            action={tableHeatmapAction}
          >
            <div className="overflow-x-auto rounded-lg border border-gray-800 bg-[#0d1119]">
              <table className="w-full min-w-[1180px] border-collapse text-xs text-gray-200">
                <thead className="bg-gray-950 text-gray-500">
                  <tr>
                    <th className="sticky left-0 z-20 bg-gray-950 px-3 py-2 text-left font-semibold uppercase tracking-wide">
                      Series
                    </th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                      Hub
                    </th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">
                      Component
                    </th>
                    <th className="border-l border-gray-700 px-3 py-2 text-right font-semibold uppercase tracking-wide">
                      OnPeak
                    </th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">OffPeak</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">Flat</th>
                    {HOURS.map((hour) => (
                      <th
                        key={hour}
                        className={`px-2 py-2 text-right font-semibold uppercase tracking-wide ${
                          hour === 1 ? "border-l border-gray-700" : ""
                        } ${isOnPeakHour(activeIso, hour) ? "bg-sky-500/10 text-sky-200" : ""}`}
                      >
                        HE{hour}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {hubCompareTableRows.map((row) => (
                    <tr key={row.key} className="hover:bg-gray-900/60">
                      <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2 font-medium text-gray-300">
                        {row.key === "hubA" ? "Hub A" : row.key === "hubB" ? "Hub B" : "Delta"}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-300">
                        {data.targetDate}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-300">
                        {row.key === "delta"
                          ? `${compareHubAData?.hub ?? "Hub A"} - ${compareHubBData?.hub ?? "Hub B"}`
                          : row.label}
                      </td>
                      <td className="px-3 py-2 font-semibold text-gray-100">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: row.color }}
                            aria-hidden="true"
                          />
                          {hubCompareConfig.label}
                        </span>
                      </td>
                      <SelectableMetricCell
                        value={row.onPeakAvg}
                        selected={selectedMetricCells.has(metricCellKey("compare-hubs", row.key, "onpeak"))}
                        heatmapEnabled={tableHeatmapEnabled}
                        heatStyleValue={tableHeatStyle(row, row.onPeakAvg)}
                        onSelect={(shiftKey) =>
                          toggleMetricCell("compare-hubs", row.key, "onpeak", shiftKey)
                        }
                        extraClass="border-l border-gray-700 bg-gray-950/70 font-semibold text-gray-100"
                      />
                      <SelectableMetricCell
                        value={row.offPeakAvg}
                        selected={selectedMetricCells.has(metricCellKey("compare-hubs", row.key, "offpeak"))}
                        heatmapEnabled={tableHeatmapEnabled}
                        heatStyleValue={tableHeatStyle(row, row.offPeakAvg)}
                        onSelect={(shiftKey) =>
                          toggleMetricCell("compare-hubs", row.key, "offpeak", shiftKey)
                        }
                        extraClass="bg-gray-950/70 font-semibold text-gray-100"
                      />
                      <SelectableMetricCell
                        value={row.flatAvg}
                        selected={selectedMetricCells.has(metricCellKey("compare-hubs", row.key, "flat"))}
                        heatmapEnabled={tableHeatmapEnabled}
                        heatStyleValue={tableHeatStyle(row, row.flatAvg)}
                        onSelect={(shiftKey) =>
                          toggleMetricCell("compare-hubs", row.key, "flat", shiftKey)
                        }
                        extraClass="bg-gray-950/70 font-semibold text-gray-100"
                      />
                      {HOURS.map((hour) => {
                        const value = row.values.get(hour) ?? null;
                        const column = `he${hour}` as SettleColumnKey;
                        return (
                          <SelectableMetricCell
                            key={hour}
                            value={value}
                            selected={selectedMetricCells.has(
                              metricCellKey("compare-hubs", row.key, column)
                            )}
                            heatmapEnabled={tableHeatmapEnabled}
                            heatStyleValue={tableHeatStyle(row, value)}
                            onSelect={(shiftKey) =>
                              toggleMetricCell("compare-hubs", row.key, column, shiftKey)
                            }
                            extraClass={`text-gray-300 ${
                              hour === 1 ? "border-l border-gray-700" : ""
                            } ${
                              hour === 8 ? "border-l border-dotted border-sky-700/70" : ""
                            } ${
                              hour === 23 ? "border-r border-dotted border-sky-700/70" : ""
                            }`}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}

      {metricSelectionStats && (
        <SelectionStatsBar
          label={metricSelectionLabel}
          stats={metricSelectionStats}
          onClear={clearMetricSelection}
        />
      )}
    </div>
  );
}
