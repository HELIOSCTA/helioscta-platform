import { observedJsonRoute } from "@/lib/server/apiObservability";
import { isWeatherDevEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

const CACHE_TTL_MS = 5 * 60 * 1000;
const IEM_CACHE_TTL_MS = 10 * 60 * 1000;
const IEM_STALE_TTL_MS = 6 * 60 * 60 * 1000;
const IEM_RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;
const FRESH_CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=120";
const ROUTE_CONFIG = {
  route: "/api/weather/short-term",
  cacheHeader: FRESH_CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=120",
  owner: "frontend",
  purpose: "DB-free short-term public weather observations, historical radar frames, and NWS forecasts",
  p95TargetMs: 3500,
  freshnessSource:
    "IEM ASOS/MADIS, IEM NEXRAD WMS, api.weather.gov, mapservices.weather.noaa.gov",
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
const USER_AGENT =
  process.env.WEATHER_USER_AGENT ??
  "helioscta-platform-short-term-weather (local prototype; contact unavailable)";
const IEM_ASOS_REQUEST_URL = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py";
const RADAR_QUERY_URL =
  "https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer/query";
const RADAR_TILE_TEMPLATE =
  "https://mapservices.weather.noaa.gov/eventdriven/services/radar/radar_base_reflectivity_time/ImageServer/WMSServer?service=WMS&request=GetMap&version=1.3.0&layers=radar_base_reflectivity_time&styles=&format=image/png32&transparent=true&exceptions=BLANK&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&time={time}";
const IEM_NEXRAD_WMS_TILE_TEMPLATE =
  "https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r-t.cgi?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=nexrad-n0r-wmst&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&TIME={time}";
const IEM_NEXRAD_INFO_URL = "https://mesonet.agron.iastate.edu/docs/nexrad_mosaic/";
const IEM_NEXRAD_LOOP_URL = "https://mesonet.agron.iastate.edu/current/mcview.phtml";
const IEM_NEXRAD_FRAME_INTERVAL_MINUTES = 5;
const IEM_NEXRAD_AVAILABILITY_LAG_MINUTES = 10;

const DEFAULT_STATION_POINTS: Record<string, { lat: number; lon: number }> = {
  KORD: { lat: 41.9796, lon: -87.9045 },
  KCMH: { lat: 39.998, lon: -82.8919 },
  KPIT: { lat: 40.4915, lon: -80.2329 },
  KPHL: { lat: 39.8719, lon: -75.2411 },
  KEWR: { lat: 40.6925, lon: -74.1687 },
  KBWI: { lat: 39.1774, lon: -76.6684 },
  KDCA: { lat: 38.8512, lon: -77.0402 },
  KRDU: { lat: 35.8776, lon: -78.7875 },
};

type ReportType = "MADIS HF" | "METAR";

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
  reportType: ReportType;
};

type NwsLatestObservation = {
  stationId: string;
  lat: number | null;
  lon: number | null;
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

type ForecastPeriod = {
  startTime: string;
  endTime: string | null;
  tempF: number | null;
  dewPointF: number | null;
  humidityPct: number | null;
  precipProbabilityPct: number | null;
  windSpeed: string | null;
  windDirection: string | null;
  shortForecast: string | null;
  icon: string | null;
  isDaytime: boolean | null;
};

type StationForecast = {
  stationId: string;
  lat: number | null;
  lon: number | null;
  forecastHourlyUrl: string | null;
  city: string | null;
  state: string | null;
  generatedAt: string | null;
  updateTime: string | null;
  validTimes: string | null;
  periods: ForecastPeriod[];
  error?: string;
};

type StationSummary = {
  stationId: string;
  lat: number | null;
  lon: number | null;
  latestObservation: IemObservationRow | null;
  nwsLatest: NwsLatestObservation | null;
  forecast: StationForecast | null;
};

type RadarFrame = {
  name: string;
  validTime: string;
  validEndTime: string | null;
  epochMs: number;
  source: "NOAA_MRMS_LIVE_WMS" | "IEM_NEXRAD_ARCHIVE_WMS";
};

type StationDataSourceLinks = {
  stationId: string;
  nwsLatestObservationUrl: string;
  nwsPointUrl: string | null;
  nwsHourlyForecastUrl: string | null;
};

type SourceCacheStatus = "HIT" | "MISS" | "STALE" | "ERROR" | "BACKOFF";

type DataSourceLink = {
  label: string;
  provider: string;
  url: string;
  use: string;
};

type ShortTermWeatherPayload = {
  source: "IEM_ASOS_MADIS+NWS_API+NOAA_MRMS_RADAR+IEM_NEXRAD_ARCHIVE_WMS";
  filters: {
    stations: string[];
    observationHours: number;
    forecastHours: number;
  };
  asOf: {
    observations: string | null;
    latestNws: string | null;
    forecasts: string | null;
    radar: string | null;
  };
  stations: StationSummary[];
  observationRows: IemObservationRow[];
  radar: {
    service: "IEM_NEXRAD_ARCHIVE_WMS";
    productLabel: string;
    tileUrlTemplate: string;
    frames: RadarFrame[];
    latestFrame: RadarFrame | null;
    historyHours: number;
    updateFrequencyMinutes: number;
    live: {
      service: "NOAA_MRMS_RADAR_BASE_REFLECTIVITY_TIME";
      tileUrlTemplate: string;
      frames: RadarFrame[];
      latestFrame: RadarFrame | null;
      historyHours: number;
      updateFrequencyMinutes: number;
    };
  };
  dataSources: {
    primaryLinks: DataSourceLink[];
    stationLinks: StationDataSourceLinks[];
  };
  sourceStatus: {
    iem: {
      cacheStatus: SourceCacheStatus;
      backoffUntil: string | null;
      error: string | null;
    };
    radar: {
      frameStatus: "REQUESTED_WMS_TIMES";
      note: string;
    };
  };
  rowCounts: {
    observationRows: number;
    stations: number;
    forecastPeriods: number;
    radarFrames: number;
  };
  errors: string[];
};

const RESPONSE_CACHE = new Map<
  string,
  { expiresAt: number; payload: ShortTermWeatherPayload }
>();
const IEM_CACHE = new Map<
  string,
  {
    expiresAt: number;
    staleUntil: number;
    rows: IemObservationRow[];
    requestUrl: string;
  }
>();
let iemBackoffUntil = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
    if (seen.size >= 8) break;
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

function iemStationId(stationId: string): string {
  return stationId.startsWith("K") && stationId.length === 4 ? stationId.slice(1) : stationId;
}

function isoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
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

function parseIemValid(value: string | undefined): Date | null {
  if (!value) return null;
  const normalized = value.trim().replace(" ", "T");
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
    ? `${normalized}:00`
    : normalized;
  const parsed = new Date(`${withSeconds}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
    const valid = parseIemValid(record.valid);
    if (!valid || valid < startTime) continue;
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

async function fetchIemRowsUncached(stations: string[], hours: number): Promise<IemObservationRow[]> {
  const requestUrl = buildIemRequestUrl(stations, hours);
  const response = await fetch(requestUrl, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`IEM ASOS request failed with HTTP ${response.status}`);
  }
  const start = new Date(Date.now() - hours * 60 * 60 * 1000);
  return parseIemCsv(await response.text(), start);
}

function iemCacheKey(stations: string[], hours: number): string {
  return ["iem-asos", stations.join("|"), hours].join(":");
}

function isIemRateLimited(error: unknown): boolean {
  return error instanceof Error && error.message.includes("HTTP 429");
}

async function fetchIemRows(
  stations: string[],
  hours: number,
): Promise<{
  rows: IemObservationRow[];
  cacheStatus: SourceCacheStatus;
  error: string | null;
}> {
  const now = Date.now();
  const cacheKey = iemCacheKey(stations, hours);
  const cached = IEM_CACHE.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return { rows: cached.rows, cacheStatus: "HIT", error: null };
  }

  if (iemBackoffUntil > now) {
    const backoffMessage = `IEM ASOS is temporarily backed off after HTTP 429 until ${new Date(
      iemBackoffUntil,
    ).toISOString()}.`;
    if (cached && cached.staleUntil > now) {
      return {
        rows: cached.rows,
        cacheStatus: "STALE",
        error: `${backoffMessage} Showing cached observation rows.`,
      };
    }
    return {
      rows: [],
      cacheStatus: "BACKOFF",
      error: `${backoffMessage} No cached observation rows are available for this station/window.`,
    };
  }

  try {
    const rows = await fetchIemRowsUncached(stations, hours);
    IEM_CACHE.set(cacheKey, {
      expiresAt: now + IEM_CACHE_TTL_MS,
      staleUntil: now + IEM_STALE_TTL_MS,
      rows,
      requestUrl: buildIemRequestUrl(stations, hours),
    });
    return { rows, cacheStatus: "MISS", error: null };
  } catch (error) {
    if (isIemRateLimited(error)) {
      iemBackoffUntil = Date.now() + IEM_RATE_LIMIT_BACKOFF_MS;
    }
    const message = error instanceof Error ? error.message : "IEM ASOS request failed";
    if (cached && cached.staleUntil > now) {
      return {
        rows: cached.rows,
        cacheStatus: "STALE",
        error: `${message}. Showing cached observation rows.`,
      };
    }
    return { rows: [], cacheStatus: "ERROR", error: message };
  }
}

function buildIemRequestUrl(stations: string[], hours: number): string {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  const params = new URLSearchParams();

  for (const station of stations) params.append("station", iemStationId(station));
  for (const field of IEM_FIELDS) params.append("data", field);
  params.set("sts", isoSeconds(start));
  params.set("ets", isoSeconds(end));
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

  return `${IEM_ASOS_REQUEST_URL}?${params.toString()}`;
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
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = (await response.json()) as {
      geometry?: {
        coordinates?: unknown[];
      } | null;
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
    const coordinates = json.geometry?.coordinates ?? [];
    const lon = toNumber(coordinates[0]);
    const lat = toNumber(coordinates[1]);
    return {
      stationId,
      lat,
      lon,
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
      lat: null,
      lon: null,
      timestamp: null,
      tempF: null,
      dewPointF: null,
      windDirectionDeg: null,
      windSpeedMph: null,
      windGustMph: null,
      rawMessage: null,
      textDescription: null,
      error: error instanceof Error ? error.message : "NWS latest request failed",
    };
  }
}

function latestRowsByStation(rows: IemObservationRow[]): Map<string, IemObservationRow> {
  const latest = new Map<string, IemObservationRow>();
  for (const row of rows) {
    const existing = latest.get(row.stationId);
    if (!existing || row.valid > existing.valid) latest.set(row.stationId, row);
  }
  return latest;
}

function stationPoint(
  stationId: string,
  latestRows: Map<string, IemObservationRow>,
  latestNws: Map<string, NwsLatestObservation>,
): { lat: number | null; lon: number | null } {
  const row = latestRows.get(stationId);
  if (row && row.lat !== null && row.lon !== null) return { lat: row.lat, lon: row.lon };
  const nws = latestNws.get(stationId);
  if (nws && nws.lat !== null && nws.lon !== null) return { lat: nws.lat, lon: nws.lon };
  const fallback = DEFAULT_STATION_POINTS[stationId];
  return fallback ? { lat: fallback.lat, lon: fallback.lon } : { lat: null, lon: null };
}

function parseForecastPeriod(raw: unknown): ForecastPeriod | null {
  if (!isRecord(raw)) return null;
  const startTime = typeof raw.startTime === "string" ? raw.startTime : null;
  if (!startTime) return null;
  const dewpoint = isRecord(raw.dewpoint) ? raw.dewpoint : null;
  const humidity = isRecord(raw.relativeHumidity) ? raw.relativeHumidity : null;
  const precipitation = isRecord(raw.probabilityOfPrecipitation)
    ? raw.probabilityOfPrecipitation
    : null;
  const temperatureUnit = typeof raw.temperatureUnit === "string" ? raw.temperatureUnit : "F";
  const rawTemp = toNumber(raw.temperature);

  return {
    startTime,
    endTime: typeof raw.endTime === "string" ? raw.endTime : null,
    tempF:
      rawTemp === null
        ? null
        : temperatureUnit.toUpperCase() === "C"
          ? Math.round(((rawTemp * 9) / 5 + 32) * 10) / 10
          : rawTemp,
    dewPointF: cToF(dewpoint?.value),
    humidityPct: toNumber(humidity?.value),
    precipProbabilityPct: toNumber(precipitation?.value),
    windSpeed: typeof raw.windSpeed === "string" ? raw.windSpeed : null,
    windDirection: typeof raw.windDirection === "string" ? raw.windDirection : null,
    shortForecast: typeof raw.shortForecast === "string" ? raw.shortForecast : null,
    icon: typeof raw.icon === "string" ? raw.icon : null,
    isDaytime: typeof raw.isDaytime === "boolean" ? raw.isDaytime : null,
  };
}

async function fetchStationForecast(
  stationId: string,
  lat: number | null,
  lon: number | null,
  forecastHours: number,
): Promise<StationForecast> {
  if (lat === null || lon === null) {
    return {
      stationId,
      lat,
      lon,
      forecastHourlyUrl: null,
      city: null,
      state: null,
      generatedAt: null,
      updateTime: null,
      validTimes: null,
      periods: [],
      error: "No station latitude/longitude available for NWS forecast",
    };
  }

  try {
    const pointResponse = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/geo+json",
        },
        cache: "no-store",
      },
    );
    if (!pointResponse.ok) throw new Error(`NWS points HTTP ${pointResponse.status}`);
    const pointJson = (await pointResponse.json()) as {
      properties?: {
        forecastHourly?: string;
        relativeLocation?: {
          properties?: {
            city?: string | null;
            state?: string | null;
          };
        };
      };
    };
    const forecastHourly = pointJson.properties?.forecastHourly;
    if (!forecastHourly) throw new Error("NWS points response did not include forecastHourly");

    const forecastResponse = await fetch(forecastHourly, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/geo+json",
      },
      cache: "no-store",
    });
    if (!forecastResponse.ok) throw new Error(`NWS hourly forecast HTTP ${forecastResponse.status}`);
    const forecastJson = (await forecastResponse.json()) as {
      properties?: {
        generatedAt?: string | null;
        updateTime?: string | null;
        validTimes?: string | null;
        periods?: unknown[];
      };
    };
    const cutoffMs = Date.now() + forecastHours * 60 * 60 * 1000;
    const periods = (forecastJson.properties?.periods ?? [])
      .map(parseForecastPeriod)
      .filter((period): period is ForecastPeriod => {
        if (!period) return false;
        const startMs = Date.parse(period.startTime);
        return Number.isFinite(startMs) && startMs <= cutoffMs;
      })
      .slice(0, forecastHours + 1);

    return {
      stationId,
      lat,
      lon,
      forecastHourlyUrl: forecastHourly,
      city: pointJson.properties?.relativeLocation?.properties?.city ?? null,
      state: pointJson.properties?.relativeLocation?.properties?.state ?? null,
      generatedAt: forecastJson.properties?.generatedAt ?? null,
      updateTime: forecastJson.properties?.updateTime ?? null,
      validTimes: forecastJson.properties?.validTimes ?? null,
      periods,
    };
  } catch (error) {
    return {
      stationId,
      lat,
      lon,
      forecastHourlyUrl: null,
      city: null,
      state: null,
      generatedAt: null,
      updateTime: null,
      validTimes: null,
      periods: [],
      error: error instanceof Error ? error.message : "NWS forecast request failed",
    };
  }
}

function nwsLatestObservationUrl(stationId: string): string {
  return `https://api.weather.gov/stations/${stationId}/observations/latest`;
}

function nwsPointUrl(lat: number | null, lon: number | null): string | null {
  if (lat === null || lon === null) return null;
  return `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function parseRadarFrame(raw: unknown): RadarFrame | null {
  if (!isRecord(raw) || !isRecord(raw.attributes)) return null;
  const name = typeof raw.attributes.name === "string" ? raw.attributes.name : null;
  const validMs = toNumber(raw.attributes.idp_validtime);
  if (!name || validMs === null) return null;
  const endMs = toNumber(raw.attributes.idp_validendtime);
  return {
    name,
    validTime: new Date(validMs).toISOString(),
    validEndTime: endMs === null ? null : new Date(endMs).toISOString(),
    epochMs: validMs,
    source: "NOAA_MRMS_LIVE_WMS",
  };
}

function buildIemNexradArchiveFrames(historyHours: number): RadarFrame[] {
  const stepMs = IEM_NEXRAD_FRAME_INTERVAL_MINUTES * 60 * 1000;
  const availabilityLagMs = IEM_NEXRAD_AVAILABILITY_LAG_MINUTES * 60 * 1000;
  const latestMs = Math.floor((Date.now() - availabilityLagMs) / stepMs) * stepMs;
  const earliestMs = latestMs - historyHours * 60 * 60 * 1000;
  const frames: RadarFrame[] = [];

  for (let epochMs = earliestMs; epochMs <= latestMs; epochMs += stepMs) {
    const valid = new Date(epochMs);
    const yyyy = String(valid.getUTCFullYear());
    const mm = String(valid.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(valid.getUTCDate()).padStart(2, "0");
    const hh = String(valid.getUTCHours()).padStart(2, "0");
    const minute = String(valid.getUTCMinutes()).padStart(2, "0");

    frames.push({
      name: `IEM_NEXRAD_N0R_${yyyy}${mm}${dd}_${hh}${minute}`,
      validTime: valid.toISOString(),
      validEndTime: null,
      epochMs,
      source: "IEM_NEXRAD_ARCHIVE_WMS",
    });
  }

  return frames;
}

async function fetchRadarFrames(): Promise<RadarFrame[]> {
  const params = new URLSearchParams({
    where: "name LIKE 'CONUS%'",
    outFields: "idp_validtime,idp_validendtime,name",
    returnGeometry: "false",
    f: "pjson",
    orderByFields: "idp_validtime DESC",
    resultRecordCount: "40",
  });
  const response = await fetch(`${RADAR_QUERY_URL}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`NOAA radar frame query failed with HTTP ${response.status}`);
  const json = (await response.json()) as { features?: unknown[] };
  return (json.features ?? [])
    .map(parseRadarFrame)
    .filter((frame): frame is RadarFrame => frame !== null)
    .sort((left, right) => left.epochMs - right.epochMs);
}

function dataAsOf(payload: ShortTermWeatherPayload): string | null {
  return maxStamp(
    maxStamp(payload.asOf.observations, payload.asOf.latestNws),
    maxStamp(payload.asOf.forecasts, payload.asOf.radar),
  );
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const stations = parseStations(searchParams.get("stations"));
  const observationHours = clampInt(searchParams.get("hours"), 24, 1, 72);
  const forecastHours = clampInt(searchParams.get("forecastHours"), 48, 1, 72);
  const refresh = searchParams.get("refresh") === "1";
  const cacheKey = [
    "weather-short-term",
    stations.join("|"),
    observationHours,
    forecastHours,
  ].join(":");

  if (!refresh) {
    const cached = RESPONSE_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        payload: cached.payload,
        headers: {
          "Cache-Control": FRESH_CACHE_HEADER,
          "X-Weather-Short-Term-Cache": "HIT",
          "X-Weather-Short-Term-IEM-Cache": cached.payload.sourceStatus.iem.cacheStatus,
        },
        rowCount: cached.payload.rowCounts.observationRows,
        dataAsOf: dataAsOf(cached.payload),
      };
    }
  }

  const errors: string[] = [];
  const [iemResult, nwsLatest, radarSettled] = await Promise.all([
    fetchIemRows(stations, observationHours),
    Promise.all(stations.map(fetchNwsLatest)),
    fetchRadarFrames().then(
      (frames) => ({ ok: true as const, frames }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
  ]);

  const observationRows = iemResult.rows;
  if (iemResult.error) errors.push(iemResult.error);
  const radarFrames = radarSettled.ok ? radarSettled.frames : [];
  if (!radarSettled.ok) {
    errors.push(
      radarSettled.error instanceof Error ? radarSettled.error.message : "NOAA radar query failed",
    );
  }
  const observedRadarFrames = buildIemNexradArchiveFrames(observationHours);

  const latestIem = latestRowsByStation(observationRows);
  const latestNwsByStation = new Map(nwsLatest.map((row) => [row.stationId, row]));
  const forecastRows = await Promise.all(
    stations.map((station) => {
      const point = stationPoint(station, latestIem, latestNwsByStation);
      return fetchStationForecast(station, point.lat, point.lon, forecastHours);
    }),
  );

  const forecastByStation = new Map(forecastRows.map((row) => [row.stationId, row]));
  const stationSummaries = stations.map((station) => {
    const point = stationPoint(station, latestIem, latestNwsByStation);
    return {
      stationId: station,
      lat: point.lat,
      lon: point.lon,
      latestObservation: latestIem.get(station) ?? null,
      nwsLatest: latestNwsByStation.get(station) ?? null,
      forecast: forecastByStation.get(station) ?? null,
    };
  });
  const observationsAsOf = observationRows.reduce<string | null>(
    (latest, row) => maxStamp(latest, row.valid),
    null,
  );
  const nwsAsOf = nwsLatest.reduce<string | null>(
    (latest, row) => maxStamp(latest, row.timestamp),
    null,
  );
  const forecastAsOf = forecastRows.reduce<string | null>(
    (latest, row) => maxStamp(latest, row.generatedAt ?? row.updateTime),
    null,
  );
  const radarAsOf = observedRadarFrames.reduce<string | null>(
    (latest, row) => maxStamp(latest, row.validTime),
    null,
  );
  const liveRadarAsOf = radarFrames.reduce<string | null>(
    (latest, row) => maxStamp(latest, row.validTime),
    null,
  );
  const stationLinks = stationSummaries.map((station) => ({
    stationId: station.stationId,
    nwsLatestObservationUrl: nwsLatestObservationUrl(station.stationId),
    nwsPointUrl: nwsPointUrl(station.lat, station.lon),
    nwsHourlyForecastUrl: station.forecast?.forecastHourlyUrl ?? null,
  }));
  const payload: ShortTermWeatherPayload = {
    source: "IEM_ASOS_MADIS+NWS_API+NOAA_MRMS_RADAR+IEM_NEXRAD_ARCHIVE_WMS",
    filters: {
      stations,
      observationHours,
      forecastHours,
    },
    asOf: {
      observations: observationsAsOf,
      latestNws: nwsAsOf,
      forecasts: forecastAsOf,
      radar: radarAsOf,
    },
    stations: stationSummaries,
    observationRows,
    radar: {
      service: "IEM_NEXRAD_ARCHIVE_WMS",
      productLabel: "IEM NEXRAD N0R national mosaic",
      tileUrlTemplate: IEM_NEXRAD_WMS_TILE_TEMPLATE,
      frames: observedRadarFrames,
      latestFrame: observedRadarFrames.at(-1) ?? null,
      historyHours: observationHours,
      updateFrequencyMinutes: IEM_NEXRAD_FRAME_INTERVAL_MINUTES,
      live: {
        service: "NOAA_MRMS_RADAR_BASE_REFLECTIVITY_TIME",
        tileUrlTemplate: RADAR_TILE_TEMPLATE,
        frames: radarFrames,
        latestFrame: radarFrames.at(-1) ?? null,
        historyHours: 4,
        updateFrequencyMinutes: 5,
      },
    },
    dataSources: {
      primaryLinks: [
        {
          label: "IEM ASOS/MADIS request",
          provider: "Iowa Environmental Mesonet",
          url: buildIemRequestUrl(stations, observationHours),
          use: "Station observations, high-frequency MADIS rows, METAR text, and surface fields.",
        },
        {
          label: "IEM historical NEXRAD mosaic WMS",
          provider: "Iowa Environmental Mesonet",
          url: IEM_NEXRAD_WMS_TILE_TEMPLATE,
          use: "Observed radar playback using requested 5-minute WMS TIME values for the selected 24-72 hour window.",
        },
        {
          label: "IEM NEXRAD mosaic documentation",
          provider: "Iowa Environmental Mesonet",
          url: IEM_NEXRAD_INFO_URL,
          use: "Product details for the archived national NEXRAD reflectivity mosaic.",
        },
        {
          label: "IEM current and historical radar loop",
          provider: "Iowa Environmental Mesonet",
          url: IEM_NEXRAD_LOOP_URL,
          use: "Reference viewer for the same historical radar mosaic family.",
        },
        {
          label: "NOAA/NWS live MRMS radar frame query",
          provider: "NOAA/NWS Map Services",
          url: `${RADAR_QUERY_URL}?where=name%20LIKE%20%27CONUS%25%27&outFields=idp_validtime,idp_validendtime,name&returnGeometry=false&f=pjson&orderByFields=idp_validtime%20DESC&resultRecordCount=40`,
          use: `Reference for the short rolling live MRMS service; latest frame ${liveRadarAsOf ?? "unavailable"}.`,
        },
        {
          label: "NOAA/NWS live MRMS radar WMS tile template",
          provider: "NOAA/NWS Map Services",
          url: RADAR_TILE_TEMPLATE,
          use: "Short rolling live radar service retained as a source reference; availability is shorter than the historical IEM WMS path.",
        },
      ],
      stationLinks,
    },
    sourceStatus: {
      iem: {
        cacheStatus: iemResult.cacheStatus,
        backoffUntil: iemBackoffUntil > Date.now() ? new Date(iemBackoffUntil).toISOString() : null,
        error: iemResult.error,
      },
      radar: {
        frameStatus: "REQUESTED_WMS_TIMES",
        note: "Observed radar frames are generated as 5-minute IEM WMS TIME requests for the selected window; individual tiles resolve on demand.",
      },
    },
    rowCounts: {
      observationRows: observationRows.length,
      stations: stationSummaries.length,
      forecastPeriods: forecastRows.reduce((count, row) => count + row.periods.length, 0),
      radarFrames: observedRadarFrames.length,
    },
    errors,
  };

  RESPONSE_CACHE.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });

  return {
    payload,
    headers: {
      "Cache-Control": FRESH_CACHE_HEADER,
      "X-Weather-Short-Term-Cache": "MISS",
      "X-Weather-Short-Term-IEM-Cache": iemResult.cacheStatus,
    },
    rowCount: payload.rowCounts.observationRows,
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
