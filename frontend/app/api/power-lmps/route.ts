import { observedJsonRoute } from "@/lib/server/apiObservability";
import {
  buildPowerLmpsPayload,
  parseDate,
  parsePowerIso,
  parsePowerProduct,
  parseRtSource,
} from "@/lib/server/powerLmps";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/power-lmps",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "Multi-ISO hourly DA/RT LMP dashboard data",
  p95TargetMs: 1_500,
  freshnessSource: "power LMP source-table updated_at fields",
} as const;

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";
  const result = await buildPowerLmpsPayload({
    iso: parsePowerIso(searchParams.get("iso")),
    product: parsePowerProduct(searchParams.get("product")),
    rtSource: parseRtSource(searchParams.get("source")),
    requestedDate: parseDate(searchParams.get("date")),
  });

  return {
    ...result,
    headers: {
      ...(result.headers ?? {}),
      "Cache-Control": forceRefresh ? "no-store" : CACHE_HEADER,
      "X-Power-Lmps-Cache": "MISS",
    },
  };
});
