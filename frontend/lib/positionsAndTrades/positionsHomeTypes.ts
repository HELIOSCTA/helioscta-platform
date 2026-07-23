export type PositionsHomeStatus =
  | "stable"
  | "not_applicable"
  | "watch"
  | "stale"
  | "missing"
  | "needs_repair"
  | "error";

export type PositionsHomeFeedId =
  | "nav_positions"
  | "clear_street_trades"
  | "ice_trade_blotter";

export type PositionsHomeActionSection =
  | "nav-positions"
  | "clear-street-trades"
  | "ice-trade-blotter";

export interface PositionsHomeMetric {
  label: string;
  value: string;
  status?: PositionsHomeStatus;
}

export interface PositionsHomePipelineRun {
  status: string | null;
  operationName: string | null;
  provider: string | null;
  createdAt: string | null;
  rowsWritten: number | null;
  errorType: string | null;
  errorMessage: string | null;
}

export interface PositionsHomeFeedSourceRow {
  source: string;
  latestDate: string | null;
  latestDateLabel: string;
  loadedAt: string | null;
  loadedLabel: string;
  rowCount: number;
  rowCountLabel: string;
  status: PositionsHomeStatus;
  statusLabel: string;
  detail: string;
}

export interface PositionsHomeFeedStatus {
  id: PositionsHomeFeedId;
  label: string;
  status: PositionsHomeStatus;
  statusLabel: string;
  sourceSystem: string;
  sourceTable: string;
  expectedArtifact: string;
  targetDate: string | null;
  targetDateLabel: string;
  latestDate: string | null;
  latestDateLabel: string;
  latestUpdateAt: string | null;
  latestUpdateLabel: string;
  rowCount: number;
  rowCountLabel: string;
  detail: string;
  actionSection: PositionsHomeActionSection;
  manual: boolean;
  metrics: PositionsHomeMetric[];
  sourceRows: PositionsHomeFeedSourceRow[];
  lastPipelineRun: PositionsHomePipelineRun | null;
}

export interface PositionsHomeReferenceTableStatus {
  tableName: string;
  rowCount: number;
  rowCountLabel: string;
  expected: string;
  status: PositionsHomeStatus;
  detail: string;
}

export interface PositionsHomeReferenceCheck {
  id: string;
  label: string;
  failingCount: number;
  status: PositionsHomeStatus;
  detail: string;
}

export type PositionsHomeValidationSeverity = "error" | "warn";
export type PositionsHomeValidationScope = "latest" | "all_history";
export type PositionsHomeValidationCacheStatus = "hit" | "miss" | "stale";

export interface PositionsHomeValidationCheck {
  scope: PositionsHomeValidationScope;
  scopeLabel: string;
  checkId: string;
  label: string;
  sourceSystem: string;
  severity: PositionsHomeValidationSeverity;
  status: PositionsHomeStatus;
  statusLabel: string;
  failingCount: number | null;
  failingCountLabel: string;
  detail: string;
  sampleProductCode: string | null;
  sampleProductGrouping: string | null;
  sampleRouteFamily: string | null;
  sampleFailureReason: string | null;
  sampleGroupCount: number | null;
  firstObservedDate: string | null;
  lastObservedDate: string | null;
}

export interface PositionsHomeValidationPayload {
  source: "positions-home-validation";
  generatedAt: string;
  validatedAt: string;
  cacheStatus: PositionsHomeValidationCacheStatus;
  cacheTtlSeconds: number;
  checks: PositionsHomeValidationCheck[];
}

export interface PositionsHomeValidationFailureRow {
  scope: PositionsHomeValidationScope;
  scopeLabel: string;
  checkId: string;
  label: string;
  sourceSystem: string;
  severity: PositionsHomeValidationSeverity;
  sourceDate: string | null;
  sourceFileName: string | null;
  sftpUploadTimestamp: string | null;
  sourceRecordKey: string | null;
  sourceRowNumber: string | null;
  accountCode: string | null;
  accountName: string | null;
  sourceAccount: string | null;
  sourceProduct: string | null;
  productCode: string | null;
  productGrouping: string | null;
  productRegion: string | null;
  contractYyyymm: string | null;
  contractDay: string | null;
  putCall: string | null;
  strikePrice: string | null;
  routeExchange: string | null;
  routeFamily: string | null;
  sourceExchangeName: string | null;
  rawExchange: string | null;
  vendorIceCode: string | null;
  vendorCmeCode: string | null;
  vendorBbgCode: string | null;
  failureReason: string | null;
  sourceContext: string | null;
}

export interface PositionsHomeValidationDetailsPayload {
  source: "positions-home-validation-details";
  generatedAt: string;
  validatedAt: string;
  scope: PositionsHomeValidationScope;
  checkId: string;
  cacheStatus: PositionsHomeValidationCacheStatus;
  cacheTtlSeconds: number;
  totalRows: number;
  returnedRows: number;
  limit: number;
  rows: PositionsHomeValidationFailureRow[];
}

export interface PositionsHomeReferenceStatus {
  status: PositionsHomeStatus;
  statusLabel: string;
  needsRepair: boolean;
  summary: string;
  detail: string;
  tables: PositionsHomeReferenceTableStatus[];
  checks: PositionsHomeReferenceCheck[];
  validationChecks: PositionsHomeValidationCheck[];
  lastCheckedAt: string;
  docs: {
    contractId: string;
    displayName: string;
    dbtModelFamily: string;
    dbtModelFamilyPath: string;
    referenceSchema: string;
    referenceTables: string[];
    manifest: string;
    referenceDdl: string;
    verificationSql: string;
    upsertSql: string;
  };
}

export interface PositionsHomePayload {
  source: string;
  generatedAt: string;
  localDate: string;
  localTimeZone: string;
  reviewMode: "latest_due" | "business_date";
  reviewDate: string;
  overallStatus: PositionsHomeStatus;
  overallStatusLabel: string;
  summary: string;
  feeds: PositionsHomeFeedStatus[];
  reference: PositionsHomeReferenceStatus;
}
