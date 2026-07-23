"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import ColumnFilterMenu, { type SortDirection } from "@/components/dashboard/ColumnFilterMenu";
import DataTableShell from "@/components/dashboard/DataTableShell";
import MultiSelect from "@/components/ui/MultiSelect";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type {
  ClearStreetCellValue,
  ClearStreetModelColumn,
  ClearStreetReviewStatus,
  ClearStreetSignatureSummary,
  ClearStreetTradesDebugPayload,
  ClearStreetTradesDrilldownFilter,
  ClearStreetTradesPayload,
  ClearStreetTradesProductSummaryRow,
} from "@/lib/positionsAndTrades/clearStreetTradesTypes";
import { CLEAR_STREET_MODEL_COLUMNS } from "@/lib/positionsAndTrades/clearStreetTradesTypes";

export interface ClearStreetTradesFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface ClearStreetApiFilters {
  selectedDate: string;
  accounts: string[];
  productCodes: string[];
  productFamilies: string[];
  marketNames: string[];
  statuses: ClearStreetReviewStatus[];
  search: string;
}

interface ContractColumn {
  key: string;
  label: string;
  subtitle: string;
  contract: string | null;
  contractMonth: string | null;
  contractDay: string | null;
}

interface BlotterCell {
  rowCount: number;
  signatureCount: number;
  totalQuantity: number;
  netQuantity: number;
  matchedRowCount: number;
  vendorWarningRowCount: number;
  needsReviewRowCount: number;
  avgTradePrice: number | null;
  reviewStatus: ClearStreetReviewStatus;
  reviewReason: string | null;
  accounts: string | null;
}

interface BlotterRow {
  key: string;
  productLabel: string;
  subtitle: string;
  productCode: string | null;
  productFamily: string | null;
  marketName: string | null;
  underlyingProductCode: string | null;
  sourceProduct: string | null;
  exchangeCodeInput: string | null;
  putCall: string | null;
  strike: number | null;
  cells: Record<string, BlotterCell>;
  rowCount: number;
  signatureCount: number;
  totalQuantity: number;
  netQuantity: number;
  matchedRowCount: number;
  vendorWarningRowCount: number;
  needsReviewRowCount: number;
}

interface BlotterLadderModel {
  columns: ContractColumn[];
  rows: BlotterRow[];
}

type SortState<Key extends string> = {
  key: Key;
  direction: SortDirection;
};
type ColumnFilters<Key extends string> = Partial<Record<Key, string[]>>;
type BlotterSortKey = "product" | `contract:${string}`;

type RawRowColumn = {
  key: ClearStreetModelColumn;
  label: string;
  align?: "left" | "right";
  width?: number;
  render?: (row: Record<ClearStreetModelColumn, ClearStreetCellValue>) => string;
};

type SortableValue = string | number | null | undefined;

const API_CACHE_TTL_MS = 2 * 60 * 1000;
const SUMMARY_API_PATH = "/api/clear-street-trades";
const DRILLDOWN_API_PATH = "/api/clear-street-trades/drilldown";
const RAW_ROW_LIMIT = 100;
const FILTER_LABEL_CLASS = "text-[10px] font-bold uppercase tracking-wider text-gray-500";
const PILL_DROPDOWN_CLASS =
  "h-8 rounded-full border border-sky-900/70 bg-[#101521] px-3 text-xs font-semibold text-gray-100 shadow-inner shadow-black/20 outline-none transition-colors hover:border-sky-700/80 focus:border-sky-500/70 focus:ring-1 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-900 disabled:text-gray-500";
const SEARCH_INPUT_CLASS =
  "h-8 min-w-[220px] rounded-full border border-sky-900/70 bg-[#101521] px-3 text-xs font-semibold text-gray-100 shadow-inner shadow-black/20 outline-none placeholder:text-gray-600 focus:border-sky-500/70 focus:ring-1 focus:ring-sky-500/30";
const BLOTTER_PRODUCT_WIDTH_PX = 280;
const BLOTTER_CONTRACT_MIN_WIDTH_PX = 116;
const BLOTTER_CONTRACT_MAX_WIDTH_PX = 188;
const RAW_ROW_DEFAULT_COLUMN_WIDTH_PX = 118;

const DEFAULT_FRESHNESS: ClearStreetTradesFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Clear Street Trades --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const REVIEW_STATUS_LABELS: Record<ClearStreetReviewStatus, string> = {
  matched: "Matched",
  vendor_warning: "Warning",
  needs_review: "Needs Review",
};

const MONTH_ABBREVIATIONS = [
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
];

function stableFilterValues(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function appendRepeatedParams(params: URLSearchParams, name: string, values: string[]): void {
  stableFilterValues(values).forEach((value) => params.append(name, value));
}

function buildApiUrl({
  selectedDate,
  accounts,
  productCodes,
  productFamilies,
  marketNames,
  statuses,
  search,
  refresh,
  limit,
}: ClearStreetApiFilters & { refresh: boolean; limit: number }): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (selectedDate) params.set("date", selectedDate);
  appendRepeatedParams(params, "account", accounts);
  appendRepeatedParams(params, "productCode", productCodes);
  appendRepeatedParams(params, "productFamily", productFamilies);
  appendRepeatedParams(params, "marketName", marketNames);
  appendRepeatedParams(params, "status", statuses);
  if (search.trim()) params.set("search", search.trim());
  if (refresh) params.set("refresh", "1");
  return `${SUMMARY_API_PATH}?${params.toString()}`;
}

function buildDrilldownApiUrl({
  limit,
  drilldown,
  refresh,
  ...filters
}: ClearStreetApiFilters & {
  limit: number;
  drilldown?: ClearStreetTradesDrilldownFilter | null;
  refresh: boolean;
}): string {
  const summaryUrl = buildApiUrl({ ...filters, limit, refresh });
  const url = new URL(summaryUrl, "http://local");
  url.pathname = DRILLDOWN_API_PATH;
  if (drilldown) url.searchParams.set("drilldown", JSON.stringify(drilldown));
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function cacheKey(filters: ClearStreetApiFilters, limit: number): string {
  return [
    "api:clear-street-trades",
    filters.selectedDate || "latest",
    stableFilterValues(filters.accounts).join(",") || "all-accounts",
    stableFilterValues(filters.productCodes).join(",") || "all-products",
    stableFilterValues(filters.productFamilies).join(",") || "all-families",
    stableFilterValues(filters.marketNames).join(",") || "all-markets",
    stableFilterValues(filters.statuses).join(",") || "all-statuses",
    filters.search.trim() || "all-search",
    limit,
  ].join(":");
}

function drilldownCacheKey(
  filters: ClearStreetApiFilters,
  drilldown: ClearStreetTradesDrilldownFilter | null,
): string {
  return [
    "api:clear-street-trades",
    "drilldown",
    cacheKey(filters, RAW_ROW_LIMIT),
    drilldown ? JSON.stringify(drilldown) : "all-rows",
  ].join(":");
}

function fmtDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "--";
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "--";
  return value.replace("T", " ").replace("Z", "").slice(0, 19);
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
  const abs = Math.abs(value);
  const resolvedDigits = abs >= 100 ? Math.min(digits, 2) : digits;
  return value.toLocaleString(undefined, {
    maximumFractionDigits: resolvedDigits,
    minimumFractionDigits: 0,
  });
}

function fmtCell(value: ClearStreetCellValue | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "-";
    return Math.abs(value) >= 1000
      ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return fmtDateTime(value);
  return value;
}

function columnLabel(column: string): string {
  return column.replaceAll("_", " ");
}

function statusLabel(status: ClearStreetReviewStatus): string {
  return REVIEW_STATUS_LABELS[status];
}

function statusTone(status: ClearStreetReviewStatus): "good" | "warn" | "bad" {
  if (status === "needs_review") return "bad";
  if (status === "vendor_warning") return "warn";
  return "good";
}

function statusRank(status: ClearStreetReviewStatus): number {
  if (status === "needs_review") return 0;
  if (status === "vendor_warning") return 1;
  return 2;
}

function worstStatus(left: ClearStreetReviewStatus, right: ClearStreetReviewStatus): ClearStreetReviewStatus {
  return statusRank(left) <= statusRank(right) ? left : right;
}

function freshnessFromPayload(payload: ClearStreetTradesPayload | null): ClearStreetTradesFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  const summary = payload.summary;
  const hasRows = summary.rowCount > 0;
  const selectedLabel = payload.selectedDate ?? "--";

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
  if (summary.needsReviewRowCount > 0) {
    return {
      status: "Needs Review",
      statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
      summary: `${selectedLabel} | ${summary.needsReviewRowCount.toLocaleString()} rows need review`,
      targetDateLabel: selectedLabel,
      latestDateLabel: payload.latestDate ?? "--",
      latestUpdateLabel: fmtDateTime(payload.latestUploadAt ?? payload.asOf),
    };
  }
  if (summary.vendorWarningRowCount > 0) {
    return {
      status: "Warning",
      statusClass: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
      summary: `${selectedLabel} | ${summary.vendorWarningRowCount.toLocaleString()} warning rows`,
      targetDateLabel: selectedLabel,
      latestDateLabel: payload.latestDate ?? "--",
      latestUpdateLabel: fmtDateTime(payload.latestUploadAt ?? payload.asOf),
    };
  }

  return {
    status: payload.selectedDate === payload.latestDate ? "All Mapped" : "Historical",
    statusClass:
      payload.selectedDate === payload.latestDate
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
        : "border-sky-500/40 bg-sky-500/10 text-sky-200",
    summary: `${selectedLabel} | ${summary.rowCount.toLocaleString()} rows | ${summary.signatureCount.toLocaleString()} signatures`,
    targetDateLabel: selectedLabel,
    latestDateLabel: payload.latestDate ?? "--",
    latestUpdateLabel: fmtDateTime(payload.latestUploadAt ?? payload.asOf),
  };
}

function compareSortableValues(
  left: SortableValue,
  right: SortableValue,
  direction: SortDirection,
): number {
  const multiplier = direction === "asc" ? 1 : -1;
  const leftEmpty = left === null || left === undefined || left === "";
  const rightEmpty = right === null || right === undefined || right === "";
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  if (typeof left === "number" && typeof right === "number") {
    return (left - right) * multiplier;
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true }) * multiplier;
}

function sortIndicator(direction: SortDirection | null): string {
  if (direction === "asc") return "↑";
  if (direction === "desc") return "↓";
  return "";
}

function normalizeFilterText(value: string): string {
  return value.trim().toLowerCase();
}

function selectedFilterMatches(displayValue: string, selectedValues: string[]): boolean {
  if (selectedValues.length === 0) return true;
  const normalizedValue = normalizeFilterText(displayValue);
  return selectedValues.some((selected) => normalizeFilterText(selected) === normalizedValue);
}

function uniqueSortedTexts(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
}

function retainAvailableSelections(selected: string[], options: string[]): string[] {
  const available = new Set(options);
  const retained = selected.filter((value) => available.has(value));
  return retained.length === selected.length ? selected : retained;
}

function retainAvailableStatuses(
  selected: ClearStreetReviewStatus[],
  options: ClearStreetReviewStatus[],
): ClearStreetReviewStatus[] {
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

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  const className =
    tone === "good"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
        ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
        : tone === "bad"
          ? "border-red-500/40 bg-red-500/10 text-red-200"
          : "border-gray-700 bg-gray-900 text-gray-400";
  return (
    <span className={`max-w-full break-all rounded-md border px-2 py-1 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

function SelectableFilterGroup<T extends string>({
  label,
  options,
  selected,
  onChange,
  labelForValue,
}: {
  label: string;
  options: T[];
  selected: T[];
  onChange: (values: T[]) => void;
  labelForValue?: (value: T) => string;
}) {
  const toggle = (option: T) => {
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
        const labelText = labelForValue?.(option) ?? option;
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
            title={labelText}
          >
            {labelText}
          </button>
        );
      })}
    </div>
  );
}

function contractKey(row: ClearStreetTradesProductSummaryRow): string {
  const parsedContractKey = [row.contractMonth, row.contractDay].filter(Boolean).join("|");
  return JSON.stringify([
    parsedContractKey || row.contract,
  ]);
}

function rowKey(row: ClearStreetTradesProductSummaryRow): string {
  return JSON.stringify([
    row.productCode,
    row.productFamily,
    row.marketName,
    row.underlyingProductCode,
    row.sourceProduct,
    row.exchangeCodeInput,
    row.putCall,
    row.strike,
  ]);
}

function formatContractMonth(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const match = /^(\d{4})(\d{2})$/.exec(text);
  if (!match) return text;

  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex >= MONTH_ABBREVIATIONS.length) return text;
  return `${MONTH_ABBREVIATIONS[monthIndex]}${match[1].slice(2)}`;
}

function normalizePutCall(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const upper = text.toUpperCase();
  if (upper === "CALL") return "C";
  if (upper === "PUT") return "P";
  return upper;
}

function formatContractDay(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  return `D${text}`;
}

function formatContractDayDate(
  contractMonth: string | null | undefined,
  contractDay: string | null | undefined,
): string | null {
  const monthText = contractMonth?.trim();
  const dayText = contractDay?.trim();
  if (!monthText || !dayText) return null;
  const match = /^(\d{4})(\d{2})$/.exec(monthText);
  if (!match) return formatContractDay(dayText);

  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex >= MONTH_ABBREVIATIONS.length) return formatContractDay(dayText);
  return `${MONTH_ABBREVIATIONS[monthIndex]} ${dayText}`;
}

function formatStrike(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return fmtFlexibleNumber(value, 4);
}

function formatRawContract(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  return text.replace(/\b(\d{4})(\d{2})\b/g, (match, year: string, month: string) => {
    const formatted = formatContractMonth(`${year}${month}`);
    return formatted ?? match;
  });
}

function contractColumnLabel(row: ClearStreetTradesProductSummaryRow): string {
  const monthLabel = row.contractDay
    ? formatContractDayDate(row.contractMonth, row.contractDay)
    : formatContractMonth(row.contractMonth);
  if (monthLabel) return monthLabel;
  return formatRawContract(row.contract) ?? "No Strip";
}

function contractColumnSubtitle(row: ClearStreetTradesProductSummaryRow): string {
  return [
    row.contract ? `Contract ${formatRawContract(row.contract) ?? row.contract}` : null,
    row.contractMonth ? `Month ${formatContractMonth(row.contractMonth) ?? row.contractMonth}` : null,
    row.contractDay ? `Day ${row.contractDay}` : null,
  ].filter(Boolean).join(" | ") || "-";
}

function optionSubtitle(row: ClearStreetTradesProductSummaryRow): string | null {
  const putCall = normalizePutCall(row.putCall);
  const strike = formatStrike(row.strike);
  if (!putCall && !strike) return null;
  if (putCall && strike) return `Option ${putCall} ${strike}`;
  if (putCall) return `Option ${putCall}`;
  return `Strike ${strike}`;
}

function productLabel(row: ClearStreetTradesProductSummaryRow): string {
  return row.productCode?.trim() || row.sourceProduct?.trim() || "Unmapped Product";
}

function productSubtitle(row: ClearStreetTradesProductSummaryRow): string {
  return [
    row.productFamily,
    row.marketName,
    optionSubtitle(row),
    row.sourceProduct && row.productCode ? row.sourceProduct : null,
    row.exchangeCodeInput,
  ].filter(Boolean).join(" | ") || "-";
}

function blotterRowLabel(row: Pick<BlotterRow, "productLabel" | "putCall" | "strike">): string {
  const optionParts = [normalizePutCall(row.putCall), formatStrike(row.strike)].filter(Boolean);
  if (optionParts.length === 0) return row.productLabel;
  return `${row.productLabel} ${optionParts.join(" ")}`;
}

function emptyCell(): BlotterCell {
  return {
    rowCount: 0,
    signatureCount: 0,
    totalQuantity: 0,
    netQuantity: 0,
    matchedRowCount: 0,
    vendorWarningRowCount: 0,
    needsReviewRowCount: 0,
    avgTradePrice: null,
    reviewStatus: "matched",
    reviewReason: null,
    accounts: null,
  };
}

function addCellValues(target: BlotterCell, row: ClearStreetTradesProductSummaryRow): void {
  const totalQuantity = row.totalQuantity ?? 0;
  target.rowCount += row.rowCount;
  target.signatureCount += row.signatureCount;
  target.totalQuantity += totalQuantity;
  target.netQuantity += row.netQuantity ?? 0;
  target.matchedRowCount += row.matchedRowCount;
  target.vendorWarningRowCount += row.vendorWarningRowCount;
  target.needsReviewRowCount += row.needsReviewRowCount;
  target.reviewStatus = worstStatus(target.reviewStatus, row.reviewStatus);
  if (statusRank(row.reviewStatus) <= statusRank(target.reviewStatus)) {
    target.reviewReason = row.reviewReason ?? target.reviewReason;
  }
  if (row.accounts) {
    target.accounts = target.accounts ? `${target.accounts}, ${row.accounts}` : row.accounts;
  }
  if (row.avgTradePrice !== null && totalQuantity > 0) {
    const priorWeight = target.totalQuantity - totalQuantity;
    const priorValue = target.avgTradePrice !== null ? target.avgTradePrice * priorWeight : 0;
    target.avgTradePrice = (priorValue + row.avgTradePrice * totalQuantity) / target.totalQuantity;
  }
}

function buildBlotterLadder(rows: ClearStreetTradesProductSummaryRow[]): BlotterLadderModel {
  const columnsByKey = new Map<string, ContractColumn>();
  const rowsByKey = new Map<string, BlotterRow>();

  rows.forEach((row) => {
    const columnKey = contractKey(row);
    if (!columnsByKey.has(columnKey)) {
      columnsByKey.set(columnKey, {
        key: columnKey,
        label: contractColumnLabel(row),
        subtitle: contractColumnSubtitle(row),
        contract: row.contractMonth || row.contractDay ? null : row.contract,
        contractMonth: row.contractMonth,
        contractDay: row.contractDay,
      });
    }

    const productKey = rowKey(row);
    if (!rowsByKey.has(productKey)) {
      rowsByKey.set(productKey, {
        key: productKey,
        productLabel: productLabel(row),
        subtitle: productSubtitle(row),
        productCode: row.productCode,
        productFamily: row.productFamily,
        marketName: row.marketName,
        underlyingProductCode: row.underlyingProductCode,
        sourceProduct: row.sourceProduct,
        exchangeCodeInput: row.exchangeCodeInput,
        putCall: row.putCall,
        strike: row.strike,
        cells: {},
        rowCount: 0,
        signatureCount: 0,
        totalQuantity: 0,
        netQuantity: 0,
        matchedRowCount: 0,
        vendorWarningRowCount: 0,
        needsReviewRowCount: 0,
      });
    }

    const productRow = rowsByKey.get(productKey);
    if (!productRow) return;
    if (!productRow.cells[columnKey]) productRow.cells[columnKey] = emptyCell();
    addCellValues(productRow.cells[columnKey], row);
    productRow.rowCount += row.rowCount;
    productRow.signatureCount += row.signatureCount;
    productRow.totalQuantity += row.totalQuantity ?? 0;
    productRow.netQuantity += row.netQuantity ?? 0;
    productRow.matchedRowCount += row.matchedRowCount;
    productRow.vendorWarningRowCount += row.vendorWarningRowCount;
    productRow.needsReviewRowCount += row.needsReviewRowCount;
  });

  const columns = Array.from(columnsByKey.values()).sort((left, right) =>
    compareSortableValues(
      [left.contractMonth, left.contractDay, left.label].filter(Boolean).join("|"),
      [right.contractMonth, right.contractDay, right.label].filter(Boolean).join("|"),
      "asc",
    ),
  );
  const ladderRows = Array.from(rowsByKey.values()).sort((left, right) =>
    compareSortableValues(left.productLabel, right.productLabel, "asc"),
  );

  return { columns, rows: ladderRows };
}

function blotterColumnWidth(column: ContractColumn): number {
  return Math.min(
    BLOTTER_CONTRACT_MAX_WIDTH_PX,
    Math.max(BLOTTER_CONTRACT_MIN_WIDTH_PX, column.label.length * 7 + 62),
  );
}

function blotterTableWidth(columns: ContractColumn[]): number {
  return BLOTTER_PRODUCT_WIDTH_PX + columns.reduce((total, column) => total + blotterColumnWidth(column), 0);
}

function blotterStripSortKey(column: ContractColumn): BlotterSortKey {
  return `contract:${column.key}`;
}

function stripKeyFromSortKey(sortKey: BlotterSortKey): string | null {
  return sortKey.startsWith("contract:") ? sortKey.slice("contract:".length) : null;
}

function blotterCellSortValue(row: BlotterRow, columnKey: string): number | null {
  const cell = row.cells[columnKey];
  if (!cell || cell.rowCount === 0) return null;
  return cell.netQuantity;
}

function blotterFilterValue(row: BlotterRow, key: BlotterSortKey): string {
  if (key === "product") return row.productLabel;
  const stripKey = stripKeyFromSortKey(key);
  if (!stripKey) return "-";
  const cell = row.cells[stripKey];
  return cell && cell.rowCount > 0 ? fmtFlexibleNumber(cell.netQuantity, 2) : "-";
}

function blotterMatchesColumnFilters(
  row: BlotterRow,
  filters: ColumnFilters<BlotterSortKey>,
): boolean {
  return (Object.entries(filters) as Array<[BlotterSortKey, string[]]>).every(
    ([key, selectedValues]) => selectedFilterMatches(blotterFilterValue(row, key), selectedValues),
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

function sortBlotterRows(
  rows: BlotterRow[],
  sortState: SortState<BlotterSortKey> | null,
): BlotterRow[] {
  if (!sortState) return rows;
  const stripKey = stripKeyFromSortKey(sortState.key);
  return [...rows].sort((left, right) => {
    const comparison =
      sortState.key === "product"
        ? compareSortableValues(left.productLabel, right.productLabel, sortState.direction)
        : stripKey
          ? compareSortableValues(
              blotterCellSortValue(left, stripKey),
              blotterCellSortValue(right, stripKey),
              sortState.direction,
            )
          : 0;
    if (comparison !== 0) return comparison;
    return compareSortableValues(left.productLabel, right.productLabel, "asc");
  });
}

function DrilldownButton({
  cell,
  ariaLabel,
  onClick,
}: {
  cell: BlotterCell | undefined;
  ariaLabel: string;
  onClick: () => void;
}) {
  if (!cell || cell.rowCount === 0) {
    return <span className="block h-9 min-w-[96px]" />;
  }

  const positive = cell.netQuantity > 0;
  const negative = cell.netQuantity < 0;
  const statusClass =
    cell.reviewStatus === "needs_review"
      ? "border-red-500/35 bg-red-500/12 text-red-100 hover:border-red-400/60"
      : cell.reviewStatus === "vendor_warning"
        ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-100 hover:border-yellow-400/60"
        : positive
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400/50"
          : negative
            ? "border-red-500/20 bg-red-500/10 text-red-100 hover:border-red-400/50"
            : "border-gray-800 bg-gray-950/70 text-gray-300 hover:border-gray-700";
  const rowCountLabel = `${cell.rowCount.toLocaleString()} ${cell.rowCount === 1 ? "row" : "rows"}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`flex h-9 w-full min-w-[96px] items-center justify-end rounded-md border px-2 text-right transition-colors ${statusClass}`}
      title={`${fmtFlexibleNumber(cell.netQuantity, 2)} signed quantity | ${rowCountLabel} | ${statusLabel(cell.reviewStatus)}`}
    >
      <span className="text-sm font-semibold">{fmtFlexibleNumber(cell.netQuantity, 2)}</span>
    </button>
  );
}

function BlotterLadderTable({
  columns,
  rows,
  onCellSelect,
}: {
  columns: ContractColumn[];
  rows: BlotterRow[];
  onCellSelect: (row: BlotterRow, column: ContractColumn, cell: BlotterCell) => void;
}) {
  const [sortState, setSortState] = useState<SortState<BlotterSortKey> | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters<BlotterSortKey>>({});
  const filterOptionsByKey = useMemo(
    () =>
      Object.fromEntries([
        ["product", uniqueSortedTexts(rows.map((row) => row.productLabel))],
        ...columns.map((column): [BlotterSortKey, string[]] => {
          const key = blotterStripSortKey(column);
          return [key, uniqueSortedTexts(rows.map((row) => blotterFilterValue(row, key)))];
        }),
      ]) as ColumnFilters<BlotterSortKey>,
    [columns, rows],
  );
  const displayedRows = useMemo(() => {
    const filteredRows = rows.filter((row) => blotterMatchesColumnFilters(row, columnFilters));
    return sortBlotterRows(filteredRows, sortState);
  }, [columnFilters, rows, sortState]);

  useEffect(() => {
    setColumnFilters((filters) => retainColumnFilters(filters, filterOptionsByKey));
  }, [filterOptionsByKey]);

  const updateSort = (key: BlotterSortKey, defaultDirection: SortDirection = "asc") => {
    setSortState((sort) =>
      sort?.key === key
        ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: defaultDirection },
    );
  };

  const updateColumnFilter = (key: BlotterSortKey, values: string[]) => {
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
        No Clear Street trades match the selected filters.
      </div>
    );
  }

  return (
    <table
      className="table-fixed border-separate border-spacing-0 text-xs"
      style={{ width: blotterTableWidth(columns) }}
    >
      <colgroup>
        <col style={{ width: BLOTTER_PRODUCT_WIDTH_PX }} />
        {columns.map((column) => (
          <col key={column.key} style={{ width: blotterColumnWidth(column) }} />
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
            const sortKey = blotterStripSortKey(column);
            const sortDirection = sortState?.key === sortKey ? sortState.direction : null;
            return (
              <th
                key={column.key}
                className="sticky top-0 z-20 border-b border-r border-gray-800 bg-gray-950 px-2 py-1.5 text-right align-middle font-semibold uppercase tracking-wide"
                title={`${column.label} | ${column.subtitle}`}
              >
                <div className="flex w-full min-w-0 items-center justify-center">
                  <button
                    type="button"
                    onClick={() => updateSort(sortKey, "desc")}
                    className={`flex min-w-0 max-w-full items-center justify-center gap-1 rounded-md px-1 py-0.5 text-center transition-colors hover:bg-gray-900 ${
                      sortDirection ? "text-sky-200" : "text-gray-300"
                    }`}
                    aria-label={`Sort ${column.label}`}
                  >
                    <span className="truncate whitespace-nowrap text-[10px]">{column.label}</span>
                    <span className="w-3 shrink-0 text-right text-[10px] text-sky-300">
                      {sortIndicator(sortDirection)}
                    </span>
                  </button>
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
        ) : (
          displayedRows.map((row) => (
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
                {(row.needsReviewRowCount > 0 || row.vendorWarningRowCount > 0) && (
                  <span className="mt-1 block truncate text-[10px] font-semibold text-yellow-300">
                    {row.needsReviewRowCount > 0
                      ? `${row.needsReviewRowCount.toLocaleString()} review`
                      : `${row.vendorWarningRowCount.toLocaleString()} warning`}
                  </span>
                )}
              </th>
              {columns.map((column) => {
                const cell = row.cells[column.key];
                return (
                  <td
                    key={column.key}
                    className="border-b border-r border-gray-800 bg-[#0d1119] p-1 align-middle group-hover:bg-[#151b28]"
                  >
                    <DrilldownButton
                      cell={cell}
                      ariaLabel={`Open Clear Street rows for ${blotterRowLabel(row)} ${column.label}`}
                      onClick={() => {
                        if (cell) onCellSelect(row, column, cell);
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function signatureSearchText(signature: ClearStreetSignatureSummary): string {
  return [
    signature.sourceProduct,
    signature.exchangeCodeInput,
    signature.exchangeNameInput,
    signature.putCall,
    signature.securityType,
    signature.productCode,
    signature.productGroup,
    signature.productRegion,
    signature.accounts.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function signatureMatchesSearch(signature: ClearStreetSignatureSummary, search: string): boolean {
  const needle = search.trim().toLowerCase();
  return !needle || signatureSearchText(signature).includes(needle);
}

function HistoryBadge({ signature }: { signature: ClearStreetSignatureSummary }) {
  if (signature.priorRowCount === 0) {
    return <StatusBadge label="New" tone="warn" />;
  }
  return <StatusBadge label={`Seen ${signature.priorRowCount.toLocaleString()}`} tone="neutral" />;
}

function SignatureTable({
  signatures,
  emptyMessage,
}: {
  signatures: ClearStreetSignatureSummary[];
  emptyMessage: string;
}) {
  return (
    <table className="w-full min-w-[1120px] border-collapse bg-[#0d1119] text-xs text-gray-200">
      <thead className="sticky top-0 z-30 bg-gray-950 text-gray-500">
        <tr>
          {[
            "Status",
            "Source Product",
            "Input Code",
            "Mapped",
            "Rows",
            "Prior",
            "Net Qty",
            "History",
            "Accounts",
            "Reason",
          ].map((label, index) => (
            <th
              key={label}
              className={`px-3 py-2 text-right font-semibold uppercase tracking-wide first:text-left ${
                index === 1 ? "min-w-[320px] text-left" : ""
              }`}
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-800">
        {signatures.map((signature) => (
          <tr
            key={signature.signatureKey}
            className={signature.status === "needs_review" ? "bg-red-500/[0.04] hover:bg-red-500/[0.08]" : "hover:bg-gray-900/60"}
          >
            <td className="px-3 py-2 text-left">
              <StatusBadge label={statusLabel(signature.status)} tone={statusTone(signature.status)} />
            </td>
            <td className="max-w-[420px] px-3 py-2 text-left">
              <div className="truncate font-semibold text-gray-100" title={signature.sourceProduct ?? "-"}>
                {signature.sourceProduct ?? "-"}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-gray-500">
                {[signature.exchangeNameInput, signature.securityType, signature.putCall]
                  .filter(Boolean)
                  .join(" | ") || "-"}
              </div>
            </td>
            <td className="px-3 py-2 text-right font-semibold text-gray-100">
              {signature.exchangeCodeInput ?? "-"}
            </td>
            <td className="px-3 py-2 text-right">
              <div className="font-semibold text-gray-100">{signature.productCode ?? "-"}</div>
              <div className="mt-0.5 text-[11px] text-gray-500">
                {[signature.productGroup, signature.productRegion].filter(Boolean).join(" | ") || "-"}
              </div>
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {signature.latestRowCount.toLocaleString()}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {signature.priorRowCount.toLocaleString()}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {fmtFlexibleNumber(signature.latestNetQuantity, 2)}
            </td>
            <td className="px-3 py-2 text-right">
              <div className="flex justify-end">
                <HistoryBadge signature={signature} />
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                {fmtDate(signature.firstSeenDate)} to {fmtDate(signature.lastSeenDate)}
              </div>
            </td>
            <td className="max-w-[160px] truncate px-3 py-2 text-right" title={signature.accounts.join(", ")}>
              {signature.accounts.join(", ") || "-"}
            </td>
            <td className="max-w-[260px] truncate px-3 py-2 text-right text-gray-400" title={signature.reviewReason}>
              {signature.reviewReason}
            </td>
          </tr>
        ))}
        {!signatures.length && (
          <tr>
            <td colSpan={10} className="px-3 py-10 text-center text-sm text-gray-500">
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function compactRawRowColumns(): RawRowColumn[] {
  return [
    { key: "sftp_date", label: "SFTP", width: 90 },
    { key: "account_name", label: "Account", width: 118 },
    { key: "account_number", label: "Acct #", width: 96 },
    { key: "product_code", label: "Product", width: 86 },
    { key: "product_family", label: "Family", width: 118 },
    { key: "market_name", label: "Market", width: 118 },
    { key: "contract_yyyymm", label: "Contract", width: 88 },
    { key: "contract_day", label: "Day", width: 62 },
    { key: "put_call_code", label: "P/C", width: 58 },
    { key: "strike_price_normalized", label: "Strike", align: "right", width: 84 },
    { key: "buy_sell_cleaned", label: "B/S", width: 58 },
    { key: "quantity_cleaned", label: "Signed Qty", align: "right", width: 96 },
    { key: "trade_price", label: "Price", align: "right", width: 84 },
    { key: "rule_status", label: "Rule", width: 132 },
    { key: "rule_match_source", label: "Source", width: 96 },
    { key: "ice_product_code", label: "ICE Code", width: 132 },
    { key: "cme_product_code", label: "CME Code", width: 132 },
    { key: "bbg_product_code", label: "BBG Code", width: 132 },
  ];
}

function allRawRowColumns(): RawRowColumn[] {
  return CLEAR_STREET_MODEL_COLUMNS.map((column) => ({
    key: column,
    label: columnLabel(column),
    align:
      column.includes("quantity") ||
      column.includes("price") ||
      column.includes("amount") ||
      column.includes("fee") ||
      column.includes("commission") ||
      column === "brokerage"
        ? "right"
        : "left",
  }));
}

function rawRowsTableWidth(columns: RawRowColumn[]): number {
  return columns.reduce((total, column) => total + (column.width ?? RAW_ROW_DEFAULT_COLUMN_WIDTH_PX), 0);
}

function rawRowKey(row: Record<ClearStreetModelColumn, ClearStreetCellValue>, index: number): string {
  return [
    row.record_id ?? "",
    row.sftp_date ?? "",
    row.row_number_for_trades ?? "",
    index,
  ].join("|");
}

function rawRowDisplayValue(
  row: Record<ClearStreetModelColumn, ClearStreetCellValue>,
  column: RawRowColumn,
): string {
  const rendered = column.render?.(row);
  if (rendered !== undefined) return rendered;
  return fmtCell(row[column.key]);
}

function rawRowSortValue(
  row: Record<ClearStreetModelColumn, ClearStreetCellValue>,
  column: RawRowColumn,
): SortableValue {
  const value = row[column.key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const numeric = Number(String(value ?? "").replaceAll(",", ""));
  if (Number.isFinite(numeric) && String(value ?? "").trim() !== "") return numeric;
  return rawRowDisplayValue(row, column);
}

function rawRowMatchesColumnFilters(
  row: Record<ClearStreetModelColumn, ClearStreetCellValue>,
  columnsByKey: Map<ClearStreetModelColumn, RawRowColumn>,
  filters: ColumnFilters<ClearStreetModelColumn>,
): boolean {
  return (Object.entries(filters) as Array<[ClearStreetModelColumn, string[]]>).every(
    ([columnKey, selectedValues]) => {
      if (!selectedValues || selectedValues.length === 0) return true;
      const column = columnsByKey.get(columnKey);
      if (!column) return true;
      return selectedFilterMatches(rawRowDisplayValue(row, column), selectedValues);
    },
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
  debugData: ClearStreetTradesDebugPayload | null;
  drilldown: ClearStreetTradesDrilldownFilter | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
  onReload: () => void;
}) {
  const [columnMode, setColumnMode] = useState<"compact" | "all">("compact");
  const [rawSortState, setRawSortState] = useState<SortState<ClearStreetModelColumn> | null>(null);
  const [rawColumnFilters, setRawColumnFilters] = useState<ColumnFilters<ClearStreetModelColumn>>({});
  const columns = useMemo(
    () => (columnMode === "compact" ? compactRawRowColumns() : allRawRowColumns()),
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
      ) as ColumnFilters<ClearStreetModelColumn>,
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
  const activeRawFilterCount = Object.values(rawColumnFilters).reduce(
    (total, values) => total + (values?.length ?? 0),
    0,
  );
  const title = drilldown?.label ?? "Clear Street Raw Rows";
  const tableSubtitle = debugData
    ? [
        `SFTP ${debugData.selectedDate ?? "--"}`,
        `${debugData.summary.returnedRowCount.toLocaleString()} of ${debugData.summary.rowCount.toLocaleString()} rows`,
        `Limit ${debugData.summary.limit.toLocaleString()}`,
        activeRawFilterCount > 0 ? `${displayedRawRows.length.toLocaleString()} displayed` : null,
        columnMode === "compact" ? "Compact columns" : "All dbt mart columns",
      ].filter(Boolean).join(" | ")
    : undefined;

  useEffect(() => {
    setRawSortState(null);
    setRawColumnFilters({});
  }, [columnMode, drilldown]);

  const updateRawSort = (key: ClearStreetModelColumn) => {
    setRawSortState((sort) =>
      sort?.key === key
        ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };

  const updateRawColumnFilter = (key: ClearStreetModelColumn, values: string[]) => {
    setRawColumnFilters((filters) => {
      const next = { ...filters };
      if (values.length === 0) delete next[key];
      else next[key] = values;
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6">
      <div
        className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#0d1119] shadow-2xl shadow-black sm:w-[calc(100vw-3rem)] sm:max-w-[calc(100vw-3rem)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-street-raw-rows-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-800 px-4 py-3">
          <div className="min-w-0">
            <h2 id="clear-street-raw-rows-title" className="truncate text-base font-semibold text-gray-100" title={title}>
              {title}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {debugData
                ? `${debugData.selectedDate ?? "--"} | ${debugData.summary.returnedRowCount.toLocaleString()} rows returned`
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
              Loading Clear Street rows...
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
                    <col key={column.key} style={{ width: column.width ?? RAW_ROW_DEFAULT_COLUMN_WIDTH_PX }} />
                  ))}
                </colgroup>
                <thead className="bg-gray-950 text-gray-500">
                  <tr className="border-b border-gray-800/80">
                    {columns.map((column) => {
                      const sortDirection = rawSortState?.key === column.key ? rawSortState.direction : null;
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
                          const rendered = rawRowDisplayValue(row, column);
                          return (
                            <td
                              key={column.key}
                              className={`max-w-[260px] truncate border-b border-r border-gray-800 bg-[#0d1119] px-3 py-2 align-top text-gray-300 ${
                                column.align === "right" ? "text-right tabular-nums" : "text-left"
                              }`}
                              title={rendered}
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
            </DataTableShell>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClearStreetTrades({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: ClearStreetTradesFreshnessSummary) => void;
}) {
  const [selectedDate, setSelectedDate] = useState("");
  const [accounts, setAccounts] = useState<string[]>([]);
  const [productCodes, setProductCodes] = useState<string[]>([]);
  const [productFamilies, setProductFamilies] = useState<string[]>([]);
  const [marketNames, setMarketNames] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<ClearStreetReviewStatus[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ClearStreetTradesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<ClearStreetTradesDebugPayload | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [debugDrilldown, setDebugDrilldown] = useState<ClearStreetTradesDrilldownFilter | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  const currentFilters = useMemo(
    () => ({
      selectedDate,
      accounts,
      productCodes,
      productFamilies,
      marketNames,
      statuses,
      search,
    }),
    [accounts, marketNames, productCodes, productFamilies, search, selectedDate, statuses],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const forceRefresh = refreshToken > 0;
    setLoading(true);
    setError(null);

    fetchJsonWithCache<ClearStreetTradesPayload>({
      key: cacheKey(currentFilters, RAW_ROW_LIMIT),
      url: buildApiUrl({ ...currentFilters, limit: RAW_ROW_LIMIT, refresh: forceRefresh }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        onFreshnessChange?.(freshnessFromPayload(payload));
      })
      .catch((caught) => {
        if (!active || controller.signal.aborted) return;
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        const message = caught instanceof Error ? caught.message : "Failed to load Clear Street trades";
        setData(null);
        setError(message);
        onFreshnessChange?.({
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Trades query failed",
          targetDateLabel: selectedDate || "Latest file",
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
  }, [currentFilters, onFreshnessChange, refreshToken, selectedDate]);

  useEffect(() => {
    if (!data) return;
    setAccounts((selected) => retainAvailableSelections(selected, data.metadata.accounts));
    setProductCodes((selected) => retainAvailableSelections(selected, data.metadata.productCodes));
    setProductFamilies((selected) => retainAvailableSelections(selected, data.metadata.productFamilies));
    setMarketNames((selected) => retainAvailableSelections(selected, data.metadata.marketNames));
    setStatuses((selected) => retainAvailableStatuses(selected, data.metadata.statuses));
  }, [data]);

  const ladder = useMemo(() => buildBlotterLadder(data?.productSummary ?? []), [data?.productSummary]);
  const reviewSignatures = useMemo(
    () => (data?.reviewSignatures ?? []).filter((signature) => signatureMatchesSearch(signature, search)),
    [data, search],
  );
  const visibleDiagnostics = reviewSignatures.length > 0 ? reviewSignatures : data?.latestSignatures ?? [];
  const activeFilterCount =
    accounts.length +
    productCodes.length +
    productFamilies.length +
    marketNames.length +
    statuses.length +
    (search ? 1 : 0);

  const clearFilters = () => {
    setAccounts([]);
    setProductCodes([]);
    setProductFamilies([]);
    setMarketNames([]);
    setStatuses([]);
    setSearch("");
    setSearchInput("");
  };

  const submitSearch = () => setSearch(searchInput.trim());

  useEffect(() => {
    if (reviewSignatures.length > 0) setDiagnosticsOpen(true);
  }, [reviewSignatures.length]);

  const loadDebugRows = async (
    drilldown: ClearStreetTradesDrilldownFilter | null,
    forceRefresh = false,
  ) => {
    setDebugLoading(true);
    setDebugError(null);
    const url = buildDrilldownApiUrl({
      ...currentFilters,
      limit: RAW_ROW_LIMIT,
      drilldown,
      refresh: forceRefresh || refreshToken > 0,
    });

    try {
      const payload = await fetchJsonWithCache<ClearStreetTradesDebugPayload>({
        key: drilldownCacheKey(currentFilters, drilldown),
        url,
        ttlMs: API_CACHE_TTL_MS,
        cacheMode: forceRefresh || refreshToken > 0 ? "no-store" : "default",
        forceRefresh: forceRefresh || refreshToken > 0,
      });
      setDebugData(payload);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to load Clear Street rows";
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

  const openCellRows = (row: BlotterRow, column: ContractColumn) => {
    const drilldown: ClearStreetTradesDrilldownFilter = {
      productCode: row.productCode,
      productFamily: row.productFamily,
      marketName: row.marketName,
      sourceProduct: row.sourceProduct,
      contract: column.contract,
      contractMonth: column.contractMonth,
      contractDay: column.contractDay,
      putCall: row.putCall,
      strike: row.strike,
      reviewStatus: null,
      label: `${blotterRowLabel(row)} | ${column.label}`,
    };
    setDebugOpen(true);
    setDebugDrilldown(drilldown);
    setDebugData(null);
    void loadDebugRows(drilldown);
  };

  const statusOptions = data?.metadata.statuses.length
    ? data.metadata.statuses
    : (["needs_review", "vendor_warning", "matched"] as ClearStreetReviewStatus[]);

  return (
    <div className="w-full space-y-4">
      <div className="mx-auto w-full max-w-5xl">
        <ControlCard title="Clear Street Trades">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                Filters
              </span>
              <span className="h-px flex-1 bg-gray-800" />
              <span className="text-xs text-gray-500">
                {ladder.rows.length.toLocaleString()} products |{" "}
                {(data?.summary.rowCount ?? 0).toLocaleString()} rows
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={FILTER_LABEL_CLASS}>SFTP Snapshot</span>
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
                  <option key={date.sftpDate} value={date.sftpDate} className="bg-[#101521] text-gray-100">
                    {date.sftpDate}
                  </option>
                ))}
              </select>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitSearch();
                }}
                placeholder="Search product, code, account"
                className={SEARCH_INPUT_CLASS}
              />
              <button
                type="button"
                onClick={submitSearch}
                className="h-8 rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Apply
              </button>
              <StatusBadge
                label={`${(data?.summary.rowCount ?? 0).toLocaleString()} rows`}
                tone={data?.summary.rowCount ? "good" : "warn"}
              />
              <StatusBadge
                label={`As of ${fmtDateTime(data?.latestUploadAt ?? data?.asOf)}`}
                tone="neutral"
              />
            </div>

            <div>
              <SelectableFilterGroup
                label="Account"
                options={data?.metadata.accounts ?? []}
                selected={accounts}
                onChange={setAccounts}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={FILTER_LABEL_CLASS}>Product Code</span>
              <MultiSelect
                label="Product Code"
                options={data?.metadata.productCodes ?? []}
                selected={productCodes}
                onChange={setProductCodes}
                placeholder="All"
                width="w-40"
                tone="dark"
                showLabel={false}
              />
              <span className={FILTER_LABEL_CLASS}>Family</span>
              <MultiSelect
                label="Product Family"
                options={data?.metadata.productFamilies ?? []}
                selected={productFamilies}
                onChange={setProductFamilies}
                placeholder="All"
                width="w-44"
                tone="dark"
                showLabel={false}
              />
              <span className={FILTER_LABEL_CLASS}>Market</span>
              <MultiSelect
                label="Market"
                options={data?.metadata.marketNames ?? []}
                selected={marketNames}
                onChange={setMarketNames}
                placeholder="All"
                width="w-44"
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

            <div>
              <SelectableFilterGroup<ClearStreetReviewStatus>
                label="Rule Status"
                options={statusOptions}
                selected={statuses}
                onChange={setStatuses}
                labelForValue={statusLabel}
              />
            </div>

            {data && (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={`Needs review ${fmtNumber(data.summary.needsReviewRowCount)}`}
                  tone={data.summary.needsReviewRowCount ? "bad" : "good"}
                />
                <StatusBadge
                  label={`Warnings ${fmtNumber(data.summary.vendorWarningRowCount)}`}
                  tone={data.summary.vendorWarningRowCount ? "warn" : "neutral"}
                />
                <StatusBadge
                  label={`Matched ${fmtNumber(data.summary.matchedRowCount)}`}
                  tone="good"
                />
                <StatusBadge
                  label={`${ladder.columns.length.toLocaleString()} strips`}
                  tone={ladder.columns.length ? "good" : "warn"}
                />
                <StatusBadge label={data.metadata.artifactDisplayName} tone="neutral" />
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
          Loading Clear Street trades...
        </div>
      )}

      {data && !loading && (
        <DataTableShell
          title="Clear Street Trade Summary"
          subtitle={`SFTP snapshot ${data.selectedDate ?? "--"} | Signed quantity by dbt product and contract from ${data.metadata.sourceTable}`}
          className="w-full"
          bodyClassName="w-full max-h-[calc(100vh-300px)] overflow-y-auto"
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
              onCellSelect={(row, column) => openCellRows(row, column)}
            />
          </div>
        </DataTableShell>
      )}

      {data && !loading && visibleDiagnostics.length > 0 && (
        <DataTableShell
          title="Review Diagnostics"
          subtitle={`${visibleDiagnostics.length.toLocaleString()} signatures shown | ${data.nullCheckCriteria}`}
          bodyClassName="max-h-[48vh] overflow-auto"
          collapsible
          open={diagnosticsOpen}
          onToggle={() => setDiagnosticsOpen((open) => !open)}
        >
          <SignatureTable
            signatures={visibleDiagnostics}
            emptyMessage="No Clear Street product signatures matched the selected filters."
          />
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
