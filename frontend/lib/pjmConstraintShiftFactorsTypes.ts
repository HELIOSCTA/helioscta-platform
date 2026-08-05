import type { PjmConstraintMarket } from "@/lib/pjmConstraintsTypes";

export type PjmConstraintShiftFactorStatus =
  | "ready"
  | "model_missing"
  | "model_error"
  | "hub_unmatched";

export type PjmConstraintBranchMatchStatus =
  | "matched"
  | "ambiguous"
  | "no_match"
  | "model_unavailable";

export type PjmConstraintShiftDirection =
  | "positive"
  | "negative"
  | "neutral"
  | "unknown";

export type PjmConstraintShiftFactorHourlyMetric =
  | "estimatedWesternHubImpact"
  | "shadowPrice";

export type PjmConstraintOutagePreviewRelation =
  | "Same branch"
  | "Shared bus"
  | "Nearby RAW"
  | "Text evidence";

export interface PjmConstraintOutagePreview {
  relatedTicketCount: number;
  sameBranchCount: number;
  sharedBusCount: number;
  nearbyRawCount: number;
  textEvidenceCount: number;
  maxAbsRelatedOutageShiftFactor: number | null;
  topRelation: PjmConstraintOutagePreviewRelation | null;
  topTicketId: string | null;
  topFacilityName: string | null;
  score: number;
}

export interface PjmConstraintShiftFactorModelSummary {
  status: PjmConstraintShiftFactorStatus;
  statusMessage: string;
  rawPath: string;
  rawFilePresent: boolean;
  rawFileSizeBytes: number | null;
  rawFileUpdatedAt: string | null;
  busCount: number;
  branchCount: number;
  solved: boolean;
  slackBusName: string | null;
  westernHubBusCount: number;
  westernHubMatchedBusCount: number;
  westernHubFactorCoverage: number;
}

export interface PjmConstraintShiftFactorHourValue {
  he: number;
  shadowPrice: number | null;
  estimatedWesternHubImpact: number | null;
  intervalCount: number;
}

export interface PjmConstraintShiftFactorRow {
  rank: number;
  monitoredFacility: string;
  contingencyFacility: string;
  intervalCount: number;
  totalAbsShadowPrice: number;
  averageShadowPrice: number;
  maxAbsShadowPrice: number;
  shiftFactor: number | null;
  absoluteShiftFactor: number | null;
  estimatedWesternHubImpact: number | null;
  direction: PjmConstraintShiftDirection;
  matchStatus: PjmConstraintBranchMatchStatus;
  matchConfidence: number;
  matchedBranchKey: string | null;
  matchedBranchName: string | null;
  fromBusNumber: number | null;
  fromBusName: string | null;
  toBusNumber: number | null;
  toBusName: string | null;
  circuitId: string | null;
  outagePreview?: PjmConstraintOutagePreview | null;
  hours: PjmConstraintShiftFactorHourValue[];
}

export interface PjmConstraintShiftFactorSummary {
  market: PjmConstraintMarket;
  selectedDate: string | null;
  latestDate: string | null;
  availableDates: string[];
  sourceTable: string;
  sourceRowCount: number;
  rowCount: number;
  matchedConstraintCount: number;
  maxAbsHourlyEstimatedWesternHubImpact: number;
  maxAbsHourlyShadowPrice: number;
  maxAbsEstimatedWesternHubImpact: number;
  model: PjmConstraintShiftFactorModelSummary;
  limit: number;
  truncated: boolean;
  search: string;
  latestUpdateTimestamp: string | null;
}

export interface PjmConstraintShiftFactorsPayload {
  iso: "pjm";
  source: string;
  summary: PjmConstraintShiftFactorSummary;
  rows: PjmConstraintShiftFactorRow[];
}
