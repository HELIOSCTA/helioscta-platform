"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type {
  BackOfficeHomeGroup,
  BackOfficeHomePayload,
  BackOfficeHomeReadiness,
  BackOfficeHomeSnapshot,
  BackOfficeHomeSnapshotStatus,
  BackOfficeHomeSourceStatus,
} from "@/lib/positionsAndTrades/backOfficeHomeTypes";

const API_PATH = "/api/backoffice-home";
const API_CACHE_KEY = "backoffice-home";
const API_CACHE_TTL_MS = 5 * 60 * 1000;
const AUTO_REFRESH_MS = 2 * 60 * 1000;

const READINESS_CLASS: Record<BackOfficeHomeReadiness, string> = {
  ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  watch: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
  error: "border-red-500/40 bg-red-500/10 text-red-200",
};

const READINESS_PANEL_CLASS: Record<BackOfficeHomeReadiness, string> = {
  ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  watch: "border-yellow-500/30 bg-yellow-500/10 text-yellow-100",
  error: "border-red-500/30 bg-red-500/10 text-red-100",
};

const SNAPSHOT_CLASS: Record<BackOfficeHomeSnapshotStatus, string> = {
  ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  awaiting_next_run: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  late: "border-orange-500/40 bg-orange-500/10 text-orange-200",
  missing: "border-red-500/40 bg-red-500/10 text-red-200",
  unavailable: "border-gray-700 bg-gray-900 text-gray-400",
  error: "border-red-500/40 bg-red-500/10 text-red-200",
};

const SOURCE_STATUS_CLASS: Record<BackOfficeHomeSourceStatus, string> = {
  up: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  unknown: "border-gray-700 bg-gray-900 text-gray-400",
  gap: "border-orange-500/40 bg-orange-500/10 text-orange-200",
  error: "border-red-500/40 bg-red-500/10 text-red-200",
};

function apiUrl(refreshNonce: number): string {
  if (refreshNonce <= 0) return API_PATH;
  return `${API_PATH}?refresh=${refreshNonce}`;
}

function fmtTimestamp(value: string | null): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function StatusBadge({
  label,
  className,
  title,
}: {
  label: string;
  className: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${title ? "cursor-help" : ""} ${className}`}
    >
      {label}
    </span>
  );
}

function ReadinessBanner({
  payload,
  showHealthyRows,
  onToggleHealthyRows,
}: {
  payload: BackOfficeHomePayload;
  showHealthyRows: boolean;
  onToggleHealthyRows: () => void;
}) {
  return (
    <section className="rounded-md border border-gray-800 bg-[#12141d] p-4 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-100">Trade Readiness</h2>
          <p className="mt-2 text-xs font-semibold text-gray-500">
            Last check: {fmtTimestamp(payload.generatedAt)} | Auto-refresh every 2 minutes
          </p>
        </div>
        <StatusBadge
          label={payload.readinessLabel}
          className={READINESS_CLASS[payload.readiness]}
        />
      </div>
      <p
        className={`mt-3 rounded-md border px-3 py-2 text-xs font-semibold ${READINESS_PANEL_CLASS[payload.readiness]}`}
      >
        {payload.summary}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href="/?view=backoffice-home"
          className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 shadow-[0_0_0_1px_rgba(14,165,233,0.15)]"
        >
          Home
        </Link>
        <Link
          href="/?view=backoffice-positions-trades"
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
        >
          Positions & Trades
        </Link>
        <Link
          href="/?view=ice-trade-blotter"
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
        >
          Trade Blotter
        </Link>
        <Link
          href="/?view=backoffice-nav-daily-position-sheet"
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
        >
          NAV Daily Position Sheet
        </Link>
        <button
          type="button"
          onClick={onToggleHealthyRows}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
        >
          {showHealthyRows ? "Hide Healthy Rows" : "Show Healthy Rows"}
        </button>
      </div>
    </section>
  );
}

function ChangePanel({ payload }: { payload: BackOfficeHomePayload }) {
  return (
    <section className="rounded-md border border-gray-800 bg-[#12141d] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">
            What Changed Since Last Check
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-400">
            {payload.changedSinceLastCheck}
          </p>
        </div>
      </div>
    </section>
  );
}

function snapshotNeedsAttention(snapshot: BackOfficeHomeSnapshot): boolean {
  return snapshot.isException;
}

function SnapshotCards({ snapshots }: { snapshots: BackOfficeHomeSnapshot[] }) {
  return (
    <div className="rounded-md border border-gray-800 bg-[#111622] p-3">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        Latest Available Snapshot
      </p>
      <div className="grid gap-2 xl:grid-cols-3">
        {snapshots.map((snapshot) => (
          <article
            key={snapshot.id}
            className="h-[108px] overflow-hidden rounded-md border border-gray-800 bg-[#0d1018] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-gray-100">
                  {snapshot.label}
                </h3>
              </div>
              <p className="shrink-0 text-[11px] font-medium text-gray-500">
                {snapshot.scheduleLabel}
              </p>
            </div>
            <div className="mt-2 space-y-1 text-xs">
              <p className="truncate text-gray-100">
                <span className="font-semibold">Latest:</span>{" "}
                {snapshot.label} - {snapshot.latestDateLabel}
              </p>
              <p className="truncate font-semibold text-emerald-300">
                DB Mirrored:{" "}
                {snapshot.dbMirroredLabel}
              </p>
              <div className="flex items-start gap-2 pt-1">
                <StatusBadge
                  label={snapshot.statusLabel}
                  className={SNAPSHOT_CLASS[snapshot.status]}
                  title={snapshot.detail}
                />
                <p className="min-w-0 flex-1 overflow-hidden text-[11px] leading-4 text-gray-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                  {snapshot.detail}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ExceptionsTable({ snapshots }: { snapshots: BackOfficeHomeSnapshot[] }) {
  if (snapshots.length === 0) {
    return (
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-50">
        No exceptions. All tracked files are in sync.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-gray-800">
      <table className="min-w-[820px] w-full border-collapse text-left text-xs">
        <thead className="bg-gray-950/60 text-[10px] uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Source</th>
            <th className="px-3 py-2 font-semibold">Latest</th>
            <th className="px-3 py-2 font-semibold">DB Mirrored</th>
            <th className="px-3 py-2 text-right font-semibold">Rows</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {snapshots.map((snapshot) => (
            <tr key={snapshot.id} className="bg-[#11141d]">
              <td className="px-3 py-3">
                <div className="font-semibold text-gray-100">{snapshot.label}</div>
                <div className="mt-1 max-w-[260px] break-words text-[11px] text-gray-500">
                  {snapshot.sourceTable}
                </div>
              </td>
              <td className="px-3 py-3">
                <div className="font-semibold text-gray-300">
                  {snapshot.latestDateLabel}
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {snapshot.latestUpdateLabel}
                </div>
              </td>
              <td className="px-3 py-3 text-gray-300">{snapshot.dbMirroredLabel}</td>
              <td className="px-3 py-3 text-right font-semibold text-gray-100">
                {snapshot.rowCountLabel}
              </td>
              <td className="px-3 py-3">
                <StatusBadge
                  label={snapshot.statusLabel}
                  className={SNAPSHOT_CLASS[snapshot.status]}
                  title={snapshot.expectedArtifact}
                />
              </td>
              <td className="px-3 py-3 max-w-[340px] break-words text-gray-400">
                {snapshot.detail}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupSection({
  group,
  showHealthyRows,
}: {
  group: BackOfficeHomeGroup;
  showHealthyRows: boolean;
}) {
  const visibleSnapshots = showHealthyRows
    ? group.snapshots
    : group.snapshots.filter(snapshotNeedsAttention);

  return (
    <section className="rounded-md border border-gray-800 bg-[#12141d] p-4 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-gray-100">{group.label}</h2>
          </div>
          <p className="mt-2 text-xs font-semibold text-gray-500">
            Latest available source file: {group.latestAvailableLabel}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <StatusBadge
            label={group.sftpStatusLabel}
            className={SOURCE_STATUS_CLASS[group.sftpStatus]}
          />
          <StatusBadge
            label={group.dbStatusLabel}
            className={SOURCE_STATUS_CLASS[group.dbStatus]}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-5">
        {group.metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-md border border-gray-800 bg-[#10131b] px-3 py-2"
          >
            <p className="text-sm text-gray-400">
              {metric.label}:{" "}
              <span
                className={`font-semibold ${
                  metric.status === "ready"
                    ? "text-emerald-200"
                    : metric.status === "error"
                      ? "text-red-200"
                      : "text-yellow-200"
                }`}
              >
                {metric.value}
              </span>
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <SnapshotCards snapshots={group.snapshots} />
      </div>

      <div className="mt-3 rounded-md border border-gray-800 bg-[#111622] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {showHealthyRows ? "All Rows" : "Exceptions Only"}
          </p>
          <p className="text-xs text-gray-500">
            Showing {visibleSnapshots.length} of {group.snapshots.length}
          </p>
        </div>
        <ExceptionsTable snapshots={visibleSnapshots} />
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <section className="rounded-md border border-gray-800 bg-[#12141d] p-4 text-sm text-gray-400">
      Loading Back Office Home...
    </section>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <section className="rounded-md border border-red-500/30 bg-red-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-red-100">
            Back Office Home failed to load
          </h2>
          <p className="mt-1 text-sm leading-6 text-red-200">{error}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-red-400/40 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-100 transition-colors hover:bg-red-500/30"
        >
          Retry
        </button>
      </div>
    </section>
  );
}

export default function BackOfficeHome() {
  const [payload, setPayload] = useState<BackOfficeHomePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [showHealthyRows, setShowHealthyRows] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshNonce((value) => value + 1);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    const forceRefresh = refreshNonce > 0;

    setLoading(true);
    setError(null);

    fetchJsonWithCache<BackOfficeHomePayload>({
      key: API_CACHE_KEY,
      url: apiUrl(refreshNonce),
      ttlMs: API_CACHE_TTL_MS,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
      persist: "session",
    })
      .then((nextPayload) => {
        if (!active) return;
        setPayload(nextPayload);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || "Failed to load Back Office Home");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshNonce]);

  if (loading && !payload) return <LoadingState />;
  if (error && !payload) {
    return <ErrorState error={error} onRetry={() => setRefreshNonce((value) => value + 1)} />;
  }
  if (!payload) return null;
  const visibleGroups = payload.groups.filter((group) => group.id !== "marex");

  return (
    <div className="space-y-4">
      <ReadinessBanner
        payload={payload}
        showHealthyRows={showHealthyRows}
        onToggleHealthyRows={() => setShowHealthyRows((value) => !value)}
      />

      {error && (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-200">
          Refresh failed; showing cached data. {error}
        </div>
      )}

      <ChangePanel payload={payload} />

      <div className={visibleGroups.length === 1 ? "max-w-[680px]" : "grid gap-4 xl:grid-cols-2"}>
        {visibleGroups.map((group) => (
          <GroupSection
            key={group.id}
            group={group}
            showHealthyRows={showHealthyRows}
          />
        ))}
      </div>
    </div>
  );
}
