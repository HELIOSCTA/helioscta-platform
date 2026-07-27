#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://frontend-helioscta.vercel.app";
const DEFAULT_REPEAT = 1;

const ROUTES = [
  {
    name: "Back Office home",
    path: "/api/backoffice-home",
  },
  {
    name: "Back Office monitor",
    path: "/api/backoffice-monitor",
  },
  {
    name: "Back Office positions trades",
    path: "/api/backoffice-positions-trades",
  },
  {
    name: "Back Office trade pipeline",
    path: "/api/backoffice-trade-pipeline",
  },
  {
    name: "NAV daily gas",
    path: "/api/backoffice-nav-daily-position-sheet?schema=power-options-accounts-v1&positionView=gas&optionDetail=0",
  },
  {
    name: "NAV daily power",
    path: "/api/backoffice-nav-daily-position-sheet?schema=power-options-accounts-v1&positionView=power&optionDetail=0",
  },
  {
    name: "ICE raw trade blotter",
    path: "/api/ice-trade-blotter/raw",
  },
  {
    name: "ICE raw drilldown",
    path: "/api/ice-trade-blotter/raw/drilldown?limit=25",
  },
  {
    name: "Clear Street trades",
    path: "/api/clear-street-trades?account=TITAN&limit=100",
    clearStreet: true,
  },
  {
    name: "Clear Street drilldown",
    path: "/api/clear-street-trades/drilldown?account=TITAN&limit=25",
    clearStreet: true,
  },
];

function usage() {
  return `
Usage:
  npm run warm:backoffice -- [options]

Options:
  --base-url=<url>       App base URL. Default: ${DEFAULT_BASE_URL}
  --repeat=<n>           Number of warm-up passes. Default: ${DEFAULT_REPEAT}
  --skip-clear-street    Skip Clear Street endpoints.
  --cache-bust           Add a unique query param to force route cache misses.
  --json                 Print machine-readable JSON instead of a table.
  --help                 Show this help.

Environment:
  HELIOS_BACKOFFICE_WARM_BASE_URL     Same as --base-url.
  HELIOS_API_HEALTH_BYPASS_TOKEN      Vercel protection bypass token sent as a request header.
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
    baseUrl: process.env.HELIOS_BACKOFFICE_WARM_BASE_URL || DEFAULT_BASE_URL,
    repeat: DEFAULT_REPEAT,
    includeClearStreet: true,
    cacheBust: false,
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
    if (arg.startsWith("--repeat=")) {
      options.repeat = positiveInt(arg.slice("--repeat=".length), "repeat");
      continue;
    }
    if (arg === "--skip-clear-street") {
      options.includeClearStreet = false;
      continue;
    }
    if (arg === "--cache-bust") {
      options.cacheBust = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
  }

  return options;
}

function normalizeBaseUrl(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildUrl(baseUrl, path, cacheBust, requestId) {
  const url = new URL(path, normalizeBaseUrl(baseUrl));
  if (cacheBust) {
    url.searchParams.set("_warm", requestId);
  }
  return url;
}

function requestHeaders() {
  const headers = { Accept: "application/json" };
  const bypassToken = process.env.HELIOS_API_HEALTH_BYPASS_TOKEN;
  if (bypassToken) {
    headers["x-vercel-protection-bypass"] = bypassToken;
  }
  return headers;
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

function fmtMs(value) {
  return value === null || value === undefined ? "-" : `${Math.round(value)}ms`;
}

function pad(value, length) {
  return String(value).padEnd(length, " ");
}

async function warmRoute(route, options, pass) {
  const requestId = `${Date.now()}-${route.name.replaceAll(/\W+/g, "-")}-${pass}`;
  const url = buildUrl(options.baseUrl, route.path, options.cacheBust, requestId);
  const startedAt = performance.now();
  const response = await fetch(url, { headers: requestHeaders() });
  const body = await response.text();
  const totalMs = performance.now() - startedAt;
  const serverTiming = parseServerTiming(response.headers.get("server-timing"));

  return {
    pass,
    name: route.name,
    path: route.path,
    status: response.status,
    ok: response.ok,
    totalMs,
    appMs: serverTiming.app ?? null,
    dbMs: serverTiming.db ?? null,
    dataAsOf: response.headers.get("x-helios-data-as-of"),
    cachePolicy: response.headers.get("x-helios-cache-policy"),
    routeCache: response.headers.get("x-helios-route-cache"),
    vercelCache: response.headers.get("x-vercel-cache"),
    payloadBytes: new TextEncoder().encode(body).length,
  };
}

function printTable(results, options) {
  console.log(`Base URL: ${normalizeBaseUrl(options.baseUrl)}`);
  console.log(`Passes: ${options.repeat}`);
  console.log(`Cache bust: ${options.cacheBust ? "yes" : "no"}`);
  console.log("");
  console.log(
    [
      pad("OK", 5),
      pad("Pass", 6),
      pad("Route", 30),
      pad("HTTP", 7),
      pad("Total", 9),
      pad("App", 9),
      pad("DB", 9),
      pad("Route cache", 13),
      "Data as of",
    ].join(""),
  );
  console.log("-".repeat(115));
  for (const result of results) {
    console.log(
      [
        pad(result.ok ? "yes" : "no", 5),
        pad(result.pass, 6),
        pad(result.name, 30),
        pad(result.status, 7),
        pad(fmtMs(result.totalMs), 9),
        pad(fmtMs(result.appMs), 9),
        pad(fmtMs(result.dbMs), 9),
        pad(result.routeCache ?? "-", 13),
        result.dataAsOf ?? "-",
      ].join(""),
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const routes = ROUTES.filter((route) => options.includeClearStreet || !route.clearStreet);
  const results = [];

  for (let pass = 1; pass <= options.repeat; pass += 1) {
    for (const route of routes) {
      results.push(await warmRoute(route, options, pass));
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), options, results }, null, 2));
  } else {
    printTable(results, options);
  }

  if (results.some((result) => !result.ok)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
