import { observedJsonRoute } from "@/lib/server/apiObservability";
import { queryWithStatementTimeout } from "@/lib/server/db";
import { loadPromotedPositionsHomeValidationSql } from "@/lib/server/positionsHomeValidationSql";
import type {
  PositionsHomeStatus,
  PositionsHomeValidationCacheStatus,
  PositionsHomeValidationCheck,
  PositionsHomeValidationPayload,
  PositionsHomeValidationScope,
  PositionsHomeValidationSeverity,
} from "@/lib/positionsAndTrades/positionsHomeTypes";

export const runtime = "nodejs";
export const maxDuration = 90;

const VALIDATION_CACHE_TTL_SECONDS = 15 * 60;
const VALIDATION_CACHE_TTL_MS = VALIDATION_CACHE_TTL_SECONDS * 1000;
const VALIDATION_STALE_IF_ERROR_MS = 6 * 60 * 60 * 1000;
const VALIDATION_STATEMENT_TIMEOUT_MS = 85_000;
const VALIDATION_QUERY_TIMEOUT_MS = 88_000;
const CACHE_HEADER = `private, max-age=${VALIDATION_CACHE_TTL_SECONDS}, stale-while-revalidate=${VALIDATION_CACHE_TTL_SECONDS}`;
const STALE_CACHE_HEADER = "private, max-age=60, stale-while-revalidate=300";
const NO_STORE_HEADER = "no-store";

const ROUTE_CONFIG = {
  route: "/api/positions-home/validation",
  cacheHeader: CACHE_HEADER,
  cachePolicy:
    "auth-protected browser-cache=900, stale-while-revalidate=900, vercel-cdn no-store",
  owner: "frontend",
  purpose: "Cached positions/trades dbt validation summary for Positions Home",
  p95TargetMs: 1_000,
  freshnessSource: "dbt positions/trades validation summary SQL",
} as const;

interface ValidationSummaryDbRow {
  validation_scope: string | null;
  scope_label: string | null;
  check_id: string | null;
  check_label: string | null;
  source_system: string | null;
  severity: string | null;
  status: string | null;
  failing_count: number | string | null;
  detail: string | null;
  sample_product_code: string | null;
  sample_product_grouping: string | null;
  sample_route_family: string | null;
  sample_failure_reason: string | null;
  sample_group_count: number | string | null;
  first_observed_date: string | null;
  last_observed_date: string | null;
}

interface CachedValidation {
  checks: PositionsHomeValidationCheck[];
  validatedAt: string;
  expiresAtMs: number;
  staleUntilMs: number;
}

interface ValidationCacheStore {
  cachedValidation: CachedValidation | null;
  inFlightValidation: Promise<CachedValidation> | null;
}

declare global {
  var __positionsHomeValidationCache: ValidationCacheStore | undefined;
}

const validationCache =
  globalThis.__positionsHomeValidationCache ??
  (globalThis.__positionsHomeValidationCache = {
    cachedValidation: null,
    inFlightValidation: null,
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

function validationStatus(
  status: string | null,
  severity: PositionsHomeValidationSeverity,
  failingCount: number,
): PositionsHomeStatus {
  if (failingCount === 0 || status === "pass") return "stable";
  if (status === "warn" || severity === "warn") return "watch";
  return "needs_repair";
}

function validationStatusLabel(status: PositionsHomeStatus): string {
  if (status === "stable") return "Pass";
  if (status === "watch") return "Warn";
  if (status === "needs_repair") return "Fail";
  return "Error";
}

function mapValidationRow(row: ValidationSummaryDbRow): PositionsHomeValidationCheck {
  const severity = validationSeverity(row.severity);
  const scope = validationScope(row.validation_scope);
  const failingCount = toInteger(row.failing_count);
  const status = validationStatus(row.status, severity, failingCount);

  return {
    scope,
    scopeLabel:
      textOrNull(row.scope_label) ?? (scope === "latest" ? "Latest Files" : "All History"),
    checkId: textOrNull(row.check_id) ?? "unknown_validation_check",
    label: textOrNull(row.check_label) ?? "Unknown Validation Check",
    sourceSystem: textOrNull(row.source_system) ?? "Unknown",
    severity,
    status,
    statusLabel: validationStatusLabel(status),
    failingCount,
    failingCountLabel: failingCount.toLocaleString("en-US"),
    detail: textOrNull(row.detail) ?? "Validation check returned no detail.",
    sampleProductCode: textOrNull(row.sample_product_code),
    sampleProductGrouping: textOrNull(row.sample_product_grouping),
    sampleRouteFamily: textOrNull(row.sample_route_family),
    sampleFailureReason: textOrNull(row.sample_failure_reason),
    sampleGroupCount: row.sample_group_count == null ? null : toInteger(row.sample_group_count),
    firstObservedDate: textOrNull(row.first_observed_date),
    lastObservedDate: textOrNull(row.last_observed_date),
  };
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
    "X-Positions-Home-Validation-Cache": cacheStatus.toUpperCase(),
  };
}

async function runValidationQuery(): Promise<CachedValidation> {
  const promotedArtifact = await loadPromotedPositionsHomeValidationSql();
  const rows = await queryWithStatementTimeout<ValidationSummaryDbRow>(
    promotedArtifact.sql,
    undefined,
    {
      statementTimeoutMs: VALIDATION_STATEMENT_TIMEOUT_MS,
      queryTimeoutMs: VALIDATION_QUERY_TIMEOUT_MS,
    },
  );
  const nowMs = Date.now();
  return {
    checks: rows.map(mapValidationRow),
    validatedAt: new Date(nowMs).toISOString(),
    expiresAtMs: nowMs + VALIDATION_CACHE_TTL_MS,
    staleUntilMs: nowMs + VALIDATION_STALE_IF_ERROR_MS,
  };
}

async function loadValidation(forceRefresh: boolean): Promise<{
  cacheStatus: PositionsHomeValidationCacheStatus;
  validation: CachedValidation;
}> {
  const nowMs = Date.now();
  if (
    !forceRefresh &&
    validationCache.cachedValidation &&
    nowMs < validationCache.cachedValidation.expiresAtMs
  ) {
    return { cacheStatus: "hit", validation: validationCache.cachedValidation };
  }

  if (!forceRefresh && validationCache.inFlightValidation) {
    const validation = await validationCache.inFlightValidation;
    return { cacheStatus: "hit", validation };
  }

  validationCache.inFlightValidation = runValidationQuery();
  try {
    validationCache.cachedValidation = await validationCache.inFlightValidation;
    return { cacheStatus: "miss", validation: validationCache.cachedValidation };
  } catch (error) {
    if (
      validationCache.cachedValidation &&
      nowMs < validationCache.cachedValidation.staleUntilMs
    ) {
      return { cacheStatus: "stale", validation: validationCache.cachedValidation };
    }
    throw error;
  } finally {
    validationCache.inFlightValidation = null;
  }
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const forceRefresh = searchParams.has("refresh");
  const { cacheStatus, validation } = await loadValidation(forceRefresh);
  const payload: PositionsHomeValidationPayload = {
    source: "positions-home-validation",
    generatedAt: new Date().toISOString(),
    validatedAt: validation.validatedAt,
    cacheStatus,
    cacheTtlSeconds: VALIDATION_CACHE_TTL_SECONDS,
    checks: validation.checks,
  };

  return {
    payload,
    headers: responseCacheHeaders({ cacheStatus, forceRefresh }),
    rowCount: validation.checks.length,
    dataAsOf: validation.validatedAt,
  };
});
