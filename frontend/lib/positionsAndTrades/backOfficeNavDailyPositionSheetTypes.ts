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

export interface BackOfficeNavDailyPositionSheetOptionMonth {
  yyyymm: string;
  label: string;
  netQuantity: number;
  rowCount: number;
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
}

export interface BackOfficeNavDailyPositionSheetMetric {
  label: string;
  value: string;
  status: "ok" | "watch" | "unavailable";
}

export interface BackOfficeNavDailyPositionSheetPayload {
  source: "backoffice-nav-daily-position-sheet";
  generatedAt: string;
  selectedDate: string | null;
  selectedDateLabel: string;
  latestDate: string | null;
  latestDateLabel: string;
  reportDate: string;
  reportDateLabel: string;
  navUpdatedAt: string | null;
  navUpdatedLabel: string;
  availableDates: BackOfficeNavDailyPositionSheetAvailableDate[];
  metrics: BackOfficeNavDailyPositionSheetMetric[];
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
  optionMonths: BackOfficeNavDailyPositionSheetOptionMonth[];
  optionSummary: BackOfficeNavDailyPositionSheetOptionSummary;
  optionRows: BackOfficeNavDailyPositionSheetOptionRow[];
  sourceChecks: string;
}
