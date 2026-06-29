import { observedJsonRoute } from "@/lib/server/apiObservability";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const CACHE_HEADER = "no-store";
const DEFAULT_WARM_CONCURRENCY = 2;
const DEFAULT_MAX_COMPARE_TARGETS = 8;
const DEFAULT_TARGET_TIMEOUT_MS = 12_000;
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
  extractAreas?: boolean;
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
  areas?: string[];
  error?: string;
}

const EXPLORER_TARGETS: WarmTarget[] = [
  {
    name: "pjm-load-explorer",
    path: "/api/pjm-forecast-explorer",
    extractDates: true,
    extractAreas: true,
  },
  {
    name: "meteologica-load-explorer",
    path: "/api/pjm-meteologica-forecast-explorer",
    extractDates: true,
    extractAreas: true,
  },
  {
    name: "pjm-net-load-explorer",
    path: "/api/pjm-net-load-forecast-explorer?source=pjm",
    extractDates: true,
    extractAreas: true,
  },
  {
    name: "meteologica-net-load-explorer",
    path: "/api/pjm-net-load-forecast-explorer?source=meteologica",
    extractDates: true,
    extractAreas: true,
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

function unknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function extractForecastDates(payload: unknown): string[] {
  const record = unknownRecord(payload);
  const dates = record?.forecastDates;
  if (!Array.isArray(dates)) return [];
  return dates.filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function extractAreas(payload: unknown): string[] {
  const record = unknownRecord(payload);
  const areas = record?.areas;
  if (!Array.isArray(areas)) return [];
  return areas.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
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

function areaSlug(area: string): string {
  return area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "area";
}

function compareTargetsForAreas(
  namePrefix: string,
  source: "pjm" | "meteologica",
  type: "load" | "netLoad",
  areas: string[],
  dates: string[],
): WarmTarget[] {
  return Array.from(new Set(areas))
    .map((area) => compareTarget(`${namePrefix}-${areaSlug(area)}`, source, type, area, dates))
    .filter((target): target is WarmTarget => Boolean(target));
}

async function fetchWarmTarget(request: Request, target: WarmTarget): Promise<WarmResult> {
  const startedAt = nowMs();
  const url = new URL(target.path, request.url);
  const targetTimeoutMs = envInt("HELIOS_CACHE_WARM_TARGET_TIMEOUT_MS", DEFAULT_TARGET_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), targetTimeoutMs);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
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
    const areas = target.extractAreas ? extractAreas(payload) : undefined;

    return {
      name: target.name,
      path: target.path,
      ok: response.ok,
      status: response.status,
      durationMs: roundMs(nowMs() - startedAt),
      payloadBytes: new TextEncoder().encode(text).length,
      dataAsOf,
      ...(forecastDates ? { forecastDates } : {}),
      ...(areas ? { areas } : {}),
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
  } finally {
    clearTimeout(timeout);
  }
}

async function warmTargets(
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

function byName(results: WarmResult[], name: string): WarmResult | undefined {
  return results.find((result) => result.name === name);
}

function derivedCompareTargets(explorerResults: WarmResult[]): WarmTarget[] {
  const pjmLoadExplorer = byName(explorerResults, "pjm-load-explorer");
  const meteologicaLoadExplorer = byName(explorerResults, "meteologica-load-explorer");
  const pjmNetLoadExplorer = byName(explorerResults, "pjm-net-load-explorer");
  const meteologicaNetLoadExplorer = byName(explorerResults, "meteologica-net-load-explorer");

  return [
    ...compareTargetsForAreas(
      "pjm-load-compare",
      "pjm",
      "load",
      pjmLoadExplorer?.areas?.length ? pjmLoadExplorer.areas : ["RTO_COMBINED"],
      pjmLoadExplorer?.forecastDates ?? [],
    ),
    ...compareTargetsForAreas(
      "meteologica-load-compare",
      "meteologica",
      "load",
      meteologicaLoadExplorer?.areas?.length ? meteologicaLoadExplorer.areas : ["RTO"],
      meteologicaLoadExplorer?.forecastDates ?? [],
    ),
    ...compareTargetsForAreas(
      "pjm-net-load-compare",
      "pjm",
      "netLoad",
      pjmNetLoadExplorer?.areas?.length ? pjmNetLoadExplorer.areas : ["RTO"],
      pjmNetLoadExplorer?.forecastDates ?? [],
    ),
    ...compareTargetsForAreas(
      "meteologica-net-load-compare",
      "meteologica",
      "netLoad",
      meteologicaNetLoadExplorer?.areas?.length ? meteologicaNetLoadExplorer.areas : ["RTO"],
      meteologicaNetLoadExplorer?.forecastDates ?? [],
    ),
  ];
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
    envInt("HELIOS_CACHE_WARM_CONCURRENCY", DEFAULT_WARM_CONCURRENCY),
    1,
    3,
  );
  const maxCompareTargets = boundedInt(
    searchParams.get("maxCompareTargets"),
    envInt("HELIOS_CACHE_WARM_MAX_COMPARE_TARGETS", DEFAULT_MAX_COMPARE_TARGETS),
    0,
    40,
  );
  const explorerResults = await warmTargets(request, EXPLORER_TARGETS, concurrency);
  const allCompareTargets = derivedCompareTargets(explorerResults);
  const compareTargets = allCompareTargets.slice(0, maxCompareTargets);
  const compareResults = await warmTargets(request, compareTargets, concurrency);
  const targets = [...explorerResults, ...compareResults];

  return {
    payload: {
      warmedAt: new Date().toISOString(),
      concurrency,
      maxCompareTargets,
      skippedCompareTargets: Math.max(allCompareTargets.length - compareTargets.length, 0),
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
