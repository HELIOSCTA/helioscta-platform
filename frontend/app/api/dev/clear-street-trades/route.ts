import { normalizePositionProduct } from "@/lib/positionsAndTrades";
import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "no-store";
const DEFAULT_LIMIT = 500;
const MIN_LIMIT = 25;
const MAX_LIMIT = 2_000;
const SOURCE_ROW_CAP = 10_000;
const RULE_ENGINE_PATH = "frontend/lib/positionsAndTrades/productRules.ts";
const RULES_SOURCE_PATH = "frontend/lib/positionsAndTrades/rules/*.json";

const RAW_COLUMNS = [
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
  "clearing_time_hhmmss",
  "settlement_price",
  "broker",
  "isin",
  "mic",
] as const;

const DERIVED_FIELDS = [
  "sftp_date",
  "sftp_upload_timestamp",
  "trade_status",
  "product_code_grouping",
  "product_code_region",
  "product_code_underlying",
  "ice_product_code",
  "cme_product_code",
  "bbg_product_code",
] as const;

const EXPORT_COLUMNS = [...RAW_COLUMNS, ...DERIVED_FIELDS] as const;

const ROUTE_CONFIG = {
  route: "/api/dev/clear-street-trades",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "local-dev-only, no-store",
  owner: "frontend",
  purpose: "DEV-only Clear Street trades review using frontend JSON/TypeScript rules",
  p95TargetMs: 3_000,
  freshnessSource: "clear_street.eod_transactions sftp_upload_timestamp",
} as const;

type ExportColumn = (typeof EXPORT_COLUMNS)[number];
type NormalizedCell = string | number | boolean | null;

interface DbTradeRow extends Record<string, unknown> {
  __trade_date_from_sftp?: string | null;
  __sftp_upload_timestamp?: string | Date | null;
  __data_as_of?: string | Date | null;
}

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, MIN_LIMIT), MAX_LIMIT);
}

function parseSearch(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 120) : null;
}

function rawSelectColumns(): string {
  return RAW_COLUMNS.map((column) => `t.${column}`).join(",\n      ");
}

function buildRawTradesSql(): string {
  return `
    WITH latest_sftp_date AS (
      SELECT max(trade_date_from_sftp) AS trade_date_from_sftp
      FROM clear_street.eod_transactions
    )
    SELECT
      ${rawSelectColumns()},
      t.trade_date_from_sftp AS __trade_date_from_sftp,
      t.sftp_upload_timestamp AS __sftp_upload_timestamp,
      (max(t.sftp_upload_timestamp) OVER ())::text AS __data_as_of
    FROM clear_street.eod_transactions t
    INNER JOIN latest_sftp_date latest
      ON latest.trade_date_from_sftp = t.trade_date_from_sftp
    WHERE t.give_in_out_firm_num IN ('ADU', '905')
    ORDER BY
      t.trade_date_from_sftp DESC NULLS LAST,
      t.sftp_upload_timestamp DESC NULLS LAST,
      t.record_id NULLS LAST
    LIMIT $1::integer;
  `;
}

function normalizeValue(value: unknown): NormalizedCell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}

function nullIfBlank(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function firstNonBlank(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = nullIfBlank(value);
    if (normalized) return normalized;
  }
  return null;
}

function isoOrText(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function sftpDateFromTradeDate(value: unknown): string | null {
  const text = nullIfBlank(value);
  if (!text || !/^\d{8}$/.test(text)) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function sanitizeOptionExpDate(value: unknown): NormalizedCell {
  const normalized = normalizeValue(value);
  if (typeof normalized !== "string") return normalized;
  const trimmed = normalized.trim();
  if (!trimmed || trimmed < "0001-01-01") return null;
  return normalized;
}

function mapTradeRow(row: DbTradeRow): Record<ExportColumn, NormalizedCell> {
  const product = firstNonBlank(
    row.security_description,
    row.instrument_description,
    row.symbol,
  );
  const rule = normalizePositionProduct({
    source: "clearStreet",
    product,
    exchangeCode: firstNonBlank(row.futures_code, row.exch_comm_cd),
    exchangeName: nullIfBlank(row.exchange_name),
    contractYyyymm: normalizeValue(row.contract_year_month) as string | number | null,
    promptDay: normalizeValue(row.prompt_day) as string | number | null,
    callPut: nullIfBlank(row.put_call),
    type: firstNonBlank(row.security_type_code, row.instr_type),
    strikePrice: normalizeValue(row.strike_price) as string | number | null,
  });

  return Object.fromEntries(
    EXPORT_COLUMNS.map((column) => {
      if (column === "option_exp_date") {
        return [column, sanitizeOptionExpDate(row[column])];
      }
      if (column === "sftp_date") {
        return [column, sftpDateFromTradeDate(row.__trade_date_from_sftp)];
      }
      if (column === "sftp_upload_timestamp") {
        return [column, isoOrText(row.__sftp_upload_timestamp)];
      }
      if (column === "trade_status") return [column, "New"];
      if (column === "product_code_grouping") return [column, rule.ruleGroup];
      if (column === "product_code_region") return [column, rule.ruleRegion];
      if (column === "product_code_underlying") return [column, rule.productCodeUnderlying];
      if (column === "ice_product_code") return [column, rule.iceXlSymbol];
      if (column === "cme_product_code") return [column, rule.cmeExcelSymbol];
      if (column === "bbg_product_code") return [column, rule.bbgSymbol];
      return [column, normalizeValue(row[column])];
    }),
  ) as Record<ExportColumn, NormalizedCell>;
}

function rowMatchesSearch(row: Record<ExportColumn, NormalizedCell>, search: string | null): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle));
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
  const rawRows = await query<DbTradeRow>(buildRawTradesSql(), [SOURCE_ROW_CAP]);
  const outputRows = rawRows.map(mapTradeRow);
  const filteredRows = outputRows.filter((row) => rowMatchesSearch(row, search));
  const rows = filteredRows.slice(0, limit);
  const firstRawRow = rawRows[0] ?? null;
  const dataAsOf = isoOrText(firstRawRow?.__data_as_of ?? null);
  const rowCount = filteredRows.length;

  return {
    payload: {
      source: "clear_street.eod_transactions",
      ruleEngine: RULE_ENGINE_PATH,
      rulesSource: RULES_SOURCE_PATH,
      latestSftpDate: sftpDateFromTradeDate(firstRawRow?.__trade_date_from_sftp ?? null),
      latestUploadAt: dataAsOf,
      requestedLimit: limit,
      search,
      rowCount,
      returnedRowCount: rows.length,
      columns: EXPORT_COLUMNS,
      rows,
      derivedFields: DERIVED_FIELDS,
      sourceRowCap: SOURCE_ROW_CAP,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount,
    dataAsOf,
  };
});

export function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
