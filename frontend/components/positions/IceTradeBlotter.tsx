"use client";

import type React from "react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ColumnVisibilityPopover from "@/components/dashboard/ColumnVisibilityPopover";
import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import {
  formatIceTradeProductDisplay,
  iceTradeProductDisplaySortKey,
} from "@/lib/iceTradeProductDisplay";
import {
  DEFAULT_ICE_TRADE_PRODUCT_SCOPE,
  type IceTradeProductScope,
} from "@/lib/iceTradeBlotterRules";

const IceTradeBlotterProductsView = dynamic(
  () => import("./IceTradeBlotterProductsView"),
  {
    loading: () => (
      <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
        Loading rules and products...
      </div>
    ),
  }
);

interface IceTradeBlotterRow {
  trade_date: string;
  trade_time: string;
  report_date: string;
  deal_id: string;
  leg_id: string;
  orig_id: string;
  link_id: string;
  b_s: string;
  product: string;
  hub: string;
  contract: string;
  begin_date: string;
  end_date: string;
  clearing_acct: string;
  cust_acct: string;
  clearing_firm: string;
  price: number;
  price_units: string;
  option: string;
  strike: number;
  strike_2: number;
  style: string;
  lots: number;
  total_quantity: number;
  qty_units: string;
  tt: string;
  brk: string;
  trader: string;
  memo: string;
  clearing_venue: string;
  user_id: string;
  source: string;
  usi: string;
  authorized_trader_id: string;
  location: string;
  meter: string;
  lead_time: string;
  waiver_ind: string;
  trade_time_micros: string;
  cdi_override: string;
  by_pass_mqr: string;
  broker_name: string;
  trading_company: string;
  mic: string;
  cc: string;
  strip: string;
  counterparty: string;
  qty_per_period: number;
  periods: number;
  counterparty_user: string;
  deal_section: string;
  file_hash: string;
  source_row_number: number;
  source_row_hash: string;
  created_at: string | null;
  updated_at: string | null;
  ice_symbol?: string | null;
  asset_class?: string | null;
  region?: string | null;
  product_group?: string | null;
  settlement_source?: string | null;
  settlement_contract_family?: string | null;
  settlement_source_key?: string | null;
  settlement_match_status?: string | null;
  active_mark_source?: string | null;
  source_settlement_mark?: number | string | null;
  ice_mark?: number | string | null;
  ice_open?: number | string | null;
  ice_high?: number | string | null;
  ice_low?: number | string | null;
  ice_close?: number | string | null;
  ice_vwap_close?: number | string | null;
  ice_volume?: number | string | null;
  settlement_mark?: number | string | null;
  settlement_pnl?: number | string | null;
  expected_settlement_days?: number | string | null;
  matched_settlement_days?: number | string | null;
}

interface IceTradeBlotterPayload {
  startDate: string;
  endDate: string;
  asOf?: string;
  scope?: IceTradeProductScope;
  trader: string | null;
  product: string | null;
  hub: string | null;
  contract: string | null;
  rowCount: number;
  summary: {
    rowCount: number;
    distinctDealCount: number;
    productCount: number;
    hubCount: number;
    contractCount: number;
    totalLots: number | null;
    totalQuantity: number | null;
    latestTradeDate: string | null;
    latestReportDate: string | null;
    latestUpdatedAt: string | null;
    markedRowCount?: number;
    totalSettlementPnl?: number | null;
  };
  filters: {
    traders: string[];
    products: string[];
    hubs: string[];
    contracts: string[];
  };
  rows: IceTradeBlotterRow[];
}

type DailySettlementDateCheckStatus = "ok" | "diff" | "missing" | "rule";

interface DailySettlementComponent {
  date: string | null;
  settlement: number | string | null;
  hours_present: number | string | null;
  expected_hours: number | string | null;
  source_tier: string | null;
  updated_at: string | null;
}

interface DailySettlementRow {
  date: string;
  symbol: string;
  cc: string;
  blotter_cc: string;
  asset_class: string;
  region: string;
  product_group: string;
  market: string;
  hub: string;
  ice_trading_screen_hub_name: string | null;
  ice_contract_size: string | null;
  contract: string;
  settlement_source: string;
  lmp_source_tier: string | null;
  contract_family: string;
  hour_bucket: string | null;
  begin_date: string | null;
  end_date: string | null;
  rule_begin_date: string | null;
  rule_end_date: string | null;
  ice_begin_date: string | null;
  ice_end_date: string | null;
  date_check_status: DailySettlementDateCheckStatus;
  date_check_detail: string | null;
  settlement: number | string | null;
  ice_settlement: number | string | null;
  open: number | string | null;
  high: number | string | null;
  low: number | string | null;
  close: number | string | null;
  vwap_close: number | string | null;
  volume: number | string | null;
  created_at: string | null;
  updated_at: string | null;
  contract_snapshot_trade_date: string | null;
  contract_dates_updated_at: string | null;
  expected_settlement_days: number | string | null;
  matched_settlement_days: number | string | null;
  settlement_components: DailySettlementComponent[] | null;
  metadata_status: string;
}

interface DailySettlementsPayload {
  startDate: string;
  endDate: string;
  scope?: IceTradeProductScope;
  rowCount: number;
  summary: {
    rowCount: number;
    latestDate: string | null;
    latestUpdatedAt: string | null;
  };
  rows: DailySettlementRow[];
}

interface ProductDictionaryRow {
  cc: string;
  blotter_cc: string;
  asset_class: string;
  region: string;
  product_group: string;
  ice_symbol_pattern: string;
  product_name: string;
  market: string;
  hub: string;
  blotter_hub_aliases: string;
  pjm_pnode_name: string;
  contract_family: string;
  contract_code: string;
  contract_label: string;
  hour_bucket: string;
  shape: string;
  ice_product_type: string;
  settlement_source: string;
  settlement_source_key: string;
  settlement_priority: number | string;
  active: boolean;
  ice_product_id: string | null;
  ice_product_url: string | null;
  ice_product_title: string | null;
  ice_contract_symbol: string | null;
  ice_contract_size: string | null;
  ice_trading_screen_product_name: string | null;
  ice_trading_screen_hub_name: string | null;
  ice_reference_price: string | null;
  ice_specified_price: string | null;
  ice_metadata_status: string;
  notes: string;
}

interface ProductDictionaryPayload {
  scope?: IceTradeProductScope;
  rowCount: number;
  summary: {
    rowCount: number;
    activeRowCount: number;
    pjmRowCount: number;
    iceRowCount: number;
    optionRowCount: number;
    assetClassCounts: Record<string, number>;
    regionCounts: Record<string, number>;
    groupCounts: Record<string, number>;
  };
  rows: ProductDictionaryRow[];
}

interface PositionLegRow {
  trade_date: string;
  trade_time: string;
  deal_id: string;
  leg_id: string;
  b_s: string;
  product: string;
  hub: string;
  contract: string;
  begin_date: string;
  end_date: string;
  option: string;
  style: string;
  strike: number | null;
  strike_2: number | null;
  lots: number;
  total_quantity: number;
  price: number;
  trader: string;
  clearing_acct: string;
  cust_acct: string;
  brk: string;
}

interface PositionRow {
  position_key: string;
  as_of: string;
  trader: string;
  clearing_acct: string;
  cust_acct: string;
  clearing_firm: string;
  product: string;
  hub: string;
  cc: string;
  asset_class?: string | null;
  region?: string | null;
  contract: string;
  begin_date: string;
  end_date: string;
  option: string;
  style: string;
  strike: number | null;
  strike_2: number | null;
  qty_units: string;
  price_units: string;
  net_side: string;
  net_lots: number;
  net_quantity: number;
  avg_price: number | null;
  settlement_mark: number | null;
  mark_trade_date: string | null;
  prior_settlement_mark: number | null;
  prior_mark_trade_date: string | null;
  ice_symbol: string | null;
  settlement_contract_strip: string | null;
  settlement_contract_start_date: string | null;
  settlement_contract_end_date: string | null;
  option_symbol: string | null;
  underlying_symbol: string | null;
  option_delta: number | null;
  option_expiration_date: string | null;
  option_last_settlement_date: string | null;
  option_expiry_source: string | null;
  option_greek_quote_date: string | null;
  option_greek_status: string | null;
  option_greek_reason: string | null;
  delta_equivalent_lots: number | null;
  delta_equivalent_quantity: number | null;
  settlement_source: string | null;
  settlement_source_key: string | null;
  settlement_contract_family: string | null;
  days_to_expiry: number | null;
  delivery_status: string;
  settlement_status: string;
  daily_pnl: number | null;
  open_pnl: number | null;
  contributing_trade_count: number;
  latest_trade_date: string | null;
  latest_trade_time: string | null;
  latest_updated_at: string | null;
  legs?: PositionLegRow[];
}

interface PositionsPayload {
  asOf: string;
  scope?: IceTradeProductScope;
  rowCount: number;
  summary: {
    rowCount: number;
    totalNetLots: number | null;
    totalNetQuantity: number | null;
    markedRowCount: number;
    dailyMarkedRowCount: number;
    totalDailyPnl: number | null;
    totalOpenPnl: number | null;
    latestTradeDate: string | null;
    latestUpdatedAt: string | null;
  };
  rows: PositionRow[];
}

interface PositionLegsPayload {
  asOf: string;
  scope?: IceTradeProductScope;
  positionKey: string;
  rows: PositionLegRow[];
}

interface PnlSummaryUnmarkedPosition {
  trader: string;
  hub: string;
  cc: string;
  contract: string;
  option: string;
  net_lots: number | null;
  net_quantity: number | null;
  settlement_status: string;
}

interface PnlSummaryRow {
  date: string;
  traderValues: Record<string, number | null>;
  total: number | null;
  markedCount: number;
  totalCount: number;
  unmarkedPositions: PnlSummaryUnmarkedPosition[];
}

interface PnlSummaryPayload {
  startDate: string;
  endDate: string;
  traders: string[];
  rowCount: number;
  summary: {
    rowCount: number;
    totalPnl: number | null;
    latestDate: string | null;
    markedCount: number;
    totalCount: number;
  };
  rows: PnlSummaryRow[];
}

interface PositionTenorColumn {
  key: string;
  label: string;
  dateLabel?: string;
  startDate: string;
  kind: "day" | "week" | "month";
}

interface PositionTenorPivotRow {
  key: string;
  product: string;
  hub: string;
  cc: string;
  market: string;
  shape: string;
  instrument: string;
  option: string;
  style: string;
  strike: number | null;
  strike_2: number | null;
  net_lots: number;
  daily_pnl: number | null;
  open_pnl: number | null;
  delta_equivalent_lots: number | null;
  delta_equivalent_quantity: number | null;
  source_position_count: number;
  source_leg_count: number;
  source_contracts: string;
  source_positions: PositionRow[];
  tenor_lots: Record<string, number>;
  tenor_daily_pnl: Record<string, number>;
  tenor_open_pnl: Record<string, number>;
  tenor_delta_equivalent_lots: Record<string, number>;
  tenor_delta_equivalent_quantity: Record<string, number>;
}

export interface IceTradeBlotterFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
  rowCountLabel: string;
}

const API_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_FRESHNESS: IceTradeBlotterFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Trade blotter --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
  rowCountLabel: "--",
};
const EMPTY_ROWS: IceTradeBlotterRow[] = [];
const EMPTY_DAILY_SETTLEMENT_ROWS: DailySettlementRow[] = [];
const EMPTY_PRODUCT_DICTIONARY_ROWS: ProductDictionaryRow[] = [];
const EMPTY_POSITION_ROWS: PositionRow[] = [];
const EMPTY_POSITION_LEG_ROWS: PositionLegRow[] = [];
const EMPTY_PNL_SUMMARY_ROWS: PnlSummaryRow[] = [];

function fmtDate(value: string | null | undefined): string {
  if (!value) return "--";
  const parsedDate = parseIceDate(value);
  if (!parsedDate) return value;

  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  return `${month}/${day}/${parsedDate.getFullYear()}`;
}

function fmtIsoDate(value: string | null | undefined): string {
  if (!value) return "--";
  const parsedDate = parseIceDate(value);
  if (!parsedDate) return value;

  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  return `${parsedDate.getFullYear()}-${month}-${day}`;
}

function fmtContractDate(value: string | null | undefined): string {
  if (!value) return "--";
  const parsedDate = parseIceDate(value);
  if (!parsedDate) return value;

  return parsedDate
    .toLocaleDateString("en-US", { month: "short", year: "2-digit" })
    .replace(" ", "-");
}

function normalizeYear(value: string): number | null {
  const year = Number(value);
  if (!Number.isInteger(year)) return null;
  if (value.length === 2) return year >= 70 ? 1900 + year : 2000 + year;
  return year;
}

function dateFromParts(yearValue: string, monthValue: string, dayValue: string): Date | null {
  const year = normalizeYear(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseIceDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (isoMatch) return dateFromParts(isoMatch[1], isoMatch[2], isoMatch[3]);

  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(text);
  if (slashMatch) return dateFromParts(slashMatch[3], slashMatch[1], slashMatch[2]);

  const numericDashMatch = /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/.exec(text);
  if (numericDashMatch) {
    return dateFromParts(numericDashMatch[3], numericDashMatch[1], numericDashMatch[2]);
  }

  const dayMonthYearMatch = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})(?:,)?[\s-]+(\d{2,4})$/.exec(text);
  if (dayMonthYearMatch) {
    const month = MONTH_INDEX[dayMonthYearMatch[2].toLowerCase()];
    return month === undefined
      ? null
      : dateFromParts(dayMonthYearMatch[3], String(month + 1), dayMonthYearMatch[1]);
  }

  const monthDayYearMatch = /^([A-Za-z]{3,9})[\s-]+(\d{1,2})(?:,)?[\s-]+(\d{2,4})$/.exec(text);
  if (monthDayYearMatch) {
    const month = MONTH_INDEX[monthDayYearMatch[1].toLowerCase()];
    return month === undefined
      ? null
      : dateFromParts(monthDayYearMatch[3], String(month + 1), monthDayYearMatch[2]);
  }

  const monthYearMatch = /^([A-Za-z]{3,9})[\s-]?(\d{2,4})$/.exec(text);
  if (monthYearMatch) {
    const month = MONTH_INDEX[monthYearMatch[1].toLowerCase()];
    return month === undefined
      ? null
      : dateFromParts(monthYearMatch[2], String(month + 1), "1");
  }

  return null;
}

function fmtTimestamp(value: string | null | undefined): string {
  if (!value) return "--";
  return value.slice(0, 16);
}

function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function fmtPrice(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function fmtOptionalPrice(value: number | null): string {
  return value === null ? "--" : fmtPrice(value);
}

function fmtPnl(value: number | null): string {
  if (value === null) return "--";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function fmtText(value: string | null | undefined): string {
  return value || "--";
}

function fmtTradePlaced(row: IceTradeBlotterRow): string {
  const date = fmtIsoDate(row.trade_date);
  const time = fmtText(row.trade_time);
  if (date === "--") return time;
  if (time === "--") return date;
  return `${date} ${time}`;
}

function fmtPositionLegPlaced(row: PositionLegRow): string {
  const date = fmtIsoDate(row.trade_date);
  const time = fmtText(row.trade_time);
  if (date === "--") return time;
  if (time === "--") return date;
  return `${date} ${time}`;
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedSide(value: string | null | undefined): "buy" | "sell" | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "b" || normalized === "buy" || normalized === "bought") return "buy";
  if (normalized === "s" || normalized === "sell" || normalized === "sold") return "sell";
  return null;
}

function sideLabel(value: string): string {
  const side = normalizedSide(value);
  if (side === "buy") return "Bought";
  if (side === "sell") return "Sold";
  return value || "--";
}

function isOptionRow(row: IceTradeBlotterRow): boolean {
  const value = row.option.trim().toLowerCase();
  return value !== "" && !["0", "false", "n", "no"].includes(value);
}

function optionStrike(row: IceTradeBlotterRow, key: "strike" | "strike_2"): number | null {
  return isOptionRow(row) ? row[key] : null;
}

function signedQuantity(row: IceTradeBlotterRow): number {
  return normalizedSide(row.b_s) === "sell"
    ? -Math.abs(row.total_quantity)
    : Math.abs(row.total_quantity);
}

function tradeRowKey(row: IceTradeBlotterRow): string {
  return `${row.file_hash}-${row.source_row_number}-${row.deal_id}-${row.leg_id}`;
}

function cellSelectionKey(rowKey: string, columnKey: ColumnKey): string {
  return `${rowKey}::${columnKey}`;
}

function cellSelectionKeyFromCoordinate(coordinate: CellCoordinate): string {
  return cellSelectionKey(coordinate.rowKey, coordinate.columnKey);
}

function cellSelectionKeysInRange(
  anchor: CellCoordinate,
  focus: CellCoordinate,
  rows: IceTradeBlotterRow[],
  columns: ColumnDefinition[]
): Set<string> {
  const minRow = Math.min(anchor.rowIndex, focus.rowIndex);
  const maxRow = Math.max(anchor.rowIndex, focus.rowIndex);
  const minColumn = Math.min(anchor.columnIndex, focus.columnIndex);
  const maxColumn = Math.max(anchor.columnIndex, focus.columnIndex);
  const selected = new Set<string>();

  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) continue;
    const rowKey = tradeRowKey(row);
    for (let columnIndex = minColumn; columnIndex <= maxColumn; columnIndex += 1) {
      const column = columns[columnIndex];
      if (!column) continue;
      selected.add(cellSelectionKey(rowKey, column.key));
    }
  }

  return selected;
}

function groupRowKey(row: IceTradeBlotterRow): string {
  const strike = optionStrike(row, "strike");
  return [
    fmtIsoDate(row.trade_date),
    row.trader,
    row.product,
    row.cc,
    row.hub,
    fmtContractDate(row.contract),
    fmtIsoDate(row.begin_date),
    fmtIsoDate(row.end_date),
    row.option,
    row.style,
    strike === null ? "" : String(strike),
    row.qty_units,
    row.price_units,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .join("|");
}

function uniqueText(values: Array<string | number | null | undefined>): string {
  const uniqueValues = Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0)
    )
  );
  if (uniqueValues.length === 0) return "";
  if (uniqueValues.length <= 2) return uniqueValues.join(", ");
  return `${uniqueValues[0]}, ${uniqueValues[1]} +${uniqueValues.length - 2}`;
}

function latestText(values: Array<string | null | undefined>): string | null {
  const sortedValues = values
    .filter((value): value is string => Boolean(value))
    .sort((first, second) => second.localeCompare(first));
  return sortedValues[0] ?? null;
}

function sumNumbers(rows: IceTradeBlotterRow[], key: keyof IceTradeBlotterRow): number {
  return rows.reduce((sum, row) => {
    const value = row[key];
    return typeof value === "number" && Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function averageOptionalNumbers(values: Array<number | null>): number | null {
  const finiteValues = values.filter((value): value is number => value !== null);
  if (finiteValues.length === 0) return null;
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function signedLots(row: IceTradeBlotterRow): number {
  return normalizedSide(row.b_s) === "sell" ? -Math.abs(row.lots) : Math.abs(row.lots);
}

function netSignedQuantity(rows: IceTradeBlotterRow[]): number {
  return rows.reduce((sum, row) => sum + signedQuantity(row), 0);
}

function netSide(rows: IceTradeBlotterRow[]): string {
  const netQuantity = netSignedQuantity(rows);
  if (netQuantity > 0) return "B";
  if (netQuantity < 0) return "S";
  return "Flat";
}

function netWeightedAveragePrice(rows: IceTradeBlotterRow[]): number {
  const netQuantity = netSignedQuantity(rows);
  if (netQuantity !== 0) {
    const signedPriceQuantity = rows.reduce(
      (sum, row) => sum + signedQuantity(row) * row.price,
      0
    );
    return signedPriceQuantity / netQuantity;
  }

  const weighted = rows.reduce(
    (totals, row) => {
      const weight = Math.abs(row.total_quantity);
      if (!Number.isFinite(row.price) || weight === 0) return totals;
      return {
        priceQuantity: totals.priceQuantity + row.price * weight,
        quantity: totals.quantity + weight,
      };
    },
    { priceQuantity: 0, quantity: 0 }
  );
  return weighted.quantity === 0 ? rows[0]?.price ?? 0 : weighted.priceQuantity / weighted.quantity;
}

interface GroupedTradeRows {
  rows: IceTradeBlotterRow[];
  legsByGroupKey: Map<string, IceTradeBlotterRow[]>;
}

function groupTradeRows(rows: IceTradeBlotterRow[]): GroupedTradeRows {
  const groups = new Map<string, IceTradeBlotterRow[]>();
  rows.forEach((row) => {
    const key = groupRowKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  const legsByGroupKey = new Map<string, IceTradeBlotterRow[]>();
  const groupedRows = Array.from(groups.entries()).map(([key, groupRows]) => {
    const firstRow = groupRows[0];
    const groupKey = `group:${key}`;
    legsByGroupKey.set(groupKey, groupRows);
    const netQuantity = netSignedQuantity(groupRows);
    const netLots = groupRows.reduce((sum, row) => sum + signedLots(row), 0);
    const settlementMarks = groupRows
      .map((row) => toFiniteNumber(row.settlement_mark))
      .filter((value): value is number => value !== null);
    const settlementPnl = groupRows.reduce((sum, row) => {
      const value = toFiniteNumber(row.settlement_pnl);
      return value === null ? sum : sum + value;
    }, 0);
    return {
      ...firstRow,
      deal_id: uniqueText(groupRows.map((row) => row.deal_id)),
      leg_id: uniqueText(groupRows.map((row) => row.leg_id)),
      orig_id: uniqueText(groupRows.map((row) => row.orig_id)),
      link_id: uniqueText(groupRows.map((row) => row.link_id)),
      brk: uniqueText(groupRows.map((row) => row.brk)),
      clearing_acct: uniqueText(groupRows.map((row) => row.clearing_acct)),
      cust_acct: uniqueText(groupRows.map((row) => row.cust_acct)),
      clearing_firm: uniqueText(groupRows.map((row) => row.clearing_firm)),
      tt: uniqueText(groupRows.map((row) => row.tt)),
      memo: uniqueText(groupRows.map((row) => row.memo)),
      counterparty: uniqueText(groupRows.map((row) => row.counterparty)),
      b_s: netSide(groupRows),
      lots: Math.abs(netLots),
      total_quantity: Math.abs(netQuantity),
      qty_per_period: sumNumbers(groupRows, "qty_per_period"),
      periods: Math.max(...groupRows.map((row) => row.periods)),
      price: netWeightedAveragePrice(groupRows),
      file_hash: groupKey,
      source_row_number: groupRows.length,
      source_row_hash: groupKey,
      created_at: latestText(groupRows.map((row) => row.created_at)),
      updated_at: latestText(groupRows.map((row) => row.updated_at)),
      ice_symbol: uniqueText(groupRows.map((row) => row.ice_symbol)),
      settlement_source: uniqueText(groupRows.map((row) => row.settlement_source)),
      settlement_contract_family: uniqueText(
        groupRows.map((row) => row.settlement_contract_family)
      ),
      settlement_source_key: uniqueText(
        groupRows.map((row) => row.settlement_source_key)
      ),
      active_mark_source: uniqueText(groupRows.map((row) => row.active_mark_source)),
      source_settlement_mark: averageOptionalNumbers(
        groupRows.map((row) => toFiniteNumber(row.source_settlement_mark))
      ),
      ice_mark: averageOptionalNumbers(
        groupRows.map((row) => toFiniteNumber(row.ice_mark))
      ),
      ice_open: averageOptionalNumbers(
        groupRows.map((row) => toFiniteNumber(row.ice_open))
      ),
      ice_high: averageOptionalNumbers(
        groupRows.map((row) => toFiniteNumber(row.ice_high))
      ),
      ice_low: averageOptionalNumbers(
        groupRows.map((row) => toFiniteNumber(row.ice_low))
      ),
      ice_close: averageOptionalNumbers(
        groupRows.map((row) => toFiniteNumber(row.ice_close))
      ),
      ice_vwap_close: averageOptionalNumbers(
        groupRows.map((row) => toFiniteNumber(row.ice_vwap_close))
      ),
      ice_volume: groupRows.reduce((sum, row) => {
        const volume = toFiniteNumber(row.ice_volume);
        return volume === null ? sum : sum + volume;
      }, 0),
      settlement_match_status:
        uniqueText(groupRows.map((row) => row.settlement_match_status)) ||
        firstRow.settlement_match_status,
      settlement_mark:
        settlementMarks.length === 0
          ? null
          : settlementMarks.reduce((sum, value) => sum + value, 0) / settlementMarks.length,
      settlement_pnl: settlementMarks.length === 0 ? null : settlementPnl,
    };
  });

  return { rows: groupedRows, legsByGroupKey };
}

function groupedTradeRowKey(row: IceTradeBlotterRow): string {
  return row.source_row_hash.startsWith("group:") ? row.source_row_hash : tradeRowKey(row);
}

function parseMarkInput(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  return toFiniteNumber(value);
}

function markValue(row: IceTradeBlotterRow): number | null {
  return toFiniteNumber(row.settlement_mark);
}

function activeMarkValue(row: IceTradeBlotterRow, marks: MarkValues): number | null {
  return toFiniteNumber(row.settlement_mark) ?? parseMarkInput(marks[tradeRowKey(row)]);
}

function markSourceLabel(source: string | null | undefined): string {
  if (
    source === "PJM_DA_LMP" ||
    source === "PJM_RT_LMP" ||
    source === "ERCOT_DA_LMP" ||
    source === "ERCOT_RT_LMP"
  ) return "Settle";
  if (source === "ICE_MARK") return "ICE Mark";
  if (source === "ICE_OPTION_MARK") return "Option Mark";
  return fmtText(source);
}

function markSourceDetail(source: string | null | undefined): string {
  if (source === "PJM_DA_LMP") return "PJM DA";
  if (source === "PJM_RT_LMP") return "PJM RT";
  if (source === "ERCOT_DA_LMP") return "ERCOT DA";
  if (source === "ERCOT_RT_LMP") return "ERCOT RT";
  if (source === "ICE_MARK") return "ICE mark";
  if (source === "ICE_OPTION_MARK") return "ICE option mark";
  return fmtText(source);
}

function markSourceTone(source: string | null | undefined): SourceNoteTone {
  if (
    source === "PJM_DA_LMP" ||
    source === "PJM_RT_LMP" ||
    source === "ERCOT_DA_LMP" ||
    source === "ERCOT_RT_LMP"
  ) return "settled";
  if (source === "ICE_MARK" || source === "ICE_OPTION_MARK") return "pending";
  return "unknown";
}

function markSourceGlyph(source: string | null | undefined): string {
  if (
    source === "PJM_DA_LMP" ||
    source === "PJM_RT_LMP" ||
    source === "ERCOT_DA_LMP" ||
    source === "ERCOT_RT_LMP"
  ) return "S";
  if (source === "ICE_MARK") return "I";
  if (source === "ICE_OPTION_MARK") return "O";
  return "?";
}

function tradeMetadataTone(row: IceTradeBlotterRow): SourceNoteTone {
  const status = (row.settlement_match_status ?? "").toLowerCase();
  if (status.includes("partial")) return "partial";
  if (status.includes("no_") || status.includes("invalid")) return "overdue";
  return markSourceTone(row.active_mark_source);
}

function tradeBlotterSourceNote(row: IceTradeBlotterRow): SourceNoteLine[] {
  const expectedDays = toFiniteNumber(row.expected_settlement_days);
  const matchedDays = toFiniteNumber(row.matched_settlement_days);
  const daySummary =
    expectedDays === null && matchedDays === null
      ? "--"
      : `${fmtNumber(matchedDays, 0)} / ${fmtNumber(expectedDays, 0)}`;

  return [
    { label: "Active", value: markSourceDetail(row.active_mark_source) },
    { label: "Active Mark", value: fmtOptionalPrice(toFiniteNumber(row.settlement_mark)) },
    { label: "ICE Mark", value: fmtOptionalPrice(toFiniteNumber(row.ice_mark)) },
    { label: "ICE Open", value: fmtOptionalPrice(toFiniteNumber(row.ice_open)) },
    { label: "ICE High", value: fmtOptionalPrice(toFiniteNumber(row.ice_high)) },
    { label: "ICE Low", value: fmtOptionalPrice(toFiniteNumber(row.ice_low)) },
    { label: "ICE Close", value: fmtOptionalPrice(toFiniteNumber(row.ice_close)) },
    { label: "ICE VWAP", value: fmtOptionalPrice(toFiniteNumber(row.ice_vwap_close)) },
    { label: "ICE Volume", value: fmtNumber(toFiniteNumber(row.ice_volume), 0) },
    { label: "Source Settle", value: fmtOptionalPrice(toFiniteNumber(row.source_settlement_mark)) },
    { label: "Match", value: fmtText(row.settlement_match_status) },
    { label: "Days", value: daySummary },
    { label: "Settle Table", value: settleSourceNote(row.settlement_source ?? "") },
    { label: "ICE Symbol", value: fmtText(row.ice_symbol) },
    { label: "Delivery", value: `${fmtIsoDate(row.begin_date)} to ${fmtIsoDate(row.end_date)}` },
  ];
}

function pnlValue(row: IceTradeBlotterRow, marks: MarkValues): number | null {
  const settlementPnl = toFiniteNumber(row.settlement_pnl);
  if (settlementPnl !== null) return settlementPnl;
  const mark = activeMarkValue(row, marks);
  if (mark === null) return null;
  return signedQuantity(row) * (mark - row.price);
}

const FIXED_TRADE_TENOR_COLUMNS: TradeSummaryColumn[] = [
  { key: "bal-day", label: "Bal Day" },
  { key: "next-day", label: "Next Day" },
  { key: "bal-week", label: "Bal Week" },
  { key: "weekend", label: "Weekend" },
  { key: "next-week", label: "Next Week" },
  { key: "week-2", label: "2nd Week" },
  { key: "week-3", label: "3rd Week" },
  { key: "week-4", label: "4th Week" },
];

const FIXED_TRADE_TENOR_SORT_ORDER = Object.fromEntries(
  FIXED_TRADE_TENOR_COLUMNS.map((column, index) => [column.key, index + 1])
) as Record<string, number>;

const SHORT_TERM_TENOR_BY_CODE: Record<string, TradeSummaryColumn> = {
  D0: { key: "bal-day", label: "Bal Day" },
  D1: { key: "next-day", label: "Next Day" },
  W0: { key: "bal-week", label: "Bal Week" },
  P1: { key: "weekend", label: "Weekend" },
  W1: { key: "next-week", label: "Next Week" },
  W2: { key: "week-2", label: "2nd Week" },
  W3: { key: "week-3", label: "3rd Week" },
  W4: { key: "week-4", label: "4th Week" },
};

function monthSortKey(label: string): number {
  const parsed = parseIceDate(`01-${label}`);
  return parsed?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function fixedTenorFromValues(contractValue: string | null | undefined, symbolValue?: string | null): TradeSummaryColumn | null {
  const contract = String(contractValue ?? "").trim();
  const symbol = String(symbolValue ?? "").trim();
  const codeMatch = `${contract} ${symbol}`.match(/\b(D0|D1|W0|P1|W1|W2|W3|W4)\b/i);
  if (codeMatch) {
    return SHORT_TERM_TENOR_BY_CODE[codeMatch[1].toUpperCase()] ?? null;
  }

  const normalized = contract.toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]+/g, "");

  if (
    compact === "he0800he2300" ||
    compact === "he08002300" ||
    normalized === "bal day" ||
    normalized === "balance of day"
  ) {
    return { key: "bal-day", label: "Bal Day" };
  }
  if (normalized === "next day") return { key: "next-day", label: "Next Day" };
  if (normalized === "bal week" || normalized === "balance of week") {
    return { key: "bal-week", label: "Bal Week" };
  }
  if (normalized === "weekend" || normalized === "weekend 2 x 16" || compact === "weekend2x16") {
    return { key: "weekend", label: "Weekend" };
  }
  if (normalized === "next week" || normalized === "week 1") {
    return { key: "next-week", label: "Next Week" };
  }
  if (normalized === "2nd week" || normalized === "second week" || normalized === "week 2") {
    return { key: "week-2", label: "2nd Week" };
  }
  if (normalized === "3rd week" || normalized === "third week" || normalized === "week 3") {
    return { key: "week-3", label: "3rd Week" };
  }
  if (normalized === "4th week" || normalized === "fourth week" || normalized === "week 4") {
    return { key: "week-4", label: "4th Week" };
  }

  return null;
}

function tenorColumnFromValues(contractValue: string | null | undefined, symbolValue?: string | null): TradeSummaryColumn {
  const contract = String(contractValue ?? "").trim();
  const fixedTenor = fixedTenorFromValues(contractValue, symbolValue);
  if (fixedTenor) return fixedTenor;

  const monthMatch = contract.match(/^[A-Za-z]{3}\d{2}$/);
  if (monthMatch) {
    const label = fmtContractDate(contract);
    return { key: `month:${label}`, label };
  }

  return { key: `other:${fmtContractDate(contract)}`, label: fmtContractDate(contract) };
}

function tradeTenorColumn(row: IceTradeBlotterRow): TradeSummaryColumn {
  return tenorColumnFromValues(row.contract, row.ice_symbol);
}

function settlementTenorColumn(row: DailySettlementRow): TradeSummaryColumn {
  return tenorColumnFromValues(row.contract, row.symbol);
}

function tenorSortValue(column: TradeSummaryColumn): number {
  const fixedSort = FIXED_TRADE_TENOR_SORT_ORDER[column.key];
  if (fixedSort !== undefined) return fixedSort;
  if (column.key.startsWith("month:")) return 1_000 + monthSortKey(column.label);
  return Number.MAX_SAFE_INTEGER;
}

function tradeContractSortValue(row: IceTradeBlotterRow): number {
  return tenorSortValue(tradeTenorColumn(row));
}

function dailySettlementContractSortValue(row: DailySettlementRow): number {
  return tenorSortValue(settlementTenorColumn(row));
}

function buildTradeSummary(
  rows: IceTradeBlotterRow[],
  marks: MarkValues,
  legsByGroupKey: Map<string, IceTradeBlotterRow[]>
): { columns: TradeSummaryColumn[]; rows: TradeSummaryRow[] } {
  const productRows = new Map<string, TradeSummaryRow>();
  const dynamicColumns = new Map<string, TradeSummaryColumn>();

  rows.forEach((row) => {
    const sourceRows = row.source_row_hash.startsWith("group:")
      ? legsByGroupKey.get(groupedTradeRowKey(row)) ?? [row]
      : [row];

    sourceRows.forEach((sourceRow) => {
      const productDisplayInput = {
        cc: sourceRow.cc,
        hub: sourceRow.hub,
        contractLabel: sourceRow.contract,
      };
      const productDisplay = formatIceTradeProductDisplay(productDisplayInput);
      const productKey = [productDisplay, sourceRow.asset_class, sourceRow.region]
        .map((value) => String(value ?? "").trim().toLowerCase())
        .join("|");
      const column = tradeTenorColumn(sourceRow);
      if (!FIXED_TRADE_TENOR_COLUMNS.some((fixed) => fixed.key === column.key)) {
        dynamicColumns.set(column.key, column);
      }

      const productRow =
        productRows.get(productKey) ??
        {
          key: productKey,
          product: productDisplay,
          productSortKey: iceTradeProductDisplaySortKey(productDisplayInput),
          assetClass: fmtText(sourceRow.asset_class),
          region: fmtText(sourceRow.region),
          rowCount: 0,
          netLots: 0,
          netQuantity: 0,
          pnl: null,
          pnlCount: 0,
          markedCount: 0,
          markedQuantity: 0,
          weightedOutright: 0,
          outright: null,
          cells: {},
          trades: [],
        };
      const rowPnl = pnlValue(sourceRow, marks);
      const rowMark = activeMarkValue(sourceRow, marks);
      const markWeight = Math.abs(toFiniteNumber(sourceRow.total_quantity) ?? 0) || Math.abs(signedQuantity(sourceRow));

      productRow.rowCount += 1;
      productRow.netLots += signedLots(sourceRow);
      productRow.netQuantity += signedQuantity(sourceRow);
      productRow.pnl = rowPnl === null ? productRow.pnl : (productRow.pnl ?? 0) + rowPnl;
      productRow.pnlCount += rowPnl === null ? 0 : 1;
      productRow.markedCount += rowMark === null ? 0 : 1;
      if (rowMark !== null && markWeight > 0) {
        productRow.markedQuantity += markWeight;
        productRow.weightedOutright += rowMark * markWeight;
        productRow.outright = productRow.weightedOutright / productRow.markedQuantity;
      }
      productRow.trades.push(sourceRow);

      const existingCell = productRow.cells[column.key];
      if (existingCell) {
        existingCell.rowCount += 1;
        existingCell.netLots += signedLots(sourceRow);
        existingCell.netQuantity += signedQuantity(sourceRow);
        existingCell.pnl = rowPnl === null ? existingCell.pnl : (existingCell.pnl ?? 0) + rowPnl;
        existingCell.pnlCount += rowPnl === null ? 0 : 1;
        existingCell.markedCount += rowMark === null ? 0 : 1;
        if (rowMark !== null && markWeight > 0) {
          existingCell.markedQuantity += markWeight;
          existingCell.weightedOutright += rowMark * markWeight;
          existingCell.outright = existingCell.weightedOutright / existingCell.markedQuantity;
        }
        existingCell.trades.push(sourceRow);
      } else {
        productRow.cells[column.key] = {
          key: column.key,
          label: column.label,
          rowCount: 1,
          netLots: signedLots(sourceRow),
          netQuantity: signedQuantity(sourceRow),
          pnl: rowPnl,
          pnlCount: rowPnl === null ? 0 : 1,
          markedCount: rowMark === null ? 0 : 1,
          markedQuantity: rowMark !== null && markWeight > 0 ? markWeight : 0,
          weightedOutright: rowMark !== null && markWeight > 0 ? rowMark * markWeight : 0,
          outright: rowMark !== null && markWeight > 0 ? rowMark : null,
          trades: [sourceRow],
        };
      }

      productRows.set(productKey, productRow);
    });
  });

  const columns = [
    ...FIXED_TRADE_TENOR_COLUMNS,
    ...Array.from(dynamicColumns.values()).sort((first, second) => {
      const firstIsMonth = first.key.startsWith("month:");
      const secondIsMonth = second.key.startsWith("month:");
      if (firstIsMonth && secondIsMonth) {
        return monthSortKey(first.label) - monthSortKey(second.label);
      }
      if (firstIsMonth) return -1;
      if (secondIsMonth) return 1;
      return first.label.localeCompare(second.label, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    }),
  ];

  return {
    columns,
    rows: Array.from(productRows.values()).sort(
      (first, second) =>
        first.productSortKey - second.productSortKey ||
        first.product.localeCompare(second.product) ||
        first.assetClass.localeCompare(second.assetClass) ||
        first.region.localeCompare(second.region)
    ),
  };
}

function dailySettlementSourceLabel(
  row: DailySettlementRow,
  availability = settleAvailability(row)
): string {
  if (availability.label !== "Settled") {
    return toFiniteNumber(row.ice_settlement) === null ? "No source mark" : "ICE settlement";
  }

  if (row.settlement_source === "PJM_DA_LMP") return "PJM DA LMP";
  if (row.settlement_source === "PJM_RT_LMP") {
    if (row.lmp_source_tier === "verified_rt_lmp") return "PJM verified RT LMP";
    if (row.lmp_source_tier === "unverified_rt_lmp") return "PJM unverified RT LMP";
    if (row.lmp_source_tier === "mixed_lmp") return "PJM mixed verified/unverified RT LMP";
    return "PJM RT LMP";
  }
  if (row.settlement_source === "ICE_SETTLEMENT") return "ICE settlement";
  return fmtText(row.settlement_source);
}

function dailySettlementConfidence(row: DailySettlementRow): {
  label: string;
  daysLabel: string;
  className: string;
  title: string;
} {
  const metadata = String(row.metadata_status ?? "");
  const matched = toFiniteNumber(row.matched_settlement_days);
  const expected = toFiniteNumber(row.expected_settlement_days);
  const daysLabel =
    matched !== null && expected !== null ? `${fmtNumber(matched, 0)}/${fmtNumber(expected, 0)} days` : "--";
  const source = dailySettlementSourceLabel(row);

  if (metadata === "complete" || metadata === "complete_missing_ice_stats") {
    return {
      label: metadata === "complete_missing_ice_stats" ? "Complete LMP" : "Complete",
      daysLabel,
      className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
      title: `All expected delivery days matched complete source marks. Source: ${source}.`,
    };
  }
  if (metadata === "partial_iso_lmp") {
    return {
      label: "Partial",
      daysLabel,
      className: "border-amber-500/50 bg-amber-500/10 text-amber-100",
      title: `Only some expected delivery days matched complete source marks. Source: ${source}.`,
    };
  }
  if (metadata === "pending_iso_lmp") {
    return {
      label: "Pending",
      daysLabel,
      className: "border-sky-500/40 bg-sky-500/10 text-sky-100",
      title: `Source marks are not complete yet, so Final Mark may fall back to ICE. Source: ${source}.`,
    };
  }
  if (metadata === "missing_contract_dates" || metadata === "no_eligible_delivery_days") {
    return {
      label: "No LMP",
      daysLabel,
      className: "border-rose-500/40 bg-rose-500/10 text-rose-100",
      title: `No complete LMP mark could be produced. Status: ${fmtText(metadata)}.`,
    };
  }
  return {
    label: fmtText(metadata) || "ICE",
    daysLabel,
    className: "border-gray-700 bg-gray-900 text-gray-300",
    title: `Status: ${fmtText(metadata) || "--"}. Source: ${source}.`,
  };
}

function settlementHistoryWindowKey(row: DailySettlementRow): string {
  return [
    dailySettlementBeginDate(row),
    dailySettlementEndDate(row),
    row.contract,
  ]
    .map((value) => String(value ?? ""))
    .join("|");
}

function settlementHistoryColumnDisplayValue(
  row: DailySettlementRow,
  key: SettlementHistoryColumnKey
): string {
  if (key === "date") return fmtIsoDate(row.date);
  if (key === "begin_date") return fmtIsoDate(dailySettlementBeginDate(row));
  if (key === "end_date") return fmtIsoDate(dailySettlementEndDate(row));
  if (key === "contract") return fmtText(row.contract);
  if (key === "source") return dailySettlementSourceLabel(row);
  if (key === "confidence") return dailySettlementConfidence(row).label;
  return dailySettlementConfidence(row).daysLabel;
}

function settlementHistoryColumnSortValue(
  row: DailySettlementRow,
  key: SettlementHistoryColumnKey
): string | number {
  const value = settlementHistoryColumnDisplayValue(row, key);
  if (key === "date" || key === "begin_date" || key === "end_date") {
    return parseIceDate(value)?.getTime() ?? value;
  }
  return value;
}

function summarySourceTitle(rowOrCell: SettlementSummaryRow | SettlementSummaryCell): string {
  const labels = Array.from(rowOrCell.sourceLabels).filter((label) => label !== "--").sort();
  return labels.length === 0 ? "Data source: --" : `Data source: ${labels.join(", ")}`;
}

function dailySettlementComponentRows(row: DailySettlementRow): DailySettlementComponent[] {
  return Array.isArray(row.settlement_components) ? row.settlement_components : [];
}

function addSettlementSummaryValues(
  target: SettlementSummaryRow | SettlementSummaryCell,
  row: DailySettlementRow
) {
  const availability = settleAvailability(row);
  const activeMark = dailySettlementActiveMark(row);
  const settle = toFiniteNumber(row.settlement);
  const iceMark = toFiniteNumber(row.ice_settlement);
  const volume = toFiniteNumber(row.volume);

  target.rowCount += 1;
  target.settledCount += availability.label === "Settled" ? 1 : 0;
  if (activeMark !== null) {
    target.activeMarkCount += 1;
    target.activeMarkTotal += activeMark;
    target.sourceLabels.add(dailySettlementSourceLabel(row, availability));
  }
  if (settle !== null) {
    target.settleCount += 1;
    target.settleTotal += settle;
  }
  if (iceMark !== null) {
    target.iceMarkCount += 1;
    target.iceMarkTotal += iceMark;
  }
  if (volume !== null) {
    target.volumeCount += 1;
    target.volumeTotal += volume;
  }
}

function buildSettlementSummary(rows: DailySettlementRow[]): { columns: TradeSummaryColumn[]; rows: SettlementSummaryRow[] } {
  const productRows = new Map<string, SettlementSummaryRow>();
  const dynamicColumns = new Map<string, TradeSummaryColumn>();

  rows.forEach((row) => {
    const productDisplayInput = dailySettlementProductDisplayInput(row);
    const productDisplay = dailySettlementProductDisplay(row);
    const productKey = dailySettlementProductKey(row);
    const column = settlementTenorColumn(row);
    if (!FIXED_TRADE_TENOR_COLUMNS.some((fixed) => fixed.key === column.key)) {
      dynamicColumns.set(column.key, column);
    }

    const productRow =
      productRows.get(productKey) ??
        {
          key: productKey,
          product: productDisplay,
          productSortKey: iceTradeProductDisplaySortKey(productDisplayInput),
          assetClass: fmtText(row.asset_class),
          region: fmtText(row.region),
        rowCount: 0,
        settledCount: 0,
        activeMarkCount: 0,
        activeMarkTotal: 0,
        settleCount: 0,
        settleTotal: 0,
        iceMarkCount: 0,
        iceMarkTotal: 0,
        volumeCount: 0,
        volumeTotal: 0,
        sourceLabels: new Set<string>(),
        cells: {},
      };

    addSettlementSummaryValues(productRow, row);

    const existingCell = productRow.cells[column.key];
    if (existingCell) {
      addSettlementSummaryValues(existingCell, row);
      existingCell.rows.push(row);
    } else {
      const cell: SettlementSummaryCell = {
        key: column.key,
        label: column.label,
        rowCount: 0,
        settledCount: 0,
        activeMarkCount: 0,
        activeMarkTotal: 0,
        settleCount: 0,
        settleTotal: 0,
        iceMarkCount: 0,
        iceMarkTotal: 0,
        volumeCount: 0,
        volumeTotal: 0,
        sourceLabels: new Set<string>(),
        rows: [row],
      };
      addSettlementSummaryValues(cell, row);
      productRow.cells[column.key] = cell;
    }

    productRows.set(productKey, productRow);
  });

  const columns = [
    ...FIXED_TRADE_TENOR_COLUMNS,
    ...Array.from(dynamicColumns.values()).sort((first, second) => {
      const firstIsMonth = first.key.startsWith("month:");
      const secondIsMonth = second.key.startsWith("month:");
      if (firstIsMonth && secondIsMonth) {
        return monthSortKey(first.label) - monthSortKey(second.label);
      }
      if (firstIsMonth) return -1;
      if (secondIsMonth) return 1;
      return first.label.localeCompare(second.label, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    }),
  ];

  return {
    columns,
    rows: Array.from(productRows.values()).sort(
      (first, second) =>
        first.productSortKey - second.productSortKey ||
        first.product.localeCompare(second.product) ||
        first.assetClass.localeCompare(second.assetClass) ||
        first.region.localeCompare(second.region)
    ),
  };
}

function tradeSummaryMetricValue(
  rowOrCell: TradeSummaryRow | TradeSummaryCell,
  metric: TradeSummaryMetric
): number | null {
  if (metric === "outright") return rowOrCell.outright;
  if (metric === "net_lots") return rowOrCell.netLots;
  if (metric === "net_quantity") return rowOrCell.netQuantity;
  return rowOrCell.pnl;
}

function tradeSummaryMetricClass(value: number | null, metric: TradeSummaryMetric): string {
  if (value === null) return "text-gray-600";
  if (metric === "outright") return "text-gray-200";
  if (value > 0) return "border-l-2 border-emerald-500/70 bg-emerald-500/10 font-semibold text-emerald-200";
  if (value < 0) return "border-l-2 border-rose-500/70 bg-rose-500/10 font-semibold text-rose-200";
  return "text-gray-300";
}

function fmtTradeSummaryMetric(value: number | null, metric: TradeSummaryMetric): string {
  if (metric === "outright") return fmtOptionalPrice(value);
  if (metric === "pnl") return fmtPnl(value);
  return fmtNumber(value, 0);
}

function settlementSummaryMetricValue(
  rowOrCell: SettlementSummaryRow | SettlementSummaryCell,
  metric: SettlementSummaryMetric
): number | null {
  if (metric === "volume") return rowOrCell.volumeCount === 0 ? null : rowOrCell.volumeTotal;
  if (metric === "settle") {
    return rowOrCell.settleCount === 0 ? null : rowOrCell.settleTotal / rowOrCell.settleCount;
  }
  if (metric === "ice_mark") {
    return rowOrCell.iceMarkCount === 0 ? null : rowOrCell.iceMarkTotal / rowOrCell.iceMarkCount;
  }
  return rowOrCell.activeMarkCount === 0 ? null : rowOrCell.activeMarkTotal / rowOrCell.activeMarkCount;
}

function fmtSettlementSummaryMetric(value: number | null, metric: SettlementSummaryMetric): string {
  if (value === null) return "--";
  if (metric === "volume") return fmtNumber(value, 0);
  return fmtOptionalPrice(value);
}

function settlementSummaryMarkSource(
  rowOrCell: SettlementSummaryRow | SettlementSummaryCell
): { label: string; className: string; title: string } | null {
  if (rowOrCell.activeMarkCount === 0) return null;
  if (rowOrCell.settledCount === rowOrCell.rowCount) {
    return {
      label: "SET",
      className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
      title: summarySourceTitle(rowOrCell),
    };
  }
  if (rowOrCell.settledCount > 0) {
    return {
      label: "MIX",
      className: "border-orange-500/40 bg-orange-500/10 text-orange-200",
      title: summarySourceTitle(rowOrCell),
    };
  }
  return {
    label: "ICE",
    className: "border-sky-500/40 bg-sky-500/10 text-sky-200",
    title: summarySourceTitle(rowOrCell),
  };
}

function settlementSummaryMetricBadge(
  metric: SettlementSummaryMetric
): { label: string; className: string; title: string } | null {
  if (metric === "settle") {
    return {
      label: "SET",
      className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
      title: "Source settlement value.",
    };
  }
  if (metric === "ice_mark") {
    return {
      label: "ICE",
      className: "border-sky-500/40 bg-sky-500/10 text-sky-200",
      title: "ICE mark value.",
    };
  }
  return null;
}

function renderSettlementSummaryMetric(
  rowOrCell: SettlementSummaryRow | SettlementSummaryCell,
  metric: SettlementSummaryMetric
): React.ReactNode {
  const value = settlementSummaryMetricValue(rowOrCell, metric);
  if (metric === "volume") return fmtSettlementSummaryMetric(value, metric);
  const source =
    metric === "final_mark"
      ? settlementSummaryMarkSource(rowOrCell)
      : settlementSummaryMetricBadge(metric);
  if (value === null) return "--";
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span>{fmtSettlementSummaryMetric(value, metric)}</span>
      {source && (
        <span
          title={source.title}
          className={`rounded border px-1 py-0.5 text-[9px] font-bold ${source.className}`}
        >
          {source.label}
        </span>
      )}
    </span>
  );
}

function settlementSummaryMetricSourceDate(
  cell: SettlementSummaryCell,
  metric: SettlementSummaryMetric
): string | null {
  const matchingRows = cell.rows.filter((row) => {
    if (metric === "volume") return toFiniteNumber(row.volume) !== null;
    if (metric === "settle") return toFiniteNumber(row.settlement) !== null;
    if (metric === "ice_mark") return toFiniteNumber(row.ice_settlement) !== null;
    return dailySettlementActiveMark(row) !== null;
  });
  if (matchingRows.length === 0) return null;
  return matchingRows.reduce<string | null>(
    (latest, row) => (!latest || row.date > latest ? row.date : latest),
    null
  );
}

function renderSettlementSummaryCellMetric(
  cell: SettlementSummaryCell,
  metric: SettlementSummaryMetric
): React.ReactNode {
  const renderedMetric = renderSettlementSummaryMetric(cell, metric);
  const sourceDate = settlementSummaryMetricSourceDate(cell, metric);
  if (!sourceDate || renderedMetric === "--") return renderedMetric;
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span>{renderedMetric}</span>
      <span className="text-[10px] font-normal tabular-nums text-gray-500">
        {fmtIsoDate(sourceDate)}
      </span>
    </span>
  );
}

function sortedFilterValues(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0 && value !== "--")
    )
  ).sort((first, second) => sortFilterOption(first, second));
}

function rowMatchesQuickFilters(
  row: QuickFilterRow,
  traderFilter: string,
  assetFilters: string[],
  regionFilters: string[]
): boolean {
  if (traderFilter !== "All" && row.trader !== traderFilter) return false;
  if (assetFilters.length > 0 && !assetFilters.includes(String(row.asset_class ?? ""))) {
    return false;
  }
  if (regionFilters.length > 0 && !regionFilters.includes(String(row.region ?? ""))) {
    return false;
  }
  return true;
}

function productDictionarySummaryFromRows(rows: ProductDictionaryRow[]): ProductDictionaryPayload["summary"] {
  const countBy = (values: string[]) =>
    Object.fromEntries(
      values.reduce((counts, value) => {
        counts.set(value, (counts.get(value) ?? 0) + 1);
        return counts;
      }, new Map<string, number>())
    );

  return {
    rowCount: rows.length,
    activeRowCount: rows.filter((row) => row.active).length,
    pjmRowCount: rows.filter((row) => row.region === "PJM").length,
    iceRowCount: rows.filter((row) => row.ice_product_id !== null).length,
    optionRowCount: rows.filter((row) => row.ice_product_type.toLowerCase().includes("option")).length,
    assetClassCounts: countBy(rows.map((row) => row.asset_class)),
    regionCounts: countBy(rows.map((row) => row.region)),
    groupCounts: countBy(rows.map((row) => row.product_group)),
  };
}

function sideClass(value: string): string {
  const side = normalizedSide(value);
  if (side === "buy") {
    return "border-l-2 border-emerald-500/70 bg-emerald-500/10 font-semibold text-emerald-200";
  }
  if (side === "sell") {
    return "border-l-2 border-rose-500/70 bg-rose-500/10 font-semibold text-rose-200";
  }
  return "";
}

function quantityClass(value: number): string {
  if (value > 0) {
    return "border-l-2 border-emerald-500/70 bg-emerald-500/10 font-semibold text-emerald-200";
  }
  if (value < 0) {
    return "border-l-2 border-rose-500/70 bg-rose-500/10 font-semibold text-rose-200";
  }
  return "";
}

type ColumnKey =
  | "source_note"
  | "deal_id"
  | "trade_date"
  | "trade_time"
  | "leg_id"
  | "orig_id"
  | "b_s"
  | "product"
  | "hub"
  | "contract"
  | "begin_date"
  | "end_date"
  | "clearing_acct"
  | "cust_acct"
  | "clearing_firm"
  | "price"
  | "price_units"
  | "option"
  | "strike"
  | "strike_2"
  | "style"
  | "periods"
  | "lots"
  | "total_quantity"
  | "signed_quantity"
  | "mark"
  | "pnl"
  | "ice_symbol"
  | "settlement_source"
  | "settlement_contract_family"
  | "settlement_source_key"
  | "settlement_match_status"
  | "active_mark_source"
  | "source_settlement_mark"
  | "ice_mark"
  | "expected_settlement_days"
  | "matched_settlement_days"
  | "qty_per_period"
  | "qty_units"
  | "tt"
  | "brk"
  | "trader"
  | "memo"
  | "clearing_venue"
  | "user_id"
  | "source"
  | "link_id"
  | "usi"
  | "authorized_trader_id"
  | "location"
  | "meter"
  | "lead_time"
  | "waiver_ind"
  | "trade_time_micros"
  | "cdi_override"
  | "by_pass_mqr"
  | "broker_name"
  | "trading_company"
  | "mic"
  | "cc"
  | "asset_class"
  | "region"
  | "product_group"
  | "strip"
  | "counterparty"
  | "counterparty_user"
  | "report_date"
  | "deal_section"
  | "source_row_number"
  | "source_row_hash"
  | "created_at"
  | "updated_at"
  | "file_hash";

type TradeBlotterView = "pnl" | "positions" | "trades" | "settles" | "products";
type DateMode = "single" | "historical";
type SortDirection = "asc" | "desc";
type SettlementStatusFilter = "all" | "Settled" | "ICE Mark";
type QuickFilterRow = {
  trader?: string | null;
  asset_class?: string | null;
  region?: string | null;
};
type DeliveryStatus = "Future" | "In Delivery" | "Complete" | "Overdue" | "Unknown";
type PositionAggregateMetric =
  | "net_lots"
  | "daily_pnl"
  | "open_pnl"
  | "delta_equivalent_lots";
type PositionColumnKey =
  | "as_of"
  | "source_note"
  | "trader"
  | "clearing_acct"
  | "cust_acct"
  | "product"
  | "hub"
  | "cc"
  | "asset_class"
  | "region"
  | "contract"
  | "begin_date"
  | "end_date"
  | "option"
  | "style"
  | "strike"
  | "strike_2"
  | "net_side"
  | "net_lots"
  | "net_quantity"
  | "avg_price"
  | "settlement_mark"
  | "prior_settlement_mark"
  | "prior_mark_trade_date"
  | "daily_pnl"
  | "open_pnl"
  | "ice_symbol"
  | "option_symbol"
  | "underlying_symbol"
  | "option_delta"
  | "delta_equivalent_lots"
  | "delta_equivalent_quantity"
  | "settlement_source"
  | "settlement_source_key"
  | "settlement_contract_family"
  | "days_to_expiry"
  | "delivery_status"
  | "settlement_status"
  | "contributing_trade_count"
  | "latest_trade_date"
  | "latest_updated_at"
  | "qty_units"
  | "price_units";
type PositionLegColumnKey =
  | "trade_time"
  | "deal_id"
  | "leg_id"
  | "b_s"
  | "product"
  | "hub"
  | "contract"
  | "option"
  | "style"
  | "strike"
  | "strike_2"
  | "begin_date"
  | "end_date"
  | "lots"
  | "total_quantity"
  | "signed_quantity"
  | "price"
  | "trader"
  | "clearing_acct"
  | "cust_acct"
  | "brk";
type DailySettlementColumnKey =
  | "source_note"
  | "date"
  | "symbol"
  | "cc"
  | "blotter_cc"
  | "asset_class"
  | "region"
  | "product_group"
  | "hub"
  | "ice_trading_screen_hub_name"
  | "contract"
  | "settlement_source"
  | "contract_family"
  | "hour_bucket"
  | "delivery_status"
  | "date_check"
  | "begin_date"
  | "end_date"
  | "ice_begin_date"
  | "ice_end_date"
  | "final_mark"
  | "settlement"
  | "ice_settlement"
  | "market"
  | "open"
  | "high"
  | "low"
  | "close"
  | "vwap_close"
  | "volume"
  | "created_at"
  | "updated_at"
  | "contract_snapshot_trade_date"
  | "contract_dates_updated_at"
  | "metadata_status";
const TRADE_BLOTTER_SCOPE_TABS: Array<{ value: IceTradeProductScope; label: string }> = [
  { value: "short_pjm", label: "PJM Short Term" },
];

const POSITION_AGGREGATE_METRIC_TABS: Array<{
  value: PositionAggregateMetric;
  label: string;
}> = [
  { value: "daily_pnl", label: "Daily P&L" },
  { value: "open_pnl", label: "Open P&L" },
  { value: "net_lots", label: "Net Lots" },
  { value: "delta_equivalent_lots", label: "Delta Lots" },
];

interface SortState {
  key: ColumnKey;
  direction: SortDirection;
}

interface PositionSortState {
  key: PositionColumnKey;
  direction: SortDirection;
}

interface PositionLegSortState {
  key: PositionLegColumnKey;
  direction: SortDirection;
}

interface DailySettlementSortState {
  key: DailySettlementColumnKey;
  direction: SortDirection;
}

type ColumnFilters = Partial<Record<ColumnKey, string[]>>;
type TradeLegColumnFilters = Partial<Record<ColumnKey, string[]>>;
type PositionColumnFilters = Partial<Record<PositionColumnKey, string[]>>;
type PositionLegColumnFilters = Partial<Record<PositionLegColumnKey, string[]>>;
type DailySettlementColumnFilters = Partial<Record<DailySettlementColumnKey, string[]>>;
type MarkValues = Record<string, string>;

const EMPTY_FILTER_VALUES: string[] = [];
const DEFAULT_GROUP_ROWS_ENABLED = true;
const DEFAULT_TRADE_BLOTTER_SORT_STATE: SortState = {
  key: "contract",
  direction: "asc",
};
const DEFAULT_POSITION_SORT_STATE: PositionSortState = {
  key: "end_date",
  direction: "asc",
};
const DEFAULT_POSITION_LEG_SORT_STATE: PositionLegSortState = {
  key: "trade_time",
  direction: "desc",
};
const DEFAULT_DAILY_SETTLEMENT_SORT_STATE: DailySettlementSortState = {
  key: "contract",
  direction: "asc",
};

interface CellCoordinate {
  rowIndex: number;
  columnIndex: number;
  rowKey: string;
  columnKey: ColumnKey;
}

interface DailySettlementCellCoordinate {
  rowIndex: number;
  columnIndex: number;
  rowKey: string;
  columnKey: DailySettlementColumnKey;
}

interface TradeLegDetailColumn {
  key: ColumnKey;
  label: string;
  align?: "left" | "right";
  className?: (row: IceTradeBlotterRow, marks: MarkValues) => string;
  getDisplayValue?: (row: IceTradeBlotterRow, marks: MarkValues) => string;
  getSortValue?: (row: IceTradeBlotterRow, marks: MarkValues) => string | number | null;
  render: (row: IceTradeBlotterRow, marks: MarkValues) => React.ReactNode;
}

interface SelectedPnlSummary {
  selectedRowCount: number;
  markedRowCount: number;
  total: number | null;
}

interface SelectedTradeLegSummary {
  rowCount: number;
  lots: number;
  totalQuantity: number;
  signedQuantity: number;
  pnlMarkedCount: number;
  pnlTotal: number | null;
}

const EMPTY_SELECTED_PNL_SUMMARY: SelectedPnlSummary = {
  selectedRowCount: 0,
  markedRowCount: 0,
  total: null,
};

const EMPTY_SELECTED_TRADE_LEG_SUMMARY: SelectedTradeLegSummary = {
  rowCount: 0,
  lots: 0,
  totalQuantity: 0,
  signedQuantity: 0,
  pnlMarkedCount: 0,
  pnlTotal: null,
};

interface TradeSummaryCell {
  key: string;
  label: string;
  rowCount: number;
  netLots: number;
  netQuantity: number;
  pnl: number | null;
  pnlCount: number;
  markedCount: number;
  markedQuantity: number;
  weightedOutright: number;
  outright: number | null;
  trades: IceTradeBlotterRow[];
}

interface TradeSummaryColumn {
  key: string;
  label: string;
}

type TradeSummaryMetric = "outright" | "net_lots" | "net_quantity" | "pnl";

const TRADE_SUMMARY_METRICS: { key: TradeSummaryMetric; label: string }[] = [
  { key: "outright", label: "Outright" },
  { key: "net_lots", label: "Net Lots" },
  { key: "net_quantity", label: "Net QTY" },
  { key: "pnl", label: "P&L" },
];

interface TradeSummaryRow {
  key: string;
  product: string;
  productSortKey: number;
  assetClass: string;
  region: string;
  rowCount: number;
  netLots: number;
  netQuantity: number;
  pnl: number | null;
  pnlCount: number;
  markedCount: number;
  markedQuantity: number;
  weightedOutright: number;
  outright: number | null;
  cells: Record<string, TradeSummaryCell>;
  trades: IceTradeBlotterRow[];
}

interface SettlementSummaryCell {
  key: string;
  label: string;
  rowCount: number;
  settledCount: number;
  activeMarkCount: number;
  activeMarkTotal: number;
  settleCount: number;
  settleTotal: number;
  iceMarkCount: number;
  iceMarkTotal: number;
  volumeCount: number;
  volumeTotal: number;
  sourceLabels: Set<string>;
  rows: DailySettlementRow[];
}

interface SettlementSummaryRow {
  key: string;
  product: string;
  productSortKey: number;
  assetClass: string;
  region: string;
  rowCount: number;
  settledCount: number;
  activeMarkCount: number;
  activeMarkTotal: number;
  settleCount: number;
  settleTotal: number;
  iceMarkCount: number;
  iceMarkTotal: number;
  volumeCount: number;
  volumeTotal: number;
  sourceLabels: Set<string>;
  cells: Record<string, SettlementSummaryCell>;
}

type SettlementSummaryMetric = "final_mark" | "settle" | "ice_mark" | "volume";
type SettlementHistoryLookback = 7 | 14 | 30 | 90 | "all";
type SettlementHistoryColumnKey =
  | "date"
  | "begin_date"
  | "end_date"
  | "contract"
  | "source"
  | "confidence"
  | "coverage";
type SettlementHistoryColumnFilters = Partial<Record<SettlementHistoryColumnKey, string[]>>;

interface SettlementHistorySelection {
  productKey: string;
  product: string;
  assetClass: string;
  region: string;
  columnKey: string;
  columnLabel: string;
  symbol: string;
  historyEndDate: string;
}

const SETTLEMENT_SUMMARY_METRICS: { key: SettlementSummaryMetric; label: string }[] = [
  { key: "final_mark", label: "Final Mark" },
  { key: "settle", label: "Settle" },
  { key: "ice_mark", label: "ICE Mark" },
  { key: "volume", label: "Volume" },
];
const SETTLEMENT_HISTORY_ALL_START_DATE = "2020-01-01";
const SETTLEMENT_HISTORY_LOOKBACKS: SettlementHistoryLookback[] = [7, 14, 30, 90, "all"];
const SETTLEMENT_HISTORY_FILTER_COLUMNS: {
  key: SettlementHistoryColumnKey;
  label: string;
  align?: "left" | "right";
}[] = [
  { key: "date", label: "Trade Date" },
  { key: "begin_date", label: "Begin Date" },
  { key: "end_date", label: "End Date" },
  { key: "contract", label: "Contract" },
  { key: "source", label: "Source" },
  { key: "confidence", label: "Confidence" },
  { key: "coverage", label: "Coverage", align: "right" },
];

const DATE_LIKE_COLUMNS: ReadonlySet<ColumnKey> = new Set([
  "trade_date",
  "report_date",
  "contract",
  "begin_date",
  "end_date",
  "created_at",
  "updated_at",
]);

const DAILY_SETTLEMENT_DATE_LIKE_COLUMNS: ReadonlySet<DailySettlementColumnKey> = new Set([
  "date",
  "begin_date",
  "end_date",
  "ice_begin_date",
  "ice_end_date",
  "created_at",
  "updated_at",
  "contract_snapshot_trade_date",
  "contract_dates_updated_at",
]);

const MONTH_INDEX: Record<string, number> = {
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

interface ColumnDefinition {
  key: ColumnKey;
  label: string;
  align?: "left" | "right";
  sticky?: boolean;
  minClass?: string;
  cellClass?: (row: IceTradeBlotterRow) => string;
  render: (row: IceTradeBlotterRow) => React.ReactNode;
}

interface PositionColumnDefinition {
  key: PositionColumnKey;
  label: string;
  align?: "left" | "right";
  minClass?: string;
  cellClass?: (row: PositionRow) => string;
  render: (row: PositionRow) => React.ReactNode;
}

interface PositionLegColumnDefinition {
  key: PositionLegColumnKey;
  label: string;
  align?: "left" | "right";
  className?: (row: PositionLegRow) => string;
  getDisplayValue?: (row: PositionLegRow) => string;
  getSortValue?: (row: PositionLegRow) => string | number | null;
  render: (row: PositionLegRow) => React.ReactNode;
}

interface SelectedPositionLegSummary {
  rowCount: number;
  lots: number;
  totalQuantity: number;
  signedQuantity: number;
}

const EMPTY_SELECTED_POSITION_LEG_SUMMARY: SelectedPositionLegSummary = {
  rowCount: 0,
  lots: 0,
  totalQuantity: 0,
  signedQuantity: 0,
};

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: "trade_date", label: "Trade Date", render: (row) => fmtIsoDate(row.trade_date) },
  { key: "trader", label: "Trader", render: (row) => fmtText(row.trader) },
  {
    key: "deal_id",
    label: "Deal ID",
    minClass: "min-w-[140px]",
    render: (row) => row.deal_id,
  },
  { key: "leg_id", label: "Leg ID", render: (row) => fmtText(row.leg_id) },
  { key: "brk", label: "Broker", render: (row) => fmtText(row.brk) },
  { key: "orig_id", label: "Orig ID", render: (row) => fmtText(row.orig_id) },
  { key: "trade_time", label: "Trade Time", render: (row) => fmtText(row.trade_time) },
  {
    key: "b_s",
    label: "B/S",
    cellClass: (row) => sideClass(row.b_s),
    render: (row) => sideLabel(row.b_s),
  },
  { key: "product", label: "Product", minClass: "min-w-[170px]", render: (row) => fmtText(row.product) },
  {
    key: "asset_class",
    label: "Asset",
    minClass: "min-w-[90px]",
    render: (row) => fmtText(row.asset_class),
  },
  {
    key: "region",
    label: "Region",
    minClass: "min-w-[100px]",
    render: (row) => fmtText(row.region),
  },
  { key: "cc", label: "CC", render: (row) => fmtText(row.cc) },
  { key: "hub", label: "Hub", minClass: "min-w-[130px]", render: (row) => fmtText(row.hub) },
  {
    key: "contract",
    label: "Contract",
    minClass: "min-w-[150px]",
    render: (row) => fmtContractDate(row.contract),
  },
  { key: "begin_date", label: "Begin", render: (row) => fmtIsoDate(row.begin_date) },
  { key: "end_date", label: "End", render: (row) => fmtIsoDate(row.end_date) },
  { key: "periods", label: "Periods", align: "right", render: (row) => fmtNumber(row.periods) },
  { key: "lots", label: "Lots", align: "right", render: (row) => fmtNumber(row.lots) },
  {
    key: "total_quantity",
    label: "Total QTY",
    align: "right",
    render: (row) => fmtNumber(row.total_quantity, 0),
  },
  {
    key: "signed_quantity",
    label: "Signed QTY",
    align: "right",
    cellClass: (row) => quantityClass(signedQuantity(row)),
    render: (row) => fmtNumber(signedQuantity(row), 0),
  },
  {
    key: "qty_per_period",
    label: "QTY/Period",
    align: "right",
    render: (row) => fmtNumber(row.qty_per_period, 0),
  },
  { key: "qty_units", label: "Units", render: (row) => fmtText(row.qty_units) },
  { key: "price", label: "Price", align: "right", render: (row) => fmtPrice(row.price) },
  {
    key: "mark",
    label: "Mark",
    align: "right",
    minClass: "min-w-[110px]",
    render: () => null,
  },
  {
    key: "pnl",
    label: "P&L",
    align: "right",
    minClass: "min-w-[110px]",
    render: () => null,
  },
  {
    key: "ice_symbol",
    label: "ICE Symbol",
    minClass: "min-w-[130px]",
    render: (row) => fmtText(row.ice_symbol),
  },
  {
    key: "settlement_source",
    label: "Settle Source",
    minClass: "min-w-[160px]",
    render: (row) => fmtText(row.settlement_source),
  },
  {
    key: "settlement_contract_family",
    label: "Contract Type",
    minClass: "min-w-[120px]",
    render: (row) => fmtText(row.settlement_contract_family),
  },
  {
    key: "settlement_source_key",
    label: "Source Key",
    minClass: "min-w-[150px]",
    render: (row) => fmtText(row.settlement_source_key),
  },
  {
    key: "settlement_match_status",
    label: "Match Status",
    minClass: "min-w-[170px]",
    render: (row) => fmtText(row.settlement_match_status),
  },
  {
    key: "active_mark_source",
    label: "Settle",
    align: "right",
    minClass: "min-w-[125px]",
    render: (row) => (
      <span
        className={`inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[10px] font-semibold uppercase ${SOURCE_NOTE_TONE_CLASSES[markSourceTone(row.active_mark_source)]}`}
        title={markSourceDetail(row.active_mark_source)}
      >
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/20 text-[8px]">
          {markSourceGlyph(row.active_mark_source)}
        </span>
        <span className="tabular-nums text-gray-200">
          {markSourceLabel(row.active_mark_source)}
        </span>
      </span>
    ),
  },
  {
    key: "source_note",
    label: "Info",
    minClass: "min-w-[54px]",
    render: (row) => (
      <SourceNoteIcon
        lines={tradeBlotterSourceNote(row)}
        tone={tradeMetadataTone(row)}
        glyph="i"
      />
    ),
  },
  {
    key: "source_settlement_mark",
    label: "Source Settle",
    align: "right",
    minClass: "min-w-[120px]",
    render: (row) => fmtOptionalPrice(toFiniteNumber(row.source_settlement_mark)),
  },
  {
    key: "ice_mark",
    label: "ICE Mark Raw",
    align: "right",
    minClass: "min-w-[110px]",
    render: (row) => fmtOptionalPrice(toFiniteNumber(row.ice_mark)),
  },
  {
    key: "expected_settlement_days",
    label: "Expected Days",
    align: "right",
    minClass: "min-w-[120px]",
    render: (row) => fmtNumber(toFiniteNumber(row.expected_settlement_days), 0),
  },
  {
    key: "matched_settlement_days",
    label: "Matched Days",
    align: "right",
    minClass: "min-w-[120px]",
    render: (row) => fmtNumber(toFiniteNumber(row.matched_settlement_days), 0),
  },
  { key: "price_units", label: "Price Units", render: (row) => fmtText(row.price_units) },
  { key: "option", label: "Option", render: (row) => fmtText(row.option) },
  { key: "style", label: "Style", render: (row) => fmtText(row.style) },
  { key: "strike", label: "Strike", align: "right", render: (row) => fmtOptionalPrice(optionStrike(row, "strike")) },
  { key: "strike_2", label: "Strike 2", align: "right", render: (row) => fmtOptionalPrice(optionStrike(row, "strike_2")) },
  { key: "counterparty", label: "Counterparty", render: (row) => fmtText(row.counterparty) },
  { key: "report_date", label: "Report", render: (row) => fmtDate(row.report_date) },
  { key: "clearing_acct", label: "Clearing Acct", render: (row) => fmtText(row.clearing_acct) },
  { key: "cust_acct", label: "Cust Acct", render: (row) => fmtText(row.cust_acct) },
  { key: "clearing_firm", label: "Clearing Firm", render: (row) => fmtText(row.clearing_firm) },
  { key: "tt", label: "TT", render: (row) => fmtText(row.tt) },
  { key: "memo", label: "Memo", minClass: "min-w-[220px]", render: (row) => fmtText(row.memo) },
  { key: "clearing_venue", label: "Clearing Venue", render: (row) => fmtText(row.clearing_venue) },
  { key: "user_id", label: "User ID", render: (row) => fmtText(row.user_id) },
  { key: "source", label: "Source", render: (row) => fmtText(row.source) },
  { key: "link_id", label: "Link ID", render: (row) => fmtText(row.link_id) },
  { key: "usi", label: "USI", minClass: "min-w-[160px]", render: (row) => fmtText(row.usi) },
  {
    key: "authorized_trader_id",
    label: "Authorized Trader ID",
    render: (row) => fmtText(row.authorized_trader_id),
  },
  { key: "location", label: "Location", render: (row) => fmtText(row.location) },
  { key: "meter", label: "Meter", render: (row) => fmtText(row.meter) },
  { key: "lead_time", label: "Lead Time", render: (row) => fmtText(row.lead_time) },
  { key: "waiver_ind", label: "Waiver Ind", render: (row) => fmtText(row.waiver_ind) },
  { key: "trade_time_micros", label: "Trade Time Micros", render: (row) => fmtText(row.trade_time_micros) },
  { key: "cdi_override", label: "CDI Override", render: (row) => fmtText(row.cdi_override) },
  { key: "by_pass_mqr", label: "Bypass MQR", render: (row) => fmtText(row.by_pass_mqr) },
  { key: "broker_name", label: "Broker Name", render: (row) => fmtText(row.broker_name) },
  { key: "trading_company", label: "Trading Company", render: (row) => fmtText(row.trading_company) },
  { key: "mic", label: "MIC", render: (row) => fmtText(row.mic) },
  { key: "strip", label: "Strip", render: (row) => fmtText(row.strip) },
  { key: "counterparty_user", label: "Counterparty User", render: (row) => fmtText(row.counterparty_user) },
  { key: "deal_section", label: "Deal Section", render: (row) => fmtText(row.deal_section) },
  {
    key: "file_hash",
    label: "File",
    render: (row) => <span className="font-mono text-[11px]">{row.file_hash.slice(0, 12)}</span>,
  },
  {
    key: "source_row_number",
    label: "Source Row",
    align: "right",
    render: (row) => fmtNumber(row.source_row_number),
  },
  {
    key: "source_row_hash",
    label: "Source Row Hash",
    render: (row) => <span className="font-mono text-[11px]">{row.source_row_hash.slice(0, 12)}</span>,
  },
  { key: "created_at", label: "Created At", render: (row) => fmtTimestamp(row.created_at) },
  { key: "updated_at", label: "Updated At", render: (row) => fmtTimestamp(row.updated_at) },
];

const POSITION_COLUMN_DEFINITIONS: PositionColumnDefinition[] = [
  { key: "as_of", label: "Date", minClass: "min-w-[96px]", render: (row) => fmtIsoDate(row.as_of) },
  {
    key: "source_note",
    label: "Info",
    minClass: "min-w-[54px]",
    render: (row) => (
      <SourceNoteIcon
        lines={positionSourceNote(row)}
        tone={row.settlement_mark === null ? "pending" : "settled"}
        glyph="i"
      />
    ),
  },
  { key: "trader", label: "Trader", render: (row) => fmtText(row.trader) },
  { key: "clearing_acct", label: "Clearing Acct", render: (row) => fmtText(row.clearing_acct) },
  { key: "cust_acct", label: "Cust Acct", render: (row) => fmtText(row.cust_acct) },
  { key: "product", label: "Product", minClass: "min-w-[160px]", render: (row) => fmtText(row.product) },
  { key: "hub", label: "Hub", minClass: "min-w-[130px]", render: (row) => fmtText(row.hub) },
  { key: "cc", label: "CC", render: (row) => fmtText(row.cc) },
  { key: "asset_class", label: "Asset", render: (row) => fmtText(row.asset_class) },
  { key: "region", label: "Region", render: (row) => fmtText(row.region) },
  { key: "contract", label: "Contract", render: (row) => fmtContractDate(row.contract) },
  { key: "begin_date", label: "Begin", render: (row) => fmtIsoDate(row.begin_date) },
  { key: "end_date", label: "End", render: (row) => fmtIsoDate(row.end_date) },
  { key: "option", label: "Option", render: (row) => fmtText(row.option) },
  { key: "style", label: "Style", render: (row) => fmtText(row.style) },
  { key: "strike", label: "Strike", align: "right", render: (row) => fmtOptionalPrice(row.strike) },
  { key: "strike_2", label: "Strike 2", align: "right", render: (row) => fmtOptionalPrice(row.strike_2) },
  {
    key: "net_side",
    label: "Net Side",
    cellClass: (row) => quantityClass(row.net_quantity),
    render: (row) => fmtText(row.net_side),
  },
  {
    key: "net_lots",
    label: "Net Lots",
    align: "right",
    cellClass: (row) => quantityClass(row.net_lots),
    render: (row) => fmtNumber(row.net_lots, 0),
  },
  {
    key: "net_quantity",
    label: "Net QTY",
    align: "right",
    cellClass: (row) => quantityClass(row.net_quantity),
    render: (row) => fmtNumber(row.net_quantity, 0),
  },
  { key: "avg_price", label: "Avg Price", align: "right", render: (row) => fmtOptionalPrice(row.avg_price) },
  { key: "settlement_mark", label: "Mark", align: "right", render: (row) => fmtOptionalPrice(row.settlement_mark) },
  { key: "prior_settlement_mark", label: "Prev Mark", align: "right", render: (row) => fmtOptionalPrice(row.prior_settlement_mark) },
  { key: "prior_mark_trade_date", label: "Prev Mark Date", render: (row) => fmtIsoDate(row.prior_mark_trade_date) },
  {
    key: "daily_pnl",
    label: "Daily P&L",
    align: "right",
    cellClass: (row) => (row.daily_pnl === null ? "" : quantityClass(row.daily_pnl)),
    render: (row) => fmtPnl(row.daily_pnl),
  },
  {
    key: "open_pnl",
    label: "Open P&L",
    align: "right",
    cellClass: (row) => (row.open_pnl === null ? "" : quantityClass(row.open_pnl)),
    render: (row) => fmtPnl(row.open_pnl),
  },
  { key: "ice_symbol", label: "ICE Symbol", minClass: "min-w-[130px]", render: (row) => fmtText(row.ice_symbol) },
  { key: "option_symbol", label: "Option Symbol", minClass: "min-w-[150px]", render: (row) => fmtText(row.option_symbol) },
  { key: "underlying_symbol", label: "Underlying", minClass: "min-w-[130px]", render: (row) => fmtText(row.underlying_symbol) },
  {
    key: "option_delta",
    label: "Delta",
    align: "right",
    render: (row) => fmtNumber(row.option_delta, 4),
  },
  {
    key: "delta_equivalent_lots",
    label: "Delta Lots",
    align: "right",
    cellClass: (row) => (row.delta_equivalent_lots === null ? "" : quantityClass(row.delta_equivalent_lots)),
    render: (row) => fmtNumber(row.delta_equivalent_lots, 0),
  },
  {
    key: "delta_equivalent_quantity",
    label: "Delta QTY",
    align: "right",
    cellClass: (row) => (row.delta_equivalent_quantity === null ? "" : quantityClass(row.delta_equivalent_quantity)),
    render: (row) => fmtNumber(row.delta_equivalent_quantity, 0),
  },
  { key: "settlement_source", label: "Settle Source", minClass: "min-w-[150px]", render: (row) => fmtText(row.settlement_source) },
  { key: "settlement_source_key", label: "Source Key", minClass: "min-w-[150px]", render: (row) => fmtText(row.settlement_source_key) },
  { key: "settlement_contract_family", label: "Contract Type", render: (row) => fmtText(row.settlement_contract_family) },
  {
    key: "days_to_expiry",
    label: "Days to Expiry",
    align: "right",
    render: (row) => fmtNumber(row.days_to_expiry, 0),
  },
  { key: "delivery_status", label: "Delivery", render: (row) => fmtText(row.delivery_status) },
  { key: "settlement_status", label: "Settle Status", render: (row) => fmtText(row.settlement_status) },
  { key: "contributing_trade_count", label: "Legs", align: "right", render: (row) => fmtNumber(row.contributing_trade_count, 0) },
  { key: "latest_trade_date", label: "Latest Trade", render: (row) => fmtIsoDate(row.latest_trade_date) },
  { key: "latest_updated_at", label: "Updated At", render: (row) => fmtTimestamp(row.latest_updated_at) },
  { key: "qty_units", label: "Units", render: (row) => fmtText(row.qty_units) },
  { key: "price_units", label: "Price Units", render: (row) => fmtText(row.price_units) },
];

const POSITION_LEG_COLUMN_DEFINITIONS: PositionLegColumnDefinition[] = [
  {
    key: "trade_time",
    label: "Placed",
    getDisplayValue: (row) => fmtPositionLegPlaced(row),
    getSortValue: (row) => `${fmtIsoDate(row.trade_date)} ${fmtText(row.trade_time)}`,
    render: (row) => fmtPositionLegPlaced(row),
  },
  { key: "deal_id", label: "Deal", render: (row) => fmtText(row.deal_id) },
  { key: "leg_id", label: "Leg", render: (row) => fmtText(row.leg_id) },
  {
    key: "b_s",
    label: "B/S",
    className: (row) => sideClass(row.b_s),
    render: (row) => sideLabel(row.b_s),
  },
  { key: "product", label: "Product", render: (row) => fmtText(row.product) },
  { key: "hub", label: "Hub", render: (row) => fmtText(row.hub) },
  { key: "contract", label: "Contract", render: (row) => fmtContractDate(row.contract) },
  { key: "option", label: "Option", render: (row) => fmtText(row.option) },
  { key: "style", label: "Style", render: (row) => fmtText(row.style) },
  { key: "strike", label: "Strike", align: "right", render: (row) => fmtOptionalPrice(row.strike) },
  { key: "strike_2", label: "Strike 2", align: "right", render: (row) => fmtOptionalPrice(row.strike_2) },
  { key: "begin_date", label: "Begin", render: (row) => fmtIsoDate(row.begin_date) },
  { key: "end_date", label: "End", render: (row) => fmtIsoDate(row.end_date) },
  { key: "lots", label: "Lots", align: "right", render: (row) => fmtNumber(row.lots, 0) },
  {
    key: "total_quantity",
    label: "Total QTY",
    align: "right",
    render: (row) => fmtNumber(row.total_quantity, 0),
  },
  {
    key: "signed_quantity",
    label: "Signed QTY",
    align: "right",
    className: (row) => quantityClass(positionLegSignedQuantity(row)),
    render: (row) => fmtNumber(positionLegSignedQuantity(row), 0),
  },
  { key: "price", label: "Price", align: "right", render: (row) => fmtPrice(row.price) },
  { key: "trader", label: "Trader", render: (row) => fmtText(row.trader) },
  { key: "clearing_acct", label: "Clearing Acct", render: (row) => fmtText(row.clearing_acct) },
  { key: "cust_acct", label: "Cust Acct", render: (row) => fmtText(row.cust_acct) },
  { key: "brk", label: "Broker", render: (row) => fmtText(row.brk) },
];

interface DailySettlementColumnDefinition {
  key: DailySettlementColumnKey;
  label: string;
  align?: "left" | "right";
  minClass?: string;
  render: (row: DailySettlementRow) => React.ReactNode;
}

interface SourceNoteLine {
  label: string;
  value: string;
}

type SourceNoteTone = "info" | "settled" | "pending" | "overdue" | "partial" | "unknown";

interface SettleAvailability {
  label: Exclude<SettlementStatusFilter, "all">;
  tone: SourceNoteTone;
  glyph: string;
  detail: string;
  delivery: DeliveryStatus;
  deliveryDetail: string;
}

const SOURCE_NOTE_TONE_CLASSES: Record<SourceNoteTone, string> = {
  info: "border-sky-500/40 bg-sky-500/10 text-sky-100 hover:border-sky-300/70 hover:bg-sky-500/20 focus:border-sky-300/70 focus:bg-sky-500/20",
  settled: "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:border-emerald-300/80 hover:bg-emerald-500/25 focus:border-emerald-300/80 focus:bg-emerald-500/25",
  pending: "border-amber-500/50 bg-amber-500/15 text-amber-100 hover:border-amber-300/80 hover:bg-amber-500/25 focus:border-amber-300/80 focus:bg-amber-500/25",
  overdue: "border-rose-500/50 bg-rose-500/15 text-rose-100 hover:border-rose-300/80 hover:bg-rose-500/25 focus:border-rose-300/80 focus:bg-rose-500/25",
  partial: "border-orange-500/50 bg-orange-500/15 text-orange-100 hover:border-orange-300/80 hover:bg-orange-500/25 focus:border-orange-300/80 focus:bg-orange-500/25",
  unknown: "border-gray-600 bg-gray-800 text-gray-200 hover:border-gray-400 hover:bg-gray-700 focus:border-gray-400 focus:bg-gray-700",
};

const SETTLEMENT_STATUS_LEGEND: Array<{
  label: Exclude<SettlementStatusFilter, "all">;
  tone: SourceNoteTone;
  glyph: string;
}> = [
  { label: "Settled", tone: "settled", glyph: "S" },
  { label: "ICE Mark", tone: "pending", glyph: "I" },
];

function dateOnlyTime(value: string | null | undefined): number | null {
  const parsed = parseIceDate(value);
  if (!parsed) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
}

function todayOnlyTime(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function deliveryStatusForRow(row: DailySettlementRow): {
  status: DeliveryStatus;
  detail: string;
} {
  const endTime = dateOnlyTime(row.end_date);
  const beginTime = dateOnlyTime(row.begin_date);
  const todayTime = todayOnlyTime();

  if (beginTime !== null && todayTime < beginTime) {
    return {
      status: "Future",
      detail: "Delivery has not started.",
    };
  }

  if (beginTime !== null && endTime !== null && todayTime >= beginTime && todayTime <= endTime) {
    return {
      status: "In Delivery",
      detail: "Today is inside the begin/end delivery window.",
    };
  }

  if (endTime !== null && todayTime > endTime) {
    return {
      status: "Complete",
      detail: "Today is after the end date.",
    };
  }

  return {
    status: "Unknown",
    detail: "Begin/end dates are missing or could not be parsed.",
  };
}

function settleAvailability(row: DailySettlementRow): SettleAvailability {
  const settle = toFiniteNumber(row.settlement);
  const metadata = (row.metadata_status ?? "").toLowerCase();
  const isDaLmp = row.settlement_source === "PJM_DA_LMP" || row.settlement_source === "ERCOT_DA_LMP";
  const groupLabel = [row.asset_class, row.region].filter(Boolean).map((value) => fmtText(value)).join(" ");
  const delivery = deliveryStatusForRow(row);
  const daReleased = isDaLmp && settle !== null && !metadata.includes("partial");
  const displayedDelivery = daReleased ? "Complete" : delivery.status;
  const displayedDeliveryDetail = daReleased
    ? `${groupLabel} DA source mark is released before physical delivery.`
    : delivery.detail;
  const isComplete = delivery.status === "Complete";
  const isOverdue = isComplete && settle === null;

  if (daReleased) {
    return {
      label: "Settled",
      tone: "settled",
      glyph: "S",
      detail: `${groupLabel} DA source mark is populated and used as final.`,
      delivery: displayedDelivery,
      deliveryDetail: displayedDeliveryDetail,
    };
  }

  if (!isDaLmp && isComplete && settle !== null && !metadata.includes("partial")) {
    return {
      label: "Settled",
      tone: "settled",
      glyph: "S",
      detail: "The begin/end window is complete and a final settlement value is populated.",
      delivery: displayedDelivery,
      deliveryDetail: displayedDeliveryDetail,
    };
  }

  return {
    label: "ICE Mark",
    tone: isOverdue ? "overdue" : metadata.includes("partial") ? "partial" : "pending",
    glyph: "I",
    detail: isOverdue
      ? "No source settlement value is available after the delivery window; Final Mark falls back to ICE."
      : "Source settlement value is not complete; Final Mark falls back to ICE.",
    delivery: isOverdue ? "Overdue" : displayedDelivery,
    deliveryDetail: isOverdue
      ? "Today is after the end date and no complete source settle is available."
      : displayedDeliveryDetail,
  };
}

function dailySettlementActiveMark(row: DailySettlementRow): number | null {
  const availability = settleAvailability(row);
  const settle = toFiniteNumber(row.settlement);
  if (availability.label === "Settled" && settle !== null) {
    return settle;
  }
  return toFiniteNumber(row.ice_settlement);
}

function formatPnlUnmarkedPosition(position: PnlSummaryUnmarkedPosition): string {
  const optionLabel =
    position.option && position.option !== "-"
      ? position.option
      : "Future";
  return [
    position.trader,
    position.cc,
    position.contract,
    optionLabel,
    `Lots ${fmtNumber(position.net_lots, 0)}`,
    position.settlement_status,
  ]
    .filter((value) => value && value !== "-")
    .join(" ");
}

function pnlSummaryMarkLines(row: PnlSummaryRow): SourceNoteLine[] {
  const unmarkedCount = Math.max(0, row.totalCount - row.markedCount);
  const traderCounts = new Map<string, number>();
  row.unmarkedPositions.forEach((position) => {
    traderCounts.set(position.trader, (traderCounts.get(position.trader) ?? 0) + 1);
  });
  const byTrader = Array.from(traderCounts.entries())
    .sort((first, second) => first[0].localeCompare(second[0]))
    .map(([trader, count]) => `${trader} ${count.toLocaleString()}`)
    .join(" | ");
  const sample = row.unmarkedPositions
    .slice(0, 8)
    .map(formatPnlUnmarkedPosition)
    .join(" | ");
  const lines: SourceNoteLine[] = [
    {
      label: "Marked",
      value: `${row.markedCount.toLocaleString()} / ${row.totalCount.toLocaleString()}`,
    },
    { label: "Unmarked", value: unmarkedCount.toLocaleString() },
  ];
  if (byTrader) {
    lines.push({ label: "By Trader", value: byTrader });
  }
  if (sample) {
    lines.push({ label: "Sample", value: sample });
  }
  if (row.unmarkedPositions.length > 8) {
    lines.push({
      label: "More",
      value: `${(row.unmarkedPositions.length - 8).toLocaleString()} additional unmarked rows`,
    });
  }
  return lines;
}

function pnlSummaryTraderMarkLines(row: PnlSummaryRow, trader: string): SourceNoteLine[] {
  const positions = row.unmarkedPositions.filter((position) => position.trader === trader);
  const sample = positions.slice(0, 8).map(formatPnlUnmarkedPosition).join(" | ");
  const lines: SourceNoteLine[] = [
    { label: "Trader", value: trader },
    { label: "Unmarked", value: positions.length.toLocaleString() },
  ];
  if (sample) {
    lines.push({ label: "Sample", value: sample });
  }
  if (positions.length > 8) {
    lines.push({
      label: "More",
      value: `${(positions.length - 8).toLocaleString()} additional unmarked rows`,
    });
  }
  return lines;
}

function SourceNoteIcon({
  lines,
  tone = "info",
  glyph = "i",
}: {
  lines: SourceNoteLine[];
  tone?: SourceNoteTone;
  glyph?: string;
}) {
  const note = lines.map((line) => `${line.label}: ${line.value}`).join(" ");
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const tooltipWidth = 420;
  const tooltipHeight = Math.min(360, Math.max(120, lines.length * 28 + 24));

  const showTooltip = () => {
    const rect = iconRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - tooltipWidth - margin);
    const left = Math.min(Math.max(rect.left, margin), maxLeft);
    const hasRoomBelow = rect.bottom + tooltipHeight + margin <= window.innerHeight;
    const top = hasRoomBelow
      ? rect.bottom + 6
      : Math.max(margin, rect.top - tooltipHeight - 6);
    setTooltipPosition({ top, left });
  };

  const hideTooltip = () => setTooltipPosition(null);
  const tooltip = tooltipPosition
    ? createPortal(
        <span
          className="fixed z-[1000] max-h-[360px] w-[420px] max-w-[calc(100vw-1.5rem)] overflow-auto rounded-md border border-sky-500/40 bg-gray-950 px-3 py-2 text-left text-[11px] font-normal leading-5 text-sky-50 shadow-xl shadow-black/40"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
          }}
        >
          <span className="grid gap-1.5">
            {lines.map((line) => (
              <span key={line.label} className="grid grid-cols-[92px_1fr] gap-2">
                <span className="font-semibold uppercase tracking-wide text-sky-300">
                  {line.label}
                </span>
                <span className="text-gray-100">{line.value}</span>
              </span>
            ))}
          </span>
        </span>,
        document.body
      )
    : null;

  return (
    <span className="relative inline-flex" onMouseLeave={hideTooltip}>
      <span
        ref={iconRef}
        role="img"
        aria-label={note}
        tabIndex={0}
        onMouseEnter={showTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className={`inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border text-[10px] font-bold outline-none transition-colors ${SOURCE_NOTE_TONE_CLASSES[tone]}`}
      >
        {glyph}
      </span>
      {tooltip}
    </span>
  );
}

function SettlementDailyValuesHover({
  rows,
  align = "right",
}: {
  rows: DailySettlementRow[];
  align?: "left" | "right";
}) {
  const rowsWithComponents = rows
    .map((row) => ({
      row,
      components: dailySettlementComponentRows(row).filter(
        (component) => toFiniteNumber(component.settlement) !== null
      ),
    }))
    .filter((entry) => entry.components.length > 0);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const tooltipWidth = 360;
  const rowCount = rowsWithComponents.reduce(
    (count, entry) => count + entry.components.length,
    0
  );
  const tooltipHeight = Math.min(
    360,
    Math.max(132, rowsWithComponents.length * 42 + rowCount * 24 + 44)
  );

  if (rowsWithComponents.length === 0) return null;

  const showTooltip = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 12;
    const preferredLeft =
      align === "right" ? rect.right - tooltipWidth : rect.left;
    const maxLeft = Math.max(margin, window.innerWidth - tooltipWidth - margin);
    const left = Math.min(Math.max(preferredLeft, margin), maxLeft);
    const hasRoomBelow = rect.bottom + tooltipHeight + margin <= window.innerHeight;
    const top = hasRoomBelow
      ? rect.bottom + 6
      : Math.max(margin, rect.top - tooltipHeight - 6);
    setTooltipPosition({ top, left });
  };

  const hideTooltip = () => setTooltipPosition(null);
  const tooltip = tooltipPosition
    ? createPortal(
        <div
          className="fixed z-[1000] max-h-[360px] w-[360px] max-w-[calc(100vw-1.5rem)] overflow-auto rounded-md border border-emerald-500/35 bg-gray-950 text-left text-[11px] font-normal text-gray-100 shadow-xl shadow-black/50"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
          }}
        >
          <div className="border-b border-gray-800 bg-emerald-500/10 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
              Daily Values
            </div>
            <div className="mt-0.5 text-[11px] text-gray-400">
              Delivery-day marks behind the averaged settle.
            </div>
          </div>
          <div className="grid gap-3 px-3 py-2">
            {rowsWithComponents.map(({ row, components }) => (
              <div
                key={`${dailySettlementRowKey(row)}:daily-components`}
                className="grid gap-1"
              >
                <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-gray-500">
                  <span className="truncate">
                    {fmtIsoDate(dailySettlementBeginDate(row))} to{" "}
                    {fmtIsoDate(dailySettlementEndDate(row))}
                  </span>
                  <span className="shrink-0 text-emerald-200">
                    avg {fmtOptionalPrice(toFiniteNumber(row.settlement))}
                  </span>
                </div>
                <div className="overflow-hidden rounded border border-gray-800">
                  {components.map((component) => {
                    const hoursPresent = toFiniteNumber(component.hours_present);
                    const expectedHours = toFiniteNumber(component.expected_hours);
                    const isComplete =
                      hoursPresent !== null &&
                      expectedHours !== null &&
                      hoursPresent === expectedHours;
                    return (
                      <div
                        key={`${dailySettlementRowKey(row)}:${component.date}`}
                        className="grid grid-cols-[88px_1fr_70px] items-center gap-2 border-b border-gray-800 px-2 py-1.5 last:border-b-0"
                      >
                        <span className="font-semibold tabular-nums text-gray-200">
                          {fmtIsoDate(component.date)}
                        </span>
                        <span className="text-right font-semibold tabular-nums text-emerald-100">
                          {fmtOptionalPrice(toFiniteNumber(component.settlement))}
                        </span>
                        <span
                          className={`text-right text-[10px] tabular-nums ${
                            isComplete ? "text-emerald-300" : "text-amber-300"
                          }`}
                        >
                          {hoursPresent !== null && expectedHours !== null
                            ? `${fmtNumber(hoursPresent, 0)}/${fmtNumber(expectedHours, 0)} hrs`
                            : "--"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <span className="relative inline-flex" onMouseLeave={hideTooltip}>
      <span
        ref={triggerRef}
        tabIndex={0}
        onMouseEnter={showTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className="inline-flex cursor-help items-center rounded border border-emerald-500/35 bg-emerald-500/10 px-1 py-0.5 text-[9px] font-bold text-emerald-200 outline-none transition-colors hover:border-emerald-300/70 hover:bg-emerald-500/20 focus:border-emerald-300/70 focus:bg-emerald-500/20"
      >
        DAYS
      </span>
      {tooltip}
    </span>
  );
}

function hourBucketNote(hourBucket: string | null | undefined): string {
  if (hourBucket === "ONPEAK") {
    return "OnPeak hours are defined by the ISO/product contract.";
  }
  if (hourBucket === "OFFPEAK") {
    return "OffPeak hours are defined by the ISO/product contract.";
  }
  return "Determined by the ICE contract.";
}

function settleSourceNote(source: string): string {
  if (source === "PJM_DA_LMP") return "pjm.da_hrl_lmps";
  if (source === "PJM_RT_LMP") {
    return "pjm.rt_settlements_verified_hourly_lmps, fallback pjm.rt_unverified_hourly_lmps";
  }
  if (source === "ERCOT_DA_LMP") return "ercot.dam_stlmnt_pnt_prices";
  if (source === "ERCOT_RT_LMP") return "ercot.rt_spp_all_nodes";
  if (source === "ICE_SETTLEMENT") return "ice_python.settlements";
  return source || "--";
}

function SettlementStatusPill({
  label,
  tone,
  glyph,
  count,
  active = false,
  onClick,
}: {
  label: string;
  tone: SourceNoteTone;
  glyph: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
        SOURCE_NOTE_TONE_CLASSES[tone]
      } ${active ? "ring-1 ring-white/40" : ""}`}
    >
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/20 text-[9px]">
        {glyph}
      </span>
      <span>{label}</span>
      {count !== undefined && (
        <span className="font-mono text-[10px] opacity-80">{count.toLocaleString()}</span>
      )}
    </button>
  );
}

function PriceWithBadge({
  value,
  badge,
  tone,
}: {
  value: number | null;
  badge?: string;
  tone?: "settle" | "ice";
}) {
  if (value === null) return "--";
  const badgeClass =
    tone === "settle"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-sky-500/40 bg-sky-500/10 text-sky-200";
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span className="tabular-nums">{fmtOptionalPrice(value)}</span>
      {badge && (
        <span className={`rounded border px-1 py-0.5 text-[9px] font-bold ${badgeClass}`}>
          {badge}
        </span>
      )}
    </span>
  );
}

const DAILY_SETTLEMENT_DATE_CHECK_META: Record<
  DailySettlementDateCheckStatus,
  { label: string; sort: number; className: string }
> = {
  diff: {
    label: "DIFF",
    sort: 1,
    className: "border-amber-500/50 bg-amber-500/10 text-amber-200",
  },
  missing: {
    label: "MISSING",
    sort: 2,
    className: "border-gray-500/50 bg-gray-500/10 text-gray-300",
  },
  rule: {
    label: "RULE",
    sort: 3,
    className: "border-sky-500/50 bg-sky-500/10 text-sky-200",
  },
  ok: {
    label: "OK",
    sort: 4,
    className: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
  },
};

function dailySettlementDateCheckStatus(
  row: DailySettlementRow
): DailySettlementDateCheckStatus {
  if (
    row.date_check_status === "ok" ||
    row.date_check_status === "diff" ||
    row.date_check_status === "missing" ||
    row.date_check_status === "rule"
  ) {
    return row.date_check_status;
  }
  return "rule";
}

function dailySettlementDateCheckLabel(row: DailySettlementRow): string {
  return DAILY_SETTLEMENT_DATE_CHECK_META[dailySettlementDateCheckStatus(row)].label;
}

function dailySettlementDateCheckTitle(row: DailySettlementRow): string {
  const ruleWindow = `${fmtIsoDate(row.begin_date)} to ${fmtIsoDate(row.end_date)}`;
  const iceWindow = `${fmtIsoDate(row.ice_begin_date)} to ${fmtIsoDate(row.ice_end_date)}`;
  return [
    row.date_check_detail || "Date check unavailable.",
    `Rule: ${ruleWindow}`,
    `ICE reference: ${iceWindow}`,
  ].join(" ");
}

function DailySettlementDateCheckBadge({ row }: { row: DailySettlementRow }) {
  const meta = DAILY_SETTLEMENT_DATE_CHECK_META[dailySettlementDateCheckStatus(row)];
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}
      title={dailySettlementDateCheckTitle(row)}
    >
      {meta.label}
    </span>
  );
}

function renderDailySettlementDateCell(
  row: DailySettlementRow,
  field: "begin" | "end"
): React.ReactNode {
  const ruleDate = field === "begin" ? row.begin_date : row.end_date;
  const iceDate = field === "begin" ? row.ice_begin_date : row.ice_end_date;
  const showIceDate =
    dailySettlementDateCheckStatus(row) === "diff" &&
    iceDate !== null &&
    iceDate !== ruleDate;

  return (
    <span className="block" title={dailySettlementDateCheckTitle(row)}>
      <span className="block whitespace-nowrap text-gray-200">
        {fmtIsoDate(ruleDate)}
      </span>
      {showIceDate && (
        <span className="block whitespace-nowrap text-[10px] font-semibold text-amber-300">
          ICE ref {fmtIsoDate(iceDate)}
        </span>
      )}
    </span>
  );
}

function dailySettlementSourceNote(row: DailySettlementRow): SourceNoteLine[] {
  const availability = settleAvailability(row);
  const hub =
    row.settlement_source === "PJM_DA_LMP" ||
    row.settlement_source === "PJM_RT_LMP" ||
    row.settlement_source === "ERCOT_DA_LMP" ||
    row.settlement_source === "ERCOT_RT_LMP"
      ? row.ice_trading_screen_hub_name || row.hub || "--"
      : row.ice_trading_screen_hub_name || row.hub || "--";
  return [
    { label: "Status", value: availability.label },
    { label: "Delivery", value: availability.delivery },
    { label: "Date Check", value: dailySettlementDateCheckLabel(row) },
    { label: "Date Detail", value: row.date_check_detail || "--" },
    { label: "Rule Dates", value: `${fmtIsoDate(row.begin_date)} to ${fmtIsoDate(row.end_date)}` },
    { label: "ICE Reference Dates", value: `${fmtIsoDate(row.ice_begin_date)} to ${fmtIsoDate(row.ice_end_date)}` },
    { label: "Final Mark", value: fmtOptionalPrice(dailySettlementActiveMark(row)) },
    { label: "Rule", value: availability.detail },
    { label: "Window", value: availability.deliveryDetail },
    { label: "Settle", value: fmtOptionalPrice(toFiniteNumber(row.settlement)) },
    { label: "Settle Source", value: settleSourceNote(row.settlement_source) },
    { label: "Asset", value: fmtText(row.asset_class) },
    { label: "Region", value: fmtText(row.region) },
    { label: "CC", value: row.blotter_cc ? `${row.cc} (blotter ${row.blotter_cc})` : row.cc },
    { label: "Symbol", value: row.symbol || "--" },
    { label: "Type", value: row.contract_family || "--" },
    { label: "ICE Mark", value: fmtOptionalPrice(toFiniteNumber(row.ice_settlement)) },
    {
      label: "Stats",
      value: "ice_python.settlements by trade date and ICE symbol",
    },
    { label: "Hub", value: hub },
    { label: "Alias", value: row.hub || "--" },
    { label: "Hours", value: hourBucketNote(row.hour_bucket) },
    { label: "Dates", value: "deterministic short-term PJM ladder; ICE contract dates shown as audit context" },
    { label: "Metadata", value: row.metadata_status || "--" },
  ];
}

const DAILY_SETTLEMENT_COLUMN_DEFINITIONS: DailySettlementColumnDefinition[] = [
  {
    key: "source_note",
    label: "Status",
    render: (row) => {
      const availability = settleAvailability(row);
      return (
        <SourceNoteIcon
          lines={dailySettlementSourceNote(row)}
          tone={availability.tone}
          glyph={availability.glyph}
        />
      );
    },
  },
  { key: "date", label: "Trade Date", render: (row) => fmtIsoDate(row.date) },
  {
    key: "asset_class",
    label: "Asset",
    minClass: "min-w-[90px]",
    render: (row) => fmtText(row.asset_class),
  },
  {
    key: "region",
    label: "Region",
    minClass: "min-w-[100px]",
    render: (row) => fmtText(row.region),
  },
  { key: "cc", label: "CC", render: (row) => fmtText(row.cc) },
  { key: "blotter_cc", label: "Blotter CC", render: (row) => fmtText(row.blotter_cc) },
  {
    key: "ice_trading_screen_hub_name",
    label: "Hub",
    minClass: "min-w-[170px]",
    render: (row) => fmtText(row.ice_trading_screen_hub_name ?? row.hub),
  },
  { key: "hub", label: "Hub Alias", minClass: "min-w-[150px]", render: (row) => fmtText(row.hub) },
  {
    key: "contract",
    label: "Contract",
    minClass: "min-w-[150px]",
    render: (row) => fmtText(row.contract),
  },
  {
    key: "date_check",
    label: "Date Check",
    minClass: "min-w-[105px]",
    render: (row) => <DailySettlementDateCheckBadge row={row} />,
  },
  {
    key: "symbol",
    label: "ICE Symbol",
    minClass: "min-w-[130px]",
    render: (row) => fmtText(row.symbol),
  },
  {
    key: "settlement_source",
    label: "Settlement Source",
    minClass: "min-w-[160px]",
    render: (row) => fmtText(row.settlement_source),
  },
  {
    key: "contract_family",
    label: "Contract Type",
    minClass: "min-w-[120px]",
    render: (row) => fmtText(row.contract_family),
  },
  { key: "hour_bucket", label: "Hours", render: (row) => fmtText(row.hour_bucket) },
  {
    key: "delivery_status",
    label: "Delivery",
    minClass: "min-w-[110px]",
    render: (row) => {
      const availability = settleAvailability(row);
      const tone =
        availability.delivery === "Overdue"
          ? "overdue"
          : availability.delivery === "Complete"
            ? "settled"
            : availability.delivery === "Unknown"
              ? "unknown"
              : "pending";
      return (
        <span
          className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${SOURCE_NOTE_TONE_CLASSES[tone]}`}
          title={availability.deliveryDetail}
        >
          {availability.delivery}
        </span>
      );
    },
  },
  { key: "market", label: "Market", render: (row) => fmtText(row.market) },
  {
    key: "begin_date",
    label: "Begin",
    minClass: "min-w-[105px]",
    render: (row) => renderDailySettlementDateCell(row, "begin"),
  },
  {
    key: "end_date",
    label: "End",
    minClass: "min-w-[105px]",
    render: (row) => renderDailySettlementDateCell(row, "end"),
  },
  {
    key: "ice_begin_date",
    label: "ICE Begin",
    minClass: "min-w-[105px]",
    render: (row) => fmtIsoDate(row.ice_begin_date),
  },
  {
    key: "ice_end_date",
    label: "ICE End",
    minClass: "min-w-[105px]",
    render: (row) => fmtIsoDate(row.ice_end_date),
  },
  {
    key: "final_mark",
    label: "Final Mark",
    align: "right",
    minClass: "min-w-[120px]",
    render: (row) => {
      const availability = settleAvailability(row);
      const activeMark = dailySettlementActiveMark(row);
      if (availability.label === "Settled" && toFiniteNumber(row.settlement) !== null) {
        return <PriceWithBadge value={activeMark} badge="SET" tone="settle" />;
      }
      return <PriceWithBadge value={activeMark} badge={activeMark === null ? undefined : "ICE"} tone="ice" />;
    },
  },
  {
    key: "settlement",
    label: "Settle",
    align: "right",
    minClass: "min-w-[110px]",
    render: (row) => fmtOptionalPrice(toFiniteNumber(row.settlement)),
  },
  {
    key: "ice_settlement",
    label: "ICE Mark",
    align: "right",
    minClass: "min-w-[110px]",
    render: (row) => fmtOptionalPrice(toFiniteNumber(row.ice_settlement)),
  },
  {
    key: "open",
    label: "ICE Open",
    align: "right",
    render: (row) => fmtOptionalPrice(toFiniteNumber(row.open)),
  },
  {
    key: "high",
    label: "ICE High",
    align: "right",
    render: (row) => fmtOptionalPrice(toFiniteNumber(row.high)),
  },
  {
    key: "low",
    label: "ICE Low",
    align: "right",
    render: (row) => fmtOptionalPrice(toFiniteNumber(row.low)),
  },
  {
    key: "close",
    label: "ICE Close",
    align: "right",
    render: (row) => fmtOptionalPrice(toFiniteNumber(row.close)),
  },
  {
    key: "vwap_close",
    label: "ICE VWAP",
    align: "right",
    minClass: "min-w-[110px]",
    render: (row) => fmtOptionalPrice(toFiniteNumber(row.vwap_close)),
  },
  {
    key: "volume",
    label: "Volume",
    align: "right",
    render: (row) => fmtNumber(toFiniteNumber(row.volume), 0),
  },
  {
    key: "updated_at",
    label: "Updated",
    minClass: "min-w-[140px]",
    render: (row) => fmtTimestamp(row.updated_at),
  },
  {
    key: "created_at",
    label: "Created",
    minClass: "min-w-[140px]",
    render: (row) => fmtTimestamp(row.created_at),
  },
  {
    key: "contract_snapshot_trade_date",
    label: "Metadata Date",
    minClass: "min-w-[130px]",
    render: (row) => fmtIsoDate(row.contract_snapshot_trade_date),
  },
  {
    key: "contract_dates_updated_at",
    label: "Metadata Updated",
    minClass: "min-w-[150px]",
    render: (row) => fmtTimestamp(row.contract_dates_updated_at),
  },
  {
    key: "metadata_status",
    label: "Metadata",
    minClass: "min-w-[170px]",
    render: (row) => fmtText(row.metadata_status),
  },
];

const TRADE_LEG_DETAIL_COLUMNS: TradeLegDetailColumn[] = [
  {
    key: "trade_time",
    label: "Placed",
    getDisplayValue: (row) => fmtTradePlaced(row),
    getSortValue: (row) => `${fmtIsoDate(row.trade_date)} ${fmtText(row.trade_time)}`,
    render: (row) => fmtTradePlaced(row),
  },
  { key: "deal_id", label: "Deal", render: (row) => fmtText(row.deal_id) },
  { key: "leg_id", label: "Leg", render: (row) => fmtText(row.leg_id) },
  {
    key: "b_s",
    label: "B/S",
    className: (row) => sideClass(row.b_s),
    render: (row) => sideLabel(row.b_s),
  },
  { key: "product", label: "Product", render: (row) => fmtText(row.product) },
  { key: "hub", label: "Hub", render: (row) => fmtText(row.hub) },
  { key: "contract", label: "Contract", render: (row) => fmtContractDate(row.contract) },
  { key: "option", label: "Option", render: (row) => fmtText(row.option) },
  { key: "style", label: "Style", render: (row) => fmtText(row.style) },
  {
    key: "strike",
    label: "Strike",
    align: "right",
    render: (row) => fmtOptionalPrice(optionStrike(row, "strike")),
  },
  {
    key: "strike_2",
    label: "Strike 2",
    align: "right",
    render: (row) => fmtOptionalPrice(optionStrike(row, "strike_2")),
  },
  { key: "begin_date", label: "Begin", render: (row) => fmtIsoDate(row.begin_date) },
  { key: "end_date", label: "End", render: (row) => fmtIsoDate(row.end_date) },
  {
    key: "lots",
    label: "Lots",
    align: "right",
    render: (row) => fmtNumber(row.lots),
  },
  {
    key: "total_quantity",
    label: "Total QTY",
    align: "right",
    render: (row) => fmtNumber(row.total_quantity, 0),
  },
  {
    key: "price",
    label: "Price",
    align: "right",
    render: (row) => fmtPrice(row.price),
  },
  { key: "counterparty", label: "Counterparty", render: (row) => fmtText(row.counterparty) },
  { key: "trader", label: "Trader", render: (row) => fmtText(row.trader) },
  {
    key: "mark",
    label: "Mark",
    align: "right",
    render: (row) => fmtOptionalPrice(markValue(row)),
  },
  {
    key: "pnl",
    label: "PnL",
    align: "right",
    className: (row, marks) => {
      const value = pnlValue(row, marks);
      return value === null ? "" : quantityClass(value);
    },
    render: (row, marks) => fmtPnl(pnlValue(row, marks)),
  },
];

const DEFAULT_COLUMN_KEYS: ColumnKey[] = [
  "trade_date",
  "source_note",
  "trader",
  "asset_class",
  "region",
  "cc",
  "hub",
  "contract",
  "begin_date",
  "end_date",
  "b_s",
  "lots",
  "total_quantity",
  "signed_quantity",
  "price",
  "mark",
  "pnl",
  "active_mark_source",
];

const DEFAULT_POSITION_COLUMN_KEYS: PositionColumnKey[] = [
  "source_note",
  "trader",
  "asset_class",
  "region",
  "product",
  "hub",
  "cc",
  "contract",
  "begin_date",
  "end_date",
  "daily_pnl",
  "open_pnl",
  "net_lots",
  "delta_equivalent_lots",
  "settlement_mark",
  "avg_price",
  "delivery_status",
  "contributing_trade_count",
];

const DEFAULT_DAILY_SETTLEMENT_COLUMN_KEYS: DailySettlementColumnKey[] = [
  "source_note",
  "delivery_status",
  "date",
  "asset_class",
  "region",
  "cc",
  "ice_trading_screen_hub_name",
  "contract",
  "date_check",
  "begin_date",
  "end_date",
  "final_mark",
  "settlement",
  "ice_settlement",
  "volume",
  "updated_at",
];


function columnValue(
  row: IceTradeBlotterRow,
  key: ColumnKey,
  marks: MarkValues = {}
): string | number | null {
  if (key === "signed_quantity") return signedQuantity(row);
  if (key === "b_s") return sideLabel(row.b_s);
  if (key === "source_note") {
    return tradeBlotterSourceNote(row)
      .map((line) => `${line.label}: ${line.value}`)
      .join(" | ");
  }
  if (key === "mark") return markValue(row);
  if (key === "pnl") return pnlValue(row, marks);
  if (key === "active_mark_source") return markSourceLabel(row.active_mark_source);
  if (key === "strike" || key === "strike_2") return optionStrike(row, key);
  return row[key as keyof IceTradeBlotterRow] ?? null;
}

function positionRowKey(row: PositionRow): string {
  return row.position_key;
}

function isoDateKeyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarDateKeysBetween(startValue: string, endValue: string): string[] {
  const start = parseIceDate(startValue);
  const end = parseIceDate(endValue);
  if (!start || !end) return [];

  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const dates: string[] = [];
  while (cursor <= endDate && dates.length < 45) {
    dates.push(isoDateKeyFromDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function businessDateKeysBetween(startValue: string, endValue: string): string[] {
  return calendarDateKeysBetween(startValue, endValue).filter((dateKey) => {
    const date = parseIceDate(dateKey);
    if (!date) return false;
    const day = date.getDay();
    return day !== 0 && day !== 6;
  });
}

function defaultPnlBusinessDateKeys(): string[] {
  const cursor = new Date();
  const dates: string[] = [];
  while (dates.length < 5) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      dates.unshift(isoDateKeyFromDate(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return dates;
}

function defaultPnlDateRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  start.setDate(start.getDate() - 30);
  return {
    startDate: isoDateKeyFromDate(start),
    endDate: isoDateKeyFromDate(end),
  };
}

function pnlBusinessDateKeys({
  dateMode,
  singleDate,
  startDate,
  endDate,
}: {
  dateMode: DateMode;
  singleDate: string;
  startDate: string;
  endDate: string;
}): string[] {
  if (dateMode === "single") {
    return singleDate ? [singleDate] : defaultPnlBusinessDateKeys();
  }
  if (startDate && endDate) {
    const dates = businessDateKeysBetween(startDate, endDate);
    return dates.length > 0 ? dates : defaultPnlBusinessDateKeys();
  }
  return defaultPnlBusinessDateKeys();
}

function positionMarketLabel(row: PositionRow): string {
  if (row.settlement_source === "PJM_DA_LMP" || /\bDA\b/i.test(row.hub)) return "DA";
  if (row.settlement_source === "PJM_RT_LMP" || /\bRT\b/i.test(row.hub)) return "RT";
  if (row.settlement_source === "ICE_OPTION_SETTLEMENT") {
    return row.cc.toUpperCase() === "PHE" ? "Gas Option" : "Power Option";
  }
  return fmtText(row.settlement_source_key ?? row.settlement_source);
}

function normalizedExposureHub(row: PositionRow): string {
  return fmtText(row.hub)
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+\b(?:DA|RT)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function positionShapeLabel(row: PositionRow): string {
  const text = `${row.product} ${row.hub} ${row.contract}`.toLowerCase();
  if (text.includes("off-peak") || text.includes("offpeak")) return "Off-Peak";
  if (text.includes("peak")) return "Peak";
  return "Flat";
}

function positionInstrumentLabel(row: PositionRow): string {
  return row.option && row.option.trim() ? "Option" : "Future";
}

function tenorProductMeta(row: PositionTenorPivotRow): SourceNoteLine[] {
  return [
    { label: "Net Lots", value: fmtNumber(row.net_lots, 0) },
    { label: "Daily P&L", value: fmtPnl(row.daily_pnl) },
    { label: "Open P&L", value: fmtPnl(row.open_pnl) },
    { label: "Delta Lots", value: fmtNumber(row.delta_equivalent_lots, 0) },
    { label: "Delta QTY", value: fmtNumber(row.delta_equivalent_quantity, 0) },
    { label: "Source Positions", value: row.source_position_count.toLocaleString() },
    { label: "Source Legs", value: row.source_leg_count.toLocaleString() },
    { label: "Instrument", value: row.instrument },
    { label: "Product", value: row.product },
    { label: "Hub", value: row.hub },
    { label: "CC", value: row.cc },
    { label: "Market", value: row.market },
    { label: "Shape", value: row.shape },
    { label: "Option", value: fmtText(row.option) },
    { label: "Style", value: fmtText(row.style) },
    { label: "Strike", value: row.strike === null ? "--" : fmtOptionalPrice(row.strike) },
    { label: "Strike 2", value: row.strike_2 === null ? "--" : fmtOptionalPrice(row.strike_2) },
    { label: "Contracts", value: row.source_contracts || "--" },
  ];
}

function tenorProductLabel(row: PositionTenorPivotRow): string {
  if (row.instrument !== "Option") {
    return [row.hub, row.cc].filter(Boolean).join(" | ");
  }
  const optionDetail = [
    fmtText(row.option),
    fmtText(row.style),
    row.strike === null ? "" : fmtOptionalPrice(row.strike),
  ]
    .filter((value) => value && value !== "--")
    .join(" ");
  return [row.hub, row.cc, optionDetail || "Options"].filter(Boolean).join(" | ");
}

function tenorKindLabel(kind: PositionTenorColumn["kind"]): string {
  if (kind === "day") return "D";
  if (kind === "week") return "W";
  return "M";
}

function tenorKindClass(kind: PositionTenorColumn["kind"]): string {
  if (kind === "day") return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  if (kind === "week") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
}

function positionAggregateMetricLabel(metric: PositionAggregateMetric): string {
  if (metric === "delta_equivalent_lots") return "Delta Lots";
  if (metric === "daily_pnl") return "Daily P&L";
  if (metric === "open_pnl") return "Open P&L";
  return "Net Lots";
}

function positionAggregateMetricCellValue(
  row: PositionTenorPivotRow,
  columnKey: string,
  metric: PositionAggregateMetric
): number | null {
  if (metric === "daily_pnl") return row.tenor_daily_pnl[columnKey] ?? null;
  if (metric === "open_pnl") return row.tenor_open_pnl[columnKey] ?? null;
  if (metric === "delta_equivalent_lots") return row.tenor_delta_equivalent_lots[columnKey] ?? null;
  return row.tenor_lots[columnKey] ?? null;
}

function fmtPositionAggregateMetricValue(
  value: number | null,
  metric: PositionAggregateMetric
): string {
  if (value === null) return "--";
  return metric === "daily_pnl" || metric === "open_pnl"
    ? fmtPnl(value)
    : fmtNumber(value, 0);
}

function positionAggregateMetricClass(
  value: number | null,
  metric: PositionAggregateMetric
): string {
  if (value === null) return "text-gray-600";
  return quantityClass(value) || (metric === "daily_pnl" || metric === "open_pnl" ? "text-gray-300" : "text-gray-200");
}

function monthColumnFromDate(dateKeyValue: string): PositionTenorColumn {
  const parsed = parseIceDate(dateKeyValue);
  const key = parsed
    ? `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`
    : dateKeyValue.slice(0, 7);
  return {
    key: `month:${key}`,
    label: parsed
      ? parsed.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      : key,
    startDate: `${key}-01`,
    kind: "month",
  };
}

function compactTenorDateLabel(dateKeyValue: string): string {
  const parsed = parseIceDate(dateKeyValue);
  if (!parsed) return dateKeyValue;
  const weekday = parsed.toLocaleDateString("en-US", { weekday: "short" });
  const month = parsed.toLocaleDateString("en-US", { month: "short" });
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${weekday} ${month}-${day}`;
}

function startOfBusinessWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

function businessDayOffset(fromDateKey: string, toDateKey: string): number | null {
  const from = parseIceDate(fromDateKey);
  const to = parseIceDate(toDateKey);
  if (!from || !to) return null;

  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let offset = 0;
  while (cursor < to) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) offset += 1;
  }
  while (cursor > to) {
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) offset -= 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return offset;
}

function ordinalWeekLabel(weekOffset: number): string {
  if (weekOffset === 2) return "2nd Week";
  if (weekOffset === 3) return "3rd Week";
  if (weekOffset === 4) return "4th Week";
  const suffix = weekOffset % 10 === 1 && weekOffset % 100 !== 11
    ? "st"
    : weekOffset % 10 === 2 && weekOffset % 100 !== 12
      ? "nd"
      : weekOffset % 10 === 3 && weekOffset % 100 !== 13
        ? "rd"
        : "th";
  return `${weekOffset}${suffix} Week`;
}

function rollingDayTenorLabel(dateKeyValue: string, asOf: string): string {
  const offset = businessDayOffset(asOf, dateKeyValue);
  if (offset === null) return compactTenorDateLabel(dateKeyValue);
  if (offset <= 0) return "Bal Day";
  if (offset === 1) return "Next Day";
  return compactTenorDateLabel(dateKeyValue);
}

function rollingWeekTenorLabel(startDate: string, asOf: string): string {
  const start = parseIceDate(startDate);
  const asOfDate = parseIceDate(asOf);
  if (!start || !asOfDate) return compactTenorDateLabel(startDate);

  const startWeek = startOfBusinessWeek(start);
  const asOfWeek = startOfBusinessWeek(asOfDate);
  const weekOffset = Math.round(
    (startWeek.getTime() - asOfWeek.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  if (weekOffset <= 0) return "Bal Week";
  if (weekOffset === 1) return "Next Week";
  return ordinalWeekLabel(weekOffset);
}

function rollingTenorLabelFromIceSymbol(symbol: string | null | undefined): string | null {
  const code = /\s([DWP]\d)-IUS$/i.exec(symbol ?? "")?.[1]?.toUpperCase();
  if (!code) return null;
  if (code === "D0") return "Bal Day";
  if (code === "D1") return "Next Day";
  if (code === "W0") return "Bal Week";
  if (code === "W1") return "Next Week";
  if (code === "W2") return "2nd Week";
  if (code === "W3") return "3rd Week";
  if (code === "W4") return "4th Week";
  if (code === "P1") return "Weekend";
  return null;
}

function dayColumn(
  dateKeyValue: string,
  asOf: string,
  labelOverride?: string | null
): PositionTenorColumn {
  return {
    key: `day:${dateKeyValue}`,
    label: labelOverride ?? rollingDayTenorLabel(dateKeyValue, asOf),
    dateLabel: compactTenorDateLabel(dateKeyValue),
    startDate: dateKeyValue,
    kind: "day",
  };
}

function weekColumn(
  startDate: string,
  endDate: string,
  asOf: string,
  labelOverride?: string | null
): PositionTenorColumn {
  return {
    key: `week:${startDate}:${endDate}`,
    label: labelOverride ?? rollingWeekTenorLabel(startDate, asOf),
    dateLabel: `${compactTenorDateLabel(startDate)} to ${compactTenorDateLabel(endDate)}`,
    startDate,
    kind: "week",
  };
}

function tenorColumnsForPosition(row: PositionRow, asOf: string): PositionTenorColumn[] {
  const tenorStartDate = row.settlement_contract_start_date ?? row.begin_date;
  const tenorEndDate = row.settlement_contract_end_date ?? row.end_date;
  const flowDates = calendarDateKeysBetween(tenorStartDate, tenorEndDate);
  if (flowDates.length === 0) return [];

  const resolvedTenorLabel = rollingTenorLabelFromIceSymbol(row.ice_symbol);
  const contract = row.contract.trim().toLowerCase();
  const isOption = row.settlement_source === "ICE_OPTION_SETTLEMENT";
  const isMonthly =
    row.settlement_contract_family === "Monthly" ||
    (isOption && /^[a-z]{3,4}\d{2}$/i.test(row.contract.trim())) ||
    /^[a-z]{3}\d{2}$/i.test(row.contract.trim());
  const isWeekly =
    row.settlement_contract_family === "Weekly" ||
    contract.includes("week");

  if (isMonthly) return [monthColumnFromDate(flowDates[0])];
  if (isWeekly) {
    return [weekColumn(flowDates[0], flowDates[flowDates.length - 1], asOf, resolvedTenorLabel)];
  }
  return flowDates
    .filter((dateKeyValue) => {
      const parsed = parseIceDate(dateKeyValue);
      if (!parsed) return false;
      const day = parsed.getDay();
      return day >= 1 && day <= 5;
    })
    .map((dateKeyValue) => dayColumn(dateKeyValue, asOf, resolvedTenorLabel));
}

function buildPositionTenorPivot(
  rows: PositionRow[],
  asOf: string
): { columns: PositionTenorColumn[]; rows: PositionTenorPivotRow[] } {
  const columnsByKey = new Map<string, PositionTenorColumn>();
  const pivots = new Map<
    string,
    {
      product: string;
      hub: string;
      cc: string;
      market: string;
      shape: string;
      instrument: string;
      option: string;
      style: string;
      strike: number | null;
      strike2: number | null;
      netLots: number;
      dailyPnl: number | null;
      openPnl: number | null;
      deltaEquivalentLots: number | null;
      deltaEquivalentQuantity: number | null;
      sourcePositionKeys: Set<string>;
      sourcePositions: PositionRow[];
      sourceLegCount: number;
      sourceContracts: Set<string>;
      tenorLots: Record<string, number>;
      tenorDailyPnl: Record<string, number>;
      tenorOpenPnl: Record<string, number>;
      tenorDeltaEquivalentLots: Record<string, number>;
      tenorDeltaEquivalentQuantity: Record<string, number>;
    }
  >();

  rows.forEach((row) => {
    const tenorColumns = tenorColumnsForPosition(row, asOf);
    if (tenorColumns.length === 0) return;
    const product = fmtText(row.product);
    const hub = normalizedExposureHub(row);
    const cc = fmtText(row.cc);
    const market = positionMarketLabel(row);
    const shape = positionShapeLabel(row);
    const instrument = positionInstrumentLabel(row);
    const isOptionInstrument = instrument === "Option";
    const option = isOptionInstrument ? "Options" : fmtText(row.option);
    const style = isOptionInstrument ? "Mixed" : fmtText(row.style);
    const key = [product, hub, cc, instrument].join("|");
    const pivot =
      pivots.get(key) ??
      {
        product,
        hub,
        cc,
        market,
        shape,
        instrument,
        option,
        style,
        strike: isOptionInstrument ? null : row.strike,
        strike2: isOptionInstrument ? null : row.strike_2,
        netLots: 0,
        dailyPnl: null,
        openPnl: null,
        deltaEquivalentLots: null,
        deltaEquivalentQuantity: null,
        sourcePositionKeys: new Set<string>(),
        sourcePositions: [],
        sourceLegCount: 0,
        sourceContracts: new Set<string>(),
        tenorLots: {},
        tenorDailyPnl: {},
        tenorOpenPnl: {},
        tenorDeltaEquivalentLots: {},
        tenorDeltaEquivalentQuantity: {},
      };

    pivot.netLots += row.net_lots;
    if (row.daily_pnl !== null) {
      pivot.dailyPnl = (pivot.dailyPnl ?? 0) + row.daily_pnl;
    }
    if (row.open_pnl !== null) {
      pivot.openPnl = (pivot.openPnl ?? 0) + row.open_pnl;
    }
    if (row.delta_equivalent_lots !== null) {
      pivot.deltaEquivalentLots = (pivot.deltaEquivalentLots ?? 0) + row.delta_equivalent_lots;
    }
    if (row.delta_equivalent_quantity !== null) {
      pivot.deltaEquivalentQuantity = (pivot.deltaEquivalentQuantity ?? 0) + row.delta_equivalent_quantity;
    }
    pivot.sourcePositionKeys.add(positionRowKey(row));
    pivot.sourcePositions.push(row);
    pivot.sourceLegCount += row.contributing_trade_count;
    pivot.sourceContracts.add(fmtContractDate(row.contract));
    tenorColumns.forEach((column) => {
      columnsByKey.set(column.key, column);
      pivot.tenorLots[column.key] = (pivot.tenorLots[column.key] ?? 0) + row.net_lots;
      if (row.daily_pnl !== null) {
        pivot.tenorDailyPnl[column.key] = (pivot.tenorDailyPnl[column.key] ?? 0) + row.daily_pnl;
      }
      if (row.open_pnl !== null) {
        pivot.tenorOpenPnl[column.key] = (pivot.tenorOpenPnl[column.key] ?? 0) + row.open_pnl;
      }
      if (row.delta_equivalent_lots !== null) {
        pivot.tenorDeltaEquivalentLots[column.key] =
          (pivot.tenorDeltaEquivalentLots[column.key] ?? 0) + row.delta_equivalent_lots;
      }
      if (row.delta_equivalent_quantity !== null) {
        pivot.tenorDeltaEquivalentQuantity[column.key] =
          (pivot.tenorDeltaEquivalentQuantity[column.key] ?? 0) + row.delta_equivalent_quantity;
      }
    });
    pivots.set(key, pivot);
  });

  const columns = Array.from(columnsByKey.values()).sort((first, second) => {
    const order = { day: 0, week: 1, month: 2 };
    const kindCompare = order[first.kind] - order[second.kind];
    if (kindCompare !== 0) return kindCompare;
    const dateCompare = first.startDate.localeCompare(second.startDate);
    if (dateCompare !== 0) return dateCompare;
    return first.label.localeCompare(second.label);
  });

  const pivotRows = Array.from(pivots.entries())
    .map(([key, pivot]) => {
      const strikes = Array.from(
        new Set(
          pivot.sourcePositions
            .map((row) => row.strike)
            .filter((value): value is number => value !== null)
        )
      );
      const strike2s = Array.from(
        new Set(
          pivot.sourcePositions
            .map((row) => row.strike_2)
            .filter((value): value is number => value !== null)
        )
      );

      return {
        key,
        product: pivot.product,
        hub: pivot.hub,
        cc: pivot.cc,
        market: uniqueText(pivot.sourcePositions.map(positionMarketLabel)),
        shape: uniqueText(pivot.sourcePositions.map(positionShapeLabel)),
        instrument: uniqueText(pivot.sourcePositions.map(positionInstrumentLabel)),
        option: uniqueText(
          pivot.sourcePositions.map((row) =>
            positionInstrumentLabel(row) === "Option" ? "Options" : row.option
          )
        ),
        style: uniqueText(
          pivot.sourcePositions.map((row) =>
            positionInstrumentLabel(row) === "Option" ? "Mixed" : row.style
          )
        ),
        strike: strikes.length === 1 ? strikes[0] : null,
        strike_2: strike2s.length === 1 ? strike2s[0] : null,
        net_lots: pivot.netLots,
        daily_pnl: pivot.dailyPnl,
        open_pnl: pivot.openPnl,
        delta_equivalent_lots: pivot.deltaEquivalentLots,
        delta_equivalent_quantity: pivot.deltaEquivalentQuantity,
        source_position_count: pivot.sourcePositionKeys.size,
        source_leg_count: pivot.sourceLegCount,
        source_contracts: Array.from(pivot.sourceContracts).sort().join(", "),
        source_positions: pivot.sourcePositions,
        tenor_lots: pivot.tenorLots,
        tenor_daily_pnl: pivot.tenorDailyPnl,
        tenor_open_pnl: pivot.tenorOpenPnl,
        tenor_delta_equivalent_lots: pivot.tenorDeltaEquivalentLots,
        tenor_delta_equivalent_quantity: pivot.tenorDeltaEquivalentQuantity,
      };
    })
    .sort((first, second) => {
      const productCompare = first.product.localeCompare(second.product);
      if (productCompare !== 0) return productCompare;
      const hubCompare = first.hub.localeCompare(second.hub);
      if (hubCompare !== 0) return hubCompare;
      const marketCompare = first.market.localeCompare(second.market);
      if (marketCompare !== 0) return marketCompare;
      return first.shape.localeCompare(second.shape);
    });

  return { columns, rows: pivotRows };
}

function positionSourceNote(row: PositionRow): SourceNoteLine[] {
  const markDelta =
    row.settlement_mark === null || row.prior_settlement_mark === null
      ? null
      : row.settlement_mark - row.prior_settlement_mark;
  return [
    { label: "ICE Symbol", value: fmtText(row.ice_symbol) },
    { label: "Option Symbol", value: fmtText(row.option_symbol) },
    { label: "Underlying", value: fmtText(row.underlying_symbol) },
    { label: "Asset", value: fmtText(row.asset_class) },
    { label: "Region", value: fmtText(row.region) },
    { label: "Option Expiry", value: fmtIsoDate(row.option_expiration_date) },
    { label: "Expiry Source", value: fmtText(row.option_expiry_source) },
    { label: "Last Option Settle", value: fmtIsoDate(row.option_last_settlement_date) },
    { label: "Mark", value: fmtOptionalPrice(row.settlement_mark) },
    { label: "Mark Date", value: fmtIsoDate(row.mark_trade_date) },
    { label: "Prev Mark", value: fmtOptionalPrice(row.prior_settlement_mark) },
    { label: "Prev Mark Date", value: fmtIsoDate(row.prior_mark_trade_date) },
    { label: "Mark Move", value: fmtOptionalPrice(markDelta) },
    { label: "Daily P&L", value: fmtPnl(row.daily_pnl) },
    { label: "Open P&L", value: fmtPnl(row.open_pnl) },
    { label: "Greek Status", value: fmtText(row.option_greek_status) },
    { label: "Greek Quote Date", value: fmtIsoDate(row.option_greek_quote_date) },
    { label: "Greek Reason", value: fmtText(row.option_greek_reason) },
    { label: "Delta", value: fmtNumber(row.option_delta, 4) },
    { label: "Delta Lots", value: fmtNumber(row.delta_equivalent_lots, 0) },
    { label: "Delta QTY", value: fmtNumber(row.delta_equivalent_quantity, 0) },
    { label: "Settle Source", value: fmtText(row.settlement_source) },
    { label: "Source Key", value: fmtText(row.settlement_source_key) },
    { label: "Days to Expiry", value: fmtNumber(row.days_to_expiry, 0) },
    { label: "Delivery", value: fmtText(row.delivery_status) },
    { label: "Settle Status", value: fmtText(row.settlement_status) },
    { label: "Latest Trade", value: fmtIsoDate(row.latest_trade_date) },
    { label: "Legs", value: fmtNumber(row.contributing_trade_count, 0) },
  ];
}

function positionColumnValue(
  row: PositionRow,
  key: PositionColumnKey
): string | number | null {
  if (key === "source_note") {
    return positionSourceNote(row)
      .map((line) => `${line.label}: ${line.value}`)
      .join(" | ");
  }
  if (
    key === "strike" ||
    key === "strike_2" ||
    key === "net_lots" ||
    key === "net_quantity" ||
    key === "avg_price" ||
    key === "settlement_mark" ||
    key === "prior_settlement_mark" ||
    key === "option_delta" ||
    key === "delta_equivalent_lots" ||
    key === "delta_equivalent_quantity" ||
    key === "daily_pnl" ||
    key === "open_pnl" ||
    key === "days_to_expiry" ||
    key === "contributing_trade_count"
  ) {
    return toFiniteNumber(row[key]);
  }
  return row[key] ?? null;
}

function positionColumnDisplayValue(
  row: PositionRow,
  key: PositionColumnKey
): string {
  const value = positionColumnValue(row, key);
  if (value === null) return "";
  if (key === "contract") return fmtContractDate(String(value));
  if (key === "as_of" || key === "begin_date" || key === "end_date" || key === "latest_trade_date" || key === "prior_mark_trade_date") {
    return fmtIsoDate(String(value));
  }
  if (key === "latest_updated_at") return fmtTimestamp(String(value));
  if (
    key === "strike" ||
    key === "strike_2" ||
    key === "avg_price" ||
    key === "settlement_mark" ||
    key === "prior_settlement_mark"
  ) {
    return fmtPrice(Number(value));
  }
  if (key === "option_delta") return fmtNumber(Number(value), 4);
  if (key === "daily_pnl" || key === "open_pnl") return fmtPnl(Number(value));
  if (
    key === "net_lots" ||
    key === "net_quantity" ||
    key === "delta_equivalent_lots" ||
    key === "delta_equivalent_quantity" ||
    key === "days_to_expiry" ||
    key === "contributing_trade_count"
  ) {
    return fmtNumber(Number(value), 0);
  }
  return String(value);
}

function positionColumnSortValue(
  row: PositionRow,
  key: PositionColumnKey
): string | number | null {
  const value = positionColumnValue(row, key);
  if (value === null) return null;
  if (key === "as_of" || key === "contract" || key === "begin_date" || key === "end_date" || key === "latest_trade_date" || key === "prior_mark_trade_date") {
    const parsedDate = parseIceDate(String(value));
    if (parsedDate) return parsedDate.getTime();
  }
  if (key === "latest_updated_at") {
    const parsedDate = new Date(String(value));
    if (!Number.isNaN(parsedDate.getTime())) return parsedDate.getTime();
  }
  return value;
}

function positionRowMatchesColumnFilter(
  row: PositionRow,
  key: PositionColumnKey,
  selectedValues: string[]
): boolean {
  if (selectedValues.length === 0) return true;
  const filterText = positionColumnDisplayValue(row, key).toLowerCase();
  return selectedValues.some((value) => filterText === value.trim().toLowerCase());
}

function comparePositionColumnValues(
  firstRow: PositionRow,
  secondRow: PositionRow,
  sort: PositionSortState
): number {
  const firstValue = positionColumnSortValue(firstRow, sort.key);
  const secondValue = positionColumnSortValue(secondRow, sort.key);

  if (firstValue === null && secondValue === null) return 0;
  if (firstValue === null) return 1;
  if (secondValue === null) return -1;

  const direction = sort.direction === "asc" ? 1 : -1;
  if (typeof firstValue === "number" && typeof secondValue === "number") {
    return (firstValue - secondValue) * direction;
  }

  return String(firstValue).localeCompare(String(secondValue), undefined, {
    numeric: true,
    sensitivity: "base",
  }) * direction;
}

function positionLegRowKey(row: PositionLegRow): string {
  return `${row.deal_id}-${row.leg_id}-${row.trade_date}-${row.trade_time}`;
}

function positionLegSignedLots(row: PositionLegRow): number {
  return normalizedSide(row.b_s) === "sell" ? -Math.abs(row.lots) : Math.abs(row.lots);
}

function positionLegSignedQuantity(row: PositionLegRow): number {
  return normalizedSide(row.b_s) === "sell"
    ? -Math.abs(row.total_quantity)
    : Math.abs(row.total_quantity);
}

function positionLegColumnValue(
  row: PositionLegRow,
  key: PositionLegColumnKey
): string | number | null {
  if (key === "trade_time") return fmtPositionLegPlaced(row);
  if (key === "b_s") return sideLabel(row.b_s);
  if (key === "signed_quantity") return positionLegSignedQuantity(row);
  if (
    key === "strike" ||
    key === "strike_2" ||
    key === "lots" ||
    key === "total_quantity" ||
    key === "price"
  ) {
    return toFiniteNumber(row[key]);
  }
  return row[key] ?? null;
}

function positionLegColumnDisplayValue(
  row: PositionLegRow,
  column: PositionLegColumnDefinition
): string {
  if (column.getDisplayValue) return column.getDisplayValue(row);
  const value = positionLegColumnValue(row, column.key);
  if (value === null) return "";
  if (column.key === "contract") return fmtContractDate(String(value));
  if (column.key === "begin_date" || column.key === "end_date") {
    return fmtIsoDate(String(value));
  }
  if (column.key === "strike" || column.key === "strike_2" || column.key === "price") {
    return fmtPrice(Number(value));
  }
  if (
    column.key === "lots" ||
    column.key === "total_quantity" ||
    column.key === "signed_quantity"
  ) {
    return fmtNumber(Number(value), 0);
  }
  return String(value);
}

function positionLegColumnSortValue(
  row: PositionLegRow,
  column: PositionLegColumnDefinition
): string | number | null {
  if (column.getSortValue) return column.getSortValue(row);
  const value = positionLegColumnValue(row, column.key);
  if (value === null) return null;
  if (column.key === "begin_date" || column.key === "end_date" || column.key === "trade_time") {
    const parsedDate = parseIceDate(String(value));
    if (parsedDate) return parsedDate.getTime();
  }
  return value;
}

function positionLegMatchesColumnFilter(
  row: PositionLegRow,
  column: PositionLegColumnDefinition,
  selectedValues: string[]
): boolean {
  if (selectedValues.length === 0) return true;
  const filterText = positionLegColumnDisplayValue(row, column).toLowerCase();
  return selectedValues.some((value) => filterText === value.trim().toLowerCase());
}

function comparePositionLegColumnValues(
  firstRow: PositionLegRow,
  secondRow: PositionLegRow,
  sort: PositionLegSortState
): number {
  const column = POSITION_LEG_COLUMN_DEFINITIONS.find((item) => item.key === sort.key);
  if (!column) return 0;

  const firstValue = positionLegColumnSortValue(firstRow, column);
  const secondValue = positionLegColumnSortValue(secondRow, column);

  if (firstValue === null && secondValue === null) return 0;
  if (firstValue === null) return 1;
  if (secondValue === null) return -1;

  const direction = sort.direction === "asc" ? 1 : -1;
  if (typeof firstValue === "number" && typeof secondValue === "number") {
    return (firstValue - secondValue) * direction;
  }

  return String(firstValue).localeCompare(String(secondValue), undefined, {
    numeric: true,
    sensitivity: "base",
  }) * direction;
}

function selectedPositionLegSummaryFromRows(
  rows: PositionLegRow[]
): SelectedPositionLegSummary {
  if (rows.length === 0) return EMPTY_SELECTED_POSITION_LEG_SUMMARY;

  return {
    rowCount: rows.length,
    lots: rows.reduce((sum, row) => sum + positionLegSignedLots(row), 0),
    totalQuantity: rows.reduce((sum, row) => sum + row.total_quantity, 0),
    signedQuantity: rows.reduce((sum, row) => sum + positionLegSignedQuantity(row), 0),
  };
}

function selectedPnlSummaryFromCells(
  rows: IceTradeBlotterRow[],
  selectedCellKeys: Set<string>,
  marks: MarkValues
): SelectedPnlSummary {
  if (selectedCellKeys.size === 0) return EMPTY_SELECTED_PNL_SUMMARY;

  const selectedRowKeys = new Set<string>();
  selectedCellKeys.forEach((key) => {
    const separatorIndex = key.lastIndexOf("::");
    if (separatorIndex > 0) selectedRowKeys.add(key.slice(0, separatorIndex));
  });

  let markedRowCount = 0;
  let total = 0;

  rows.forEach((row) => {
    const rowKey = tradeRowKey(row);
    if (!selectedRowKeys.has(rowKey)) return;

    const value = pnlValue(row, marks);
    if (value === null) return;
    markedRowCount += 1;
    total += value;
  });

  return {
    selectedRowCount: selectedRowKeys.size,
    markedRowCount,
    total: markedRowCount === 0 ? null : total,
  };
}

function columnDisplayValue(
  row: IceTradeBlotterRow,
  key: ColumnKey,
  marks: MarkValues = {}
): string {
  const value = columnValue(row, key, marks);
  if (value === null) return "";
  if (key === "contract") return fmtContractDate(String(value));
  if (key === "trade_date" || key === "begin_date" || key === "end_date") {
    return fmtIsoDate(String(value));
  }
  if (DATE_LIKE_COLUMNS.has(key)) return fmtDate(String(value));
  if (key === "mark") return fmtPrice(Number(value));
  if (key === "pnl") return fmtPnl(Number(value));
  return String(value);
}

function columnSortValue(
  row: IceTradeBlotterRow,
  key: ColumnKey,
  marks: MarkValues = {}
): string | number | null {
  if (key === "contract") return tradeContractSortValue(row);
  const value = columnValue(row, key, marks);
  if (value === null) return null;
  if (DATE_LIKE_COLUMNS.has(key)) {
    const parsedDate = parseIceDate(String(value));
    if (parsedDate) return parsedDate.getTime();
  }
  return value;
}

function columnFilterText(
  row: IceTradeBlotterRow,
  key: ColumnKey,
  marks: MarkValues = {}
): string {
  return columnDisplayValue(row, key, marks).toLowerCase();
}

function rowMatchesColumnFilter(
  row: IceTradeBlotterRow,
  key: ColumnKey,
  selectedValues: string[],
  marks: MarkValues = {}
): boolean {
  if (selectedValues.length === 0) return true;

  const filterText = columnFilterText(row, key, marks);
  return selectedValues.some((value) => filterText === value.trim().toLowerCase());
}

function compareColumnValues(
  firstRow: IceTradeBlotterRow,
  secondRow: IceTradeBlotterRow,
  sort: SortState,
  marks: MarkValues = {}
): number {
  const firstValue = columnSortValue(firstRow, sort.key, marks);
  const secondValue = columnSortValue(secondRow, sort.key, marks);

  if (firstValue === null && secondValue === null) return 0;
  if (firstValue === null) return 1;
  if (secondValue === null) return -1;

  const direction = sort.direction === "asc" ? 1 : -1;
  if (typeof firstValue === "number" && typeof secondValue === "number") {
    return (firstValue - secondValue) * direction;
  }

  return String(firstValue).localeCompare(String(secondValue), undefined, {
    numeric: true,
    sensitivity: "base",
  }) * direction;
}

function tradeLegColumnDisplayValue(
  row: IceTradeBlotterRow,
  column: TradeLegDetailColumn,
  marks: MarkValues = {}
): string {
  if (column.getDisplayValue) return column.getDisplayValue(row, marks);
  return columnDisplayValue(row, column.key, marks);
}

function tradeLegColumnSortValue(
  row: IceTradeBlotterRow,
  column: TradeLegDetailColumn,
  marks: MarkValues = {}
): string | number | null {
  if (column.getSortValue) return column.getSortValue(row, marks);
  return columnSortValue(row, column.key, marks);
}

function rowMatchesTradeLegColumnFilter(
  row: IceTradeBlotterRow,
  column: TradeLegDetailColumn,
  selectedValues: string[],
  marks: MarkValues = {}
): boolean {
  if (selectedValues.length === 0) return true;

  const filterText = tradeLegColumnDisplayValue(row, column, marks).toLowerCase();
  return selectedValues.some((value) => filterText === value.trim().toLowerCase());
}

function compareTradeLegColumnValues(
  firstRow: IceTradeBlotterRow,
  secondRow: IceTradeBlotterRow,
  sort: SortState,
  columns: TradeLegDetailColumn[],
  marks: MarkValues = {}
): number {
  const column = columns.find((item) => item.key === sort.key);
  if (!column) return 0;

  const firstValue = tradeLegColumnSortValue(firstRow, column, marks);
  const secondValue = tradeLegColumnSortValue(secondRow, column, marks);

  if (firstValue === null && secondValue === null) return 0;
  if (firstValue === null) return 1;
  if (secondValue === null) return -1;

  const direction = sort.direction === "asc" ? 1 : -1;
  if (typeof firstValue === "number" && typeof secondValue === "number") {
    return (firstValue - secondValue) * direction;
  }

  return String(firstValue).localeCompare(String(secondValue), undefined, {
    numeric: true,
    sensitivity: "base",
  }) * direction;
}

function selectedTradeLegSummaryFromRows(
  rows: IceTradeBlotterRow[],
  marks: MarkValues
): SelectedTradeLegSummary {
  if (rows.length === 0) return EMPTY_SELECTED_TRADE_LEG_SUMMARY;

  let pnlMarkedCount = 0;
  let pnlTotal = 0;

  rows.forEach((row) => {
    const value = pnlValue(row, marks);
    if (value === null) return;
    pnlMarkedCount += 1;
    pnlTotal += value;
  });

  return {
    rowCount: rows.length,
    lots: rows.reduce((sum, row) => sum + signedLots(row), 0),
    totalQuantity: rows.reduce((sum, row) => sum + row.total_quantity, 0),
    signedQuantity: rows.reduce((sum, row) => sum + signedQuantity(row), 0),
    pnlMarkedCount,
    pnlTotal: pnlMarkedCount === 0 ? null : pnlTotal,
  };
}

function dailySettlementRowKey(row: DailySettlementRow): string {
  return `${row.symbol}-${row.date}`;
}

function dailySettlementProductDisplayInput(row: DailySettlementRow) {
  return {
    cc: row.cc,
    blotterCc: row.blotter_cc,
    hub: row.hub,
    iceTradingScreenHubName: row.ice_trading_screen_hub_name,
    market: row.market,
    iceContractSize: row.ice_contract_size,
    contractLabel: row.contract,
  };
}

function dailySettlementProductDisplay(row: DailySettlementRow): string {
  return formatIceTradeProductDisplay(dailySettlementProductDisplayInput(row));
}

function dailySettlementProductKey(row: DailySettlementRow): string {
  return [dailySettlementProductDisplay(row), row.asset_class, row.region]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .join("|");
}

function dailySettlementBeginDate(row: DailySettlementRow): string {
  return row.begin_date || row.ice_begin_date || "";
}

function dailySettlementEndDate(row: DailySettlementRow): string {
  return row.end_date || row.ice_end_date || "";
}

function isoDateDaysBefore(value: string, days: number): string {
  const parsedDate = parseIceDate(value);
  if (!parsedDate) return value;
  const shifted = new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate()
  );
  shifted.setDate(shifted.getDate() - days);
  return isoDateKeyFromDate(shifted);
}

function dailySettlementCellSelectionKey(
  rowKey: string,
  columnKey: DailySettlementColumnKey
): string {
  return `${rowKey}::${columnKey}`;
}

function dailySettlementCellSelectionKeyFromCoordinate(
  coordinate: DailySettlementCellCoordinate
): string {
  return dailySettlementCellSelectionKey(coordinate.rowKey, coordinate.columnKey);
}

function dailySettlementCellSelectionKeysInRange(
  anchor: DailySettlementCellCoordinate,
  focus: DailySettlementCellCoordinate,
  rows: DailySettlementRow[],
  columns: DailySettlementColumnDefinition[]
): Set<string> {
  const minRow = Math.min(anchor.rowIndex, focus.rowIndex);
  const maxRow = Math.max(anchor.rowIndex, focus.rowIndex);
  const minColumn = Math.min(anchor.columnIndex, focus.columnIndex);
  const maxColumn = Math.max(anchor.columnIndex, focus.columnIndex);
  const selected = new Set<string>();

  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) continue;
    const rowKey = dailySettlementRowKey(row);
    for (let columnIndex = minColumn; columnIndex <= maxColumn; columnIndex += 1) {
      const column = columns[columnIndex];
      if (!column) continue;
      selected.add(dailySettlementCellSelectionKey(rowKey, column.key));
    }
  }

  return selected;
}

function dailySettlementColumnValue(
  row: DailySettlementRow,
  key: DailySettlementColumnKey
): string | number | null {
  if (key === "source_note") {
    return dailySettlementSourceNote(row)
      .map((line) => `${line.label}: ${line.value}`)
      .join(" | ");
  }
  if (key === "delivery_status") return settleAvailability(row).delivery;
  if (key === "date_check") return dailySettlementDateCheckLabel(row);
  if (
    key === "settlement" ||
    key === "ice_settlement" ||
    key === "open" ||
    key === "high" ||
    key === "low" ||
    key === "close" ||
    key === "vwap_close" ||
    key === "volume"
  ) {
    return toFiniteNumber(row[key]);
  }
  if (key === "final_mark") return dailySettlementActiveMark(row);
  return row[key] ?? null;
}

function dailySettlementColumnDisplayValue(
  row: DailySettlementRow,
  key: DailySettlementColumnKey
): string {
  const value = dailySettlementColumnValue(row, key);
  if (value === null) return "";
  if (
    key === "date" ||
    key === "begin_date" ||
    key === "end_date" ||
    key === "ice_begin_date" ||
    key === "ice_end_date"
  ) {
    return fmtIsoDate(String(value));
  }
  if (
    key === "created_at" ||
    key === "updated_at" ||
    key === "contract_dates_updated_at"
  ) {
    return fmtTimestamp(String(value));
  }
  if (key === "contract_snapshot_trade_date") return fmtIsoDate(String(value));
  if (
    key === "settlement" ||
    key === "ice_settlement" ||
    key === "open" ||
    key === "high" ||
    key === "low" ||
    key === "close" ||
    key === "vwap_close"
  ) {
    return fmtPrice(Number(value));
  }
  if (key === "volume") {
    return fmtNumber(Number(value), 0);
  }
  return String(value);
}

function dailySettlementColumnSortValue(
  row: DailySettlementRow,
  key: DailySettlementColumnKey
): string | number | null {
  if (key === "contract" || key === "contract_family") {
    return dailySettlementContractSortValue(row);
  }
  if (key === "date_check") {
    return DAILY_SETTLEMENT_DATE_CHECK_META[dailySettlementDateCheckStatus(row)].sort;
  }
  const value = dailySettlementColumnValue(row, key);
  if (value === null) return null;
  if (DAILY_SETTLEMENT_DATE_LIKE_COLUMNS.has(key)) {
    const parsedDate = parseIceDate(String(value));
    if (parsedDate) return parsedDate.getTime();
  }
  return value;
}

function dailySettlementRowMatchesColumnFilter(
  row: DailySettlementRow,
  key: DailySettlementColumnKey,
  selectedValues: string[]
): boolean {
  if (selectedValues.length === 0) return true;
  const filterText = dailySettlementColumnDisplayValue(row, key).toLowerCase();
  return selectedValues.some((value) => filterText === value.trim().toLowerCase());
}

function compareDailySettlementColumnValues(
  firstRow: DailySettlementRow,
  secondRow: DailySettlementRow,
  sort: DailySettlementSortState
): number {
  const firstValue = dailySettlementColumnSortValue(firstRow, sort.key);
  const secondValue = dailySettlementColumnSortValue(secondRow, sort.key);

  if (firstValue === null && secondValue === null) return 0;
  if (firstValue === null) return 1;
  if (secondValue === null) return -1;

  const direction = sort.direction === "asc" ? 1 : -1;
  if (typeof firstValue === "number" && typeof secondValue === "number") {
    return (firstValue - secondValue) * direction;
  }

  return String(firstValue).localeCompare(String(secondValue), undefined, {
    numeric: true,
    sensitivity: "base",
  }) * direction;
}

function sortFilterOption(first: string, second: string): number {
  const firstDate = parseIceDate(first);
  const secondDate = parseIceDate(second);
  if (firstDate && secondDate) return firstDate.getTime() - secondDate.getTime();
  return first.localeCompare(second, undefined, { numeric: true, sensitivity: "base" });
}

function csvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function csvFileSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function freshnessFromPayload(
  payload: IceTradeBlotterPayload | null
): IceTradeBlotterFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  const hasRows = payload.summary.rowCount > 0;
  return {
    status: hasRows ? "Loaded" : "Empty",
    statusClass: hasRows
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-gray-700 bg-gray-900 text-gray-400",
    summary: `${fmtDate(payload.summary.latestTradeDate)} | ${payload.summary.rowCount.toLocaleString()} rows`,
    targetDateLabel: `${fmtDate(payload.startDate)} to ${fmtDate(payload.endDate)}`,
    latestDateLabel: fmtDate(payload.summary.latestTradeDate),
    latestUpdateLabel: fmtTimestamp(payload.summary.latestUpdatedAt),
    rowCountLabel: payload.summary.rowCount.toLocaleString(),
  };
}

function freshnessFromPositionsPayload(
  payload: PositionsPayload | null
): IceTradeBlotterFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  const hasRows = payload.summary.rowCount > 0;
  return {
    status: hasRows ? "Loaded" : "Empty",
    statusClass: hasRows
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-gray-700 bg-gray-900 text-gray-400",
    summary: `${fmtDate(payload.asOf)} | ${payload.summary.rowCount.toLocaleString()} open positions`,
    targetDateLabel: fmtDate(payload.asOf),
    latestDateLabel: fmtDate(payload.summary.latestTradeDate),
    latestUpdateLabel: fmtTimestamp(payload.summary.latestUpdatedAt),
    rowCountLabel: payload.summary.rowCount.toLocaleString(),
  };
}

function buildApiUrl({
  view,
  dateMode,
  singleDate,
  startDate,
  endDate,
  trader,
  product,
  hub,
  contract,
  productScope,
  refresh,
}: {
  view: TradeBlotterView;
  dateMode: DateMode;
  singleDate: string;
  startDate: string;
  endDate: string;
  trader: string;
  product: string;
  hub: string;
  contract: string;
  productScope: IceTradeProductScope;
  refresh: boolean;
}): string {
  if (view === "products") {
    const params = new URLSearchParams();
    params.set("scope", productScope);
    if (refresh) params.set("refresh", "1");
    const queryString = params.toString();
    return `/api/ice-trade-blotter/product-dictionary${queryString ? `?${queryString}` : ""}`;
  }

  if (view === "pnl") {
    const params = new URLSearchParams();
    const asOf = singleDate || endDate || startDate;
    if (asOf) params.set("asOf", asOf);
    params.set("scope", productScope);
    if (refresh) params.set("refresh", "1");
    const queryString = params.toString();
    return `/api/ice-trade-blotter/positions${queryString ? `?${queryString}` : ""}`;
  }

  if (view === "positions") {
    const params = new URLSearchParams();
    const asOf = singleDate || endDate || startDate;
    if (asOf) params.set("asOf", asOf);
    params.set("scope", productScope);
    if (refresh) params.set("refresh", "1");
    const queryString = params.toString();
    return `/api/ice-trade-blotter/positions${queryString ? `?${queryString}` : ""}`;
  }

  const resolvedStart = dateMode === "single" ? singleDate : startDate;
  const resolvedEnd = dateMode === "single" ? singleDate : endDate;
  const params = new URLSearchParams({ mode: dateMode });
  if (view !== "settles") {
    if (resolvedStart) params.set("start", resolvedStart);
    if (resolvedEnd) params.set("end", resolvedEnd);
  }
  if (trader) params.set("trader", trader);
  if (product) params.set("product", product);
  if (hub) params.set("hub", hub);
  if (contract) params.set("contract", contract);
  params.set("scope", productScope);
  if (refresh) params.set("refresh", "1");
  const path =
    view === "settles"
      ? "/api/ice-trade-blotter/daily-settlements"
      : "/api/ice-trade-blotter/settlements";
  return `${path}?${params.toString()}`;
}

function buildCacheKey({
  view,
  dateMode,
  singleDate,
  startDate,
  endDate,
  trader,
  product,
  hub,
  contract,
  productScope,
}: {
  view: TradeBlotterView;
  dateMode: DateMode;
  singleDate: string;
  startDate: string;
  endDate: string;
  trader: string;
  product: string;
  hub: string;
  contract: string;
  productScope: IceTradeProductScope;
}): string {
  return [
    "api:ice-trade-blotter",
    view,
    dateMode,
    singleDate,
    startDate,
    endDate,
    trader,
    product,
    hub,
    contract,
    productScope,
  ].join(":");
}

function buildPositionLegsApiUrl(
  asOf: string,
  positionKey: string,
  productScope: IceTradeProductScope
): string {
  const params = new URLSearchParams({ asOf, positionKey, scope: productScope });
  return `/api/ice-trade-blotter/positions?${params.toString()}`;
}

function buildPositionLegsCacheKey(
  asOf: string,
  positionKey: string,
  productScope: IceTradeProductScope
): string {
  return ["api:ice-trade-blotter", "position-legs", asOf, productScope, positionKey].join(":");
}

async function fetchPnlSummaryPayload({
  dateMode,
  singleDate,
  startDate,
  endDate,
  productScope,
  refresh,
  signal,
}: {
  dateMode: DateMode;
  singleDate: string;
  startDate: string;
  endDate: string;
  productScope: IceTradeProductScope;
  refresh: boolean;
  signal: AbortSignal;
}): Promise<PnlSummaryPayload> {
  const dates = pnlBusinessDateKeys({ dateMode, singleDate, startDate, endDate });
  const payloads = await Promise.all(
    dates.map((date) => {
      const params = new URLSearchParams({ asOf: date, scope: productScope });
      if (refresh) params.set("refresh", "1");
      return fetchJsonWithCache<PositionsPayload>({
        key: ["api:ice-trade-blotter", "positions-pnl", date, productScope].join(":"),
        url: `/api/ice-trade-blotter/positions?${params.toString()}`,
        ttlMs: API_CACHE_TTL_MS,
        signal,
        cacheMode: (refresh ? "no-store" : "default") as RequestCache,
        forceRefresh: refresh,
      });
    })
  );

  const traderSet = new Set<string>();
  const rows = payloads.map((payload, index) => {
    const totals = new Map<string, number>();
    let markedCount = 0;
    const unmarkedPositions: PnlSummaryUnmarkedPosition[] = [];
    payload.rows.forEach((position) => {
      const trader = fmtText(position.trader);
      traderSet.add(trader);
      const pnl = toFiniteNumber(position.daily_pnl);
      if (pnl === null) {
        unmarkedPositions.push({
          trader,
          hub: fmtText(position.hub),
          cc: fmtText(position.cc),
          contract: fmtText(position.contract),
          option: fmtText(position.option),
          net_lots: toFiniteNumber(position.net_lots),
          net_quantity: toFiniteNumber(position.net_quantity),
          settlement_status: fmtText(position.settlement_status),
        });
        return;
      }
      totals.set(trader, (totals.get(trader) ?? 0) + pnl);
      markedCount += 1;
    });
    const total = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
    return {
      date: payload.asOf || dates[index],
      traderValues: Object.fromEntries(
        Array.from(totals.entries()).map(([trader, value]) => [trader, value])
      ),
      total: totals.size > 0 ? total : null,
      markedCount,
      totalCount: payload.rows.length,
      unmarkedPositions,
    };
  });
  const traders = Array.from(traderSet).sort((first, second) => first.localeCompare(second));
  const totalValues = rows.map((row) => row.total).filter((value): value is number => value !== null);
  const displayRows = [...rows].sort((first, second) => second.date.localeCompare(first.date));
  return {
    startDate: dates[0] ?? "",
    endDate: dates[dates.length - 1] ?? "",
    traders,
    rowCount: displayRows.length,
    summary: {
      rowCount: displayRows.length,
      totalPnl: totalValues.length > 0 ? totalValues.reduce((sum, value) => sum + value, 0) : null,
      latestDate: displayRows.reduce<string | null>(
        (latest, row) => (!latest || row.date > latest ? row.date : latest),
        null
      ),
      markedCount: displayRows.reduce((sum, row) => sum + row.markedCount, 0),
      totalCount: displayRows.reduce((sum, row) => sum + row.totalCount, 0),
    },
    rows: displayRows,
  };
}

function marksFromSettlementRows(rows: IceTradeBlotterRow[]): MarkValues {
  return Object.fromEntries(
    rows.flatMap((row) => {
      const mark = toFiniteNumber(row.settlement_mark);
      return mark === null ? [] : [[tradeRowKey(row), String(mark)]];
    })
  );
}

function ControlCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="w-full max-w-none rounded-lg border border-sky-950/70 bg-[#0d121b] p-3 shadow-xl shadow-black/20 ring-1 ring-white/[0.02] sm:p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ColumnFilterMenu({
  label,
  options,
  selected,
  sortDirection,
  onSort,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  sortDirection: SortDirection | null;
  onSort: (direction: SortDirection) => void;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draftSelected, setDraftSelected] = useState<string[]>(selected);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDraftSelected(selected);
    setQuery("");
  }, [open, selected]);

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 256;
      const margin = 8;
      const left = Math.min(
        Math.max(rect.left, margin),
        window.innerWidth - menuWidth - margin
      );
      setMenuPosition({ left, top: rect.bottom + 4 });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  const toggleValue = (option: string) => {
    setDraftSelected((values) =>
      values.includes(option)
        ? values.filter((value) => value !== option)
        : [...values, option]
    );
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions =
    normalizedQuery.length === 0
      ? options
      : options.filter((option) => option.toLowerCase().includes(normalizedQuery));

  const applyDraft = () => {
    onChange(draftSelected);
    setOpen(false);
  };

  const clearFilter = () => {
    onChange([]);
    setDraftSelected([]);
    setOpen(false);
  };

  const cancelDraft = () => {
    setDraftSelected(selected);
    setOpen(false);
  };

  const handleSort = (direction: SortDirection) => {
    onSort(direction);
    setOpen(false);
  };

  const menu =
    open && menuPosition && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        className="fixed z-[100] w-64 rounded-md border border-gray-700 bg-[#12141d] shadow-2xl shadow-black/40"
        style={{ left: menuPosition.left, top: menuPosition.top }}
      >
        <div className="border-b border-gray-800 py-1">
          <button
            type="button"
            onClick={() => handleSort("asc")}
            className={`w-full px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-gray-800 ${
              sortDirection === "asc" ? "text-sky-200" : "text-gray-300"
            }`}
          >
            {"\u2191"} Sort Ascending
          </button>
          <button
            type="button"
            onClick={() => handleSort("desc")}
            className={`w-full px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-gray-800 ${
              sortDirection === "desc" ? "text-sky-200" : "text-gray-300"
            }`}
          >
            {"\u2193"} Sort Descending
          </button>
        </div>
        <div className="border-b border-gray-800 p-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-7 w-full rounded border border-gray-700 bg-gray-950 px-2 text-xs font-medium normal-case tracking-normal text-gray-200 outline-none placeholder:text-gray-600 focus:border-gray-500"
          />
          <div className="mt-1 text-[10px] font-semibold normal-case tracking-normal text-gray-500">
            {draftSelected.length.toLocaleString()} selected
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-3 text-xs font-medium normal-case tracking-normal text-gray-600">
              No values
            </div>
          ) : (
            filteredOptions.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs font-medium normal-case tracking-normal text-gray-300 hover:bg-gray-800"
              >
                <input
                  type="checkbox"
                  checked={draftSelected.includes(option)}
                  onChange={() => toggleValue(option)}
                  className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-950 accent-sky-500"
                />
                <span className="truncate" title={option}>
                  {option}
                </span>
              </label>
            ))
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-800 p-2">
          <button
            type="button"
            onClick={applyDraft}
            className="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-500/30"
          >
            OK
          </button>
          <button
            type="button"
            onClick={clearFilter}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-800"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={cancelDraft}
            className="rounded-md border border-gray-800 bg-gray-950 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-gray-700 hover:text-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex h-5 w-5 items-center justify-center rounded border text-[10px] outline-none transition-colors ${
          selected.length > 0
            ? "border-sky-500/50 bg-sky-500/15 text-sky-100"
            : "border-gray-800 bg-gray-950 text-gray-500 hover:border-gray-700 hover:text-gray-200"
        }`}
        aria-expanded={open}
        aria-label={`Filter ${label}`}
        title={`Filter ${label}`}
      >
        {"\u25BE"}
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

export default function IceTradeBlotter({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: IceTradeBlotterFreshnessSummary) => void;
}) {
  const initialPnlDateRange = defaultPnlDateRange();
  const view = "settles" as TradeBlotterView;
  const [productScope, setProductScope] = useState<IceTradeProductScope>(
    DEFAULT_ICE_TRADE_PRODUCT_SCOPE
  );
  const [dateMode] = useState<DateMode>("single");
  const [loadedSingleDate, setLoadedSingleDate] = useState(initialPnlDateRange.endDate);
  const [loadedStartDate, setLoadedStartDate] = useState(initialPnlDateRange.startDate);
  const [loadedEndDate, setLoadedEndDate] = useState(initialPnlDateRange.endDate);
  const defaultColumnLabels = useMemo(
    () =>
      DEFAULT_COLUMN_KEYS.map(
        (key) => COLUMN_DEFINITIONS.find((column) => column.key === key)?.label
      ).filter((label): label is string => Boolean(label)),
    []
  );
  const defaultPositionColumnLabels = useMemo(
    () =>
      DEFAULT_POSITION_COLUMN_KEYS.map(
        (key) => POSITION_COLUMN_DEFINITIONS.find((column) => column.key === key)?.label
      ).filter((label): label is string => Boolean(label)),
    []
  );
  const defaultDailySettlementColumnLabels = useMemo(
    () =>
      DEFAULT_DAILY_SETTLEMENT_COLUMN_KEYS.map(
        (key) => DAILY_SETTLEMENT_COLUMN_DEFINITIONS.find((column) => column.key === key)?.label
      ).filter((label): label is string => Boolean(label)),
    []
  );
  const [visibleColumnLabels, setVisibleColumnLabels] = useState<string[]>(
    defaultColumnLabels
  );
  const [visiblePositionColumnLabels, setVisiblePositionColumnLabels] =
    useState<string[]>(defaultPositionColumnLabels);
  const [visibleDailySettlementColumnLabels, setVisibleDailySettlementColumnLabels] =
    useState<string[]>(defaultDailySettlementColumnLabels);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [tradeLegColumnFilters, setTradeLegColumnFilters] =
    useState<TradeLegColumnFilters>({});
  const [positionColumnFilters, setPositionColumnFilters] =
    useState<PositionColumnFilters>({});
  const [positionLegColumnFilters, setPositionLegColumnFilters] =
    useState<PositionLegColumnFilters>({});
  const [dailySettlementColumnFilters, setDailySettlementColumnFilters] =
    useState<DailySettlementColumnFilters>({});
  const [dailySettlementStatusFilter, setDailySettlementStatusFilter] =
    useState<SettlementStatusFilter>("all");
  const [dailySettlementDateMismatchFilter, setDailySettlementDateMismatchFilter] =
    useState(false);
  const [sortState, setSortState] = useState<SortState | null>(
    DEFAULT_TRADE_BLOTTER_SORT_STATE
  );
  const [positionSortState, setPositionSortState] =
    useState<PositionSortState | null>(DEFAULT_POSITION_SORT_STATE);
  const [positionLegSortState, setPositionLegSortState] =
    useState<PositionLegSortState | null>(DEFAULT_POSITION_LEG_SORT_STATE);
  const [dailySettlementSortState, setDailySettlementSortState] =
    useState<DailySettlementSortState | null>(DEFAULT_DAILY_SETTLEMENT_SORT_STATE);
  const [draggedColumnLabel, setDraggedColumnLabel] = useState<string | null>(null);
  const [dragOverColumnLabel, setDragOverColumnLabel] = useState<string | null>(null);
  const [coloringEnabled, setColoringEnabled] = useState(true);
  const [groupRowsEnabled, setGroupRowsEnabled] = useState(DEFAULT_GROUP_ROWS_ENABLED);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedTradeSummaryKey, setSelectedTradeSummaryKey] = useState<string | null>(null);
  const [tradeSummaryMetric, setTradeSummaryMetric] =
    useState<TradeSummaryMetric>("net_quantity");
  const [settlementSummaryMetric, setSettlementSummaryMetric] =
    useState<SettlementSummaryMetric>("final_mark");
  const [quickTraderFilter, setQuickTraderFilter] = useState("All");
  const [quickAssetFilters, setQuickAssetFilters] = useState<string[]>([]);
  const [quickRegionFilters, setQuickRegionFilters] = useState<string[]>([]);
  const [selectedPositionKey, setSelectedPositionKey] = useState<string | null>(null);
  const [positionTraderFilter, setPositionTraderFilter] = useState("All");
  const [positionAssetFilters, setPositionAssetFilters] = useState<string[]>([]);
  const [positionRegionFilters, setPositionRegionFilters] = useState<string[]>([]);
  const [positionAggregateMetric, setPositionAggregateMetric] =
    useState<PositionAggregateMetric>("daily_pnl");
  const [expandedTenorRowKey, setExpandedTenorRowKey] = useState<string | null>(null);
  const [positionLegsByKey, setPositionLegsByKey] = useState<Record<string, PositionLegRow[]>>({});
  const [positionLegsLoadingKey, setPositionLegsLoadingKey] = useState<string | null>(null);
  const [positionLegsError, setPositionLegsError] = useState<string | null>(null);
  const [selectedPositionLegRowKeys, setSelectedPositionLegRowKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedTradeLegRowKeys, setSelectedTradeLegRowKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [tradeLegSortState, setTradeLegSortState] = useState<SortState | null>(null);
  const [marksByRowKey, setMarksByRowKey] = useState<MarkValues>({});
  const [selectedCellKeys, setSelectedCellKeys] = useState<Set<string>>(() => new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<CellCoordinate | null>(null);
  const [isSelectingCells, setIsSelectingCells] = useState(false);
  const [selectedDailySettlementCellKeys, setSelectedDailySettlementCellKeys] =
    useState<Set<string>>(() => new Set());
  const [dailySettlementSelectionAnchor, setDailySettlementSelectionAnchor] =
    useState<DailySettlementCellCoordinate | null>(null);
  const [isSelectingDailySettlementCells, setIsSelectingDailySettlementCells] =
    useState(false);
  const [data, setData] = useState<IceTradeBlotterPayload | null>(null);
  const [positionsData, setPositionsData] = useState<PositionsPayload | null>(null);
  const [dailySettlementsData, setDailySettlementsData] =
    useState<DailySettlementsPayload | null>(null);
  const [settlementHistorySelection, setSettlementHistorySelection] =
    useState<SettlementHistorySelection | null>(null);
  const [settlementHistoryLookback, setSettlementHistoryLookback] =
    useState<SettlementHistoryLookback>(30);
  const [settlementHistoryData, setSettlementHistoryData] =
    useState<DailySettlementsPayload | null>(null);
  const [settlementHistoryLoading, setSettlementHistoryLoading] = useState(false);
  const [settlementHistoryError, setSettlementHistoryError] = useState<string | null>(null);
  const [settlementHistoryColumnFilters, setSettlementHistoryColumnFilters] =
    useState<SettlementHistoryColumnFilters>({});
  const [settlementHistorySortState, setSettlementHistorySortState] = useState<{
    key: SettlementHistoryColumnKey;
    direction: SortDirection;
  } | null>(null);
  const [settlesDebugOpen, setSettlesDebugOpen] = useState(false);
  const [settlesDebugTradeDate, setSettlesDebugTradeDate] = useState("");
  const [settlesDebugData, setSettlesDebugData] =
    useState<DailySettlementsPayload | null>(null);
  const [settlesDebugLoading, setSettlesDebugLoading] = useState(false);
  const [settlesDebugError, setSettlesDebugError] = useState<string | null>(null);
  const [productDictionaryData, setProductDictionaryData] =
    useState<ProductDictionaryPayload | null>(null);
  const [pnlSummaryData, setPnlSummaryData] = useState<PnlSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearCellSelection = () => {
    setSelectedCellKeys(new Set());
    setSelectionAnchor(null);
    setIsSelectingCells(false);
  };

  const clearExpandedGroups = () => {
    setSelectedGroupKey(null);
    setSelectedTradeSummaryKey(null);
  };

  const clearTradeLegPopupState = () => {
    setTradeLegColumnFilters({});
    setTradeLegSortState(null);
    setSelectedTradeLegRowKeys(new Set());
  };

  const clearPositionPopupState = () => {
    setSelectedPositionKey(null);
    setPositionLegsLoadingKey(null);
    setPositionLegsError(null);
    setPositionLegColumnFilters({});
    setPositionLegSortState(DEFAULT_POSITION_LEG_SORT_STATE);
    setSelectedPositionLegRowKeys(new Set());
  };

  const clearDailySettlementCellSelection = () => {
    setSelectedDailySettlementCellKeys(new Set());
    setDailySettlementSelectionAnchor(null);
    setIsSelectingDailySettlementCells(false);
  };

  const openSettlesDebug = () => {
    if (dailySettlementsData) {
      setSettlesDebugTradeDate((date) => date || dailySettlementsData.endDate);
    }
    setSettlesDebugOpen(true);
  };

  const clearQuickFilters = () => {
    setQuickTraderFilter("All");
    setQuickAssetFilters([]);
    setQuickRegionFilters([]);
  };


  const resetTable = () => {
    setVisibleColumnLabels(defaultColumnLabels);
    setVisiblePositionColumnLabels(defaultPositionColumnLabels);
    setVisibleDailySettlementColumnLabels(defaultDailySettlementColumnLabels);
    setColumnFilters({});
    setPositionColumnFilters({});
    setDailySettlementColumnFilters({});
    setDailySettlementDateMismatchFilter(false);
    clearTradeLegPopupState();
    clearPositionPopupState();
    setSortState(DEFAULT_TRADE_BLOTTER_SORT_STATE);
    setPositionSortState(DEFAULT_POSITION_SORT_STATE);
    setDailySettlementSortState(DEFAULT_DAILY_SETTLEMENT_SORT_STATE);
    setGroupRowsEnabled(DEFAULT_GROUP_ROWS_ENABLED);
    setMarksByRowKey(data ? marksFromSettlementRows(data.rows) : {});
    clearQuickFilters();
    clearExpandedGroups();
    clearCellSelection();
    clearDailySettlementCellSelection();
  };

  const updateColumnFilter = (key: ColumnKey, values: string[]) => {
    setColumnFilters((filters) => {
      const next = { ...filters };
      if (values.length > 0) {
        next[key] = values;
      } else {
        delete next[key];
      }
      return next;
    });
    clearCellSelection();
  };

  const updateTradeLegColumnFilter = (key: ColumnKey, values: string[]) => {
    setTradeLegColumnFilters((filters) => {
      const next = { ...filters };
      if (values.length > 0) {
        next[key] = values;
      } else {
        delete next[key];
      }
      return next;
    });
    setSelectedTradeLegRowKeys(new Set());
  };

  const updatePositionColumnFilter = (key: PositionColumnKey, values: string[]) => {
    setPositionColumnFilters((filters) => {
      const next = { ...filters };
      if (values.length > 0) {
        next[key] = values;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const updatePositionLegColumnFilter = (key: PositionLegColumnKey, values: string[]) => {
    setPositionLegColumnFilters((filters) => {
      const next = { ...filters };
      if (values.length > 0) {
        next[key] = values;
      } else {
        delete next[key];
      }
      return next;
    });
    setSelectedPositionLegRowKeys(new Set());
  };

  const updateDailySettlementColumnFilter = (
    key: DailySettlementColumnKey,
    values: string[]
  ) => {
    setDailySettlementColumnFilters((filters) => {
      const next = { ...filters };
      if (values.length > 0) {
        next[key] = values;
      } else {
        delete next[key];
      }
      return next;
    });
    clearDailySettlementCellSelection();
  };

  const toggleQuickAssetFilter = (asset: string) => {
    if (asset === "All") {
      setQuickAssetFilters([]);
      setQuickRegionFilters([]);
      return;
    }
    setQuickAssetFilters((filters) =>
      filters.includes(asset)
        ? filters.filter((value) => value !== asset)
        : [...filters, asset]
    );
    clearCellSelection();
    clearDailySettlementCellSelection();
  };

  const toggleQuickRegionFilter = (region: string) => {
    if (region === "All") {
      setQuickRegionFilters([]);
      return;
    }
    setQuickRegionFilters((filters) =>
      filters.includes(region)
        ? filters.filter((value) => value !== region)
        : [...filters, region]
    );
    clearCellSelection();
    clearDailySettlementCellSelection();
  };

  const loadSettlesDebugRows = () => {
    const tradeDate = settlesDebugTradeDate || dailySettlementsData?.endDate || "";
    if (!tradeDate) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      mode: "historical",
      start: tradeDate,
      end: tradeDate,
      scope: productScope,
    });

    setSettlesDebugLoading(true);
    setSettlesDebugError(null);

    void fetchJsonWithCache<DailySettlementsPayload>({
      key: ["api:ice-trade-blotter", "debug-settles", productScope, tradeDate].join(":"),
      url: `/api/ice-trade-blotter/daily-settlements?${params.toString()}`,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      forceRefresh: true,
      cacheMode: "no-store",
    })
      .then((payload) => {
        setSettlesDebugData(payload);
        setSettlesDebugTradeDate(payload.endDate);
        setDailySettlementColumnFilters({});
        setDailySettlementStatusFilter("all");
        setDailySettlementDateMismatchFilter(false);
        setDailySettlementSortState(DEFAULT_DAILY_SETTLEMENT_SORT_STATE);
        clearDailySettlementCellSelection();
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setSettlesDebugError(err.message || "Failed to load raw settle rows");
      })
      .finally(() => {
        setSettlesDebugLoading(false);
      });
  };


  const handleVisibleColumnLabelsChange = (labels: string[]) => {
    const visibleKeys = new Set(
      COLUMN_DEFINITIONS.filter((column) => labels.includes(column.label)).map((column) => column.key)
    );
    setVisibleColumnLabels(labels);
    clearCellSelection();
    setColumnFilters((filters) =>
      Object.fromEntries(
        Object.entries(filters).filter(([key]) => visibleKeys.has(key as ColumnKey))
      ) as ColumnFilters
    );
    setSortState((sort) => (sort && visibleKeys.has(sort.key) ? sort : null));
  };

  const handleVisiblePositionColumnLabelsChange = (labels: string[]) => {
    const visibleKeys = new Set(
      POSITION_COLUMN_DEFINITIONS.filter((column) =>
        labels.includes(column.label)
      ).map((column) => column.key)
    );
    setVisiblePositionColumnLabels(labels);
    setPositionColumnFilters((filters) =>
      Object.fromEntries(
        Object.entries(filters).filter(([key]) =>
          visibleKeys.has(key as PositionColumnKey)
        )
      ) as PositionColumnFilters
    );
    setPositionSortState((sort) =>
      sort && visibleKeys.has(sort.key) ? sort : null
    );
  };

  const handleVisibleDailySettlementColumnLabelsChange = (labels: string[]) => {
    const visibleKeys = new Set(
      DAILY_SETTLEMENT_COLUMN_DEFINITIONS.filter((column) =>
        labels.includes(column.label)
      ).map((column) => column.key)
    );
    setVisibleDailySettlementColumnLabels(labels);
    clearDailySettlementCellSelection();
    setDailySettlementColumnFilters((filters) =>
      Object.fromEntries(
        Object.entries(filters).filter(([key]) =>
          visibleKeys.has(key as DailySettlementColumnKey)
        )
      ) as DailySettlementColumnFilters
    );
    setDailySettlementSortState((sort) =>
      sort && visibleKeys.has(sort.key) ? sort : null
    );
  };


  const updateSort = (key: ColumnKey) => {
    setSortState((sort) =>
      sort?.key === key && sort.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" }
    );
  };

  const updatePositionSort = (key: PositionColumnKey) => {
    setPositionSortState((sort) =>
      sort?.key === key && sort.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" }
    );
  };

  const updatePositionLegSort = (key: PositionLegColumnKey) => {
    setPositionLegSortState((sort) =>
      sort?.key === key && sort.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" }
    );
  };

  const updateDailySettlementSort = (key: DailySettlementColumnKey) => {
    setDailySettlementSortState((sort) =>
      sort?.key === key && sort.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" }
    );
  };


  const moveVisibleColumnLabel = (sourceLabel: string, targetLabel: string) => {
    if (sourceLabel === targetLabel) return;
    setVisibleColumnLabels((labels) => {
      const sourceIndex = labels.indexOf(sourceLabel);
      const targetIndex = labels.indexOf(targetLabel);
      if (sourceIndex < 0 || targetIndex < 0) return labels;
      const nextLabels = [...labels];
      const [movedLabel] = nextLabels.splice(sourceIndex, 1);
      nextLabels.splice(targetIndex, 0, movedLabel);
      return nextLabels;
    });
    clearCellSelection();
  };

  const makeCellCoordinate = (
    rowIndex: number,
    columnIndex: number,
    row: IceTradeBlotterRow,
    column: ColumnDefinition
  ): CellCoordinate => ({
    rowIndex,
    columnIndex,
    rowKey: tradeRowKey(row),
    columnKey: column.key,
  });

  const selectCellRange = (anchor: CellCoordinate, focus: CellCoordinate) => {
    setSelectedCellKeys(cellSelectionKeysInRange(anchor, focus, displayedRows, visibleColumns));
  };

  const handleCellMouseDown = (
    event: React.MouseEvent<HTMLTableCellElement>,
    coordinate: CellCoordinate
  ) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, button, a, select, textarea")) return;

    event.preventDefault();
    if (event.shiftKey && selectionAnchor) {
      selectCellRange(selectionAnchor, coordinate);
      setIsSelectingCells(true);
      return;
    }

    const key = cellSelectionKeyFromCoordinate(coordinate);
    if (event.ctrlKey || event.metaKey) {
      setSelectedCellKeys((selectedKeys) => {
        const next = new Set(selectedKeys);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
      setSelectionAnchor(coordinate);
      setIsSelectingCells(false);
      return;
    }

    setSelectedCellKeys(new Set([key]));
    setSelectionAnchor(coordinate);
    setIsSelectingCells(true);
  };

  const handleCellMouseEnter = (
    event: React.MouseEvent<HTMLTableCellElement>,
    coordinate: CellCoordinate
  ) => {
    if (!isSelectingCells || !selectionAnchor || event.buttons !== 1) return;
    selectCellRange(selectionAnchor, coordinate);
  };

  const makeDailySettlementCellCoordinate = (
    rowIndex: number,
    columnIndex: number,
    row: DailySettlementRow,
    column: DailySettlementColumnDefinition
  ): DailySettlementCellCoordinate => ({
    rowIndex,
    columnIndex,
    rowKey: dailySettlementRowKey(row),
    columnKey: column.key,
  });

  const selectDailySettlementCellRange = (
    anchor: DailySettlementCellCoordinate,
    focus: DailySettlementCellCoordinate
  ) => {
    setSelectedDailySettlementCellKeys(
      dailySettlementCellSelectionKeysInRange(
        anchor,
        focus,
        displayedDebugDailySettlementRows,
        visibleDailySettlementColumns
      )
    );
  };

  const handleDailySettlementCellMouseDown = (
    event: React.MouseEvent<HTMLTableCellElement>,
    coordinate: DailySettlementCellCoordinate
  ) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, button, a, select, textarea")) return;

    event.preventDefault();
    if (event.shiftKey && dailySettlementSelectionAnchor) {
      selectDailySettlementCellRange(dailySettlementSelectionAnchor, coordinate);
      setIsSelectingDailySettlementCells(true);
      return;
    }

    const key = dailySettlementCellSelectionKeyFromCoordinate(coordinate);
    if (event.ctrlKey || event.metaKey) {
      setSelectedDailySettlementCellKeys((selectedKeys) => {
        const next = new Set(selectedKeys);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
      setDailySettlementSelectionAnchor(coordinate);
      setIsSelectingDailySettlementCells(false);
      return;
    }

    setSelectedDailySettlementCellKeys(new Set([key]));
    setDailySettlementSelectionAnchor(coordinate);
    setIsSelectingDailySettlementCells(true);
  };

  const handleDailySettlementCellMouseEnter = (
    event: React.MouseEvent<HTMLTableCellElement>,
    coordinate: DailySettlementCellCoordinate
  ) => {
    if (
      !isSelectingDailySettlementCells ||
      !dailySettlementSelectionAnchor ||
      event.buttons !== 1
    ) {
      return;
    }
    selectDailySettlementCellRange(dailySettlementSelectionAnchor, coordinate);
  };


  const handleColumnDragStart = (
    event: React.DragEvent<HTMLElement>,
    label: string
  ) => {
    setDraggedColumnLabel(label);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", label);
  };

  const handleColumnDragOver = (
    event: React.DragEvent<HTMLElement>,
    label: string
  ) => {
    if (!draggedColumnLabel || draggedColumnLabel === label) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverColumnLabel(label);
  };

  const handleColumnDrop = (
    event: React.DragEvent<HTMLElement>,
    label: string
  ) => {
    event.preventDefault();
    const sourceLabel = draggedColumnLabel ?? event.dataTransfer.getData("text/plain");
    if (sourceLabel) moveVisibleColumnLabel(sourceLabel, label);
    setDraggedColumnLabel(null);
    setDragOverColumnLabel(null);
  };

  const handleColumnDragEnd = () => {
    setDraggedColumnLabel(null);
    setDragOverColumnLabel(null);
  };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    const commonRequest = {
      key: buildCacheKey({
        view,
        dateMode,
        singleDate: loadedSingleDate,
        startDate: loadedStartDate,
        endDate: loadedEndDate,
        trader: "",
        product: "",
        hub: "",
        contract: "",
        productScope,
      }),
      url: buildApiUrl({
        view,
        dateMode,
        singleDate: loadedSingleDate,
        startDate: loadedStartDate,
        endDate: loadedEndDate,
        trader: "",
        product: "",
        hub: "",
        contract: "",
        productScope,
        refresh: refreshToken > 0,
      }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: (refreshToken > 0 ? "no-store" : "default") as RequestCache,
      forceRefresh: refreshToken > 0,
    };

    const request =
      view === "pnl"
        ? fetchPnlSummaryPayload({
            dateMode,
            singleDate: loadedSingleDate,
            startDate: loadedStartDate,
            endDate: loadedEndDate,
            productScope,
            refresh: refreshToken > 0,
            signal: controller.signal,
          })
        : view === "products"
        ? fetchJsonWithCache<ProductDictionaryPayload>(commonRequest)
        : view === "positions"
          ? fetchJsonWithCache<PositionsPayload>(commonRequest)
        : view === "settles"
          ? fetchJsonWithCache<DailySettlementsPayload>(commonRequest)
          : fetchJsonWithCache<IceTradeBlotterPayload>(commonRequest);

    request
      .then((payload) => {
        if (!active) return;
        if (view === "pnl") {
          const pnlPayload = payload as PnlSummaryPayload;
          setPnlSummaryData(pnlPayload);
          setPositionsData(null);
          setPositionLegsByKey({});
          setProductDictionaryData(null);
          setDailySettlementsData(null);
          setData(null);
          setMarksByRowKey({});
          clearExpandedGroups();
          onFreshnessChange?.({
            status: pnlPayload.summary.rowCount > 0 ? "Loaded" : "Empty",
            statusClass:
              pnlPayload.summary.rowCount > 0
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-gray-700 bg-gray-900 text-gray-400",
            summary: `${fmtDate(pnlPayload.startDate)} to ${fmtDate(pnlPayload.endDate)} | ${fmtPnl(pnlPayload.summary.totalPnl)}`,
            targetDateLabel: `${fmtDate(pnlPayload.startDate)} to ${fmtDate(pnlPayload.endDate)}`,
            latestDateLabel: fmtDate(pnlPayload.summary.latestDate),
            latestUpdateLabel: "--",
            rowCountLabel: pnlPayload.summary.rowCount.toLocaleString(),
          });
          return;
        }

        if (view === "positions") {
          const positionsPayload = payload as PositionsPayload;
          setPnlSummaryData(null);
          setPositionsData(positionsPayload);
          setPositionLegsByKey({});
          setProductDictionaryData(null);
          setDailySettlementsData(null);
          setData(null);
          setMarksByRowKey({});
          clearExpandedGroups();
          clearPositionPopupState();
          setLoadedSingleDate(positionsPayload.asOf);
          setLoadedStartDate(positionsPayload.asOf);
          setLoadedEndDate(positionsPayload.asOf);
          onFreshnessChange?.(freshnessFromPositionsPayload(positionsPayload));
          return;
        }

        if (view === "products") {
          const productsPayload = payload as ProductDictionaryPayload;
          setPnlSummaryData(null);
          setPositionsData(null);
          setProductDictionaryData(productsPayload);
          setDailySettlementsData(null);
          setData(null);
          setMarksByRowKey({});
          clearExpandedGroups();
          onFreshnessChange?.({
            status: productsPayload.summary.activeRowCount > 0 ? "Loaded" : "Empty",
            statusClass:
              productsPayload.summary.activeRowCount > 0
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-gray-700 bg-gray-900 text-gray-400",
            summary: `${productsPayload.summary.activeRowCount.toLocaleString()} active products | ${productsPayload.summary.pjmRowCount.toLocaleString()} PJM | ${productsPayload.summary.iceRowCount.toLocaleString()} ICE | ${productsPayload.summary.optionRowCount.toLocaleString()} options`,
            targetDateLabel: "Product dictionary",
            latestDateLabel: "--",
            latestUpdateLabel: "--",
            rowCountLabel: productsPayload.summary.rowCount.toLocaleString(),
          });
          return;
        }

        if (view === "settles") {
          const settlesPayload = payload as DailySettlementsPayload;
          setPnlSummaryData(null);
          setPositionsData(null);
          setDailySettlementsData(settlesPayload);
          setProductDictionaryData(null);
          setData(null);
          setMarksByRowKey({});
          clearExpandedGroups();
          onFreshnessChange?.({
            status: settlesPayload.summary.rowCount > 0 ? "Loaded" : "Empty",
            statusClass:
              settlesPayload.summary.rowCount > 0
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-gray-700 bg-gray-900 text-gray-400",
            summary: `${fmtDate(settlesPayload.summary.latestDate)} | ${settlesPayload.summary.rowCount.toLocaleString()} settles`,
            targetDateLabel: `${fmtDate(settlesPayload.startDate)} to ${fmtDate(settlesPayload.endDate)}`,
            latestDateLabel: fmtDate(settlesPayload.summary.latestDate),
            latestUpdateLabel: fmtTimestamp(settlesPayload.summary.latestUpdatedAt),
            rowCountLabel: settlesPayload.summary.rowCount.toLocaleString(),
          });
          return;
        }

        const tradePayload = payload as IceTradeBlotterPayload;
        setPnlSummaryData(null);
        setPositionsData(null);
        setData(tradePayload);
        setDailySettlementsData(null);
        setProductDictionaryData(null);
        setMarksByRowKey(marksFromSettlementRows(tradePayload.rows));
        clearExpandedGroups();
        onFreshnessChange?.(freshnessFromPayload(tradePayload));
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setError(err.message || "Failed to load ICE trade blotter");
        setPositionsData(null);
        setPnlSummaryData(null);
        setData(null);
        setDailySettlementsData(null);
        setProductDictionaryData(null);
        clearExpandedGroups();
        onFreshnessChange?.({
          ...DEFAULT_FRESHNESS,
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Trade blotter query failed",
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
    dateMode,
    loadedEndDate,
    loadedSingleDate,
    loadedStartDate,
    onFreshnessChange,
    productScope,
    refreshToken,
    view,
  ]);

  useEffect(() => {
    if (!settlementHistorySelection) {
      setSettlementHistoryData(null);
      setSettlementHistoryError(null);
      setSettlementHistoryLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    const endDate = settlementHistorySelection.historyEndDate;
    const startDate =
      settlementHistoryLookback === "all"
        ? SETTLEMENT_HISTORY_ALL_START_DATE
        : isoDateDaysBefore(endDate, settlementHistoryLookback - 1);
    const params = new URLSearchParams({
      mode: "historical",
      start: startDate,
      end: endDate,
      scope: productScope,
    });

    setSettlementHistoryLoading(true);
    setSettlementHistoryError(null);

    void fetchJsonWithCache<DailySettlementsPayload>({
      key: [
        "api:ice-trade-blotter",
        "settlement-history",
        productScope,
        settlementHistorySelection.productKey,
        settlementHistorySelection.columnKey,
        settlementHistoryLookback,
        startDate,
        endDate,
      ].join(":"),
      url: `/api/ice-trade-blotter/daily-settlements?${params.toString()}`,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
    })
      .then((payload) => {
        if (!active) return;
        setSettlementHistoryData(payload);
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setSettlementHistoryData(null);
        setSettlementHistoryError(err.message || "Failed to load settle history");
      })
      .finally(() => {
        if (active) setSettlementHistoryLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [productScope, settlementHistoryLookback, settlementHistorySelection]);

  useEffect(() => {
    if (view !== "positions" || !positionsData?.asOf) return;

    const asOf = positionsData.asOf;
    const prefetchRequests: TradeBlotterView[] = ["trades", "settles", "products"];
    prefetchRequests.forEach((prefetchView) => {
      const request = {
        view: prefetchView,
        dateMode: "single" as DateMode,
        singleDate: asOf,
        startDate: asOf,
        endDate: asOf,
        trader: "",
        product: "",
        hub: "",
        contract: "",
        productScope,
      };

      void fetchJsonWithCache<unknown>({
        key: buildCacheKey(request),
        url: buildApiUrl({ ...request, refresh: false }),
        ttlMs: API_CACHE_TTL_MS,
        cacheMode: "force-cache",
      }).catch(() => undefined);
    });
  }, [positionsData?.asOf, productScope, view]);

  const pnlSummaryRows = pnlSummaryData?.rows ?? EMPTY_PNL_SUMMARY_ROWS;
  const pnlSummaryTraders = pnlSummaryData?.traders ?? [];
  const pnlSummaryMarkedCount = pnlSummaryData?.summary.markedCount ?? 0;
  const pnlSummaryTotalCount = pnlSummaryData?.summary.totalCount ?? 0;

  const rows = data?.rows ?? EMPTY_ROWS;
  const tradeQuickTraderOptions = useMemo(
    () => sortedFilterValues(rows.map((row) => row.trader)),
    [rows]
  );
  const tradeQuickAssetOptions = useMemo(
    () => sortedFilterValues(rows.map((row) => row.asset_class)),
    [rows]
  );
  const tradeQuickRegionOptions = useMemo(
    () =>
      sortedFilterValues(
        rows
          .filter(
            (row) =>
              quickAssetFilters.length === 0 ||
              quickAssetFilters.includes(String(row.asset_class ?? ""))
          )
          .map((row) => row.region)
      ),
    [quickAssetFilters, rows]
  );
  useEffect(() => {
    if (view !== "trades") return;
    setQuickTraderFilter((trader) =>
      trader === "All" || tradeQuickTraderOptions.includes(trader) ? trader : "All"
    );
    setQuickRegionFilters((filters) =>
      filters.filter((region) => tradeQuickRegionOptions.includes(region))
    );
  }, [tradeQuickRegionOptions, tradeQuickTraderOptions, view]);
  const quickFilteredRows = useMemo(
    () =>
      rows.filter((row) =>
        rowMatchesQuickFilters(row, quickTraderFilter, quickAssetFilters, quickRegionFilters)
      ),
    [quickAssetFilters, quickRegionFilters, quickTraderFilter, rows]
  );
  const groupedTradeRows = useMemo(() => groupTradeRows(quickFilteredRows), [quickFilteredRows]);
  const tableRows = groupRowsEnabled ? groupedTradeRows.rows : quickFilteredRows;
  const groupedLegsByKey = groupedTradeRows.legsByGroupKey;
  const columnByLabel = useMemo(
    () => new Map(COLUMN_DEFINITIONS.map((column) => [column.label, column] as const)),
    []
  );
  const visibleColumns = useMemo(
    () =>
      visibleColumnLabels
        .map((label) => columnByLabel.get(label))
        .filter((column): column is ColumnDefinition => Boolean(column)),
    [columnByLabel, visibleColumnLabels]
  );
  const columnFilterOptions = useMemo(() => {
    return Object.fromEntries(
      visibleColumns.map((column) => {
        const otherFilteredRows = tableRows.filter((row) =>
          Object.entries(columnFilters).every(([key, value]) =>
            key === column.key ||
            rowMatchesColumnFilter(row, key as ColumnKey, value, marksByRowKey)
          )
        );
        const options = Array.from(
          new Set(
            otherFilteredRows
              .map((row) => columnDisplayValue(row, column.key, marksByRowKey))
              .filter((value) => value.trim() !== "" && value !== "--")
          )
        ).sort((first, second) => sortFilterOption(first, second));

        return [column.key, options] as const;
      })
    ) as Partial<Record<ColumnKey, string[]>>;
  }, [columnFilters, marksByRowKey, tableRows, visibleColumns]);
  const displayedRows = useMemo(() => {
    const activeColumnFilters = Object.entries(columnFilters)
      .map(([key, values]) => [key as ColumnKey, values] as const)
      .filter(([, values]) => values.length > 0);

    const filteredRows =
      activeColumnFilters.length === 0
        ? tableRows
        : tableRows.filter((row) =>
            activeColumnFilters.every(([key, value]) =>
              rowMatchesColumnFilter(row, key, value, marksByRowKey)
            )
          );

    if (!sortState) return filteredRows;
    return [...filteredRows].sort((firstRow, secondRow) =>
      compareColumnValues(firstRow, secondRow, sortState, marksByRowKey)
    );
  }, [columnFilters, marksByRowKey, sortState, tableRows]);
  const tradeSummary = useMemo(
    () => buildTradeSummary(displayedRows, marksByRowKey, groupedLegsByKey),
    [displayedRows, groupedLegsByKey, marksByRowKey]
  );
  const tradeSummaryColumns = tradeSummary.columns;
  const tradeSummaryRows = tradeSummary.rows;
  const selectedTradeSummaryRow = selectedTradeSummaryKey
    ? tradeSummaryRows.find((row) => row.key === selectedTradeSummaryKey) ?? null
    : null;

  useEffect(() => {
    const visibleKeys = new Set(tradeSummaryRows.map((row) => row.key));
    setSelectedTradeSummaryKey((key) => (key && visibleKeys.has(key) ? key : null));
  }, [tradeSummaryRows]);

  useEffect(() => {
    if (!selectedTradeSummaryKey) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedTradeSummaryKey(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedTradeSummaryKey]);

  useEffect(() => {
    if (!groupRowsEnabled) {
      setSelectedGroupKey(null);
      return;
    }

    const visibleGroupKeys = new Set(
      displayedRows
        .map((row) => groupedTradeRowKey(row))
        .filter((key) => groupedLegsByKey.has(key))
    );
    setSelectedGroupKey((key) => (key && visibleGroupKeys.has(key) ? key : null));
  }, [displayedRows, groupedLegsByKey, groupRowsEnabled]);

  useEffect(() => {
    if (!selectedGroupKey) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedGroupKey(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedGroupKey]);

  useEffect(() => {
    if (!selectedPositionKey) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedPositionKey(null);
        setPositionLegColumnFilters({});
        setPositionLegSortState(DEFAULT_POSITION_LEG_SORT_STATE);
        setSelectedPositionLegRowKeys(new Set());
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedPositionKey]);

  const tableSubtitle = useMemo(() => {
    if (!data) return undefined;
    return `Settlement marks | ${fmtDate(data.startDate)} to ${fmtDate(data.endDate)}`;
  }, [data]);
  const selectedGroupLegs = selectedGroupKey
    ? groupedLegsByKey.get(selectedGroupKey) ?? EMPTY_ROWS
    : EMPTY_ROWS;
  const selectedGroupRow = selectedGroupKey
    ? displayedRows.find((row) => groupedTradeRowKey(row) === selectedGroupKey) ?? null
    : null;
  const tradeLegColumnByKey = useMemo(
    () => new Map(TRADE_LEG_DETAIL_COLUMNS.map((column) => [column.key, column] as const)),
    []
  );
  const tradeLegColumnFilterOptions = useMemo(() => {
    return Object.fromEntries(
      TRADE_LEG_DETAIL_COLUMNS.map((column) => {
        const otherFilteredRows = selectedGroupLegs.filter((row) =>
          Object.entries(tradeLegColumnFilters).every(([key, value]) => {
            if (key === column.key) return true;
            const filterColumn = tradeLegColumnByKey.get(key as ColumnKey);
            return filterColumn
              ? rowMatchesTradeLegColumnFilter(row, filterColumn, value, marksByRowKey)
              : true;
          })
        );
        const options = Array.from(
          new Set(
            otherFilteredRows
              .map((row) => tradeLegColumnDisplayValue(row, column, marksByRowKey))
              .filter((value) => value.trim() !== "" && value !== "--")
          )
        ).sort((first, second) => sortFilterOption(first, second));

        return [column.key, options] as const;
      })
    ) as Partial<Record<ColumnKey, string[]>>;
  }, [marksByRowKey, selectedGroupLegs, tradeLegColumnByKey, tradeLegColumnFilters]);
  const displayedTradeLegs = useMemo(() => {
    const activeColumnFilters = Object.entries(tradeLegColumnFilters)
      .map(([key, values]) => [key as ColumnKey, values] as const)
      .filter(([, values]) => values.length > 0);

    const filteredRows =
      activeColumnFilters.length === 0
        ? selectedGroupLegs
        : selectedGroupLegs.filter((row) =>
            activeColumnFilters.every(([key, values]) => {
              const column = tradeLegColumnByKey.get(key);
              return column
                ? rowMatchesTradeLegColumnFilter(row, column, values, marksByRowKey)
                : true;
            })
          );

    if (!tradeLegSortState) return filteredRows;
    return [...filteredRows].sort((firstRow, secondRow) =>
      compareTradeLegColumnValues(
        firstRow,
        secondRow,
        tradeLegSortState,
        TRADE_LEG_DETAIL_COLUMNS,
        marksByRowKey
      )
    );
  }, [marksByRowKey, selectedGroupLegs, tradeLegColumnByKey, tradeLegColumnFilters, tradeLegSortState]);
  const selectedTradeLegRows = useMemo(
    () => displayedTradeLegs.filter((row) => selectedTradeLegRowKeys.has(tradeRowKey(row))),
    [displayedTradeLegs, selectedTradeLegRowKeys]
  );
  const selectedTradeLegSummary = useMemo(
    () => selectedTradeLegSummaryFromRows(selectedTradeLegRows, marksByRowKey),
    [marksByRowKey, selectedTradeLegRows]
  );
  const allDisplayedTradeLegsSelected =
    displayedTradeLegs.length > 0 &&
    displayedTradeLegs.every((row) => selectedTradeLegRowKeys.has(tradeRowKey(row)));

  useEffect(() => {
    if (!selectedGroupKey) return;
    const visibleKeys = new Set(displayedTradeLegs.map((row) => tradeRowKey(row)));
    setSelectedTradeLegRowKeys(
      (keys) => new Set([...keys].filter((key) => visibleKeys.has(key)))
    );
  }, [displayedTradeLegs, selectedGroupKey]);

  const positionRows = positionsData?.rows ?? EMPTY_POSITION_ROWS;
  const positionsSubtitle = positionsData
    ? `As of ${fmtDate(positionsData.asOf)} | ${positionsData.summary.markedRowCount.toLocaleString()} current marks | ${positionsData.summary.dailyMarkedRowCount.toLocaleString()} daily marks`
    : undefined;
  const positionTraderOptions = useMemo(
    () =>
      Array.from(
        new Set(positionRows.map((row) => row.trader).filter(Boolean))
      ).sort((first, second) => first.localeCompare(second)),
    [positionRows]
  );
  const positionAssetOptions = useMemo(
    () =>
      Array.from(
        new Set(positionRows.map((row) => row.asset_class).filter((value): value is string => Boolean(value)))
      ).sort((first, second) => first.localeCompare(second)),
    [positionRows]
  );
  const positionRegionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          positionRows
            .filter(
              (row) =>
                positionAssetFilters.length === 0 ||
                (row.asset_class !== null &&
                  row.asset_class !== undefined &&
                  positionAssetFilters.includes(row.asset_class))
            )
            .map((row) => row.region)
            .filter((value): value is string => Boolean(value))
        )
      ).sort((first, second) => first.localeCompare(second)),
    [positionAssetFilters, positionRows]
  );
  useEffect(() => {
    setPositionRegionFilters((filters) =>
      filters.filter((region) => positionRegionOptions.includes(region))
    );
  }, [positionRegionOptions]);
  const traderFilteredPositionRows = useMemo(
    () =>
      positionRows.filter((row) => {
        if (positionTraderFilter !== "All" && row.trader !== positionTraderFilter) return false;
        if (
          positionAssetFilters.length > 0 &&
          (row.asset_class === null ||
            row.asset_class === undefined ||
            !positionAssetFilters.includes(row.asset_class))
        ) {
          return false;
        }
        if (
          positionRegionFilters.length > 0 &&
          (row.region === null ||
            row.region === undefined ||
            !positionRegionFilters.includes(row.region))
        ) {
          return false;
        }
        return true;
      }),
    [positionAssetFilters, positionRegionFilters, positionRows, positionTraderFilter]
  );
  useEffect(() => {
    setExpandedTenorRowKey(null);
  }, [positionAssetFilters, positionRegionFilters, positionTraderFilter]);
  const positionTenorPivot = useMemo(
    () => buildPositionTenorPivot(traderFilteredPositionRows, positionsData?.asOf ?? ""),
    [positionsData?.asOf, traderFilteredPositionRows]
  );
  const tenorColumns = positionTenorPivot.columns;
  const tenorPivotRows = positionTenorPivot.rows;
  const tenorNetLots = tenorPivotRows.reduce(
    (sum, row) => sum + row.net_lots,
    0
  );
  const tenorDailyPnl = tenorPivotRows.reduce<number | null>(
    (sum, row) =>
      row.daily_pnl === null
        ? sum
        : sum === null
          ? row.daily_pnl
          : sum + row.daily_pnl,
    null
  );
  const tenorOpenPnl = tenorPivotRows.reduce<number | null>(
    (sum, row) =>
      row.open_pnl === null
        ? sum
        : sum === null
          ? row.open_pnl
          : sum + row.open_pnl,
    null
  );
  const tenorDeltaEquivalentLots = tenorPivotRows.reduce<number | null>(
    (sum, row) =>
      row.delta_equivalent_lots === null
        ? sum
        : sum === null
          ? row.delta_equivalent_lots
          : sum + row.delta_equivalent_lots,
    null
  );
  const tenorAggregateMetricTotal =
    positionAggregateMetric === "daily_pnl"
      ? tenorDailyPnl
      : positionAggregateMetric === "open_pnl"
        ? tenorOpenPnl
        : positionAggregateMetric === "delta_equivalent_lots"
          ? tenorDeltaEquivalentLots
          : tenorNetLots;
  const filteredPositionNetQuantity = traderFilteredPositionRows.reduce(
    (sum, row) => sum + row.net_quantity,
    0
  );
  const filteredPositionDailyPnl = traderFilteredPositionRows.reduce<number | null>(
    (sum, row) =>
      row.daily_pnl === null
        ? sum
        : sum === null
          ? row.daily_pnl
          : sum + row.daily_pnl,
    null
  );
  const filteredPositionOpenPnl = traderFilteredPositionRows.reduce<number | null>(
    (sum, row) =>
      row.open_pnl === null
        ? sum
        : sum === null
          ? row.open_pnl
          : sum + row.open_pnl,
    null
  );
  const positionColumnByLabel = useMemo(
    () =>
      new Map(POSITION_COLUMN_DEFINITIONS.map((column) => [column.label, column] as const)),
    []
  );
  const visiblePositionColumns = useMemo(
    () =>
      visiblePositionColumnLabels
        .map((label) => positionColumnByLabel.get(label))
        .filter((column): column is PositionColumnDefinition => Boolean(column)),
    [positionColumnByLabel, visiblePositionColumnLabels]
  );
  const positionColumnFilterOptions = useMemo(() => {
    return Object.fromEntries(
      visiblePositionColumns.map((column) => {
        const otherFilteredRows = traderFilteredPositionRows.filter((row) =>
          Object.entries(positionColumnFilters).every(([key, value]) =>
            key === column.key ||
            positionRowMatchesColumnFilter(row, key as PositionColumnKey, value)
          )
        );
        const options = Array.from(
          new Set(
            otherFilteredRows
              .map((row) => positionColumnDisplayValue(row, column.key))
              .filter((value) => value.trim() !== "" && value !== "--")
          )
        ).sort((first, second) => sortFilterOption(first, second));

        return [column.key, options] as const;
      })
    ) as Partial<Record<PositionColumnKey, string[]>>;
  }, [positionColumnFilters, traderFilteredPositionRows, visiblePositionColumns]);
  const displayedPositionRows = useMemo(() => {
    const activeColumnFilters = Object.entries(positionColumnFilters)
      .map(([key, values]) => [key as PositionColumnKey, values] as const)
      .filter(([, values]) => values.length > 0);

    const filteredRows =
      activeColumnFilters.length === 0
        ? traderFilteredPositionRows
        : traderFilteredPositionRows.filter((row) =>
            activeColumnFilters.every(([key, value]) =>
              positionRowMatchesColumnFilter(row, key, value)
            )
          );

    if (!positionSortState) return filteredRows;
    return [...filteredRows].sort((firstRow, secondRow) =>
      comparePositionColumnValues(firstRow, secondRow, positionSortState)
    );
  }, [positionColumnFilters, positionSortState, traderFilteredPositionRows]);
  const selectedPositionRow = selectedPositionKey
    ? traderFilteredPositionRows.find((row) => positionRowKey(row) === selectedPositionKey) ?? null
    : null;
  const selectedPositionLegs = selectedPositionKey
    ? positionLegsByKey[selectedPositionKey] ?? selectedPositionRow?.legs ?? EMPTY_POSITION_LEG_ROWS
    : EMPTY_POSITION_LEG_ROWS;
  const selectedPositionLegsLoading = Boolean(
    selectedPositionKey &&
      positionLegsLoadingKey === selectedPositionKey &&
      !positionLegsByKey[selectedPositionKey]
  );
  const positionLegColumnByKey = useMemo(
    () =>
      new Map(
        POSITION_LEG_COLUMN_DEFINITIONS.map((column) => [column.key, column] as const)
      ),
    []
  );
  const positionLegColumnFilterOptions = useMemo(() => {
    return Object.fromEntries(
      POSITION_LEG_COLUMN_DEFINITIONS.map((column) => {
        const otherFilteredRows = selectedPositionLegs.filter((row) =>
          Object.entries(positionLegColumnFilters).every(([key, value]) => {
            if (key === column.key) return true;
            const filterColumn = positionLegColumnByKey.get(key as PositionLegColumnKey);
            return filterColumn
              ? positionLegMatchesColumnFilter(row, filterColumn, value)
              : true;
          })
        );
        const options = Array.from(
          new Set(
            otherFilteredRows
              .map((row) => positionLegColumnDisplayValue(row, column))
              .filter((value) => value.trim() !== "" && value !== "--")
          )
        ).sort((first, second) => sortFilterOption(first, second));

        return [column.key, options] as const;
      })
    ) as Partial<Record<PositionLegColumnKey, string[]>>;
  }, [positionLegColumnByKey, positionLegColumnFilters, selectedPositionLegs]);
  const displayedPositionLegs = useMemo(() => {
    const activeColumnFilters = Object.entries(positionLegColumnFilters)
      .map(([key, values]) => [key as PositionLegColumnKey, values] as const)
      .filter(([, values]) => values.length > 0);

    const filteredRows =
      activeColumnFilters.length === 0
        ? selectedPositionLegs
        : selectedPositionLegs.filter((row) =>
            activeColumnFilters.every(([key, values]) => {
              const column = positionLegColumnByKey.get(key);
              return column ? positionLegMatchesColumnFilter(row, column, values) : true;
            })
          );

    if (!positionLegSortState) return filteredRows;
    return [...filteredRows].sort((firstRow, secondRow) =>
      comparePositionLegColumnValues(firstRow, secondRow, positionLegSortState)
    );
  }, [
    positionLegColumnByKey,
    positionLegColumnFilters,
    positionLegSortState,
    selectedPositionLegs,
  ]);
  const selectedPositionLegRows = useMemo(
    () =>
      displayedPositionLegs.filter((row) =>
        selectedPositionLegRowKeys.has(positionLegRowKey(row))
      ),
    [displayedPositionLegs, selectedPositionLegRowKeys]
  );
  const selectedPositionLegSummary = useMemo(
    () => selectedPositionLegSummaryFromRows(selectedPositionLegRows),
    [selectedPositionLegRows]
  );
  const allDisplayedPositionLegsSelected =
    displayedPositionLegs.length > 0 &&
    displayedPositionLegs.every((row) =>
      selectedPositionLegRowKeys.has(positionLegRowKey(row))
    );

  useEffect(() => {
    if (!selectedPositionKey || !positionsData?.asOf) return;
    if (positionLegsByKey[selectedPositionKey]) return;

    const controller = new AbortController();
    let active = true;
    setPositionLegsError(null);
    setPositionLegsLoadingKey(selectedPositionKey);

    fetchJsonWithCache<PositionLegsPayload>({
      key: buildPositionLegsCacheKey(positionsData.asOf, selectedPositionKey, productScope),
      url: buildPositionLegsApiUrl(positionsData.asOf, selectedPositionKey, productScope),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
    })
      .then((payload) => {
        if (!active) return;
        setPositionLegsByKey((legsByKey) => ({
          ...legsByKey,
          [selectedPositionKey]: payload.rows,
        }));
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setPositionLegsError(err.message || "Failed to load position legs");
      })
      .finally(() => {
        if (!active) return;
        setPositionLegsLoadingKey((key) =>
          key === selectedPositionKey ? null : key
        );
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [positionLegsByKey, positionsData?.asOf, productScope, selectedPositionKey]);

  useEffect(() => {
    if (!selectedPositionKey) return;
    const visibleKeys = new Set(displayedPositionLegs.map((row) => positionLegRowKey(row)));
    setSelectedPositionLegRowKeys(
      (keys) => new Set([...keys].filter((key) => visibleKeys.has(key)))
    );
  }, [displayedPositionLegs, selectedPositionKey]);

  const rawDailySettlementRows = dailySettlementsData?.rows ?? EMPTY_DAILY_SETTLEMENT_ROWS;
  const settleQuickAssetOptions = useMemo(
    () => sortedFilterValues(rawDailySettlementRows.map((row) => row.asset_class)),
    [rawDailySettlementRows]
  );
  const settleQuickRegionOptions = useMemo(
    () =>
      sortedFilterValues(
        rawDailySettlementRows
          .filter(
            (row) =>
              quickAssetFilters.length === 0 ||
              quickAssetFilters.includes(String(row.asset_class ?? ""))
          )
          .map((row) => row.region)
      ),
    [quickAssetFilters, rawDailySettlementRows]
  );
  useEffect(() => {
    if (view !== "settles") return;
    setQuickRegionFilters((filters) =>
      filters.filter((region) => settleQuickRegionOptions.includes(region))
    );
  }, [settleQuickRegionOptions, view]);
  const dailySettlementRows = useMemo(
    () =>
      rawDailySettlementRows.filter((row) =>
        rowMatchesQuickFilters(row, "All", quickAssetFilters, quickRegionFilters)
      ),
    [quickAssetFilters, quickRegionFilters, rawDailySettlementRows]
  );
  const dailySettlementColumnByLabel = useMemo(
    () =>
      new Map(
        DAILY_SETTLEMENT_COLUMN_DEFINITIONS.map((column) => [column.label, column] as const)
      ),
    []
  );
  const visibleDailySettlementColumns = useMemo(
    () =>
      visibleDailySettlementColumnLabels
        .map((label) => dailySettlementColumnByLabel.get(label))
        .filter(
          (column): column is DailySettlementColumnDefinition => Boolean(column)
        ),
    [dailySettlementColumnByLabel, visibleDailySettlementColumnLabels]
  );
  const displayedDailySettlementRows = useMemo(() => {
    const activeColumnFilters = Object.entries(dailySettlementColumnFilters)
      .map(([key, values]) => [key as DailySettlementColumnKey, values] as const)
      .filter(([, values]) => values.length > 0);

    const statusFilteredRows =
      dailySettlementStatusFilter === "all"
        ? dailySettlementRows
        : dailySettlementRows.filter(
            (row) => settleAvailability(row).label === dailySettlementStatusFilter
          );
    const dateFilteredRows = dailySettlementDateMismatchFilter
      ? statusFilteredRows.filter((row) => dailySettlementDateCheckStatus(row) === "diff")
      : statusFilteredRows;

    const filteredRows =
      activeColumnFilters.length === 0
        ? dateFilteredRows
        : dateFilteredRows.filter((row) =>
            activeColumnFilters.every(([key, value]) =>
              dailySettlementRowMatchesColumnFilter(row, key, value)
            )
          );

    if (!dailySettlementSortState) return filteredRows;
    return [...filteredRows].sort((firstRow, secondRow) =>
      compareDailySettlementColumnValues(firstRow, secondRow, dailySettlementSortState)
    );
  }, [
    dailySettlementColumnFilters,
    dailySettlementDateMismatchFilter,
    dailySettlementRows,
    dailySettlementSortState,
    dailySettlementStatusFilter,
  ]);
  const rawDebugDailySettlementRows =
    settlesDebugData?.rows ?? rawDailySettlementRows;
  const debugDailySettlementRows = useMemo(
    () =>
      rawDebugDailySettlementRows.filter((row) =>
        rowMatchesQuickFilters(row, "All", quickAssetFilters, quickRegionFilters)
      ),
    [quickAssetFilters, quickRegionFilters, rawDebugDailySettlementRows]
  );
  const debugDailySettlementsSubtitle = settlesDebugData
    ? `Trade Date ${fmtDate(settlesDebugData.endDate)}`
    : settlesDebugTradeDate
      ? `Trade Date ${fmtDate(settlesDebugTradeDate)}`
      : dailySettlementsData
        ? `Trade Date ${fmtDate(dailySettlementsData.endDate)}`
        : undefined;
  const debugDailySettlementColumnFilterOptions = useMemo(() => {
    return Object.fromEntries(
      visibleDailySettlementColumns.map((column) => {
        const otherFilteredRows = debugDailySettlementRows.filter((row) => {
          if (
            dailySettlementStatusFilter !== "all" &&
            settleAvailability(row).label !== dailySettlementStatusFilter
          ) {
            return false;
          }
          if (
            dailySettlementDateMismatchFilter &&
            dailySettlementDateCheckStatus(row) !== "diff"
          ) {
            return false;
          }
          return Object.entries(dailySettlementColumnFilters).every(([key, value]) =>
            key === column.key ||
            dailySettlementRowMatchesColumnFilter(
              row,
              key as DailySettlementColumnKey,
              value
            )
          );
        });
        const options = Array.from(
          new Set(
            otherFilteredRows
              .map((row) => dailySettlementColumnDisplayValue(row, column.key))
              .filter((value) => value.trim() !== "" && value !== "--")
          )
        ).sort((first, second) => sortFilterOption(first, second));

        return [column.key, options] as const;
      })
    ) as Partial<Record<DailySettlementColumnKey, string[]>>;
  }, [
    dailySettlementColumnFilters,
    dailySettlementDateMismatchFilter,
    dailySettlementStatusFilter,
    debugDailySettlementRows,
    visibleDailySettlementColumns,
  ]);
  const debugDailySettlementDateMismatchCount = useMemo(
    () =>
      debugDailySettlementRows.filter((row) => dailySettlementDateCheckStatus(row) === "diff")
        .length,
    [debugDailySettlementRows]
  );
  const debugDailySettlementStatusCounts = useMemo(() => {
    const counts = new Map<SettlementStatusFilter, number>();
    counts.set("all", debugDailySettlementRows.length);
    debugDailySettlementRows.forEach((row) => {
      const label = settleAvailability(row).label;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return counts;
  }, [debugDailySettlementRows]);
  const displayedDebugDailySettlementRows = useMemo(() => {
    const activeColumnFilters = Object.entries(dailySettlementColumnFilters)
      .map(([key, values]) => [key as DailySettlementColumnKey, values] as const)
      .filter(([, values]) => values.length > 0);

    const statusFilteredRows =
      dailySettlementStatusFilter === "all"
        ? debugDailySettlementRows
        : debugDailySettlementRows.filter(
            (row) => settleAvailability(row).label === dailySettlementStatusFilter
          );
    const dateFilteredRows = dailySettlementDateMismatchFilter
      ? statusFilteredRows.filter((row) => dailySettlementDateCheckStatus(row) === "diff")
      : statusFilteredRows;

    const filteredRows =
      activeColumnFilters.length === 0
        ? dateFilteredRows
        : dateFilteredRows.filter((row) =>
            activeColumnFilters.every(([key, value]) =>
              dailySettlementRowMatchesColumnFilter(row, key, value)
            )
          );

    if (!dailySettlementSortState) return filteredRows;
    return [...filteredRows].sort((firstRow, secondRow) =>
      compareDailySettlementColumnValues(firstRow, secondRow, dailySettlementSortState)
    );
  }, [
    dailySettlementColumnFilters,
    dailySettlementDateMismatchFilter,
    dailySettlementSortState,
    dailySettlementStatusFilter,
    debugDailySettlementRows,
  ]);
  const settlementSummary = useMemo(
    () => buildSettlementSummary(displayedDailySettlementRows),
    [displayedDailySettlementRows]
  );
  const settlementSummaryColumns = settlementSummary.columns;
  const settlementSummaryRows = settlementSummary.rows;
  const settlementHistoryRows = useMemo(() => {
    if (!settlementHistorySelection || !settlementHistoryData) return EMPTY_DAILY_SETTLEMENT_ROWS;
    return settlementHistoryData.rows
      .filter(
        (row) =>
          dailySettlementProductKey(row) === settlementHistorySelection.productKey &&
          row.symbol === settlementHistorySelection.symbol
      )
      .sort((first, second) => second.date.localeCompare(first.date));
  }, [settlementHistoryData, settlementHistorySelection]);
  const settlementHistorySettleTradeDateByWindow = useMemo(() => {
    const datesByWindow = new Map<string, string>();
    settlementHistoryRows.forEach((row) => {
      const confidence = dailySettlementConfidence(row);
      if (!confidence.label.startsWith("Complete") || toFiniteNumber(row.settlement) === null) {
        return;
      }
      const key = settlementHistoryWindowKey(row);
      const existingDate = datesByWindow.get(key);
      if (!existingDate || row.date > existingDate) {
        datesByWindow.set(key, row.date);
      }
    });
    return datesByWindow;
  }, [settlementHistoryRows]);
  const settlementHistoryColumnFilterOptions = useMemo(
    () =>
      Object.fromEntries(
        SETTLEMENT_HISTORY_FILTER_COLUMNS.map((column) => {
          const options = Array.from(
            new Set(
              settlementHistoryRows
                .map((row) => settlementHistoryColumnDisplayValue(row, column.key))
                .filter((value) => value.trim() !== "" && value !== "--")
            )
          ).sort((first, second) => sortFilterOption(first, second));
          return [column.key, options] as const;
        })
      ) as Record<SettlementHistoryColumnKey, string[]>,
    [settlementHistoryRows]
  );
  const displayedSettlementHistoryRows = useMemo(() => {
    const activeFilters = Object.entries(settlementHistoryColumnFilters)
      .map(([key, values]) => [key as SettlementHistoryColumnKey, values] as const)
      .filter(([, values]) => values.length > 0);
    const filteredRows =
      activeFilters.length === 0
        ? settlementHistoryRows
        : settlementHistoryRows.filter((row) =>
            activeFilters.every(([key, values]) => {
              const displayValue = settlementHistoryColumnDisplayValue(row, key).toLowerCase();
              return values.some((value) => displayValue === value.trim().toLowerCase());
            })
          );
    if (!settlementHistorySortState) return filteredRows;
    return [...filteredRows].sort((first, second) => {
      const firstValue = settlementHistoryColumnSortValue(first, settlementHistorySortState.key);
      const secondValue = settlementHistoryColumnSortValue(second, settlementHistorySortState.key);
      const direction = settlementHistorySortState.direction === "asc" ? 1 : -1;
      if (typeof firstValue === "number" && typeof secondValue === "number") {
        return (firstValue - secondValue) * direction;
      }
      return String(firstValue).localeCompare(String(secondValue), undefined, {
        numeric: true,
        sensitivity: "base",
      }) * direction;
    });
  }, [settlementHistoryColumnFilters, settlementHistoryRows, settlementHistorySortState]);
  const openSettlementHistory = (
    row: SettlementSummaryRow,
    column: TradeSummaryColumn
  ) => {
    const cell = row.cells[column.key];
    const sourceRow = cell?.rows[0];
    if (!sourceRow) return;

    const historyEndDate =
      dailySettlementsData?.endDate ||
      dailySettlementsData?.summary.latestDate ||
      isoDateKeyFromDate(new Date());
    setSettlementHistorySelection({
      productKey: row.key,
      product: row.product,
      assetClass: row.assetClass,
      region: row.region,
      columnKey: column.key,
      columnLabel: column.label,
      symbol: sourceRow.symbol,
      historyEndDate,
    });
    setSettlementHistoryColumnFilters({});
    setSettlementHistorySortState(null);
  };
  const productDictionaryRows = productDictionaryData?.rows ?? EMPTY_PRODUCT_DICTIONARY_ROWS;
  const productQuickAssetOptions = useMemo(
    () => sortedFilterValues(productDictionaryRows.map((row) => row.asset_class)),
    [productDictionaryRows]
  );
  const productQuickRegionOptions = useMemo(
    () =>
      sortedFilterValues(
        productDictionaryRows
          .filter(
            (row) =>
              quickAssetFilters.length === 0 ||
              quickAssetFilters.includes(String(row.asset_class ?? ""))
          )
          .map((row) => row.region)
      ),
    [productDictionaryRows, quickAssetFilters]
  );
  useEffect(() => {
    if (view !== "products") return;
    setQuickRegionFilters((filters) =>
      filters.filter((region) => productQuickRegionOptions.includes(region))
    );
  }, [productQuickRegionOptions, view]);
  const filteredProductDictionaryData = useMemo(() => {
    if (!productDictionaryData) return null;
    const filteredRows = productDictionaryRows.filter((row) =>
      rowMatchesQuickFilters(row, "All", quickAssetFilters, quickRegionFilters)
    );
    return {
      ...productDictionaryData,
      rowCount: filteredRows.length,
      summary: productDictionarySummaryFromRows(filteredRows),
      rows: filteredRows,
    };
  }, [productDictionaryData, productDictionaryRows, quickAssetFilters, quickRegionFilters]);
  const quickFiltersVisible =
    view === "trades" || view === "settles" || view === "products";
  const quickFilterTraderOptions = useMemo(
    () => (view === "trades" ? tradeQuickTraderOptions : EMPTY_FILTER_VALUES),
    [tradeQuickTraderOptions, view]
  );
  const quickFilterAssetOptions = useMemo(
    () =>
      view === "trades"
        ? tradeQuickAssetOptions
        : view === "settles"
          ? settleQuickAssetOptions
          : view === "products"
            ? productQuickAssetOptions
            : EMPTY_FILTER_VALUES,
    [productQuickAssetOptions, settleQuickAssetOptions, tradeQuickAssetOptions, view]
  );
  const quickFilterRegionOptions = useMemo(
    () =>
      view === "trades"
        ? tradeQuickRegionOptions
        : view === "settles"
          ? settleQuickRegionOptions
          : view === "products"
            ? productQuickRegionOptions
            : EMPTY_FILTER_VALUES,
    [productQuickRegionOptions, settleQuickRegionOptions, tradeQuickRegionOptions, view]
  );
  const quickFilterTotalRows =
    view === "trades"
      ? rows.length
      : view === "settles"
        ? rawDailySettlementRows.length
        : view === "products"
          ? productDictionaryRows.length
          : 0;
  const quickFilterDisplayedRows =
    view === "trades"
      ? quickFilteredRows.length
      : view === "settles"
        ? dailySettlementRows.length
        : view === "products"
          ? filteredProductDictionaryData?.rows.length ?? 0
          : 0;
  const quickFilterActive =
    quickTraderFilter !== "All" || quickAssetFilters.length > 0 || quickRegionFilters.length > 0;
  useEffect(() => {
    if (!quickFiltersVisible) return;
    if (view !== "trades" && quickTraderFilter !== "All") {
      setQuickTraderFilter("All");
    }
    setQuickAssetFilters((filters) =>
      filters.filter((asset) => quickFilterAssetOptions.includes(asset))
    );
    setQuickRegionFilters((filters) =>
      filters.filter((region) => quickFilterRegionOptions.includes(region))
    );
  }, [
    quickFilterAssetOptions,
    quickFilterRegionOptions,
    quickFiltersVisible,
    quickTraderFilter,
    view,
  ]);
  const selectedPnlSummary = useMemo(
    () =>
      selectedPnlSummaryFromCells(
        displayedRows,
        selectedCellKeys,
        marksByRowKey
      ),
    [displayedRows, marksByRowKey, selectedCellKeys]
  );

  useEffect(() => {
    if (!isSelectingCells) return;

    const stopSelecting = () => setIsSelectingCells(false);
    window.addEventListener("mouseup", stopSelecting);
    return () => window.removeEventListener("mouseup", stopSelecting);
  }, [isSelectingCells]);

  useEffect(() => {
    if (!isSelectingDailySettlementCells) return;

    const stopSelecting = () => setIsSelectingDailySettlementCells(false);
    window.addEventListener("mouseup", stopSelecting);
    return () => window.removeEventListener("mouseup", stopSelecting);
  }, [isSelectingDailySettlementCells]);


  const downloadCsv = () => {
    const header = visibleColumns.map((column) => csvCell(column.label)).join(",");
    const body = displayedRows.map((row) =>
      visibleColumns
        .map((column) => csvCell(columnDisplayValue(row, column.key, marksByRowKey)))
        .join(",")
    );
    const csv = [header, ...body].join("\r\n");
    const dateSegment =
      dateMode === "single"
        ? loadedSingleDate
        : `${loadedStartDate}_to_${loadedEndDate}`;
    const modeSegment = groupRowsEnabled ? "grouped" : "raw";
    const filename = `ice-trade-blotter-${view}-${dateMode}-${csvFileSegment(dateSegment)}-${modeSegment}.csv`;
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadPositionsCsv = () => {
    const header = visiblePositionColumns.map((column) => csvCell(column.label)).join(",");
    const body = displayedPositionRows.map((row) =>
      visiblePositionColumns
        .map((column) => csvCell(positionColumnDisplayValue(row, column.key)))
        .join(",")
    );
    const csv = [header, ...body].join("\r\n");
    const dateSegment = positionsData?.asOf ?? loadedSingleDate;
    const filename = `ice-trade-blotter-positions-${csvFileSegment(dateSegment)}.csv`;
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const toggleGroupRows = () => {
    setGroupRowsEnabled((enabled) => !enabled);
    setMarksByRowKey(data ? marksFromSettlementRows(data.rows) : {});
    clearExpandedGroups();
    clearCellSelection();
  };

  const openTradeLegsPopup = (groupKey: string) => {
    if (!groupedLegsByKey.has(groupKey)) return;
    clearTradeLegPopupState();
    setSelectedGroupKey(groupKey);
  };

  const closeTradeLegsPopup = () => {
    setSelectedGroupKey(null);
    clearTradeLegPopupState();
  };

  const handleTradeRowClick = (
    event: React.MouseEvent<HTMLTableRowElement>,
    row: IceTradeBlotterRow
  ) => {
    if (!groupRowsEnabled) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) return;
    const groupKey = groupedTradeRowKey(row);
    openTradeLegsPopup(groupKey);
  };

  const toggleTradeLegRowSelection = (rowKey: string) => {
    setSelectedTradeLegRowKeys((keys) => {
      const next = new Set(keys);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const toggleAllDisplayedTradeLegs = () => {
    setSelectedTradeLegRowKeys((keys) => {
      if (allDisplayedTradeLegsSelected) return new Set();
      return new Set([...keys, ...displayedTradeLegs.map((row) => tradeRowKey(row))]);
    });
  };

  const clearTradeLegFilters = () => {
    setTradeLegColumnFilters({});
    setSelectedTradeLegRowKeys(new Set());
  };

  const openPositionLegsPopup = (positionKey: string) => {
    setPositionLegColumnFilters({});
    setPositionLegSortState(DEFAULT_POSITION_LEG_SORT_STATE);
    setSelectedPositionLegRowKeys(new Set());
    setPositionLegsError(null);
    setSelectedPositionKey(positionKey);
  };

  const closePositionLegsPopup = () => {
    clearPositionPopupState();
  };

  const togglePositionLegRowSelection = (rowKey: string) => {
    setSelectedPositionLegRowKeys((keys) => {
      const next = new Set(keys);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const toggleAllDisplayedPositionLegs = () => {
    setSelectedPositionLegRowKeys((keys) => {
      if (allDisplayedPositionLegsSelected) return new Set();
      return new Set([...keys, ...displayedPositionLegs.map((row) => positionLegRowKey(row))]);
    });
  };

  const clearPositionLegFilters = () => {
    setPositionLegColumnFilters({});
    setSelectedPositionLegRowKeys(new Set());
  };

  const renderTableCell = (row: IceTradeBlotterRow, column: ColumnDefinition) => {
    if (column.key === "mark") {
      const mark = markValue(row);
      return (
        <span
          title={`Active mark: ${fmtOptionalPrice(mark)} (${markSourceDetail(row.active_mark_source)})`}
          className="inline-block min-w-20 tabular-nums"
        >
          {fmtOptionalPrice(mark)}
        </span>
      );
    }

    if (column.key === "pnl") {
      return fmtPnl(pnlValue(row, marksByRowKey));
    }

    return column.render(row);
  };

  const renderExpandableTableCell = (
    row: IceTradeBlotterRow,
    column: ColumnDefinition,
    columnIndex: number,
    groupKey: string,
    legCount: number
  ) => {
    if (!groupRowsEnabled || columnIndex !== 0 || legCount === 0) {
      return renderTableCell(row, column);
    }

    return (
      <span className="flex w-max items-center gap-2">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Show ${legCount.toLocaleString()} trade legs`}
          title={`Show ${legCount.toLocaleString()} trade legs`}
          onClick={(event) => {
            event.stopPropagation();
            openTradeLegsPopup(groupKey);
          }}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-700 bg-gray-950 text-[10px] font-bold text-gray-300 transition-colors hover:border-sky-500/60 hover:text-sky-200"
        >
          {">"}
        </button>
        <span className="whitespace-nowrap">{renderTableCell(row, column)}</span>
        <span className="shrink-0 rounded border border-gray-700 bg-gray-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
          {legCount.toLocaleString()} legs
        </span>
      </span>
    );
  };

  const tableCellClass = (row: IceTradeBlotterRow, column: ColumnDefinition) => {
    if (!coloringEnabled) return "";
    if (column.key === "pnl") {
      const value = pnlValue(row, marksByRowKey);
      return value === null ? "" : quantityClass(value);
    }
    return column.cellClass?.(row) ?? "";
  };

  const renderPositionLegsPopup = () => {
    if (!selectedPositionRow) return null;

    const activePositionLegFilterCount = Object.values(positionLegColumnFilters).filter(
      (values) => values && values.length > 0
    ).length;
    const hasSelectedPositionLegs = selectedPositionLegSummary.rowCount > 0;
    const netQuantityClass = quantityClass(selectedPositionRow.net_quantity);
    const pnlClass =
      selectedPositionRow.open_pnl === null
        ? "text-gray-500"
        : selectedPositionRow.open_pnl > 0
          ? "text-emerald-300"
          : selectedPositionRow.open_pnl < 0
            ? "text-rose-300"
            : "text-gray-200";

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closePositionLegsPopup();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ice-position-leg-dialog-title"
          className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#10141d] shadow-2xl shadow-black/50 sm:w-[calc(100vw-2rem)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 px-4 py-3">
            <div className="min-w-0">
              <h2 id="ice-position-leg-dialog-title" className="text-sm font-semibold text-gray-100">
                Position Legs
              </h2>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500">
                <span>{fmtText(selectedPositionRow.trader)}</span>
                <span>{fmtText(selectedPositionRow.product)}</span>
                <span>{fmtText(selectedPositionRow.hub)}</span>
                <span>{fmtContractDate(selectedPositionRow.contract)}</span>
                <span>{fmtIsoDate(selectedPositionRow.begin_date)} to {fmtIsoDate(selectedPositionRow.end_date)}</span>
                <span>
                  {selectedPositionLegsLoading
                    ? `Loading ${selectedPositionRow.contributing_trade_count.toLocaleString()} legs`
                    : `${selectedPositionLegs.length.toLocaleString()} legs`}
                </span>
                <span>
                  {displayedPositionLegs.length.toLocaleString()} /{" "}
                  {(selectedPositionLegsLoading
                    ? selectedPositionRow.contributing_trade_count
                    : selectedPositionLegs.length
                  ).toLocaleString()} shown
                </span>
                {positionLegsError ? (
                  <span className="text-rose-300">{positionLegsError}</span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  Selected {selectedPositionLegSummary.rowCount.toLocaleString()}
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  Net QTY{" "}
                  <span className={`font-semibold tabular-nums ${netQuantityClass || "text-gray-200"}`}>
                    {fmtNumber(selectedPositionRow.net_quantity, 0)}
                  </span>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  Avg Price{" "}
                  <span className="font-semibold tabular-nums text-gray-200">
                    {fmtOptionalPrice(selectedPositionRow.avg_price)}
                  </span>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  Mark{" "}
                  <span className="font-semibold tabular-nums text-gray-200">
                    {fmtOptionalPrice(selectedPositionRow.settlement_mark)}
                  </span>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  Open P&L{" "}
                  <span className={`font-semibold tabular-nums ${pnlClass}`}>
                    {fmtPnl(selectedPositionRow.open_pnl)}
                  </span>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  Selected Lots{" "}
                  <span className="font-semibold tabular-nums text-gray-200">
                    {hasSelectedPositionLegs
                      ? fmtNumber(selectedPositionLegSummary.lots, 0)
                      : "--"}
                  </span>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  Selected QTY{" "}
                  <span className="font-semibold tabular-nums text-gray-200">
                    {hasSelectedPositionLegs
                      ? fmtNumber(selectedPositionLegSummary.signedQuantity, 0)
                      : "--"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={toggleAllDisplayedPositionLegs}
                disabled={displayedPositionLegs.length === 0}
                className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:border-gray-800 disabled:text-gray-600"
              >
                {allDisplayedPositionLegsSelected ? "Clear Selected" : "Select Visible"}
              </button>
              {activePositionLegFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearPositionLegFilters}
                  className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
                >
                  Clear Filters
                </button>
              )}
              <button
                type="button"
                onClick={closePositionLegsPopup}
                className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-max min-w-full table-auto border-collapse text-xs text-gray-200">
              <thead className="sticky top-0 z-10 bg-gray-950 text-gray-500">
                <tr className="border-b border-gray-800">
                  <th className="w-10 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={allDisplayedPositionLegsSelected}
                      disabled={displayedPositionLegs.length === 0}
                      onChange={toggleAllDisplayedPositionLegs}
                      aria-label="Select all visible position legs"
                      className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900 text-sky-500"
                    />
                  </th>
                  {POSITION_LEG_COLUMN_DEFINITIONS.map((column) => {
                    const filterOptions =
                      positionLegColumnFilterOptions[column.key] ?? EMPTY_FILTER_VALUES;
                    const selectedFilters =
                      positionLegColumnFilters[column.key] ?? EMPTY_FILTER_VALUES;
                    const sortDirection =
                      positionLegSortState?.key === column.key
                        ? positionLegSortState.direction
                        : null;

                    return (
                      <th
                        key={column.key}
                        className={`whitespace-nowrap px-3 py-2 text-left font-semibold uppercase tracking-wide ${
                          column.align === "right" ? "text-right" : ""
                        }`}
                      >
                        <div className="flex w-max items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => updatePositionLegSort(column.key)}
                            className={`flex w-max items-center gap-1 rounded-md px-1 py-0.5 text-[10px] transition-colors hover:bg-gray-900 ${
                              sortDirection ? "text-sky-200" : "text-gray-400"
                            }`}
                            aria-label={`Sort ${column.label}`}
                          >
                            <span>{column.label}</span>
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
                            options={filterOptions}
                            selected={selectedFilters}
                            sortDirection={sortDirection}
                            onSort={(direction) =>
                              setPositionLegSortState({ key: column.key, direction })
                            }
                            onChange={(values) =>
                              updatePositionLegColumnFilter(column.key, values)
                            }
                          />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {displayedPositionLegs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={POSITION_LEG_COLUMN_DEFINITIONS.length + 1}
                      className="px-3 py-8 text-center text-sm text-gray-500"
                    >
                      {selectedPositionLegsLoading
                        ? "Loading source legs..."
                        : positionLegsError
                          ? positionLegsError
                          : "No source legs found."}
                    </td>
                  </tr>
                ) : (
                  displayedPositionLegs.map((leg) => {
                    const rowKey = positionLegRowKey(leg);
                    const selected = selectedPositionLegRowKeys.has(rowKey);

                    return (
                      <tr
                        key={rowKey}
                        className={`hover:bg-gray-900/60 ${
                          selected ? "bg-sky-500/10" : ""
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => togglePositionLegRowSelection(rowKey)}
                            aria-label={`Select position leg ${fmtText(leg.leg_id)}`}
                            className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900 text-sky-500"
                          />
                        </td>
                        {POSITION_LEG_COLUMN_DEFINITIONS.map((column) => (
                          <td
                            key={column.key}
                            className={`whitespace-nowrap px-3 py-2 text-gray-300 ${
                              column.align === "right" ? "text-right tabular-nums" : ""
                            } ${column.className?.(leg) ?? ""}`}
                          >
                            {column.render(leg)}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderTradeLegsPopup = () => {
    if (!selectedGroupKey || !selectedGroupRow || selectedGroupLegs.length === 0) return null;

    const activeTradeLegFilterCount = Object.values(tradeLegColumnFilters).filter(
      (values) => values && values.length > 0
    ).length;
    const hasSelectedTradeLegs = selectedTradeLegSummary.rowCount > 0;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeTradeLegsPopup();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ice-trade-leg-dialog-title"
          className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#10141d] shadow-2xl shadow-black/50 sm:w-[calc(100vw-2rem)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 px-4 py-3">
            <div className="min-w-0">
              <h2 id="ice-trade-leg-dialog-title" className="text-sm font-semibold text-gray-100">
                Trade Legs
              </h2>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500">
                <span>{fmtIsoDate(selectedGroupRow.trade_date)}</span>
                <span>{fmtText(selectedGroupRow.trader)}</span>
                <span>{fmtText(selectedGroupRow.hub)}</span>
                <span>{fmtContractDate(selectedGroupRow.contract)}</span>
                <span>{selectedGroupLegs.length.toLocaleString()} legs</span>
                <span>
                  {displayedTradeLegs.length.toLocaleString()} /{" "}
                  {selectedGroupLegs.length.toLocaleString()} shown
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  Selected {selectedTradeLegSummary.rowCount.toLocaleString()}
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  Net Lots{" "}
                  <span className="font-semibold tabular-nums text-gray-200">
                    {hasSelectedTradeLegs ? fmtNumber(selectedTradeLegSummary.lots, 0) : "--"}
                  </span>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  Total QTY{" "}
                  <span className="font-semibold tabular-nums text-gray-200">
                    {hasSelectedTradeLegs
                      ? fmtNumber(selectedTradeLegSummary.totalQuantity, 0)
                      : "--"}
                  </span>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  Signed QTY{" "}
                  <span className="font-semibold tabular-nums text-gray-200">
                    {hasSelectedTradeLegs
                      ? fmtNumber(selectedTradeLegSummary.signedQuantity, 0)
                      : "--"}
                  </span>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  P&L{" "}
                  <span
                    className={`font-semibold tabular-nums ${
                      selectedTradeLegSummary.pnlTotal === null
                        ? "text-gray-500"
                        : selectedTradeLegSummary.pnlTotal > 0
                          ? "text-emerald-300"
                          : selectedTradeLegSummary.pnlTotal < 0
                            ? "text-rose-300"
                            : "text-gray-200"
                    }`}
                  >
                    {hasSelectedTradeLegs ? fmtPnl(selectedTradeLegSummary.pnlTotal) : "--"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={toggleAllDisplayedTradeLegs}
                disabled={displayedTradeLegs.length === 0}
                className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:border-gray-800 disabled:text-gray-600"
              >
                {allDisplayedTradeLegsSelected ? "Clear Selected" : "Select Visible"}
              </button>
              {activeTradeLegFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearTradeLegFilters}
                  className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
                >
                  Clear Filters
                </button>
              )}
              <button
                type="button"
                onClick={closeTradeLegsPopup}
                className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-max min-w-full table-auto border-collapse text-xs text-gray-200">
              <thead className="sticky top-0 z-10 bg-gray-950 text-gray-500">
                <tr className="border-b border-gray-800">
                  <th className="w-10 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={allDisplayedTradeLegsSelected}
                      disabled={displayedTradeLegs.length === 0}
                      onChange={toggleAllDisplayedTradeLegs}
                      aria-label="Select all visible trade legs"
                      className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900 text-sky-500"
                    />
                  </th>
                  {TRADE_LEG_DETAIL_COLUMNS.map((column) => {
                    const filterOptions =
                      tradeLegColumnFilterOptions[column.key] ?? EMPTY_FILTER_VALUES;
                    const selectedFilters =
                      tradeLegColumnFilters[column.key] ?? EMPTY_FILTER_VALUES;
                    const sortDirection =
                      tradeLegSortState?.key === column.key
                        ? tradeLegSortState.direction
                        : null;

                    return (
                      <th
                        key={column.key}
                        className={`whitespace-nowrap px-3 py-2 text-left font-semibold uppercase tracking-wide ${
                          column.align === "right" ? "text-right" : ""
                        }`}
                      >
                        <div className="flex w-max items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setTradeLegSortState((sort) =>
                                sort?.key === column.key && sort.direction === "asc"
                                  ? { key: column.key, direction: "desc" }
                                  : { key: column.key, direction: "asc" }
                              )
                            }
                            className={`flex w-max items-center gap-1 rounded-md px-1 py-0.5 text-[10px] transition-colors hover:bg-gray-900 ${
                              sortDirection ? "text-sky-200" : "text-gray-400"
                            }`}
                            aria-label={`Sort ${column.label}`}
                          >
                            <span>{column.label}</span>
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
                            options={filterOptions}
                            selected={selectedFilters}
                            sortDirection={sortDirection}
                            onSort={(direction) =>
                              setTradeLegSortState({ key: column.key, direction })
                            }
                            onChange={(values) => updateTradeLegColumnFilter(column.key, values)}
                          />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {displayedTradeLegs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={TRADE_LEG_DETAIL_COLUMNS.length + 1}
                      className="px-3 py-8 text-center text-sm text-gray-500"
                    >
                      No trade legs found.
                    </td>
                  </tr>
                ) : (
                  displayedTradeLegs.map((leg) => {
                    const rowKey = tradeRowKey(leg);
                    const selected = selectedTradeLegRowKeys.has(rowKey);

                    return (
                      <tr
                        key={rowKey}
                        className={`hover:bg-gray-900/60 ${
                          selected ? "bg-sky-500/10" : ""
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleTradeLegRowSelection(rowKey)}
                            aria-label={`Select trade leg ${fmtText(leg.leg_id)}`}
                            className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900 text-sky-500"
                          />
                        </td>
                        {TRADE_LEG_DETAIL_COLUMNS.map((column) => (
                          <td
                            key={column.key}
                            className={`whitespace-nowrap px-3 py-2 text-gray-300 ${
                              column.align === "right" ? "text-right tabular-nums" : ""
                            } ${column.className?.(leg, marksByRowKey) ?? ""}`}
                          >
                            {column.render(leg, marksByRowKey)}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderTradeSummaryPopup = () => {
    if (!selectedTradeSummaryRow) return null;

    const detailRows = [...selectedTradeSummaryRow.trades].sort(
      (first, second) =>
        String(second.trade_time ?? "").localeCompare(String(first.trade_time ?? "")) ||
        String(second.deal_id ?? "").localeCompare(String(first.deal_id ?? ""))
    );
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedTradeSummaryKey(null);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ice-trade-summary-dialog-title"
          className="flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#10141d] shadow-2xl shadow-black/50 sm:w-[calc(100vw-2rem)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 px-4 py-3">
            <div className="min-w-0">
              <h2 id="ice-trade-summary-dialog-title" className="text-sm font-semibold text-gray-100">
                {selectedTradeSummaryRow.product}
              </h2>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500">
                <span>{selectedTradeSummaryRow.assetClass}</span>
                <span>{selectedTradeSummaryRow.region}</span>
                <span>{selectedTradeSummaryRow.rowCount.toLocaleString()} legs</span>
                <span>{TRADE_SUMMARY_METRICS.find((metric) => metric.key === tradeSummaryMetric)?.label}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  Marked{" "}
                  <span className="font-semibold tabular-nums text-gray-200">
                    {selectedTradeSummaryRow.markedCount.toLocaleString()} /{" "}
                    {selectedTradeSummaryRow.rowCount.toLocaleString()}
                  </span>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  Net QTY{" "}
                  <span
                    className={`font-semibold tabular-nums ${
                      quantityClass(selectedTradeSummaryRow.netQuantity) || "text-gray-200"
                    }`}
                  >
                    {fmtNumber(selectedTradeSummaryRow.netQuantity, 0)}
                  </span>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-[11px] text-gray-400">
                  P&L{" "}
                  <span
                    className={`font-semibold tabular-nums ${tradeSummaryMetricClass(
                      selectedTradeSummaryRow.pnl,
                      "pnl"
                    )}`}
                  >
                    {fmtPnl(selectedTradeSummaryRow.pnl)}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTradeSummaryKey(null)}
              className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-max min-w-full table-auto border-collapse text-xs text-gray-200">
              <thead className="sticky top-0 z-10 bg-gray-950 text-gray-500">
                <tr className="border-b border-gray-800">
                  {[
                    "Trade Time",
                    "Deal",
                    "Trader",
                    "Contract",
                    "Delivery",
                    "B/S",
                    "Lots",
                    "Net QTY",
                    "Price",
                    "Settle",
                    "P&L",
                    "Status",
                  ].map((label, index) => (
                    <th
                      key={label}
                      className={`whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${
                        index >= 6 && index <= 10 ? "text-right" : "text-left"
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {detailRows.map((trade) => {
                  const tradePnl = pnlValue(trade, marksByRowKey);
                  const tradePnlClass = tradeSummaryMetricClass(tradePnl, "pnl");
                  return (
                    <tr key={tradeRowKey(trade)} className="hover:bg-gray-900/60">
                      <td className="whitespace-nowrap px-3 py-2 text-gray-300">
                        {fmtText(trade.trade_time)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-300">
                        {fmtText(trade.deal_id)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-300">
                        {fmtText(trade.trader)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-300">
                        {fmtContractDate(trade.contract)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-300">
                        {fmtIsoDate(trade.begin_date)} to {fmtIsoDate(trade.end_date)}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 ${sideClass(trade.b_s) || "text-gray-300"}`}>
                        {fmtText(trade.b_s)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-300">
                        {fmtNumber(trade.lots, 0)}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${quantityClass(signedQuantity(trade)) || "text-gray-300"}`}>
                        {fmtNumber(signedQuantity(trade), 0)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-300">
                        {fmtOptionalPrice(trade.price)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-300">
                        {fmtOptionalPrice(activeMarkValue(trade, marksByRowKey))}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums font-semibold ${tradePnlClass}`}>
                        {fmtPnl(tradePnl)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-300">
                        {fmtText(trade.settlement_match_status)}
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
  };

  return (
    <div className="w-full space-y-4">
      {quickFiltersVisible && (
        <div className="mx-auto w-full max-w-3xl">
            <ControlCard title="Market Filters">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                Filters
              </span>
              <span className="h-px flex-1 bg-gray-800" />
              <span className="text-xs text-gray-500">
                {quickFilterDisplayedRows.toLocaleString()} /{" "}
                {quickFilterTotalRows.toLocaleString()}{" "}
                {view === "settles" ? "settles" : view === "products" ? "products" : "trades"}
              </span>
            </div>
            {view === "trades" && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Trader
                </span>
                {["All", ...quickFilterTraderOptions].map((trader) => {
                  const active = quickTraderFilter === trader;
                  return (
                    <button
                      key={trader}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setQuickTraderFilter(trader);
                        clearCellSelection();
                        clearExpandedGroups();
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
                        active
                          ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
                          : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
                      }`}
                    >
                      {trader === "All" ? "All Traders" : trader}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Asset
              </span>
              {["All", ...quickFilterAssetOptions].map((asset) => {
                const active =
                  asset === "All"
                    ? quickAssetFilters.length === 0
                    : quickAssetFilters.includes(asset);
                return (
                  <button
                    key={asset}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      toggleQuickAssetFilter(asset);
                      clearExpandedGroups();
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
                      active
                        ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
                        : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
                    }`}
                  >
                    {asset === "All" ? "All Assets" : asset}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Region
              </span>
              {["All", ...quickFilterRegionOptions].map((region) => {
                const active =
                  region === "All"
                    ? quickRegionFilters.length === 0
                    : quickRegionFilters.includes(region);
                return (
                  <button
                    key={region}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      toggleQuickRegionFilter(region);
                      clearExpandedGroups();
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
                      active
                        ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
                        : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
                    }`}
                  >
                    {region === "All" ? "All Regions" : region}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Term
              </span>
              {TRADE_BLOTTER_SCOPE_TABS.map((scope) => {
                const active = productScope === scope.value;
                return (
                  <button
                    key={scope.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setProductScope(scope.value);
                      resetTable();
                      clearExpandedGroups();
                      clearPositionPopupState();
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
                      active
                        ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
                        : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
                    }`}
                  >
                    {scope.label}
                  </button>
                );
              })}
            </div>
            {quickFilterActive && (
              <button
                type="button"
                onClick={() => {
                  clearQuickFilters();
                  clearExpandedGroups();
                }}
                className="rounded-full border border-gray-700 bg-transparent px-3 py-1 text-xs font-semibold text-gray-500 transition-all duration-150 hover:border-gray-600 hover:text-gray-300"
              >
                Clear Filters
              </button>
            )}
          </div>
            </ControlCard>
        </div>
      )}

      {view === "pnl" && !loading && (
        <DataTableShell
          title="P&L Summary"
          subtitle={
            pnlSummaryData
              ? `${fmtDate(pnlSummaryData.startDate)} to ${fmtDate(pnlSummaryData.endDate)} | ${pnlSummaryRows.length.toLocaleString()} business days`
              : undefined
          }
          className="w-full max-w-none"
          bodyClassName="w-full"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs text-gray-400">
                Traders{" "}
                <span className="font-semibold tabular-nums text-gray-200">
                  {pnlSummaryTraders.length.toLocaleString()}
                </span>
              </div>
              <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs text-gray-400">
                Marks{" "}
                <span
                  className={`font-semibold tabular-nums ${
                    pnlSummaryMarkedCount === pnlSummaryTotalCount
                      ? "text-emerald-200"
                      : "text-amber-200"
                  }`}
                >
                  {pnlSummaryMarkedCount.toLocaleString()} / {pnlSummaryTotalCount.toLocaleString()}
                </span>
              </div>
            </div>
          }
        >
          <div className="overflow-auto">
            <table className="min-w-full divide-y divide-gray-800 text-left text-xs">
              <thead className="bg-gray-950/80 text-[10px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="sticky left-0 z-10 min-w-[120px] bg-gray-950/95 px-3 py-2 font-bold">
                    Date
                  </th>
                  {pnlSummaryTraders.map((trader) => (
                    <th key={trader} className="min-w-[110px] px-3 py-2 text-right font-bold">
                      {trader}
                    </th>
                  ))}
                  <th className="min-w-[90px] px-3 py-2 text-right font-bold">
                    Marks
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {pnlSummaryRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={pnlSummaryTraders.length + 2}
                      className="px-3 py-10 text-center text-sm text-gray-500"
                    >
                      No P&L summary rows for the selected business days.
                    </td>
                  </tr>
                ) : (
                  pnlSummaryRows.map((row) => (
                    <tr key={row.date} className="hover:bg-gray-900/60">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-gray-950/95 px-3 py-2 font-semibold text-gray-200">
                        {fmtIsoDate(row.date)}
                      </td>
                      {pnlSummaryTraders.map((trader) => {
                        const value = row.traderValues[trader] ?? null;
                        const unmarkedForTrader = row.unmarkedPositions.some(
                          (position) => position.trader === trader
                        );
                        return (
                          <td
                            key={`${row.date}:${trader}`}
                            className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${positionAggregateMetricClass(value, "daily_pnl")}`}
                          >
                            <span className="inline-flex items-center justify-end gap-1.5">
                              <span>{fmtPnl(value)}</span>
                              {unmarkedForTrader ? (
                                <SourceNoteIcon
                                  lines={pnlSummaryTraderMarkLines(row, trader)}
                                  tone="pending"
                                  glyph="!"
                                />
                              ) : null}
                            </span>
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        <span
                          className={`inline-flex items-center justify-end gap-1.5 ${
                            row.markedCount === row.totalCount
                              ? "text-emerald-200"
                              : "text-amber-200"
                          }`}
                        >
                          <span>
                            {row.markedCount.toLocaleString()} / {row.totalCount.toLocaleString()}
                          </span>
                          {row.markedCount < row.totalCount ? (
                            <SourceNoteIcon
                              lines={pnlSummaryMarkLines(row)}
                              tone="pending"
                              glyph="!"
                            />
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </DataTableShell>
      )}

      {view === "positions" && (
      <ControlCard title="Position Filters">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Filters
            </span>
            <span className="h-px flex-1 bg-gray-800" />
            <span className="text-xs text-gray-500">
              {traderFilteredPositionRows.length.toLocaleString()} /{" "}
              {positionRows.length.toLocaleString()} positions
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Trader
            </span>
            {["All", ...positionTraderOptions].map((trader) => {
              const active = positionTraderFilter === trader;
              return (
                <button
                  key={trader}
                  type="button"
                  onClick={() => {
                    setPositionTraderFilter(trader);
                    clearPositionPopupState();
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
                    active
                      ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
                      : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
                  }`}
                >
                  {trader === "All" ? "All Traders" : trader}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Asset
            </span>
            {["All", ...positionAssetOptions].map((asset) => {
              const active =
                asset === "All"
                  ? positionAssetFilters.length === 0
                  : positionAssetFilters.includes(asset);
              return (
                <button
                  key={asset}
                  type="button"
                  onClick={() => {
                    if (asset === "All") {
                      setPositionAssetFilters([]);
                      setPositionRegionFilters([]);
                    } else {
                      setPositionAssetFilters((filters) =>
                        filters.includes(asset)
                          ? filters.filter((value) => value !== asset)
                          : [...filters, asset]
                      );
                    }
                    clearPositionPopupState();
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
                    active
                      ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
                      : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
                  }`}
                >
                  {asset === "All" ? "All Assets" : asset}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Region
            </span>
            {["All", ...positionRegionOptions].map((region) => {
              const active =
                region === "All"
                  ? positionRegionFilters.length === 0
                  : positionRegionFilters.includes(region);
              return (
                <button
                  key={region}
                  type="button"
                  onClick={() => {
                    if (region === "All") {
                      setPositionRegionFilters([]);
                    } else {
                      setPositionRegionFilters((filters) =>
                        filters.includes(region)
                          ? filters.filter((value) => value !== region)
                          : [...filters, region]
                      );
                    }
                    clearPositionPopupState();
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
                    active
                      ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
                      : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
                  }`}
                >
                  {region === "All" ? "All Regions" : region}
                </button>
              );
            })}
          </div>
        </div>
      </ControlCard>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading{" "}
          {view === "products"
            ? "product dictionary"
            : view === "pnl"
              ? "P&L summary"
            : view === "positions"
              ? "positions"
              : view === "settles"
                ? "settles"
                : "ICE trade blotter"}
          ...
        </div>
      )}

      {positionsData && !loading && view === "positions" && (
        <DataTableShell
          title="Aggregate Positions"
          subtitle={`${positionAggregateMetricLabel(positionAggregateMetric)} by product and tenor`}
          className="w-full max-w-none"
          bodyClassName="w-full"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border border-gray-800 bg-gray-950/40 p-0.5">
                {POSITION_AGGREGATE_METRIC_TABS.map((metric) => {
                  const active = positionAggregateMetric === metric.value;
                  return (
                    <button
                      key={metric.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPositionAggregateMetric(metric.value)}
                      className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        active
                          ? "bg-cyan-500/15 text-cyan-100"
                          : "text-gray-500 hover:bg-gray-900 hover:text-gray-300"
                      }`}
                    >
                      {metric.label}
                    </button>
                  );
                })}
              </div>
              <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs text-gray-400">
                {tenorPivotRows.length.toLocaleString()} product rows |{" "}
                {tenorColumns.length.toLocaleString()} tenor columns
              </div>
              <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs text-gray-400">
                {positionAggregateMetricLabel(positionAggregateMetric)}{" "}
                <span className={`font-semibold tabular-nums ${positionAggregateMetricClass(tenorAggregateMetricTotal, positionAggregateMetric)}`}>
                  {fmtPositionAggregateMetricValue(tenorAggregateMetricTotal, positionAggregateMetric)}
                </span>
              </div>
            </div>
          }
        >
          <div className="overflow-auto">
            <table className="w-max table-auto border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr className="border-b border-gray-800/80">
                  <th className="w-px min-w-max whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">
                    Product
                  </th>
                  {tenorColumns.map((column) => (
                    <th
                      key={column.key}
                      className="w-px min-w-[92px] whitespace-nowrap px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide"
                      title={column.kind}
                    >
                      <span className="flex items-start justify-end gap-1.5">
                        <span
                          className={`mt-0.5 rounded border px-1 py-0.5 text-[9px] font-bold ${tenorKindClass(column.kind)}`}
                        >
                          {tenorKindLabel(column.kind)}
                        </span>
                        <span className="flex flex-col items-end gap-0.5">
                          <span>{column.label}</span>
                          {column.dateLabel ? (
                            <span className="text-[9px] font-medium normal-case tracking-normal text-gray-600">
                              {column.dateLabel}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {tenorPivotRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={1 + tenorColumns.length}
                      className="px-3 py-10 text-center"
                    >
                      <div className="mx-auto max-w-xl rounded-lg border border-gray-800 bg-gray-950/40 px-4 py-5 text-left">
                        <div className="text-sm font-semibold text-gray-200">
                          No aggregate exposure for the selected filters
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          No daily, weekly, or monthly exposure is available for{" "}
                          {positionTraderFilter === "All" ? "all traders" : positionTraderFilter}
                          {positionAssetFilters.length > 0
                            ? `, ${positionAssetFilters.join(", ")}`
                            : ""}
                          {positionRegionFilters.length > 0
                            ? `, ${positionRegionFilters.join(", ")}`
                            : ""}.
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  tenorPivotRows.flatMap((row) => {
                    const expanded = expandedTenorRowKey === row.key;
                    const bodyRows = [
                      <tr
                        key={row.key}
                        className="cursor-pointer hover:bg-gray-900/60"
                        onClick={() => setExpandedTenorRowKey(expanded ? null : row.key)}
                      >
                        <td className="w-px whitespace-nowrap px-3 py-2 text-gray-300">
                          <span className="flex w-max items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded border border-gray-800 bg-gray-950 text-[10px] text-gray-500">
                              {expanded ? "v" : ">"}
                            </span>
                            <SourceNoteIcon
                              lines={tenorProductMeta(row)}
                              tone={row.instrument === "Option" ? "pending" : "settled"}
                              glyph="i"
                            />
                            <span>{tenorProductLabel(row)}</span>
                          </span>
                        </td>
                        {tenorColumns.map((column) => {
                          const value = positionAggregateMetricCellValue(
                            row,
                            column.key,
                            positionAggregateMetric
                          );
                          return (
                            <td
                              key={column.key}
                              className={`w-px min-w-[72px] whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                                positionAggregateMetricClass(value, positionAggregateMetric)
                              }`}
                            >
                              {fmtPositionAggregateMetricValue(value, positionAggregateMetric)}
                            </td>
                          );
                        })}
                      </tr>,
                    ];

                    if (expanded) {
                      bodyRows.push(
                        <tr key={`${row.key}:expanded`}>
                          <td colSpan={1 + tenorColumns.length} className="bg-gray-950/30 px-3 py-3">
                            <div className="space-y-2">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                Source positions
                              </div>
                              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {row.source_positions.map((position) => {
                                  const key = positionRowKey(position);
                                  return (
                                    <button
                                      key={key}
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openPositionLegsPopup(key);
                                      }}
                                      className="rounded-md border border-gray-800 bg-gray-900/40 px-3 py-2 text-left text-xs text-gray-300 transition-colors hover:border-sky-500/40 hover:bg-sky-500/10"
                                    >
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="font-semibold text-gray-100">
                                          {fmtText(position.option) || "Future"}
                                        </span>
                                        {position.style ? (
                                          <span className="text-gray-500">{fmtText(position.style)}</span>
                                        ) : null}
                                        {position.strike !== null ? (
                                          <span className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">
                                            {fmtOptionalPrice(position.strike)}
                                          </span>
                                        ) : null}
                                        <span className="text-gray-500">{fmtContractDate(position.contract)}</span>
                                      </div>
                                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500">
                                        <span>Trader {fmtText(position.trader)}</span>
                                        <span>Lots {fmtNumber(position.net_lots, 0)}</span>
                                        <span>Delta {fmtNumber(position.option_delta, 4)}</span>
                                        <span>Legs {fmtNumber(position.contributing_trade_count, 0)}</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return bodyRows;
                  })
                )}
              </tbody>
            </table>
          </div>
        </DataTableShell>
      )}

      {positionsData && !loading && view === "positions" && (
        <DataTableShell
          title="Positions"
          subtitle={positionsSubtitle}
          className="w-full max-w-none"
          bodyClassName="w-full"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs text-gray-400">
                {displayedPositionRows.length.toLocaleString()} /{" "}
                {traderFilteredPositionRows.length.toLocaleString()} positions
              </div>
              <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs text-gray-400">
                Net QTY{" "}
                <span className="font-semibold tabular-nums text-gray-200">
                  {fmtNumber(filteredPositionNetQuantity, 0)}
                </span>
              </div>
              <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs text-gray-400">
                Daily P&L{" "}
                <span className={`font-semibold tabular-nums ${positionAggregateMetricClass(filteredPositionDailyPnl, "daily_pnl")}`}>
                  {fmtPnl(filteredPositionDailyPnl)}
                </span>
              </div>
              <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs text-gray-400">
                Open P&L{" "}
                <span
                  className={`font-semibold tabular-nums ${
                    filteredPositionOpenPnl === null
                      ? "text-gray-500"
                      : filteredPositionOpenPnl > 0
                        ? "text-emerald-300"
                        : filteredPositionOpenPnl < 0
                          ? "text-rose-300"
                          : "text-gray-200"
                  }`}
                >
                  {fmtPnl(filteredPositionOpenPnl)}
                </span>
              </div>
              <ColumnVisibilityPopover
                columns={POSITION_COLUMN_DEFINITIONS}
                visibleLabels={visiblePositionColumnLabels}
                defaultLabels={defaultPositionColumnLabels}
                onChange={handleVisiblePositionColumnLabelsChange}
              />
              <button
                type="button"
                onClick={downloadPositionsCsv}
                disabled={displayedPositionRows.length === 0 || visiblePositionColumns.length === 0}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-950/40 disabled:text-gray-600"
              >
                Download CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  setPositionColumnFilters({});
                  setPositionSortState(DEFAULT_POSITION_SORT_STATE);
                  clearPositionPopupState();
                }}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Reset Table
              </button>
            </div>
          }
        >
          <div className="min-h-[420px] min-w-full bg-[#0d1119]">
            <table className="w-max min-w-full table-auto border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr className="border-b border-gray-800/80">
                  {visiblePositionColumns.map((column) => {
                    const filterOptions =
                      positionColumnFilterOptions[column.key] ?? EMPTY_FILTER_VALUES;
                    const selectedFilters =
                      positionColumnFilters[column.key] ?? EMPTY_FILTER_VALUES;
                    const sortDirection =
                      positionSortState?.key === column.key
                        ? positionSortState.direction
                        : null;

                    return (
                      <th
                        key={column.key}
                        className={`whitespace-nowrap px-2 py-2 text-left font-semibold uppercase tracking-wide ${
                          column.align === "right" ? "text-right" : ""
                        }`}
                      >
                        <div className="flex w-max items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => updatePositionSort(column.key)}
                            className={`flex w-max items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-gray-900 ${
                              sortDirection ? "text-sky-200" : "text-gray-400"
                            }`}
                            aria-label={`Sort ${column.label}`}
                          >
                            <span className="whitespace-nowrap text-[10px] leading-3">
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
                            options={filterOptions}
                            selected={selectedFilters}
                            sortDirection={sortDirection}
                            onSort={(direction) =>
                              setPositionSortState({ key: column.key, direction })
                            }
                            onChange={(values) => updatePositionColumnFilter(column.key, values)}
                          />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {displayedPositionRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(visiblePositionColumns.length, 1)}
                      className="px-3 py-8 text-center text-sm text-gray-500"
                    >
                      No open positions found.
                    </td>
                  </tr>
                ) : (
                  displayedPositionRows.map((row) => (
                    <tr
                      key={positionRowKey(row)}
                      onClick={(event) => {
                        const target = event.target as HTMLElement;
                        if (target.closest("button, a, input, select, textarea")) return;
                        openPositionLegsPopup(positionRowKey(row));
                      }}
                      className="cursor-pointer hover:bg-gray-900/60"
                    >
                      {visiblePositionColumns.map((column, columnIndex) => (
                        <td
                          key={column.key}
                          className={`whitespace-nowrap px-2 py-2 text-gray-300 ${
                            column.align === "right" ? "text-right tabular-nums" : ""
                          } ${column.minClass ?? ""} ${column.cellClass?.(row) ?? ""}`}
                        >
                          {columnIndex === 0 ? (
                            <span className="flex w-max items-center gap-2">
                              <button
                                type="button"
                                aria-haspopup="dialog"
                                aria-label={`Show ${row.contributing_trade_count.toLocaleString()} trade legs`}
                                title={`Show ${row.contributing_trade_count.toLocaleString()} trade legs`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openPositionLegsPopup(positionRowKey(row));
                                }}
                                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-700 bg-gray-950 text-[10px] font-bold text-gray-300 transition-colors hover:border-sky-500/60 hover:text-sky-200"
                              >
                                {">"}
                              </button>
                              <span className="whitespace-nowrap">{column.render(row)}</span>
                              <span className="shrink-0 rounded border border-gray-700 bg-gray-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                                {row.contributing_trade_count.toLocaleString()} legs
                              </span>
                            </span>
                          ) : (
                            column.render(row)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </DataTableShell>
      )}

      {dailySettlementsData && !loading && view === "settles" && (
        <>
          <DataTableShell
            title="Settle Summary"
            subtitle={
              dailySettlementsData
                ? `Latest trade date ${fmtDate(dailySettlementsData.endDate)} | Click a product or settle value to view exact-symbol history.`
                : "Latest trade date only. Click a product or settle value to view exact-symbol history."
            }
            className="mx-auto w-fit max-w-full"
            bodyClassName="w-fit max-w-full"
            action={
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-md border border-gray-800 bg-gray-950/40 p-1">
                  {SETTLEMENT_SUMMARY_METRICS.map((metric) => (
                    <button
                      key={metric.key}
                      type="button"
                      aria-pressed={settlementSummaryMetric === metric.key}
                      onClick={() => setSettlementSummaryMetric(metric.key)}
                      className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                        settlementSummaryMetric === metric.key
                          ? "bg-sky-500/15 text-sky-200"
                          : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                      }`}
                    >
                      {metric.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={openSettlesDebug}
                  className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:border-sky-500/50 hover:bg-gray-700 hover:text-white"
                >
                  Debug Rows
                </button>
              </div>
            }
          >
            <div className="w-max bg-[#0d1119]">
              <table className="w-max table-auto border-collapse bg-[#0d1119] text-xs text-gray-200">
                <thead className="bg-gray-950 text-gray-500">
                  <tr className="border-b border-gray-800/80">
                    <th className="sticky left-0 z-20 w-[320px] bg-gray-950 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">
                      Product
                    </th>
                    {settlementSummaryColumns.map((column) => (
                      <th
                        key={column.key}
                        className="w-[132px] whitespace-nowrap px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide"
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {settlementSummaryRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={settlementSummaryColumns.length + 1}
                        className="px-3 py-8 text-center text-sm text-gray-500"
                      >
                        No settle summary available.
                      </td>
                    </tr>
                  ) : (
                    settlementSummaryRows.map((row) => {
                      const firstHistoryColumn = settlementSummaryColumns.find(
                        (column) => row.cells[column.key]
                      );
                      return (
                        <tr key={row.key} className="hover:bg-gray-900/60">
                          <td
                            className={`sticky left-0 z-10 bg-[#0d1119] px-3 py-2 text-gray-200 ${
                              firstHistoryColumn
                                ? "cursor-pointer transition-colors hover:bg-sky-500/10"
                                : ""
                            }`}
                            onClick={() => {
                              if (firstHistoryColumn) openSettlementHistory(row, firstHistoryColumn);
                            }}
                            title={
                              firstHistoryColumn
                                ? `Show ${row.product} ${firstHistoryColumn.label} settle history`
                                : undefined
                            }
                          >
                            <span className="block truncate font-medium">
                              {row.product}
                            </span>
                            <span className="block truncate text-[11px] text-gray-500">
                              {row.assetClass} | {row.region}
                            </span>
                          </td>
                          {settlementSummaryColumns.map((column) => {
                            const cell = row.cells[column.key];
                            const historyTitle = `Show ${row.product} ${column.label} settle history`;
                            const showDailyValues =
                              cell &&
                              (settlementSummaryMetric === "final_mark" ||
                                settlementSummaryMetric === "settle");
                            return (
                              <td
                                key={column.key}
                                onClick={() => {
                                  if (cell) openSettlementHistory(row, column);
                                }}
                                title={cell ? historyTitle : undefined}
                                className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                                  cell
                                    ? "cursor-pointer text-gray-200 transition-colors hover:bg-sky-500/10"
                                    : "text-gray-700"
                                }`}
                              >
                                {cell ? (
                                  <span className="inline-flex items-center justify-end gap-1.5">
                                    <span>
                                      {renderSettlementSummaryCellMetric(
                                        cell,
                                        settlementSummaryMetric
                                      )}
                                    </span>
                                    {showDailyValues ? (
                                      <SettlementDailyValuesHover rows={cell.rows} />
                                    ) : null}
                                  </span>
                                ) : (
                                  "--"
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </DataTableShell>

          {settlementHistorySelection && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settlement-history-title"
              onClick={() => setSettlementHistorySelection(null)}
            >
              <div
                className="flex max-h-[90vh] w-fit max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#0d1119] shadow-2xl shadow-black/60"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 bg-gray-950/80 px-4 py-3">
                  <div className="min-w-0">
                    <h2
                      id="settlement-history-title"
                      className="truncate text-sm font-semibold text-gray-100"
                    >
                      {settlementHistorySelection.product} /{" "}
                      {settlementHistorySelection.columnLabel}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                      <span>{settlementHistorySelection.assetClass}</span>
                      <span>|</span>
                      <span>{settlementHistorySelection.region}</span>
                      <span>|</span>
                      <span>
                        {fmtIsoDate(
                          settlementHistoryLookback === "all"
                            ? SETTLEMENT_HISTORY_ALL_START_DATE
                            : isoDateDaysBefore(
                                settlementHistorySelection.historyEndDate,
                                settlementHistoryLookback - 1
                              )
                        )}{" "}
                        to {fmtIsoDate(settlementHistorySelection.historyEndDate)}
                      </span>
                      <span>|</span>
                      <span>
                        Symbol {settlementHistorySelection.symbol}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettlementHistorySelection(null)}
                    className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:border-sky-500/50 hover:text-sky-100"
                  >
                    Close
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 px-4 py-2">
                  <div className="flex rounded-md border border-gray-800 bg-gray-950/40 p-1">
                    {SETTLEMENT_HISTORY_LOOKBACKS.map((lookback) => (
                      <button
                        key={lookback}
                        type="button"
                        aria-pressed={settlementHistoryLookback === lookback}
                        onClick={() => setSettlementHistoryLookback(lookback)}
                        className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                          settlementHistoryLookback === lookback
                            ? "bg-sky-500/15 text-sky-200"
                            : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                        }`}
                      >
                        {lookback === "all" ? "All" : `${lookback}D`}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-sm bg-emerald-400/70" />
                      Final Mark uses completed settle
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-sm bg-sky-400/70" />
                      Final Mark uses ICE mark while pending
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="rounded border border-emerald-500/35 bg-emerald-500/10 px-1 py-0.5 text-[9px] font-bold text-emerald-200">
                        DAYS
                      </span>
                      Hover for daily settle values
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {displayedSettlementHistoryRows.length.toLocaleString()} /{" "}
                    {settlementHistoryRows.length.toLocaleString()} settles
                  </div>
                </div>
                <div className="max-w-[calc(100vw-24px)] overflow-auto">
                  <table className="min-w-[1320px] divide-y divide-gray-800 text-left text-xs">
                    <thead className="bg-gray-950 text-[10px] uppercase tracking-wide text-gray-500">
                      <tr>
                        {SETTLEMENT_HISTORY_FILTER_COLUMNS.slice(0, 4).map((column) => {
                          const sortDirection =
                            settlementHistorySortState?.key === column.key
                              ? settlementHistorySortState.direction
                              : null;
                          return (
                            <th key={column.key} className="px-3 py-2 font-semibold">
                              <div className="flex min-w-[96px] items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSettlementHistorySortState((sort) =>
                                      sort?.key === column.key && sort.direction === "asc"
                                        ? { key: column.key, direction: "desc" }
                                        : { key: column.key, direction: "asc" }
                                    )
                                  }
                                  className={`flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-gray-900 ${
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
                                  options={settlementHistoryColumnFilterOptions[column.key] ?? []}
                                  selected={settlementHistoryColumnFilters[column.key] ?? []}
                                  sortDirection={sortDirection}
                                  onSort={(direction) =>
                                    setSettlementHistorySortState({ key: column.key, direction })
                                  }
                                  onChange={(values) =>
                                    setSettlementHistoryColumnFilters((filters) => {
                                      const next = { ...filters };
                                      if (values.length > 0) next[column.key] = values;
                                      else delete next[column.key];
                                      return next;
                                    })
                                  }
                                />
                              </div>
                            </th>
                          );
                        })}
                        <th className="px-3 py-2 text-right font-semibold">Final Mark</th>
                        <th className="px-3 py-2 text-right font-semibold">Settle</th>
                        <th className="px-3 py-2 text-right font-semibold">ICE Mark</th>
                        {SETTLEMENT_HISTORY_FILTER_COLUMNS.slice(4).map((column) => {
                          const sortDirection =
                            settlementHistorySortState?.key === column.key
                              ? settlementHistorySortState.direction
                              : null;
                          return (
                            <th
                              key={column.key}
                              className={`px-3 py-2 font-semibold ${
                                column.align === "right" ? "text-right" : ""
                              }`}
                            >
                              <div className="flex min-w-[96px] items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSettlementHistorySortState((sort) =>
                                      sort?.key === column.key && sort.direction === "asc"
                                        ? { key: column.key, direction: "desc" }
                                        : { key: column.key, direction: "asc" }
                                    )
                                  }
                                  className={`flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-gray-900 ${
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
                                  options={settlementHistoryColumnFilterOptions[column.key] ?? []}
                                  selected={settlementHistoryColumnFilters[column.key] ?? []}
                                  sortDirection={sortDirection}
                                  onSort={(direction) =>
                                    setSettlementHistorySortState({ key: column.key, direction })
                                  }
                                  onChange={(values) =>
                                    setSettlementHistoryColumnFilters((filters) => {
                                      const next = { ...filters };
                                      if (values.length > 0) next[column.key] = values;
                                      else delete next[column.key];
                                      return next;
                                    })
                                  }
                                />
                              </div>
                            </th>
                          );
                        })}
                        <th className="px-3 py-2 text-right font-semibold">Volume</th>
                        <th className="px-3 py-2 font-semibold">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {settlementHistoryLoading ? (
                        <tr>
                          <td colSpan={12} className="px-3 py-8 text-center text-sm text-gray-500">
                            Loading settle history...
                          </td>
                        </tr>
                      ) : settlementHistoryError ? (
                        <tr>
                          <td colSpan={12} className="px-3 py-8 text-center text-sm text-red-300">
                            {settlementHistoryError}
                          </td>
                        </tr>
                      ) : displayedSettlementHistoryRows.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="px-3 py-8 text-center text-sm text-gray-500">
                            No settle history found for this settle symbol.
                          </td>
                        </tr>
                      ) : (
                        displayedSettlementHistoryRows.map((row) => {
                          const sourceLabel = dailySettlementSourceLabel(row);
                          const confidence = dailySettlementConfidence(row);
                          const settleValue = toFiniteNumber(row.settlement);
                          const iceMark = toFiniteNumber(row.ice_settlement);
                          const settleApplies =
                            settlementHistorySettleTradeDateByWindow.get(
                              settlementHistoryWindowKey(row)
                            ) === row.date;
                          const usesSettle = settleApplies && settleValue !== null;
                          const usesIceMark = !usesSettle && iceMark !== null;
                          const finalMark = usesSettle ? settleValue : iceMark;
                          const hasDailyValues = dailySettlementComponentRows(row).some(
                            (component) => toFiniteNumber(component.settlement) !== null
                          );
                          const dateClassName = usesSettle
                            ? "text-gray-100"
                            : "text-gray-500";
                          const dateTitle = usesSettle
                            ? "Settle is applied on this trade row."
                            : "Settle is not applied on this trade row; Final Mark uses ICE or is pending.";
                          return (
                            <tr key={dailySettlementRowKey(row)} className="hover:bg-gray-900/60">
                              <td
                                className={`whitespace-nowrap px-3 py-2 font-semibold ${dateClassName}`}
                                title={dateTitle}
                              >
                                {fmtIsoDate(row.date)}
                              </td>
                              <td
                                className={`whitespace-nowrap px-3 py-2 ${dateClassName}`}
                                title={dateTitle}
                              >
                                {fmtIsoDate(dailySettlementBeginDate(row))}
                              </td>
                              <td
                                className={`whitespace-nowrap px-3 py-2 ${dateClassName}`}
                                title={dateTitle}
                              >
                                {fmtIsoDate(dailySettlementEndDate(row))}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-gray-300">
                                {fmtText(row.contract)}
                              </td>
                              <td
                                className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-200"
                                title={
                                  usesIceMark
                                      ? "Final Mark uses ICE mark while the source settle is pending."
                                      : undefined
                                }
                              >
                                <span className="inline-flex items-center justify-end gap-1.5">
                                  <span>{fmtOptionalPrice(finalMark)}</span>
                                  {usesSettle && hasDailyValues ? (
                                    <SettlementDailyValuesHover rows={[row]} />
                                  ) : null}
                                </span>
                              </td>
                              <td
                                className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                                  usesSettle
                                    ? "bg-emerald-500/10 font-semibold text-emerald-100"
                                    : "text-gray-300"
                                }`}
                                title={usesSettle ? "Final Mark uses this Settle value." : undefined}
                              >
                                <span className="inline-flex items-center justify-end gap-1.5">
                                  <span>{fmtOptionalPrice(settleValue)}</span>
                                  {hasDailyValues ? (
                                    <SettlementDailyValuesHover rows={[row]} />
                                  ) : null}
                                </span>
                              </td>
                              <td
                                className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                                  usesIceMark
                                    ? "bg-sky-500/10 font-semibold text-sky-100"
                                    : "text-gray-300"
                                }`}
                                title={usesIceMark ? "Final Mark uses this ICE Mark value." : undefined}
                              >
                                {fmtOptionalPrice(iceMark)}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-gray-300">
                                {sourceLabel}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2">
                                <span
                                  className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${confidence.className}`}
                                  title={confidence.title}
                                >
                                  {confidence.label}
                                </span>
                              </td>
                              <td
                                className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-300"
                                title={confidence.title}
                              >
                                {confidence.daysLabel}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-300">
                                {fmtNumber(toFiniteNumber(row.volume), 0)}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-gray-500">
                                {fmtTimestamp(row.updated_at)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {settlesDebugOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6"
              role="dialog"
              aria-modal="true"
              aria-label="Raw settle rows debug"
              onClick={() => setSettlesDebugOpen(false)}
            >
              <div
                className="max-h-[90vh] w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-gray-800 bg-[#0d1119] shadow-2xl shadow-black/60"
                onClick={(event) => event.stopPropagation()}
              >
                <DataTableShell
                  title="Raw Settle Rows"
                  subtitle={
                    debugDailySettlementsSubtitle
                      ? `Loaded ${debugDailySettlementsSubtitle}`
                      : undefined
                  }
                  className="border-0 bg-transparent shadow-none"
                  bodyClassName="max-h-[calc(90vh-116px)]"
                  action={
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        Trade Date
                        <input
                          type="date"
                          value={settlesDebugTradeDate}
                          onChange={(event) => setSettlesDebugTradeDate(event.target.value)}
                          className="h-8 rounded-md border border-gray-700 bg-gray-950 px-2 text-xs font-semibold normal-case tracking-normal text-gray-200 outline-none focus:border-sky-500/60"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={loadSettlesDebugRows}
                        disabled={settlesDebugLoading || !settlesDebugTradeDate}
                        className="rounded-md border border-sky-700/60 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-950/40 disabled:text-gray-600"
                      >
                        {settlesDebugLoading ? "Loading..." : "Load"}
                      </button>
                <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs text-gray-400">
                  {displayedDebugDailySettlementRows.length.toLocaleString()} /{" "}
                  {debugDailySettlementRows.length.toLocaleString()} settles
                </div>
                <ColumnVisibilityPopover
                  columns={DAILY_SETTLEMENT_COLUMN_DEFINITIONS}
                  visibleLabels={visibleDailySettlementColumnLabels}
                  defaultLabels={defaultDailySettlementColumnLabels}
                  onChange={handleVisibleDailySettlementColumnLabelsChange}
                />
                <button
                  type="button"
                  onClick={() => {
                    setDailySettlementColumnFilters({});
                    setDailySettlementStatusFilter("all");
                    setDailySettlementDateMismatchFilter(false);
                    setDailySettlementSortState(DEFAULT_DAILY_SETTLEMENT_SORT_STATE);
                    clearDailySettlementCellSelection();
                  }}
                  className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                >
                  Reset Table
                </button>
                      <button
                        type="button"
                        onClick={() => setSettlesDebugOpen(false)}
                        className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:border-sky-500/50 hover:text-sky-100"
                      >
                        Close
                      </button>
                    </div>
                  }
                >
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 bg-gray-950/30 px-3 py-2">
              <SettlementStatusPill
                label="All"
                tone="info"
                glyph="A"
                count={debugDailySettlementStatusCounts.get("all") ?? 0}
                active={dailySettlementStatusFilter === "all"}
                onClick={() => setDailySettlementStatusFilter("all")}
              />
              {SETTLEMENT_STATUS_LEGEND.map((item) => (
                <SettlementStatusPill
                  key={item.label}
                  label={item.label}
                  tone={item.tone}
                  glyph={item.glyph}
                  count={debugDailySettlementStatusCounts.get(item.label) ?? 0}
                  active={dailySettlementStatusFilter === item.label}
                  onClick={() =>
                    setDailySettlementStatusFilter((current) =>
                      current === item.label ? "all" : item.label
                    )
                  }
                />
              ))}
              <button
                type="button"
                onClick={() =>
                  setDailySettlementDateMismatchFilter((current) => !current)
                }
                className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  dailySettlementDateMismatchFilter
                    ? "border-amber-400/70 bg-amber-500/20 text-amber-100"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:border-amber-400/60 hover:text-amber-100"
                }`}
                title="Show rows where ICE contract dates disagree with the deterministic short-term PJM ladder."
              >
                <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1 text-[9px]">
                  D
                </span>
                Date Mismatches
                <span className="tabular-nums">
                  {debugDailySettlementDateMismatchCount.toLocaleString()}
                </span>
              </button>
            </div>
            {settlesDebugError ? (
              <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {settlesDebugError}
              </div>
            ) : null}
            <div className="min-h-[360px] bg-[#0d1119]">
              <table className="w-full min-w-[900px] border-collapse bg-[#0d1119] text-xs text-gray-200">
                <thead className="bg-gray-950 text-gray-500">
                  <tr className="border-b border-gray-800/80">
                    {visibleDailySettlementColumns.map((column) => {
                      const filterOptions =
                        debugDailySettlementColumnFilterOptions[column.key] ??
                        EMPTY_FILTER_VALUES;
                      const selectedFilters =
                        dailySettlementColumnFilters[column.key] ?? EMPTY_FILTER_VALUES;
                      const sortDirection =
                        dailySettlementSortState?.key === column.key
                          ? dailySettlementSortState.direction
                          : null;

                      return (
                      <th
                        key={column.key}
                        className={`px-3 py-2 text-left font-semibold uppercase tracking-wide ${
                          column.align === "right" ? "text-right" : ""
                        } ${column.minClass ?? ""}`}
                      >
                        <div className="flex min-w-[110px] items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => updateDailySettlementSort(column.key)}
                            className={`flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-gray-900 ${
                              dailySettlementSortState?.key === column.key
                                ? "text-sky-200"
                                : "text-gray-400"
                            }`}
                            aria-label={`Sort ${column.label}`}
                          >
                            <span className="truncate whitespace-nowrap text-[10px]">
                              {column.label}
                            </span>
                            <span className="w-3 shrink-0 text-right text-[10px] text-sky-300">
                              {dailySettlementSortState?.key === column.key
                                ? dailySettlementSortState.direction === "asc"
                                  ? "\u2191"
                                  : "\u2193"
                                : ""}
                            </span>
                          </button>
                          <ColumnFilterMenu
                            label={column.label}
                            options={filterOptions}
                            selected={selectedFilters}
                            sortDirection={sortDirection}
                            onSort={(direction) =>
                              setDailySettlementSortState({ key: column.key, direction })
                            }
                            onChange={(values) =>
                              updateDailySettlementColumnFilter(column.key, values)
                            }
                          />
                        </div>
                      </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {displayedDebugDailySettlementRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={Math.max(visibleDailySettlementColumns.length, 1)}
                        className="px-3 py-8 text-center text-sm text-gray-500"
                      >
                        No settles found.
                      </td>
                    </tr>
                  ) : (
                    displayedDebugDailySettlementRows.map((row, rowIndex) => (
                      <tr
                        key={dailySettlementRowKey(row)}
                        className="hover:bg-gray-900/60"
                      >
                        {visibleDailySettlementColumns.map((column, columnIndex) => {
                          const coordinate = makeDailySettlementCellCoordinate(
                            rowIndex,
                            columnIndex,
                            row,
                            column
                          );
                          const selected = selectedDailySettlementCellKeys.has(
                            dailySettlementCellSelectionKeyFromCoordinate(coordinate)
                          );

                          return (
                            <td
                              key={column.key}
                              aria-selected={selected}
                              onMouseDown={(event) =>
                                handleDailySettlementCellMouseDown(event, coordinate)
                              }
                              onMouseEnter={(event) =>
                                handleDailySettlementCellMouseEnter(event, coordinate)
                              }
                              className={`px-3 py-2 text-gray-300 ${
                                column.align === "right" ? "text-right tabular-nums" : ""
                              } ${column.minClass ?? ""} ${
                                selected
                                  ? "outline outline-1 -outline-offset-1 outline-sky-400/80"
                                  : ""
                              }`}
                            >
                              {column.render(row)}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
                </DataTableShell>
              </div>
            </div>
          )}
        </>
      )}

      {filteredProductDictionaryData && !loading && view === "products" && (
        <IceTradeBlotterProductsView payload={filteredProductDictionaryData} />
      )}

      {data && !loading && view === "trades" && (
        <DataTableShell
          title="Trade Summary"
          className="w-full max-w-none"
          bodyClassName="w-full"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border border-gray-800 bg-gray-950/40 p-1">
                {TRADE_SUMMARY_METRICS.map((metric) => (
                  <button
                    key={metric.key}
                    type="button"
                    aria-pressed={tradeSummaryMetric === metric.key}
                    onClick={() => setTradeSummaryMetric(metric.key)}
                    className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                      tradeSummaryMetric === metric.key
                        ? "bg-sky-500/15 text-sky-200"
                        : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                    }`}
                  >
                    {metric.label}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          <div className="min-w-full bg-[#0d1119]">
            <table className="w-max min-w-full table-fixed border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr className="border-b border-gray-800/80">
                  <th className="sticky left-0 z-20 w-[260px] bg-gray-950 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">
                    Product
                  </th>
                  {tradeSummaryColumns.map((column) => (
                    <th
                      key={column.key}
                      className="w-[132px] whitespace-nowrap px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {tradeSummaryRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tradeSummaryColumns.length + 1}
                      className="px-3 py-8 text-center text-sm text-gray-500"
                    >
                      No trade summary available.
                    </td>
                  </tr>
                ) : (
                  tradeSummaryRows.map((row) => {
                    return (
                      <tr
                        key={row.key}
                        className="cursor-pointer hover:bg-gray-900/60"
                        onClick={() => setSelectedTradeSummaryKey(row.key)}
                      >
                        <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2 text-gray-200">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-800 bg-gray-950 text-[10px] text-gray-500">
                              i
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium">
                                {row.product}
                              </span>
                              <span className="block truncate text-[11px] text-gray-500">
                                {row.assetClass} | {row.region}
                              </span>
                            </span>
                          </span>
                        </td>
                        {tradeSummaryColumns.map((column) => {
                          const cell = row.cells[column.key];
                          const cellMetricValue = cell
                            ? tradeSummaryMetricValue(cell, tradeSummaryMetric)
                            : null;
                          if (!cell) {
                            return (
                              <td
                                key={column.key}
                                className="whitespace-nowrap px-3 py-2 text-right text-gray-700"
                              >
                                --
                              </td>
                            );
                          }
                          return (
                            <td
                              key={column.key}
                              className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${tradeSummaryMetricClass(
                                cellMetricValue,
                                tradeSummaryMetric
                              )}`}
                            >
                              {fmtTradeSummaryMetric(cellMetricValue, tradeSummaryMetric)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </DataTableShell>
      )}

      {data && !loading && view === "trades" && (
        <DataTableShell
          title="Trades With Settles"
          subtitle={tableSubtitle}
          className="w-full max-w-none"
          bodyClassName="w-full"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-1.5 text-xs text-gray-400">
                {displayedRows.length.toLocaleString()} / {tableRows.length.toLocaleString()} shown
              </div>
              <ColumnVisibilityPopover
                columns={COLUMN_DEFINITIONS}
                visibleLabels={visibleColumnLabels}
                defaultLabels={defaultColumnLabels}
                onChange={handleVisibleColumnLabelsChange}
              />
              <button
                type="button"
                onClick={downloadCsv}
                disabled={displayedRows.length === 0 || visibleColumns.length === 0}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-950/40 disabled:text-gray-600"
              >
                Download CSV
              </button>
              <button
                type="button"
                aria-pressed={groupRowsEnabled}
                onClick={toggleGroupRows}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  groupRowsEnabled
                    ? "border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/15"
                    : "border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                {groupRowsEnabled ? "Grouped" : "Raw Legs"}
              </button>
              <button
                type="button"
                aria-pressed={coloringEnabled}
                onClick={() => setColoringEnabled((enabled) => !enabled)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  coloringEnabled
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                    : "border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                {coloringEnabled ? "Hide Coloring" : "Show Coloring"}
              </button>
              <button
                type="button"
                onClick={resetTable}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Reset Table
              </button>
            </div>
          }
        >
          <div className="min-h-[420px] min-w-full bg-[#0d1119]">
            <table className="w-max min-w-full table-auto border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr className="border-b border-gray-800/80">
                  {visibleColumns.map((column) => {
                    const filterOptions = columnFilterOptions[column.key] ?? EMPTY_FILTER_VALUES;
                    const selectedFilters = columnFilters[column.key] ?? EMPTY_FILTER_VALUES;
                    const sortDirection =
                      sortState?.key === column.key ? sortState.direction : null;
                    const isPnlColumn = column.key === "pnl";
                    const selectedPnlClass =
                      selectedPnlSummary.total === null
                        ? "text-gray-600"
                        : selectedPnlSummary.total > 0
                          ? "text-emerald-300"
                          : selectedPnlSummary.total < 0
                            ? "text-rose-300"
                            : "text-gray-300";

                    return (
                      <th
                        key={column.key}
                        draggable
                        onDragStart={(event) => handleColumnDragStart(event, column.label)}
                        onDragOver={(event) => handleColumnDragOver(event, column.label)}
                        onDrop={(event) => handleColumnDrop(event, column.label)}
                        onDragEnd={handleColumnDragEnd}
                        title={`Drag ${column.label} to reorder`}
                        aria-grabbed={draggedColumnLabel === column.label}
                        className={`${column.sticky ? "sticky left-0 z-20 bg-gray-950" : ""} cursor-move whitespace-nowrap px-2 py-2 transition-colors ${
                          column.align === "right" ? "text-right" : "text-left"
                        } ${
                          dragOverColumnLabel === column.label
                            ? "bg-sky-500/10 text-sky-200"
                            : ""
                        } ${
                          draggedColumnLabel === column.label ? "opacity-50" : ""
                        } font-semibold uppercase tracking-wide`}
                      >
                        <div className="flex w-max items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateSort(column.key)}
                            className={`flex w-max flex-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-gray-900 ${
                              sortState?.key === column.key ? "text-sky-200" : "text-gray-400"
                            } ${isPnlColumn ? "flex-col items-end gap-1" : "items-center gap-1"}`}
                            aria-label={`Sort ${column.label}`}
                          >
                            <span className="flex w-max items-center gap-1">
                              <span className="whitespace-nowrap text-[10px] leading-3">
                                {column.label}
                              </span>
                              <span className="w-3 shrink-0 text-right text-[10px] text-sky-300">
                                {sortState?.key === column.key
                                  ? sortState.direction === "asc"
                                    ? "\u2191"
                                    : "\u2193"
                                  : ""}
                              </span>
                            </span>
                            {isPnlColumn && (
                              <span
                              className={`w-full whitespace-nowrap text-right text-[11px] font-semibold normal-case tracking-normal tabular-nums ${selectedPnlClass}`}
                              >
                                {selectedPnlSummary.selectedRowCount === 0
                                  ? "--"
                                  : fmtPnl(selectedPnlSummary.total)}
                              </span>
                            )}
                          </button>
                          <ColumnFilterMenu
                            label={column.label}
                            options={filterOptions}
                            selected={selectedFilters}
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
                      colSpan={Math.max(visibleColumns.length, 1)}
                      className="px-3 py-8 text-center text-sm text-gray-500"
                    >
                      No trades found.
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row, rowIndex) => {
                    const rowKey = tradeRowKey(row);
                    const groupKey = groupedTradeRowKey(row);
                    const legs = groupRowsEnabled
                      ? groupedLegsByKey.get(groupKey) ?? EMPTY_ROWS
                      : EMPTY_ROWS;

                    return (
                      <tr
                        key={rowKey}
                        onClick={(event) => handleTradeRowClick(event, row)}
                        className={`hover:bg-gray-900/60 ${
                          groupRowsEnabled ? "cursor-pointer" : ""
                        }`}
                      >
                        {visibleColumns.map((column, columnIndex) => {
                          const coordinate = makeCellCoordinate(
                            rowIndex,
                            columnIndex,
                            row,
                            column
                          );
                          const selected = selectedCellKeys.has(
                            cellSelectionKeyFromCoordinate(coordinate)
                          );

                          return (
                            <td
                              key={column.key}
                              aria-selected={selected}
                              onMouseDown={(event) => handleCellMouseDown(event, coordinate)}
                              onMouseEnter={(event) => handleCellMouseEnter(event, coordinate)}
                                className={`${column.sticky ? "sticky left-0 z-10 bg-[#0d1119] font-medium text-gray-200" : "text-gray-300"} whitespace-nowrap px-2 py-2 ${
                                  column.align === "right" ? "text-right tabular-nums" : ""
                                } ${tableCellClass(row, column)} ${
                                selected
                                  ? "outline outline-1 -outline-offset-1 outline-sky-400/80"
                                  : ""
                              }`}
                            >
                              {renderExpandableTableCell(
                                row,
                                column,
                                columnIndex,
                                groupKey,
                                legs.length
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </DataTableShell>
      )}
      {renderPositionLegsPopup()}
      {renderTradeLegsPopup()}
      {renderTradeSummaryPopup()}
    </div>
  );
}

