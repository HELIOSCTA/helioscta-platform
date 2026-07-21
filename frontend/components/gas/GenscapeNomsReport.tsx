"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import PlotCard, { type PlotSeries } from "@/components/dashboard/PlotCard";
import type { Watchlist } from "@/lib/watchlists";
import {
  CHART_SERIES as SHARED_CHART_SERIES,
  COLUMNS as SHARED_COLUMNS,
  DEFAULT_LOOKBACK as SHARED_DEFAULT_LOOKBACK,
  DEFAULT_VISIBLE_SERIES_KEYS,
  FETCH_LIMIT as SHARED_FETCH_LIMIT,
  PIVOT_METRICS as SHARED_PIVOT_METRICS,
  TABLE_PAGE_SIZE as SHARED_TABLE_PAGE_SIZE,
} from "@/lib/reports/genscape-watchlist/constants";
import {
  fmtDateShort,
  fmtNum,
  escapeCsv,
  formatReportCell,
  lookbackDate,
  toCsv,
  todayStr,
} from "@/lib/reports/genscape-watchlist/format";
import { changeLabel } from "@/lib/reports/genscape-watchlist/highlights";
import type {
  PivotDisplay,
  PivotMetricKey,
  ReportColumn,
} from "@/lib/reports/genscape-watchlist/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface NomRow {
  gas_day: string;
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
  vendor_sign?: number;
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
  update_timestamp?: string | null;
}

interface GenscapeNomsResponse {
  rows?: NomRow[];
  total_count?: number;
}

export interface GenscapeNomsFreshnessSummary {
  status: string;
  statusClass: string;
  latestGasDayLabel: string;
  latestUpdateLabel: string;
}

interface PivotRow {
  groupKey: string;
  pipeline_short_name: string;
  tariff_zone: string;
  loc_name: string;
  location_id: number;
  location_role_id: number;
  locationRoleIds: Set<number>;
  facility: string;
  role: string;
  sign: number;
  vendor_sign: number;
  byDate: Map<string, number>;
}

interface DailyChartPoint {
  gas_day: string;
  scheduled: number;
  operational: number;
  available_cap: number;
  design_cap: number;
}

type SeasonalChartPoint = Record<string, string | number>;

interface SummaryHeaderGroup {
  key: string;
  label: string;
  span: number;
  align: "left" | "right";
}

type SortField = keyof NomRow;
type SortDir = "asc" | "desc";
type ReportView = "summary" | "daily-plots" | "seasonal-plots" | "rows";
type SummaryOrientation = "locations" | "gas-days";

const DEFAULT_SUMMARY_ORIENTATION: SummaryOrientation = "locations";
const SUMMARY_ORIENTATION_OPTIONS = [
  ["locations", "Locations"],
  ["gas-days", "Gas Days"],
] as const satisfies readonly (readonly [SummaryOrientation, string])[];

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FETCH_LIMIT = SHARED_FETCH_LIMIT;
const TABLE_PAGE_SIZE = SHARED_TABLE_PAGE_SIZE;
const DEFAULT_LOOKBACK = SHARED_DEFAULT_LOOKBACK;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SEASONAL_LOOKBACK_YEARS = 5;

const CHART_SERIES = SHARED_CHART_SERIES;
const DEFAULT_VISIBLE_SERIES = new Set<string>(DEFAULT_VISIBLE_SERIES_KEYS);
const DAILY_PLOT_SERIES: PlotSeries[] = CHART_SERIES.map((series) => ({
  key: series.key,
  label: series.label,
  color: series.color,
  defaultVisible: DEFAULT_VISIBLE_SERIES.has(series.key),
}));

/** Selectable metrics for the pivot summary table */
const PIVOT_METRICS = SHARED_PIVOT_METRICS;
const SEASONAL_YEAR_COLORS = [
  "#3b82f6",
  "#f97316",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f43f5e",
];

const DEFAULT_HISTORICAL_NOMS_COLUMN_LABELS = [
  "Gas Day",
  "Cycle",
  "Pipe",
  "Loc",
  "Loc ID",
  "Facility",
  "Sign",
  "Role",
  "Role ID",
  "Sched",
  "Signed Sched",
  "Oper Cap",
  "Avail Cap",
  "Design Cap",
  "Units",
] as const;

const SUMMARY_COLUMNS = [
  { key: "pipeline_short_name", label: "Pipeline", width: 80, align: "left" },
  { key: "loc_name", label: "Loc Name", width: 180, align: "left" },
  { key: "sign", label: "Sign", width: 76, align: "right" },
  { key: "vendor_sign", label: "Vendor Sign", width: 84, align: "right" },
  { key: "location_id", label: "Loc ID", width: 70, align: "right" },
  { key: "location_role_id", label: "Loc Role ID", width: 90, align: "right" },
  { key: "facility", label: "Facility", width: 120, align: "left" },
  { key: "role", label: "Role", width: 80, align: "left" },
] as const;

type SummaryColumnKey = (typeof SUMMARY_COLUMNS)[number]["key"];

const DEFAULT_SUMMARY_COLUMN_LABELS = ["Pipeline", "Loc Name", "Sign", "Vendor Sign"] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function downloadCsv(rows: NomRow[], columns: readonly ColumnDef[]) {
  const csv = toCsv(rows, [...columns]);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `genscape_noms_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadTextFile(contents: string, filename: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Format date for pivot column header: "Mon Mar 2" */
function fmtPivotDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtSeasonDay(monthDay: string): string {
  const [month, day] = monthDay.split("-");
  return `${Number.parseInt(month, 10)}/${Number.parseInt(day, 10)}`;
}

/** Sky highlight applied to a selected summary cell (replaces the heat tint). */
const SELECTED_CELL_STYLE: CSSProperties = {
  backgroundColor: "rgba(56, 189, 248, 0.22)",
  boxShadow: "inset 2px 0 0 rgba(56, 189, 248, 0.55)",
  color: "#e0f2fe",
};

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Percentile-based red/green tint for a value within its scale group (the row's
 * values, since the gradient is scaled per location row). Returns undefined for
 * mid-range values or when the group is too small / flat to be meaningful.
 */
function heatStyleFromValues(
  value: number | null,
  values: number[]
): CSSProperties | undefined {
  if (value === null || values.length < 4) return undefined;
  const lowMax = Math.min(...values);
  const lowMin = percentile(values, 0.25);
  const highMin = percentile(values, 0.75);
  const highMax = Math.max(...values);
  if (lowMin === null || highMin === null || lowMax === highMax || lowMin === highMin) {
    return undefined;
  }
  if (value <= lowMin) {
    const spread = Math.max(lowMin - lowMax, 0.0001);
    const intensity = Math.min(Math.max((lowMin - value) / spread, 0), 1);
    const alpha = 0.05 + intensity * 0.18;
    return {
      backgroundColor: `rgba(220, 38, 38, ${alpha.toFixed(2)})`,
      boxShadow: `inset 2px 0 0 rgba(220, 38, 38, ${(alpha + 0.14).toFixed(2)})`,
      color: "#e5e7eb",
    };
  }
  if (value >= highMin) {
    const spread = Math.max(highMax - highMin, 0.0001);
    const intensity = Math.min(Math.max((value - highMin) / spread, 0), 1);
    const alpha = 0.05 + intensity * 0.18;
    return {
      backgroundColor: `rgba(22, 163, 74, ${alpha.toFixed(2)})`,
      boxShadow: `inset 2px 0 0 rgba(22, 163, 74, ${(alpha + 0.14).toFixed(2)})`,
      color: "#e5e7eb",
    };
  }
  return undefined;
}

/** Selection key for a summary cell. Date is a fixed 10-char YYYY-MM-DD prefix. */
function summaryCellKey(groupKey: string, date: string): string {
  return `${date}|${groupKey}`;
}

function formatSignDisplay(sign: number | null | undefined): string {
  if (sign == null) return "--";
  return sign > 0 ? `+${sign}` : String(sign);
}

function formatSummaryMetadata(row: PivotRow, key: SummaryColumnKey): string {
  if (key === "sign" || key === "vendor_sign") {
    return formatSignDisplay(row[key]);
  }
  const value = row[key];
  return value === "" ? "--" : String(value);
}

function buildSummaryHeaderGroups(
  rows: PivotRow[],
  columns: readonly (typeof SUMMARY_COLUMNS)[number][]
): SummaryHeaderGroup[][] {
  return columns.map((column, columnIndex) => {
    const groups: SummaryHeaderGroup[] = [];
    let currentKey = "";

    for (const row of rows) {
      const parentKey = columns
        .slice(0, columnIndex)
        .map((parentColumn) => formatSummaryMetadata(row, parentColumn.key))
        .join("|");
      const label = formatSummaryMetadata(row, column.key);
      const groupKey = `${parentKey}|${label}`;

      if (groups.length === 0 || groupKey !== currentKey) {
        groups.push({
          key: `${column.key}-${groups.length}-${groupKey}`,
          label,
          span: 1,
          align: column.align,
        });
        currentKey = groupKey;
      } else {
        groups[groups.length - 1].span += 1;
      }
    }

    return groups;
  });
}

function formatSummaryValue(
  row: PivotRow,
  dates: string[],
  dateIndex: number,
  display: PivotDisplay
): string {
  const day = dates[dateIndex];
  const value = row.byDate.get(day) ?? 0;
  if (display === "values") return fmtNum(value);

  const nextDay = dates[dateIndex + 1];
  const change = nextDay ? value - (row.byDate.get(nextDay) ?? 0) : null;
  return changeLabel(change, fmtNum(change));
}

function formatDailyTotalValue(
  totalsByDate: Map<string, number>,
  dates: string[],
  dateIndex: number,
  display: PivotDisplay
): string {
  const day = dates[dateIndex];
  const value = totalsByDate.get(day) ?? 0;
  if (display === "values") return fmtNum(value);

  const nextDay = dates[dateIndex + 1];
  const change = nextDay ? value - (totalsByDate.get(nextDay) ?? 0) : null;
  return changeLabel(change, fmtNum(change));
}

function downloadSummaryCsv({
  dates,
  pivotRows,
  columns,
  orientation,
  display,
  metricLabel,
  signedScheduleTotalsByDate,
}: {
  dates: string[];
  pivotRows: PivotRow[];
  columns: readonly (typeof SUMMARY_COLUMNS)[number][];
  orientation: SummaryOrientation;
  display: PivotDisplay;
  metricLabel: string;
  signedScheduleTotalsByDate: Map<string, number>;
}) {
  const csvRows =
    orientation === "gas-days"
      ? [
          ...columns.map((column) => [
            column.label,
            "Total Signed Sched",
            ...pivotRows.map((row) => formatSummaryMetadata(row, column.key)),
          ]),
          ["Gas Day", "Total Signed Sched", ...pivotRows.map(() => metricLabel)],
          ...dates.map((day, dateIndex) => [
            day,
            formatDailyTotalValue(signedScheduleTotalsByDate, dates, dateIndex, display),
            ...pivotRows.map((row) => formatSummaryValue(row, dates, dateIndex, display)),
          ]),
        ]
      : [
          [...columns.map((column) => column.label), ...dates],
          [
            "Total Signed Sched",
            ...columns.slice(1).map(() => ""),
            ...dates.map((_, dateIndex) =>
              formatDailyTotalValue(signedScheduleTotalsByDate, dates, dateIndex, display)
            ),
          ],
          ...pivotRows.map((row) => [
            ...columns.map((column) => formatSummaryMetadata(row, column.key)),
            ...dates.map((_, dateIndex) => formatSummaryValue(row, dates, dateIndex, display)),
          ]),
        ];

  const csv = csvRows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const today = new Date().toISOString().slice(0, 10);
  downloadTextFile(
    `\uFEFF${csv}`,
    `genscape_noms_summary_${orientation}_${display}_${today}.csv`,
    "text/csv;charset=utf-8;"
  );
}

/** Get the Friday that ends the week containing this date (Sat–Fri weeks) */
function getWeekFriday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0=Sun … 5=Fri 6=Sat
  const diff = day <= 5 ? 5 - day : 6; // Sat(6) → next Fri = +6
  const fri = new Date(d);
  fri.setDate(fri.getDate() + diff);
  return fri.toISOString().slice(0, 10);
}

function dateRangeDays(startDate?: string, endDate?: string): number | null {
  if (!startDate || !endDate) return null;
  const start = Date.parse(`${startDate}T00:00:00`);
  const end = Date.parse(`${endDate}T00:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / DAY_MS) + 1;
}

function buildSeasonalDateWindows(
  startDate: string,
  endDate: string,
  lookbackYears: number
): { label: string; start: string; end: string }[] {
  const endYear = Number.parseInt(endDate.slice(0, 4), 10);
  const startMonthDay = startDate.slice(5);
  const endMonthDay = endDate.slice(5);
  const crossesYear = startMonthDay > endMonthDay;

  return Array.from({ length: lookbackYears }, (_, offset) => {
    const windowEndYear = endYear - offset;
    const windowStartYear = crossesYear ? windowEndYear - 1 : windowEndYear;
    return {
      label: String(windowEndYear),
      start: `${windowStartYear}-${startMonthDay}`,
      end: `${windowEndYear}-${endMonthDay}`,
    };
  });
}

async function fetchFreshJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  const rawText = await response.text();
  const json = rawText.trim() ? JSON.parse(rawText) : null;

  if (!response.ok) {
    const message =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  if (json === null) {
    throw new Error(`Invalid JSON from ${url}`);
  }

  return json as T;
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function dateDiffDays(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.floor((to - from) / DAY_MS);
}

function formatDateLabel(value: string | null): string {
  if (!value) return "--";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimestampLabel(value: string | null): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

type ColumnDef = ReportColumn;

const HISTORICAL_NOMS_COLUMN_ORDER: readonly SortField[] = [
  "gas_day",
  "cycle_code",
  "cycle_name",
  "pipeline_short_name",
  "pipeline_name",
  "pipeline_id",
  "tariff_zone",
  "tz_id",
  "loc_name",
  "location_id",
  "location_role_id",
  "facility",
  "sign",
  "role",
  "role_code",
  "scheduled_cap",
  "signed_scheduled_cap",
  "no_notice_capacity",
  "operational_cap",
  "available_cap",
  "design_cap",
  "units",
  "pipeline_balance_flag",
  "storage_flag",
  "interconnecting_entity",
  "interconnecting_pipeline_short_name",
  "meter",
  "drn",
  "state",
  "county",
  "latitude",
  "longitude",
];

const HISTORICAL_NOMS_COLUMN_LABELS: Partial<Record<SortField, string>> = {
  available_cap: "Avail Cap",
  cycle_code: "Cycle",
  cycle_name: "Cycle Name",
  design_cap: "Design Cap",
  drn: "DRN",
  gas_day: "Gas Day",
  interconnecting_entity: "Interconnect",
  interconnecting_pipeline_short_name: "Interconnect Pipe",
  latitude: "Lat",
  loc_name: "Loc",
  location_id: "Loc ID",
  location_role_id: "Role ID",
  longitude: "Lon",
  no_notice_capacity: "No Notice Cap",
  operational_cap: "Oper Cap",
  pipeline_balance_flag: "Bal Flag",
  pipeline_id: "Pipe ID",
  pipeline_name: "Pipe Name",
  pipeline_short_name: "Pipe",
  role_code: "Role Code",
  scheduled_cap: "Sched",
  signed_scheduled_cap: "Signed Sched",
  storage_flag: "Storage",
  tariff_zone: "TZ",
  tz_id: "TZ ID",
};

const HISTORICAL_NOMS_EXTRA_COLUMNS: readonly ColumnDef[] = [
  { key: "pipeline_id", label: "Pipe ID", className: "text-right" },
  { key: "pipeline_name", label: "Pipe Name" },
  { key: "tz_id", label: "TZ ID", className: "text-right" },
  { key: "location_id", label: "Loc ID", className: "text-right" },
  { key: "pipeline_balance_flag", label: "Bal Flag", className: "text-right" },
  { key: "storage_flag", label: "Storage", className: "text-right" },
];

const columnOrderIndex = new Map(
  HISTORICAL_NOMS_COLUMN_ORDER.map((key, index) => [key, index])
);

const COLUMNS: readonly ColumnDef[] = [...SHARED_COLUMNS, ...HISTORICAL_NOMS_EXTRA_COLUMNS]
  .map((column) => ({
    ...column,
    label: HISTORICAL_NOMS_COLUMN_LABELS[column.key] ?? column.label,
  }))
  .sort(
    (a, b) =>
      (columnOrderIndex.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
      (columnOrderIndex.get(b.key) ?? Number.MAX_SAFE_INTEGER)
  );

/* ------------------------------------------------------------------ */
/*  MultiSelect dropdown                                               */
/* ------------------------------------------------------------------ */

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "Select...",
  width = "w-64",
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(filter.toLowerCase())
  );

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const buttonText =
    selected.length === 0
      ? placeholder
      : selected.length <= 2
        ? selected.join(", ")
        : `${selected.length} selected`;

  return (
    <div className="relative flex flex-col gap-1" ref={ref}>
      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </label>
      <button
        onClick={() => setOpen(!open)}
        className={`${width} rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-left text-gray-200 focus:border-gray-500 focus:outline-none truncate`}
      >
        {selected.length === 0 ? (
          <span className="text-gray-600">{placeholder}</span>
        ) : (
          buttonText
        )}
      </button>
      {open && (
        <div
          className={`absolute top-full left-0 z-50 mt-1 ${width} rounded-md border border-gray-700 bg-[#12141d] shadow-xl`}
        >
          <div className="sticky top-0 bg-[#12141d] p-2 border-b border-gray-700">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search..."
              className="w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none"
              autoFocus
            />
          </div>
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 text-left border-b border-gray-700"
            >
              Clear all ({selected.length})
            </button>
          )}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-600">No matches</div>
            ) : (
              filtered.map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => toggle(option)}
                    className="rounded accent-blue-500"
                  />
                  <span className="truncate">{option}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface WatchlistReportScope extends Watchlist {
  source?: "watchlist" | "pipeline" | "custom";
}

interface WatchlistTableProps {
  watchlist: WatchlistReportScope;
  initialStartDate?: string;
  initialEndDate?: string;
  scopeControls?: ReactNode;
  emptyScopeMessage?: string;
  refreshToken?: number;
  onFreshnessChange?: (freshness: GenscapeNomsFreshnessSummary) => void;
}

function applySignOverrides(
  rows: NomRow[],
  signOverrides: Readonly<Record<string, number>> | undefined
): NomRow[] {
  return rows.map((row) => {
    // Capture the raw vendor sign before any override so both can be shown.
    const vendor_sign = row.vendor_sign ?? row.sign;
    const override = signOverrides?.[String(row.location_role_id)];
    if (override === -1 || override === 1) {
      return {
        ...row,
        vendor_sign,
        sign: override,
        signed_scheduled_cap: (row.scheduled_cap ?? 0) * override,
      };
    }

    return { ...row, vendor_sign };
  });
}

export default function GenscapeNomsReport({
  watchlist,
  initialStartDate,
  initialEndDate,
  scopeControls,
  emptyScopeMessage = "Select one or more points to load nominations.",
  refreshToken = 0,
  onFreshnessChange,
}: WatchlistTableProps) {
  const roleIdsParam = useMemo(
    () => watchlist.locationRoleIds.filter((id) => Number.isFinite(id)).join(","),
    [watchlist.locationRoleIds]
  );
  const initialEnd = initialEndDate ?? todayStr();
  const initialLookbackDays = dateRangeDays(initialStartDate, initialEnd) ?? DEFAULT_LOOKBACK;

  /* --- lookback days --- */
  const [lookbackDays, setLookbackDays] = useState(initialLookbackDays);

  /* --- date filters --- */
  const [startDate, setStartDate] = useState(
    () => initialStartDate ?? lookbackDate(initialLookbackDays)
  );
  const [endDate, setEndDate] = useState(() => initialEnd);

  /* --- data state --- */
  const [rows, setRows] = useState<NomRow[]>([]);
  const [seasonalRows, setSeasonalRows] = useState<NomRow[]>([]);
  const [, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [seasonalLoading, setSeasonalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seasonalError, setSeasonalError] = useState<string | null>(null);

  /* --- sort state --- */
  const [sortField, setSortField] = useState<SortField>("gas_day");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  /* --- report view state --- */
  const [activeView, setActiveView] = useState<ReportView>("summary");

  /* --- pivot metric selector --- */
  const [pivotMetricKey, setPivotMetricKey] = useState<PivotMetricKey>("signed_scheduled_cap");
  const [pivotDisplay, setPivotDisplay] = useState<PivotDisplay>("values");

  /* --- summary heatmap + cell selection --- */
  const [tableHeatmapEnabled, setTableHeatmapEnabled] = useState(true);
  const [selectedSummaryCells, setSelectedSummaryCells] = useState<Set<string>>(
    () => new Set()
  );
  const [summaryOrientation, setSummaryOrientation] =
    useState<SummaryOrientation>(DEFAULT_SUMMARY_ORIENTATION);
  const [seasonalLookbackYears, setSeasonalLookbackYears] = useState(
    DEFAULT_SEASONAL_LOOKBACK_YEARS
  );

  /* --- summary column visibility and widths --- */
  const allSummaryColumnLabels = useMemo(() => SUMMARY_COLUMNS.map((column) => column.label), []);
  const defaultSummaryColumnLabels = useMemo(
    () =>
      DEFAULT_SUMMARY_COLUMN_LABELS.filter((label) =>
        allSummaryColumnLabels.includes(label)
      ),
    [allSummaryColumnLabels]
  );
  const [visibleSummaryColumnLabels, setVisibleSummaryColumnLabels] =
    useState<string[]>(defaultSummaryColumnLabels);
  const visibleSummaryColumns = useMemo(
    () => SUMMARY_COLUMNS.filter((column) => visibleSummaryColumnLabels.includes(column.label)),
    [visibleSummaryColumnLabels]
  );
  const [summaryColWidths, setSummaryColWidths] = useState<Record<SummaryColumnKey, number>>(
    () =>
      Object.fromEntries(
        SUMMARY_COLUMNS.map((column) => [column.key, column.width])
      ) as Record<SummaryColumnKey, number>
  );
  const summaryColLefts = useMemo(() => {
    const lefts = new Map<SummaryColumnKey, number>();
    let left = 0;
    for (const column of visibleSummaryColumns) {
      lefts.set(column.key, left);
      left += summaryColWidths[column.key];
    }
    return lefts;
  }, [summaryColWidths, visibleSummaryColumns]);
  const totalStickyWidth = visibleSummaryColumns.reduce(
    (total, column) => total + summaryColWidths[column.key],
    0
  );

  const pivotResizing = useRef<{ colKey: SummaryColumnKey; startX: number; startW: number } | null>(null);
  const handlePivotResizeStart = useCallback((colKey: SummaryColumnKey, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = summaryColWidths[colKey];
    pivotResizing.current = { colKey, startX, startW };

    const onMove = (ev: MouseEvent) => {
      if (!pivotResizing.current) return;
      const delta = ev.clientX - pivotResizing.current.startX;
      const newW = Math.max(40, pivotResizing.current.startW + delta);
      setSummaryColWidths((prev) => ({
        ...prev,
        [pivotResizing.current!.colKey]: newW,
      }));
    };
    const onUp = () => {
      pivotResizing.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [summaryColWidths]);

  /* --- chart series visibility --- */
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(
    () => new Set(DEFAULT_VISIBLE_SERIES)
  );
  const [hiddenSeasonalYears, setHiddenSeasonalYears] = useState<Set<string>>(() => new Set());
  const toggleSeries = useCallback((key: string) => {
    setVisibleSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const hiddenDailySeries = useMemo(
    () => new Set(CHART_SERIES.filter((series) => !visibleSeries.has(series.key)).map((series) => series.key)),
    [visibleSeries]
  );
  const showAllDailySeries = useCallback(
    () => setVisibleSeries(new Set(CHART_SERIES.map((series) => series.key))),
    []
  );
  const hideAllDailySeries = useCallback(() => setVisibleSeries(new Set()), []);
  const toggleSeasonalYear = useCallback((year: string) => {
    setHiddenSeasonalYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }, []);
  const showSeasonalYears = useCallback((years: string[]) => {
    setHiddenSeasonalYears((prev) => {
      const next = new Set(prev);
      for (const year of years) next.delete(year);
      return next;
    });
  }, []);
  const hideSeasonalYears = useCallback((years: string[]) => {
    setHiddenSeasonalYears((prev) => new Set([...prev, ...years]));
  }, []);

  /* --- column visibility --- */
  const allColumnLabels = useMemo(() => COLUMNS.map((c) => c.label), []);
  const defaultColumnLabels = useMemo(
    () =>
      DEFAULT_HISTORICAL_NOMS_COLUMN_LABELS.filter((label) =>
        allColumnLabels.includes(label)
      ),
    [allColumnLabels]
  );
  const [visibleColumnLabels, setVisibleColumnLabels] = useState<string[]>(defaultColumnLabels);
  const visibleColumns = useMemo(
    () => COLUMNS.filter((c) => visibleColumnLabels.includes(c.label)),
    [visibleColumnLabels]
  );

  const visibleRows = rows;
  const freshness = useMemo(() => {
    let latestGasDay: string | null = null;
    let latestUpdateTimestamp: string | null = null;
    let latestUpdateMs = Number.NEGATIVE_INFINITY;

    for (const row of visibleRows) {
      const gasDay = dateOnly(row.gas_day);
      if (gasDay && (!latestGasDay || gasDay > latestGasDay)) {
        latestGasDay = gasDay;
      }

      if (row.update_timestamp) {
        const updateMs = new Date(row.update_timestamp).getTime();
        if (Number.isFinite(updateMs) && updateMs > latestUpdateMs) {
          latestUpdateMs = updateMs;
          latestUpdateTimestamp = row.update_timestamp;
        }
      }
    }

    const ageDays = latestGasDay ? Math.max(0, dateDiffDays(latestGasDay, todayStr())) : null;
    const status =
      ageDays === null
        ? "Unknown"
        : ageDays <= 1
          ? "Current"
          : ageDays <= 3
            ? "Lagging"
            : "Stale";
    const statusClass =
      status === "Current"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
        : status === "Lagging"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
          : status === "Stale"
            ? "border-red-500/40 bg-red-500/10 text-red-300"
            : "border-gray-700 bg-gray-900 text-gray-400";

    return {
      ageDays,
      latestGasDay,
      latestUpdateTimestamp,
      status,
      statusClass,
    };
  }, [visibleRows]);
  const freshnessSummary = useMemo<GenscapeNomsFreshnessSummary>(
    () => ({
      status: freshness.status,
      statusClass: freshness.statusClass,
      latestGasDayLabel: formatDateLabel(freshness.latestGasDay),
      latestUpdateLabel: formatTimestampLabel(freshness.latestUpdateTimestamp),
    }),
    [freshness]
  );

  useEffect(() => {
    onFreshnessChange?.(freshnessSummary);
  }, [freshnessSummary, onFreshnessChange]);

  /* --- chart data: one series per location_role_id --- */
  const chartDataByRoleId = useMemo(() => {
    if (visibleRows.length === 0) return [];

    const groups = new Map<
      number,
      { loc_name: string; points: Map<string, { scheduled: number; operational: number; available_cap: number; design_cap: number }> }
    >();

    for (const row of visibleRows) {
      let group = groups.get(row.location_role_id);
      if (!group) {
        group = { loc_name: row.loc_name, points: new Map() };
        groups.set(row.location_role_id, group);
      }
      const day = row.gas_day?.slice(0, 10);
      if (!day) continue;
      const existing = group.points.get(day);
      if (!existing) {
        group.points.set(day, {
          scheduled: row.scheduled_cap ?? 0,
          operational: row.operational_cap ?? 0,
          available_cap: row.available_cap ?? 0,
          design_cap: row.design_cap ?? 0,
        });
      } else {
        existing.scheduled += row.scheduled_cap ?? 0;
        existing.operational += row.operational_cap ?? 0;
        existing.available_cap += row.available_cap ?? 0;
        existing.design_cap += row.design_cap ?? 0;
      }
    }

    return Array.from(groups.entries()).map(([roleId, { loc_name, points }]) => {
      const data = Array.from(points.entries())
        .map(([day, vals]) => ({ gas_day: day, ...vals }))
        .sort((a, b) => b.gas_day.localeCompare(a.gas_day));
      return { roleId, loc_name, data };
    });
  }, [visibleRows]);

  /* --- pivot summary data: selected metric by (pipeline, tariff_zone, loc_name, role_id) × date --- */
  const activeMetricLabel =
    PIVOT_METRICS.find((metric) => metric.key === pivotMetricKey)?.label ?? "Metric";

  const seasonalChartDataByRoleId = useMemo(() => {
    if (seasonalRows.length === 0) return [];

    const groups = new Map<
      number,
      {
        loc_name: string;
        years: Set<string>;
        points: Map<string, { season_day: string; sortKey: string; values: Map<string, number> }>;
      }
    >();

    for (const row of seasonalRows) {
      const day = row.gas_day?.slice(0, 10);
      if (!day) continue;
      const year = day.slice(0, 4);
      const monthDay = day.slice(5);
      const metricValue = (row[pivotMetricKey] as number | null | undefined) ?? 0;

      let group = groups.get(row.location_role_id);
      if (!group) {
        group = { loc_name: row.loc_name, years: new Set(), points: new Map() };
        groups.set(row.location_role_id, group);
      }
      group.years.add(year);

      let point = group.points.get(monthDay);
      if (!point) {
        point = {
          season_day: fmtSeasonDay(monthDay),
          sortKey: monthDay,
          values: new Map(),
        };
        group.points.set(monthDay, point);
      }
      point.values.set(year, (point.values.get(year) ?? 0) + metricValue);
    }

    return Array.from(groups.entries()).map(([roleId, { loc_name, years, points }]) => {
      const sortedYears = Array.from(years).sort((a, b) => b.localeCompare(a));
      const data = Array.from(points.values())
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map((point) => {
          const chartRow: Record<string, string | number> = {
            season_day: point.season_day,
            sortKey: point.sortKey,
          };
          for (const year of sortedYears) {
            chartRow[year] = point.values.get(year) ?? 0;
          }
          return chartRow;
        });
      return { roleId, loc_name, years: sortedYears, data };
    });
  }, [pivotMetricKey, seasonalRows]);

  const pivotData = useMemo(() => {
    if (visibleRows.length === 0) {
      return {
        dates: [] as string[],
        weekGroups: [] as { label: string; span: number }[],
        pivotRows: [] as PivotRow[],
      };
    }

    const dateSet = new Set<string>();
    const groups = new Map<string, PivotRow>();

    for (const row of visibleRows) {
      const day = row.gas_day?.slice(0, 10);
      if (!day) continue;
      dateSet.add(day);

      const key =
        visibleSummaryColumns.length === 0
          ? "__all__"
          : visibleSummaryColumns
              .map((column) => String(row[column.key] ?? ""))
              .join("|");
      let group = groups.get(key);
      if (!group) {
        group = {
          groupKey: key,
          pipeline_short_name: row.pipeline_short_name,
          tariff_zone: row.tariff_zone,
          loc_name: row.loc_name,
          location_id: row.location_id,
          location_role_id: row.location_role_id,
          locationRoleIds: new Set([row.location_role_id]),
          facility: row.facility ?? "",
          role: row.role ?? "",
          sign: row.sign ?? 0,
          vendor_sign: row.vendor_sign ?? row.sign ?? 0,
          byDate: new Map(),
        };
        groups.set(key, group);
      }
      group.locationRoleIds.add(row.location_role_id);
      const val = (row[pivotMetricKey] as number) ?? 0;
      const existing = group.byDate.get(day) ?? 0;
      group.byDate.set(day, existing + val);
    }

    // Dates newest-first
    const dates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));

    // Group dates by week-ending-Friday for spanning headers
    const weekGroups: { label: string; span: number }[] = [];
    let currentFri = "";
    for (const d of dates) {
      const fri = getWeekFriday(d);
      if (fri !== currentFri) {
        const label = fmtPivotDate(fri);
        weekGroups.push({ label, span: 1 });
        currentFri = fri;
      } else {
        weekGroups[weekGroups.length - 1].span += 1;
      }
    }

    // Sort rows by pipeline → tariff zone → loc name → role id
    const pivotRows = Array.from(groups.values()).sort((a, b) => {
      for (const column of visibleSummaryColumns) {
        const aValue = a[column.key];
        const bValue = b[column.key];
        if (typeof aValue === "number" && typeof bValue === "number") {
          const numericCompare = aValue - bValue;
          if (numericCompare !== 0) return numericCompare;
        } else {
          const textCompare = String(aValue ?? "").localeCompare(String(bValue ?? ""));
          if (textCompare !== 0) return textCompare;
        }
      }

      return a.groupKey.localeCompare(b.groupKey);
    });

    return { dates, weekGroups, pivotRows };
  }, [visibleRows, pivotMetricKey, visibleSummaryColumns]);

  const summaryHeaderGroups = useMemo(
    () => buildSummaryHeaderGroups(pivotData.pivotRows, visibleSummaryColumns),
    [pivotData.pivotRows, visibleSummaryColumns]
  );

  // Heat is scaled per location row: each pivot row's values across all dates.
  const heatValuesByRow = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const pr of pivotData.pivotRows) {
      map.set(pr.groupKey, pivotData.dates.map((d) => pr.byDate.get(d) ?? 0));
    }
    return map;
  }, [pivotData]);

  // Clear cell selection whenever the underlying data set changes.
  useEffect(() => {
    setSelectedSummaryCells(new Set());
  }, [roleIdsParam, startDate, endDate, pivotMetricKey]);

  const summarySelectionStats = useMemo(() => {
    if (selectedSummaryCells.size === 0) return null;
    const rowByKey = new Map(pivotData.pivotRows.map((pr) => [pr.groupKey, pr]));
    const values: number[] = [];
    const rowKeys = new Set<string>();
    const dateKeys = new Set<string>();
    for (const key of selectedSummaryCells) {
      const date = key.slice(0, 10);
      const groupKey = key.slice(11);
      const pr = rowByKey.get(groupKey);
      if (!pr || !pr.byDate.has(date)) continue;
      rowKeys.add(groupKey);
      dateKeys.add(date);
      values.push(pr.byDate.get(date) ?? 0);
    }
    if (values.length === 0) return null;
    const sum = values.reduce((total, value) => total + value, 0);
    return {
      cells: values.length,
      rows: rowKeys.size,
      cols: dateKeys.size,
      sum,
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [selectedSummaryCells, pivotData.pivotRows]);

  const toggleSummaryRow = useCallback(
    (groupKey: string) => {
      setSelectedSummaryCells((prev) => {
        const keys = pivotData.dates.map((d) => summaryCellKey(groupKey, d));
        const allSelected = keys.length > 0 && keys.every((k) => prev.has(k));
        const next = new Set(prev);
        for (const k of keys) {
          if (allSelected) next.delete(k);
          else next.add(k);
        }
        return next;
      });
    },
    [pivotData.dates]
  );

  const toggleSummaryColumn = useCallback(
    (date: string) => {
      setSelectedSummaryCells((prev) => {
        const keys = pivotData.pivotRows.map((pr) => summaryCellKey(pr.groupKey, date));
        const allSelected = keys.length > 0 && keys.every((k) => prev.has(k));
        const next = new Set(prev);
        for (const k of keys) {
          if (allSelected) next.delete(k);
          else next.add(k);
        }
        return next;
      });
    },
    [pivotData.pivotRows]
  );

  const toggleSummaryCell = useCallback((groupKey: string, date: string) => {
    setSelectedSummaryCells((prev) => {
      const next = new Set(prev);
      const k = summaryCellKey(groupKey, date);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);
  const signedScheduleTotalsByDate = useMemo(() => {
    const totals = new Map<string, number>();

    for (const row of visibleRows) {
      const day = row.gas_day?.slice(0, 10);
      if (!day) continue;
      totals.set(day, (totals.get(day) ?? 0) + (row.signed_scheduled_cap ?? 0));
    }

    return totals;
  }, [visibleRows]);

  /* --- fetch ALL data (no server-side pagination; client-side page for table) --- */
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setOffset(0);

    if (!roleIdsParam) {
      setRows([]);
      setTotalCount(0);
      setLoading(false);
      return () => controller.abort();
    }

    const params = new URLSearchParams({
      limit: String(FETCH_LIMIT),
      offset: "0",
      locationRoleId: roleIdsParam,
      includeCount: "false",
    });
    if (startDate) params.set("start", startDate);
    if (endDate) params.set("end", endDate);

    const url = `/api/genscape-noms?${params}`;
    fetchFreshJson<GenscapeNomsResponse>(url, controller.signal)
      .then((json) => {
        setRows(applySignOverrides(json.rows ?? [], watchlist.signOverrides));
        setTotalCount(json.total_count ?? 0);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to load nominations data");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [startDate, endDate, refreshToken, roleIdsParam, watchlist.signOverrides]);

  useEffect(() => {
    const controller = new AbortController();

    if (activeView !== "seasonal-plots") {
      return () => controller.abort();
    }

    setSeasonalError(null);

    if (!roleIdsParam || !startDate || !endDate) {
      setSeasonalRows([]);
      setSeasonalLoading(false);
      return () => controller.abort();
    }

    const yearCount = Math.max(1, Math.min(20, seasonalLookbackYears));
    const windows = buildSeasonalDateWindows(startDate, endDate, yearCount);
    setSeasonalLoading(true);

    Promise.all(
      windows.map((window) => {
        const params = new URLSearchParams({
          limit: String(FETCH_LIMIT),
          offset: "0",
          locationRoleId: roleIdsParam,
          includeCount: "false",
          start: window.start,
          end: window.end,
        });
        return fetchFreshJson<GenscapeNomsResponse>(
          `/api/genscape-noms?${params}`,
          controller.signal
        );
      })
    )
      .then((responses) => {
        setSeasonalRows(
          applySignOverrides(
            responses.flatMap((response) => response.rows ?? []),
            watchlist.signOverrides
          )
        );
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSeasonalRows([]);
        setSeasonalError("Failed to load seasonal nominations data");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSeasonalLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    activeView,
    endDate,
    refreshToken,
    roleIdsParam,
    seasonalLookbackYears,
    startDate,
    watchlist.signOverrides,
  ]);

  /* --- lookback change --- */
  const handleLookbackChange = useCallback((days: number) => {
    setLookbackDays(days);
    setEndDate(todayStr());
    setStartDate(lookbackDate(days));
    setOffset(0);
  }, []);

  /* --- sort handler --- */
  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("desc");
      return field;
    });
  }, []);

  /* --- sort rows client-side --- */
  const sortedRows = [...visibleRows].sort((a, b) => {
    const aVal = a[sortField] ?? "";
    const bVal = b[sortField] ?? "";
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    }
    const cmp = String(aVal).localeCompare(String(bVal));
    return sortDir === "asc" ? cmp : -cmp;
  });

  /* --- client-side pagination over all fetched rows --- */
  const totalPages = Math.ceil(visibleRows.length / TABLE_PAGE_SIZE);
  const currentPage = Math.floor(offset / TABLE_PAGE_SIZE) + 1;
  const displayRows = sortedRows.slice(offset, offset + TABLE_PAGE_SIZE);

  const goToPage = useCallback((page: number) => {
    setOffset((page - 1) * TABLE_PAGE_SIZE);
  }, []);

  const handleSignChange = useCallback((locationRoleIds: Iterable<number>, sign: number) => {
    const roleIdSet = new Set(locationRoleIds);
    setRows((currentRows) =>
      currentRows.map((row) =>
        roleIdSet.has(row.location_role_id)
          ? {
              ...row,
              sign,
              signed_scheduled_cap: (row.scheduled_cap ?? 0) * sign,
            }
          : row
      )
    );
  }, []);

  const renderTableCell = useCallback(
    (row: NomRow, column: ColumnDef) => {
      if (column.key !== "sign") {
        return formatReportCell(row, column);
      }

      return (
        <select
          aria-label={`Sign for role ${row.location_role_id}`}
          value={String(row.sign ?? 0)}
          onChange={(event) =>
            handleSignChange([row.location_role_id], Number.parseInt(event.target.value, 10))
          }
          className="w-16 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-right font-mono text-xs text-gray-200 focus:border-gray-500 focus:outline-none"
        >
          <option value="-1">-1</option>
          <option value="0">0</option>
          <option value="1">1</option>
        </select>
      );
    },
    [handleSignChange]
  );

  const renderSummaryMetadataCell = useCallback(
    (row: PivotRow, column: (typeof SUMMARY_COLUMNS)[number]) => {
      if (column.key === "vendor_sign") {
        return (
          <span
            className="font-mono text-gray-400"
            title="Vendor sign from natgas.location_role"
          >
            {formatSignDisplay(row.vendor_sign)}
          </span>
        );
      }
      if (column.key !== "sign") {
        const value = row[column.key];
        return value === "" || value === null ? "--" : String(value);
      }

      return (
        <select
          aria-label={`Summary sign for ${row.pipeline_short_name} ${row.loc_name}`}
          value={String(row.sign ?? 0)}
          onChange={(event) =>
            handleSignChange(row.locationRoleIds, Number.parseInt(event.target.value, 10))
          }
          className="w-14 rounded-md border border-gray-600 bg-gray-700 px-1.5 py-0.5 text-right font-mono text-xs text-gray-100 focus:border-gray-400 focus:outline-none"
        >
          <option value="-1">-1</option>
          <option value="0">0</option>
          <option value="1">1</option>
        </select>
      );
    },
    [handleSignChange]
  );

  /* --- sort indicator --- */
  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field)
      return <span className="ml-1 text-gray-600">--</span>;
    return (
      <span className="ml-1 text-gray-400">
        {sortDir === "asc" ? "^" : "v"}
      </span>
    );
  }

  const renderDailyChart = (data: DailyChartPoint[], heightClass: string) => (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="gas_day"
            reversed
            tickFormatter={fmtDateShort}
            tick={{ fill: "#6b7280", fontSize: 11 }}
            stroke="#374151"
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => v.toLocaleString()}
            tick={{ fill: "#6b7280", fontSize: 11 }}
            stroke="#374151"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "8px",
              fontSize: 12,
            }}
            labelFormatter={(label) => fmtDateShort(String(label ?? ""))}
            formatter={(value) => Number(value ?? 0).toLocaleString()}
          />
          {CHART_SERIES.map(({ key, label, color }) =>
            visibleSeries.has(key) ? (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={label}
                stroke={color}
                strokeWidth={2}
                dot={false}
              />
            ) : null
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const renderSeasonalChart = (
    data: SeasonalChartPoint[],
    years: string[],
    heightClass: string
  ) => (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="season_day"
            tick={{ fill: "#6b7280", fontSize: 11 }}
            stroke="#374151"
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => v.toLocaleString()}
            tick={{ fill: "#6b7280", fontSize: 11 }}
            stroke="#374151"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "8px",
              fontSize: 12,
            }}
            formatter={(value, name) => [
              Number(value ?? 0).toLocaleString(),
              String(name),
            ]}
          />
          {years.map((year, index) =>
            hiddenSeasonalYears.has(year) ? null : (
              <Line
                key={year}
                type="monotone"
                dataKey={year}
                name={year}
                stroke={SEASONAL_YEAR_COLORS[index % SEASONAL_YEAR_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            )
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 rounded-lg border border-gray-800 bg-[#10131b]/95 p-3 shadow-xl shadow-black/20 backdrop-blur sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Date Range
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Lookback
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={lookbackDays}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (Number.isFinite(v) && v > 0) handleLookbackChange(v);
                    }}
                    className="w-24 rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Start
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setOffset(0);
                    }}
                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    End
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setOffset(0);
                    }}
                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {scopeControls && <div className="mt-4 border-t border-gray-800 pt-4">{scopeControls}</div>}

          <div className="mt-4 grid gap-3 border-t border-gray-800 pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Metric
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PIVOT_METRICS.map((metric) => (
                  <button
                    key={metric.key}
                    type="button"
                    onClick={() => setPivotMetricKey(metric.key)}
                    className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                      pivotMetricKey === metric.key
                        ? "bg-gray-200 text-gray-950"
                        : "border border-gray-800 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                    }`}
                  >
                    {metric.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Display
              </span>
              <div className="flex gap-1.5">
                {([["values", "Values"], ["dod", "DoD"]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPivotDisplay(key)}
                    className={`rounded-md px-3 py-1 text-xs transition-colors ${
                      pivotDisplay === key
                        ? "bg-gray-200 text-gray-950"
                        : "border border-gray-800 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-gray-800 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Report
            </p>
            <h2 className="text-sm font-semibold text-gray-100">{watchlist.name}</h2>
            <span className="text-xs text-gray-500">
              {watchlist.locationRoleIds.length.toLocaleString()} selected role IDs
            </span>
          </div>
      </div>

      {/* ---------- Loading / Error ---------- */}
      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="text-gray-500">Loading...</div>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center h-48">
          <div className="text-red-400">{error}</div>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-gray-800 bg-[#12141d]">
          <div className="text-sm text-gray-500">
            {roleIdsParam
              ? "No nominations found for this selection and date range."
              : emptyScopeMessage}
          </div>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5 border-b border-gray-800">
            {([
              ["summary", `Summary (${pivotData.pivotRows.length})`],
              ["rows", `Historical Noms (${rows.length.toLocaleString()})`],
              ["daily-plots", `Daily Plots (${chartDataByRoleId.length})`],
              [
                "seasonal-plots",
                `Seasonal Plots (${seasonalLoading ? "..." : seasonalChartDataByRoleId.length})`,
              ],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveView(key)}
                className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  activeView === key
                    ? "border-gray-200 text-gray-100"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ---------- Pivot Summary ---------- */}
      {!loading && !error && activeView === "summary" && pivotData.pivotRows.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d]">
          <div className="flex flex-col gap-1 border-b border-gray-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-300">Summary</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {pivotData.pivotRows.length} location{pivotData.pivotRows.length !== 1 ? "s" : ""} by {pivotData.dates.length} day{pivotData.dates.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={tableHeatmapEnabled}
                onClick={() => setTableHeatmapEnabled((enabled) => !enabled)}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tableHeatmapEnabled
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    tableHeatmapEnabled ? "bg-emerald-300" : "bg-gray-600"
                  }`}
                  aria-hidden="true"
                />
                Heatmap
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadSummaryCsv({
                    dates: pivotData.dates,
                    pivotRows: pivotData.pivotRows,
                    columns: visibleSummaryColumns,
                    orientation: summaryOrientation,
                    display: pivotDisplay,
                    metricLabel: activeMetricLabel,
                    signedScheduleTotalsByDate,
                  })
                }
                className="w-fit rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700"
              >
                Download CSV
              </button>
            </div>
          </div>
          <div className="space-y-3 px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Rows
                </span>
                <div className="flex gap-1.5">
                  {SUMMARY_ORIENTATION_OPTIONS.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSummaryOrientation(key)}
                      className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                        summaryOrientation === key
                          ? "bg-gray-200 text-gray-950"
                          : "border border-gray-800 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <MultiSelect
                label="Summary Columns"
                options={allSummaryColumnLabels}
                selected={visibleSummaryColumnLabels}
                onChange={setVisibleSummaryColumnLabels}
                placeholder="Select columns..."
                width="w-72"
              />
              <button
                type="button"
                onClick={() => setVisibleSummaryColumnLabels(allSummaryColumnLabels)}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => setVisibleSummaryColumnLabels(defaultSummaryColumnLabels)}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
              >
                Default
              </button>
              <button
                type="button"
                onClick={() => setVisibleSummaryColumnLabels([])}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
              >
                Clear All
              </button>
              <span className="pb-1.5 text-xs text-gray-500">
                {visibleSummaryColumns.length.toLocaleString()} of{" "}
                {allSummaryColumnLabels.length.toLocaleString()} columns visible
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {visibleSummaryColumns.length === 0 ? (
                <span className="text-xs text-gray-600">No summary columns selected.</span>
              ) : (
                visibleSummaryColumns.map((column) => (
                  <span
                    key={column.key}
                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-300"
                  >
                    <span className="truncate">{column.label}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleSummaryColumnLabels((labels) =>
                          labels.filter((label) => label !== column.label)
                        )
                      }
                      className="rounded px-1 text-gray-500 hover:bg-gray-800 hover:text-gray-200"
                      aria-label={`Hide ${column.label}`}
                    >
                      x
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
          {summaryOrientation === "locations" ? (
          <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse" style={{ minWidth: `${totalStickyWidth + pivotData.dates.length * 88}px` }}>
                <thead>
                  <tr>
                    {visibleSummaryColumns.map((column) => (
                      <th
                        key={column.key}
                        className={`sticky z-10 px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 border-b border-r border-gray-700 whitespace-nowrap select-none relative ${
                          column.key === "sign" ? "bg-gray-800" : "bg-[#12141d]"
                        }`}
                        style={{
                          left: summaryColLefts.get(column.key) ?? 0,
                          width: summaryColWidths[column.key],
                          minWidth: 40,
                          textAlign: column.align,
                        }}
                      >
                        {column.label}
                        <span
                          onMouseDown={(e) => handlePivotResizeStart(column.key, e)}
                          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-gray-600"
                        />
                      </th>
                    ))}
                    {pivotData.dates.map((d) => (
                      <th
                        key={d}
                        onClick={() => toggleSummaryColumn(d)}
                        title="Click to select this day across all locations"
                        className="cursor-pointer px-1 py-1.5 text-right text-[10px] font-medium text-gray-500 border-b border-gray-700 whitespace-nowrap hover:text-sky-300"
                      >
                        {fmtPivotDate(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-700 bg-gray-900/70">
                    {visibleSummaryColumns.map((column, columnIndex) => (
                      <td
                        key={`total-${column.key}`}
                        className={`sticky z-10 px-2 py-1 font-semibold text-gray-100 border-r border-gray-700 whitespace-nowrap overflow-hidden text-ellipsis ${
                          column.key === "sign" ? "bg-gray-800" : "bg-gray-900"
                        } ${
                          column.align === "right" && columnIndex !== 0 ? "text-right font-mono" : ""
                        }`}
                        style={{
                          left: summaryColLefts.get(column.key) ?? 0,
                          width: summaryColWidths[column.key],
                          maxWidth: summaryColWidths[column.key],
                        }}
                        title={columnIndex === 0 ? "Total Signed Sched" : ""}
                      >
                        {columnIndex === 0 ? "Total Signed Sched" : ""}
                      </td>
                    ))}
                    {pivotData.dates.map((day, dateIndex) => (
                      <td
                        key={`total-${day}`}
                        className="px-1 py-1 text-right font-mono font-semibold text-gray-100 whitespace-nowrap border-r border-gray-700/60"
                      >
                        {formatDailyTotalValue(
                          signedScheduleTotalsByDate,
                          pivotData.dates,
                          dateIndex,
                          pivotDisplay
                        )}
                      </td>
                    ))}
                  </tr>
                  {pivotData.pivotRows.map((pr) => {
                    const vals = pivotData.dates.map((d) => pr.byDate.get(d) ?? 0);

                    if (pivotDisplay === "values") {
                      return (
                        <tr key={pr.groupKey} className="hover:bg-gray-800/30">
                          {visibleSummaryColumns.map((column) => {
                            const value = pr[column.key];
                            const display = value === "" || value === null ? "--" : String(value);
                            const selectable =
                              column.key !== "sign" && column.key !== "vendor_sign";
                            return (
                              <td
                                key={column.key}
                                onClick={
                                  selectable ? () => toggleSummaryRow(pr.groupKey) : undefined
                                }
                                title={
                                  selectable
                                    ? "Click to select this location across all days"
                                    : display
                                }
                                className={`sticky z-10 px-2 py-1 text-gray-300 border-r border-gray-800 whitespace-nowrap overflow-hidden text-ellipsis ${
                                  column.key === "sign" ? "bg-gray-800/80" : "bg-[#12141d]"
                                } ${
                                  column.align === "right" ? "text-right font-mono" : ""
                                } ${selectable ? "cursor-pointer hover:text-sky-300" : ""}`}
                                style={{
                                  left: summaryColLefts.get(column.key) ?? 0,
                                  width: summaryColWidths[column.key],
                                  maxWidth: summaryColWidths[column.key],
                                }}
                              >
                                {renderSummaryMetadataCell(pr, column)}
                              </td>
                            );
                          })}
                          {vals.map((v, i) => {
                            const date = pivotData.dates[i];
                            const cellSelected = selectedSummaryCells.has(
                              summaryCellKey(pr.groupKey, date)
                            );
                            const heat =
                              tableHeatmapEnabled && !cellSelected
                                ? heatStyleFromValues(v, vals)
                                : undefined;
                            return (
                              <td
                                key={date}
                                onClick={() => toggleSummaryCell(pr.groupKey, date)}
                                style={cellSelected ? SELECTED_CELL_STYLE : heat}
                                className="cursor-pointer px-1 py-1 text-right text-gray-300 whitespace-nowrap font-mono border-r border-gray-800/30"
                              >
                                {fmtNum(v)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    }

                    // DoD mode
                    const dods = vals.map((v, i) =>
                      i < vals.length - 1 ? v - vals[i + 1] : null
                    );
                    return (
                      <tr key={pr.groupKey} className="hover:bg-gray-800/30">
                        {visibleSummaryColumns.map((column) => {
                          const value = pr[column.key];
                          const display = value === "" || value === null ? "--" : String(value);
                          return (
                            <td
                              key={column.key}
                              className={`sticky z-10 px-2 py-1 text-gray-300 border-r border-gray-800 whitespace-nowrap overflow-hidden text-ellipsis ${
                                column.key === "sign" ? "bg-gray-800/80" : "bg-[#12141d]"
                              } ${
                                column.align === "right" ? "text-right font-mono" : ""
                              }`}
                              style={{
                                left: summaryColLefts.get(column.key) ?? 0,
                                width: summaryColWidths[column.key],
                                maxWidth: summaryColWidths[column.key],
                              }}
                              title={display}
                            >
                              {renderSummaryMetadataCell(pr, column)}
                            </td>
                          );
                        })}
                        {dods.map((d, i) => {
                          const date = pivotData.dates[i];
                          const cellSelected = selectedSummaryCells.has(
                            summaryCellKey(pr.groupKey, date)
                          );
                          return (
                            <td
                              key={date}
                              onClick={() => toggleSummaryCell(pr.groupKey, date)}
                              style={cellSelected ? SELECTED_CELL_STYLE : undefined}
                              className="cursor-pointer px-1 py-1 text-right text-gray-300 whitespace-nowrap font-mono border-r border-gray-800/30"
                            >
                              {changeLabel(d, fmtNum(d))}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          </div>
          ) : visibleSummaryColumns.length === 0 ? (
            <div className="border-t border-gray-800 px-4 py-8 text-center text-sm text-gray-600">
              Select at least one summary column to identify pivoted locations.
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-gray-800">
              <table
                className="table-fixed border-collapse text-xs"
                style={{ width: `${216 + pivotData.pivotRows.length * 120}px` }}
              >
                <colgroup>
                  <col className="w-24" />
                  <col className="w-[120px]" />
                  {pivotData.pivotRows.map((pr) => (
                    <col
                      key={`${pr.groupKey}-col`}
                      className="w-[120px]"
                    />
                  ))}
                </colgroup>
                <thead>
                  {summaryHeaderGroups.map((groups, rowIndex) => {
                    const headerColumn = visibleSummaryColumns[rowIndex];
                    // Sign rows render one editable/value cell per location so each
                    // can be edited (and aligned) independently instead of merging
                    // adjacent equal values into a single colSpan group.
                    const perLocation =
                      headerColumn.key === "sign" || headerColumn.key === "vendor_sign";
                    return (
                      <tr key={headerColumn.key}>
                        <th
                          className={`sticky left-0 z-10 w-24 border-b border-r border-gray-700 px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 whitespace-nowrap ${
                            headerColumn.key === "sign"
                              ? "bg-gray-800"
                              : "bg-[#12141d]"
                          }`}
                        >
                          {headerColumn.label}
                        </th>
                        <th className="border-b border-r border-gray-800 bg-gray-900/70 px-2 py-1.5 text-center text-[10px] font-medium text-gray-500 whitespace-nowrap">
                          {rowIndex === 0 ? "Total" : ""}
                        </th>
                        {perLocation
                          ? pivotData.pivotRows.map((pr) => (
                              <th
                                key={`${pr.groupKey}-${headerColumn.key}`}
                                className={`border-b border-r border-gray-800 px-2 py-1.5 text-center text-[10px] font-medium text-gray-400 whitespace-nowrap ${
                                  headerColumn.key === "sign" ? "bg-gray-800/80" : ""
                                }`}
                              >
                                {renderSummaryMetadataCell(pr, headerColumn)}
                              </th>
                            ))
                          : groups.map((group) => (
                              <th
                                key={group.key}
                                colSpan={group.span}
                                className="border-b border-r border-gray-800 px-2 py-1.5 text-center text-[10px] font-medium text-gray-400 whitespace-nowrap"
                                title={group.label}
                              >
                                <span className="block truncate">{group.label}</span>
                              </th>
                            ))}
                      </tr>
                    );
                  })}
                  <tr>
                    <th className="sticky left-0 z-10 w-24 border-b border-r border-gray-700 bg-[#12141d] px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 whitespace-nowrap">
                      Gas Day
                    </th>
                    <th className="border-b border-r border-gray-700 bg-gray-900/70 px-2 py-1.5 text-center text-[10px] font-medium text-gray-300 whitespace-nowrap">
                      Total Signed Sched
                    </th>
                    {pivotData.pivotRows.map((pr) => (
                      <th
                        key={`${pr.groupKey}-metric`}
                        onClick={() => toggleSummaryRow(pr.groupKey)}
                        title="Click to select this location across all days"
                        className="cursor-pointer border-b border-r border-gray-700 px-2 py-1.5 text-center text-[10px] font-medium text-gray-500 whitespace-nowrap hover:text-sky-300"
                      >
                        {activeMetricLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pivotData.dates.map((day, dateIndex) => (
                    <tr key={day} className="hover:bg-gray-800/30">
                      <td
                        onClick={() => toggleSummaryColumn(day)}
                        title="Click to select this day across all locations"
                        className="sticky left-0 z-10 cursor-pointer border-r border-gray-800 bg-[#12141d] px-2 py-1 text-left text-gray-300 whitespace-nowrap hover:text-sky-300"
                      >
                        {fmtPivotDate(day)}
                      </td>
                      <td className="border-r border-gray-700/60 bg-gray-900/70 px-2 py-1 text-right font-mono font-semibold text-gray-100 whitespace-nowrap">
                        {formatDailyTotalValue(
                          signedScheduleTotalsByDate,
                          pivotData.dates,
                          dateIndex,
                          pivotDisplay
                        )}
                      </td>
                      {pivotData.pivotRows.map((pr) => {
                        const value = pr.byDate.get(day) ?? 0;
                        const nextDay = pivotData.dates[dateIndex + 1];
                        const display =
                          pivotDisplay === "values"
                            ? fmtNum(value)
                            : changeLabel(
                                nextDay ? value - (pr.byDate.get(nextDay) ?? 0) : null,
                                fmtNum(nextDay ? value - (pr.byDate.get(nextDay) ?? 0) : null)
                              );

                        const cellSelected = selectedSummaryCells.has(
                          summaryCellKey(pr.groupKey, day)
                        );
                        const heat =
                          tableHeatmapEnabled &&
                          pivotDisplay === "values" &&
                          !cellSelected
                            ? heatStyleFromValues(value, heatValuesByRow.get(pr.groupKey) ?? [])
                            : undefined;
                        return (
                          <td
                            key={`${pr.groupKey}-${day}`}
                            onClick={() => toggleSummaryCell(pr.groupKey, day)}
                            style={cellSelected ? SELECTED_CELL_STYLE : heat}
                            className="cursor-pointer border-r border-gray-800/30 px-2 py-1 text-right font-mono text-gray-300 whitespace-nowrap"
                          >
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeView === "summary" &&
        summarySelectionStats &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100vw-2rem)] max-w-5xl -translate-x-1/2 rounded-lg border border-sky-500/30 bg-[#090d15]/95 px-3 py-2 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-300">
              <span className="font-semibold text-sky-100">Selection</span>
              <span>
                <span className="text-gray-500">Count:</span>{" "}
                <span className="font-semibold tabular-nums text-gray-100">{summarySelectionStats.cells.toLocaleString()}</span>
              </span>
              <span>
                <span className="text-gray-500">Rows:</span>{" "}
                <span className="font-semibold tabular-nums text-gray-100">{summarySelectionStats.rows.toLocaleString()}</span>
              </span>
              <span>
                <span className="text-gray-500">Cols:</span>{" "}
                <span className="font-semibold tabular-nums text-gray-100">{summarySelectionStats.cols.toLocaleString()}</span>
              </span>
              <span>
                <span className="text-gray-500">Sum:</span>{" "}
                <span className="font-semibold tabular-nums text-gray-100">{fmtNum(summarySelectionStats.sum)}</span>
              </span>
              <span>
                <span className="text-gray-500">Average:</span>{" "}
                <span className="font-semibold tabular-nums text-gray-100">{fmtNum(summarySelectionStats.avg)}</span>
              </span>
              <span>
                <span className="text-gray-500">Min:</span>{" "}
                <span className="font-semibold tabular-nums text-gray-100">{fmtNum(summarySelectionStats.min)}</span>
              </span>
              <span>
                <span className="text-gray-500">Max:</span>{" "}
                <span className="font-semibold tabular-nums text-gray-100">{fmtNum(summarySelectionStats.max)}</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedSummaryCells(new Set())}
                className="ml-auto rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
              >
                Clear
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* ---------- Daily Plots ---------- */}
      {!loading && !error && activeView === "daily-plots" && chartDataByRoleId.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d]">
          <div className="border-b border-gray-800 px-4 py-3">
            <p className="text-sm font-medium text-gray-300">Daily Plots</p>
            <p className="mt-0.5 text-xs text-gray-500">
                {chartDataByRoleId.length} location role{chartDataByRoleId.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="p-4 space-y-4">
              <div className="grid gap-4 xl:grid-cols-2">
              {chartDataByRoleId.map(({ roleId, loc_name, data }) => (
                <PlotCard
                  key={roleId}
                  title={`Role ID ${roleId}`}
                  subtitle={loc_name || undefined}
                  series={DAILY_PLOT_SERIES}
                  hiddenSeries={hiddenDailySeries}
                  onToggleSeries={toggleSeries}
                  onShowAll={showAllDailySeries}
                  onHideAll={hideAllDailySeries}
                  focusedChildren={renderDailyChart(data, "h-[70vh]")}
                >
                  {renderDailyChart(data, "h-[320px]")}
                </PlotCard>
              ))}
              </div>
            </div>
        </div>
      )}

      {/* ---------- Seasonal Plots ---------- */}
      {!loading && !error && activeView === "seasonal-plots" && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d]">
          <div className="flex flex-col gap-3 border-b border-gray-800 px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-300">Seasonal Plots</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {activeMetricLabel} by MM-DD from {startDate?.slice(5)} to {endDate?.slice(5)}
                {" "}across {seasonalLookbackYears} year
                {seasonalLookbackYears !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Lookback Years
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={seasonalLookbackYears}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10);
                  if (Number.isFinite(next)) {
                    setSeasonalLookbackYears(Math.max(1, Math.min(20, next)));
                  }
                }}
                className="w-28 rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              />
            </div>
          </div>
          {seasonalLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-gray-500">
              Loading seasonal plots...
            </div>
          ) : seasonalError ? (
            <div className="flex h-48 items-center justify-center text-sm text-red-400">
              {seasonalError}
            </div>
          ) : seasonalChartDataByRoleId.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-gray-500">
              No seasonal nominations found for this MM-DD window.
            </div>
          ) : (
            <div className="grid gap-4 p-4 xl:grid-cols-2">
              {seasonalChartDataByRoleId.map(({ roleId, loc_name, years, data }) => (
              <PlotCard
                key={roleId}
                title={`Role ID ${roleId}`}
                subtitle={loc_name || undefined}
                series={years.map((year, index) => ({
                  key: year,
                  label: year,
                  color: SEASONAL_YEAR_COLORS[index % SEASONAL_YEAR_COLORS.length],
                  defaultVisible: true,
                }))}
                hiddenSeries={hiddenSeasonalYears}
                onToggleSeries={toggleSeasonalYear}
                onShowAll={() => showSeasonalYears(years)}
                onHideAll={() => hideSeasonalYears(years)}
                focusedChildren={renderSeasonalChart(data, years, "h-[70vh]")}
              >
                {renderSeasonalChart(data, years, "h-[320px]")}
              </PlotCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------- Table ---------- */}
      {!loading && !error && activeView === "rows" && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d]">
          <div className="flex flex-col gap-1 border-b border-gray-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-gray-300">Historical Noms</p>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-gray-500">
                {rows.length.toLocaleString()} rows | Page {currentPage} of {totalPages || 1}
              </p>
              {rows.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadCsv(sortedRows, visibleColumns)}
                  className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700"
                >
                  Download CSV
                </button>
              )}
            </div>
          </div>
              {/* Column picker */}
              <div className="space-y-3 px-4 py-3">
                <div className="flex flex-wrap items-end gap-3">
                <MultiSelect
                  label="Columns"
                  options={allColumnLabels}
                  selected={visibleColumnLabels}
                  onChange={setVisibleColumnLabels}
                  placeholder="Select columns..."
                  width="w-72"
                />
                <button
                  onClick={() => setVisibleColumnLabels(allColumnLabels)}
                  className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
                >
                  Select All
                </button>
                <button
                  onClick={() => setVisibleColumnLabels(defaultColumnLabels)}
                  className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
                >
                  Default
                </button>
                <button
                  onClick={() => setVisibleColumnLabels([])}
                  className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
                >
                  Clear All
                </button>
                  <span className="pb-1.5 text-xs text-gray-500">
                    {visibleColumns.length.toLocaleString()} of{" "}
                    {allColumnLabels.length.toLocaleString()} columns visible
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {visibleColumns.length === 0 ? (
                    <span className="text-xs text-gray-600">No columns selected.</span>
                  ) : (
                    visibleColumns.map((column) => (
                      <span
                        key={column.key}
                        className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-300"
                      >
                        <span className="truncate">{column.label}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleColumnLabels((labels) =>
                              labels.filter((label) => label !== column.label)
                            )
                          }
                          className="rounded px-1 text-gray-500 hover:bg-gray-800 hover:text-gray-200"
                          aria-label={`Hide ${column.label}`}
                        >
                          x
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="overflow-x-auto border-t border-gray-800">
                <table
                  className="w-full text-sm border-collapse"
                  style={{ minWidth: `${Math.max(visibleColumns.length, 1) * 120}px` }}
                >
                  <thead>
                    <tr>
                      {visibleColumns.length === 0 ? (
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 border-b border-gray-700">
                          Historical Noms
                        </th>
                      ) : (
                        visibleColumns.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className={`cursor-pointer px-3 py-2 text-left text-xs font-medium text-gray-400 border-b border-gray-700 whitespace-nowrap hover:text-gray-200 ${col.className ?? ""}`}
                        >
                          {col.label} <SortIcon field={col.key} />
                        </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleColumns.length === 0 ? (
                      <tr>
                        <td className="px-3 py-8 text-center text-sm text-gray-600">
                          Select at least one column to display historical nominations.
                        </td>
                      </tr>
                    ) : displayRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={Math.max(visibleColumns.length, 1)}
                          className="px-3 py-8 text-center text-sm text-gray-600"
                        >
                          No data found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      displayRows.map((row, idx) => (
                        <tr
                          key={`${row.location_role_id}-${row.gas_day}-${row.cycle_code}-${idx}`}
                          className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${
                            idx % 2 === 0 ? "bg-[#0f1117]" : "bg-[#12141d]"
                          }`}
                        >
                          {visibleColumns.map((col) => (
                            <td
                              key={col.key}
                              className={`px-3 py-1.5 text-sm text-gray-300 whitespace-nowrap ${col.className ?? ""}`}
                            >
                              {renderTableCell(row, col)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 border-t border-gray-800 py-3">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 7) {
                      page = i + 1;
                    } else if (currentPage <= 4) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 3) {
                      page = totalPages - 6 + i;
                    } else {
                      page = currentPage - 3 + i;
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => goToPage(page)}
                        className={`rounded-md px-3 py-1 text-xs transition-colors ${
                          page === currentPage
                            ? "bg-gray-600 text-white"
                            : "border border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
        </div>
      )}
    </div>
  );
}
