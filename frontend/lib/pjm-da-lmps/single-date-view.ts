export interface PjmDaHourlyLmp {
  hourEnding: number;
  datetimeBeginningEpt: string;
  total: number | null;
  systemEnergy: number | null;
  congestion: number | null;
  marginalLoss: number | null;
}

export interface PjmDaHubLmpSummary {
  hub: string;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  flatAvg: number | null;
  peakHour: number | null;
  peakPrice: number | null;
  hourly: PjmDaHourlyLmp[];
}

export interface PjmDaLmpsSingleDatePayload {
  targetDate: string;
  latestDate: string | null;
  asOf: string | null;
  hubs: PjmDaHubLmpSummary[];
}

export type PjmDaComponentKey = "energy" | "congestion" | "loss" | "total";

export interface PjmDaComponentReportRow {
  key: PjmDaComponentKey;
  label: string;
  color: string;
  values: Map<number, number | null>;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  flatAvg: number | null;
  min: number;
  max: number;
}

export interface PjmDaSingleDateReport {
  targetDate: string;
  latestDate: string | null;
  asOf: string | null;
  hubs: PjmDaHubLmpSummary[];
  selectedHub: PjmDaHubLmpSummary | null;
  componentRows: PjmDaComponentReportRow[];
}

const HOURS = Array.from({ length: 24 }, (_, index) => index + 1);
const ONPEAK_START = 8;
const ONPEAK_END = 23;
const ONPEAK_HOURS = HOURS.filter((hour) => hour >= ONPEAK_START && hour <= ONPEAK_END);
const OFFPEAK_HOURS = HOURS.filter((hour) => hour < ONPEAK_START || hour > ONPEAK_END);

export const PJM_DA_COMPONENTS: Array<{
  key: PjmDaComponentKey;
  label: string;
  color: string;
  getValue: (row: PjmDaHourlyLmp) => number | null;
}> = [
  {
    key: "energy",
    label: "Energy",
    color: "#38bdf8",
    getValue: (row) => row.systemEnergy,
  },
  {
    key: "congestion",
    label: "Congestion",
    color: "#f97316",
    getValue: (row) => row.congestion,
  },
  {
    key: "loss",
    label: "Loss",
    color: "#a78bfa",
    getValue: (row) => row.marginalLoss,
  },
  {
    key: "total",
    label: "Total",
    color: "#e5e7eb",
    getValue: (row) => row.total,
  },
];

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value !== null);
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function buildComponentRow(
  component: (typeof PJM_DA_COMPONENTS)[number],
  hub: PjmDaHubLmpSummary
): PjmDaComponentReportRow {
  const values = new Map(
    hub.hourly.map((row) => [row.hourEnding, component.getValue(row)] as const)
  );
  const allValues = HOURS.map((hour) => values.get(hour) ?? null);
  const nums = allValues.filter((value): value is number => value !== null);

  return {
    key: component.key,
    label: component.label,
    color: component.color,
    values,
    onPeakAvg: avg(ONPEAK_HOURS.map((hour) => values.get(hour) ?? null)),
    offPeakAvg: avg(OFFPEAK_HOURS.map((hour) => values.get(hour) ?? null)),
    flatAvg: avg(allValues),
    min: nums.length > 0 ? Math.min(...nums) : 0,
    max: nums.length > 0 ? Math.max(...nums) : 0,
  };
}

export function buildPjmDaSingleDateReport(
  payload: PjmDaLmpsSingleDatePayload,
  selectedHubName = "WESTERN HUB"
): PjmDaSingleDateReport {
  const selectedHub =
    payload.hubs.find((hub) => hub.hub === selectedHubName) ?? payload.hubs[0] ?? null;
  return {
    targetDate: payload.targetDate,
    latestDate: payload.latestDate,
    asOf: payload.asOf,
    hubs: payload.hubs,
    selectedHub,
    componentRows: selectedHub
      ? PJM_DA_COMPONENTS.map((component) => buildComponentRow(component, selectedHub))
      : [],
  };
}
