import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import {
  CLEAR_STREET_TRADES_BASE_PARAM_COUNT,
  type AvailableDateDbRow,
  type BundleDbRow,
  type SnapshotDbRow,
  type SummaryDbRow,
  availableDatesSql,
  baseArgs,
  buildClearStreetTradesDrilldownWhere,
  buildDebugPayload,
  drilldownBundleSql,
  loadPromotedAllHistorySql,
  mapAvailableDate,
  objectRecord,
  parseClearStreetTradesFilters,
  parseDrilldownFilter,
  parseLimit,
  rowArray,
} from "@/lib/server/clearStreetTradesSql";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "no-store";
const ROUTE_CONFIG = {
  route: "/api/clear-street-trades/drilldown",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "no-store",
  owner: "frontend",
  purpose: "Bounded Clear Street raw trade rows",
  p95TargetMs: 3_000,
  freshnessSource: "dbt Clear Street Trades Review Contract sftp_upload_timestamp",
} as const;

function responseCacheHeaders(): HeadersInit {
  return {
    "Cache-Control": CACHE_HEADER,
    "Vercel-CDN-Cache-Control": CACHE_HEADER,
    "X-Helios-Cache-Policy": "no-store",
  };
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const filters = parseClearStreetTradesFilters(searchParams);
  const limit = parseLimit(searchParams.get("limit"));
  const drilldown = parseDrilldownFilter(searchParams.get("drilldown"));
  const availableRows = await query<AvailableDateDbRow>(availableDatesSql());
  const availableDates = availableRows.map(mapAvailableDate);
  const selectedFilters = {
    ...filters,
    requestedDate: filters.requestedDate ?? availableDates[0]?.sftpDate ?? null,
  };
  const promotedArtifact = await loadPromotedAllHistorySql();
  const drilldownWhere = buildClearStreetTradesDrilldownWhere({
    filter: drilldown,
    firstParameterIndex: CLEAR_STREET_TRADES_BASE_PARAM_COUNT + 2,
  });
  const rows = await query<BundleDbRow>(drilldownBundleSql(promotedArtifact.sql, drilldownWhere.sql), [
    ...baseArgs(selectedFilters),
    limit,
    ...drilldownWhere.args,
  ]);
  const bundle = rows[0] ?? { snapshot: {}, summary: {}, raw_rows: [] };
  const snapshot = {
    ...(objectRecord(bundle.snapshot) as SnapshotDbRow),
    latest_sftp_date: availableDates[0]?.sftpDate ?? null,
  };
  const summary = objectRecord(bundle.summary) as SummaryDbRow;
  const rawRows = rowArray<Record<string, unknown>>(bundle.raw_rows);
  const payload = buildDebugPayload({
    filters: selectedFilters,
    drilldown,
    limit,
    rawRows,
    snapshot,
    summary,
    promotedArtifact,
  });

  return {
    payload,
    headers: responseCacheHeaders(),
    rowCount: payload.summary.rowCount,
    dataAsOf: payload.asOf,
  };
});

export function GET(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const isDevAlias = pathname.startsWith("/api/dev/");
  if (isDevAlias && !isLocalOnlyFeatureEnabled()) {
    return Promise.resolve(
      new Response(null, {
        status: 404,
        headers: responseCacheHeaders(),
      }),
    );
  }

  return observedGET(request);
}
