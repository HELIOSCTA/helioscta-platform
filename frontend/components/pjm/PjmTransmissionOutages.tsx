"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import ColumnFilterMenu, { type SortDirection } from "@/components/dashboard/ColumnFilterMenu";
import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type {
  TransmissionOutageChangeType,
  TransmissionOutageDetailPayload,
  TransmissionOutageDetailRecord,
  TransmissionOutageRow,
  TransmissionOutageTablePayload,
} from "@/lib/pjmTransmissionOutagesTypes";

type ColumnAlign = "left" | "right" | "center";
type SortState<Key extends string> = { key: Key; direction: SortDirection };
type ColumnFilters<Key extends string> = Partial<Record<Key, string[]>>;
type SortableValue = string | number | boolean | null | undefined;
type FreshnessSummary = {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
};

type TransmissionColumnKey =
  | "changeTypes"
  | "ticketId"
  | "zoneCompany"
  | "facilityName"
  | "startDate"
  | "startTime"
  | "endDate"
  | "endTime"
  | "currentStatus"
  | "statusTimestampText"
  | "previousStatus"
  | "availability"
  | "risk"
  | "onTime"
  | "lastEvaluatedText"
  | "dateLogCount"
  | "historyLogCount";
type ColumnMode = "core" | "all";

interface TableColumn {
  key: TransmissionColumnKey;
  label: string;
  width: number;
  align?: ColumnAlign;
  filterValues?: (row: TransmissionOutageRow) => string[];
  sortValue: (row: TransmissionOutageRow) => SortableValue;
  render: (row: TransmissionOutageRow) => ReactNode;
}

const API_CACHE_TTL_MS = 2 * 60 * 1000;
const API_PATH = "/api/pjm-transmission-outages";
const MAX_RENDERED_ROWS = 1_500;
const CORE_COLUMN_KEYS = new Set<TransmissionColumnKey>([
  "changeTypes",
  "ticketId",
  "zoneCompany",
  "facilityName",
  "startDate",
  "startTime",
  "endDate",
  "endTime",
  "currentStatus",
]);
const DEFAULT_FRESHNESS: FreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Transmission outages --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};
const CHANGE_LABELS: Record<TransmissionOutageChangeType, string> = {
  new: "New",
  status: "Status",
  window: "Window",
  facility: "Facility",
  date_log: "Date Log",
  history_log: "History",
  equipment: "Equipment",
  unchanged: "Unchanged",
};

function buildApiUrl(refresh: boolean): string {
  const params = new URLSearchParams({ limit: "10000" });
  if (refresh) params.set("refresh", "1");
  return `${API_PATH}?${params.toString()}`;
}

function buildDetailApiUrl(ticketId: string, refresh: boolean): string {
  const params = new URLSearchParams({ ticketId });
  if (refresh) params.set("refresh", "1");
  return `${API_PATH}?${params.toString()}`;
}

function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString();
}

function displayText(value: string | null | undefined): string {
  return value && value.trim() ? value : "-";
}

const MONTH_INDEX_BY_LABEL: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

function timestampParts(value: string | null | undefined): {
  date: string;
  time: string;
  sortableDate: number | null;
  sortableTime: number | null;
} {
  const text = value?.trim() ?? "";
  if (!text) {
    return { date: "-", time: "-", sortableDate: null, sortableTime: null };
  }

  const pjmMatch = text.match(/^(\d{1,2})-([A-Z]{3})-(\d{2,4})\s+(\d{3,4})$/i);
  if (pjmMatch) {
    const [, rawDay, rawMonthLabel, rawYear, rawTime] = pjmMatch;
    const monthLabel = rawMonthLabel.toUpperCase();
    const month = MONTH_INDEX_BY_LABEL[monthLabel];
    const day = Number(rawDay);
    const yearNumber = Number(rawYear);
    const fullYear = rawYear.length === 2 ? (yearNumber >= 70 ? 1900 + yearNumber : 2000 + yearNumber) : yearNumber;
    const paddedTime = rawTime.padStart(4, "0");
    const hour = Number(paddedTime.slice(0, 2));
    const minute = Number(paddedTime.slice(2, 4));

    return {
      date: `${rawDay.padStart(2, "0")}-${monthLabel}-${rawYear}`,
      time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      sortableDate: month ? fullYear * 10000 + month * 100 + day : null,
      sortableTime: hour * 60 + minute,
    };
  }

  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):?(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) {
    const [date = text, ...timeParts] = text.split(/\s+/);
    return {
      date,
      time: timeParts.join(" ") || "-",
      sortableDate: null,
      sortableTime: null,
    };
  }

  const [, rawMonth, rawDay, rawYear, rawHour, rawMinute, meridiem] = match;
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const yearNumber = Number(rawYear);
  const fullYear = rawYear.length === 2 ? (yearNumber >= 70 ? 1900 + yearNumber : 2000 + yearNumber) : yearNumber;
  let hour = Number(rawHour);
  const minute = Number(rawMinute);
  const normalizedMeridiem = meridiem?.toUpperCase();

  if (normalizedMeridiem === "AM" && hour === 12) hour = 0;
  if (normalizedMeridiem === "PM" && hour < 12) hour += 12;

  const sortableDate = fullYear * 10000 + month * 100 + day;
  const sortableTime = hour * 60 + minute;
  return {
    date: `${rawMonth.padStart(2, "0")}/${rawDay.padStart(2, "0")}/${rawYear}`,
    time: `${rawHour.padStart(2, "0")}:${rawMinute}${normalizedMeridiem ? ` ${normalizedMeridiem}` : ""}`,
    sortableDate,
    sortableTime,
  };
}

function timestampDateText(value: string | null | undefined): string {
  return timestampParts(value).date;
}

function timestampTimeText(value: string | null | undefined): string {
  return timestampParts(value).time;
}

function timestampDateSortValue(value: string | null | undefined): SortableValue {
  const parts = timestampParts(value);
  return parts.sortableDate ?? parts.date;
}

function timestampTimeSortValue(value: string | null | undefined): SortableValue {
  const parts = timestampParts(value);
  return parts.sortableTime ?? parts.time;
}

function fmtTimestamp(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").replace("Z", "").slice(0, 19);
}

function sourceTimezoneLabel(value: string | null | undefined): string {
  if (!value) return "";
  if (value === "America/New_York") return "Eastern Time";
  return value.replace(/_/g, " ");
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function changeLabel(change: TransmissionOutageChangeType): string {
  return CHANGE_LABELS[change] ?? change;
}

function changeTone(change: TransmissionOutageChangeType): string {
  if (change === "new") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (change === "status") return "border-amber-500/45 bg-amber-500/10 text-amber-200";
  if (change === "window") return "border-sky-500/45 bg-sky-500/10 text-sky-200";
  if (change === "facility" || change === "equipment") {
    return "border-violet-500/35 bg-violet-500/10 text-violet-200";
  }
  if (change === "date_log" || change === "history_log") {
    return "border-cyan-500/35 bg-cyan-500/10 text-cyan-200";
  }
  return "border-gray-800 bg-gray-950 text-gray-500";
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.startsWith("active")) {
    return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
  }
  if (normalized.startsWith("complete") || normalized.startsWith("cancel")) {
    return "border-gray-700 bg-gray-900 text-gray-300";
  }
  if (normalized.startsWith("revised")) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  }
  if (normalized.startsWith("received")) {
    return "border-sky-500/35 bg-sky-500/10 text-sky-200";
  }
  return "border-gray-800 bg-gray-950 text-gray-400";
}

function SortableHeader({
  column,
  sortState,
  selectedFilters,
  filterOptions,
  onSort,
  onFilterChange,
}: {
  column: TableColumn;
  sortState: SortState<TransmissionColumnKey>;
  selectedFilters: string[];
  filterOptions: string[];
  onSort: (key: TransmissionColumnKey, direction?: SortDirection) => void;
  onFilterChange: (key: TransmissionColumnKey, values: string[]) => void;
}) {
  const activeSort = sortState.key === column.key ? sortState.direction : null;
  const justify =
    column.align === "right" ? "justify-end text-right" : column.align === "center" ? "justify-center text-center" : "justify-start text-left";

  return (
    <th
      className={`sticky top-0 z-20 border-r border-gray-800 bg-gray-950 px-2 py-1.5 font-semibold uppercase text-gray-500 ${
        column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"
      }`}
    >
      <div className={`flex w-full min-w-0 items-center gap-1 ${justify}`}>
        <button
          type="button"
          onClick={() => onSort(column.key)}
          className={`flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-gray-900 ${justify} ${
            activeSort ? "text-sky-200" : "text-gray-400"
          }`}
          aria-label={`Sort ${column.label}`}
        >
          <span className="whitespace-normal break-words text-[10px] leading-tight">{column.label}</span>
          <span className="w-3 shrink-0 text-right text-[10px] text-sky-300">
            {activeSort === "asc" ? "\u2191" : activeSort === "desc" ? "\u2193" : ""}
          </span>
        </button>
        {filterOptions.length > 0 && (
          <ColumnFilterMenu
            label={column.label}
            options={filterOptions}
            selected={selectedFilters}
            sortDirection={activeSort}
            onSort={(direction) => onSort(column.key, direction)}
            onChange={(values) => onFilterChange(column.key, values)}
          />
        )}
      </div>
    </th>
  );
}

function StatusBadge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

function ChangeBadges({ changes }: { changes: TransmissionOutageChangeType[] }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {changes.map((change) => (
        <span
          key={change}
          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${changeTone(change)}`}
        >
          {changeLabel(change)}
        </span>
      ))}
    </div>
  );
}

function tableCellContentClass(): string {
  return "min-w-0 whitespace-normal break-words leading-4";
}

function compareSortableValues(
  left: SortableValue,
  right: SortableValue,
  direction: SortDirection,
): number {
  const leftEmpty = left === null || left === undefined || left === "";
  const rightEmpty = right === null || right === undefined || right === "";
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  let comparison: number;
  if (typeof left === "number" && typeof right === "number") {
    comparison = left - right;
  } else if (typeof left === "boolean" && typeof right === "boolean") {
    comparison = Number(left) - Number(right);
  } else {
    comparison = String(left).localeCompare(String(right), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }
  return direction === "asc" ? comparison : -comparison;
}

function selectedFilterMatches(values: string[], selected: string[]): boolean {
  if (selected.length === 0) return true;
  const normalizedValues = new Set(values.map(normalizeSearchText));
  return selected.some((value) => normalizedValues.has(normalizeSearchText(value)));
}

function rowSearchText(row: TransmissionOutageRow): string {
  return [
    row.ticketId,
    row.zoneCompany,
    row.facilityName,
    row.startAtText,
    timestampDateText(row.startAtText),
    timestampTimeText(row.startAtText),
    row.endAtText,
    timestampDateText(row.endAtText),
    timestampTimeText(row.endAtText),
    row.currentStatus,
    row.previousStatus,
    row.availability,
    row.risk,
    row.onTime,
    row.changeTypes.map(changeLabel).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function uniqueSortedTexts(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
  );
}

function columnFilterValues(column: TableColumn, row: TransmissionOutageRow): string[] {
  return column.filterValues?.(row) ?? [String(column.sortValue(row) ?? "")];
}

function buildFilterOptionsByColumn(
  rows: TransmissionOutageRow[],
): Partial<Record<TransmissionColumnKey, string[]>> {
  return Object.fromEntries(
    TABLE_COLUMNS.map((column) => [
      column.key,
      uniqueSortedTexts(rows.flatMap((row) => columnFilterValues(column, row))),
    ]),
  );
}

function freshnessFromPayload(payload: TransmissionOutageTablePayload | null): FreshnessSummary {
  if (!payload?.selectedSnapshot) return DEFAULT_FRESHNESS;
  const changed = payload.summary.changedTicketCount;
  return {
    status: payload.summary.latestTicketCount > 0 ? "Current" : "No Data",
    statusClass:
      payload.summary.latestTicketCount > 0
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
        : "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
    summary: `Transmission | ${fmtNumber(payload.summary.latestTicketCount)} tickets | ${fmtNumber(changed)} changed`,
    targetDateLabel: "Scheduled Outages",
    latestDateLabel: fmtTimestamp(payload.selectedSnapshot.sourceReportTimestamp),
    latestUpdateLabel: fmtTimestamp(payload.selectedSnapshot.ingestedAt),
  };
}

function FieldDiff({
  label,
  current,
  prior,
}: {
  label: string;
  current: string | number;
  prior: string | number | null | undefined;
}) {
  const changed = prior !== null && prior !== undefined && String(current) !== String(prior);
  return (
    <div className="grid gap-1 border-b border-gray-800/70 py-2 last:border-b-0 sm:grid-cols-[130px_1fr]">
      <div className="text-[10px] font-semibold uppercase text-gray-500">{label}</div>
      <div className="min-w-0 text-xs text-gray-300">
        {changed ? (
          <span>
            <span className="text-gray-500">{displayText(String(prior))}</span>
            <span className="px-2 text-sky-300">-&gt;</span>
            <span className="font-semibold text-sky-100">{displayText(String(current))}</span>
          </span>
        ) : (
          displayText(String(current))
        )}
      </div>
    </div>
  );
}

function LinesBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-xs font-semibold text-gray-200">{title}</h3>
      <div className="max-h-56 overflow-auto rounded-md border border-gray-800 bg-[#090d14] p-2 font-mono text-[11px] leading-5 text-gray-300">
        {lines.length === 0 ? (
          <div className="text-gray-600">No lines</div>
        ) : (
          lines.map((line, index) => (
            <div key={`${title}-${index}`} className="whitespace-pre">
              {line}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function DetailSnapshotPanel({ record }: { record: TransmissionOutageDetailRecord }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-x-4 sm:grid-cols-2">
        <FieldDiff label="Facility" current={record.facilityName} prior={record.prior?.facilityName} />
        <FieldDiff label="Zone" current={record.zoneCompany} prior={record.zoneCompany} />
        <FieldDiff label="Start" current={record.startAtText} prior={record.prior?.startAtText} />
        <FieldDiff label="End" current={record.endAtText} prior={record.prior?.endAtText} />
        <FieldDiff label="Status" current={record.currentStatus} prior={record.prior?.currentStatus} />
        <FieldDiff label="Status Time" current={record.statusTimestampText} prior={record.prior?.statusTimestampText} />
        <FieldDiff label="Previous" current={record.previousStatus} prior={record.prior?.previousStatus} />
        <FieldDiff label="Evaluated" current={record.lastEvaluatedText} prior={record.prior?.lastEvaluatedText} />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <LinesBlock title={`Date Log (${record.dateLogLines.length})`} lines={record.dateLogLines} />
        <LinesBlock title={`History (${record.historyLogLines.length})`} lines={record.historyLogLines} />
        <LinesBlock title={`Equipment (${record.detailLines.length})`} lines={record.detailLines} />
      </div>
      <LinesBlock title="Raw Header" lines={[record.rawHeaderLine]} />
    </div>
  );
}

function DetailModal({
  ticketId,
  payload,
  loading,
  error,
  onClose,
  onReload,
}: {
  ticketId: string;
  payload: TransmissionOutageDetailPayload | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onReload: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Transmission outage ${ticketId}`}
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[88vh] w-[1180px] max-w-full flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-950 text-gray-200 shadow-2xl shadow-black/70"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-100">Ticket {ticketId}</h2>
            <p className="mt-1 text-xs text-gray-500">
              {payload?.snapshots.map((item) => fmtTimestamp(item.snapshot.sourceReportTimestamp)).join(" | ") ?? "Loading"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onReload}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading && (
            <div className="rounded-lg border border-gray-800 bg-[#12141d] p-5 text-sm text-gray-500">
              Loading ticket detail...
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {payload && !loading && !error && (
            <div className="space-y-5">
              {payload.snapshots.map((item, index) => (
                <section key={item.snapshot.sourceFileSha256} className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-100">
                      {index === 0 ? "Latest Snapshot" : "Prior Snapshot"}
                    </h3>
                    <StatusBadge
                      label={fmtTimestamp(item.snapshot.sourceReportTimestamp)}
                      className="border-gray-700 bg-gray-900 text-gray-300"
                    />
                    <StatusBadge
                      label={`${fmtNumber(item.snapshot.scheduledOutageCount)} scheduled`}
                      className="border-gray-700 bg-gray-900 text-gray-400"
                    />
                  </div>
                  {item.record ? (
                    <DetailSnapshotPanel record={item.record} />
                  ) : (
                    <div className="rounded-md border border-gray-800 bg-[#12141d] p-3 text-sm text-gray-500">
                      Ticket not present in this snapshot.
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const TABLE_COLUMNS: TableColumn[] = [
  {
    key: "changeTypes",
    label: "Changes",
    width: 280,
    filterValues: (row) => row.changeTypes.map(changeLabel),
    sortValue: (row) => row.changeTypes.join(","),
    render: (row) => <ChangeBadges changes={row.changeTypes} />,
  },
  {
    key: "ticketId",
    label: "Ticket",
    width: 110,
    filterValues: (row) => [row.ticketId],
    sortValue: (row) => row.ticketId,
    render: (row) => row.ticketId,
  },
  {
    key: "zoneCompany",
    label: "Zone",
    width: 112,
    filterValues: (row) => [row.zoneCompany],
    sortValue: (row) => row.zoneCompany,
    render: (row) => row.zoneCompany,
  },
  {
    key: "facilityName",
    label: "Facility",
    width: 480,
    filterValues: (row) => [row.facilityName],
    sortValue: (row) => row.facilityName,
    render: (row) => row.facilityName,
  },
  {
    key: "startDate",
    label: "Start Date",
    width: 112,
    filterValues: (row) => [timestampDateText(row.startAtText)],
    sortValue: (row) => timestampDateSortValue(row.startAtText),
    render: (row) => timestampDateText(row.startAtText),
  },
  {
    key: "startTime",
    label: "Start Time",
    width: 108,
    filterValues: (row) => [timestampTimeText(row.startAtText)],
    sortValue: (row) => timestampTimeSortValue(row.startAtText),
    render: (row) => timestampTimeText(row.startAtText),
  },
  {
    key: "endDate",
    label: "End Date",
    width: 112,
    filterValues: (row) => [timestampDateText(row.endAtText)],
    sortValue: (row) => timestampDateSortValue(row.endAtText),
    render: (row) => timestampDateText(row.endAtText),
  },
  {
    key: "endTime",
    label: "End Time",
    width: 108,
    filterValues: (row) => [timestampTimeText(row.endAtText)],
    sortValue: (row) => timestampTimeSortValue(row.endAtText),
    render: (row) => timestampTimeText(row.endAtText),
  },
  {
    key: "currentStatus",
    label: "Status",
    width: 122,
    filterValues: (row) => [row.currentStatus],
    sortValue: (row) => row.currentStatus,
    render: (row) => (
      <StatusBadge label={displayText(row.currentStatus)} className={statusTone(row.currentStatus)} />
    ),
  },
  {
    key: "statusTimestampText",
    label: "Revised At",
    width: 166,
    filterValues: (row) => [row.statusTimestampText],
    sortValue: (row) => row.statusTimestampText,
    render: (row) => row.statusTimestampText,
  },
  {
    key: "previousStatus",
    label: "Prev",
    width: 128,
    filterValues: (row) => [row.previousStatus],
    sortValue: (row) => row.previousStatus,
    render: (row) => row.previousStatus,
  },
  {
    key: "availability",
    label: "Avail",
    width: 124,
    filterValues: (row) => [row.availability],
    sortValue: (row) => row.availability,
    render: (row) => row.availability,
  },
  {
    key: "risk",
    label: "Risk",
    width: 90,
    align: "center",
    filterValues: (row) => [row.risk],
    sortValue: (row) => row.risk,
    render: (row) => row.risk,
  },
  {
    key: "onTime",
    label: "On Time",
    width: 104,
    align: "center",
    filterValues: (row) => [row.onTime],
    sortValue: (row) => row.onTime,
    render: (row) => row.onTime,
  },
  {
    key: "lastEvaluatedText",
    label: "Evaluated",
    width: 166,
    filterValues: (row) => [row.lastEvaluatedText],
    sortValue: (row) => row.lastEvaluatedText,
    render: (row) => row.lastEvaluatedText,
  },
  {
    key: "dateLogCount",
    label: "Dates",
    width: 92,
    align: "right",
    filterValues: (row) => [String(row.dateLogCount)],
    sortValue: (row) => row.dateLogCount,
    render: (row) => fmtNumber(row.dateLogCount),
  },
  {
    key: "historyLogCount",
    label: "Hist",
    width: 92,
    align: "right",
    filterValues: (row) => [String(row.historyLogCount)],
    sortValue: (row) => row.historyLogCount,
    render: (row) => fmtNumber(row.historyLogCount),
  },
];

function TransmissionOutageTable({
  payload,
  rows,
  columns,
  filterOptionsByColumn,
  sortState,
  columnFilters,
  columnMode,
  search,
  changedOnly,
  activeFilterCount,
  onSort,
  onFilterChange,
  onColumnModeChange,
  onSearchChange,
  onChangedOnlyChange,
  onClearFilters,
  onInspect,
}: {
  payload: TransmissionOutageTablePayload;
  rows: TransmissionOutageRow[];
  columns: TableColumn[];
  filterOptionsByColumn: Partial<Record<TransmissionColumnKey, string[]>>;
  sortState: SortState<TransmissionColumnKey>;
  columnFilters: ColumnFilters<TransmissionColumnKey>;
  columnMode: ColumnMode;
  search: string;
  changedOnly: boolean;
  activeFilterCount: number;
  onSort: (key: TransmissionColumnKey, direction?: SortDirection) => void;
  onFilterChange: (key: TransmissionColumnKey, values: string[]) => void;
  onColumnModeChange: (mode: ColumnMode) => void;
  onSearchChange: (value: string) => void;
  onChangedOnlyChange: () => void;
  onClearFilters: () => void;
  onInspect: (ticketId: string) => void;
}) {
  const renderedRows = rows.slice(0, MAX_RENDERED_ROWS);
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 92);
  const latestSnapshotTime = fmtTimestamp(payload.selectedSnapshot?.sourceReportTimestamp);
  const latestSnapshotTimezone = sourceTimezoneLabel(payload.selectedSnapshot?.sourceReportTimezone);

  return (
    <DataTableShell
      title="Transmission Outage Tickets"
      subtitle={`${fmtNumber(rows.length)} filtered from ${fmtNumber(payload.summary.latestTicketCount)} scheduled tickets | ${fmtNumber(payload.summary.changedTicketCount)} changed | ${fmtNumber(payload.summary.newTicketCount)} new | ${fmtNumber(payload.summary.statusChangeCount)} status | ${fmtNumber(payload.summary.windowChangeCount)} windows`}
      bodyClassName="max-h-[calc(100vh-310px)] overflow-auto"
      action={
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 lg:flex-nowrap">
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search ticket, zone, facility, status"
            className="h-8 w-[520px] max-w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:border-sky-500/60 lg:min-w-[420px]"
          />
          <div
            className="inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2.5 text-[11px] text-emerald-100"
            title={`${latestSnapshotTime}${latestSnapshotTimezone ? ` ${latestSnapshotTimezone}` : ""}`}
          >
            <span className="font-semibold uppercase text-emerald-300">Snapshot</span>
            <span className="font-mono">{latestSnapshotTime}</span>
            {latestSnapshotTimezone && (
              <span className="rounded border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-emerald-200">
                {latestSnapshotTimezone}
              </span>
            )}
          </div>
          <button
            type="button"
            aria-pressed={changedOnly}
            onClick={onChangedOnlyChange}
            className={`h-8 rounded-md border px-3 text-xs font-semibold transition-colors ${
              changedOnly
                ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600 hover:text-gray-100"
            }`}
          >
            Changed Only
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="h-8 rounded-md border border-gray-700 bg-gray-900 px-3 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-600 hover:text-gray-100"
            >
              Clear ({activeFilterCount})
            </button>
          )}
          <div className="flex rounded-md border border-gray-700 bg-gray-950/70 p-0.5">
            <button
              type="button"
              onClick={() => onColumnModeChange("core")}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                columnMode === "core"
                  ? "bg-sky-500/20 text-sky-100"
                  : "text-gray-500 hover:text-gray-200"
              }`}
            >
              Core
            </button>
            <button
              type="button"
              onClick={() => onColumnModeChange("all")}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                columnMode === "all"
                  ? "bg-sky-500/20 text-sky-100"
                  : "text-gray-500 hover:text-gray-200"
              }`}
            >
              All Columns
            </button>
          </div>
        </div>
      }
    >
      <table
        className="table-fixed border-collapse bg-[#0d1119] text-[11px] text-gray-200"
        style={{ width: tableWidth }}
      >
        <colgroup>
          <col style={{ width: 92 }} />
          {columns.map((column) => (
            <col key={column.key} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-gray-800">
            <th className="sticky top-0 z-20 border-r border-gray-800 bg-gray-950 px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-gray-500">
              Inspect
            </th>
            {columns.map((column) => (
              <SortableHeader
                key={column.key}
                column={column}
                sortState={sortState}
                selectedFilters={columnFilters[column.key] ?? []}
                filterOptions={filterOptionsByColumn[column.key] ?? []}
                onSort={onSort}
                onFilterChange={onFilterChange}
              />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {renderedRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="px-3 py-8 text-sm text-gray-500">
                No tickets match the active filters.
              </td>
            </tr>
          ) : (
            renderedRows.map((row) => (
              <tr key={row.ticketId} className="hover:bg-gray-900/60">
                <td className="border-r border-gray-800 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => onInspect(row.ticketId)}
                    className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-[10px] font-semibold text-gray-300 transition-colors hover:border-sky-500/60 hover:text-sky-100"
                  >
                    View
                  </button>
                </td>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`border-r border-gray-800 px-2 py-1.5 align-top ${
                      column.align === "right"
                        ? "text-right tabular-nums"
                        : column.align === "center"
                          ? "text-center"
                          : "text-left"
                    }`}
                    title={String(column.sortValue(row) ?? "")}
                  >
                    <div className={tableCellContentClass()}>{column.render(row)}</div>
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {rows.length > renderedRows.length && (
        <div className="border-t border-gray-800 bg-gray-950 px-3 py-2 text-xs text-gray-500">
          Showing {fmtNumber(renderedRows.length)} of {fmtNumber(rows.length)} filtered tickets.
        </div>
      )}
    </DataTableShell>
  );
}

export default function PjmTransmissionOutages({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: FreshnessSummary) => void;
}) {
  const [payload, setPayload] = useState<TransmissionOutageTablePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [columnMode, setColumnMode] = useState<ColumnMode>("core");
  const [sortState, setSortState] = useState<SortState<TransmissionColumnKey>>({
    key: "changeTypes",
    direction: "desc",
  });
  const [columnFilters, setColumnFilters] = useState<ColumnFilters<TransmissionColumnKey>>({});
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [detailPayload, setDetailPayload] = useState<TransmissionOutageDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    fetchJsonWithCache<TransmissionOutageTablePayload>({
      key: "api:pjm-transmission-outages:latest",
      url: buildApiUrl(refreshToken > 0),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
    })
      .then((data) => {
        if (!active) return;
        setPayload(data);
        onFreshnessChange?.(freshnessFromPayload(data));
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setError(err.message || "Failed to load transmission outages");
        setPayload(null);
        onFreshnessChange?.({
          ...DEFAULT_FRESHNESS,
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Transmission outage query failed",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [onFreshnessChange, refreshToken]);

  const loadDetail = (ticketId: string, forceRefresh = false) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetailPayload(null);
    fetchJsonWithCache<TransmissionOutageDetailPayload>({
      key: ["api:pjm-transmission-outages", "detail", ticketId].join(":"),
      url: buildDetailApiUrl(ticketId, forceRefresh || refreshToken > 0),
      ttlMs: API_CACHE_TTL_MS,
      cacheMode: forceRefresh || refreshToken > 0 ? "no-store" : "default",
      forceRefresh: forceRefresh || refreshToken > 0,
    })
      .then(setDetailPayload)
      .catch((err: Error) => {
        setDetailError(err.message || "Failed to load ticket detail");
      })
      .finally(() => setDetailLoading(false));
  };

  const openDetail = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    loadDetail(ticketId);
  };

  const activeFilterCount =
    Object.values(columnFilters).reduce((sum, values) => sum + (values?.length ?? 0), 0) +
    (search.trim() ? 1 : 0) +
    (changedOnly ? 1 : 0);

  const visibleColumns = useMemo(
    () =>
      columnMode === "core"
        ? TABLE_COLUMNS.filter((column) => CORE_COLUMN_KEYS.has(column.key))
        : TABLE_COLUMNS,
    [columnMode],
  );

  const filterOptionsByColumn = useMemo(
    () => buildFilterOptionsByColumn(payload?.rows ?? []),
    [payload?.rows],
  );

  const filteredRows = useMemo(() => {
    if (!payload) return [];
    const searchText = normalizeSearchText(search);
    return payload.rows.filter((row) => {
      if (changedOnly && !row.changed) return false;
      if (searchText && !rowSearchText(row).includes(searchText)) return false;
      return TABLE_COLUMNS.every((column) => {
        const selected = columnFilters[column.key] ?? [];
        if (selected.length === 0) return true;
        const values = column.filterValues?.(row) ?? [String(column.sortValue(row) ?? "")];
        return selectedFilterMatches(values, selected);
      });
    });
  }, [changedOnly, columnFilters, payload, search]);

  const sortedRows = useMemo(() => {
    const column = TABLE_COLUMNS.find((candidate) => candidate.key === sortState.key);
    if (!column) return filteredRows;
    return [...filteredRows].sort((left, right) => {
      const primary = compareSortableValues(
        column.sortValue(left),
        column.sortValue(right),
        sortState.direction,
      );
      if (primary !== 0) return primary;
      return left.ticketId.localeCompare(right.ticketId, undefined, { numeric: true });
    });
  }, [filteredRows, sortState]);

  const updateSort = (key: TransmissionColumnKey, direction?: SortDirection) => {
    setSortState((current) => {
      if (direction) return { key, direction };
      if (current.key !== key) return { key, direction: "asc" };
      return { key, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  };

  const updateFilter = (key: TransmissionColumnKey, values: string[]) => {
    setColumnFilters((current) => ({ ...current, [key]: values }));
  };

  const clearFilters = () => {
    setSearch("");
    setChangedOnly(false);
    setColumnFilters({});
  };

  return (
    <div className="w-full space-y-3">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading transmission outages...
        </div>
      )}

      {payload && !loading && (
        <TransmissionOutageTable
          payload={payload}
          rows={sortedRows}
          columns={visibleColumns}
          filterOptionsByColumn={filterOptionsByColumn}
          sortState={sortState}
          columnFilters={columnFilters}
          columnMode={columnMode}
          search={search}
          changedOnly={changedOnly}
          activeFilterCount={activeFilterCount}
          onSort={updateSort}
          onFilterChange={updateFilter}
          onColumnModeChange={setColumnMode}
          onSearchChange={setSearch}
          onChangedOnlyChange={() => setChangedOnly((value) => !value)}
          onClearFilters={clearFilters}
          onInspect={openDetail}
        />
      )}

      {selectedTicketId && (
        <DetailModal
          ticketId={selectedTicketId}
          payload={detailPayload}
          loading={detailLoading}
          error={detailError}
          onClose={() => setSelectedTicketId(null)}
          onReload={() => loadDetail(selectedTicketId, true)}
        />
      )}
    </div>
  );
}
