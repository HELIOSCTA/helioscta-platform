import { observedJsonRoute } from "@/lib/server/apiObservability";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const CACHE_HEADER = "no-store";
const ROUTE_CONFIG = {
  route: "/api/cache/warm-forecasts",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "no-store",
  owner: "frontend",
  purpose: "Warm Forecasts dashboard API caches",
  p95TargetMs: 15_000,
} as const;

interface WarmTarget {
  name: string;
  path: string;
  extractDates?: boolean;
}

interface WarmResult {
  name: string;
  path: string;
  ok: boolean;
  status: number | null;
  durationMs: number;
  payloadBytes: number;
  dataAsOf: string | null;
  forecastDates?: string[];
  error?: string;
}

const EXPLORER_TARGETS: WarmTarget[] = [
  {
    name: "pjm-load-explorer",
    path: "/api/pjm-forecast-explorer",
    extractDates: true,
  },
  {
    name: "meteologica-load-explorer",
    path: "/api/pjm-meteologica-forecast-explorer",
    extractDates: true,
  },
  {
    name: "pjm-net-load-explorer",
    path: "/api/pjm-net-load-forecast-explorer?source=pjm",
    extractDates: true,
  },
  {
    name: "meteologica-net-load-explorer",
    path: "/api/pjm-net-load-forecast-explorer?source=meteologica",
    extractDates: true,
  },
];

function isVercelDeployment(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV) || Boolean(process.env.VERCEL_URL);
}

function warmSecrets(): string[] {
  return Array.from(
    new Set([process.env.HELIOS_CACHE_WARM_SECRET, process.env.CRON_SECRET].filter(Boolean) as string[]),
  );
}

function hasWarmAccess(request: Request): boolean {
  const secrets = warmSecrets();
  if (!secrets.length) return !isVercelDeployment();

  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cache-warm-secret");
  return secrets.some((secret) => authorization === `Bearer ${secret}` || headerSecret === secret);
}

function nowMs(): number {
  return performance.now();
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function unknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function extractForecastDates(payload: unknown): string[] {
  const record = unknownRecord(payload);
  const dates = record?.forecastDates;
  if (!Array.isArray(dates)) return [];
  return dates.filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function extractError(payload: unknown, fallback: string): string {
  const record = unknownRecord(payload);
  const message = record?.error ?? record?.detail;
  return typeof message === "string" && message.trim() ? message.slice(0, 300) : fallback;
}

function compareTarget(name: string, source: "pjm" | "meteologica", type: "load" | "netLoad", area: string, dates: string[]): WarmTarget | null {
  const [baseDate, compareDate] = dates;
  if (!baseDate || !compareDate) return null;

  const params = new URLSearchParams({
    source,
    type,
    area,
    baseDate,
    compareDate,
  });
  return {
    name,
    path: `/api/pjm-forecast-date-compare?${params.toString()}`,
  };
}

async function fetchWarmTarget(request: Request, target: WarmTarget): Promise<WarmResult> {
  const startedAt = nowMs();
  const url = new URL(target.path, request.url);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "helioscta-cache-warmer",
      },
    });
    const text = await response.text();
    const dataAsOf = response.headers.get("x-helios-data-as-of");
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    const forecastDates = target.extractDates ? extractForecastDates(payload) : undefined;

    return {
      name: target.name,
      path: target.path,
      ok: response.ok,
      status: response.status,
      durationMs: roundMs(nowMs() - startedAt),
      payloadBytes: new TextEncoder().encode(text).length,
      dataAsOf,
      ...(forecastDates ? { forecastDates } : {}),
      ...(response.ok ? {} : { error: extractError(payload, response.statusText || "Request failed") }),
    };
  } catch (error) {
    return {
      name: target.name,
      path: target.path,
      ok: false,
      status: null,
      durationMs: roundMs(nowMs() - startedAt),
      payloadBytes: 0,
      dataAsOf: null,
      error: error instanceof Error ? error.message : "Unknown warm request error",
    };
  }
}

function byName(results: WarmResult[], name: string): WarmResult | undefined {
  return results.find((result) => result.name === name);
}

function derivedCompareTargets(explorerResults: WarmResult[]): WarmTarget[] {
  return [
    compareTarget("pjm-load-compare-default", "pjm", "load", "RTO_COMBINED", byName(explorerResults, "pjm-load-explorer")?.forecastDates ?? []),
    compareTarget("meteologica-load-compare-default", "meteologica", "load", "RTO", byName(explorerResults, "meteologica-load-explorer")?.forecastDates ?? []),
    compareTarget("pjm-net-load-compare-default", "pjm", "netLoad", "RTO", byName(explorerResults, "pjm-net-load-explorer")?.forecastDates ?? []),
    compareTarget(
      "meteologica-net-load-compare-default",
      "meteologica",
      "netLoad",
      "RTO",
      byName(explorerResults, "meteologica-net-load-explorer")?.forecastDates ?? [],
    ),
  ].filter((target): target is WarmTarget => Boolean(target));
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  if (!hasWarmAccess(request)) {
    return {
      status: 404,
      payload: { error: "Not found" },
      headers: { "Cache-Control": CACHE_HEADER },
    };
  }

  const explorerResults = await Promise.all(EXPLORER_TARGETS.map((target) => fetchWarmTarget(request, target)));
  const compareTargets = derivedCompareTargets(explorerResults);
  const compareResults = await Promise.all(compareTargets.map((target) => fetchWarmTarget(request, target)));
  const targets = [...explorerResults, ...compareResults];

  return {
    payload: {
      warmedAt: new Date().toISOString(),
      okCount: targets.filter((target) => target.ok).length,
      errorCount: targets.filter((target) => !target.ok).length,
      targetCount: targets.length,
      targets,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: targets.length,
  };
});

export function HEAD(request: Request): Response {
  return new Response(null, {
    status: hasWarmAccess(request) ? 200 : 404,
    headers: { "Cache-Control": CACHE_HEADER },
  });
}
