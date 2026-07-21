"use client";

import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { extractLocationIds, ExtractionError } from "@/lib/extract-location-ids";
import {
  normalizeGasNomsImport,
  type GasNomsImportPreview,
  type GasNomsMapLocationRow,
} from "@/lib/gas-noms-import";

interface MapLocationsResponse {
  locations?: GasNomsMapLocationRow[];
}

interface GasNomsImportDialogProps {
  open: boolean;
  title?: string;
  allowApplyToReport?: boolean;
  saving?: boolean;
  onClose: () => void;
  onSaveWatchlist?: (preview: GasNomsImportPreview, name: string) => Promise<void> | void;
  onApplyToReport?: (preview: GasNomsImportPreview) => Promise<void> | void;
}

const DEFAULT_TEXT =
  "Paste JSON or YAML with locationId / location_id values, or upload a .json/.yaml file.";
const LOCATION_ID_CHUNK_SIZE = 500;

function defaultWatchlistName(): string {
  return `Imported Watchlist ${new Date().toISOString().slice(0, 10)}`;
}

function roleCountsLabel(preview: GasNomsImportPreview | null): string {
  if (!preview) return "--";
  const entries = Object.entries(preview.roleCounts);
  if (entries.length === 0) return "No roles";
  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([role, count]) => `${role}: ${count.toLocaleString()}`)
    .join(" | ");
}

async function resolveImportedLocations(locationIds: readonly number[]): Promise<GasNomsMapLocationRow[]> {
  const locations: GasNomsMapLocationRow[] = [];
  for (let index = 0; index < locationIds.length; index += LOCATION_ID_CHUNK_SIZE) {
    const chunk = locationIds.slice(index, index + LOCATION_ID_CHUNK_SIZE);
    const params = new URLSearchParams({
      locationId: chunk.join(","),
      limit: String(Math.max(chunk.length * 4, 100)),
    });
    const response = await fetch(`/api/map/locations?${params}`);
    const data = (await response.json().catch(() => ({}))) as MapLocationsResponse & {
      error?: string;
    };
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    locations.push(...(data.locations ?? []));
  }
  return locations;
}

export default function GasNomsImportDialog({
  open,
  title = "Import Gas Noms",
  allowApplyToReport = false,
  saving = false,
  onClose,
  onSaveWatchlist,
  onApplyToReport,
}: GasNomsImportDialogProps) {
  const [rawInput, setRawInput] = useState("");
  const [watchlistName, setWatchlistName] = useState(defaultWatchlistName);
  const [preview, setPreview] = useState<GasNomsImportPreview | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSaveWatchlist = Boolean(
    onSaveWatchlist && preview && preview.locationRoleIds.length > 0 && watchlistName.trim()
  );
  const working = resolving || saving;
  const unmatchedPreview = useMemo(
    () => preview?.unmatchedLocationIds.slice(0, 20).join(", ") ?? "",
    [preview]
  );

  const resetPreview = useCallback(() => {
    setPreview(null);
    setError(null);
  }, []);

  const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setRawInput(text);
      setWatchlistName(file.name.replace(/\.(json|ya?ml)$/i, "").replace(/[_-]+/g, " ").trim() || defaultWatchlistName());
      setPreview(null);
      setError(null);
    } catch {
      setError("Failed to read the selected file.");
    } finally {
      event.target.value = "";
    }
  }, []);

  const buildPreview = useCallback(async () => {
    setResolving(true);
    setError(null);
    setPreview(null);

    try {
      const extracted = extractLocationIds(rawInput);
      const locations = await resolveImportedLocations(extracted.locationIds);
      const nextPreview = normalizeGasNomsImport(extracted.locationIds, locations);
      setPreview(nextPreview);
      if (nextPreview.locationRoleIds.length === 0) {
        setError("No mapped location role IDs resolved from the imported location IDs.");
      }
    } catch (err) {
      if (err instanceof ExtractionError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to parse and resolve the import.");
      }
    } finally {
      setResolving(false);
    }
  }, [rawInput]);

  const saveWatchlist = useCallback(async () => {
    if (!preview || !canSaveWatchlist || !onSaveWatchlist) return;
    setError(null);
    try {
      await onSaveWatchlist(preview, watchlistName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save watchlist.");
    }
  }, [canSaveWatchlist, onSaveWatchlist, preview, watchlistName]);

  const applyToReport = useCallback(async () => {
    if (!preview || preview.locationRoleIds.length === 0 || !onApplyToReport) return;
    setError(null);
    try {
      await onApplyToReport(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply import.");
    }
  }, [onApplyToReport, preview]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-sm border border-[#555] bg-[#343434] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#666] bg-[#303030] px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xl leading-none text-gray-300 hover:bg-white/10 hover:text-white"
            aria-label="Close import dialog"
          >
            x
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 overflow-auto p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="space-y-3">
            {onSaveWatchlist && (
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-300">
                Watchlist Name
                <input
                  value={watchlistName}
                  onChange={(event) => setWatchlistName(event.target.value)}
                  className="mt-1 h-10 w-full rounded-sm border border-[#666] bg-[#444] px-3 text-sm font-normal normal-case tracking-normal text-white outline-none focus:border-[#aaa]"
                />
              </label>
            )}

            <label className="block text-xs font-bold uppercase tracking-wider text-gray-300">
              Upload JSON/YAML
              <input
                type="file"
                accept=".json,.yaml,.yml,application/json,text/yaml,text/x-yaml"
                onChange={handleFileChange}
                className="mt-1 block w-full text-xs text-gray-300 file:mr-3 file:rounded-sm file:border-0 file:bg-gray-200 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-gray-950 hover:file:bg-white"
              />
            </label>

            <label className="block text-xs font-bold uppercase tracking-wider text-gray-300">
              Paste Import Data
              <textarea
                value={rawInput}
                onChange={(event) => {
                  setRawInput(event.target.value);
                  resetPreview();
                }}
                placeholder={DEFAULT_TEXT}
                className="mt-1 h-72 w-full resize-none rounded-sm border border-[#666] bg-[#242424] px-3 py-2 font-mono text-xs font-normal normal-case tracking-normal text-gray-100 outline-none placeholder:text-gray-500 focus:border-[#aaa]"
              />
            </label>

            {error && (
              <p className="rounded-sm border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void buildPreview()}
              disabled={working || rawInput.trim().length === 0}
              className="w-full rounded-sm bg-[#777] px-4 py-2 text-sm font-bold text-white hover:bg-[#858585] disabled:cursor-not-allowed disabled:bg-[#555]"
            >
              {resolving ? "Resolving..." : "Preview Import"}
            </button>
          </section>

          <section className="flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-sm border border-[#262626] bg-[#3f3f3f]">
            <div className="grid grid-cols-2 gap-2 border-b border-[#555] p-3 text-xs sm:grid-cols-4">
              <div>
                <p className="text-gray-400">Imported IDs</p>
                <p className="mt-1 font-mono text-sm text-white">
                  {preview?.importedLocationIds.length.toLocaleString() ?? "--"}
                </p>
              </div>
              <div>
                <p className="text-gray-400">Matched</p>
                <p className="mt-1 font-mono text-sm text-white">
                  {preview?.matchedLocationIds.length.toLocaleString() ?? "--"}
                </p>
              </div>
              <div>
                <p className="text-gray-400">Role IDs</p>
                <p className="mt-1 font-mono text-sm text-white">
                  {preview?.locationRoleIds.length.toLocaleString() ?? "--"}
                </p>
              </div>
              <div>
                <p className="text-gray-400">Unmatched</p>
                <p className="mt-1 font-mono text-sm text-white">
                  {preview?.unmatchedLocationIds.length.toLocaleString() ?? "--"}
                </p>
              </div>
            </div>

            <div className="border-b border-[#555] px-3 py-2 text-xs text-gray-300">
              <span className="font-semibold text-gray-100">Roles:</span> {roleCountsLabel(preview)}
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {!preview ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">
                  Build a preview to see matched map locations.
                </p>
              ) : preview.rows.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">
                  No matching map locations.
                </p>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-[#252525] text-left text-white">
                    <tr>
                      <th className="border-r border-[#444] px-2 py-2">Location</th>
                      <th className="border-r border-[#444] px-2 py-2">Pipeline</th>
                      <th className="border-r border-[#444] px-2 py-2">Facility</th>
                      <th className="border-r border-[#444] px-2 py-2 text-right">Loc ID</th>
                      <th className="px-2 py-2 text-right">Role IDs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr
                        key={`${row.pipelineId ?? "none"}:${row.locationId}`}
                        className="border-b border-[#555] bg-[#414141]"
                      >
                        <td className="max-w-[220px] truncate border-r border-[#555] px-2 py-2 font-semibold">
                          {row.locationName}
                          <span className="mt-0.5 block truncate text-[11px] font-normal text-gray-400">
                            {row.county}, {row.state}
                          </span>
                        </td>
                        <td className="border-r border-[#555] px-2 py-2">{row.pipeline}</td>
                        <td className="max-w-[180px] truncate border-r border-[#555] px-2 py-2">
                          {row.facility}
                        </td>
                        <td className="border-r border-[#555] px-2 py-2 text-right font-mono">
                          {row.locationId}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {row.roles.map((role) => role.locationRoleId).join(", ") || "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {preview && preview.unmatchedLocationIds.length > 0 && (
              <p className="border-t border-[#555] bg-[#3a3a3a] px-3 py-2 text-xs text-amber-200">
                Unmatched IDs: {unmatchedPreview}
                {preview.unmatchedLocationIds.length > 20 ? " ..." : ""}
              </p>
            )}
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#666] bg-[#303030] px-4 py-3">
          {allowApplyToReport && (
            <button
              type="button"
              onClick={() => void applyToReport()}
              disabled={working || !preview || preview.locationRoleIds.length === 0}
              className="rounded-sm border border-[#777] px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-[#444] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply to current report
            </button>
          )}
          {onSaveWatchlist && (
            <button
              type="button"
              onClick={() => void saveWatchlist()}
              disabled={working || !canSaveWatchlist}
              className="rounded-sm bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-[#555]"
            >
              {saving ? "Saving..." : "Save watchlist"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
