import { readFile } from "node:fs/promises";
import path from "node:path";

import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "no-store";
const DEFAULT_LIMIT = 500;
const MIN_LIMIT = 25;
const MAX_LIMIT = 2_000;
const PROMOTED_SQL_RELATIVE_PATH = "frontend/sql/clear-street-trades/marts/eod_all_history.sql";
const PROMOTED_SQL_RUNTIME_PATHS = [
  path.join(process.cwd(), "sql", "clear-street-trades", "marts", "eod_all_history.sql"),
  path.join(process.cwd(), "frontend", "sql", "clear-street-trades", "marts", "eod_all_history.sql"),
];
const DBT_MODEL_PATH =
  "dbt/azure_postgres/models/positions_and_trades_v2/clear_street_eod_transactions/marts/cs_65_eod_all_history.sql";
const DBT_COMPILED_PATH =
  "dbt/azure_postgres/target/compiled/helioscta_platform/models/positions_and_trades_v2/clear_street_eod_transactions/marts/cs_65_eod_all_history.sql";

const BACKEND_NULL_CHECK_CRITERIA =
  "product_code_grouping/product_code_region are blank/null and at least one ICE/CME/BBG product code is blank/null";

const MODEL_COLUMNS = [
  "trade_date_from_sftp",
  "sftp_date",
  "sftp_upload_timestamp",
  "row_number_for_trades",
  "record_id",
  "firm",
  "organization",
  "account_number",
  "account_type",
  "currency_symbol",
  "rr",
  "trade_date",
  "buy_sell",
  "quantity",
  "exchange",
  "futures_code",
  "symbol",
  "contract_year_month",
  "prompt_day",
  "strike_price",
  "put_call",
  "security_description",
  "trade_price",
  "printable_price",
  "trade_type",
  "order_number",
  "security_type_code",
  "cusip",
  "comment_code",
  "give_in_out_code",
  "give_in_out_firm_num",
  "spread_code",
  "open_close_code",
  "trace_num_or_unique_identifier",
  "round_turn_half_turn_account",
  "executing_broker",
  "opposing_broker",
  "oppos_firm",
  "commission",
  "comm_act_type",
  "fee_amt_1",
  "fee_1_atype",
  "fee_amt_2",
  "fee_2_atype",
  "fee_amt_3",
  "fee_3_atype",
  "brokerage",
  "brkrage_atype",
  "give_io_charge",
  "give_io_atype",
  "other_charges",
  "other_atype",
  "wire_charge",
  "wire_chg_atype",
  "fee_type_6",
  "fee_type_6_atype",
  "date",
  "option_exp_date",
  "last_trd_date",
  "net_amount",
  "traded_exchg",
  "sub_exchange",
  "exchange_name",
  "exch_comm_cd",
  "multiplication_factor",
  "subaccount",
  "instr_type",
  "cash_settled",
  "instrument_description",
  "fee_amt_4",
  "fee_4_atype",
  "fee_amt_5",
  "fee_5_atype",
  "fee_amt_7",
  "fee_7_atype",
  "fee_amt_8",
  "fee_8_atype",
  "fee_amt_9",
  "fee_9_atype",
  "fee_amt_10",
  "fee_10_atype",
  "fee_amt_11",
  "fee_11_atype",
  "fee_amt_12",
  "fee_12_atype",
  "fee_amt_13",
  "fee_13_atype",
  "clearing_time_hhmmss",
  "settlement_price",
  "broker",
  "isin",
  "mic",
  "created_at",
  "updated_at",
  "account_name",
  "buy_sell_cleaned",
  "quantity_cleaned",
  "contract_yyyymm",
  "contract_day",
  "put_call_code",
  "strike_price_normalized",
  "product_code",
  "product_family",
  "market_name",
  "underlying_product_code",
  "rule_status",
  "rule_match_source",
  "ice_product_code",
  "cme_product_code",
  "bbg_product_code",
] as const;

const DERIVED_FIELDS = [
  "account_name",
  "buy_sell_cleaned",
  "quantity_cleaned",
  "contract_yyyymm",
  "contract_day",
  "put_call_code",
  "strike_price_normalized",
  "product_code",
  "product_family",
  "market_name",
  "underlying_product_code",
  "rule_status",
  "rule_match_source",
  "ice_product_code",
  "cme_product_code",
  "bbg_product_code",
] as const;

const ROUTE_CONFIG = {
  route: "/api/dev/clear-street-trades",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "local-dev-only, no-store",
  owner: "frontend",
  purpose: "DEV-only Clear Street trades review using promoted dbt SQL and backend null-check criteria",
  p95TargetMs: 3_000,
  freshnessSource: "dbt cs_65_eod_all_history sftp_upload_timestamp",
} as const;

type ModelColumn = (typeof MODEL_COLUMNS)[number];
type NormalizedCell = string | number | boolean | null;
type ReviewStatus = "matched" | "vendor_warning" | "needs_review";

interface DbtTradeRow extends Record<string, unknown> {
  __filtered_count?: string | number | null;
  sftp_date?: string | Date | null;
  sftp_upload_timestamp?: string | Date | null;
}

interface SignatureSummary {
  signatureKey: string;
  sourceProduct: string | null;
  exchangeCodeInput: string | null;
  exchangeNameInput: string | null;
  putCall: string | null;
  securityType: string | null;
  productCode: string | null;
  productGroup: string | null;
  productRegion: string | null;
  status: ReviewStatus;
  reviewReason: string;
  firstSeenDate: string | null;
  lastSeenDate: string | null;
  latestRowCount: number;
  priorRowCount: number;
  historyRowCount: number;
  latestNetQuantity: number;
  historyNetQuantity: number;
  matchedRowCount: number;
  vendorWarningRowCount: number;
  needsReviewRowCount: number;
  latestMatchedRowCount: number;
  latestVendorWarningRowCount: number;
  latestNeedsReviewRowCount: number;
  accounts: string[];
  sampleRows: Array<Record<ModelColumn, NormalizedCell>>;
}

interface SignatureSummaryRow extends Record<string, unknown> {
  latest_sftp_date?: string | Date | null;
  latest_upload_at?: string | Date | null;
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

let cachedPromotedSql: string | null = null;

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, MIN_LIMIT), MAX_LIMIT);
}

function parseSearch(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 120) : null;
}

function normalizeValue(value: unknown): NormalizedCell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}

function isoOrText(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function dateOnly(value: unknown): string | null {
  const text = isoOrText(value);
  return text ? text.slice(0, 10) : null;
}

function numberValue(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function intValue(value: unknown): number {
  return Math.trunc(numberValue(value));
}

function textValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function sanitizeOptionExpDate(value: unknown): NormalizedCell {
  const normalized = normalizeValue(value);
  if (typeof normalized !== "string") return normalized;
  const trimmed = normalized.trim();
  if (!trimmed || trimmed < "0001-01-01") return null;
  return normalized;
}

async function loadPromotedAllHistorySql(): Promise<string> {
  if (cachedPromotedSql) return cachedPromotedSql;

  let content: string | null = null;
  for (const candidatePath of PROMOTED_SQL_RUNTIME_PATHS) {
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
      `Unable to read ${PROMOTED_SQL_RELATIVE_PATH}. Run dbt/azure_postgres/scripts/promote_positions_trades_sql.py.`,
    );
  }

  const sql = content.trim().replace(/;\s*$/, "");
  if (!sql.toLowerCase().includes("rule_status") || !sql.includes("__dbt__cte__")) {
    throw new Error(`${PROMOTED_SQL_RELATIVE_PATH} is not a compiled dbt Clear Street mart.`);
  }

  cachedPromotedSql = sql;
  return sql;
}

function blankSql(expression: string): string {
  return `(${expression} IS NULL OR btrim(${expression}::text) = '')`;
}

function normalizedSql(expression: string): string {
  return `upper(regexp_replace(coalesce(${expression}::text, ''), '[[:space:]]+', ' ', 'g'))`;
}

function backendNullCheckSql(prefix = ""): string {
  return `(
    ${blankSql(`${prefix}product_family`)}
    AND ${blankSql(`${prefix}market_name`)}
    AND (
      ${blankSql(`${prefix}ice_product_code`)}
      OR ${blankSql(`${prefix}cme_product_code`)}
      OR ${blankSql(`${prefix}bbg_product_code`)}
    )
  )`;
}

function modelledCtes(promotedSql: string): string {
  const nullCheck = backendNullCheckSql();

  return `
    modelled_clear_street_trades AS (
      ${promotedSql}
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
        nullif(btrim(modelled_clear_street_trades.exchange_name::text), '') AS exchange_name_input,
        coalesce(
          nullif(btrim(modelled_clear_street_trades.put_call_code::text), ''),
          nullif(btrim(modelled_clear_street_trades.put_call::text), '')
        ) AS put_call_input,
        coalesce(
          nullif(btrim(modelled_clear_street_trades.security_type_code::text), ''),
          nullif(btrim(modelled_clear_street_trades.instr_type::text), '')
        ) AS security_type_input,
        array_to_string(
          ARRAY[
            ${normalizedSql("coalesce(modelled_clear_street_trades.security_description, modelled_clear_street_trades.instrument_description, modelled_clear_street_trades.symbol)")},
            ${normalizedSql("modelled_clear_street_trades.futures_code")},
            ${normalizedSql("modelled_clear_street_trades.exch_comm_cd")},
            ${normalizedSql("modelled_clear_street_trades.exchange_name")},
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
        coalesce(
          nullif(btrim(modelled_clear_street_trades.account_name::text), ''),
          nullif(btrim(modelled_clear_street_trades.give_in_out_firm_num::text), '')
        ) AS account_display,
        case
          when ${nullCheck} then 'needs_review'
          when ${blankSql("modelled_clear_street_trades.product_code")}
            or (
              not ${blankSql("modelled_clear_street_trades.product_code")}
              and ${blankSql("modelled_clear_street_trades.ice_product_code")}
              and ${blankSql("modelled_clear_street_trades.cme_product_code")}
              and ${blankSql("modelled_clear_street_trades.bbg_product_code")}
            )
          then 'vendor_warning'
          else 'matched'
        end AS review_status,
        case
          when ${nullCheck}
          then 'Backend null check: ${BACKEND_NULL_CHECK_CRITERIA}.'
          when ${blankSql("modelled_clear_street_trades.product_code")}
          then 'dbt did not resolve product_code.'
          when
            not ${blankSql("modelled_clear_street_trades.product_code")}
            and ${blankSql("modelled_clear_street_trades.ice_product_code")}
            and ${blankSql("modelled_clear_street_trades.cme_product_code")}
            and ${blankSql("modelled_clear_street_trades.bbg_product_code")}
          then 'dbt resolved product_code, but no vendor export code was generated.'
          else 'Backend null check passed.'
        end AS review_reason,
        case
          when ${nullCheck} then 0
          when ${blankSql("modelled_clear_street_trades.product_code")}
            or (
              not ${blankSql("modelled_clear_street_trades.product_code")}
              and ${blankSql("modelled_clear_street_trades.ice_product_code")}
              and ${blankSql("modelled_clear_street_trades.cme_product_code")}
              and ${blankSql("modelled_clear_street_trades.bbg_product_code")}
            )
          then 1
          else 2
        end AS review_status_rank
      FROM modelled_clear_street_trades
    ),
    latest_upload AS (
      SELECT
        enriched.sftp_date,
        enriched.sftp_upload_timestamp
      FROM enriched
      WHERE enriched.sftp_date IS NOT NULL
      GROUP BY enriched.sftp_date, enriched.sftp_upload_timestamp
      ORDER BY enriched.sftp_date DESC NULLS LAST, enriched.sftp_upload_timestamp DESC NULLS LAST
      LIMIT 1
    ),
    latest_rows AS (
      SELECT enriched.*
      FROM enriched
      INNER JOIN latest_upload
        ON latest_upload.sftp_date = enriched.sftp_date
       AND latest_upload.sftp_upload_timestamp = enriched.sftp_upload_timestamp
    )
  `;
}

function rawRowsSearchClause(search: string | null): string {
  if (!search) return "";
  const predicates = MODEL_COLUMNS.map(
    (column) => `coalesce(latest_rows.${column}::text, '') ILIKE '%' || $2::text || '%'`,
  );
  return `WHERE ${predicates.join("\n      OR ")}`;
}

function buildLatestRowsSql(promotedSql: string, search: string | null): string {
  return `
    WITH
    ${modelledCtes(promotedSql)}
    SELECT
      latest_rows.*,
      count(*) OVER ()::int AS __filtered_count
    FROM latest_rows
    ${rawRowsSearchClause(search)}
    ORDER BY latest_rows.row_number_for_trades NULLS LAST
    LIMIT $1::integer;
  `;
}

function buildSignatureSummarySql(promotedSql: string): string {
  return `
    WITH
    ${modelledCtes(promotedSql)},
    latest_signature_keys AS (
      SELECT DISTINCT latest_rows.signature_key
      FROM latest_rows
    ),
    matching_history AS (
      SELECT
        enriched.*,
        (
          enriched.sftp_date = latest_upload.sftp_date
          AND enriched.sftp_upload_timestamp = latest_upload.sftp_upload_timestamp
        ) AS is_latest
      FROM enriched
      INNER JOIN latest_signature_keys
        ON latest_signature_keys.signature_key = enriched.signature_key
      CROSS JOIN latest_upload
    )
    SELECT
      (SELECT latest_upload.sftp_date::text FROM latest_upload) AS latest_sftp_date,
      (SELECT latest_upload.sftp_upload_timestamp::text FROM latest_upload) AS latest_upload_at,
      matching_history.signature_key,
      matching_history.source_product,
      matching_history.exchange_code_input,
      matching_history.exchange_name_input,
      matching_history.put_call_input AS put_call,
      matching_history.security_type_input AS security_type,
      matching_history.product_code,
      matching_history.product_family,
      matching_history.market_name,
      min(matching_history.review_status_rank)::int AS status_rank,
      (array_agg(matching_history.review_reason ORDER BY matching_history.review_status_rank))[1] AS review_reason,
      min(matching_history.sftp_date)::text AS first_seen_date,
      max(matching_history.sftp_date)::text AS last_seen_date,
      count(*) FILTER (WHERE matching_history.is_latest)::int AS latest_row_count,
      count(*) FILTER (WHERE NOT matching_history.is_latest)::int AS prior_row_count,
      count(*)::int AS history_row_count,
      coalesce(sum(matching_history.signed_quantity) FILTER (WHERE matching_history.is_latest), 0)::float8 AS latest_net_quantity,
      coalesce(sum(matching_history.signed_quantity), 0)::float8 AS history_net_quantity,
      count(*) FILTER (WHERE matching_history.review_status = 'matched')::int AS matched_row_count,
      count(*) FILTER (WHERE matching_history.review_status = 'vendor_warning')::int AS vendor_warning_row_count,
      count(*) FILTER (WHERE matching_history.review_status = 'needs_review')::int AS needs_review_row_count,
      count(*) FILTER (
        WHERE matching_history.is_latest AND matching_history.review_status = 'matched'
      )::int AS latest_matched_row_count,
      count(*) FILTER (
        WHERE matching_history.is_latest AND matching_history.review_status = 'vendor_warning'
      )::int AS latest_vendor_warning_row_count,
      count(*) FILTER (
        WHERE matching_history.is_latest AND matching_history.review_status = 'needs_review'
      )::int AS latest_needs_review_row_count,
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
      history_row_count DESC;
  `;
}

function statusFromRank(rank: unknown): ReviewStatus {
  const normalized = intValue(rank);
  if (normalized <= 0) return "needs_review";
  if (normalized === 1) return "vendor_warning";
  return "matched";
}

function mapRawRow(row: DbtTradeRow): Record<ModelColumn, NormalizedCell> {
  return Object.fromEntries(
    MODEL_COLUMNS.map((column) => {
      if (column === "option_exp_date") {
        return [column, sanitizeOptionExpDate(row[column])];
      }
      return [column, normalizeValue(row[column])];
    }),
  ) as Record<ModelColumn, NormalizedCell>;
}

function mapSignatureSummary(row: SignatureSummaryRow): SignatureSummary {
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

function summarizeLatest(signatures: SignatureSummary[]) {
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

function summarizeHistory(signatures: SignatureSummary[]) {
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

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  if (!isLocalOnlyFeatureEnabled()) {
    return {
      status: 404,
      payload: {
        error: "Clear Street trades review is local-only.",
      },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const search = parseSearch(searchParams.get("search"));
  const promotedSql = await loadPromotedAllHistorySql();
  const [rawRows, signatureRows] = await Promise.all([
    query<DbtTradeRow>(buildLatestRowsSql(promotedSql, search), search ? [limit, search] : [limit]),
    query<SignatureSummaryRow>(buildSignatureSummarySql(promotedSql)),
  ]);

  const latestSignatures = signatureRows.map(mapSignatureSummary);
  const reviewSignatures = latestSignatures.filter((signature) => signature.status !== "matched");
  const firstSignatureRow = signatureRows[0] ?? null;
  const latestSftpDate = dateOnly(firstSignatureRow?.latest_sftp_date);
  const latestUploadAt = isoOrText(firstSignatureRow?.latest_upload_at);
  const rows = rawRows.map(mapRawRow);
  const rowCount = intValue(rawRows[0]?.__filtered_count);

  return {
    payload: {
      source: "dbt:positions_and_trades_v2.clear_street_eod_transactions.cs_65_eod_all_history",
      ruleEngine: "dbt cs_65_eod_all_history",
      rulesSource: DBT_MODEL_PATH,
      promotedSql: PROMOTED_SQL_RELATIVE_PATH,
      compiledSql: DBT_COMPILED_PATH,
      nullCheckCriteria: BACKEND_NULL_CHECK_CRITERIA,
      latestSftpDate,
      latestUploadAt,
      requestedLimit: limit,
      search,
      rowCount,
      returnedRowCount: rows.length,
      latestSummary: summarizeLatest(latestSignatures),
      historySummary: summarizeHistory(latestSignatures),
      latestSignatures,
      reviewSignatures,
      historySignatures: latestSignatures,
      columns: MODEL_COLUMNS,
      rows,
      derivedFields: DERIVED_FIELDS,
      sourceRowCap: null,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: summarizeLatest(latestSignatures).rowCount,
    dataAsOf: latestUploadAt,
  };
});

export function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
