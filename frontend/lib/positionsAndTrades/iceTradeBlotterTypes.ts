export interface IceTradeBlotterAvailableDate {
  tradeDate: string;
  rowCount: number;
  distinctDealCount: number;
  latestReportDate: string | null;
  latestLoadedAt: string | null;
  latestUpdatedAt: string | null;
}

export interface IceTradeBlotterAppliedFilters {
  sides: string[];
  traders: string[];
  clearingAccounts: string[];
  customerAccounts: string[];
  clearingFirms: string[];
  products: string[];
  hubs: string[];
  ccs: string[];
  contracts: string[];
  options: string[];
  dealSections: string[];
  sources: string[];
  userIds: string[];
  search: string;
}

export interface IceTradeBlotterSummary {
  rowCount: number;
  distinctDealCount: number;
  productCount: number;
  hubCount: number;
  contractCount: number;
  traderCount: number;
  accountCount: number;
  totalLots: number | null;
  netQuantity: number | null;
  grossQuantity: number | null;
  minTradeDate: string | null;
  maxTradeDate: string | null;
  latestReportDate: string | null;
  latestLoadedAt: string | null;
  latestUpdatedAt: string | null;
}

export interface IceTradeBlotterAggregateRow {
  product: string | null;
  hub: string | null;
  contract: string | null;
  beginDate: string | null;
  endDate: string | null;
  option: string | null;
  strike: number | null;
  strike2: number | null;
  cc: string | null;
  strip: string | null;
  dealSection: string | null;
  sides: string | null;
  traders: string | null;
  clearingAccounts: string | null;
  customerAccounts: string | null;
  rowCount: number;
  distinctDealCount: number;
  totalLots: number | null;
  netLots: number | null;
  netQuantity: number | null;
  grossQuantity: number | null;
  avgPrice: number | null;
  latestTradeTime: string | null;
  latestUpdatedAt: string | null;
}

export interface IceTradeBlotterPayload {
  source: string;
  selectedDate: string | null;
  latestDate: string | null;
  requestedDate: string | null;
  asOf: string | null;
  latestLoadedAt: string | null;
  latestReportDate: string | null;
  availableDates: IceTradeBlotterAvailableDate[];
  filters: IceTradeBlotterAppliedFilters;
  summary: IceTradeBlotterSummary;
  productSummary: IceTradeBlotterAggregateRow[];
  metadata: {
    sides: string[];
    traders: string[];
    clearingAccounts: string[];
    customerAccounts: string[];
    clearingFirms: string[];
    products: string[];
    hubs: string[];
    ccs: string[];
    contracts: string[];
    options: string[];
    dealSections: string[];
    sources: string[];
    userIds: string[];
    aggregationGrain: string[];
    productSummaryLimit: number;
    sourceTable: string;
    fileManifestTable: string;
    units: {
      quantity: string;
      price: string;
    };
  };
}

export interface IceTradeBlotterDrilldownFilter {
  product: string | null;
  hub: string | null;
  contract: string | null;
  beginDate: string | null;
  endDate: string | null;
  option: string | null;
  strike: number | null;
  strike2: number | null;
  cc: string | null;
  strip: string | null;
  dealSection: string | null;
  label: string | null;
}

export interface IceTradeBlotterRawRow {
  tradeDate: string;
  tradeTime: string | null;
  reportDate: string | null;
  dealId: string | null;
  legId: string | null;
  origId: string | null;
  linkId: string | null;
  side: string | null;
  product: string | null;
  hub: string | null;
  contract: string | null;
  beginDate: string | null;
  endDate: string | null;
  clearingAcct: string | null;
  custAcct: string | null;
  clearingFirm: string | null;
  brokerName: string | null;
  price: number | null;
  priceUnits: string | null;
  option: string | null;
  strike: number | null;
  strike2: number | null;
  style: string | null;
  lots: number | null;
  totalQuantity: number | null;
  qtyUnits: string | null;
  trader: string | null;
  counterparty: string | null;
  memo: string | null;
  source: string | null;
  userId: string | null;
  dealSection: string | null;
  fileHash: string | null;
  sourceRowNumber: number | null;
  sourceRowHash: string | null;
  updatedAt: string | null;
}

export interface IceTradeBlotterDebugPayload {
  source: string;
  selectedDate: string | null;
  latestDate: string | null;
  requestedDate: string | null;
  asOf: string | null;
  latestLoadedAt: string | null;
  filters: IceTradeBlotterAppliedFilters;
  summary: {
    rowCount: number;
    returnedRowCount: number;
    limit: number;
  };
  rows: IceTradeBlotterRawRow[];
  metadata: {
    drilldown?: IceTradeBlotterDrilldownFilter | null;
    sourceTable: string;
    fileManifestTable: string;
  };
}
