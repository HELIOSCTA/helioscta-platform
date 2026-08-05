export type PjmConstraintMarket = "da" | "rt";
export type PjmConstraintMode = "daily";
export type PjmConstraintMetric = "binding-hours" | "abs-shadow-price";

export interface PjmConstraintHourValue {
  he: number;
  value: number | null;
  intervalCount: number;
}

export interface PjmConstraintRow {
  rank: number;
  monitoredFacility: string;
  contingencyFacility: string;
  totalValue: number;
  bindingIntervals: number;
  maxShadowPrice: number;
  hours: PjmConstraintHourValue[];
}

export interface PjmConstraintsSummary {
  market: PjmConstraintMarket;
  mode: PjmConstraintMode;
  sourceTable: string;
  metric: PjmConstraintMetric;
  metricLabel: string;
  selectedDate: string | null;
  latestDate: string | null;
  availableDates: string[];
  sourceMaxTimestamp: string | null;
  latestUpdateTimestamp: string | null;
  sourceRowCount: number;
  sourceIntervalCount: number;
  rowCount: number;
  bindingIntervals: number;
  totalValue: number;
  maxHourlyValue: number;
  maxTotalValue: number;
  limit: number;
  truncated: boolean;
  search: string;
}

export interface PjmConstraintsPayload {
  iso: "pjm";
  source: string;
  summary: PjmConstraintsSummary;
  rows: PjmConstraintRow[];
}
