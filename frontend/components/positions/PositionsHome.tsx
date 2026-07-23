"use client";

import { useEffect, useState } from "react";

import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import type {
  PositionsHomeFeedStatus,
  PositionsHomeFeedSourceRow,
  PositionsHomePayload,
  PositionsHomeStatus,
  PositionsHomeValidationCheck,
  PositionsHomeValidationDetailsPayload,
  PositionsHomeValidationFailureRow,
  PositionsHomeValidationPayload,
} from "@/lib/positionsAndTrades/positionsHomeTypes";

export interface PositionsHomeFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface PositionsHomeProps {
  refreshToken: number;
  onFreshnessChange?: (freshness: PositionsHomeFreshnessSummary) => void;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const VALIDATION_API_CACHE_TTL_MS = 15 * 60 * 1000;
const POSITIONS_HOME_API_PATH = "/api/positions-home";
const POSITIONS_HOME_VALIDATION_API_PATH = "/api/positions-home/validation";
const POSITIONS_HOME_VALIDATION_DETAILS_API_PATH =
  "/api/positions-home/validation/details";
const DEFAULT_FRESHNESS: PositionsHomeFreshnessSummary = {
  status: "Unknown",
  statusClass: "border-gray-700 bg-gray-900 text-gray-400",
  summary: "Positions health --",
  targetDateLabel: "--",
  latestDateLabel: "--",
  latestUpdateLabel: "--",
};

const STATUS_CLASS: Record<PositionsHomeStatus, string> = {
  stable: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  not_applicable: "border-gray-700 bg-gray-900 text-gray-400",
  watch: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
  stale: "border-orange-500/40 bg-orange-500/10 text-orange-200",
  missing: "border-red-500/40 bg-red-500/10 text-red-200",
  needs_repair: "border-orange-500/40 bg-orange-500/10 text-orange-200",
  error: "border-red-500/40 bg-red-500/10 text-red-200",
};

function fmtDateTime(value: string | null): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function freshnessFromPayload(
  payload: PositionsHomePayload | null,
): PositionsHomeFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  const stableFeeds = payload.feeds.filter((feed) => feed.status === "stable").length;
  return {
    status: payload.overallStatusLabel,
    statusClass: STATUS_CLASS[payload.overallStatus],
    summary: payload.summary,
    targetDateLabel: payload.reviewDate,
    latestDateLabel: `${stableFeeds}/${payload.feeds.length} feeds current`,
    latestUpdateLabel: fmtDateTime(payload.generatedAt),
  };
}

function positionsHomeApiUrl(businessDate: string, refreshToken: number): string {
  const params = new URLSearchParams();
  if (businessDate) params.set("businessDate", businessDate);
  if (refreshToken > 0) params.set("refresh", String(refreshToken));
  const queryString = params.toString();
  return queryString ? `${POSITIONS_HOME_API_PATH}?${queryString}` : POSITIONS_HOME_API_PATH;
}

function positionsHomeValidationApiUrl(refreshToken: number): string {
  if (refreshToken <= 0) return POSITIONS_HOME_VALIDATION_API_PATH;
  return `${POSITIONS_HOME_VALIDATION_API_PATH}?refresh=${refreshToken}`;
}

function positionsHomeValidationDetailsApiUrl(
  check: PositionsHomeValidationCheck,
  refreshToken: number,
): string {
  const params = new URLSearchParams({
    scope: check.scope,
    checkId: check.checkId,
    limit: "100",
  });
  if (refreshToken > 0) params.set("refresh", String(refreshToken));
  return `${POSITIONS_HOME_VALIDATION_DETAILS_API_PATH}?${params.toString()}`;
}

function StatusBadge({
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
      className={`inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${title ? "cursor-help" : ""} ${STATUS_CLASS[status]}`}
    >
      {label}
    </span>
  );
}

function SourceRowsTable({ rows }: { rows: PositionsHomeFeedSourceRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="mt-4 overflow-x-auto rounded-md border border-gray-800">
      <table className="min-w-[560px] w-full border-collapse text-left text-xs">
        <thead className="bg-gray-950/60 text-[10px] uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Source</th>
            <th className="px-3 py-2 font-semibold">Latest Date</th>
            <th className="px-3 py-2 font-semibold">Loaded</th>
            <th className="px-3 py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {rows.map((row) => (
            <tr key={row.source} className="bg-[#11141d]">
              <td className="px-3 py-2 font-semibold text-gray-100">{row.source}</td>
              <td className="px-3 py-2 text-gray-300">{row.latestDateLabel}</td>
              <td className="px-3 py-2 text-gray-300">{row.loadedLabel}</td>
              <td className="px-3 py-2">
                <StatusBadge
                  label={row.statusLabel}
                  status={row.status}
                  title={row.detail}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeedCard({
  feed,
}: {
  feed: PositionsHomeFeedStatus;
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-4 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            {feed.manual ? "Manual Source" : "Scheduled Source"}
          </p>
          <h2 className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-base font-semibold text-gray-100">
            <span className="break-words">{feed.label}</span>
            <span className="text-xs font-normal text-gray-500">
              | {feed.sourceTable}
            </span>
          </h2>
          <p className="mt-2 max-w-xl text-xs leading-5 text-gray-500">
            {feed.detail}
          </p>
        </div>
        {feed.status !== "stable" && (
          <StatusBadge label={feed.statusLabel} status={feed.status} title={feed.detail} />
        )}
      </div>
      <SourceRowsTable rows={feed.sourceRows} />
    </section>
  );
}

function ReviewDateControl({
  payload,
  businessDate,
  onBusinessDateChange,
}: {
  payload: PositionsHomePayload;
  businessDate: string;
  onBusinessDateChange: (value: string) => void;
}) {
  const displayedDate = businessDate || payload.reviewDate;
  const usingLatestDue = businessDate === "";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="positions-home-business-date"
          className="text-[10px] font-bold uppercase tracking-wider text-gray-500"
        >
          Business Date
        </label>
        <input
          id="positions-home-business-date"
          type="date"
          value={displayedDate}
          max={payload.localDate}
          onChange={(event) => onBusinessDateChange(event.target.value)}
          className="h-8 rounded-md border border-gray-700 bg-[#12141d] px-2 text-xs font-semibold text-gray-200 outline-none transition-colors hover:border-gray-600 focus:border-gray-500"
        />
        <span className="text-xs text-gray-500">
          {usingLatestDue ? "Latest due" : "Exact date"}
        </span>
      </div>
      {!usingLatestDue && (
        <button
          type="button"
          onClick={() => onBusinessDateChange("")}
          className="h-8 rounded-md border border-gray-700 bg-gray-800 px-3 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
        >
          Latest Due
        </button>
      )}
    </div>
  );
}

function validationMeta(check: PositionsHomeValidationCheck): string {
  if (check.failingCount === null) return "Awaiting live validation";
  if (check.failingCount === 0) return "No failing rows";
  const observedRange =
    check.firstObservedDate && check.lastObservedDate
      ? check.firstObservedDate === check.lastObservedDate
        ? check.firstObservedDate
        : `${check.firstObservedDate} to ${check.lastObservedDate}`
      : "--";
  const topGroup = [
    check.sampleProductCode,
    check.sampleProductGrouping,
    check.sampleRouteFamily,
  ]
    .filter(Boolean)
    .join(" / ");

  return `${topGroup || "Top group --"} | ${observedRange}`;
}

function validationCheckKey(check: PositionsHomeValidationCheck): string {
  return `${check.scope}:${check.checkId}`;
}

function canOpenValidationCheck(check: PositionsHomeValidationCheck): boolean {
  return (check.failingCount ?? 0) > 0;
}

function ModelValidationRows({
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
      <div className="rounded-md border border-gray-800 bg-[#11141d] p-4 text-sm text-gray-400">
        Model validation checks are unavailable.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-gray-800">
      <table className="min-w-[760px] w-full border-collapse text-left text-xs">
        <thead className="bg-gray-950/60 text-[10px] uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Check</th>
            <th className="px-3 py-2 font-semibold">Source</th>
            <th className="px-3 py-2 font-semibold">Severity</th>
            <th className="px-3 py-2 text-right font-semibold">Rows</th>
            <th className="px-3 py-2 font-semibold">Top Group</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 text-right font-semibold">Detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {checks.map((check) => {
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
                <td className="px-3 py-3 font-semibold text-gray-100">{check.label}</td>
                <td className="px-3 py-3 text-gray-300">{check.sourceSystem}</td>
                <td className="px-3 py-3 uppercase text-gray-400">{check.severity}</td>
                <td className="px-3 py-3 text-right font-semibold text-gray-100">
                  {check.failingCountLabel}
                </td>
                <td className="px-3 py-3 text-gray-400" title={check.detail}>
                  {validationMeta(check)}
                </td>
                <td className="px-3 py-3">
                  <StatusBadge
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
                      "h-7 rounded-md border px-2 text-[11px] font-semibold transition-colors",
                      selectable
                        ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
                        : "cursor-not-allowed border-gray-800 bg-gray-900 text-gray-600",
                    ].join(" ")}
                  >
                    {selectable ? "View" : "None"}
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

function ModelValidationSection({
  title,
  checks,
  selectedKey,
  onCheckSelect,
}: {
  title: string;
  checks: PositionsHomeValidationCheck[];
  selectedKey: string | null;
  onCheckSelect: (check: PositionsHomeValidationCheck) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-gray-300">{title}</h3>
        <span className="text-[11px] font-semibold text-gray-500">
          {checks.length} check{checks.length === 1 ? "" : "s"}
        </span>
      </div>
      <ModelValidationRows
        checks={checks}
        selectedKey={selectedKey}
        onCheckSelect={onCheckSelect}
      />
    </div>
  );
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
    row.vendorCmeCode ? `CME ${row.vendorCmeCode}` : null,
    row.vendorBbgCode ? `BBG ${row.vendorBbgCode}` : null,
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

function ModelValidationDetails({
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
    <div className="border-t border-gray-800 pt-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-100">{selectedCheck.label}</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            {selectedCheck.scopeLabel} | showing {rows.length.toLocaleString()} of{" "}
            {totalRows.toLocaleString()} row(s)
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-7 rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
        >
          Close
        </button>
      </div>

      {loading && (
        <div className="rounded-md border border-gray-800 bg-[#11141d] p-4 text-sm text-gray-400">
          Loading validation detail...
        </div>
      )}

      {error && !loading && (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-200">
          Validation detail query failed: {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-md border border-gray-800 bg-[#11141d] p-4 text-sm text-gray-400">
          No failure rows returned.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-gray-800">
          <table className="min-w-[1040px] w-full border-collapse text-left text-xs">
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
                    <div className="mt-1 max-w-[240px] break-words text-gray-500">
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
                  <td className="px-3 py-3 max-w-[260px] break-words text-gray-300">
                    {vendorCodesLabel(row) || "--"}
                  </td>
                  <td className="px-3 py-3 font-semibold text-gray-200">
                    {compactValue(row.failureReason)}
                  </td>
                  <td className="px-3 py-3 max-w-[260px] break-words text-gray-500">
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

interface ModelValidationSummary {
  status: PositionsHomeStatus;
  statusLabel: string;
  summary: string;
}

function modelValidationSummary({
  checks,
  validationLoading,
  validationError,
  validationPayload,
}: {
  checks: PositionsHomeValidationCheck[];
  validationLoading: boolean;
  validationError: string | null;
  validationPayload: PositionsHomeValidationPayload | null;
}): ModelValidationSummary {
  const latestChecks = checks.filter((check) => check.scope === "latest");
  const summaryChecks = latestChecks.length > 0 ? latestChecks : checks;

  if (summaryChecks.length === 0) {
    return {
      status: validationError ? "error" : "not_applicable",
      statusLabel: validationError ? "Unavailable" : "Loading",
      summary: validationError
        ? "Model validation could not run."
        : "Model validation is loading.",
    };
  }

  const liveChecks = summaryChecks.filter((check) => check.failingCount !== null);
  if (liveChecks.length === 0) {
    return {
      status: validationLoading || !validationPayload ? "not_applicable" : "error",
      statusLabel: validationLoading || !validationPayload ? "Loading" : "Unavailable",
      summary: validationLoading || !validationPayload
        ? "Model validation is loading."
        : "Model validation could not run.",
    };
  }

  const hardFailureCount = liveChecks.filter(
    (check) => check.severity === "error" && check.failingCount !== null && check.failingCount > 0,
  ).length;
  const warningRowCount = liveChecks
    .filter((check) => check.severity === "warn")
    .reduce((total, check) => total + (check.failingCount ?? 0), 0);

  if (hardFailureCount > 0) {
    return {
      status: "needs_repair",
      statusLabel: "Fail",
      summary: `${hardFailureCount} latest-file product-matching check(s) failed.`,
    };
  }

  if (warningRowCount > 0) {
    return {
      status: "watch",
      statusLabel: "Warnings",
      summary: `Latest-file product matching passed; ${warningRowCount.toLocaleString()} latest vendor-code warning row(s) found.`,
    };
  }

  return {
    status: "stable",
    statusLabel: "Pass",
    summary: "Latest-file product matching and vendor-code checks passed.",
  };
}

function ModelValidationPanel({
  payload,
  validationPayload,
  validationLoading,
  validationError,
  refreshToken,
}: {
  payload: PositionsHomePayload;
  validationPayload: PositionsHomeValidationPayload | null;
  validationLoading: boolean;
  validationError: string | null;
  refreshToken: number;
}) {
  const validationChecks = validationPayload?.checks ?? payload.reference.validationChecks;
  const latestChecks = validationChecks.filter((check) => check.scope === "latest");
  const allHistoryChecks = validationChecks.filter((check) => check.scope === "all_history");
  const hasScopedLatestChecks = latestChecks.length > 0;
  const primaryChecks = hasScopedLatestChecks ? latestChecks : validationChecks;
  const [selectedValidationKey, setSelectedValidationKey] = useState<string | null>(null);
  const [detailsPayload, setDetailsPayload] =
    useState<PositionsHomeValidationDetailsPayload | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const selectedCheck =
    validationChecks.find((check) => validationCheckKey(check) === selectedValidationKey) ?? null;
  const selectedScope = selectedCheck?.scope ?? null;
  const selectedCheckId = selectedCheck?.checkId ?? null;
  const validationSummary = modelValidationSummary({
    checks: validationChecks,
    validationLoading,
    validationError,
    validationPayload,
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
    }
  }, [selectedCheck, selectedValidationKey]);

  useEffect(() => {
    if (!selectedCheck || !selectedScope || !selectedCheckId) {
      setDetailsLoading(false);
      setDetailsError(null);
      return;
    }

    let active = true;
    const forceRefresh = refreshToken > 0;

    setDetailsLoading(true);
    setDetailsError(null);
    setDetailsPayload(null);

    fetchJsonWithCache<PositionsHomeValidationDetailsPayload>({
      key: `positions-home:validation-details:${selectedScope}:${selectedCheckId}`,
      url: positionsHomeValidationDetailsApiUrl(selectedCheck, refreshToken),
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
        setDetailsError(err.message || "Failed to load validation detail");
      })
      .finally(() => {
        if (active) setDetailsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshToken, selectedCheck, selectedCheckId, selectedScope]);

  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-100">Model Validation</h2>
          <p className="mt-1 text-xs leading-5 text-gray-500">{validationSummary.summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <StatusBadge label={validationSummary.statusLabel} status={validationSummary.status} />
          <span className="text-[11px] font-semibold text-gray-500">{validationStateLabel}</span>
        </div>
      </div>
      <div className="space-y-4">
        <ModelValidationSection
          title={hasScopedLatestChecks ? "Latest Files" : "Validation Checks"}
          checks={primaryChecks}
          selectedKey={selectedValidationKey}
          onCheckSelect={(check) => setSelectedValidationKey(validationCheckKey(check))}
        />
        {hasScopedLatestChecks && allHistoryChecks.length > 0 && (
          <ModelValidationSection
            title="All History"
            checks={allHistoryChecks}
            selectedKey={selectedValidationKey}
            onCheckSelect={(check) => setSelectedValidationKey(validationCheckKey(check))}
          />
        )}
        <ModelValidationDetails
          selectedCheck={selectedCheck}
          detailsPayload={detailsPayload}
          loading={detailsLoading}
          error={detailsError}
          onClose={() => setSelectedValidationKey(null)}
        />
      </div>
      {validationError && (
        <p className="mt-2 text-xs leading-5 text-orange-200">
          Model validation query failed: {validationError}
        </p>
      )}
    </section>
  );
}

export default function PositionsHome({
  refreshToken,
  onFreshnessChange,
}: PositionsHomeProps) {
  const [payload, setPayload] = useState<PositionsHomePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [businessDate, setBusinessDate] = useState("");
  const [validationPayload, setValidationPayload] =
    useState<PositionsHomeValidationPayload | null>(null);
  const [validationLoading, setValidationLoading] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const url = positionsHomeApiUrl(businessDate, refreshToken);

    fetchJsonWithCache<PositionsHomePayload>({
      key: `positions-home:${businessDate || "latest"}`,
      url,
      ttlMs: API_CACHE_TTL_MS,
      cacheMode: refreshToken > 0 ? "no-store" : "default",
      forceRefresh: refreshToken > 0,
      persist: "session",
    })
      .then((nextPayload) => {
        if (!active) return;
        setPayload(nextPayload);
        onFreshnessChange?.(freshnessFromPayload(nextPayload));
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setPayload(null);
        setError(err.message || "Failed to load positions health");
        onFreshnessChange?.({
          status: "Error",
          statusClass: STATUS_CLASS.error,
          summary: "Positions health query failed",
          targetDateLabel: "--",
          latestDateLabel: "--",
          latestUpdateLabel: "--",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [businessDate, onFreshnessChange, refreshToken]);

  useEffect(() => {
    let active = true;
    const forceRefresh = refreshToken > 0;

    setValidationLoading(true);
    setValidationError(null);

    fetchJsonWithCache<PositionsHomeValidationPayload>({
      key: "positions-home:validation",
      url: positionsHomeValidationApiUrl(refreshToken),
      ttlMs: VALIDATION_API_CACHE_TTL_MS,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
      persist: "session",
    })
      .then((nextPayload) => {
        if (!active) return;
        setValidationPayload(nextPayload);
      })
      .catch((err: Error) => {
        if (!active) return;
        setValidationError(err.message || "Failed to load model validation");
      })
      .finally(() => {
        if (active) setValidationLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshToken]);

  if (loading && !payload) {
    return (
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-400">
        Loading positions health...
      </section>
    );
  }

  if (error && !payload) {
    return (
      <section className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
        {error}
      </section>
    );
  }

  if (!payload) return null;

  return (
    <div className="space-y-4">
      <ReviewDateControl
        payload={payload}
        businessDate={businessDate}
        onBusinessDateChange={setBusinessDate}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        {payload.feeds.map((feed) => (
          <FeedCard
            key={feed.id}
            feed={feed}
          />
        ))}
      </div>

      <ModelValidationPanel
        payload={payload}
        validationPayload={validationPayload}
        validationLoading={validationLoading}
        validationError={validationError}
        refreshToken={refreshToken}
      />
    </div>
  );
}
