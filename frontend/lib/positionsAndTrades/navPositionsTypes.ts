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
  navDate: string;
  tradeDate: string | null;
  productGroup: string | null;
  productRegion: string | null;
  productCode: string | null;
  contractYyyymm: string | null;
  contractDay: number | null;
  account: string | null;
  sourceAccountKey: string | null;
  accountCode: string | null;
  accountName: string | null;
  accountLookupStatus: string | null;
  sourceExchangeName: string | null;
  exchangeRouteCode: string | null;
  routeFamily: string | null;
  isProductRecord: boolean | null;
  longShort: string | null;
  quantity1: number | null;
  multiplierAndTickValue: number | null;
  tradePrice: number | null;
  marketSettlementPrice: number | null;
  productNorm: string | null;
  normalizationStatus: string | null;
  rulePriority: number | null;
  ruleMatchType: string | null;
  rulePattern: string | null;
}

export interface NavPositionsProductFilterOption {
  productGroup: string | null;
  productRegion: string | null;
  productCode: string | null;
  instrumentType: string | null;
  putCall: string | null;
}

export interface NavPositionsAppliedFilters {
  fund: string;
  accountGroup: string;
  productSearch: string;
  productGroups: string[];
  productRegions: string[];
  productCodes: string[];
  instrumentType: string;
  putCall: string;
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
  filters: NavPositionsAppliedFilters;
  summary: NavPositionsSummary;
  productSummary: ProductSummaryRow[];
  metadata: {
    funds: string[];
    accountGroups: string[];
    products: string[];
    productGroups: string[];
    productRegions: string[];
    productCodes: string[];
    productFilterOptions: NavPositionsProductFilterOption[];
    aggregationGrain: string[];
    productSummaryLimit: number;
    contractId: string;
    contractDisplayName: string;
    artifactId: string;
    artifactDisplayName: string;
    dbtModelFamily: string;
    referenceSchema: string;
    referenceTables: string[];
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
  filters: NavPositionsAppliedFilters;
  summary: {
    rowCount: number;
    returnedRowCount: number;
    limit: number;
  };
  rows: NavPositionDebugRow[];
  metadata: {
    contractId: string;
    contractDisplayName: string;
    artifactId: string;
    artifactDisplayName: string;
    dbtModelFamily: string;
    referenceSchema: string;
    referenceTables: string[];
    dbtModel: string;
    promotedSql: string;
    compiledSql: string;
    drilldown?: unknown;
  };
}
