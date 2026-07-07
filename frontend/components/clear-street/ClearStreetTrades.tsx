"use client";

import { useEffect, useMemo, useState } from "react";

import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

export interface ClearStreetTradesFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface ClearStreetTradesPayload {
  source: "clear_street.eod_transactions";
  ruleEngine: string;
  rulesSource: string;
  latestSftpDate: string | null;
  latestUploadAt: string | null;
  requestedLimit: number;
  search: string | null;
  rowCount: number;
  returnedRowCount: number;
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
  derivedFields: string[];
}

const API_TTL_MS = 2 * 60 * 1000;
const DEFAULT_LIMIT = 500;
const LIMIT_OPTIONS = [100, 250, 500, 1000, 2000];
const FIELD_LABEL_CLASS = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500";
const FIELD_CONTROL_CLASS =
  "h-9 w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-sm font-semibold text-gray-100 outline-none focus:border-sky-500";

const DEFAULT_FRESHNESS: ClearStreetTradesFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Trades --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

function buildApiUrl(limit: number, search: string, refresh: boolean): string {
  const params = new URLSearchParams({ limit: String(limit) });
  const normalizedSearch = search.trim();
  if (normalizedSearch) params.set("search", normalizedSearch);
  if (refresh) params.set("refresh", "1");
  return `/api/dev/clear-street-trades?${params.toString()}`;
}

function buildCacheKey(limit: number, search: string): string {
  return ["api:dev:clear-street-trades", limit, search.trim() || "all"].join(":");
}

function fmtDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "--";
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "--";
  return value.replace("T", " ").replace("Z", "").slice(0, 19);
}

function fmtCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "-";
    return Math.abs(value) >= 1000
      ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return fmtDateTime(value);
  return value;
}

function columnLabel(column: string): string {
  return column.replaceAll("_", " ");
}

function freshnessFromPayload(payload: ClearStreetTradesPayload | null): ClearStreetTradesFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  const hasRows = payload.rowCount > 0;
  if (!hasRows) {
    return {
      status: "No Data",
      statusClass: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
      summary: "Trades | 0 rows",
      targetDateLabel: payload.search || "Latest MUFG",
      latestDateLabel: "--",
      latestUpdateLabel: fmtDateTime(payload.latestUploadAt),
    };
  }

  return {
    status: "Loaded",
    statusClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    summary: `Trades | ${payload.rowCount.toLocaleString()} rows | ${fmtDate(payload.latestSftpDate)}`,
    targetDateLabel: payload.search || "Latest MUFG",
    latestDateLabel: fmtDate(payload.latestSftpDate),
    latestUpdateLabel: fmtDateTime(payload.latestUploadAt),
  };
}

function StatusBadge({ label, tone }: { label: string; tone: "good" | "warn" | "neutral" }) {
  const className =
    tone === "good"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
        ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
        : "border-gray-700 bg-gray-900 text-gray-400";
  return (
    <span className={`max-w-full break-all rounded-md border px-2.5 py-1 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

function TradesTable({ payload }: { payload: ClearStreetTradesPayload }) {
  const derivedFields = new Set(payload.derivedFields);
  const columns = payload.columns;

  return (
    <table className="w-max min-w-full border-collapse bg-[#0d1119] text-xs text-gray-200">
      <thead className="sticky top-0 z-30 bg-gray-950 text-gray-500">
        <tr>
          {columns.map((column, index) => {
            const sticky = index === 0;
            const derived = derivedFields.has(column);
            return (
              <th
                key={column}
                className={`min-w-[132px] border-l border-gray-800 px-2.5 py-2 text-left font-semibold uppercase tracking-wide first:border-l-0 ${
                  sticky ? "sticky left-0 z-40 bg-gray-950 shadow-[2px_0_0_rgba(31,41,55,0.9)]" : ""
                } ${derived ? "text-sky-300" : ""}`}
                title={column}
              >
                {columnLabel(column)}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-800">
        {payload.rows.map((row, rowIndex) => (
          <tr key={`${row.record_id ?? "row"}-${rowIndex}`} className="hover:bg-gray-900/60">
            {columns.map((column, columnIndex) => {
              const text = fmtCell(row[column]);
              const sticky = columnIndex === 0;
              return (
                <td
                  key={`${rowIndex}-${column}`}
                  className={`max-w-[300px] truncate border-l border-gray-800 px-2.5 py-1.5 align-top first:border-l-0 ${
                    sticky
                      ? "sticky left-0 z-10 bg-[#0d1119] font-semibold text-gray-100 shadow-[2px_0_0_rgba(31,41,55,0.9)]"
                      : "text-gray-300"
                  }`}
                  title={text}
                >
                  {text}
                </td>
              );
            })}
          </tr>
        ))}
        {!payload.rows.length && (
          <tr>
            <td colSpan={Math.max(columns.length, 1)} className="px-3 py-10 text-center text-sm text-gray-500">
              No Clear Street trades matched the current search.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default function ClearStreetTrades({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: ClearStreetTradesFreshnessSummary) => void;
}) {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ClearStreetTradesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const forceRefresh = refreshToken > 0;

    setLoading(true);
    setError(null);

    fetchJsonWithCache<ClearStreetTradesPayload>({
      key: buildCacheKey(limit, search),
      url: buildApiUrl(limit, search, forceRefresh),
      ttlMs: API_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
    })
      .then((payload) => {
        setData(payload);
        onFreshnessChange?.(freshnessFromPayload(payload));
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        const message = caught instanceof Error ? caught.message : "Failed to load Clear Street trades";
        setData(null);
        setError(message);
        onFreshnessChange?.({
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "Trades query failed",
          targetDateLabel: search || "Latest MUFG",
          latestDateLabel: "--",
          latestUpdateLabel: "--",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [limit, onFreshnessChange, refreshToken, search]);

  const returnedLabel = useMemo(() => {
    if (!data) return "0 rows";
    if (data.returnedRowCount === data.rowCount) {
      return `${data.returnedRowCount.toLocaleString()} rows`;
    }
    return `${data.returnedRowCount.toLocaleString()} of ${data.rowCount.toLocaleString()} rows`;
  }, [data]);

  const submitSearch = () => setSearch(searchInput.trim());

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_140px_auto] lg:items-end">
          <label className="block min-w-0">
            <span className={FIELD_LABEL_CLASS}>Search</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitSearch();
              }}
              placeholder="Account, product, symbol, broker"
              className={FIELD_CONTROL_CLASS}
            />
          </label>
          <label className="block min-w-0">
            <span className={FIELD_LABEL_CLASS}>Rows</span>
            <select
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className={FIELD_CONTROL_CLASS}
            >
              {LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={submitSearch}
              className="h-9 rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearch("");
              }}
              className="h-9 rounded-md border border-gray-700 bg-gray-950 px-3 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label={returnedLabel} tone={data?.rowCount ? "good" : "warn"} />
          <StatusBadge label={`SFTP ${fmtDate(data?.latestSftpDate)}`} tone="neutral" />
          <StatusBadge label={`Upload ${fmtDateTime(data?.latestUploadAt)}`} tone="neutral" />
          <StatusBadge label={data?.rulesSource ?? "JSON rules"} tone="neutral" />
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          Loading Clear Street trades...
        </div>
      )}

      {data && !loading && (
        <DataTableShell
          title="TypeScript Rule Result"
          subtitle={`${data.columns.length.toLocaleString()} columns using ${data.ruleEngine}.`}
          bodyClassName="max-h-[75vh] overflow-auto"
        >
          <TradesTable payload={data} />
        </DataTableShell>
      )}
    </div>
  );
}
