"use client";

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

type CacheStore = {
  values: Map<string, CacheEntry>;
  inFlight: Map<string, Promise<unknown>>;
};

declare global {
  interface Window {
    __heliosClientJsonCache?: CacheStore;
  }
}

type FetchJsonWithCacheOptions = {
  key: string;
  url: string;
  ttlMs: number;
  signal?: AbortSignal;
  cacheMode?: RequestCache;
  forceRefresh?: boolean;
};

function getStore(): CacheStore {
  if (typeof window === "undefined") {
    return {
      values: new Map<string, CacheEntry>(),
      inFlight: new Map<string, Promise<unknown>>(),
    };
  }

  if (!window.__heliosClientJsonCache) {
    window.__heliosClientJsonCache = {
      values: new Map<string, CacheEntry>(),
      inFlight: new Map<string, Promise<unknown>>(),
    };
  }

  return window.__heliosClientJsonCache;
}

function getCachedJson<T>(key: string): T | null {
  const store = getStore();
  const existing = store.values.get(key);
  if (!existing) return null;
  if (Date.now() >= existing.expiresAt) {
    store.values.delete(key);
    return null;
  }
  return existing.payload as T;
}

function setCachedJson<T>(key: string, payload: T, ttlMs: number): void {
  const store = getStore();
  store.values.set(key, {
    expiresAt: Date.now() + ttlMs,
    payload,
  });
}

function parseJsonSafely(raw: string): { ok: true; value: unknown } | { ok: false } {
  const text = raw.trim();
  if (!text) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function extractErrorMessage(status: number, payload: unknown): string {
  if (typeof payload === "string") {
    const text = payload.trim();
    if (text) return `HTTP ${status}: ${text.slice(0, 180)}`;
  }

  if (payload && typeof payload === "object") {
    const fields = payload as {
      detail?: unknown;
      error?: unknown;
      errorType?: unknown;
      message?: unknown;
      requestId?: unknown;
      route?: unknown;
    };
    const maybeDetail = fields.detail;
    if (typeof maybeDetail === "string" && maybeDetail.trim()) {
      const route = typeof fields.route === "string" ? ` ${fields.route}` : "";
      const type = typeof fields.errorType === "string" ? ` ${fields.errorType}` : "";
      const request = typeof fields.requestId === "string" ? ` request ${fields.requestId}` : "";
      return `HTTP ${status}${route}${type}${request}: ${maybeDetail}`;
    }

    const maybeError = fields.error;
    if (typeof maybeError === "string" && maybeError.trim()) {
      return `HTTP ${status}: ${maybeError}`;
    }

    const maybeMessage = fields.message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return `HTTP ${status}: ${maybeMessage}`;
    }
  }

  return `HTTP ${status}`;
}

export async function fetchJsonWithCache<T>({
  key,
  url,
  ttlMs,
  signal,
  cacheMode = "default",
  forceRefresh = false,
}: FetchJsonWithCacheOptions): Promise<T> {
  if (!forceRefresh) {
    const cached = getCachedJson<T>(key);
    if (cached !== null) return cached;
  }

  const store = getStore();
  const existing = signal ? undefined : store.inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const request = (async () => {
    let response = await fetch(url, { signal, cache: cacheMode });

    if (response.status === 304) {
      const existingEntry = store.values.get(key);
      if (existingEntry) {
        existingEntry.expiresAt = Date.now() + ttlMs;
        return existingEntry.payload as T;
      }
      response = await fetch(url, { signal, cache: "no-store" });
    }

    const rawText = await response.text();
    const parsed = parseJsonSafely(rawText);
    const json = parsed.ok ? parsed.value : null;

    if (!response.ok) {
      throw new Error(extractErrorMessage(response.status, json ?? rawText));
    }

    if (json === null) {
      throw new Error(`Invalid JSON from ${url}`);
    }

    setCachedJson(key, json, ttlMs);
    return json as T;
  })()
    .catch((error) => {
      const fallback = store.values.get(key);
      if (fallback) {
        fallback.expiresAt = Date.now() + ttlMs;
        return fallback.payload as T;
      }
      throw error;
    })
    .finally(() => {
      store.inFlight.delete(key);
    });

  if (!signal) {
    store.inFlight.set(key, request);
  }
  return request as Promise<T>;
}
