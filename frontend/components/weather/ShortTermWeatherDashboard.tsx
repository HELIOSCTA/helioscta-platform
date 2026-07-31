"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type ReportType = "MADIS HF" | "METAR";

interface IemObservationRow {
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
}

interface NwsLatestObservation {
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
}

interface ForecastPeriod {
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
}

interface StationForecast {
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
}

interface StationSummary {
  stationId: string;
  lat: number | null;
  lon: number | null;
  latestObservation: IemObservationRow | null;
  nwsLatest: NwsLatestObservation | null;
  forecast: StationForecast | null;
}

interface RadarFrame {
  name: string;
  validTime: string;
  validEndTime: string | null;
  epochMs: number;
  source: "NOAA_MRMS_LIVE_WMS" | "IEM_NEXRAD_ARCHIVE_WMS";
}

interface DataSourceLink {
  label: string;
  provider: string;
  url: string;
  use: string;
}

interface StationDataSourceLinks {
  stationId: string;
  nwsLatestObservationUrl: string;
  nwsPointUrl: string | null;
  nwsHourlyForecastUrl: string | null;
}

type SourceCacheStatus = "HIT" | "MISS" | "STALE" | "ERROR" | "BACKOFF";

interface ShortTermWeatherPayload {
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
  sourceStatus?: {
    iem: {
      cacheStatus: SourceCacheStatus;
      backoffUntil: string | null;
      error: string | null;
    };
    radar?: {
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
}

interface StationChangeSummary {
  stationId: string;
  latestTime: string | null;
  tempF: number | null;
  dewPointF: number | null;
  gustKt: number | null;
  windKt: number | null;
  precipIn: number | null;
  tempChange1h: number | null;
  dewPointChange1h: number | null;
  gustChange1h: number | null;
  precipStartedMinutesAgo: number | null;
  forecastPeakPrecipPct: number | null;
  forecastPeakLeadHours: number | null;
  forecastPeakTime: string | null;
  forecastPeakText: string | null;
  changeScore: number;
}

interface BasketSummary {
  id: string;
  label: string;
  activeStationIds: string[];
  leaderStationId: string | null;
  changeScore: number;
  maxTempChange1h: number | null;
  maxDewPointChange1h: number | null;
  maxGustChange1h: number | null;
  recentPrecipStationIds: string[];
  forecastPeakPrecipPct: number | null;
  forecastPeakLeadHours: number | null;
}

type EventTone = "red" | "amber" | "emerald" | "sky" | "gray";

interface EventCard {
  id: string;
  tone: EventTone;
  label: string;
  title: string;
  detail: string;
  stationId?: string;
  basketId?: string;
}

interface TimelineRow {
  id: string;
  time: string;
  label: string;
  source: "OBSERVED" | "FORECAST";
  observedTempF: number | null;
  observedDewPointF: number | null;
  observedGustKt: number | null;
  observedPrecipIn: number | null;
  forecastTempF: number | null;
  forecastPrecipPct: number | null;
  forecastWindSpeed: string | null;
  weatherText: string | null;
}

type MapMode = "observed" | "forecast";

interface StationFeatureProperties {
  stationId: string;
  dataKind: MapMode;
  tempF: number | null;
  gustKt: number | null;
  precipProbabilityPct: number | null;
  forecastTime: string | null;
  shortForecast: string | null;
  reportType: string;
  markerColor: string;
}

const DEFAULT_STATIONS = "KORD,KCMH,KPIT,KPHL,KEWR,KBWI,KDCA,KRDU";
const API_CACHE_TTL_MS = 5 * 60 * 1000;
const OBSERVATION_HOURS = [24, 48, 72];
const FORECAST_HOURS = [24, 48, 72];
const FORECAST_LEAD_HOURS = [0, 1, 3, 6, 12, 24];
const RADAR_PLAYBACK_STEP_MINUTES = [5, 15, 30, 60];
const WEATHER_BASKETS = [
  { id: "pjm-east", label: "PJM East", stationIds: ["KPHL", "KEWR", "KBWI"] },
  { id: "mid-atlantic", label: "Mid-Atlantic", stationIds: ["KBWI", "KDCA", "KPHL"] },
  { id: "ohio-valley", label: "Ohio Valley", stationIds: ["KCMH", "KPIT"] },
  { id: "great-lakes-west", label: "Great Lakes / West", stationIds: ["KORD", "KCMH", "KPIT"] },
  { id: "southeast", label: "Southeast", stationIds: ["KRDU", "KDCA"] },
] as const;
const RADAR_SOURCE_ID = "short-term-weather-radar";
const RADAR_LAYER_ID = "short-term-weather-radar-layer";
const STATION_SOURCE_ID = "short-term-weather-stations";
const STATION_GLOW_LAYER_ID = "short-term-weather-station-glow";
const STATION_POINT_LAYER_ID = "short-term-weather-station-point";
const STATION_LABEL_LAYER_ID = "short-term-weather-station-label";
const BASEMAP_ATTRIBUTION = "&copy; OpenStreetMap contributors &copy; CARTO";
const BASEMAP_TILE_TEMPLATE = "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png";
const RADAR_ATTRIBUTION = "Iowa State IEM / NOAA NEXRAD";

function getMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      cartoDark: {
        type: "raster",
        tiles: [BASEMAP_TILE_TEMPLATE],
        tileSize: 256,
        maxzoom: 20,
        attribution: BASEMAP_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: "carto-dark",
        type: "raster",
        source: "cartoDark",
        minzoom: 0,
        maxzoom: 24,
      },
    ],
  };
}

function compactStationList(value: string): string[] {
  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const station = part.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!station) continue;
    seen.add(station.length === 3 ? `K${station}` : station);
    if (seen.size >= 8) break;
  }
  return Array.from(seen);
}

function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function fmtTime(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function fmtSigned(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  const rounded = Number(value.toFixed(digits));
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}`;
}

function fmtMinutesAgo(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  if (value < 90) return `${Math.max(0, Math.round(value))}m ago`;
  return `${Math.round(value / 60)}h ago`;
}

function fmtLeadHours(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `+${Math.max(0, Math.round(value))}h`;
}

function eventToneClass(tone: EventTone): string {
  if (tone === "red") return "border-red-500/30 bg-red-500/10 text-red-100";
  if (tone === "amber") return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  if (tone === "emerald") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  if (tone === "sky") return "border-sky-500/30 bg-sky-500/10 text-sky-100";
  return "border-gray-700 bg-gray-900 text-gray-300";
}

function buildApiUrl(
  stations: string[],
  observationHours: number,
  forecastHours: number,
  refresh: boolean,
): string {
  const params = new URLSearchParams({
    stations: stations.join(","),
    hours: String(observationHours),
    forecastHours: String(forecastHours),
  });
  if (refresh) params.set("refresh", "1");
  return `/api/weather/short-term?${params.toString()}`;
}

function buildCacheKey(
  stations: string[],
  observationHours: number,
  forecastHours: number,
): string {
  return [
    "api:weather-short-term",
    stations.join("|"),
    observationHours,
    forecastHours,
  ].join(":");
}

function radarTileUrl(template: string | undefined, frame: RadarFrame | null): string | null {
  if (!template) return null;
  if (!frame) return template;
  if (template.includes("{time}")) {
    return template.replace("{time}", encodeURIComponent(frame.validTime));
  }
  return `${template}&time=${encodeURIComponent(frame.validTime)}`;
}

function firstWindSpeedMph(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function forecastPeriodForLead(
  periods: ForecastPeriod[] | undefined,
  leadHours: number,
): ForecastPeriod | null {
  if (!periods?.length) return null;
  const targetMs = Date.now() + leadHours * 60 * 60 * 1000;
  return periods.reduce<ForecastPeriod | null>((best, period) => {
    const periodMs = Date.parse(period.startTime);
    if (!Number.isFinite(periodMs)) return best;
    if (!best) return period;
    const bestMs = Date.parse(best.startTime);
    return Math.abs(periodMs - targetMs) < Math.abs(bestMs - targetMs) ? period : best;
  }, null);
}

function isWetObservation(row: IemObservationRow | null | undefined): boolean {
  if (!row) return false;
  if (row.p01i !== null && row.p01i > 0) return true;
  const text = `${row.wxcodes ?? ""} ${row.metar ?? ""}`.toUpperCase();
  return /\b(TS|TSRA|RA|SHRA|DZ|SN|PL|GR)\b/.test(text);
}

function closestRowToTime(
  rows: IemObservationRow[],
  targetMs: number,
  toleranceMs: number,
): IemObservationRow | null {
  let best: IemObservationRow | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const rowMs = Date.parse(row.valid);
    if (!Number.isFinite(rowMs)) continue;
    const distance = Math.abs(rowMs - targetMs);
    if (distance <= toleranceMs && distance < bestDistance) {
      best = row;
      bestDistance = distance;
    }
  }
  return best;
}

function precipStartedMinutesAgo(rows: IemObservationRow[], nowMs: number): number | null {
  const wetRows = rows.filter((row) => isWetObservation(row));
  if (!wetRows.length) return null;
  const latestWet = wetRows.at(-1);
  const latestWetMs = latestWet ? Date.parse(latestWet.valid) : Number.NaN;
  if (!Number.isFinite(latestWetMs) || nowMs - latestWetMs > 60 * 60 * 1000) return null;

  let startRow = latestWet;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!isWetObservation(row)) break;
    startRow = row;
  }
  const startMs = startRow ? Date.parse(startRow.valid) : latestWetMs;
  return Number.isFinite(startMs) ? Math.max(0, (nowMs - startMs) / 60000) : null;
}

function forecastPeakForStation(
  forecast: StationForecast | null | undefined,
  nowMs: number,
): Pick<
  StationChangeSummary,
  "forecastPeakPrecipPct" | "forecastPeakLeadHours" | "forecastPeakTime" | "forecastPeakText"
> {
  let peak: ForecastPeriod | null = null;
  for (const period of forecast?.periods ?? []) {
    const startMs = Date.parse(period.startTime);
    if (!Number.isFinite(startMs) || startMs < nowMs - 60 * 60 * 1000) continue;
    if (
      !peak ||
      (period.precipProbabilityPct ?? -1) > (peak.precipProbabilityPct ?? -1)
    ) {
      peak = period;
    }
  }
  const peakMs = peak ? Date.parse(peak.startTime) : Number.NaN;
  return {
    forecastPeakPrecipPct: peak?.precipProbabilityPct ?? null,
    forecastPeakLeadHours: Number.isFinite(peakMs) ? (peakMs - nowMs) / 3600000 : null,
    forecastPeakTime: peak?.startTime ?? null,
    forecastPeakText: peak?.shortForecast ?? null,
  };
}

function buildStationChanges(payload: ShortTermWeatherPayload | null): StationChangeSummary[] {
  if (!payload) return [];
  const nowMs = Date.now();
  return payload.stations
    .map((station) => {
      const rows = payload.observationRows.filter((row) => row.stationId === station.stationId);
      const latest = station.latestObservation ?? rows.at(-1) ?? null;
      const latestMs = latest ? Date.parse(latest.valid) : Number.NaN;
      const prior =
        Number.isFinite(latestMs) && rows.length
          ? closestRowToTime(rows, latestMs - 60 * 60 * 1000, 45 * 60 * 1000)
          : null;
      const tempChange1h =
        latest?.tmpf !== null && latest?.tmpf !== undefined && prior?.tmpf !== null && prior?.tmpf !== undefined
          ? latest.tmpf - prior.tmpf
          : null;
      const dewPointChange1h =
        latest?.dwpf !== null && latest?.dwpf !== undefined && prior?.dwpf !== null && prior?.dwpf !== undefined
          ? latest.dwpf - prior.dwpf
          : null;
      const gustChange1h =
        latest?.gust !== null && latest?.gust !== undefined && prior?.gust !== null && prior?.gust !== undefined
          ? latest.gust - prior.gust
          : null;
      const forecastPeak = forecastPeakForStation(station.forecast, nowMs);
      const precipStarted = precipStartedMinutesAgo(rows, nowMs);
      const changeScore =
        Math.abs(tempChange1h ?? 0) * 0.8 +
        Math.abs(dewPointChange1h ?? 0) * 0.9 +
        Math.max(gustChange1h ?? 0, 0) * 1.4 +
        (precipStarted !== null ? 12 : 0) +
        (forecastPeak.forecastPeakPrecipPct ?? 0) / 12;

      return {
        stationId: station.stationId,
        latestTime: latest?.valid ?? station.nwsLatest?.timestamp ?? null,
        tempF: latest?.tmpf ?? station.nwsLatest?.tempF ?? null,
        dewPointF: latest?.dwpf ?? station.nwsLatest?.dewPointF ?? null,
        gustKt: latest?.gust ?? null,
        windKt: latest?.sknt ?? null,
        precipIn: latest?.p01i ?? null,
        tempChange1h,
        dewPointChange1h,
        gustChange1h,
        precipStartedMinutesAgo: precipStarted,
        forecastPeakPrecipPct: forecastPeak.forecastPeakPrecipPct,
        forecastPeakLeadHours: forecastPeak.forecastPeakLeadHours,
        forecastPeakTime: forecastPeak.forecastPeakTime,
        forecastPeakText: forecastPeak.forecastPeakText,
        changeScore,
      };
    })
    .sort((left, right) => right.changeScore - left.changeScore);
}

function maxAbs(values: Array<number | null>): number | null {
  const finiteValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!finiteValues.length) return null;
  return finiteValues.reduce((best, value) => (Math.abs(value) > Math.abs(best) ? value : best));
}

function buildBasketSummaries(stationChanges: StationChangeSummary[]): BasketSummary[] {
  const byStation = new Map(stationChanges.map((station) => [station.stationId, station]));
  const summaries: BasketSummary[] = [];

  for (const basket of WEATHER_BASKETS) {
    const members = basket.stationIds
      .map((stationId) => byStation.get(stationId))
      .filter((station): station is StationChangeSummary => station !== undefined);
    if (!members.length) continue;
    const leader = [...members].sort((left, right) => right.changeScore - left.changeScore)[0];
    const forecastLeader = [...members].sort(
      (left, right) => (right.forecastPeakPrecipPct ?? -1) - (left.forecastPeakPrecipPct ?? -1),
    )[0];
    const recentPrecipStationIds = members
      .filter((station) => station.precipStartedMinutesAgo !== null)
      .map((station) => station.stationId);
    const changeScore =
      Math.max(...members.map((station) => station.changeScore)) +
      recentPrecipStationIds.length * 4 +
      (forecastLeader?.forecastPeakPrecipPct ?? 0) / 15;

    summaries.push({
      id: basket.id,
      label: basket.label,
      activeStationIds: members.map((station) => station.stationId),
      leaderStationId: leader?.stationId ?? null,
      changeScore,
      maxTempChange1h: maxAbs(members.map((station) => station.tempChange1h)),
      maxDewPointChange1h: maxAbs(members.map((station) => station.dewPointChange1h)),
      maxGustChange1h: maxAbs(members.map((station) => station.gustChange1h)),
      recentPrecipStationIds,
      forecastPeakPrecipPct: forecastLeader?.forecastPeakPrecipPct ?? null,
      forecastPeakLeadHours: forecastLeader?.forecastPeakLeadHours ?? null,
    });
  }

  return summaries.sort((left, right) => right.changeScore - left.changeScore);
}

function buildEventCards(
  stationChanges: StationChangeSummary[],
  basketSummaries: BasketSummary[],
  radarTime: string | null | undefined,
): EventCard[] {
  const cards: EventCard[] = [];
  const precipStation = stationChanges
    .filter((station) => station.precipStartedMinutesAgo !== null)
    .sort((left, right) => (left.precipStartedMinutesAgo ?? 9999) - (right.precipStartedMinutesAgo ?? 9999))[0];
  if (precipStation) {
    cards.push({
      id: `precip-${precipStation.stationId}`,
      tone: "red",
      label: "Observed",
      title: `${precipStation.stationId}: precip started ${fmtMinutesAgo(precipStation.precipStartedMinutesAgo)}`,
      detail: `Latest precip ${fmtNumber(precipStation.precipIn, 2)} in; obs ${fmtDateTime(precipStation.latestTime)}.`,
      stationId: precipStation.stationId,
    });
  }

  const gustStation = stationChanges
    .filter((station) => (station.gustChange1h ?? 0) >= 5)
    .sort((left, right) => (right.gustChange1h ?? 0) - (left.gustChange1h ?? 0))[0];
  if (gustStation) {
    cards.push({
      id: `gust-${gustStation.stationId}`,
      tone: (gustStation.gustChange1h ?? 0) >= 15 ? "red" : "amber",
      label: "Observed",
      title: `${gustStation.stationId}: gust ${fmtSigned(gustStation.gustChange1h)} kt vs 1h ago`,
      detail: `Current gust ${fmtNumber(gustStation.gustKt, 0)} kt; latest obs ${fmtDateTime(gustStation.latestTime)}.`,
      stationId: gustStation.stationId,
    });
  }

  const tempOrDewStation = stationChanges
    .filter(
      (station) =>
        Math.abs(station.tempChange1h ?? 0) >= 3 ||
        Math.abs(station.dewPointChange1h ?? 0) >= 3,
    )
    .sort(
      (left, right) =>
        Math.max(Math.abs(right.tempChange1h ?? 0), Math.abs(right.dewPointChange1h ?? 0)) -
        Math.max(Math.abs(left.tempChange1h ?? 0), Math.abs(left.dewPointChange1h ?? 0)),
    )[0];
  if (tempOrDewStation) {
    const useDew =
      Math.abs(tempOrDewStation.dewPointChange1h ?? 0) >
      Math.abs(tempOrDewStation.tempChange1h ?? 0);
    cards.push({
      id: `thermal-${tempOrDewStation.stationId}`,
      tone: "amber",
      label: "Observed",
      title: `${tempOrDewStation.stationId}: ${useDew ? "dew point" : "temp"} ${fmtSigned(
        useDew ? tempOrDewStation.dewPointChange1h : tempOrDewStation.tempChange1h,
        1,
      )} F vs 1h ago`,
      detail: `Current ${useDew ? "dew point" : "temp"} ${fmtNumber(
        useDew ? tempOrDewStation.dewPointF : tempOrDewStation.tempF,
        1,
      )} F.`,
      stationId: tempOrDewStation.stationId,
    });
  }

  const forecastBasket = basketSummaries
    .filter((basket) => (basket.forecastPeakPrecipPct ?? 0) >= 35)
    .sort((left, right) => (right.forecastPeakPrecipPct ?? 0) - (left.forecastPeakPrecipPct ?? 0))[0];
  if (forecastBasket) {
    cards.push({
      id: `forecast-${forecastBasket.id}`,
      tone: (forecastBasket.forecastPeakPrecipPct ?? 0) >= 65 ? "red" : "emerald",
      label: "Forecast",
      title: `${forecastBasket.label}: forecast precip risk peaks ${fmtLeadHours(
        forecastBasket.forecastPeakLeadHours,
      )}`,
      detail: `${fmtNumber(forecastBasket.forecastPeakPrecipPct, 0)}% peak PoP across ${forecastBasket.activeStationIds.join(", ")}.`,
      basketId: forecastBasket.id,
    });
  }

  const radarBasket =
    basketSummaries.find((basket) => basket.recentPrecipStationIds.length) ?? basketSummaries[0];
  if (radarBasket) {
    cards.push({
      id: `radar-watch-${radarBasket.id}`,
      tone: radarBasket.recentPrecipStationIds.length ? "sky" : "gray",
      label: "Radar / Obs",
      title: `${radarBasket.label}: observed radar watch near load centers`,
      detail: radarBasket.recentPrecipStationIds.length
        ? `Station precip proxy at ${radarBasket.recentPrecipStationIds.join(", ")}; radar time ${fmtDateTime(radarTime)}.`
        : `No station precip trigger; radar time ${fmtDateTime(radarTime)} for visual storm-path review.`,
      basketId: radarBasket.id,
    });
  }

  return cards.slice(0, 5);
}

function buildTimelineRows(
  observationRows: IemObservationRow[],
  forecastPeriods: ForecastPeriod[],
): TimelineRow[] {
  const observedRows = observationRows.map((row) => ({
    id: `obs-${row.stationId}-${row.valid}-${row.metar ?? ""}`,
    time: row.valid,
    label: fmtDateTime(row.valid),
    source: "OBSERVED" as const,
    observedTempF: row.tmpf,
    observedDewPointF: row.dwpf,
    observedGustKt: row.gust,
    observedPrecipIn: row.p01i,
    forecastTempF: null,
    forecastPrecipPct: null,
    forecastWindSpeed: null,
    weatherText: row.wxcodes ?? row.metar,
  }));
  const forecastRows = forecastPeriods.map((period) => ({
    id: `forecast-${period.startTime}`,
    time: period.startTime,
    label: fmtDateTime(period.startTime),
    source: "FORECAST" as const,
    observedTempF: null,
    observedDewPointF: null,
    observedGustKt: null,
    observedPrecipIn: null,
    forecastTempF: period.tempF,
    forecastPrecipPct: period.precipProbabilityPct,
    forecastWindSpeed: period.windSpeed,
    weatherText: period.shortForecast,
  }));
  return [...observedRows, ...forecastRows].sort((left, right) => left.time.localeCompare(right.time));
}

function observedMarkerColor(tempF: number | null, gustKt: number | null): string {
  if (gustKt !== null && gustKt >= 30) return "#ef4444";
  if (tempF !== null && tempF >= 85) return "#f97316";
  if (tempF !== null && tempF >= 70) return "#facc15";
  return "#38bdf8";
}

function forecastMarkerColor(precipProbabilityPct: number | null, windMph: number | null): string {
  if (precipProbabilityPct !== null && precipProbabilityPct >= 70) return "#ef4444";
  if (precipProbabilityPct !== null && precipProbabilityPct >= 40) return "#f97316";
  if (windMph !== null && windMph >= 25) return "#facc15";
  return "#22c55e";
}

function stationFeatureCollection(
  stations: StationSummary[],
  mapMode: MapMode,
  forecastLeadHours: number,
): GeoJSON.FeatureCollection<GeoJSON.Point, StationFeatureProperties> {
  return {
    type: "FeatureCollection",
    features: stations
      .filter((station) => station.lat !== null && station.lon !== null)
      .map((station) => {
        const latestTemp = station.latestObservation?.tmpf ?? station.nwsLatest?.tempF ?? null;
        const latestGust = station.latestObservation?.gust ?? null;
        const forecastPeriod = forecastPeriodForLead(station.forecast?.periods, forecastLeadHours);
        const forecastWindMph = firstWindSpeedMph(forecastPeriod?.windSpeed);
        const tempF = mapMode === "observed" ? latestTemp : forecastPeriod?.tempF ?? null;
        const gustKt = mapMode === "observed" ? latestGust : null;
        const precipProbabilityPct =
          mapMode === "forecast" ? forecastPeriod?.precipProbabilityPct ?? null : null;

        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [station.lon as number, station.lat as number],
          },
          properties: {
            stationId: station.stationId,
            dataKind: mapMode,
            tempF,
            gustKt,
            precipProbabilityPct,
            forecastTime: mapMode === "forecast" ? forecastPeriod?.startTime ?? null : null,
            shortForecast: mapMode === "forecast" ? forecastPeriod?.shortForecast ?? null : null,
            reportType:
              mapMode === "observed"
                ? station.latestObservation?.reportType ?? "No obs"
                : `NWS +${forecastLeadHours}h`,
            markerColor:
              mapMode === "observed"
                ? observedMarkerColor(latestTemp, latestGust)
                : forecastMarkerColor(precipProbabilityPct, forecastWindMph),
          },
        };
      }),
  };
}

function syncRadarLayer(map: MapLibreMap, tileUrl: string | null): void {
  if (map.getLayer(RADAR_LAYER_ID)) map.removeLayer(RADAR_LAYER_ID);
  if (map.getSource(RADAR_SOURCE_ID)) map.removeSource(RADAR_SOURCE_ID);
  if (!tileUrl) return;

  map.addSource(RADAR_SOURCE_ID, {
    type: "raster",
    tiles: [tileUrl],
    tileSize: 256,
    attribution: RADAR_ATTRIBUTION,
  });
  map.addLayer(
    {
      id: RADAR_LAYER_ID,
      type: "raster",
      source: RADAR_SOURCE_ID,
      paint: {
        "raster-opacity": 0.72,
        "raster-fade-duration": 0,
      },
    },
    map.getLayer(STATION_GLOW_LAYER_ID) ? STATION_GLOW_LAYER_ID : undefined,
  );
}

function addOrUpdateStationLayers(
  map: MapLibreMap,
  data: GeoJSON.FeatureCollection<GeoJSON.Point, StationFeatureProperties>,
): void {
  const source = map.getSource(STATION_SOURCE_ID) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    return;
  }

  map.addSource(STATION_SOURCE_ID, {
    type: "geojson",
    data,
  });
  map.addLayer({
    id: STATION_GLOW_LAYER_ID,
    type: "circle",
    source: STATION_SOURCE_ID,
    paint: {
      "circle-radius": 14,
      "circle-color": ["get", "markerColor"],
      "circle-opacity": 0.18,
      "circle-blur": 0.6,
    },
  });
  map.addLayer({
    id: STATION_POINT_LAYER_ID,
    type: "circle",
    source: STATION_SOURCE_ID,
    paint: {
      "circle-radius": ["case", ["==", ["get", "dataKind"], "forecast"], 6, 5],
      "circle-color": ["get", "markerColor"],
      "circle-stroke-color": "#f8fafc",
      "circle-stroke-width": 1.2,
    },
  });
  map.addLayer({
    id: STATION_LABEL_LAYER_ID,
    type: "symbol",
    source: STATION_SOURCE_ID,
    layout: {
      "text-field": ["get", "stationId"],
      "text-size": 11,
      "text-offset": [0, 1.1],
      "text-anchor": "top",
      "text-font": ["Open Sans Semibold"],
    },
    paint: {
      "text-color": "#e5e7eb",
      "text-halo-color": "#020617",
      "text-halo-width": 1.4,
    },
  });
}

function SourceLinkRow({ link }: { link: DataSourceLink }) {
  return (
    <div className="rounded-md border border-gray-800 bg-gray-950/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-100">{link.label}</p>
          <p className="mt-0.5 text-xs text-gray-500">{link.provider}</p>
        </div>
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-100 hover:border-sky-400/60"
        >
          Open
        </a>
      </div>
      <p className="mt-2 text-xs text-gray-400">{link.use}</p>
      <p className="mt-2 break-all rounded border border-gray-800 bg-[#0b0d14] p-2 font-mono text-[10px] text-gray-500">
        {link.url}
      </p>
    </div>
  );
}

function SourceInfoDialog({
  payload,
  onClose,
}: {
  payload: ShortTermWeatherPayload | null;
  onClose: () => void;
}) {
  const primaryLinks = [
    ...(payload?.dataSources?.primaryLinks ?? []),
    {
      label: "Carto dark basemap tile template",
      provider: "CARTO / OpenStreetMap",
      url: BASEMAP_TILE_TEMPLATE,
      use: "Map basemap context behind observed radar, forecast points, and station markers.",
    },
  ];
  const stationLinks = payload?.dataSources?.stationLinks ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="short-term-weather-source-dialog-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-5xl rounded-lg border border-gray-800 bg-[#12141d] shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-3 border-b border-gray-800 px-4 py-3">
          <div>
            <h2 id="short-term-weather-source-dialog-title" className="text-base font-semibold text-gray-100">
              Short-Term Weather Sources
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Public endpoints currently used by this page
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close source dialog"
            className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs font-semibold text-gray-300 hover:border-gray-600 hover:bg-gray-800"
          >
            Close
          </button>
        </div>

        <div className="max-h-[78vh] space-y-4 overflow-y-auto p-4">
          <div className="grid gap-3 lg:grid-cols-2">
            {primaryLinks.map((link) => (
              <SourceLinkRow key={`${link.label}-${link.url}`} link={link} />
            ))}
          </div>

          <div className="rounded-md border border-gray-800 bg-gray-950/30">
            <div className="border-b border-gray-800 px-3 py-2">
              <h3 className="text-sm font-semibold text-gray-100">Station-Specific NWS Links</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-xs text-gray-200">
                <thead className="bg-gray-950 text-[10px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="border border-gray-800 px-2 py-2 text-left">Station</th>
                    <th className="border border-gray-800 px-2 py-2 text-left">Latest Obs</th>
                    <th className="border border-gray-800 px-2 py-2 text-left">Point Metadata</th>
                    <th className="border border-gray-800 px-2 py-2 text-left">Hourly Forecast</th>
                  </tr>
                </thead>
                <tbody>
                  {stationLinks.map((station) => (
                    <tr key={station.stationId} className="odd:bg-gray-950/20">
                      <td className="border border-gray-800 px-2 py-1 font-semibold text-gray-100">
                        {station.stationId}
                      </td>
                      <td className="border border-gray-800 px-2 py-1">
                        <a
                          href={station.nwsLatestObservationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-sky-200 hover:text-sky-100"
                        >
                          {station.nwsLatestObservationUrl}
                        </a>
                      </td>
                      <td className="border border-gray-800 px-2 py-1">
                        {station.nwsPointUrl ? (
                          <a
                            href={station.nwsPointUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="break-all text-sky-200 hover:text-sky-100"
                          >
                            {station.nwsPointUrl}
                          </a>
                        ) : (
                          <span className="text-gray-600">--</span>
                        )}
                      </td>
                      <td className="border border-gray-800 px-2 py-1">
                        {station.nwsHourlyForecastUrl ? (
                          <a
                            href={station.nwsHourlyForecastUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="break-all text-sky-200 hover:text-sky-100"
                          >
                            {station.nwsHourlyForecastUrl}
                          </a>
                        ) : (
                          <span className="text-gray-600">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ShortTermWeatherDashboard() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const lastManualRefreshTokenRef = useRef(0);
  const [stationsInput, setStationsInput] = useState(DEFAULT_STATIONS);
  const [stations, setStations] = useState(() => compactStationList(DEFAULT_STATIONS));
  const [observationHours, setObservationHours] = useState(24);
  const [forecastHours, setForecastHours] = useState(48);
  const [activeStation, setActiveStation] = useState(stations[0] ?? "KORD");
  const [payload, setPayload] = useState<ShortTermWeatherPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualRefreshToken, setManualRefreshToken] = useState(0);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [playingRadar, setPlayingRadar] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>("observed");
  const [forecastLeadHours, setForecastLeadHours] = useState(3);
  const [radarPlaybackStepMinutes, setRadarPlaybackStepMinutes] = useState(5);

  useEffect(() => {
    setRadarPlaybackStepMinutes(observationHours >= 72 ? 30 : observationHours >= 48 ? 15 : 5);
  }, [observationHours]);

  useEffect(() => {
    const controller = new AbortController();
    const forceRefresh = manualRefreshToken !== lastManualRefreshTokenRef.current;
    lastManualRefreshTokenRef.current = manualRefreshToken;
    const url = buildApiUrl(stations, observationHours, forecastHours, forceRefresh);
    const key = buildCacheKey(stations, observationHours, forecastHours);
    setLoading(true);
    setError(null);

    fetchJsonWithCache<ShortTermWeatherPayload>({
      key,
      url,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
    })
      .then((nextPayload) => {
        setPayload(nextPayload);
        const stationSet = new Set(nextPayload.filters.stations);
        setActiveStation((current) =>
          stationSet.has(current) ? current : nextPayload.filters.stations[0] ?? "KORD",
        );
        const lastFrameIndex = Math.max(nextPayload.radar.frames.length - 1, 0);
        setActiveFrameIndex(lastFrameIndex);
      })
      .catch((nextError: unknown) => {
        if (controller.signal.aborted) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to fetch weather data");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [forecastHours, manualRefreshToken, observationHours, stations]);

  const radarFrames = payload?.radar.frames ?? [];
  const iemCacheStatus = payload?.sourceStatus?.iem.cacheStatus ?? "--";
  const radarBaseStepMinutes = payload?.radar.updateFrequencyMinutes ?? 5;
  const radarPlaybackFrameStep = Math.max(
    1,
    Math.round(radarPlaybackStepMinutes / radarBaseStepMinutes),
  );
  const activeFrame = radarFrames[activeFrameIndex] ?? payload?.radar.latestFrame ?? null;
  const activeSummary = payload?.stations.find((station) => station.stationId === activeStation) ?? null;
  const activeMapForecastPeriod = forecastPeriodForLead(
    activeSummary?.forecast?.periods,
    forecastLeadHours,
  );
  const activeObservationRows = useMemo(
    () => (payload?.observationRows ?? []).filter((row) => row.stationId === activeStation),
    [activeStation, payload?.observationRows],
  );
  const stationChanges = useMemo(() => buildStationChanges(payload), [payload]);
  const activeStationChange =
    stationChanges.find((station) => station.stationId === activeStation) ?? null;
  const basketSummaries = useMemo(() => buildBasketSummaries(stationChanges), [stationChanges]);
  const eventCards = useMemo(
    () => buildEventCards(stationChanges, basketSummaries, activeFrame?.validTime),
    [activeFrame?.validTime, basketSummaries, stationChanges],
  );
  const timelineRows = useMemo(
    () => buildTimelineRows(activeObservationRows, activeSummary?.forecast?.periods ?? []),
    [activeObservationRows, activeSummary?.forecast?.periods],
  );
  const timelineTableRows = useMemo(() => {
    const cutoffMs = Date.now() - 12 * 60 * 60 * 1000;
    return timelineRows
      .filter((row) => row.source === "FORECAST" || Date.parse(row.time) >= cutoffMs)
      .slice(-240);
  }, [timelineRows]);
  const stationFeatures = useMemo(
    () => stationFeatureCollection(payload?.stations ?? [], mapMode, forecastLeadHours),
    [forecastLeadHours, mapMode, payload?.stations],
  );
  const radarUrl =
    mapMode === "observed" ? radarTileUrl(payload?.radar.tileUrlTemplate, activeFrame) : null;

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getMapStyle(),
      center: [-78.5, 39.5],
      zoom: 5.2,
      attributionControl: false,
      fadeDuration: 0,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.on("load", () => {
      setMapLoaded(true);
      map.resize();
    });
    map.on("click", STATION_POINT_LAYER_ID, (event: MapLayerMouseEvent) => {
      const stationId = event.features?.[0]?.properties?.stationId;
      if (typeof stationId === "string") setActiveStation(stationId);
    });
    map.on("mouseenter", STATION_POINT_LAYER_ID, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", STATION_POINT_LAYER_ID, () => {
      map.getCanvas().style.cursor = "";
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    syncRadarLayer(map, radarUrl);
  }, [mapLoaded, radarUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    addOrUpdateStationLayers(map, stationFeatures);
  }, [mapLoaded, stationFeatures]);

  useEffect(() => {
    if (!playingRadar || radarFrames.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveFrameIndex((index) => (index + radarPlaybackFrameStep) % radarFrames.length);
    }, 1100);
    return () => window.clearInterval(timer);
  }, [playingRadar, radarFrames.length, radarPlaybackFrameStep]);

  useEffect(() => {
    if (mapMode === "forecast") setPlayingRadar(false);
  }, [mapMode]);

  const applyStations = () => {
    const parsed = compactStationList(stationsInput);
    if (!parsed.length) return;
    setStations(parsed);
    setActiveStation(parsed[0]);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Short-Term Weather</h2>
            <p className="mt-1 text-xs text-gray-500">
              IEM historical NEXRAD radar, IEM ASOS/MADIS observations, and NWS hourly forecasts
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            <span>Obs {fmtDateTime(payload?.asOf.observations)}</span>
            <span
              className={`rounded border px-1.5 py-0.5 font-semibold ${
                iemCacheStatus === "STALE" || iemCacheStatus === "BACKOFF"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                  : iemCacheStatus === "ERROR"
                    ? "border-red-500/30 bg-red-500/10 text-red-200"
                    : "border-gray-700 bg-gray-900 text-gray-400"
              }`}
            >
              IEM {iemCacheStatus}
            </span>
            <span>NWS {fmtDateTime(payload?.asOf.latestNws)}</span>
            <span>Observed radar {fmtDateTime(payload?.asOf.radar)}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Stations
            </span>
            <input
              value={stationsInput}
              onChange={(event) => setStationsInput(event.target.value)}
              className="w-[430px] max-w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
            />
          </label>
          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Obs
            </span>
            <div className="flex rounded-md border border-gray-700 bg-gray-900 p-0.5">
              {OBSERVATION_HOURS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setObservationHours(option)}
                  className={`rounded px-2.5 py-1.5 text-xs font-semibold ${
                    observationHours === option
                      ? "bg-sky-500/20 text-sky-100"
                      : "text-gray-400 hover:text-gray-100"
                  }`}
                >
                  {option}h
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Forecast
            </span>
            <div className="flex rounded-md border border-gray-700 bg-gray-900 p-0.5">
              {FORECAST_HOURS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setForecastHours(option)}
                  className={`rounded px-2.5 py-1.5 text-xs font-semibold ${
                    forecastHours === option
                      ? "bg-emerald-500/20 text-emerald-100"
                      : "text-gray-400 hover:text-gray-100"
                  }`}
                >
                  {option}h
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={applyStations}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-gray-600 hover:bg-gray-800"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => setManualRefreshToken((value) => value + 1)}
            className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 hover:border-sky-400/60"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setSourceDialogOpen(true)}
            aria-haspopup="dialog"
            className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-gray-600 hover:bg-gray-900"
          >
            Sources
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {!!payload?.errors.length && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            {payload.errors.join(" | ")}
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="overflow-hidden rounded-lg border border-gray-800 bg-[#12141d]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 px-3 py-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-100">
                  {mapMode === "observed" ? "Observed Map" : "Forecast Map"}
                </h3>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                    mapMode === "observed"
                      ? "border-sky-500/30 bg-sky-500/10 text-sky-100"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                  }`}
                >
                  {mapMode === "observed" ? "OBSERVED" : "FORECAST"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                {mapMode === "observed"
                  ? `${payload?.radar.productLabel ?? "Observed radar archive"} | ${radarFrames.length.toLocaleString()} requested ${payload?.radar.updateFrequencyMinutes ?? 5}min WMS times over ${payload?.radar.historyHours ?? observationHours}h | ${fmtDateTime(activeFrame?.validTime)}`
                  : `NWS hourly forecast | +${forecastLeadHours}h | ${fmtDateTime(activeMapForecastPeriod?.startTime)}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border border-gray-700 bg-gray-900 p-0.5">
                {(["observed", "forecast"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setMapMode(mode)}
                    className={`rounded px-2.5 py-1.5 text-xs font-semibold ${
                      mapMode === mode
                        ? mode === "observed"
                          ? "bg-sky-500/20 text-sky-100"
                          : "bg-emerald-500/20 text-emerald-100"
                        : "text-gray-400 hover:text-gray-100"
                    }`}
                  >
                    {mode === "observed" ? "Observed" : "Forecast"}
                  </button>
                ))}
              </div>
              {mapMode === "observed" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPlayingRadar((value) => !value)}
                    disabled={radarFrames.length <= 1}
                    className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:border-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {playingRadar ? "Pause" : "Play"}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(radarFrames.length - 1, 0)}
                    value={Math.min(activeFrameIndex, Math.max(radarFrames.length - 1, 0))}
                    onChange={(event) => {
                      setPlayingRadar(false);
                      setActiveFrameIndex(Number(event.target.value));
                    }}
                    className="w-40 accent-sky-500"
                  />
                  <div className="flex items-center rounded-md border border-gray-700 bg-gray-900 p-0.5">
                    <span className="px-1.5 text-[10px] font-bold uppercase text-gray-500">
                      Step
                    </span>
                    {RADAR_PLAYBACK_STEP_MINUTES.map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => setRadarPlaybackStepMinutes(step)}
                        className={`rounded px-1.5 py-1 text-[11px] font-semibold ${
                          radarPlaybackStepMinutes === step
                            ? "bg-sky-500/20 text-sky-100"
                            : "text-gray-400 hover:text-gray-100"
                        }`}
                      >
                        {step < 60 ? `${step}m` : "1h"}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex rounded-md border border-gray-700 bg-gray-900 p-0.5">
                  {FORECAST_LEAD_HOURS.map((lead) => (
                    <button
                      key={lead}
                      type="button"
                      onClick={() => setForecastLeadHours(lead)}
                      className={`rounded px-2 py-1.5 text-xs font-semibold ${
                        forecastLeadHours === lead
                          ? "bg-emerald-500/20 text-emerald-100"
                          : "text-gray-400 hover:text-gray-100"
                      }`}
                    >
                      +{lead}h
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div ref={mapContainerRef} className="h-[520px] w-full bg-gray-950" />
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-800 bg-[#12141d] p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-100">Event Cards</h3>
              {loading && <span className="text-xs text-gray-500">Loading</span>}
            </div>
            <div className="mt-3 space-y-2">
              {eventCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => {
                    if (card.stationId) setActiveStation(card.stationId);
                    const leader = basketSummaries.find((basket) => basket.id === card.basketId)
                      ?.leaderStationId;
                    if (!card.stationId && leader) setActiveStation(leader);
                  }}
                  className={`w-full rounded-md border p-2 text-left transition-colors hover:border-gray-600 ${eventToneClass(
                    card.tone,
                  )}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">
                      {card.label}
                    </span>
                    <span className="text-[10px] opacity-70">{fmtTime(activeFrame?.validTime)}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold">{card.title}</p>
                  <p className="mt-1 text-xs opacity-80">{card.detail}</p>
                </button>
              ))}
              {!eventCards.length && (
                <div className="rounded-md border border-gray-800 bg-gray-950/40 p-4 text-sm text-gray-500">
                  No derived events yet
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-[#12141d] p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-100">Basket Movers</h3>
              <span className="text-[10px] font-bold uppercase text-gray-500">
                ranked by current change
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {basketSummaries.map((basket, index) => (
                <button
                  key={basket.id}
                  type="button"
                  onClick={() => {
                    if (basket.leaderStationId) setActiveStation(basket.leaderStationId);
                  }}
                  className="w-full rounded-md border border-gray-800 bg-gray-950/30 p-2 text-left hover:border-gray-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-100">
                      {index + 1}. {basket.label}
                    </span>
                    <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-100">
                      {fmtNumber(basket.changeScore, 1)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <span>
                      <span className="text-gray-500">Temp </span>
                      <span className="font-semibold text-gray-100">
                        {fmtSigned(basket.maxTempChange1h, 1)} F
                      </span>
                    </span>
                    <span>
                      <span className="text-gray-500">Gust </span>
                      <span className="font-semibold text-gray-100">
                        {fmtSigned(basket.maxGustChange1h, 0)} kt
                      </span>
                    </span>
                    <span>
                      <span className="text-gray-500">Pop </span>
                      <span className="font-semibold text-emerald-100">
                        {fmtNumber(basket.forecastPeakPrecipPct, 0)}%
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-gray-500">
                    {basket.activeStationIds.join(", ")}
                    {basket.recentPrecipStationIds.length
                      ? ` | precip: ${basket.recentPrecipStationIds.join(", ")}`
                      : ""}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-[#12141d] p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-100">Station Movers</h3>
              <select
                value={activeStation}
                onChange={(event) => setActiveStation(event.target.value)}
                className="w-28 rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200 focus:border-gray-500 focus:outline-none"
              >
                {(payload?.stations ?? []).map((station) => (
                  <option key={station.stationId} value={station.stationId}>
                    {station.stationId}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 max-h-[245px] space-y-2 overflow-y-auto pr-1">
              {stationChanges.map((station) => (
                <button
                  key={station.stationId}
                  type="button"
                  onClick={() => setActiveStation(station.stationId)}
                  className={`w-full rounded-md border p-2 text-left transition-colors ${
                    activeStation === station.stationId
                      ? "border-sky-500/50 bg-sky-500/10"
                      : "border-gray-800 bg-gray-950/30 hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-100">{station.stationId}</span>
                    <span className="text-[10px] text-gray-500">
                      {fmtDateTime(station.latestTime)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <span className="text-gray-500">
                      T <span className="font-semibold text-gray-100">{fmtSigned(station.tempChange1h, 1)} F</span>
                    </span>
                    <span className="text-gray-500">
                      Dew <span className="font-semibold text-gray-100">{fmtSigned(station.dewPointChange1h, 1)} F</span>
                    </span>
                    <span className="text-gray-500">
                      Gust <span className="font-semibold text-gray-100">{fmtSigned(station.gustChange1h, 0)} kt</span>
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-gray-500">
                    Forecast peak {fmtNumber(station.forecastPeakPrecipPct, 0)}%{" "}
                    {fmtLeadHours(station.forecastPeakLeadHours)}
                    {station.precipStartedMinutesAgo !== null
                      ? ` | precip ${fmtMinutesAgo(station.precipStartedMinutesAgo)}`
                      : ""}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-gray-800 bg-[#0d1119]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 px-3 py-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-100">Synchronized Timeline</h3>
              <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-100">
                OBSERVED + FORECAST
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              {activeStation} | radar {fmtDateTime(activeFrame?.validTime)} | forecast selection{" "}
              {fmtLeadHours(forecastLeadHours)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right text-[11px]">
            <div>
              <p className="text-gray-500">Temp 1h</p>
              <p className="font-semibold text-gray-100">
                {fmtSigned(activeStationChange?.tempChange1h, 1)} F
              </p>
            </div>
            <div>
              <p className="text-gray-500">Dew 1h</p>
              <p className="font-semibold text-gray-100">
                {fmtSigned(activeStationChange?.dewPointChange1h, 1)} F
              </p>
            </div>
            <div>
              <p className="text-gray-500">Gust 1h</p>
              <p className="font-semibold text-gray-100">
                {fmtSigned(activeStationChange?.gustChange1h, 0)} kt
              </p>
            </div>
          </div>
        </div>
        <div className="p-3">
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={timelineRows} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#9ca3af", fontSize: 10 }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={{ stroke: "#374151" }}
                  minTickGap={26}
                />
                <YAxis
                  yAxisId="temp"
                  tick={{ fill: "#9ca3af", fontSize: 10 }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={{ stroke: "#374151" }}
                />
                <YAxis
                  yAxisId="activity"
                  orientation="right"
                  tick={{ fill: "#9ca3af", fontSize: 10 }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={{ stroke: "#374151" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #374151",
                    borderRadius: 8,
                    color: "#e5e7eb",
                  }}
                  labelFormatter={(_, rows) => fmtDateTime(rows[0]?.payload?.time)}
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="observedTempF"
                  name="Observed temp F"
                  stroke="#f97316"
                  dot={false}
                  connectNulls
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="forecastTempF"
                  name="Forecast temp F"
                  stroke="#22c55e"
                  dot={false}
                  connectNulls
                />
                <Line
                  yAxisId="activity"
                  type="monotone"
                  dataKey="observedGustKt"
                  name="Observed gust kt"
                  stroke="#ef4444"
                  dot={false}
                  connectNulls
                />
                <Line
                  yAxisId="activity"
                  type="monotone"
                  dataKey="forecastPrecipPct"
                  name="Forecast precip %"
                  stroke="#38bdf8"
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-xs text-gray-200">
              <thead className="bg-gray-950 text-[10px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="border border-gray-800 px-2 py-2 text-left">Type</th>
                  <th className="border border-gray-800 px-2 py-2 text-left">Time</th>
                  <th className="border border-gray-800 px-2 py-2 text-right">Obs Temp</th>
                  <th className="border border-gray-800 px-2 py-2 text-right">Obs Dew</th>
                  <th className="border border-gray-800 px-2 py-2 text-right">Obs Gust</th>
                  <th className="border border-gray-800 px-2 py-2 text-right">Obs Precip</th>
                  <th className="border border-gray-800 px-2 py-2 text-right">Fcst Temp</th>
                  <th className="border border-gray-800 px-2 py-2 text-right">Fcst Pop</th>
                  <th className="border border-gray-800 px-2 py-2 text-left">Fcst Wind</th>
                  <th className="border border-gray-800 px-2 py-2 text-left">Weather</th>
                </tr>
              </thead>
              <tbody>
                {timelineTableRows.map((row) => (
                  <tr key={row.id} className="odd:bg-gray-950/20">
                    <td className="border border-gray-800 px-2 py-1">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                          row.source === "OBSERVED"
                            ? "border-sky-500/30 bg-sky-500/10 text-sky-100"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                        }`}
                      >
                        {row.source}
                      </span>
                    </td>
                    <td className="border border-gray-800 px-2 py-1 tabular-nums text-gray-400">
                      {fmtDateTime(row.time)}
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-right tabular-nums">
                      {fmtNumber(row.observedTempF, 1)}
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-right tabular-nums">
                      {fmtNumber(row.observedDewPointF, 1)}
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-right tabular-nums">
                      {fmtNumber(row.observedGustKt, 0)}
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-right tabular-nums">
                      {fmtNumber(row.observedPrecipIn, 2)}
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-right tabular-nums">
                      {fmtNumber(row.forecastTempF, 0)}
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-right tabular-nums">
                      {fmtNumber(row.forecastPrecipPct, 0)}
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-gray-400">
                      {row.forecastWindSpeed ?? "--"}
                    </td>
                    <td className="max-w-[420px] truncate border border-gray-800 px-2 py-1 text-gray-500" title={row.weatherText ?? ""}>
                      {row.weatherText ?? "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {sourceDialogOpen && (
        <SourceInfoDialog payload={payload} onClose={() => setSourceDialogOpen(false)} />
      )}
    </div>
  );
}
