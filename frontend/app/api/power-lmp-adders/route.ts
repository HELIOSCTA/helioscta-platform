import { observedJsonRoute } from "@/lib/server/apiObservability";
import {
  buildPowerLmpAddersPayload,
  parseDate,
  parsePowerLmpAdderDataset,
  parsePowerLmpAdderIso,
} from "@/lib/server/powerLmpAdders";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/power-lmp-adders",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "Multi-ISO LMP adders, reserve, and source-context dashboard data",
  p95TargetMs: 1_500,
  freshnessSource: "adder/reserve source-table updated_at fields when live",
} as const;

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";
  const iso = parsePowerLmpAdderIso();
  const dataset = parsePowerLmpAdderDataset(searchParams.get("dataset"), iso);
  const result = await buildPowerLmpAddersPayload({
    iso,
    dataset,
    start: parseDate(searchParams.get("start")),
    end: parseDate(searchParams.get("end")),
  });

  return {
    ...result,
    headers: {
      ...(result.headers ?? {}),
      "Cache-Control": forceRefresh ? "no-store" : CACHE_HEADER,
      "X-Power-Lmp-Adders-Cache": "MISS",
    },
  };
});
