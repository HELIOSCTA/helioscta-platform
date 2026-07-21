"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GasNomsImportDialog from "@/components/gas/GasNomsImportDialog";
import GenscapeNomsReport, {
  type GenscapeNomsFreshnessSummary,
} from "@/components/gas/GenscapeNomsReport";
import type { GasNomsImportPreview } from "@/lib/gas-noms-import";
import type { Watchlist } from "@/lib/watchlists";

interface PipelineFiltersResponse {
  pipelines?: string[];
  location_role_ids?: number[];
  role_id_details?: RoleDetailRow[];
}

interface RoleDetailRow {
  location_role_id: number;
  pipeline: string;
  loc_name: string;
  location_id: number;
  facility: string;
  role: string;
}

interface MapSearchResponse {
  pipelines?: PipelineRow[];
  locations?: MapLocationRow[];
}

interface PipelineRow {
  pipeline_id: number;
  pipeline_name: string | null;
  pipeline_short_name: string;
  mapped_location_count: number;
  location_role_count: number;
}

interface MapLocationRow {
  location_id: number;
  pipeline_id: number | null;
  pipeline_name: string | null;
  pipeline_short_name: string | null;
  loc_name: string | null;
  facility: string | null;
  state: string | null;
  county: string | null;
  location_role_count: number;
  role_details: string | null;
}

interface SessionSelection extends Watchlist {
  source?: "custom" | "pipeline";
  createdAt?: string;
}

interface WatchlistApiRow {
  watchlist_id: number;
  slug: string;
  display_name: string;
  location_role_ids: number[];
  sign_overrides?: Record<string, number>;
}

interface GenscapeNomsDashboardProps {
  initialStartDate?: string;
  initialEndDate?: string;
  initialLocationRoleIds?: number[];
  initialPipeline?: string;
  initialSelectionName?: string;
  initialSelectionSource?: string;
  refreshToken?: number;
  onFreshnessChange?: (freshness: GenscapeNomsFreshnessSummary) => void;
}

const EMPTY_SCOPE: Watchlist = {
  id: "empty",
  name: "No selection",
  locationRoleIds: [],
  signOverrides: {},
};

function formatInt(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString();
}

function parseRoleDetails(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((part) => Number.parseInt(part.split(":")[0] ?? "", 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function uniqueRoleIds(ids: Iterable<number>): number[] {
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function pointLabel(point: MapLocationRow): string {
  return point.loc_name ?? `Location ${point.location_id}`;
}

function safeSelectionName(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 120) : fallback;
}

function watchlistFromApiRow(row: WatchlistApiRow): Watchlist {
  return {
    id: row.slug,
    name: row.display_name,
    locationRoleIds: row.location_role_ids,
    signOverrides: row.sign_overrides ?? {},
  };
}

export default function GenscapeNomsDashboard({
  initialStartDate,
  initialEndDate,
  initialLocationRoleIds = [],
  initialPipeline,
  initialSelectionName,
  initialSelectionSource,
  refreshToken = 0,
  onFreshnessChange,
}: GenscapeNomsDashboardProps) {
  const appliedInitialScope = useRef(false);
  const [scope, setScope] = useState<Watchlist>(EMPTY_SCOPE);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState("");
  const [pipelines, setPipelines] = useState<string[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState(initialPipeline ?? "");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchPipelines, setSearchPipelines] = useState<PipelineRow[]>([]);
  const [searchLocations, setSearchLocations] = useState<MapLocationRow[]>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [loading, setLoading] = useState({
    filters: true,
    scope: false,
    search: false,
    watchlists: true,
    save: false,
  });
  const [error, setError] = useState<string | null>(null);

  const activeRoleIds = useMemo(
    () => uniqueRoleIds(scope.locationRoleIds.filter((id) => Number.isFinite(id))),
    [scope.locationRoleIds],
  );

  const setScopeFromRoleIds = useCallback((name: string, roleIds: readonly number[]) => {
    setScope({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "custom-selection",
      name,
      locationRoleIds: uniqueRoleIds(roleIds),
      signOverrides: {},
    });
  }, []);

  const loadWatchlists = useCallback(async () => {
    setLoading((prev) => ({ ...prev, watchlists: true }));
    try {
      const response = await fetch("/api/watchlists", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        watchlists?: WatchlistApiRow[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      const rows = (data.watchlists ?? []).map(watchlistFromApiRow);
      setWatchlists(rows);
      setSelectedWatchlistId((prev) => {
        if (prev && rows.some((watchlist) => watchlist.id === prev)) return prev;
        const initial =
          initialSelectionSource === "watchlist" && initialSelectionName
            ? rows.find((watchlist) => watchlist.id === initialSelectionName)
            : null;
        return initial?.id ?? rows.find((watchlist) => watchlist.locationRoleIds.length > 0)?.id ?? "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load watchlists.");
    } finally {
      setLoading((prev) => ({ ...prev, watchlists: false }));
    }
  }, [initialSelectionName, initialSelectionSource]);

  useEffect(() => {
    void loadWatchlists();
  }, [loadWatchlists]);

  const resolvePipeline = useCallback(
    async (pipeline: string) => {
      const trimmed = pipeline.trim();
      if (!trimmed) return;
      setLoading((prev) => ({ ...prev, scope: true }));
      setError(null);
      try {
        const params = new URLSearchParams({ pipelines: trimmed });
        const response = await fetch(`/api/genscape-noms/filters?${params}`);
        const data = (await response.json().catch(() => ({}))) as PipelineFiltersResponse & {
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
        setScopeFromRoleIds(`${trimmed} pipeline`, data.location_role_ids ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load pipeline selection.");
      } finally {
        setLoading((prev) => ({ ...prev, scope: false }));
      }
    },
    [setScopeFromRoleIds],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/genscape-noms/filters")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<PipelineFiltersResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setPipelines(data.pipelines ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load pipeline filters.");
      })
      .finally(() => {
        if (!cancelled) setLoading((prev) => ({ ...prev, filters: false }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (appliedInitialScope.current) return;
    appliedInitialScope.current = true;

    if (initialSelectionSource === "session" && typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem("genscape-noms-selection");
        const parsed = raw ? (JSON.parse(raw) as SessionSelection) : null;
        if (parsed?.locationRoleIds?.length) {
          setScope({
            id: parsed.id || "rt-session-selection",
            name: safeSelectionName(parsed.name, initialSelectionName ?? "RT selection"),
            locationRoleIds: uniqueRoleIds(parsed.locationRoleIds),
            signOverrides: parsed.signOverrides ?? {},
          });
          return;
        }
      } catch {
        // Fall through to URL params.
      }
    }

    if (initialLocationRoleIds.length > 0) {
      setScopeFromRoleIds(
        safeSelectionName(initialSelectionName, "Role ID selection"),
        initialLocationRoleIds,
      );
      return;
    }

    if (initialPipeline) {
      void resolvePipeline(initialPipeline);
    }
  }, [
    initialLocationRoleIds,
    initialPipeline,
    initialSelectionName,
    initialSelectionSource,
    resolvePipeline,
    setScopeFromRoleIds,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const term = searchTerm.trim();
    if (term.length < 2) {
      setSearchPipelines([]);
      setSearchLocations([]);
      return () => controller.abort();
    }

    const timeoutId = window.setTimeout(() => {
      setLoading((prev) => ({ ...prev, search: true }));
      fetch(`/api/map/search?q=${encodeURIComponent(term)}&limit=25`, {
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json() as Promise<MapSearchResponse>;
        })
        .then((data) => {
          setSearchPipelines(data.pipelines ?? []);
          setSearchLocations(data.locations ?? []);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
        })
        .finally(() => setLoading((prev) => ({ ...prev, search: false })));
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchTerm]);

  const applyPoint = useCallback(
    (point: MapLocationRow, mode: "replace" | "add") => {
      const pointRoleIds = parseRoleDetails(point.role_details);
      const nextRoleIds =
        mode === "add" ? uniqueRoleIds([...activeRoleIds, ...pointRoleIds]) : pointRoleIds;
      setScopeFromRoleIds(
        mode === "add" && activeRoleIds.length > 0
          ? `${scope.name} + ${pointLabel(point)}`
          : pointLabel(point),
        nextRoleIds,
      );
    },
    [activeRoleIds, scope.name, setScopeFromRoleIds],
  );

  const applyPipeline = useCallback(
    (pipeline: string) => {
      setSelectedPipeline(pipeline);
      void resolvePipeline(pipeline);
    },
    [resolvePipeline],
  );

  const applyWatchlist = useCallback(
    (watchlistId: string) => {
      setSelectedWatchlistId(watchlistId);
      const watchlist = watchlists.find((item) => item.id === watchlistId);
      if (!watchlist) return;
      setScope(watchlist);
    },
    [watchlists],
  );

  const applyImport = useCallback(
    (preview: GasNomsImportPreview) => {
      setScopeFromRoleIds(
        safeSelectionName(initialSelectionName, "Imported RT selection"),
        preview.locationRoleIds,
      );
      setImportDialogOpen(false);
    },
    [initialSelectionName, setScopeFromRoleIds],
  );

  const saveImportAsWatchlist = useCallback(
    async (preview: GasNomsImportPreview, name: string) => {
      setLoading((prev) => ({ ...prev, save: true }));
      setError(null);
      try {
        const response = await fetch("/api/watchlists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            locationRoleIds: preview.locationRoleIds,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          watchlist?: WatchlistApiRow;
          error?: string;
        };
        if (!response.ok || !data.watchlist) {
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }

        const created = watchlistFromApiRow(data.watchlist);
        setWatchlists((prev) =>
          [...prev.filter((item) => item.id !== created.id), created].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );
        setSelectedWatchlistId(created.id);
        setScope(created);
        setImportDialogOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save watchlist.");
        throw err;
      } finally {
        setLoading((prev) => ({ ...prev, save: false }));
      }
    },
    [],
  );

  const scopeControls = (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <section className="rounded-md border border-gray-800 bg-gray-950/40 p-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <select
            value={selectedPipeline}
            onChange={(event) => {
              setSelectedPipeline(event.target.value);
              if (event.target.value) void resolvePipeline(event.target.value);
            }}
            className="h-9 min-w-0 rounded-md border border-gray-700 bg-gray-950 px-2 text-xs text-gray-100 outline-none focus:border-emerald-500"
          >
            <option value="">{loading.filters ? "Loading pipelines..." : "Select pipeline"}</option>
            {pipelines.map((pipeline) => (
              <option key={pipeline} value={pipeline}>
                {pipeline}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => selectedPipeline && void resolvePipeline(selectedPipeline)}
            disabled={!selectedPipeline || loading.scope}
            className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
          >
            Load
          </button>
          <button
            type="button"
            onClick={() => setImportDialogOpen(true)}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800"
          >
            Import
          </button>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <select
            value={selectedWatchlistId}
            onChange={(event) => applyWatchlist(event.target.value)}
            disabled={loading.watchlists}
            className="h-9 min-w-0 rounded-md border border-gray-700 bg-gray-950 px-2 text-xs text-gray-100 outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:text-gray-500"
          >
            <option value="">
              {loading.watchlists ? "Loading watchlists..." : "Select watchlist"}
            </option>
            {watchlists.map((watchlist) => (
              <option key={watchlist.id} value={watchlist.id}>
                {watchlist.name} ({watchlist.locationRoleIds.length.toLocaleString()})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadWatchlists()}
            disabled={loading.watchlists}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:text-gray-500"
          >
            Refresh
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md border border-gray-800 bg-gray-950/80 p-2">
            <p className="text-gray-500">Scope</p>
            <p className="mt-1 truncate font-semibold text-gray-100">{scope.name}</p>
          </div>
          <div className="rounded-md border border-gray-800 bg-gray-950/80 p-2">
            <p className="text-gray-500">Role IDs</p>
            <p className="mt-1 font-mono text-gray-100">{formatInt(activeRoleIds.length)}</p>
          </div>
          <div className="rounded-md border border-gray-800 bg-gray-950/80 p-2">
            <p className="text-gray-500">Status</p>
            <p className="mt-1 font-semibold text-gray-100">
              {loading.scope ? "Loading" : activeRoleIds.length > 0 ? "Ready" : "Empty"}
            </p>
          </div>
        </div>
        {error && (
          <p className="mt-3 rounded-md border border-red-500/30 bg-red-950/30 px-2 py-1.5 text-xs text-red-200">
            {error}
          </p>
        )}
      </section>

      <section className="rounded-md border border-gray-800 bg-gray-950/40 p-3">
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search pipeline, location, loc ID, role ID"
          className="h-9 w-full rounded-md border border-gray-700 bg-gray-950 px-2 text-xs text-gray-100 outline-none placeholder:text-gray-500 focus:border-emerald-500"
        />
        <div className="mt-3 max-h-52 space-y-1.5 overflow-y-auto pr-1">
          {searchTerm.trim().length < 2 ? (
            <p className="text-sm text-gray-500">No search.</p>
          ) : loading.search ? (
            <p className="text-sm text-gray-500">Searching...</p>
          ) : (
            <>
              {searchPipelines.slice(0, 6).map((pipeline) => (
                <button
                  key={`pipeline-${pipeline.pipeline_id}`}
                  type="button"
                  onClick={() => applyPipeline(pipeline.pipeline_short_name)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-gray-800"
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-100">
                    {pipeline.pipeline_short_name}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {formatInt(pipeline.location_role_count)} roles
                  </span>
                </button>
              ))}
              {searchLocations.slice(0, 10).map((point) => (
                <div
                  key={`${point.pipeline_id ?? "none"}:${point.location_id}`}
                  className="rounded-md border border-gray-800 bg-gray-900/60 px-2 py-2"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-100">
                        {pointLabel(point)}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-gray-500">
                        {point.pipeline_short_name ?? "--"} | loc {point.location_id} |{" "}
                        {formatInt(point.location_role_count)} roles
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => applyPoint(point, "replace")}
                        className="rounded border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-200 hover:bg-gray-800"
                      >
                        Set
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPoint(point, "add")}
                        className="rounded border border-gray-700 px-2 py-1 text-[10px] font-semibold text-gray-200 hover:bg-gray-800"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </section>
    </div>
  );

  return (
    <>
      <GenscapeNomsReport
        watchlist={scope}
        initialStartDate={initialStartDate}
        initialEndDate={initialEndDate}
        scopeControls={scopeControls}
        emptyScopeMessage="Select a pipeline, search result, RT map handoff, or import to load nominations."
        refreshToken={refreshToken}
        onFreshnessChange={onFreshnessChange}
      />
      <GasNomsImportDialog
        open={importDialogOpen}
        title="Import Noms Selection"
        allowApplyToReport
        saving={loading.save}
        onClose={() => setImportDialogOpen(false)}
        onSaveWatchlist={saveImportAsWatchlist}
        onApplyToReport={applyImport}
      />
    </>
  );
}
