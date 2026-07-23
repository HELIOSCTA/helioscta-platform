import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  ClearStreetCellValue,
  ClearStreetReviewStatus,
  ClearStreetSignatureSummary,
  ClearStreetTradesAppliedFilters,
  ClearStreetTradesAvailableDate,
  ClearStreetTradesDebugPayload,
  ClearStreetTradesDrilldownFilter,
  ClearStreetTradesPayload,
  ClearStreetTradesProductSummaryRow,
  ClearStreetTradesSummary,
} from "@/lib/positionsAndTrades/clearStreetTradesTypes";
import {
  CLEAR_STREET_DERIVED_FIELDS,
  CLEAR_STREET_MODEL_COLUMNS,
  type ClearStreetModelColumn,
} from "@/lib/positionsAndTrades/clearStreetTradesTypes";
import {
  getPositionsAndTradesArtifact,
  type PositionsAndTradesManifestArtifact,
} from "@/lib/server/positionsAndTradesManifest";

export const CLEAR_STREET_TRADES_SOURCE_TABLE = "clear_street.eod_transactions";
export const CLEAR_STREET_TRADES_ARTIFACT_ID = "clear_street_trades_review";
export const CLEAR_STREET_TRADES_BACKEND_NULL_CHECK_CRITERIA =
  "product records have blank/null product_code_grouping, missing/unsupported route_family, expected ICE vendor-code rows lack ICE code, or NYMEX rows lack both CME and Bloomberg codes";
export const CLEAR_STREET_TRADES_AGGREGATE_LIMIT = 800;
export const CLEAR_STREET_TRADES_DEFAULT_RAW_LIMIT = 100;
export const CLEAR_STREET_TRADES_MAX_RAW_LIMIT = 2_000;
export const CLEAR_STREET_TRADES_BASE_PARAM_COUNT = 7;

const TEXT_FILTER_PATTERN = /^[\w .:/()+,&'#\[\]@%~-]{1,160}$/;
const REVIEW_STATUSES: ClearStreetReviewStatus[] = [
  "matched",
  "vendor_warning",
  "needs_review",
];

let cachedPromotedSql: string | null = null;

export interface PromotedClearStreetTradesSql {
  sql: string;
  promotedSqlPath: string;
  dbtModelPath: string;
  dbtCompiledPath: string;
  artifactId: string;
  artifactDisplayName: string;
  contractId: string;
  contractDisplayName: string;
  dbtModelFamily: string;
  referenceSchema: string;
  referenceTables: string[];
}

export interface ParsedTextListFilter {
  displayValues: string[];
  sqlValues: string[];
}

export interface ClearStreetTradesFilters {
  requestedDate: string | null;
  accounts: ParsedTextListFilter;
  productCodes: ParsedTextListFilter;
  productFamilies: ParsedTextListFilter;
  marketNames: ParsedTextListFilter;
  statuses: {
    displayValues: ClearStreetReviewStatus[];
    sqlValues: ClearStreetReviewStatus[];
  };
  search: string | null;
  forceRefresh: boolean;
}

export interface AvailableDateDbRow {
  sftp_date: string;
  row_count: number | string;
  signature_count: number | string;
  latest_upload_at: string | null;
  latest_updated_at: string | null;
}

export interface SignatureSummaryRow extends Record<string, unknown> {
  selected_sftp_date?: string | Date | null;
  selected_upload_at?: string | Date | null;
  signature_key?: string | null;
  source_product?: string | null;
  exchange_code_input?: string | null;
  exchange_name_input?: string | null;
  put_call?: string | null;
  security_type?: string | null;
  product_code?: string | null;
  product_family?: string | null;
  market_name?: string | null;
  status_rank?: string | number | null;
  review_reason?: string | null;
  first_seen_date?: string | Date | null;
  last_seen_date?: string | Date | null;
  latest_row_count?: string | number | null;
  prior_row_count?: string | number | null;
  history_row_count?: string | number | null;
  latest_net_quantity?: string | number | null;
  history_net_quantity?: string | number | null;
  matched_row_count?: string | number | null;
  vendor_warning_row_count?: string | number | null;
  needs_review_row_count?: string | number | null;
  latest_matched_row_count?: string | number | null;
  latest_vendor_warning_row_count?: string | number | null;
  latest_needs_review_row_count?: string | number | null;
  accounts?: string[] | null;
}

export interface BundleDbRow {
  snapshot: unknown;
  available_dates?: unknown;
  filters: unknown;
  summary: unknown;
  product_summary: unknown;
  raw_rows?: unknown;
}

export interface SnapshotDbRow {
  selected_sftp_date?: string | null;
  latest_sftp_date?: string | null;
  requested_sftp_date?: string | null;
}

export interface FilterDbRow {
  accounts?: unknown;
  product_codes?: unknown;
  product_families?: unknown;
  market_names?: unknown;
  statuses?: unknown;
}

export interface SummaryDbRow {
  min_sftp_date?: string | null;
  max_sftp_date?: string | null;
  latest_upload_at?: string | null;
  latest_updated_at?: string | null;
  row_count?: number | string;
  signature_count?: number | string;
  product_count?: number | string;
  contract_count?: number | string;
  account_count?: number | string;
  total_quantity?: number | string | null;
  net_quantity?: number | string | null;
  matched_row_count?: number | string;
  vendor_warning_row_count?: number | string;
  needs_review_row_count?: number | string;
}

export interface ProductSummaryDbRow {
  product_code: string | null;
  product_family: string | null;
  market_name: string | null;
  underlying_product_code: string | null;
  source_product: string | null;
  exchange_code_input: string | null;
  contract: string | null;
  contract_month: string | null;
  contract_day: string | null;
  put_call: string | null;
  strike: number | string | null;
  review_status: ClearStreetReviewStatus | string | null;
  review_reason: string | null;
  accounts: string | null;
  row_count: number | string;
  signature_count: number | string;
  total_quantity: number | string | null;
  net_quantity: number | string | null;
  matched_row_count: number | string;
  vendor_warning_row_count: number | string;
  needs_review_row_count: number | string;
  avg_trade_price: number | string | null;
  latest_upload_at: string | null;
  latest_updated_at: string | null;
}

function runtimePathsForPromotedSql(promotedSqlPath: string): string[] {
  const frontendRelativePath = promotedSqlPath.startsWith("frontend/")
    ? promotedSqlPath.slice("frontend/".length)
    : promotedSqlPath;
  return [
    path.join(process.cwd(), ...frontendRelativePath.split("/")),
    path.join(process.cwd(), ...promotedSqlPath.split("/")),
  ];
}

function promotedClearStreetArtifact({
  artifact,
  contractId,
  contractDisplayName,
  dbtModelFamily,
  referenceSchema,
  referenceTables,
}: {
  artifact: PositionsAndTradesManifestArtifact;
  contractId: string;
  contractDisplayName: string;
  dbtModelFamily: string;
  referenceSchema: string;
  referenceTables: string[];
}): PromotedClearStreetTradesSql {
  if (!cachedPromotedSql) {
    throw new Error("Clear Street promoted SQL was requested before it was loaded.");
  }
  return {
    sql: cachedPromotedSql,
    promotedSqlPath: artifact.promotedSql,
    dbtModelPath: artifact.dbtModel,
    dbtCompiledPath: artifact.dbtCompiledSql,
    artifactId: CLEAR_STREET_TRADES_ARTIFACT_ID,
    artifactDisplayName: artifact.displayName,
    contractId,
    contractDisplayName,
    dbtModelFamily,
    referenceSchema,
    referenceTables,
  };
}

export async function loadPromotedAllHistorySql(): Promise<PromotedClearStreetTradesSql> {
  const { manifest, artifact } = await getPositionsAndTradesArtifact(CLEAR_STREET_TRADES_ARTIFACT_ID);
  if (cachedPromotedSql) {
    return promotedClearStreetArtifact({
      artifact,
      contractId: manifest.contractId,
      contractDisplayName: manifest.displayName,
      dbtModelFamily: manifest.dbtModelFamily,
      referenceSchema: manifest.referenceSchema,
      referenceTables: manifest.referenceTables,
    });
  }

  let content: string | null = null;
  for (const candidatePath of runtimePathsForPromotedSql(artifact.promotedSql)) {
    try {
      content = await readFile(candidatePath, "utf8");
      break;
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: unknown }).code
          : null;
      if (code !== "ENOENT") throw error;
    }
  }

  if (content === null) {
    throw new Error(
      `Unable to read ${artifact.promotedSql}. Run dbt/azure_postgres/scripts/promote_positions_trades_sql.py.`,
    );
  }

  const sql = content.trim().replace(/;\s*$/, "");
  if (!sql.toLowerCase().includes("rule_status") || !sql.includes("__dbt__cte__")) {
    throw new Error(
      `${artifact.promotedSql} is not a compiled dbt Clear Street mart.`,
    );
  }

  cachedPromotedSql = sql;
  return promotedClearStreetArtifact({
    artifact,
    contractId: manifest.contractId,
    contractDisplayName: manifest.displayName,
    dbtModelFamily: manifest.dbtModelFamily,
    referenceSchema: manifest.referenceSchema,
    referenceTables: manifest.referenceTables,
  });
}

export function parseLimit(value: string | null, defaultLimit = CLEAR_STREET_TRADES_DEFAULT_RAW_LIMIT): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed)) return defaultLimit;
  return Math.min(Math.max(parsed, 25), CLEAR_STREET_TRADES_MAX_RAW_LIMIT);
}

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

function parseStatusListFilter(searchParams: URLSearchParams): {
  displayValues: ClearStreetReviewStatus[];
  sqlValues: ClearStreetReviewStatus[];
} {
  const seen = new Set<ClearStreetReviewStatus>();
  const values: ClearStreetReviewStatus[] = [];

  for (const rawValue of searchParams.getAll("status")) {
    for (const part of rawValue.split(",")) {
      const normalized = part.trim().toLowerCase();
      if (!REVIEW_STATUSES.includes(normalized as ClearStreetReviewStatus)) continue;
      const status = normalized as ClearStreetReviewStatus;
      if (seen.has(status)) continue;
      seen.add(status);
      values.push(status);
    }
  }

  return { displayValues: values, sqlValues: values };
}

export function parseClearStreetTradesFilters(searchParams: URLSearchParams): ClearStreetTradesFilters {
  return {
    requestedDate: parseDate(searchParams.get("date") ?? searchParams.get("sftpDate")),
    accounts: parseTextListFilter(
      searchParams,
      ["account", "accountName", "accountNumber", "clearingAcct"],
      100,
      false,
    ),
    productCodes: parseTextListFilter(searchParams, ["productCode", "product"], 80),
    productFamilies: parseTextListFilter(searchParams, ["productFamily"], 120, false),
    marketNames: parseTextListFilter(searchParams, ["marketName", "market"], 120, false),
    statuses: parseStatusListFilter(searchParams),
    search: parseSearch(searchParams.get("search")),
    forceRefresh: searchParams.get("refresh") === "1",
  };
}

export function appliedFilters(filters: ClearStreetTradesFilters): ClearStreetTradesAppliedFilters {
  return {
    accounts: filters.accounts.displayValues,
    productCodes: filters.productCodes.displayValues,
    productFamilies: filters.productFamilies.displayValues,
    marketNames: filters.marketNames.displayValues,
    statuses: filters.statuses.displayValues,
    search: filters.search ?? "",
  };
}

export function baseArgs(filters: ClearStreetTradesFilters): unknown[] {
  return [
    filters.requestedDate,
    filters.accounts.sqlValues,
    filters.productCodes.sqlValues,
    filters.productFamilies.sqlValues,
    filters.marketNames.sqlValues,
    filters.statuses.sqlValues,
    filters.search,
  ];
}

function blankSql(expression: string): string {
  return `(${expression} IS NULL OR btrim(${expression}::text) = '')`;
}

function normalizedSql(expression: string): string {
  return `upper(regexp_replace(coalesce(${expression}::text, ''), '[[:space:]]+', ' ', 'g'))`;
}

function exchangeRouteSql(prefix = ""): string {
  return `upper(btrim(coalesce(nullif(btrim(${prefix}exchange_route_code::text), ''), nullif(btrim(${prefix}exchange_name::text), ''), nullif(btrim(${prefix}exchange::text), ''))))`;
}

function exchangeRouteMissingSql(prefix = ""): string {
  return `(coalesce(nullif(btrim(${prefix}exchange_route_code::text), ''), nullif(btrim(${prefix}exchange_name::text), ''), nullif(btrim(${prefix}exchange::text), '')) IS NULL)`;
}

function routeFamilySql(prefix = ""): string {
  const exchangeRoute = exchangeRouteSql(prefix);
  return `lower(btrim(coalesce(
    nullif(btrim(${prefix}route_family::text), ''),
    case
      when ${exchangeRoute} IN ('IFED', 'IFE', 'IPE') then 'ice'
      when ${exchangeRoute} IN ('NYME', 'NYM', 'NYMEX', 'NMY') then 'nymex'
      when ${exchangeRouteMissingSql(prefix)} then 'missing'
      else 'unsupported'
    end
  )))`;
}

function backendNullCheckSql(prefix = ""): string {
  const routeFamily = routeFamilySql(prefix);
  return `(
    coalesce(${prefix}is_product_record, true)
    AND (
      ${blankSql(`${prefix}product_code_grouping`)}
      OR ${routeFamily} IN ('missing', 'unsupported')
      OR ${routeFamily} NOT IN ('ice', 'nymex')
      OR (
        ${routeFamily} = 'ice'
        AND ${blankSql(`${prefix}ice_product_code`)}
      )
      OR (
        ${routeFamily} = 'nymex'
        AND ${blankSql(`${prefix}cme_product_code`)}
        AND ${blankSql(`${prefix}bbg_product_code`)}
      )
    )
  )`;
}

function productCodeResolvedNoVendorCodeSql(prefix = ""): string {
  return `(
    not ${blankSql(`${prefix}product_code`)}
    AND ${blankSql(`${prefix}ice_product_code`)}
    AND ${blankSql(`${prefix}cme_product_code`)}
    AND ${blankSql(`${prefix}bbg_product_code`)}
  )`;
}

function clearStreetCoreCtes(promotedSql: string): string {
  const nullCheck = backendNullCheckSql();
  const productCodeResolvedNoVendorCode = productCodeResolvedNoVendorCodeSql(
    "modelled_clear_street_trades.",
  );

  return `
    modelled_clear_street_trades AS (
      SELECT promoted_clear_street_trades.*
      FROM (
        ${promotedSql}
      ) AS promoted_clear_street_trades
      CROSS JOIN params
      WHERE params.requested_sftp_date IS NOT NULL
        AND promoted_clear_street_trades.sftp_date = params.requested_sftp_date
    ),
    enriched AS (
      SELECT
        modelled_clear_street_trades.*,
        coalesce(
          nullif(btrim(modelled_clear_street_trades.security_description::text), ''),
          nullif(btrim(modelled_clear_street_trades.instrument_description::text), ''),
          nullif(btrim(modelled_clear_street_trades.symbol::text), '')
        ) AS source_product,
        coalesce(
          nullif(btrim(modelled_clear_street_trades.futures_code::text), ''),
          nullif(btrim(modelled_clear_street_trades.exch_comm_cd::text), '')
        ) AS exchange_code_input,
        nullif(btrim(coalesce(
          modelled_clear_street_trades.source_exchange_name,
          modelled_clear_street_trades.exchange_name
        )::text), '') AS exchange_name_input,
        coalesce(
          nullif(btrim(modelled_clear_street_trades.put_call_code::text), ''),
          nullif(btrim(modelled_clear_street_trades.put_call::text), '')
        ) AS put_call_input,
        coalesce(
          nullif(btrim(modelled_clear_street_trades.security_type_code::text), ''),
          nullif(btrim(modelled_clear_street_trades.instr_type::text), '')
        ) AS security_type_input,
        nullif(
          btrim(
            concat_ws(
              ' ',
              nullif(btrim(modelled_clear_street_trades.contract_yyyymm::text), ''),
              nullif(btrim(modelled_clear_street_trades.contract_day::text), ''),
              nullif(btrim(coalesce(modelled_clear_street_trades.put_call_code, modelled_clear_street_trades.put_call)::text), ''),
              nullif(btrim(modelled_clear_street_trades.strike_price_normalized::text), '')
            )
          ),
          ''
        ) AS contract_display,
        array_to_string(
          ARRAY[
            ${normalizedSql("coalesce(modelled_clear_street_trades.security_description, modelled_clear_street_trades.instrument_description, modelled_clear_street_trades.symbol)")},
            ${normalizedSql("modelled_clear_street_trades.futures_code")},
            ${normalizedSql("modelled_clear_street_trades.exch_comm_cd")},
            ${normalizedSql("coalesce(modelled_clear_street_trades.exchange_route_code, modelled_clear_street_trades.exchange_name)")},
            ${normalizedSql("modelled_clear_street_trades.route_family")},
            ${normalizedSql("coalesce(modelled_clear_street_trades.put_call_code, modelled_clear_street_trades.put_call)")},
            ${normalizedSql("coalesce(modelled_clear_street_trades.security_type_code, modelled_clear_street_trades.instr_type)")}
          ],
          '|'
        ) AS signature_key,
        coalesce(
          modelled_clear_street_trades.quantity_cleaned::numeric,
          case
            when modelled_clear_street_trades.buy_sell::text ~ '^\\d+$'
              and modelled_clear_street_trades.buy_sell::integer = 2
            then -1 * modelled_clear_street_trades.quantity::numeric
            else modelled_clear_street_trades.quantity::numeric
          end,
          0
        ) AS signed_quantity,
        abs(
          coalesce(
            modelled_clear_street_trades.quantity_cleaned::numeric,
            modelled_clear_street_trades.quantity::numeric,
            0
          )
        ) AS absolute_quantity,
        case
          when btrim(coalesce(modelled_clear_street_trades.trade_price::text, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$'
          then modelled_clear_street_trades.trade_price::numeric
        end AS trade_price_numeric,
        coalesce(
          nullif(btrim(modelled_clear_street_trades.account_code::text), ''),
          nullif(btrim(modelled_clear_street_trades.account_name::text), ''),
          nullif(btrim(modelled_clear_street_trades.account_number::text), ''),
          nullif(btrim(modelled_clear_street_trades.give_in_out_firm_num::text), '')
        ) AS account_display,
        case
          when not coalesce(modelled_clear_street_trades.is_product_record, true) then 'matched'
          when ${nullCheck} then 'needs_review'
          when (
            coalesce(modelled_clear_street_trades.is_product_record, true)
            and (
              ${blankSql("modelled_clear_street_trades.product_code")}
              or ${productCodeResolvedNoVendorCode}
            )
          )
          then 'vendor_warning'
          else 'matched'
        end AS review_status,
        case
          when not coalesce(modelled_clear_street_trades.is_product_record, true)
          then 'Non-product cash adjustment row.'
          when ${nullCheck}
          then 'Backend null check: ${CLEAR_STREET_TRADES_BACKEND_NULL_CHECK_CRITERIA}.'
          when coalesce(modelled_clear_street_trades.is_product_record, true)
            and ${blankSql("modelled_clear_street_trades.product_code")}
          then 'dbt did not resolve product_code.'
          when
            coalesce(modelled_clear_street_trades.is_product_record, true)
            and ${productCodeResolvedNoVendorCode}
          then 'dbt resolved product_code, but no vendor export code was generated.'
          else 'Backend null check passed.'
        end AS review_reason,
        case
          when not coalesce(modelled_clear_street_trades.is_product_record, true) then 2
          when ${nullCheck} then 0
          when (
            coalesce(modelled_clear_street_trades.is_product_record, true)
            and (
              ${blankSql("modelled_clear_street_trades.product_code")}
              or ${productCodeResolvedNoVendorCode}
            )
          )
          then 1
          else 2
        end AS review_status_rank
      FROM modelled_clear_street_trades
    )
  `;
}

export function selectedClearStreetTradesCte(promotedSql: string): string {
  return `
    WITH params AS NOT MATERIALIZED (
      SELECT
        $1::date AS requested_sftp_date,
        $2::text[] AS account_filters,
        $3::text[] AS product_code_filters,
        $4::text[] AS product_family_filters,
        $5::text[] AS market_name_filters,
        $6::text[] AS status_filters,
        NULLIF(BTRIM($7::text), '') AS search_text
    ),
    ${clearStreetCoreCtes(promotedSql)},
    selected_snapshot AS (
      SELECT
        params.requested_sftp_date,
        params.requested_sftp_date AS selected_sftp_date,
        params.requested_sftp_date AS latest_sftp_date
      FROM params
    ),
    latest_upload AS (
      SELECT
        enriched.sftp_date,
        max(enriched.sftp_upload_timestamp) AS sftp_upload_timestamp
      FROM enriched
      CROSS JOIN selected_snapshot
      WHERE selected_snapshot.selected_sftp_date IS NOT NULL
        AND enriched.sftp_date = selected_snapshot.selected_sftp_date
      GROUP BY enriched.sftp_date
    ),
    filter_source_trades AS MATERIALIZED (
      SELECT enriched.*
      FROM enriched
      CROSS JOIN params
      INNER JOIN latest_upload
        ON latest_upload.sftp_date = enriched.sftp_date
       AND latest_upload.sftp_upload_timestamp = enriched.sftp_upload_timestamp
      WHERE (
        params.search_text IS NULL
        OR CONCAT_WS(
          ' ',
          enriched.record_id,
          enriched.source_product,
          enriched.exchange_code_input,
          enriched.exchange_name_input,
          enriched.product_code,
          enriched.product_family,
          enriched.market_name,
          enriched.underlying_product_code,
          enriched.ice_product_code,
          enriched.cme_product_code,
          enriched.bbg_product_code,
          enriched.account_display,
          enriched.account_number,
          enriched.executing_broker,
          enriched.opposing_broker,
          enriched.broker,
          enriched.symbol,
          enriched.cusip
        ) ILIKE '%' || params.search_text || '%'
      )
    ),
    source_trades AS MATERIALIZED (
      SELECT filter_source_trades.*
      FROM filter_source_trades
      CROSS JOIN params
      WHERE
        (
          coalesce(cardinality(params.account_filters), 0) = 0
          OR lower(btrim(coalesce(filter_source_trades.account_display, ''))) = ANY(params.account_filters)
          OR lower(btrim(coalesce(filter_source_trades.account_number::text, ''))) = ANY(params.account_filters)
        )
        AND (
          coalesce(cardinality(params.product_code_filters), 0) = 0
          OR lower(btrim(coalesce(filter_source_trades.product_code::text, ''))) = ANY(params.product_code_filters)
        )
        AND (
          coalesce(cardinality(params.product_family_filters), 0) = 0
          OR lower(btrim(coalesce(filter_source_trades.product_family::text, ''))) = ANY(params.product_family_filters)
        )
        AND (
          coalesce(cardinality(params.market_name_filters), 0) = 0
          OR lower(btrim(coalesce(filter_source_trades.market_name::text, ''))) = ANY(params.market_name_filters)
        )
        AND (
          coalesce(cardinality(params.status_filters), 0) = 0
          OR filter_source_trades.review_status = ANY(params.status_filters)
        )
    )
  `;
}

export function availableDatesSql(): string {
  return `
    WITH latest_upload_by_date AS (
      SELECT
        trade_date_from_sftp,
        max(sftp_upload_timestamp) AS sftp_upload_timestamp
      FROM ${CLEAR_STREET_TRADES_SOURCE_TABLE}
      WHERE trade_date_from_sftp ~ '^[0-9]{8}$'
      GROUP BY trade_date_from_sftp
    )
    SELECT
      to_char(to_date(source_rows.trade_date_from_sftp, 'YYYYMMDD'), 'YYYY-MM-DD') AS sftp_date,
      count(*)::integer AS row_count,
      count(*)::integer AS signature_count,
      max(source_rows.sftp_upload_timestamp)::text AS latest_upload_at,
      max(source_rows.updated_at)::text AS latest_updated_at
    FROM ${CLEAR_STREET_TRADES_SOURCE_TABLE} AS source_rows
    INNER JOIN latest_upload_by_date
      ON latest_upload_by_date.trade_date_from_sftp = source_rows.trade_date_from_sftp
     AND latest_upload_by_date.sftp_upload_timestamp = source_rows.sftp_upload_timestamp
    WHERE source_rows.trade_date_from_sftp ~ '^[0-9]{8}$'
    GROUP BY source_rows.trade_date_from_sftp
    ORDER BY source_rows.trade_date_from_sftp DESC
    LIMIT 90
  `;
}

function rawRowsSelectSql(source = "source_trades"): string {
  return CLEAR_STREET_MODEL_COLUMNS.map((column) => `${source}.${column}`).join(",\n            ");
}

export function summaryBundleSql(promotedSql: string): string {
  return `
    ${selectedClearStreetTradesCte(promotedSql)}
    SELECT
      (
        SELECT to_jsonb(snapshot_row)
        FROM (
          SELECT
            to_char(selected_sftp_date, 'YYYY-MM-DD') AS selected_sftp_date,
            to_char(latest_sftp_date, 'YYYY-MM-DD') AS latest_sftp_date,
            to_char(requested_sftp_date, 'YYYY-MM-DD') AS requested_sftp_date
          FROM selected_snapshot
        ) snapshot_row
      ) AS snapshot,
      (
        SELECT jsonb_build_object(
          'accounts',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT account_display AS value
              FROM filter_source_trades
              WHERE account_display IS NOT NULL
              LIMIT 300
            ) values
          ),
          'product_codes',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(product_code::text), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(product_code::text), '') IS NOT NULL
              LIMIT 300
            ) values
          ),
          'product_families',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(product_family::text), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(product_family::text), '') IS NOT NULL
              LIMIT 300
            ) values
          ),
          'market_names',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT NULLIF(BTRIM(market_name::text), '') AS value
              FROM filter_source_trades
              WHERE NULLIF(BTRIM(market_name::text), '') IS NOT NULL
              LIMIT 300
            ) values
          ),
          'statuses',
          (
            SELECT coalesce(jsonb_agg(value ORDER BY value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT review_status AS value
              FROM filter_source_trades
              WHERE review_status IS NOT NULL
            ) values
          )
        )
      ) AS filters,
      (
        SELECT to_jsonb(summary_row)
        FROM (
          SELECT
            to_char(min(sftp_date), 'YYYY-MM-DD') AS min_sftp_date,
            to_char(max(sftp_date), 'YYYY-MM-DD') AS max_sftp_date,
            max(sftp_upload_timestamp)::text AS latest_upload_at,
            max(updated_at)::text AS latest_updated_at,
            count(*)::integer AS row_count,
            count(DISTINCT signature_key)::integer AS signature_count,
            count(DISTINCT NULLIF(BTRIM(product_code::text), ''))::integer AS product_count,
            count(DISTINCT contract_display)::integer AS contract_count,
            count(DISTINCT account_display)::integer AS account_count,
            sum(absolute_quantity)::double precision AS total_quantity,
            sum(signed_quantity)::double precision AS net_quantity,
            count(*) FILTER (WHERE review_status = 'matched')::integer AS matched_row_count,
            count(*) FILTER (WHERE review_status = 'vendor_warning')::integer AS vendor_warning_row_count,
            count(*) FILTER (WHERE review_status = 'needs_review')::integer AS needs_review_row_count
          FROM source_trades
        ) summary_row
      ) AS summary,
      (
        SELECT coalesce(jsonb_agg(to_jsonb(product_row)), '[]'::jsonb)
        FROM (
          SELECT
            NULLIF(BTRIM(product_code::text), '') AS product_code,
            NULLIF(BTRIM(product_family::text), '') AS product_family,
            NULLIF(BTRIM(market_name::text), '') AS market_name,
            NULLIF(BTRIM(underlying_product_code::text), '') AS underlying_product_code,
            source_product,
            exchange_code_input,
            contract_display AS contract,
            NULLIF(BTRIM(contract_yyyymm::text), '') AS contract_month,
            NULLIF(BTRIM(contract_day::text), '') AS contract_day,
            put_call_input AS put_call,
            strike_price_normalized::double precision AS strike,
            CASE min(review_status_rank)
              WHEN 0 THEN 'needs_review'
              WHEN 1 THEN 'vendor_warning'
              ELSE 'matched'
            END AS review_status,
            (array_agg(review_reason ORDER BY review_status_rank))[1] AS review_reason,
            string_agg(DISTINCT account_display, ', ' ORDER BY account_display) FILTER (
              WHERE account_display IS NOT NULL
            ) AS accounts,
            count(*)::integer AS row_count,
            count(DISTINCT signature_key)::integer AS signature_count,
            sum(absolute_quantity)::double precision AS total_quantity,
            sum(signed_quantity)::double precision AS net_quantity,
            count(*) FILTER (WHERE review_status = 'matched')::integer AS matched_row_count,
            count(*) FILTER (WHERE review_status = 'vendor_warning')::integer AS vendor_warning_row_count,
            count(*) FILTER (WHERE review_status = 'needs_review')::integer AS needs_review_row_count,
            (
              sum(trade_price_numeric * absolute_quantity)
              / nullif(sum(absolute_quantity), 0)
            )::double precision AS avg_trade_price,
            max(sftp_upload_timestamp)::text AS latest_upload_at,
            max(updated_at)::text AS latest_updated_at
          FROM source_trades
          GROUP BY
            NULLIF(BTRIM(product_code::text), ''),
            NULLIF(BTRIM(product_family::text), ''),
            NULLIF(BTRIM(market_name::text), ''),
            NULLIF(BTRIM(underlying_product_code::text), ''),
            source_product,
            exchange_code_input,
            contract_display,
            NULLIF(BTRIM(contract_yyyymm::text), ''),
            NULLIF(BTRIM(contract_day::text), ''),
            put_call_input,
            strike_price_normalized
          ORDER BY
            abs(sum(signed_quantity)) DESC,
            NULLIF(BTRIM(product_code::text), '') NULLS LAST,
            source_product NULLS LAST,
            contract_display NULLS LAST
          LIMIT ${CLEAR_STREET_TRADES_AGGREGATE_LIMIT}
        ) product_row
      ) AS product_summary,
      (
        SELECT coalesce(jsonb_agg(to_jsonb(raw_row)), '[]'::jsonb)
        FROM (
          SELECT
            ${rawRowsSelectSql()}
          FROM source_trades
          ORDER BY row_number_for_trades NULLS LAST
          LIMIT $${CLEAR_STREET_TRADES_BASE_PARAM_COUNT + 1}::integer
        ) raw_row
      ) AS raw_rows
  `;
}

export function signatureSummarySql(promotedSql: string): string {
  return `
    ${selectedClearStreetTradesCte(promotedSql)},
    selected_signature_keys AS (
      SELECT DISTINCT source_trades.signature_key
      FROM source_trades
    ),
    matching_history AS (
      SELECT
        enriched.*,
        (
          enriched.sftp_date = latest_upload.sftp_date
          AND enriched.sftp_upload_timestamp = latest_upload.sftp_upload_timestamp
        ) AS is_selected
      FROM enriched
      INNER JOIN selected_signature_keys
        ON selected_signature_keys.signature_key = enriched.signature_key
      CROSS JOIN latest_upload
    )
    SELECT
      (SELECT latest_upload.sftp_date::text FROM latest_upload) AS selected_sftp_date,
      (SELECT latest_upload.sftp_upload_timestamp::text FROM latest_upload) AS selected_upload_at,
      matching_history.signature_key,
      matching_history.source_product,
      matching_history.exchange_code_input,
      matching_history.exchange_name_input,
      matching_history.put_call_input AS put_call,
      matching_history.security_type_input AS security_type,
      matching_history.product_code,
      matching_history.product_family,
      matching_history.market_name,
      min(matching_history.review_status_rank)::integer AS status_rank,
      (array_agg(matching_history.review_reason ORDER BY matching_history.review_status_rank))[1] AS review_reason,
      min(matching_history.sftp_date)::text AS first_seen_date,
      max(matching_history.sftp_date)::text AS last_seen_date,
      count(*) FILTER (WHERE matching_history.is_selected)::integer AS latest_row_count,
      count(*) FILTER (WHERE NOT matching_history.is_selected)::integer AS prior_row_count,
      count(*)::integer AS history_row_count,
      coalesce(sum(matching_history.signed_quantity) FILTER (WHERE matching_history.is_selected), 0)::double precision AS latest_net_quantity,
      coalesce(sum(matching_history.signed_quantity), 0)::double precision AS history_net_quantity,
      count(*) FILTER (WHERE matching_history.review_status = 'matched')::integer AS matched_row_count,
      count(*) FILTER (WHERE matching_history.review_status = 'vendor_warning')::integer AS vendor_warning_row_count,
      count(*) FILTER (WHERE matching_history.review_status = 'needs_review')::integer AS needs_review_row_count,
      count(*) FILTER (
        WHERE matching_history.is_selected AND matching_history.review_status = 'matched'
      )::integer AS latest_matched_row_count,
      count(*) FILTER (
        WHERE matching_history.is_selected AND matching_history.review_status = 'vendor_warning'
      )::integer AS latest_vendor_warning_row_count,
      count(*) FILTER (
        WHERE matching_history.is_selected AND matching_history.review_status = 'needs_review'
      )::integer AS latest_needs_review_row_count,
      coalesce(
        array_remove(array_agg(DISTINCT matching_history.account_display), NULL),
        ARRAY[]::text[]
      ) AS accounts
    FROM matching_history
    GROUP BY
      matching_history.signature_key,
      matching_history.source_product,
      matching_history.exchange_code_input,
      matching_history.exchange_name_input,
      matching_history.put_call_input,
      matching_history.security_type_input,
      matching_history.product_code,
      matching_history.product_family,
      matching_history.market_name
    ORDER BY
      latest_row_count DESC,
      status_rank ASC,
      history_row_count DESC
  `;
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

export function parseDrilldownFilter(value: string | null): ClearStreetTradesDrilldownFilter | null {
  if (!value) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const status = parseDrilldownText(record.reviewStatus, 40);

  return {
    productCode: parseDrilldownText(record.productCode, 80),
    productFamily: parseDrilldownText(record.productFamily),
    marketName: parseDrilldownText(record.marketName),
    sourceProduct: parseDrilldownText(record.sourceProduct),
    contract: parseDrilldownText(record.contract),
    contractMonth: parseDrilldownText(record.contractMonth, 40),
    contractDay: parseDrilldownText(record.contractDay, 40),
    putCall: parseDrilldownText(record.putCall, 40),
    strike: parseDrilldownNumber(record.strike),
    reviewStatus: REVIEW_STATUSES.includes(status as ClearStreetReviewStatus)
      ? (status as ClearStreetReviewStatus)
      : null,
    label: parseDrilldownText(record.label, 220),
  };
}

function addTextDrilldownClause({
  args,
  clauses,
  expression,
  value,
  parameterIndex,
  skipNull = false,
}: {
  args: unknown[];
  clauses: string[];
  expression: string;
  value: string | null;
  parameterIndex: number;
  skipNull?: boolean;
}): number {
  if (skipNull && value === null) return parameterIndex;
  args.push(value);
  clauses.push(`${expression} IS NOT DISTINCT FROM $${parameterIndex}::text`);
  return parameterIndex + 1;
}

function addNumberDrilldownClause({
  args,
  clauses,
  expression,
  value,
  parameterIndex,
}: {
  args: unknown[];
  clauses: string[];
  expression: string;
  value: number | null;
  parameterIndex: number;
}): number {
  args.push(value);
  clauses.push(`round(${expression}::numeric, 8) IS NOT DISTINCT FROM round($${parameterIndex}::numeric, 8)`);
  return parameterIndex + 1;
}

export function buildClearStreetTradesDrilldownWhere({
  filter,
  firstParameterIndex,
}: {
  filter: ClearStreetTradesDrilldownFilter | null;
  firstParameterIndex: number;
}): { sql: string; args: unknown[] } {
  if (!filter) return { sql: "TRUE", args: [] };

  const clauses: string[] = [];
  const args: unknown[] = [];
  let parameterIndex = firstParameterIndex;

  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    expression: "NULLIF(BTRIM(product_code::text), '')",
    value: filter.productCode,
    parameterIndex,
  });
  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    expression: "NULLIF(BTRIM(product_family::text), '')",
    value: filter.productFamily,
    parameterIndex,
  });
  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    expression: "NULLIF(BTRIM(market_name::text), '')",
    value: filter.marketName,
    parameterIndex,
  });
  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    expression: "source_product",
    value: filter.sourceProduct,
    parameterIndex,
  });
  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    expression: "contract_display",
    value: filter.contract,
    parameterIndex,
    skipNull: true,
  });
  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    expression: "NULLIF(BTRIM(contract_yyyymm::text), '')",
    value: filter.contractMonth,
    parameterIndex,
  });
  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    expression: "NULLIF(BTRIM(contract_day::text), '')",
    value: filter.contractDay,
    parameterIndex,
  });
  parameterIndex = addTextDrilldownClause({
    args,
    clauses,
    expression: "put_call_input",
    value: filter.putCall,
    parameterIndex,
  });
  parameterIndex = addNumberDrilldownClause({
    args,
    clauses,
    expression: "strike_price_normalized",
    value: filter.strike,
    parameterIndex,
  });
  if (filter.reviewStatus !== null) {
    addTextDrilldownClause({
      args,
      clauses,
      expression: "review_status",
      value: filter.reviewStatus,
      parameterIndex,
    });
  }

  return { sql: clauses.join("\n        AND "), args };
}

export function drilldownBundleSql(promotedSql: string, drilldownWhereSql: string): string {
  return `
    ${selectedClearStreetTradesCte(promotedSql)},
    drilldown_trades AS MATERIALIZED (
      SELECT *
      FROM source_trades
      WHERE ${drilldownWhereSql}
    )
    SELECT
      (
        SELECT to_jsonb(snapshot_row)
        FROM (
          SELECT
            to_char(selected_sftp_date, 'YYYY-MM-DD') AS selected_sftp_date,
            to_char(latest_sftp_date, 'YYYY-MM-DD') AS latest_sftp_date,
            to_char(requested_sftp_date, 'YYYY-MM-DD') AS requested_sftp_date
          FROM selected_snapshot
        ) snapshot_row
      ) AS snapshot,
      (
        SELECT to_jsonb(summary_row)
        FROM (
          SELECT
            count(*)::integer AS row_count,
            max(sftp_upload_timestamp)::text AS latest_upload_at,
            max(updated_at)::text AS latest_updated_at
          FROM drilldown_trades
        ) summary_row
      ) AS summary,
      (
        SELECT coalesce(jsonb_agg(to_jsonb(raw_row)), '[]'::jsonb)
        FROM (
          SELECT
            ${rawRowsSelectSql("drilldown_trades")}
          FROM drilldown_trades
          ORDER BY row_number_for_trades NULLS LAST
          LIMIT $${CLEAR_STREET_TRADES_BASE_PARAM_COUNT + 1}::integer
        ) raw_row
      ) AS raw_rows
  `;
}

export function normalizeValue(value: unknown): ClearStreetCellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}

export function isoOrText(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

export function dateOnly(value: unknown): string | null {
  const text = isoOrText(value);
  return text ? text.slice(0, 10) : null;
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function numberValue(value: unknown): number {
  return toNumber(value) ?? 0;
}

export function intValue(value: unknown): number {
  return Math.trunc(numberValue(value));
}

export function round(value: unknown, digits = 6): number | null {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

export function textValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function sanitizeOptionExpDate(value: unknown): ClearStreetCellValue {
  const normalized = normalizeValue(value);
  if (typeof normalized !== "string") return normalized;
  const trimmed = normalized.trim();
  if (!trimmed || trimmed < "0001-01-01") return null;
  return normalized;
}

export function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function rowArray<T extends object>(value: unknown): T[] {
  return Array.isArray(value)
    ? value.filter((item): item is T => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function statusFromRank(rank: unknown): ClearStreetReviewStatus {
  const normalized = intValue(rank);
  if (normalized <= 0) return "needs_review";
  if (normalized === 1) return "vendor_warning";
  return "matched";
}

function normalizeReviewStatus(value: unknown): ClearStreetReviewStatus {
  const text = textValue(value);
  if (text === "needs_review" || text === "vendor_warning" || text === "matched") return text;
  return "matched";
}

export function mapRawRow(row: Record<string, unknown>): Record<ClearStreetModelColumn, ClearStreetCellValue> {
  return Object.fromEntries(
    CLEAR_STREET_MODEL_COLUMNS.map((column) => {
      if (column === "option_exp_date") {
        return [column, sanitizeOptionExpDate(row[column])];
      }
      return [column, normalizeValue(row[column])];
    }),
  ) as Record<ClearStreetModelColumn, ClearStreetCellValue>;
}

export function mapAvailableDate(row: AvailableDateDbRow): ClearStreetTradesAvailableDate {
  return {
    sftpDate: row.sftp_date,
    rowCount: intValue(row.row_count),
    signatureCount: intValue(row.signature_count),
    latestUploadAt: isoOrText(row.latest_upload_at),
    latestUpdatedAt: isoOrText(row.latest_updated_at),
  };
}

export function mapSummary(row: SummaryDbRow | undefined): ClearStreetTradesSummary {
  return {
    rowCount: intValue(row?.row_count),
    signatureCount: intValue(row?.signature_count),
    productCount: intValue(row?.product_count),
    contractCount: intValue(row?.contract_count),
    accountCount: intValue(row?.account_count),
    totalQuantity: round(row?.total_quantity),
    netQuantity: round(row?.net_quantity),
    matchedRowCount: intValue(row?.matched_row_count),
    vendorWarningRowCount: intValue(row?.vendor_warning_row_count),
    needsReviewRowCount: intValue(row?.needs_review_row_count),
    minSftpDate: row?.min_sftp_date ?? null,
    maxSftpDate: row?.max_sftp_date ?? null,
    latestUploadAt: isoOrText(row?.latest_upload_at ?? null),
    latestUpdatedAt: isoOrText(row?.latest_updated_at ?? null),
  };
}

export function mapProductSummaryRow(row: ProductSummaryDbRow): ClearStreetTradesProductSummaryRow {
  return {
    productCode: row.product_code,
    productFamily: row.product_family,
    marketName: row.market_name,
    underlyingProductCode: row.underlying_product_code,
    sourceProduct: row.source_product,
    exchangeCodeInput: row.exchange_code_input,
    contract: row.contract,
    contractMonth: row.contract_month,
    contractDay: row.contract_day,
    putCall: row.put_call,
    strike: round(row.strike, 8),
    reviewStatus: normalizeReviewStatus(row.review_status),
    reviewReason: row.review_reason,
    accounts: row.accounts,
    rowCount: intValue(row.row_count),
    signatureCount: intValue(row.signature_count),
    totalQuantity: round(row.total_quantity),
    netQuantity: round(row.net_quantity),
    matchedRowCount: intValue(row.matched_row_count),
    vendorWarningRowCount: intValue(row.vendor_warning_row_count),
    needsReviewRowCount: intValue(row.needs_review_row_count),
    avgTradePrice: round(row.avg_trade_price),
    latestUploadAt: isoOrText(row.latest_upload_at),
    latestUpdatedAt: isoOrText(row.latest_updated_at),
  };
}

export function mapSignatureSummary(row: SignatureSummaryRow): ClearStreetSignatureSummary {
  return {
    signatureKey: textValue(row.signature_key) ?? "",
    sourceProduct: textValue(row.source_product),
    exchangeCodeInput: textValue(row.exchange_code_input),
    exchangeNameInput: textValue(row.exchange_name_input),
    putCall: textValue(row.put_call),
    securityType: textValue(row.security_type),
    productCode: textValue(row.product_code),
    productGroup: textValue(row.product_family),
    productRegion: textValue(row.market_name),
    status: statusFromRank(row.status_rank),
    reviewReason: textValue(row.review_reason) ?? "Backend null check.",
    firstSeenDate: dateOnly(row.first_seen_date),
    lastSeenDate: dateOnly(row.last_seen_date),
    latestRowCount: intValue(row.latest_row_count),
    priorRowCount: intValue(row.prior_row_count),
    historyRowCount: intValue(row.history_row_count),
    latestNetQuantity: numberValue(row.latest_net_quantity),
    historyNetQuantity: numberValue(row.history_net_quantity),
    matchedRowCount: intValue(row.matched_row_count),
    vendorWarningRowCount: intValue(row.vendor_warning_row_count),
    needsReviewRowCount: intValue(row.needs_review_row_count),
    latestMatchedRowCount: intValue(row.latest_matched_row_count),
    latestVendorWarningRowCount: intValue(row.latest_vendor_warning_row_count),
    latestNeedsReviewRowCount: intValue(row.latest_needs_review_row_count),
    accounts: Array.isArray(row.accounts) ? row.accounts.filter(Boolean).map(String) : [],
    sampleRows: [],
  };
}

export function summarizeLatest(signatures: ClearStreetSignatureSummary[]): ClearStreetTradesPayload["latestSummary"] {
  return {
    rowCount: signatures.reduce((total, signature) => total + signature.latestRowCount, 0),
    signatureCount: signatures.length,
    matchedRowCount: signatures.reduce((total, signature) => total + signature.latestMatchedRowCount, 0),
    vendorWarningRowCount: signatures.reduce(
      (total, signature) => total + signature.latestVendorWarningRowCount,
      0,
    ),
    needsReviewRowCount: signatures.reduce((total, signature) => total + signature.latestNeedsReviewRowCount, 0),
    newSignatureCount: signatures.filter((signature) => signature.priorRowCount === 0).length,
    historicalSignatureCount: signatures.filter((signature) => signature.priorRowCount > 0).length,
  };
}

export function summarizeHistory(signatures: ClearStreetSignatureSummary[]): ClearStreetTradesPayload["historySummary"] {
  return {
    rowCount: signatures.reduce((total, signature) => total + signature.historyRowCount, 0),
    signatureCount: signatures.length,
    matchedRowCount: signatures.reduce((total, signature) => total + signature.matchedRowCount, 0),
    vendorWarningRowCount: signatures.reduce((total, signature) => total + signature.vendorWarningRowCount, 0),
    needsReviewRowCount: signatures.reduce((total, signature) => total + signature.needsReviewRowCount, 0),
    historyRowCap: null,
    historyRowLimitReached: false,
  };
}

export function emptyPayloadMetadata(promotedArtifact: PromotedClearStreetTradesSql) {
  return {
    contractId: promotedArtifact.contractId,
    contractDisplayName: promotedArtifact.contractDisplayName,
    artifactId: promotedArtifact.artifactId,
    artifactDisplayName: promotedArtifact.artifactDisplayName,
    dbtModelFamily: promotedArtifact.dbtModelFamily,
    referenceSchema: promotedArtifact.referenceSchema,
    referenceTables: promotedArtifact.referenceTables,
    accounts: [],
    productCodes: [],
    productFamilies: [],
    marketNames: [],
    statuses: [],
    aggregationGrain: [
      "product_code",
      "product_family",
      "market_name",
      "source_product",
      "contract_yyyymm",
      "contract_day",
      "put_call",
      "strike_price_normalized",
      "review_status",
    ],
    productSummaryLimit: CLEAR_STREET_TRADES_AGGREGATE_LIMIT,
    sourceTable: CLEAR_STREET_TRADES_SOURCE_TABLE,
    dbtModel: promotedArtifact.dbtModelPath,
    promotedSql: promotedArtifact.promotedSqlPath,
    compiledSql: promotedArtifact.dbtCompiledPath,
    units: {
      quantity: "Clear Street signed quantity",
      price: "Clear Street trade_price",
    },
  };
}

export function buildDebugPayload({
  filters,
  drilldown,
  limit,
  rawRows,
  snapshot,
  summary,
  promotedArtifact,
}: {
  filters: ClearStreetTradesFilters;
  drilldown: ClearStreetTradesDrilldownFilter | null;
  limit: number;
  rawRows: Array<Record<string, unknown>>;
  snapshot: SnapshotDbRow;
  summary: SummaryDbRow;
  promotedArtifact: PromotedClearStreetTradesSql;
}): ClearStreetTradesDebugPayload {
  const asOf = isoOrText(summary.latest_upload_at ?? summary.latest_updated_at ?? null);

  return {
    source: `${promotedArtifact.contractDisplayName} / ${promotedArtifact.artifactDisplayName}`,
    selectedDate: snapshot.selected_sftp_date ?? filters.requestedDate ?? snapshot.latest_sftp_date ?? null,
    latestDate: snapshot.latest_sftp_date ?? null,
    requestedDate: filters.requestedDate,
    asOf,
    latestUploadAt: isoOrText(summary.latest_upload_at ?? null),
    filters: appliedFilters(filters),
    summary: {
      rowCount: intValue(summary.row_count),
      returnedRowCount: rawRows.length,
      limit,
    },
    rows: rawRows.map(mapRawRow),
    columns: [...CLEAR_STREET_MODEL_COLUMNS],
    derivedFields: [...CLEAR_STREET_DERIVED_FIELDS],
    metadata: {
      drilldown,
      contractId: promotedArtifact.contractId,
      contractDisplayName: promotedArtifact.contractDisplayName,
      artifactId: promotedArtifact.artifactId,
      artifactDisplayName: promotedArtifact.artifactDisplayName,
      dbtModelFamily: promotedArtifact.dbtModelFamily,
      referenceSchema: promotedArtifact.referenceSchema,
      referenceTables: promotedArtifact.referenceTables,
      sourceTable: CLEAR_STREET_TRADES_SOURCE_TABLE,
      dbtModel: promotedArtifact.dbtModelPath,
      promotedSql: promotedArtifact.promotedSqlPath,
      compiledSql: promotedArtifact.dbtCompiledPath,
    },
  };
}
