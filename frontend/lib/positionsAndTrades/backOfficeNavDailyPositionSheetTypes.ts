export interface BackOfficeNavDailyPositionSheetAvailableDate {
  navDate: string;
  navDateLabel: string;
  rowCount: number;
  rowCountLabel: string;
  latestUploadAt: string | null;
  latestUploadLabel: string;
}

export interface BackOfficeNavDailyPositionSheetAccountColumn {
  key: string;
  label: string;
  productCodes: string[];
}

export interface BackOfficeNavDailyPositionSheetGasCell {
  quantity: number;
  gasLots: number | null;
}

export interface BackOfficeNavDailyPositionSheetGasRow {
  yyyymm: string;
  monthLabel: string;
  values: Record<string, Record<string, BackOfficeNavDailyPositionSheetGasCell>>;
  accountTotals: Record<string, number>;
  productTotals: Record<string, number>;
  total: number;
}

export interface BackOfficeNavDailyPositionSheetPowerCell {
  quantity: number;
  rawQuantity: number;
  multiplier: number | null;
}

export interface BackOfficeNavDailyPositionSheetPowerColumn {
  key: string;
  label: string;
  subLabel: string;
}

export interface BackOfficeNavDailyPositionSheetPowerFutureRow {
  productCode: string;
  productLabel: string;
  productRegion: string;
  regionLabel: string;
  unitLabel: string;
  values: Record<string, BackOfficeNavDailyPositionSheetPowerCell>;
  total: number;
}

export interface BackOfficeNavDailyPositionSheetPowerFuturesSection {
  columns: BackOfficeNavDailyPositionSheetPowerColumn[];
  rows: BackOfficeNavDailyPositionSheetPowerFutureRow[];
  totals: Record<string, number>;
  total: number;
  productCount: number;
  dateCount: number;
  unitLabel: string;
}

export type BackOfficeNavDailyPositionSheetGasOptionScope = "outright" | "other";

export interface BackOfficeNavDailyPositionSheetGasOptionScopeSummary {
  scope: BackOfficeNavDailyPositionSheetGasOptionScope;
  label: string;
  activeRows: number;
  monthCount: number;
  netQuantity: number;
}

export interface BackOfficeNavDailyPositionSheetOptionMonth {
  yyyymm: string;
  label: string;
  netQuantity: number;
  rowCount: number;
  productCodes?: string[];
  contractLabel?: string;
}

export interface BackOfficeNavDailyPositionSheetOptionAccount {
  account: string;
  quantity: number;
}

export interface BackOfficeNavDailyPositionSheetOptionRow {
  exchange: string;
  strike: number;
  putQuantity: number;
  callQuantity: number;
  netQuantity: number;
  putSettle: number | null;
  callSettle: number | null;
  putChange: number | null;
  callChange: number | null;
  settlePnl: number;
  topAccount: string | null;
  accounts: BackOfficeNavDailyPositionSheetOptionAccount[];
  productCodes?: string[];
  contractLabel?: string;
}

export interface BackOfficeNavDailyPositionSheetOptionSummary {
  activeRows: number;
  expiredHidden: number;
  selectedMonth: string | null;
  selectedMonthLabel: string;
  selectedMonthRowCount: number;
  putQuantity: number;
  callQuantity: number;
  settlePnl: number;
  detailLoaded: boolean;
}

export interface BackOfficeNavDailyPositionSheetMetric {
  label: string;
  value: string;
  status: "ok" | "watch" | "unavailable";
}

export interface BackOfficeNavDailyPositionSheetFilters {
  productRegions: string[];
}

export interface BackOfficeNavDailyPositionSheetPayload {
  source: "backoffice-nav-daily-position-sheet";
  generatedAt: string;
  positionView: "gas" | "power";
  gasOptionScope: BackOfficeNavDailyPositionSheetGasOptionScope;
  selectedDate: string | null;
  selectedDateLabel: string;
  latestDate: string | null;
  latestDateLabel: string;
  reportDate: string;
  reportDateLabel: string;
  navUpdatedAt: string | null;
  navUpdatedLabel: string;
  availableDates: BackOfficeNavDailyPositionSheetAvailableDate[];
  filters: BackOfficeNavDailyPositionSheetFilters;
  metadata: {
    productRegions: string[];
  };
  metrics: BackOfficeNavDailyPositionSheetMetric[];
  gasOptionScopes: BackOfficeNavDailyPositionSheetGasOptionScopeSummary[];
  gasFutures: {
    productCodes: string[];
    accountColumns: BackOfficeNavDailyPositionSheetAccountColumn[];
    rows: BackOfficeNavDailyPositionSheetGasRow[];
    totalRow: Record<string, Record<string, BackOfficeNavDailyPositionSheetGasCell>>;
    accountTotals: Record<string, number>;
    productTotals: Record<string, number>;
    total: number;
    rowCount: number;
    excludedFutureRows: number;
  };
  powerFutures: {
    monthly: BackOfficeNavDailyPositionSheetPowerFuturesSection;
    daily: BackOfficeNavDailyPositionSheetPowerFuturesSection;
    rowCount: number;
  };
  powerOptionMonths: BackOfficeNavDailyPositionSheetOptionMonth[];
  powerOptionSummary: BackOfficeNavDailyPositionSheetOptionSummary;
  powerOptionRows: BackOfficeNavDailyPositionSheetOptionRow[];
  optionMonths: BackOfficeNavDailyPositionSheetOptionMonth[];
  optionSummary: BackOfficeNavDailyPositionSheetOptionSummary;
  optionRows: BackOfficeNavDailyPositionSheetOptionRow[];
  sourceChecks: string;
}

export interface BackOfficeNavDailyPositionSheetOptionDetailPayload {
  source: "backoffice-nav-daily-position-sheet-option-detail";
  generatedAt: string;
  selectedDate: string | null;
  positionView: "gas" | "power";
  gasOptionScope: BackOfficeNavDailyPositionSheetGasOptionScope;
  selectedMonth: string | null;
  selectedMonthLabel: string;
  summary: BackOfficeNavDailyPositionSheetOptionSummary;
  rows: BackOfficeNavDailyPositionSheetOptionRow[];
}
