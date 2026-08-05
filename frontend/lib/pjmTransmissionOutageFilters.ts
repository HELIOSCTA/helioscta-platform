export type TransmissionOutageDateBasis = "active" | "start" | "end";
export type TransmissionOutageQuickDate =
  | "today"
  | "tomorrow"
  | "next7Days"
  | "next14Days"
  | "next30Days";

export interface TransmissionOutageQuickDateOption {
  key: TransmissionOutageQuickDate;
  label: string;
  startOffsetDays: number;
  spanDays: number;
}

export const TRANSMISSION_OUTAGE_QUICK_DATE_OPTIONS = [
  { key: "today", label: "Today", startOffsetDays: 0, spanDays: 1 },
  { key: "tomorrow", label: "Tomorrow", startOffsetDays: 1, spanDays: 1 },
  { key: "next7Days", label: "Next 7", startOffsetDays: 0, spanDays: 7 },
  { key: "next14Days", label: "Next 14", startOffsetDays: 0, spanDays: 14 },
  { key: "next30Days", label: "Next 30", startOffsetDays: 0, spanDays: 30 },
] as const satisfies readonly TransmissionOutageQuickDateOption[];
