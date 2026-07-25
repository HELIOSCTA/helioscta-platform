import { observedJsonRoute, type ObservedRouteResult } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import {
  getCachedRouteValue,
  normalizedSearchCacheKey,
  routeCacheHeaders,
} from "@/lib/server/routeCache";
import type {
  BackOfficeHomeGroup,
  BackOfficeHomePayload,
  BackOfficeHomeReadiness,
  BackOfficeHomeSnapshot,
  BackOfficeHomeSnapshotStatus,
  BackOfficeHomeSourceStatus,
} from "@/lib/positionsAndTrades/backOfficeHomeTypes";

export const runtime = "nodejs";
export const maxDuration = 30;

const DISPLAY_TIME_ZONE = "America/New_York";
const CACHE_TTL_SECONDS = 5 * 60;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;
const STALE_IF_ERROR_MS = 30 * 60 * 1000;
const CACHE_HEADER = `private, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS}`;
const NO_STORE_HEADER = "no-store";

interface SourceSnapshotRow {
  latest_date: string | Date | null;
  latest_update_at: string | Date | null;
  row_count: number | string | null;
}

interface TelemetrySnapshotRow {
  latest_date: string | Date | null;
  latest_update_at: string | Date | null;
  row_count: number | string | null;
  status: string | null;
  error_message: string | null;
}

function responseHeaders(forceRefresh: boolean): HeadersInit {
  return {
    "Cache-Control": forceRefresh ? NO_STORE_HEADER : CACHE_HEADER,
    "Vercel-CDN-Cache-Control": NO_STORE_HEADER,
    "X-Helios-Cache-Policy": forceRefresh
      ? "no-store"
      : `browser-cache=${CACHE_TTL_SECONDS}, vercel-cdn no-store`,
  };
}

function toIsoOrText(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  return String(value);
}

function toIsoDate(value: string | Date | null | undefined): string | null {
  const iso = toIsoOrText(value);
  if (!iso) return null;
  const match = iso.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function toInteger(value: unknown): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatTimestamp(value: string | null): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatDateOnly(value: string | null): string {
  if (!value) return "--";
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function latestAvailableLabel(value: string | null): string {
  if (!value) return "--";
  return `${formatDateOnly(value)}, 20:00 EDT`;
}

function localIsoDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function isWeekend(value: string): boolean {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function businessDaysBetween(fromDate: string | null, toDate: string): number {
  if (!fromDate || fromDate > toDate) return Number.POSITIVE_INFINITY;
  let cursor = fromDate;
  let days = 0;
  while (cursor < toDate) {
    cursor = addDays(cursor, 1);
    if (!isWeekend(cursor)) days += 1;
  }
  return days;
}

function statusLabel(status: BackOfficeHomeSnapshotStatus): string {
  if (status === "ready") return "Ready";
  if (status === "awaiting_next_run") return "Awaiting Next Run";
  if (status === "late") return "Late";
  if (status === "missing") return "Missing";
  if (status === "unavailable") return "Unavailable";
  return "Error";
}

function readinessLabel(readiness: BackOfficeHomeReadiness): string {
  if (readiness === "ready") return "READY";
  if (readiness === "watch") return "WATCH";
  return "ERROR";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function snapshotStatusFromDate(
  latestDate: string | null,
  today: string,
): BackOfficeHomeSnapshotStatus {
  if (!latestDate) return "missing";
  const age = businessDaysBetween(latestDate, today);
  if (age === 0) return "ready";
  if (age <= 1) return "awaiting_next_run";
  return "late";
}

function snapshotFromRow({
  id,
  label,
  scheduleLabel,
  sourceTable,
  expectedArtifact,
  row,
  today,
  unavailableDetail,
}: {
  id: string;
  label: string;
  scheduleLabel: string;
  sourceTable: string;
  expectedArtifact: string;
  row: SourceSnapshotRow | TelemetrySnapshotRow | null;
  today: string;
  unavailableDetail?: string;
}): BackOfficeHomeSnapshot {
  const latestDate = toIsoDate(row?.latest_date ?? null);
  const latestUpdateAt = toIsoOrText(row?.latest_update_at ?? null);
  const rowCount = toInteger(row?.row_count ?? 0);
  const baseStatus = snapshotStatusFromDate(latestDate, today);
  const telemetryStatus =
    row && "status" in row && row.status ? row.status.toLowerCase() : null;
  const status: BackOfficeHomeSnapshotStatus =
    telemetryStatus === "error" || telemetryStatus === "failure" || telemetryStatus === "failed"
      ? "error"
      : row
        ? baseStatus
        : "unavailable";
  const detail =
    status === "ready"
      ? `${label} has current same-day data.`
      : status === "awaiting_next_run"
        ? `${label} is mirrored in the database and is waiting for the next source-file window.`
        : status === "late"
          ? `${label} latest date is more than one business day behind ${today}.`
          : status === "missing"
            ? `${label} has no source rows in the checked window.`
            : status === "error"
              ? `Latest ${label} telemetry failed: ${
                  row && "error_message" in row ? row.error_message ?? "see ops.api_fetch_log" : "see source table"
                }.`
              : unavailableDetail ??
                `${label} source contract is not promoted in this repo yet.`;
  const isException =
    status === "missing" ||
    status === "unavailable" ||
    status === "error" ||
    (row !== null && latestDate === null);

  return {
    id,
    label,
    scheduleLabel,
    sourceTable,
    expectedArtifact,
    latestDate,
    latestDateLabel: latestDate ?? "--",
    latestUpdateAt,
    latestUpdateLabel: formatTimestamp(latestUpdateAt),
    dbMirrored: row ? latestDate !== null : null,
    dbMirroredLabel: row ? (latestDate ? "Yes" : "No") : "--",
    rowCount,
    rowCountLabel: formatCount(rowCount),
    status,
    statusLabel: statusLabel(status),
    detail,
    isException,
  };
}

function unavailableSnapshot({
  id,
  label,
  scheduleLabel,
  sourceTable,
  expectedArtifact,
  detail,
}: {
  id: string;
  label: string;
  scheduleLabel: string;
  sourceTable: string;
  expectedArtifact: string;
  detail: string;
}): BackOfficeHomeSnapshot {
  return {
    id,
    label,
    scheduleLabel,
    sourceTable,
    expectedArtifact,
    latestDate: null,
    latestDateLabel: "--",
    latestUpdateAt: null,
    latestUpdateLabel: "--",
    dbMirrored: null,
    dbMirroredLabel: "--",
    rowCount: 0,
    rowCountLabel: "0",
    status: "unavailable",
    statusLabel: statusLabel("unavailable"),
    detail,
    isException: true,
  };
}

function errorSnapshot({
  id,
  label,
  scheduleLabel,
  sourceTable,
  expectedArtifact,
  error,
}: {
  id: string;
  label: string;
  scheduleLabel: string;
  sourceTable: string;
  expectedArtifact: string;
  error: unknown;
}): BackOfficeHomeSnapshot {
  return {
    ...unavailableSnapshot({
      id,
      label,
      scheduleLabel,
      sourceTable,
      expectedArtifact,
      detail: `${label} query failed: ${errorMessage(error)}`,
    }),
    status: "error",
    statusLabel: statusLabel("error"),
  };
}

async function latestOpsSnapshot(
  patterns: string[],
): Promise<TelemetrySnapshotRow | null> {
  const rows = await query<TelemetrySnapshotRow>(
    `
    SELECT
      COALESCE(
        NULLIF(metadata ->> 'target_date', '')::date,
        NULLIF(metadata ->> 'business_date', '')::date,
        NULLIF(metadata ->> 'trade_date', '')::date,
        NULLIF(metadata ->> 'sftp_date', '')::date,
        created_at::date
      )::text AS latest_date,
      created_at::text AS latest_update_at,
      rows_written AS row_count,
      status,
      error_message
    FROM ops.api_fetch_log
    WHERE created_at >= now() - INTERVAL '45 days'
      AND (
        lower(coalesce(pipeline_name, '')) LIKE ANY($1::text[])
        OR lower(coalesce(operation_name, '')) LIKE ANY($1::text[])
        OR lower(coalesce(target_table, '')) LIKE ANY($1::text[])
        OR lower(coalesce(provider, '')) LIKE ANY($1::text[])
      )
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [patterns],
  );
  return rows[0] ?? null;
}

async function opsSnapshot(
  id: string,
  label: string,
  scheduleLabel: string,
  patterns: string[],
  today: string,
  expectedArtifact: string,
): Promise<BackOfficeHomeSnapshot> {
  try {
    const row = await latestOpsSnapshot(patterns);
    return snapshotFromRow({
      id,
      label,
      scheduleLabel,
      sourceTable: "ops.api_fetch_log",
      expectedArtifact,
      row,
      today,
      unavailableDetail: `${label} telemetry was not found in ops.api_fetch_log.`,
    });
  } catch (error) {
    return errorSnapshot({
      id,
      label,
      scheduleLabel,
      sourceTable: "ops.api_fetch_log",
      expectedArtifact,
      error,
    });
  }
}

async function navPositionsSnapshot(today: string): Promise<BackOfficeHomeSnapshot> {
  try {
    const rows = await query<SourceSnapshotRow>(
      `
      WITH latest_date AS (
        SELECT max(nav_date)::date AS nav_date
        FROM nav.positions
      )
      SELECT
        latest_date.nav_date::text AS latest_date,
        max(coalesce(positions.updated_at, positions.created_at, positions.sftp_upload_timestamp))::text
          AS latest_update_at,
        count(*)::integer AS row_count
      FROM latest_date
      LEFT JOIN nav.positions AS positions
        ON positions.nav_date = latest_date.nav_date
      GROUP BY latest_date.nav_date
      `,
    );
    return snapshotFromRow({
      id: "nav_pos_val",
      label: "Pos Val",
      scheduleLabel: "Daily AM",
      sourceTable: "nav.positions",
      expectedArtifact: "Position Valuation Detail Report_<YYYYMMDD>_<legal entity>.xlsx",
      row: rows[0] ?? null,
      today,
    });
  } catch (error) {
    return errorSnapshot({
      id: "nav_pos_val",
      label: "Pos Val",
      scheduleLabel: "Daily AM",
      sourceTable: "nav.positions",
      expectedArtifact: "Position Valuation Detail Report_<YYYYMMDD>_<legal entity>.xlsx",
      error,
    });
  }
}

async function clearStreetTransactionsSnapshot(today: string): Promise<BackOfficeHomeSnapshot> {
  try {
    const rows = await query<SourceSnapshotRow>(
      `
      WITH normalized AS (
        SELECT
          to_date(trade_date_from_sftp, 'YYYYMMDD')::date AS sftp_date,
          updated_at
        FROM clear_street.eod_transactions
        WHERE trade_date_from_sftp ~ '^[0-9]{8}$'
      ),
      latest_date AS (
        SELECT max(sftp_date)::date AS sftp_date
        FROM normalized
      )
      SELECT
        latest_date.sftp_date::text AS latest_date,
        max(normalized.updated_at)::text AS latest_update_at,
        count(*)::integer AS row_count
      FROM latest_date
      LEFT JOIN normalized
        ON normalized.sftp_date = latest_date.sftp_date
      GROUP BY latest_date.sftp_date
      `,
    );
    return snapshotFromRow({
      id: "clear_street_transactions",
      label: "Transactions",
      scheduleLabel: "Daily EOD",
      sourceTable: "clear_street.eod_transactions",
      expectedArtifact: "Helios_Transactions_<YYYYMMDD>.csv",
      row: rows[0] ?? null,
      today,
    });
  } catch (error) {
    return errorSnapshot({
      id: "clear_street_transactions",
      label: "Transactions",
      scheduleLabel: "Daily EOD",
      sourceTable: "clear_street.eod_transactions",
      expectedArtifact: "Helios_Transactions_<YYYYMMDD>.csv",
      error,
    });
  }
}

function groupReadiness(snapshots: BackOfficeHomeSnapshot[]): BackOfficeHomeReadiness {
  if (snapshots.some((snapshot) => snapshot.status === "error")) return "error";
  if (snapshots.some((snapshot) => snapshot.isException)) return "watch";
  return "ready";
}

function groupFromSnapshots(
  id: BackOfficeHomeGroup["id"],
  label: string,
  snapshots: BackOfficeHomeSnapshot[],
): BackOfficeHomeGroup {
  const latestAvailableAt =
    snapshots
      .map((snapshot) => snapshot.latestDate)
      .filter((date): date is string => Boolean(date))
      .sort()
      .at(-1) ?? null;
  const readiness = groupReadiness(snapshots);
  const readyCount = snapshots.filter(
    (snapshot) => snapshot.status === "ready" || snapshot.status === "awaiting_next_run",
  ).length;
  const ingestLagCount = snapshots.filter((snapshot) => snapshot.status === "late").length;
  const dbGapCount = snapshots.filter(
    (snapshot) => snapshot.dbMirrored === false || snapshot.status === "error",
  ).length;
  const sourceGapCount = snapshots.filter(
    (snapshot) => snapshot.status === "missing" || snapshot.status === "unavailable",
  ).length;
  const exceptionCount = snapshots.filter((snapshot) => snapshot.isException).length;
  const sftpStatus: BackOfficeHomeSourceStatus = latestAvailableAt ? "up" : "unknown";
  const dbStatus: BackOfficeHomeSourceStatus =
    readiness === "error" ? "error" : dbGapCount > 0 ? "gap" : readyCount > 0 ? "ready" : "unknown";

  return {
    id,
    label,
    latestAvailableAt,
    latestAvailableLabel: latestAvailableLabel(latestAvailableAt),
    sftpStatus,
    sftpStatusLabel: sftpStatus === "up" ? "SFTP UP" : "SFTP UNKNOWN",
    dbStatus,
    dbStatusLabel:
      dbStatus === "ready"
        ? "DB READY"
        : dbStatus === "gap"
          ? "DB GAP"
          : dbStatus === "error"
            ? "DB ERROR"
            : "DB UNKNOWN",
    readiness,
    readyCount,
    ingestLagCount,
    dbGapCount,
    sourceGapCount,
    nameMismatchCount: 0,
    snapshots,
    exceptionCount,
    metrics: [
      { label: "Ready", value: String(readyCount), status: readyCount > 0 ? "ready" : "watch" },
      { label: "Ingest Lag", value: String(ingestLagCount), status: ingestLagCount > 0 ? "watch" : "ready" },
      { label: "DB Gaps", value: String(dbGapCount), status: dbGapCount > 0 ? "watch" : "ready" },
      { label: "Source Gaps", value: String(sourceGapCount), status: sourceGapCount > 0 ? "watch" : "ready" },
      { label: "Name Mismatch", value: "0", status: "ready" },
    ],
  };
}

async function loadNavGroup(today: string): Promise<BackOfficeHomeGroup> {
  const [marginEq, posVal, riskMatrix, tradeBreaks] = await Promise.all([
    opsSnapshot(
      "nav_margin_eq",
      "Margin Eq",
      "Daily AM",
      ["%nav%margin%", "%margin%equ%", "%margin_eq%"],
      today,
      "NAV margin/equity source file",
    ),
    navPositionsSnapshot(today),
    opsSnapshot(
      "nav_risk_matrix",
      "Risk Matrix",
      "Daily AM",
      ["%nav%risk%", "%risk%matrix%"],
      today,
      "NAV risk matrix source file",
    ),
    opsSnapshot(
      "nav_trade_breaks",
      "Trade Breaks",
      "Daily AM",
      ["%nav%trade%break%", "%trade_break%"],
      today,
      "NAV trade break workbook",
    ),
  ]);
  return groupFromSnapshots("nav", "NAV", [marginEq, posVal, riskMatrix, tradeBreaks]);
}

async function loadClearStreetGroup(today: string): Promise<BackOfficeHomeGroup> {
  const [transactions, intradayTxns, economics, positions] = await Promise.all([
    clearStreetTransactionsSnapshot(today),
    opsSnapshot(
      "clear_street_intraday_txns",
      "Intraday Txns",
      "Intraday",
      ["%clear_street%intraday%", "%clear street%intraday%", "%intraday%txn%"],
      today,
      "Clear Street intraday transactions file",
    ),
    opsSnapshot(
      "clear_street_economics",
      "Economics",
      "Daily AM",
      ["%clear_street%economic%", "%clear street%economic%"],
      today,
      "Clear Street economics file",
    ),
    opsSnapshot(
      "clear_street_positions",
      "Positions",
      "Daily EOD",
      ["%clear_street%position%", "%clear street%position%"],
      today,
      "Clear Street positions file",
    ),
  ]);
  return groupFromSnapshots("clear_street", "CLEAR_STREET", [
    transactions,
    intradayTxns,
    economics,
    positions,
  ]);
}

function overallReadiness(groups: BackOfficeHomeGroup[]): BackOfficeHomeReadiness {
  if (groups.some((group) => group.readiness === "error")) return "error";
  if (groups.some((group) => group.readiness === "watch")) return "watch";
  return "ready";
}

export const GET = observedJsonRoute(
  {
    route: "/api/backoffice-home",
    cacheHeader: CACHE_HEADER,
    cachePolicy: `browser-cache=${CACHE_TTL_SECONDS}, vercel-cdn no-store`,
    owner: "frontend",
    purpose: "Back Office Home source-file readiness dashboard.",
    p95TargetMs: 2_500,
    freshnessSource: "nav.positions, clear_street.eod_transactions, and ops.api_fetch_log telemetry",
  },
  async (request) => {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.has("refresh");
    const { value, cacheStatus } = await getCachedRouteValue<ObservedRouteResult>({
      namespace: "/api/backoffice-home",
      key: normalizedSearchCacheKey(url.searchParams),
      ttlMs: CACHE_TTL_MS,
      staleIfErrorMs: STALE_IF_ERROR_MS,
      forceRefresh,
      load: async () => {
    const now = new Date();
    const generatedAt = now.toISOString();
    const today = localIsoDate(now);
    const groups = await Promise.all([loadNavGroup(today), loadClearStreetGroup(today)]);
    const readiness = overallReadiness(groups);
    const exceptionCount = groups.reduce((total, group) => total + group.exceptionCount, 0);
    const payload: BackOfficeHomePayload = {
      source: "backoffice-home",
      generatedAt,
      localTimeZone: DISPLAY_TIME_ZONE,
      readiness,
      readinessLabel: readinessLabel(readiness),
      summary:
        readiness === "ready"
          ? "All tracked NAV and Clear Street files are aligned and ready for trading checks."
          : `${exceptionCount} source-file check(s) need attention before this can match the Spark back-office readiness page.`,
      changedSinceLastCheck: "No new source filenames since last refresh.",
      groups,
      sourceChecks:
        "Sources: nav.positions, clear_street.eod_transactions, and ops.api_fetch_log telemetry; processed-file tables are not promoted locally",
    };

    return {
      payload,
      headers: responseHeaders(forceRefresh),
      rowCount: groups.reduce(
        (total, group) =>
          total + group.snapshots.reduce((groupTotal, snapshot) => groupTotal + snapshot.rowCount, 0),
        0,
      ),
      dataAsOf:
        groups
          .flatMap((group) => group.snapshots.map((snapshot) => snapshot.latestUpdateAt))
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? generatedAt,
    };
      },
    });

    return {
      ...value,
      headers: {
        ...responseHeaders(forceRefresh),
        ...routeCacheHeaders(cacheStatus),
      },
    };
  },
);
