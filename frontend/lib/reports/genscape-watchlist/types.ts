export interface NomRow {
  gas_day: string | Date;
  pipeline_id: number;
  pipeline_name: string;
  pipeline_short_name: string;
  tariff_zone: string;
  tz_id: number;
  state: string;
  county: string;
  loc_name: string;
  location_id: number;
  location_role_id: number;
  facility: string;
  role: string;
  role_code: string;
  interconnecting_entity: string;
  interconnecting_pipeline_short_name: string;
  meter: string;
  drn: string;
  latitude: number;
  longitude: number;
  sign: number;
  cycle_code: string;
  cycle_name: string;
  units: string;
  pipeline_balance_flag: number;
  storage_flag: number;
  scheduled_cap: number;
  signed_scheduled_cap: number;
  no_notice_capacity: number;
  operational_cap: number;
  available_cap: number;
  design_cap: number;
}

export type SortField = keyof NomRow;

export type PivotMetricKey =
  | "scheduled_cap"
  | "signed_scheduled_cap"
  | "operational_cap"
  | "available_cap"
  | "design_cap"
  | "no_notice_capacity";

export type PivotDisplay = "values" | "dod";

export type ChartSeriesKey =
  | "scheduled"
  | "operational"
  | "available_cap"
  | "design_cap";

export interface ReportColumn {
  key: SortField;
  label: string;
  dataType?: "date" | "number" | "text";
  className?: string;
}

export interface ChartSeriesDefinition {
  key: ChartSeriesKey;
  label: string;
  color: string;
}

export interface ChartPoint {
  gas_day: string;
  scheduled: number;
  operational: number;
  available_cap: number;
  design_cap: number;
}

export interface ChartDataByRoleId {
  roleId: number;
  loc_name: string;
  data: ChartPoint[];
}

export interface PivotRow {
  pipeline_short_name: string;
  tariff_zone: string;
  loc_name: string;
  location_id: number;
  location_role_id: number;
  facility: string;
  role: string;
  byDate: Map<string, number>;
}

export interface PivotWeekGroup {
  label: string;
  span: number;
}

export interface PivotData {
  dates: string[];
  weekGroups: PivotWeekGroup[];
  pivotRows: PivotRow[];
}
