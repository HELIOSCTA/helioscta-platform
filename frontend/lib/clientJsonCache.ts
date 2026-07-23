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
  persist?: "session";
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

const SESSION_STORAGE_PREFIX = "helios:client-json-cache:";

function isCacheEntry(value: unknown): value is CacheEntry {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { expiresAt?: unknown }).expiresAt === "number" &&
    "payload" in value
  );
}

function sessionStorageKey(key: string): string {
  return `${SESSION_STORAGE_PREFIX}${key}`;
}

function getSessionCachedEntry(key: string): CacheEntry | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(sessionStorageKey(key));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isCacheEntry(parsed)) {
      window.sessionStorage.removeItem(sessionStorageKey(key));
      return null;
    }
    if (Date.now() >= parsed.expiresAt) {
      window.sessionStorage.removeItem(sessionStorageKey(key));
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function setSessionCachedJson<T>(key: string, payload: T, ttlMs: number): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      sessionStorageKey(key),
      JSON.stringify({
        expiresAt: Date.now() + ttlMs,
        payload,
      }),
    );
  } catch {
    // Session storage is an optimization only; failed writes should not break data loads.
  }
}

function getCachedJson<T>(key: string, persist?: FetchJsonWithCacheOptions["persist"]): T | null {
  const store = getStore();
  const existing = store.values.get(key);
  if (existing) {
    if (Date.now() < existing.expiresAt) {
      return existing.payload as T;
    }
    store.values.delete(key);
  }

  if (persist === "session") {
    const persisted = getSessionCachedEntry(key);
    if (persisted) {
      store.values.set(key, persisted);
      return persisted.payload as T;
    }
  }

  return null;
}

function setCachedJson<T>(
  key: string,
  payload: T,
  ttlMs: number,
  persist?: FetchJsonWithCacheOptions["persist"],
): void {
  const store = getStore();
  store.values.set(key, {
    expiresAt: Date.now() + ttlMs,
    payload,
  });
  if (persist === "session") {
    setSessionCachedJson(key, payload, ttlMs);
  }
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
  persist,
}: FetchJsonWithCacheOptions): Promise<T> {
  if (!forceRefresh) {
    const cached = getCachedJson<T>(key, persist);
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

    setCachedJson(key, json, ttlMs, persist);
    return json as T;
  })()
    .catch((error) => {
      const fallback =
        store.values.get(key) ??
        (persist === "session" ? getSessionCachedEntry(key) : null);
      if (fallback) {
        fallback.expiresAt = Math.max(fallback.expiresAt, Date.now() + ttlMs);
        store.values.set(key, fallback);
        if (persist === "session") {
          setSessionCachedJson(key, fallback.payload, ttlMs);
        }
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
