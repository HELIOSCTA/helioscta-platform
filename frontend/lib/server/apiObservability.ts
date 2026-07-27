import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export interface ApiRouteConfig {
  route: string;
  cacheHeader: string;
  cachePolicy: string;
  owner: string;
  purpose: string;
  p95TargetMs: number;
  freshnessSource?: string;
}

export interface ObservedRouteResult {
  payload: unknown;
  status?: number;
  headers?: HeadersInit;
  rowCount?: number;
  dataAsOf?: string | null;
}

interface ApiRequestMetrics {
  dbDurationMs: number;
  dbQueryCount: number;
  dbRowCount: number;
  routeTimings: Map<string, number>;
}

const apiRequestMetrics = new AsyncLocalStorage<ApiRequestMetrics>();

function nowMs(): number {
  return performance.now();
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function headerValue(value: string | null | undefined): string {
  return value && value.trim() ? value : "unknown";
}

function jsonBytes(payload: unknown): { body: string; bytes: number } {
  const body = JSON.stringify(payload);
  return { body, bytes: new TextEncoder().encode(body).length };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function safeErrorDetail(error: unknown): string {
  return errorMessage(error).replace(/\s+/g, " ").slice(0, 900);
}

function timingMetricName(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return normalized || "phase";
}

function serverTimingHeader(durationMs: number, metrics: ApiRequestMetrics): string {
  const parts = [`app;dur=${durationMs}`, `db;dur=${roundMs(metrics.dbDurationMs)}`];
  for (const [name, value] of metrics.routeTimings) {
    parts.push(`${timingMetricName(name)};dur=${roundMs(value)}`);
  }
  return parts.join(", ");
}

function errorHttpStatus(error: unknown): number {
  const message = errorMessage(error).toLowerCase();
  if (
    message.includes("timeout exceeded when trying to connect") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("connection terminated")
  ) {
    return 503;
  }
  if (message.includes("statement timeout") || message.includes("query read timeout") || message.includes("canceling statement due to statement timeout")) {
    return 504;
  }
  return 500;
}

function errorTitle(status: number): string {
  if (status === 503) return "Database connection failed";
  if (status === 504) return "Database query timed out";
  return "Internal server error";
}

function logApiEvent(event: Record<string, unknown>, failed = false): void {
  const line = JSON.stringify({ event: "frontend_api_request", ...event });
  if (failed) {
    console.error(line);
  } else {
    console.info(line);
  }
}

export function recordDbQuery(durationMs: number, rowCount: number): void {
  const metrics = apiRequestMetrics.getStore();
  if (!metrics) return;
  metrics.dbDurationMs += durationMs;
  metrics.dbQueryCount += 1;
  metrics.dbRowCount += rowCount;
}

export function recordRouteTiming(name: string, durationMs: number): void {
  const metrics = apiRequestMetrics.getStore();
  if (!metrics) return;
  const key = timingMetricName(name);
  metrics.routeTimings.set(key, (metrics.routeTimings.get(key) ?? 0) + durationMs);
}

export async function measureRoutePhase<T>(name: string, run: () => Promise<T>): Promise<T> {
  const startedAt = nowMs();
  try {
    return await run();
  } finally {
    recordRouteTiming(name, nowMs() - startedAt);
  }
}

export function observedJsonRoute(
  config: ApiRouteConfig,
  handler: (request: Request) => Promise<ObservedRouteResult>,
) {
  return async function GET(request: Request): Promise<NextResponse> {
    const startedAt = nowMs();
    const requestId = randomUUID();
    const metrics: ApiRequestMetrics = {
      dbDurationMs: 0,
      dbQueryCount: 0,
      dbRowCount: 0,
      routeTimings: new Map(),
    };

    return apiRequestMetrics.run(metrics, async () => {
      try {
        const result = await handler(request);
        const status = result.status ?? 200;
        const { body, bytes } = jsonBytes(result.payload);
        const durationMs = roundMs(nowMs() - startedAt);
        const dbDurationMs = roundMs(metrics.dbDurationMs);
        const rowCount = result.rowCount ?? metrics.dbRowCount;
        const headers = new Headers(result.headers);

        if (!headers.has("Cache-Control")) {
          headers.set("Cache-Control", config.cacheHeader);
        }
        headers.set("Content-Type", "application/json");
        headers.set("Server-Timing", serverTimingHeader(durationMs, metrics));
        headers.set("X-Helios-Route", config.route);
        headers.set("X-Helios-Request-Id", requestId);
        const cachePolicy = headers.get("X-Helios-Cache-Policy") ?? config.cachePolicy;
        headers.set("X-Helios-Cache-Policy", cachePolicy);
        headers.set("X-Helios-Data-As-Of", headerValue(result.dataAsOf));

        logApiEvent({
          route: config.route,
          owner: config.owner,
          purpose: config.purpose,
          status,
          duration_ms: durationMs,
          db_duration_ms: dbDurationMs,
          db_query_count: metrics.dbQueryCount,
          phase_duration_ms: Object.fromEntries(
            Array.from(metrics.routeTimings.entries()).map(([name, value]) => [name, roundMs(value)]),
          ),
          row_count: rowCount,
          payload_bytes: bytes,
          cache_policy: cachePolicy,
          data_as_of: result.dataAsOf ?? null,
          request_id: requestId,
          freshness_source: config.freshnessSource ?? null,
          p95_target_ms: config.p95TargetMs,
        });

        return new NextResponse(body, { status, headers });
      } catch (error) {
        const durationMs = roundMs(nowMs() - startedAt);
        const dbDurationMs = roundMs(metrics.dbDurationMs);
        const status = errorHttpStatus(error);
        const payload = {
          error: errorTitle(status),
          detail: safeErrorDetail(error),
          errorType: errorName(error),
          requestId,
          route: config.route,
        };
        const { body, bytes } = jsonBytes(payload);
        const headers = new Headers({
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
          "Server-Timing": serverTimingHeader(durationMs, metrics),
          "X-Helios-Route": config.route,
          "X-Helios-Request-Id": requestId,
          "X-Helios-Cache-Policy": "no-store",
          "X-Helios-Data-As-Of": "unknown",
        });

        logApiEvent(
          {
            route: config.route,
            owner: config.owner,
            purpose: config.purpose,
            status,
            duration_ms: durationMs,
            db_duration_ms: dbDurationMs,
            db_query_count: metrics.dbQueryCount,
            phase_duration_ms: Object.fromEntries(
              Array.from(metrics.routeTimings.entries()).map(([name, value]) => [name, roundMs(value)]),
            ),
            row_count: metrics.dbRowCount,
            payload_bytes: bytes,
            cache_policy: "no-store",
            error_type: errorName(error),
            error_message: errorMessage(error),
            request_id: requestId,
            freshness_source: config.freshnessSource ?? null,
            p95_target_ms: config.p95TargetMs,
          },
          true,
        );

        return new NextResponse(body, { status, headers });
      }
    });
  };
}
