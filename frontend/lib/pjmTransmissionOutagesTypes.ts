export type TransmissionOutageChangeType =
  | "new"
  | "status"
  | "window"
  | "facility"
  | "date_log"
  | "history_log"
  | "equipment"
  | "unchanged";

export interface TransmissionOutageSnapshotSummary {
  sourceReportTimestamp: string;
  sourceReportTimezone: string;
  sourceFileSha256: string;
  ingestedAt: string;
  sourceLineCount: number;
  scheduledOutageCount: number;
}

export interface TransmissionOutagePriorValues {
  facilityName: string;
  startAtText: string;
  endAtText: string;
  currentStatus: string;
  statusTimestampText: string;
  availability: string;
  risk: string;
  previousStatus: string;
  onTime: string;
  lastEvaluatedText: string;
  dateLogCount: number;
  historyLogCount: number;
  detailLineCount: number;
}

export interface TransmissionOutageRow extends TransmissionOutagePriorValues {
  ticketId: string;
  itemNumber: string;
  sourceRowNumber: number;
  sourceReportTimestamp: string;
  zoneCompany: string;
  openClosed: string;
  changeTypes: TransmissionOutageChangeType[];
  changed: boolean;
  prior: TransmissionOutagePriorValues | null;
}

export interface TransmissionOutageSummary {
  latestTicketCount: number;
  priorTicketCount: number;
  ticketsPresentInBoth: number;
  newTicketCount: number;
  removedTicketCount: number;
  changedTicketCount: number;
  statusChangeCount: number;
  windowChangeCount: number;
  facilityChangeCount: number;
  dateLogChangeCount: number;
  historyLogChangeCount: number;
  equipmentChangeCount: number;
  multipleHistoryEventCount: number;
  multipleDateWindowCount: number;
  currentStatusRevisedCount: number;
  previousStatusRevisedCount: number;
}

export interface TransmissionOutageMetadata {
  zones: string[];
  statuses: string[];
  previousStatuses: string[];
  availabilities: string[];
  risks: string[];
  onTimes: string[];
  changeTypes: TransmissionOutageChangeType[];
}

export interface TransmissionOutageTablePayload {
  mode: "table";
  snapshots: TransmissionOutageSnapshotSummary[];
  selectedSnapshot: TransmissionOutageSnapshotSummary | null;
  priorSnapshot: TransmissionOutageSnapshotSummary | null;
  summary: TransmissionOutageSummary;
  metadata: TransmissionOutageMetadata;
  rows: TransmissionOutageRow[];
  limit: number;
  truncated: boolean;
}

export interface TransmissionOutageDetailRecord extends TransmissionOutageRow {
  rawHeaderLine: string;
  dateLogLines: string[];
  historyLogLines: string[];
  detailLines: string[];
}

export interface TransmissionOutageDetailSnapshot {
  snapshot: TransmissionOutageSnapshotSummary;
  record: TransmissionOutageDetailRecord | null;
}

export interface TransmissionOutageDetailPayload {
  mode: "detail";
  ticketId: string;
  snapshots: TransmissionOutageDetailSnapshot[];
}
