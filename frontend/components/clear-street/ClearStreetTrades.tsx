"use client";

import { useEffect, useMemo, useState } from "react";

import DashboardTabs from "@/components/dashboard/DashboardTabs";
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

type ReviewStatus = "matched" | "vendor_warning" | "needs_review";
type CellValue = string | number | boolean | null;
type ViewMode = "latest" | "review" | "history" | "raw";

interface ReviewSummary {
  rowCount: number;
  signatureCount: number;
  matchedRowCount: number;
  vendorWarningRowCount: number;
  needsReviewRowCount: number;
  newSignatureCount: number;
  historicalSignatureCount: number;
}

interface HistorySummary {
  rowCount: number;
  signatureCount: number;
  matchedRowCount: number;
  vendorWarningRowCount: number;
  needsReviewRowCount: number;
  historyRowCap: number | null;
  historyRowLimitReached: boolean;
}

interface SignatureSummary {
  signatureKey: string;
  sourceProduct: string | null;
  exchangeCodeInput: string | null;
  exchangeNameInput: string | null;
  putCall: string | null;
  securityType: string | null;
  productCode: string | null;
  productGroup: string | null;
  productRegion: string | null;
  status: ReviewStatus;
  reviewReason: string;
  firstSeenDate: string | null;
  lastSeenDate: string | null;
  latestRowCount: number;
  priorRowCount: number;
  historyRowCount: number;
  latestNetQuantity: number;
  historyNetQuantity: number;
  matchedRowCount: number;
  vendorWarningRowCount: number;
  needsReviewRowCount: number;
  accounts: string[];
  sampleRows: Array<Record<string, CellValue>>;
}

interface ClearStreetTradesPayload {
  source: string;
  ruleEngine: string;
  rulesSource: string;
  promotedSql: string;
  compiledSql: string;
  nullCheckCriteria: string;
  latestSftpDate: string | null;
  latestUploadAt: string | null;
  requestedLimit: number;
  search: string | null;
  rowCount: number;
  returnedRowCount: number;
  latestSummary: ReviewSummary;
  historySummary: HistorySummary;
  latestSignatures: SignatureSummary[];
  reviewSignatures: SignatureSummary[];
  historySignatures: SignatureSummary[];
  columns: string[];
  rows: Array<Record<string, CellValue>>;
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

function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function fmtQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : 4;
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function fmtCell(value: CellValue | undefined): string {
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

function statusLabel(status: ReviewStatus): string {
  if (status === "needs_review") return "Needs Review";
  if (status === "vendor_warning") return "Warning";
  return "Matched";
}

function statusTone(status: ReviewStatus): "good" | "warn" | "bad" {
  if (status === "needs_review") return "bad";
  if (status === "vendor_warning") return "warn";
  return "good";
}

function freshnessFromPayload(payload: ClearStreetTradesPayload | null): ClearStreetTradesFreshnessSummary {
  if (!payload) return DEFAULT_FRESHNESS;
  const latest = payload.latestSummary;
  const hasRows = latest.rowCount > 0;
  if (!hasRows) {
    return {
      status: "No Data",
      statusClass: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
      summary: "Trades | 0 rows",
      targetDateLabel: "Latest file",
      latestDateLabel: "--",
      latestUpdateLabel: fmtDateTime(payload.latestUploadAt),
    };
  }
  if (latest.needsReviewRowCount > 0) {
    return {
      status: "Needs Review",
      statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
      summary: `Trades | ${latest.needsReviewRowCount.toLocaleString()} rows need review | ${fmtDate(payload.latestSftpDate)}`,
      targetDateLabel: "Latest file",
      latestDateLabel: fmtDate(payload.latestSftpDate),
      latestUpdateLabel: fmtDateTime(payload.latestUploadAt),
    };
  }
  if (latest.vendorWarningRowCount > 0) {
    return {
      status: "Warning",
      statusClass: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
      summary: `Trades | ${latest.vendorWarningRowCount.toLocaleString()} warning rows | ${fmtDate(payload.latestSftpDate)}`,
      targetDateLabel: "Latest file",
      latestDateLabel: fmtDate(payload.latestSftpDate),
      latestUpdateLabel: fmtDateTime(payload.latestUploadAt),
    };
  }

  return {
    status: "All Mapped",
    statusClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    summary: `Trades | ${latest.rowCount.toLocaleString()} rows | ${latest.signatureCount.toLocaleString()} signatures`,
    targetDateLabel: "Latest file",
    latestDateLabel: fmtDate(payload.latestSftpDate),
    latestUpdateLabel: fmtDateTime(payload.latestUploadAt),
  };
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  const className =
    tone === "good"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
        ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
        : tone === "bad"
          ? "border-red-500/40 bg-red-500/10 text-red-200"
          : "border-gray-700 bg-gray-900 text-gray-400";
  return (
    <span className={`max-w-full break-all rounded-md border px-2.5 py-1 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/30"
      : tone === "warn"
        ? "border-yellow-500/30"
        : tone === "bad"
          ? "border-red-500/30"
          : "border-gray-800";
  return (
    <div className={`rounded-lg border ${toneClass} bg-[#0d1119] px-3 py-2`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-100">{value}</div>
      <div className="mt-0.5 text-xs text-gray-500">{detail}</div>
    </div>
  );
}

function signatureSearchText(signature: SignatureSummary): string {
  return [
    signature.sourceProduct,
    signature.exchangeCodeInput,
    signature.exchangeNameInput,
    signature.putCall,
    signature.securityType,
    signature.productCode,
    signature.productGroup,
    signature.productRegion,
    signature.accounts.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function signatureMatchesSearch(signature: SignatureSummary, search: string): boolean {
  const needle = search.trim().toLowerCase();
  return !needle || signatureSearchText(signature).includes(needle);
}

function HistoryBadge({ signature }: { signature: SignatureSummary }) {
  if (signature.priorRowCount === 0) {
    return <StatusBadge label="New" tone="warn" />;
  }
  return <StatusBadge label={`Seen ${signature.priorRowCount.toLocaleString()}`} tone="neutral" />;
}

function SignatureTable({
  signatures,
  emptyMessage,
  mode,
}: {
  signatures: SignatureSummary[];
  emptyMessage: string;
  mode: "latest" | "history" | "review";
}) {
  return (
    <table className="w-full min-w-[1120px] border-collapse bg-[#0d1119] text-xs text-gray-200">
      <thead className="sticky top-0 z-30 bg-gray-950 text-gray-500">
        <tr>
          {[
            "Status",
            "Source Product",
            "Input Code",
            "Mapped",
            "Latest Rows",
            "Prior Rows",
            "Net Qty",
            "History",
            "Accounts",
            "Reason",
          ].map((label, index) => (
            <th
              key={label}
              className={`px-3 py-2 text-right font-semibold uppercase tracking-wide first:text-left ${
                index === 1 ? "min-w-[320px] text-left" : ""
              }`}
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-800">
        {signatures.map((signature) => (
          <tr
            key={`${mode}-${signature.signatureKey}`}
            className={signature.status === "needs_review" ? "bg-red-500/[0.04] hover:bg-red-500/[0.08]" : "hover:bg-gray-900/60"}
          >
            <td className="px-3 py-2 text-left">
              <StatusBadge label={statusLabel(signature.status)} tone={statusTone(signature.status)} />
            </td>
            <td className="max-w-[420px] px-3 py-2 text-left">
              <div className="truncate font-semibold text-gray-100" title={signature.sourceProduct ?? "-"}>
                {signature.sourceProduct ?? "-"}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-gray-500">
                {[
                  signature.exchangeNameInput,
                  signature.securityType,
                  signature.putCall,
                ]
                  .filter(Boolean)
                  .join(" | ") || "-"}
              </div>
            </td>
            <td className="px-3 py-2 text-right font-semibold text-gray-100">
              {signature.exchangeCodeInput ?? "-"}
            </td>
            <td className="px-3 py-2 text-right">
              <div className="font-semibold text-gray-100">{signature.productCode ?? "-"}</div>
              <div className="mt-0.5 text-[11px] text-gray-500">
                {[signature.productGroup, signature.productRegion].filter(Boolean).join(" | ") || "-"}
              </div>
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {signature.latestRowCount.toLocaleString()}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {signature.priorRowCount.toLocaleString()}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              {fmtQuantity(mode === "history" ? signature.historyNetQuantity : signature.latestNetQuantity)}
            </td>
            <td className="px-3 py-2 text-right">
              <div className="flex justify-end">
                <HistoryBadge signature={signature} />
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                {fmtDate(signature.firstSeenDate)} to {fmtDate(signature.lastSeenDate)}
              </div>
            </td>
            <td className="max-w-[160px] truncate px-3 py-2 text-right" title={signature.accounts.join(", ")}>
              {signature.accounts.join(", ") || "-"}
            </td>
            <td className="max-w-[260px] truncate px-3 py-2 text-right text-gray-400" title={signature.reviewReason}>
              {signature.reviewReason}
            </td>
          </tr>
        ))}
        {!signatures.length && (
          <tr>
            <td colSpan={10} className="px-3 py-10 text-center text-sm text-gray-500">
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    </table>
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
  const [viewMode, setViewMode] = useState<ViewMode>("latest");
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
          targetDateLabel: search || "Latest file",
          latestDateLabel: "--",
          latestUpdateLabel: "--",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [limit, onFreshnessChange, refreshToken, search]);

  const latestSignatures = useMemo(
    () => (data?.latestSignatures ?? []).filter((signature) => signatureMatchesSearch(signature, search)),
    [data, search],
  );

  const reviewSignatures = useMemo(
    () => (data?.reviewSignatures ?? []).filter((signature) => signatureMatchesSearch(signature, search)),
    [data, search],
  );

  const historySignatures = useMemo(
    () => (data?.historySignatures ?? []).filter((signature) => signatureMatchesSearch(signature, search)),
    [data, search],
  );

  const returnedLabel = useMemo(() => {
    if (!data) return "0 raw rows";
    if (data.returnedRowCount === data.rowCount) {
      return `${data.returnedRowCount.toLocaleString()} raw rows`;
    }
    return `${data.returnedRowCount.toLocaleString()} of ${data.rowCount.toLocaleString()} raw rows`;
  }, [data]);

  const submitSearch = () => setSearch(searchInput.trim());
  const latest = data?.latestSummary;
  const history = data?.historySummary;

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
              placeholder="Product, code, account, broker"
              className={FIELD_CONTROL_CLASS}
            />
          </label>
          <label className="block min-w-0">
            <span className={FIELD_LABEL_CLASS}>Raw Rows</span>
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
          <StatusBadge
            label={`Latest file ${fmtDate(data?.latestSftpDate)}`}
            tone={data?.latestSummary.needsReviewRowCount ? "bad" : "good"}
          />
          <StatusBadge label={`Upload ${fmtDateTime(data?.latestUploadAt)}`} tone="neutral" />
          <StatusBadge label={`Review ${fmtNumber(latest?.needsReviewRowCount)}`} tone={latest?.needsReviewRowCount ? "bad" : "good"} />
          <StatusBadge label={`New signatures ${fmtNumber(latest?.newSignatureCount)}`} tone={latest?.newSignatureCount ? "warn" : "neutral"} />
          <StatusBadge label={returnedLabel} tone={data?.rowCount ? "good" : "warn"} />
          <StatusBadge label={data?.promotedSql ?? "promoted dbt SQL"} tone="neutral" />
        </div>

        {data && (
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Latest Rows"
              value={data.latestSummary.rowCount.toLocaleString()}
              detail={`${data.latestSummary.signatureCount.toLocaleString()} signatures`}
              tone={data.latestSummary.rowCount ? "good" : "warn"}
            />
            <MetricCard
              label="Needs Review"
              value={data.latestSummary.needsReviewRowCount.toLocaleString()}
              detail={`${data.latestSummary.vendorWarningRowCount.toLocaleString()} warning rows`}
              tone={data.latestSummary.needsReviewRowCount ? "bad" : "good"}
            />
            <MetricCard
              label="New Signatures"
              value={data.latestSummary.newSignatureCount.toLocaleString()}
              detail={`${data.latestSummary.historicalSignatureCount.toLocaleString()} seen before`}
              tone={data.latestSummary.newSignatureCount ? "warn" : "neutral"}
            />
            <MetricCard
              label="History"
              value={data.historySummary.signatureCount.toLocaleString()}
              detail={`${data.historySummary.rowCount.toLocaleString()} rows${data.historySummary.historyRowLimitReached ? " capped" : ""}`}
              tone={data.historySummary.historyRowLimitReached ? "warn" : "neutral"}
            />
          </div>
        )}

        <DashboardTabs<ViewMode>
          className="mt-4"
          ariaLabel="Clear Street trade review views"
          activeValue={viewMode}
          onChange={setViewMode}
          tabs={[
            { value: "latest", label: `Latest Review (${fmtNumber(latest?.signatureCount)})` },
            { value: "review", label: `Review Items (${fmtNumber(data?.reviewSignatures.length)})` },
            { value: "history", label: `All History (${fmtNumber(history?.signatureCount)})` },
            { value: "raw", label: "Raw Rows" },
          ]}
        />
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

      {data && !loading && viewMode === "latest" && (
        <DataTableShell
          title="Latest File Review"
          subtitle={`${fmtDate(data.latestSftpDate)} | ${latestSignatures.length.toLocaleString()} of ${data.latestSignatures.length.toLocaleString()} signatures shown.`}
          bodyClassName="max-h-[70vh] overflow-auto"
        >
          <SignatureTable
            mode="latest"
            signatures={latestSignatures}
            emptyMessage="No latest-file signatures matched the current search."
          />
        </DataTableShell>
      )}

      {data && !loading && viewMode === "review" && (
        <DataTableShell
          title="Review Items"
          subtitle={`${reviewSignatures.length.toLocaleString()} of ${data.reviewSignatures.length.toLocaleString()} latest-file exception signatures shown.`}
          bodyClassName="max-h-[70vh] overflow-auto"
        >
          <SignatureTable
            mode="review"
            signatures={reviewSignatures}
            emptyMessage="No latest-file review items."
          />
        </DataTableShell>
      )}

      {data && !loading && viewMode === "history" && (
        <DataTableShell
          title="All History Matching"
          subtitle={`${historySignatures.length.toLocaleString()} of ${data.historySignatures.length.toLocaleString()} historical product signatures shown.`}
          bodyClassName="max-h-[72vh] overflow-auto"
        >
          <SignatureTable
            mode="history"
            signatures={historySignatures}
            emptyMessage="No historical signatures matched the current search."
          />
        </DataTableShell>
      )}

      {data && !loading && viewMode === "raw" && (
        <DataTableShell
          title="Latest Upload Raw Rows"
          subtitle={`${data.columns.length.toLocaleString()} columns using ${data.ruleEngine}.`}
          bodyClassName="max-h-[75vh] overflow-auto"
        >
          <TradesTable payload={data} />
        </DataTableShell>
      )}
    </div>
  );
}
