"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import ColumnFilterMenu, { type SortDirection } from "@/components/dashboard/ColumnFilterMenu";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type {
  PjmConstraintMarket,
  PjmConstraintRow,
  PjmConstraintsPayload,
} from "@/lib/pjmConstraintsTypes";
import type {
  PjmConstraintBranchMatchStatus,
  PjmConstraintShiftDirection,
  PjmConstraintShiftFactorHourlyMetric,
  PjmConstraintShiftFactorRow,
  PjmConstraintShiftFactorsPayload,
} from "@/lib/pjmConstraintShiftFactorsTypes";
import {
  TRANSMISSION_OUTAGE_QUICK_DATE_OPTIONS,
  type TransmissionOutageDateBasis,
  type TransmissionOutageQuickDate,
} from "@/lib/pjmTransmissionOutageFilters";
import type {
  TransmissionOutageConstraintLink,
  TransmissionOutageImpactPayload,
  TransmissionOutageImpactRow,
  TransmissionOutageZoneImpact,
} from "@/lib/pjmTransmissionOutagesTypes";

export interface PjmConstraintsFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface PjmConstraintsProps {
  refreshToken: number;
  onFreshnessChange?: (freshness: PjmConstraintsFreshnessSummary) => void;
}

interface BuildApiUrlArgs {
  market: PjmConstraintMarket;
  date: string;
  search: string;
  refresh: boolean;
  path?: string;
  limit?: number;
}

interface OutageFilterState {
  statuses: string[];
  dateBasis: TransmissionOutageDateBasis;
  startDate: string;
  endDate: string;
  quickDate: TransmissionOutageQuickDate;
  equipmentSearch: string;
  ticketFilter: string;
  includeTerms: string;
  excludeTerms: string;
}

interface BuildOutageImpactApiUrlArgs {
  refresh: boolean;
  filters: OutageFilterState;
  linkedConstraint: LinkedConstraintSelection | null;
}

interface LinkedConstraintSelection {
  monitoredFacility: string;
  contingencyFacility: string;
  matchedBranchKey: string | null;
  matchedBranchName: string | null;
  fromBusNumber: number | null;
  fromBusName: string | null;
  toBusNumber: number | null;
  toBusName: string | null;
  circuitId: string | null;
  shiftFactor: number | null;
  estimatedWesternHubImpact: number | null;
}

type ColumnAlign = "left" | "right" | "center";
type SortableValue = string | number | boolean | null | undefined;
type SortState<Key extends string> = { key: Key; direction: SortDirection };
type ColumnFilters<Key extends string> = Partial<Record<Key, string[]>>;
type PjmConstraintsView = "heatmap" | "modelledShiftFactors" | "transmissionOutages";
type TransmissionOutageSubview = "tickets" | "zonalImpact";
type HeatmapColumnKey =
  | "monitoredFacility"
  | "contingencyFacility"
  | "totalValue"
  | `he-${number}`;
type ShiftFactorColumnKey =
  | "monitoredFacility"
  | "contingencyFacility"
  | "totalAbsShadowPrice"
  | "shiftFactor"
  | "estimatedWesternHubImpact"
  | "outagePreview"
  | "direction"
  | "matchStatus"
  | "matchedBranchName"
  | `he-${number}`;
type OutageImpactColumnKey =
  | "ticketId"
  | "zoneCompany"
  | "facilityName"
  | "relatedEquipmentText"
  | "matchedBranchName"
  | "constraintLink"
  | "shiftFactor"
  | "absoluteShiftFactor"
  | "whubDirection"
  | "matchStatus"
  | "startDate"
  | "startTime"
  | "endDate"
  | "endTime"
  | "currentStatus"
  | "changed"
  | "changeTypes";

interface ConstraintColumn<Row, Key extends string> {
  key: Key;
  label: string;
  width: number;
  align?: ColumnAlign;
  stickyClassName?: string;
  cellClassName?: (row: Row) => string;
  cellStyle?: (row: Row) => CSSProperties | undefined;
  filterable?: boolean;
  filterValues?: (row: Row) => string[];
  sortValue: (row: Row) => SortableValue;
  render: (row: Row) => ReactNode;
}

const API_CACHE_TTL_MS = 3 * 60 * 1000;
const API_PATH = "/api/pjm-constraints";
const SHIFT_FACTORS_API_PATH = "/api/pjm-constraint-shift-factors";
const TRANSMISSION_OUTAGE_IMPACTS_API_PATH = "/api/pjm-transmission-outage-impacts";
const MAX_RENDERED_ROWS = 1_500;
const HOUR_ENDINGS = Array.from({ length: 24 }, (_, index) => index + 1);
const DEFAULT_FRESHNESS: PjmConstraintsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Constraints --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};
const OUTAGE_DATE_BASIS_OPTIONS: Array<{ key: TransmissionOutageDateBasis; label: string }> = [
  { key: "active", label: "Active" },
  { key: "start", label: "Starts" },
  { key: "end", label: "Ends" },
];

function buildApiUrl({
  market,
  date,
  search,
  refresh,
  path = API_PATH,
  limit = 120,
}: BuildApiUrlArgs): string {
  const params = new URLSearchParams({
    market,
    limit: String(limit),
  });
  if (date) params.set("date", date);
  if (search.trim()) params.set("search", search.trim());
  if (refresh) params.set("refresh", "1");
  return `${path}?${params.toString()}`;
}

function appendListParams(params: URLSearchParams, key: string, values: string[]): void {
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => params.append(key, value));
}

function appendOutageFilterParams(params: URLSearchParams, filters: OutageFilterState): void {
  params.set("dateBasis", filters.dateBasis);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  appendListParams(params, "status", filters.statuses);
  if (filters.equipmentSearch.trim()) {
    params.set("equipmentSearch", filters.equipmentSearch.trim());
  }
  if (filters.ticketFilter.trim()) {
    params.set("ticketIds", filters.ticketFilter.trim());
  }
  if (filters.includeTerms.trim()) {
    params.set("includeTerms", filters.includeTerms.trim());
  }
  if (filters.excludeTerms.trim()) {
    params.set("excludeTerms", filters.excludeTerms.trim());
  }
}

function buildOutageImpactApiUrl({
  refresh,
  filters,
  linkedConstraint,
}: BuildOutageImpactApiUrlArgs): string {
  const params = new URLSearchParams({
    limit: "750",
  });

  appendOutageFilterParams(params, filters);
  if (linkedConstraint) {
    params.set("linkedConstraintFacility", linkedConstraintSearchText(linkedConstraint));
    if (linkedConstraint.matchedBranchKey) {
      params.set("linkedConstraintBranchKey", linkedConstraint.matchedBranchKey);
    }
  }
  if (refresh) params.set("refresh", "1");
  return `${TRANSMISSION_OUTAGE_IMPACTS_API_PATH}?${params.toString()}`;
}

function buildShiftFactorApiUrl({
  market,
  date,
  search,
  refresh,
  filters,
}: BuildApiUrlArgs & { filters: OutageFilterState }): string {
  const params = new URLSearchParams({
    market,
    limit: "120",
    includeOutagePreview: "1",
  });
  if (date) params.set("date", date);
  if (search.trim()) params.set("search", search.trim());
  appendOutageFilterParams(params, filters);
  if (refresh) params.set("refresh", "1");
  return `${SHIFT_FACTORS_API_PATH}?${params.toString()}`;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").replace("Z", "").slice(0, 16);
}

function pjmTodayDateKey(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  return `${valueByType.get("year")}-${valueByType.get("month")}-${valueByType.get("day")}`;
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function quickDateRange(value: TransmissionOutageQuickDate): {
  startDate: string;
  endDate: string;
} {
  const option =
    TRANSMISSION_OUTAGE_QUICK_DATE_OPTIONS.find((candidate) => candidate.key === value) ??
    TRANSMISSION_OUTAGE_QUICK_DATE_OPTIONS[0];
  const startDate = addDays(pjmTodayDateKey(), option.startOffsetDays);
  return {
    startDate,
    endDate: addDays(startDate, option.spanDays - 1),
  };
}

function matchingQuickDate(
  startDate: string,
  endDate: string,
): TransmissionOutageQuickDate | "" {
  const match = TRANSMISSION_OUTAGE_QUICK_DATE_OPTIONS.find((option) => {
    const range = quickDateRange(option.key);
    return range.startDate === startDate && range.endDate === endDate;
  });
  return match?.key ?? "";
}

function defaultOutageFilters(): OutageFilterState {
  const today = pjmTodayDateKey();
  return {
    statuses: [],
    dateBasis: "active",
    startDate: today,
    endDate: today,
    quickDate: "today",
    equipmentSearch: "",
    ticketFilter: "",
    includeTerms: "",
    excludeTerms: "",
  };
}

function linkedConstraintSearchText(selection: LinkedConstraintSelection): string {
  return [
    selection.monitoredFacility,
    selection.matchedBranchName,
    selection.fromBusName,
    selection.toBusName,
    selection.circuitId,
  ]
    .filter(Boolean)
    .join(" ");
}

function linkedConstraintBranchLabel(selection: LinkedConstraintSelection): string {
  const fallback = [selection.fromBusName, selection.toBusName, selection.circuitId]
    .filter(Boolean)
    .join(" - ");
  return selection.matchedBranchName ?? (fallback || "-");
}

function dateBasisLabel(value: TransmissionOutageDateBasis): string {
  return OUTAGE_DATE_BASIS_OPTIONS.find((option) => option.key === value)?.label ?? "Active";
}

function outageDateSelectionLabel(filters: OutageFilterState): string {
  const basis = dateBasisLabel(filters.dateBasis);
  const startDate = filters.startDate || "-";
  const endDate = filters.endDate || startDate;
  if (startDate === endDate) {
    return `${basis} ${startDate}`;
  }
  return `${basis} ${startDate} to ${endDate}`;
}

function fmtNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function fmtPercent(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${(value * 100).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  })}%`;
}

function formatFilterValue(
  value: number | string | boolean | null | undefined,
  decimals = 0,
): string {
  if (value === null || value === undefined || value === "") return "Blank";
  if (typeof value === "boolean") return value ? "True" : "False";
  return typeof value === "number" ? fmtNumber(value, decimals) : value;
}

function sortFilterOption(left: string, right: string): number {
  if (left === "Blank" && right !== "Blank") return 1;
  if (right === "Blank" && left !== "Blank") return -1;
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function normalizeFilterValues(values: string[] | undefined): string[] {
  const cleaned = (values ?? []).map((value) => value.trim() || "Blank");
  return cleaned.length > 0 ? cleaned : ["Blank"];
}

function rowMatchesColumnFilters<Row, Key extends string>(
  row: Row,
  columns: Array<ConstraintColumn<Row, Key>>,
  filters: ColumnFilters<Key>,
): boolean {
  const columnsByKey = new Map(columns.map((column) => [column.key, column]));
  const activeFilters = (Object.entries(filters) as Array<[Key, string[]]>)
    .filter(([, selected]) => selected.length > 0);

  if (activeFilters.length === 0) return true;

  return activeFilters.every(([key, selected]) => {
    const column = columnsByKey.get(key);
    if (!column?.filterable || !column.filterValues) return true;
    const values = normalizeFilterValues(column.filterValues(row));
    return selected.some((value) => values.includes(value));
  });
}

function filterRowsByColumns<Row, Key extends string>(
  rows: Row[],
  columns: Array<ConstraintColumn<Row, Key>>,
  filters: ColumnFilters<Key>,
): Row[] {
  return rows.filter((row) => rowMatchesColumnFilters(row, columns, filters));
}

function omitColumnFilter<Key extends string>(
  filters: ColumnFilters<Key>,
  keyToOmit: Key,
): ColumnFilters<Key> {
  const next = { ...filters };
  delete next[keyToOmit];
  return next;
}

function buildColumnFilterOptions<Row, Key extends string>(
  rows: Row[],
  columns: Array<ConstraintColumn<Row, Key>>,
  filters: ColumnFilters<Key>,
): ColumnFilters<Key> {
  return Object.fromEntries(
    columns.map((column) => {
      if (!column.filterable || !column.filterValues) return [column.key, []];
      const otherFilters = omitColumnFilter(filters, column.key);
      const optionRows = filterRowsByColumns(rows, columns, otherFilters);
      const options = Array.from(
        new Set(optionRows.flatMap((row) => normalizeFilterValues(column.filterValues?.(row)))),
      ).sort(sortFilterOption);
      return [column.key, options];
    }),
  ) as ColumnFilters<Key>;
}

function updateColumnFilterState<Key extends string>(
  filters: ColumnFilters<Key>,
  key: Key,
  values: string[],
): ColumnFilters<Key> {
  const next = { ...filters };
  if (values.length > 0) next[key] = values;
  else delete next[key];
  return next;
}

function selectedPeriodLabel(
  payload: PjmConstraintsPayload | PjmConstraintShiftFactorsPayload | null,
): string {
  if (!payload) return "-";
  return fmtDate(payload.summary.selectedDate);
}

function freshnessFromPayload(
  payload: PjmConstraintsPayload | null,
): PjmConstraintsFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  const hasRows = payload.rows.length > 0;
  const selectedIsLatest = payload.summary.selectedDate === payload.summary.latestDate;
  const status = !hasRows ? "No Data" : selectedIsLatest ? "Current" : "Historical";
  const statusClass = !hasRows
    ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
    : selectedIsLatest
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : "border-sky-500/40 bg-sky-500/10 text-sky-200";
  const selection = fmtDate(payload.summary.selectedDate);

  return {
    status,
    statusClass,
    summary: `${payload.summary.market.toUpperCase()} ${payload.summary.mode} | ${selection} | ${payload.summary.rowCount.toLocaleString()} rows`,
    targetDateLabel: selection,
    latestDateLabel: fmtDate(payload.summary.latestDate),
    latestUpdateLabel: fmtDateTime(payload.summary.latestUpdateTimestamp),
  };
}

function freshnessFromShiftFactorPayload(
  payload: PjmConstraintShiftFactorsPayload | null,
): PjmConstraintsFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  const hasRows = payload.rows.length > 0;
  const selectedIsLatest = payload.summary.selectedDate === payload.summary.latestDate;
  const modelReady = payload.summary.model.status === "ready";
  const status = !hasRows
    ? "No Data"
    : !modelReady
      ? "Model Pending"
      : selectedIsLatest
        ? "Current"
        : "Historical";
  const statusClass = !hasRows
    ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
    : !modelReady
      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
      : selectedIsLatest
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
        : "border-sky-500/40 bg-sky-500/10 text-sky-200";
  const selection = fmtDate(payload.summary.selectedDate);

  return {
    status,
    statusClass,
    summary: `${payload.summary.market.toUpperCase()} Modelled shift factors | ${selection} | ${payload.summary.rowCount.toLocaleString()} rows | ${payload.summary.matchedConstraintCount.toLocaleString()} matched`,
    targetDateLabel: selection,
    latestDateLabel: fmtDate(payload.summary.latestDate),
    latestUpdateLabel: fmtDateTime(payload.summary.latestUpdateTimestamp),
  };
}

function freshnessFromOutageImpactPayload(
  payload: TransmissionOutageImpactPayload | null,
): PjmConstraintsFreshnessSummary {
  if (!payload?.selectedSnapshot) return DEFAULT_FRESHNESS;
  const hasRows = payload.rows.length > 0;
  const modelReady = payload.summary.model.status === "ready";
  const status = !hasRows ? "No Data" : !modelReady ? "Model Pending" : "Current";
  const statusClass = !hasRows
    ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
    : !modelReady
      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";

  return {
    status,
    statusClass,
    summary: `Transmission outages | ${payload.summary.modeledTicketCount.toLocaleString()} modelled / ${payload.summary.latestTicketCount.toLocaleString()} tickets | ${payload.summary.matchedTicketCount.toLocaleString()} matched`,
    targetDateLabel: "Transmission",
    latestDateLabel: fmtDateTime(payload.selectedSnapshot.sourceReportTimestamp),
    latestUpdateLabel: fmtDateTime(payload.selectedSnapshot.ingestedAt),
  };
}

function heatStyle(value: number | null | undefined, maxValue: number): CSSProperties | undefined {
  if (!value || value <= 0 || maxValue <= 0) return undefined;
  const ratio = Math.min(1, Math.max(0, Math.sqrt(value / maxValue)));
  const gray = [166, 166, 171];
  const red = [185, 28, 28];
  const r = Math.round(gray[0] + (red[0] - gray[0]) * ratio);
  const g = Math.round(gray[1] + (red[1] - gray[1]) * ratio);
  const b = Math.round(gray[2] + (red[2] - gray[2]) * ratio);
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${0.62 + ratio * 0.28})`,
    color: ratio > 0.55 ? "#fee2e2" : "#111827",
  };
}

function signedHeatStyle(
  value: number | null | undefined,
  maxAbsValue: number,
): CSSProperties | undefined {
  if (!value || maxAbsValue <= 0) return undefined;
  const ratio = Math.min(1, Math.max(0, Math.sqrt(Math.abs(value) / maxAbsValue)));
  const base = [166, 166, 171];
  const positive = [185, 28, 28];
  const negative = [20, 120, 120];
  const target = value > 0 ? positive : negative;
  const r = Math.round(base[0] + (target[0] - base[0]) * ratio);
  const g = Math.round(base[1] + (target[1] - base[1]) * ratio);
  const b = Math.round(base[2] + (target[2] - base[2]) * ratio);
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${0.58 + ratio * 0.3})`,
    color: ratio > 0.55 ? "#f8fafc" : "#111827",
  };
}

function getHourValue(row: PjmConstraintRow, he: number): number | null {
  return row.hours[he - 1]?.value ?? null;
}

function getShiftHourValue(
  row: PjmConstraintShiftFactorRow,
  he: number,
  metric: PjmConstraintShiftFactorHourlyMetric,
): number | null {
  const hour = row.hours[he - 1];
  if (!hour) return null;
  return metric === "estimatedWesternHubImpact"
    ? hour.estimatedWesternHubImpact
    : hour.shadowPrice;
}

function directionLabel(value: PjmConstraintShiftDirection): string {
  if (value === "positive") return "Positive";
  if (value === "negative") return "Negative";
  if (value === "neutral") return "Neutral";
  return "Unknown";
}

function matchStatusLabel(value: PjmConstraintBranchMatchStatus): string {
  if (value === "matched") return "Matched";
  if (value === "ambiguous") return "Ambiguous";
  if (value === "no_match") return "No match";
  return "Model unavailable";
}

function directionTextClass(value: PjmConstraintShiftDirection): string {
  if (value === "positive") return "text-red-200";
  if (value === "negative") return "text-emerald-200";
  if (value === "neutral") return "text-gray-300";
  return "text-gray-500";
}

function directionClass(row: PjmConstraintShiftFactorRow): string {
  return directionTextClass(row.direction);
}

function matchBadgeClass(row: { matchStatus: PjmConstraintBranchMatchStatus }): string {
  if (row.matchStatus === "matched") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  }
  if (row.matchStatus === "ambiguous") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  }
  if (row.matchStatus === "no_match") {
    return "border-gray-700 bg-gray-900 text-gray-400";
  }
  return "border-cyan-500/30 bg-cyan-500/10 text-cyan-200";
}

function outagePreviewBadgeClass(row: PjmConstraintShiftFactorRow): string {
  const preview = row.outagePreview;
  if (!preview || preview.relatedTicketCount <= 0) {
    return "border-gray-700 bg-gray-900 text-gray-500";
  }
  if (preview.sameBranchCount > 0) {
    return "border-emerald-500/45 bg-emerald-500/10 text-emerald-100";
  }
  if (preview.sharedBusCount > 0) {
    return "border-cyan-500/45 bg-cyan-500/10 text-cyan-100";
  }
  if (preview.nearbyRawCount > 0) {
    return "border-sky-500/45 bg-sky-500/10 text-sky-100";
  }
  return "border-amber-500/45 bg-amber-500/10 text-amber-100";
}

function outagePreviewLabel(row: PjmConstraintShiftFactorRow): string {
  const preview = row.outagePreview;
  if (!preview) return "-";
  if (preview.relatedTicketCount <= 0) return "0";
  return `${fmtNumber(preview.relatedTicketCount)} ${preview.topRelation ?? "Related"}`;
}

function outagePreviewTitle(row: PjmConstraintShiftFactorRow): string {
  const preview = row.outagePreview;
  if (!preview) return "Related ticket preview was not requested.";
  if (preview.relatedTicketCount <= 0) {
    return "No related tickets under the current outage filters.";
  }
  return [
    `${fmtNumber(preview.relatedTicketCount)} related tickets under the current outage filters.`,
    preview.topRelation ? `Strongest relation: ${preview.topRelation}.` : null,
    preview.topTicketId ? `Top ticket: ${preview.topTicketId}.` : null,
    preview.topFacilityName ? `Facility: ${preview.topFacilityName}.` : null,
    `Score: ${fmtPercent(preview.score, 0)}.`,
    `Max related outage |SF|: ${fmtNumber(preview.maxAbsRelatedOutageShiftFactor, 3)}.`,
    `Same branch ${fmtNumber(preview.sameBranchCount)}, shared bus ${fmtNumber(
      preview.sharedBusCount,
    )}, nearby RAW ${fmtNumber(preview.nearbyRawCount)}, text evidence ${fmtNumber(
      preview.textEvidenceCount,
    )}.`,
  ]
    .filter(Boolean)
    .join(" ");
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

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-r border-gray-800 px-3 py-3 last:border-r-0">
      <div className="text-[10px] font-semibold uppercase text-gray-600">{label}</div>
      <div className="mt-1 truncate text-sm font-bold text-gray-200">{value}</div>
    </div>
  );
}

function PillButtonGroup<Value extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: Value;
  options: ReadonlyArray<{ key: Value; label: string }>;
  onChange: (value: Value) => void;
}) {
  return (
    <div className="flex min-h-8 flex-wrap gap-2" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.key)}
            className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold transition-colors ${
              selected
                ? "border-gray-500 bg-gray-800 text-white"
                : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function InlineControlShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600">
        {label}
      </div>
      {children}
    </div>
  );
}

function InlineFilterGroup<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: ReadonlyArray<{ key: Value; label: string }>;
  onChange: (value: Value) => void;
}) {
  return (
    <InlineControlShell label={label}>
      <PillButtonGroup
        ariaLabel={label}
        value={value}
        options={options}
        onChange={onChange}
      />
    </InlineControlShell>
  );
}

function ViewFilterCard({
  view,
  onChange,
}: {
  view: PjmConstraintsView;
  onChange: (value: PjmConstraintsView) => void;
}) {
  return (
    <section
      className="w-full max-w-[760px] rounded-lg border border-sky-500/20 bg-[#111827]/60 px-4 py-4 shadow-[0_0_0_1px_rgba(14,165,233,0.04)]"
      aria-label="Constraint View filters"
    >
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500">
        Constraint View
      </div>
      <div className="grid gap-2 sm:grid-cols-[116px_minmax(0,1fr)] sm:items-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600">
          View
        </div>
        <PillButtonGroup
          ariaLabel="View"
          value={view}
          onChange={onChange}
          options={[
            { key: "heatmap", label: "Daily" },
            { key: "modelledShiftFactors", label: "Modelled SF" },
            { key: "transmissionOutages", label: "Transmission Outages" },
          ]}
        />
      </div>
    </section>
  );
}

function TableControlBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 xl:justify-end">
      {children}
    </div>
  );
}

function SearchTableControl({
  value,
  onChange,
  onRefresh,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onRefresh: () => void;
  placeholder: string;
}) {
  return (
    <InlineControlShell label="Search">
      <div className="flex min-w-[280px] flex-wrap gap-2 sm:min-w-[360px]">
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-8 min-w-[220px] flex-1 rounded-md border border-gray-800 bg-gray-950/40 px-3 text-xs font-semibold text-gray-200 outline-none placeholder:text-gray-700 focus:border-cyan-500"
        />
        <button
          type="button"
          onClick={onRefresh}
          className="h-8 rounded-md border border-gray-700 bg-gray-800 px-4 text-xs font-bold text-gray-200 transition-colors hover:bg-gray-700"
        >
          Refresh
        </button>
      </div>
    </InlineControlShell>
  );
}

function DateTableControl({
  value,
  onChange,
  label = "Date",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <InlineControlShell label={label}>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-[180px] rounded-md border border-gray-800 bg-gray-950/40 px-3 text-xs font-semibold text-gray-200 outline-none focus:border-cyan-500"
      />
    </InlineControlShell>
  );
}

function TextTableControl({
  label,
  value,
  onChange,
  placeholder,
  minWidthClassName = "min-w-[220px] sm:min-w-[280px]",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minWidthClassName?: string;
}) {
  return (
    <InlineControlShell label={label}>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`h-8 rounded-md border border-gray-800 bg-gray-950/40 px-3 text-xs font-semibold text-gray-200 outline-none placeholder:text-gray-700 focus:border-gray-500 ${minWidthClassName}`}
      />
    </InlineControlShell>
  );
}

function TextAreaTableControl({
  label,
  value,
  onChange,
  placeholder,
  minWidthClassName = "min-w-[220px] sm:min-w-[280px]",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minWidthClassName?: string;
}) {
  return (
    <InlineControlShell label={label}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={1}
        className={`h-8 resize-none rounded-md border border-gray-800 bg-gray-950/40 px-3 py-[7px] text-xs font-semibold text-gray-200 outline-none placeholder:text-gray-700 focus:border-gray-500 ${minWidthClassName}`}
      />
    </InlineControlShell>
  );
}

function SelectTableControl<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: ReadonlyArray<{ key: Value; label: string }>;
  onChange: (value: Value) => void;
}) {
  return (
    <InlineControlShell label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as Value)}
        className="h-8 min-w-[150px] rounded-md border border-gray-800 bg-gray-950/40 px-3 text-xs font-semibold text-gray-200 outline-none focus:border-gray-500"
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </InlineControlShell>
  );
}

function StatusMultiSelectControl({
  options,
  values,
  onChange,
}: {
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const summary =
    values.length === 0
      ? "All"
      : values.length <= 2
        ? values.join(", ")
        : `${values.length} selected`;
  const toggleStatus = (value: string) =>
    onChange(
      values.includes(value)
        ? values.filter((candidate) => candidate !== value)
        : [...values, value],
    );

  return (
    <InlineControlShell label="Status">
      <details className="relative">
        <summary className="flex h-8 min-w-[156px] cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-gray-800 bg-gray-950/40 px-3 text-xs font-semibold text-gray-200 outline-none transition-colors hover:border-gray-700 [&::-webkit-details-marker]:hidden">
          <span className="max-w-[180px] truncate">Status: {summary}</span>
          <span className="text-[10px] text-gray-500">v</span>
        </summary>
        <div className="absolute left-0 z-50 mt-2 max-h-72 min-w-[220px] overflow-auto rounded-md border border-gray-700 bg-[#111827] p-2 shadow-xl">
          <button
            type="button"
            onClick={() => onChange([])}
            className={`mb-1 flex h-7 w-full items-center rounded px-2 text-left text-xs font-semibold transition-colors ${
              values.length === 0
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            }`}
          >
            All statuses
          </button>
          {options.length === 0 ? (
            <div className="px-2 py-2 text-xs text-gray-500">No statuses loaded</div>
          ) : null}
          {options.map((option) => {
            const selected = values.includes(option);
            return (
              <label
                key={option}
                className="flex h-7 cursor-pointer items-center gap-2 rounded px-2 text-xs font-semibold text-gray-300 hover:bg-gray-800"
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleStatus(option)}
                  className="h-3.5 w-3.5 accent-cyan-500"
                />
                <span className="truncate">{option}</span>
              </label>
            );
          })}
        </div>
      </details>
    </InlineControlShell>
  );
}

function OutageFilterControls({
  filters,
  statusOptions,
  onChange,
  onRefresh,
  onReset,
}: {
  filters: OutageFilterState;
  statusOptions: string[];
  onChange: (filters: OutageFilterState) => void;
  onRefresh: () => void;
  onReset: () => void;
}) {
  const setFilter = <Key extends keyof OutageFilterState>(
    key: Key,
    value: OutageFilterState[Key],
  ) => onChange({ ...filters, [key]: value });
  const setStartDate = (value: string) =>
    onChange({
      ...filters,
      startDate: value,
      quickDate: matchingQuickDate(value, filters.endDate) || filters.quickDate,
    });
  const setEndDate = (value: string) =>
    onChange({
      ...filters,
      endDate: value,
      quickDate: matchingQuickDate(filters.startDate, value) || filters.quickDate,
    });
  const applyQuickDate = (value: TransmissionOutageQuickDate | "") => {
    if (!value) return;
    const range = quickDateRange(value);
    onChange({
      ...filters,
      quickDate: value,
      startDate: range.startDate,
      endDate: range.endDate,
    });
  };
  const selectedQuickDate = matchingQuickDate(filters.startDate, filters.endDate);

  return (
    <div className="grid w-full min-w-0 gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <InlineFilterGroup
          label="Date Basis"
          value={filters.dateBasis}
          onChange={(value) => setFilter("dateBasis", value)}
          options={OUTAGE_DATE_BASIS_OPTIONS}
        />
        <DateTableControl
          label="From"
          value={filters.startDate}
          onChange={setStartDate}
        />
        <DateTableControl
          label="To"
          value={filters.endDate}
          onChange={setEndDate}
        />
        <SelectTableControl<TransmissionOutageQuickDate | "">
          label="Quick"
          value={selectedQuickDate}
          onChange={applyQuickDate}
          options={[
            { key: "", label: "Quick" },
            ...TRANSMISSION_OUTAGE_QUICK_DATE_OPTIONS,
          ]}
        />
        <StatusMultiSelectControl
          options={statusOptions}
          values={filters.statuses}
          onChange={(values) => setFilter("statuses", values)}
        />
        <button
          type="button"
          onClick={onRefresh}
          className="h-8 rounded-md border border-gray-700 bg-gray-800 px-4 text-xs font-bold text-gray-200 transition-colors hover:bg-gray-700"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={onReset}
          className="h-8 rounded-md border border-gray-800 bg-gray-950/40 px-4 text-xs font-bold text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-200"
        >
          Reset
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <TextTableControl
          label="Equipment Filter"
          value={filters.equipmentSearch}
          onChange={(value) => setFilter("equipmentSearch", value)}
          placeholder="Facility, related equipment, RAW branch"
          minWidthClassName="min-w-[280px] sm:min-w-[420px]"
        />
        <TextAreaTableControl
          label="Ticket Filter"
          value={filters.ticketFilter}
          onChange={(value) => setFilter("ticketFilter", value)}
          placeholder="Exact ticket IDs"
          minWidthClassName="min-w-[180px] sm:min-w-[220px]"
        />
        <TextAreaTableControl
          label="Include Terms"
          value={filters.includeTerms}
          onChange={(value) => setFilter("includeTerms", value)}
          placeholder="Any phrase"
        />
        <TextAreaTableControl
          label="Exclude Terms"
          value={filters.excludeTerms}
          onChange={(value) => setFilter("excludeTerms", value)}
          placeholder="Any phrase"
        />
      </div>
    </div>
  );
}

function SimpleHeader<Row, Key extends string>({
  column,
  sortState,
  onSort,
  filterOptions = [],
  selectedFilters = [],
  onFilterChange,
}: {
  column: ConstraintColumn<Row, Key>;
  sortState: SortState<Key>;
  onSort: (key: Key, direction?: SortDirection) => void;
  filterOptions?: string[];
  selectedFilters?: string[];
  onFilterChange?: (key: Key, values: string[]) => void;
}) {
  const activeSort = sortState.key === column.key ? sortState.direction : null;
  const showFilter = column.filterable && onFilterChange && (filterOptions.length > 0 || selectedFilters.length > 0);
  const align = column.align ?? "left";
  const justify =
    align === "right"
      ? "justify-end text-right"
      : align === "center"
        ? "justify-center text-center"
        : "justify-start text-left";

  return (
    <th
      className={`${column.stickyClassName ?? "sticky top-0 z-20"} h-9 border-b border-r border-[#4b5563] bg-[#3b4656] px-2 py-0 font-bold text-gray-100 shadow-[0_1px_0_rgba(75,85,99,0.95)] ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      }`}
    >
      <div className={`flex h-full w-full min-w-0 items-center gap-1 ${justify}`}>
        <button
          type="button"
          onClick={() => onSort(column.key)}
          className={`flex min-w-0 items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-gray-700/60 ${
            activeSort ? "text-cyan-100" : "text-gray-100"
          }`}
          aria-label={`Sort ${column.label}`}
        >
          <span className="truncate text-[10px] leading-none">{column.label}</span>
          <span className="w-3 shrink-0 text-right text-[10px] text-sky-300">
            {activeSort === "asc" ? "\u2191" : activeSort === "desc" ? "\u2193" : ""}
          </span>
        </button>
        {showFilter ? (
          <ColumnFilterMenu
            label={column.label}
            options={filterOptions}
            selected={selectedFilters}
            sortDirection={activeSort}
            onSort={(direction) => onSort(column.key, direction)}
            onChange={(values) => onFilterChange(column.key, values)}
          />
        ) : null}
      </div>
    </th>
  );
}

function tableCellContentClass(): string {
  return "flex min-h-[28px] min-w-0 items-center leading-none";
}

function buildHeatmapColumns(
  maxTotalValue: number,
  maxHourlyValue: number,
): Array<ConstraintColumn<PjmConstraintRow, HeatmapColumnKey>> {
  return [
    {
      key: "monitoredFacility",
      label: "Constraint",
      width: 350,
      stickyClassName: "sticky left-0 top-0 z-30",
      filterValues: (row) => [row.monitoredFacility],
      sortValue: (row) => row.monitoredFacility,
      render: (row) => (
        <div className="truncate font-semibold text-cyan-100" title={row.monitoredFacility}>
          {row.monitoredFacility}
        </div>
      ),
    },
    {
      key: "contingencyFacility",
      label: "Contingency",
      width: 265,
      stickyClassName: "sticky left-[350px] top-0 z-30",
      filterValues: (row) => [row.contingencyFacility],
      sortValue: (row) => row.contingencyFacility,
      render: (row) => (
        <div className="truncate text-gray-300" title={row.contingencyFacility}>
          {row.contingencyFacility}
        </div>
      ),
    },
    {
      key: "totalValue",
      label: "Total",
      width: 88,
      align: "right",
      filterValues: (row) => [formatFilterValue(row.totalValue, 0)],
      sortValue: (row) => row.totalValue,
      cellStyle: (row) => heatStyle(row.totalValue, maxTotalValue),
      render: (row) => <span className="w-full font-bold">{fmtNumber(row.totalValue)}</span>,
    },
    ...HOUR_ENDINGS.map(
      (he): ConstraintColumn<PjmConstraintRow, HeatmapColumnKey> => ({
        key: `he-${he}`,
        label: String(he),
        width: 55,
        align: "center",
        filterValues: (row) => [formatFilterValue(getHourValue(row, he), 0)],
        sortValue: (row) => getHourValue(row, he),
        cellStyle: (row) => heatStyle(getHourValue(row, he), maxHourlyValue),
        render: (row) => {
          const value = getHourValue(row, he);
          return (
            <span
              className="w-full font-semibold"
              title={
                value !== null && value !== undefined
                  ? `${row.monitoredFacility} HE${he}: ${fmtNumber(value, 2)}`
                  : undefined
              }
            >
              {value !== null && value !== undefined ? fmtNumber(value) : ""}
            </span>
          );
        },
      }),
    ),
  ];
}

function buildShiftColumns({
  metric,
  hourlyMetricLabel,
  maxAbsHourlyValue,
  maxAbsEstimatedWesternHubImpact,
}: {
  metric: PjmConstraintShiftFactorHourlyMetric;
  hourlyMetricLabel: string;
  maxAbsHourlyValue: number;
  maxAbsEstimatedWesternHubImpact: number;
}): Array<ConstraintColumn<PjmConstraintShiftFactorRow, ShiftFactorColumnKey>> {
  return [
    {
      key: "monitoredFacility",
      label: "Constraint",
      width: 350,
      stickyClassName: "sticky left-0 top-0 z-30",
      filterValues: (row) => [row.monitoredFacility],
      sortValue: (row) => row.monitoredFacility,
      render: (row) => (
        <div className="truncate font-semibold text-cyan-100" title={row.monitoredFacility}>
          {row.monitoredFacility}
        </div>
      ),
    },
    {
      key: "contingencyFacility",
      label: "Contingency",
      width: 265,
      stickyClassName: "sticky left-[350px] top-0 z-30",
      filterValues: (row) => [row.contingencyFacility],
      sortValue: (row) => row.contingencyFacility,
      render: (row) => (
        <div className="truncate text-gray-300" title={row.contingencyFacility}>
          {row.contingencyFacility}
        </div>
      ),
    },
    {
      key: "matchedBranchName",
      label: "Branch",
      width: 220,
      filterValues: (row) => [
        row.matchedBranchName ??
          [row.fromBusName, row.toBusName, row.circuitId].filter(Boolean).join(" - ") ??
          "Blank",
      ],
      sortValue: (row) => row.matchedBranchName,
      render: (row) => {
        const title =
          row.matchedBranchName ??
          [row.fromBusName, row.toBusName, row.circuitId].filter(Boolean).join(" - ");
        return (
          <div className="truncate text-gray-300" title={title}>
            {row.matchedBranchName ?? "-"}
          </div>
        );
      },
    },
    {
      key: "outagePreview",
      label: "Linked Tickets",
      width: 148,
      filterable: true,
      filterValues: (row) => {
        const preview = row.outagePreview;
        if (!preview) return ["Not loaded"];
        return [
          preview.relatedTicketCount > 0
            ? preview.topRelation ?? "Related tickets"
            : "No related tickets",
        ];
      },
      sortValue: (row) =>
        row.outagePreview
          ? row.outagePreview.relatedTicketCount * 1000 + row.outagePreview.score
          : null,
      render: (row) => (
        <span
          className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold ${outagePreviewBadgeClass(
            row,
          )}`}
          title={outagePreviewTitle(row)}
        >
          <span className="truncate">{outagePreviewLabel(row)}</span>
        </span>
      ),
    },
    {
      key: "totalAbsShadowPrice",
      label: "Total SP",
      width: 88,
      align: "right",
      filterValues: (row) => [formatFilterValue(row.totalAbsShadowPrice, 0)],
      sortValue: (row) => row.totalAbsShadowPrice,
      render: (row) => <span className="font-bold text-gray-200">{fmtNumber(row.totalAbsShadowPrice)}</span>,
    },
    {
      key: "shiftFactor",
      label: "WHUB SF",
      width: 86,
      align: "right",
      filterValues: (row) => [formatFilterValue(row.shiftFactor, 3)],
      sortValue: (row) => row.shiftFactor,
      render: (row) => <span className="font-semibold">{fmtNumber(row.shiftFactor, 3)}</span>,
    },
    {
      key: "estimatedWesternHubImpact",
      label: "Est WHUB",
      width: 88,
      align: "right",
      filterValues: (row) => [formatFilterValue(row.estimatedWesternHubImpact, 2)],
      sortValue: (row) => row.estimatedWesternHubImpact,
      cellStyle: (row) =>
        signedHeatStyle(
          row.estimatedWesternHubImpact,
          maxAbsEstimatedWesternHubImpact,
        ),
      render: (row) => (
        <span className={`w-full font-bold ${directionClass(row)}`}>
          {fmtNumber(row.estimatedWesternHubImpact, 2)}
        </span>
      ),
    },
    {
      key: "direction",
      label: "Direction",
      width: 90,
      filterable: true,
      filterValues: (row) => [directionLabel(row.direction)],
      sortValue: (row) => directionLabel(row.direction),
      render: (row) => <span className={directionClass(row)}>{directionLabel(row.direction)}</span>,
    },
    {
      key: "matchStatus",
      label: "Match",
      width: 128,
      filterable: true,
      filterValues: (row) => [matchStatusLabel(row.matchStatus)],
      sortValue: (row) => matchStatusLabel(row.matchStatus),
      render: (row) => (
        <span
          className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold ${matchBadgeClass(
            row,
          )}`}
        >
          <span className="truncate">{matchStatusLabel(row.matchStatus)}</span>
          {row.matchConfidence > 0 && (
            <span className="text-gray-400">{fmtPercent(row.matchConfidence, 0)}</span>
          )}
        </span>
      ),
    },
    ...HOUR_ENDINGS.map(
      (he): ConstraintColumn<PjmConstraintShiftFactorRow, ShiftFactorColumnKey> => ({
        key: `he-${he}`,
        label: String(he),
        width: 55,
        align: "center",
        filterValues: (row) => [formatFilterValue(getShiftHourValue(row, he, metric), 1)],
        sortValue: (row) => getShiftHourValue(row, he, metric),
        cellStyle: (row) => signedHeatStyle(getShiftHourValue(row, he, metric), maxAbsHourlyValue),
        render: (row) => {
          const value = getShiftHourValue(row, he, metric);
          return (
            <span
              className="w-full font-semibold"
              title={
                value !== null
                  ? `${row.monitoredFacility} HE${he} ${hourlyMetricLabel}: ${fmtNumber(
                      value,
                      2,
                    )}`
                  : undefined
              }
            >
              {value !== null ? fmtNumber(value, 1) : ""}
            </span>
          );
        },
      }),
    ),
  ];
}

function relatedEquipmentPreview(value: string): string {
  const parts = value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "-";
  const preview = parts.slice(0, 2).join(" | ");
  return parts.length > 2 ? `${preview} | +${parts.length - 2}` : preview;
}

function outageDirectionLabel(value: PjmConstraintShiftDirection): string {
  if (value === "positive") return "WHUB +";
  if (value === "negative") return "WHUB -";
  if (value === "neutral") return "Neutral";
  return "Unknown";
}

function constraintLinkBadgeClass(link: TransmissionOutageConstraintLink | null | undefined): string {
  if (!link) return "border-gray-700 bg-gray-900 text-gray-500";
  if (link.relation === "Same branch") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  }
  if (link.relation === "Shared bus") {
    return "border-cyan-500/40 bg-cyan-500/10 text-cyan-200";
  }
  if (link.relation === "Nearby RAW") {
    return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  }
  return "border-amber-500/40 bg-amber-500/10 text-amber-200";
}

function topZoneTicketLabel(ticket: TransmissionOutageZoneImpact["topBullish"]): string {
  if (!ticket) return "-";
  return `${ticket.ticketId} ${ticket.facilityName}`;
}

function buildOutageImpactColumns(
  maxAbsShiftFactor: number,
  showConstraintLink: boolean,
): Array<ConstraintColumn<TransmissionOutageImpactRow, OutageImpactColumnKey>> {
  const columns: Array<ConstraintColumn<TransmissionOutageImpactRow, OutageImpactColumnKey>> = [
    {
      key: "ticketId",
      label: "Ticket",
      width: 96,
      stickyClassName: "sticky left-0 top-0 z-30",
      filterValues: (row) => [row.ticketId],
      sortValue: (row) => row.ticketId,
      render: (row) => <span className="font-semibold text-gray-100">{row.ticketId}</span>,
    },
    {
      key: "facilityName",
      label: "Facility",
      width: 350,
      stickyClassName: "sticky left-[96px] top-0 z-30",
      filterValues: (row) => [row.facilityName],
      sortValue: (row) => row.facilityName,
      render: (row) => (
        <div className="truncate font-semibold text-cyan-100" title={row.facilityName}>
          {row.facilityName}
        </div>
      ),
    },
    {
      key: "zoneCompany",
      label: "Zone",
      width: 96,
      filterable: true,
      filterValues: (row) => [row.zoneCompany],
      sortValue: (row) => row.zoneCompany,
      render: (row) => row.zoneCompany,
    },
    {
      key: "relatedEquipmentText",
      label: "Related",
      width: 300,
      filterValues: (row) => [relatedEquipmentPreview(row.relatedEquipmentText)],
      sortValue: (row) => row.relatedEquipmentText,
      render: (row) => (
        <div className="truncate text-gray-300" title={row.relatedEquipmentText}>
          {relatedEquipmentPreview(row.relatedEquipmentText)}
        </div>
      ),
    },
    {
      key: "matchedBranchName",
      label: "RAW Branch",
      width: 260,
      filterValues: (row) => [row.matchedBranchName ?? "Blank"],
      sortValue: (row) => row.matchedBranchName,
      render: (row) => (
        <div className="truncate text-gray-300" title={row.matchedBranchName ?? undefined}>
          {row.matchedBranchName ?? "-"}
        </div>
      ),
    },
    ...(showConstraintLink
      ? [
          {
            key: "constraintLink" as const,
            label: "Link",
            width: 132,
            filterable: true,
            filterValues: (row: TransmissionOutageImpactRow) => [
              row.constraintLink?.relation ?? "No link",
            ],
            sortValue: (row: TransmissionOutageImpactRow) => row.constraintLink?.score ?? null,
            render: (row: TransmissionOutageImpactRow) => (
              <span
                className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold ${constraintLinkBadgeClass(
                  row.constraintLink,
                )}`}
                title={row.constraintLink?.evidenceText}
              >
                <span className="truncate">{row.constraintLink?.relation ?? "-"}</span>
                {row.constraintLink ? (
                  <span className="text-gray-400">{fmtPercent(row.constraintLink.score, 0)}</span>
                ) : null}
              </span>
            ),
          },
        ]
      : []),
    {
      key: "shiftFactor",
      label: "WHUB SF",
      width: 88,
      align: "right",
      filterValues: (row) => [formatFilterValue(row.shiftFactor, 3)],
      sortValue: (row) => row.shiftFactor,
      cellStyle: (row) => signedHeatStyle(row.shiftFactor, maxAbsShiftFactor),
      render: (row) => <span className="w-full font-bold">{fmtNumber(row.shiftFactor, 3)}</span>,
    },
    {
      key: "absoluteShiftFactor",
      label: "Abs SF",
      width: 82,
      align: "right",
      filterable: true,
      filterValues: (row) => [formatFilterValue(row.absoluteShiftFactor, 3)],
      sortValue: (row) => row.absoluteShiftFactor,
      render: (row) => <span className="font-semibold">{fmtNumber(row.absoluteShiftFactor, 3)}</span>,
    },
    {
      key: "whubDirection",
      label: "WHUB Dir",
      width: 96,
      filterable: true,
      filterValues: (row) => [outageDirectionLabel(row.whubDirection)],
      sortValue: (row) => outageDirectionLabel(row.whubDirection),
      render: (row) => (
        <span className={directionTextClass(row.whubDirection)}>
          {outageDirectionLabel(row.whubDirection)}
        </span>
      ),
    },
    {
      key: "matchStatus",
      label: "Match",
      width: 132,
      filterable: true,
      filterValues: (row) => [matchStatusLabel(row.matchStatus)],
      sortValue: (row) => matchStatusLabel(row.matchStatus),
      render: (row) => (
        <span
          className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold ${matchBadgeClass(
            row,
          )}`}
        >
          <span className="truncate">{matchStatusLabel(row.matchStatus)}</span>
          {row.matchConfidence > 0 && (
            <span className="text-gray-400">{fmtPercent(row.matchConfidence, 0)}</span>
          )}
        </span>
      ),
    },
    {
      key: "startDate",
      label: "Start Date",
      width: 108,
      filterable: true,
      filterValues: (row) => [row.startDate ?? "Blank"],
      sortValue: (row) => row.startDate ?? row.startAtText,
      render: (row) => (
        <span title={row.startAtText}>{row.startDate ?? "-"}</span>
      ),
    },
    {
      key: "startTime",
      label: "Start Time",
      width: 90,
      filterable: true,
      filterValues: (row) => [row.startTime ?? "Blank"],
      sortValue: (row) => row.startTime ?? row.startAtText,
      render: (row) => (
        <span title={row.startAtText}>{row.startTime ?? "-"}</span>
      ),
    },
    {
      key: "endDate",
      label: "End Date",
      width: 108,
      filterable: true,
      filterValues: (row) => [row.endDate ?? "Blank"],
      sortValue: (row) => row.endDate ?? row.endAtText,
      render: (row) => (
        <span title={row.endAtText}>{row.endDate ?? "-"}</span>
      ),
    },
    {
      key: "endTime",
      label: "End Time",
      width: 90,
      filterable: true,
      filterValues: (row) => [row.endTime ?? "Blank"],
      sortValue: (row) => row.endTime ?? row.endAtText,
      render: (row) => (
        <span title={row.endAtText}>{row.endTime ?? "-"}</span>
      ),
    },
    {
      key: "currentStatus",
      label: "Status",
      width: 110,
      filterable: true,
      filterValues: (row) => [row.currentStatus],
      sortValue: (row) => row.currentStatus,
      render: (row) => row.currentStatus,
    },
    {
      key: "changed",
      label: "Changed",
      width: 90,
      filterable: true,
      filterValues: (row) => [row.changed ? "Changed" : "Unchanged"],
      sortValue: (row) => row.changed,
      render: (row) => (
        <span className={row.changed ? "font-semibold text-cyan-100" : "text-gray-500"}>
          {row.changed ? "Changed" : "Unchanged"}
        </span>
      ),
    },
    {
      key: "changeTypes",
      label: "Changes",
      width: 156,
      filterValues: (row) => row.changeTypes,
      sortValue: (row) => row.changeTypes.join(","),
      render: (row) => (
        <div className="truncate text-gray-300" title={row.changeTypes.join(", ")}>
          {row.changeTypes.join(", ")}
        </div>
      ),
    },
  ];
  return columns;
}

function SelectedConstraintStrip({
  selection,
  onClear,
}: {
  selection: LinkedConstraintSelection;
  onClear: () => void;
}) {
  return (
    <div className="border-b border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="min-w-[240px] flex-1">
          <div className="truncate font-semibold text-cyan-100" title={selection.monitoredFacility}>
            {selection.monitoredFacility}
          </div>
          <div className="mt-0.5 truncate text-gray-400" title={linkedConstraintBranchLabel(selection)}>
            {linkedConstraintBranchLabel(selection)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right tabular-nums sm:grid-cols-3">
          <div>
            <div className="text-[10px] font-semibold uppercase text-gray-600">WHUB SF</div>
            <div className="font-bold text-gray-100">{fmtNumber(selection.shiftFactor, 3)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase text-gray-600">Est WHUB</div>
            <div className="font-bold text-gray-100">
              {fmtNumber(selection.estimatedWesternHubImpact, 2)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase text-gray-600">Branch</div>
            <div className="font-bold text-gray-100">{selection.matchedBranchKey ? "RAW" : "Text"}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="h-8 rounded-md border border-gray-700 bg-gray-900 px-3 text-xs font-bold text-gray-300 transition-colors hover:bg-gray-800"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function ZoneImpactPanel({
  zones,
  selectedZones,
  onZoneClick,
}: {
  zones: TransmissionOutageZoneImpact[];
  selectedZones: string[];
  onZoneClick: (zoneCompany: string) => void;
}) {
  if (zones.length === 0) {
    return (
      <div className="bg-[#10141d] px-3 py-8 text-sm text-gray-500">
        No zonal impact rows match the active outage filters.
      </div>
    );
  }
  return (
    <div className="bg-[#10141d] px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
          Zonal Impact
        </div>
        <div className="text-[11px] text-gray-600">{fmtNumber(zones.length)} zones</div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] table-fixed border-separate border-spacing-0 text-xs text-gray-300">
          <thead>
            <tr className="bg-[#2f3948] text-[10px] uppercase text-gray-100">
              <th className="w-[120px] border-r border-gray-700 px-2 py-2 text-left">Zone</th>
              <th className="w-[72px] border-r border-gray-700 px-2 py-2 text-right">Tickets</th>
              <th className="w-[72px] border-r border-gray-700 px-2 py-2 text-right">Match</th>
              <th className="w-[72px] border-r border-gray-700 px-2 py-2 text-right">WHUB+</th>
              <th className="w-[72px] border-r border-gray-700 px-2 py-2 text-right">WHUB-</th>
              <th className="w-[90px] border-r border-gray-700 px-2 py-2 text-right">Max |SF|</th>
              <th className="w-[250px] border-r border-gray-700 px-2 py-2 text-left">Bullish</th>
              <th className="w-[250px] px-2 py-2 text-left">Bearish</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {zones.map((zone) => {
              const selected = selectedZones.length === 1 && selectedZones[0] === zone.zoneCompany;
              return (
                <tr key={zone.zoneCompany} className={selected ? "bg-cyan-500/10" : "bg-[#111827]"}>
                  <td className="border-r border-gray-800 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => onZoneClick(zone.zoneCompany)}
                      className={`max-w-full truncate rounded px-2 py-1 text-left font-bold transition-colors ${
                        selected
                          ? "bg-cyan-500/20 text-cyan-100"
                          : "text-cyan-200 hover:bg-gray-800"
                      }`}
                      title={zone.zoneCompany}
                    >
                      {zone.zoneCompany}
                    </button>
                  </td>
                  <td className="border-r border-gray-800 px-2 py-1.5 text-right tabular-nums">
                    {fmtNumber(zone.ticketCount)}
                  </td>
                  <td className="border-r border-gray-800 px-2 py-1.5 text-right tabular-nums">
                    {fmtNumber(zone.matchedCount)}
                  </td>
                  <td className="border-r border-gray-800 px-2 py-1.5 text-right tabular-nums text-red-200">
                    {fmtNumber(zone.whubPositiveCount)}
                  </td>
                  <td className="border-r border-gray-800 px-2 py-1.5 text-right tabular-nums text-emerald-200">
                    {fmtNumber(zone.whubNegativeCount)}
                  </td>
                  <td className="border-r border-gray-800 px-2 py-1.5 text-right font-bold tabular-nums text-gray-100">
                    {fmtNumber(zone.maxAbsShiftFactor, 3)}
                  </td>
                  <td className="border-r border-gray-800 px-2 py-1.5">
                    <div className="truncate text-red-200" title={topZoneTicketLabel(zone.topBullish)}>
                      {topZoneTicketLabel(zone.topBullish)}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="truncate text-emerald-200" title={topZoneTicketLabel(zone.topBearish)}>
                      {topZoneTicketLabel(zone.topBearish)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RelatedOutageEvidencePanel({
  rows,
}: {
  rows: TransmissionOutageImpactRow[];
}) {
  const relatedRows = rows
    .filter((row) => Boolean(row.constraintLink))
    .sort((left, right) => {
      const linkDiff = (right.constraintLink?.score ?? 0) - (left.constraintLink?.score ?? 0);
      if (linkDiff !== 0) return linkDiff;
      return Math.abs(right.shiftFactor ?? 0) - Math.abs(left.shiftFactor ?? 0);
    })
    .slice(0, 8);

  if (relatedRows.length === 0) return null;

  return (
    <div className="border-b border-gray-800 bg-[#111827] px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
          Related Outage Evidence
        </div>
        <div className="text-[11px] text-gray-600">Inferred</div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] gap-1">
          {relatedRows.map((row) => (
            <div
              key={`${row.ticketId}-${row.constraintLink?.relation}`}
              className="grid min-h-9 grid-cols-[120px_96px_minmax(160px,1fr)_88px] items-center gap-2 border-b border-gray-800/70 py-1.5 text-xs last:border-b-0"
            >
              <span
                className={`inline-flex min-w-0 items-center justify-center rounded-md border px-2 py-1 text-[11px] font-bold ${constraintLinkBadgeClass(
                  row.constraintLink,
                )}`}
                title={row.constraintLink?.evidenceText}
              >
                <span className="truncate">{row.constraintLink?.relation}</span>
              </span>
              <div className="truncate font-bold text-gray-100" title={row.ticketId}>
                {row.ticketId}
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-cyan-100" title={row.facilityName}>
                  {row.facilityName}
                </div>
                <div className="truncate text-[11px] text-gray-500" title={row.constraintLink?.evidenceText}>
                  {row.constraintLink?.evidenceText}
                </div>
              </div>
              <div className="text-right font-bold tabular-nums text-gray-100">
                {fmtNumber(row.shiftFactor, 3)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PjmConstraints({
  refreshToken,
  onFreshnessChange,
}: PjmConstraintsProps) {
  const [market, setMarket] = useState<PjmConstraintMarket>("da");
  const [view, setView] = useState<PjmConstraintsView>("heatmap");
  const [outageSubView, setOutageSubView] =
    useState<TransmissionOutageSubview>("tickets");
  const [selectedDate, setSelectedDate] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [outageFilters, setOutageFilters] = useState<OutageFilterState>(() =>
    defaultOutageFilters(),
  );
  const [debouncedOutageEquipmentSearch, setDebouncedOutageEquipmentSearch] = useState("");
  const [debouncedOutageTicketFilter, setDebouncedOutageTicketFilter] = useState("");
  const [debouncedOutageIncludeTerms, setDebouncedOutageIncludeTerms] = useState("");
  const [debouncedOutageExcludeTerms, setDebouncedOutageExcludeTerms] = useState("");
  const [localRefreshToken, setLocalRefreshToken] = useState(0);
  const [payload, setPayload] = useState<PjmConstraintsPayload | null>(null);
  const [shiftPayload, setShiftPayload] =
    useState<PjmConstraintShiftFactorsPayload | null>(null);
  const [outagePayload, setOutagePayload] =
    useState<TransmissionOutageImpactPayload | null>(null);
  const [linkedConstraint, setLinkedConstraint] =
    useState<LinkedConstraintSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [outageLoading, setOutageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [outageError, setOutageError] = useState<string | null>(null);
  const [heatmapSortState, setHeatmapSortState] = useState<SortState<HeatmapColumnKey>>({
    key: "totalValue",
    direction: "desc",
  });
  const shiftHourlyMetric: PjmConstraintShiftFactorHourlyMetric = "estimatedWesternHubImpact";
  const [shiftSortState, setShiftSortState] = useState<SortState<ShiftFactorColumnKey>>({
    key: "totalAbsShadowPrice",
    direction: "desc",
  });
  const [outageSortState, setOutageSortState] = useState<SortState<OutageImpactColumnKey>>({
    key: "absoluteShiftFactor",
    direction: "desc",
  });
  const [shiftColumnFilters, setShiftColumnFilters] =
    useState<ColumnFilters<ShiftFactorColumnKey>>({});
  const [outageColumnFilters, setOutageColumnFilters] =
    useState<ColumnFilters<OutageImpactColumnKey>>({});

  useEffect(() => {
    setSelectedDate("");
  }, [market]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedOutageEquipmentSearch(outageFilters.equipmentSearch.trim());
      setDebouncedOutageTicketFilter(outageFilters.ticketFilter.trim());
      setDebouncedOutageIncludeTerms(outageFilters.includeTerms.trim());
      setDebouncedOutageExcludeTerms(outageFilters.excludeTerms.trim());
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [
    outageFilters.equipmentSearch,
    outageFilters.excludeTerms,
    outageFilters.includeTerms,
    outageFilters.ticketFilter,
  ]);

  const effectiveRefreshToken = refreshToken + localRefreshToken;
  const outageApiFilters = useMemo(
    () => ({
      ...outageFilters,
      equipmentSearch: debouncedOutageEquipmentSearch,
      excludeTerms: debouncedOutageExcludeTerms,
      includeTerms: debouncedOutageIncludeTerms,
      ticketFilter: debouncedOutageTicketFilter,
    }),
    [
      debouncedOutageEquipmentSearch,
      debouncedOutageExcludeTerms,
      debouncedOutageIncludeTerms,
      debouncedOutageTicketFilter,
      outageFilters,
    ],
  );
  const apiUrl = useMemo(
    () =>
      buildApiUrl({
        market,
        date: selectedDate,
        search: debouncedSearch,
        refresh: effectiveRefreshToken > 0,
      }),
    [debouncedSearch, effectiveRefreshToken, market, selectedDate],
  );
  const cacheKey = useMemo(
    () => `pjm-constraints:${market}:daily:${selectedDate || "latest"}:${debouncedSearch}`,
    [debouncedSearch, market, selectedDate],
  );
  const shiftApiUrl = useMemo(
    () =>
      buildShiftFactorApiUrl({
        market,
        date: selectedDate,
        search: debouncedSearch,
        refresh: effectiveRefreshToken > 0,
        filters: outageApiFilters,
      }),
    [debouncedSearch, effectiveRefreshToken, market, outageApiFilters, selectedDate],
  );
  const shiftCacheKey = useMemo(
    () => `pjm-constraint-shift-factors:${shiftApiUrl}:${effectiveRefreshToken}`,
    [effectiveRefreshToken, shiftApiUrl],
  );
  const outageApiUrl = useMemo(
    () =>
      buildOutageImpactApiUrl({
        refresh: effectiveRefreshToken > 0,
        filters: outageApiFilters,
        linkedConstraint,
      }),
    [effectiveRefreshToken, linkedConstraint, outageApiFilters],
  );
  const outageCacheKey = useMemo(
    () => `pjm-transmission-outage-impacts:${outageApiUrl}:${effectiveRefreshToken}`,
    [effectiveRefreshToken, outageApiUrl],
  );

  useEffect(() => {
    if (view !== "heatmap") return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchJsonWithCache<PjmConstraintsPayload>({
      key: cacheKey,
      url: apiUrl,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: effectiveRefreshToken > 0 ? "no-store" : "default",
      forceRefresh: effectiveRefreshToken > 0,
    })
      .then((nextPayload) => {
        setPayload(nextPayload);
        if (!selectedDate && nextPayload.summary.selectedDate) {
          setSelectedDate(nextPayload.summary.selectedDate);
        }
        onFreshnessChange?.(freshnessFromPayload(nextPayload));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load PJM constraints");
        onFreshnessChange?.(DEFAULT_FRESHNESS);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [apiUrl, cacheKey, effectiveRefreshToken, onFreshnessChange, selectedDate, view]);

  useEffect(() => {
    if (view !== "modelledShiftFactors") return;
    const controller = new AbortController();
    setShiftLoading(true);
    setShiftError(null);

    fetchJsonWithCache<PjmConstraintShiftFactorsPayload>({
      key: shiftCacheKey,
      url: shiftApiUrl,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: effectiveRefreshToken > 0 ? "no-store" : "default",
      forceRefresh: effectiveRefreshToken > 0,
    })
      .then((nextPayload) => {
        setShiftPayload(nextPayload);
        if (!selectedDate && nextPayload.summary.selectedDate) {
          setSelectedDate(nextPayload.summary.selectedDate);
        }
        onFreshnessChange?.(freshnessFromShiftFactorPayload(nextPayload));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setShiftError(
          err instanceof Error
            ? err.message
            : "Failed to load PJM modelled shift factors",
        );
        onFreshnessChange?.(DEFAULT_FRESHNESS);
      })
      .finally(() => {
        if (!controller.signal.aborted) setShiftLoading(false);
      });

    return () => controller.abort();
  }, [
    effectiveRefreshToken,
    onFreshnessChange,
    selectedDate,
    shiftApiUrl,
    shiftCacheKey,
    view,
  ]);

  useEffect(() => {
    if (view !== "transmissionOutages") return;
    const controller = new AbortController();
    setOutageLoading(true);
    setOutageError(null);

    fetchJsonWithCache<TransmissionOutageImpactPayload>({
      key: outageCacheKey,
      url: outageApiUrl,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: effectiveRefreshToken > 0 ? "no-store" : "default",
      forceRefresh: effectiveRefreshToken > 0,
    })
      .then((nextPayload) => {
        setOutagePayload(nextPayload);
        onFreshnessChange?.(freshnessFromOutageImpactPayload(nextPayload));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setOutageError(
          err instanceof Error
            ? err.message
            : "Failed to load PJM transmission outage impacts",
        );
        onFreshnessChange?.(DEFAULT_FRESHNESS);
      })
      .finally(() => {
        if (!controller.signal.aborted) setOutageLoading(false);
      });

    return () => controller.abort();
  }, [
    effectiveRefreshToken,
    onFreshnessChange,
    outageApiUrl,
    outageCacheKey,
    view,
  ]);

  useEffect(() => {
    if (view === "heatmap") {
      onFreshnessChange?.(freshnessFromPayload(payload));
    } else if (view === "modelledShiftFactors") {
      onFreshnessChange?.(freshnessFromShiftFactorPayload(shiftPayload));
    } else {
      onFreshnessChange?.(freshnessFromOutageImpactPayload(outagePayload));
    }
  }, [onFreshnessChange, outagePayload, payload, shiftPayload, view]);

  const heatmapColumns = useMemo(
    () =>
      buildHeatmapColumns(
        payload?.summary.maxTotalValue ?? 0,
        payload?.summary.maxHourlyValue ?? 0,
      ),
    [payload?.summary.maxHourlyValue, payload?.summary.maxTotalValue],
  );
  const shiftHourlyMetricLabel =
    shiftHourlyMetric === "estimatedWesternHubImpact" ? "Est WHUB" : "Shadow Price";
  const shiftMaxAbsHourlyValue =
    shiftHourlyMetric === "estimatedWesternHubImpact"
      ? (shiftPayload?.summary.maxAbsHourlyEstimatedWesternHubImpact ?? 0)
      : (shiftPayload?.summary.maxAbsHourlyShadowPrice ?? 0);
  const shiftColumns = useMemo(
    () =>
      buildShiftColumns({
        metric: shiftHourlyMetric,
        hourlyMetricLabel: shiftHourlyMetricLabel,
        maxAbsHourlyValue: shiftMaxAbsHourlyValue,
        maxAbsEstimatedWesternHubImpact:
          shiftPayload?.summary.maxAbsEstimatedWesternHubImpact ?? 0,
      }),
    [
      shiftHourlyMetric,
      shiftHourlyMetricLabel,
      shiftMaxAbsHourlyValue,
      shiftPayload?.summary.maxAbsEstimatedWesternHubImpact,
    ],
  );
  const visibleShiftColumns = shiftColumns;
  const outageColumns = useMemo(
    () =>
      buildOutageImpactColumns(
        outagePayload?.summary.maxAbsShiftFactor ?? 0,
        Boolean(linkedConstraint),
      ),
    [linkedConstraint, outagePayload?.summary.maxAbsShiftFactor],
  );

  const filteredHeatmapRows = useMemo(
    () => payload?.rows ?? [],
    [payload?.rows],
  );

  const shiftFilterOptions = useMemo(
    () => buildColumnFilterOptions(shiftPayload?.rows ?? [], visibleShiftColumns, shiftColumnFilters),
    [shiftColumnFilters, shiftPayload?.rows, visibleShiftColumns],
  );
  const filteredShiftRows = useMemo(
    () => filterRowsByColumns(shiftPayload?.rows ?? [], visibleShiftColumns, shiftColumnFilters),
    [shiftColumnFilters, shiftPayload?.rows, visibleShiftColumns],
  );

  const apiFilteredOutageRows = useMemo(() => outagePayload?.rows ?? [], [outagePayload?.rows]);
  const outageFilterOptions = useMemo(
    () => buildColumnFilterOptions(apiFilteredOutageRows, outageColumns, outageColumnFilters),
    [apiFilteredOutageRows, outageColumnFilters, outageColumns],
  );
  const filteredOutageRows = useMemo(
    () => filterRowsByColumns(apiFilteredOutageRows, outageColumns, outageColumnFilters),
    [apiFilteredOutageRows, outageColumnFilters, outageColumns],
  );

  const sortedHeatmapRows = useMemo(() => {
    const rows = filteredHeatmapRows;
    const column = heatmapColumns.find((candidate) => candidate.key === heatmapSortState.key);
    if (!column) return rows;
    return [...rows].sort((left, right) => {
      const primary = compareSortableValues(
        column.sortValue(left),
        column.sortValue(right),
        heatmapSortState.direction,
      );
      if (primary !== 0) return primary;
      return left.monitoredFacility.localeCompare(right.monitoredFacility, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [filteredHeatmapRows, heatmapColumns, heatmapSortState]);

  const sortedShiftRows = useMemo(() => {
    const rows = filteredShiftRows;
    const column = shiftColumns.find((candidate) => candidate.key === shiftSortState.key);
    if (!column) return rows;
    return [...rows].sort((left, right) => {
      const primary = compareSortableValues(
        column.sortValue(left),
        column.sortValue(right),
        shiftSortState.direction,
      );
      if (primary !== 0) return primary;
      return left.monitoredFacility.localeCompare(right.monitoredFacility, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [filteredShiftRows, shiftColumns, shiftSortState]);

  const sortedOutageRows = useMemo(() => {
    const column = outageColumns.find((candidate) => candidate.key === outageSortState.key);
    if (!column) return filteredOutageRows;
    return [...filteredOutageRows].sort((left, right) => {
      const primary = compareSortableValues(
        column.sortValue(left),
        column.sortValue(right),
        outageSortState.direction,
      );
      if (primary !== 0) return primary;
      return left.ticketId.localeCompare(right.ticketId, undefined, { numeric: true });
    });
  }, [filteredOutageRows, outageColumns, outageSortState]);

  const updateHeatmapSort = (key: HeatmapColumnKey, direction?: SortDirection) => {
    setHeatmapSortState((current) => {
      if (direction) return { key, direction };
      if (current.key !== key) {
        return { key, direction: key === "monitoredFacility" || key === "contingencyFacility" ? "asc" : "desc" };
      }
      return { key, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  };
  const updateShiftSort = (key: ShiftFactorColumnKey, direction?: SortDirection) => {
    setShiftSortState((current) => {
      if (direction) return { key, direction };
      if (current.key !== key) {
        return {
          key,
          direction:
            key === "monitoredFacility" ||
            key === "contingencyFacility" ||
            key === "matchStatus" ||
            key === "matchedBranchName" ||
            key === "direction"
              ? "asc"
              : "desc",
        };
      }
      return { key, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  };
  const updateOutageSort = (key: OutageImpactColumnKey, direction?: SortDirection) => {
    setOutageSortState((current) => {
      if (direction) return { key, direction };
      if (current.key !== key) {
        return {
          key,
          direction:
            key === "ticketId" ||
            key === "zoneCompany" ||
            key === "facilityName" ||
            key === "relatedEquipmentText" ||
            key === "matchedBranchName" ||
            key === "whubDirection" ||
            key === "matchStatus" ||
            key === "startDate" ||
            key === "startTime" ||
            key === "endDate" ||
            key === "endTime" ||
            key === "currentStatus" ||
            key === "changeTypes"
              ? "asc"
              : "desc",
        };
      }
      return { key, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  };
  const updateShiftColumnFilter = (key: ShiftFactorColumnKey, values: string[]) => {
    setShiftColumnFilters((filters) => updateColumnFilterState(filters, key, values));
  };
  const updateOutageColumnFilter = (key: OutageImpactColumnKey, values: string[]) => {
    setOutageColumnFilters((filters) => updateColumnFilterState(filters, key, values));
  };
  const selectLinkedConstraint = (row: PjmConstraintShiftFactorRow) => {
    setLinkedConstraint({
      monitoredFacility: row.monitoredFacility,
      contingencyFacility: row.contingencyFacility,
      matchedBranchKey: row.matchedBranchKey,
      matchedBranchName: row.matchedBranchName,
      fromBusNumber: row.fromBusNumber,
      fromBusName: row.fromBusName,
      toBusNumber: row.toBusNumber,
      toBusName: row.toBusName,
      circuitId: row.circuitId,
      shiftFactor: row.shiftFactor,
      estimatedWesternHubImpact: row.estimatedWesternHubImpact,
    });
    setOutageSubView("tickets");
    setOutageColumnFilters({});
    setOutageSortState({ key: "constraintLink", direction: "desc" });
    setOutagePayload(null);
    setView("transmissionOutages");
  };
  const toggleZoneFilter = (zoneCompany: string) => {
    setOutageSubView("tickets");
    setOutageColumnFilters((filters) => {
      const selected = filters.zoneCompany ?? [];
      const nextValues =
        selected.length === 1 && selected[0] === zoneCompany ? [] : [zoneCompany];
      return updateColumnFilterState(filters, "zoneCompany", nextValues);
    });
  };
  const clearLinkedConstraint = () => {
    setLinkedConstraint(null);
    setOutageSortState({ key: "absoluteShiftFactor", direction: "desc" });
    setOutagePayload(null);
  };
  const activeError =
    view === "heatmap"
      ? error
      : view === "modelledShiftFactors"
        ? shiftError
        : outageError;
  const dateControlValue =
    selectedDate || payload?.summary.selectedDate || shiftPayload?.summary.selectedDate || "";
  const searchIsApplied =
    view === "transmissionOutages"
      ? outageFilters.equipmentSearch.trim() === debouncedOutageEquipmentSearch &&
        outageFilters.excludeTerms.trim() === debouncedOutageExcludeTerms &&
        outageFilters.includeTerms.trim() === debouncedOutageIncludeTerms &&
        outageFilters.ticketFilter.trim() === debouncedOutageTicketFilter
      : search.trim() === debouncedSearch;
  const heatmapRowCount = payload?.summary.rowCount ?? 0;
  const bindingIntervals = payload?.summary.bindingIntervals ?? 0;
  const shiftRowCount = shiftPayload?.summary.rowCount ?? 0;
  const matchedConstraintCount = shiftPayload?.summary.matchedConstraintCount ?? 0;
  const outageRowCount =
    outagePayload?.summary.candidateTicketCount ?? outagePayload?.summary.latestTicketCount ?? 0;
  const matchedOutageCount = outagePayload?.summary.matchedTicketCount ?? 0;
  const zoneImpactRows = outagePayload?.summary.zoneImpacts ?? [];
  const zoneImpactTicketCount = zoneImpactRows.reduce(
    (sum, zone) => sum + zone.ticketCount,
    0,
  );
  const activeRowCount =
    view === "heatmap"
      ? (payload ? sortedHeatmapRows.length : heatmapRowCount)
      : view === "modelledShiftFactors"
        ? (shiftPayload ? sortedShiftRows.length : shiftRowCount)
        : outageSubView === "zonalImpact"
          ? zoneImpactRows.length
          : (outagePayload ? sortedOutageRows.length : outageRowCount);
  const activePeriodLabel =
    view === "heatmap"
      ? selectedPeriodLabel(payload)
      : view === "modelledShiftFactors"
        ? selectedPeriodLabel(shiftPayload)
        : outageDateSelectionLabel(outageApiFilters);
  const activeModeLabel =
    view === "heatmap"
      ? "Daily hourly-equivalent by HE"
      : view === "modelledShiftFactors"
        ? "Modelled shift factors"
        : outageSubView === "zonalImpact"
          ? "Transmission outage zonal impact"
          : linkedConstraint
            ? "Related outage tickets + RAW WHUB SF"
            : "Transmission outage tickets + RAW WHUB SF";
  const activeFourthLabel =
    view === "heatmap"
      ? "Binding Intervals"
      : view === "transmissionOutages" && outageSubView === "zonalImpact"
        ? "Tickets"
        : "Matched";
  const activeFourthValue =
    view === "heatmap"
      ? fmtNumber(bindingIntervals)
      : view === "modelledShiftFactors"
        ? fmtNumber(matchedConstraintCount)
        : outageSubView === "zonalImpact"
          ? fmtNumber(zoneImpactTicketCount)
          : fmtNumber(matchedOutageCount);
  const activeSourceMaxLabel = view === "heatmap" ? "Source Max" : view === "modelledShiftFactors" ? "Model File" : "Snapshot";
  const activeSourceMaxValue =
    view === "heatmap"
      ? fmtDateTime(payload?.summary.sourceMaxTimestamp)
      : view === "modelledShiftFactors"
        ? shiftPayload?.summary.model.rawFileUpdatedAt
          ? fmtDateTime(shiftPayload.summary.model.rawFileUpdatedAt)
          : shiftPayload?.summary.model.rawFilePresent
            ? "Present"
            : "Missing"
        : fmtDateTime(outagePayload?.selectedSnapshot?.sourceReportTimestamp);
  const activeLatestUpdate =
    view === "heatmap"
      ? payload?.summary.latestUpdateTimestamp
      : view === "modelledShiftFactors"
        ? shiftPayload?.summary.latestUpdateTimestamp
        : outagePayload?.selectedSnapshot?.ingestedAt;
  const heatmapTableWidth = heatmapColumns.reduce((sum, column) => sum + column.width, 0);
  const shiftTableWidth = visibleShiftColumns.reduce((sum, column) => sum + column.width, 0);
  const outageTableWidth = outageColumns.reduce((sum, column) => sum + column.width, 0);
  const renderedHeatmapRows = sortedHeatmapRows.slice(0, MAX_RENDERED_ROWS);
  const renderedShiftRows = sortedShiftRows.slice(0, MAX_RENDERED_ROWS);
  const renderedOutageRows = sortedOutageRows.slice(0, MAX_RENDERED_ROWS);
  const selectedZoneFilters = outageColumnFilters.zoneCompany ?? [];
  const modelStatus =
    view === "modelledShiftFactors"
      ? shiftPayload?.summary.model.status
      : view === "transmissionOutages"
        ? outagePayload?.summary.model.status
        : null;
  const modelStatusMessage =
    view === "modelledShiftFactors"
      ? shiftPayload?.summary.model.statusMessage
      : view === "transmissionOutages"
        ? outagePayload?.summary.model.statusMessage
        : null;
  const outageStatusOptions = useMemo(
    () =>
      Array.from(
        new Set([...(outagePayload?.metadata.statuses ?? []), ...outageFilters.statuses]),
      ).sort(sortFilterOption),
    [outageFilters.statuses, outagePayload?.metadata.statuses],
  );
  const refreshTableData = () => {
    if (view === "transmissionOutages") {
      setOutageFilters((filters) => ({
        ...filters,
        equipmentSearch: filters.equipmentSearch.trim(),
        excludeTerms: filters.excludeTerms.trim(),
        includeTerms: filters.includeTerms.trim(),
        ticketFilter: filters.ticketFilter.trim(),
      }));
    } else {
      setSearch((value) => value.trim());
    }
    setLocalRefreshToken((value) => value + 1);
  };
  const resetTransmissionOutages = () => {
    setOutageFilters(defaultOutageFilters());
    setOutageSubView("tickets");
    setOutageColumnFilters({});
    setLinkedConstraint(null);
    setOutageSortState({ key: "absoluteShiftFactor", direction: "desc" });
    setOutagePayload(null);
    setLocalRefreshToken((value) => value + 1);
  };
  const tableControls =
    view === "transmissionOutages" ? (
      <TableControlBar>
        <div className="w-full">
          <InlineFilterGroup
            label="Outage View"
            value={outageSubView}
            onChange={setOutageSubView}
            options={[
              { key: "tickets", label: "Tickets" },
              { key: "zonalImpact", label: "Zonal Impact" },
            ]}
          />
        </div>
        <OutageFilterControls
          filters={outageFilters}
          statusOptions={outageStatusOptions}
          onChange={setOutageFilters}
          onRefresh={refreshTableData}
          onReset={resetTransmissionOutages}
        />
      </TableControlBar>
    ) : (
      <TableControlBar>
        <>
          <InlineFilterGroup
            label="Market"
            value={market}
            onChange={setMarket}
            options={[
              { key: "rt", label: "RT" },
              { key: "da", label: "DA" },
            ]}
          />
          <DateTableControl value={dateControlValue} onChange={setSelectedDate} />
        </>
        <SearchTableControl
          value={search}
          onChange={setSearch}
          onRefresh={refreshTableData}
          placeholder="Constraint or contingency"
        />
      </TableControlBar>
    );

  return (
    <div className="space-y-3">
      {activeError && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
          {activeError}
        </div>
      )}

      <ViewFilterCard view={view} onChange={setView} />

      <div className="overflow-hidden rounded-lg border border-gray-800 bg-[#12141d]">
        <div className="border-b border-gray-800 p-3">
          <div
            className={`flex flex-col gap-3 ${
              view === "transmissionOutages" ? "" : "xl:flex-row xl:items-end xl:justify-between"
            }`}
          >
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">
                PJM Constraints
              </div>
              <h2 className="mt-1 text-base font-semibold text-gray-100">
                Constraint Monitor
              </h2>
            </div>
            {tableControls}
          </div>
        </div>

        <div className="grid border-b border-gray-800 bg-gray-950/55 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryTile label="Period" value={activePeriodLabel} />
          <SummaryTile label="Mode" value={activeModeLabel} />
          <SummaryTile label="Rows" value={fmtNumber(activeRowCount)} />
          <SummaryTile label={activeFourthLabel} value={activeFourthValue} />
          <SummaryTile label={activeSourceMaxLabel} value={activeSourceMaxValue} />
          <SummaryTile label="Ingested" value={fmtDateTime(activeLatestUpdate)} />
        </div>

        {modelStatus && modelStatus !== "ready" && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {modelStatusMessage}
          </div>
        )}

        {view === "transmissionOutages" && linkedConstraint && (
          <SelectedConstraintStrip
            selection={linkedConstraint}
            onClear={clearLinkedConstraint}
          />
        )}

        {view === "transmissionOutages" && outageSubView === "tickets" && linkedConstraint && (
          <RelatedOutageEvidencePanel rows={apiFilteredOutageRows} />
        )}

        <div
          className={`${
            view === "transmissionOutages"
              ? "h-[calc(100vh-560px)] min-h-[300px]"
              : "h-[calc(100vh-390px)] min-h-[340px]"
          } overflow-auto`}
        >
          {view === "heatmap" && (
          <table
            className="table-fixed border-separate border-spacing-0 bg-[#0d1119] text-xs text-gray-200"
            style={{ width: heatmapTableWidth }}
          >
            <colgroup>
              {heatmapColumns.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-40">
              <tr className="border-b border-gray-800">
                {heatmapColumns.map((column) => (
                  <SimpleHeader
                    key={column.key}
                    column={column}
                    sortState={heatmapSortState}
                    onSort={updateHeatmapSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {renderedHeatmapRows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={heatmapColumns.length} className="px-3 py-8 text-sm text-gray-500">
                    No constraints match the active filters.
                  </td>
                </tr>
              ) : null}
              {loading && !payload ? (
                <tr>
                  <td colSpan={heatmapColumns.length} className="px-3 py-8 text-sm text-gray-500">
                    Loading constraints...
                  </td>
                </tr>
              ) : null}
              {renderedHeatmapRows.map((row, rowIndex) => {
                const rowBg = rowIndex % 2 === 0 ? "bg-[#111827]" : "bg-[#1f2937]";
                return (
                <tr
                  key={`${row.monitoredFacility}-${row.contingencyFacility}`}
                  className={`${rowBg} hover:bg-gray-800/80`}
                >
                  {heatmapColumns.map((column, index) => {
                    const isSticky = index === 0 || index === 1;
                    const cellStyle = isSticky ? undefined : column.cellStyle?.(row);
                    const cellPadding = isSticky ? "px-3 py-0" : "px-2 py-0";
                    return (
                      <td
                        key={column.key}
                        className={`h-8 border-r border-gray-800 ${cellPadding} align-middle ${
                          column.align === "right"
                            ? "text-right tabular-nums"
                            : column.align === "center"
                              ? "text-center tabular-nums"
                              : "text-left"
                        } ${
                          index === 0
                            ? `sticky left-0 z-10 ${rowBg}`
                            : index === 1
                              ? `sticky left-[350px] z-10 ${rowBg}`
                              : ""
                        } ${column.cellClassName?.(row) ?? ""}`}
                        style={cellStyle}
                        title={String(column.sortValue(row) ?? "")}
                      >
                        <div className={tableCellContentClass()}>{column.render(row)}</div>
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
          )}

          {view === "modelledShiftFactors" && (
            <table
              className="table-fixed border-separate border-spacing-0 bg-[#0d1119] text-xs text-gray-200"
              style={{ width: shiftTableWidth }}
            >
              <colgroup>
                {visibleShiftColumns.map((column) => (
                  <col key={column.key} style={{ width: column.width }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-40">
                <tr className="border-b border-gray-800">
                  {visibleShiftColumns.map((column) => (
                    <SimpleHeader
                      key={column.key}
                      column={column}
                      sortState={shiftSortState}
                      onSort={updateShiftSort}
                      filterOptions={shiftFilterOptions[column.key] ?? []}
                      selectedFilters={shiftColumnFilters[column.key] ?? []}
                      onFilterChange={updateShiftColumnFilter}
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {renderedShiftRows.length === 0 && !shiftLoading ? (
                  <tr>
                    <td colSpan={visibleShiftColumns.length} className="px-3 py-8 text-sm text-gray-500">
                      No constraints match the active filters.
                    </td>
                  </tr>
                ) : null}
                {shiftLoading && !shiftPayload ? (
                  <tr>
                    <td colSpan={visibleShiftColumns.length} className="px-3 py-8 text-sm text-gray-500">
                      Loading modelled shift factors...
                    </td>
                  </tr>
                ) : null}
                {renderedShiftRows.map((row, rowIndex) => {
                  const hasPreview = (row.outagePreview?.relatedTicketCount ?? 0) > 0;
                  const rowBg = hasPreview
                    ? rowIndex % 2 === 0
                      ? "bg-[#102033]"
                      : "bg-[#12283d]"
                    : rowIndex % 2 === 0
                      ? "bg-[#111827]"
                      : "bg-[#1f2937]";
                  const rowTitle = hasPreview
                    ? outagePreviewTitle(row)
                    : "Select for related outage evidence";
                  return (
                  <tr
                    key={`${row.monitoredFacility}-${row.contingencyFacility}`}
                    tabIndex={0}
                    onClick={() => selectLinkedConstraint(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectLinkedConstraint(row);
                      }
                    }}
                    className={`${rowBg} cursor-pointer ${
                      hasPreview ? "shadow-[inset_3px_0_0_rgba(34,211,238,0.55)] hover:bg-cyan-950/50" : "hover:bg-gray-800/80"
                    } focus:outline-none focus:ring-1 focus:ring-cyan-500/60`}
                    title={rowTitle}
                  >
                    {visibleShiftColumns.map((column, index) => {
                      const isSticky = index === 0 || index === 1;
                      const cellStyle = isSticky ? undefined : column.cellStyle?.(row);
                      const cellPadding = isSticky ? "px-3 py-0" : "px-2 py-0";
                      return (
                        <td
                          key={column.key}
                          className={`h-8 border-r border-gray-800 ${cellPadding} align-middle ${
                            column.align === "right"
                              ? "text-right tabular-nums"
                              : column.align === "center"
                                ? "text-center tabular-nums"
                                : "text-left"
                          } ${
                            index === 0
                              ? `sticky left-0 z-10 ${rowBg}`
                              : index === 1
                                ? `sticky left-[350px] z-10 ${rowBg}`
                                : ""
                          } ${column.cellClassName?.(row) ?? ""}`}
                          style={cellStyle}
                          title={String(column.sortValue(row) ?? "")}
                        >
                          <div className={tableCellContentClass()}>{column.render(row)}</div>
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {view === "transmissionOutages" && outageSubView === "zonalImpact" && (
            <>
              {outageLoading && !outagePayload ? (
                <div className="px-3 py-8 text-sm text-gray-500">
                  Loading transmission outage impacts...
                </div>
              ) : (
                <ZoneImpactPanel
                  zones={zoneImpactRows}
                  selectedZones={selectedZoneFilters}
                  onZoneClick={toggleZoneFilter}
                />
              )}
            </>
          )}

          {view === "transmissionOutages" && outageSubView === "tickets" && (
            <table
              className="table-fixed border-separate border-spacing-0 bg-[#0d1119] text-xs text-gray-200"
              style={{ width: outageTableWidth }}
            >
              <colgroup>
                {outageColumns.map((column) => (
                  <col key={column.key} style={{ width: column.width }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-40">
                <tr className="border-b border-gray-800">
                  {outageColumns.map((column) => (
                    <SimpleHeader
                      key={column.key}
                      column={column}
                      sortState={outageSortState}
                      onSort={updateOutageSort}
                      filterOptions={outageFilterOptions[column.key] ?? []}
                      selectedFilters={outageColumnFilters[column.key] ?? []}
                      onFilterChange={updateOutageColumnFilter}
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {renderedOutageRows.length === 0 && !outageLoading ? (
                  <tr>
                    <td colSpan={outageColumns.length} className="px-3 py-8 text-sm text-gray-500">
                      No transmission outage tickets match the active filters.
                    </td>
                  </tr>
                ) : null}
                {outageLoading && !outagePayload ? (
                  <tr>
                    <td colSpan={outageColumns.length} className="px-3 py-8 text-sm text-gray-500">
                      Loading transmission outage impacts...
                    </td>
                  </tr>
                ) : null}
                {renderedOutageRows.map((row, rowIndex) => {
                  const rowBg = rowIndex % 2 === 0 ? "bg-[#111827]" : "bg-[#1f2937]";
                  return (
                  <tr
                    key={row.ticketId}
                    className={`${rowBg} hover:bg-gray-800/80`}
                  >
                    {outageColumns.map((column, index) => {
                      const isSticky = index === 0 || index === 1;
                      const cellStyle = isSticky ? undefined : column.cellStyle?.(row);
                      const cellPadding = isSticky ? "px-3 py-0" : "px-2 py-0";
                      return (
                        <td
                          key={column.key}
                          className={`h-8 border-r border-gray-800 ${cellPadding} align-middle ${
                            column.align === "right"
                              ? "text-right tabular-nums"
                              : column.align === "center"
                                ? "text-center tabular-nums"
                                : "text-left"
                          } ${
                            index === 0
                              ? `sticky left-0 z-10 ${rowBg}`
                              : index === 1
                                ? `sticky left-[96px] z-10 ${rowBg}`
                                : ""
                          } ${column.cellClassName?.(row) ?? ""}`}
                          style={cellStyle}
                          title={String(column.sortValue(row) ?? "")}
                        >
                          <div className={tableCellContentClass()}>{column.render(row)}</div>
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-gray-800 bg-[#12141d] px-3 py-2 text-xs text-gray-500">
          {view === "heatmap" ? (
            <>
              Hourly-equivalent absolute shadow price | Source: {payload?.summary.sourceTable ?? "-"}
              {sortedHeatmapRows.length > renderedHeatmapRows.length
                ? ` | Showing ${fmtNumber(renderedHeatmapRows.length)} of ${fmtNumber(sortedHeatmapRows.length)} filtered constraints`
                : ""}
            </>
          ) : view === "modelledShiftFactors" ? (
            <>
              {shiftHourlyMetricLabel} hourly profile | Source: {shiftPayload?.summary.sourceTable ?? "-"} and RAW network model
              {sortedShiftRows.length > renderedShiftRows.length
                ? ` | Showing ${fmtNumber(renderedShiftRows.length)} of ${fmtNumber(sortedShiftRows.length)} filtered constraints`
                : ""}
            </>
          ) : (
            <>
              RAW-derived WHUB transfer sensitivity for outage facilities | Source: pjm.transmission_outages_raw and RAW network model
              {outagePayload
                ? outageSubView === "zonalImpact"
                  ? ` | Zonal impact ${fmtNumber(zoneImpactRows.length)} zones | Tickets ${fmtNumber(zoneImpactTicketCount)}`
                  : ` | Modelled ${fmtNumber(outagePayload.summary.modeledTicketCount)} tickets | Candidate ${fmtNumber(outagePayload.summary.candidateTicketCount)} | Returned ${fmtNumber(outagePayload.summary.returnedTicketCount)}`
                : ""}
              {outageSubView === "tickets" && sortedOutageRows.length > renderedOutageRows.length
                ? ` | Showing ${fmtNumber(renderedOutageRows.length)} of ${fmtNumber(sortedOutageRows.length)} filtered tickets`
                : ""}
            </>
          )}
        </div>
      </div>

      {!searchIsApplied && (
        <div className="text-right text-xs text-gray-600">
          {view === "transmissionOutages" ? "Outage filters pending" : "Search pending"}
        </div>
      )}
    </div>
  );
}
