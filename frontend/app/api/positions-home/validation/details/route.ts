import { observedJsonRoute } from "@/lib/server/apiObservability";
import { queryWithStatementTimeout } from "@/lib/server/db";
import { loadPromotedPositionsHomeValidationFailuresSql } from "@/lib/server/positionsHomeValidationSql";
import type {
  PositionsHomeValidationCacheStatus,
  PositionsHomeValidationDetailsPayload,
  PositionsHomeValidationFailureRow,
  PositionsHomeValidationScope,
  PositionsHomeValidationSeverity,
} from "@/lib/positionsAndTrades/positionsHomeTypes";

export const runtime = "nodejs";
export const maxDuration = 90;

const DETAILS_CACHE_TTL_SECONDS = 15 * 60;
const DETAILS_CACHE_TTL_MS = DETAILS_CACHE_TTL_SECONDS * 1000;
const DETAILS_STALE_IF_ERROR_MS = 6 * 60 * 60 * 1000;
const DETAILS_STATEMENT_TIMEOUT_MS = 85_000;
const DETAILS_QUERY_TIMEOUT_MS = 88_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const CACHE_HEADER = `private, max-age=${DETAILS_CACHE_TTL_SECONDS}, stale-while-revalidate=${DETAILS_CACHE_TTL_SECONDS}`;
const STALE_CACHE_HEADER = "private, max-age=60, stale-while-revalidate=300";
const NO_STORE_HEADER = "no-store";

const VALID_SCOPES = new Set(["latest", "all_history"]);
const VALID_CHECK_IDS = new Set([
  "clear_street_latest_product_matching",
  "clear_street_latest_vendor_codes_by_exchange_route",
  "nav_latest_product_matching",
  "nav_latest_vendor_codes_by_exchange_route",
  "clear_street_all_history_product_matching",
  "clear_street_all_history_vendor_codes_by_exchange_route",
  "nav_all_history_product_matching",
  "nav_all_history_vendor_codes_by_exchange_route",
]);

const ROUTE_CONFIG = {
  route: "/api/positions-home/validation/details",
  cacheHeader: CACHE_HEADER,
  cachePolicy:
    "auth-protected browser-cache=900, stale-while-revalidate=900, vercel-cdn no-store",
  owner: "frontend",
  purpose: "Lazy positions/trades dbt validation failure-row drilldown",
  p95TargetMs: 2_500,
  freshnessSource: "dbt positions/trades validation failure-row SQL",
} as const;

interface ValidationFailureDbRow {
  validation_scope: string | null;
  scope_label: string | null;
  check_id: string | null;
  check_label: string | null;
  source_system: string | null;
  severity: string | null;
  source_date: string | null;
  source_file_name: string | null;
  sftp_upload_timestamp: string | null;
  source_record_key: string | null;
  source_row_number: string | null;
  account_code: string | null;
  account_name: string | null;
  source_account: string | null;
  source_product: string | null;
  product_code: string | null;
  product_grouping: string | null;
  product_region: string | null;
  contract_yyyymm: string | null;
  contract_day: string | null;
  put_call: string | null;
  strike_price: string | null;
  route_exchange: string | null;
  route_family: string | null;
  source_exchange_name: string | null;
  raw_exchange: string | null;
  vendor_ice_code: string | null;
  vendor_cme_code: string | null;
  vendor_bbg_code: string | null;
  failure_reason: string | null;
  source_context: string | null;
  total_rows: number | string | null;
}

interface CachedValidationDetails {
  scope: PositionsHomeValidationScope;
  checkId: string;
  limit: number;
  rows: PositionsHomeValidationFailureRow[];
  totalRows: number;
  validatedAt: string;
  expiresAtMs: number;
  staleUntilMs: number;
}

interface ValidationDetailsCacheStore {
  cachedDetails: Map<string, CachedValidationDetails>;
  inFlightDetails: Map<string, Promise<CachedValidationDetails>>;
}

declare global {
  var __positionsHomeValidationDetailsCache:
    | ValidationDetailsCacheStore
    | undefined;
}

const validationDetailsCache =
  globalThis.__positionsHomeValidationDetailsCache ??
  (globalThis.__positionsHomeValidationDetailsCache = {
    cachedDetails: new Map<string, CachedValidationDetails>(),
    inFlightDetails: new Map<string, Promise<CachedValidationDetails>>(),
  });

function toInteger(value: unknown): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function validationSeverity(value: string | null): PositionsHomeValidationSeverity {
  return value === "warn" ? "warn" : "error";
}

function validationScope(value: string | null): PositionsHomeValidationScope {
  return value === "latest" ? "latest" : "all_history";
}

function parseLimit(rawLimit: string | null): number {
  const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : DEFAULT_LIMIT;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(parsed), MAX_LIMIT);
}

function mapFailureRow(row: ValidationFailureDbRow): PositionsHomeValidationFailureRow {
  const scope = validationScope(row.validation_scope);
  return {
    scope,
    scopeLabel:
      textOrNull(row.scope_label) ?? (scope === "latest" ? "Latest Files" : "All History"),
    checkId: textOrNull(row.check_id) ?? "unknown_validation_check",
    label: textOrNull(row.check_label) ?? "Unknown Validation Check",
    sourceSystem: textOrNull(row.source_system) ?? "Unknown",
    severity: validationSeverity(row.severity),
    sourceDate: textOrNull(row.source_date),
    sourceFileName: textOrNull(row.source_file_name),
    sftpUploadTimestamp: textOrNull(row.sftp_upload_timestamp),
    sourceRecordKey: textOrNull(row.source_record_key),
    sourceRowNumber: textOrNull(row.source_row_number),
    accountCode: textOrNull(row.account_code),
    accountName: textOrNull(row.account_name),
    sourceAccount: textOrNull(row.source_account),
    sourceProduct: textOrNull(row.source_product),
    productCode: textOrNull(row.product_code),
    productGrouping: textOrNull(row.product_grouping),
    productRegion: textOrNull(row.product_region),
    contractYyyymm: textOrNull(row.contract_yyyymm),
    contractDay: textOrNull(row.contract_day),
    putCall: textOrNull(row.put_call),
    strikePrice: textOrNull(row.strike_price),
    routeExchange: textOrNull(row.route_exchange),
    routeFamily: textOrNull(row.route_family),
    sourceExchangeName: textOrNull(row.source_exchange_name),
    rawExchange: textOrNull(row.raw_exchange),
    vendorIceCode: textOrNull(row.vendor_ice_code),
    vendorCmeCode: textOrNull(row.vendor_cme_code),
    vendorBbgCode: textOrNull(row.vendor_bbg_code),
    failureReason: textOrNull(row.failure_reason),
    sourceContext: textOrNull(row.source_context),
  };
}

function cacheKey({
  scope,
  checkId,
  limit,
}: {
  scope: PositionsHomeValidationScope;
  checkId: string;
  limit: number;
}): string {
  return `${scope}:${checkId}:${limit}`;
}

function responseCacheHeaders({
  cacheStatus,
  forceRefresh,
}: {
  cacheStatus: PositionsHomeValidationCacheStatus;
  forceRefresh: boolean;
}): HeadersInit {
  const cacheHeader =
    forceRefresh || cacheStatus === "miss"
      ? NO_STORE_HEADER
      : cacheStatus === "stale"
        ? STALE_CACHE_HEADER
        : CACHE_HEADER;

  return {
    "Cache-Control": cacheHeader,
    "Vercel-CDN-Cache-Control": NO_STORE_HEADER,
    "X-Helios-Cache-Policy":
      cacheHeader === NO_STORE_HEADER
        ? "auth-protected no-store"
        : "auth-protected browser-cache, vercel-cdn no-store",
    "X-Positions-Home-Validation-Details-Cache": cacheStatus.toUpperCase(),
  };
}

async function runDetailsQuery({
  scope,
  checkId,
  limit,
}: {
  scope: PositionsHomeValidationScope;
  checkId: string;
  limit: number;
}): Promise<CachedValidationDetails> {
  const promotedArtifact = await loadPromotedPositionsHomeValidationFailuresSql();
  const rows = await queryWithStatementTimeout<ValidationFailureDbRow>(
    `
    with filtered_failures as (
      select *
      from (${promotedArtifact.sql}) as validation_failures
      where validation_scope = $1
        and check_id = $2
    ),

    limited_failures as (
      select
        filtered_failures.*,
        count(*) over ()::integer as total_rows
      from filtered_failures
      order by
        source_date desc nulls last,
        product_code nulls last,
        product_grouping nulls last,
        route_family nulls last,
        source_record_key nulls last
      limit $3
    )

    select *
    from limited_failures
    `,
    [scope, checkId, limit],
    {
      statementTimeoutMs: DETAILS_STATEMENT_TIMEOUT_MS,
      queryTimeoutMs: DETAILS_QUERY_TIMEOUT_MS,
    },
  );
  const nowMs = Date.now();
  return {
    scope,
    checkId,
    limit,
    rows: rows.map(mapFailureRow),
    totalRows: rows[0] ? toInteger(rows[0].total_rows) : 0,
    validatedAt: new Date(nowMs).toISOString(),
    expiresAtMs: nowMs + DETAILS_CACHE_TTL_MS,
    staleUntilMs: nowMs + DETAILS_STALE_IF_ERROR_MS,
  };
}

async function loadDetails(
  scope: PositionsHomeValidationScope,
  checkId: string,
  limit: number,
  forceRefresh: boolean,
): Promise<{
  cacheStatus: PositionsHomeValidationCacheStatus;
  details: CachedValidationDetails;
}> {
  const key = cacheKey({ scope, checkId, limit });
  const nowMs = Date.now();
  const cached = validationDetailsCache.cachedDetails.get(key) ?? null;
  if (!forceRefresh && cached && nowMs < cached.expiresAtMs) {
    return { cacheStatus: "hit", details: cached };
  }

  const inFlight = validationDetailsCache.inFlightDetails.get(key) ?? null;
  if (!forceRefresh && inFlight) {
    const details = await inFlight;
    return { cacheStatus: "hit", details };
  }

  const nextDetails = runDetailsQuery({ scope, checkId, limit });
  validationDetailsCache.inFlightDetails.set(key, nextDetails);
  try {
    const details = await nextDetails;
    validationDetailsCache.cachedDetails = new Map(
      validationDetailsCache.cachedDetails,
    ).set(key, details);
    return { cacheStatus: "miss", details };
  } catch (error) {
    if (cached && nowMs < cached.staleUntilMs) {
      return { cacheStatus: "stale", details: cached };
    }
    throw error;
  } finally {
    validationDetailsCache.inFlightDetails.delete(key);
  }
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const scopeParam = searchParams.get("scope");
  const checkId = searchParams.get("checkId")?.trim() ?? "";
  const limit = parseLimit(searchParams.get("limit"));
  const forceRefresh = searchParams.has("refresh");

  if (!VALID_SCOPES.has(scopeParam ?? "") || !VALID_CHECK_IDS.has(checkId)) {
    return {
      status: 400,
      payload: {
        error: "Invalid validation detail request",
        detail: "Provide a valid scope and checkId.",
      },
      headers: { "Cache-Control": NO_STORE_HEADER },
      rowCount: 0,
      dataAsOf: null,
    };
  }

  const scope = validationScope(scopeParam);
  const { cacheStatus, details } = await loadDetails(scope, checkId, limit, forceRefresh);
  const payload: PositionsHomeValidationDetailsPayload = {
    source: "positions-home-validation-details",
    generatedAt: new Date().toISOString(),
    validatedAt: details.validatedAt,
    scope: details.scope,
    checkId: details.checkId,
    cacheStatus,
    cacheTtlSeconds: DETAILS_CACHE_TTL_SECONDS,
    totalRows: details.totalRows,
    returnedRows: details.rows.length,
    limit: details.limit,
    rows: details.rows,
  };

  return {
    payload,
    headers: responseCacheHeaders({ cacheStatus, forceRefresh }),
    rowCount: details.rows.length,
    dataAsOf: details.validatedAt,
  };
});
