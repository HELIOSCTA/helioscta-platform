"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import ColumnFilterMenu, { type SortDirection } from "@/components/dashboard/ColumnFilterMenu";
import DataTableShell from "@/components/dashboard/DataTableShell";
import MultiSelect from "@/components/ui/MultiSelect";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type {
  NavPositionDebugRow,
  NavPositionsDebugPayload,
  NavPositionsPayload,
  NavPositionsProductFilterOption,
  ProductSummaryRow,
} from "@/lib/positionsAndTrades/navPositionsTypes";

export interface NavPositionsFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

type ColumnAlign = "left" | "right";
type SortState<Key extends string> = { key: Key; direction: SortDirection };
type ColumnFilters<Key extends string> = Partial<Record<Key, string[]>>;

type DebugRowColumnKey =
  | "navDate"
  | "tradeDate"
  | "productGroup"
  | "productRegion"
  | "productCode"
  | "contractYyyymm"
  | "contractDay"
  | "account"
  | "accountName"
  | "longShort"
  | "quantity1"
  | "multiplierAndTickValue"
  | "tradePrice"
  | "marketSettlementPrice"
  | "productNorm"
  | "normalizationStatus"
  | "rulePriority"
  | "ruleMatchType"
  | "rulePattern";

type DebugSelectableColumnKey = Extract<
  DebugRowColumnKey,
  | "contractDay"
  | "quantity1"
  | "multiplierAndTickValue"
  | "tradePrice"
  | "marketSettlementPrice"
  | "rulePriority"
>;

type PositionLadderColumnKey =
  | "prior"
  | "bal-day"
  | "next-day"
  | "bal-week"
  | "weekend"
  | "next-week"
  | "2nd-week"
  | "3rd-week"
  | "4th-week"
  | "other"
  | `month:${string}`;

type PositionLadderProductColumnKey = "product";
type OptionFilter = "all" | "futures" | "options";
type PutCallFilter = "all" | "C" | "P";

interface TableColumn<Key extends string> {
  key: Key;
  label: string;
  align?: ColumnAlign;
  sticky?: boolean;
  minClass?: string;
  width?: number;
}

interface SelectionStats {
  cells: number;
  observations: number;
  columns: DebugSelectableColumnKey[];
  avg: number | null;
  sum: number | null;
  min: number | null;
  max: number | null;
}

interface DebugRowItem {
  row: NavPositionDebugRow;
  key: string;
}

interface PositionLadderColumn {
  key: PositionLadderColumnKey;
  label: string;
  dateLabel: string;
  startIso: string | null;
  endIso: string | null;
  includeWhenEmpty: boolean;
  kind: "bucket" | "month" | "other";
  monthYyyymm: string | null;
}

interface PositionLadderCell {
  netQuantity: number;
  grossQuantity: number;
  marketValueBase: number;
  unrealizedPnlBase: number;
  rowCount: number;
  contractLabels: string[];
}

interface PositionLadderRow {
  key: string;
  productLabel: string;
  subtitle: string;
  productCode: string | null;
  productGroup: string | null;
  productRegion: string | null;
  underlyingProductCode: string | null;
  putCall: string | null;
  strikePrice: number | null;
  cells: Partial<Record<PositionLadderColumnKey, PositionLadderCell>>;
  rowCount: number;
  netQuantity: number;
  marketValueBase: number;
}

interface PositionLadderModel {
  columns: PositionLadderColumn[];
  rows: PositionLadderRow[];
  visibleEndIso: string | null;
}

interface PositionLadderDrilldown {
  productLabel: string;
  bucketLabel: string;
  bucketDateLabel: string;
  productCode: string | null;
  productGroup: string | null;
  productRegion: string | null;
  underlyingProductCode: string | null;
  putCall: string | null;
  strikePrice: number | null;
  bucketKey: PositionLadderColumnKey;
  startIso: string | null;
  endIso: string | null;
  anchorDate: string | null;
  visibleEndIso: string | null;
  monthYyyymm: string | null;
  label: string;
}

const API_CACHE_TTL_MS = 2 * 60 * 1000;
const NAV_POSITIONS_API_PATH = "/api/nav-positions";
const NAV_POSITIONS_DRILLDOWN_API_PATH = "/api/nav-positions/drilldown";
const DEBUG_ROW_LIMIT = 100;
const FILTER_LABEL_CLASS = "text-[10px] font-bold uppercase tracking-wider text-gray-500";
const PILL_DROPDOWN_CLASS =
  "h-8 rounded-full border border-sky-900/70 bg-[#101521] px-3 text-xs font-semibold text-gray-100 shadow-inner shadow-black/20 outline-none transition-colors hover:border-sky-700/80 focus:border-sky-500/70 focus:ring-1 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-900 disabled:text-gray-500";
const POSITION_LADDER_PRODUCT_WIDTH = 220;
const DEFAULT_PRODUCT_GROUP_FILTERS = ["Power"];
const DEFAULT_PRODUCT_REGION_FILTERS = ["PJM"];
const DEFAULT_FRESHNESS: NavPositionsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Positions --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

interface NavPositionsApiFilters {
  selectedDate: string;
  accountFilter: string;
  productGroupFilters: string[];
  productRegionFilters: string[];
  productCodeFilters: string[];
  optionFilter: OptionFilter;
  putCallFilter: PutCallFilter;
}

function stableFilterValues(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function appendRepeatedParams(params: URLSearchParams, name: string, values: string[]): void {
  stableFilterValues(values).forEach((value) => params.append(name, value));
}

function buildApiUrl({
  selectedDate,
  accountFilter,
  productGroupFilters,
  productRegionFilters,
  productCodeFilters,
  optionFilter,
  putCallFilter,
  refresh,
}: NavPositionsApiFilters & {
  refresh: boolean;
}): string {
  const params = new URLSearchParams();
  if (selectedDate) params.set("date", selectedDate);
  if (accountFilter !== "all") params.set("fund", accountFilter);
  appendRepeatedParams(params, "productGroup", productGroupFilters);
  appendRepeatedParams(params, "productRegion", productRegionFilters);
  appendRepeatedParams(params, "productCode", productCodeFilters);
  if (optionFilter !== "all") params.set("instrumentType", optionFilter);
  if (putCallFilter !== "all") params.set("putCall", putCallFilter);
  if (refresh) params.set("refresh", "1");
  return `${NAV_POSITIONS_API_PATH}?${params.toString()}`;
}

function buildDebugApiUrl({
  selectedDate,
  accountFilter,
  productGroupFilters,
  productRegionFilters,
  productCodeFilters,
  optionFilter,
  putCallFilter,
  limit,
  drilldown,
  refresh,
  useLatestSnapshot,
}: NavPositionsApiFilters & {
  limit: number;
  drilldown?: PositionLadderDrilldown | null;
  refresh: boolean;
  useLatestSnapshot: boolean;
}): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (!useLatestSnapshot && selectedDate) params.set("date", selectedDate);
  if (accountFilter !== "all") params.set("fund", accountFilter);
  appendRepeatedParams(params, "productGroup", productGroupFilters);
  appendRepeatedParams(params, "productRegion", productRegionFilters);
  appendRepeatedParams(params, "productCode", productCodeFilters);
  if (optionFilter !== "all") params.set("instrumentType", optionFilter);
  if (putCallFilter !== "all") params.set("putCall", putCallFilter);
  if (refresh) params.set("refresh", "1");
  if (drilldown) params.set("drilldown", JSON.stringify(drilldown));
  return `${NAV_POSITIONS_DRILLDOWN_API_PATH}?${params.toString()}`;
}

function cacheKey({
  selectedDate,
  accountFilter,
  productGroupFilters,
  productRegionFilters,
  productCodeFilters,
  optionFilter,
  putCallFilter,
}: NavPositionsApiFilters): string {
  return [
    "api:nav-positions",
    selectedDate || "latest",
    accountFilter,
    stableFilterValues(productGroupFilters).join(",") || "all-groups",
    stableFilterValues(productRegionFilters).join(",") || "all-regions",
    stableFilterValues(productCodeFilters).join(",") || "all-codes",
    optionFilter,
    putCallFilter,
  ].join(":");
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function parseIsoDate(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function isoFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function localTodayIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compactDateLabel(date: Date): string {
  const dayName = WEEKDAY_LABELS[date.getUTCDay()];
  const monthName = MONTH_LABELS[date.getUTCMonth()];
  return `${dayName} ${monthName}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function compactIsoDateLabel(value: string | null | undefined): string {
  const date = parseIsoDate(value);
  return date ? compactDateLabel(date) : "--";
}

function compactRangeLabel(startIso: string | null, endIso: string | null): string {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end || startIso === null || endIso === null || startIso > endIso) return "--";
  if (startIso === endIso) return compactDateLabel(start);
  return `${compactDateLabel(start)}-${compactDateLabel(end)}`;
}

function nextBusinessDay(date: Date): Date {
  let next = addUtcDays(date, 1);
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
    next = addUtcDays(next, 1);
  }
  return next;
}

function fridayOfWeek(date: Date): Date {
  return addUtcDays(date, (5 - date.getUTCDay() + 7) % 7);
}

function weekendStartOnOrAfter(date: Date): Date {
  const day = date.getUTCDay();
  if (day === 0) return addUtcDays(date, -1);
  if (day === 6) return date;
  return addUtcDays(date, 6 - day);
}

function weekColumn(
  key: PositionLadderColumnKey,
  label: string,
  start: Date,
): PositionLadderColumn {
  const startIso = isoFromDate(start);
  const endIso = isoFromDate(addUtcDays(start, 4));
  return {
    key,
    label,
    dateLabel: compactRangeLabel(startIso, endIso),
    startIso,
    endIso,
    includeWhenEmpty: true,
    kind: "bucket",
    monthYyyymm: null,
  };
}

function buildBasePositionLadderColumns(anchorDateValue: string | null | undefined): PositionLadderColumn[] {
  const anchorDate = parseIsoDate(anchorDateValue);
  if (!anchorDate) {
    return [
      {
        key: "other",
        label: "Other",
        dateLabel: "Unparsed",
        startIso: null,
        endIso: null,
        includeWhenEmpty: true,
        kind: "other",
        monthYyyymm: null,
      },
    ];
  }

  const anchorIso = isoFromDate(anchorDate);
  const nextDay = nextBusinessDay(anchorDate);
  const nextDayIso = isoFromDate(nextDay);
  const balWeekStart = addUtcDays(nextDay, 1);
  const balWeekStartIso = isoFromDate(balWeekStart);
  const balWeekEndIso = isoFromDate(fridayOfWeek(nextDay));
  const weekendStart = weekendStartOnOrAfter(anchorDate);
  const weekendStartIso = isoFromDate(weekendStart);
  const weekendEndIso = isoFromDate(addUtcDays(weekendStart, 1));
  const nextWeekStart = addUtcDays(fridayOfWeek(nextDay), 3);

  return [
    {
      key: "prior",
      label: "Expired",
      dateLabel: `Before ${compactIsoDateLabel(anchorIso)}`,
      startIso: null,
      endIso: isoFromDate(addUtcDays(anchorDate, -1)),
      includeWhenEmpty: false,
      kind: "bucket",
      monthYyyymm: null,
    },
    {
      key: "bal-day",
      label: "Bal Day",
      dateLabel: compactIsoDateLabel(anchorIso),
      startIso: anchorIso,
      endIso: anchorIso,
      includeWhenEmpty: true,
      kind: "bucket",
      monthYyyymm: null,
    },
    {
      key: "next-day",
      label: "Next Day",
      dateLabel: compactIsoDateLabel(nextDayIso),
      startIso: nextDayIso,
      endIso: nextDayIso,
      includeWhenEmpty: true,
      kind: "bucket",
      monthYyyymm: null,
    },
    {
      key: "bal-week",
      label: "Bal Week",
      dateLabel: compactRangeLabel(balWeekStartIso, balWeekEndIso),
      startIso: balWeekStartIso <= balWeekEndIso ? balWeekStartIso : null,
      endIso: balWeekStartIso <= balWeekEndIso ? balWeekEndIso : null,
      includeWhenEmpty: true,
      kind: "bucket",
      monthYyyymm: null,
    },
    {
      key: "weekend",
      label: "Weekend",
      dateLabel: compactRangeLabel(weekendStartIso, weekendEndIso),
      startIso: weekendStartIso,
      endIso: weekendEndIso,
      includeWhenEmpty: true,
      kind: "bucket",
      monthYyyymm: null,
    },
    weekColumn("next-week", "Next Week", nextWeekStart),
    weekColumn("2nd-week", "2nd Week", addUtcDays(nextWeekStart, 7)),
    weekColumn("3rd-week", "3rd Week", addUtcDays(nextWeekStart, 14)),
    weekColumn("4th-week", "4th Week", addUtcDays(nextWeekStart, 21)),
    {
      key: "other",
      label: "Other",
      dateLabel: "Unparsed",
      startIso: null,
      endIso: null,
      includeWhenEmpty: false,
      kind: "other",
      monthYyyymm: null,
    },
  ];
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").replace("Z", "").slice(0, 16);
}

function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function fmtCompactNumber(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function fmtQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  const digits = abs > 100 ? 0 : abs > 1 ? 2 : 4;
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 2 : 4;
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: Math.min(2, digits),
  });
}

function displayText(value: string | null | undefined): string {
  return value && value.trim() ? value : "-";
}

function fmtContractYyyymm(value: string | null | undefined): string {
  const text = displayText(value);
  const match = /^(\d{4})(\d{2})$/.exec(text);
  if (!match) return text;
  return `${match[1]}-${match[2]}`;
}

function dateRangeLabel(payload: NavPositionsPayload): string {
  const min = payload.selectedDateRange.min ?? payload.selectedDate;
  const max = payload.selectedDateRange.max ?? payload.selectedDate;
  if (min && max && min !== max) return `${min} to ${max}`;
  return payload.selectedDate ?? "--";
}

function freshnessFromPayload(payload: NavPositionsPayload | null): NavPositionsFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  const hasRows = payload.summary.rowCount > 0;
  const selectedLabel = dateRangeLabel(payload);
  const isLatest = hasRows && payload.latestDate !== null && payload.selectedDate === payload.latestDate;

  if (!hasRows) {
    return {
      status: "No Data",
      statusClass: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
      summary: `${selectedLabel} | 0 rows`,
      targetDateLabel: selectedLabel,
      latestDateLabel: payload.latestDate ?? "--",
      latestUpdateLabel: fmtDateTime(payload.latestUploadAt ?? payload.asOf),
    };
  }

  return {
    status: isLatest ? "Current" : "Historical",
    statusClass: isLatest
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-sky-500/40 bg-sky-500/10 text-sky-200",
    summary: `${selectedLabel} | ${payload.summary.rowCount.toLocaleString()} rows | ${payload.summary.productGroupCount.toLocaleString()} products`,
    targetDateLabel: selectedLabel,
    latestDateLabel: payload.latestDate ?? "--",
    latestUpdateLabel: fmtDateTime(payload.latestUploadAt ?? payload.asOf),
  };
}

function StatusBadge({ label, tone }: { label: string; tone: "good" | "warn" | "neutral" }) {
  const className =
    tone === "good"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
        ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
        : "border-gray-700 bg-gray-900 text-gray-400";
  return (
    <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

function ControlCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="w-full max-w-none rounded-lg border border-sky-950/70 bg-[#0d121b] p-3 shadow-xl shadow-black/20 ring-1 ring-white/[0.02] sm:p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function QuickFilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
        active
          ? "border-sky-500/50 bg-sky-500/15 text-sky-100"
          : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function uniqueSortedText(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function retainAvailableSelections(selected: string[], options: string[]): string[] {
  const available = new Set(options);
  const retained = selected.filter((value) => available.has(value));
  return retained.length === selected.length ? selected : retained;
}

function selectedTextMatches(value: string | null | undefined, selected: string[]): boolean {
  if (selected.length === 0) return true;
  return Boolean(value && selected.includes(value));
}

function optionFilterMatches(
  instrumentType: string | null | undefined,
  optionFilter: OptionFilter,
): boolean {
  if (optionFilter === "all") return true;
  return optionFilter === "options" ? instrumentType === "option" : instrumentType !== "option";
}

function productFilterOptionMatches(
  option: NavPositionsProductFilterOption,
  {
    productGroups,
    productRegions,
    productCodes,
    optionFilter,
    putCallFilter,
  }: {
    productGroups?: string[];
    productRegions?: string[];
    productCodes?: string[];
    optionFilter?: OptionFilter;
    putCallFilter?: PutCallFilter;
  },
): boolean {
  return (
    selectedTextMatches(option.productGroup, productGroups ?? []) &&
    selectedTextMatches(option.productRegion, productRegions ?? []) &&
    selectedTextMatches(option.productCode, productCodes ?? []) &&
    optionFilterMatches(option.instrumentType, optionFilter ?? "all") &&
    (putCallFilter === undefined || putCallFilter === "all" || option.putCall === putCallFilter)
  );
}

function sortFilterOption(left: string, right: string): number {
  const leftNumber = Number(left.replace(/[$,%\s,]/g, ""));
  const rightNumber = Number(right.replace(/[$,%\s,]/g, ""));
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return left.localeCompare(right, undefined, { numeric: true });
}

function compareColumnValues(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
  direction: SortDirection,
): number {
  if (left === null || left === undefined || left === "") {
    return right === null || right === undefined || right === "" ? 0 : 1;
  }
  if (right === null || right === undefined || right === "") return -1;

  const result =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), undefined, { numeric: true });
  return direction === "asc" ? result : -result;
}

function positionLadderRowKey(row: ProductSummaryRow): string {
  return JSON.stringify([
    row.productCode,
    row.productGroup,
    row.productRegion,
    row.underlyingProductCode,
    row.putCall,
    row.strikePrice,
  ]);
}

function positionLadderProductLabel(row: ProductSummaryRow): string {
  const base = row.productCode?.trim() || row.underlyingProductCode?.trim() || "Unmapped";
  const optionParts = [
    row.putCall,
    row.strikePrice === null || row.strikePrice === undefined ? null : fmtPrice(row.strikePrice),
  ].filter((value): value is string => Boolean(value && value.trim() && value !== "-"));
  return optionParts.length > 0 ? `${base} ${optionParts.join(" ")}` : base;
}

function positionLadderSubtitle(row: ProductSummaryRow): string {
  const underlying =
    row.underlyingProductCode && row.underlyingProductCode !== row.productCode
      ? `Underlying ${row.underlyingProductCode}`
      : null;
  const parts = [row.productGroup, row.productRegion, underlying].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  return parts.length > 0 ? parts.join(" | ") : "Unmapped";
}

function contractIsoFromSummaryRow(row: ProductSummaryRow): string | null {
  const yyyymm = row.contractYyyymm?.trim();
  if (!yyyymm || !/^\d{6}$/.test(yyyymm)) return null;
  if (row.contractDay === null || row.contractDay === undefined) return null;

  const year = Number(yyyymm.slice(0, 4));
  const month = Number(yyyymm.slice(4, 6));
  const day = Math.trunc(row.contractDay);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return isoFromDate(date);
}

function validContractYyyymm(row: ProductSummaryRow): string | null {
  const yyyymm = row.contractYyyymm?.trim();
  return yyyymm && /^\d{6}$/.test(yyyymm) ? yyyymm : null;
}

function monthColumnKey(yyyymm: string): PositionLadderColumnKey {
  return `month:${yyyymm}`;
}

function formatYyyymm(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}`;
}

function contractLabelForSummaryRow(row: ProductSummaryRow, contractIso: string | null): string {
  if (contractIso) return compactIsoDateLabel(contractIso);
  if (row.contractYyyymm && row.contractDay !== null && row.contractDay !== undefined) {
    return `${row.contractYyyymm} day ${fmtNumber(row.contractDay, 0)}`;
  }
  return row.contractYyyymm ?? "No contract";
}

function bucketForContractIso(
  contractIso: string | null,
  columns: PositionLadderColumn[],
  anchorDateValue: string | null | undefined,
): PositionLadderColumnKey {
  const anchorDate = parseIsoDate(anchorDateValue);
  const anchorIso = anchorDate ? isoFromDate(anchorDate) : null;
  if (!contractIso) return "other";
  if (anchorIso && contractIso < anchorIso) return "prior";

  const matchingColumn = columns.find(
    (column) =>
      column.startIso !== null &&
      column.endIso !== null &&
      contractIso >= column.startIso &&
      contractIso <= column.endIso,
  );
  return matchingColumn?.key ?? "other";
}

function bucketForSummaryRow({
  row,
  columns,
  anchorDateValue,
  visibleEndIso,
}: {
  row: ProductSummaryRow;
  columns: PositionLadderColumn[];
  anchorDateValue: string | null | undefined;
  visibleEndIso: string | null;
}): PositionLadderColumnKey {
  const yyyymm = validContractYyyymm(row);
  const contractIso = contractIsoFromSummaryRow(row);

  if (!yyyymm) return "other";
  if (!contractIso) return monthColumnKey(yyyymm);

  const bucketKey = bucketForContractIso(contractIso, columns, anchorDateValue);
  if (bucketKey !== "other") return bucketKey;
  if (visibleEndIso && contractIso > visibleEndIso) return monthColumnKey(yyyymm);
  return monthColumnKey(yyyymm);
}

function emptyPositionLadderCell(): PositionLadderCell {
  return {
    netQuantity: 0,
    grossQuantity: 0,
    marketValueBase: 0,
    unrealizedPnlBase: 0,
    rowCount: 0,
    contractLabels: [],
  };
}

function addContractLabel(cell: PositionLadderCell, label: string): void {
  if (!cell.contractLabels.includes(label)) cell.contractLabels.push(label);
}

function buildPositionLadder(
  rows: ProductSummaryRow[],
  anchorDateValue: string | null | undefined,
): PositionLadderModel {
  const baseColumns = buildBasePositionLadderColumns(anchorDateValue);
  const otherColumn = baseColumns.find((column) => column.key === "other") ?? null;
  const bucketColumns = baseColumns.filter((column) => column.key !== "other");
  const visibleEndIso =
    bucketColumns
      .map((column) => column.endIso)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const monthColumns = new Map<string, PositionLadderColumn>();
  const rowMap = new Map<string, PositionLadderRow>();
  const activeColumnKeys = new Set<PositionLadderColumnKey>();

  for (const sourceRow of rows) {
    const key = positionLadderRowKey(sourceRow);
    const existing = rowMap.get(key);
    const ladderRow =
      existing ??
      {
        key,
        productLabel: positionLadderProductLabel(sourceRow),
        subtitle: positionLadderSubtitle(sourceRow),
        productCode: sourceRow.productCode,
        productGroup: sourceRow.productGroup,
        productRegion: sourceRow.productRegion,
        underlyingProductCode: sourceRow.underlyingProductCode,
        putCall: sourceRow.putCall,
        strikePrice: sourceRow.strikePrice,
        cells: {},
        rowCount: 0,
        netQuantity: 0,
        marketValueBase: 0,
      };

    const contractIso = contractIsoFromSummaryRow(sourceRow);
    const bucketKey = bucketForSummaryRow({
      row: sourceRow,
      columns: bucketColumns,
      anchorDateValue,
      visibleEndIso,
    });
    const cell = ladderRow.cells[bucketKey] ?? emptyPositionLadderCell();
    const monthYyyymm = bucketKey.startsWith("month:")
      ? bucketKey.slice("month:".length)
      : null;

    const netQuantity = sourceRow.netQuantity ?? 0;
    const grossQuantity = sourceRow.grossQuantity ?? Math.abs(netQuantity);
    const marketValueBase = sourceRow.marketValueBase ?? 0;
    const unrealizedPnlBase = sourceRow.unrealizedPnlBase ?? 0;

    cell.netQuantity += netQuantity;
    cell.grossQuantity += grossQuantity;
    cell.marketValueBase += marketValueBase;
    cell.unrealizedPnlBase += unrealizedPnlBase;
    cell.rowCount += sourceRow.rowCount;
    addContractLabel(cell, contractLabelForSummaryRow(sourceRow, contractIso));

    ladderRow.cells[bucketKey] = cell;
    ladderRow.rowCount += sourceRow.rowCount;
    ladderRow.netQuantity += netQuantity;
    ladderRow.marketValueBase += marketValueBase;
    activeColumnKeys.add(bucketKey);
    if (monthYyyymm && !monthColumns.has(bucketKey)) {
      monthColumns.set(bucketKey, {
        key: bucketKey,
        label: formatYyyymm(monthYyyymm),
        dateLabel: "",
        startIso: null,
        endIso: null,
        includeWhenEmpty: false,
        kind: "month",
        monthYyyymm,
      });
    }
    rowMap.set(key, ladderRow);
  }

  const visibleBucketColumns = bucketColumns.filter(
    (column) => column.includeWhenEmpty || activeColumnKeys.has(column.key),
  );
  const visibleMonthColumns = Array.from(monthColumns.values()).sort((left, right) =>
    (left.monthYyyymm ?? "").localeCompare(right.monthYyyymm ?? ""),
  );
  const visibleColumns = [
    ...visibleBucketColumns,
    ...visibleMonthColumns,
    ...(otherColumn && activeColumnKeys.has("other") ? [otherColumn] : []),
  ];
  const ladderRows = Array.from(rowMap.values()).sort((left, right) => {
    const productCompare = left.productLabel.localeCompare(right.productLabel, undefined, {
      numeric: true,
    });
    if (productCompare !== 0) return productCompare;
    const regionCompare = displayText(left.productRegion).localeCompare(
      displayText(right.productRegion),
      undefined,
      { numeric: true },
    );
    if (regionCompare !== 0) return regionCompare;
    return Math.abs(right.marketValueBase) - Math.abs(left.marketValueBase);
  });

  for (const row of ladderRows) {
    for (const cell of Object.values(row.cells)) {
      if (!cell) continue;
      cell.contractLabels.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    }
  }

  return {
    columns: visibleColumns,
    rows: ladderRows,
    visibleEndIso,
  };
}

function positionLadderDisplayDayCount(
  cell: PositionLadderCell,
  column: PositionLadderColumn,
): number {
  if (column.kind !== "bucket") return 1;
  return Math.max(cell.contractLabels.length, 1);
}

function positionLadderDisplayQuantity(
  cell: PositionLadderCell,
  column: PositionLadderColumn,
): number {
  if (column.kind !== "bucket") return cell.netQuantity;
  return cell.netQuantity / positionLadderDisplayDayCount(cell, column);
}

function positionLadderCellTitle(cell: PositionLadderCell, column: PositionLadderColumn): string {
  const contracts = cell.contractLabels.slice(0, 10).join(", ");
  const contractSuffix =
    cell.contractLabels.length > 10 ? `, +${cell.contractLabels.length - 10} more` : "";
  const displayQuantity = positionLadderDisplayQuantity(cell, column);
  const dayCount = positionLadderDisplayDayCount(cell, column);
  return [
    `Display qty ${fmtQuantity(displayQuantity)}`,
    column.kind === "bucket" && dayCount > 1
      ? `Summed qty ${fmtQuantity(cell.netQuantity)} across ${dayCount.toLocaleString()} contract days`
      : null,
    `Gross qty ${fmtQuantity(cell.grossQuantity)}`,
    `MV base ${fmtNumber(cell.marketValueBase, 0)}`,
    `P&L base ${fmtNumber(cell.unrealizedPnlBase, 0)}`,
    `${cell.rowCount.toLocaleString()} source rows`,
    contracts ? `Contracts: ${contracts}${contractSuffix}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" | ");
}

function positionLadderColumnWidthClass(column: PositionLadderColumn): string {
  if (column.kind === "month") return "w-[74px] min-w-[74px]";
  if (column.kind === "other") return "w-[74px] min-w-[74px]";
  return "w-[88px] min-w-[88px]";
}

function positionLadderColumnWidthPx(column: PositionLadderColumn): number {
  if (column.kind === "month" || column.kind === "other") return 74;
  return 88;
}

function positionLadderCellClass(
  cell: PositionLadderCell | undefined,
  column: PositionLadderColumn,
): string {
  const padding = column.kind === "month" ? "px-1.5" : "px-2";
  const base = `h-11 ${positionLadderColumnWidthClass(column)} ${padding} py-1.5 text-right align-middle text-[11px] tabular-nums transition-colors`;
  if (!cell || cell.rowCount === 0) return `${base} text-gray-700`;
  const displayQuantity = positionLadderDisplayQuantity(cell, column);
  if (displayQuantity > 0) {
    return `${base} cursor-pointer bg-emerald-500/[0.04] font-semibold text-emerald-100 outline outline-1 -outline-offset-1 outline-emerald-500/60 hover:bg-emerald-500/[0.1]`;
  }
  if (displayQuantity < 0) {
    return `${base} cursor-pointer bg-red-500/[0.04] font-semibold text-red-100 outline outline-1 -outline-offset-1 outline-red-500/60 hover:bg-red-500/[0.1]`;
  }
  return `${base} cursor-pointer bg-sky-500/[0.04] font-semibold text-gray-100 outline outline-1 -outline-offset-1 outline-sky-500/50 hover:bg-sky-500/[0.1]`;
}

function renderPositionLadderCell(
  cell: PositionLadderCell | undefined,
  column: PositionLadderColumn,
): ReactNode {
  if (!cell || cell.rowCount === 0) {
    return <span className="text-gray-700">--</span>;
  }

  return (
    <span className="block truncate" title={positionLadderCellTitle(cell, column)}>
      {fmtQuantity(positionLadderDisplayQuantity(cell, column))}
    </span>
  );
}

function positionLadderProductSortValue(row: PositionLadderRow): string {
  return row.productLabel;
}

function positionLadderIsOption(row: PositionLadderRow): boolean {
  return row.strikePrice !== null && row.strikePrice !== undefined;
}

function normalizedMarketText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function positionLadderMarketPriority(row: PositionLadderRow): number {
  const isPower = normalizedMarketText(row.productGroup) === "power";
  const isPjm = normalizedMarketText(row.productRegion) === "pjm";
  if (isPower && isPjm) return 0;
  if (isPower) return 1;
  if (isPjm) return 2;
  return 3;
}

function comparePositionLadderRows(
  left: PositionLadderRow,
  right: PositionLadderRow,
  direction: SortDirection,
): number {
  const marketPriority = positionLadderMarketPriority(left) - positionLadderMarketPriority(right);
  if (marketPriority !== 0) return marketPriority;

  const optionPriority = Number(positionLadderIsOption(left)) - Number(positionLadderIsOption(right));
  if (optionPriority !== 0) return optionPriority;

  return compareColumnValues(
    positionLadderProductSortValue(left),
    positionLadderProductSortValue(right),
    direction,
  );
}

const DEBUG_ROW_COLUMNS: Array<TableColumn<DebugRowColumnKey>> = [
  { key: "navDate", label: "NAV Date", sticky: true, width: 84 },
  { key: "tradeDate", label: "Trade", width: 84 },
  { key: "productGroup", label: "Family", align: "left", width: 78 },
  { key: "productRegion", label: "Market", align: "left", width: 72 },
  { key: "productCode", label: "Code", align: "left", width: 76 },
  { key: "contractYyyymm", label: "Contract", width: 74 },
  { key: "contractDay", label: "Day", width: 44 },
  { key: "account", label: "Account", align: "left", width: 108 },
  { key: "accountName", label: "Acct Name", align: "left", width: 110 },
  { key: "longShort", label: "L/S", align: "left", width: 52 },
  { key: "quantity1", label: "Qty", width: 62 },
  { key: "multiplierAndTickValue", label: "Mult", width: 62 },
  { key: "tradePrice", label: "Trade Px", width: 68 },
  { key: "marketSettlementPrice", label: "Settle", width: 68 },
  { key: "productNorm", label: "Product Norm", align: "left", width: 116 },
  { key: "normalizationStatus", label: "Rule", align: "left", width: 62 },
  { key: "rulePriority", label: "Priority", width: 54 },
  { key: "ruleMatchType", label: "Match", align: "left", width: 62 },
  { key: "rulePattern", label: "Pattern", align: "left", width: 116 },
];

const DEBUG_ROW_TABLE_WIDTH = DEBUG_ROW_COLUMNS.reduce(
  (total, column) => total + (column.width ?? 96),
  0,
);
const DEBUG_SELECTABLE_COLUMNS: DebugSelectableColumnKey[] = [
  "contractDay",
  "quantity1",
  "multiplierAndTickValue",
  "tradePrice",
  "marketSettlementPrice",
  "rulePriority",
];

function debugRowDisplayValue(row: NavPositionDebugRow, key: DebugRowColumnKey): string {
  switch (key) {
    case "navDate":
      return displayText(row.navDate);
    case "tradeDate":
      return displayText(row.tradeDate);
    case "productGroup":
      return displayText(row.productGroup);
    case "productRegion":
      return displayText(row.productRegion);
    case "productCode":
      return displayText(row.productCode);
    case "contractYyyymm":
      return fmtContractYyyymm(row.contractYyyymm);
    case "contractDay":
      return fmtNumber(row.contractDay, 0);
    case "account":
      return displayText(row.account);
    case "accountName":
      return displayText(row.accountName);
    case "longShort":
      return displayText(row.longShort);
    case "quantity1":
      return fmtQuantity(row.quantity1);
    case "multiplierAndTickValue":
      return fmtCompactNumber(row.multiplierAndTickValue, 4);
    case "tradePrice":
      return fmtNumber(row.tradePrice, 2);
    case "marketSettlementPrice":
      return fmtNumber(row.marketSettlementPrice, 2);
    case "productNorm":
      return displayText(row.productNorm);
    case "normalizationStatus":
      return displayText(row.normalizationStatus);
    case "rulePriority":
      return fmtNumber(row.rulePriority, 0);
    case "ruleMatchType":
      return displayText(row.ruleMatchType);
    case "rulePattern":
      return displayText(row.rulePattern);
  }
}

function debugRowSortValue(
  row: NavPositionDebugRow,
  key: DebugRowColumnKey,
): string | number | null {
  switch (key) {
    case "quantity1":
      return row.quantity1;
    case "multiplierAndTickValue":
      return row.multiplierAndTickValue;
    case "tradePrice":
      return row.tradePrice;
    case "marketSettlementPrice":
      return row.marketSettlementPrice;
    case "contractDay":
      return row.contractDay;
    case "rulePriority":
      return row.rulePriority;
    default:
      return debugRowDisplayValue(row, key);
  }
}

function debugRowMatchesFilter(
  row: NavPositionDebugRow,
  key: DebugRowColumnKey,
  selectedValues: string[],
): boolean {
  if (selectedValues.length === 0) return true;
  const value = debugRowDisplayValue(row, key).toLowerCase();
  return selectedValues.some((selected) => value === selected.trim().toLowerCase());
}

function debugRowKey(row: NavPositionDebugRow, index: number): string {
  return [
    row.navDate,
    row.tradeDate ?? "",
    row.account ?? "",
    row.productCode ?? "",
    row.contractYyyymm ?? "",
    row.contractDay ?? "",
    row.longShort ?? "",
    row.quantity1 ?? "",
    index,
  ].join("|");
}

function debugCellKey(rowKey: string, column: DebugSelectableColumnKey): string {
  return `${column}|${rowKey}`;
}

function debugCellColumnFromKey(key: string): DebugSelectableColumnKey | null {
  const column = key.split("|", 1)[0] as DebugRowColumnKey;
  return isDebugSelectableColumn(column) ? column : null;
}

function isDebugSelectableColumn(key: DebugRowColumnKey): key is DebugSelectableColumnKey {
  return (DEBUG_SELECTABLE_COLUMNS as DebugRowColumnKey[]).includes(key);
}

function debugSelectableCellValue(
  row: NavPositionDebugRow,
  column: DebugSelectableColumnKey,
): number | null {
  switch (column) {
    case "contractDay":
      return row.contractDay;
    case "quantity1":
      return row.quantity1;
    case "multiplierAndTickValue":
      return row.multiplierAndTickValue;
    case "tradePrice":
      return row.tradePrice;
    case "marketSettlementPrice":
      return row.marketSettlementPrice;
    case "rulePriority":
      return row.rulePriority;
  }
}

function debugSelectableColumnLabel(column: DebugSelectableColumnKey): string {
  return DEBUG_ROW_COLUMNS.find((item) => item.key === column)?.label ?? column;
}

function fmtDebugSelectionValue(
  value: number | null | undefined,
  column: DebugSelectableColumnKey | null,
): string {
  if (column === "quantity1") return fmtQuantity(value);
  if (column === "contractDay" || column === "rulePriority") return fmtNumber(value, 0);
  if (column === "tradePrice" || column === "marketSettlementPrice") {
    return fmtNumber(value, 2);
  }
  return fmtCompactNumber(value, 4);
}

function buildSelectionStats(
  selectedKeys: Set<string>,
  visibleValues: Map<string, number | null>,
): SelectionStats | null {
  const visibleSelectedKeys = Array.from(selectedKeys).filter((key) => visibleValues.has(key));
  if (visibleSelectedKeys.length === 0) return null;

  const values = visibleSelectedKeys
    .map((key) => visibleValues.get(key) ?? null)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const columns = Array.from(
    new Set(
      visibleSelectedKeys
        .map(debugCellColumnFromKey)
        .filter((column): column is DebugSelectableColumnKey => column !== null),
    ),
  );
  const sum = values.reduce((total, value) => total + value, 0);

  return {
    cells: visibleSelectedKeys.length,
    observations: values.length,
    columns,
    avg: values.length > 0 ? sum / values.length : null,
    sum: values.length > 0 ? sum : null,
    min: values.length > 0 ? Math.min(...values) : null,
    max: values.length > 0 ? Math.max(...values) : null,
  };
}

function debugRowHeaderClass(column: TableColumn<DebugRowColumnKey>): string {
  const align = column.align === "left" ? "text-left" : "text-right";
  const sticky = column.sticky
    ? "sticky left-0 top-0 z-30 border-r border-gray-800 bg-gray-950 shadow-[1px_0_0_rgba(31,41,55,0.8)]"
    : "sticky top-0 z-20 bg-gray-950";
  return `px-2 py-1.5 font-semibold uppercase tracking-wide ${align} ${sticky} ${column.minClass ?? ""}`;
}

function debugRowHeaderInnerClass(column: TableColumn<DebugRowColumnKey>): string {
  return `flex w-full min-w-0 items-center gap-1 ${
    column.align === "left" ? "justify-start" : "justify-end"
  }`;
}

function debugRowCellClass(
  row: NavPositionDebugRow,
  column: TableColumn<DebugRowColumnKey>,
  {
    selected = false,
    selectable = false,
  }: {
    selected?: boolean;
    selectable?: boolean;
  } = {},
) {
  const align = column.align === "left" ? "text-left" : "text-right";
  const sticky = column.sticky
    ? "sticky left-0 z-10 border-r border-gray-800 bg-[#0d1119] font-semibold text-gray-100 shadow-[1px_0_0_rgba(31,41,55,0.8)]"
    : "";
  const numeric = [
    "quantity1",
    "multiplierAndTickValue",
    "tradePrice",
    "marketSettlementPrice",
    "contractDay",
    "rulePriority",
  ].includes(column.key)
    ? "tabular-nums"
    : "";
  const tone =
    column.key === "normalizationStatus" && row.normalizationStatus !== "ok"
      ? "font-semibold text-yellow-200"
      : column.key === "quantity1"
        ? "font-semibold text-gray-100"
        : "text-gray-300";
  const interaction = selectable ? "cursor-pointer select-none transition-colors" : "";
  const selection = selected
    ? "bg-sky-500/25 text-sky-50 outline outline-1 -outline-offset-1 outline-sky-400/70"
    : selectable
      ? "hover:bg-sky-500/10"
      : "";

  return `whitespace-nowrap px-2 py-1.5 align-middle text-[11px] ${align} ${column.minClass ?? ""} ${sticky} ${numeric} ${tone} ${interaction} ${selection}`;
}

function debugRowValueClass(column: TableColumn<DebugRowColumnKey>): string {
  const base = "block min-w-0 truncate";
  switch (column.key) {
    case "productNorm":
    case "rulePattern":
      return `${base} max-w-[104px]`;
    case "accountName":
      return `${base} max-w-[98px]`;
    case "account":
      return `${base} max-w-[96px]`;
    case "productGroup":
      return `${base} max-w-[66px]`;
    default:
      return base;
  }
}

function DebugSelectionStatsBar({
  stats,
  onClear,
}: {
  stats: SelectionStats;
  onClear: () => void;
}) {
  const selectedColumn = stats.columns.length === 1 ? stats.columns[0] : null;
  const label =
    selectedColumn === null
      ? "Numeric selection"
      : `${debugSelectableColumnLabel(selectedColumn)} selection`;
  const columnSummary =
    stats.columns.length > 1
      ? stats.columns.map(debugSelectableColumnLabel).join(", ")
      : null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] w-[calc(100vw-2rem)] max-w-4xl -translate-x-1/2 rounded-lg border border-sky-500/30 bg-[#090d15]/95 px-3 py-2 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-300">
        <span className="font-semibold text-sky-100">{label}</span>
        {columnSummary && (
          <span className="max-w-[360px] truncate text-gray-500" title={columnSummary}>
            Cols: {columnSummary}
          </span>
        )}
        <span>
          <span className="text-gray-500">Count:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">
            {stats.observations.toLocaleString()}
          </span>
        </span>
        <span>
          <span className="text-gray-500">Sum:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">
            {fmtDebugSelectionValue(stats.sum, selectedColumn)}
          </span>
        </span>
        <span>
          <span className="text-gray-500">Avg:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">
            {fmtDebugSelectionValue(stats.avg, selectedColumn)}
          </span>
        </span>
        <span>
          <span className="text-gray-500">Min:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">
            {fmtDebugSelectionValue(stats.min, selectedColumn)}
          </span>
        </span>
        <span>
          <span className="text-gray-500">Max:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">
            {fmtDebugSelectionValue(stats.max, selectedColumn)}
          </span>
        </span>
        <span>
          <span className="text-gray-500">Cells:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">
            {stats.cells.toLocaleString()}
          </span>
        </span>
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

function DebugRowsTable({ rows }: { rows: NavPositionDebugRow[] }) {
  const [columnFilters, setColumnFilters] = useState<ColumnFilters<DebugRowColumnKey>>({});
  const [sortState, setSortState] = useState<SortState<DebugRowColumnKey> | null>(null);
  const [selectedDebugCells, setSelectedDebugCells] = useState<Set<string>>(() => new Set());
  const [lastSelectedDebugCell, setLastSelectedDebugCell] = useState<{
    rowKey: string;
    column: DebugSelectableColumnKey;
  } | null>(null);

  const keyedRows = useMemo<DebugRowItem[]>(
    () => rows.map((row, index) => ({ row, key: debugRowKey(row, index) })),
    [rows],
  );

  const updateColumnFilter = (key: DebugRowColumnKey, values: string[]) => {
    setColumnFilters((filters) => {
      const next = { ...filters };
      if (values.length > 0) next[key] = values;
      else delete next[key];
      return next;
    });
  };

  const clearDebugSelection = () => {
    setSelectedDebugCells(new Set());
    setLastSelectedDebugCell(null);
  };

  useEffect(() => {
    clearDebugSelection();
  }, [rows]);

  useEffect(() => {
    if (selectedDebugCells.size === 0) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearDebugSelection();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedDebugCells.size]);

  const filterOptions = useMemo(() => {
    return Object.fromEntries(
      DEBUG_ROW_COLUMNS.map((column) => {
        const otherFilteredRows = rows.filter((row) =>
          Object.entries(columnFilters).every(
            ([key, selected]) =>
              key === column.key || debugRowMatchesFilter(row, key as DebugRowColumnKey, selected),
          ),
        );
        const options = Array.from(
          new Set(
            otherFilteredRows
              .map((row) => debugRowDisplayValue(row, column.key))
              .filter((value) => value.trim() !== "" && value !== "-"),
          ),
        ).sort(sortFilterOption);
        return [column.key, options] as const;
      }),
    ) as Partial<Record<DebugRowColumnKey, string[]>>;
  }, [columnFilters, rows]);

  const displayedRows = useMemo(() => {
    const activeFilters = Object.entries(columnFilters)
      .map(([key, selected]) => [key as DebugRowColumnKey, selected] as const)
      .filter(([, selected]) => selected.length > 0);
    const filtered =
      activeFilters.length === 0
        ? keyedRows
        : keyedRows.filter(({ row }) =>
            activeFilters.every(([key, selected]) => debugRowMatchesFilter(row, key, selected)),
          );

    if (!sortState) return filtered;
    return [...filtered].sort((left, right) =>
      compareColumnValues(
        debugRowSortValue(left.row, sortState.key),
        debugRowSortValue(right.row, sortState.key),
        sortState.direction,
      ),
    );
  }, [columnFilters, keyedRows, sortState]);

  const visibleSelectionValues = useMemo(() => {
    const values = new Map<string, number | null>();
    displayedRows.forEach(({ row, key }) => {
      DEBUG_SELECTABLE_COLUMNS.forEach((column) => {
        values.set(debugCellKey(key, column), debugSelectableCellValue(row, column));
      });
    });
    return values;
  }, [displayedRows]);

  const selectionStats = useMemo(
    () => buildSelectionStats(selectedDebugCells, visibleSelectionValues),
    [selectedDebugCells, visibleSelectionValues],
  );

  const toggleSort = (key: DebugRowColumnKey) => {
    setSortState((current) =>
      current?.key === key && current.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" },
    );
  };

  const toggleDebugCell = (
    rowKey: string,
    column: DebugSelectableColumnKey,
    shiftKey: boolean,
  ) => {
    const key = debugCellKey(rowKey, column);
    const rowOrder = displayedRows.map((item) => item.key);

    if (
      shiftKey &&
      lastSelectedDebugCell?.column === column &&
      rowOrder.includes(lastSelectedDebugCell.rowKey) &&
      rowOrder.includes(rowKey)
    ) {
      const start = rowOrder.indexOf(lastSelectedDebugCell.rowKey);
      const end = rowOrder.indexOf(rowKey);
      const [from, to] = start <= end ? [start, end] : [end, start];
      setSelectedDebugCells((selected) => {
        const next = new Set(selected);
        for (let index = from; index <= to; index += 1) {
          next.add(debugCellKey(rowOrder[index], column));
        }
        return next;
      });
    } else {
      setSelectedDebugCells((selected) => {
        const next = new Set(selected);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    }

    setLastSelectedDebugCell({ rowKey, column });
  };

  return (
    <>
      <table
        className="min-w-full table-fixed border-collapse bg-[#0d1119] text-[11px] text-gray-200"
        style={{ width: DEBUG_ROW_TABLE_WIDTH }}
      >
        <colgroup>
          {DEBUG_ROW_COLUMNS.map((column) => (
            <col key={column.key} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead className="bg-gray-950 text-gray-500">
          <tr className="border-b border-gray-800/80">
            {DEBUG_ROW_COLUMNS.map((column) => {
              const sortDirection = sortState?.key === column.key ? sortState.direction : null;
              return (
                <th key={column.key} className={debugRowHeaderClass(column)}>
                  <div className={debugRowHeaderInnerClass(column)}>
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={`flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-gray-900 ${
                        sortDirection ? "text-sky-200" : "text-gray-400"
                      }`}
                      aria-label={`Sort ${column.label}`}
                    >
                      <span className="truncate whitespace-nowrap text-[10px]">
                        {column.label}
                      </span>
                      <span className="w-3 shrink-0 text-right text-[10px] text-sky-300">
                        {sortDirection === "asc"
                          ? "\u2191"
                          : sortDirection === "desc"
                            ? "\u2193"
                            : ""}
                      </span>
                    </button>
                    <ColumnFilterMenu
                      label={column.label}
                      options={filterOptions[column.key] ?? []}
                      selected={columnFilters[column.key] ?? []}
                      sortDirection={sortDirection}
                      onSort={(direction) => setSortState({ key: column.key, direction })}
                      onChange={(values) => updateColumnFilter(column.key, values)}
                    />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {displayedRows.length === 0 ? (
            <tr>
              <td
                colSpan={DEBUG_ROW_COLUMNS.length}
                className="px-3 py-8 text-center text-sm text-gray-500"
              >
                No debug rows found.
              </td>
            </tr>
          ) : (
            displayedRows.map(({ row, key }) => (
              <tr key={key} className="hover:bg-gray-900/60">
                {DEBUG_ROW_COLUMNS.map((column) => {
                  const displayValue = debugRowDisplayValue(row, column.key);
                  const selectableColumn = isDebugSelectableColumn(column.key) ? column.key : null;
                  const selectable = selectableColumn !== null;
                  const selected =
                    selectableColumn !== null &&
                    selectedDebugCells.has(debugCellKey(key, selectableColumn));
                  return (
                    <td
                      key={column.key}
                      role={selectable ? "button" : undefined}
                      tabIndex={selectable ? 0 : undefined}
                      aria-pressed={selectable ? selected : undefined}
                      onClick={
                        selectableColumn
                          ? (event) => toggleDebugCell(key, selectableColumn, event.shiftKey)
                          : undefined
                      }
                      onKeyDown={
                        selectableColumn
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleDebugCell(key, selectableColumn, event.shiftKey);
                              }
                            }
                          : undefined
                      }
                      className={debugRowCellClass(row, column, { selected, selectable })}
                    >
                      <span
                        className={debugRowValueClass(column)}
                        title={displayValue === "-" ? undefined : displayValue}
                      >
                        {displayValue}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {selectionStats && (
        <DebugSelectionStatsBar stats={selectionStats} onClear={clearDebugSelection} />
      )}
    </>
  );
}

function DebugRowsModal({
  debugDate,
  debugData,
  debugDrilldown,
  debugError,
  debugLoading,
  debugUseLatestSnapshot,
  onClose,
  onDateChange,
  onUseLatestSnapshot,
  onLoad,
}: {
  debugDate: string;
  debugData: NavPositionsDebugPayload | null;
  debugDrilldown: PositionLadderDrilldown | null;
  debugError: string | null;
  debugLoading: boolean;
  debugUseLatestSnapshot: boolean;
  onClose: () => void;
  onDateChange: (date: string) => void;
  onUseLatestSnapshot: () => void;
  onLoad: () => void;
}) {
  const rows = debugData?.rows ?? [];
  const title = debugDrilldown ? "NAV Position Cell Rows" : "Raw NAV Position Rows";
  const contextLabel = debugDrilldown
    ? `${debugDrilldown.productLabel} | ${debugDrilldown.bucketLabel} ${debugDrilldown.bucketDateLabel}`
    : null;
  const subtitle = debugData
    ? [
        contextLabel,
        `NAV snapshot ${displayText(debugData.selectedDate)}`,
        `${debugData.summary.returnedRowCount.toLocaleString()} of ${debugData.summary.rowCount.toLocaleString()} rows`,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" | ")
    : debugUseLatestSnapshot
      ? [contextLabel, `Latest NAV snapshot`]
          .filter((value): value is string => Boolean(value))
          .join(" | ")
      : debugDate
        ? [contextLabel, `NAV snapshot ${debugDate}`]
          .filter((value): value is string => Boolean(value))
          .join(" | ")
        : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label="Raw NAV position rows debug"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-gray-800 bg-[#0d1119] shadow-2xl shadow-black/60"
        onClick={(event) => event.stopPropagation()}
      >
        <DataTableShell
          title={title}
          subtitle={subtitle}
          className="border-0 bg-transparent shadow-none"
          bodyClassName="max-h-[calc(90vh-116px)]"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onUseLatestSnapshot}
                disabled={debugLoading}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                  debugUseLatestSnapshot
                    ? "border-sky-500/70 bg-sky-500/20 text-white"
                    : "border-gray-700 bg-gray-900 text-gray-300 hover:border-sky-500/50 hover:text-sky-100"
                }`}
              >
                Latest
              </button>
              <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                NAV Snapshot
                <input
                  type="date"
                  value={debugDate}
                  onChange={(event) => onDateChange(event.target.value)}
                  className="h-8 rounded-md border border-gray-700 bg-gray-950 px-2 text-xs font-semibold normal-case tracking-normal text-gray-200 outline-none focus:border-sky-500/60"
                />
              </label>
              <button
                type="button"
                onClick={onLoad}
                disabled={debugLoading}
                className="rounded-md border border-sky-700/60 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-950/40 disabled:text-gray-600"
              >
                {debugLoading ? "Loading..." : "Load"}
              </button>
              <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs text-gray-400">
                {rows.length.toLocaleString()} rows
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:border-sky-500/50 hover:text-sky-100"
              >
                Close
              </button>
            </div>
          }
        >
          {debugError ? (
            <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {debugError}
            </div>
          ) : null}
          {debugLoading && !debugData ? (
            <div className="min-h-[360px] bg-[#0d1119] p-6 text-sm text-gray-500">
              Loading raw position rows...
            </div>
          ) : (
            <div className="min-h-[360px] bg-[#0d1119]">
              <DebugRowsTable rows={rows} />
            </div>
          )}
        </DataTableShell>
      </div>
    </div>
  );
}

function PositionLadderTable({
  columns,
  rows,
  onCellSelect,
}: {
  columns: PositionLadderColumn[];
  rows: PositionLadderRow[];
  onCellSelect: (
    row: PositionLadderRow,
    column: PositionLadderColumn,
    cell: PositionLadderCell,
  ) => void;
}) {
  const [sortState, setSortState] = useState<SortState<PositionLadderProductColumnKey> | null>({
    key: "product",
    direction: "asc",
  });

  const displayedRows = useMemo(() => {
    if (!sortState) return rows;
    return [...rows].sort((left, right) =>
      comparePositionLadderRows(left, right, sortState.direction),
    );
  }, [rows, sortState]);

  const toggleSort = (key: PositionLadderProductColumnKey) => {
    setSortState((current) =>
      current?.key === key && current.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" },
    );
  };

  const tableMinWidth =
    POSITION_LADDER_PRODUCT_WIDTH +
    columns.reduce((total, column) => total + positionLadderColumnWidthPx(column), 0);
  const productSortDirection = sortState?.key === "product" ? sortState.direction : null;

  return (
    <table
      className="w-full border-separate border-spacing-0 bg-[#0d1119] text-xs text-gray-200"
      style={{ minWidth: `${tableMinWidth}px` }}
    >
      <thead className="bg-gray-950 text-gray-500">
        <tr>
          <th
            className="sticky left-0 top-0 z-40 border-b border-gray-800/80 bg-gray-950 px-2 py-2 text-left align-bottom text-[10px] font-semibold uppercase tracking-wide text-gray-500"
            style={{
              width: POSITION_LADDER_PRODUCT_WIDTH,
              minWidth: POSITION_LADDER_PRODUCT_WIDTH,
              maxWidth: POSITION_LADDER_PRODUCT_WIDTH,
            }}
          >
            <div className="flex w-full items-center justify-start gap-1.5">
              <button
                type="button"
                onClick={() => toggleSort("product")}
                className={`flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-gray-900 ${
                  productSortDirection ? "text-sky-200" : "text-gray-400"
                }`}
                aria-label="Sort Product"
              >
                <span className="truncate whitespace-nowrap">Product</span>
                <span className="w-3 shrink-0 text-right text-[10px] text-sky-300">
                  {productSortDirection === "asc"
                    ? "\u2191"
                    : productSortDirection === "desc"
                      ? "\u2193"
                      : ""}
                </span>
              </button>
            </div>
          </th>
          {columns.map((column) => (
            <th
              key={column.key}
              className={`sticky top-0 z-30 border-b border-gray-800/80 ${positionLadderColumnWidthClass(column)} bg-gray-950 px-1.5 py-2 text-right align-bottom`}
            >
              <span
                className="block truncate text-[10px] font-semibold uppercase tracking-wide text-gray-500"
                title={column.label}
              >
                {column.label}
              </span>
              {column.dateLabel ? (
                <span
                  className="mt-1 block truncate text-[9px] font-medium normal-case tracking-normal text-gray-500"
                  title={column.dateLabel}
                >
                  {column.dateLabel}
                </span>
              ) : null}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {displayedRows.map((row) => (
          <tr key={row.key} className="group hover:bg-gray-900/60">
            <td
              className="sticky left-0 z-20 border-b border-gray-800/80 bg-[#0d1119] px-2 py-1.5 text-left align-middle group-hover:bg-gray-900/95"
              style={{
                width: POSITION_LADDER_PRODUCT_WIDTH,
                minWidth: POSITION_LADDER_PRODUCT_WIDTH,
                maxWidth: POSITION_LADDER_PRODUCT_WIDTH,
              }}
              title={`${row.productLabel} | ${row.subtitle} | ${row.rowCount.toLocaleString()} source rows | MV base ${fmtNumber(row.marketValueBase, 0)}`}
            >
              <span className="block truncate text-[11px] font-bold text-gray-100">
                {row.productLabel}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-gray-500">
                {row.subtitle}
              </span>
            </td>
            {columns.map((column) => {
              const cell = row.cells[column.key];
              return (
                <td
                  key={column.key}
                  className={`${positionLadderCellClass(cell, column)} border-b border-gray-800/80`}
                >
                  {cell && cell.rowCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => onCellSelect(row, column, cell)}
                      className="block h-full w-full truncate text-right outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
                      title={`${positionLadderCellTitle(cell, column)} | Click for source rows`}
                    >
                      {fmtQuantity(positionLadderDisplayQuantity(cell, column))}
                    </button>
                  ) : (
                    renderPositionLadderCell(cell, column)
                  )}
                </td>
              );
            })}
          </tr>
        ))}
        {!displayedRows.length && (
          <tr>
            <td
              colSpan={columns.length + 1}
              className="px-3 py-8 text-center text-sm text-gray-500"
            >
              No position groups match the selected filters.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default function NavPositions({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: NavPositionsFreshnessSummary) => void;
}) {
  const [selectedDate, setSelectedDate] = useState("");
  const [anchorDate, setAnchorDate] = useState(() => localTodayIso());
  const [accountFilter, setAccountFilter] = useState("all");
  const [data, setData] = useState<NavPositionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugDate, setDebugDate] = useState("");
  const [debugData, setDebugData] = useState<NavPositionsDebugPayload | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [debugDrilldown, setDebugDrilldown] = useState<PositionLadderDrilldown | null>(null);
  const [debugUseLatestSnapshot, setDebugUseLatestSnapshot] = useState(true);
  const [quickProductGroups, setQuickProductGroups] = useState<string[]>(() => [
    ...DEFAULT_PRODUCT_GROUP_FILTERS,
  ]);
  const [quickProductRegions, setQuickProductRegions] = useState<string[]>(() => [
    ...DEFAULT_PRODUCT_REGION_FILTERS,
  ]);
  const [quickProductCodes, setQuickProductCodes] = useState<string[]>([]);
  const [optionFilter, setOptionFilter] = useState<OptionFilter>("all");
  const [putCallFilter, setPutCallFilter] = useState<PutCallFilter>("all");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    const params = {
      selectedDate,
      accountFilter,
      productGroupFilters: quickProductGroups,
      productRegionFilters: quickProductRegions,
      productCodeFilters: quickProductCodes,
      optionFilter,
      putCallFilter,
    };
    const url = buildApiUrl({ ...params, refresh: refreshToken > 0 });

    fetchJsonWithCache<NavPositionsPayload>({
      key: cacheKey(params),
      url,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        onFreshnessChange?.(freshnessFromPayload(payload));
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setError(err.message || "Failed to load positions");
        setData(null);
        onFreshnessChange?.({
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Positions query failed",
          targetDateLabel: selectedDate || "--",
          latestDateLabel: "--",
          latestUpdateLabel: "--",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    accountFilter,
    onFreshnessChange,
    optionFilter,
    putCallFilter,
    quickProductCodes,
    quickProductGroups,
    quickProductRegions,
    refreshToken,
    selectedDate,
  ]);

  const accountFilterOptions = useMemo(() => {
    const values = new Set(data?.metadata.funds ?? []);
    if (accountFilter !== "all") values.add(accountFilter);
    return Array.from(values).sort();
  }, [accountFilter, data]);

  const productGroupOptions = useMemo(
    () => uniqueSortedText((data?.metadata.productFilterOptions ?? []).map((row) => row.productGroup)),
    [data],
  );

  const productRegionOptions = useMemo(
    () =>
      uniqueSortedText(
        (data?.metadata.productFilterOptions ?? [])
          .filter((row) =>
            productFilterOptionMatches(row, {
              productGroups: quickProductGroups,
              optionFilter,
              putCallFilter,
            }),
          )
          .map((row) => row.productRegion),
      ),
    [data, optionFilter, putCallFilter, quickProductGroups],
  );

  const productCodeOptions = useMemo(
    () =>
      uniqueSortedText(
        (data?.metadata.productFilterOptions ?? [])
          .filter((row) =>
            productFilterOptionMatches(row, {
              productGroups: quickProductGroups,
              productRegions: quickProductRegions,
              optionFilter,
              putCallFilter,
            }),
          )
          .map((row) => row.productCode),
      ),
    [data, optionFilter, putCallFilter, quickProductGroups, quickProductRegions],
  );

  useEffect(() => {
    if (!data) return;
    setQuickProductGroups((selected) => retainAvailableSelections(selected, productGroupOptions));
  }, [data, productGroupOptions]);

  useEffect(() => {
    if (!data) return;
    setQuickProductRegions((selected) => retainAvailableSelections(selected, productRegionOptions));
  }, [data, productRegionOptions]);

  useEffect(() => {
    if (!data) return;
    setQuickProductCodes((selected) => retainAvailableSelections(selected, productCodeOptions));
  }, [data, productCodeOptions]);

  const quickFilteredProductSummary = useMemo(
    () =>
      (data?.productSummary ?? []).filter((row) => {
        const isOption = row.strikePrice !== null && row.strikePrice !== undefined;
        return (
          selectedTextMatches(row.productGroup, quickProductGroups) &&
          selectedTextMatches(row.productRegion, quickProductRegions) &&
          selectedTextMatches(row.productCode, quickProductCodes) &&
          (optionFilter === "all" ||
            (optionFilter === "options" && isOption) ||
            (optionFilter === "futures" && !isOption)) &&
          (putCallFilter === "all" || row.putCall === putCallFilter)
        );
      }),
    [
      data,
      optionFilter,
      putCallFilter,
      quickProductCodes,
      quickProductGroups,
      quickProductRegions,
    ],
  );

  const effectiveAnchorDate = anchorDate || data?.selectedDate || selectedDate;

  const positionLadder = useMemo(
    () => buildPositionLadder(quickFilteredProductSummary, effectiveAnchorDate),
    [effectiveAnchorDate, quickFilteredProductSummary],
  );

  const activeQuickFilterCount =
    quickProductGroups.length +
    quickProductRegions.length +
    quickProductCodes.length +
    (optionFilter === "all" ? 0 : 1) +
    (putCallFilter === "all" ? 0 : 1);

  const clearQuickFilters = () => {
    setQuickProductGroups([]);
    setQuickProductRegions([]);
    setQuickProductCodes([]);
    setOptionFilter("all");
    setPutCallFilter("all");
  };

  const drilldownFromCell = (
    row: PositionLadderRow,
    column: PositionLadderColumn,
  ): PositionLadderDrilldown => ({
    productLabel: row.productLabel,
    bucketLabel: column.label,
    bucketDateLabel: column.dateLabel,
    productCode: row.productCode,
    productGroup: row.productGroup,
    productRegion: row.productRegion,
    underlyingProductCode: row.underlyingProductCode,
    putCall: row.putCall,
    strikePrice: row.strikePrice,
    bucketKey: column.key,
    startIso: column.startIso,
    endIso: column.endIso,
    anchorDate: effectiveAnchorDate || null,
    visibleEndIso: positionLadder.visibleEndIso,
    monthYyyymm: column.monthYyyymm,
    label: `${row.productLabel} | ${column.label} ${column.dateLabel}`,
  });

  const loadDebugRows = (
    dateOverride?: string,
    drilldownOverride?: PositionLadderDrilldown | null,
    useLatestSnapshotOverride?: boolean,
    forceRefreshOverride = false,
  ) => {
    const date = dateOverride ?? debugDate;
    const drilldown = drilldownOverride === undefined ? debugDrilldown : drilldownOverride;
    const useLatestSnapshot = useLatestSnapshotOverride ?? debugUseLatestSnapshot;
    const controller = new AbortController();

    setDebugLoading(true);
    setDebugError(null);

    void fetchJsonWithCache<NavPositionsDebugPayload>({
      key: [
        "api:nav-positions",
        "debug",
        useLatestSnapshot ? "latest" : date || "date-empty",
        accountFilter,
        stableFilterValues(quickProductGroups).join(",") || "all-groups",
        stableFilterValues(quickProductRegions).join(",") || "all-regions",
        stableFilterValues(quickProductCodes).join(",") || "all-codes",
        optionFilter,
        putCallFilter,
        drilldown ? JSON.stringify(drilldown) : "all-rows",
      ].join(":"),
      url: buildDebugApiUrl({
        selectedDate: date,
        accountFilter,
        productGroupFilters: quickProductGroups,
        productRegionFilters: quickProductRegions,
        productCodeFilters: quickProductCodes,
        optionFilter,
        putCallFilter,
        limit: DEBUG_ROW_LIMIT,
        drilldown,
        refresh: forceRefreshOverride,
        useLatestSnapshot,
      }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefreshOverride ? "no-store" : "default",
      forceRefresh: forceRefreshOverride,
    })
      .then((payload) => {
        setDebugData(payload);
        setDebugDate(payload.selectedDate ?? date);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setDebugError(err.message || "Failed to load raw position rows");
      })
      .finally(() => {
        setDebugLoading(false);
      });
  };

  const openDebugRows = () => {
    const date = selectedDate || data?.selectedDate || data?.latestDate || "";
    const useLatestSnapshot = selectedDate === "";
    setDebugUseLatestSnapshot(useLatestSnapshot);
    setDebugDate(date);
    setDebugData(null);
    setDebugError(null);
    setDebugDrilldown(null);
    setDebugOpen(true);
    loadDebugRows(date, null, useLatestSnapshot);
  };

  const openCellDebugRows = (
    row: PositionLadderRow,
    column: PositionLadderColumn,
    cell: PositionLadderCell,
  ) => {
    if (!cell.rowCount) return;
    const date = selectedDate || data?.selectedDate || data?.latestDate || "";
    const useLatestSnapshot = selectedDate === "";
    const drilldown = drilldownFromCell(row, column);
    setDebugUseLatestSnapshot(useLatestSnapshot);
    setDebugDate(date);
    setDebugData(null);
    setDebugError(null);
    setDebugDrilldown(drilldown);
    setDebugOpen(true);
    loadDebugRows(date, drilldown, useLatestSnapshot);
  };

  return (
    <div className="w-full space-y-4">
      <div className="mx-auto w-full max-w-4xl">
        <ControlCard title="Positions">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                Filters
              </span>
              <span className="h-px flex-1 bg-gray-800" />
              <span className="text-xs text-gray-500">
                {positionLadder.rows.length.toLocaleString()} products |{" "}
                {quickFilteredProductSummary.length.toLocaleString()} /{" "}
                {(data?.productSummary.length ?? 0).toLocaleString()} groups
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={FILTER_LABEL_CLASS}>NAV Snapshot</span>
              <select
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                disabled={!data?.availableDates.length && loading}
                className={PILL_DROPDOWN_CLASS}
              >
                <option value="" className="bg-[#101521] text-gray-100">
                  Latest
                </option>
                {(data?.availableDates ?? []).map((date) => (
                  <option key={date.navDate} value={date.navDate} className="bg-[#101521] text-gray-100">
                    {date.navDate}
                  </option>
                ))}
              </select>
              <span className={`${FILTER_LABEL_CLASS} ml-2`}>Anchor Date</span>
              <input
                type="date"
                value={anchorDate}
                onChange={(event) => setAnchorDate(event.target.value)}
                className="h-8 rounded-full border border-gray-700 bg-transparent px-3 text-xs font-semibold text-gray-200 outline-none transition-colors hover:border-gray-600 focus:border-sky-500/60"
                aria-label="Anchor Date"
              />
              <button
                type="button"
                onClick={() => setAnchorDate(localTodayIso())}
                className="h-8 rounded-full border border-gray-700 bg-transparent px-3 text-xs font-semibold text-gray-400 transition-colors hover:border-sky-500/50 hover:text-sky-100"
              >
                Today
              </button>
              <StatusBadge
                label={`${data?.summary.rowCount.toLocaleString() ?? 0} rows`}
                tone={data?.summary.rowCount ? "good" : "warn"}
              />
              <StatusBadge
                label={`As of ${fmtDateTime(data?.latestUploadAt ?? data?.asOf)}`}
                tone="neutral"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={FILTER_LABEL_CLASS}>Account</span>
              <QuickFilterChip active={accountFilter === "all"} onClick={() => setAccountFilter("all")}>
                All Accounts
              </QuickFilterChip>
              {accountFilterOptions.map((item) => (
                <QuickFilterChip
                  key={item}
                  active={accountFilter === item}
                  onClick={() => setAccountFilter(item)}
                >
                  {item.toUpperCase()}
                </QuickFilterChip>
              ))}
            </div>

            {data && (
              <div className="flex flex-wrap items-center gap-2">
                <span className={FILTER_LABEL_CLASS}>Group</span>
                <QuickFilterChip
                  active={quickProductGroups.length === 0}
                  onClick={() => setQuickProductGroups([])}
                >
                  All Groups
                </QuickFilterChip>
                {productGroupOptions.map((group) => {
                  const active = quickProductGroups.includes(group);
                  return (
                    <QuickFilterChip
                      key={group}
                      active={active}
                      onClick={() =>
                        setQuickProductGroups((selected) =>
                          active
                            ? selected.filter((value) => value !== group)
                            : [...selected, group],
                        )
                      }
                    >
                      {group}
                    </QuickFilterChip>
                  );
                })}
                <span className={`${FILTER_LABEL_CLASS} ml-2`}>Region</span>
                <MultiSelect
                  label="Region"
                  options={productRegionOptions}
                  selected={quickProductRegions}
                  onChange={setQuickProductRegions}
                  placeholder="All regions"
                  width="w-36"
                  tone="dark"
                  showLabel={false}
                />
                <span className={`${FILTER_LABEL_CLASS} ml-2`}>Product Code</span>
                <MultiSelect
                  label="Product Code"
                  options={productCodeOptions}
                  selected={quickProductCodes}
                  onChange={setQuickProductCodes}
                  placeholder="All codes"
                  width="w-36"
                  tone="dark"
                  showLabel={false}
                />
                <span className={`${FILTER_LABEL_CLASS} ml-2`}>Option</span>
                <QuickFilterChip active={optionFilter === "all"} onClick={() => setOptionFilter("all")}>
                  All
                </QuickFilterChip>
                <QuickFilterChip
                  active={optionFilter === "futures"}
                  onClick={() => setOptionFilter("futures")}
                >
                  Futures
                </QuickFilterChip>
                <QuickFilterChip
                  active={optionFilter === "options"}
                  onClick={() => setOptionFilter("options")}
                >
                  Options
                </QuickFilterChip>
                <span className={`${FILTER_LABEL_CLASS} ml-2`}>C/P</span>
                <QuickFilterChip active={putCallFilter === "all"} onClick={() => setPutCallFilter("all")}>
                  All
                </QuickFilterChip>
                <QuickFilterChip active={putCallFilter === "C"} onClick={() => setPutCallFilter("C")}>
                  C
                </QuickFilterChip>
                <QuickFilterChip active={putCallFilter === "P"} onClick={() => setPutCallFilter("P")}>
                  P
                </QuickFilterChip>
                {activeQuickFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearQuickFilters}
                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-600 hover:text-gray-100"
                  >
                    Clear ({activeQuickFilterCount})
                  </button>
                )}
              </div>
            )}
          </div>
        </ControlCard>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading positions...
        </div>
      )}

      {data && !loading && (
        <DataTableShell
          title="NAV Position Summary"
          subtitle={`NAV snapshot ${data.selectedDate ?? "--"} | Anchor Date ${effectiveAnchorDate || "--"} | Net quantity by contract bucket from ${data.metadata.promotedSql}.`}
          className="w-full"
          bodyClassName="w-full max-h-[calc(100vh-260px)] overflow-y-auto"
          action={
            <button
              type="button"
              onClick={openDebugRows}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:border-sky-500/50 hover:bg-gray-700 hover:text-white"
            >
              Debug Rows
            </button>
          }
        >
          <div className="w-full bg-[#0d1119]">
            <PositionLadderTable
              columns={positionLadder.columns}
              rows={positionLadder.rows}
              onCellSelect={openCellDebugRows}
            />
          </div>
        </DataTableShell>
      )}

      {debugOpen && (
        <DebugRowsModal
          debugDate={debugDate}
          debugData={debugData}
          debugDrilldown={debugDrilldown}
          debugError={debugError}
          debugLoading={debugLoading}
          debugUseLatestSnapshot={debugUseLatestSnapshot}
          onClose={() => setDebugOpen(false)}
          onDateChange={(date) => {
            setDebugUseLatestSnapshot(false);
            setDebugDate(date);
          }}
          onUseLatestSnapshot={() => {
            setDebugUseLatestSnapshot(true);
            setDebugDate(data?.selectedDate ?? data?.latestDate ?? debugDate);
          }}
          onLoad={() => loadDebugRows(undefined, debugDrilldown, undefined, true)}
        />
      )}
    </div>
  );
}
