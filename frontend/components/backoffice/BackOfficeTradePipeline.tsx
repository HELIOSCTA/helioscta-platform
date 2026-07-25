"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import ClearStreetTrades from "@/components/clear-street/ClearStreetTrades";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type { BackOfficeTradePipelinePayload } from "@/lib/positionsAndTrades/backOfficeTradePipelineTypes";
import type {
  PositionsHomeStatus,
  PositionsHomeValidationCheck,
  PositionsHomeValidationDetailsPayload,
  PositionsHomeValidationFailureRow,
  PositionsHomeValidationPayload,
} from "@/lib/positionsAndTrades/positionsHomeTypes";

const API_PATH = "/api/backoffice-trade-pipeline";
const VALIDATION_API_PATH = "/api/positions-home/validation";
const VALIDATION_DETAILS_API_PATH = "/api/positions-home/validation/details";
const API_CACHE_TTL_MS = 60 * 1000;
const VALIDATION_API_CACHE_TTL_MS = 15 * 60 * 1000;
const AUTO_REFRESH_MS = 60 * 1000;
const LOCAL_DISPLAY_TIME_ZONE = "America/Denver";
const PANEL_CLASS = "rounded-xl border border-gray-800 bg-gray-900/60";
const TITAN_ACCOUNT_FILTER = ["TITAN"];
const VALIDATION_STATUS_CLASS: Record<PositionsHomeStatus, string> = {
  stable: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  not_applicable: "border-gray-700 bg-gray-900 text-gray-400",
  watch: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
  stale: "border-orange-500/40 bg-orange-500/10 text-orange-200",
  missing: "border-red-500/40 bg-red-500/10 text-red-200",
  needs_repair: "border-red-500/40 bg-red-500/10 text-red-200",
  error: "border-red-500/40 bg-red-500/10 text-red-200",
};

function apiUrl(refreshNonce: number): string {
  const params = new URLSearchParams();
  if (refreshNonce > 0) params.set("refresh", String(refreshNonce));
  const query = params.toString();
  return query ? `${API_PATH}?${query}` : API_PATH;
}

function validationApiUrl(refreshNonce: number): string {
  if (refreshNonce <= 0) return VALIDATION_API_PATH;
  return `${VALIDATION_API_PATH}?refresh=${refreshNonce}`;
}

function validationDetailsApiUrl(
  check: PositionsHomeValidationCheck,
  refreshNonce: number,
): string {
  const params = new URLSearchParams({
    scope: check.scope,
    checkId: check.checkId,
    limit: "100",
  });
  if (refreshNonce > 0) params.set("refresh", String(refreshNonce));
  return `${VALIDATION_DETAILS_API_PATH}?${params.toString()}`;
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "--";
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

function ValidationStatusBadge({
  label,
  status,
  title,
}: {
  label: string;
  status: PositionsHomeStatus;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex rounded border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${VALIDATION_STATUS_CLASS[status]}`}
    >
      {label}
    </span>
  );
}

function validationCheckKey(check: PositionsHomeValidationCheck): string {
  return `${check.scope}:${check.checkId}`;
}

function clearStreetValidationChecks(
  payload: PositionsHomeValidationPayload | null,
): PositionsHomeValidationCheck[] {
  return (payload?.checks ?? []).filter((check) =>
    check.checkId.startsWith("clear_street_"),
  );
}

function cleanValidationLabel(label: string): string {
  return label
    .replace(/^Clear Street\s+/i, "")
    .replace(/\s+By Exchange Route$/i, "")
    .replace("All-History", "All History");
}

function validationEvidence(check: PositionsHomeValidationCheck): string {
  if ((check.failingCount ?? 0) === 0) return check.detail;
  const topGroup = [
    check.sampleProductCode,
    check.sampleProductGrouping,
    check.sampleRouteFamily,
  ]
    .filter(Boolean)
    .join(" / ");
  const reason = check.sampleFailureReason ? ` | ${check.sampleFailureReason}` : "";
  return `${topGroup || "Top group --"}${reason}`;
}

function validationRowsLabel(value: number | null): string {
  if (value === null) return "--";
  return value.toLocaleString();
}

function canOpenValidationCheck(check: PositionsHomeValidationCheck): boolean {
  return (check.failingCount ?? 0) > 0;
}

function compactValue(value: string | null): string {
  return value && value.trim() ? value : "--";
}

function contractLabel(row: PositionsHomeValidationFailureRow): string {
  return [
    row.contractYyyymm,
    row.contractDay ? `D${row.contractDay}` : null,
    row.putCall,
    row.strikePrice,
  ]
    .filter(Boolean)
    .join(" ");
}

function vendorCodesLabel(row: PositionsHomeValidationFailureRow): string {
  return [
    row.vendorIceCode ? `ICE ${row.vendorIceCode}` : null,
    row.vendorBbgCode ? `BBG ${row.vendorBbgCode}` : null,
    row.vendorCmeCode ? `CME ${row.vendorCmeCode}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function sourceLabel(row: PositionsHomeValidationFailureRow): string {
  return [
    row.sourceAccount,
    row.accountCode,
    row.sourceRowNumber ? `row ${row.sourceRowNumber}` : null,
    row.sourceContext,
    row.sourceRecordKey,
  ]
    .filter(Boolean)
    .join(" | ");
}

interface TradePipelineValidationSummary {
  status: PositionsHomeStatus;
  label: string;
  detail: string;
  latestPassed: number;
  latestTotal: number;
  latestFailingRows: number;
  historyWarningRows: number;
}

function tradePipelineValidationSummary({
  checks,
  loading,
  error,
  payload,
}: {
  checks: PositionsHomeValidationCheck[];
  loading: boolean;
  error: string | null;
  payload: PositionsHomeValidationPayload | null;
}): TradePipelineValidationSummary {
  const latestChecks = checks.filter((check) => check.scope === "latest");
  const latestLive = latestChecks.filter((check) => check.failingCount !== null);
  const latestFailingRows = latestLive.reduce(
    (total, check) => total + (check.failingCount ?? 0),
    0,
  );
  const latestHardFailures = latestLive.filter(
    (check) => check.severity === "error" && (check.failingCount ?? 0) > 0,
  ).length;
  const latestWarningRows = latestLive
    .filter((check) => check.severity === "warn")
    .reduce((total, check) => total + (check.failingCount ?? 0), 0);
  const historyWarningRows = checks
    .filter((check) => check.scope === "all_history" && check.severity === "warn")
    .reduce((total, check) => total + (check.failingCount ?? 0), 0);

  if (checks.length === 0) {
    return {
      status: error ? "error" : "not_applicable",
      label: error ? "Unavailable" : "Loading",
      detail:
        error || (!loading && !payload)
          ? "Trade quality checks could not be loaded."
          : "Trade quality checks are loading.",
      latestPassed: 0,
      latestTotal: 0,
      latestFailingRows: 0,
      historyWarningRows: 0,
    };
  }

  const latestPassed = latestLive.filter((check) => (check.failingCount ?? 0) === 0).length;
  if (latestHardFailures > 0) {
    return {
      status: "needs_repair",
      label: "Fail",
      detail: `${latestHardFailures} latest-file quality check(s) failed.`,
      latestPassed,
      latestTotal: latestChecks.length,
      latestFailingRows,
      historyWarningRows,
    };
  }

  if (latestWarningRows > 0) {
    return {
      status: "watch",
      label: "Watch",
      detail: `Latest-file product matching passed; ${latestWarningRows.toLocaleString()} vendor-code warning row(s) remain.`,
      latestPassed,
      latestTotal: latestChecks.length,
      latestFailingRows,
      historyWarningRows,
    };
  }

  return {
    status: "stable",
    label: "Pass",
    detail:
      historyWarningRows > 0
        ? `Latest file passes. ${historyWarningRows.toLocaleString()} historical vendor-code warning row(s) remain.`
        : "Latest file and all-history Clear Street quality checks passed.",
    latestPassed,
    latestTotal: latestChecks.length,
    latestFailingRows,
    historyWarningRows,
  };
}

function LoadingState() {
  return (
    <section className={`${PANEL_CLASS} p-4 text-sm text-gray-400`}>
      Loading Trade Pipeline...
    </section>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <section className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-red-100">
            Trade Pipeline failed to load
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

function fullCsvHref(payload: BackOfficeTradePipelinePayload): string {
  const params = new URLSearchParams({
    profile: "titan",
    format: "csv",
  });
  const businessDate = payload.selectedDate ?? payload.latestDate;
  if (businessDate) params.set("businessDate", businessDate);
  return `/api/back-office/trade-pipeline/preview?${params.toString()}`;
}

function TradePipelineTopPanel({ payload }: { payload: BackOfficeTradePipelinePayload }) {
  return (
    <section className={`${PANEL_CLASS} p-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-gray-700 bg-gray-900 p-1">
          <Link
            href="/?view=backoffice-home"
            className="rounded px-2.5 py-1 text-xs font-semibold text-gray-300 hover:bg-gray-800 hover:text-gray-100"
          >
            Home
          </Link>
          <Link
            href="/?view=backoffice-positions-trades"
            className="rounded px-2.5 py-1 text-xs font-semibold text-gray-300 hover:bg-gray-800 hover:text-gray-100"
          >
            Position Sheet
          </Link>
          <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-200">
            Titan File
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-200">Titan Trade File Preview</p>
          <p className="mt-1 text-xs text-gray-500">
            Clear Street end-of-day investor file with the 4 Titan columns appended.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-200"
          >
            Review View
          </button>
          <button
            type="button"
            className="rounded px-2.5 py-1 text-xs font-semibold text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            Full File View
          </button>
          <button
            type="button"
            className="rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-600"
          >
            Titan Code Guide
          </button>
          <span className="text-gray-500">Refresh 1m</span>
          <Link
            href={fullCsvHref(payload)}
            className="rounded border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs font-semibold text-gray-200 hover:border-gray-600"
          >
            Download Full CSV
          </Link>
        </div>
      </div>
    </section>
  );
}

function WatchPanel({ payload }: { payload: BackOfficeTradePipelinePayload }) {
  return (
    <section className={`${PANEL_CLASS} p-4`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-200">Tonight&apos;s File Watch</p>
          <p className="text-xs text-gray-500">
            Live monitor for the current Eastern business date before Titan preview is ready.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">{payload.watch.statusLabel}</p>
          <p className="text-sm font-semibold text-gray-200">{payload.watch.watchDateLabel}</p>
        </div>
      </div>
      <div className="rounded-lg border border-gray-700 bg-gray-900/70 p-3">
        <p className="text-sm font-semibold text-gray-200">{payload.watch.headline}</p>
        <div className="mt-2 space-y-1.5">
          <p className="text-sm leading-5 text-gray-200">{payload.watch.detail}</p>
          <p className="text-sm leading-5 text-gray-200">
            This page refreshes every minute. Expected release window is roughly 20:00 to 01:00 ET.
          </p>
        </div>
      </div>
    </section>
  );
}

function MonitoringTable({ payload }: { payload: BackOfficeTradePipelinePayload }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className={PANEL_CLASS}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-4 text-left transition-colors hover:bg-gray-900/40"
      >
        <div>
          <p className="text-sm font-semibold text-gray-200">Recent Monitoring</p>
          <p className="text-xs text-gray-500">
            Internal timeline of raw receipt and Titan-ready completion in local Mountain time.
          </p>
        </div>
      </button>
      {expanded && (
        <div className="overflow-x-auto border-t border-gray-800 px-4 pb-4 pt-3">
          <table className="w-full min-w-[880px] border-collapse text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Business Date</th>
                <th className="px-3 py-2 font-medium">Raw Received</th>
                <th className="px-3 py-2 font-medium">Raw Loaded</th>
                <th className="px-3 py-2 font-medium">Titan Ready</th>
                <th className="px-3 py-2 text-right font-medium">Rows</th>
                <th className="px-3 py-2 text-right font-medium">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {payload.recentMonitoring.map((row) => (
                <tr key={row.businessDate} className="border-t border-gray-800">
                  <td className="px-3 py-2 font-semibold text-gray-200">{row.businessDateLabel}</td>
                  <td className="px-3 py-2 text-gray-200">{row.rawReceivedLabel}</td>
                  <td className="px-3 py-2 text-gray-200">{row.rawLoadedLabel}</td>
                  <td className="px-3 py-2 text-gray-200">{row.titanReadyLabel}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-200">{row.rowsLabel}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-200">{row.warnings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ArtifactsTable({ payload }: { payload: BackOfficeTradePipelinePayload }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className={PANEL_CLASS}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-4 text-left transition-colors hover:bg-gray-900/40"
      >
        <div>
          <p className="text-sm font-semibold text-gray-200">Built Titan Artifacts</p>
          <p className="text-xs text-gray-500">
            Archived nightly Titan files from the MUFG upload telemetry.
          </p>
        </div>
      </button>
      {expanded && (
        <div className="overflow-x-auto border-t border-gray-800 px-4 pb-4 pt-3">
          <table className="w-full min-w-[960px] border-collapse text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Business Date</th>
                <th className="px-3 py-2 font-medium">Edited File</th>
                <th className="px-3 py-2 font-medium">Built At</th>
                <th className="px-3 py-2 text-right font-medium">Rows</th>
                <th className="px-3 py-2 text-right font-medium">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {payload.artifacts.map((row) => (
                <tr key={row.businessDate} className="border-t border-gray-800">
                  <td className="px-3 py-2 font-semibold text-gray-200">{row.businessDateLabel}</td>
                  <td
                    className="max-w-[320px] truncate px-3 py-2 font-mono text-[11px] text-gray-200"
                    title={row.editedFile}
                  >
                    {row.editedFile}
                  </td>
                  <td className="px-3 py-2 text-gray-200">{row.builtAtLabel}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-200">{row.rowsLabel}</td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-200">{row.warnings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ValidationChecksTable({
  checks,
  selectedKey,
  onCheckSelect,
}: {
  checks: PositionsHomeValidationCheck[];
  selectedKey: string | null;
  onCheckSelect: (check: PositionsHomeValidationCheck) => void;
}) {
  if (checks.length === 0) {
    return (
      <div className="rounded border border-gray-800 bg-[#11141d] p-3 text-sm text-gray-500">
        Clear Street trade quality checks are unavailable.
      </div>
    );
  }

  const orderedChecks = [...checks].sort((left, right) => {
    if (left.scope !== right.scope) return left.scope === "latest" ? -1 : 1;
    return left.checkId.localeCompare(right.checkId);
  });

  return (
    <div className="overflow-x-auto rounded border border-gray-800">
      <table className="min-w-[860px] w-full border-collapse text-left text-xs">
        <thead className="bg-gray-950/60 text-[10px] uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Check</th>
            <th className="px-3 py-2 font-semibold">Scope</th>
            <th className="px-3 py-2 text-right font-semibold">Rows</th>
            <th className="px-3 py-2 font-semibold">Evidence</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 text-right font-semibold">Detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {orderedChecks.map((check) => {
            const key = validationCheckKey(check);
            const selectable = canOpenValidationCheck(check);
            const selected = key === selectedKey;
            return (
              <tr
                key={key}
                onClick={selectable ? () => onCheckSelect(check) : undefined}
                className={[
                  "bg-[#11141d]",
                  selectable ? "cursor-pointer transition-colors hover:bg-gray-900" : "",
                  selected ? "bg-gray-900 outline outline-1 outline-gray-700" : "",
                ].join(" ")}
              >
                <td className="px-3 py-3 font-semibold text-gray-100">
                  {cleanValidationLabel(check.label)}
                </td>
                <td className="px-3 py-3 text-gray-400">{check.scopeLabel}</td>
                <td className="px-3 py-3 text-right font-semibold text-gray-100">
                  {validationRowsLabel(check.failingCount)}
                </td>
                <td className="max-w-[380px] break-words px-3 py-3 text-gray-400">
                  {validationEvidence(check)}
                </td>
                <td className="px-3 py-3">
                  <ValidationStatusBadge
                    label={check.statusLabel}
                    status={check.status}
                    title={check.detail}
                  />
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    disabled={!selectable}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (selectable) onCheckSelect(check);
                    }}
                    className={[
                      "h-7 rounded border px-2 text-[11px] font-semibold transition-colors",
                      selectable
                        ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
                        : "cursor-not-allowed border-gray-800 bg-gray-900 text-gray-600",
                    ].join(" ")}
                  >
                    {selectable ? "View Rows" : "None"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ValidationFailureRowsPanel({
  selectedCheck,
  detailsPayload,
  loading,
  error,
  onClose,
}: {
  selectedCheck: PositionsHomeValidationCheck | null;
  detailsPayload: PositionsHomeValidationDetailsPayload | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  if (!selectedCheck) return null;

  const rows = detailsPayload?.rows ?? [];
  const totalRows = detailsPayload?.totalRows ?? selectedCheck.failingCount ?? 0;

  return (
    <div className="mt-4 border-t border-gray-800 pt-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-100">
            {cleanValidationLabel(selectedCheck.label)}
          </h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            {selectedCheck.scopeLabel} | showing {rows.length.toLocaleString()} of{" "}
            {totalRows.toLocaleString()} row(s)
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-7 rounded border border-gray-700 bg-gray-800 px-2 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
        >
          Close
        </button>
      </div>

      {loading && (
        <div className="rounded border border-gray-800 bg-[#11141d] p-4 text-sm text-gray-400">
          Loading validation rows...
        </div>
      )}

      {error && !loading && (
        <div className="rounded border border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-200">
          Validation row query failed: {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded border border-gray-800 bg-[#11141d] p-4 text-sm text-gray-400">
          No validation rows returned.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto rounded border border-gray-800">
          <table className="min-w-[1120px] w-full border-collapse text-left text-xs">
            <thead className="bg-gray-950/60 text-[10px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Product</th>
                <th className="px-3 py-2 font-semibold">Contract</th>
                <th className="px-3 py-2 font-semibold">Route</th>
                <th className="px-3 py-2 font-semibold">Vendor Codes</th>
                <th className="px-3 py-2 font-semibold">Reason</th>
                <th className="px-3 py-2 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.map((row, index) => (
                <tr key={`${row.sourceRecordKey ?? "row"}:${index}`} className="bg-[#11141d]">
                  <td className="px-3 py-3 text-gray-300">{compactValue(row.sourceDate)}</td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-gray-100">
                      {compactValue(row.productCode)}
                    </div>
                    <div className="mt-1 max-w-[260px] break-words text-gray-500">
                      {compactValue(row.sourceProduct)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-gray-300">
                    {contractLabel(row) || "--"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-gray-300">
                      {compactValue(row.routeFamily)}
                    </div>
                    <div className="mt-1 text-gray-500">{compactValue(row.routeExchange)}</div>
                  </td>
                  <td className="max-w-[260px] break-words px-3 py-3 text-gray-300">
                    {vendorCodesLabel(row) || "--"}
                  </td>
                  <td className="px-3 py-3 font-semibold text-gray-200">
                    {compactValue(row.failureReason)}
                  </td>
                  <td className="max-w-[280px] break-words px-3 py-3 text-gray-500">
                    {sourceLabel(row) || compactValue(row.sourceContext)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TradeQualityPanel({
  validationPayload,
  validationLoading,
  validationError,
  refreshNonce,
}: {
  validationPayload: PositionsHomeValidationPayload | null;
  validationLoading: boolean;
  validationError: string | null;
  refreshNonce: number;
}) {
  const [open, setOpen] = useState(true);
  const [selectedValidationKey, setSelectedValidationKey] = useState<string | null>(null);
  const [detailsPayload, setDetailsPayload] =
    useState<PositionsHomeValidationDetailsPayload | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const clearStreetChecks = clearStreetValidationChecks(validationPayload);
  const selectedCheck =
    clearStreetChecks.find((check) => validationCheckKey(check) === selectedValidationKey) ??
    null;
  const summary = tradePipelineValidationSummary({
    checks: clearStreetChecks,
    loading: validationLoading,
    error: validationError,
    payload: validationPayload,
  });
  const validationStateLabel = validationLoading
    ? "Loading"
    : validationError
      ? "Unavailable"
      : validationPayload?.cacheStatus === "stale"
        ? `Stale ${fmtDateTime(validationPayload.validatedAt)}`
        : validationPayload
          ? `${validationPayload.cacheStatus === "hit" ? "Cached" : "Fresh"} ${fmtDateTime(validationPayload.validatedAt)}`
          : "Deferred";

  useEffect(() => {
    if (!selectedValidationKey) return;
    if (!selectedCheck || !canOpenValidationCheck(selectedCheck)) {
      setSelectedValidationKey(null);
      setDetailsPayload(null);
      setDetailsError(null);
    }
  }, [selectedCheck, selectedValidationKey]);

  useEffect(() => {
    if (!selectedCheck) {
      setDetailsLoading(false);
      setDetailsPayload(null);
      setDetailsError(null);
      return;
    }

    let active = true;
    const forceRefresh = refreshNonce > 0;

    setDetailsLoading(true);
    setDetailsError(null);
    setDetailsPayload(null);

    fetchJsonWithCache<PositionsHomeValidationDetailsPayload>({
      key: `backoffice-trade-pipeline:validation-details:${selectedCheck.scope}:${selectedCheck.checkId}`,
      url: validationDetailsApiUrl(selectedCheck, refreshNonce),
      ttlMs: VALIDATION_API_CACHE_TTL_MS,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
      persist: "session",
    })
      .then((nextPayload) => {
        if (!active) return;
        setDetailsPayload(nextPayload);
      })
      .catch((err: Error) => {
        if (!active) return;
        setDetailsError(err.message || "Failed to load validation rows");
      })
      .finally(() => {
        if (active) setDetailsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshNonce, selectedCheck]);

  return (
    <section className={PANEL_CLASS}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-wrap items-start justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-gray-900/40"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-200">Trade Quality Checks</p>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-gray-500">
            Clear Street product matching and MUFG vendor-code checks from the promoted
            Positions &amp; Trades validation contract.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ValidationStatusBadge label={summary.label} status={summary.status} />
          <span className="text-[11px] font-semibold text-gray-500">
            {validationStateLabel}
          </span>
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-800 px-4 pb-4 pt-3">
          <div className="mb-3 rounded border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-300">
            {summary.detail}
          </div>
          <ValidationChecksTable
            checks={clearStreetChecks}
            selectedKey={selectedValidationKey}
            onCheckSelect={(check) => setSelectedValidationKey(validationCheckKey(check))}
          />
          <ValidationFailureRowsPanel
            selectedCheck={selectedCheck}
            detailsPayload={detailsPayload}
            loading={detailsLoading}
            error={detailsError}
            onClose={() => setSelectedValidationKey(null)}
          />
          {validationError && (
            <p className="mt-2 text-xs leading-5 text-orange-200">
              Validation query failed: {validationError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default function BackOfficeTradePipeline() {
  const [payload, setPayload] = useState<BackOfficeTradePipelinePayload | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationPayload, setValidationPayload] =
    useState<PositionsHomeValidationPayload | null>(null);
  const [validationLoading, setValidationLoading] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

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

    fetchJsonWithCache<BackOfficeTradePipelinePayload>({
      key: `backoffice-trade-pipeline:${url}`,
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
        setError(err.message || "Failed to load Trade Pipeline");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshNonce, url]);

  useEffect(() => {
    let active = true;

    setValidationLoading(true);
    setValidationError(null);

    fetchJsonWithCache<PositionsHomeValidationPayload>({
      key: "backoffice-trade-pipeline:clear-street-validation",
      url: validationApiUrl(0),
      ttlMs: VALIDATION_API_CACHE_TTL_MS,
      persist: "session",
    })
      .then((nextPayload) => {
        if (!active) return;
        setValidationPayload(nextPayload);
      })
      .catch((err: Error) => {
        if (!active) return;
        setValidationError(err.message || "Failed to load trade quality checks");
      })
      .finally(() => {
        if (active) setValidationLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading && !payload) return <LoadingState />;
  if (error && !payload) {
    return <ErrorState error={error} onRetry={() => setRefreshNonce((value) => value + 1)} />;
  }
  if (!payload) return null;

  return (
    <div className="space-y-4">
      <TradePipelineTopPanel payload={payload} />

      {error && (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-200">
          Refresh failed; showing cached data. {error}
        </div>
      )}

      <WatchPanel payload={payload} />
      <MonitoringTable payload={payload} />
      <ArtifactsTable payload={payload} />
      <TradeQualityPanel
        validationPayload={validationPayload}
        validationLoading={validationLoading}
        validationError={validationError}
        refreshNonce={refreshNonce}
      />
      <ClearStreetTrades
        refreshToken={refreshNonce}
        initialAccounts={TITAN_ACCOUNT_FILTER}
        title="Clear Street Trades"
        tableTitle="Clear Street Trade Summary"
      />
    </div>
  );
}
