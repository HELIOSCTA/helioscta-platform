import type {
  ChartSeriesDefinition,
  PivotMetricKey,
  ReportColumn,
} from "./types";

export const FETCH_LIMIT = 5000;
export const TABLE_PAGE_SIZE = 100;
export const DEFAULT_LOOKBACK = 60;

export const EMAIL_PREVIEW_ROWS = 40;
export const EMAIL_PIVOT_ROWS = 18;
export const EMAIL_PIVOT_DATES = 10;

export const CHART_SERIES: readonly ChartSeriesDefinition[] = [
  { key: "scheduled", label: "Scheduled", color: "#f97316" },
  { key: "operational", label: "Operational", color: "#3b82f6" },
  { key: "available_cap", label: "Available Cap", color: "#22c55e" },
  { key: "design_cap", label: "Design Cap", color: "#eab308" },
] as const;

export const DEFAULT_VISIBLE_SERIES_KEYS = ["scheduled", "operational"] as const;

export const PIVOT_METRICS: readonly {
  key: PivotMetricKey;
  label: string;
}[] = [
  { key: "scheduled_cap", label: "Scheduled" },
  { key: "signed_scheduled_cap", label: "Signed Scheduled" },
  { key: "operational_cap", label: "Operational" },
  { key: "available_cap", label: "Available Cap" },
  { key: "design_cap", label: "Design Cap" },
  { key: "no_notice_capacity", label: "No Notice Cap" },
] as const;

export const METRIC_LABELS: Record<PivotMetricKey, string> =
  Object.fromEntries(PIVOT_METRICS.map((metric) => [metric.key, metric.label])) as Record<
    PivotMetricKey,
    string
  >;

export const COLUMNS: readonly ReportColumn[] = [
  { key: "gas_day", label: "Gas Day", dataType: "date" },
  { key: "pipeline_short_name", label: "Pipeline" },
  { key: "cycle_code", label: "Cycle" },
  { key: "cycle_name", label: "Cycle Name" },
  { key: "loc_name", label: "Location" },
  { key: "location_role_id", label: "Role ID", className: "text-right" },
  { key: "facility", label: "Facility" },
  { key: "state", label: "State" },
  { key: "county", label: "County" },
  { key: "role", label: "Role" },
  { key: "role_code", label: "Role Code" },
  { key: "tariff_zone", label: "Tariff Zone" },
  { key: "interconnecting_entity", label: "Interconnect Entity" },
  { key: "interconnecting_pipeline_short_name", label: "Interconnect Pipeline" },
  { key: "meter", label: "Meter" },
  { key: "drn", label: "DRN" },
  {
    key: "scheduled_cap",
    label: "Scheduled",
    dataType: "number",
    className: "text-right",
  },
  {
    key: "signed_scheduled_cap",
    label: "Signed Sched",
    dataType: "number",
    className: "text-right",
  },
  {
    key: "no_notice_capacity",
    label: "No Notice Cap",
    dataType: "number",
    className: "text-right",
  },
  {
    key: "operational_cap",
    label: "Oper Cap",
    dataType: "number",
    className: "text-right",
  },
  {
    key: "available_cap",
    label: "Avail Cap",
    dataType: "number",
    className: "text-right",
  },
  {
    key: "design_cap",
    label: "Design Cap",
    dataType: "number",
    className: "text-right",
  },
  { key: "units", label: "Units" },
  { key: "sign", label: "Sign", className: "text-right" },
  { key: "latitude", label: "Lat", className: "text-right" },
  { key: "longitude", label: "Lon", className: "text-right" },
] as const;
