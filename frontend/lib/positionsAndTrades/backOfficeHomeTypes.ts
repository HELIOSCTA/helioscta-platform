export type BackOfficeHomeReadiness = "ready" | "watch" | "error";

export type BackOfficeHomeSourceStatus =
  | "up"
  | "ready"
  | "unknown"
  | "gap"
  | "error";

export type BackOfficeHomeSnapshotStatus =
  | "ready"
  | "awaiting_next_run"
  | "late"
  | "missing"
  | "unavailable"
  | "error";

export interface BackOfficeHomeMetric {
  label: string;
  value: string;
  status: BackOfficeHomeReadiness;
}

export interface BackOfficeHomeSnapshot {
  id: string;
  label: string;
  scheduleLabel: string;
  sourceTable: string;
  expectedArtifact: string;
  latestDate: string | null;
  latestDateLabel: string;
  latestUpdateAt: string | null;
  latestUpdateLabel: string;
  dbMirrored: boolean | null;
  dbMirroredLabel: string;
  rowCount: number;
  rowCountLabel: string;
  status: BackOfficeHomeSnapshotStatus;
  statusLabel: string;
  detail: string;
  isException: boolean;
}

export interface BackOfficeHomeGroup {
  id: "nav" | "marex" | "clear_street";
  label: string;
  latestAvailableAt: string | null;
  latestAvailableLabel: string;
  sftpStatus: BackOfficeHomeSourceStatus;
  sftpStatusLabel: string;
  dbStatus: BackOfficeHomeSourceStatus;
  dbStatusLabel: string;
  readiness: BackOfficeHomeReadiness;
  readyCount: number;
  ingestLagCount: number;
  dbGapCount: number;
  sourceGapCount: number;
  nameMismatchCount: number;
  snapshots: BackOfficeHomeSnapshot[];
  exceptionCount: number;
  metrics: BackOfficeHomeMetric[];
}

export interface BackOfficeHomePayload {
  source: "backoffice-home";
  generatedAt: string;
  localTimeZone: string;
  readiness: BackOfficeHomeReadiness;
  readinessLabel: string;
  summary: string;
  changedSinceLastCheck: string;
  groups: BackOfficeHomeGroup[];
  sourceChecks: string;
}
