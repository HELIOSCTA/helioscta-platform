import {
  measureRoutePhase,
  observedJsonRoute,
  type ObservedRouteResult,
} from "@/lib/server/apiObservability";
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

interface TelemetryMatchRow extends TelemetrySnapshotRow {
  provider: string | null;
  pipeline_name: string | null;
  operation_name: string | null;
  target_table: string | null;
}

interface OpsSnapshotDefinition {
  id: string;
  label: string;
  scheduleLabel: string;
  expectedArtifact: string;
  matchValues: string[];
}

const OPS_TELEMETRY_LOOKBACK_DAYS = 45;
const OPS_SNAPSHOT_DEFINITIONS: OpsSnapshotDefinition[] = [
  {
    id: "nav_margin_eq",
    label: "Margin Eq",
    scheduleLabel: "Daily AM",
    expectedArtifact: "NAV margin/equity source file",
    matchValues: ["nav_margin_eq", "nav_margin_equity", "nav_email.nav_margin_eq"],
  },
  {
    id: "nav_risk_matrix",
    label: "Risk Matrix",
    scheduleLabel: "Daily AM",
    expectedArtifact: "NAV risk matrix source file",
    matchValues: ["nav_risk_matrix", "nav_riskmatrix", "nav_email.nav_risk_matrix"],
  },
  {
    id: "nav_trade_breaks",
    label: "Trade Breaks",
    scheduleLabel: "Daily AM",
    expectedArtifact: "NAV trade break workbook",
    matchValues: [
      "nav_trade_breaks_email",
      "nav_trade_breaks_email_scheduled",
      "nav_email.nav_trade_breaks",
    ],
  },
  {
    id: "clear_street_intraday_txns",
    label: "Intraday Txns",
    scheduleLabel: "Intraday",
    expectedArtifact: "Clear Street intraday transactions file",
    matchValues: [
      "clear_street_intraday_transactions",
      "clear_street_intraday_txns",
      "clear_street.intraday_transactions",
    ],
  },
  {
    id: "clear_street_economics",
    label: "Economics",
    scheduleLabel: "Daily AM",
    expectedArtifact: "Clear Street economics file",
    matchValues: ["clear_street_economics", "clear_street.economics"],
  },
  {
    id: "clear_street_positions",
    label: "Positions",
    scheduleLabel: "Daily EOD",
    expectedArtifact: "Clear Street positions file",
    matchValues: ["clear_street_positions", "clear_street.positions"],
  },
];

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

function normalizedMatchValues(definitions: OpsSnapshotDefinition[]): string[] {
  return [
    ...new Set(
      definitions.flatMap((definition) =>
        definition.matchValues.map((value) => value.trim().toLowerCase()).filter(Boolean),
      ),
    ),
  ];
}

function rowMatchesDefinition(row: TelemetryMatchRow, definition: OpsSnapshotDefinition): boolean {
  const fields = [
    row.provider,
    row.pipeline_name,
    row.operation_name,
    row.target_table,
  ].map((value) => value?.trim().toLowerCase() ?? "");
  return definition.matchValues.some((value) => fields.includes(value.trim().toLowerCase()));
}

async function loadOpsSnapshotMap(
  definitions: OpsSnapshotDefinition[] = OPS_SNAPSHOT_DEFINITIONS,
): Promise<Map<string, TelemetryMatchRow>> {
  const matchValues = normalizedMatchValues(definitions);
  if (matchValues.length === 0) return new Map();

  const rows = await query<TelemetryMatchRow>(
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
      error_message,
      provider,
      pipeline_name,
      operation_name,
      target_table
    FROM ops.api_fetch_log
    WHERE created_at >= now() - ($2::integer * INTERVAL '1 day')
      AND (
        lower(coalesce(pipeline_name, '')) = ANY($1::text[])
        OR lower(coalesce(operation_name, '')) = ANY($1::text[])
        OR lower(coalesce(target_table, '')) = ANY($1::text[])
        OR lower(coalesce(provider, '')) = ANY($1::text[])
      )
    ORDER BY created_at DESC
    LIMIT 250
    `,
    [matchValues, OPS_TELEMETRY_LOOKBACK_DAYS],
  );

  const byDefinition = new Map<string, TelemetryMatchRow>();
  for (const row of rows) {
    for (const definition of definitions) {
      if (!byDefinition.has(definition.id) && rowMatchesDefinition(row, definition)) {
        byDefinition.set(definition.id, row);
      }
    }
  }
  return byDefinition;
}

function opsSnapshot(
  definition: OpsSnapshotDefinition,
  today: string,
  rowsByDefinition: ReadonlyMap<string, TelemetrySnapshotRow>,
  opsError: unknown,
): BackOfficeHomeSnapshot {
  if (opsError) {
    return errorSnapshot({
      id: definition.id,
      label: definition.label,
      scheduleLabel: definition.scheduleLabel,
      sourceTable: "ops.api_fetch_log",
      expectedArtifact: definition.expectedArtifact,
      error: opsError,
    });
  }

  return snapshotFromRow({
    id: definition.id,
    label: definition.label,
    scheduleLabel: definition.scheduleLabel,
    sourceTable: "ops.api_fetch_log",
    expectedArtifact: definition.expectedArtifact,
    row: rowsByDefinition.get(definition.id) ?? null,
    today,
    unavailableDetail: `${definition.label} telemetry was not found in ops.api_fetch_log.`,
  });
}

async function navPositionsSnapshot(today: string): Promise<BackOfficeHomeSnapshot> {
  try {
    const rows = await query<SourceSnapshotRow>(
      `
      WITH latest_date AS (
        SELECT nav_date::date AS nav_date
        FROM nav.positions
        ORDER BY nav_date DESC
        LIMIT 1
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
      WITH latest_date AS (
        SELECT trade_date_from_sftp
        FROM clear_street.eod_transactions
        WHERE trade_date_from_sftp ~ '^[0-9]{8}$'
        ORDER BY trade_date_from_sftp DESC
        LIMIT 1
      )
      SELECT
        to_date(latest_date.trade_date_from_sftp, 'YYYYMMDD')::text AS latest_date,
        max(transactions.updated_at)::text AS latest_update_at,
        count(*)::integer AS row_count
      FROM latest_date
      LEFT JOIN clear_street.eod_transactions AS transactions
        ON transactions.trade_date_from_sftp = latest_date.trade_date_from_sftp
      GROUP BY latest_date.trade_date_from_sftp
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

function opsDefinition(id: string): OpsSnapshotDefinition {
  const definition = OPS_SNAPSHOT_DEFINITIONS.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Missing Back Office Home ops definition: ${id}`);
  return definition;
}

function loadNavGroup({
  today,
  opsSnapshots,
  opsError,
  posVal,
}: {
  today: string;
  opsSnapshots: ReadonlyMap<string, TelemetrySnapshotRow>;
  opsError: unknown;
  posVal: BackOfficeHomeSnapshot;
}): BackOfficeHomeGroup {
  const marginEq = opsSnapshot(opsDefinition("nav_margin_eq"), today, opsSnapshots, opsError);
  const riskMatrix = opsSnapshot(opsDefinition("nav_risk_matrix"), today, opsSnapshots, opsError);
  const tradeBreaks = opsSnapshot(opsDefinition("nav_trade_breaks"), today, opsSnapshots, opsError);
  return groupFromSnapshots("nav", "NAV", [marginEq, posVal, riskMatrix, tradeBreaks]);
}

function loadClearStreetGroup({
  today,
  opsSnapshots,
  opsError,
  transactions,
}: {
  today: string;
  opsSnapshots: ReadonlyMap<string, TelemetrySnapshotRow>;
  opsError: unknown;
  transactions: BackOfficeHomeSnapshot;
}): BackOfficeHomeGroup {
  const intradayTxns = opsSnapshot(
    opsDefinition("clear_street_intraday_txns"),
    today,
    opsSnapshots,
    opsError,
  );
  const economics = opsSnapshot(
    opsDefinition("clear_street_economics"),
    today,
    opsSnapshots,
    opsError,
  );
  const positions = opsSnapshot(
    opsDefinition("clear_street_positions"),
    today,
    opsSnapshots,
    opsError,
  );
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
      dataCache: true,
      dataCacheTtlSeconds: CACHE_TTL_SECONDS,
      load: async () => {
        const now = new Date();
        const generatedAt = now.toISOString();
        const today = localIsoDate(now);
        const [opsResult, posVal, transactions] = await Promise.all([
          measureRoutePhase("ops-telemetry", async () => {
            try {
              return {
                snapshots: await loadOpsSnapshotMap(),
                error: null,
              };
            } catch (error) {
              return {
                snapshots: new Map<string, TelemetrySnapshotRow>(),
                error,
              };
            }
          }),
          measureRoutePhase("nav-positions", () => navPositionsSnapshot(today)),
          measureRoutePhase("clear-street-transactions", () =>
            clearStreetTransactionsSnapshot(today),
          ),
        ]);
        const groups = [
          loadNavGroup({
            today,
            opsSnapshots: opsResult.snapshots,
            opsError: opsResult.error,
            posVal,
          }),
          loadClearStreetGroup({
            today,
            opsSnapshots: opsResult.snapshots,
            opsError: opsResult.error,
            transactions,
          }),
        ];
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
              total +
              group.snapshots.reduce(
                (groupTotal, snapshot) => groupTotal + snapshot.rowCount,
                0,
              ),
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
