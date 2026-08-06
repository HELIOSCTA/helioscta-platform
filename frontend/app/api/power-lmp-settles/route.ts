import { observedJsonRoute } from "@/lib/server/apiObservability";
import { parsePowerLmpSparkHeatRate } from "@/lib/powerLmpHeatRate";
import {
  buildPowerLmpSettlesPayload,
  parseDate,
  parsePowerLmpGasHub,
  parsePowerLmpMetric,
  parsePowerIso,
  parseRtSource,
  type ComponentKey,
} from "@/lib/server/powerLmps";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/power-lmp-settles",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "Multi-ISO DA/RT daily settle comparison data",
  p95TargetMs: 2_000,
  freshnessSource: "power LMP source-table updated_at fields",
} as const;

function parseComponent(value: string | null): ComponentKey {
  return value === "energy" || value === "congestion" || value === "loss" ? value : "total";
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";
  const gasHubParam = searchParams.get("gasHub");
  const gasHub = parsePowerLmpGasHub(gasHubParam);
  if (gasHubParam && !gasHub) {
    return {
      status: 400,
      payload: { error: `Unknown gasHub: ${gasHubParam}` },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
      dataAsOf: null,
    };
  }
  const result = await buildPowerLmpSettlesPayload({
    iso: parsePowerIso(searchParams.get("iso")),
    start: parseDate(searchParams.get("start")),
    end: parseDate(searchParams.get("end")),
    hub: searchParams.get("hub"),
    component: parseComponent(searchParams.get("component")),
    rtSource: parseRtSource(searchParams.get("rtSource")),
    metric: parsePowerLmpMetric(searchParams.get("metric")),
    gasHub,
    sparkHeatRate: parsePowerLmpSparkHeatRate(searchParams.get("sparkHeatRate")),
  });

  return {
    ...result,
    headers: {
      ...(result.headers ?? {}),
      "Cache-Control": forceRefresh ? "no-store" : CACHE_HEADER,
      "X-Power-Lmp-Settles-Cache": "MISS",
    },
  };
});
