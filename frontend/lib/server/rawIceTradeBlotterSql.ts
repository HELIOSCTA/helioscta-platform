import "server-only";

import type {
  IceTradeBlotterAppliedFilters,
  IceTradeBlotterDrilldownFilter,
} from "@/lib/positionsAndTrades/iceTradeBlotterTypes";

export const RAW_ICE_TRADE_BLOTTER_SOURCE_TABLE =
  "ice_trade_blotter.ice_trade_blotter";
export const RAW_ICE_TRADE_BLOTTER_FILE_MANIFEST_TABLE =
  "ice_trade_blotter.file_manifest";
export const RAW_ICE_TRADE_BLOTTER_AGGREGATE_LIMIT = 800;
export const RAW_ICE_TRADE_BLOTTER_DEFAULT_DRILLDOWN_LIMIT = 100;
export const RAW_ICE_TRADE_BLOTTER_MAX_DRILLDOWN_LIMIT = 1_000;
export const RAW_ICE_TRADE_BLOTTER_BASE_PARAM_COUNT = 15;

export interface ParsedTextListFilter {
  displayValues: string[];
  sqlValues: string[];
}

export interface RawIceTradeBlotterFilters {
  requestedDate: string | null;
  sides: ParsedTextListFilter;
  traders: ParsedTextListFilter;
  clearingAccounts: ParsedTextListFilter;
  customerAccounts: ParsedTextListFilter;
  clearingFirms: ParsedTextListFilter;
  products: ParsedTextListFilter;
  hubs: ParsedTextListFilter;
  ccs: ParsedTextListFilter;
  contracts: ParsedTextListFilter;
  options: ParsedTextListFilter;
  dealSections: ParsedTextListFilter;
  sources: ParsedTextListFilter;
  userIds: ParsedTextListFilter;
  search: string | null;
  forceRefresh: boolean;
}

const TEXT_FILTER_PATTERN = /^[\w .:/()+,&'#\[\]@%~-]{1,160}$/;

export function parseDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseFilterText(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "all") return null;
  const bounded = normalized.slice(0, maxLength);
  return TEXT_FILTER_PATTERN.test(bounded) ? bounded : null;
}

function parseSearch(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 140);
  return normalized ? normalized : null;
}

function parseTextListFilter(
  searchParams: URLSearchParams,
  names: string[],
  maxLength: number,
  splitCommas = true,
): ParsedTextListFilter {
  const seen = new Set<string>();
  const displayValues: string[] = [];
  const sqlValues: string[] = [];

  for (const name of names) {
    for (const rawValue of searchParams.getAll(name)) {
      for (const part of splitCommas ? rawValue.split(",") : [rawValue]) {
        const parsed = parseFilterText(part, maxLength);
        if (!parsed) continue;
        const sqlValue = parsed.toLowerCase();
        if (seen.has(sqlValue)) continue;
        seen.add(sqlValue);
        displayValues.push(parsed);
        sqlValues.push(sqlValue);
      }
    }
  }

  return {
    displayValues: displayValues.slice(0, 50),
    sqlValues: sqlValues.slice(0, 50),
  };
}

export function parseRawIceTradeBlotterFilters(
  searchParams: URLSearchParams,
): RawIceTradeBlotterFilters {
  return {
    requestedDate: parseDate(searchParams.get("date") ?? searchParams.get("tradeDate")),
    sides: parseTextListFilter(searchParams, ["side", "b_s"], 20),
    traders: parseTextListFilter(searchParams, ["trader"], 80, false),
    clearingAccounts: parseTextListFilter(
      searchParams,
      ["clearingAcct", "clearingAccount"],
      80,
      false,
    ),
    customerAccounts: parseTextListFilter(
      searchParams,
      ["custAcct", "customerAccount"],
      80,
      false,
    ),
    clearingFirms: parseTextListFilter(searchParams, ["clearingFirm"], 100, false),
    products: parseTextListFilter(searchParams, ["product"], 120, false),
    hubs: parseTextListFilter(searchParams, ["hub"], 120, false),
    ccs: parseTextListFilter(searchParams, ["cc", "productCode"], 40),
    contracts: parseTextListFilter(searchParams, ["contract"], 120),
    options: parseTextListFilter(searchParams, ["option"], 80),
    dealSections: parseTextListFilter(searchParams, ["dealSection"], 80),
    sources: parseTextListFilter(searchParams, ["source"], 80, false),
    userIds: parseTextListFilter(searchParams, ["userId"], 80),
    search: parseSearch(searchParams.get("search")),
    forceRefresh: searchParams.get("refresh") === "1",
  };
}

export function parseDrilldownLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed)) return RAW_ICE_TRADE_BLOTTER_DEFAULT_DRILLDOWN_LIMIT;
  return Math.min(
    Math.max(parsed, 25),
    RAW_ICE_TRADE_BLOTTER_MAX_DRILLDOWN_LIMIT,
  );
}

function parseDrilldownText(value: unknown, maxLength = 160): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function parseDrilldownNumber(value: unknown): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDrilldownFilter(value: string | null): IceTradeBlotterDrilldownFilter | null {
  if (!value) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  return {
    product: parseDrilldownText(record.product),
    hub: parseDrilldownText(record.hub),
    contract: parseDrilldownText(record.contract),
    beginDate: parseDrilldownText(record.beginDate),
    endDate: parseDrilldownText(record.endDate),
    option: parseDrilldownText(record.option),
    strike: parseDrilldownNumber(record.strike),
    strike2: parseDrilldownNumber(record.strike2),
    cc: parseDrilldownText(record.cc, 40),
    strip: parseDrilldownText(record.strip, 80),
    dealSection: parseDrilldownText(record.dealSection, 80),
    label: parseDrilldownText(record.label, 220),
  };
}

export function baseArgs(filters: RawIceTradeBlotterFilters): unknown[] {
  return [
    filters.requestedDate,
    filters.sides.sqlValues,
    filters.traders.sqlValues,
    filters.clearingAccounts.sqlValues,
    filters.customerAccounts.sqlValues,
    filters.clearingFirms.sqlValues,
    filters.products.sqlValues,
    filters.hubs.sqlValues,
    filters.ccs.sqlValues,
    filters.contracts.sqlValues,
    filters.options.sqlValues,
    filters.dealSections.sqlValues,
    filters.sources.sqlValues,
    filters.userIds.sqlValues,
    filters.search,
  ];
}

export function appliedFilters(filters: RawIceTradeBlotterFilters): IceTradeBlotterAppliedFilters {
  return {
    sides: filters.sides.displayValues,
    traders: filters.traders.displayValues,
    clearingAccounts: filters.clearingAccounts.displayValues,
    customerAccounts: filters.customerAccounts.displayValues,
    clearingFirms: filters.clearingFirms.displayValues,
    products: filters.products.displayValues,
    hubs: filters.hubs.displayValues,
    ccs: filters.ccs.displayValues,
    contracts: filters.contracts.displayValues,
    options: filters.options.displayValues,
    dealSections: filters.dealSections.displayValues,
    sources: filters.sources.displayValues,
    userIds: filters.userIds.displayValues,
    search: filters.search ?? "",
  };
}

export function selectedRawIceTradeBlotterCte(): string {
  return `
    WITH params AS NOT MATERIALIZED (
      SELECT
        $1::date AS requested_trade_date,
        $2::text[] AS side_filters,
        $3::text[] AS trader_filters,
        $4::text[] AS clearing_account_filters,
        $5::text[] AS customer_account_filters,
        $6::text[] AS clearing_firm_filters,
        $7::text[] AS product_filters,
        $8::text[] AS hub_filters,
        $9::text[] AS cc_filters,
        $10::text[] AS contract_filters,
        $11::text[] AS option_filters,
        $12::text[] AS deal_section_filters,
        $13::text[] AS source_filters,
        $14::text[] AS user_id_filters,
        NULLIF(BTRIM($15::text), '') AS search_text
    ),
    latest_trade_date AS (
      SELECT MAX(trade_date) AS latest_date
      FROM ice_trade_blotter.ice_trade_blotter
    ),
    selected_snapshot AS (
      SELECT
        params.requested_trade_date,
        COALESCE(params.requested_trade_date, latest_trade_date.latest_date) AS selected_trade_date,
        latest_trade_date.latest_date AS latest_trade_date
      FROM params
      CROSS JOIN latest_trade_date
    ),
    filter_source_trades AS MATERIALIZED (
      SELECT
        trades.*,
        manifest.loaded_at AS manifest_loaded_at,
        CASE
          WHEN UPPER(BTRIM(COALESCE(trades.b_s, ''))) LIKE 'S%' THEN -ABS(trades.total_quantity)
          WHEN UPPER(BTRIM(COALESCE(trades.b_s, ''))) LIKE 'B%' THEN ABS(trades.total_quantity)
          ELSE trades.total_quantity
        END AS signed_quantity,
        CASE
          WHEN UPPER(BTRIM(COALESCE(trades.b_s, ''))) LIKE 'S%' THEN -ABS(trades.lots)
          WHEN UPPER(BTRIM(COALESCE(trades.b_s, ''))) LIKE 'B%' THEN ABS(trades.lots)
          ELSE trades.lots
        END AS signed_lots
      FROM ice_trade_blotter.ice_trade_blotter AS trades
      CROSS JOIN params
      CROSS JOIN selected_snapshot
      LEFT JOIN ice_trade_blotter.file_manifest AS manifest
        ON manifest.file_hash = trades.file_hash
      WHERE selected_snapshot.selected_trade_date IS NOT NULL
        AND trades.trade_date = selected_snapshot.selected_trade_date
        AND (
          params.search_text IS NULL
          OR CONCAT_WS(
            ' ',
            trades.deal_id,
            trades.leg_id,
            trades.orig_id,
            trades.link_id,
            trades.product,
            trades.hub,
            trades.contract,
            trades.clearing_acct,
            trades.cust_acct,
            trades.clearing_firm,
            trades.trader,
            trades.counterparty,
            trades.memo,
            trades.source,
            trades.user_id,
            trades.file_hash
          ) ILIKE '%' || params.search_text || '%'
        )
    ),
    source_trades AS MATERIALIZED (
      SELECT filter_source_trades.*
      FROM filter_source_trades
      CROSS JOIN params
      WHERE
        (
          COALESCE(cardinality(params.side_filters), 0) = 0
          OR LOWER(BTRIM(COALESCE(filter_source_trades.b_s, ''))) = ANY(params.side_filters)
        )
        AND (
          COALESCE(cardinality(params.trader_filters), 0) = 0
          OR LOWER(BTRIM(COALESCE(filter_source_trades.trader, ''))) = ANY(params.trader_filters)
        )
        AND (
          COALESCE(cardinality(params.clearing_account_filters), 0) = 0
          OR LOWER(BTRIM(COALESCE(filter_source_trades.clearing_acct, ''))) = ANY(params.clearing_account_filters)
        )
        AND (
          COALESCE(cardinality(params.customer_account_filters), 0) = 0
          OR LOWER(BTRIM(COALESCE(filter_source_trades.cust_acct, ''))) = ANY(params.customer_account_filters)
        )
        AND (
          COALESCE(cardinality(params.clearing_firm_filters), 0) = 0
          OR LOWER(BTRIM(COALESCE(filter_source_trades.clearing_firm, ''))) = ANY(params.clearing_firm_filters)
        )
        AND (
          COALESCE(cardinality(params.product_filters), 0) = 0
          OR LOWER(BTRIM(COALESCE(filter_source_trades.product, ''))) = ANY(params.product_filters)
        )
        AND (
          COALESCE(cardinality(params.hub_filters), 0) = 0
          OR LOWER(BTRIM(COALESCE(filter_source_trades.hub, ''))) = ANY(params.hub_filters)
        )
        AND (
          COALESCE(cardinality(params.cc_filters), 0) = 0
          OR LOWER(BTRIM(COALESCE(filter_source_trades.cc, ''))) = ANY(params.cc_filters)
        )
        AND (
          COALESCE(cardinality(params.contract_filters), 0) = 0
          OR LOWER(BTRIM(COALESCE(filter_source_trades.contract, ''))) = ANY(params.contract_filters)
        )
        AND (
          COALESCE(cardinality(params.option_filters), 0) = 0
          OR LOWER(BTRIM(COALESCE(filter_source_trades.option, ''))) = ANY(params.option_filters)
        )
        AND (
          COALESCE(cardinality(params.deal_section_filters), 0) = 0
          OR LOWER(BTRIM(COALESCE(filter_source_trades.deal_section, ''))) = ANY(params.deal_section_filters)
        )
        AND (
          COALESCE(cardinality(params.source_filters), 0) = 0
          OR LOWER(BTRIM(COALESCE(filter_source_trades.source, ''))) = ANY(params.source_filters)
        )
        AND (
          COALESCE(cardinality(params.user_id_filters), 0) = 0
          OR LOWER(BTRIM(COALESCE(filter_source_trades.user_id, ''))) = ANY(params.user_id_filters)
        )
    )
  `;
}

function addTextDrilldownClause({
  args,
  clauses,
  column,
  value,
  parameterIndex,
}: {
  args: unknown[];
  clauses: string[];
  column: string;
  value: string | null;
  parameterIndex: number;
}): number {
  args.push(value);
  clauses.push(`NULLIF(BTRIM(${column}), '') IS NOT DISTINCT FROM $${parameterIndex}::text`);
  return parameterIndex + 1;
}

function addNumberDrilldownClause({
  args,
  clauses,
  column,
  value,
  parameterIndex,
}: {
  args: unknown[];
  clauses: string[];
  column: string;
  value: number | null;
  parameterIndex: number;
}): number {
  args.push(value);
  clauses.push(
    `round(${column}::numeric, 8) IS NOT DISTINCT FROM round($${parameterIndex}::numeric, 8)`,
  );
  return parameterIndex + 1;
}

export function buildRawIceTradeBlotterDrilldownWhere({
  filter,
  firstParameterIndex,
}: {
  filter: IceTradeBlotterDrilldownFilter | null;
  firstParameterIndex: number;
}): { sql: string; args: unknown[] } {
  if (!filter) return { sql: "TRUE", args: [] };

  const clauses: string[] = [];
  const args: unknown[] = [];
  let parameterIndex = firstParameterIndex;

  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    column: "product",
    value: filter.product,
    parameterIndex,
  });
  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    column: "hub",
    value: filter.hub,
    parameterIndex,
  });
  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    column: "contract",
    value: filter.contract,
    parameterIndex,
  });
  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    column: "begin_date",
    value: filter.beginDate,
    parameterIndex,
  });
  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    column: "end_date",
    value: filter.endDate,
    parameterIndex,
  });
  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    column: "option",
    value: filter.option,
    parameterIndex,
  });
  parameterIndex = addNumberDrilldownClause({
    args,
    clauses,
    column: "strike",
    value: filter.strike,
    parameterIndex,
  });
  parameterIndex = addNumberDrilldownClause({
    args,
    clauses,
    column: "strike_2",
    value: filter.strike2,
    parameterIndex,
  });
  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    column: "cc",
    value: filter.cc,
    parameterIndex,
  });
  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    column: "strip",
    value: filter.strip,
    parameterIndex,
  });
  addTextDrilldownClause({
    args,
    clauses,
    column: "deal_section",
    value: filter.dealSection,
    parameterIndex,
  });

  return { sql: clauses.join("\n        AND "), args };
}
