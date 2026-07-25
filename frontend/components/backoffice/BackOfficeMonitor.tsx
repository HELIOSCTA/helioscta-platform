"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type {
  BackOfficeMonitorEmailStatus,
  BackOfficeMonitorEmailWorkflow,
  BackOfficeMonitorPayload,
} from "@/lib/positionsAndTrades/backOfficeMonitorTypes";

const API_PATH = "/api/backoffice-monitor";
const API_CACHE_TTL_MS = 5 * 60 * 1000;
const AUTO_REFRESH_MS = 2 * 60 * 1000;
const LOCAL_DISPLAY_TIME_ZONE = "America/Denver";

const EMAIL_STATUS_CLASS: Record<BackOfficeMonitorEmailStatus, string> = {
  sent: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  queued: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  failed: "border-red-500/40 bg-red-500/10 text-red-200",
  unknown: "border-gray-700 bg-gray-900 text-gray-400",
};

function apiUrl(refreshNonce: number): string {
  if (refreshNonce <= 0) return API_PATH;
  return `${API_PATH}?refresh=${refreshNonce}`;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    timeZone: LOCAL_DISPLAY_TIME_ZONE,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function EmailStatusBadge({
  status,
  label,
}: {
  status: BackOfficeMonitorEmailStatus;
  label: string;
}) {
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-bold ${EMAIL_STATUS_CLASS[status]}`}
    >
      {label}
    </span>
  );
}

function LoadingState() {
  return (
    <section className="rounded-md border border-gray-800 bg-[#12141d] p-4 text-sm text-gray-400">
      Loading Email Routing...
    </section>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <section className="rounded-md border border-red-500/30 bg-red-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-red-100">
            Email Routing failed to load
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

function EmailWorkflowRouting({
  generatedAt,
  workflows,
  onRefresh,
}: {
  generatedAt: string;
  workflows: BackOfficeMonitorEmailWorkflow[];
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-md border border-gray-800 bg-[#12141d] p-4 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Email Routing</h2>
          <p className="mt-1 text-xs text-gray-500">
            VM-produced email paths, recipients, senders, and latest delivery telemetry.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onRefresh}
            className="h-8 rounded-md border border-gray-600 bg-gray-100 px-3 text-xs font-semibold text-gray-950 transition-colors hover:bg-white"
          >
            Refresh
          </button>
          <div className="rounded-md border border-gray-800 bg-[#10131b] px-3 py-2 text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Updated
            </p>
            <p className="mt-1 text-xs font-semibold text-gray-300">
              {formatTimestamp(generatedAt)}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-md border border-gray-800">
        <table className="min-w-[1060px] w-full border-collapse text-left text-xs">
          <thead className="bg-gray-950/60 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Workflow</th>
              <th className="px-3 py-2 font-semibold">From</th>
              <th className="px-3 py-2 font-semibold">To</th>
              <th className="px-3 py-2 font-semibold">Delivery</th>
              <th className="px-3 py-2 font-semibold">Latest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {workflows.map((workflow) => (
              <tr key={workflow.id} className="align-top bg-[#11141d]">
                <td className="px-3 py-3">
                  <div className="font-semibold text-gray-100">{workflow.label}</div>
                  <div className="mt-1 text-[11px] text-gray-500">{workflow.audience}</div>
                  <div className="mt-2 text-[11px] leading-5 text-gray-400">
                    {workflow.trigger}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="break-words font-semibold text-gray-200">
                    {workflow.senderEmail}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">{workflow.senderSource}</div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex max-w-[300px] flex-wrap gap-1.5">
                    {workflow.recipientEmails.map((email) => (
                      <span
                        key={`${workflow.id}:${email}`}
                        className="rounded border border-gray-800 bg-[#10131b] px-2 py-1 text-[11px] font-semibold text-gray-300"
                      >
                        {email}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-gray-500">{workflow.recipientSource}</div>
                </td>
                <td className="px-3 py-3">
                  <div className="font-semibold text-gray-300">{workflow.deliveryPath}</div>
                  <div className="mt-2 text-[11px] leading-5 text-gray-400">
                    {workflow.artifact}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <EmailStatusBadge
                    status={workflow.latestStatus}
                    label={workflow.latestStatusLabel}
                  />
                  <div className="mt-2 text-[11px] font-semibold text-gray-300">
                    {workflow.latestActivityLabel}
                  </div>
                  {workflow.latestSubject && (
                    <div className="mt-2 max-w-[280px] break-words text-[11px] leading-5 text-gray-400">
                      {workflow.latestSubject}
                    </div>
                  )}
                  <div className="mt-2 max-w-[280px] break-words text-[11px] leading-5 text-gray-500">
                    {workflow.latestDetail}
                  </div>
                  {workflow.latestError && (
                    <div className="mt-2 max-w-[280px] break-words text-[11px] leading-5 text-red-200">
                      {workflow.latestError}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function BackOfficeMonitor() {
  const [payload, setPayload] = useState<BackOfficeMonitorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshNonce((value) => value + 1);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, []);

  const url = useMemo(() => apiUrl(refreshNonce), [refreshNonce]);

  useEffect(() => {
    let active = true;
    const forceRefresh = refreshNonce > 0;

    setLoading(true);
    setError(null);

    fetchJsonWithCache<BackOfficeMonitorPayload>({
      key: `backoffice-monitor:${url}`,
      url,
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
        setError(err.message || "Failed to load Email Routing");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshNonce, url]);

  if (loading && !payload) return <LoadingState />;
  if (error && !payload) {
    return <ErrorState error={error} onRetry={() => setRefreshNonce((value) => value + 1)} />;
  }
  if (!payload) return null;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-200">
          Refresh failed; showing cached data. {error}
        </div>
      )}

      <EmailWorkflowRouting
        generatedAt={payload.generatedAt}
        workflows={payload.emailWorkflows}
        onRefresh={() => setRefreshNonce((value) => value + 1)}
      />
    </div>
  );
}
