import "server-only";

import { unstable_cache } from "next/cache";

export type RouteCacheStatus = "hit" | "miss" | "stale";

interface RouteCacheEntry<T> {
  expiresAtMs: number;
  staleUntilMs: number;
  value: T;
}

interface RouteCacheStore {
  values: Map<string, RouteCacheEntry<unknown>>;
  inFlight: Map<string, Promise<unknown>>;
}

declare global {
  var __heliosRouteCache: RouteCacheStore | undefined;
}

const MAX_CACHE_ENTRIES = 200;

const routeCache =
  globalThis.__heliosRouteCache ??
  (globalThis.__heliosRouteCache = {
    values: new Map<string, RouteCacheEntry<unknown>>(),
    inFlight: new Map<string, Promise<unknown>>(),
  });

function fullKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

function pruneCache(): void {
  if (routeCache.values.size <= MAX_CACHE_ENTRIES) return;

  const nowMs = Date.now();
  for (const [key, entry] of routeCache.values) {
    if (nowMs >= entry.staleUntilMs) {
      routeCache.values.delete(key);
    }
    if (routeCache.values.size <= MAX_CACHE_ENTRIES) return;
  }

  const overflow = routeCache.values.size - MAX_CACHE_ENTRIES;
  for (const key of Array.from(routeCache.values.keys()).slice(0, overflow)) {
    routeCache.values.delete(key);
  }
}

export function normalizedSearchCacheKey(
  searchParams: URLSearchParams,
  ignoredParams: string[] = ["refresh"],
): string {
  const ignored = new Set(ignoredParams);
  const entries = Array.from(searchParams.entries())
    .filter(([key]) => !ignored.has(key))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyComparison = leftKey.localeCompare(rightKey);
      return keyComparison === 0 ? leftValue.localeCompare(rightValue) : keyComparison;
    });

  return entries.length === 0
    ? "default"
    : entries
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");
}

export async function getCachedRouteValue<T>({
  namespace,
  key,
  ttlMs,
  staleIfErrorMs = ttlMs,
  forceRefresh,
  dataCache = false,
  dataCacheTtlSeconds,
  load,
}: {
  namespace: string;
  key: string;
  ttlMs: number;
  staleIfErrorMs?: number;
  forceRefresh: boolean;
  dataCache?: boolean;
  dataCacheTtlSeconds?: number;
  load: () => Promise<T>;
}): Promise<{ value: T; cacheStatus: RouteCacheStatus }> {
  const cacheKey = fullKey(namespace, key);
  const nowMs = Date.now();
  const cached = routeCache.values.get(cacheKey) as RouteCacheEntry<T> | undefined;

  if (!forceRefresh && cached && nowMs < cached.expiresAtMs) {
    return { value: cached.value, cacheStatus: "hit" };
  }

  if (!forceRefresh) {
    const existingRequest = routeCache.inFlight.get(cacheKey) as Promise<T> | undefined;
    if (existingRequest) {
      try {
        return { value: await existingRequest, cacheStatus: "hit" };
      } catch (error) {
        if (cached && nowMs < cached.staleUntilMs) {
          return { value: cached.value, cacheStatus: "stale" };
        }
        throw error;
      }
    }
  }

  const request =
    dataCache && !forceRefresh
      ? unstable_cache(load, ["helios-route-cache-v1", cacheKey], {
          revalidate: dataCacheTtlSeconds ?? Math.max(1, Math.ceil(ttlMs / 1000)),
        })()
      : load();
  routeCache.inFlight.set(cacheKey, request);

  try {
    const value = await request;
    routeCache.values.set(cacheKey, {
      value,
      expiresAtMs: nowMs + ttlMs,
      staleUntilMs: nowMs + ttlMs + staleIfErrorMs,
    });
    pruneCache();
    return { value, cacheStatus: "miss" };
  } catch (error) {
    if (!forceRefresh && cached && nowMs < cached.staleUntilMs) {
      return { value: cached.value, cacheStatus: "stale" };
    }
    throw error;
  } finally {
    routeCache.inFlight.delete(cacheKey);
  }
}

export function routeCacheHeaders(cacheStatus: RouteCacheStatus): HeadersInit {
  return {
    "X-Helios-Route-Cache": cacheStatus.toUpperCase(),
  };
}
