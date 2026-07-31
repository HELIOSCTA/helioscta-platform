import { observedJsonRoute } from "@/lib/server/apiObservability";
import { isWeatherDevEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

const CACHE_TTL_MS = 60 * 1000;
const FRESH_CACHE_HEADER = "public, s-maxage=60, stale-while-revalidate=30";
const ROUTE_CONFIG = {
  route: "/api/weather/free-observations",
  cacheHeader: FRESH_CACHE_HEADER,
  cachePolicy: "s-maxage=60, stale-while-revalidate=30",
  owner: "frontend",
  purpose: "Free NOAA/IEM surface observations and MRMS latest product metadata",
  p95TargetMs: 2500,
  freshnessSource: "api.weather.gov, mesonet.agron.iastate.edu, mrms.ncep.noaa.gov",
} as const;

const DEFAULT_STATIONS = ["KORD", "KCMH", "KPIT", "KPHL", "KEWR", "KBWI", "KDCA", "KRDU"];
const IEM_FIELDS = [
  "tmpf",
  "dwpf",
  "relh",
  "sknt",
  "gust",
  "drct",
  "p01i",
  "alti",
  "mslp",
  "vsby",
  "wxcodes",
  "metar",
];
const MRMS_PRODUCTS = [
  "MergedReflectivityQCComposite",
  "ReflectivityAtLowestAltitude",
  "PrecipRate",
  "MESH",
  "MergedAzShear_0-2kmAGL",
  "NLDN_CG_005min_AvgDensity",
];
const USER_AGENT =
  process.env.WEATHER_USER_AGENT ??
  "helioscta-platform-free-weather (local prototype; contact unavailable)";

type NwsLatestObservation = {
  stationId: string;
  timestamp: string | null;
  tempF: number | null;
  dewPointF: number | null;
  windDirectionDeg: number | null;
  windSpeedMph: number | null;
  windGustMph: number | null;
  rawMessage: string | null;
  textDescription: string | null;
  error?: string;
};

type IemObservationRow = {
  station: string;
  stationId: string;
  valid: string;
  lon: number | null;
  lat: number | null;
  tmpf: number | null;
  dwpf: number | null;
  relh: number | null;
  sknt: number | null;
  gust: number | null;
  drct: number | null;
  p01i: number | null;
  alti: number | null;
  mslp: number | null;
  vsby: number | null;
  wxcodes: string | null;
  metar: string | null;
  reportType: "MADIS HF" | "METAR";
};

type MrmsProduct = {
  product: string;
  url: string;
  latestModified: string | null;
  sizeBytes: number | null;
  available: boolean;
  error?: string;
};

type FreeWeatherPayload = {
  source: "NOAA_NWS+IEM_ASOS+NOAA_MRMS";
  filters: {
    stations: string[];
    hours: number;
  };
  asOf: {
    iem: string | null;
    nws: string | null;
    mrms: string | null;
  };
  nwsLatest: NwsLatestObservation[];
  iemRows: IemObservationRow[];
  mrmsProducts: MrmsProduct[];
  rowCounts: {
    iemRows: number;
    nwsStations: number;
    mrmsProducts: number;
  };
};

const RESPONSE_CACHE = new Map<string, { expiresAt: number; payload: FreeWeatherPayload }>();

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseStations(raw: string | null): string[] {
  const values = raw?.split(",") ?? DEFAULT_STATIONS;
  const seen = new Set<string>();
  for (const value of values) {
    const station = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!station) continue;
    seen.add(station.length === 3 ? `K${station}` : station);
    if (seen.size >= 16) break;
  }
  return Array.from(seen).length ? Array.from(seen) : DEFAULT_STATIONS;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === "M" || text === "T") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function cToF(value: unknown): number | null {
  const celsius = toNumber(value);
  if (celsius === null) return null;
  return Math.round(((celsius * 9) / 5 + 32) * 10) / 10;
}

function mpsToMph(value: unknown): number | null {
  const mps = toNumber(value);
  if (mps === null) return null;
  return Math.round(mps * 2.236936 * 10) / 10;
}

function maxStamp(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
    return leftMs >= rightMs ? left : right;
  }
  return left > right ? left : right;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function ymdParts(date: Date): { year: string; month: string; day: string } {
  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1),
    day: String(date.getUTCDate()),
  };
}

function iemStationId(stationId: string): string {
  return stationId.startsWith("K") && stationId.length === 4 ? stationId.slice(1) : stationId;
}

function displayStationId(iemStation: string): string {
  return iemStation.length === 3 ? `K${iemStation}` : iemStation;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function parseIemCsv(csv: string, startTime: Date): IemObservationRow[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  const header = lines.shift();
  if (!header) return [];
  const fields = parseCsvLine(header);
  const rows: IemObservationRow[] = [];

  for (const line of lines) {
    const values = parseCsvLine(line);
    const record = Object.fromEntries(fields.map((field, index) => [field, values[index] ?? ""]));
    const valid = record.valid ? new Date(`${record.valid.replace(" ", "T")}:00Z`) : null;
    if (!valid || Number.isNaN(valid.getTime()) || valid < startTime) continue;
    const station = record.station ?? "";
    const metar = record.metar?.trim() || null;
    rows.push({
      station,
      stationId: displayStationId(station),
      valid: valid.toISOString(),
      lon: toNumber(record.lon),
      lat: toNumber(record.lat),
      tmpf: toNumber(record.tmpf),
      dwpf: toNumber(record.dwpf),
      relh: toNumber(record.relh),
      sknt: toNumber(record.sknt),
      gust: toNumber(record.gust),
      drct: toNumber(record.drct),
      p01i: toNumber(record.p01i),
      alti: toNumber(record.alti),
      mslp: toNumber(record.mslp),
      vsby: toNumber(record.vsby),
      wxcodes: record.wxcodes?.trim() || null,
      metar,
      reportType: metar?.includes("MADISHF") ? "MADIS HF" : "METAR",
    });
  }

  return rows.sort((left, right) => left.valid.localeCompare(right.valid));
}

async function fetchIemRows(stations: string[], hours: number): Promise<IemObservationRow[]> {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  const endDate = addDays(end, 1);
  const startParts = ymdParts(start);
  const endParts = ymdParts(endDate);
  const params = new URLSearchParams();

  for (const station of stations) params.append("station", iemStationId(station));
  for (const field of IEM_FIELDS) params.append("data", field);
  params.set("year1", startParts.year);
  params.set("month1", startParts.month);
  params.set("day1", startParts.day);
  params.set("year2", endParts.year);
  params.set("month2", endParts.month);
  params.set("day2", endParts.day);
  params.set("tz", "Etc/UTC");
  params.set("format", "onlycomma");
  params.set("latlon", "yes");
  params.set("elev", "no");
  params.set("missing", "M");
  params.set("trace", "T");
  params.set("direct", "no");
  params.append("report_type", "1");
  params.append("report_type", "2");
  params.append("report_type", "3");

  const response = await fetch(
    `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?${params.toString()}`,
    {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 60 },
    },
  );
  if (!response.ok) {
    throw new Error(`IEM ASOS request failed with HTTP ${response.status}`);
  }
  return parseIemCsv(await response.text(), start);
}

async function fetchNwsLatest(stationId: string): Promise<NwsLatestObservation> {
  try {
    const response = await fetch(
      `https://api.weather.gov/stations/${stationId}/observations/latest`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/geo+json",
        },
        next: { revalidate: 60 },
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = (await response.json()) as {
      properties?: {
        timestamp?: string | null;
        temperature?: { value?: unknown };
        dewpoint?: { value?: unknown };
        windDirection?: { value?: unknown };
        windSpeed?: { value?: unknown };
        windGust?: { value?: unknown };
        rawMessage?: string | null;
        textDescription?: string | null;
      };
    };
    const properties = json.properties ?? {};
    return {
      stationId,
      timestamp: properties.timestamp ?? null,
      tempF: cToF(properties.temperature?.value),
      dewPointF: cToF(properties.dewpoint?.value),
      windDirectionDeg: toNumber(properties.windDirection?.value),
      windSpeedMph: mpsToMph(properties.windSpeed?.value),
      windGustMph: mpsToMph(properties.windGust?.value),
      rawMessage: properties.rawMessage ?? null,
      textDescription: properties.textDescription ?? null,
    };
  } catch (error) {
    return {
      stationId,
      timestamp: null,
      tempF: null,
      dewPointF: null,
      windDirectionDeg: null,
      windSpeedMph: null,
      windGustMph: null,
      rawMessage: null,
      textDescription: null,
      error: error instanceof Error ? error.message : "NWS request failed",
    };
  }
}

async function fetchMrmsProduct(product: string): Promise<MrmsProduct> {
  const url = `https://mrms.ncep.noaa.gov/data/2D/${product}/MRMS_${product}.latest.grib2.gz`;
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 60 },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return {
      product,
      url,
      latestModified: response.headers.get("last-modified"),
      sizeBytes: toNumber(response.headers.get("content-length")),
      available: true,
    };
  } catch (error) {
    return {
      product,
      url,
      latestModified: null,
      sizeBytes: null,
      available: false,
      error: error instanceof Error ? error.message : "MRMS request failed",
    };
  }
}

function dataAsOf(payload: FreeWeatherPayload): string | null {
  return maxStamp(maxStamp(payload.asOf.iem, payload.asOf.nws), payload.asOf.mrms);
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const stations = parseStations(searchParams.get("stations"));
  const hours = clampInt(searchParams.get("hours"), 6, 1, 24);
  const refresh = searchParams.get("refresh") === "1";
  const cacheKey = ["weather-free-observations", stations.join("|"), hours].join(":");

  if (!refresh) {
    const cached = RESPONSE_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        payload: cached.payload,
        headers: {
          "Cache-Control": FRESH_CACHE_HEADER,
          "X-Weather-Free-Observations-Cache": "HIT",
        },
        rowCount: cached.payload.rowCounts.iemRows,
        dataAsOf: dataAsOf(cached.payload),
      };
    }
  }

  const [iemRows, nwsLatest, mrmsProducts] = await Promise.all([
    fetchIemRows(stations, hours),
    Promise.all(stations.map(fetchNwsLatest)),
    Promise.all(MRMS_PRODUCTS.map(fetchMrmsProduct)),
  ]);
  const iemAsOf = iemRows.reduce<string | null>(
    (latest, row) => maxStamp(latest, row.valid),
    null,
  );
  const nwsAsOf = nwsLatest.reduce<string | null>(
    (latest, row) => maxStamp(latest, row.timestamp),
    null,
  );
  const mrmsAsOf = mrmsProducts.reduce<string | null>(
    (latest, row) => maxStamp(latest, row.latestModified),
    null,
  );
  const payload: FreeWeatherPayload = {
    source: "NOAA_NWS+IEM_ASOS+NOAA_MRMS",
    filters: { stations, hours },
    asOf: {
      iem: iemAsOf,
      nws: nwsAsOf,
      mrms: mrmsAsOf,
    },
    nwsLatest,
    iemRows,
    mrmsProducts,
    rowCounts: {
      iemRows: iemRows.length,
      nwsStations: nwsLatest.length,
      mrmsProducts: mrmsProducts.length,
    },
  };

  RESPONSE_CACHE.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });

  return {
    payload,
    headers: {
      "Cache-Control": FRESH_CACHE_HEADER,
      "X-Weather-Free-Observations-Cache": "MISS",
    },
    rowCount: payload.rowCounts.iemRows,
    dataAsOf: dataAsOf(payload),
  };
});

export async function GET(request: Request): Promise<Response> {
  if (!isWeatherDevEnabled()) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return observedGET(request);
}
