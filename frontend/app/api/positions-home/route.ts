import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import type {
  PositionsHomeFeedId,
  PositionsHomeFeedStatus,
  PositionsHomeFeedSourceRow,
  PositionsHomePayload,
  PositionsHomePipelineRun,
  PositionsHomeReferenceStatus,
  PositionsHomeStatus,
} from "@/lib/positionsAndTrades/positionsHomeTypes";
import {
  POSITIONS_AND_TRADES_MANIFEST_RELATIVE_PATH,
  loadPositionsAndTradesManifest,
  type PositionsAndTradesManifest,
} from "@/lib/server/positionsAndTradesManifest";
import { deferredPositionsHomeValidationChecks } from "@/lib/server/positionsHomeValidationChecks";

export const runtime = "nodejs";
export const maxDuration = 30;

const HOME_CACHE_TTL_SECONDS = 5 * 60;
const CACHE_HEADER = `private, max-age=${HOME_CACHE_TTL_SECONDS}, stale-while-revalidate=${HOME_CACHE_TTL_SECONDS}`;
const NO_STORE_HEADER = "no-store";
const LOCAL_TIME_ZONE = "America/Denver";
const ROUTE_CONFIG = {
  route: "/api/positions-home",
  cacheHeader: CACHE_HEADER,
  cachePolicy:
    "auth-protected browser-cache=300, stale-while-revalidate=300, vercel-cdn no-store",
  owner: "frontend",
  purpose: "Positions source-file health home page",
  p95TargetMs: 2_500,
  freshnessSource:
    "nav.positions, clear_street.eod_transactions, ice_trade_blotter.ice_trade_blotter",
} as const;

const STATUS_LABELS: Record<PositionsHomeStatus, string> = {
  stable: "Stable",
  not_applicable: "N/A",
  watch: "Watch",
  stale: "Stale",
  missing: "Missing",
  needs_repair: "Needs Repair",
  error: "Error",
};

const STATUS_RANK: Record<PositionsHomeStatus, number> = {
  stable: 0,
  not_applicable: 0,
  watch: 1,
  stale: 2,
  missing: 3,
  needs_repair: 3,
  error: 4,
};

const EXPECTED_NAV_FUNDS = [
  { code: "agr", legalEntity: "AGR Trading II, LLC" },
  { code: "moross", legalEntity: "Moross Limited Partnership" },
  { code: "pnt", legalEntity: "PNT Trading, LLC" },
  { code: "titan", legalEntity: "ESKER POINT LP" },
] as const;

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

interface NavPositionDbRow {
  nav_date: string;
  fund_code: string;
  account_group: string | null;
  row_count: number | string;
  latest_upload_at: string | null;
  latest_loaded_at: string | null;
  latest_updated_at: string | null;
}

interface ClearStreetDbRow {
  trade_date_from_sftp: string;
  row_count: number | string;
  latest_upload_at: string | null;
  latest_updated_at: string | null;
}

interface IceTradeBlotterDbRow {
  trade_date: string | null;
  row_count: number | string;
  distinct_deal_count: number | string;
  latest_loaded_at: string | null;
  latest_updated_at: string | null;
}

interface PipelineRunDbRow {
  run_key: PipelineRunKey;
  pipeline_name: string | null;
  provider: string | null;
  operation_name: string | null;
  target_table: string | null;
  status: string | null;
  created_at: string | null;
  rows_written: number | string | null;
  error_type: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
}

type PipelineRunKey = PositionsHomeFeedId | "clear_street_titan_upload";

interface InternalPipelineRun extends PositionsHomePipelineRun {
  pipelineName: string | null;
  targetTable: string | null;
  metadata: Record<string, unknown> | null;
}

const REFERENCE_DDL_PATH =
  "dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/table_positions_and_trades_reference_tables.sql";
const REFERENCE_VERIFY_PATH =
  "dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/verify_positions_and_trades_reference_tables.sql";
const REFERENCE_SYNC_PATH =
  "dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/upsert_positions_and_trades_reference_values.sql";

function fallbackReferenceDocs(): PositionsHomeReferenceStatus["docs"] {
  return {
    contractId: "positions_and_trades",
    displayName: "Positions & Trades Reference Model",
    dbtModelFamily: "2026_07_22_ref_tables",
    dbtModelFamilyPath: "dbt/azure_postgres/models/positions_and_trades/2026_07_22_ref_tables",
    referenceSchema: "positions_and_trades_ref",
    referenceTables: [
      "product_catalog",
      "product_alias_rules",
      "account_lookup",
      "month_codes",
    ],
    manifest: POSITIONS_AND_TRADES_MANIFEST_RELATIVE_PATH,
    referenceDdl: REFERENCE_DDL_PATH,
    verificationSql: REFERENCE_VERIFY_PATH,
    upsertSql: REFERENCE_SYNC_PATH,
  };
}

function referenceDocsFromManifest(
  manifest: PositionsAndTradesManifest,
): PositionsHomeReferenceStatus["docs"] {
  return {
    contractId: manifest.contractId,
    displayName: manifest.displayName,
    dbtModelFamily: manifest.dbtModelFamily,
    dbtModelFamilyPath: manifest.dbtModelFamilyPath,
    referenceSchema: manifest.referenceSchema,
    referenceTables: manifest.referenceTables,
    manifest: POSITIONS_AND_TRADES_MANIFEST_RELATIVE_PATH,
    referenceDdl: REFERENCE_DDL_PATH,
    verificationSql: REFERENCE_VERIFY_PATH,
    upsertSql: REFERENCE_SYNC_PATH,
  };
}

function responseCacheHeaders(forceRefresh: boolean): HeadersInit {
  const cacheHeader = forceRefresh ? NO_STORE_HEADER : CACHE_HEADER;
  return {
    "Cache-Control": cacheHeader,
    "Vercel-CDN-Cache-Control": NO_STORE_HEADER,
    "X-Helios-Cache-Policy":
      forceRefresh ? "auth-protected no-store" : "auth-protected browser-cache, vercel-cdn no-store",
  };
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: unknown): number {
  const parsed = toNumber(value);
  return parsed === null ? 0 : Math.trunc(parsed);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function compactError(error: unknown): string {
  return errorMessage(error).replace(/\s+/g, " ").slice(0, 220);
}

function statusLabel(status: PositionsHomeStatus): string {
  return STATUS_LABELS[status];
}

function worstStatus(statuses: PositionsHomeStatus[]): PositionsHomeStatus {
  return statuses.reduce<PositionsHomeStatus>(
    (worst, status) => (STATUS_RANK[status] > STATUS_RANK[worst] ? status : worst),
    "stable",
  );
}

function needsAttention(status: PositionsHomeStatus): boolean {
  return STATUS_RANK[status] > STATUS_RANK.not_applicable;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function compactDate(iso: string): string {
  return iso.replaceAll("-", "");
}

function validIsoDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = dateFromIso(value);
  const normalized = isoDate(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth() + 1,
    parsed.getUTCDate(),
  );
  return normalized === value ? value : null;
}

function expandedDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
}

function dateFromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function addDays(iso: string, days: number): string {
  const date = dateFromIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function weekday(iso: string): number {
  return dateFromIso(iso).getUTCDay();
}

function isBusinessDate(iso: string): boolean {
  const day = weekday(iso);
  return day !== 0 && day !== 6;
}

function previousBusinessDate(anchorIso: string): string {
  let candidate = addDays(anchorIso, -1);
  while (weekday(candidate) === 0 || weekday(candidate) === 6) {
    candidate = addDays(candidate, -1);
  }
  return candidate;
}

function businessDaysBetween(startIso: string, endIso: string): number {
  if (startIso >= endIso) return 0;
  let cursor = addDays(startIso, 1);
  let count = 0;
  while (cursor <= endIso) {
    const day = weekday(cursor);
    if (day !== 0 && day !== 6) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

function localParts(now: Date): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: LOCAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function localDate(parts: LocalDateTimeParts): string {
  return isoDate(parts.year, parts.month, parts.day);
}

function formatTimestamp(value: string | null): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    timeZone: LOCAL_TIME_ZONE,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function maxTimestamp(values: Array<string | null | undefined>): string | null {
  let maxValue: string | null = null;
  let maxTime = Number.NEGATIVE_INFINITY;
  values.forEach((value) => {
    if (!value) return;
    const parsed = new Date(value).getTime();
    if (Number.isNaN(parsed)) return;
    if (parsed > maxTime) {
      maxTime = parsed;
      maxValue = value;
    }
  });
  return maxValue;
}

function pipelineMetric(run: PositionsHomePipelineRun | null) {
  if (!run) {
    return {
      label: "Pipeline",
      value: "No recent telemetry",
      status: "watch" as const,
    };
  }
  return {
    label: "Pipeline",
    value: run.status ? `${run.status} at ${formatTimestamp(run.createdAt)}` : "Unknown",
    status: run.status === "success" ? ("stable" as const) : ("watch" as const),
  };
}

function publicPipelineRun(
  run: InternalPipelineRun | null | undefined,
): PositionsHomePipelineRun | null {
  if (!run) return null;
  return {
    status: run.status,
    operationName: run.operationName,
    provider: run.provider,
    createdAt: run.createdAt,
    rowsWritten: run.rowsWritten,
    errorType: run.errorType,
    errorMessage: run.errorMessage,
  };
}

function metadataValue(
  run: InternalPipelineRun | null | undefined,
  keys: string[],
): string | null {
  const metadata = run?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  for (const key of keys) {
    const value = metadata[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function normalizedTelemetryDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{8}$/.test(value)) return expandedDate(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  return null;
}

function pipelineRunFromRow(row: PipelineRunDbRow): InternalPipelineRun {
  return {
    pipelineName: row.pipeline_name,
    provider: row.provider,
    operationName: row.operation_name,
    targetTable: row.target_table,
    status: row.status,
    createdAt: row.created_at,
    rowsWritten: toNumber(row.rows_written),
    errorType: row.error_type,
    errorMessage: row.error_message,
    metadata: row.metadata,
  };
}

function errorFeedStatus(
  id: PositionsHomeFeedId,
  label: string,
  actionSection: PositionsHomeFeedStatus["actionSection"],
  error: unknown,
): PositionsHomeFeedStatus {
  return {
    id,
    label,
    status: "error",
    statusLabel: statusLabel("error"),
    sourceSystem: "--",
    sourceTable: "--",
    expectedArtifact: "--",
    targetDate: null,
    targetDateLabel: "--",
    latestDate: null,
    latestDateLabel: "--",
    latestUpdateAt: null,
    latestUpdateLabel: "--",
    rowCount: 0,
    rowCountLabel: "--",
    detail: `Health query failed: ${compactError(error)}`,
    actionSection,
    manual: false,
    metrics: [
      {
        label: "Error",
        value: compactError(error),
        status: "error",
      },
    ],
    sourceRows: [],
    lastPipelineRun: null,
  };
}

function clearStreetExpectation(
  parts: LocalDateTimeParts,
  reviewBusinessDate: string | null = null,
): {
  targetIso: string;
  targetSftpDate: string;
  inActiveWindow: boolean;
  notApplicable: boolean;
  ruleText: string;
} {
  const today = localDate(parts);
  const previousCalendarDate = addDays(today, -1);
  const activeEveningWindow = isBusinessDate(today) && parts.hour >= 19;
  const activeMorningWindow = isBusinessDate(previousCalendarDate) && parts.hour < 5;
  const activeWindowTargetIso = activeEveningWindow
    ? today
    : activeMorningWindow
      ? previousCalendarDate
      : null;

  if (reviewBusinessDate) {
    const inActiveWindow = activeWindowTargetIso === reviewBusinessDate;
    const notApplicable =
      !isBusinessDate(reviewBusinessDate) ||
      reviewBusinessDate > today ||
      (reviewBusinessDate === today && !inActiveWindow);
    const ruleText = notApplicable
      ? `Clear Street ${reviewBusinessDate} is N/A until its 19:00 MT business-night window.`
      : inActiveWindow
        ? `Expected Clear Street date: ${reviewBusinessDate} (current business-night window).`
        : `Expected Clear Street date: ${reviewBusinessDate} (historical business-date review).`;

    return {
      targetIso: reviewBusinessDate,
      targetSftpDate: compactDate(reviewBusinessDate),
      inActiveWindow,
      notApplicable,
      ruleText,
    };
  }

  const inActiveWindow = activeWindowTargetIso !== null;
  const targetIso = activeWindowTargetIso
    ? activeWindowTargetIso
    : previousBusinessDate(today);
  const ruleText = inActiveWindow
    ? `Expected Clear Street date: ${targetIso} (current business-night window).`
    : isBusinessDate(today)
      ? `Today N/A until 19:00 MT; latest due Clear Street business date: ${targetIso}.`
      : `No Clear Street file is due today; latest due business date: ${targetIso}.`;

  return {
    targetIso,
    targetSftpDate: compactDate(targetIso),
    inActiveWindow,
    notApplicable: false,
    ruleText,
  };
}

async function loadLatestPipelineRuns(): Promise<
  ReadonlyMap<PipelineRunKey, InternalPipelineRun>
> {
  try {
    const rows = await query<PipelineRunDbRow>(`
      WITH candidates AS (
        SELECT
          CASE
            WHEN pipeline_name = 'nav_positions'
              OR operation_name = 'nav_positions_scheduled'
              THEN 'nav_positions'
            WHEN pipeline_name = 'clear_street_eod_transactions'
              OR operation_name = 'clear_street_eod_transactions_poll'
              THEN 'clear_street_trades'
            WHEN pipeline_name = 'clear_street_trades_mufg_upload'
              OR operation_name = 'clear_street_trades_mufg_upload'
              OR target_table = 'mufg_sftp.clear_street_trades'
              THEN 'clear_street_titan_upload'
            WHEN pipeline_name = 'ice_trade_blotters'
              OR operation_name = 'ice_trade_blotters_manual_ingest'
              OR provider = 'ice_trade_blotter_local_file'
              THEN 'ice_trade_blotter'
            ELSE NULL
          END AS run_key,
          pipeline_name,
          provider,
          operation_name,
          target_table,
          status,
          created_at::text AS created_at,
          rows_written,
          error_type,
          error_message,
          metadata
        FROM ops.api_fetch_log
        WHERE created_at >= NOW() - INTERVAL '14 days'
          AND (
            pipeline_name IN (
              'nav_positions',
              'clear_street_eod_transactions',
              'clear_street_trades_mufg_upload',
              'ice_trade_blotters'
            )
            OR operation_name IN (
              'nav_positions_scheduled',
              'clear_street_eod_transactions_poll',
              'clear_street_trades_mufg_upload',
              'ice_trade_blotters_manual_ingest'
            )
            OR target_table = 'mufg_sftp.clear_street_trades'
            OR provider = 'ice_trade_blotter_local_file'
          )
      ),
      ranked AS (
        SELECT
          *,
          ROW_NUMBER() OVER (PARTITION BY run_key ORDER BY created_at DESC) AS rn
        FROM candidates
        WHERE run_key IS NOT NULL
      )
      SELECT
        run_key,
        pipeline_name,
        provider,
        operation_name,
        target_table,
        status,
        created_at,
        rows_written,
        error_type,
        error_message,
        metadata
      FROM ranked
      WHERE rn = 1
    `);

    return new Map(
      rows.map((row) => [
        row.run_key,
        pipelineRunFromRow(row),
      ]),
    );
  } catch {
    return new Map();
  }
}

async function loadClearStreetTitanUploadRun(
  targetIso: string,
): Promise<InternalPipelineRun | null> {
  const targetCompact = compactDate(targetIso);
  const rows = await query<PipelineRunDbRow>(
    `
    SELECT
      'clear_street_titan_upload' AS run_key,
      pipeline_name,
      provider,
      operation_name,
      target_table,
      status,
      created_at::text AS created_at,
      rows_written,
      error_type,
      error_message,
      metadata
    FROM ops.api_fetch_log
    WHERE created_at >= ($1::date - INTERVAL '7 days')
      AND created_at < ($1::date + INTERVAL '7 days')
      AND (
        pipeline_name = 'clear_street_trades_mufg_upload'
        OR operation_name = 'clear_street_trades_mufg_upload'
        OR target_table = 'mufg_sftp.clear_street_trades'
      )
      AND (
        metadata ->> 'expected_trade_date' IN ($1::text, $2)
        OR metadata ->> 'expected_trade_date_from_sftp' IN ($1::text, $2)
        OR metadata ->> 'clear_street_target_trade_date' IN ($1::text, $2)
        OR metadata ->> 'export_trade_date' IN ($1::text, $2)
        OR metadata ->> 'trade_date' IN ($1::text, $2)
        OR metadata ->> 'sftp_date' IN ($1::text, $2)
      )
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [targetIso, targetCompact],
  );
  return rows[0] ? pipelineRunFromRow(rows[0]) : null;
}

async function loadNavPositionsFeed(
  parts: LocalDateTimeParts,
  pipelineRuns: ReadonlyMap<PipelineRunKey, InternalPipelineRun>,
  reviewBusinessDate: string | null = null,
): Promise<PositionsHomeFeedStatus> {
  try {
    const today = localDate(parts);
    const exactReview = reviewBusinessDate !== null;
    const targetDate = reviewBusinessDate ?? previousBusinessDate(today);
    const targetNotApplicable =
      exactReview && (!isBusinessDate(targetDate) || targetDate >= today);
    const rows = await query<NavPositionDbRow>(
      `
      SELECT
        to_char(nav_date, 'YYYY-MM-DD') AS nav_date,
        fund_code,
        account_group,
        count(*)::integer AS row_count,
        max(sftp_upload_timestamp)::text AS latest_upload_at,
        max(created_at)::text AS latest_loaded_at,
        max(updated_at)::text AS latest_updated_at
      FROM nav.positions
      WHERE nav_date >= ($1::date - INTERVAL '10 days')
        AND nav_date <= $1::date
      GROUP BY nav_date, fund_code, account_group
      ORDER BY nav_date DESC, account_group, fund_code
      `,
      [targetDate],
    );

    const latestDate = [...new Set(rows.map((row) => row.nav_date))].sort().at(-1) ?? null;
    const targetRows = rows.filter((row) => row.nav_date === targetDate);
    const loadedFunds = new Set(
      targetRows
        .filter((row) => toInteger(row.row_count) > 0)
        .map((row) => row.fund_code.toLowerCase()),
    );
    const missingFunds = EXPECTED_NAV_FUNDS.filter((fund) => !loadedFunds.has(fund.code));
    const hasAllTargetFunds = missingFunds.length === 0;
    const targetRowCount = targetRows.reduce(
      (total, row) => total + toInteger(row.row_count),
      0,
    );
    const latestRows = latestDate ? rows.filter((row) => row.nav_date === latestDate) : [];
    const latestRowCount = latestRows.reduce(
      (total, row) => total + toInteger(row.row_count),
      0,
    );
    const latestUpdateAt = maxTimestamp(
      (targetRows.length > 0 ? targetRows : latestRows).flatMap((row) => [
        row.latest_upload_at,
        row.latest_loaded_at,
        row.latest_updated_at,
      ]),
    );
    const status: PositionsHomeStatus =
      targetNotApplicable
        ? "not_applicable"
        : rows.length === 0
        ? "missing"
        : hasAllTargetFunds
          ? "stable"
          : exactReview
            ? "missing"
            : parts.hour < 11
            ? "watch"
            : "stale";
    const navDateRule = exactReview
      ? `Expected NAV date: ${targetDate} (business-date review).`
      : `Expected NAV date: ${targetDate} (previous business day).`;
    const detail =
      status === "not_applicable"
        ? `NAV ${targetDate} is N/A until the next business morning.`
        : status === "stable"
        ? `${navDateRule} All ${EXPECTED_NAV_FUNDS.length} sources loaded.`
        : rows.length === 0
          ? `${navDateRule} No recent NAV rows found.`
          : `${navDateRule} Missing ${missingFunds.map((fund) => fund.code).join(", ")}.`;
    const lastPipelineRun = pipelineRuns.get("nav_positions") ?? null;

    return {
      id: "nav_positions",
      label: "NAV Positions",
      status,
      statusLabel: statusLabel(status),
      sourceSystem: "NAV SFTP Position Valuation Detail Report",
      sourceTable: "nav.positions",
      expectedArtifact: `Position Valuation Detail Report_${compactDate(targetDate)}_<legal entity>.xlsx`,
      targetDate,
      targetDateLabel: targetDate,
      latestDate,
      latestDateLabel: latestDate ?? "--",
      latestUpdateAt,
      latestUpdateLabel: formatTimestamp(latestUpdateAt),
      rowCount: targetRowCount || latestRowCount,
      rowCountLabel: formatCount(targetRowCount || latestRowCount),
      detail,
      actionSection: "nav-positions",
      manual: false,
      metrics: [
        {
          label: "Funds Loaded",
          value: `${loadedFunds.size}/${EXPECTED_NAV_FUNDS.length}`,
          status,
        },
        {
          label: "Expected Funds",
          value: EXPECTED_NAV_FUNDS.map((fund) => fund.code).join(", "),
        },
        pipelineMetric(lastPipelineRun),
      ],
      sourceRows: EXPECTED_NAV_FUNDS.map((fund) => {
        const row =
          targetRows.find((candidate) => candidate.fund_code.toLowerCase() === fund.code) ??
          latestRows.find((candidate) => candidate.fund_code.toLowerCase() === fund.code);
        const rowStatus: PositionsHomeStatus =
          targetNotApplicable
            ? "not_applicable"
            : row && row.nav_date === targetDate && toInteger(row.row_count) > 0
            ? "stable"
            : rows.length === 0
              ? "missing"
              : exactReview
                ? "missing"
                : parts.hour < 11
                ? "watch"
                : "stale";
        const loadedAt = row?.latest_loaded_at ?? row?.latest_updated_at ?? null;
        const source = row?.account_group ?? fund.legalEntity;
        const sourceDetail =
          rowStatus === "not_applicable"
            ? `${source} NAV date ${targetDate} is not due yet.`
            : rowStatus === "stable"
            ? `${source} latest date matches expected NAV date ${targetDate}.`
            : rows.length === 0
              ? `${source} has no recent NAV rows. Expected ${targetDate}.`
              : rowStatus === "watch"
                ? `${source} has not loaded expected NAV date ${targetDate}; polling until 11:00 MT.`
                : `${source} is missing expected NAV date ${targetDate} after 11:00 MT.`;
        return {
          source,
          latestDate: row?.nav_date ?? null,
          latestDateLabel: row?.nav_date ?? "--",
          loadedAt,
          loadedLabel: formatTimestamp(loadedAt),
          rowCount: toInteger(row?.row_count),
          rowCountLabel: formatCount(toInteger(row?.row_count)),
          status: rowStatus,
          statusLabel: statusLabel(rowStatus),
          detail: sourceDetail,
        };
      }),
      lastPipelineRun: publicPipelineRun(lastPipelineRun),
    };
  } catch (error) {
    return errorFeedStatus("nav_positions", "NAV Positions", "nav-positions", error);
  }
}

async function loadClearStreetFeed(
  parts: LocalDateTimeParts,
  pipelineRuns: ReadonlyMap<PipelineRunKey, InternalPipelineRun>,
  reviewBusinessDate: string | null = null,
): Promise<PositionsHomeFeedStatus> {
  try {
    const expectation = clearStreetExpectation(parts, reviewBusinessDate);
    const cutoff = compactDate(addDays(expectation.targetIso, -10));
    const rows = await query<ClearStreetDbRow>(
      `
      SELECT
        trade_date_from_sftp,
        count(*)::integer AS row_count,
        max(sftp_upload_timestamp)::text AS latest_upload_at,
        max(updated_at)::text AS latest_updated_at
      FROM clear_street.eod_transactions
      WHERE trade_date_from_sftp >= $1
        AND trade_date_from_sftp <= $2
      GROUP BY trade_date_from_sftp
      ORDER BY trade_date_from_sftp DESC
      LIMIT 10
      `,
      [cutoff, expectation.targetSftpDate],
    );

    const targetRow = rows.find(
      (row) => row.trade_date_from_sftp === expectation.targetSftpDate,
    );
    const latestRow = rows[0] ?? null;
    const latestDate = expandedDate(latestRow?.trade_date_from_sftp) ?? null;
    const sourceLatestUpdateAt = maxTimestamp([
      targetRow?.latest_upload_at,
      targetRow?.latest_updated_at,
      latestRow?.latest_upload_at,
      latestRow?.latest_updated_at,
    ]);
    const targetLoaded = toInteger(targetRow?.row_count) > 0;
    const sourceStatus: PositionsHomeStatus =
      expectation.notApplicable
        ? "not_applicable"
        : rows.length === 0
        ? "missing"
        : targetLoaded
          ? "stable"
          : expectation.inActiveWindow
            ? "watch"
            : "stale";
    const rowCount = toInteger(targetRow?.row_count) || toInteger(latestRow?.row_count);
    const sourceRow = targetRow ?? latestRow;
    const sourceLatestDate = expandedDate(sourceRow?.trade_date_from_sftp) ?? null;
    const sourceLoadedAt =
      sourceRow?.latest_updated_at ?? sourceRow?.latest_upload_at ?? null;
    const sourceDetail =
      sourceStatus === "not_applicable"
        ? expectation.ruleText
        : sourceStatus === "stable"
        ? `Clear Street source matches latest due business date ${expectation.targetIso}.`
        : rows.length === 0
          ? `${expectation.ruleText} No recent Clear Street rows found.`
          : expectation.inActiveWindow
            ? `Clear Street has not loaded expected source date ${expectation.targetIso}; polling until 05:00 MT.`
            : `Clear Street is missing expected source date ${expectation.targetIso}.`;
    const lastPipelineRun = pipelineRuns.get("clear_street_trades") ?? null;
    const titanRun =
      !expectation.notApplicable
        ? await loadClearStreetTitanUploadRun(expectation.targetIso)
        : null;
    const titanExpectedDate = normalizedTelemetryDate(
      metadataValue(titanRun, [
        "expected_trade_date",
        "expected_trade_date_from_sftp",
        "clear_street_target_trade_date",
      ]),
    );
    const titanExportDate = normalizedTelemetryDate(
      metadataValue(titanRun, ["export_trade_date", "trade_date", "sftp_date"]),
    );
    const titanLatestDate = titanExportDate ?? titanExpectedDate;
    const titanRunStatus = titanRun?.status?.toLowerCase() ?? null;
    const titanMatchesTarget = titanLatestDate === expectation.targetIso;
    const titanStatus: PositionsHomeStatus = expectation.notApplicable
      ? "not_applicable"
      : !targetLoaded
        ? sourceStatus
      : !titanRun
        ? expectation.inActiveWindow
          ? "watch"
          : "stale"
        : titanMatchesTarget && titanRunStatus === "success"
          ? "stable"
          : titanMatchesTarget && titanRunStatus === "failure"
            ? "error"
            : titanMatchesTarget
              ? "watch"
              : expectation.inActiveWindow
                ? "watch"
                : "stale";
    const titanRows = toInteger(titanRun?.rowsWritten);
    const titanDetail =
      titanStatus === "not_applicable"
        ? expectation.ruleText
        : titanStatus === "stable"
        ? `Clear Street -> Titan upload completed for expected source date ${expectation.targetIso}.`
        : !targetLoaded
          ? `Waiting for Clear Street source date ${expectation.targetIso} before the Titan upload can run.`
          : !titanRun
            ? `Clear Street source is loaded for ${expectation.targetIso}, but no Titan upload telemetry was found.`
            : titanRunStatus === "failure"
              ? `Clear Street -> Titan upload failed for ${expectation.targetIso}: ${titanRun.errorMessage ?? titanRun.errorType ?? "see telemetry"}.`
              : `Latest Clear Street -> Titan upload is for ${titanLatestDate ?? "--"}; expected ${expectation.targetIso}.`;
    const sourceRows: PositionsHomeFeedSourceRow[] = [
      {
        source: "Helios_Transactions",
        latestDate: sourceLatestDate,
        latestDateLabel: sourceLatestDate ?? "--",
        loadedAt: sourceLoadedAt,
        loadedLabel: formatTimestamp(sourceLoadedAt),
        rowCount: toInteger(sourceRow?.row_count),
        rowCountLabel: formatCount(toInteger(sourceRow?.row_count)),
        status: sourceStatus,
        statusLabel: statusLabel(sourceStatus),
        detail: sourceDetail,
      },
      {
        source: "Clear Street -> Titan",
        latestDate: titanLatestDate,
        latestDateLabel: titanLatestDate ?? "--",
        loadedAt: titanRun?.createdAt ?? null,
        loadedLabel: formatTimestamp(titanRun?.createdAt ?? null),
        rowCount: titanRows,
        rowCountLabel: formatCount(titanRows),
        status: titanStatus,
        statusLabel: statusLabel(titanStatus),
        detail: titanDetail,
      },
    ];
    const status = expectation.notApplicable
      ? "not_applicable"
      : worstStatus(sourceRows.map((row) => row.status));
    const latestUpdateAt = maxTimestamp([sourceLatestUpdateAt, titanRun?.createdAt]);
    const detail =
      status === "stable"
        ? `${expectation.ruleText} Source loaded and Titan upload completed.`
        : sourceStatus !== "stable"
          ? sourceDetail
          : titanDetail;

    return {
      id: "clear_street_trades",
      label: "Clear Street Trades",
      status,
      statusLabel: statusLabel(status),
      sourceSystem: "Clear Street SFTP Helios_Transactions CSV",
      sourceTable: "clear_street.eod_transactions",
      expectedArtifact: `Helios_Transactions_${expectation.targetSftpDate}.csv`,
      targetDate: expectation.targetIso,
      targetDateLabel: expectation.targetIso,
      latestDate,
      latestDateLabel: latestDate ?? "--",
      latestUpdateAt,
      latestUpdateLabel: formatTimestamp(latestUpdateAt),
      rowCount,
      rowCountLabel: formatCount(rowCount),
      detail,
      actionSection: "clear-street-trades",
      manual: false,
      metrics: [
        {
          label: "Window",
          value: expectation.inActiveWindow ? "Active until 05:00" : "Last overnight file",
        },
        {
          label: "SFTP Date",
          value: expectation.targetSftpDate,
          status,
        },
        pipelineMetric(lastPipelineRun),
      ],
      sourceRows,
      lastPipelineRun: publicPipelineRun(lastPipelineRun),
    };
  } catch (error) {
    return errorFeedStatus(
      "clear_street_trades",
      "Clear Street Trades",
      "clear-street-trades",
      error,
    );
  }
}

async function loadIceTradeBlotterFeed(
  parts: LocalDateTimeParts,
  pipelineRuns: ReadonlyMap<PipelineRunKey, InternalPipelineRun>,
  reviewBusinessDate: string | null = null,
): Promise<PositionsHomeFeedStatus> {
  try {
    const today = localDate(parts);
    const exactReview = reviewBusinessDate !== null;
    const targetNotApplicable =
      exactReview && (!isBusinessDate(reviewBusinessDate) || reviewBusinessDate > today);
    const rows = await query<IceTradeBlotterDbRow>(
      `
      SELECT
        to_char(trades.trade_date, 'YYYY-MM-DD') AS trade_date,
        count(*)::integer AS row_count,
        count(DISTINCT NULLIF(BTRIM(trades.deal_id), ''))::integer AS distinct_deal_count,
        max(manifest.loaded_at)::text AS latest_loaded_at,
        max(trades.updated_at)::text AS latest_updated_at
      FROM ice_trade_blotter.ice_trade_blotter AS trades
      LEFT JOIN ice_trade_blotter.file_manifest AS manifest
        ON manifest.file_hash = trades.file_hash
      WHERE ($1::date IS NULL OR trades.trade_date <= $1::date)
      GROUP BY trades.trade_date
      ORDER BY trades.trade_date DESC
      LIMIT 10
    `,
      [reviewBusinessDate],
    );
    const targetRow = reviewBusinessDate
      ? rows.find((candidate) => candidate.trade_date === reviewBusinessDate) ?? null
      : null;
    const latestRow = rows[0] ?? null;
    const row = targetRow ?? latestRow;
    const latestDate = row?.trade_date ?? null;
    const rowCount = toInteger(row?.row_count);
    const businessAge =
      latestDate && today ? businessDaysBetween(latestDate, today) : Number.POSITIVE_INFINITY;
    const status: PositionsHomeStatus =
      targetNotApplicable
        ? "not_applicable"
        : exactReview
          ? targetRow && rowCount > 0
            ? "stable"
            : "missing"
          : !row || rowCount <= 0
            ? "missing"
            : businessAge <= 2
              ? "stable"
              : "watch";
    const latestUpdateAt = maxTimestamp([row?.latest_loaded_at, row?.latest_updated_at]);
    const detail =
      status === "not_applicable"
        ? `ICE Trade Blotter ${reviewBusinessDate} is N/A.`
        : exactReview && status === "stable"
          ? `ICE Deal Report is loaded for selected business date ${reviewBusinessDate}.`
          : exactReview
            ? `No ICE Deal Report rows were found for selected business date ${reviewBusinessDate}.`
            : status === "stable"
              ? `Latest manual ICE blotter load is within ${businessAge} business day(s).`
              : status === "missing"
                ? "No ICE trade blotter rows were found."
                : `Latest manual ICE blotter date is ${businessAge} business day(s) behind local today.`;
    const sourceLoadedAt = row?.latest_loaded_at ?? row?.latest_updated_at ?? null;
    const sourceDetail =
      status === "not_applicable"
        ? `ICE Deal Report ${reviewBusinessDate} is not due.`
        : exactReview && status === "stable"
          ? `ICE Deal Report matches selected business date ${reviewBusinessDate}.`
          : exactReview
            ? `ICE Deal Report is missing selected business date ${reviewBusinessDate}.`
            : status === "stable"
              ? `ICE Deal Report latest date is within ${businessAge} business day(s) of local today.`
              : status === "missing"
                ? "ICE Deal Report has no rows."
                : `ICE Deal Report latest date is ${businessAge} business day(s) behind local today.`;
    const lastPipelineRun = pipelineRuns.get("ice_trade_blotter") ?? null;

    return {
      id: "ice_trade_blotter",
      label: "ICE Trade Blotter",
      status,
      statusLabel: statusLabel(status),
      sourceSystem: "Manual ICE Deal Report load",
      sourceTable: "ice_trade_blotter.ice_trade_blotter",
      expectedArtifact: "ICE Deal Report .xls/.csv via managed local-file workflow",
      targetDate: reviewBusinessDate,
      targetDateLabel: reviewBusinessDate ?? "Manual load",
      latestDate,
      latestDateLabel: latestDate ?? "--",
      latestUpdateAt,
      latestUpdateLabel: formatTimestamp(latestUpdateAt),
      rowCount,
      rowCountLabel: formatCount(rowCount),
      detail,
      actionSection: "ice-trade-blotter",
      manual: true,
      metrics: [
        {
          label: "Business Age",
          value: Number.isFinite(businessAge) ? `${businessAge}` : "--",
          status,
        },
        {
          label: "Deals",
          value: formatCount(toInteger(row?.distinct_deal_count)),
        },
        pipelineMetric(lastPipelineRun),
      ],
      sourceRows: [
        {
          source: "ICE Deal Report",
          latestDate,
          latestDateLabel: latestDate ?? "--",
          loadedAt: sourceLoadedAt,
          loadedLabel: formatTimestamp(sourceLoadedAt),
          rowCount,
          rowCountLabel: formatCount(rowCount),
          status,
          statusLabel: statusLabel(status),
          detail: sourceDetail,
        },
      ],
      lastPipelineRun: publicPipelineRun(lastPipelineRun),
    };
  } catch (error) {
    return errorFeedStatus(
      "ice_trade_blotter",
      "ICE Trade Blotter",
      "ice-trade-blotter",
      error,
    );
  }
}

async function loadReferenceStatus(generatedAt: string): Promise<PositionsHomeReferenceStatus> {
  let docs = fallbackReferenceDocs();
  try {
    docs = referenceDocsFromManifest(await loadPositionsAndTradesManifest());
  } catch {
    // Keep Home source-health rendering independent from local manifest availability.
  }

  return {
    status: "stable",
    statusLabel: statusLabel("stable"),
    needsRepair: false,
    summary: "Model validation loads separately.",
    detail:
      "Model validation is loaded from the cached Positions Home validation endpoint.",
    tables: [],
    checks: [],
    validationChecks: deferredPositionsHomeValidationChecks(),
    lastCheckedAt: generatedAt,
    docs,
  };
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request) => {
  const now = new Date();
  const generatedAt = now.toISOString();
  const parts = localParts(now);
  const currentLocalDate = localDate(parts);
  const searchParams = new URL(request.url).searchParams;
  const businessDateParam = searchParams.get("businessDate");
  const forceRefresh = searchParams.has("refresh");
  const reviewBusinessDate = validIsoDate(businessDateParam);
  if (businessDateParam && !reviewBusinessDate) {
    throw new Error(`Invalid businessDate parameter: ${businessDateParam}`);
  }
  const reviewMode = reviewBusinessDate ? "business_date" : "latest_due";
  const defaultReviewDate = clearStreetExpectation(parts).targetIso;
  const pipelineRuns = await loadLatestPipelineRuns();
  const [navPositions, clearStreetTrades, iceTradeBlotter, reference] =
    await Promise.all([
      loadNavPositionsFeed(parts, pipelineRuns, reviewBusinessDate),
      loadClearStreetFeed(parts, pipelineRuns, reviewBusinessDate),
      loadIceTradeBlotterFeed(parts, pipelineRuns, reviewBusinessDate),
      loadReferenceStatus(generatedAt),
    ]);
  const feeds = [navPositions, clearStreetTrades, iceTradeBlotter];
  const overallStatus = worstStatus(feeds.map((feed) => feed.status));
  const unstableCount = feeds.filter((feed) => needsAttention(feed.status)).length;
  const payload: PositionsHomePayload = {
    source: "positions-home",
    generatedAt,
    localDate: currentLocalDate,
    localTimeZone: LOCAL_TIME_ZONE,
    reviewMode,
    reviewDate: reviewBusinessDate ?? defaultReviewDate,
    overallStatus,
    overallStatusLabel: statusLabel(overallStatus),
    summary:
      unstableCount === 0
        ? "All positions feeds are current."
        : `${unstableCount} positions health area(s) need attention.`,
    feeds,
    reference,
  };

  return {
    payload,
    headers: responseCacheHeaders(forceRefresh),
    rowCount: feeds.reduce((total, feed) => total + feed.rowCount, 0),
    dataAsOf:
      maxTimestamp([
        ...feeds.map((feed) => feed.latestUpdateAt),
      ]) ?? generatedAt,
  };
});
