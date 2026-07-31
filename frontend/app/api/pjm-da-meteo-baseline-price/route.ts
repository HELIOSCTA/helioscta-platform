import { observedJsonRoute } from "@/lib/server/apiObservability";
import { isPjmDaModelDevEnabled } from "@/lib/server/devFeatures";
import { localOnlyObservedNotFound } from "@/lib/server/localOnlyApi";
import { loadMeteoBaselinePayload } from "@/lib/server/pjmDaMeteoBaselinePrice";
import {
  getCachedRouteValue,
  normalizedSearchCacheKey,
  routeCacheHeaders,
} from "@/lib/server/routeCache";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_TTL_MS = 5 * 60 * 1000;
const ROUTE_CONFIG = {
  route: "/api/pjm-da-meteo-baseline-price",
  cacheHeader: "no-store",
  cachePolicy: "server-memory-ttl=300; client-memory-ttl=300",
  owner: "frontend",
  purpose: "DEV Meteologica Baseline Pricing model executed from promoted dbt SQL",
  p95TargetMs: 5_000,
  freshnessSource:
    "meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly.issue_date",
} as const;

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  if (!isPjmDaModelDevEnabled()) {
    return localOnlyObservedNotFound();
  }

  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";
  const cacheKey = normalizedSearchCacheKey(searchParams);
  const { value, cacheStatus } = await getCachedRouteValue({
    namespace: "pjm-da-meteo-baseline-price",
    key: cacheKey,
    ttlMs: CACHE_TTL_MS,
    staleIfErrorMs: 30 * 60 * 1000,
    forceRefresh,
    load: () => loadMeteoBaselinePayload(searchParams),
  });

  return {
    payload: {
      ...value,
      cache: {
        status: cacheStatus,
        ttlSeconds: CACHE_TTL_MS / 1000,
        scope: "frontend-server-memory",
      },
    },
    headers: {
      "Cache-Control": "no-store",
      "X-Helios-Cache-Policy": ROUTE_CONFIG.cachePolicy,
      ...routeCacheHeaders(cacheStatus),
    },
    rowCount: value.summary.hourlyRowCount,
    dataAsOf: value.summary.latestIssueLocal,
  };
});
