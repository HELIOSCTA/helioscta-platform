import {
  buildPowerSettlesDashboardPayload,
  POWER_SETTLES_EMAIL_REPORT_ISOS,
  parseDate,
  parsePowerSettlesComponent,
  parsePowerSettlesLookbackDays,
  parsePowerSettlesRtSource,
  parsePowerSettlesSparkHeatRate,
} from "@/lib/server/powerLmps";
import {
  buildPowerSettlesDashboardReportUrl,
  renderPowerSettlesInlineEmailHtml,
} from "@/lib/server/powerSettlesEmail";
import {
  getCachedRouteValue,
  normalizedSearchCacheKey,
  routeCacheHeaders,
} from "@/lib/server/routeCache";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_TTL_SECONDS = 300;
const CACHE_HEADER = `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=60`;

export async function GET(request: Request): Promise<Response> {
  const startedAt = performance.now();
  const url = new URL(request.url);
  const { searchParams } = url;
  const requestedDate = parseDate(searchParams.get("date"));
  const rtSource = parsePowerSettlesRtSource(searchParams.get("rtSource"));
  const component = parsePowerSettlesComponent(searchParams.get("component"));
  const lookbackDays = parsePowerSettlesLookbackDays(searchParams.get("lookbackDays"));
  const sparkHeatRate = parsePowerSettlesSparkHeatRate(searchParams.get("sparkHeatRate"));
  const forceRefresh = searchParams.get("refresh") === "1";
  const payloadSearchParams = new URLSearchParams(searchParams);
  payloadSearchParams.delete("surface");
  const key = normalizedSearchCacheKey(payloadSearchParams);

  const { value, cacheStatus } = await getCachedRouteValue({
    namespace: "power-settles-dashboard-email-html-v2",
    key,
    ttlMs: CACHE_TTL_SECONDS * 1000,
    staleIfErrorMs: CACHE_TTL_SECONDS * 1000,
    forceRefresh,
    load: () =>
      buildPowerSettlesDashboardPayload({
        requestedDate,
        lookbackDays,
        rtSource,
        component,
        sparkHeatRate,
        dashboardIsos: POWER_SETTLES_EMAIL_REPORT_ISOS,
      }),
  });

  const payload = value.payload;
  const reportUrl = buildPowerSettlesDashboardReportUrl({
    baseUrl: frontendBaseUrl(request),
    requestedDate: requestedDate ?? payload.defaultDate,
    rtSource,
    lookbackDays,
    component,
    sparkHeatRate,
  });
  const html = renderPowerSettlesInlineEmailHtml({ payload, reportUrl });
  const previewFilename = `power-settles-${payload.requestedDate ?? payload.defaultDate}-${payload.component}-${payload.rtSource}-inline.html`;
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Content-Disposition": `inline; filename="${previewFilename}"`,
    "Cache-Control": forceRefresh ? "no-store" : CACHE_HEADER,
    "X-Helios-Route": "/api/power-settles-dashboard/email-html",
    "X-Helios-Email-Surface": "inline",
    "X-Helios-Cache-Policy": forceRefresh
      ? "no-store"
      : "s-maxage=300, stale-while-revalidate=60, process-cache=300",
    "X-Helios-Data-As-Of": value.dataAsOf ?? "unknown",
    "Server-Timing": `app;dur=${Math.round(performance.now() - startedAt)}`,
    ...routeCacheHeaders(cacheStatus),
  });
  return new Response(html, { status: 200, headers });
}

function frontendBaseUrl(request: Request): string {
  const configured = process.env.HELIOS_EMAIL_FRONTEND_BASE_URL?.trim();
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
