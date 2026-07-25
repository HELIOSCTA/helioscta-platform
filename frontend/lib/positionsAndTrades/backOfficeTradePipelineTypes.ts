export interface BackOfficeTradePipelineAvailableDate {
  sftpDate: string;
  rawRowCount: number;
  titanRowCount: number;
  latestUploadAt: string | null;
}

export interface BackOfficeTradePipelineMonitoringRow {
  businessDate: string;
  businessDateLabel: string;
  rawReceivedAt: string | null;
  rawReceivedLabel: string;
  rawLoadedAt: string | null;
  rawLoadedLabel: string;
  titanReadyAt: string | null;
  titanReadyLabel: string;
  rowsLabel: string;
  warnings: number;
}

export interface BackOfficeTradePipelineArtifactRow {
  businessDate: string;
  businessDateLabel: string;
  editedFile: string;
  builtAt: string | null;
  builtAtLabel: string;
  rowsLabel: string;
  warnings: number;
}

export interface BackOfficeTradePipelineSummary {
  businessDate: string | null;
  businessDateLabel: string;
  updatedAt: string | null;
  updatedLabel: string;
  titanRows: number;
  matchedRows: number;
  artifactFile: string | null;
  builtAt: string | null;
  builtAtLabel: string;
  artifactRowsLabel: string;
}

export interface BackOfficeTradePipelineDelivery {
  statusLabel: "VERIFIED" | "PENDING" | "BLOCKED";
  modeLabel: "AUTO ON" | "AUTO OFF";
  rows: number;
  warnings: number;
  lastAttemptAt: string | null;
  lastAttemptLabel: string;
  remoteFile: string | null;
  detail: string;
}

export interface BackOfficeTradePipelineWatch {
  watchDate: string;
  watchDateLabel: string;
  statusLabel: "Watching" | "Ready" | "Late";
  headline: string;
  detail: string;
}

export interface BackOfficeTradePipelinePreviewRow {
  sftpDate: string | null;
  rowFamily: string | null;
  accountDisplayName: string | null;
  accountCode: string | null;
  sourceAccountKey: string | null;
  accountNumber: string | null;
  giveInOutCode: string | null;
  traceNumOrUniqueIdentifier: string | null;
  orderNumber: string | null;
  giveInOutFirmNum: string | null;
  accountLookupStatus: string | null;
  tradeType: string | null;
  openCloseCode: string | null;
  giveIoCharge: string | number | null;
  allocationTotalGroupQty: string | number | null;
  allocationTotalMatchStatus: string | null;
  allocationTotalMatchSource: string | null;
  allocationTotalMatchQty: string | number | null;
  productCode: string | null;
  productFamily: string | null;
  marketName: string | null;
  contractYyyymm: string | null;
  contractDay: string | null;
  putCallCode: string | null;
  strikePriceNormalized: string | number | null;
  buySellCleaned: string | null;
  quantityCleaned: string | number | null;
  tradePrice: string | number | null;
  ruleStatus: string | null;
  ruleMatchSource: string | null;
  iceProductCode: string | null;
  cmeProductCode: string | null;
  bbgProductCode: string | null;
}

export interface BackOfficeTradePipelinePayload {
  source: "backoffice-trade-pipeline";
  generatedAt: string;
  selectedDate: string | null;
  latestDate: string | null;
  availableDates: BackOfficeTradePipelineAvailableDate[];
  watch: BackOfficeTradePipelineWatch;
  recentMonitoring: BackOfficeTradePipelineMonitoringRow[];
  artifacts: BackOfficeTradePipelineArtifactRow[];
  summary: BackOfficeTradePipelineSummary;
  delivery: BackOfficeTradePipelineDelivery;
  previewRows: BackOfficeTradePipelinePreviewRow[];
  previewRowCount: number;
  previewReturnedCount: number;
  sourceChecks: string;
}
