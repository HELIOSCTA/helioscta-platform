"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";

type ForecastRun = "primary" | "intraday";

interface WsiForecastMapHour {
  hourBeginning: number;
  hourEnding: number;
  label: string;
}

interface WsiForecastMapStation {
  stationId: string;
  stationName: string;
  region: string;
  latitude: number | null;
  longitude: number | null;
  timeZone: string | null;
  state: string | null;
  isAggregate: boolean;
  coordinateSource: "noaa_metar" | "fallback" | null;
}

interface WsiForecastMapPoint {
  region: string;
  stationId: string;
  stationName: string;
  forecastTimeUtc: string | null;
  observedTimeUtc: string | null;
  localTimeEpt: string;
  localDateEpt: string;
  hourBeginningEpt: number;
  hourEndingEpt: number;
  forecastTempF: number | null;
  forecastTempDiffF: number | null;
  forecastTempNormalF: number | null;
  forecastDewPointF: number | null;
  forecastCloudCoverPct: number | null;
  forecastFeelsLikeF: number | null;
  forecastFeelsLikeDiffF: number | null;
  forecastPrecipIn: number | null;
  forecastWindDirectionDeg: number | null;
  forecastWindSpeedMph: number | null;
  forecastGhiWm2: number | null;
  forecastProbabilityOfPrecipPct: number | null;
  forecastRelativeHumidityPct: number | null;
  forecastUpdatedAt: string | null;
  observedTempF: number | null;
  observedDewPointF: number | null;
  observedCloudCoverPct: number | null;
  observedFeelsLikeF: number | null;
  observedPrecipIn: number | null;
  observedWindDirectionDeg: number | null;
  observedWindSpeedMph: number | null;
  observedRelativeHumidityPct: number | null;
  observedUpdatedAt: string | null;
  tempErrorF: number | null;
  feelsLikeErrorF: number | null;
  dewPointErrorF: number | null;
  cloudCoverErrorPct: number | null;
  precipErrorIn: number | null;
  windSpeedErrorMph: number | null;
  relativeHumidityErrorPct: number | null;
}

interface WsiForecastMapPayload {
  source: "weather.wsi_hourly_forecasts+weather.wsi_hourly_observed_temperatures";
  filters: {
    region: string;
    date: string;
    forecastRun: ForecastRun;
    forecastExecutionDate: string | null;
  };
  availableRegions: string[];
  availableForecastExecutionDates: string[];
  hours: WsiForecastMapHour[];
  stations: WsiForecastMapStation[];
  rows: WsiForecastMapPoint[];
  rowCounts: {
    hourlyRows: number;
    stationCount: number;
    mappedStationCount: number;
  };
  asOf: {
    forecast: string | null;
    observed: string | null;
  };
  forecastExecution: {
    requestedRun: ForecastRun;
    selectedRun: ForecastRun;
    executionDate: string | null;
    primary: string | null;
    intraday: string | null;
    selected: string | null;
    intradayAvailable: boolean;
  };
}

type MetricKey =
  | "forecastTempF"
  | "forecastFeelsLikeF"
  | "tempErrorF"
  | "forecastDewPointF"
  | "forecastRelativeHumidityPct"
  | "forecastCloudCoverPct"
  | "forecastGhiWm2"
  | "forecastProbabilityOfPrecipPct"
  | "forecastPrecipIn"
  | "forecastWindSpeedMph"
  | "forecastWindDirectionDeg";

interface MetricConfig {
  key: MetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  decimals: number;
  domain: [number, number];
  colorLow: string;
  colorMid: string;
  colorHigh: string;
  isError?: boolean;
  forecastLabel?: string;
  observedLabel?: string;
  getValue: (row: WsiForecastMapPoint) => number | null;
  getForecast?: (row: WsiForecastMapPoint) => number | null;
  getObserved?: (row: WsiForecastMapPoint) => number | null;
  getError?: (row: WsiForecastMapPoint) => number | null;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const MAP_WIDTH = 760;
const MAP_HEIGHT = 430;
const MAP_PADDING = 32;
const MAP_BOUNDS = {
  minLat: 36.1,
  maxLat: 42.6,
  minLon: -89.8,
  maxLon: -73.8,
};

const MAP_LABELS = [
  { label: "IL", latitude: 40.2, longitude: -88.4 },
  { label: "IN", latitude: 40.0, longitude: -85.6 },
  { label: "OH", latitude: 40.2, longitude: -82.7 },
  { label: "PA", latitude: 40.5, longitude: -77.8 },
  { label: "NJ", latitude: 39.8, longitude: -74.7 },
  { label: "WV", latitude: 38.7, longitude: -80.5 },
  { label: "VA", latitude: 37.6, longitude: -78.1 },
  { label: "MD", latitude: 39.0, longitude: -76.8 },
];

const METRICS: MetricConfig[] = [
  {
    key: "forecastTempF",
    label: "Temperature",
    shortLabel: "Temp",
    unit: "F",
    decimals: 0,
    domain: [55, 105],
    colorLow: "#38bdf8",
    colorMid: "#facc15",
    colorHigh: "#ef4444",
    forecastLabel: "Forecast temperature",
    observedLabel: "Observed temperature",
    getValue: (row) => row.forecastTempF,
    getForecast: (row) => row.forecastTempF,
    getObserved: (row) => row.observedTempF,
    getError: (row) => row.tempErrorF,
  },
  {
    key: "forecastFeelsLikeF",
    label: "Feels Like",
    shortLabel: "Feels",
    unit: "F",
    decimals: 0,
    domain: [55, 110],
    colorLow: "#60a5fa",
    colorMid: "#fb923c",
    colorHigh: "#dc2626",
    forecastLabel: "Forecast feels-like",
    observedLabel: "Observed feels-like",
    getValue: (row) => row.forecastFeelsLikeF,
    getForecast: (row) => row.forecastFeelsLikeF,
    getObserved: (row) => row.observedFeelsLikeF,
    getError: (row) => row.feelsLikeErrorF,
  },
  {
    key: "tempErrorF",
    label: "Temperature Error",
    shortLabel: "Error",
    unit: "F",
    decimals: 1,
    domain: [-10, 10],
    colorLow: "#2563eb",
    colorMid: "#d1d5db",
    colorHigh: "#dc2626",
    isError: true,
    forecastLabel: "Observed - forecast",
    getValue: (row) => row.tempErrorF,
    getForecast: (row) => row.tempErrorF,
  },
  {
    key: "forecastDewPointF",
    label: "Dew Point",
    shortLabel: "Dew",
    unit: "F",
    decimals: 0,
    domain: [40, 80],
    colorLow: "#22d3ee",
    colorMid: "#22c55e",
    colorHigh: "#f97316",
    forecastLabel: "Forecast dew point",
    observedLabel: "Observed dew point",
    getValue: (row) => row.forecastDewPointF,
    getForecast: (row) => row.forecastDewPointF,
    getObserved: (row) => row.observedDewPointF,
    getError: (row) => row.dewPointErrorF,
  },
  {
    key: "forecastRelativeHumidityPct",
    label: "Relative Humidity",
    shortLabel: "RH",
    unit: "%",
    decimals: 0,
    domain: [20, 100],
    colorLow: "#facc15",
    colorMid: "#38bdf8",
    colorHigh: "#2563eb",
    forecastLabel: "Forecast humidity",
    observedLabel: "Observed humidity",
    getValue: (row) => row.forecastRelativeHumidityPct,
    getForecast: (row) => row.forecastRelativeHumidityPct,
    getObserved: (row) => row.observedRelativeHumidityPct,
    getError: (row) => row.relativeHumidityErrorPct,
  },
  {
    key: "forecastCloudCoverPct",
    label: "Cloud Cover",
    shortLabel: "Clouds",
    unit: "%",
    decimals: 0,
    domain: [0, 100],
    colorLow: "#f8fafc",
    colorMid: "#94a3b8",
    colorHigh: "#475569",
    forecastLabel: "Forecast cloud cover",
    observedLabel: "Observed cloud cover",
    getValue: (row) => row.forecastCloudCoverPct,
    getForecast: (row) => row.forecastCloudCoverPct,
    getObserved: (row) => row.observedCloudCoverPct,
    getError: (row) => row.cloudCoverErrorPct,
  },
  {
    key: "forecastGhiWm2",
    label: "GHI Irradiance",
    shortLabel: "GHI",
    unit: "W/m2",
    decimals: 0,
    domain: [0, 950],
    colorLow: "#334155",
    colorMid: "#facc15",
    colorHigh: "#f97316",
    forecastLabel: "Forecast GHI",
    getValue: (row) => row.forecastGhiWm2,
    getForecast: (row) => row.forecastGhiWm2,
  },
  {
    key: "forecastProbabilityOfPrecipPct",
    label: "Probability Of Precip",
    shortLabel: "POP",
    unit: "%",
    decimals: 0,
    domain: [0, 100],
    colorLow: "#1e293b",
    colorMid: "#38bdf8",
    colorHigh: "#2563eb",
    forecastLabel: "Forecast POP",
    getValue: (row) => row.forecastProbabilityOfPrecipPct,
    getForecast: (row) => row.forecastProbabilityOfPrecipPct,
  },
  {
    key: "forecastPrecipIn",
    label: "Precip Amount",
    shortLabel: "Precip",
    unit: "in",
    decimals: 2,
    domain: [0, 0.5],
    colorLow: "#1e293b",
    colorMid: "#06b6d4",
    colorHigh: "#2563eb",
    forecastLabel: "Forecast precip",
    observedLabel: "Observed precip",
    getValue: (row) => row.forecastPrecipIn,
    getForecast: (row) => row.forecastPrecipIn,
    getObserved: (row) => row.observedPrecipIn,
    getError: (row) => row.precipErrorIn,
  },
  {
    key: "forecastWindSpeedMph",
    label: "Wind Speed",
    shortLabel: "Wind",
    unit: "mph",
    decimals: 0,
    domain: [0, 30],
    colorLow: "#a7f3d0",
    colorMid: "#22c55e",
    colorHigh: "#15803d",
    forecastLabel: "Forecast wind speed",
    observedLabel: "Observed wind speed",
    getValue: (row) => row.forecastWindSpeedMph,
    getForecast: (row) => row.forecastWindSpeedMph,
    getObserved: (row) => row.observedWindSpeedMph,
    getError: (row) => row.windSpeedErrorMph,
  },
  {
    key: "forecastWindDirectionDeg",
    label: "Wind Direction",
    shortLabel: "Wind Dir",
    unit: "deg",
    decimals: 0,
    domain: [0, 360],
    colorLow: "#a78bfa",
    colorMid: "#f472b6",
    colorHigh: "#fb7185",
    forecastLabel: "Forecast wind direction",
    observedLabel: "Observed wind direction",
    getValue: (row) => row.forecastWindDirectionDeg,
    getForecast: (row) => row.forecastWindDirectionDeg,
    getObserved: (row) => row.observedWindDirectionDeg,
  },
];

const METRIC_BY_KEY = new Map(METRICS.map((metric) => [metric.key, metric]));

function dateStringInTimeZone(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "01";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function buildApiUrl({
  region,
  date,
  forecastRun,
  forecastExecutionDate,
  refresh,
}: {
  region: string;
  date: string;
  forecastRun: ForecastRun;
  forecastExecutionDate: string;
  refresh: boolean;
}): string {
  const params = new URLSearchParams({
    region,
    date,
    forecastRun,
  });
  if (forecastExecutionDate) params.set("forecastExecutionDate", forecastExecutionDate);
  if (refresh) params.set("refresh", "1");
  return `/api/weather/wsi-forecast-map?${params.toString()}`;
}

function buildCacheKey({
  region,
  date,
  forecastRun,
  forecastExecutionDate,
}: {
  region: string;
  date: string;
  forecastRun: ForecastRun;
  forecastExecutionDate: string;
}): string {
  return [
    "wsi-forecast-map",
    region,
    date,
    forecastRun,
    forecastExecutionDate || "latest",
  ].join(":");
}

function fmtStamp(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtMetric(value: number | null | undefined, metric: MetricConfig): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  const formatted = value.toLocaleString(undefined, {
    maximumFractionDigits: metric.decimals,
    minimumFractionDigits: metric.decimals,
  });
  return metric.unit ? `${formatted}${metric.unit === "F" ? "°F" : ` ${metric.unit}`}` : formatted;
}

function fmtCompact(value: number | null | undefined, metric: MetricConfig): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: metric.decimals,
    minimumFractionDigits: metric.decimals,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function rgbToHex([red, green, blue]: [number, number, number]): string {
  return `#${[red, green, blue]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function interpolateColor(start: string, end: string, t: number): string {
  const a = hexToRgb(start);
  const b = hexToRgb(end);
  return rgbToHex([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]);
}

function colorForValue(value: number | null | undefined, metric: MetricConfig): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "#334155";
  const [min, max] = metric.domain;
  const ratio = clamp((value - min) / (max - min), 0, 1);
  if (ratio <= 0.5) {
    return interpolateColor(metric.colorLow, metric.colorMid, ratio * 2);
  }
  return interpolateColor(metric.colorMid, metric.colorHigh, (ratio - 0.5) * 2);
}

function projectPoint(latitude: number, longitude: number): { x: number; y: number } {
  const x =
    MAP_PADDING +
    ((longitude - MAP_BOUNDS.minLon) / (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon)) *
      (MAP_WIDTH - MAP_PADDING * 2);
  const y =
    MAP_PADDING +
    ((MAP_BOUNDS.maxLat - latitude) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) *
      (MAP_HEIGHT - MAP_PADDING * 2);
  return { x, y };
}

function valuesForHour(
  payload: WsiForecastMapPayload | null,
  hourBeginning: number
): Map<string, WsiForecastMapPoint> {
  const rows = new Map<string, WsiForecastMapPoint>();
  for (const row of payload?.rows ?? []) {
    if (row.hourBeginningEpt === hourBeginning) rows.set(row.stationId, row);
  }
  return rows;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundOne(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

export default function WsiForecastMap({ refreshToken = 0 }: { refreshToken?: number }) {
  const [region, setRegion] = useState("PJM");
  const [date, setDate] = useState(() => dateStringInTimeZone("America/New_York"));
  const [forecastRun, setForecastRun] = useState<ForecastRun>("primary");
  const [forecastExecutionDate, setForecastExecutionDate] = useState("");
  const [metricKey, setMetricKey] = useState<MetricKey>("forecastTempF");
  const [hourIndex, setHourIndex] = useState(14);
  const [selectedStationId, setSelectedStationId] = useState("");
  const [payload, setPayload] = useState<WsiForecastMapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const metric = METRIC_BY_KEY.get(metricKey) ?? METRICS[0];

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const forceRefresh = refreshToken > 0;

    setLoading(true);
    setError(null);

    fetchJsonWithCache<WsiForecastMapPayload>({
      key: buildCacheKey({
        region,
        date,
        forecastRun,
        forecastExecutionDate,
      }),
      url: buildApiUrl({
        region,
        date,
        forecastRun,
        forecastExecutionDate,
        refresh: forceRefresh,
      }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
    })
      .then((data) => {
        if (!active) return;
        setPayload(data);
        if (
          forecastRun === "intraday" &&
          data.forecastExecution &&
          !data.forecastExecution.intradayAvailable
        ) {
          setForecastRun("primary");
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to fetch WSI map data");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [date, forecastExecutionDate, forecastRun, refreshToken, region]);

  useEffect(() => {
    if (!payload) return;
    if (hourIndex >= payload.hours.length) {
      setHourIndex(Math.max(payload.hours.length - 1, 0));
    }
    const stationExists = payload.stations.some((station) => station.stationId === selectedStationId);
    if (!selectedStationId || !stationExists) {
      const mapped = payload.stations.find((station) => station.latitude !== null);
      const aggregate = payload.stations.find((station) => station.isAggregate);
      setSelectedStationId(mapped?.stationId ?? aggregate?.stationId ?? payload.stations[0]?.stationId ?? "");
    }
  }, [hourIndex, payload, selectedStationId]);

  const activeHour = payload?.hours[hourIndex] ?? payload?.hours[0] ?? {
    hourBeginning: 0,
    hourEnding: 1,
    label: "HE 1",
  };
  const regionOptions = payload?.availableRegions.length ? payload.availableRegions : [region];
  const intradayUnavailable = Boolean(payload && !payload.forecastExecution.intradayAvailable);
  const rowsByActiveHour = useMemo(
    () => valuesForHour(payload, activeHour.hourBeginning),
    [activeHour.hourBeginning, payload]
  );
  const mappedStations = useMemo(
    () =>
      (payload?.stations ?? []).filter(
        (station) =>
          !station.isAggregate && station.latitude !== null && station.longitude !== null
      ),
    [payload]
  );
  const selectedStation = payload?.stations.find(
    (station) => station.stationId === selectedStationId
  );
  const selectedHourPoint = selectedStationId ? rowsByActiveHour.get(selectedStationId) : null;
  const mappedValues = useMemo(() => {
    return mappedStations
      .map((station) => {
        const point = rowsByActiveHour.get(station.stationId);
        return point ? metric.getValue(point) : null;
      })
      .filter((value): value is number => value !== null && Number.isFinite(value));
  }, [mappedStations, metric, rowsByActiveHour]);
  const minStation = useMemo(() => {
    let best: { station: WsiForecastMapStation; value: number } | null = null;
    for (const station of mappedStations) {
      const point = rowsByActiveHour.get(station.stationId);
      const value = point ? metric.getValue(point) : null;
      if (value === null) continue;
      if (!best || value < best.value) best = { station, value };
    }
    return best;
  }, [mappedStations, metric, rowsByActiveHour]);
  const maxStation = useMemo(() => {
    let best: { station: WsiForecastMapStation; value: number } | null = null;
    for (const station of mappedStations) {
      const point = rowsByActiveHour.get(station.stationId);
      const value = point ? metric.getValue(point) : null;
      if (value === null) continue;
      if (!best || value > best.value) best = { station, value };
    }
    return best;
  }, [mappedStations, metric, rowsByActiveHour]);
  const chartRows = useMemo(() => {
    return (payload?.rows ?? [])
      .filter((row) => row.stationId === selectedStationId)
      .sort((left, right) => left.hourBeginningEpt - right.hourBeginningEpt)
      .map((row) => ({
        label: `HE${row.hourEndingEpt}`,
        forecast: metric.getForecast?.(row) ?? null,
        observed: metric.getObserved?.(row) ?? null,
        error: metric.getError?.(row) ?? null,
        normal: metric.key === "forecastTempF" ? row.forecastTempNormalF : null,
      }));
  }, [metric, payload, selectedStationId]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Day
              </span>
              <input
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setForecastExecutionDate("");
                }}
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Region
              </span>
              <select
                value={region}
                onChange={(event) => {
                  setRegion(event.target.value);
                  setSelectedStationId("");
                  setForecastExecutionDate("");
                }}
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              >
                {regionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Run
              </span>
              <select
                value={forecastRun}
                onChange={(event) => setForecastRun(event.target.value as ForecastRun)}
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              >
                <option value="primary">Primary</option>
                <option value="intraday" disabled={intradayUnavailable}>
                  Intraday{intradayUnavailable ? " unavailable" : ""}
                </option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Forecast Issue
              </span>
              <select
                value={forecastExecutionDate}
                onChange={(event) => setForecastExecutionDate(event.target.value)}
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              >
                <option value="">Latest</option>
                {(payload?.availableForecastExecutionDates ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Metric
              </span>
              <select
                value={metricKey}
                onChange={(event) => setMetricKey(event.target.value as MetricKey)}
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              >
                {METRICS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid min-w-[220px] grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                Forecast
              </div>
              <div className="mt-1 font-semibold text-gray-200">{fmtStamp(payload?.asOf.forecast)}</div>
            </div>
            <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                Observed
              </div>
              <div className="mt-1 font-semibold text-gray-200">{fmtStamp(payload?.asOf.observed)}</div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-100">
                {activeHour.label} on {payload?.filters.date ?? date}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Issue {fmtStamp(payload?.forecastExecution.selected)} | {payload?.rowCounts.mappedStationCount ?? 0} mapped stations
              </div>
            </div>
            <div className="text-xs tabular-nums text-gray-400">
              {Math.max(hourIndex + 1, 1)} / {payload?.hours.length ?? 24}
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max((payload?.hours.length ?? 24) - 1, 0)}
            value={hourIndex}
            onChange={(event) => setHourIndex(Number(event.target.value))}
            className="mt-3 w-full accent-sky-500"
            aria-label="Forecast hour"
          />
          <div className="mt-1 grid grid-cols-6 gap-1 text-[10px] text-gray-600 sm:grid-cols-12 lg:grid-cols-24">
            {(payload?.hours ?? Array.from({ length: 24 }, (_, index) => ({
              hourBeginning: index,
              hourEnding: index + 1,
              label: `HE ${index + 1}`,
            }))).map((hour) => (
              <button
                key={hour.hourEnding}
                type="button"
                onClick={() => setHourIndex(hour.hourBeginning)}
                className={`rounded px-1 py-0.5 text-center transition-colors ${
                  hour.hourBeginning === activeHour.hourBeginning
                    ? "bg-sky-500/20 text-sky-100"
                    : "hover:bg-gray-900 hover:text-gray-300"
                }`}
              >
                {hour.hourEnding}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && !payload ? (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-5 text-sm text-gray-500 shadow-xl shadow-black/20">
          Loading WSI forecast map...
        </div>
      ) : payload ? (
        <>
          <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-100">Station Map</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {metric.label} by WSI station, aligned to PJM/EPT hour
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                <span className="rounded-md border border-gray-700 bg-gray-950/40 px-2 py-1 text-gray-300">
                  Avg {fmtMetric(roundOne(average(mappedValues)), metric)}
                </span>
                <span className="rounded-md border border-gray-700 bg-gray-950/40 px-2 py-1 text-gray-300">
                  Low {minStation ? `${minStation.station.stationId} ${fmtMetric(minStation.value, metric)}` : "--"}
                </span>
                <span className="rounded-md border border-gray-700 bg-gray-950/40 px-2 py-1 text-gray-300">
                  High {maxStation ? `${maxStation.station.stationId} ${fmtMetric(maxStation.value, metric)}` : "--"}
                </span>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-h-[360px] overflow-hidden rounded-md border border-gray-800 bg-[#08111d]">
                <svg
                  viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                  role="img"
                  aria-label={`WSI forecast map for ${activeHour.label}`}
                  className="h-full min-h-[360px] w-full"
                >
                  <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="#08111d" />
                  {[...Array(6)].map((_, index) => {
                    const x = MAP_PADDING + (index / 5) * (MAP_WIDTH - MAP_PADDING * 2);
                    return (
                      <line
                        key={`v-${index}`}
                        x1={x}
                        x2={x}
                        y1={MAP_PADDING}
                        y2={MAP_HEIGHT - MAP_PADDING}
                        stroke="#1f2937"
                        strokeDasharray="4 8"
                      />
                    );
                  })}
                  {[...Array(5)].map((_, index) => {
                    const y = MAP_PADDING + (index / 4) * (MAP_HEIGHT - MAP_PADDING * 2);
                    return (
                      <line
                        key={`h-${index}`}
                        x1={MAP_PADDING}
                        x2={MAP_WIDTH - MAP_PADDING}
                        y1={y}
                        y2={y}
                        stroke="#1f2937"
                        strokeDasharray="4 8"
                      />
                    );
                  })}
                  <rect
                    x={MAP_PADDING}
                    y={MAP_PADDING}
                    width={MAP_WIDTH - MAP_PADDING * 2}
                    height={MAP_HEIGHT - MAP_PADDING * 2}
                    fill="none"
                    stroke="#334155"
                  />
                  {MAP_LABELS.map((label) => {
                    const { x, y } = projectPoint(label.latitude, label.longitude);
                    return (
                      <text
                        key={label.label}
                        x={x}
                        y={y}
                        fill="#334155"
                        fontSize={24}
                        fontWeight={700}
                        textAnchor="middle"
                      >
                        {label.label}
                      </text>
                    );
                  })}
                  {mappedStations.map((station) => {
                    const point = rowsByActiveHour.get(station.stationId);
                    const value = point ? metric.getValue(point) : null;
                    const { x, y } = projectPoint(station.latitude ?? 0, station.longitude ?? 0);
                    const selected = station.stationId === selectedStationId;
                    return (
                      <g
                        key={station.stationId}
                        role="button"
                        tabIndex={0}
                        transform={`translate(${x} ${y})`}
                        onClick={() => setSelectedStationId(station.stationId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedStationId(station.stationId);
                          }
                        }}
                        className="cursor-pointer outline-none"
                      >
                        <title>
                          {station.stationName} {fmtMetric(value, metric)} {activeHour.label}
                        </title>
                        <circle
                          r={selected ? 9 : 6.5}
                          fill={colorForValue(value, metric)}
                          stroke={selected ? "#f8fafc" : "#0f172a"}
                          strokeWidth={selected ? 2.5 : 1.5}
                        />
                        <circle
                          r={selected ? 14 : 10}
                          fill="transparent"
                          stroke={selected ? "#f8fafc" : "transparent"}
                          strokeOpacity={0.35}
                        />
                        {selected && (
                          <text
                            x={12}
                            y={4}
                            fill="#f8fafc"
                            fontSize={11}
                            fontWeight={700}
                            paintOrder="stroke"
                            stroke="#08111d"
                            strokeWidth={3}
                          >
                            {station.stationId}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
              <aside className="rounded-md border border-gray-800 bg-gray-950/40 p-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Selected Station
                  </span>
                  <select
                    value={selectedStationId}
                    onChange={(event) => setSelectedStationId(event.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                  >
                    {payload.stations.map((station) => (
                      <option key={station.stationId} value={station.stationId}>
                        {station.stationId} - {station.stationName}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-4 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-100">
                      {selectedStation?.stationName ?? "--"}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      {selectedStation?.stationId ?? "--"}
                      {selectedStation?.state ? ` | ${selectedStation.state}` : ""}
                      {selectedStation?.timeZone ? ` | ${selectedStation.timeZone.replace("America/", "")}` : ""}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-gray-800 bg-[#111827] px-2 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-gray-600">
                        Forecast
                      </div>
                      <div className="mt-1 font-semibold text-gray-100">
                        {fmtMetric(selectedHourPoint ? metric.getForecast?.(selectedHourPoint) ?? metric.getValue(selectedHourPoint) : null, metric)}
                      </div>
                    </div>
                    <div className="rounded-md border border-gray-800 bg-[#111827] px-2 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-gray-600">
                        Observed
                      </div>
                      <div className="mt-1 font-semibold text-gray-100">
                        {fmtMetric(selectedHourPoint ? metric.getObserved?.(selectedHourPoint) ?? null : null, metric)}
                      </div>
                    </div>
                    <div className="rounded-md border border-gray-800 bg-[#111827] px-2 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-gray-600">
                        Error
                      </div>
                      <div className="mt-1 font-semibold text-gray-100">
                        {fmtMetric(selectedHourPoint ? metric.getError?.(selectedHourPoint) ?? null : null, metric)}
                      </div>
                    </div>
                    <div className="rounded-md border border-gray-800 bg-[#111827] px-2 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-gray-600">
                        Source
                      </div>
                      <div className="mt-1 font-semibold text-gray-100">
                        {selectedStation?.coordinateSource === "noaa_metar"
                          ? "NOAA"
                          : selectedStation?.coordinateSource === "fallback"
                            ? "Static"
                            : "--"}
                      </div>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </section>

          <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-gray-100">
                {selectedStation?.stationName ?? "Station"} Hourly Curve
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {metric.label} forecast, observed value, and error where available
              </p>
            </div>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#374151" }}
                  />
                  <YAxis
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#374151" }}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111827",
                      border: "1px solid #374151",
                      borderRadius: 6,
                      color: "#e5e7eb",
                    }}
                    labelStyle={{ color: "#d1d5db" }}
                  />
                  {metric.isError && <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />}
                  {metric.key === "forecastTempF" && (
                    <Line
                      type="monotone"
                      dataKey="normal"
                      name="Normal"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      strokeDasharray="3 4"
                      dot={false}
                      connectNulls
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    name={metric.forecastLabel ?? metric.label}
                    stroke={metric.isError ? "#f97316" : "#f97316"}
                    strokeWidth={2.25}
                    dot={false}
                    connectNulls
                  />
                  {!metric.isError && metric.getObserved && (
                    <Line
                      type="monotone"
                      dataKey="observed"
                      name={metric.observedLabel ?? "Observed"}
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  )}
                  {!metric.isError && metric.getError && (
                    <Line
                      type="monotone"
                      dataKey="error"
                      name="Observed - forecast"
                      stroke="#a78bfa"
                      strokeWidth={1.75}
                      strokeDasharray="5 4"
                      dot={false}
                      connectNulls
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-100">Hourly Station Matrix</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {metric.label} by station and PJM/EPT hour
                </p>
              </div>
              <div className="text-xs text-gray-500">
                {payload.rowCounts.hourlyRows.toLocaleString()} hourly rows
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border border-gray-800 bg-[#0d1119]">
              <table className="w-full min-w-[1100px] border-collapse text-[10px] text-gray-200">
                <thead className="bg-gray-950 text-gray-400">
                  <tr>
                    <th className="sticky left-0 z-30 w-44 border border-gray-800 bg-gray-950 px-2 py-1 text-left font-semibold uppercase tracking-wide">
                      Station
                    </th>
                    {payload.hours.map((hour) => (
                      <th
                        key={hour.hourEnding}
                        className="w-11 border border-gray-800 px-1 py-1 text-center font-semibold"
                      >
                        {hour.hourEnding}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payload.stations
                    .filter((station) => !station.isAggregate)
                    .map((station) => (
                      <tr key={station.stationId}>
                        <td className="sticky left-0 z-20 border border-gray-800 bg-gray-950 px-2 py-1 font-medium text-gray-100">
                          <span className="block truncate">{station.stationName}</span>
                          <span className="block text-[9px] font-normal text-gray-500">
                            {station.stationId}
                          </span>
                        </td>
                        {payload.hours.map((hour) => {
                          const point = payload.rows.find(
                            (row) =>
                              row.stationId === station.stationId &&
                              row.hourBeginningEpt === hour.hourBeginning
                          );
                          const value = point ? metric.getValue(point) : null;
                          return (
                            <td
                              key={hour.hourEnding}
                              className="border border-gray-800 px-1 py-1 text-center tabular-nums text-gray-100"
                              style={{
                                backgroundColor: colorForValue(value, metric),
                                color:
                                  value === null || metric.key === "forecastCloudCoverPct"
                                    ? "#e5e7eb"
                                    : "#0f172a",
                              }}
                            >
                              {fmtCompact(value, metric)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-5 text-sm text-gray-500 shadow-xl shadow-black/20">
          No WSI map data found for the selected day.
        </div>
      )}
    </div>
  );
}
