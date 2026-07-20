export interface AvailableDate {
  navDate: string;
  fundCount: number;
  rowCount: number;
  latestUploadAt: string | null;
}

export interface NavPositionsSummary {
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
}

export interface ProductSummaryRow {
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

export interface NavPositionDebugRow {
  fundCode: string;
  navDate: string;
  sftpUploadTimestamp: string | null;
  accountGroup: string | null;
  account: string | null;
  sourceFileName: string;
  sourceFileRowNumber: number;
  product: string | null;
  type: string | null;
  monthYear: string | null;
  exchangeName: string | null;
  clientSymbol: string | null;
  quantity1: number | null;
  costInBaseCurrency: number | null;
  marketValueInBaseCurrency: number | null;
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

export interface NavPositionsPayload {
  source: string;
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
  };
  summary: NavPositionsSummary;
  productSummary: ProductSummaryRow[];
  metadata: {
    funds: string[];
    accountGroups: string[];
    products: string[];
    aggregationGrain: string[];
    productSummaryLimit: number;
    dbtModel: string;
    promotedSql: string;
    compiledSql: string;
    units: {
      valuation: string;
      quantity: string;
    };
  };
}

export interface NavPositionsDebugPayload {
  source: string;
  selectedDate: string | null;
  requestedDate: string | null;
  asOf: string | null;
  latestUploadAt: string | null;
  filters: {
    fund: string;
    accountGroup: string;
    productSearch: string;
  };
  summary: {
    rowCount: number;
    returnedRowCount: number;
    limit: number;
  };
  rows: NavPositionDebugRow[];
  metadata: {
    dbtModel: string;
    promotedSql: string;
    compiledSql: string;
    drilldown?: unknown;
  };
}
