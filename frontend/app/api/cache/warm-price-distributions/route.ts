import { observedJsonRoute } from "@/lib/server/apiObservability";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const CACHE_HEADER = "no-store";
const DEFAULT_WARM_CONCURRENCY = 1;
const DEFAULT_TARGET_TIMEOUT_MS = 26_000;
const DEFAULT_MAX_FULL_TARGETS = 1;
const ROUTE_CONFIG = {
  route: "/api/cache/warm-price-distributions",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "no-store",
  owner: "frontend",
  purpose: "Warm Price Distributions forecast analog caches",
  p95TargetMs: 28_000,
} as const;

type ForecastSource = "pjm" | "meteologica";

interface WarmTarget {
  name: string;
  path: string;
}

interface WarmResult {
  name: string;
  path: string;
  ok: boolean;
  status: number | null;
  durationMs: number;
  payloadBytes: number;
  dataAsOf: string | null;
  responseCache: string | null;
  serverTiming: string | null;
  error?: string;
}

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

function shouldRunLocalWarm(request: Request): boolean {
  if (isVercelDeployment() || warmSecrets().length) return true;
  const { searchParams } = new URL(request.url);
  return searchParams.get("run") === "1" || searchParams.get("force") === "1";
}

function nowMs(): number {
  return performance.now();
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function boundedInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  const numeric = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(numeric, min), max);
}

function sourceLabel(source: ForecastSource): string {
  return source === "meteologica" ? "meteo" : "pjm";
}

function selectedSources(value: string | null): ForecastSource[] {
  if (value === "pjm") return ["pjm"];
  if (value === "meteologica" || value === "meteo") return ["meteologica"];

  const quarterHour = Math.floor(Date.now() / (15 * 60 * 1000));
  return quarterHour % 2 === 0 ? ["pjm", "meteologica"] : ["meteologica", "pjm"];
}

function analogPath({
  source,
  hourStart,
  hourEnd,
  datesOnly = false,
}: {
  source: ForecastSource;
  hourStart: number;
  hourEnd: number;
  datesOnly?: boolean;
}): string {
  const params = new URLSearchParams({
    source,
    loadArea: "RTO",
    generationArea: "RTO",
    stationId: "PJM",
    region: "PJM",
    hub: "WESTERN HUB",
    rtSource: "verified",
    component: "total",
    hourStart: String(hourStart),
    hourEnd: String(hourEnd),
    seasonStart: "05-01",
    seasonEnd: "08-31",
    lookbackYears: "3",
    includeCurrentYear: "1",
    dayType: "all",
    analogsPerHour: "40",
  });
  if (datesOnly) params.set("datesOnly", "1");
  return `/api/pjm-forecast-price-analogs?${params.toString()}`;
}

function warmTargets(sourceParam: string | null, maxFullTargets: number): WarmTarget[] {
  const sources = selectedSources(sourceParam);
  const dateTargets = sources.map((source) => ({
    name: `${sourceLabel(source)}-dates-he8-23`,
    path: analogPath({ source, hourStart: 8, hourEnd: 23, datesOnly: true }),
  }));
  const fullCandidates = sources.flatMap((source) => [
    {
      name: `${sourceLabel(source)}-default-he8-23`,
      path: analogPath({ source, hourStart: 8, hourEnd: 23 }),
    },
    {
      name: `${sourceLabel(source)}-peak-he17-21`,
      path: analogPath({ source, hourStart: 17, hourEnd: 21 }),
    },
  ]);

  return [...dateTargets, ...fullCandidates.slice(0, maxFullTargets)];
}

function unknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function extractError(payload: unknown, fallback: string): string {
  const record = unknownRecord(payload);
  const message = record?.error ?? record?.detail;
  return typeof message === "string" && message.trim() ? message.slice(0, 300) : fallback;
}

async function fetchWarmTarget(request: Request, target: WarmTarget): Promise<WarmResult> {
  const startedAt = nowMs();
  const url = new URL(target.path, request.url);
  const targetTimeoutMs = envInt("HELIOS_PRICE_DISTRIBUTIONS_WARM_TARGET_TIMEOUT_MS", DEFAULT_TARGET_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), targetTimeoutMs);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "helioscta-price-distributions-cache-warmer",
      },
    });
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    return {
      name: target.name,
      path: target.path,
      ok: response.ok,
      status: response.status,
      durationMs: roundMs(nowMs() - startedAt),
      payloadBytes: new TextEncoder().encode(text).length,
      dataAsOf: response.headers.get("x-helios-data-as-of"),
      responseCache: response.headers.get("x-helios-response-cache"),
      serverTiming: response.headers.get("server-timing"),
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
      responseCache: null,
      serverTiming: null,
      error: error instanceof Error ? error.message : "Unknown warm request error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function warmTargetsWithConcurrency(
  request: Request,
  targets: WarmTarget[],
  concurrency: number,
): Promise<WarmResult[]> {
  const results = new Array<WarmResult>(targets.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), Math.max(targets.length, 1));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < targets.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await fetchWarmTarget(request, targets[index]);
      }
    }),
  );

  return results;
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  if (!hasWarmAccess(request)) {
    return {
      status: 404,
      payload: { error: "Not found" },
      headers: { "Cache-Control": CACHE_HEADER },
    };
  }

  const { searchParams } = new URL(request.url);
  if (!shouldRunLocalWarm(request)) {
    return {
      payload: {
        warmedAt: new Date().toISOString(),
        skipped: true,
        reason: "Local cache warm is opt-in. Add run=1 to execute it.",
        targetCount: 0,
        okCount: 0,
        errorCount: 0,
        targets: [],
      },
      headers: { "Cache-Control": CACHE_HEADER },
      rowCount: 0,
    };
  }

  const concurrency = boundedInt(
    searchParams.get("concurrency"),
    envInt("HELIOS_PRICE_DISTRIBUTIONS_WARM_CONCURRENCY", DEFAULT_WARM_CONCURRENCY),
    1,
    2,
  );
  const maxFullTargets = boundedInt(
    searchParams.get("maxFullTargets"),
    envInt("HELIOS_PRICE_DISTRIBUTIONS_WARM_MAX_FULL_TARGETS", DEFAULT_MAX_FULL_TARGETS),
    0,
    4,
  );
  const targets = warmTargets(searchParams.get("source"), maxFullTargets);
  const results = await warmTargetsWithConcurrency(request, targets, concurrency);

  return {
    payload: {
      warmedAt: new Date().toISOString(),
      concurrency,
      maxFullTargets,
      okCount: results.filter((target) => target.ok).length,
      errorCount: results.filter((target) => !target.ok).length,
      targetCount: results.length,
      targets: results,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: results.length,
  };
});

export function HEAD(request: Request): Response {
  return new Response(null, {
    status: hasWarmAccess(request) ? 200 : 404,
    headers: { "Cache-Control": CACHE_HEADER },
  });
}
