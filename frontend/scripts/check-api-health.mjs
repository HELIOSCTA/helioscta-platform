#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_SAMPLES = 3;
const DEFAULT_WARMUP = 1;

const endpoints = [
  {
    name: "Ops readiness",
    path: "/api/ops/readiness",
    targetMs: 500,
  },
  {
    name: "PJM DA LMPs",
    path: "/api/pjm-da-lmps",
    targetMs: 750,
  },
  {
    name: "PJM RT LMPs",
    path: "/api/pjm-rt-lmps?source=unverified",
    targetMs: 1_000,
  },
  {
    name: "PJM settles",
    path: "/api/pjm-lmp-settles?hub=WESTERN%20HUB&component=total&rtSource=unverified",
    targetMs: 1_500,
  },
  {
    name: "PJM duration curves",
    path: "/api/pjm-price-duration-curves?hub=WESTERN%20HUB&month=7&years=2021,2022,2023,2024,2025&hourFilter=weekday_onpeak",
    targetMs: 1_500,
    devOnly: true,
  },
  {
    name: "PJM forecasts",
    path: "/api/pjm-forecasts?area=RTO_COMBINED",
    targetMs: 750,
  },
  {
    name: "PJM load growth",
    path: "/api/pjm-load-growth?source=prelim&loadArea=AEP&weatherStation=PJM&region=PJM",
    targetMs: 1_000,
  },
  {
    name: "PJM forecast explorer",
    path: "/api/pjm-forecast-explorer",
    targetMs: 750,
  },
  {
    name: "PJM forecast diffs",
    path: "/api/pjm-forecast-differences?area=RTO_COMBINED&lookbackHours=72",
    targetMs: 750,
  },
  {
    name: "PJM Meteologica forecast explorer",
    path: "/api/pjm-meteologica-forecast-explorer",
    targetMs: 1_000,
  },
  {
    name: "PJM Meteologica forecast diffs",
    path: "/api/pjm-meteologica-forecast-differences?area=RTO&lookbackHours=72",
    targetMs: 1_000,
  },
  {
    name: "PJM outage forecast",
    path: "/api/pjm-outages?view=forecast&region=RTO&executionLimit=8",
    targetMs: 1_500,
  },
  {
    name: "PJM outage seasonal",
    path: "/api/pjm-outages?view=seasonal&region=RTO&seasonalYearLimit=8",
    targetMs: 1_500,
  },
  {
    name: "WSI hourly temps",
    path: "/api/weather/hourly-temps?region=PJM&observedLookbackDays=3&forecastRun=primary",
    targetMs: 1_500,
    devOnly: true,
  },
  {
    name: "WSI hourly forecast",
    path: "/api/weather/hourly-forecast?region=PJM&station=PJM&forecastRun=primary",
    targetMs: 1_500,
    devOnly: true,
  },
  {
    name: "NOAA METAR weather",
    path: "/api/pjm-weather?region=PJM&hours=24",
    targetMs: 750,
    devOnly: true,
  },
];

function usage() {
  return `
Usage:
  npm run check:api -- [options]

Options:
  --base-url=<url>     Base URL to check. Default: ${DEFAULT_BASE_URL}
  --samples=<n>        Measured samples per endpoint. Default: ${DEFAULT_SAMPLES}
  --warmup=<n>         Warmup requests per endpoint. Default: ${DEFAULT_WARMUP}
  --cache-bust         Add a unique query param so Vercel/Next cache misses are measured.
  --require-timing     Fail when Server-Timing is missing.
  --allow-slow         Exit 0 when routes exceed target latency, but still report SLOW.
  --json               Print machine-readable JSON instead of a table.
  --help               Show this help.

Environment:
  HELIOS_API_HEALTH_BASE_URL      Same as --base-url.
  HELIOS_API_HEALTH_BYPASS_TOKEN  Vercel protection bypass token. Appended as a query param.
`.trim();
}

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.HELIOS_API_HEALTH_BASE_URL || DEFAULT_BASE_URL,
    samples: DEFAULT_SAMPLES,
    warmup: DEFAULT_WARMUP,
    cacheBust: false,
    requireTiming: false,
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
    if (arg.startsWith("--samples=")) {
      options.samples = positiveInt(arg.slice("--samples=".length), "samples");
      continue;
    }
    if (arg.startsWith("--warmup=")) {
      options.warmup = positiveInt(arg.slice("--warmup=".length), "warmup", 0);
      continue;
    }
    if (arg === "--cache-bust") {
      options.cacheBust = true;
      continue;
    }
    if (arg === "--require-timing") {
      options.requireTiming = true;
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

  return options;
}

function positiveInt(value, name, min = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`--${name} must be an integer >= ${min}`);
  }
  return parsed;
}

function buildUrl(baseUrl, path, cacheBust, requestId) {
  const url = new URL(path, normalizeBaseUrl(baseUrl));
  if (cacheBust) {
    url.searchParams.set("_health", requestId);
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

function normalizeBaseUrl(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function isLocalBaseUrl(value) {
  const hostname = new URL(normalizeBaseUrl(value)).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1";
}

function parseServerTiming(value) {
  if (!value) return {};
  const result = {};
  for (const part of value.split(",")) {
    const [name, ...attrs] = part.trim().split(";");
    const dur = attrs
      .map((attr) => attr.trim())
      .find((attr) => attr.startsWith("dur="));
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

function fmtBytes(value) {
  if (value === null || value === undefined) return "-";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}MB`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}KB`;
  return `${value}B`;
}

function pad(value, length) {
  return String(value).padEnd(length, " ");
}

async function measureEndpoint(endpoint, options) {
  const samples = [];
  const errors = [];
  const totalRequests = options.warmup + options.samples;

  for (let index = 0; index < totalRequests; index += 1) {
    const measured = index >= options.warmup;
    const requestId = `${Date.now()}-${endpoint.name.replaceAll(/\W+/g, "-")}-${index}`;
    const startedAt = performance.now();
    const url = buildUrl(options.baseUrl, endpoint.path, options.cacheBust, requestId);

    try {
      const response = await fetch(url, {
        headers: requestHeaders(),
      });
      const body = await response.text();
      const totalMs = performance.now() - startedAt;
      const serverTiming = parseServerTiming(response.headers.get("server-timing"));
      const contentType = response.headers.get("content-type") || "";
      const payloadBytes = new TextEncoder().encode(body).length;
      const dataAsOf = response.headers.get("x-helios-data-as-of");

      let parsedBody = null;
      if (contentType.includes("application/json")) {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          errors.push("invalid JSON response");
        }
      }

      if (!response.ok) {
        errors.push(`HTTP ${response.status}`);
      }
      if (!contentType.includes("application/json")) {
        errors.push(`non-JSON response: ${contentType || "unknown content type"}`);
      }
      if (options.requireTiming && !response.headers.get("server-timing")) {
        errors.push("missing Server-Timing header");
      }
      if (!dataAsOf || dataAsOf === "unknown") {
        errors.push("missing X-Helios-Data-As-Of");
      }

      if (measured) {
        samples.push({
          status: response.status,
          totalMs,
          appMs: serverTiming.app ?? null,
          dbMs: serverTiming.db ?? null,
          payloadBytes,
          dataAsOf,
          cachePolicy: response.headers.get("x-helios-cache-policy"),
          rowCount: typeof parsedBody?.rowCount === "number" ? parsedBody.rowCount : null,
        });
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "request failed");
      if (measured) {
        samples.push({
          status: 0,
          totalMs: performance.now() - startedAt,
          appMs: null,
          dbMs: null,
          payloadBytes: null,
          dataAsOf: null,
          cachePolicy: null,
          rowCount: null,
        });
      }
    }
  }

  const appValues = samples
    .map((sample) => sample.appMs)
    .filter((value) => typeof value === "number");
  const dbValues = samples
    .map((sample) => sample.dbMs)
    .filter((value) => typeof value === "number");
  const totalValues = samples.map((sample) => sample.totalMs);
  const appP95 = percentile(appValues.length ? appValues : totalValues, 95);
  const totalP95 = percentile(totalValues, 95);
  const dbP95 = percentile(dbValues, 95);
  const slow = appP95 !== null && appP95 > endpoint.targetMs;
  const latest = samples.at(-1) ?? {};

  return {
    name: endpoint.name,
    path: endpoint.path,
    targetMs: endpoint.targetMs,
    status: errors.length ? "FAIL" : slow ? "SLOW" : "PASS",
    appP95,
    dbP95,
    totalP95,
    payloadBytes: latest.payloadBytes ?? null,
    rowCount: latest.rowCount ?? null,
    dataAsOf: latest.dataAsOf ?? null,
    cachePolicy: latest.cachePolicy ?? null,
    errors: [...new Set(errors)],
  };
}

function printTable(results, options) {
  console.log(`Base URL: ${options.baseUrl}`);
  console.log(`Samples: ${options.samples} measured, ${options.warmup} warmup`);
  console.log(`Cache bust: ${options.cacheBust ? "yes" : "no"}`);
  console.log("");
  console.log(
    [
      pad("Status", 7),
      pad("Endpoint", 22),
      pad("App p95", 9),
      pad("DB p95", 8),
      pad("Total p95", 10),
      pad("Target", 8),
      pad("Rows", 7),
      pad("Bytes", 8),
      "Data as of",
    ].join(""),
  );
  console.log("-".repeat(104));
  for (const result of results) {
    console.log(
      [
        pad(result.status, 7),
        pad(result.name, 22),
        pad(fmtMs(result.appP95), 9),
        pad(fmtMs(result.dbP95), 8),
        pad(fmtMs(result.totalP95), 10),
        pad(fmtMs(result.targetMs), 8),
        pad(result.rowCount ?? "-", 7),
        pad(fmtBytes(result.payloadBytes), 8),
        result.dataAsOf ?? "-",
      ].join(""),
    );
    if (result.errors.length) {
      console.log(`       ${result.errors.join("; ")}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const results = [];
  const endpointsToCheck = endpoints.filter(
    (endpoint) => !endpoint.devOnly || isLocalBaseUrl(options.baseUrl),
  );

  for (const endpoint of endpointsToCheck) {
    results.push(await measureEndpoint(endpoint, options));
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
