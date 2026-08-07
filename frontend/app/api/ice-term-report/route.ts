import { observedJsonRoute } from "@/lib/server/apiObservability";
import {
  intParam,
  loadIceTermReportBatch,
  parseIceTermReportTab,
  tradeDateParam,
} from "@/lib/server/iceTermReport";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const CACHE_POLICY = "s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/ice-term-report",
  cacheHeader: CACHE_HEADER,
  cachePolicy: CACHE_POLICY,
  owner: "frontend",
  purpose: "Batched ICE power and gas monthly term report",
  p95TargetMs: 1_500,
  freshnessSource: "ice_python.settlements trade_date",
} as const;

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const defaultCurrentYear = new Date().getUTCFullYear();
  const currentYear = intParam(searchParams.get("currentYear"), defaultCurrentYear, 2020, 2035);
  const endYear = intParam(searchParams.get("endYear"), currentYear + 2, currentYear, 2035);
  const tradingDays = intParam(searchParams.get("tradingDays"), 7, 2, 20);
  const priorYears = intParam(searchParams.get("priorYears"), 1, 1, 10);
  const requestedTradeDate = tradeDateParam(searchParams.get("tradeDate"));
  const datePolicy = requestedTradeDate ? "as-of" : "latest";
  const tab = parseIceTermReportTab(searchParams.get("tab"));
  const forceRefresh = searchParams.get("refresh") === "1";
  const payload = await loadIceTermReportBatch({
    currentYear,
    endYear,
    tradingDays,
    priorYears,
    requestedTradeDate,
    datePolicy,
    tab,
  });

  return {
    payload,
    headers: {
      "Cache-Control": forceRefresh ? "no-store" : CACHE_HEADER,
      "X-Helios-Cache-Policy": forceRefresh ? "no-store" : CACHE_POLICY,
    },
    rowCount: payload.rowCount,
    dataAsOf: payload.dataAsOf,
  };
});
