"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";

import ColumnFilterMenu, { type SortDirection } from "@/components/dashboard/ColumnFilterMenu";
import ControlCard from "@/components/dashboard/ControlCard";
import DashboardTabs from "@/components/dashboard/DashboardTabs";
import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import {
  GAS_REGION_LABELS,
  type DailyGasPriceRow,
  type DailyGasPricesPayload,
} from "@/lib/gasPricing";

const API_TTL_MS = 60_000;
const MARKET_CONTEXT_TTL_MS = 5 * 60 * 1000;
const EMPTY_FILTER_VALUES: string[] = [];
const TRANSCO_CONTEXT_MARKETS = [
  "Transco Station 85",
  "Transco Zone 5 South",
  "Transco Zone 5 North",
  "Transco Zone 6 NY",
  "Transco Leidy",
] as const;
type GasEbbTab = "outages" | "notices";
type CriticalFilter = "all" | "critical" | "noncritical";
type OutageColumnKey =
  | "zone"
  | "deliveryReceipt"
  | "locationName"
  | "availableCapacityMdtPerDay"
  | "flowDirection"
  | "effectiveStartAtUtc"
  | "effectiveEndAtUtc"
  | "jobNumber"
  | "sourceNoticeId"
  | "noticeStatusDesc"
  | "subject"
  | "postedAtUtc";
type NoticeColumnKey =
  | "postedAtUtc"
  | "sourceNoticeId"
  | "criticalInd"
  | "noticeType"
  | "noticeStatusDesc"
  | "subject"
  | "effectiveAtUtc"
  | "endAtUtc"
  | "lastSeenAtUtc";
type SortableValue = string | number | null;
type ColumnFilters<K extends string> = Partial<Record<K, string[]>>;

interface SupportingDataTable {
  title: string | null;
  headers: string[];
  rows: Array<Record<string, unknown>>;
}

interface GasEbbNoticeDetail {
  sourceNoticeId: string;
  sourceContentHash: string | null;
  noticeStream: string;
  criticalInd: boolean;
  noticeType: string | null;
  noticeStatusDesc: string | null;
  subject: string | null;
  postedAtUtc: string | null;
  postedAtSource: string | null;
  effectiveAtUtc?: string | null;
  effectiveAtSource?: string | null;
  endAtUtc?: string | null;
  endAtSource?: string | null;
  responseAtUtc?: string | null;
  responseAtSource?: string | null;
  priorNoticeId: string | null;
  detailUrl: string | null;
  downloadUrl: string | null;
  lastSeenAtUtc: string | null;
  lastDetailFetchedAtUtc: string | null;
  lastDetailErrorAtUtc: string | null;
  lastDetailErrorMessage: string | null;
  noticeText: string | null;
  detailCleanText: string | null;
  detailMetadata: Record<string, unknown>;
  supportingData: SupportingDataTable[];
  detailFetchedAtUtc: string | null;
}

interface GasEbbNoticeRow extends GasEbbNoticeDetail {
  isCurrentOnEbb: boolean;
  firstSeenAtUtc: string | null;
  staleAtUtc: string | null;
  effectiveAtUtc: string | null;
  endAtUtc: string | null;
  responseAtUtc: string | null;
}

interface GasEbbOutageRow extends GasEbbNoticeDetail {
  sourceContentHash: string;
  outageSequence: number;
  classification: string;
  confidence: number | null;
  effectiveStartAtUtc: string | null;
  effectiveEndAtUtc: string | null;
  locationId: string | null;
  locationName: string | null;
  zone: string | null;
  deliveryReceipt: string | null;
  tsbType: string | null;
  availableCapacityMdtPerDay: number | null;
  highestPriorityIncluded: string | null;
  flowDirection: string | null;
  jobNumber: string | null;
  sourceTableTitle: string | null;
  sourceRowJson: Record<string, unknown>;
  derivedAtUtc: string | null;
}

interface GasEbbPayload {
  generatedAtUtc: string;
  metadata: {
    sourceFamily: "williams_1line";
    pipelineKey: "williams_transco";
    pipelineName: "Williams Transco";
    sourceTable: string;
    currentNoticeCount: number;
    currentOutageCount: number;
    currentCriticalNoticeCount: number;
    noticesWithDetailCount: number;
    latestPostedAtUtc: string | null;
    latestLastSeenAtUtc: string | null;
    latestDetailFetchedAtUtc: string | null;
    latestOutageDerivedAtUtc: string | null;
  };
  notices: GasEbbNoticeRow[];
  outages: GasEbbOutageRow[];
}

interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

interface ColumnDefinition<T, K extends string> {
  key: K;
  label: string;
  align?: "left" | "right";
  sticky?: boolean;
  className?: string;
  value: (row: T) => string;
  sortValue?: (row: T) => SortableValue;
  render?: (row: T) => ReactNode;
}

interface SelectedNoticeState {
  notice: GasEbbNoticeDetail;
  outage?: GasEbbOutageRow;
}

interface TranscoHubContext {
  row: DailyGasPriceRow;
  cash: number | null;
  balmo: number | null;
  monthPoints: Array<{ label: string; value: number | null }>;
}

const EMPTY_OUTAGE_ROWS: GasEbbOutageRow[] = [];
const EMPTY_NOTICE_ROWS: GasEbbNoticeRow[] = [];

const WORKSPACE_TABS = [
  { value: "outages", label: "Outages" },
  { value: "notices", label: "Notices" },
] satisfies Array<{ value: GasEbbTab; label: string }>;

function displayText(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "--";
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "--";
  if (typeof value === "string") return displayText(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "--";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return JSON.stringify(value);
}

function fmtDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "--";
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `$${value.toFixed(3)}`;
}

function fmtCapacity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtPercent(value: number): string {
  return `${Math.max(0, Math.min(100, value)).toFixed(2)}%`;
}

function statusLabel(row: Pick<GasEbbNoticeDetail, "noticeStatusDesc" | "criticalInd">): string {
  return row.noticeStatusDesc ?? (row.criticalInd ? "Critical" : "Current");
}

function statusClass(row: Pick<GasEbbNoticeDetail, "lastDetailErrorAtUtc" | "criticalInd" | "noticeStatusDesc">): string {
  const status = row.noticeStatusDesc?.toLowerCase() ?? "";
  if (row.lastDetailErrorAtUtc) return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  if (status.includes("cancel") || status.includes("inactive")) {
    return "border-red-500/35 bg-red-500/10 text-red-200";
  }
  if (row.criticalInd) return "border-sky-500/35 bg-sky-500/10 text-sky-100";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

function filterOptionValue(value: string): string {
  return value.trim() ? value : "--";
}

function sortedFilterValues(values: string[]): string[] {
  return Array.from(new Set(values.map(filterOptionValue))).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
}

function compareSortableValues(left: SortableValue, right: SortableValue, direction: SortDirection): number {
  const multiplier = direction === "asc" ? 1 : -1;
  const leftMissing = left === null || left === "";
  const rightMissing = right === null || right === "";
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  if (typeof left === "number" && typeof right === "number") {
    return (left - right) * multiplier;
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true }) * multiplier;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function dateSortValue(value: string | null | undefined): number | null {
  return parseTime(value);
}

function capacitySortValue(value: number | null | undefined): number | null {
  return value === null || value === undefined || !Number.isFinite(value) ? null : value;
}

function rowMatchesSearch(values: Array<string | null | undefined>, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => (value ?? "").toLowerCase().includes(normalized));
}

function rowMatchesColumnFilters<T, K extends string>(
  row: T,
  columns: Array<ColumnDefinition<T, K>>,
  filters: ColumnFilters<K>,
): boolean {
  return columns.every((column) => {
    const selected = filters[column.key] ?? EMPTY_FILTER_VALUES;
    if (!selected.length) return true;
    return selected.includes(filterOptionValue(column.value(row)));
  });
}

function updateColumnFilter<K extends string>(
  filters: ColumnFilters<K>,
  key: K,
  values: string[],
): ColumnFilters<K> {
  const next = { ...filters };
  if (values.length) {
    next[key] = values;
  } else {
    delete next[key];
  }
  return next;
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function downloadCsv<T, K extends string>(
  filename: string,
  rows: T[],
  columns: Array<ColumnDefinition<T, K>>,
): void {
  const lines = [
    columns.map((column) => csvEscape(column.label)).join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(column.value(row))).join(",")),
  ];
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function outageNoticeDetail(row: GasEbbOutageRow): GasEbbNoticeDetail {
  return {
    sourceNoticeId: row.sourceNoticeId,
    sourceContentHash: row.sourceContentHash,
    noticeStream: row.noticeStream,
    criticalInd: row.criticalInd,
    noticeType: row.noticeType,
    noticeStatusDesc: row.noticeStatusDesc,
    subject: row.subject,
    postedAtUtc: row.postedAtUtc,
    postedAtSource: row.postedAtSource,
    effectiveAtUtc: row.effectiveStartAtUtc,
    effectiveAtSource: row.effectiveAtSource,
    endAtUtc: row.effectiveEndAtUtc,
    endAtSource: row.endAtSource,
    priorNoticeId: row.priorNoticeId,
    detailUrl: row.detailUrl,
    downloadUrl: row.downloadUrl,
    lastSeenAtUtc: row.lastSeenAtUtc,
    lastDetailFetchedAtUtc: row.lastDetailFetchedAtUtc,
    lastDetailErrorAtUtc: row.lastDetailErrorAtUtc,
    lastDetailErrorMessage: row.lastDetailErrorMessage,
    noticeText: row.noticeText,
    detailCleanText: row.detailCleanText,
    detailMetadata: row.detailMetadata,
    supportingData: row.supportingData,
    detailFetchedAtUtc: row.detailFetchedAtUtc,
  };
}

function outageTooltip(row: GasEbbOutageRow): string {
  return [
    `Location: ${displayText(row.locationName)}`,
    `Zone: ${displayText(row.zone)}`,
    `D/R: ${displayText(row.deliveryReceipt)}`,
    `Avail Mdt/d: ${fmtCapacity(row.availableCapacityMdtPerDay)}`,
    `Flow: ${displayText(row.flowDirection)}`,
    `Job: ${displayText(row.jobNumber)}`,
    `Notice: ${row.sourceNoticeId}`,
    `Status: ${statusLabel(row)}`,
    `Effective: ${fmtDateTime(row.effectiveStartAtUtc)} - ${fmtDateTime(row.effectiveEndAtUtc)}`,
  ].join("\n");
}

function MarketMiniCurve({ points }: { points: Array<{ label: string; value: number | null }> }) {
  const numeric = points
    .map((point, index) => ({ ...point, index }))
    .filter((point): point is { label: string; value: number; index: number } =>
      point.value !== null && Number.isFinite(point.value),
    );

  if (numeric.length < 2) {
    return <div className="h-8 text-center text-[10px] leading-8 text-gray-600">No curve</div>;
  }

  const width = 160;
  const height = 32;
  const padX = 4;
  const padY = 5;
  const values = numeric.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const denom = Math.max(1, points.length - 1);
  const coordinates = numeric.map((point) => {
    const x = padX + (point.index / denom) * (width - padX * 2);
    const y = height - padY - ((point.value - min) / range) * (height - padY * 2);
    return { x, y };
  });
  const path = coordinates
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const delta = numeric.at(-1)!.value - numeric[0].value;
  const stroke = delta >= 0 ? "#34d399" : "#38bdf8";

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-8 w-full overflow-visible"
    >
      <line x1={padX} x2={width - padX} y1={height - padY} y2={height - padY} stroke="#1f2937" />
      <path d={path} fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      {coordinates.map((point, index) => (
        <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r={index === coordinates.length - 1 ? 2.4 : 1.6} fill={stroke} />
      ))}
    </svg>
  );
}

function buildTranscoHubContexts(payload: DailyGasPricesPayload | null): TranscoHubContext[] {
  if (!payload) return [];
  const monthColumns = payload.columns.filter((column) => column.kind === "month").slice(0, 8);
  return TRANSCO_CONTEXT_MARKETS.map((market) => {
    const row = payload.rows.find((candidate) => candidate.market === market);
    if (!row) return null;
    return {
      row,
      cash: row.values.cash ?? null,
      balmo: row.values.balmo ?? null,
      monthPoints: monthColumns.map((column) => ({
        label: column.label,
        value: row.values[column.key] ?? null,
      })),
    };
  }).filter((item): item is TranscoHubContext => item !== null);
}

function TranscoMarketContext({
  data,
  loading,
  error,
}: {
  data: DailyGasPricesPayload | null;
  loading: boolean;
  error: string | null;
}) {
  const hubs = useMemo(() => buildTranscoHubContexts(data), [data]);
  const tradeDate = fmtDate(data?.tradeDate);
  const title =
    "General Transco market context only. These cards do not attribute outage impact to any hub.";

  return (
    <section
      className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4"
      title={title}
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Transco Hubs</h2>
          <p className="mt-1 text-xs text-gray-500">
            General market context only. No outage-to-hub impact or attribution is inferred.
          </p>
        </div>
        <span className="w-fit rounded-md border border-gray-800 bg-gray-950/45 px-2 py-1 text-[11px] font-semibold text-gray-400">
          ICE trade date {tradeDate}
        </span>
      </div>

      {loading && (
        <div className="rounded-md border border-gray-800 bg-gray-950/35 px-3 py-6 text-sm text-gray-500">
          Loading Transco hub context...
        </div>
      )}
      {!loading && error && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {error}
        </div>
      )}
      {!loading && !error && hubs.length === 0 && (
        <div className="rounded-md border border-gray-800 bg-gray-950/35 px-3 py-6 text-sm text-gray-500">
          No configured Transco hubs were present in the gas daily prices payload.
        </div>
      )}
      {!loading && !error && hubs.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {hubs.map((hub) => {
            const regionLabel = GAS_REGION_LABELS[hub.row.region];
            const hubHref = `/?section=gas-outright&view=gas-outright&region=${encodeURIComponent(
              hub.row.region,
            )}&market=${encodeURIComponent(hub.row.market)}`;
            const curveTitle = hub.monthPoints
              .map((point) => `${point.label}: ${fmtPrice(point.value)}`)
              .join("\n");
            return (
              <div
                key={hub.row.market}
                className="min-w-0 rounded-md border border-gray-800 bg-[#0d1119] p-3"
                title={title}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-gray-100" title={hub.row.market}>
                      {hub.row.market}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      {regionLabel}
                    </div>
                  </div>
                  <span className="rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">
                    Context
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Cash</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-gray-100">
                      {fmtPrice(hub.cash)}
                    </div>
                  </div>
                  {hub.row.balmoSymbol || hub.balmo !== null ? (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">BalMo</div>
                      <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-gray-100">
                        {fmtPrice(hub.balmo)}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">BalMo</div>
                      <div className="mt-0.5 text-sm font-semibold text-gray-600">--</div>
                    </div>
                  )}
                </div>

                <div className="mt-3" title={curveTitle}>
                  <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    <span>Next 8 Mo</span>
                    <span>{hub.monthPoints.at(0)?.label ?? "--"}</span>
                  </div>
                  <MarketMiniCurve points={hub.monthPoints} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                  <Link className="text-sky-300 hover:text-sky-100" href="/?section=gas-prices">
                    Matrix
                  </Link>
                  <Link className="text-sky-300 hover:text-sky-100" href={hubHref}>
                    Curve
                  </Link>
                  <Link className="text-sky-300 hover:text-sky-100" href="/?section=power-settles-dashboard">
                    Power
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
              active
                ? "border-sky-500/55 bg-sky-500/15 text-sky-100"
                : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function MetadataChip({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "ok" | "warn" }) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
      : tone === "warn"
        ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
        : "border-gray-800 bg-gray-950/40 text-gray-300";
  return (
    <div className={`rounded-md border px-2.5 py-2 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">{label}</div>
      <div className="mt-0.5 text-xs font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function tableHeaderCell<T, K extends string>({
  column,
  sortState,
  filterOptions,
  selectedFilters,
  onSort,
  onFilterChange,
}: {
  column: ColumnDefinition<T, K>;
  sortState: SortState<K> | null;
  filterOptions: string[];
  selectedFilters: string[];
  onSort: (key: K, direction?: SortDirection) => void;
  onFilterChange: (key: K, values: string[]) => void;
}) {
  const sortDirection = sortState?.key === column.key ? sortState.direction : null;
  return (
    <th
      key={column.key}
      className={`${column.sticky ? "sticky left-0 z-20 bg-gray-950 shadow-[2px_0_0_rgba(31,41,55,0.9)]" : ""} whitespace-nowrap px-2 py-2 ${
        column.align === "right" ? "text-right" : "text-left"
      } font-semibold uppercase tracking-wide ${column.className ?? ""}`}
    >
      <div className={`flex w-max items-center gap-1.5 ${column.align === "right" ? "ml-auto" : ""}`}>
        <button
          type="button"
          onClick={() => onSort(column.key)}
          className={`flex items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-gray-900 ${
            sortDirection ? "text-sky-200" : "text-gray-400"
          }`}
          aria-label={`Sort ${column.label}`}
        >
          <span className="whitespace-nowrap text-[10px] leading-3">{column.label}</span>
          <span className="w-3 shrink-0 text-right text-[10px] text-sky-300">
            {sortDirection === "asc" ? "^" : sortDirection === "desc" ? "v" : ""}
          </span>
        </button>
        <ColumnFilterMenu
          label={column.label}
          options={filterOptions}
          selected={selectedFilters}
          sortDirection={sortDirection}
          onSort={(direction) => onSort(column.key, direction)}
          onChange={(values) => onFilterChange(column.key, values)}
        />
      </div>
    </th>
  );
}

function OutageTimeline({
  rows,
  loading,
  error,
  onSelect,
}: {
  rows: GasEbbOutageRow[];
  loading: boolean;
  error: string | null;
  onSelect: (row: GasEbbOutageRow) => void;
}) {
  const timeline = useMemo(() => {
    const rowTimes = rows.map((row) => ({
      row,
      startMs: parseTime(row.effectiveStartAtUtc),
      endMs: parseTime(row.effectiveEndAtUtc),
    }));
    const allStarts = rowTimes
      .map((item) => item.startMs ?? item.endMs)
      .filter((value): value is number => value !== null);
    if (!allStarts.length) return null;

    let startMs = Math.min(...allStarts);
    let endMs = Math.max(
      ...rowTimes
        .flatMap((item) => [item.startMs, item.endMs])
        .filter((value): value is number => value !== null),
    );
    if (rowTimes.some((item) => item.endMs === null)) {
      endMs = Math.max(endMs, Date.now());
    }
    const minSpan = 24 * 60 * 60 * 1000;
    if (endMs - startMs < minSpan) endMs = startMs + minSpan;
    const pad = Math.max(minSpan * 0.12, (endMs - startMs) * 0.035);
    startMs -= pad;
    endMs += pad;
    const span = endMs - startMs;
    const groups = new Map<string, { label: string; rows: typeof rowTimes }>();

    for (const item of rowTimes) {
      const zone = displayText(item.row.zone);
      const deliveryReceipt = displayText(item.row.deliveryReceipt);
      const key = `${zone}|${deliveryReceipt}`;
      const group = groups.get(key) ?? { label: `${zone} / ${deliveryReceipt}`, rows: [] };
      group.rows.push(item);
      groups.set(key, group);
    }

    const orderedGroups = Array.from(groups.values()).sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { numeric: true }),
    );
    for (const group of orderedGroups) {
      group.rows.sort((left, right) => {
        const locationCompare = displayText(left.row.locationName).localeCompare(
          displayText(right.row.locationName),
          undefined,
          { numeric: true },
        );
        if (locationCompare !== 0) return locationCompare;
        return (left.startMs ?? 0) - (right.startMs ?? 0);
      });
    }

    return { startMs, endMs, span, groups: orderedGroups };
  }, [rows]);

  const axisTicks = timeline
    ? [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
        pct,
        label: fmtDate(new Date(timeline.startMs + timeline.span * pct).toISOString()),
      }))
    : [];

  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Outage Timeline</h2>
          <p className="mt-1 text-xs text-gray-500">
            Current derived outage intervals, grouped by zone and D/R. Open ends pin to the right edge.
          </p>
        </div>
        <span className="w-fit rounded-md border border-gray-800 bg-gray-950/45 px-2 py-1 text-[11px] font-semibold text-gray-400">
          {rows.length.toLocaleString()} intervals
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-800 bg-[#0d1119]">
        {loading && <div className="px-3 py-8 text-sm text-gray-500">Loading outage timeline...</div>}
        {!loading && error && (
          <div className="px-3 py-4 text-sm text-amber-200">{error}</div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div className="px-3 py-8 text-sm text-gray-500">No current outage intervals match the filters.</div>
        )}
        {!loading && !error && timeline && (
          <div className="min-w-[920px] p-3">
            <div className="grid grid-cols-[220px_minmax(640px,1fr)] gap-3 border-b border-gray-800 pb-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Zone / D/R</div>
              <div className="relative h-5">
                {axisTicks.map((tick) => (
                  <div
                    key={tick.pct}
                    className="absolute top-0 text-[10px] font-semibold tabular-nums text-gray-500"
                    style={{ left: fmtPercent(tick.pct * 100), transform: "translateX(-50%)" }}
                  >
                    {tick.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2">
              {timeline.groups.map((group) => (
                <div key={group.label}>
                  <div className="grid grid-cols-[220px_minmax(640px,1fr)] gap-3 py-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      {group.label}
                    </div>
                    <div className="h-px self-center bg-gray-800" />
                  </div>
                  {group.rows.map(({ row, startMs, endMs }) => {
                    const effectiveStart = startMs ?? timeline.startMs;
                    const effectiveEnd = endMs ?? timeline.endMs;
                    const left = ((effectiveStart - timeline.startMs) / timeline.span) * 100;
                    const width = Math.max(
                      ((effectiveEnd - effectiveStart) / timeline.span) * 100,
                      0.75,
                    );
                    return (
                      <div
                        key={`${row.sourceNoticeId}:${row.sourceContentHash}:${row.outageSequence}`}
                        className="grid grid-cols-[220px_minmax(640px,1fr)] gap-3 py-1"
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(row)}
                          className="min-w-0 text-left text-[11px] text-gray-300 transition-colors hover:text-white"
                          title={outageTooltip(row)}
                        >
                          <div className="truncate font-semibold">{displayText(row.locationName)}</div>
                          <div className="truncate text-[10px] text-gray-600">
                            Job {displayText(row.jobNumber)} | Notice {row.sourceNoticeId}
                          </div>
                        </button>
                        <div className="relative h-8 rounded border border-gray-800 bg-gray-950/45">
                          <button
                            type="button"
                            onClick={() => onSelect(row)}
                            title={outageTooltip(row)}
                            className={`absolute top-1 bottom-1 min-w-[10px] overflow-hidden rounded border px-2 text-left text-[10px] font-semibold shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-500/25 ${
                              row.criticalInd
                                ? "border-sky-500/55 bg-sky-500/20 text-sky-100"
                                : "border-emerald-500/45 bg-emerald-500/15 text-emerald-100"
                            }`}
                            style={{ left: fmtPercent(left), width: fmtPercent(width) }}
                          >
                            <span className="block truncate">
                              {displayText(row.locationName)} | {fmtCapacity(row.availableCapacityMdtPerDay)} | {displayText(row.flowDirection)}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function NoticeDetailDrawer({
  selected,
  onClose,
}: {
  selected: SelectedNoticeState;
  onClose: () => void;
}) {
  const { notice, outage } = selected;
  const detailText = notice.noticeText ?? notice.detailCleanText ?? "";
  const metadataRows = [
    { label: "Notice", value: notice.sourceNoticeId },
    { label: "Status", value: statusLabel(notice) },
    { label: "Stream", value: notice.noticeStream },
    { label: "Type", value: displayText(notice.noticeType) },
    { label: "Posted", value: fmtDateTime(notice.postedAtUtc) },
    { label: "Effective", value: fmtDateTime(notice.effectiveAtUtc ?? outage?.effectiveStartAtUtc) },
    { label: "End", value: fmtDateTime(notice.endAtUtc ?? outage?.effectiveEndAtUtc) },
    { label: "Last Seen", value: fmtDateTime(notice.lastSeenAtUtc) },
    { label: "Detail Fetched", value: fmtDateTime(notice.detailFetchedAtUtc ?? notice.lastDetailFetchedAtUtc) },
    { label: "Prior Notice", value: displayText(notice.priorNoticeId) },
  ];
  const outageRows = outage
    ? [
        { label: "Zone", value: displayText(outage.zone) },
        { label: "D/R", value: displayText(outage.deliveryReceipt) },
        { label: "Location", value: displayText(outage.locationName) },
        { label: "Location ID", value: displayText(outage.locationId) },
        { label: "Avail Mdt/d", value: fmtCapacity(outage.availableCapacityMdtPerDay) },
        { label: "Flow", value: displayText(outage.flowDirection) },
        { label: "Job", value: displayText(outage.jobNumber) },
        { label: "Priority", value: displayText(outage.highestPriorityIncluded) },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Notice ${notice.sourceNoticeId} detail`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#11141d] shadow-2xl shadow-black/70">
        <div className="flex items-start justify-between gap-3 border-b border-gray-800 bg-[#151820] p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-100">Notice {notice.sourceNoticeId}</h2>
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusClass(notice)}`}>
                {statusLabel(notice)}
              </span>
            </div>
            <p className="mt-1 max-w-3xl truncate text-sm text-gray-400" title={notice.subject ?? undefined}>
              {displayText(notice.subject)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-700 bg-gray-950 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#0d1118] p-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {metadataRows.map((row) => (
              <div key={row.label} className="rounded-md border border-gray-800 bg-gray-950/35 p-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{row.label}</div>
                <div className="mt-1 truncate text-xs font-semibold tabular-nums text-gray-100" title={row.value}>
                  {row.value}
                </div>
              </div>
            ))}
          </div>

          {outage && (
            <div className="mt-4 rounded-lg border border-gray-800 bg-[#12141d] p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Selected Outage Row</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {outageRows.map((row) => (
                  <div key={row.label} className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{row.label}</div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-gray-100" title={row.value}>
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {notice.lastDetailErrorMessage && (
            <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {notice.lastDetailErrorMessage}
            </div>
          )}

          <div className="mt-4 rounded-lg border border-gray-800 bg-[#12141d] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Notice Text</h3>
              <div className="flex gap-3 text-[11px] font-semibold">
                {notice.detailUrl && (
                  <a className="text-sky-300 hover:text-sky-100" href={notice.detailUrl} target="_blank" rel="noreferrer">
                    Williams Detail
                  </a>
                )}
                {notice.downloadUrl && (
                  <a className="text-sky-300 hover:text-sky-100" href={notice.downloadUrl} target="_blank" rel="noreferrer">
                    Download
                  </a>
                )}
              </div>
            </div>
            {detailText ? (
              <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-md border border-gray-800 bg-gray-950/45 p-3 text-xs leading-5 text-gray-300">
                {detailText}
              </pre>
            ) : (
              <div className="rounded-md border border-gray-800 bg-gray-950/35 px-3 py-8 text-sm text-gray-500">
                Detail text has not been loaded for this notice.
              </div>
            )}
          </div>

          {notice.supportingData.length > 0 && (
            <div className="mt-4 space-y-3">
              {notice.supportingData.map((table, tableIndex) => (
                <div
                  key={`${table.title ?? "table"}:${tableIndex}`}
                  className="rounded-lg border border-gray-800 bg-[#12141d] p-3"
                >
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {table.title ?? `Supporting Table ${tableIndex + 1}`}
                  </h3>
                  <div className="mt-2 overflow-x-auto rounded-md border border-gray-800">
                    <table className="w-max min-w-full border-collapse text-xs text-gray-200">
                      <thead className="bg-gray-950 text-[10px] uppercase tracking-wider text-gray-500">
                        <tr>
                          {table.headers.map((header) => (
                            <th key={header} className="px-2 py-2 text-left font-semibold">
                              {header.replaceAll("_", " ")}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800 bg-[#0d1119]">
                        {table.rows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {table.headers.map((header) => (
                              <td key={header} className="px-2 py-1.5 text-gray-300">
                                {valueText(row[header])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const OUTAGE_COLUMNS: Array<ColumnDefinition<GasEbbOutageRow, OutageColumnKey>> = [
  {
    key: "zone",
    label: "Zone",
    sticky: true,
    className: "min-w-[84px]",
    value: (row) => displayText(row.zone),
  },
  { key: "deliveryReceipt", label: "D/R", className: "min-w-[66px]", value: (row) => displayText(row.deliveryReceipt) },
  { key: "locationName", label: "Location", className: "min-w-[220px]", value: (row) => displayText(row.locationName) },
  {
    key: "availableCapacityMdtPerDay",
    label: "Avail Mdt/d",
    align: "right",
    className: "min-w-[112px]",
    value: (row) => fmtCapacity(row.availableCapacityMdtPerDay),
    sortValue: (row) => capacitySortValue(row.availableCapacityMdtPerDay),
  },
  { key: "flowDirection", label: "Flow", className: "min-w-[92px]", value: (row) => displayText(row.flowDirection) },
  {
    key: "effectiveStartAtUtc",
    label: "Effective",
    className: "min-w-[130px]",
    value: (row) => fmtDateTime(row.effectiveStartAtUtc),
    sortValue: (row) => dateSortValue(row.effectiveStartAtUtc),
  },
  {
    key: "effectiveEndAtUtc",
    label: "End",
    className: "min-w-[130px]",
    value: (row) => fmtDateTime(row.effectiveEndAtUtc),
    sortValue: (row) => dateSortValue(row.effectiveEndAtUtc),
  },
  { key: "jobNumber", label: "Job", className: "min-w-[92px]", value: (row) => displayText(row.jobNumber) },
  { key: "sourceNoticeId", label: "Notice", className: "min-w-[92px]", value: (row) => row.sourceNoticeId },
  {
    key: "noticeStatusDesc",
    label: "Status",
    className: "min-w-[116px]",
    value: (row) => statusLabel(row),
    render: (row) => (
      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusClass(row)}`}>
        {statusLabel(row)}
      </span>
    ),
  },
  { key: "subject", label: "Subject", className: "min-w-[360px]", value: (row) => displayText(row.subject) },
  {
    key: "postedAtUtc",
    label: "Posted",
    className: "min-w-[130px]",
    value: (row) => fmtDateTime(row.postedAtUtc),
    sortValue: (row) => dateSortValue(row.postedAtUtc),
  },
];

const NOTICE_COLUMNS: Array<ColumnDefinition<GasEbbNoticeRow, NoticeColumnKey>> = [
  {
    key: "postedAtUtc",
    label: "Posted",
    sticky: true,
    className: "min-w-[130px]",
    value: (row) => fmtDateTime(row.postedAtUtc),
    sortValue: (row) => dateSortValue(row.postedAtUtc),
  },
  { key: "sourceNoticeId", label: "Notice", className: "min-w-[92px]", value: (row) => row.sourceNoticeId },
  {
    key: "criticalInd",
    label: "Critical",
    className: "min-w-[86px]",
    value: (row) => (row.criticalInd ? "Critical" : "Noncritical"),
  },
  { key: "noticeType", label: "Type", className: "min-w-[126px]", value: (row) => displayText(row.noticeType) },
  {
    key: "noticeStatusDesc",
    label: "Status",
    className: "min-w-[116px]",
    value: (row) => statusLabel(row),
    render: (row) => (
      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusClass(row)}`}>
        {statusLabel(row)}
      </span>
    ),
  },
  { key: "subject", label: "Subject", className: "min-w-[420px]", value: (row) => displayText(row.subject) },
  {
    key: "effectiveAtUtc",
    label: "Effective",
    className: "min-w-[130px]",
    value: (row) => fmtDateTime(row.effectiveAtUtc),
    sortValue: (row) => dateSortValue(row.effectiveAtUtc),
  },
  {
    key: "endAtUtc",
    label: "End",
    className: "min-w-[130px]",
    value: (row) => fmtDateTime(row.endAtUtc),
    sortValue: (row) => dateSortValue(row.endAtUtc),
  },
  {
    key: "lastSeenAtUtc",
    label: "Last Seen",
    className: "min-w-[130px]",
    value: (row) => fmtDateTime(row.lastSeenAtUtc),
    sortValue: (row) => dateSortValue(row.lastSeenAtUtc),
  },
];

export default function GasEbbTranscoDashboard() {
  const [activeTab, setActiveTab] = useState<GasEbbTab>("outages");
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [deliveryReceiptFilter, setDeliveryReceiptFilter] = useState("all");
  const [criticalFilter, setCriticalFilter] = useState<CriticalFilter>("all");
  const [refreshToken, setRefreshToken] = useState(0);
  const [data, setData] = useState<GasEbbPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketData, setMarketData] = useState<DailyGasPricesPayload | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [outageSort, setOutageSort] = useState<SortState<OutageColumnKey>>({
    key: "effectiveStartAtUtc",
    direction: "asc",
  });
  const [noticeSort, setNoticeSort] = useState<SortState<NoticeColumnKey>>({
    key: "postedAtUtc",
    direction: "desc",
  });
  const [outageColumnFilters, setOutageColumnFilters] = useState<ColumnFilters<OutageColumnKey>>({});
  const [noticeColumnFilters, setNoticeColumnFilters] = useState<ColumnFilters<NoticeColumnKey>>({});
  const [selectedNotice, setSelectedNotice] = useState<SelectedNoticeState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchJsonWithCache<GasEbbPayload>({
      key: `api:gas-ebbs:williams-transco:v1:${refreshToken}`,
      url: "/api/gas-ebbs/williams-transco",
      ttlMs: API_TTL_MS,
      signal: controller.signal,
      forceRefresh: refreshToken > 0,
    })
      .then((payload) => {
        if (!controller.signal.aborted) setData(payload);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load Williams Transco EBB data");
          setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshToken]);

  useEffect(() => {
    const controller = new AbortController();
    setMarketLoading(true);
    setMarketError(null);
    fetchJsonWithCache<DailyGasPricesPayload>({
      key: "api:gas-daily-prices:transco-context:v1:vwap",
      url: "/api/gas-daily-prices?cashBasis=vwap_close&balmoBasis=vwap_close",
      ttlMs: MARKET_CONTEXT_TTL_MS,
      signal: controller.signal,
    })
      .then((payload) => {
        if (!controller.signal.aborted) setMarketData(payload);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setMarketError(loadError instanceof Error ? loadError.message : "Failed to load Transco hub prices");
          setMarketData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setMarketLoading(false);
      });
    return () => controller.abort();
  }, []);

  const outageRows = data?.outages ?? EMPTY_OUTAGE_ROWS;
  const noticeRows = data?.notices ?? EMPTY_NOTICE_ROWS;
  const zoneOptions = useMemo(
    () =>
      [
        { value: "all", label: "All" },
        ...sortedFilterValues(outageRows.map((row) => displayText(row.zone)))
          .filter((value) => value !== "--")
          .map((value) => ({ value, label: value })),
      ],
    [outageRows],
  );
  const deliveryReceiptOptions = useMemo(
    () =>
      [
        { value: "all", label: "All" },
        ...sortedFilterValues(outageRows.map((row) => displayText(row.deliveryReceipt)))
          .filter((value) => value !== "--")
          .map((value) => ({ value, label: value })),
      ],
    [outageRows],
  );
  const criticalOptions = [
    { value: "all", label: "All" },
    { value: "critical", label: "Critical" },
    { value: "noncritical", label: "Noncritical" },
  ] satisfies Array<{ value: CriticalFilter; label: string }>;

  const topFilteredOutages = useMemo(
    () =>
      outageRows.filter((row) => {
        if (zoneFilter !== "all" && displayText(row.zone) !== zoneFilter) return false;
        if (deliveryReceiptFilter !== "all" && displayText(row.deliveryReceipt) !== deliveryReceiptFilter) return false;
        if (criticalFilter === "critical" && !row.criticalInd) return false;
        if (criticalFilter === "noncritical" && row.criticalInd) return false;
        return rowMatchesSearch(
          [
            row.zone,
            row.deliveryReceipt,
            row.locationName,
            row.flowDirection,
            row.jobNumber,
            row.sourceNoticeId,
            row.noticeStatusDesc,
            row.subject,
          ],
          search,
        );
      }),
    [criticalFilter, deliveryReceiptFilter, outageRows, search, zoneFilter],
  );
  const topFilteredNotices = useMemo(
    () =>
      noticeRows.filter((row) => {
        if (criticalFilter === "critical" && !row.criticalInd) return false;
        if (criticalFilter === "noncritical" && row.criticalInd) return false;
        return rowMatchesSearch(
          [row.sourceNoticeId, row.noticeType, row.noticeStatusDesc, row.subject, row.noticeText],
          search,
        );
      }),
    [criticalFilter, noticeRows, search],
  );

  const outageFilterOptions = useMemo(
    () =>
      Object.fromEntries(
        OUTAGE_COLUMNS.map((column) => [
          column.key,
          sortedFilterValues(topFilteredOutages.map((row) => column.value(row))),
        ]),
      ) as Record<OutageColumnKey, string[]>,
    [topFilteredOutages],
  );
  const noticeFilterOptions = useMemo(
    () =>
      Object.fromEntries(
        NOTICE_COLUMNS.map((column) => [
          column.key,
          sortedFilterValues(topFilteredNotices.map((row) => column.value(row))),
        ]),
      ) as Record<NoticeColumnKey, string[]>,
    [topFilteredNotices],
  );

  const displayedOutages = useMemo(() => {
    const filtered = topFilteredOutages.filter((row) =>
      rowMatchesColumnFilters(row, OUTAGE_COLUMNS, outageColumnFilters),
    );
    const column = OUTAGE_COLUMNS.find((item) => item.key === outageSort.key) ?? OUTAGE_COLUMNS[0];
    return [...filtered].sort((left, right) =>
      compareSortableValues(
        column.sortValue ? column.sortValue(left) : column.value(left),
        column.sortValue ? column.sortValue(right) : column.value(right),
        outageSort.direction,
      ),
    );
  }, [outageColumnFilters, outageSort, topFilteredOutages]);
  const displayedNotices = useMemo(() => {
    const filtered = topFilteredNotices.filter((row) =>
      rowMatchesColumnFilters(row, NOTICE_COLUMNS, noticeColumnFilters),
    );
    const column = NOTICE_COLUMNS.find((item) => item.key === noticeSort.key) ?? NOTICE_COLUMNS[0];
    return [...filtered].sort((left, right) =>
      compareSortableValues(
        column.sortValue ? column.sortValue(left) : column.value(left),
        column.sortValue ? column.sortValue(right) : column.value(right),
        noticeSort.direction,
      ),
    );
  }, [noticeColumnFilters, noticeSort, topFilteredNotices]);

  const hasTopFilters =
    search.trim() || zoneFilter !== "all" || deliveryReceiptFilter !== "all" || criticalFilter !== "all";
  const activeOutageColumnFilterCount = Object.values(outageColumnFilters).filter((values) => values?.length).length;
  const activeNoticeColumnFilterCount = Object.values(noticeColumnFilters).filter((values) => values?.length).length;
  const tableIsFiltered =
    activeTab === "outages"
      ? activeOutageColumnFilterCount > 0
      : activeNoticeColumnFilterCount > 0;

  const resetTopFilters = () => {
    setSearch("");
    setZoneFilter("all");
    setDeliveryReceiptFilter("all");
    setCriticalFilter("all");
  };
  const resetOutageTable = () => {
    setOutageColumnFilters({});
    setOutageSort({ key: "effectiveStartAtUtc", direction: "asc" });
  };
  const resetNoticeTable = () => {
    setNoticeColumnFilters({});
    setNoticeSort({ key: "postedAtUtc", direction: "desc" });
  };

  const updateOutageSort = useCallback((key: OutageColumnKey, direction?: SortDirection) => {
    setOutageSort((current) => ({
      key,
      direction: direction ?? (current.key === key && current.direction === "asc" ? "desc" : "asc"),
    }));
  }, []);
  const updateNoticeSort = useCallback((key: NoticeColumnKey, direction?: SortDirection) => {
    setNoticeSort((current) => ({
      key,
      direction: direction ?? (current.key === key && current.direction === "asc" ? "desc" : "asc"),
    }));
  }, []);

  const metadata = data?.metadata;
  const visibleRows = activeTab === "outages" ? displayedOutages.length : displayedNotices.length;
  const sourceRows = activeTab === "outages" ? outageRows.length : noticeRows.length;

  return (
    <div className="w-full space-y-4">
      <ControlCard title="Williams Transco EBB">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <DashboardTabs
              tabs={WORKSPACE_TABS}
              activeValue={activeTab}
              onChange={setActiveTab}
              ariaLabel="Williams Transco EBB views"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setRefreshToken((value) => value + 1)}
                className="h-8 rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Refresh
              </button>
              {(hasTopFilters || tableIsFiltered) && (
                <button
                  type="button"
                  onClick={() => {
                    resetTopFilters();
                    resetOutageTable();
                    resetNoticeTable();
                  }}
                  className="h-8 rounded-md border border-gray-700 bg-gray-950 px-3 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="min-w-[240px] flex-1">
              <label className="sr-only" htmlFor="gas-ebb-search">
                Search Williams Transco EBB
              </label>
              <input
                id="gas-ebb-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search notice, subject, location, job, status"
                className="h-8 w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-xs text-gray-200 outline-none placeholder:text-gray-600 focus:border-sky-500"
              />
            </div>
            <FilterPills label="Critical" options={criticalOptions} value={criticalFilter} onChange={setCriticalFilter} />
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <FilterPills label="Zone" options={zoneOptions} value={zoneFilter} onChange={setZoneFilter} />
            <FilterPills
              label="D/R"
              options={deliveryReceiptOptions}
              value={deliveryReceiptFilter}
              onChange={setDeliveryReceiptFilter}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <MetadataChip
              label="Current Notices"
              value={(metadata?.currentNoticeCount ?? noticeRows.length).toLocaleString()}
              tone="ok"
            />
            <MetadataChip
              label="Outage Rows"
              value={(metadata?.currentOutageCount ?? outageRows.length).toLocaleString()}
              tone={outageRows.length ? "ok" : "neutral"}
            />
            <MetadataChip
              label="Critical"
              value={(metadata?.currentCriticalNoticeCount ?? noticeRows.filter((row) => row.criticalInd).length).toLocaleString()}
              tone="warn"
            />
            <MetadataChip label="Displayed" value={`${visibleRows.toLocaleString()} / ${sourceRows.toLocaleString()}`} />
            <MetadataChip label="Latest Posted" value={fmtDateTime(metadata?.latestPostedAtUtc)} />
            <MetadataChip label="Last Seen" value={fmtDateTime(metadata?.latestLastSeenAtUtc)} />
            <MetadataChip label="Detail Fetch" value={fmtDateTime(metadata?.latestDetailFetchedAtUtc)} />
          </div>

          {error && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {error}
            </div>
          )}
        </div>
      </ControlCard>

      {activeTab === "outages" && (
        <>
          <TranscoMarketContext data={marketData} loading={marketLoading} error={marketError} />
          <OutageTimeline
            rows={displayedOutages}
            loading={loading}
            error={error}
            onSelect={(row) => setSelectedNotice({ notice: outageNoticeDetail(row), outage: row })}
          />
          <DataTableShell
            title="Outage Triage"
            subtitle="Current Williams Transco derived outage rows. Market context above is general and not attributed to outage rows."
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="rounded-md border border-gray-800 bg-gray-950/45 px-2 py-1 text-[11px] font-semibold text-gray-400">
                  {displayedOutages.length.toLocaleString()} / {outageRows.length.toLocaleString()} rows
                </span>
                <button
                  type="button"
                  onClick={resetOutageTable}
                  className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                >
                  Reset Table
                </button>
                <button
                  type="button"
                  onClick={() => downloadCsv("gas-ebb-transco-outages.csv", displayedOutages, OUTAGE_COLUMNS)}
                  disabled={!displayedOutages.length}
                  className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  CSV
                </button>
              </div>
            }
          >
            <table className="w-max min-w-full table-auto border-collapse bg-[#0d1119] text-xs text-gray-200">
              <thead className="bg-gray-950 text-gray-500">
                <tr className="border-b border-gray-800/80">
                  {OUTAGE_COLUMNS.map((column) =>
                    tableHeaderCell({
                      column,
                      sortState: outageSort,
                      filterOptions: outageFilterOptions[column.key] ?? EMPTY_FILTER_VALUES,
                      selectedFilters: outageColumnFilters[column.key] ?? EMPTY_FILTER_VALUES,
                      onSort: updateOutageSort,
                      onFilterChange: (key, values) =>
                        setOutageColumnFilters((filters) => updateColumnFilter(filters, key, values)),
                    }),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading && (
                  <tr>
                    <td colSpan={OUTAGE_COLUMNS.length} className="px-3 py-8 text-center text-sm text-gray-500">
                      Loading Williams Transco outage rows...
                    </td>
                  </tr>
                )}
                {!loading && !error && displayedOutages.length === 0 && (
                  <tr>
                    <td colSpan={OUTAGE_COLUMNS.length} className="px-3 py-8 text-center text-sm text-gray-500">
                      No current outage rows match the active filters.
                    </td>
                  </tr>
                )}
                {!loading &&
                  !error &&
                  displayedOutages.map((row) => (
                    <tr
                      key={`${row.sourceNoticeId}:${row.sourceContentHash}:${row.outageSequence}`}
                      onClick={() => setSelectedNotice({ notice: outageNoticeDetail(row), outage: row })}
                      className="cursor-pointer bg-[#0d1119] odd:bg-[#111722] hover:bg-gray-900/70"
                    >
                      {OUTAGE_COLUMNS.map((column) => (
                        <td
                          key={column.key}
                          className={`${column.sticky ? "sticky left-0 z-10 bg-inherit shadow-[2px_0_0_rgba(31,41,55,0.9)]" : ""} whitespace-nowrap px-2 py-2 ${
                            column.align === "right" ? "text-right tabular-nums" : "text-left"
                          } ${column.key === "subject" || column.key === "locationName" ? "max-w-[420px] truncate" : ""}`}
                          title={column.value(row)}
                        >
                          {column.render ? column.render(row) : column.value(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </DataTableShell>
        </>
      )}

      {activeTab === "notices" && (
        <DataTableShell
          title="Current Notice Inbox"
          subtitle="Current Williams Transco EBB notices. Click a row for the notice-detail drawer."
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="rounded-md border border-gray-800 bg-gray-950/45 px-2 py-1 text-[11px] font-semibold text-gray-400">
                {displayedNotices.length.toLocaleString()} / {noticeRows.length.toLocaleString()} rows
              </span>
              <button
                type="button"
                onClick={resetNoticeTable}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Reset Table
              </button>
              <button
                type="button"
                onClick={() => downloadCsv("gas-ebb-transco-notices.csv", displayedNotices, NOTICE_COLUMNS)}
                disabled={!displayedNotices.length}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                CSV
              </button>
            </div>
          }
        >
          <table className="w-max min-w-full table-auto border-collapse bg-[#0d1119] text-xs text-gray-200">
            <thead className="bg-gray-950 text-gray-500">
              <tr className="border-b border-gray-800/80">
                {NOTICE_COLUMNS.map((column) =>
                  tableHeaderCell({
                    column,
                    sortState: noticeSort,
                    filterOptions: noticeFilterOptions[column.key] ?? EMPTY_FILTER_VALUES,
                    selectedFilters: noticeColumnFilters[column.key] ?? EMPTY_FILTER_VALUES,
                    onSort: updateNoticeSort,
                    onFilterChange: (key, values) =>
                      setNoticeColumnFilters((filters) => updateColumnFilter(filters, key, values)),
                  }),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading && (
                <tr>
                  <td colSpan={NOTICE_COLUMNS.length} className="px-3 py-8 text-center text-sm text-gray-500">
                    Loading Williams Transco notices...
                  </td>
                </tr>
              )}
              {!loading && !error && displayedNotices.length === 0 && (
                <tr>
                  <td colSpan={NOTICE_COLUMNS.length} className="px-3 py-8 text-center text-sm text-gray-500">
                    No current notices match the active filters.
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                displayedNotices.map((row) => (
                  <tr
                    key={row.sourceNoticeId}
                    onClick={() => setSelectedNotice({ notice: row })}
                    className="cursor-pointer bg-[#0d1119] odd:bg-[#111722] hover:bg-gray-900/70"
                  >
                    {NOTICE_COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={`${column.sticky ? "sticky left-0 z-10 bg-inherit shadow-[2px_0_0_rgba(31,41,55,0.9)]" : ""} whitespace-nowrap px-2 py-2 ${
                          column.align === "right" ? "text-right tabular-nums" : "text-left"
                        } ${column.key === "subject" ? "max-w-[460px] truncate" : ""}`}
                        title={column.value(row)}
                      >
                        {column.render ? column.render(row) : column.value(row)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </DataTableShell>
      )}

      {selectedNotice && (
        <NoticeDetailDrawer selected={selectedNotice} onClose={() => setSelectedNotice(null)} />
      )}
    </div>
  );
}
