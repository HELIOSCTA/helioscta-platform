"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type {
  BackOfficeMonitorEmailHistoryDetail,
  BackOfficeMonitorEmailHistoryRow,
  BackOfficeMonitorEmailStatus,
  BackOfficeMonitorEmailWorkflow,
  BackOfficeMonitorPayload,
} from "@/lib/positionsAndTrades/backOfficeMonitorTypes";

const API_PATH = "/api/backoffice-monitor";
const API_CACHE_TTL_MS = 5 * 60 * 1000;
const AUTO_REFRESH_MS = 2 * 60 * 1000;
const LOCAL_DISPLAY_TIME_ZONE = "America/Denver";
const LAST_EMAIL_WORKFLOW_IDS = new Set(["clear_street_nav"]);

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

function orderEmailWorkflows(
  workflows: BackOfficeMonitorEmailWorkflow[],
): BackOfficeMonitorEmailWorkflow[] {
  const normalRows = workflows.filter((workflow) => !LAST_EMAIL_WORKFLOW_IDS.has(workflow.id));
  const lastRows = workflows.filter((workflow) => LAST_EMAIL_WORKFLOW_IDS.has(workflow.id));
  return [...normalRows, ...lastRows];
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
  historyByWorkflow,
  onHistoryOpen,
  onRefresh,
}: {
  generatedAt: string;
  workflows: BackOfficeMonitorEmailWorkflow[];
  historyByWorkflow: Map<string, BackOfficeMonitorEmailHistoryRow[]>;
  onHistoryOpen: (workflowId: string, initialHistoryId: string | null) => void;
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
        <table className="min-w-[1180px] w-full border-collapse text-left text-xs">
          <thead className="bg-gray-950/60 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Workflow</th>
              <th className="px-3 py-2 font-semibold">From</th>
              <th className="px-3 py-2 font-semibold">To</th>
              <th className="px-3 py-2 font-semibold">Delivery</th>
              <th className="px-3 py-2 font-semibold">Latest</th>
              <th className="px-3 py-2 text-right font-semibold">History</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {workflows.map((workflow) => {
              const historyRows = historyByWorkflow.get(workflow.id) ?? [];
              const latestHistory = historyRows[0] ?? null;
              const hasHistory = historyRows.length > 0;

              return (
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
                    <div className="mt-2 text-[11px] text-gray-500">
                      {workflow.recipientSource}
                    </div>
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
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      disabled={!hasHistory}
                      title={
                        hasHistory
                          ? `View ${workflow.label} delivery history`
                          : "No delivery history in the current telemetry window"
                      }
                      onClick={() => onHistoryOpen(workflow.id, latestHistory?.id ?? null)}
                      className={[
                        "inline-flex h-8 items-center gap-2 rounded border px-2.5 text-[11px] font-semibold transition-colors",
                        hasHistory
                          ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100 hover:border-cyan-400/60 hover:bg-cyan-500/15"
                          : "cursor-not-allowed border-gray-800 bg-[#10131b] text-gray-600",
                      ].join(" ")}
                    >
                      <span>History</span>
                      <span className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[10px]">
                        {historyRows.length.toLocaleString()}
                      </span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DetailValue({ value }: { value: string | null }) {
  return <span className={value ? "text-gray-200" : "text-gray-600"}>{value || "--"}</span>;
}

function EmailHistoryDetailRows({ rows }: { rows: BackOfficeMonitorEmailHistoryDetail[] }) {
  return (
    <table className="min-w-[860px] w-full table-fixed border-collapse text-left text-xs">
      <thead className="sticky top-0 z-10 bg-gray-950 text-[10px] uppercase tracking-wider text-gray-500">
        <tr>
          <th className="w-[24%] px-3 py-2 font-semibold">Recipient</th>
          <th className="w-[11%] px-3 py-2 font-semibold">Status</th>
          <th className="w-[16%] px-3 py-2 font-semibold">Activity</th>
          <th className="w-[9%] px-3 py-2 font-semibold">Attempts</th>
          <th className="w-[30%] px-3 py-2 font-semibold">Artifact</th>
          <th className="w-[10%] px-3 py-2 font-semibold">Error</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-800">
        {rows.map((row) => (
          <tr key={row.id} className="bg-[#11141d] align-top hover:bg-[#151b28]">
            <td className="break-words px-3 py-3 font-semibold text-gray-100">
              <DetailValue value={row.recipientEmail} />
              {row.senderEmail && (
                <div className="mt-1 break-words text-[11px] font-medium text-gray-500">
                  From {row.senderEmail}
                </div>
              )}
            </td>
            <td className="px-3 py-3">
              <EmailStatusBadge status={row.status} label={row.statusLabel} />
            </td>
            <td className="break-words px-3 py-3 text-gray-300">{row.activityLabel}</td>
            <td className="px-3 py-3 font-semibold text-gray-200">
              {row.attemptsLabel}
            </td>
            <td
              className="break-words px-3 py-3 font-mono text-[11px] text-gray-300"
              title={row.artifactLabel}
            >
              {row.artifactLabel}
              {row.notificationKey && (
                <div
                  className="mt-1 break-words text-[10px] text-gray-600"
                  title={row.notificationKey}
                >
                  {row.notificationKey}
                </div>
              )}
            </td>
            <td className="break-words px-3 py-3 text-orange-200">
              <DetailValue value={row.error} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmailHistoryModal({
  workflow,
  historyRows,
  selectedHistoryId,
  onHistorySelect,
  onClose,
}: {
  workflow: BackOfficeMonitorEmailWorkflow;
  historyRows: BackOfficeMonitorEmailHistoryRow[];
  selectedHistoryId: string | null;
  onHistorySelect: (historyId: string) => void;
  onClose: () => void;
}) {
  const activeHistory =
    historyRows.find((row) => row.id === selectedHistoryId) ?? historyRows[0] ?? null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 p-2 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="monitor-history-title"
    >
      <div className="flex h-full w-full max-w-none flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#0d121b] shadow-2xl shadow-black/50">
        <div className="flex flex-col gap-3 border-b border-gray-800 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 id="monitor-history-title" className="text-base font-semibold text-gray-100">
              {workflow.label} Delivery History
            </h3>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-gray-400">
              <span className="rounded border border-gray-800 bg-[#10131b] px-2 py-1">
                {workflow.audience}
              </span>
              <span className="rounded border border-gray-800 bg-[#10131b] px-2 py-1">
                {workflow.deliveryPath}
              </span>
              <span className="rounded border border-gray-800 bg-[#10131b] px-2 py-1">
                Latest {workflow.latestActivityLabel}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 shrink-0 rounded border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            Close
          </button>
        </div>

        {historyRows.length === 0 ? (
          <div className="m-4 rounded border border-gray-800 bg-[#11141d] p-4 text-sm text-gray-400">
            No delivery history rows returned for this workflow.
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 bg-[#0d1119] lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[390px_minmax(0,1fr)]">
            <div className="min-h-[220px] overflow-auto border-b border-gray-800 bg-[#0b1018] p-2 lg:border-b-0 lg:border-r">
              <div className="space-y-2">
                {historyRows.map((row) => {
                  const selected = row.id === activeHistory?.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => onHistorySelect(row.id)}
                      className={[
                        "w-full rounded-md border p-3 text-left transition-colors",
                        selected
                          ? "border-cyan-500/40 bg-cyan-500/10"
                          : "border-gray-800 bg-[#11141d] hover:border-gray-700 hover:bg-[#151b28]",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-gray-100">
                          {row.businessDateLabel}
                        </div>
                        <EmailStatusBadge status={row.status} label={row.statusLabel} />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                            Latest
                          </div>
                          <div className="mt-0.5 break-words text-gray-300">
                            {row.latestActivityLabel}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                            Recipients
                          </div>
                          <div className="mt-0.5 text-gray-300">{row.recipientsLabel}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                            Rows
                          </div>
                          <div className="mt-0.5 font-semibold text-gray-200">
                            {row.rowCountLabel}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 overflow-auto">
              {activeHistory && (
                <>
                  <div className="border-b border-gray-800 bg-[#101722] px-5 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-100">
                          {activeHistory.businessDateLabel}
                        </div>
                        <div className="mt-1 max-w-5xl text-xs leading-5 text-gray-400">
                          {activeHistory.detail} Latest activity {activeHistory.latestActivityLabel}.
                        </div>
                        {activeHistory.subject && (
                          <div className="mt-2 max-w-6xl break-words text-xs font-semibold text-gray-300">
                            {activeHistory.subject}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0">
                        <EmailStatusBadge
                          status={activeHistory.status}
                          label={activeHistory.statusLabel}
                        />
                      </div>
                    </div>
                    <div
                      className="mt-2 max-w-6xl break-words font-mono text-[11px] text-gray-500"
                      title={activeHistory.artifactLabel}
                    >
                      {activeHistory.artifactLabel}
                    </div>
                  </div>
                  {activeHistory.details.length === 0 ? (
                    <div className="m-4 rounded border border-gray-800 bg-[#11141d] p-4 text-sm text-gray-400">
                      No delivery detail rows returned.
                    </div>
                  ) : (
                    <EmailHistoryDetailRows rows={activeHistory.details} />
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BackOfficeMonitor() {
  const [payload, setPayload] = useState<BackOfficeMonitorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

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
  const emailWorkflows = orderEmailWorkflows(payload.emailWorkflows);
  const emailHistory = payload.emailHistory ?? [];
  const historyByWorkflow = new Map<string, BackOfficeMonitorEmailHistoryRow[]>();
  for (const row of emailHistory) {
    historyByWorkflow.set(row.workflowId, [...(historyByWorkflow.get(row.workflowId) ?? []), row]);
  }
  const selectedWorkflow =
    emailWorkflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null;
  const selectedWorkflowHistory = selectedWorkflowId
    ? historyByWorkflow.get(selectedWorkflowId) ?? []
    : [];
  const openWorkflowHistory = (workflowId: string, initialHistoryId: string | null) => {
    setSelectedWorkflowId(workflowId);
    setSelectedHistoryId(initialHistoryId);
  };
  const closeWorkflowHistory = () => {
    setSelectedWorkflowId(null);
    setSelectedHistoryId(null);
  };

  return (
    <div className="space-y-4" data-perf-ready="backoffice-monitor">
      {error && (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-200">
          Refresh failed; showing cached data. {error}
        </div>
      )}

      <EmailWorkflowRouting
        generatedAt={payload.generatedAt}
        workflows={emailWorkflows}
        historyByWorkflow={historyByWorkflow}
        onHistoryOpen={openWorkflowHistory}
        onRefresh={() => setRefreshNonce((value) => value + 1)}
      />
      {selectedWorkflow && (
        <EmailHistoryModal
          workflow={selectedWorkflow}
          historyRows={selectedWorkflowHistory}
          selectedHistoryId={selectedHistoryId}
          onHistorySelect={setSelectedHistoryId}
          onClose={closeWorkflowHistory}
        />
      )}
    </div>
  );
}
