import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import type {
  ClearStreetReviewStatus,
  ClearStreetTradesPayload,
} from "@/lib/positionsAndTrades/clearStreetTradesTypes";
import {
  CLEAR_STREET_DERIVED_FIELDS,
  CLEAR_STREET_MODEL_COLUMNS,
} from "@/lib/positionsAndTrades/clearStreetTradesTypes";
import {
  CLEAR_STREET_TRADES_AGGREGATE_LIMIT,
  CLEAR_STREET_TRADES_BACKEND_NULL_CHECK_CRITERIA,
  CLEAR_STREET_TRADES_SOURCE_TABLE,
  type AvailableDateDbRow,
  type BundleDbRow,
  type FilterDbRow,
  type ProductSummaryDbRow,
  type SnapshotDbRow,
  type SummaryDbRow,
  appliedFilters,
  availableDatesSql,
  baseArgs,
  dateOnly,
  emptyPayloadMetadata,
  isoOrText,
  loadPromotedAllHistorySql,
  mapAvailableDate,
  mapProductSummaryRow,
  mapRawRow,
  mapSummary,
  objectRecord,
  parseClearStreetTradesFilters,
  parseLimit,
  rowArray,
  stringArray,
  summaryBundleSql,
} from "@/lib/server/clearStreetTradesSql";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "no-store";
const DEFAULT_LIMIT = 500;
const ROUTE_CONFIG = {
  route: "/api/dev/clear-street-trades",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "local-dev-only, no-store",
  owner: "frontend",
  purpose: "DEV-only Clear Street trades summary and aggregate rows",
  p95TargetMs: 3_000,
  freshnessSource: "dbt Clear Street Trades Review Contract sftp_upload_timestamp",
} as const;

function responseCacheHeaders(): HeadersInit {
  return {
    "Cache-Control": CACHE_HEADER,
    "Vercel-CDN-Cache-Control": CACHE_HEADER,
    "X-Helios-Cache-Policy": "local-dev-only no-store",
  };
}

function statusArray(value: unknown): ClearStreetReviewStatus[] {
  return stringArray(value).filter(
    (status): status is ClearStreetReviewStatus =>
      status === "matched" || status === "vendor_warning" || status === "needs_review",
  );
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  if (!isLocalOnlyFeatureEnabled()) {
    return {
      status: 404,
      payload: {
        error: "Clear Street trades review is local-only.",
      },
      headers: responseCacheHeaders(),
      rowCount: 0,
    };
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"), DEFAULT_LIMIT);
  const filters = parseClearStreetTradesFilters(searchParams);
  const availableRows = await query<AvailableDateDbRow>(availableDatesSql());
  const availableDates = availableRows.map(mapAvailableDate);
  const selectedFilters = {
    ...filters,
    requestedDate: filters.requestedDate ?? availableDates[0]?.sftpDate ?? null,
  };
  const promotedArtifact = await loadPromotedAllHistorySql();
  const sqlArgs = baseArgs(selectedFilters);

  const bundleRows = await query<BundleDbRow>(summaryBundleSql(promotedArtifact.sql), [...sqlArgs, limit]);
  const bundle = bundleRows[0] ?? {
    snapshot: {},
    filters: {},
    summary: {},
    product_summary: [],
    raw_rows: [],
  };
  const snapshot = objectRecord(bundle.snapshot) as SnapshotDbRow;
  const filterRow = objectRecord(bundle.filters) as FilterDbRow;
  const summary = mapSummary(objectRecord(bundle.summary) as SummaryDbRow);
  const productRows = rowArray<ProductSummaryDbRow>(bundle.product_summary);
  const rawRows = rowArray<Record<string, unknown>>(bundle.raw_rows);
  const selectedDate =
    snapshot.selected_sftp_date ?? selectedFilters.requestedDate ?? availableDates[0]?.sftpDate ?? null;
  const latestDate = availableDates[0]?.sftpDate ?? snapshot.latest_sftp_date ?? null;
  const asOf = summary.latestUploadAt ?? summary.latestUpdatedAt;

  const latestSummary = {
    rowCount: summary.rowCount,
    signatureCount: summary.signatureCount,
    matchedRowCount: summary.matchedRowCount,
    vendorWarningRowCount: summary.vendorWarningRowCount,
    needsReviewRowCount: summary.needsReviewRowCount,
    newSignatureCount: 0,
    historicalSignatureCount: 0,
  };
  const historySummary = {
    rowCount: summary.rowCount,
    signatureCount: summary.signatureCount,
    matchedRowCount: summary.matchedRowCount,
    vendorWarningRowCount: summary.vendorWarningRowCount,
    needsReviewRowCount: summary.needsReviewRowCount,
    historyRowCap: null,
    historyRowLimitReached: false,
  };

  const payload: ClearStreetTradesPayload = {
    source: `${promotedArtifact.contractDisplayName} / ${promotedArtifact.artifactDisplayName}`,
    ruleEngine: promotedArtifact.artifactDisplayName,
    rulesSource: promotedArtifact.dbtModelPath,
    promotedSql: promotedArtifact.promotedSqlPath,
    compiledSql: promotedArtifact.dbtCompiledPath,
    nullCheckCriteria: CLEAR_STREET_TRADES_BACKEND_NULL_CHECK_CRITERIA,
    selectedDate,
    latestDate,
    requestedDate: filters.requestedDate,
    asOf,
    latestSftpDate: latestDate,
    latestUploadAt: summary.latestUploadAt,
    availableDates,
    filters: appliedFilters(filters),
    summary,
    productSummary: productRows.map(mapProductSummaryRow),
    metadata: {
      ...emptyPayloadMetadata(promotedArtifact),
      accounts: stringArray(filterRow.accounts),
      productCodes: stringArray(filterRow.product_codes),
      productFamilies: stringArray(filterRow.product_families),
      marketNames: stringArray(filterRow.market_names),
      statuses: statusArray(filterRow.statuses),
      aggregationGrain: [
        "product_code",
        "product_family",
        "market_name",
        "source_product",
        "contract_yyyymm",
        "contract_day",
        "put_call",
        "strike_price_normalized",
        "review_status",
      ],
      productSummaryLimit: CLEAR_STREET_TRADES_AGGREGATE_LIMIT,
      sourceTable: CLEAR_STREET_TRADES_SOURCE_TABLE,
    },
    latestSummary,
    historySummary,
    latestSignatures: [],
    reviewSignatures: [],
    historySignatures: [],
    columns: [...CLEAR_STREET_MODEL_COLUMNS],
    rows: rawRows.map(mapRawRow),
    derivedFields: [...CLEAR_STREET_DERIVED_FIELDS],
    requestedLimit: limit,
    search: filters.search,
    rowCount: summary.rowCount,
    returnedRowCount: rawRows.length,
  };

  return {
    payload,
    headers: responseCacheHeaders(),
    rowCount: summary.rowCount,
    dataAsOf: asOf ?? isoOrText(dateOnly(selectedDate)),
  };
});

export function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
