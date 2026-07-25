import { query } from "@/lib/server/db";
import {
  loadPromotedAllHistorySql,
  selectedClearStreetTradesCte,
} from "@/lib/server/clearStreetTradesSql";
import {
  getCachedRouteValue,
  routeCacheHeaders,
} from "@/lib/server/routeCache";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_TTL_SECONDS = 15 * 60;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;
const STALE_IF_ERROR_MS = 30 * 60 * 1000;
const CACHE_HEADER = `private, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS}`;
const NO_STORE_HEADER = "no-store";
const TITAN_EXPORT_WHERE = "source_rows.give_in_out_firm_num in ('ADU', '905')";

const RAW_EXPORT_COLUMNS: Array<{ source: string; label: string }> = [
  { source: "record_id", label: "RECORD_ID" },
  { source: "firm", label: "FIRM" },
  { source: "organization", label: "ORGANIZATION" },
  { source: "account_number", label: "ACCOUNT_NUMBER" },
  { source: "account_type", label: "ACCOUNT_TYPE" },
  { source: "currency_symbol", label: "CURRENCY_SYMBOL" },
  { source: "rr", label: "RR" },
  { source: "trade_date", label: "TRADE_DATE" },
  { source: "buy_sell", label: "BUY_SELL" },
  { source: "quantity", label: "QUANTITY" },
  { source: "exchange", label: "EXCHANGE" },
  { source: "futures_code", label: "FUTURES_CODE" },
  { source: "symbol", label: "SYMBOL" },
  { source: "contract_year_month", label: "CONTRACT_YEAR_MONTH" },
  { source: "prompt_day", label: "PROMPT_DAY" },
  { source: "strike_price", label: "STRIKE_PRICE" },
  { source: "put_call", label: "PUT_CALL" },
  { source: "security_description", label: "SECURITY_DESCRIPTION" },
  { source: "trade_price", label: "TRADE_PRICE" },
  { source: "printable_price", label: "PRINTABLE_PRICE" },
  { source: "trade_type", label: "TRADE_TYPE" },
  { source: "order_number", label: "ORDER_NUMBER" },
  { source: "security_type_code", label: "SECURITY_TYPE_CODE" },
  { source: "cusip", label: "CUSIP" },
  { source: "comment_code", label: "COMMENT_CODE" },
  { source: "give_in_out_code", label: "GIVE_IN_OUT_CODE" },
  { source: "give_in_out_firm_num", label: "GIVE_IN_OUT_FIRM_NUM" },
  { source: "spread_code", label: "SPREAD_CODE" },
  { source: "open_close_code", label: "OPEN_CLOSE_CODE" },
  { source: "trace_num_or_unique_identifier", label: "TRACE_NUM_OR_UNIQUE_IDENTIFIER" },
  { source: "round_turn_half_turn_account", label: "ROUND_TURN_HALF_TURN_ACCOUNT" },
  { source: "executing_broker", label: "EXECUTING_BROKER" },
  { source: "opposing_broker", label: "OPPOSING_BROKER" },
  { source: "oppos_firm", label: "OPPOS_FIRM" },
  { source: "commission", label: "COMMISSION" },
  { source: "comm_act_type", label: "COMM_ACT_TYPE" },
  { source: "fee_amt_1", label: "FEE_AMT_1" },
  { source: "fee_1_atype", label: "FEE_1_ATYPE" },
  { source: "fee_amt_2", label: "FEE_AMT_2" },
  { source: "fee_2_atype", label: "FEE_2_ATYPE" },
  { source: "fee_amt_3", label: "FEE_AMT_3" },
  { source: "fee_3_atype", label: "FEE_3_ATYPE" },
  { source: "brokerage", label: "BROKERAGE" },
  { source: "brkrage_atype", label: "BRKRAGE_ATYPE" },
  { source: "give_io_charge", label: "GIVE_IO_CHARGE" },
  { source: "give_io_atype", label: "GIVE_IO_ATYPE" },
  { source: "other_charges", label: "OTHER_CHARGES" },
  { source: "other_atype", label: "OTHER_ATYPE" },
  { source: "wire_charge", label: "WIRE_CHARGE" },
  { source: "wire_chg_atype", label: "WIRE_CHG_ATYPE" },
  { source: "fee_type_6", label: "FEE_TYPE_6" },
  { source: "fee_type_6_atype", label: "FEE_TYPE_6_ATYPE" },
  { source: "date", label: "DATE" },
  { source: "option_exp_date", label: "OPTION_EXP_DATE" },
  { source: "last_trd_date", label: "LAST_TRD_DATE" },
  { source: "net_amount", label: "NET_AMOUNT" },
  { source: "traded_exchg", label: "TRADED_EXCHG" },
  { source: "sub_exchange", label: "SUB_EXCHANGE" },
  { source: "exchange_name", label: "EXCHANGE_NAME" },
  { source: "exch_comm_cd", label: "EXCH_COMM_CD" },
  { source: "multiplication_factor", label: "MULTIPLICATION_FACTOR" },
  { source: "subaccount", label: "SUBACCOUNT" },
  { source: "instr_type", label: "INSTR_TYPE" },
  { source: "cash_settled", label: "CASH_SETTLED" },
  { source: "instrument_description", label: "INSTRUMENT_DESCRIPTION" },
  { source: "fee_amt_4", label: "FEE_AMT_4" },
  { source: "fee_4_atype", label: "FEE_4_ATYPE" },
  { source: "fee_amt_5", label: "FEE_AMT_5" },
  { source: "fee_5_atype", label: "FEE_5_ATYPE" },
  { source: "fee_amt_7", label: "FEE_AMT_7" },
  { source: "fee_7_atype", label: "FEE_7_ATYPE" },
  { source: "fee_amt_8", label: "FEE_AMT_8" },
  { source: "fee_8_atype", label: "FEE_8_ATYPE" },
  { source: "fee_amt_9", label: "FEE_AMT_9" },
  { source: "fee_9_atype", label: "FEE_9_ATYPE" },
  { source: "fee_amt_10", label: "FEE_AMT_10" },
  { source: "fee_10_atype", label: "FEE_10_ATYPE" },
  { source: "fee_amt_11", label: "FEE_AMT_11" },
  { source: "fee_11_atype", label: "FEE_11_ATYPE" },
  { source: "fee_amt_12", label: "FEE_AMT_12" },
  { source: "fee_12_atype", label: "FEE_12_ATYPE" },
  { source: "fee_amt_13", label: "FEE_AMT_13" },
  { source: "fee_13_atype", label: "FEE_13_ATYPE" },
  { source: "clearing_time_hhmmss", label: "CLEARING_TIME_HHMMSS" },
  { source: "settlement_price", label: "SETTLEMENT_PRICE" },
  { source: "broker", label: "BROKER" },
  { source: "isin", label: "ISIN" },
  { source: "mic", label: "MIC" },
];

const TITAN_COLUMNS = [
  "trade_status",
  "ice_product_code",
  "cme_product_code",
  "bbg_product_code",
  "product_code_grouping",
] as const;

type CsvRow = Record<string, unknown>;

interface CachedCsv {
  body: string;
  filename: string;
  rowCount: number;
}

function parseBusinessDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function yyyymmdd(value: string): string {
  return value.replaceAll("-", "");
}

function fileNameForDate(value: string): string {
  return `helios_transactions_v3_${yyyymmdd(value)}_filtered.csv`;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvLine(values: unknown[]): string {
  return values.map(csvEscape).join(",");
}

function sourceSelectList(): string {
  return RAW_EXPORT_COLUMNS.map(
    (column) => `source_rows.${column.source} AS "${column.label}"`,
  ).join(",\n      ");
}

function clearStreetSelectedArgs(businessDate: string): unknown[] {
  return [businessDate, [], [], [], [], [], null];
}

async function loadRows(businessDate: string): Promise<CsvRow[]> {
  const promotedArtifact = await loadPromotedAllHistorySql();
  return query<CsvRow>(
    `
    ${selectedClearStreetTradesCte(promotedArtifact.sql)}
    SELECT
      ${sourceSelectList()},
      'New'::text AS trade_status,
      source_rows.ice_product_code,
      CASE
        WHEN source_rows.route_family = 'ice' THEN NULL
        ELSE source_rows.cme_product_code
      END AS cme_product_code,
      CASE
        WHEN source_rows.route_family = 'ice' THEN NULL
        ELSE source_rows.bbg_product_code
      END AS bbg_product_code,
      source_rows.product_code_grouping
    FROM source_trades AS source_rows
    WHERE ${TITAN_EXPORT_WHERE}
    ORDER BY
      source_rows.row_number_for_trades NULLS LAST,
      source_rows.record_id
    `,
    clearStreetSelectedArgs(businessDate),
  );
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const profile = url.searchParams.get("profile") ?? "titan";
  const businessDate = parseBusinessDate(
    url.searchParams.get("businessDate") ?? url.searchParams.get("date"),
  );

  if (profile !== "titan") {
    return new Response("Only profile=titan is supported.", { status: 400 });
  }
  if (!businessDate) {
    return new Response("Missing or invalid businessDate. Use YYYY-MM-DD.", { status: 400 });
  }

  const forceRefresh = url.searchParams.has("refresh");
  const { value, cacheStatus } = await getCachedRouteValue<CachedCsv>({
    namespace: "/api/back-office/trade-pipeline/preview",
    key: `profile=${profile}&businessDate=${businessDate}`,
    ttlMs: CACHE_TTL_MS,
    staleIfErrorMs: STALE_IF_ERROR_MS,
    forceRefresh,
    load: async () => {
      const rows = await loadRows(businessDate);
      const headers = [...RAW_EXPORT_COLUMNS.map((column) => column.label), ...TITAN_COLUMNS];
      const csv = [
        csvLine(headers),
        ...rows.map((row) => csvLine(headers.map((header) => row[header]))),
      ].join("\r\n");
      return {
        body: `${csv}\r\n`,
        filename: fileNameForDate(businessDate),
        rowCount: rows.length,
      };
    },
  });

  return new Response(value.body, {
    headers: {
      "Cache-Control": forceRefresh ? NO_STORE_HEADER : CACHE_HEADER,
      "Content-Disposition": `attachment; filename="${value.filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Helios-Row-Count": String(value.rowCount),
      ...routeCacheHeaders(cacheStatus),
    },
  });
}
