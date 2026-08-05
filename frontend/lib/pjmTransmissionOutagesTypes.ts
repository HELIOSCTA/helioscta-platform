import type {
  PjmConstraintBranchMatchStatus,
  PjmConstraintShiftDirection,
  PjmConstraintShiftFactorModelSummary,
} from "@/lib/pjmConstraintShiftFactorsTypes";

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
  startDate: string | null;
  startTime: string | null;
  endAtText: string;
  endDate: string | null;
  endTime: string | null;
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
  relatedEquipmentText: string;
  detailSearchText: string;
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

export type TransmissionOutageConstraintRelation =
  | "Same branch"
  | "Shared bus"
  | "Nearby RAW"
  | "Text evidence";

export interface TransmissionOutageConstraintLink {
  relation: TransmissionOutageConstraintRelation;
  score: number;
  hopDistance: number | null;
  evidenceText: string;
}

export interface TransmissionOutageZoneImpactTicket {
  ticketId: string;
  facilityName: string;
  shiftFactor: number;
}

export interface TransmissionOutageZoneImpact {
  zoneCompany: string;
  ticketCount: number;
  matchedCount: number;
  whubPositiveCount: number;
  whubNegativeCount: number;
  maxAbsShiftFactor: number;
  topBullish: TransmissionOutageZoneImpactTicket | null;
  topBearish: TransmissionOutageZoneImpactTicket | null;
}

export interface TransmissionOutageImpactRow extends TransmissionOutageRow {
  modelFacilityText: string | null;
  shiftFactor: number | null;
  absoluteShiftFactor: number | null;
  whubDirection: PjmConstraintShiftDirection;
  matchStatus: PjmConstraintBranchMatchStatus;
  matchConfidence: number;
  matchedBranchKey: string | null;
  matchedBranchName: string | null;
  fromBusNumber: number | null;
  fromBusName: string | null;
  toBusNumber: number | null;
  toBusName: string | null;
  circuitId: string | null;
  constraintLink?: TransmissionOutageConstraintLink | null;
}

export interface TransmissionOutageImpactSummary extends TransmissionOutageSummary {
  latestTicketCount: number;
  candidateTicketCount: number;
  modeledTicketCount: number;
  returnedTicketCount: number;
  matchedTicketCount: number;
  ambiguousTicketCount: number;
  unmatchedTicketCount: number;
  maxAbsShiftFactor: number;
  zoneImpacts: TransmissionOutageZoneImpact[];
  model: PjmConstraintShiftFactorModelSummary;
}

export interface TransmissionOutageImpactPayload {
  mode: "impact";
  snapshots: TransmissionOutageSnapshotSummary[];
  selectedSnapshot: TransmissionOutageSnapshotSummary | null;
  priorSnapshot: TransmissionOutageSnapshotSummary | null;
  summary: TransmissionOutageImpactSummary;
  metadata: TransmissionOutageMetadata;
  rows: TransmissionOutageImpactRow[];
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
