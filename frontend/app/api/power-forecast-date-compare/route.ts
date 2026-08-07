import { observedJsonRoute } from "@/lib/server/apiObservability";
import {
  buildPowerForecastDateComparePayload,
  parsePowerForecastDate,
  parsePowerForecastIso,
  parsePowerForecastSource,
  parsePowerForecastType,
} from "@/lib/server/powerForecasts";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=600, stale-while-revalidate=600, stale-if-error=3600";
const ROUTE_CONFIG = {
  route: "/api/power-forecast-date-compare",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=600, stale-while-revalidate=600, stale-if-error=3600",
  owner: "frontend",
  purpose: "Multi-ISO load and net-load forecast date comparison",
  p95TargetMs: 1_500,
  freshnessSource:
    "meteologica.<iso>_forecast_hourly.issue_date or pjm.load_frcstd_7_day.evaluated_at_datetime_ept",
} as const;

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const iso = parsePowerForecastIso(searchParams.get("iso"));
  const source = parsePowerForecastSource(searchParams.get("source"), iso);
  const type = parsePowerForecastType(searchParams.get("type"));

  return buildPowerForecastDateComparePayload({
    iso,
    source,
    type,
    requestedArea: searchParams.get("area"),
    baseDate: parsePowerForecastDate(searchParams.get("baseDate")),
    compareDate: parsePowerForecastDate(searchParams.get("compareDate")),
  });
});
