export const CLEAR_STREET_MODEL_COLUMNS = [
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
  "source_account_key",
  "account_code",
  "account_name",
  "account_lookup_status",
  "source_exchange_name",
  "exchange_route_code",
  "route_family",
  "is_product_record",
  "buy_sell_cleaned",
  "quantity_cleaned",
  "contract_yyyymm",
  "contract_day",
  "put_call_code",
  "strike_price_normalized",
  "product_code",
  "product_code_family",
  "product_code_grouping",
  "product_code_region",
  "product_code_underlying",
  "product_family",
  "market_name",
  "underlying_product_code",
  "rule_status",
  "rule_match_source",
  "ice_product_code",
  "cme_product_code",
  "bbg_product_code",
] as const;

export const CLEAR_STREET_DERIVED_FIELDS = [
  "source_account_key",
  "account_code",
  "account_name",
  "account_lookup_status",
  "source_exchange_name",
  "exchange_route_code",
  "route_family",
  "is_product_record",
  "buy_sell_cleaned",
  "quantity_cleaned",
  "contract_yyyymm",
  "contract_day",
  "put_call_code",
  "strike_price_normalized",
  "product_code",
  "product_code_family",
  "product_code_grouping",
  "product_code_region",
  "product_code_underlying",
  "product_family",
  "market_name",
  "underlying_product_code",
  "rule_status",
  "rule_match_source",
  "ice_product_code",
  "cme_product_code",
  "bbg_product_code",
] as const;

export type ClearStreetModelColumn = (typeof CLEAR_STREET_MODEL_COLUMNS)[number];
export type ClearStreetCellValue = string | number | boolean | null;
export type ClearStreetReviewStatus = "matched" | "vendor_warning" | "needs_review";

export interface ClearStreetTradesAvailableDate {
  sftpDate: string;
  rowCount: number;
  signatureCount: number;
  latestUploadAt: string | null;
  latestUpdatedAt: string | null;
}

export interface ClearStreetTradesAppliedFilters {
  accounts: string[];
  productCodes: string[];
  productFamilies: string[];
  marketNames: string[];
  statuses: ClearStreetReviewStatus[];
  search: string;
}

export interface ClearStreetTradesSummary {
  rowCount: number;
  signatureCount: number;
  productCount: number;
  contractCount: number;
  accountCount: number;
  totalQuantity: number | null;
  netQuantity: number | null;
  matchedRowCount: number;
  vendorWarningRowCount: number;
  needsReviewRowCount: number;
  minSftpDate: string | null;
  maxSftpDate: string | null;
  latestUploadAt: string | null;
  latestUpdatedAt: string | null;
}

export interface ClearStreetSignatureSummary {
  signatureKey: string;
  sourceProduct: string | null;
  exchangeCodeInput: string | null;
  exchangeNameInput: string | null;
  putCall: string | null;
  securityType: string | null;
  productCode: string | null;
  productGroup: string | null;
  productRegion: string | null;
  status: ClearStreetReviewStatus;
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
  sampleRows: Array<Record<ClearStreetModelColumn, ClearStreetCellValue>>;
}

export interface ClearStreetTradesProductSummaryRow {
  productCode: string | null;
  productFamily: string | null;
  marketName: string | null;
  underlyingProductCode: string | null;
  sourceProduct: string | null;
  exchangeCodeInput: string | null;
  contract: string | null;
  contractMonth: string | null;
  contractDay: string | null;
  putCall: string | null;
  strike: number | null;
  reviewStatus: ClearStreetReviewStatus;
  reviewReason: string | null;
  accounts: string | null;
  rowCount: number;
  signatureCount: number;
  totalQuantity: number | null;
  netQuantity: number | null;
  matchedRowCount: number;
  vendorWarningRowCount: number;
  needsReviewRowCount: number;
  avgTradePrice: number | null;
  latestUploadAt: string | null;
  latestUpdatedAt: string | null;
}

export interface ClearStreetTradesPayload {
  source: string;
  ruleEngine: string;
  rulesSource: string;
  promotedSql: string;
  compiledSql: string;
  nullCheckCriteria: string;
  selectedDate: string | null;
  latestDate: string | null;
  requestedDate: string | null;
  asOf: string | null;
  latestSftpDate: string | null;
  latestUploadAt: string | null;
  availableDates: ClearStreetTradesAvailableDate[];
  filters: ClearStreetTradesAppliedFilters;
  summary: ClearStreetTradesSummary;
  productSummary: ClearStreetTradesProductSummaryRow[];
  metadata: {
    contractId: string;
    contractDisplayName: string;
    artifactId: string;
    artifactDisplayName: string;
    dbtModelFamily: string;
    referenceSchema: string;
    referenceTables: string[];
    accounts: string[];
    productCodes: string[];
    productFamilies: string[];
    marketNames: string[];
    statuses: ClearStreetReviewStatus[];
    aggregationGrain: string[];
    productSummaryLimit: number;
    sourceTable: string;
    dbtModel: string;
    promotedSql: string;
    compiledSql: string;
    units: {
      quantity: string;
      price: string;
    };
  };
  latestSummary: {
    rowCount: number;
    signatureCount: number;
    matchedRowCount: number;
    vendorWarningRowCount: number;
    needsReviewRowCount: number;
    newSignatureCount: number;
    historicalSignatureCount: number;
  };
  historySummary: {
    rowCount: number;
    signatureCount: number;
    matchedRowCount: number;
    vendorWarningRowCount: number;
    needsReviewRowCount: number;
    historyRowCap: number | null;
    historyRowLimitReached: boolean;
  };
  latestSignatures: ClearStreetSignatureSummary[];
  reviewSignatures: ClearStreetSignatureSummary[];
  historySignatures: ClearStreetSignatureSummary[];
  columns: ClearStreetModelColumn[];
  rows: Array<Record<ClearStreetModelColumn, ClearStreetCellValue>>;
  derivedFields: ClearStreetModelColumn[];
  requestedLimit: number;
  search: string | null;
  rowCount: number;
  returnedRowCount: number;
}

export interface ClearStreetTradesDrilldownFilter {
  productCode: string | null;
  productFamily: string | null;
  marketName: string | null;
  sourceProduct: string | null;
  contract: string | null;
  contractMonth: string | null;
  contractDay: string | null;
  putCall: string | null;
  strike: number | null;
  reviewStatus: ClearStreetReviewStatus | null;
  label: string | null;
}

export interface ClearStreetTradesDebugPayload {
  source: string;
  selectedDate: string | null;
  latestDate: string | null;
  requestedDate: string | null;
  asOf: string | null;
  latestUploadAt: string | null;
  filters: ClearStreetTradesAppliedFilters;
  summary: {
    rowCount: number;
    returnedRowCount: number;
    limit: number;
  };
  rows: Array<Record<ClearStreetModelColumn, ClearStreetCellValue>>;
  columns: ClearStreetModelColumn[];
  derivedFields: ClearStreetModelColumn[];
  metadata: {
    drilldown?: ClearStreetTradesDrilldownFilter | null;
    contractId: string;
    contractDisplayName: string;
    artifactId: string;
    artifactDisplayName: string;
    dbtModelFamily: string;
    referenceSchema: string;
    referenceTables: string[];
    sourceTable: string;
    dbtModel: string;
    promotedSql: string;
    compiledSql: string;
  };
}
