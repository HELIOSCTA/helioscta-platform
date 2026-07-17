"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import DashboardTabs, { type DashboardTabOption } from "@/components/dashboard/DashboardTabs";
import DataTableShell from "@/components/dashboard/DataTableShell";
import LmpColumnFilterMenu, {
  EMPTY_COLUMN_FILTER,
  type ColumnFilters,
  matchesColumnFilter,
  uniqueColumnOptions,
  updateColumnFilter,
} from "@/components/pjm/LmpColumnFilterMenu";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type PowerIso = "pjm";
type DatasetStatus = "live" | "pending" | "reference";
type LmpAdderDataset =
  | "pjm-da-reserve-mcp"
  | "pjm-rt-reserve-mcp";
type LmpAdderView = "daily-settles";

interface DatasetContract {
  grain: string;
  timeBasis: string;
  valueField: string;
  aggregation: string;
  peakBlock: string;
  refresh: string;
  dimensions: string[];
  fields: string[];
  notes: string[];
}

interface DimensionColumn {
  key: string;
  label: string;
  sourceField: string | null;
}

interface MetricColumn {
  key: string;
  label: string;
  sourceField: string | null;
}

export interface PowerLmpAddersFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface DatasetOption {
  dataset: LmpAdderDataset;
  iso: PowerIso;
  isoLabel: string;
  market: "da" | "rt" | "reference";
  label: string;
  valueLabel: string;
  sourceLabel: string;
  sourceUrl: string;
  sourceTable: string | null;
  status: DatasetStatus;
  description: string;
  contract: DatasetContract;
  dimensionColumns: DimensionColumn[];
  metricColumns: MetricColumn[];
  defaultColumnFilters?: Record<string, string[]>;
}

interface DailySettleRow {
  date: string;
  dimensions: Record<string, string>;
  hourly: Array<number | null>;
  onPeakAvg: number | null;
  offPeakAvg: number | null;
  asOf: string | null;
  sourceRowCount: number;
}

interface AddersPayload {
  iso: PowerIso;
  isoLabel: string;
  dataset: LmpAdderDataset;
  datasetLabel: string;
  valueLabel: string;
  status: DatasetStatus;
  description: string;
  contract: DatasetContract;
  dimensionColumns: DimensionColumn[];
  metricColumns: MetricColumn[];
  defaultColumnFilters: Record<string, string[]>;
  sourceLabel: string;
  sourceUrl: string;
  sourceTable: string | null;
  startDate: string;
  endDate: string;
  latestDate: string | null;
  latestAsOf: string | null;
  summary: {
    rowCount: number;
    latestDate: string | null;
    latestAsOf: string | null;
  };
  rows: DailySettleRow[];
  datasetOptions: DatasetOption[];
}

const HOURS = Array.from({ length: 24 }, (_, index) => index + 1);
const API_CACHE_TTL_MS = 5 * 60 * 1000;
type AdderFilterKey = "date" | "onPeakAvg" | "offPeakAvg" | `dimension:${string}` | `he${number}`;

const PEAK_WINDOW_BY_ISO: Record<PowerIso, { start: number; end: number }> = {
  pjm: { start: 8, end: 23 },
};

const ISO_TABS: Array<DashboardTabOption<PowerIso>> = [
  { value: "pjm", label: "PJM" },
];

const DATASET_TABS_BY_ISO: Record<PowerIso, Array<DashboardTabOption<LmpAdderDataset>>> = {
  pjm: [
    { value: "pjm-da-reserve-mcp", label: "DA Reserves" },
    { value: "pjm-rt-reserve-mcp", label: "RT Reserves" },
  ],
};

const DEFAULT_DATASET_BY_ISO: Record<PowerIso, LmpAdderDataset> = {
  pjm: "pjm-da-reserve-mcp",
};

const VIEW_TABS: Array<DashboardTabOption<LmpAdderView>> = [
  { value: "daily-settles", label: "Daily Settles" },
];

function fmtPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `$${value.toFixed(2)}`;
}

function fmtStamp(value: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function heatStyle(value: number | null, min: number, max: number): React.CSSProperties {
  if (value === null || min === max) return {};
  const midpoint = (min + max) / 2;
  const spread = Math.max(Math.abs(max - midpoint), Math.abs(midpoint - min));
  if (spread === 0) return {};

  const neutralBand = 0.14;
  const distance = Math.min(Math.abs(value - midpoint) / spread, 1);
  if (distance < neutralBand) return {};

  const intensity = (distance - neutralBand) / (1 - neutralBand);
  const alpha = 0.04 + intensity * 0.16;
  const [r, g, b] = value >= midpoint ? [22, 163, 74] : [220, 38, 38];
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`,
    boxShadow: `inset 2px 0 0 rgba(${r}, ${g}, ${b}, ${(alpha + 0.14).toFixed(2)})`,
    color: "#e5e7eb",
  };
}

function isOnPeakHour(iso: PowerIso, hourEnding: number): boolean {
  const window = PEAK_WINDOW_BY_ISO[iso];
  return hourEnding >= window.start && hourEnding <= window.end;
}

function adderDimensionFilterKey(key: string): AdderFilterKey {
  return `dimension:${key}`;
}

function adderHourFilterKey(hour: number): AdderFilterKey {
  return `he${hour}`;
}

function adderFilterValue(row: DailySettleRow, key: AdderFilterKey): string {
  if (key === "date") return row.date;
  if (key === "onPeakAvg") return fmtPrice(row.onPeakAvg);
  if (key === "offPeakAvg") return fmtPrice(row.offPeakAvg);
  if (key.startsWith("dimension:")) {
    return row.dimensions[key.slice("dimension:".length)] ?? "-";
  }
  const hour = Number(key.slice(2));
  return fmtPrice(Number.isFinite(hour) ? row.hourly[hour - 1] ?? null : null);
}

function todayDate(): string {
  const date = new Date();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function offsetDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function statusClass(status: DatasetStatus, loading: boolean, hasRows: boolean): string {
  if (loading) return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  if (status === "pending") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (status === "reference") return "border-cyan-500/30 bg-cyan-500/10 text-cyan-200";
  return hasRows
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
    : "border-amber-500/30 bg-amber-500/10 text-amber-200";
}

function statusLabel(status: DatasetStatus, loading: boolean, hasRows: boolean): string {
  if (loading) return "Refreshing";
  if (status === "pending") return "Pending Scrape";
  if (status === "reference") return "Reference";
  return hasRows ? "Live" : "No Rows";
}

function buildApiUrl({
  iso,
  dataset,
  startDate,
  endDate,
  refresh = false,
}: {
  iso: PowerIso;
  dataset: LmpAdderDataset;
  startDate: string;
  endDate: string;
  refresh?: boolean;
}): string {
  const params = new URLSearchParams({
    iso,
    dataset,
    start: startDate,
    end: endDate,
  });
  if (refresh) params.set("refresh", "1");
  return `/api/power-lmp-adders?${params.toString()}`;
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function TableHeatmapToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={onToggle}
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
        enabled
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${enabled ? "bg-emerald-300" : "bg-gray-600"}`}
        aria-hidden="true"
      />
      Heatmap
    </button>
  );
}

function SelectedAdderSource({
  option,
  onOpenAll,
  onOpenDetails,
}: {
  option: DatasetOption | undefined;
  onOpenAll: () => void;
  onOpenDetails: () => void;
}) {
  if (!option) return null;

  return (
    <div className="flex w-full justify-start">
      <div className="inline-flex max-w-full flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#12141d] shadow-xl shadow-black/20 sm:flex-row sm:items-stretch">
        <button
          type="button"
          onClick={onOpenAll}
          className="shrink-0 bg-gray-950/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:bg-gray-900 hover:text-gray-100"
        >
          All Sources
        </button>
        <div className="h-px bg-gray-800 sm:hidden" aria-hidden="true" />
        <div className="hidden w-px bg-gray-800 sm:block" aria-hidden="true" />
        <div className="min-w-0 px-3 py-2 text-left">
          <div className="flex min-w-0 flex-col items-start gap-1 text-xs sm:flex-row sm:items-center sm:gap-2">
            <span className="shrink-0 font-bold uppercase tracking-wider text-gray-500">Selected Source</span>
            <a
              href={option.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 max-w-[280px] items-center rounded-md border border-sky-500/50 bg-sky-500/10 px-2 py-1 font-semibold text-sky-200 underline decoration-sky-300/80 underline-offset-4 shadow-sm shadow-sky-950/40 transition-colors hover:border-sky-300 hover:bg-sky-500/20 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-400/60"
              title={option.sourceLabel}
            >
              <span className="truncate">{option.sourceLabel}</span>
            </a>
            <button
              type="button"
              onClick={onOpenDetails}
              className="rounded-md border border-gray-700 bg-gray-950/50 px-2 py-1 font-semibold text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
            >
              Description
            </button>
          </div>
          <p className="mt-1 max-w-full truncate text-[11px] text-gray-500">
            {option.sourceTable ?? "pending promoted table"}
          </p>
        </div>
      </div>
    </div>
  );
}

function AdderSourceLinksModal({
  open,
  options,
  selectedDataset,
  onClose,
}: {
  open: boolean;
  options: DatasetOption[];
  selectedDataset: LmpAdderDataset;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="adder-source-links-title"
        className="max-h-[82vh] w-full max-w-3xl overflow-hidden rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl shadow-black"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-4 py-3">
          <div>
            <h2 id="adder-source-links-title" className="text-sm font-semibold text-gray-100">
              LMP Adders Sources
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Daily settles use the selected promoted source when live.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close source links"
            className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-100"
          >
            Close
          </button>
        </div>
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead className="sticky top-0 bg-gray-950 text-[10px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-bold">Market</th>
                <th className="px-4 py-2 text-left font-bold">Dataset</th>
                <th className="px-4 py-2 text-left font-bold">Grain</th>
                <th className="px-4 py-2 text-left font-bold">Source</th>
                <th className="px-4 py-2 text-left font-bold">Table</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-gray-300">
              {options.map((option) => (
                <tr
                  key={option.dataset}
                  className={option.dataset === selectedDataset ? "bg-sky-500/5" : ""}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-xs uppercase text-gray-400">
                    {option.market}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-gray-100">
                    {option.label}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{option.contract.grain}</td>
                  <td className="px-4 py-3 text-xs">
                    <a
                      href={option.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-300 underline decoration-sky-500/40 underline-offset-4 hover:text-sky-100"
                    >
                      {option.sourceLabel}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {option.sourceTable ?? "pending"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SourceDescriptionModal({
  open,
  data,
  onClose,
}: {
  open: boolean;
  data: AddersPayload | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open || !data) return null;

  const contract = data.contract;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="adder-source-description-title"
        className="max-h-[82vh] w-full max-w-2xl overflow-hidden rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl shadow-black"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-4 py-3">
          <div>
            <h2 id="adder-source-description-title" className="text-sm font-semibold text-gray-100">
              {data.datasetLabel}
            </h2>
            <p className="mt-1 text-xs text-gray-500">{data.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close source description"
            className="rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-100"
          >
            Close
          </button>
        </div>
        <div className="max-h-[66vh] space-y-4 overflow-auto p-4 text-xs">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="font-bold uppercase tracking-wider text-gray-500">Row Grain</div>
              <div className="mt-1 text-gray-200">{contract.grain}</div>
            </div>
            <div>
              <div className="font-bold uppercase tracking-wider text-gray-500">Value Field</div>
              <div className="mt-1 text-gray-200">{contract.valueField}</div>
            </div>
            <div>
              <div className="font-bold uppercase tracking-wider text-gray-500">Time Basis</div>
              <div className="mt-1 text-gray-200">{contract.timeBasis}</div>
            </div>
            <div>
              <div className="font-bold uppercase tracking-wider text-gray-500">Peak Block</div>
              <div className="mt-1 text-gray-200">{contract.peakBlock}</div>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-3">
            <div className="font-bold uppercase tracking-wider text-gray-500">Table Standardization</div>
            <div className="mt-1 text-gray-200">{contract.aggregation}</div>
          </div>
          <div className="border-t border-gray-800 pt-3">
            <div className="font-bold uppercase tracking-wider text-gray-500">Source Fields</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {contract.fields.map((field) => (
                <span
                  key={field}
                  className="rounded border border-gray-700 bg-gray-950/40 px-2 py-1 font-mono text-[11px] text-gray-300"
                >
                  {field}
                </span>
              ))}
            </div>
          </div>
          {data.metricColumns.length > 0 && (
            <div className="border-t border-gray-800 pt-3">
              <div className="font-bold uppercase tracking-wider text-gray-500">Selectable Metrics</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.metricColumns.map((metric) => (
                  <span
                    key={metric.key}
                    className="rounded border border-gray-700 bg-gray-950/40 px-2 py-1 text-[11px] text-gray-300"
                    title={metric.sourceField ?? metric.key}
                  >
                    {metric.label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {contract.notes.length > 0 && (
            <div className="border-t border-gray-800 pt-3">
              <div className="font-bold uppercase tracking-wider text-gray-500">Notes</div>
              <ul className="mt-2 space-y-1 text-gray-300">
                {contract.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilteredAdderHeader({
  label,
  options,
  selected,
  onChange,
  align = "left",
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`flex min-w-[72px] items-center gap-1.5 ${
        align === "right" ? "justify-end" : "justify-between"
      }`}
    >
      <span className="truncate">{label}</span>
      <LmpColumnFilterMenu
        label={label}
        options={options}
        selected={selected}
        onChange={onChange}
      />
    </div>
  );
}

export default function PowerLmpAdders({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: PowerLmpAddersFreshnessSummary) => void;
}) {
  const [activeIso, setActiveIso] = useState<PowerIso>("pjm");
  const [dataset, setDataset] = useState<LmpAdderDataset>("pjm-da-reserve-mcp");
  const [activeView, setActiveView] = useState<LmpAdderView>("daily-settles");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [data, setData] = useState<AddersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latestRefreshToken, setLatestRefreshToken] = useState(0);
  const [sourceLinksOpen, setSourceLinksOpen] = useState(false);
  const [sourceDetailsOpen, setSourceDetailsOpen] = useState(false);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters<AdderFilterKey>>({});
  const [tableHeatmapEnabled, setTableHeatmapEnabled] = useState(true);
  const rangeSeededRef = useRef(false);
  const effectiveRefreshToken = refreshToken + latestRefreshToken;

  useEffect(() => {
    setDataset(DEFAULT_DATASET_BY_ISO[activeIso]);
    setStartDate("");
    setEndDate("");
    setColumnFilters({});
    rangeSeededRef.current = false;
  }, [activeIso]);

  const fetchStartDate = startDate || todayDate();
  const fetchEndDate = endDate || fetchStartDate;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    fetchJsonWithCache<AddersPayload>({
      key: `power-lmp-adders:${activeIso}:${dataset}:${fetchStartDate}:${fetchEndDate}`,
      url: buildApiUrl({
        iso: activeIso,
        dataset,
        startDate: fetchStartDate,
        endDate: fetchEndDate,
        refresh: effectiveRefreshToken > 0,
      }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: effectiveRefreshToken > 0 ? "no-store" : "default",
      forceRefresh: effectiveRefreshToken > 0,
      })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setColumnFilters((filters) => {
          const hasFilters = Object.values(filters).some((values) => values && values.length > 0);
          if (hasFilters) return filters;
          return Object.fromEntries(
            Object.entries(payload.defaultColumnFilters ?? {}).map(([key, values]) => [
              adderDimensionFilterKey(key),
              values,
            ]),
          ) as ColumnFilters<AdderFilterKey>;
        });
        if (!rangeSeededRef.current && payload.latestDate) {
          rangeSeededRef.current = true;
          setStartDate(offsetDate(payload.latestDate, -6));
          setEndDate(payload.latestDate);
        } else if (!startDate && !endDate) {
          setStartDate(payload.startDate);
          setEndDate(payload.endDate);
        }
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setError(err.message || "Failed to load LMP adders.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    activeIso,
    dataset,
    effectiveRefreshToken,
    endDate,
    fetchEndDate,
    fetchStartDate,
    startDate,
  ]);

  const hasRows = Boolean(data?.rows.some((row) => row.sourceRowCount > 0));
  const freshness = useMemo<PowerLmpAddersFreshnessSummary | null>(() => {
    if (!data) return null;
    return {
      status: statusLabel(data.status, loading, hasRows),
      statusClass: statusClass(data.status, loading, hasRows),
      summary: `${data.isoLabel} | ${data.datasetLabel}`,
      targetDateLabel: `${data.startDate} to ${data.endDate}`,
      latestDateLabel: data.latestDate ?? "--",
      latestUpdateLabel: fmtStamp(data.latestAsOf),
    };
  }, [data, hasRows, loading]);

  useEffect(() => {
    if (freshness) onFreshnessChange?.(freshness);
  }, [freshness, onFreshnessChange]);

  const datasetTabs = DATASET_TABS_BY_ISO[activeIso];
  const activeDataset = data?.datasetOptions.find((option) => option.dataset === dataset);
  const tablePeakWindow = data ? PEAK_WINDOW_BY_ISO[data.iso] : PEAK_WINDOW_BY_ISO[activeIso];
  const tableColumnCount = data ? 1 + data.dimensionColumns.length + 2 + HOURS.length : 27;
  const hasColumnFilters = Object.values(columnFilters).some((values) => values && values.length > 0);
  const updateAdderColumnFilter = (key: AdderFilterKey, values: string[]) => {
    setColumnFilters((filters) => updateColumnFilter(filters, key, values));
  };
  const columnFilterOptions = useMemo(() => {
    if (!data) return {} as Record<AdderFilterKey, string[]>;
    const options: Record<string, string[]> = {
      date: uniqueColumnOptions(data.rows.map((row) => row.date)),
      onPeakAvg: uniqueColumnOptions(data.rows.map((row) => fmtPrice(row.onPeakAvg))),
      offPeakAvg: uniqueColumnOptions(data.rows.map((row) => fmtPrice(row.offPeakAvg))),
    };
    data.dimensionColumns.forEach((column) => {
      options[adderDimensionFilterKey(column.key)] = uniqueColumnOptions(
        data.rows.map((row) => row.dimensions[column.key] ?? "-"),
      );
    });
    HOURS.forEach((hour) => {
      options[adderHourFilterKey(hour)] = uniqueColumnOptions(
        data.rows.map((row) => fmtPrice(row.hourly[hour - 1] ?? null)),
      );
    });
    return options as Record<AdderFilterKey, string[]>;
  }, [data]);
  const filteredRows = useMemo(() => {
    if (!data) return [];
    const activeFilters = Object.entries(columnFilters).filter(
      (entry): entry is [AdderFilterKey, string[]] =>
        Array.isArray(entry[1]) && entry[1].length > 0
    );
    if (activeFilters.length === 0) return data.rows;
    return data.rows.filter((row) =>
      activeFilters.every(([key, selected]) =>
        matchesColumnFilter(adderFilterValue(row, key), selected)
      )
    );
  }, [columnFilters, data]);
  const heatRange = useMemo(() => {
    const values = filteredRows
      .flatMap((row) => [row.onPeakAvg, row.offPeakAvg, ...row.hourly])
      .filter((value): value is number => value !== null && Number.isFinite(value));
    return {
      min: values.length > 0 ? Math.min(...values) : 0,
      max: values.length > 0 ? Math.max(...values) : 0,
    };
  }, [filteredRows]);

  return (
    <div className="space-y-4">
      <AdderSourceLinksModal
        open={sourceLinksOpen}
        options={data?.datasetOptions ?? []}
        selectedDataset={dataset}
        onClose={() => setSourceLinksOpen(false)}
      />
      <SourceDescriptionModal
        open={sourceDetailsOpen}
        data={data}
        onClose={() => setSourceDetailsOpen(false)}
      />
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-800 bg-[#12141d] p-2 shadow-xl shadow-black/20">
        <div className="border-b border-gray-800 pb-2">
          <DashboardTabs
            tabs={ISO_TABS}
            activeValue={activeIso}
            onChange={setActiveIso}
            ariaLabel="LMP adder ISO"
          />
        </div>
        <DashboardTabs
          tabs={datasetTabs}
          activeValue={dataset}
          onChange={(value) => {
            setDataset(value);
            setStartDate("");
            setEndDate("");
            setColumnFilters({});
            rangeSeededRef.current = false;
          }}
          ariaLabel="LMP adder datasets"
          variant="secondary"
          className="border-b border-gray-800 py-2"
        />
        <DashboardTabs
          tabs={VIEW_TABS}
          activeValue={activeView}
          onChange={setActiveView}
          ariaLabel="LMP adder views"
          variant="secondary"
          className="pt-2"
        />
      </div>

      <SelectedAdderSource
        option={activeDataset}
        onOpenAll={() => setSourceLinksOpen(true)}
        onOpenDetails={() => setSourceDetailsOpen(true)}
      />

      <SectionCard
        title="Date Range"
        subtitle={
          activeDataset
            ? `${activeDataset.valueLabel} | ${activeDataset.sourceTable ?? "pending promoted table"}`
            : "Daily settle range"
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
          />
          <span className="text-xs text-gray-500">to</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setLatestRefreshToken((value) => value + 1)}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
          >
            Refresh
          </button>
        </div>
      </SectionCard>

      {data && activeView === "daily-settles" && (
        <DataTableShell
          title="Daily Settles"
          subtitle={`${filteredRows.length.toLocaleString()} of ${data.rows.length.toLocaleString()} rows | ${data.datasetLabel}: ${data.description}`}
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setColumnFilters({})}
                disabled={!hasColumnFilters}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  hasColumnFilters
                    ? "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white"
                    : "cursor-not-allowed border-gray-800 bg-gray-950/40 text-gray-600"
                }`}
              >
                Clear Filters
              </button>
              <TableHeatmapToggle
                enabled={tableHeatmapEnabled}
                onToggle={() => setTableHeatmapEnabled((enabled) => !enabled)}
              />
            </div>
          }
          bodyClassName="bg-[#0d1119]"
        >
          <table className="w-full min-w-[1180px] border-collapse text-xs text-gray-200">
            <thead className="bg-gray-950 text-gray-500">
              <tr>
                <th className="sticky left-0 z-20 bg-gray-950 px-3 py-2 text-left font-semibold uppercase tracking-wide">
                  <FilteredAdderHeader
                    label="Date"
                    options={columnFilterOptions.date ?? EMPTY_COLUMN_FILTER}
                    selected={columnFilters.date ?? EMPTY_COLUMN_FILTER}
                    onChange={(values) => updateAdderColumnFilter("date", values)}
                  />
                </th>
                {data.dimensionColumns.map((column) => (
                  <th
                    key={column.key}
                    className="px-3 py-2 text-left font-semibold uppercase tracking-wide"
                  >
                    <FilteredAdderHeader
                      label={column.label}
                      options={
                        columnFilterOptions[adderDimensionFilterKey(column.key)] ??
                        EMPTY_COLUMN_FILTER
                      }
                      selected={
                        columnFilters[adderDimensionFilterKey(column.key)] ??
                        EMPTY_COLUMN_FILTER
                      }
                      onChange={(values) =>
                        updateAdderColumnFilter(adderDimensionFilterKey(column.key), values)
                      }
                    />
                  </th>
                ))}
                <th className="border-l border-gray-700 px-3 py-2 text-right font-semibold uppercase tracking-wide">
                  <FilteredAdderHeader
                    label="OnPeak"
                    options={columnFilterOptions.onPeakAvg ?? EMPTY_COLUMN_FILTER}
                    selected={columnFilters.onPeakAvg ?? EMPTY_COLUMN_FILTER}
                    onChange={(values) => updateAdderColumnFilter("onPeakAvg", values)}
                    align="right"
                  />
                </th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">
                  <FilteredAdderHeader
                    label="OffPeak"
                    options={columnFilterOptions.offPeakAvg ?? EMPTY_COLUMN_FILTER}
                    selected={columnFilters.offPeakAvg ?? EMPTY_COLUMN_FILTER}
                    onChange={(values) => updateAdderColumnFilter("offPeakAvg", values)}
                    align="right"
                  />
                </th>
                {HOURS.map((hour) => (
                  <th
                    key={hour}
                    className={`px-2 py-2 text-right font-semibold uppercase tracking-wide ${
                      hour === 1 ? "border-l border-gray-700" : ""
                    } ${isOnPeakHour(data.iso, hour) ? "bg-sky-500/10 text-sky-200" : ""}`}
                  >
                    <FilteredAdderHeader
                      label={`HE${hour}`}
                      options={columnFilterOptions[adderHourFilterKey(hour)] ?? EMPTY_COLUMN_FILTER}
                      selected={columnFilters[adderHourFilterKey(hour)] ?? EMPTY_COLUMN_FILTER}
                      onChange={(values) => updateAdderColumnFilter(adderHourFilterKey(hour), values)}
                      align="right"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={tableColumnCount} className="px-3 py-8 text-center text-sm text-gray-500">
                    {data.rows.length === 0
                      ? "No promoted rows for this source and range."
                      : "No rows match the selected column filters."}
                  </td>
                </tr>
              )}
              {filteredRows.map((row) => (
                <tr
                  key={`${row.date}|${data.dimensionColumns
                    .map((column) => row.dimensions[column.key] ?? "")
                    .join("|")}`}
                  className="hover:bg-gray-900/60"
                >
                  <td className="sticky left-0 z-10 bg-[#0d1119] px-3 py-2 font-medium text-gray-100">
                    {row.date}
                  </td>
                  {data.dimensionColumns.map((column) => (
                    <td key={column.key} className="px-3 py-2 text-gray-300">
                      {row.dimensions[column.key] ?? "-"}
                    </td>
                  ))}
                  <td
                    className="border-l border-gray-700 bg-gray-950/70 px-3 py-2 text-right font-semibold tabular-nums text-gray-100"
                    style={
                      tableHeatmapEnabled
                        ? heatStyle(row.onPeakAvg, heatRange.min, heatRange.max)
                        : undefined
                    }
                  >
                    {fmtPrice(row.onPeakAvg)}
                  </td>
                  <td
                    className="bg-gray-950/70 px-3 py-2 text-right font-semibold tabular-nums text-gray-100"
                    style={
                      tableHeatmapEnabled
                        ? heatStyle(row.offPeakAvg, heatRange.min, heatRange.max)
                        : undefined
                    }
                  >
                    {fmtPrice(row.offPeakAvg)}
                  </td>
                  {HOURS.map((hour) => (
                    <td
                      key={hour}
                      className={`px-2 py-2 text-right tabular-nums text-gray-300 ${
                        hour === 1 ? "border-l border-gray-700" : ""
                      } ${
                        hour === tablePeakWindow.start ? "border-l border-dotted border-sky-700/70" : ""
                      } ${
                        hour === tablePeakWindow.end ? "border-r border-dotted border-sky-700/70" : ""
                      }`}
                      style={
                        tableHeatmapEnabled
                          ? heatStyle(row.hourly[hour - 1] ?? null, heatRange.min, heatRange.max)
                          : undefined
                      }
                    >
                      {fmtPrice(row.hourly[hour - 1] ?? null)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      )}

      {loading && !data && <p className="text-sm text-gray-500">Loading LMP adders...</p>}
    </div>
  );
}
