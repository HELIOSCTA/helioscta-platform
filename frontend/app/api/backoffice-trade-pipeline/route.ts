import { observedJsonRoute, type ObservedRouteResult } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import {
  loadPromotedAllHistorySql,
  selectedClearStreetTradesCte,
} from "@/lib/server/clearStreetTradesSql";
import {
  getCachedRouteValue,
  normalizedSearchCacheKey,
  routeCacheHeaders,
} from "@/lib/server/routeCache";
import type {
  BackOfficeTradePipelineArtifactRow,
  BackOfficeTradePipelineAvailableDate,
  BackOfficeTradePipelineDelivery,
  BackOfficeTradePipelineMonitoringRow,
  BackOfficeTradePipelinePayload,
  BackOfficeTradePipelinePreviewRow,
  BackOfficeTradePipelineSummary,
  BackOfficeTradePipelineWatch,
} from "@/lib/positionsAndTrades/backOfficeTradePipelineTypes";

export const runtime = "nodejs";
export const maxDuration = 30;

const LATEST_CACHE_TTL_SECONDS = 60;
const DATE_PREVIEW_CACHE_TTL_SECONDS = 15 * 60;
const STALE_IF_ERROR_MS = 30 * 60 * 1000;
const CACHE_HEADER = `private, max-age=${LATEST_CACHE_TTL_SECONDS}, stale-while-revalidate=${LATEST_CACHE_TTL_SECONDS}`;
const NO_STORE_HEADER = "no-store";
const BUSINESS_TIME_ZONE = "America/New_York";
const LOCAL_DISPLAY_TIME_ZONE = "America/Denver";
const TITAN_EXPORT_WHERE = "give_in_out_firm_num in ('ADU', '905')";
const SOURCE_CHECKS =
  "Sources: promoted Clear Street all-history model, clear_street.eod_transactions, and ops.api_fetch_log MUFG telemetry";

interface DateSummaryRow {
  sftp_date: string;
  raw_row_count: number | string;
  titan_row_count: number | string;
  latest_upload_at: string | null;
  latest_updated_at: string | null;
}

interface PreviewDbRow {
  sftp_date: string | null;
  clear_street_row_family: string | null;
  account_display_name: string | null;
  account_code: string | null;
  source_account_key: string | null;
  account_number: string | null;
  give_in_out_code: string | null;
  trace_num_or_unique_identifier: string | null;
  order_number: string | null;
  give_in_out_firm_num: string | null;
  account_lookup_status: string | null;
  trade_type: string | null;
  open_close_code: string | null;
  give_io_charge: string | number | null;
  allocation_total_group_qty: string | number | null;
  allocation_total_match_status: string | null;
  allocation_total_match_source: string | null;
  allocation_total_match_qty: string | number | null;
  product_code: string | null;
  product_family: string | null;
  market_name: string | null;
  contract_yyyymm: string | null;
  contract_day: string | null;
  put_call_code: string | null;
  strike_price_normalized: string | number | null;
  buy_sell_cleaned: string | null;
  quantity_cleaned: string | number | null;
  trade_price: string | number | null;
  rule_status: string | null;
  rule_match_source: string | null;
  ice_product_code: string | null;
  cme_product_code: string | null;
  bbg_product_code: string | null;
}

interface TelemetryRow {
  created_at: string;
  provider: string | null;
  pipeline_name: string | null;
  operation_name: string | null;
  target_table: string | null;
  status: string | null;
  rows_written: number | string | null;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
}

interface TelemetryByDate {
  raw?: TelemetryRow;
  mufg?: TelemetryRow;
}

function responseHeaders(forceRefresh: boolean, cacheTtlSeconds = LATEST_CACHE_TTL_SECONDS): HeadersInit {
  return {
    "Cache-Control": forceRefresh
      ? NO_STORE_HEADER
      : `private, max-age=${cacheTtlSeconds}, stale-while-revalidate=${cacheTtlSeconds}`,
    "Vercel-CDN-Cache-Control": NO_STORE_HEADER,
    "X-Helios-Cache-Policy": forceRefresh
      ? "no-store"
      : `browser-cache=${cacheTtlSeconds}, vercel-cdn no-store`,
  };
}

function toNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function metadataText(row: TelemetryRow | undefined, key: string): string | null {
  return cleanText(row?.metadata?.[key]);
}

function metadataNumber(row: TelemetryRow | undefined, key: string): number {
  return toNumber(row?.metadata?.[key]);
}

function formatDateParam(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function formatDateOnly(value: string | null): string {
  if (!value) return "--";
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimestamp(value: string | null, timeZone = LOCAL_DISPLAY_TIME_ZONE): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function localIsoDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function yyyymmdd(value: string): string {
  return value.replaceAll("-", "");
}

function clearStreetSelectedArgs(selectedDate: string): unknown[] {
  return [selectedDate, [], [], [], [], [], null];
}

function defaultTitanFile(value: string): string {
  return `helios_transactions_v3_${yyyymmdd(value)}_filtered.csv`;
}

function normalizeTelemetryDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }
  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function telemetryTradeDate(row: TelemetryRow): string | null {
  const metadata = row.metadata ?? {};
  const candidates = [
    metadata.trade_date,
    metadata.export_trade_date,
    metadata.target_trade_date,
    metadata.target_trade_date_from_sftp,
    metadata.expected_trade_date,
    metadata.expected_trade_date_from_sftp,
    metadata.trade_date_from_sftp,
    metadata.sftp_date,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeTelemetryDate(cleanText(candidate));
    if (normalized) return normalized;
  }
  return normalizeTelemetryDate(row.created_at);
}

function isMufgTelemetry(row: TelemetryRow): boolean {
  const text = `${row.provider ?? ""} ${row.pipeline_name ?? ""} ${row.operation_name ?? ""} ${row.target_table ?? ""}`.toLowerCase();
  return text.includes("mufg");
}

function isRawTelemetry(row: TelemetryRow): boolean {
  const text = `${row.provider ?? ""} ${row.pipeline_name ?? ""} ${row.operation_name ?? ""} ${row.target_table ?? ""}`.toLowerCase();
  return text.includes("clear_street") && !text.includes("mufg") && text.includes("eod");
}

function mapTelemetry(rows: TelemetryRow[]): Map<string, TelemetryByDate> {
  const byDate = new Map<string, TelemetryByDate>();
  for (const row of rows) {
    const date = telemetryTradeDate(row);
    if (!date) continue;
    const existing = byDate.get(date) ?? {};
    if (isMufgTelemetry(row) && !existing.mufg) existing.mufg = row;
    if (isRawTelemetry(row) && row.status?.toLowerCase() === "success" && !existing.raw) {
      existing.raw = row;
    }
    byDate.set(date, existing);
  }
  return byDate;
}

async function loadDateSummaries(): Promise<BackOfficeTradePipelineAvailableDate[]> {
  const rows = await query<DateSummaryRow>(`
    WITH latest_upload_by_date AS (
      SELECT
        trade_date_from_sftp,
        max(sftp_upload_timestamp) AS sftp_upload_timestamp
      FROM clear_street.eod_transactions
      WHERE trade_date_from_sftp ~ '^[0-9]{8}$'
      GROUP BY trade_date_from_sftp
    ),
    model AS (
      SELECT
        to_date(source_rows.trade_date_from_sftp, 'YYYYMMDD')::date AS sftp_date,
        source_rows.give_in_out_firm_num,
        source_rows.sftp_upload_timestamp,
        source_rows.updated_at
      FROM clear_street.eod_transactions AS source_rows
      INNER JOIN latest_upload_by_date
        ON latest_upload_by_date.trade_date_from_sftp = source_rows.trade_date_from_sftp
       AND latest_upload_by_date.sftp_upload_timestamp IS NOT DISTINCT FROM source_rows.sftp_upload_timestamp
      WHERE source_rows.trade_date_from_sftp ~ '^[0-9]{8}$'
    )
    SELECT
      sftp_date::text AS sftp_date,
      count(*)::integer AS raw_row_count,
      count(*) FILTER (WHERE ${TITAN_EXPORT_WHERE})::integer AS titan_row_count,
      max(sftp_upload_timestamp)::text AS latest_upload_at,
      max(updated_at)::text AS latest_updated_at
    FROM model
    GROUP BY sftp_date
    ORDER BY sftp_date DESC
    LIMIT 160
  `);
  return rows.map((row) => ({
    sftpDate: row.sftp_date,
    rawRowCount: toNumber(row.raw_row_count),
    titanRowCount: toNumber(row.titan_row_count),
    latestUploadAt: row.latest_upload_at ?? row.latest_updated_at,
  }));
}

async function loadPreviewRows(
  selectedDate: string,
  promotedSql: string,
): Promise<BackOfficeTradePipelinePreviewRow[]> {
  const rows = await query<PreviewDbRow>(
    `
    ${selectedClearStreetTradesCte(promotedSql)}
    SELECT
      source_rows.sftp_date::text AS sftp_date,
      source_rows.clear_street_row_family,
      source_rows.account_display_name,
      source_rows.account_code,
      source_rows.source_account_key,
      source_rows.account_number,
      source_rows.give_in_out_code,
      source_rows.trace_num_or_unique_identifier,
      source_rows.order_number,
      source_rows.give_in_out_firm_num,
      source_rows.account_lookup_status,
      source_rows.trade_type,
      source_rows.open_close_code,
      source_rows.give_io_charge,
      source_rows.allocation_total_group_qty,
      source_rows.allocation_total_match_status,
      source_rows.allocation_total_match_source,
      source_rows.allocation_total_match_qty,
      source_rows.product_code,
      source_rows.product_family,
      source_rows.market_name,
      source_rows.contract_yyyymm,
      source_rows.contract_day,
      source_rows.put_call_code,
      source_rows.strike_price_normalized,
      source_rows.buy_sell_cleaned,
      source_rows.quantity_cleaned,
      source_rows.trade_price,
      source_rows.rule_status,
      source_rows.rule_match_source,
      source_rows.ice_product_code,
      CASE
        WHEN source_rows.route_family = 'ice' THEN NULL
        ELSE source_rows.cme_product_code
      END AS cme_product_code,
      CASE
        WHEN source_rows.route_family = 'ice' THEN NULL
        ELSE source_rows.bbg_product_code
      END AS bbg_product_code
    FROM source_trades AS source_rows
    WHERE ${TITAN_EXPORT_WHERE}
    ORDER BY
      source_rows.row_number_for_trades NULLS LAST,
      source_rows.record_id
    LIMIT 12
    `,
    clearStreetSelectedArgs(selectedDate),
  );
  return rows.map((row) => {
    return {
      sftpDate: row.sftp_date,
      rowFamily: row.clear_street_row_family,
      accountDisplayName: row.account_display_name,
      accountCode: row.account_code,
      sourceAccountKey: row.source_account_key,
      accountNumber: row.account_number,
      giveInOutCode: row.give_in_out_code,
      traceNumOrUniqueIdentifier: row.trace_num_or_unique_identifier,
      orderNumber: row.order_number,
      giveInOutFirmNum: row.give_in_out_firm_num,
      accountLookupStatus: row.account_lookup_status,
      tradeType: row.trade_type,
      openCloseCode: row.open_close_code,
      giveIoCharge: row.give_io_charge,
      allocationTotalGroupQty: row.allocation_total_group_qty,
      allocationTotalMatchStatus: row.allocation_total_match_status,
      allocationTotalMatchSource: row.allocation_total_match_source,
      allocationTotalMatchQty: row.allocation_total_match_qty,
      productCode: row.product_code,
      productFamily: row.product_family,
      marketName: row.market_name,
      contractYyyymm: row.contract_yyyymm,
      contractDay: row.contract_day,
      putCallCode: row.put_call_code,
      strikePriceNormalized: row.strike_price_normalized,
      buySellCleaned: row.buy_sell_cleaned,
      quantityCleaned: row.quantity_cleaned,
      tradePrice: row.trade_price,
      ruleStatus: row.rule_status,
      ruleMatchSource: row.rule_match_source,
      iceProductCode: row.ice_product_code,
      cmeProductCode: row.cme_product_code,
      bbgProductCode: row.bbg_product_code,
    };
  });
}

async function loadTelemetry(): Promise<TelemetryRow[]> {
  return query<TelemetryRow>(`
    SELECT
      created_at::text AS created_at,
      provider,
      pipeline_name,
      operation_name,
      target_table,
      status,
      rows_written,
      metadata,
      error_message
    FROM ops.api_fetch_log
    WHERE created_at >= now() - INTERVAL '180 days'
      AND (
        lower(coalesce(provider, '')) LIKE '%clear_street%'
        OR lower(coalesce(pipeline_name, '')) LIKE '%clear_street%'
        OR lower(coalesce(operation_name, '')) LIKE '%clear_street%'
        OR lower(coalesce(target_table, '')) LIKE '%clear_street%'
        OR lower(coalesce(provider, '')) LIKE '%mufg%'
        OR lower(coalesce(pipeline_name, '')) LIKE '%mufg%'
        OR lower(coalesce(operation_name, '')) LIKE '%mufg%'
        OR lower(coalesce(target_table, '')) LIKE '%mufg%'
      )
    ORDER BY created_at DESC
    LIMIT 500
  `);
}

function warningCount(mufg: TelemetryRow | undefined): number {
  const nullCheck = mufg?.metadata?.product_code_null_check;
  return (
    nullCheck && typeof nullCheck === "object" && !Array.isArray(nullCheck)
      ? toNumber((nullCheck as Record<string, unknown>).null_rows)
      : 0
  );
}

function artifactFile(date: string, mufg: TelemetryRow | undefined): string {
  return (
    metadataText(mufg, "remote_filename") ??
    metadataText(mufg, "filename") ??
    defaultTitanFile(date)
  );
}

function buildRecentMonitoring({
  latestDate,
  dates,
  telemetryByDate,
}: {
  latestDate: string | null;
  dates: BackOfficeTradePipelineAvailableDate[];
  telemetryByDate: Map<string, TelemetryByDate>;
}): BackOfficeTradePipelineMonitoringRow[] {
  const dateMap = new Map(dates.map((date) => [date.sftpDate, date]));
  if (!latestDate) return [];
  return Array.from({ length: 10 }, (_, index) => addDays(latestDate, -index)).map((businessDate) => {
    const date = dateMap.get(businessDate);
    const telemetry = telemetryByDate.get(businessDate);
    const rawReceivedAt =
      metadataText(telemetry?.raw, "latest_sftp_upload_timestamp") ?? date?.latestUploadAt ?? null;
    const rawLoadedAt = telemetry?.raw?.created_at ?? date?.latestUploadAt ?? null;
    const titanReadyAt = telemetry?.mufg?.created_at ?? null;
    const rowsUploaded = metadataNumber(telemetry?.mufg, "rows_uploaded") || toNumber(telemetry?.mufg?.rows_written);
    const titanRows = date?.titanRowCount ?? rowsUploaded;
    const rowsLabel = titanRows > 0 ? `${rowsUploaded || titanRows}/${titanRows}` : "-";
    return {
      businessDate,
      businessDateLabel: formatDateOnly(businessDate),
      rawReceivedAt,
      rawReceivedLabel: formatTimestamp(rawReceivedAt),
      rawLoadedAt,
      rawLoadedLabel: formatTimestamp(rawLoadedAt),
      titanReadyAt,
      titanReadyLabel: formatTimestamp(titanReadyAt),
      rowsLabel,
      warnings: warningCount(telemetry?.mufg),
    };
  });
}

function buildArtifacts({
  dates,
  telemetryByDate,
}: {
  dates: BackOfficeTradePipelineAvailableDate[];
  telemetryByDate: Map<string, TelemetryByDate>;
}): BackOfficeTradePipelineArtifactRow[] {
  return dates
    .filter((date) => date.titanRowCount > 0)
    .slice(0, 10)
    .map((date) => {
      const mufg = telemetryByDate.get(date.sftpDate)?.mufg;
      const rowsUploaded = metadataNumber(mufg, "rows_uploaded") || toNumber(mufg?.rows_written);
      const builtAt = mufg?.created_at ?? date.latestUploadAt;
      const file = artifactFile(date.sftpDate, mufg);
      const rowsLabel = `${rowsUploaded || date.titanRowCount}/${date.titanRowCount}`;
      return {
        businessDate: date.sftpDate,
        businessDateLabel: formatDateOnly(date.sftpDate),
        editedFile: file,
        builtAt,
        builtAtLabel: formatTimestamp(builtAt),
        rowsLabel,
        warnings: warningCount(mufg),
      };
    });
}

function buildSummary({
  selectedDate,
  dateMeta,
  mufg,
}: {
  selectedDate: string | null;
  dateMeta: BackOfficeTradePipelineAvailableDate | undefined;
  mufg: TelemetryRow | undefined;
}): BackOfficeTradePipelineSummary {
  const rowsUploaded = metadataNumber(mufg, "rows_uploaded") || toNumber(mufg?.rows_written);
  const titanRows = dateMeta?.titanRowCount ?? rowsUploaded;
  const file = selectedDate ? artifactFile(selectedDate, mufg) : null;
  const builtAt = mufg?.created_at ?? dateMeta?.latestUploadAt ?? null;
  return {
    businessDate: selectedDate,
    businessDateLabel: formatDateOnly(selectedDate),
    updatedAt: builtAt,
    updatedLabel: formatTimestamp(builtAt),
    titanRows,
    matchedRows: rowsUploaded || titanRows,
    artifactFile: file,
    builtAt,
    builtAtLabel: formatTimestamp(builtAt),
    artifactRowsLabel: titanRows > 0 ? `${rowsUploaded || titanRows}/${titanRows}` : "-",
  };
}

function buildDelivery({
  selectedDate,
  summary,
  mufg,
}: {
  selectedDate: string | null;
  summary: BackOfficeTradePipelineSummary;
  mufg: TelemetryRow | undefined;
}): BackOfficeTradePipelineDelivery {
  const success = mufg?.status?.toLowerCase() === "success";
  const warnings = warningCount(mufg);
  const remoteFile =
    metadataText(mufg, "remote_filename") ?? metadataText(mufg, "filename") ?? summary.artifactFile;
  return {
    statusLabel: success ? "VERIFIED" : warnings > 0 ? "BLOCKED" : "PENDING",
    modeLabel: "AUTO ON",
    rows: metadataNumber(mufg, "rows_uploaded") || summary.titanRows,
    warnings,
    lastAttemptAt: mufg?.created_at ?? null,
    lastAttemptLabel: formatTimestamp(mufg?.created_at ?? null),
    remoteFile,
    detail: success
      ? "This Titan file has already been delivered."
      : selectedDate
        ? "This Titan file has not been delivered by the observed MUFG upload telemetry."
        : "No selected Titan file.",
  };
}

function buildWatch({
  today,
  latestDate,
  generatedAt,
}: {
  today: string;
  latestDate: string | null;
  generatedAt: string;
}): BackOfficeTradePipelineWatch {
  const isReady = latestDate === today;
  return {
    watchDate: today,
    watchDateLabel: formatDateOnly(today),
    statusLabel: isReady ? "Ready" : "Watching",
    headline: isReady ? "Tonight: Titan Preview Ready" : "Tonight: Waiting for Clear Street File",
    detail: isReady
      ? `${formatDateOnly(today)} end-of-day file is available and the Titan preview can be reviewed.`
      : `We checked Clear Street SFTP and refreshed the database at ${formatTimestamp(generatedAt)}. ${formatDateOnly(
          today,
        )} end-of-day file is still not available.`,
  };
}

export const GET = observedJsonRoute(
  {
    route: "/api/backoffice-trade-pipeline",
    cacheHeader: CACHE_HEADER,
    cachePolicy: "browser-cache=60, vercel-cdn no-store",
    owner: "frontend",
    purpose: "Back Office Trade Pipeline Clear Street to MUFG monitor.",
    p95TargetMs: 3_000,
    freshnessSource: "clear_street.eod_transactions and ops.api_fetch_log MUFG telemetry",
  },
  async (request) => {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.has("refresh");
    const requestedDate = formatDateParam(url.searchParams.get("date"));
    const cacheTtlSeconds = requestedDate ? DATE_PREVIEW_CACHE_TTL_SECONDS : LATEST_CACHE_TTL_SECONDS;
    const { value, cacheStatus } = await getCachedRouteValue<ObservedRouteResult>({
      namespace: "/api/backoffice-trade-pipeline",
      key: normalizedSearchCacheKey(url.searchParams),
      ttlMs: cacheTtlSeconds * 1000,
      staleIfErrorMs: STALE_IF_ERROR_MS,
      forceRefresh,
      load: async () => {
    const [availableDates, telemetryRows] = await Promise.all([
      loadDateSummaries(),
      loadTelemetry(),
    ]);
    const latestDate = availableDates[0]?.sftpDate ?? null;
    const selectedDate =
      requestedDate && availableDates.some((date) => date.sftpDate === requestedDate)
        ? requestedDate
        : latestDate;
    const shouldLoadPreview = Boolean(requestedDate);
    const promotedArtifact =
      shouldLoadPreview && selectedDate ? await loadPromotedAllHistorySql() : null;
    const previewRows =
      selectedDate && promotedArtifact
        ? await loadPreviewRows(selectedDate, promotedArtifact.sql)
        : [];
    const telemetryByDate = mapTelemetry(telemetryRows);
    const selectedDateMeta = availableDates.find((date) => date.sftpDate === selectedDate);
    const selectedTelemetry = selectedDate ? telemetryByDate.get(selectedDate) : undefined;
    const generatedAt = new Date().toISOString();
    const today = localIsoDate(new Date());
    const summary = buildSummary({
      selectedDate,
      dateMeta: selectedDateMeta,
      mufg: selectedTelemetry?.mufg,
    });
    const payload: BackOfficeTradePipelinePayload = {
      source: "backoffice-trade-pipeline",
      generatedAt,
      selectedDate,
      latestDate,
      availableDates,
      watch: buildWatch({ today, latestDate, generatedAt }),
      recentMonitoring: buildRecentMonitoring({ latestDate, dates: availableDates, telemetryByDate }),
      artifacts: buildArtifacts({ dates: availableDates, telemetryByDate }),
      summary,
      delivery: buildDelivery({
        selectedDate,
        summary,
        mufg: selectedTelemetry?.mufg,
      }),
      previewRows,
      previewRowCount: summary.titanRows,
      previewReturnedCount: previewRows.length,
      sourceChecks: SOURCE_CHECKS,
    };

    return {
      payload,
      rowCount: summary.titanRows,
      dataAsOf: summary.updatedAt ?? generatedAt,
    };
      },
    });

    return {
      ...value,
      headers: {
        ...responseHeaders(forceRefresh, cacheTtlSeconds),
        ...routeCacheHeaders(cacheStatus),
      },
    };
  },
);
