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
  | "fundCode"
  | "navDate"
  | "accountGroup"
  | "account"
  | "sourceFileRowNumber"
  | "product"
  | "type"
  | "monthYear"
  | "exchangeName"
  | "clientSymbol"
  | "quantity1"
  | "marketValueInBaseCurrency"
  | "productCode"
  | "productGroup"
  | "productRegion"
  | "contractYyyymm"
  | "contractDay"
  | "putCall"
  | "normalizedStrikePrice"
  | "normalizationStatus";

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

interface TableColumn<Key extends string> {
  key: Key;
  label: string;
  align?: ColumnAlign;
  sticky?: boolean;
  minClass?: string;
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
const DEBUG_ROW_LIMIT = 500;
const FILTER_LABEL_CLASS = "text-[10px] font-bold uppercase tracking-wider text-gray-500";
const PILL_DROPDOWN_CLASS =
  "h-8 rounded-full border border-gray-700 bg-white px-3 text-xs font-semibold text-black outline-none transition-colors hover:border-gray-500 focus:border-sky-500/60 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500";
const DEFAULT_FRESHNESS: NavPositionsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Positions --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

function buildApiUrl({
  selectedDate,
  accountFilter,
  refresh,
}: {
  selectedDate: string;
  accountFilter: string;
  refresh: boolean;
}): string {
  const params = new URLSearchParams();
  if (selectedDate) params.set("date", selectedDate);
  if (accountFilter !== "all") params.set("fund", accountFilter);
  if (refresh) params.set("refresh", "1");
  return `/api/dev/nav-positions?${params.toString()}`;
}

function buildDebugApiUrl({
  selectedDate,
  accountFilter,
  limit,
  drilldown,
}: {
  selectedDate: string;
  accountFilter: string;
  limit: number;
  drilldown?: PositionLadderDrilldown | null;
}): string {
  const params = new URLSearchParams({ mode: "debug", limit: String(limit) });
  if (selectedDate) params.set("date", selectedDate);
  if (accountFilter !== "all") params.set("fund", accountFilter);
  if (drilldown) params.set("drilldown", JSON.stringify(drilldown));
  return `/api/dev/nav-positions?${params.toString()}`;
}

function cacheKey({
  selectedDate,
  accountFilter,
}: {
  selectedDate: string;
  accountFilter: string;
}): string {
  return [
    "api:dev:nav-positions",
    selectedDate || "latest",
    accountFilter,
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

function tableHeaderClass(column: TableColumn<string>): string {
  const align = column.align === "left" ? "text-left" : "text-right";
  const sticky = column.sticky ? "sticky left-0 z-20 bg-gray-950" : "";
  return `px-3 py-2 font-semibold uppercase tracking-wide ${align} ${sticky}`;
}

function tableHeaderInnerClass(column: TableColumn<string>): string {
  return `flex w-full items-center gap-1.5 ${
    column.align === "left" ? "justify-start" : "justify-end"
  }`;
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

function positionLadderCellTitle(cell: PositionLadderCell): string {
  const contracts = cell.contractLabels.slice(0, 10).join(", ");
  const contractSuffix =
    cell.contractLabels.length > 10 ? `, +${cell.contractLabels.length - 10} more` : "";
  return [
    `Net qty ${fmtQuantity(cell.netQuantity)}`,
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
  if (column.kind === "month") return "w-[62px]";
  if (column.kind === "other") return "w-[68px]";
  return "w-[82px]";
}

function positionLadderCellClass(
  cell: PositionLadderCell | undefined,
  column: PositionLadderColumn,
): string {
  const padding = column.kind === "month" ? "px-1.5" : "px-2";
  const base = `h-11 ${positionLadderColumnWidthClass(column)} ${padding} py-1.5 text-right align-middle text-[11px] tabular-nums transition-colors`;
  if (!cell || cell.rowCount === 0) return `${base} text-gray-700`;
  if (cell.netQuantity > 0) {
    return `${base} cursor-pointer bg-emerald-500/[0.04] font-semibold text-emerald-100 outline outline-1 -outline-offset-1 outline-emerald-500/60 hover:bg-emerald-500/[0.1]`;
  }
  if (cell.netQuantity < 0) {
    return `${base} cursor-pointer bg-red-500/[0.04] font-semibold text-red-100 outline outline-1 -outline-offset-1 outline-red-500/60 hover:bg-red-500/[0.1]`;
  }
  return `${base} cursor-pointer bg-sky-500/[0.04] font-semibold text-gray-100 outline outline-1 -outline-offset-1 outline-sky-500/50 hover:bg-sky-500/[0.1]`;
}

function renderPositionLadderCell(cell: PositionLadderCell | undefined): ReactNode {
  if (!cell || cell.rowCount === 0) {
    return <span className="text-gray-700">--</span>;
  }

  return (
    <span className="block truncate" title={positionLadderCellTitle(cell)}>
      {fmtQuantity(cell.netQuantity)}
    </span>
  );
}

const DEBUG_ROW_COLUMNS: Array<TableColumn<DebugRowColumnKey>> = [
  { key: "product", label: "Product", align: "left", sticky: true, minClass: "min-w-[260px]" },
  { key: "fundCode", label: "Fund", align: "left", minClass: "min-w-[80px]" },
  { key: "navDate", label: "Date" },
  { key: "accountGroup", label: "Account Group", align: "left", minClass: "min-w-[140px]" },
  { key: "account", label: "Account", align: "left", minClass: "min-w-[110px]" },
  { key: "sourceFileRowNumber", label: "Row" },
  { key: "type", label: "Type" },
  { key: "monthYear", label: "Month" },
  { key: "exchangeName", label: "Exchange" },
  { key: "clientSymbol", label: "Client Symbol", align: "left", minClass: "min-w-[130px]" },
  { key: "quantity1", label: "Qty" },
  { key: "marketValueInBaseCurrency", label: "MV Base" },
  { key: "productCode", label: "Code" },
  { key: "productGroup", label: "Group" },
  { key: "productRegion", label: "Region" },
  { key: "contractYyyymm", label: "Contract" },
  { key: "contractDay", label: "Day" },
  { key: "putCall", label: "C/P" },
  { key: "normalizedStrikePrice", label: "Strike" },
  { key: "normalizationStatus", label: "Status", align: "left", minClass: "min-w-[150px]" },
];

function debugRowDisplayValue(row: NavPositionDebugRow, key: DebugRowColumnKey): string {
  switch (key) {
    case "fundCode":
      return displayText(row.fundCode);
    case "navDate":
      return displayText(row.navDate);
    case "accountGroup":
      return displayText(row.accountGroup);
    case "account":
      return displayText(row.account);
    case "sourceFileRowNumber":
      return row.sourceFileRowNumber.toLocaleString();
    case "product":
      return displayText(row.product);
    case "type":
      return displayText(row.type);
    case "monthYear":
      return displayText(row.monthYear);
    case "exchangeName":
      return displayText(row.exchangeName);
    case "clientSymbol":
      return displayText(row.clientSymbol);
    case "quantity1":
      return fmtQuantity(row.quantity1);
    case "marketValueInBaseCurrency":
      return fmtNumber(row.marketValueInBaseCurrency, 0);
    case "productCode":
      return displayText(row.productCode);
    case "productGroup":
      return displayText(row.productGroup);
    case "productRegion":
      return displayText(row.productRegion);
    case "contractYyyymm":
      return displayText(row.contractYyyymm);
    case "contractDay":
      return fmtNumber(row.contractDay, 0);
    case "putCall":
      return displayText(row.putCall);
    case "normalizedStrikePrice":
      return fmtPrice(row.normalizedStrikePrice);
    case "normalizationStatus":
      return displayText(row.normalizationStatus);
  }
}

function debugRowSortValue(
  row: NavPositionDebugRow,
  key: DebugRowColumnKey,
): string | number | null {
  switch (key) {
    case "sourceFileRowNumber":
      return row.sourceFileRowNumber;
    case "quantity1":
      return row.quantity1;
    case "marketValueInBaseCurrency":
      return row.marketValueInBaseCurrency;
    case "contractDay":
      return row.contractDay;
    case "normalizedStrikePrice":
      return row.normalizedStrikePrice;
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

function debugRowCellClass(row: NavPositionDebugRow, column: TableColumn<DebugRowColumnKey>) {
  const align = column.align === "left" ? "text-left" : "text-right";
  const sticky = column.sticky
    ? "sticky left-0 z-10 max-w-[260px] bg-[#0d1119] font-semibold text-gray-100"
    : "";
  const numeric = [
    "sourceFileRowNumber",
    "quantity1",
    "marketValueInBaseCurrency",
    "contractDay",
    "normalizedStrikePrice",
  ].includes(column.key)
    ? "tabular-nums"
    : "";
  const tone =
    column.key === "normalizationStatus" && row.normalizationStatus !== "ok"
      ? "font-semibold text-yellow-200"
      : column.key === "marketValueInBaseCurrency"
        ? "font-semibold text-gray-100"
        : "text-gray-300";

  return `px-3 py-2 ${align} ${sticky} ${numeric} ${tone}`;
}

function DebugRowsTable({ rows }: { rows: NavPositionDebugRow[] }) {
  const [columnFilters, setColumnFilters] = useState<ColumnFilters<DebugRowColumnKey>>({});
  const [sortState, setSortState] = useState<SortState<DebugRowColumnKey> | null>(null);

  const updateColumnFilter = (key: DebugRowColumnKey, values: string[]) => {
    setColumnFilters((filters) => {
      const next = { ...filters };
      if (values.length > 0) next[key] = values;
      else delete next[key];
      return next;
    });
  };

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
        ? rows
        : rows.filter((row) =>
            activeFilters.every(([key, selected]) => debugRowMatchesFilter(row, key, selected)),
          );

    if (!sortState) return filtered;
    return [...filtered].sort((left, right) =>
      compareColumnValues(
        debugRowSortValue(left, sortState.key),
        debugRowSortValue(right, sortState.key),
        sortState.direction,
      ),
    );
  }, [columnFilters, rows, sortState]);

  const toggleSort = (key: DebugRowColumnKey) => {
    setSortState((current) =>
      current?.key === key && current.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" },
    );
  };

  return (
    <table className="w-full min-w-[1900px] border-collapse bg-[#0d1119] text-xs text-gray-200">
      <thead className="bg-gray-950 text-gray-500">
        <tr className="border-b border-gray-800/80">
          {DEBUG_ROW_COLUMNS.map((column) => {
            const sortDirection = sortState?.key === column.key ? sortState.direction : null;
            return (
              <th key={column.key} className={`${tableHeaderClass(column)} ${column.minClass ?? ""}`}>
                <div className={tableHeaderInnerClass(column)}>
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
                      {sortDirection === "asc" ? "\u2191" : sortDirection === "desc" ? "\u2193" : ""}
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
          displayedRows.map((row) => (
            <tr
              key={`${row.sourceFileName}:${row.sourceFileRowNumber}:${row.fundCode}:${row.navDate}`}
              className="hover:bg-gray-900/60"
            >
              {DEBUG_ROW_COLUMNS.map((column) => (
                <td key={column.key} className={debugRowCellClass(row, column)}>
                  {debugRowDisplayValue(row, column.key)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function DebugRowsModal({
  debugDate,
  debugData,
  debugDrilldown,
  debugError,
  debugLoading,
  onClose,
  onDateChange,
  onLoad,
}: {
  debugDate: string;
  debugData: NavPositionsDebugPayload | null;
  debugDrilldown: PositionLadderDrilldown | null;
  debugError: string | null;
  debugLoading: boolean;
  onClose: () => void;
  onDateChange: (date: string) => void;
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
  return (
    <table className="w-full table-fixed border-collapse bg-[#0d1119] text-xs text-gray-200">
      <thead className="bg-gray-950 text-gray-500">
        <tr className="border-b border-gray-800/80">
          <th className="sticky left-0 top-0 z-30 w-[190px] bg-gray-950 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">
            Product
          </th>
          {columns.map((column) => (
            <th
              key={column.key}
              className={`sticky top-0 z-20 ${positionLadderColumnWidthClass(column)} bg-gray-950 px-1.5 py-2 text-right align-bottom`}
            >
              <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {column.label}
              </span>
              {column.dateLabel ? (
                <span className="mt-1 block truncate text-[9px] font-medium normal-case tracking-normal text-gray-500">
                  {column.dateLabel}
                </span>
              ) : null}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-800">
        {rows.map((row) => (
          <tr key={row.key} className="hover:bg-gray-900/60">
            <td
              className="sticky left-0 z-10 w-[190px] max-w-[190px] bg-[#0d1119] px-2 py-1.5 text-left"
              title={`${row.productLabel} | ${row.subtitle} | ${row.rowCount.toLocaleString()} source rows | MV base ${fmtNumber(row.marketValueBase, 0)}`}
            >
              <span className="block truncate text-[11px] font-bold text-gray-100">
                {row.productLabel}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-gray-500">{row.subtitle}</span>
            </td>
            {columns.map((column) => {
              const cell = row.cells[column.key];
              return (
                <td key={column.key} className={positionLadderCellClass(cell, column)}>
                  {cell && cell.rowCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => onCellSelect(row, column, cell)}
                      className="block h-full w-full truncate text-right outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
                      title={`${positionLadderCellTitle(cell)} | Click for source rows`}
                    >
                      {fmtQuantity(cell.netQuantity)}
                    </button>
                  ) : (
                    renderPositionLadderCell(cell)
                  )}
                </td>
              );
            })}
          </tr>
        ))}
        {!rows.length && (
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
  const [quickProductGroups, setQuickProductGroups] = useState<string[]>([]);
  const [quickProductRegions, setQuickProductRegions] = useState<string[]>([]);
  const [quickProductCodes, setQuickProductCodes] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    const params = {
      selectedDate,
      accountFilter,
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
  }, [accountFilter, onFreshnessChange, refreshToken, selectedDate]);

  const accountFilterOptions = useMemo(() => {
    const values = new Set(data?.metadata.funds ?? []);
    if (accountFilter !== "all") values.add(accountFilter);
    return Array.from(values).sort();
  }, [accountFilter, data]);

  const productGroupOptions = useMemo(
    () => uniqueSortedText((data?.productSummary ?? []).map((row) => row.productGroup)),
    [data],
  );

  const productRegionOptions = useMemo(
    () =>
      uniqueSortedText(
        (data?.productSummary ?? [])
          .filter((row) => selectedTextMatches(row.productGroup, quickProductGroups))
          .map((row) => row.productRegion),
      ),
    [data, quickProductGroups],
  );

  const productCodeOptions = useMemo(
    () =>
      uniqueSortedText(
        (data?.productSummary ?? [])
          .filter(
            (row) =>
              selectedTextMatches(row.productGroup, quickProductGroups) &&
              selectedTextMatches(row.productRegion, quickProductRegions),
          )
          .map((row) => row.productCode),
      ),
    [data, quickProductGroups, quickProductRegions],
  );

  useEffect(() => {
    setQuickProductGroups((selected) => retainAvailableSelections(selected, productGroupOptions));
  }, [productGroupOptions]);

  useEffect(() => {
    setQuickProductRegions((selected) => retainAvailableSelections(selected, productRegionOptions));
  }, [productRegionOptions]);

  useEffect(() => {
    setQuickProductCodes((selected) => retainAvailableSelections(selected, productCodeOptions));
  }, [productCodeOptions]);

  const quickFilteredProductSummary = useMemo(
    () =>
      (data?.productSummary ?? []).filter(
        (row) =>
          selectedTextMatches(row.productGroup, quickProductGroups) &&
          selectedTextMatches(row.productRegion, quickProductRegions) &&
          selectedTextMatches(row.productCode, quickProductCodes),
      ),
    [data, quickProductCodes, quickProductGroups, quickProductRegions],
  );

  const effectiveAnchorDate = anchorDate || data?.selectedDate || selectedDate;

  const positionLadder = useMemo(
    () => buildPositionLadder(quickFilteredProductSummary, effectiveAnchorDate),
    [effectiveAnchorDate, quickFilteredProductSummary],
  );

  const activeQuickFilterCount =
    quickProductGroups.length +
    quickProductRegions.length +
    quickProductCodes.length;

  const clearQuickFilters = () => {
    setQuickProductGroups([]);
    setQuickProductRegions([]);
    setQuickProductCodes([]);
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
  ) => {
    const date = dateOverride ?? debugDate;
    const drilldown = drilldownOverride === undefined ? debugDrilldown : drilldownOverride;
    const controller = new AbortController();

    setDebugLoading(true);
    setDebugError(null);

    void fetchJsonWithCache<NavPositionsDebugPayload>({
      key: [
        "api:dev:nav-positions",
        "debug",
        date || "latest",
        accountFilter,
        drilldown ? JSON.stringify(drilldown) : "all-rows",
      ].join(":"),
      url: buildDebugApiUrl({
        selectedDate: date,
        accountFilter,
        limit: DEBUG_ROW_LIMIT,
        drilldown,
      }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: "no-store",
      forceRefresh: true,
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
    setDebugDate(date);
    setDebugData(null);
    setDebugError(null);
    setDebugDrilldown(null);
    setDebugOpen(true);
    loadDebugRows(date, null);
  };

  const openCellDebugRows = (
    row: PositionLadderRow,
    column: PositionLadderColumn,
    cell: PositionLadderCell,
  ) => {
    if (!cell.rowCount) return;
    const date = selectedDate || data?.selectedDate || data?.latestDate || "";
    const drilldown = drilldownFromCell(row, column);
    setDebugDate(date);
    setDebugData(null);
    setDebugError(null);
    setDebugDrilldown(drilldown);
    setDebugOpen(true);
    loadDebugRows(date, drilldown);
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
                <option value="" className="text-black">
                  Latest
                </option>
                {(data?.availableDates ?? []).map((date) => (
                  <option key={date.navDate} value={date.navDate} className="text-black">
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
                  width="w-40"
                  tone="light"
                  showLabel={false}
                />
                <span className={`${FILTER_LABEL_CLASS} ml-2`}>Product Code</span>
                <MultiSelect
                  label="Product Code"
                  options={productCodeOptions}
                  selected={quickProductCodes}
                  onChange={setQuickProductCodes}
                  placeholder="All codes"
                  width="w-40"
                  tone="light"
                  showLabel={false}
                />
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
          onClose={() => setDebugOpen(false)}
          onDateChange={setDebugDate}
          onLoad={() => loadDebugRows(undefined, debugDrilldown)}
        />
      )}
    </div>
  );
}
