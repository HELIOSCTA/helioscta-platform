"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

export interface CriterionNomsFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestUpdateLabel: string;
  rowCountLabel: string;
  scopeLabel: string;
}

interface CriterionNomsDashboardProps {
  initialDate?: string;
  refreshToken?: number;
  onFreshnessChange?: (freshness: CriterionNomsFreshnessSummary) => void;
}

interface CriterionNomsRow {
  anchorDate: string | null;
  sourceTable: string;
  tspShort: string;
  metadataId: string;
  state: string | null;
  pipeline: string | null;
  location: string | null;
  locationId: string | null;
  facilityType: string | null;
  county: string | null;
  connectingEntity: string | null;
  categoryShort: string | null;
  locQtiShort: string | null;
  recDelSign: number | null;
  tomorrow: number;
  today: number;
  yesterday: number;
  twoDaysOld: number;
  threeDaysOld: number;
  fourDaysOld: number;
  fiveDaysOld: number;
  sixDaysOld: number;
  cycleId: number | null;
  cycleDesc: string | null;
  dataAsOf: string | null;
}

interface CriterionNomsStateTotal {
  state: string;
  plantPointCount: number;
  tomorrow: number;
  today: number;
  yesterday: number;
  twoDaysOld: number;
  threeDaysOld: number;
  fourDaysOld: number;
  fiveDaysOld: number;
  sixDaysOld: number;
}

interface CriterionNomsPayload {
  anchorDate: string | null;
  selectedStates: string[];
  defaultStates: string[];
  stateOptions: string[];
  includeZero: boolean;
  watchlist: {
    watchlistId: number;
    slug: string;
    displayName: string;
    pointCount: number;
  } | null;
  rows: CriterionNomsRow[];
  stateTotals: CriterionNomsStateTotal[];
  totalCount: number;
  returnedCount: number;
  summary: {
    plantPointCount: number;
    stateCount: number;
    today: number;
    yesterday: number;
    tomorrow: number;
    dataAsOf: string | null;
  };
}

interface CriterionWatchlistApiRow {
  watchlist_id: number;
  slug: string;
  display_name: string;
  filter_config?: Record<string, unknown>;
  point_count?: number | string;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface CriterionWatchlistMutationResponse {
  ok?: boolean;
  watchlist?: CriterionWatchlistApiRow;
  points?: unknown[];
  error?: string;
}

const API_CACHE_TTL_MS = 60_000;
const DEFAULT_LIMIT = 1000;
const DEFAULT_FRESHNESS: CriterionNomsFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Criterion nominations --",
  targetDateLabel: "--",
  latestUpdateLabel: "--",
  rowCountLabel: "--",
  scopeLabel: "--",
};
const EMPTY_ROWS: CriterionNomsRow[] = [];
const EMPTY_STATE_TOTALS: CriterionNomsStateTotal[] = [];

const NUMERIC_COLUMNS: Array<{
  key: keyof Pick<
    CriterionNomsRow,
    | "tomorrow"
    | "today"
    | "yesterday"
    | "twoDaysOld"
    | "threeDaysOld"
    | "fourDaysOld"
    | "fiveDaysOld"
    | "sixDaysOld"
  >;
  label: string;
}> = [
  { key: "tomorrow", label: "Tomorrow" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "twoDaysOld", label: "Two Days Old" },
  { key: "threeDaysOld", label: "Three Days Old" },
  { key: "fourDaysOld", label: "Four Days Old" },
  { key: "fiveDaysOld", label: "Five Days Old" },
  { key: "sixDaysOld", label: "Six Days Old" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDth(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return Math.round(value).toLocaleString();
}

function formatDate(value: string | null | undefined): string {
  return value || "--";
}

function formatStamp(value: string | null | undefined): string {
  return value ? value.replace("T", " ").slice(0, 16) : "--";
}

function valueClass(value: number): string {
  if (value < 0) return "text-sky-100";
  if (value > 0) return "text-amber-100";
  return "text-gray-500";
}

function rowKey(row: Pick<CriterionNomsRow, "sourceTable" | "tspShort" | "metadataId">): string {
  return `${row.sourceTable}|${row.tspShort}|${row.metadataId}`;
}

function pointInputFromRow(row: CriterionNomsRow, sortOrder?: number) {
  return {
    sourceTable: row.sourceTable,
    tspShort: row.tspShort,
    metadataId: row.metadataId,
    sortOrder,
  };
}

function pointCount(row: CriterionWatchlistApiRow): number {
  const parsed = Number(row.point_count ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildApiUrl({
  date,
  state,
  includeZero,
  watchlistId,
  refreshToken,
}: {
  date: string;
  state: string;
  includeZero: boolean;
  watchlistId: string;
  refreshToken: number;
}): string {
  const params = new URLSearchParams({
    date,
    limit: String(DEFAULT_LIMIT),
  });
  if (state !== "ALL") params.set("states", state);
  if (includeZero) params.set("includeZero", "1");
  if (watchlistId) params.set("watchlistId", watchlistId);
  if (refreshToken > 0) params.set("refresh", String(refreshToken));
  return `/api/criterion/noms?${params.toString()}`;
}

function buildCacheKey({
  date,
  state,
  includeZero,
  watchlistId,
}: {
  date: string;
  state: string;
  includeZero: boolean;
  watchlistId: string;
}): string {
  return [
    "api:criterion-noms",
    date,
    state,
    includeZero ? "with-zero" : "active-only",
    watchlistId || "ad-hoc",
  ].join(":");
}

function freshnessFromPayload(payload: CriterionNomsPayload): CriterionNomsFreshnessSummary {
  const hasRows = payload.totalCount > 0;
  const scopeLabel = payload.watchlist
    ? `Watchlist: ${payload.watchlist.displayName}`
    : payload.selectedStates.join(", ");
  return {
    status: hasRows ? "Loaded" : "Empty",
    statusClass: hasRows
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : "border-amber-500/30 bg-amber-500/10 text-amber-200",
    summary: `Criterion noms ${formatDate(payload.anchorDate)} | ${payload.totalCount.toLocaleString()} plant points`,
    targetDateLabel: formatDate(payload.anchorDate),
    latestUpdateLabel: formatStamp(payload.summary.dataAsOf),
    rowCountLabel: `${payload.returnedCount.toLocaleString()} / ${payload.totalCount.toLocaleString()}`,
    scopeLabel,
  };
}

function ControlCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="w-full rounded-lg border border-sky-950/70 bg-[#0d121b] p-3 shadow-xl shadow-black/20 ring-1 ring-white/[0.02] sm:p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-gray-100 tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-[11px] text-gray-500">{detail}</p>}
    </div>
  );
}

export default function CriterionNomsDashboard({
  initialDate,
  refreshToken = 0,
  onFreshnessChange,
}: CriterionNomsDashboardProps) {
  const [dateInput, setDateInput] = useState(initialDate ?? todayIso());
  const [reportDate, setReportDate] = useState(initialDate ?? todayIso());
  const [selectedState, setSelectedState] = useState("ALL");
  const [includeZero, setIncludeZero] = useState(false);
  const [watchlists, setWatchlists] = useState<CriterionWatchlistApiRow[]>([]);
  const [pendingWatchlistId, setPendingWatchlistId] = useState("");
  const [activeWatchlistId, setActiveWatchlistId] = useState("");
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistSaving, setWatchlistSaving] = useState(false);
  const [watchlistMutationToken, setWatchlistMutationToken] = useState(0);
  const [payload, setPayload] = useState<CriterionNomsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = useMemo(
    () =>
      buildApiUrl({
        date: reportDate,
        state: selectedState,
        includeZero,
        watchlistId: activeWatchlistId,
        refreshToken: refreshToken + watchlistMutationToken,
      }),
    [activeWatchlistId, includeZero, refreshToken, reportDate, selectedState, watchlistMutationToken],
  );
  const cacheKey = useMemo(
    () =>
      buildCacheKey({
        date: reportDate,
        state: selectedState,
        includeZero,
        watchlistId: activeWatchlistId,
      }),
    [activeWatchlistId, includeZero, reportDate, selectedState],
  );

  const loadWatchlists = useCallback(async () => {
    setWatchlistLoading(true);
    try {
      const response = await fetch("/api/criterion/watchlists", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        watchlists?: CriterionWatchlistApiRow[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      const rows = [...(data.watchlists ?? [])].sort((a, b) =>
        a.display_name.localeCompare(b.display_name),
      );
      setWatchlists(rows);
      setPendingWatchlistId((prev) => {
        if (prev && rows.some((row) => String(row.watchlist_id) === prev)) return prev;
        if (activeWatchlistId && rows.some((row) => String(row.watchlist_id) === activeWatchlistId)) {
          return activeWatchlistId;
        }
        return rows[0] ? String(rows[0].watchlist_id) : "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Criterion watchlists.");
    } finally {
      setWatchlistLoading(false);
    }
  }, [activeWatchlistId]);

  useEffect(() => {
    void loadWatchlists();
  }, [loadWatchlists]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchJsonWithCache<CriterionNomsPayload>({
      key: cacheKey,
      url: apiUrl,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: "no-store",
      forceRefresh: refreshToken > 0 || watchlistMutationToken > 0,
    })
      .then((data) => {
        setPayload(data);
        setSelectedRowKeys(new Set());
        onFreshnessChange?.(freshnessFromPayload(data));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "Failed to load Criterion nominations.";
        setError(message);
        onFreshnessChange?.({
          ...DEFAULT_FRESHNESS,
          status: "Error",
          statusClass: "border-red-500/30 bg-red-500/10 text-red-200",
          summary: message,
          targetDateLabel: reportDate,
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [apiUrl, cacheKey, onFreshnessChange, refreshToken, reportDate, watchlistMutationToken]);

  const stateOptions = payload?.stateOptions ?? [];
  const rows = payload?.rows ?? EMPTY_ROWS;
  const stateTotals = payload?.stateTotals ?? EMPTY_STATE_TOTALS;
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedRowKeys.has(rowKey(row))),
    [rows, selectedRowKeys],
  );
  const selectedRowsCount = selectedRows.length;
  const allVisibleSelected =
    rows.length > 0 && rows.every((row) => selectedRowKeys.has(rowKey(row)));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) setReportDate(dateInput);
  };

  const handleLoadWatchlist = () => {
    setActiveWatchlistId(pendingWatchlistId);
    setSelectedState("ALL");
    setSelectedRowKeys(new Set());
  };

  const handleClearWatchlist = () => {
    setActiveWatchlistId("");
    setSelectedRowKeys(new Set());
  };

  const toggleRowSelection = (key: string) => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllVisibleRows = () => {
    setSelectedRowKeys(new Set(rows.map(rowKey)));
  };

  const clearSelectedRows = () => {
    setSelectedRowKeys(new Set());
  };

  const mergeWatchlist = (watchlist: CriterionWatchlistApiRow) => {
    setWatchlists((prev) =>
      [...prev.filter((row) => row.watchlist_id !== watchlist.watchlist_id), watchlist].sort(
        (a, b) => a.display_name.localeCompare(b.display_name),
      ),
    );
    const id = String(watchlist.watchlist_id);
    setPendingWatchlistId(id);
    setActiveWatchlistId(id);
  };

  const saveSelectedRowsAsWatchlist = async () => {
    const trimmedName = newWatchlistName.trim();
    if (!trimmedName) {
      setError("Watchlist name is required.");
      return;
    }
    if (selectedRows.length === 0) {
      setError("Select at least one visible Criterion point before saving.");
      return;
    }

    setWatchlistSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/criterion/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          filterConfig: {
            reportDate,
            selectedState,
            includeZero,
            source: "criterion-noms-dashboard",
          },
          points: selectedRows.map((row, index) => pointInputFromRow(row, index + 1)),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as CriterionWatchlistMutationResponse;
      if (!response.ok || !data.watchlist) throw new Error(data.error ?? `HTTP ${response.status}`);
      mergeWatchlist(data.watchlist);
      setNewWatchlistName("");
      setWatchlistMutationToken((value) => value + 1);
      setSelectedRowKeys(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Criterion watchlist.");
    } finally {
      setWatchlistSaving(false);
    }
  };

  const addSelectedRowsToWatchlist = async () => {
    const targetWatchlistId = activeWatchlistId || pendingWatchlistId;
    if (!targetWatchlistId) {
      setError("Select and load a watchlist before adding rows.");
      return;
    }
    if (selectedRows.length === 0) {
      setError("Select at least one visible Criterion point before adding rows.");
      return;
    }

    setWatchlistSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/criterion/watchlists/${targetWatchlistId}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: selectedRows.map((row) => pointInputFromRow(row)),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as CriterionWatchlistMutationResponse;
      if (!response.ok || !data.watchlist) throw new Error(data.error ?? `HTTP ${response.status}`);
      mergeWatchlist(data.watchlist);
      setWatchlistMutationToken((value) => value + 1);
      setSelectedRowKeys(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add Criterion rows.");
    } finally {
      setWatchlistSaving(false);
    }
  };

  const removeSelectedRowsFromWatchlist = async () => {
    if (!activeWatchlistId) {
      setError("Load a watchlist before removing rows.");
      return;
    }
    if (selectedRows.length === 0) {
      setError("Select at least one visible Criterion point before removing rows.");
      return;
    }

    setWatchlistSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/criterion/watchlists/${activeWatchlistId}/points`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: selectedRows.map((row) => pointInputFromRow(row)),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as CriterionWatchlistMutationResponse;
      if (!response.ok || !data.watchlist) throw new Error(data.error ?? `HTTP ${response.status}`);
      mergeWatchlist(data.watchlist);
      setWatchlistMutationToken((value) => value + 1);
      setSelectedRowKeys(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove Criterion rows.");
    } finally {
      setWatchlistSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <ControlCard title="Criterion Noms">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                Report Date
                <input
                  type="date"
                  value={dateInput}
                  onChange={(event) => setDateInput(event.target.value)}
                  className="h-8 rounded-md border border-gray-700 bg-gray-950 px-2 text-xs font-semibold text-gray-200 outline-none transition-colors focus:border-sky-500"
                />
              </label>
              <button
                type="submit"
                className="h-8 rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700"
              >
                Load
              </button>
              <label className="flex h-8 items-center gap-2 rounded-md border border-gray-800 bg-gray-950/50 px-2 text-xs font-semibold text-gray-400">
                <input
                  type="checkbox"
                  checked={includeZero}
                  onChange={(event) => setIncludeZero(event.target.checked)}
                  className="h-3.5 w-3.5 accent-sky-500"
                />
                Zero rows
              </label>
            </form>

            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="font-semibold text-gray-300">
                {payload ? `${payload.totalCount.toLocaleString()} rows` : loading ? "Loading" : "--"}
              </span>
              <span>Source: Criterion Snowflake</span>
              <span>As of {formatStamp(payload?.summary.dataAsOf)}</span>
            </div>
          </div>

          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <select
              value={pendingWatchlistId}
              onChange={(event) => setPendingWatchlistId(event.target.value)}
              disabled={watchlistLoading}
              className="h-8 min-w-0 rounded-md border border-gray-700 bg-gray-950 px-2 text-xs font-semibold text-gray-200 outline-none transition-colors focus:border-sky-500 disabled:cursor-not-allowed disabled:text-gray-500"
            >
              <option value="">
                {watchlistLoading ? "Loading watchlists..." : "Select watchlist"}
              </option>
              {watchlists.map((watchlist) => (
                <option key={watchlist.watchlist_id} value={String(watchlist.watchlist_id)}>
                  {watchlist.display_name} ({pointCount(watchlist).toLocaleString()})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleLoadWatchlist}
              disabled={!pendingWatchlistId || watchlistLoading}
              className="h-8 rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-950 disabled:text-gray-600"
            >
              Load
            </button>
            <button
              type="button"
              onClick={handleClearWatchlist}
              disabled={!activeWatchlistId}
              className="h-8 rounded-md border border-gray-800 bg-gray-950/40 px-3 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-200 disabled:cursor-not-allowed disabled:text-gray-700"
            >
              All Points
            </button>
            <button
              type="button"
              onClick={() => void loadWatchlists()}
              disabled={watchlistLoading}
              className="h-8 rounded-md border border-gray-800 bg-gray-950/40 px-3 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-200 disabled:cursor-not-allowed disabled:text-gray-700"
            >
              Refresh Lists
            </button>
          </div>

          <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
            <input
              value={newWatchlistName}
              onChange={(event) => setNewWatchlistName(event.target.value)}
              placeholder="New watchlist name"
              className="h-8 min-w-0 rounded-md border border-gray-700 bg-gray-950 px-2 text-xs font-semibold text-gray-200 outline-none placeholder:text-gray-600 transition-colors focus:border-sky-500"
            />
            <button
              type="button"
              onClick={() => void saveSelectedRowsAsWatchlist()}
              disabled={watchlistSaving || selectedRowsCount === 0 || !newWatchlistName.trim()}
              className="h-8 rounded-md bg-sky-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
            >
              Save Selected
            </button>
            <button
              type="button"
              onClick={() => void addSelectedRowsToWatchlist()}
              disabled={watchlistSaving || selectedRowsCount === 0 || !(activeWatchlistId || pendingWatchlistId)}
              className="h-8 rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-950 disabled:text-gray-600"
            >
              Add Rows
            </button>
            <button
              type="button"
              onClick={() => void removeSelectedRowsFromWatchlist()}
              disabled={watchlistSaving || selectedRowsCount === 0 || !activeWatchlistId}
              className="h-8 rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-950 disabled:text-gray-600"
            >
              Remove Rows
            </button>
            <button
              type="button"
              onClick={clearSelectedRows}
              disabled={selectedRowKeys.size === 0}
              className="h-8 rounded-md border border-gray-800 bg-gray-950/40 px-3 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-200 disabled:cursor-not-allowed disabled:text-gray-700"
            >
              Clear Selection
            </button>
          </div>

          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setSelectedState("ALL")}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                selectedState === "ALL"
                  ? "border-sky-500/50 bg-sky-500/10 text-sky-100"
                  : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
              }`}
            >
              All States
            </button>
            {stateOptions.map((state) => (
              <button
                key={state}
                type="button"
                onClick={() => setSelectedState(state)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  selectedState === state
                    ? "border-sky-500/50 bg-sky-500/10 text-sky-100"
                    : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                }`}
              >
                {state}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Today"
              value={formatDth(payload?.summary.today)}
              detail="Signed scheduled Dth/d"
            />
            <MetricCard
              label="Yesterday"
              value={formatDth(payload?.summary.yesterday)}
              detail="Signed scheduled Dth/d"
            />
            <MetricCard
              label="Tomorrow"
              value={formatDth(payload?.summary.tomorrow)}
              detail="Available nomination rows"
            />
            <MetricCard
              label="States"
              value={(payload?.summary.stateCount ?? 0).toLocaleString()}
              detail={`${payload?.summary.plantPointCount ?? 0} plant points`}
            />
            <MetricCard
              label="Watchlist"
              value={payload?.watchlist ? payload.watchlist.displayName : "Ad hoc"}
              detail={
                payload?.watchlist
                  ? `${payload.watchlist.pointCount.toLocaleString()} saved points`
                  : "PJM-state proxy"
              }
            />
          </div>
        </div>
      </ControlCard>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {error}
        </div>
      )}

      <DataTableShell
        title="State Summary"
        subtitle="Signed delivery nominations by state for the selected Criterion power plant points."
      >
        <table className="min-w-full divide-y divide-gray-800 bg-[#0d1119] text-xs">
          <thead className="bg-gray-950 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-right">Points</th>
              {NUMERIC_COLUMNS.map((column) => (
                <th key={column.key} className="px-3 py-2 text-right">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading && !payload ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={10}>
                  Loading Criterion nominations...
                </td>
              </tr>
            ) : stateTotals.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={10}>
                  No Criterion nominations found for the selected state/date window.
                </td>
              </tr>
            ) : (
              stateTotals.map((row) => (
                <tr key={row.state} className="hover:bg-gray-900/70">
                  <td className="px-3 py-2 font-semibold text-gray-200">{row.state}</td>
                  <td className="px-3 py-2 text-right text-gray-400 tabular-nums">
                    {row.plantPointCount.toLocaleString()}
                  </td>
                  {NUMERIC_COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${valueClass(row[column.key])}`}
                    >
                      {formatDth(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTableShell>

      <DataTableShell
        title="Plant 7 Day Report"
        subtitle="Latest available row per Criterion metadata point and gas day, signed with REC_DEL_SIGN."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-xs font-semibold text-gray-400">
              {selectedRowsCount.toLocaleString()} selected
            </span>
            <button
              type="button"
              onClick={selectAllVisibleRows}
              disabled={rows.length === 0 || allVisibleSelected}
              className="rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-gray-950 disabled:text-gray-600"
            >
              Select Visible
            </button>
            <button
              type="button"
              onClick={clearSelectedRows}
              disabled={selectedRowKeys.size === 0}
              className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-200 disabled:cursor-not-allowed disabled:text-gray-700"
            >
              Clear
            </button>
          </div>
        }
      >
        <table className="min-w-[1640px] divide-y divide-gray-800 bg-[#0d1119] text-xs">
          <thead className="bg-gray-950 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="sticky left-0 z-20 w-12 bg-gray-950 px-3 py-2 text-left">
                <span className="sr-only">Select</span>
              </th>
              <th className="sticky left-12 z-10 w-16 bg-gray-950 px-3 py-2 text-left">State</th>
              <th className="w-48 px-3 py-2 text-left">Pipeline</th>
              <th className="w-[360px] px-3 py-2 text-left">Location</th>
              <th className="w-28 px-3 py-2 text-left">Location ID</th>
              <th className="w-28 px-3 py-2 text-left">TSP</th>
              <th className="w-28 px-3 py-2 text-left">Facility Type</th>
              {NUMERIC_COLUMNS.map((column) => (
                <th key={column.key} className="w-32 px-3 py-2 text-right">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading && !payload ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={15}>
                  Loading Criterion nominations...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={15}>
                  No plant nomination rows returned.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const key = rowKey(row);
                const selected = selectedRowKeys.has(key);
                return (
                  <tr
                    key={key}
                    className={`hover:bg-gray-900/70 ${selected ? "bg-sky-500/5" : ""}`}
                  >
                    <td className="sticky left-0 z-20 bg-[#0d1119] px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleRowSelection(key)}
                        aria-label={`Select ${row.location ?? row.metadataId}`}
                        className="h-3.5 w-3.5 accent-sky-500"
                      />
                    </td>
                    <td className="sticky left-12 z-10 bg-[#0d1119] px-3 py-2 font-semibold text-gray-200">
                      {row.state}
                    </td>
                    <td className="px-3 py-2 text-gray-300">{row.pipeline ?? "--"}</td>
                    <td className="px-3 py-2 font-semibold text-gray-100">{row.location ?? "--"}</td>
                    <td className="px-3 py-2 text-gray-400 tabular-nums">{row.locationId ?? "--"}</td>
                    <td className="px-3 py-2 text-gray-400 tabular-nums">{row.tspShort}</td>
                    <td className="px-3 py-2 text-gray-300">{row.facilityType ?? "POWER PLANT"}</td>
                    {NUMERIC_COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={`px-3 py-2 text-right font-semibold tabular-nums ${valueClass(row[column.key])}`}
                      >
                        {formatDth(row[column.key])}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </DataTableShell>
    </div>
  );
}
