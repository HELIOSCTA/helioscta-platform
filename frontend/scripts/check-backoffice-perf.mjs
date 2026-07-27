#!/usr/bin/env node

import { chromium, devices } from "@playwright/test";

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_VIEW = "backoffice-nav-daily-position-sheet";
const DEFAULT_SAMPLES = 3;
const DEFAULT_WARMUP = 1;
const DEFAULT_TARGET_MS = 1_500;
const DEFAULT_TIMEOUT_MS = 30_000;

const VIEW_CONFIGS = {
  "backoffice-home": {
    marker: "backoffice-home",
    readyText: [/Trade Readiness/i, /Source Health/i],
  },
  "backoffice-positions-trades": {
    marker: "backoffice-positions-trades",
    readyText: [/Term \/ Monthly Positions/i, /Positions & Trades/i],
  },
  "backoffice-monitor": {
    marker: "backoffice-monitor",
    readyText: [/Email Routing/i, /Feed Status/i],
  },
  "backoffice-trade-pipeline": {
    marker: "backoffice-trade-pipeline",
    readyText: [/Trade Pipeline/i],
  },
  "backoffice-nav-daily-position-sheet": {
    marker: "backoffice-nav-daily-position-sheet",
    readyText: [/NAV Daily Position Sheet/i, /Gas Futures Position Matrix/i, /Power active futures/i],
  },
  "ice-trade-blotter": {
    marker: "ice-trade-blotter",
    readyText: [/Trade Blotter/i, /ICE Trade Blotter/i],
  },
};
const BACKOFFICE_VIEWS = Object.keys(VIEW_CONFIGS);

const BACKOFFICE_API_PREFIXES = [
  "/api/backoffice-home",
  "/api/backoffice-monitor",
  "/api/backoffice-positions-trades",
  "/api/backoffice-trade-pipeline",
  "/api/backoffice-nav-daily-position-sheet",
  "/api/back-office/trade-pipeline/preview",
  "/api/ice-trade-blotter/raw",
  "/api/clear-street-trades",
];

const VIEWPORTS = {
  desktop: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
  },
  mobile: devices["iPhone 13"],
};

function usage() {
  return `
Usage:
  npm run check:perf:backoffice -- [options]

Options:
  --base-url=<url>       App base URL. Default: ${DEFAULT_BASE_URL}
  --url=<url>            Full URL to test. Overrides --base-url/--view.
  --view=<name>          Back Office view query value. Default: ${DEFAULT_VIEW}
  --all                  Test all production Back Office views.
  --samples=<n>          Measured browser samples per viewport. Default: ${DEFAULT_SAMPLES}
  --warmup=<n>           Unmeasured warmup navigations per viewport. Default: ${DEFAULT_WARMUP}
  --target-ms=<n>        Ready p95 budget per viewport. Default: ${DEFAULT_TARGET_MS}
  --timeout-ms=<n>       Navigation/readiness timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --desktop              Test desktop viewport only.
  --mobile               Test mobile viewport only.
  --cache-bust           Add a unique query param to page requests.
  --api-cache-bust       Add a unique query param to Back Office API requests.
  --headed               Run a headed browser.
  --allow-slow           Exit 0 when ready p95 exceeds target.
  --json                 Print machine-readable JSON instead of a table.
  --help                 Show this help.

Environment:
  HELIOS_BACKOFFICE_PERF_BASE_URL      Same as --base-url.
  HELIOS_BACKOFFICE_PERF_URL           Same as --url.
  HELIOS_API_HEALTH_BYPASS_TOKEN       Vercel protection bypass token sent as a request header.
`.trim();
}

function positiveInt(value, name, min = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`--${name} must be an integer >= ${min}`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.HELIOS_BACKOFFICE_PERF_BASE_URL || DEFAULT_BASE_URL,
    url: process.env.HELIOS_BACKOFFICE_PERF_URL || null,
    view: DEFAULT_VIEW,
    all: false,
    views: [DEFAULT_VIEW],
    samples: DEFAULT_SAMPLES,
    warmup: DEFAULT_WARMUP,
    targetMs: DEFAULT_TARGET_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    viewports: ["desktop", "mobile"],
    cacheBust: false,
    apiCacheBust: false,
    headed: false,
    allowSlow: false,
    json: false,
  };

  for (const arg of argv) {
    if (arg === "--help") {
      console.log(usage());
      process.exit(0);
    }
    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
      continue;
    }
    if (arg.startsWith("--url=")) {
      options.url = arg.slice("--url=".length);
      continue;
    }
    if (arg.startsWith("--view=")) {
      options.view = arg.slice("--view=".length);
      continue;
    }
    if (arg === "--all") {
      options.all = true;
      continue;
    }
    if (arg.startsWith("--samples=")) {
      options.samples = positiveInt(arg.slice("--samples=".length), "samples");
      continue;
    }
    if (arg.startsWith("--warmup=")) {
      options.warmup = positiveInt(arg.slice("--warmup=".length), "warmup", 0);
      continue;
    }
    if (arg.startsWith("--target-ms=")) {
      options.targetMs = positiveInt(arg.slice("--target-ms=".length), "target-ms");
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = positiveInt(arg.slice("--timeout-ms=".length), "timeout-ms");
      continue;
    }
    if (arg === "--desktop") {
      options.viewports = ["desktop"];
      continue;
    }
    if (arg === "--mobile") {
      options.viewports = ["mobile"];
      continue;
    }
    if (arg === "--cache-bust") {
      options.cacheBust = true;
      continue;
    }
    if (arg === "--api-cache-bust") {
      options.apiCacheBust = true;
      continue;
    }
    if (arg === "--headed") {
      options.headed = true;
      continue;
    }
    if (arg === "--allow-slow") {
      options.allowSlow = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
  }

  if (options.all && options.url) {
    throw new Error("--all cannot be combined with --url because a full URL already selects one page.");
  }

  options.views = options.all ? BACKOFFICE_VIEWS : [options.view];
  return options;
}

function normalizeBaseUrl(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildPageUrl(options, view, requestId) {
  const url = options.url
    ? new URL(options.url, normalizeBaseUrl(options.baseUrl))
    : new URL("/", normalizeBaseUrl(options.baseUrl));

  if (!options.url) {
    url.searchParams.set("view", view);
  }
  if (options.cacheBust) {
    url.searchParams.set("_perf", requestId);
  }
  return url.toString();
}

function parseServerTiming(value) {
  if (!value) return {};
  const result = {};
  for (const part of value.split(",")) {
    const [name, ...attrs] = part.trim().split(";");
    const dur = attrs.map((attr) => attr.trim()).find((attr) => attr.startsWith("dur="));
    if (!name || !dur) continue;
    const parsed = Number(dur.slice("dur=".length));
    if (Number.isFinite(parsed)) result[name] = parsed;
  }
  return result;
}

function percentile(values, pct) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)];
}

function fmtMs(value) {
  return value === null || value === undefined ? "-" : `${Math.round(value)}ms`;
}

function pad(value, length) {
  return String(value).padEnd(length, " ");
}

function isBackOfficeApi(urlString) {
  try {
    const path = new URL(urlString).pathname;
    return BACKOFFICE_API_PREFIXES.some((prefix) => path.startsWith(prefix));
  } catch {
    return false;
  }
}

function browserHeaders() {
  const bypassToken = process.env.HELIOS_API_HEALTH_BYPASS_TOKEN;
  return bypassToken ? { "x-vercel-protection-bypass": bypassToken } : {};
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function launchBrowser(headed) {
  const launchOptions = { headless: !headed };
  const errors = [];
  for (const channel of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ ...launchOptions, channel });
    } catch (error) {
      errors.push(`${channel}: ${error instanceof Error ? error.message : "launch failed"}`);
    }
  }
  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    errors.push(`bundled chromium: ${error instanceof Error ? error.message : "launch failed"}`);
  }

  throw new Error(
    [
      "Unable to launch a Playwright browser.",
      "Install Chrome/Edge locally or run `npx playwright install chromium` from frontend/.",
      ...errors.map((error) => `- ${error.split("\n")[0]}`),
    ].join("\n"),
  );
}

async function waitForBackOfficeReady(page, view, timeoutMs) {
  const config = VIEW_CONFIGS[view] ?? {
    marker: view,
    readyText: [new RegExp(escapeRegExp(view), "i")],
  };
  const readyConfig = {
    marker: config.marker,
    readyText: config.readyText.map((pattern) => ({
      source: pattern.source,
      flags: pattern.flags,
    })),
  };
  const handle = await page.waitForFunction(
    ({ marker, readyText }) => {
      const readyMarker = marker;
      if (document.querySelector(`[data-perf-ready="${readyMarker}"]`)) {
        return `marker:${readyMarker}`;
      }

      const bodyText = document.body?.innerText ?? "";
      if (/Loading/i.test(bodyText) && !/failed to load|failed; showing cached data/i.test(bodyText)) {
        return "";
      }
      for (const pattern of readyText) {
        const regex = new RegExp(pattern.source, pattern.flags);
        if (regex.test(bodyText)) {
          return `text:${pattern.source}`;
        }
      }
      return "";
    },
    readyConfig,
    { timeout: timeoutMs },
  );
  return String(await handle.jsonValue());
}

async function collectNavigationMetrics(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(
      performance.getEntriesByType("paint").map((entry) => [entry.name, entry.startTime]),
    );

    return {
      domContentLoadedMs:
        navigation && "domContentLoadedEventEnd" in navigation
          ? Math.round(navigation.domContentLoadedEventEnd)
          : null,
      loadEventMs:
        navigation && "loadEventEnd" in navigation ? Math.round(navigation.loadEventEnd) : null,
      firstPaintMs: typeof paints["first-paint"] === "number" ? Math.round(paints["first-paint"]) : null,
      firstContentfulPaintMs:
        typeof paints["first-contentful-paint"] === "number"
          ? Math.round(paints["first-contentful-paint"])
          : null,
    };
  });
}

async function runSample(browser, view, viewportName, options, index, measured) {
  const requestStarts = new Map();
  const apiResponses = [];
  const consoleErrors = [];
  const pageErrors = [];
  const requestId = `${Date.now()}-${viewportName}-${index}`;
  const context = await browser.newContext({
    ...VIEWPORTS[viewportName],
    extraHTTPHeaders: browserHeaders(),
  });
  const page = await context.newPage();

  if (options.apiCacheBust) {
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (!isBackOfficeApi(request.url())) {
        await route.continue();
        return;
      }
      const nextUrl = new URL(request.url());
      nextUrl.searchParams.set("_perf_api", requestId);
      await route.continue({ url: nextUrl.toString() });
    });
  }

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text().slice(0, 300));
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message.slice(0, 300));
  });
  page.on("request", (request) => {
    if (isBackOfficeApi(request.url())) {
      requestStarts.set(request, performance.now());
    }
  });
  page.on("response", (response) => {
    const request = response.request();
    if (!isBackOfficeApi(response.url())) return;
    const startedAt = requestStarts.get(request);
    const headers = response.headers();
    const path = new URL(response.url()).pathname;
    apiResponses.push({
      method: request.method(),
      path,
      status: response.status(),
      totalMs: startedAt ? performance.now() - startedAt : null,
      appMs: parseServerTiming(headers["server-timing"]).app ?? null,
      dbMs: parseServerTiming(headers["server-timing"]).db ?? null,
      serverTiming: headers["server-timing"] ?? null,
      routeCache: headers["x-helios-route-cache"] ?? null,
      vercelCache: headers["x-vercel-cache"] ?? null,
      contentLength: headers["content-length"] ? Number(headers["content-length"]) : null,
    });
  });
  page.on("requestfailed", (request) => {
    if (!isBackOfficeApi(request.url())) return;
    const startedAt = requestStarts.get(request);
    apiResponses.push({
      method: request.method(),
      path: new URL(request.url()).pathname,
      status: 0,
      totalMs: startedAt ? performance.now() - startedAt : null,
      appMs: null,
      dbMs: null,
      serverTiming: null,
      routeCache: null,
      vercelCache: null,
      contentLength: null,
      error: request.failure()?.errorText ?? "request failed",
    });
  });

  const pageUrl = buildPageUrl(options, view, requestId);
  const startedAt = performance.now();

  try {
    const response = await page.goto(pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });
    const domReadyMs = performance.now() - startedAt;
    const readySignal = await waitForBackOfficeReady(page, view, options.timeoutMs);
    const readyMs = performance.now() - startedAt;
    await page.waitForTimeout(100);
    const navigationMetrics = await collectNavigationMetrics(page);

    return {
      measured,
      view,
      viewport: viewportName,
      pageUrl,
      status: response?.status() ?? 0,
      domReadyMs,
      readyMs,
      readySignal,
      navigationMetrics,
      apiResponses,
      consoleErrors,
      pageErrors,
    };
  } catch (error) {
    return {
      measured,
      view,
      viewport: viewportName,
      pageUrl,
      status: 0,
      domReadyMs: null,
      readyMs: performance.now() - startedAt,
      readySignal: null,
      navigationMetrics: null,
      apiResponses,
      consoleErrors,
      pageErrors,
      error: error instanceof Error ? error.message : "navigation failed",
    };
  } finally {
    await context.close();
  }
}

function summarizeViewport(view, viewportName, samples, targetMs) {
  const measured = samples.filter((sample) => sample.measured);
  const readyValues = measured
    .map((sample) => sample.readyMs)
    .filter((value) => typeof value === "number");
  const domValues = measured
    .map((sample) => sample.domReadyMs)
    .filter((value) => typeof value === "number");
  const apiDurations = measured.flatMap((sample) =>
    sample.apiResponses
      .map((response) => response.totalMs)
      .filter((value) => typeof value === "number"),
  );
  const errors = [
    ...measured.flatMap((sample) => (sample.error ? [sample.error.split("\n")[0]] : [])),
    ...measured.flatMap((sample) => sample.pageErrors),
    ...measured.flatMap((sample) => sample.apiResponses.filter((api) => api.status >= 400 || api.status === 0).map((api) => `${api.path} HTTP ${api.status}`)),
  ];
  const slowestApi =
    measured
      .flatMap((sample) => sample.apiResponses)
      .filter((api) => typeof api.totalMs === "number")
      .sort((left, right) => right.totalMs - left.totalMs)[0] ?? null;
  const readyP95 = percentile(readyValues, 95);
  const status = errors.length ? "FAIL" : readyP95 !== null && readyP95 > targetMs ? "SLOW" : "PASS";

  return {
    view,
    viewport: viewportName,
    status,
    targetMs,
    readyP95,
    domP95: percentile(domValues, 95),
    apiP95: percentile(apiDurations, 95),
    apiCallCount: measured.reduce((total, sample) => total + sample.apiResponses.length, 0),
    slowestApi,
    errors: [...new Set(errors)],
    samples: measured,
  };
}

function printTable(results, options) {
  console.log(`URL: ${options.url ?? normalizeBaseUrl(options.baseUrl)}`);
  console.log(`Views: ${options.views.join(", ")}`);
  console.log(`Samples: ${options.samples} measured, ${options.warmup} warmup`);
  console.log(`Fresh browser context per sample: yes`);
  console.log(`API cache bust: ${options.apiCacheBust ? "yes" : "no"}`);
  console.log("");
  console.log(
    [
      pad("Status", 7),
      pad("View", 39),
      pad("Viewport", 10),
      pad("Ready p95", 11),
      pad("DCL p95", 9),
      pad("API p95", 9),
      pad("Target", 9),
      pad("API calls", 10),
      "Slowest Back Office API",
    ].join(""),
  );
  console.log("-".repeat(157));
  for (const result of results) {
    const slowest = result.slowestApi
      ? `${result.slowestApi.path} ${fmtMs(result.slowestApi.totalMs)} app=${fmtMs(
          result.slowestApi.appMs,
        )} db=${fmtMs(result.slowestApi.dbMs)} route=${result.slowestApi.routeCache ?? "-"} vercel=${
          result.slowestApi.vercelCache ?? "-"
        }`
      : "-";
    console.log(
      [
        pad(result.status, 7),
        pad(result.view, 39),
        pad(result.viewport, 10),
        pad(fmtMs(result.readyP95), 11),
        pad(fmtMs(result.domP95), 9),
        pad(fmtMs(result.apiP95), 9),
        pad(fmtMs(result.targetMs), 9),
        pad(result.apiCallCount, 10),
        slowest,
      ].join(""),
    );
    if (result.errors.length) {
      console.log(`       ${result.errors.join("; ")}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = await launchBrowser(options.headed);
  const results = [];

  try {
    for (const view of options.views) {
      for (const viewport of options.viewports) {
        const samples = [];
        const totalRuns = options.warmup + options.samples;
        for (let index = 0; index < totalRuns; index += 1) {
          samples.push(await runSample(browser, view, viewport, options, index, index >= options.warmup));
        }
        results.push(summarizeViewport(view, viewport, samples, options.targetMs));
      }
    }
  } finally {
    await browser.close();
  }

  if (options.json) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), options, results }, null, 2));
  } else {
    printTable(results, options);
  }

  const failed = results.some((result) => result.status === "FAIL");
  const slow = results.some((result) => result.status === "SLOW");
  if (failed || (slow && !options.allowSlow)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
