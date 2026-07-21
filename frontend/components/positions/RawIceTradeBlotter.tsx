"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import ColumnFilterMenu, { type SortDirection } from "@/components/dashboard/ColumnFilterMenu";
import DataTableShell from "@/components/dashboard/DataTableShell";
import MultiSelect from "@/components/ui/MultiSelect";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type {
  IceTradeBlotterAggregateRow,
  IceTradeBlotterDebugPayload,
  IceTradeBlotterDrilldownFilter,
  IceTradeBlotterPayload,
  IceTradeBlotterRawRow,
} from "@/lib/positionsAndTrades/iceTradeBlotterTypes";

export interface RawIceTradeBlotterFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
  rowCountLabel: string;
}

interface RawIceTradeBlotterApiFilters {
  selectedDate: string;
  sides: string[];
  traders: string[];
  clearingAccounts: string[];
  customerAccounts: string[];
  clearingFirms: string[];
  products: string[];
  hubs: string[];
  ccs: string[];
  contracts: string[];
  options: string[];
  dealSections: string[];
  sources: string[];
  userIds: string[];
  search: string;
}

interface ContractColumn {
  key: string;
  label: string;
  subtitle: string;
  contract: string | null;
  beginDate: string | null;
  endDate: string | null;
}

interface BlotterLadderCell {
  rowCount: number;
  distinctDealCount: number;
  totalLots: number;
  netLots: number;
  netQuantity: number;
  grossQuantity: number;
  avgPrice: number | null;
  sides: string | null;
  traders: string | null;
  clearingAccounts: string | null;
  customerAccounts: string | null;
  latestTradeTime: string | null;
}

interface BlotterLadderRow {
  key: string;
  productLabel: string;
  subtitle: string;
  product: string | null;
  hub: string | null;
  option: string | null;
  strike: number | null;
  strike2: number | null;
  cc: string | null;
  strip: string | null;
  dealSection: string | null;
  cells: Record<string, BlotterLadderCell>;
  rowCount: number;
  distinctDealCount: number;
  netLots: number;
  netQuantity: number;
  grossQuantity: number;
}

interface BlotterLadderModel {
  columns: ContractColumn[];
  rows: BlotterLadderRow[];
}

type SortState<Key extends string> = {
  key: Key;
  direction: SortDirection;
};

type ColumnFilters<Key extends string> = Partial<Record<Key, string[]>>;
type BlotterLadderSortKey = "product" | `strip:${string}`;
type RawRowColumnKey = keyof IceTradeBlotterRawRow;

interface RawRowSelectionValue {
  columnKey: RawRowColumnKey;
  columnLabel: string;
  value: number;
  digits: number;
}

interface RawRowSelectionStats {
  cells: number;
  observations: number;
  columns: Array<{
    key: RawRowColumnKey;
    label: string;
    digits: number;
  }>;
  avg: number | null;
  sum: number | null;
  min: number | null;
  max: number | null;
}

const API_CACHE_TTL_MS = 2 * 60 * 1000;
const RAW_ICE_BLOTTER_API_PATH = "/api/ice-trade-blotter/raw";
const RAW_ICE_BLOTTER_DRILLDOWN_API_PATH = "/api/ice-trade-blotter/raw/drilldown";
const RAW_ROW_LIMIT = 100;
const FILTER_LABEL_CLASS = "text-[10px] font-bold uppercase tracking-wider text-gray-500";
const PILL_DROPDOWN_CLASS =
  "h-8 rounded-full border border-sky-900/70 bg-[#101521] px-3 text-xs font-semibold text-gray-100 shadow-inner shadow-black/20 outline-none transition-colors hover:border-sky-700/80 focus:border-sky-500/70 focus:ring-1 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-900 disabled:text-gray-500";
const DEFAULT_FRESHNESS: RawIceTradeBlotterFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "ICE Trade Blotter --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
  rowCountLabel: "--",
};

function stableFilterValues(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function appendRepeatedParams(params: URLSearchParams, name: string, values: string[]): void {
  stableFilterValues(values).forEach((value) => params.append(name, value));
}

function buildApiUrl({
  selectedDate,
  sides,
  traders,
  clearingAccounts,
  customerAccounts,
  clearingFirms,
  products,
  hubs,
  ccs,
  contracts,
  options,
  dealSections,
  sources,
  userIds,
  search,
  refresh,
}: RawIceTradeBlotterApiFilters & { refresh: boolean }): string {
  const params = new URLSearchParams();
  if (selectedDate) params.set("date", selectedDate);
  appendRepeatedParams(params, "side", sides);
  appendRepeatedParams(params, "trader", traders);
  appendRepeatedParams(params, "clearingAcct", clearingAccounts);
  appendRepeatedParams(params, "custAcct", customerAccounts);
  appendRepeatedParams(params, "clearingFirm", clearingFirms);
  appendRepeatedParams(params, "product", products);
  appendRepeatedParams(params, "hub", hubs);
  appendRepeatedParams(params, "cc", ccs);
  appendRepeatedParams(params, "contract", contracts);
  appendRepeatedParams(params, "option", options);
  appendRepeatedParams(params, "dealSection", dealSections);
  appendRepeatedParams(params, "source", sources);
  appendRepeatedParams(params, "userId", userIds);
  if (search.trim()) params.set("search", search.trim());
  if (refresh) params.set("refresh", "1");
  const queryString = params.toString();
  return `${RAW_ICE_BLOTTER_API_PATH}${queryString ? `?${queryString}` : ""}`;
}

function buildDebugApiUrl({
  limit,
  drilldown,
  refresh,
  ...filters
}: RawIceTradeBlotterApiFilters & {
  limit: number;
  drilldown?: IceTradeBlotterDrilldownFilter | null;
  refresh: boolean;
}): string {
  const summaryUrl = buildApiUrl({ ...filters, refresh });
  const url = new URL(summaryUrl, "http://local");
  url.pathname = RAW_ICE_BLOTTER_DRILLDOWN_API_PATH;
  url.searchParams.set("limit", String(limit));
  if (drilldown) url.searchParams.set("drilldown", JSON.stringify(drilldown));
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function cacheKey({
  selectedDate,
  sides,
  traders,
  clearingAccounts,
  customerAccounts,
  clearingFirms,
  products,
  hubs,
  ccs,
  contracts,
  options,
  dealSections,
  sources,
  userIds,
  search,
}: RawIceTradeBlotterApiFilters): string {
  return [
    "api:ice-trade-blotter:raw",
    selectedDate || "latest",
    stableFilterValues(sides).join(",") || "all-sides",
    stableFilterValues(traders).join(",") || "all-traders",
    stableFilterValues(clearingAccounts).join(",") || "all-clearing-accounts",
    stableFilterValues(customerAccounts).join(",") || "all-customer-accounts",
    stableFilterValues(clearingFirms).join(",") || "all-clearing-firms",
    stableFilterValues(products).join(",") || "all-products",
    stableFilterValues(hubs).join(",") || "all-hubs",
    stableFilterValues(ccs).join(",") || "all-ccs",
    stableFilterValues(contracts).join(",") || "all-contracts",
    stableFilterValues(options).join(",") || "all-options",
    stableFilterValues(dealSections).join(",") || "all-sections",
    stableFilterValues(sources).join(",") || "all-sources",
    stableFilterValues(userIds).join(",") || "all-users",
    search.trim() || "no-search",
  ].join(":");
}

function debugCacheKey(
  filters: RawIceTradeBlotterApiFilters,
  drilldown: IceTradeBlotterDrilldownFilter | null,
): string {
  return [
    cacheKey(filters),
    "drilldown",
    drilldown ? JSON.stringify(drilldown) : "all-rows",
  ].join(":");
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayText(value: string | null | undefined): string {
  return value && value.trim() ? value : "-";
}

function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function fmtFlexibleNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

type SortableValue = string | number | null | undefined;

function normalizeFilterText(value: string): string {
  return value.trim().toLowerCase();
}

function selectedFilterMatches(displayValue: string, selectedValues: string[]): boolean {
  if (selectedValues.length === 0) return true;
  const filterText = normalizeFilterText(displayValue);
  return selectedValues.some((value) => filterText === normalizeFilterText(value));
}

function uniqueSortedTexts(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
  );
}

function compareSortableValues(
  left: SortableValue,
  right: SortableValue,
  direction: SortDirection,
): number {
  const leftEmpty = left === null || left === undefined || left === "";
  const rightEmpty = right === null || right === undefined || right === "";
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  const comparison =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), undefined, {
          numeric: true,
          sensitivity: "base",
        });

  return direction === "asc" ? comparison : -comparison;
}

function sortIndicator(direction: SortDirection | null): string {
  if (direction === "asc") return "\u2191";
  if (direction === "desc") return "\u2193";
  return "";
}

const MONTH_INDEX_BY_NAME: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function signedBySide(value: number | null | undefined, side: string | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const normalizedSide = side?.trim().toLowerCase() ?? "";
  if (normalizedSide.startsWith("s")) return -Math.abs(value);
  if (normalizedSide.startsWith("b")) return Math.abs(value);
  return value;
}

function signedLots(row: IceTradeBlotterRawRow): number | null {
  return signedBySide(row.lots, row.side);
}

function signedTotalQuantity(row: IceTradeBlotterRawRow): number | null {
  return signedBySide(row.totalQuantity, row.side);
}

function fullYear(yearText: string): number {
  const year = Number(yearText);
  if (!Number.isFinite(year)) return Number.NaN;
  if (yearText.length === 2) return year >= 70 ? 1900 + year : 2000 + year;
  return year;
}

function utcDateSortValue(year: number, monthIndex: number, day: number): number | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    !Number.isInteger(day) ||
    monthIndex < 0 ||
    monthIndex > 11 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return Date.UTC(year, monthIndex, day);
}

function parseDateSortValue(value: string | null | undefined): number | null {
  const text = value?.trim();
  if (!text) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (isoMatch) {
    return utcDateSortValue(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const dmyMatch = /^(\d{1,2})-([A-Za-z]{3,9})-(\d{2,4})$/.exec(text);
  if (dmyMatch) {
    const monthIndex = MONTH_INDEX_BY_NAME[dmyMatch[2].toLowerCase()];
    return utcDateSortValue(fullYear(dmyMatch[3]), monthIndex, Number(dmyMatch[1]));
  }

  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(text);
  if (slashMatch) {
    return utcDateSortValue(fullYear(slashMatch[3]), Number(slashMatch[1]) - 1, Number(slashMatch[2]));
  }

  return null;
}

function deliveryEndSortValue(column: ContractColumn): number | null {
  return parseDateSortValue(column.endDate) ?? parseDateSortValue(column.beginDate);
}

function deliveryStartSortValue(column: ContractColumn): number | null {
  return parseDateSortValue(column.beginDate) ?? parseDateSortValue(column.endDate);
}

function rangeLabel(beginDate: string | null, endDate: string | null): string {
  if (beginDate && endDate && beginDate !== endDate) return `${beginDate} to ${endDate}`;
  return beginDate ?? endDate ?? "-";
}

function contractKey(row: IceTradeBlotterAggregateRow): string {
  return JSON.stringify([row.contract, row.beginDate, row.endDate]);
}

function rowKey(row: IceTradeBlotterAggregateRow): string {
  return JSON.stringify([
    row.product,
    row.hub,
    row.option,
    row.strike,
    row.strike2,
    row.cc,
    row.strip,
    row.dealSection,
  ]);
}

function contractColumnLabel(row: IceTradeBlotterAggregateRow): string {
  return row.contract?.trim() || rangeLabel(row.beginDate, row.endDate);
}

function contractColumnSubtitle(row: IceTradeBlotterAggregateRow): string {
  const parts = [row.beginDate, row.endDate].filter((value): value is string =>
    Boolean(value && value.trim()),
  );
  if (parts.length === 0) return "No date window";
  if (parts.length === 1 || parts[0] === parts[1]) return parts[0];
  return `${parts[0]} to ${parts[1]}`;
}

function contractColumnDeliveryPhase(column: ContractColumn, selectedDate: string | null | undefined): number {
  const snapshotDate = parseDateSortValue(selectedDate);
  const deliveryEnd = deliveryEndSortValue(column);
  if (deliveryEnd === null) return 2;
  if (snapshotDate !== null && deliveryEnd < snapshotDate) return 1;
  return 0;
}

function compareContractColumns(
  left: ContractColumn,
  right: ContractColumn,
  selectedDate: string | null | undefined,
): number {
  const leftPhase = contractColumnDeliveryPhase(left, selectedDate);
  const rightPhase = contractColumnDeliveryPhase(right, selectedDate);
  if (leftPhase !== rightPhase) return leftPhase - rightPhase;

  const leftStart = deliveryStartSortValue(left);
  const rightStart = deliveryStartSortValue(right);
  if (leftStart !== null && rightStart !== null && leftStart !== rightStart) {
    return leftStart - rightStart;
  }
  if (leftStart !== null && rightStart === null) return -1;
  if (leftStart === null && rightStart !== null) return 1;

  const leftEnd = deliveryEndSortValue(left);
  const rightEnd = deliveryEndSortValue(right);
  if (leftEnd !== null && rightEnd !== null && leftEnd !== rightEnd) {
    return leftEnd - rightEnd;
  }
  if (leftEnd !== null && rightEnd === null) return -1;
  if (leftEnd === null && rightEnd !== null) return 1;

  return left.label.localeCompare(right.label, undefined, { numeric: true });
}

function productLabel(row: IceTradeBlotterAggregateRow): string {
  const base = [row.cc, row.hub].filter((value): value is string =>
    Boolean(value && value.trim()),
  );
  return base.length > 0 ? base.join(" | ") : "Unspecified Product";
}

function productSubtitle(row: IceTradeBlotterAggregateRow): string {
  const product = displayText(row.product);
  const optionParts = [
    row.option,
    row.strike === null || row.strike === undefined ? null : fmtFlexibleNumber(row.strike, 6),
    row.strike2 === null || row.strike2 === undefined ? null : fmtFlexibleNumber(row.strike2, 6),
  ].filter((value): value is string => Boolean(value && value.trim() && value !== "0"));

  const parts = [product, ...optionParts].filter((value): value is string =>
    Boolean(value && value.trim()),
  );
  return parts.length > 0 ? parts.join(" | ") : "Raw ICE identity";
}

function combineTextList(left: string | null, right: string | null): string | null {
  const values = new Set(
    [left, right]
      .flatMap((value) => value?.split(",") ?? [])
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return values.size > 0 ? Array.from(values).sort().join(", ") : null;
}

function addCellValues(target: BlotterLadderCell, row: IceTradeBlotterAggregateRow): void {
  target.rowCount += row.rowCount;
  target.distinctDealCount += row.distinctDealCount;
  target.totalLots += row.totalLots ?? 0;
  target.netLots += row.netLots ?? 0;
  target.netQuantity += row.netQuantity ?? 0;
  target.grossQuantity += row.grossQuantity ?? 0;
  target.sides = combineTextList(target.sides, row.sides);
  target.traders = combineTextList(target.traders, row.traders);
  target.clearingAccounts = combineTextList(target.clearingAccounts, row.clearingAccounts);
  target.customerAccounts = combineTextList(target.customerAccounts, row.customerAccounts);
  target.latestTradeTime = row.latestTradeTime ?? target.latestTradeTime;

  if (row.avgPrice !== null) {
    const currentWeight = target.grossQuantity - (row.grossQuantity ?? 0);
    const nextWeight = row.grossQuantity ?? 0;
    const currentValue = target.avgPrice === null ? 0 : target.avgPrice * currentWeight;
    const nextValue = row.avgPrice * nextWeight;
    target.avgPrice =
      currentWeight + nextWeight > 0 ? (currentValue + nextValue) / (currentWeight + nextWeight) : row.avgPrice;
  }
}

function emptyCell(): BlotterLadderCell {
  return {
    rowCount: 0,
    distinctDealCount: 0,
    totalLots: 0,
    netLots: 0,
    netQuantity: 0,
    grossQuantity: 0,
    avgPrice: null,
    sides: null,
    traders: null,
    clearingAccounts: null,
    customerAccounts: null,
    latestTradeTime: null,
  };
}

function buildBlotterLadder(
  rows: IceTradeBlotterAggregateRow[],
  selectedDate: string | null | undefined,
): BlotterLadderModel {
  const columnsByKey = new Map<string, ContractColumn>();
  const rowsByKey = new Map<string, BlotterLadderRow>();

  for (const row of rows) {
    const columnKey = contractKey(row);
    if (!columnsByKey.has(columnKey)) {
      columnsByKey.set(columnKey, {
        key: columnKey,
        label: contractColumnLabel(row),
        subtitle: contractColumnSubtitle(row),
        contract: row.contract,
        beginDate: row.beginDate,
        endDate: row.endDate,
      });
    }

    const blotterRowKey = rowKey(row);
    let blotterRow = rowsByKey.get(blotterRowKey);
    if (!blotterRow) {
      blotterRow = {
        key: blotterRowKey,
        productLabel: productLabel(row),
        subtitle: productSubtitle(row),
        product: row.product,
        hub: row.hub,
        option: row.option,
        strike: row.strike,
        strike2: row.strike2,
        cc: row.cc,
        strip: row.strip,
        dealSection: row.dealSection,
        cells: {},
        rowCount: 0,
        distinctDealCount: 0,
        netLots: 0,
        netQuantity: 0,
        grossQuantity: 0,
      };
      rowsByKey.set(blotterRowKey, blotterRow);
    }

    const cell = blotterRow.cells[columnKey] ?? emptyCell();
    addCellValues(cell, row);
    blotterRow.cells[columnKey] = cell;
    blotterRow.rowCount += row.rowCount;
    blotterRow.distinctDealCount += row.distinctDealCount;
    blotterRow.netLots += row.netLots ?? 0;
    blotterRow.netQuantity += row.netQuantity ?? 0;
    blotterRow.grossQuantity += row.grossQuantity ?? 0;
  }

  const columns = Array.from(columnsByKey.values()).sort((left, right) =>
    compareContractColumns(left, right, selectedDate),
  );

  const ladderRows = Array.from(rowsByKey.values()).sort((left, right) => {
    const sizeCompare = Math.abs(right.netLots) - Math.abs(left.netLots);
    if (sizeCompare !== 0) return sizeCompare;
    return left.productLabel.localeCompare(right.productLabel, undefined, { numeric: true });
  });

  return { columns, rows: ladderRows };
}

function freshnessFromPayload(
  payload: IceTradeBlotterPayload | null,
): RawIceTradeBlotterFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  const hasRows = payload.summary.rowCount > 0;
  const selectedLabel = payload.selectedDate ?? "--";
  const isLatest = hasRows && payload.latestDate !== null && payload.selectedDate === payload.latestDate;
  const latestUpdate = payload.latestLoadedAt ?? payload.asOf ?? payload.summary.latestUpdatedAt;

  if (!hasRows) {
    return {
      status: "No Data",
      statusClass: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
      summary: `${selectedLabel} | 0 rows`,
      targetDateLabel: selectedLabel,
      latestDateLabel: payload.latestDate ?? "--",
      latestUpdateLabel: fmtDateTime(latestUpdate),
      rowCountLabel: "0",
    };
  }

  return {
    status: isLatest ? "Current" : "Historical",
    statusClass: isLatest
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-sky-500/40 bg-sky-500/10 text-sky-200",
    summary: `${selectedLabel} | ${payload.summary.rowCount.toLocaleString()} rows | ${payload.summary.distinctDealCount.toLocaleString()} deals`,
    targetDateLabel: selectedLabel,
    latestDateLabel: payload.latestDate ?? "--",
    latestUpdateLabel: fmtDateTime(latestUpdate),
    rowCountLabel: payload.summary.rowCount.toLocaleString(),
  };
}

function retainAvailableSelections(selected: string[], options: string[]): string[] {
  const available = new Set(options);
  const retained = selected.filter((value) => available.has(value));
  return retained.length === selected.length ? selected : retained;
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

function SelectableFilterGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const toggle = (option: string) => {
    onChange(
      selected.includes(option)
        ? selected.filter((value) => value !== option)
        : [...selected, option],
    );
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className={FILTER_LABEL_CLASS}>{label}</span>
      <button
        type="button"
        aria-pressed={selected.length === 0}
        onClick={() => onChange([])}
        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
          selected.length === 0
            ? "border-sky-500/50 bg-sky-500/15 text-sky-100"
            : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
        }`}
      >
        All
      </button>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(option)}
            className={`max-w-[180px] truncate rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              active
                ? "border-sky-500/50 bg-sky-500/15 text-sky-100"
                : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
            }`}
            title={option}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function DrilldownButton({
  cell,
  onClick,
}: {
  cell: BlotterLadderCell | undefined;
  onClick: () => void;
}) {
  if (!cell || cell.rowCount === 0) {
    return <span className="block h-9 min-w-[92px]" />;
  }

  const positive = cell.netLots > 0;
  const negative = cell.netLots < 0;
  const rowCountLabel = `${cell.rowCount.toLocaleString()} ${cell.rowCount === 1 ? "row" : "rows"}`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 w-full min-w-[92px] items-center justify-end rounded-md border px-2 text-right transition-colors ${
        positive
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400/50"
          : negative
            ? "border-red-500/20 bg-red-500/10 text-red-100 hover:border-red-400/50"
            : "border-gray-800 bg-gray-950/70 text-gray-300 hover:border-gray-700"
      }`}
      title={`${fmtFlexibleNumber(cell.netLots, 2)} signed lots | ${rowCountLabel}`}
    >
      <span className="text-sm font-semibold">{fmtFlexibleNumber(cell.netLots, 2)}</span>
    </button>
  );
}

function blotterLadderProductFilterLabel(row: BlotterLadderRow): string {
  return row.productLabel;
}

function blotterLadderFilterValue(row: BlotterLadderRow, key: BlotterLadderSortKey): string {
  if (key === "product") return blotterLadderProductFilterLabel(row);

  const stripKey = stripKeyFromSortKey(key);
  if (!stripKey) return "-";
  const cell = row.cells[stripKey];
  return cell && cell.rowCount > 0 ? fmtFlexibleNumber(cell.netLots, 2) : "-";
}

function blotterLadderStripSortKey(column: ContractColumn): BlotterLadderSortKey {
  return `strip:${column.key}`;
}

function stripKeyFromSortKey(sortKey: BlotterLadderSortKey): string | null {
  return sortKey.startsWith("strip:") ? sortKey.slice("strip:".length) : null;
}

function blotterLadderCellSortValue(row: BlotterLadderRow, columnKey: string): number | null {
  const cell = row.cells[columnKey];
  if (!cell || cell.rowCount === 0) return null;
  return cell.netLots;
}

function compareBlotterProductRows(
  left: BlotterLadderRow,
  right: BlotterLadderRow,
  direction: SortDirection,
): number {
  const productCompare = compareSortableValues(left.productLabel, right.productLabel, direction);
  if (productCompare !== 0) return productCompare;
  return compareSortableValues(left.subtitle, right.subtitle, direction);
}

function sortBlotterLadderRows(
  rows: BlotterLadderRow[],
  sortState: SortState<BlotterLadderSortKey> | null,
): BlotterLadderRow[] {
  if (!sortState) return rows;

  const stripKey = stripKeyFromSortKey(sortState.key);
  return [...rows].sort((left, right) => {
    const comparison =
      sortState.key === "product"
        ? compareBlotterProductRows(left, right, sortState.direction)
        : stripKey
          ? compareSortableValues(
              blotterLadderCellSortValue(left, stripKey),
              blotterLadderCellSortValue(right, stripKey),
              sortState.direction,
            )
          : 0;

    if (comparison !== 0) return comparison;
    return compareSortableValues(left.productLabel, right.productLabel, "asc");
  });
}

function blotterLadderMatchesColumnFilters(
  row: BlotterLadderRow,
  filters: ColumnFilters<BlotterLadderSortKey>,
): boolean {
  return (Object.entries(filters) as Array<[BlotterLadderSortKey, string[]]>).every(
    ([key, selectedValues]) => selectedFilterMatches(blotterLadderFilterValue(row, key), selectedValues),
  );
}

function retainColumnFilters<Key extends string>(
  filters: ColumnFilters<Key>,
  optionsByKey: ColumnFilters<Key>,
): ColumnFilters<Key> {
  let changed = false;
  const next: ColumnFilters<Key> = {};

  (Object.entries(filters) as Array<[Key, string[]]>).forEach(([key, selectedValues]) => {
    const options = optionsByKey[key] ?? [];
    const retained = retainAvailableSelections(selectedValues, options);
    if (retained.length > 0) next[key] = retained;
    if (retained.length !== selectedValues.length) changed = true;
  });

  if (Object.keys(next).length !== Object.keys(filters).length) changed = true;
  return changed ? next : filters;
}

function BlotterLadderTable({
  columns,
  rows,
  onCellSelect,
}: {
  columns: ContractColumn[];
  rows: BlotterLadderRow[];
  onCellSelect: (row: BlotterLadderRow, column: ContractColumn) => void;
}) {
  const [sortState, setSortState] = useState<SortState<BlotterLadderSortKey> | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters<BlotterLadderSortKey>>({});
  const filterOptionsByKey = useMemo(
    () =>
      Object.fromEntries([
        ["product", uniqueSortedTexts(rows.map((row) => blotterLadderProductFilterLabel(row)))],
        ...columns.map((column): [BlotterLadderSortKey, string[]] => {
          const key = blotterLadderStripSortKey(column);
          return [key, uniqueSortedTexts(rows.map((row) => blotterLadderFilterValue(row, key)))];
        }),
      ]) as ColumnFilters<BlotterLadderSortKey>,
    [columns, rows],
  );
  const displayedRows = useMemo(() => {
    const filteredRows = rows.filter((row) =>
      blotterLadderMatchesColumnFilters(row, columnFilters),
    );
    return sortBlotterLadderRows(filteredRows, sortState);
  }, [columnFilters, rows, sortState]);

  useEffect(() => {
    setColumnFilters((filters) => retainColumnFilters(filters, filterOptionsByKey));
  }, [filterOptionsByKey]);

  const updateSort = (key: BlotterLadderSortKey, defaultDirection: SortDirection = "asc") => {
    setSortState((sort) =>
      sort?.key === key
        ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: defaultDirection },
    );
  };

  const updateColumnFilter = (key: BlotterLadderSortKey, values: string[]) => {
    setColumnFilters((filters) => {
      const next = { ...filters };
      if (values.length === 0) delete next[key];
      else next[key] = values;
      return next;
    });
  };

  if (columns.length === 0 || rows.length === 0) {
    return (
      <div className="p-6 text-sm text-gray-500">
        No raw ICE trades match the selected filters.
      </div>
    );
  }

  return (
    <table
      className="table-fixed border-separate border-spacing-0 text-xs"
      style={{ width: blotterLadderTableWidth(columns) }}
    >
      <colgroup>
        <col style={{ width: BLOTTER_LADDER_PRODUCT_WIDTH_PX }} />
        {columns.map((column) => (
          <col key={column.key} style={{ width: blotterLadderColumnWidth(column) }} />
        ))}
      </colgroup>
      <thead className="sticky top-0 z-20 bg-gray-950 text-gray-500">
        <tr className="border-b border-gray-800/80">
          <th className="sticky left-0 top-0 z-30 border-b border-r border-gray-800 bg-gray-950 px-2 py-1.5 text-left font-semibold uppercase tracking-wide shadow-[1px_0_0_rgba(31,41,55,0.8)]">
            <div className="flex w-full min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={() => updateSort("product")}
                className={`flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-gray-900 ${
                  sortState?.key === "product" ? "text-sky-200" : "text-gray-400"
                }`}
                aria-label="Sort Product"
              >
                <span className="truncate whitespace-nowrap text-[10px]">Product</span>
                <span className="w-3 shrink-0 text-right text-[10px] text-sky-300">
                  {sortIndicator(sortState?.key === "product" ? sortState.direction : null)}
                </span>
              </button>
              <ColumnFilterMenu
                label="Product"
                options={filterOptionsByKey.product ?? []}
                selected={columnFilters.product ?? []}
                sortDirection={sortState?.key === "product" ? sortState.direction : null}
                onSort={(direction) => setSortState({ key: "product", direction })}
                onChange={(values) => updateColumnFilter("product", values)}
              />
            </div>
          </th>
          {columns.map((column) => {
            const sortKey = blotterLadderStripSortKey(column);
            const sortDirection = sortState?.key === sortKey ? sortState.direction : null;
            return (
              <th
                key={column.key}
                className="sticky top-0 z-20 border-b border-r border-gray-800 bg-gray-950 px-2 py-1.5 text-right align-middle font-semibold uppercase tracking-wide"
                title={`${column.label} | ${column.subtitle}`}
              >
                <div className="flex w-full min-w-0 items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => updateSort(sortKey, "desc")}
                    className={`flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-right transition-colors hover:bg-gray-900 ${
                      sortDirection ? "text-sky-200" : "text-gray-400"
                    }`}
                    aria-label={`Sort ${column.label}`}
                  >
                    <span className="truncate whitespace-nowrap text-[10px]">{column.label}</span>
                    <span className="w-3 shrink-0 text-right text-[10px] text-sky-300">
                      {sortIndicator(sortDirection)}
                    </span>
                  </button>
                  <ColumnFilterMenu
                    label={column.label}
                    options={filterOptionsByKey[sortKey] ?? []}
                    selected={columnFilters[sortKey] ?? []}
                    sortDirection={sortDirection}
                    onSort={(direction) => setSortState({ key: sortKey, direction })}
                    onChange={(values) => updateColumnFilter(sortKey, values)}
                  />
                </div>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {displayedRows.length === 0 ? (
          <tr>
            <td className="px-3 py-5 text-sm text-gray-500" colSpan={columns.length + 1}>
              No products match the table filters.
            </td>
          </tr>
        ) : displayedRows.map((row) => (
          <tr key={row.key} className="group">
            <th
              className="sticky left-0 z-10 border-b border-r border-gray-800 bg-[#0d1119] px-3 py-1.5 text-left align-middle group-hover:bg-[#151b28]"
              title={`${row.productLabel} | ${row.subtitle}`}
            >
              <span className="block truncate text-xs font-semibold text-gray-100">
                {row.productLabel}
              </span>
              <span className="mt-0.5 block truncate text-[10px] font-medium text-gray-500">
                {row.subtitle}
              </span>
            </th>
            {columns.map((column) => (
              <td
                key={column.key}
                className="border-b border-r border-gray-800 bg-[#0d1119] p-1 align-middle group-hover:bg-[#151b28]"
              >
                <DrilldownButton
                  cell={row.cells[column.key]}
                  onClick={() => onCellSelect(row, column)}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type RawRowColumn = {
  key: RawRowColumnKey;
  label: string;
  align?: "left" | "right";
  width?: number;
  render?: (row: IceTradeBlotterRawRow) => string;
  sumValue?: (row: IceTradeBlotterRawRow) => number | null | undefined;
  selectionLabel?: string;
  selectionDigits?: number;
};

const RAW_ROW_DEFAULT_COLUMN_WIDTH_PX = 110;
const BLOTTER_LADDER_PRODUCT_WIDTH_PX = 260;
const BLOTTER_LADDER_STRIP_MIN_WIDTH_PX = 112;
const BLOTTER_LADDER_STRIP_MAX_WIDTH_PX = 184;

function rawRowColumns(): RawRowColumn[] {
  return [
    { key: "tradeDate", label: "Trade Date" },
    { key: "tradeTime", label: "Time" },
    { key: "dealId", label: "Deal ID" },
    { key: "legId", label: "Leg" },
    { key: "side", label: "B/S" },
    { key: "product", label: "Product" },
    { key: "hub", label: "Hub" },
    { key: "contract", label: "Contract" },
    { key: "beginDate", label: "Begin" },
    { key: "endDate", label: "End" },
    { key: "clearingAcct", label: "Clearing Acct" },
    { key: "custAcct", label: "Cust Acct" },
    { key: "clearingFirm", label: "Clearing Firm" },
    { key: "brokerName", label: "Broker" },
    {
      key: "price",
      label: "Price",
      align: "right",
      render: (row) => fmtFlexibleNumber(row.price, 6),
      sumValue: (row) => row.price,
      selectionDigits: 6,
    },
    { key: "priceUnits", label: "Units" },
    { key: "option", label: "Option" },
    {
      key: "strike",
      label: "Strike",
      align: "right",
      render: (row) => fmtFlexibleNumber(row.strike, 6),
      sumValue: (row) => row.strike,
      selectionDigits: 6,
    },
    {
      key: "strike2",
      label: "Strike 2",
      align: "right",
      render: (row) => fmtFlexibleNumber(row.strike2, 6),
      sumValue: (row) => row.strike2,
      selectionDigits: 6,
    },
    {
      key: "lots",
      label: "Lots",
      align: "right",
      render: (row) => fmtFlexibleNumber(row.lots, 2),
      sumValue: (row) => row.lots,
      selectionLabel: "Raw Lots",
      selectionDigits: 2,
    },
    {
      key: "totalQuantity",
      label: "Total Qty",
      align: "right",
      render: (row) => fmtFlexibleNumber(row.totalQuantity, 2),
      sumValue: (row) => row.totalQuantity,
      selectionLabel: "Raw Total Qty",
      selectionDigits: 2,
    },
    { key: "qtyUnits", label: "Qty Units" },
    { key: "trader", label: "Trader" },
    { key: "counterparty", label: "Counterparty" },
    { key: "dealSection", label: "Deal Section" },
    { key: "source", label: "Source" },
    { key: "userId", label: "User ID" },
    { key: "memo", label: "Memo" },
    { key: "fileHash", label: "File Hash" },
    { key: "sourceRowNumber", label: "Row", align: "right", render: (row) => fmtNumber(row.sourceRowNumber, 0) },
    { key: "updatedAt", label: "Updated", render: (row) => fmtDateTime(row.updatedAt) },
  ];
}

function compactRawRowColumns(): RawRowColumn[] {
  return [
    { key: "tradeDate", label: "Trade Date", width: 92 },
    { key: "trader", label: "Trader", width: 96 },
    { key: "clearingAcct", label: "Clearing Acct", width: 106 },
    { key: "clearingFirm", label: "Clearing Firm", width: 124 },
    { key: "brokerName", label: "Broker", width: 84 },
    { key: "hub", label: "Hub", width: 114 },
    { key: "product", label: "Product", width: 146 },
    { key: "contract", label: "Contract", width: 82 },
    { key: "beginDate", label: "Begin", width: 96 },
    { key: "endDate", label: "End", width: 96 },
    { key: "side", label: "B/S", width: 58 },
    {
      key: "lots",
      label: "Signed Lots",
      align: "right",
      width: 90,
      render: (row) => fmtFlexibleNumber(signedLots(row), 2),
      sumValue: signedLots,
      selectionLabel: "Signed Lots",
      selectionDigits: 2,
    },
    {
      key: "totalQuantity",
      label: "Signed Total Qty",
      align: "right",
      width: 110,
      render: (row) => fmtFlexibleNumber(signedTotalQuantity(row), 2),
      sumValue: signedTotalQuantity,
      selectionLabel: "Signed Total Qty",
      selectionDigits: 2,
    },
    {
      key: "price",
      label: "Price",
      align: "right",
      width: 76,
      render: (row) => fmtFlexibleNumber(row.price, 6),
      sumValue: (row) => row.price,
      selectionDigits: 6,
    },
  ];
}

function rawRowsTableWidth(columns: RawRowColumn[]): number {
  return columns.reduce((total, column) => total + (column.width ?? RAW_ROW_DEFAULT_COLUMN_WIDTH_PX), 0);
}

function blotterLadderColumnWidth(column: ContractColumn): number {
  return Math.min(
    BLOTTER_LADDER_STRIP_MAX_WIDTH_PX,
    Math.max(BLOTTER_LADDER_STRIP_MIN_WIDTH_PX, column.label.length * 7 + 56),
  );
}

function blotterLadderTableWidth(columns: ContractColumn[]): number {
  return (
    BLOTTER_LADDER_PRODUCT_WIDTH_PX +
    columns.reduce((total, column) => total + blotterLadderColumnWidth(column), 0)
  );
}

function rawRowKey(row: IceTradeBlotterRawRow, index: number): string {
  return [
    row.sourceRowHash ?? "",
    row.fileHash ?? "",
    row.sourceRowNumber ?? "",
    row.tradeDate,
    row.dealId ?? "",
    row.legId ?? "",
    index,
  ].join("|");
}

function rawCellKey(rowKeyValue: string, columnKey: RawRowColumnKey): string {
  return `${String(columnKey)}|${rowKeyValue}`;
}

function rawSelectionLabel(column: RawRowColumn): string {
  return column.selectionLabel ?? column.label;
}

function rawSelectionDigits(column: RawRowColumn): number {
  return column.selectionDigits ?? 2;
}

function rawRowDisplayValue(row: IceTradeBlotterRawRow, column: RawRowColumn): string {
  const rendered = column.render?.(row);
  if (rendered !== undefined) return rendered;

  const value = row[column.key];
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") return fmtFlexibleNumber(value, 6);

  const text = String(value).trim();
  return text ? text : "-";
}

function rawRowSortValue(row: IceTradeBlotterRawRow, column: RawRowColumn): SortableValue {
  const value = row[column.key];
  if (
    column.key === "tradeDate" ||
    column.key === "beginDate" ||
    column.key === "endDate" ||
    column.key === "updatedAt"
  ) {
    const dateSortValue = parseDateSortValue(String(value ?? ""));
    if (dateSortValue !== null) return dateSortValue;
    const timestamp = Date.parse(String(value ?? ""));
    if (Number.isFinite(timestamp)) return timestamp;
  }

  const numericValue = column.sumValue?.(row);
  if (numericValue !== null && numericValue !== undefined && Number.isFinite(numericValue)) {
    return numericValue;
  }

  if (typeof value === "number" && Number.isFinite(value)) return value;
  return rawRowDisplayValue(row, column);
}

function rawRowMatchesColumnFilters(
  row: IceTradeBlotterRawRow,
  columnsByKey: Map<RawRowColumnKey, RawRowColumn>,
  filters: ColumnFilters<RawRowColumnKey>,
): boolean {
  return (Object.entries(filters) as Array<[RawRowColumnKey, string[]]>).every(
    ([columnKey, selectedValues]) => {
      if (!selectedValues || selectedValues.length === 0) return true;
      const column = columnsByKey.get(columnKey);
      if (!column) return true;
      return selectedFilterMatches(rawRowDisplayValue(row, column), selectedValues);
    },
  );
}

function buildRawSelectionStats(
  selectedKeys: Set<string>,
  visibleValues: Map<string, RawRowSelectionValue>,
): RawRowSelectionStats | null {
  const visibleSelectedKeys = Array.from(selectedKeys).filter((key) => visibleValues.has(key));
  if (visibleSelectedKeys.length === 0) return null;

  const selectedValues = visibleSelectedKeys
    .map((key) => visibleValues.get(key))
    .filter((value): value is RawRowSelectionValue => value !== undefined);
  const numericValues = selectedValues
    .map((item) => item.value)
    .filter((value): value is number => Number.isFinite(value));
  const columnsByKey = new Map<
    RawRowColumnKey,
    {
      key: RawRowColumnKey;
      label: string;
      digits: number;
    }
  >();
  selectedValues.forEach((item) => {
    if (!columnsByKey.has(item.columnKey)) {
      columnsByKey.set(item.columnKey, {
        key: item.columnKey,
        label: item.columnLabel,
        digits: item.digits,
      });
    }
  });
  const sum = numericValues.reduce((total, value) => total + value, 0);

  return {
    cells: visibleSelectedKeys.length,
    observations: numericValues.length,
    columns: Array.from(columnsByKey.values()),
    avg: numericValues.length > 0 ? sum / numericValues.length : null,
    sum: numericValues.length > 0 ? sum : null,
    min: numericValues.length > 0 ? Math.min(...numericValues) : null,
    max: numericValues.length > 0 ? Math.max(...numericValues) : null,
  };
}

function fmtRawSelectionValue(
  value: number | null | undefined,
  stats: RawRowSelectionStats,
): string {
  const selectedColumn = stats.columns.length === 1 ? stats.columns[0] : null;
  return fmtFlexibleNumber(value, selectedColumn?.digits ?? 2);
}

function rawRowCellClass(
  column: RawRowColumn,
  {
    selected = false,
    selectable = false,
  }: {
    selected?: boolean;
    selectable?: boolean;
  } = {},
): string {
  const align = column.align === "right" ? "text-right tabular-nums" : "text-left";
  const interaction = selectable ? "cursor-pointer select-none transition-colors" : "";
  const selection = selected
    ? "bg-sky-500/25 text-sky-50 outline outline-1 -outline-offset-1 outline-sky-400/70"
    : selectable
      ? "hover:bg-sky-500/10"
      : "";

  return `max-w-[260px] border-b border-r border-gray-800 bg-[#0d1119] px-3 py-2 align-top text-gray-300 ${align} ${interaction} ${selection}`;
}

function RawSelectionStatsBar({
  stats,
  onClear,
}: {
  stats: RawRowSelectionStats;
  onClear: () => void;
}) {
  const selectedColumn = stats.columns.length === 1 ? stats.columns[0] : null;
  const label = selectedColumn === null ? "Numeric selection" : `${selectedColumn.label} selection`;
  const columnSummary =
    stats.columns.length > 1 ? stats.columns.map((column) => column.label).join(", ") : null;

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
            {fmtRawSelectionValue(stats.sum, stats)}
          </span>
        </span>
        <span>
          <span className="text-gray-500">Avg:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">
            {fmtRawSelectionValue(stats.avg, stats)}
          </span>
        </span>
        <span>
          <span className="text-gray-500">Min:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">
            {fmtRawSelectionValue(stats.min, stats)}
          </span>
        </span>
        <span>
          <span className="text-gray-500">Max:</span>{" "}
          <span className="font-semibold tabular-nums text-gray-100">
            {fmtRawSelectionValue(stats.max, stats)}
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

function RawRowsModal({
  debugData,
  drilldown,
  error,
  loading,
  onClose,
  onReload,
}: {
  debugData: IceTradeBlotterDebugPayload | null;
  drilldown: IceTradeBlotterDrilldownFilter | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
  onReload: () => void;
}) {
  const [columnMode, setColumnMode] = useState<"compact" | "all">("compact");
  const [selectedRawCells, setSelectedRawCells] = useState<Set<string>>(() => new Set());
  const [lastSelectedRawCell, setLastSelectedRawCell] = useState<{
    rowKey: string;
    columnKey: RawRowColumnKey;
  } | null>(null);
  const [rawSortState, setRawSortState] = useState<SortState<RawRowColumnKey> | null>(null);
  const [rawColumnFilters, setRawColumnFilters] = useState<ColumnFilters<RawRowColumnKey>>({});
  const columns = useMemo(
    () => (columnMode === "compact" ? compactRawRowColumns() : rawRowColumns()),
    [columnMode],
  );
  const columnsByKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns],
  );
  const tableWidth = useMemo(() => rawRowsTableWidth(columns), [columns]);
  const keyedRows = useMemo(
    () => (debugData?.rows ?? []).map((row, index) => ({ row, key: rawRowKey(row, index) })),
    [debugData],
  );
  const rawFilterOptionsByKey = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [
          column.key,
          uniqueSortedTexts(keyedRows.map(({ row }) => rawRowDisplayValue(row, column))),
        ]),
      ) as ColumnFilters<RawRowColumnKey>,
    [columns, keyedRows],
  );
  const displayedRawRows = useMemo(() => {
    const filteredRows = keyedRows.filter(({ row }) =>
      rawRowMatchesColumnFilters(row, columnsByKey, rawColumnFilters),
    );
    if (!rawSortState) return filteredRows;

    const column = columnsByKey.get(rawSortState.key);
    if (!column) return filteredRows;

    return [...filteredRows].sort((left, right) =>
      compareSortableValues(
        rawRowSortValue(left.row, column),
        rawRowSortValue(right.row, column),
        rawSortState.direction,
      ),
    );
  }, [columnsByKey, keyedRows, rawColumnFilters, rawSortState]);
  const visibleSelectionValues = useMemo(() => {
    const values = new Map<string, RawRowSelectionValue>();
    displayedRawRows.forEach(({ row, key }) => {
      columns.forEach((column) => {
        const value = column.sumValue?.(row);
        if (value === null || value === undefined || !Number.isFinite(value)) return;
        values.set(rawCellKey(key, column.key), {
          columnKey: column.key,
          columnLabel: rawSelectionLabel(column),
          value,
          digits: rawSelectionDigits(column),
        });
      });
    });
    return values;
  }, [columns, displayedRawRows]);
  const selectionStats = useMemo(
    () => buildRawSelectionStats(selectedRawCells, visibleSelectionValues),
    [selectedRawCells, visibleSelectionValues],
  );
  const activeRawFilterCount = Object.values(rawColumnFilters).reduce(
    (total, values) => total + (values?.length ?? 0),
    0,
  );
  const title = drilldown?.label ?? "Raw ICE Trade Rows";
  const tableSubtitle = debugData
    ? [
        `Source ${debugData.metadata.sourceTable}`,
        `Limit ${debugData.summary.limit.toLocaleString()}`,
        activeRawFilterCount > 0
          ? `${displayedRawRows.length.toLocaleString()} displayed`
          : null,
        columnMode === "compact" ? "Signed quantity fields use B/S" : "All columns show raw ICE values",
      ].filter(Boolean).join(" | ")
    : undefined;

  useEffect(() => {
    setSelectedRawCells(new Set());
    setLastSelectedRawCell(null);
  }, [debugData, columnMode]);

  useEffect(() => {
    setRawSortState(null);
    setRawColumnFilters({});
  }, [columnMode, drilldown]);

  useEffect(() => {
    if (selectedRawCells.size === 0) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedRawCells(new Set());
        setLastSelectedRawCell(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRawCells.size]);

  const updateRawSort = (key: RawRowColumnKey) => {
    setRawSortState((sort) =>
      sort?.key === key
        ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };

  const updateRawColumnFilter = (key: RawRowColumnKey, values: string[]) => {
    setRawColumnFilters((filters) => {
      const next = { ...filters };
      if (values.length === 0) delete next[key];
      else next[key] = values;
      return next;
    });
  };

  const clearRawSelection = () => {
    setSelectedRawCells(new Set());
    setLastSelectedRawCell(null);
  };

  const toggleRawCell = (
    rowKeyValue: string,
    columnKey: RawRowColumnKey,
    shiftKey: boolean,
  ) => {
    const key = rawCellKey(rowKeyValue, columnKey);
    const rowOrder = displayedRawRows.map((item) => item.key);

    if (
      shiftKey &&
      lastSelectedRawCell?.columnKey === columnKey &&
      rowOrder.includes(lastSelectedRawCell.rowKey) &&
      rowOrder.includes(rowKeyValue)
    ) {
      const start = rowOrder.indexOf(lastSelectedRawCell.rowKey);
      const end = rowOrder.indexOf(rowKeyValue);
      const [from, to] = start <= end ? [start, end] : [end, start];
      setSelectedRawCells((selected) => {
        const next = new Set(selected);
        for (let index = from; index <= to; index += 1) {
          next.add(rawCellKey(rowOrder[index], columnKey));
        }
        return next;
      });
    } else {
      setSelectedRawCells((selected) => {
        const next = new Set(selected);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    }

    setLastSelectedRawCell({ rowKey: rowKeyValue, columnKey });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6">
      <div
        className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#0d1119] shadow-2xl shadow-black sm:w-[calc(100vw-3rem)] sm:max-w-[calc(100vw-3rem)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-800 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-100" title={title}>
              {title}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {debugData
                ? `${debugData.selectedDate ?? "--"} | ${debugData.summary.returnedRowCount.toLocaleString()} of ${debugData.summary.rowCount.toLocaleString()} rows`
                : "Loading raw rows"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <div className="flex rounded-md border border-gray-700 bg-gray-950/70 p-0.5">
              <button
                type="button"
                onClick={() => setColumnMode("compact")}
                className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                  columnMode === "compact"
                    ? "bg-sky-500/20 text-sky-100"
                    : "text-gray-500 hover:text-gray-200"
                }`}
              >
                Compact
              </button>
              <button
                type="button"
                onClick={() => setColumnMode("all")}
                className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                  columnMode === "all"
                    ? "bg-sky-500/20 text-sky-100"
                    : "text-gray-500 hover:text-gray-200"
                }`}
              >
                All Columns
              </button>
            </div>
            <button
              type="button"
              onClick={onReload}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {error && (
            <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {loading && (
            <div className="rounded-lg border border-gray-800 bg-[#12141d] p-5 text-sm text-gray-500">
              Loading raw ICE rows...
            </div>
          )}
          {debugData && !loading && (
            <DataTableShell
              title="Raw Rows"
              subtitle={tableSubtitle}
              bodyClassName="max-h-[68vh] overflow-auto"
            >
              <table
                className="min-w-full table-fixed border-collapse bg-[#0d1119] text-[11px] text-gray-200"
                style={{ width: tableWidth }}
              >
                <colgroup>
                  {columns.map((column) => (
                    <col
                      key={column.key}
                      style={{ width: column.width ?? RAW_ROW_DEFAULT_COLUMN_WIDTH_PX }}
                    />
                  ))}
                </colgroup>
                <thead className="bg-gray-950 text-gray-500">
                  <tr className="border-b border-gray-800/80">
                    {columns.map((column) => {
                      const sortDirection =
                        rawSortState?.key === column.key ? rawSortState.direction : null;
                      const selectedFilters = rawColumnFilters[column.key] ?? [];
                      return (
                        <th
                          key={column.key}
                          className={`sticky top-0 z-20 whitespace-nowrap border-r border-gray-800 bg-gray-950 px-2 py-1.5 font-semibold uppercase tracking-wide ${
                            column.align === "right" ? "text-right" : "text-left"
                          }`}
                        >
                          <div
                            className={`flex w-full min-w-0 items-center gap-1 ${
                              column.align === "right" ? "justify-end" : "justify-start"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => updateRawSort(column.key)}
                              className={`flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-gray-900 ${
                                column.align === "right" ? "justify-end text-right" : "justify-start text-left"
                              } ${sortDirection ? "text-sky-200" : "text-gray-400"}`}
                              aria-label={`Sort ${column.label}`}
                            >
                              <span className="truncate whitespace-nowrap text-[10px]">
                                {column.label}
                              </span>
                              <span className="w-3 shrink-0 text-right text-[10px] text-sky-300">
                                {sortIndicator(sortDirection)}
                              </span>
                            </button>
                            <ColumnFilterMenu
                              label={column.label}
                              options={rawFilterOptionsByKey[column.key] ?? []}
                              selected={selectedFilters}
                              sortDirection={sortDirection}
                              onSort={(direction) => setRawSortState({ key: column.key, direction })}
                              onChange={(values) => updateRawColumnFilter(column.key, values)}
                            />
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayedRawRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-5 text-sm text-gray-500" colSpan={columns.length}>
                        No rows returned.
                      </td>
                    </tr>
                  ) : (
                    displayedRawRows.map(({ row, key }) => (
                      <tr key={key}>
                        {columns.map((column) => {
                          const cellKey = rawCellKey(key, column.key);
                          const selectionValue = visibleSelectionValues.get(cellKey);
                          const selectable = selectionValue !== undefined;
                          const selected = selectable && selectedRawCells.has(cellKey);
                          const rendered = rawRowDisplayValue(row, column);
                          return (
                            <td
                              key={column.key}
                              role={selectable ? "button" : undefined}
                              tabIndex={selectable ? 0 : undefined}
                              aria-pressed={selectable ? selected : undefined}
                              onClick={
                                selectable
                                  ? (event) => toggleRawCell(key, column.key, event.shiftKey)
                                  : undefined
                              }
                              onKeyDown={
                                selectable
                                  ? (event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        toggleRawCell(key, column.key, event.shiftKey);
                                      }
                                    }
                                  : undefined
                              }
                              className={rawRowCellClass(column, { selected, selectable })}
                              title={
                                selectionValue
                                  ? `${selectionValue.columnLabel}: ${fmtFlexibleNumber(
                                      selectionValue.value,
                                      selectionValue.digits,
                                    )}`
                                  : rendered
                              }
                            >
                              <span className="block truncate">{rendered}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {selectionStats && (
                <RawSelectionStatsBar stats={selectionStats} onClear={clearRawSelection} />
              )}
            </DataTableShell>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RawIceTradeBlotter({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: RawIceTradeBlotterFreshnessSummary) => void;
}) {
  const [selectedDate, setSelectedDate] = useState("");
  const [sides, setSides] = useState<string[]>([]);
  const [traders, setTraders] = useState<string[]>([]);
  const [clearingAccounts, setClearingAccounts] = useState<string[]>([]);
  const [customerAccounts, setCustomerAccounts] = useState<string[]>([]);
  const [clearingFirms, setClearingFirms] = useState<string[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [hubs, setHubs] = useState<string[]>([]);
  const [ccs, setCcs] = useState<string[]>([]);
  const [contracts, setContracts] = useState<string[]>([]);
  const [options, setOptions] = useState<string[]>([]);
  const [dealSections, setDealSections] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<IceTradeBlotterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<IceTradeBlotterDebugPayload | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [debugDrilldown, setDebugDrilldown] = useState<IceTradeBlotterDrilldownFilter | null>(null);

  const currentFilters = useMemo(
    () => ({
      selectedDate,
      sides,
      traders,
      clearingAccounts,
      customerAccounts,
      clearingFirms,
      products,
      hubs,
      ccs,
      contracts,
      options,
      dealSections,
      sources,
      userIds,
      search,
    }),
    [
      clearingAccounts,
      clearingFirms,
      ccs,
      contracts,
      customerAccounts,
      dealSections,
      hubs,
      options,
      products,
      search,
      selectedDate,
      sides,
      sources,
      traders,
      userIds,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    const url = buildApiUrl({ ...currentFilters, refresh: refreshToken > 0 });

    fetchJsonWithCache<IceTradeBlotterPayload>({
      key: cacheKey(currentFilters),
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
        if (!active || controller.signal.aborted || err.name === "AbortError") return;
        setError(err.message || "Failed to load ICE trade blotter");
        setData(null);
        onFreshnessChange?.({
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "ICE trade blotter query failed",
          targetDateLabel: selectedDate || "--",
          latestDateLabel: "--",
          latestUpdateLabel: "--",
          rowCountLabel: "--",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [currentFilters, onFreshnessChange, refreshToken, selectedDate]);

  useEffect(() => {
    if (!data) return;
    setSides((selected) => retainAvailableSelections(selected, data.metadata.sides));
    setTraders((selected) => retainAvailableSelections(selected, data.metadata.traders));
    setClearingAccounts((selected) =>
      retainAvailableSelections(selected, data.metadata.clearingAccounts),
    );
    setCustomerAccounts((selected) =>
      retainAvailableSelections(selected, data.metadata.customerAccounts),
    );
    setClearingFirms((selected) =>
      retainAvailableSelections(selected, data.metadata.clearingFirms),
    );
    setProducts((selected) => retainAvailableSelections(selected, data.metadata.products));
    setHubs((selected) => retainAvailableSelections(selected, data.metadata.hubs));
    setCcs((selected) => retainAvailableSelections(selected, data.metadata.ccs));
    setContracts((selected) => retainAvailableSelections(selected, data.metadata.contracts));
    setOptions((selected) => retainAvailableSelections(selected, data.metadata.options));
    setDealSections((selected) => retainAvailableSelections(selected, data.metadata.dealSections));
    setSources((selected) => retainAvailableSelections(selected, data.metadata.sources));
    setUserIds((selected) => retainAvailableSelections(selected, data.metadata.userIds));
  }, [data]);

  const activeFilterCount =
    sides.length +
    traders.length +
    clearingAccounts.length +
    customerAccounts.length +
    clearingFirms.length +
    products.length +
    hubs.length +
    ccs.length +
    contracts.length +
    options.length +
    dealSections.length +
    sources.length +
    userIds.length +
    (search ? 1 : 0);

  const clearFilters = () => {
    setSides([]);
    setTraders([]);
    setClearingAccounts([]);
    setCustomerAccounts([]);
    setClearingFirms([]);
    setProducts([]);
    setHubs([]);
    setCcs([]);
    setContracts([]);
    setOptions([]);
    setDealSections([]);
    setSources([]);
    setUserIds([]);
    setSearch("");
  };

  const ladder = useMemo(
    () => buildBlotterLadder(data?.productSummary ?? [], data?.selectedDate),
    [data?.productSummary, data?.selectedDate],
  );

  const loadDebugRows = async (
    drilldown: IceTradeBlotterDrilldownFilter | null,
    forceRefresh = false,
  ) => {
    setDebugLoading(true);
    setDebugError(null);
    const url = buildDebugApiUrl({
      ...currentFilters,
      limit: RAW_ROW_LIMIT,
      drilldown,
      refresh: forceRefresh || refreshToken > 0,
    });

    try {
      const payload = await fetchJsonWithCache<IceTradeBlotterDebugPayload>({
        key: debugCacheKey(currentFilters, drilldown),
        url,
        ttlMs: API_CACHE_TTL_MS,
        cacheMode: forceRefresh || refreshToken > 0 ? "no-store" : "default",
        forceRefresh: forceRefresh || refreshToken > 0,
      });
      setDebugData(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load raw ICE rows";
      setDebugError(message);
      setDebugData(null);
    } finally {
      setDebugLoading(false);
    }
  };

  const openRawRows = () => {
    setDebugOpen(true);
    setDebugDrilldown(null);
    setDebugData(null);
    void loadDebugRows(null);
  };

  const openCellRows = (row: BlotterLadderRow, column: ContractColumn) => {
    const drilldown: IceTradeBlotterDrilldownFilter = {
      product: row.product,
      hub: row.hub,
      contract: column.contract,
      beginDate: column.beginDate,
      endDate: column.endDate,
      option: row.option,
      strike: row.strike,
      strike2: row.strike2,
      cc: row.cc,
      strip: row.strip,
      dealSection: row.dealSection,
      label: `${row.productLabel} | ${column.label}`,
    };
    setDebugOpen(true);
    setDebugDrilldown(drilldown);
    setDebugData(null);
    void loadDebugRows(drilldown);
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
                {ladder.rows.length.toLocaleString()} products |{" "}
                {(data?.productSummary.length ?? 0).toLocaleString()} groups
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={FILTER_LABEL_CLASS}>Trade Snapshot</span>
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
                  <option key={date.tradeDate} value={date.tradeDate} className="bg-[#101521] text-gray-100">
                    {date.tradeDate}
                  </option>
                ))}
              </select>
              <StatusBadge
                label={`${(data?.summary.rowCount ?? 0).toLocaleString()} rows`}
                tone={data?.summary.rowCount ? "good" : "warn"}
              />
              <StatusBadge
                label={`As of ${fmtDateTime(data?.latestLoadedAt ?? data?.asOf)}`}
                tone="neutral"
              />
            </div>

            <div>
              <SelectableFilterGroup
                label="Trader"
                options={data?.metadata.traders ?? []}
                selected={traders}
                onChange={setTraders}
              />
            </div>
            <div>
              <SelectableFilterGroup
                label="Clearing Acct"
                options={data?.metadata.clearingAccounts ?? []}
                selected={clearingAccounts}
                onChange={setClearingAccounts}
              />
            </div>
            <div>
              <SelectableFilterGroup
                label="Clearing Firm"
                options={data?.metadata.clearingFirms ?? []}
                selected={clearingFirms}
                onChange={setClearingFirms}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={FILTER_LABEL_CLASS}>Product Code</span>
              <MultiSelect
                label="Product Code"
                options={data?.metadata.ccs ?? []}
                selected={ccs}
                onChange={setCcs}
                placeholder="All"
                width="w-40"
                tone="dark"
                showLabel={false}
              />
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-600 hover:text-gray-100"
                >
                  Clear ({activeFilterCount})
                </button>
              )}
            </div>
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
          Loading ICE trade blotter...
        </div>
      )}

      {data && !loading && (
        <DataTableShell
          title="ICE Trade Blotter Summary"
          subtitle={`Trade snapshot ${data.selectedDate ?? "--"} | Signed lots by raw product and contract from ${data.metadata.sourceTable}`}
          className="w-full"
          bodyClassName="w-full max-h-[calc(100vh-270px)] overflow-y-auto"
          action={
            <button
              type="button"
              onClick={openRawRows}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:border-sky-500/50 hover:bg-gray-700 hover:text-white"
            >
              Raw Rows
            </button>
          }
        >
          <div className="w-full bg-[#0d1119]">
            <BlotterLadderTable
              columns={ladder.columns}
              rows={ladder.rows}
              onCellSelect={openCellRows}
            />
          </div>
        </DataTableShell>
      )}

      {debugOpen && (
        <RawRowsModal
          debugData={debugData}
          drilldown={debugDrilldown}
          error={debugError}
          loading={debugLoading}
          onClose={() => setDebugOpen(false)}
          onReload={() => void loadDebugRows(debugDrilldown, true)}
        />
      )}
    </div>
  );
}
