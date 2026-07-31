import {
  observedJsonRoute,
  type ObservedRouteResult,
} from "@/lib/server/apiObservability";
import {
  buildPowerSettlesDashboardPayload,
  parseDate,
  parseRtSource,
} from "@/lib/server/powerLmps";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import { localOnlyObservedNotFound } from "@/lib/server/localOnlyApi";
import {
  getCachedRouteValue,
  normalizedSearchCacheKey,
  routeCacheHeaders,
} from "@/lib/server/routeCache";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_TTL_SECONDS = 300;
const CACHE_HEADER = `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=60`;
const ROUTE_CONFIG = {
  route: "/api/power-settles-dashboard",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60, process-cache=300",
  owner: "frontend",
  purpose: "Local-dev compact multi-ISO DA/RT/DART total LMP settles dashboard summary",
  p95TargetMs: 1_500,
  freshnessSource: "power LMP source-table updated_at fields",
} as const;

function parseLookbackDays(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(Math.max(parsed, 1), 14);
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  if (!isLocalOnlyFeatureEnabled()) {
    return localOnlyObservedNotFound();
  }

  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";
  const key = normalizedSearchCacheKey(searchParams);

  const { value, cacheStatus } = await getCachedRouteValue<ObservedRouteResult>({
    namespace: "power-settles-dashboard",
    key,
    ttlMs: CACHE_TTL_SECONDS * 1000,
    staleIfErrorMs: CACHE_TTL_SECONDS * 1000,
    forceRefresh,
    load: () =>
      buildPowerSettlesDashboardPayload({
        requestedDate: parseDate(searchParams.get("date")),
        lookbackDays: parseLookbackDays(searchParams.get("lookbackDays")),
        rtSource: parseRtSource(searchParams.get("rtSource")),
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
