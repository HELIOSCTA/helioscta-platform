"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import ColumnFilterMenu, { type SortDirection } from "@/components/dashboard/ColumnFilterMenu";
import DataTableShell from "@/components/dashboard/DataTableShell";
import MultiSelect from "@/components/ui/MultiSelect";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import {
  buildNavPositionSqlDownloads,
  normalizeNavPositionProduct,
  type NavPositionSqlDownload,
  type NavPositionSqlParams,
  type ProductRuleResult,
} from "@/lib/positionsAndTrades";

export interface NavPositionsFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface AvailableDate {
  navDate: string;
  fundCount: number;
  rowCount: number;
  latestUploadAt: string | null;
}

interface NavPositionsSummary {
  rowCount: number;
  fundCount: number;
  accountGroupCount: number;
  accountCount: number;
  productGroupCount: number;
  costBase: number | null;
  marketValueBase: number | null;
  unrealizedPnlBase: number | null;
  netQuantity: number | null;
  grossQuantity: number | null;
  rawLimit: number;
}

interface ProductSummaryRow {
  productCode: string | null;
  productGroup: string | null;
  productRegion: string | null;
  underlyingProductCode: string | null;
  contractYyyymm: string | null;
  contractDay: number | null;
  putCall: string | null;
  strikePrice: number | null;
  fundCodes: string | null;
  accountGroups: string | null;
  fundCount: number;
  accountGroupCount: number;
  rowCount: number;
  accountCount: number;
  netQuantity: number | null;
  grossQuantity: number | null;
  costBase: number | null;
  marketValueBase: number | null;
  unrealizedPnlBase: number | null;
  avgTradePrice: number | null;
  avgSettlementPrice: number | null;
}

interface ProductGroupFilter {
  productCode: string | null;
  productGroup: string | null;
  productRegion: string | null;
  underlyingProductCode: string | null;
  contractYyyymm: string | null;
  contractDay: number | null;
  putCall: string | null;
  strikePrice: number | null;
}

interface RawPositionRow {
  fundCode: string;
  sourceLegalEntity: string;
  sourceFileName: string;
  sourceFileRowNumber: number;
  navDate: string;
  sftpUploadTimestamp: string | null;
  brokerName: string | null;
  accountGroup: string | null;
  account: string | null;
  tradeDate: string | null;
  productIdInternal: string | null;
  product: string | null;
  type: string | null;
  monthYear: string | null;
  clientSymbol: string | null;
  strikePrice: number | null;
  callPut: string | null;
  productCurrency1: string | null;
  longShort: string | null;
  quantity1: number | null;
  counterCurrencyCcy2: string | null;
  ccy2LongShort: string | null;
  ccy2Quantity2: number | null;
  tradePrice: number | null;
  multiplierAndTickValue: number | null;
  costInNativeCurrency: number | null;
  openExchangeRate: number | null;
  costInBaseCurrency: number | null;
  marketSettlementPrice: number | null;
  marketValueInNativeCurrency: number | null;
  closeExchangeRate: number | null;
  marketValueInBaseCurrency: number | null;
  sector: string | null;
  subSector: string | null;
  country: string | null;
  exchangeName: string | null;
  source1Symbol: string | null;
  source3Symbol: string | null;
  oneChicagoSymbol: string | null;
  fasLevel: string | null;
  optionStyle: string | null;
  productCode: string | null;
  productGroup: string | null;
  productRegion: string | null;
  underlyingProductCode: string | null;
  contractYyyymm: string | null;
  contractDay: number | null;
  putCall: string | null;
  normalizedStrikePrice: number | null;
  normalizationStatus: string | null;
  updatedAt: string | null;
}

interface NavPositionsPayload {
  source: "nav.positions";
  selectedDate: string | null;
  latestDate: string | null;
  selectedDateRange: {
    min: string | null;
    max: string | null;
  };
  requestedDate: string | null;
  asOf: string | null;
  latestUploadAt: string | null;
  availableDates: AvailableDate[];
  filters: {
    fund: string;
    accountGroup: string;
    productSearch: string;
    group: ProductGroupFilter | null;
  };
  summary: NavPositionsSummary;
  productSummary: ProductSummaryRow[];
  rawRows: RawPositionRow[];
  metadata: {
    funds: string[];
    accountGroups: string[];
    products: string[];
    aggregationGrain: string[];
    rawColumns: string[];
    productSummaryLimit: number;
    maxRawLimit: number;
    units: {
      valuation: string;
      quantity: string;
    };
  };
}

type ViewMode = "summary" | "raw" | "rules";
type ColumnAlign = "left" | "right";
type SortState<Key extends string> = { key: Key; direction: SortDirection };
type ColumnFilters<Key extends string> = Partial<Record<Key, string[]>>;

type ProductSummaryColumnKey =
  | "productCode"
  | "productGroup"
  | "productRegion"
  | "underlyingProductCode"
  | "contractYyyymm"
  | "contractDay"
  | "putCall"
  | "strikePrice"
  | "funds"
  | "accounts"
  | "netQuantity"
  | "costBase"
  | "marketValueBase"
  | "unrealizedPnlBase"
  | "avgTradePrice"
  | "avgSettlementPrice"
  | "rows";

type RawColumnKey =
  | "product"
  | "productCode"
  | "productGroup"
  | "productRegion"
  | "contract"
  | "normalizationStatus"
  | "fundCode"
  | "navDate"
  | "sftpUploadTimestamp"
  | "brokerName"
  | "accountGroup"
  | "account"
  | "tradeDate"
  | "type"
  | "monthYear"
  | "clientSymbol"
  | "source1Symbol"
  | "source3Symbol"
  | "longShort"
  | "quantity1"
  | "ccy2Quantity2"
  | "tradePrice"
  | "marketSettlementPrice"
  | "costInNativeCurrency"
  | "costInBaseCurrency"
  | "marketValueInNativeCurrency"
  | "marketValueInBaseCurrency"
  | "sector"
  | "subSector"
  | "exchangeName"
  | "sourceFileRowNumber";

interface TableColumn<Key extends string> {
  key: Key;
  label: string;
  align?: ColumnAlign;
  sticky?: boolean;
  minClass?: string;
}

const API_CACHE_TTL_MS = 2 * 60 * 1000;
const FIELD_LABEL_CLASS = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500";
const FIELD_CONTROL_CLASS =
  "w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none disabled:cursor-not-allowed disabled:text-gray-600";
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
  fund,
  accountGroup,
  productSearch,
  rawLimit,
  refresh,
  group,
}: {
  selectedDate: string;
  fund: string;
  accountGroup: string;
  productSearch: string;
  rawLimit: number;
  refresh: boolean;
  group?: ProductGroupFilter | null;
}): string {
  const params = new URLSearchParams({ rawLimit: String(rawLimit) });
  if (selectedDate) params.set("date", selectedDate);
  if (group) {
    params.set("group", JSON.stringify(group));
  } else {
    if (fund !== "all") params.set("fund", fund);
    if (accountGroup !== "all") params.set("accountGroup", accountGroup);
    if (productSearch.trim()) params.set("product", productSearch.trim());
  }
  if (refresh) params.set("refresh", "1");
  return `/api/dev/nav-positions?${params.toString()}`;
}

function cacheKey({
  selectedDate,
  fund,
  accountGroup,
  productSearch,
  rawLimit,
}: {
  selectedDate: string;
  fund: string;
  accountGroup: string;
  productSearch: string;
  rawLimit: number;
}): string {
  return [
    "api:dev:nav-positions",
    selectedDate || "latest",
    fund,
    accountGroup,
    productSearch.trim() || "all",
    rawLimit,
  ].join(":");
}

function groupFilterFromRow(row: ProductSummaryRow): ProductGroupFilter {
  return {
    productCode: row.productCode,
    productGroup: row.productGroup,
    productRegion: row.productRegion,
    underlyingProductCode: row.underlyingProductCode,
    contractYyyymm: row.contractYyyymm,
    contractDay: row.contractDay,
    putCall: row.putCall,
    strikePrice: row.strikePrice,
  };
}

function groupCacheKey(selectedDate: string, row: ProductSummaryRow): string {
  return [
    "api:dev:nav-positions:group",
    selectedDate || "latest",
    JSON.stringify(groupFilterFromRow(row)),
  ].join(":");
}

function fmtDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "-";
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

function displayRuleValue(value: string | number | boolean | null | undefined): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "-";
  return displayText(value);
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

function SegmentedButton({
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
      onClick={onClick}
      className={`min-w-[84px] rounded-sm px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "bg-gray-200 text-gray-950"
          : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
      }`}
    >
      {children}
    </button>
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
      className={`rounded-sm border px-2.5 py-1 text-xs font-semibold transition-colors ${
        active
          ? "border-sky-500/50 bg-sky-500/15 text-sky-100"
          : "border-gray-700 bg-gray-950 text-gray-400 hover:border-gray-600 hover:text-gray-200"
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

const PRODUCT_SUMMARY_COLUMNS: Array<TableColumn<ProductSummaryColumnKey>> = [
  { key: "productCode", label: "Code", align: "left", sticky: true, minClass: "min-w-[160px]" },
  { key: "productGroup", label: "Group" },
  { key: "productRegion", label: "Region" },
  { key: "underlyingProductCode", label: "Underlying" },
  { key: "contractYyyymm", label: "Contract" },
  { key: "contractDay", label: "Day" },
  { key: "putCall", label: "C/P" },
  { key: "strikePrice", label: "Strike" },
  { key: "funds", label: "Funds" },
  { key: "accounts", label: "Accounts" },
  { key: "netQuantity", label: "Net Qty" },
  { key: "costBase", label: "Cost Base" },
  { key: "marketValueBase", label: "MV Base" },
  { key: "unrealizedPnlBase", label: "P&L Base" },
  { key: "avgTradePrice", label: "Trade" },
  { key: "avgSettlementPrice", label: "Settle" },
  { key: "rows", label: "Rows" },
];

const RAW_COLUMNS: Array<TableColumn<RawColumnKey>> = [
  { key: "product", label: "Product", align: "left", sticky: true, minClass: "min-w-[300px]" },
  { key: "productCode", label: "Code" },
  { key: "productGroup", label: "Group" },
  { key: "productRegion", label: "Region" },
  { key: "contract", label: "Contract" },
  { key: "normalizationStatus", label: "Status" },
  { key: "fundCode", label: "Fund" },
  { key: "navDate", label: "Position Date" },
  { key: "sftpUploadTimestamp", label: "Upload" },
  { key: "brokerName", label: "Broker" },
  { key: "accountGroup", label: "Account Group" },
  { key: "account", label: "Account" },
  { key: "tradeDate", label: "Trade Date" },
  { key: "type", label: "Type" },
  { key: "monthYear", label: "Month" },
  { key: "clientSymbol", label: "Client" },
  { key: "source1Symbol", label: "Src 1" },
  { key: "source3Symbol", label: "Src 3" },
  { key: "longShort", label: "Long/Short" },
  { key: "quantity1", label: "Qty 1" },
  { key: "ccy2Quantity2", label: "CCY 2 Qty" },
  { key: "tradePrice", label: "Trade" },
  { key: "marketSettlementPrice", label: "Settle" },
  { key: "costInNativeCurrency", label: "Cost Native" },
  { key: "costInBaseCurrency", label: "Cost Base" },
  { key: "marketValueInNativeCurrency", label: "MV Native" },
  { key: "marketValueInBaseCurrency", label: "MV Base" },
  { key: "sector", label: "Sector" },
  { key: "subSector", label: "Sub Sector" },
  { key: "exchangeName", label: "Exchange" },
  { key: "sourceFileRowNumber", label: "File Row" },
];

function productSummaryDisplayValue(row: ProductSummaryRow, key: ProductSummaryColumnKey): string {
  switch (key) {
    case "productCode":
      return displayText(row.productCode);
    case "productGroup":
      return displayText(row.productGroup);
    case "productRegion":
      return displayText(row.productRegion);
    case "underlyingProductCode":
      return displayText(row.underlyingProductCode);
    case "contractYyyymm":
      return displayText(row.contractYyyymm);
    case "contractDay":
      return fmtNumber(row.contractDay, 0);
    case "putCall":
      return displayText(row.putCall);
    case "strikePrice":
      return fmtPrice(row.strikePrice);
    case "funds":
      return row.fundCount.toLocaleString();
    case "accounts":
      return row.accountCount.toLocaleString();
    case "netQuantity":
      return fmtQuantity(row.netQuantity);
    case "costBase":
      return fmtNumber(row.costBase, 0);
    case "marketValueBase":
      return fmtNumber(row.marketValueBase, 0);
    case "unrealizedPnlBase":
      return fmtNumber(row.unrealizedPnlBase, 0);
    case "avgTradePrice":
      return fmtPrice(row.avgTradePrice);
    case "avgSettlementPrice":
      return fmtPrice(row.avgSettlementPrice);
    case "rows":
      return row.rowCount.toLocaleString();
  }
}

function productSummarySortValue(
  row: ProductSummaryRow,
  key: ProductSummaryColumnKey,
): string | number | null {
  switch (key) {
    case "productCode":
      return row.productCode;
    case "productGroup":
      return row.productGroup;
    case "productRegion":
      return row.productRegion;
    case "underlyingProductCode":
      return row.underlyingProductCode;
    case "contractYyyymm":
      return row.contractYyyymm;
    case "contractDay":
      return row.contractDay;
    case "putCall":
      return row.putCall;
    case "strikePrice":
      return row.strikePrice;
    case "funds":
      return row.fundCount;
    case "accounts":
      return row.accountCount;
    case "netQuantity":
      return row.netQuantity;
    case "costBase":
      return row.costBase;
    case "marketValueBase":
      return row.marketValueBase;
    case "unrealizedPnlBase":
      return row.unrealizedPnlBase;
    case "avgTradePrice":
      return row.avgTradePrice;
    case "avgSettlementPrice":
      return row.avgSettlementPrice;
    case "rows":
      return row.rowCount;
  }
}

function productSummaryRowMatchesFilter(
  row: ProductSummaryRow,
  key: ProductSummaryColumnKey,
  selectedValues: string[],
): boolean {
  if (selectedValues.length === 0) return true;
  const value = productSummaryDisplayValue(row, key).toLowerCase();
  return selectedValues.some((selected) => value === selected.trim().toLowerCase());
}

function productSummaryCellClass(row: ProductSummaryRow, column: TableColumn<ProductSummaryColumnKey>) {
  const align = column.align === "left" ? "text-left" : "text-right";
  const sticky = column.sticky
    ? "sticky left-0 z-10 max-w-[160px] bg-[#0d1119] font-semibold text-gray-100"
    : "";
  const numeric = [
    "contractDay",
    "strikePrice",
    "funds",
    "accounts",
    "netQuantity",
    "costBase",
    "marketValueBase",
    "unrealizedPnlBase",
    "avgTradePrice",
    "avgSettlementPrice",
    "rows",
  ].includes(column.key)
    ? "tabular-nums"
    : "";
  const tone =
    column.key === "unrealizedPnlBase"
      ? row.unrealizedPnlBase === null
        ? "font-semibold text-gray-300"
        : row.unrealizedPnlBase >= 0
          ? "font-semibold text-emerald-200"
          : "font-semibold text-red-200"
      : column.key === "marketValueBase"
        ? "font-semibold text-gray-100"
        : column.key === "productCode"
          ? ""
          : "text-gray-300";

  return `px-3 py-2 ${align} ${sticky} ${numeric} ${tone}`;
}

function renderProductSummaryCell(
  row: ProductSummaryRow,
  key: ProductSummaryColumnKey,
  onRowSelect: (row: ProductSummaryRow) => void,
): ReactNode {
  if (key === "rows") {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRowSelect(row);
        }}
        className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:bg-gray-800"
      >
        {row.rowCount.toLocaleString()}
      </button>
    );
  }

  if (key === "productCode") {
    return (
      <span className="block truncate" title={row.productCode ?? undefined}>
        {displayText(row.productCode)}
      </span>
    );
  }

  if (key === "funds") {
    return <span title={row.fundCodes ?? undefined}>{row.fundCount.toLocaleString()}</span>;
  }

  if (key === "accounts") {
    return <span title={row.accountGroups ?? undefined}>{row.accountCount.toLocaleString()}</span>;
  }

  return productSummaryDisplayValue(row, key);
}

function ProductSummaryTable({
  rows,
  onRowSelect,
}: {
  rows: ProductSummaryRow[];
  onRowSelect: (row: ProductSummaryRow) => void;
}) {
  const [columnFilters, setColumnFilters] = useState<ColumnFilters<ProductSummaryColumnKey>>({});
  const [sortState, setSortState] = useState<SortState<ProductSummaryColumnKey> | null>(null);

  const updateColumnFilter = (key: ProductSummaryColumnKey, values: string[]) => {
    setColumnFilters((filters) => {
      const next = { ...filters };
      if (values.length > 0) next[key] = values;
      else delete next[key];
      return next;
    });
  };

  const filterOptions = useMemo(() => {
    return Object.fromEntries(
      PRODUCT_SUMMARY_COLUMNS.map((column) => {
        const otherFilteredRows = rows.filter((row) =>
          Object.entries(columnFilters).every(
            ([key, selected]) =>
              key === column.key ||
              productSummaryRowMatchesFilter(row, key as ProductSummaryColumnKey, selected),
          ),
        );
        const options = Array.from(
          new Set(
            otherFilteredRows
              .map((row) => productSummaryDisplayValue(row, column.key))
              .filter((value) => value.trim() !== "" && value !== "-"),
          ),
        ).sort(sortFilterOption);
        return [column.key, options] as const;
      }),
    ) as Partial<Record<ProductSummaryColumnKey, string[]>>;
  }, [columnFilters, rows]);

  const displayedRows = useMemo(() => {
    const activeFilters = Object.entries(columnFilters)
      .map(([key, selected]) => [key as ProductSummaryColumnKey, selected] as const)
      .filter(([, selected]) => selected.length > 0);
    const filtered =
      activeFilters.length === 0
        ? rows
        : rows.filter((row) =>
            activeFilters.every(([key, selected]) =>
              productSummaryRowMatchesFilter(row, key, selected),
            ),
          );

    if (!sortState) return filtered;
    return [...filtered].sort((left, right) =>
      compareColumnValues(
        productSummarySortValue(left, sortState.key),
        productSummarySortValue(right, sortState.key),
        sortState.direction,
      ),
    );
  }, [columnFilters, rows, sortState]);

  const toggleSort = (key: ProductSummaryColumnKey) => {
    setSortState((current) =>
      current?.key === key && current.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" },
    );
  };

  return (
    <table className="w-full min-w-[1500px] border-collapse bg-[#0d1119] text-xs text-gray-200">
      <thead className="bg-gray-950 text-gray-500">
        <tr>
          {PRODUCT_SUMMARY_COLUMNS.map((column) => {
            const sortDirection = sortState?.key === column.key ? sortState.direction : null;
            return (
              <th
                key={column.key}
                className={`${tableHeaderClass(column)} ${column.minClass ?? ""}`}
              >
                <div className={tableHeaderInnerClass(column)}>
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={`flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 transition-colors hover:bg-gray-900 ${
                      sortDirection ? "text-sky-200" : "text-gray-400"
                    }`}
                    aria-label={`Sort ${column.label}`}
                  >
                    <span className="truncate text-[10px] leading-3">{column.label}</span>
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
        {displayedRows.map((row) => (
          <tr key={JSON.stringify(groupFilterFromRow(row))} className="hover:bg-gray-900/60">
            {PRODUCT_SUMMARY_COLUMNS.map((column) => (
              <td key={column.key} className={productSummaryCellClass(row, column)}>
                {renderProductSummaryCell(row, column.key, onRowSelect)}
              </td>
            ))}
          </tr>
        ))}
        {!displayedRows.length && (
          <tr>
            <td
              colSpan={PRODUCT_SUMMARY_COLUMNS.length}
              className="px-3 py-8 text-center text-sm text-gray-500"
            >
              No product groups match the selected filters.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function rawContractLabel(row: RawPositionRow): string {
  return `${displayText(row.contractYyyymm)}${
    row.contractDay !== null ? `-${String(row.contractDay).padStart(2, "0")}` : ""
  }`;
}

function rawDisplayValue(row: RawPositionRow, key: RawColumnKey): string {
  switch (key) {
    case "product":
      return displayText(row.product);
    case "productCode":
      return displayText(row.productCode);
    case "productGroup":
      return displayText(row.productGroup);
    case "productRegion":
      return displayText(row.productRegion);
    case "contract":
      return rawContractLabel(row);
    case "normalizationStatus":
      return displayText(row.normalizationStatus);
    case "fundCode":
      return displayText(row.fundCode);
    case "navDate":
      return fmtDate(row.navDate);
    case "sftpUploadTimestamp":
      return fmtDateTime(row.sftpUploadTimestamp);
    case "brokerName":
      return displayText(row.brokerName);
    case "accountGroup":
      return displayText(row.accountGroup);
    case "account":
      return displayText(row.account);
    case "tradeDate":
      return fmtDate(row.tradeDate);
    case "type":
      return displayText(row.type);
    case "monthYear":
      return displayText(row.monthYear);
    case "clientSymbol":
      return displayText(row.clientSymbol);
    case "source1Symbol":
      return displayText(row.source1Symbol);
    case "source3Symbol":
      return displayText(row.source3Symbol);
    case "longShort":
      return displayText(row.longShort);
    case "quantity1":
      return fmtQuantity(row.quantity1);
    case "ccy2Quantity2":
      return fmtQuantity(row.ccy2Quantity2);
    case "tradePrice":
      return fmtPrice(row.tradePrice);
    case "marketSettlementPrice":
      return fmtPrice(row.marketSettlementPrice);
    case "costInNativeCurrency":
      return fmtNumber(row.costInNativeCurrency, 0);
    case "costInBaseCurrency":
      return fmtNumber(row.costInBaseCurrency, 0);
    case "marketValueInNativeCurrency":
      return fmtNumber(row.marketValueInNativeCurrency, 0);
    case "marketValueInBaseCurrency":
      return fmtNumber(row.marketValueInBaseCurrency, 0);
    case "sector":
      return displayText(row.sector);
    case "subSector":
      return displayText(row.subSector);
    case "exchangeName":
      return displayText(row.exchangeName);
    case "sourceFileRowNumber":
      return row.sourceFileRowNumber.toLocaleString();
  }
}

function rawSortValue(row: RawPositionRow, key: RawColumnKey): string | number | null {
  switch (key) {
    case "quantity1":
      return row.quantity1;
    case "ccy2Quantity2":
      return row.ccy2Quantity2;
    case "tradePrice":
      return row.tradePrice;
    case "marketSettlementPrice":
      return row.marketSettlementPrice;
    case "costInNativeCurrency":
      return row.costInNativeCurrency;
    case "costInBaseCurrency":
      return row.costInBaseCurrency;
    case "marketValueInNativeCurrency":
      return row.marketValueInNativeCurrency;
    case "marketValueInBaseCurrency":
      return row.marketValueInBaseCurrency;
    case "sourceFileRowNumber":
      return row.sourceFileRowNumber;
    case "navDate":
      return row.navDate;
    case "sftpUploadTimestamp":
      return row.sftpUploadTimestamp;
    case "tradeDate":
      return row.tradeDate;
    default:
      return rawDisplayValue(row, key);
  }
}

function rawRowMatchesFilter(row: RawPositionRow, key: RawColumnKey, selectedValues: string[]): boolean {
  if (selectedValues.length === 0) return true;
  const value = rawDisplayValue(row, key).toLowerCase();
  return selectedValues.some((selected) => value === selected.trim().toLowerCase());
}

function rawCellClass(column: TableColumn<RawColumnKey>): string {
  const align = column.align === "left" ? "text-left" : "text-right";
  const sticky = column.sticky
    ? "sticky left-0 z-10 max-w-[300px] bg-[#0d1119] font-semibold text-gray-100"
    : "";
  const numeric = [
    "quantity1",
    "ccy2Quantity2",
    "tradePrice",
    "marketSettlementPrice",
    "costInNativeCurrency",
    "costInBaseCurrency",
    "marketValueInNativeCurrency",
    "marketValueInBaseCurrency",
    "sourceFileRowNumber",
  ].includes(column.key)
    ? "tabular-nums"
    : "";
  const tone =
    column.key === "marketValueInBaseCurrency"
      ? "font-semibold text-gray-100"
      : column.key === "product"
        ? ""
        : "text-gray-300";

  return `px-3 py-2 ${align} ${sticky} ${numeric} ${tone}`;
}

function renderRawCell(row: RawPositionRow, key: RawColumnKey): ReactNode {
  if (key === "product") {
    return (
      <span className="block truncate" title={row.product ?? undefined}>
        {displayText(row.product)}
      </span>
    );
  }
  return rawDisplayValue(row, key);
}

function RawRowsTable({ rows }: { rows: RawPositionRow[] }) {
  const [columnFilters, setColumnFilters] = useState<ColumnFilters<RawColumnKey>>({});
  const [sortState, setSortState] = useState<SortState<RawColumnKey> | null>(null);

  const updateColumnFilter = (key: RawColumnKey, values: string[]) => {
    setColumnFilters((filters) => {
      const next = { ...filters };
      if (values.length > 0) next[key] = values;
      else delete next[key];
      return next;
    });
  };

  const filterOptions = useMemo(() => {
    return Object.fromEntries(
      RAW_COLUMNS.map((column) => {
        const otherFilteredRows = rows.filter((row) =>
          Object.entries(columnFilters).every(
            ([key, selected]) =>
              key === column.key || rawRowMatchesFilter(row, key as RawColumnKey, selected),
          ),
        );
        const options = Array.from(
          new Set(
            otherFilteredRows
              .map((row) => rawDisplayValue(row, column.key))
              .filter((value) => value.trim() !== "" && value !== "-"),
          ),
        ).sort(sortFilterOption);
        return [column.key, options] as const;
      }),
    ) as Partial<Record<RawColumnKey, string[]>>;
  }, [columnFilters, rows]);

  const displayedRows = useMemo(() => {
    const activeFilters = Object.entries(columnFilters)
      .map(([key, selected]) => [key as RawColumnKey, selected] as const)
      .filter(([, selected]) => selected.length > 0);
    const filtered =
      activeFilters.length === 0
        ? rows
        : rows.filter((row) =>
            activeFilters.every(([key, selected]) => rawRowMatchesFilter(row, key, selected)),
          );

    if (!sortState) return filtered;
    return [...filtered].sort((left, right) =>
      compareColumnValues(
        rawSortValue(left, sortState.key),
        rawSortValue(right, sortState.key),
        sortState.direction,
      ),
    );
  }, [columnFilters, rows, sortState]);

  const toggleSort = (key: RawColumnKey) => {
    setSortState((current) =>
      current?.key === key && current.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" },
    );
  };

  return (
    <table className="w-full min-w-[2680px] border-collapse bg-[#0d1119] text-xs text-gray-200">
      <thead className="bg-gray-950 text-gray-500">
        <tr>
          {RAW_COLUMNS.map((column) => {
            const sortDirection = sortState?.key === column.key ? sortState.direction : null;
            return (
              <th
                key={column.key}
                className={`${tableHeaderClass(column)} ${column.minClass ?? ""}`}
              >
                <div className={tableHeaderInnerClass(column)}>
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={`flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 transition-colors hover:bg-gray-900 ${
                      sortDirection ? "text-sky-200" : "text-gray-400"
                    }`}
                    aria-label={`Sort ${column.label}`}
                  >
                    <span className="truncate text-[10px] leading-3">{column.label}</span>
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
        {displayedRows.map((row) => (
          <tr
            key={`${row.sourceFileName}|${row.sourceFileRowNumber}`}
            className="hover:bg-gray-900/60"
          >
            {RAW_COLUMNS.map((column) => (
              <td key={column.key} className={rawCellClass(column)}>
                {renderRawCell(row, column.key)}
              </td>
            ))}
          </tr>
        ))}
        {!displayedRows.length && (
          <tr>
            <td colSpan={RAW_COLUMNS.length} className="px-3 py-8 text-center text-sm text-gray-500">
              No raw position rows match the selected filters.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

interface RulePreviewRow {
  sourceRow: RawPositionRow;
  result: ProductRuleResult;
}

type RuleExceptionIssue =
  | "Unresolved product"
  | "Unparsed contract"
  | "Option missing C/P"
  | "Option missing strike";

interface RuleExceptionGroup {
  key: string;
  issue: RuleExceptionIssue;
  product: string | null;
  fundCode: string | null;
  type: string | null;
  monthYear: string | null;
  exchangeName: string | null;
  ruleCode: string | null;
  contractMonth: string | null;
  rowCount: number;
  marketValueBase: number | null;
  exampleRow: RawPositionRow;
}

function ruleIssues(row: RawPositionRow, result: ProductRuleResult): RuleExceptionIssue[] {
  const issues: RuleExceptionIssue[] = [];
  if (!result.exchangeCode) issues.push("Unresolved product");
  if (row.monthYear && !result.contractMonth) issues.push("Unparsed contract");
  if (result.isOption && !result.putCall) issues.push("Option missing C/P");
  if (result.isOption && result.strikePrice === null) issues.push("Option missing strike");
  return issues;
}

function addNullableNumber(left: number | null, right: number | null | undefined): number | null {
  if (right === null || right === undefined || !Number.isFinite(right)) return left;
  return (left ?? 0) + right;
}

function ruleExceptionKey(
  issue: RuleExceptionIssue,
  row: RawPositionRow,
  result: ProductRuleResult
): string {
  return JSON.stringify([
    issue,
    row.product ?? null,
    row.fundCode ?? null,
    row.type ?? null,
    row.monthYear ?? null,
    row.exchangeName ?? null,
    result.exchangeCode ?? null,
    result.contractMonth ?? null,
  ]);
}

function buildRuleExceptionGroups(rows: RulePreviewRow[]): RuleExceptionGroup[] {
  const groups = new Map<string, RuleExceptionGroup>();

  for (const row of rows) {
    for (const issue of ruleIssues(row.sourceRow, row.result)) {
      const key = ruleExceptionKey(issue, row.sourceRow, row.result);
      const existing = groups.get(key);
      if (existing) {
        existing.rowCount += 1;
        existing.marketValueBase = addNullableNumber(
          existing.marketValueBase,
          row.sourceRow.marketValueInBaseCurrency
        );
        continue;
      }

      groups.set(key, {
        key,
        issue,
        product: row.sourceRow.product,
        fundCode: row.sourceRow.fundCode,
        type: row.sourceRow.type,
        monthYear: row.sourceRow.monthYear,
        exchangeName: row.sourceRow.exchangeName,
        ruleCode: row.result.exchangeCode,
        contractMonth: row.result.contractMonth,
        rowCount: 1,
        marketValueBase: addNullableNumber(null, row.sourceRow.marketValueInBaseCurrency),
        exampleRow: row.sourceRow,
      });
    }
  }

  return Array.from(groups.values()).sort((left, right) => {
    const marketDelta =
      Math.abs(right.marketValueBase ?? 0) - Math.abs(left.marketValueBase ?? 0);
    if (marketDelta !== 0) return marketDelta;
    if (right.rowCount !== left.rowCount) return right.rowCount - left.rowCount;
    return left.issue.localeCompare(right.issue);
  });
}

function downloadTextFile(fileName: string, text: string) {
  const blob = new Blob([text], { type: "text/sql;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function SqlDownloadsPanel({ downloads }: { downloads: NavPositionSqlDownload[] }) {
  const downloadGroups = (["Marts", "Checks", "Drilldowns"] as const)
    .map((group) => ({
      group,
      downloads: downloads.filter((download) => download.group === group),
    }))
    .filter((group) => group.downloads.length > 0);

  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">SQL Downloads</h2>
          <p className="mt-1 text-xs text-gray-500">
            Standalone read-only SQL generated from the current product rules.
          </p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {downloadGroups.map((group) => (
          <div key={group.group} className="rounded-md border border-gray-800 bg-gray-950/40 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {group.group}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.downloads.map((download) => (
                <button
                  key={download.fileName}
                  type="button"
                  onClick={() => downloadTextFile(download.fileName, download.sql)}
                  className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:bg-gray-800"
                >
                  {download.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RuleExceptionsTable({ groups }: { groups: RuleExceptionGroup[] }) {
  return (
    <table className="w-full min-w-[1120px] border-collapse bg-[#0d1119] text-xs text-gray-200">
      <thead className="bg-gray-950 text-gray-500">
        <tr>
          {[
            "Issue",
            "Product",
            "Fund",
            "Type",
            "Exchange",
            "Month",
            "Rule Code",
            "Contract",
            "Rows",
            "Market Value",
            "Example Row",
          ].map((label, index) => (
            <th
              key={label}
              className={`px-3 py-2 font-semibold uppercase tracking-wide ${
                index < 2 ? "text-left" : "text-right"
              }`}
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-800">
        {groups.map((group) => (
          <tr key={group.key} className="hover:bg-gray-900/60">
            <td className="px-3 py-2 text-left font-semibold text-yellow-200">
              {group.issue}
            </td>
            <td className="max-w-[360px] px-3 py-2 text-left font-semibold text-gray-100">
              <span className="block truncate" title={group.product ?? undefined}>
                {displayText(group.product)}
              </span>
            </td>
            <td className="px-3 py-2 text-right uppercase tabular-nums text-gray-300">
              {displayText(group.fundCode)}
            </td>
            <td className="px-3 py-2 text-right text-gray-300">{displayText(group.type)}</td>
            <td className="px-3 py-2 text-right text-gray-300">
              {displayText(group.exchangeName)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-400">
              {displayText(group.monthYear)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-100">
              {displayRuleValue(group.ruleCode)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-300">
              {displayRuleValue(group.contractMonth)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-100">
              {group.rowCount.toLocaleString()}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-300">
              {fmtNumber(group.marketValueBase, 0)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-500">
              {group.exampleRow.sourceFileRowNumber.toLocaleString()}
            </td>
          </tr>
        ))}
        {!groups.length && (
          <tr>
            <td colSpan={11} className="px-3 py-8 text-center text-sm text-gray-500">
              No rule exceptions for the loaded rows.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function RulesView({
  payload,
  loading,
  error,
  sqlParams,
}: {
  payload: NavPositionsPayload | null;
  loading: boolean;
  error: string | null;
  sqlParams: NavPositionSqlParams;
}) {
  const previewRows = useMemo<RulePreviewRow[]>(
    () =>
      (payload?.rawRows ?? []).map((row) => {
        const result = normalizeNavPositionProduct({
          product: row.product,
          exchangeName: row.exchangeName,
          monthYear: row.monthYear,
          type: row.type,
          callPut: row.callPut,
          strikePrice: row.strikePrice,
        });
        return {
          sourceRow: row,
          result,
        };
      }),
    [payload]
  );
  const exceptionGroups = useMemo(
    () => buildRuleExceptionGroups(previewRows),
    [previewRows]
  );
  const sqlDownloads = useMemo(() => buildNavPositionSqlDownloads(sqlParams), [sqlParams]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && !payload && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading position rows...
        </div>
      )}

      <SqlDownloadsPanel downloads={sqlDownloads} />

      <DataTableShell
        title="Exceptions"
        subtitle="Only rows that need product-rule work are shown. Valid rows are hidden."
      >
        <RuleExceptionsTable groups={exceptionGroups} />
      </DataTableShell>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-800 bg-gray-950/50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-gray-100">{value}</p>
    </div>
  );
}

function ProductDetailModal({
  group,
  payload,
  loading,
  error,
  onClose,
}: {
  group: ProductSummaryRow;
  payload: NavPositionsPayload | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const rowCount = payload?.summary.rowCount ?? group.rowCount;
  const shownRows = payload?.rawRows.length ?? 0;
  const pnlTone =
    group.unrealizedPnlBase === null
      ? "text-gray-100"
      : group.unrealizedPnlBase >= 0
        ? "text-emerald-200"
        : "text-red-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="NAV position source rows"
        className="flex max-h-[88vh] w-full max-w-[1500px] flex-col rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl shadow-black/60"
      >
        <div className="border-b border-gray-800 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Source Rows
              </p>
              <h2 className="mt-1 truncate text-lg font-semibold text-gray-100">
                {displayText(group.productCode)}
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-gray-400">
                <span className="rounded-sm bg-gray-900 px-2 py-1">
                  {displayText(group.productGroup)}
                </span>
                <span className="rounded-sm bg-gray-900 px-2 py-1">
                  {displayText(group.productRegion)}
                </span>
                <span className="rounded-sm bg-gray-900 px-2 py-1">
                  {displayText(group.contractYyyymm)}
                  {group.contractDay !== null ? `-${String(group.contractDay).padStart(2, "0")}` : ""}
                </span>
                {(group.putCall || group.strikePrice !== null) && (
                  <span className="rounded-sm bg-gray-900 px-2 py-1">
                    {displayText(group.putCall)} {fmtPrice(group.strikePrice)}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-fit rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:bg-gray-800"
            >
              Close
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <DetailStat label="Rows" value={`${shownRows || "-"} / ${rowCount.toLocaleString()}`} />
            <DetailStat label="Accounts" value={group.accountCount.toLocaleString()} />
            <DetailStat label="Net Qty" value={fmtQuantity(group.netQuantity)} />
            <DetailStat label="Cost Base" value={fmtNumber(group.costBase, 0)} />
            <DetailStat label="MV Base" value={fmtNumber(group.marketValueBase, 0)} />
            <div className="rounded-md border border-gray-800 bg-gray-950/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                P&L Base
              </p>
              <p className={`mt-1 text-sm font-semibold tabular-nums ${pnlTone}`}>
                {fmtNumber(group.unrealizedPnlBase, 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {error && (
            <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {loading && (
            <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-6 text-sm text-gray-500">
              Loading source rows...
            </div>
          )}
          {payload && !loading && (
            <>
              {payload.summary.rowCount > payload.rawRows.length && (
                <div className="mb-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-100">
                  Showing {payload.rawRows.length.toLocaleString()} of{" "}
                  {payload.summary.rowCount.toLocaleString()} matching rows.
                </div>
              )}
              <div className="overflow-x-auto rounded-md border border-gray-800">
                <RawRowsTable rows={payload.rawRows} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
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
  const [fund, setFund] = useState("all");
  const [accountGroup, setAccountGroup] = useState("all");
  const [productSearch, setProductSearch] = useState("");
  const [rawLimit, setRawLimit] = useState(200);
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [data, setData] = useState<NavPositionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailGroup, setDetailGroup] = useState<ProductSummaryRow | null>(null);
  const [detailData, setDetailData] = useState<NavPositionsPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
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
      fund,
      accountGroup,
      productSearch,
      rawLimit,
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
  }, [accountGroup, fund, onFreshnessChange, productSearch, rawLimit, refreshToken, selectedDate]);

  useEffect(() => {
    setDetailGroup(null);
    setDetailData(null);
    setDetailError(null);
  }, [
    accountGroup,
    fund,
    productSearch,
    quickProductCodes,
    quickProductGroups,
    quickProductRegions,
    selectedDate,
  ]);

  useEffect(() => {
    if (!detailGroup) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailGroup(null);
        setDetailData(null);
        setDetailError(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailGroup]);

  useEffect(() => {
    if (!detailGroup) return;

    const controller = new AbortController();
    let active = true;
    const detailRawLimit = Math.min(Math.max(detailGroup.rowCount, 25), 500);
    const group = groupFilterFromRow(detailGroup);

    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);

    fetchJsonWithCache<NavPositionsPayload>({
      key: groupCacheKey(selectedDate, detailGroup),
      url: buildApiUrl({
        selectedDate,
        fund: "all",
        accountGroup: "all",
        productSearch: "",
        rawLimit: detailRawLimit,
        refresh: refreshToken > 0,
        group,
      }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!active) return;
        setDetailData(payload);
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setDetailError(err.message || "Failed to load source rows");
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [detailGroup, refreshToken, selectedDate]);

  const fundOptions = useMemo(() => {
    const values = new Set(data?.metadata.funds ?? []);
    if (fund !== "all") values.add(fund);
    return Array.from(values).sort();
  }, [data, fund]);

  const accountGroupOptions = useMemo(() => {
    const values = new Set(data?.metadata.accountGroups ?? []);
    if (accountGroup !== "all") values.add(accountGroup);
    return Array.from(values).sort();
  }, [accountGroup, data]);

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

  const quickFilteredRawRows = useMemo(
    () =>
      (data?.rawRows ?? []).filter(
        (row) =>
          selectedTextMatches(row.productGroup, quickProductGroups) &&
          selectedTextMatches(row.productRegion, quickProductRegions) &&
          selectedTextMatches(row.productCode, quickProductCodes),
      ),
    [data, quickProductCodes, quickProductGroups, quickProductRegions],
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

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="grid gap-3 xl:grid-cols-[180px_150px_minmax(180px,260px)_minmax(220px,1fr)_130px] xl:items-end">
          <label className="block min-w-0">
            <span className={FIELD_LABEL_CLASS}>Position Date</span>
            <select
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              disabled={!data?.availableDates.length && loading}
              className={FIELD_CONTROL_CLASS}
            >
              <option value="">Latest</option>
              {(data?.availableDates ?? []).map((date) => (
                <option key={date.navDate} value={date.navDate}>
                  {date.navDate}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className={FIELD_LABEL_CLASS}>Fund</span>
            <select
              value={fund}
              onChange={(event) => setFund(event.target.value)}
              className={FIELD_CONTROL_CLASS}
            >
              <option value="all">All</option>
              {fundOptions.map((item) => (
                <option key={item} value={item}>
                  {item.toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className={FIELD_LABEL_CLASS}>Account Group</span>
            <select
              value={accountGroup}
              onChange={(event) => setAccountGroup(event.target.value)}
              className={FIELD_CONTROL_CLASS}
            >
              <option value="all">All</option>
              {accountGroupOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className={FIELD_LABEL_CLASS}>Product / Symbol / Account</span>
            <input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Search"
              className={FIELD_CONTROL_CLASS}
            />
          </label>

          <label className="block min-w-0">
            <span className={FIELD_LABEL_CLASS}>Raw Rows</span>
            <select
              value={rawLimit}
              onChange={(event) => setRawLimit(Number(event.target.value))}
              className={FIELD_CONTROL_CLASS}
            >
              {[100, 200, 300, 500].map((limit) => (
                <option key={limit} value={limit}>
                  {limit}
                </option>
              ))}
            </select>
          </label>
        </div>

        {data && (
          <div className="mt-4 border-t border-gray-800 pt-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
                <div className="min-w-0">
                  <span className={FIELD_LABEL_CLASS}>Group</span>
                  <div className="flex flex-wrap gap-1.5">
                    <QuickFilterChip
                      active={quickProductGroups.length === 0}
                      onClick={() => setQuickProductGroups([])}
                    >
                      All
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
                  </div>
                </div>

                <MultiSelect
                  label="Region"
                  options={productRegionOptions}
                  selected={quickProductRegions}
                  onChange={setQuickProductRegions}
                  placeholder="All regions"
                  width="w-56"
                />
                <MultiSelect
                  label="Code"
                  options={productCodeOptions}
                  selected={quickProductCodes}
                  onChange={setQuickProductCodes}
                  placeholder="All codes"
                  width="w-64"
                />
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">
                  {quickFilteredProductSummary.length.toLocaleString()} /{" "}
                  {data.productSummary.length.toLocaleString()} groups |{" "}
                  {quickFilteredRawRows.length.toLocaleString()} /{" "}
                  {data.rawRows.length.toLocaleString()} loaded raw
                </span>
                {activeQuickFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearQuickFilters}
                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-600 hover:text-gray-100"
                  >
                    Clear Quick Filters ({activeQuickFilterCount})
                  </button>
                )}
              </div>
            </div>
            {activeQuickFilterCount > 0 && (
              <p className="mt-2 text-xs text-gray-600">
                Quick filters apply to Summary and Raw only. SQL downloads still use the server
                filters above.
              </p>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusBadge
              label={`${data?.summary.rowCount.toLocaleString() ?? 0} rows`}
              tone={data?.summary.rowCount ? "good" : "warn"}
            />
            <StatusBadge
              label={`${data?.summary.productGroupCount.toLocaleString() ?? 0} products`}
              tone={data?.summary.productGroupCount ? "good" : "warn"}
            />
            <StatusBadge label={`As of ${fmtDateTime(data?.latestUploadAt ?? data?.asOf)}`} tone="neutral" />
          </div>

          <div className="inline-flex w-fit rounded-md border border-gray-800 bg-gray-950 p-1">
            <SegmentedButton active={viewMode === "summary"} onClick={() => setViewMode("summary")}>
              Summary
            </SegmentedButton>
            <SegmentedButton active={viewMode === "raw"} onClick={() => setViewMode("raw")}>
              Raw
            </SegmentedButton>
            <SegmentedButton active={viewMode === "rules"} onClick={() => setViewMode("rules")}>
              Rules
            </SegmentedButton>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && viewMode !== "rules" && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading positions...
        </div>
      )}

      {viewMode === "rules" && (
        <RulesView
          payload={data}
          loading={loading}
          error={error}
          sqlParams={{
            selectedDate,
            fund,
            accountGroup,
            productSearch,
          }}
        />
      )}

      {data && !loading && viewMode !== "rules" && (
        <>
          {viewMode === "summary" && (
            <DataTableShell
              title="Product Summary"
              subtitle={`${quickFilteredProductSummary.length.toLocaleString()} of ${data.productSummary.length.toLocaleString()} groups shown. Grouped by ${data.metadata.aggregationGrain.join(", ")}.`}
            >
              <ProductSummaryTable rows={quickFilteredProductSummary} onRowSelect={setDetailGroup} />
            </DataTableShell>
          )}

          {viewMode === "raw" && (
            <DataTableShell
              title="Raw Position Rows"
              subtitle={`${quickFilteredRawRows.length.toLocaleString()} of ${data.rawRows.length.toLocaleString()} loaded rows shown. ${data.rawRows.length.toLocaleString()} of ${data.summary.rowCount.toLocaleString()} selected rows loaded.`}
            >
              <RawRowsTable rows={quickFilteredRawRows} />
            </DataTableShell>
          )}

          <DataTableShell title="Available Position Dates" subtitle="Latest 90 dates in nav.positions.">
            <table className="w-full min-w-[680px] border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr>
                  {["Position Date", "Funds", "Rows", "Latest Upload"].map((label) => (
                    <th
                      key={label}
                      className="px-3 py-2 text-right font-semibold uppercase tracking-wide first:text-left"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.availableDates.slice(0, 12).map((row) => (
                  <tr key={row.navDate} className="hover:bg-gray-900/60">
                    <td className="px-3 py-2 text-left font-semibold text-gray-100">{row.navDate}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.fundCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.rowCount.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-400">
                      {fmtDateTime(row.latestUploadAt)}
                    </td>
                  </tr>
                ))}
                {!data.availableDates.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-500">
                      No NAV dates are available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </DataTableShell>
        </>
      )}

      {detailGroup && (
        <ProductDetailModal
          group={detailGroup}
          payload={detailData}
          loading={detailLoading}
          error={detailError}
          onClose={() => {
            setDetailGroup(null);
            setDetailData(null);
            setDetailError(null);
          }}
        />
      )}
    </div>
  );
}
