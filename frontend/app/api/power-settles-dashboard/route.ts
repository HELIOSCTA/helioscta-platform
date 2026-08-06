import {
  observedJsonRoute,
  type ObservedRouteResult,
} from "@/lib/server/apiObservability";
import {
  buildPowerSettlesDashboardPayload,
  parseDate,
  parsePowerSettlesComponent,
  parsePowerSettlesLookbackDays,
  parsePowerSettlesRtSource,
  parsePowerSettlesSparkHeatRate,
} from "@/lib/server/powerLmps";
import {
  getCachedRouteValue,
  normalizedSearchCacheKey,
  routeCacheHeaders,
} from "@/lib/server/routeCache";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_TTL_SECONDS = 300;
const CACHE_HEADER = `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=60`;
const CACHE_NAMESPACE = "power-settles-dashboard-v5";
const ROUTE_CONFIG = {
  route: "/api/power-settles-dashboard",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60, process-cache=300",
  owner: "frontend",
  purpose: "Production compact multi-ISO DA/RT/DART Power Settles summary cards with LMP, heat-rate, and spark detail links",
  p95TargetMs: 1_500,
  freshnessSource: "power LMP and ICE next-day gas source-table updated_at fields",
} as const;

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";
  const key = normalizedSearchCacheKey(searchParams);

  const { value, cacheStatus } = await getCachedRouteValue<ObservedRouteResult>({
    namespace: CACHE_NAMESPACE,
    key,
    ttlMs: CACHE_TTL_SECONDS * 1000,
    staleIfErrorMs: CACHE_TTL_SECONDS * 1000,
    forceRefresh,
    load: () =>
      buildPowerSettlesDashboardPayload({
        requestedDate: parseDate(searchParams.get("date")),
        lookbackDays: parsePowerSettlesLookbackDays(searchParams.get("lookbackDays")),
        rtSource: parsePowerSettlesRtSource(searchParams.get("rtSource")),
        component: parsePowerSettlesComponent(searchParams.get("component")),
        sparkHeatRate: parsePowerSettlesSparkHeatRate(searchParams.get("sparkHeatRate")),
      }),
  });

  return {
    ...value,
    headers: {
      ...(value.headers ?? {}),
      "Cache-Control": forceRefresh ? "no-store" : CACHE_HEADER,
      "X-Helios-Cache-Policy": forceRefresh
        ? "no-store"
        : "s-maxage=300, stale-while-revalidate=60, process-cache=300",
      ...routeCacheHeaders(cacheStatus),
    },
  };
});
