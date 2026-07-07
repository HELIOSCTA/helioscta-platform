"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PlotCard, { type PlotSeries } from "@/components/dashboard/PlotCard";
import MultiSelect from "@/components/ui/MultiSelect";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import WsiForecastMap from "@/components/weather/WsiForecastMap";

type WeatherSource = "observed" | "forecast" | "both";
type ForecastRun = "primary" | "intraday";
type WeatherTab = "forecast-map" | "daily-summary" | "hourly-forecast";
type WeatherVariable = "temperature" | "dewPoint" | "feelsLike";
type WeatherStatistic = "minmax" | "avg" | "min" | "max";

interface TempSummary {
  minTempF: number | null;
  maxTempF: number | null;
  avgTempF: number | null;
  minTempDiffF: number | null;
  maxTempDiffF: number | null;
  avgTempDiffF: number | null;
  minTempNormalF: number | null;
  maxTempNormalF: number | null;
  avgTempNormalF: number | null;
  minDewPointF: number | null;
  maxDewPointF: number | null;
  avgDewPointF: number | null;
  minFeelsLikeTempF: number | null;
  maxFeelsLikeTempF: number | null;
  avgFeelsLikeTempF: number | null;
  hourlyCount: number;
  updatedAt: string | null;
}

interface DailyTempCell {
  date: string;
  source: WeatherSource;
  primarySource: "observed" | "forecast";
  minTempF: number | null;
  maxTempF: number | null;
  avgTempF: number | null;
  minTempDiffF: number | null;
  maxTempDiffF: number | null;
  avgTempDiffF: number | null;
  minTempNormalF: number | null;
  maxTempNormalF: number | null;
  avgTempNormalF: number | null;
  minDewPointF: number | null;
  maxDewPointF: number | null;
  avgDewPointF: number | null;
  minFeelsLikeTempF: number | null;
  maxFeelsLikeTempF: number | null;
  avgFeelsLikeTempF: number | null;
  observed?: TempSummary;
  forecast?: TempSummary;
}

interface WeatherStationSummary {
  stationName: string;
  siteId: string | null;
  region: string;
  cells: Record<string, DailyTempCell>;
}

interface WeatherDateColumn {
  date: string;
  source: WeatherSource;
}

interface WeatherHourlyTempsPayload {
  source: "weather.wsi_hourly_forecasts+weather.wsi_hourly_observed_temperatures";
  filters: {
    region: string;
    stations: string[];
    forecastRun: ForecastRun;
    forecastExecutionDate: string | null;
    observedStartDate: string;
    observedEndDate: string;
    forecastStartDate: string;
    forecastEndDate: string;
  };
  availableRegions: string[];
  availableStations: string[];
  availableForecastExecutionDates: string[];
  dates: WeatherDateColumn[];
  stations: WeatherStationSummary[];
  rowCounts: {
    summaryRows: number;
    stationCount: number;
  };
  asOf: {
    observed: string | null;
    forecast: string | null;
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

interface WeatherHourlyForecastPoint {
  localTime: string;
  date: string;
  hour: number;
  region: string;
  siteId: string | null;
  stationName: string;
  tempF: number | null;
  tempDiffF: number | null;
  tempNormalF: number | null;
  dewPointF: number | null;
  cloudCoverPct: number | null;
  feelsLikeTempF: number | null;
  feelsLikeTempDiffF: number | null;
  precipIn: number | null;
  windDirectionDeg: number | null;
  windSpeedMph: number | null;
  ghiWm2: number | null;
  probabilityOfPrecipPct: number | null;
  relativeHumidityPct: number | null;
  updatedAt: string | null;
}

interface WeatherHourlyObservedPoint {
  localTime: string;
  date: string;
  hour: number;
  region: string;
  siteId: string | null;
  stationName: string;
  tempF: number | null;
  dewPointF: number | null;
  cloudCoverPct: number | null;
  feelsLikeTempF: number | null;
  precipIn: number | null;
  windDirectionDeg: number | null;
  windSpeedMph: number | null;
  relativeHumidityPct: number | null;
  updatedAt: string | null;
}

interface WeatherHourlyForecastPayload {
  source: "weather.wsi_hourly_forecasts";
  filters: {
    region: string;
    station: string | null;
    forecastRun: ForecastRun;
    forecastExecutionDate: string | null;
    observedStartDate: string;
    observedEndDate: string;
    forecastStartDate: string;
    forecastEndDate: string;
  };
  availableRegions: string[];
  availableStations: string[];
  availableForecastExecutionDates: string[];
  rows: WeatherHourlyForecastPoint[];
  observedRows: WeatherHourlyObservedPoint[];
  rowCounts: {
    hourlyRows: number;
    observedRows: number;
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

export interface WeatherFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  observedUpdateLabel: string;
  forecastUpdateLabel: string;
  targetDateLabel: string;
  windowLabel: string;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const SOURCE_STYLES: Record<WeatherSource, string> = {
  observed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  forecast: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  both: "border-violet-500/30 bg-violet-500/10 text-violet-200",
};
const SOURCE_HEADER_STYLES: Record<WeatherSource, string> = {
  observed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  forecast: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  both: "border-violet-500/30 bg-violet-500/10 text-violet-200",
};
const VARIABLES: Array<{ key: WeatherVariable; label: string }> = [
  { key: "temperature", label: "Temperature" },
  { key: "dewPoint", label: "Dew Point" },
  { key: "feelsLike", label: "Feels Like" },
];
const STATISTICS: Array<{ key: WeatherStatistic; label: string }> = [
  { key: "minmax", label: "Min/Max" },
  { key: "avg", label: "Avg" },
  { key: "min", label: "Min" },
  { key: "max", label: "Max" },
];
const TEMPERATURE_PLOT_SERIES: PlotSeries[] = [
  { key: "observedTempF", label: "Obs Temperature", color: "#f97316", defaultVisible: true },
  { key: "forecastTempF", label: "Fcst Temperature", color: "#f97316", defaultVisible: true },
  { key: "observedFeelsLikeTempF", label: "Obs Feels Like", color: "#ef4444", defaultVisible: true },
  { key: "forecastFeelsLikeTempF", label: "Fcst Feels Like", color: "#ef4444", defaultVisible: true },
  { key: "observedDewPointF", label: "Obs Dew Point", color: "#38bdf8", defaultVisible: true },
  { key: "forecastDewPointF", label: "Fcst Dew Point", color: "#38bdf8", defaultVisible: true },
  { key: "forecastTempNormalF", label: "Fcst Normal", color: "#94a3b8", defaultVisible: false },
];
const MOISTURE_PLOT_SERIES: PlotSeries[] = [
  { key: "observedRelativeHumidityPct", label: "Obs Humidity", color: "#22c55e", defaultVisible: true },
  { key: "forecastRelativeHumidityPct", label: "Fcst Humidity", color: "#22c55e", defaultVisible: true },
  { key: "observedPrecipIn", label: "Obs Precip", color: "#38bdf8", defaultVisible: true },
  { key: "forecastPrecipIn", label: "Fcst Precip", color: "#38bdf8", defaultVisible: true },
  { key: "forecastProbabilityOfPrecipPct", label: "Fcst POP", color: "#60a5fa", defaultVisible: false },
  { key: "observedCloudCoverPct", label: "Obs Cloud Cover", color: "#a78bfa", defaultVisible: true },
  { key: "forecastCloudCoverPct", label: "Fcst Cloud Cover", color: "#a78bfa", defaultVisible: true },
];
const WIND_SOLAR_PLOT_SERIES: PlotSeries[] = [
  { key: "observedWindSpeedMph", label: "Obs Wind Speed", color: "#facc15", defaultVisible: true },
  { key: "forecastWindSpeedMph", label: "Fcst Wind Speed", color: "#facc15", defaultVisible: true },
  { key: "observedWindDirectionDeg", label: "Obs Wind Dir", color: "#f97316", defaultVisible: false },
  { key: "forecastWindDirectionDeg", label: "Fcst Wind Dir", color: "#f97316", defaultVisible: false },
  { key: "forecastGhiWm2", label: "Fcst GHI", color: "#fb7185", defaultVisible: true },
];
const ALL_FORECAST_PLOT_SERIES = [
  ...TEMPERATURE_PLOT_SERIES,
  ...MOISTURE_PLOT_SERIES,
  ...WIND_SOLAR_PLOT_SERIES,
];

function ControlCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function HeatmapToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={onToggle}
      className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        enabled
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${enabled ? "bg-emerald-300" : "bg-gray-600"}`}
        aria-hidden="true"
      />
      Heatmap
    </button>
  );
}

function WeatherDateControlCard({
  observedStartDate,
  observedEndDate,
  observedLookbackDays,
  maxObservedLookbackDays,
  forecastExecutionDate,
  selectedForecastExecutionDate,
  availableForecastExecutionDates,
  forecastRun,
  intradayUnavailable,
  forecastStartDate,
  forecastEndDate,
  onObservedStartDateChange,
  onObservedEndDateChange,
  onObservedLookbackDaysChange,
  onForecastExecutionDateChange,
  onForecastRunChange,
  onForecastStartDateChange,
  onForecastEndDateChange,
}: {
  observedStartDate: string;
  observedEndDate: string;
  observedLookbackDays: number;
  maxObservedLookbackDays: number;
  forecastExecutionDate: string;
  selectedForecastExecutionDate: string | null | undefined;
  availableForecastExecutionDates: string[] | undefined;
  forecastRun: ForecastRun;
  intradayUnavailable: boolean;
  forecastStartDate: string;
  forecastEndDate: string;
  onObservedStartDateChange: (value: string) => void;
  onObservedEndDateChange: (value: string) => void;
  onObservedLookbackDaysChange: (value: number) => void;
  onForecastExecutionDateChange: (value: string) => void;
  onForecastRunChange: (value: ForecastRun) => void;
  onForecastStartDateChange: (value: string) => void;
  onForecastEndDateChange: (value: string) => void;
}) {
  return (
    <ControlCard
      title="Date"
      subtitle="Forecast dates come from the selected WSI forecast execution"
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Observed Dates
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">
                Start
              </span>
              <input
                type="date"
                value={observedStartDate}
                onChange={(event) => onObservedStartDateChange(event.target.value)}
                className="w-40 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">
                End
              </span>
              <input
                type="date"
                value={observedEndDate}
                onChange={(event) => onObservedEndDateChange(event.target.value)}
                className="w-40 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">
                Lookback
              </span>
              <input
                type="number"
                min={0}
                max={maxObservedLookbackDays}
                value={observedLookbackDays}
                onChange={(event) => {
                  const next = Math.min(
                    Math.max(Number(event.target.value) || 0, 0),
                    maxObservedLookbackDays
                  );
                  onObservedLookbackDaysChange(next);
                }}
                className="w-24 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              />
            </label>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Forecast
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">
                Execution Date
              </span>
              <select
                value={forecastExecutionDate || selectedForecastExecutionDate || ""}
                onChange={(event) => onForecastExecutionDateChange(event.target.value)}
                className="w-44 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              >
                {availableForecastExecutionDates?.length ? (
                  availableForecastExecutionDates.map((date) => (
                    <option key={date} value={date}>
                      {date}
                    </option>
                  ))
                ) : (
                  <option value="">Latest</option>
                )}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">
                Forecast
              </span>
              <select
                value={forecastRun}
                onChange={(event) => onForecastRunChange(event.target.value as ForecastRun)}
                className="w-44 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              >
                <option value="primary">Primary</option>
                <option value="intraday" disabled={intradayUnavailable}>
                  Update{intradayUnavailable ? " unavailable" : ""}
                </option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">
                Forecast Start
              </span>
              <input
                type="date"
                value={forecastStartDate}
                onChange={(event) => onForecastStartDateChange(event.target.value)}
                className="w-40 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">
                Forecast End
              </span>
              <input
                type="date"
                value={forecastEndDate}
                onChange={(event) => onForecastEndDateChange(event.target.value)}
                className="w-40 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              />
            </label>
          </div>
        </div>
      </div>
    </ControlCard>
  );
}

function todayDate(): string {
  const date = new Date();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function offsetDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateDiffDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function buildApiUrl({
  region,
  stations,
  observedLookbackDays,
  observedStartDate,
  observedEndDate,
  forecastRun,
  forecastExecutionDate,
  forecastStartDate,
  forecastEndDate,
  refresh = false,
}: {
  region: string;
  stations: string[];
  observedLookbackDays: number;
  observedStartDate: string;
  observedEndDate: string;
  forecastRun: ForecastRun;
  forecastExecutionDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  refresh?: boolean;
}): string {
  const params = new URLSearchParams({
    region,
    observedLookbackDays: String(observedLookbackDays),
    observedStartDate,
    observedEndDate,
    forecastRun,
  });
  if (forecastExecutionDate) params.set("forecastExecutionDate", forecastExecutionDate);
  params.set("forecastStartDate", forecastStartDate);
  params.set("forecastEndDate", forecastEndDate);
  if (stations.length > 0) params.set("stations", stations.join(","));
  if (refresh) params.set("refresh", "1");
  return `/api/weather/hourly-temps?${params.toString()}`;
}

function buildCacheKey({
  region,
  stations,
  observedLookbackDays,
  observedStartDate,
  observedEndDate,
  forecastRun,
  forecastExecutionDate,
  forecastStartDate,
  forecastEndDate,
}: {
  region: string;
  stations: string[];
  observedLookbackDays: number;
  observedStartDate: string;
  observedEndDate: string;
  forecastRun: ForecastRun;
  forecastExecutionDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
}): string {
  return [
    "api:weather-hourly-temps",
    region,
    stations.join("|") || "all",
    observedLookbackDays,
    observedStartDate,
    observedEndDate,
    forecastRun,
    forecastExecutionDate || "latest",
    forecastStartDate,
    forecastEndDate,
  ].join(":");
}

function buildHourlyForecastApiUrl({
  region,
  station,
  forecastRun,
  forecastExecutionDate,
  observedStartDate,
  observedEndDate,
  forecastStartDate,
  forecastEndDate,
  refresh = false,
}: {
  region: string;
  station: string;
  forecastRun: ForecastRun;
  forecastExecutionDate: string;
  observedStartDate: string;
  observedEndDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  refresh?: boolean;
}): string {
  const params = new URLSearchParams({
    region,
    station,
    forecastRun,
    observedStartDate,
    observedEndDate,
  });
  if (forecastExecutionDate) params.set("forecastExecutionDate", forecastExecutionDate);
  params.set("forecastStartDate", forecastStartDate);
  params.set("forecastEndDate", forecastEndDate);
  if (refresh) params.set("refresh", "1");
  return `/api/weather/hourly-forecast?${params.toString()}`;
}

function buildHourlyForecastCacheKey({
  region,
  station,
  forecastRun,
  forecastExecutionDate,
  observedStartDate,
  observedEndDate,
  forecastStartDate,
  forecastEndDate,
}: {
  region: string;
  station: string;
  forecastRun: ForecastRun;
  forecastExecutionDate: string;
  observedStartDate: string;
  observedEndDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
}): string {
  return [
    "api:weather-hourly-forecast",
    region,
    station || "default",
    forecastRun,
    forecastExecutionDate || "latest",
    observedStartDate,
    observedEndDate,
    forecastStartDate,
    forecastEndDate,
  ].join(":");
}

function fmtTemp(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return Math.round(value).toString();
}

function fmtDiff(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

function getValues(
  item: DailyTempCell | TempSummary | undefined,
  variable: WeatherVariable
): { min: number | null; max: number | null; avg: number | null } {
  if (!item) return { min: null, max: null, avg: null };
  if (variable === "dewPoint") {
    return {
      min: item.minDewPointF,
      max: item.maxDewPointF,
      avg: item.avgDewPointF,
    };
  }
  if (variable === "feelsLike") {
    return {
      min: item.minFeelsLikeTempF,
      max: item.maxFeelsLikeTempF,
      avg: item.avgFeelsLikeTempF,
    };
  }
  return {
    min: item.minTempF,
    max: item.maxTempF,
    avg: item.avgTempF,
  };
}

function fmtCellValue(
  cell: DailyTempCell | undefined,
  variable: WeatherVariable,
  statistic: WeatherStatistic
): string {
  const values = getValues(cell, variable);
  if (statistic === "avg") return fmtTemp(values.avg);
  if (statistic === "min") return fmtTemp(values.min);
  if (statistic === "max") return fmtTemp(values.max);
  return `${fmtTemp(values.min)}/${fmtTemp(values.max)}`;
}

function getDiffValue(cell: DailyTempCell | undefined, statistic: WeatherStatistic): number | null {
  const forecast = cell?.forecast;
  if (!forecast) return null;
  if (statistic === "avg") return forecast.avgTempDiffF;
  if (statistic === "min") return forecast.minTempDiffF;
  if (statistic === "max") return forecast.maxTempDiffF;
  return forecast.avgTempDiffF;
}

function fmtDiffLine(cell: DailyTempCell | undefined, statistic: WeatherStatistic): string {
  const forecast = cell?.forecast;
  if (!forecast) return "";
  if (statistic === "minmax") {
    const min = fmtDiff(forecast.minTempDiffF);
    const max = fmtDiff(forecast.maxTempDiffF);
    if (!min && !max) return "";
    return `${min || "-"}/${max || "-"}`;
  }
  return fmtDiff(getDiffValue(cell, statistic));
}

function diffTextClass(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value === 0) return "text-gray-500";
  return value > 0 ? "text-red-300" : "text-blue-300";
}

function fmtSummaryValue(
  summary: TempSummary | undefined,
  variable: WeatherVariable,
  statistic: WeatherStatistic
): string {
  const values = getValues(summary, variable);
  if (statistic === "avg") return fmtTemp(values.avg);
  if (statistic === "min") return fmtTemp(values.min);
  if (statistic === "max") return fmtTemp(values.max);
  return `${fmtTemp(values.min)}/${fmtTemp(values.max)}`;
}

function fmtStamp(value: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function dateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function dayLabel(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
}

function sourceLabel(source: WeatherSource): string {
  if (source === "observed") return "Obs";
  if (source === "forecast") return "Fcst";
  return "Both";
}

function chartTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ");
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
  }).format(date);
}

function toTitle(cell: DailyTempCell | undefined): string | undefined {
  if (!cell) return undefined;
  const parts = [
    cell.observed
      ? `Observed ${fmtSummaryValue(cell.observed, "temperature", "minmax")} F, avg ${fmtTemp(cell.observed.avgTempF)} F, ${cell.observed.hourlyCount} hrs`
      : null,
    cell.forecast
      ? `Forecast ${fmtSummaryValue(cell.forecast, "temperature", "minmax")} F, avg ${fmtTemp(cell.forecast.avgTempF)} F, ${cell.forecast.hourlyCount} hrs`
      : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

function collectTempRange(
  payload: WeatherHourlyTempsPayload | null,
  variable: WeatherVariable
): { min: number; max: number } {
  if (!payload) return { min: 0, max: 0 };
  const values: number[] = [];
  for (const station of payload.stations) {
    for (const cell of Object.values(station.cells)) {
      const metricValues = getValues(cell, variable);
      if (metricValues.min !== null) values.push(metricValues.min);
      if (metricValues.max !== null) values.push(metricValues.max);
    }
  }
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function wsiHeatStyle(
  cell: DailyTempCell | undefined,
  variable: WeatherVariable,
  min: number,
  max: number
): CSSProperties {
  const value = getValues(cell, variable).avg;
  if (value === null || min === max) return { backgroundColor: "#111827" };

  const ratio = (value - min) / (max - min);
  const cool = [37, 99, 235];
  const warm = [239, 68, 68];

  if (ratio < 0.5) {
    const strength = (0.5 - ratio) / 0.5;
    const alpha = 0.1 + strength * 0.34;
    return {
      backgroundColor: `rgba(${cool.join(", ")}, ${alpha})`,
      boxShadow: `inset 0 2px 0 rgba(${cool.join(", ")}, ${0.25 + strength * 0.45})`,
    };
  }

  const strength = (ratio - 0.5) / 0.5;
  const alpha = 0.1 + strength * 0.34;
  return {
    backgroundColor: `rgba(${warm.join(", ")}, ${alpha})`,
    boxShadow: `inset 0 2px 0 rgba(${warm.join(", ")}, ${0.25 + strength * 0.45})`,
  };
}

function buildFreshnessSummary(
  payload: WeatherHourlyTempsPayload | null,
  loading: boolean,
  error: string | null,
  observedEndDate: string
): WeatherFreshnessSummary {
  if (error) {
    return {
      status: "Error",
      statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
      summary: "Weather data failed to load",
      observedUpdateLabel: "--",
      forecastUpdateLabel: "--",
      targetDateLabel: observedEndDate,
      windowLabel: "--",
    };
  }

  if (loading && !payload) {
    return {
      status: "Loading",
      statusClass: "border-amber-500/40 bg-amber-500/10 text-amber-200",
      summary: "Loading WSI weather",
      observedUpdateLabel: "--",
      forecastUpdateLabel: "--",
      targetDateLabel: observedEndDate,
      windowLabel: "--",
    };
  }

  if (!payload) {
    return {
      status: "Unknown",
      statusClass: "border-gray-700 bg-gray-900 text-gray-400",
      summary: "WSI weather --",
      observedUpdateLabel: "--",
      forecastUpdateLabel: "--",
      targetDateLabel: observedEndDate,
      windowLabel: "--",
    };
  }

  const hasBothSources = Boolean(payload.asOf.observed && payload.asOf.forecast);
  const status = observedEndDate === todayDate() ? (hasBothSources ? "Current" : "Partial") : "Selected";
  return {
    status,
    statusClass:
      status === "Current"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
        : status === "Partial"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
          : "border-sky-500/40 bg-sky-500/10 text-sky-200",
    summary: `Obs ${fmtStamp(payload.asOf.observed)} | Fcst ${fmtStamp(payload.asOf.forecast)}`,
    observedUpdateLabel: fmtStamp(payload.asOf.observed),
    forecastUpdateLabel: fmtStamp(payload.asOf.forecast),
    targetDateLabel: payload.filters.observedEndDate,
    windowLabel: `Obs ${payload.filters.observedStartDate} to ${payload.filters.observedEndDate} | Fcst ${payload.filters.forecastStartDate} to ${payload.filters.forecastEndDate}`,
  };
}

export default function WeatherHourlyTemps({
  refreshToken = 0,
  onFreshnessChange,
}: {
  refreshToken?: number;
  onFreshnessChange?: (freshness: WeatherFreshnessSummary) => void;
}) {
  const [activeTab, setActiveTab] = useState<WeatherTab>("forecast-map");
  const [region, setRegion] = useState("PJM");
  const [selectedStations, setSelectedStations] = useState<string[]>(["PJM"]);
  const [observedEndDate, setObservedEndDate] = useState(() => todayDate());
  const [observedLookbackDays, setObservedLookbackDays] = useState(3);
  const [observedStartDate, setObservedStartDate] = useState(() => offsetDate(todayDate(), -3));
  const [forecastExecutionDate, setForecastExecutionDate] = useState("");
  const [forecastStartDate, setForecastStartDate] = useState("");
  const [forecastEndDate, setForecastEndDate] = useState("");
  const [forecastRun, setForecastRun] = useState<ForecastRun>("primary");
  const [variable, setVariable] = useState<WeatherVariable>("temperature");
  const [statistic, setStatistic] = useState<WeatherStatistic>("minmax");
  const [payload, setPayload] = useState<WeatherHourlyTempsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heatmapEnabled, setHeatmapEnabled] = useState(true);
  const [hourlyRegion, setHourlyRegion] = useState("PJM");
  const [hourlyStation, setHourlyStation] = useState("PJM");
  const [hourlyForecastExecutionDate, setHourlyForecastExecutionDate] = useState("");
  const [hourlyForecastRun, setHourlyForecastRun] = useState<ForecastRun>("primary");
  const [hourlyObservedStartDate, setHourlyObservedStartDate] = useState(() => offsetDate(todayDate(), -3));
  const [hourlyObservedEndDate, setHourlyObservedEndDate] = useState(() => todayDate());
  const [hourlyObservedLookbackDays, setHourlyObservedLookbackDays] = useState(3);
  const [hourlyForecastStartDate, setHourlyForecastStartDate] = useState("");
  const [hourlyForecastEndDate, setHourlyForecastEndDate] = useState("");
  const [hourlyPayload, setHourlyPayload] = useState<WeatherHourlyForecastPayload | null>(null);
  const [hourlyLoading, setHourlyLoading] = useState(true);
  const [hourlyError, setHourlyError] = useState<string | null>(null);
  const [hiddenHourlySeries, setHiddenHourlySeries] = useState<Set<string>>(
    () =>
      new Set(
        ALL_FORECAST_PLOT_SERIES
          .filter((series) => series.defaultVisible === false)
          .map((series) => series.key)
      )
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const forceRefresh = refreshToken > 0;

    setLoading(true);
    setError(null);

    fetchJsonWithCache<WeatherHourlyTempsPayload>({
      key: buildCacheKey({
        region,
        stations: selectedStations,
        observedLookbackDays,
        observedStartDate,
        observedEndDate,
        forecastRun,
        forecastExecutionDate,
        forecastStartDate,
        forecastEndDate,
      }),
      url: buildApiUrl({
        region,
        stations: selectedStations,
        observedLookbackDays,
        observedStartDate,
        observedEndDate,
        forecastRun,
        forecastExecutionDate,
        forecastStartDate,
        forecastEndDate,
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
        if (!forecastStartDate && data.filters.forecastStartDate) {
          setForecastStartDate(data.filters.forecastStartDate);
        }
        if (!forecastEndDate && data.filters.forecastEndDate) {
          setForecastEndDate(data.filters.forecastEndDate);
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to fetch weather data");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    region,
    selectedStations,
    observedLookbackDays,
    observedStartDate,
    observedEndDate,
    forecastRun,
    forecastExecutionDate,
    forecastStartDate,
    forecastEndDate,
    refreshToken,
  ]);

  useEffect(() => {
    if (activeTab !== "hourly-forecast") return;

    const controller = new AbortController();
    let active = true;
    const forceRefresh = refreshToken > 0;

    setHourlyLoading(true);
    setHourlyError(null);

    fetchJsonWithCache<WeatherHourlyForecastPayload>({
      key: buildHourlyForecastCacheKey({
        region: hourlyRegion,
        station: hourlyStation,
        forecastRun: hourlyForecastRun,
        forecastExecutionDate: hourlyForecastExecutionDate,
        observedStartDate: hourlyObservedStartDate,
        observedEndDate: hourlyObservedEndDate,
        forecastStartDate: hourlyForecastStartDate,
        forecastEndDate: hourlyForecastEndDate,
      }),
      url: buildHourlyForecastApiUrl({
        region: hourlyRegion,
        station: hourlyStation,
        forecastRun: hourlyForecastRun,
        forecastExecutionDate: hourlyForecastExecutionDate,
        observedStartDate: hourlyObservedStartDate,
        observedEndDate: hourlyObservedEndDate,
        forecastStartDate: hourlyForecastStartDate,
        forecastEndDate: hourlyForecastEndDate,
        refresh: forceRefresh,
      }),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
    })
      .then((data) => {
        if (!active) return;
        setHourlyPayload(data);
        if (data.filters.station && data.filters.station !== hourlyStation) {
          setHourlyStation(data.filters.station);
        }
        if (data.filters.observedStartDate !== hourlyObservedStartDate) {
          setHourlyObservedStartDate(data.filters.observedStartDate);
        }
        if (data.filters.observedEndDate !== hourlyObservedEndDate) {
          setHourlyObservedEndDate(data.filters.observedEndDate);
        }
        if (!hourlyForecastStartDate && data.filters.forecastStartDate) {
          setHourlyForecastStartDate(data.filters.forecastStartDate);
        }
        if (!hourlyForecastEndDate && data.filters.forecastEndDate) {
          setHourlyForecastEndDate(data.filters.forecastEndDate);
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setHourlyError(err instanceof Error ? err.message : "Failed to fetch hourly forecast");
      })
      .finally(() => {
        if (active) setHourlyLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    activeTab,
    hourlyRegion,
    hourlyStation,
    hourlyForecastRun,
    hourlyForecastExecutionDate,
    hourlyObservedStartDate,
    hourlyObservedEndDate,
    hourlyForecastStartDate,
    hourlyForecastEndDate,
    refreshToken,
  ]);

  useEffect(() => {
    onFreshnessChange?.(buildFreshnessSummary(payload, loading, error, observedEndDate));
  }, [error, loading, observedEndDate, onFreshnessChange, payload]);

  useEffect(() => {
    if (
      forecastRun === "intraday" &&
      payload?.forecastExecution &&
      !payload.forecastExecution.intradayAvailable
    ) {
      setForecastRun("primary");
    }
  }, [forecastRun, payload]);

  useEffect(() => {
    if (
      hourlyForecastRun === "intraday" &&
      hourlyPayload?.forecastExecution &&
      !hourlyPayload.forecastExecution.intradayAvailable
    ) {
      setHourlyForecastRun("primary");
    }
  }, [hourlyForecastRun, hourlyPayload]);

  const tempRange = useMemo(() => collectTempRange(payload, variable), [payload, variable]);
  const regionOptions = payload?.availableRegions.length ? payload.availableRegions : [region];
  const stationOptions = payload?.availableStations.length
    ? payload.availableStations
    : selectedStations;
  const selectedStationSet = useMemo(() => new Set(selectedStations), [selectedStations]);
  const intradayUnavailable = Boolean(payload && !payload.forecastExecution.intradayAvailable);
  const stationRows = useMemo(() => {
    if (!payload) return [];
    return payload.stations.filter((station) => selectedStationSet.has(station.stationName));
  }, [payload, selectedStationSet]);
  const hourlyRegionOptions = hourlyPayload?.availableRegions.length
    ? hourlyPayload.availableRegions
    : [hourlyRegion];
  const hourlyStationOptions = hourlyPayload?.availableStations.length
    ? hourlyPayload.availableStations
    : [hourlyStation].filter(Boolean);
  const hourlyIntradayUnavailable = Boolean(
    hourlyPayload && !hourlyPayload.forecastExecution.intradayAvailable
  );
  const hourlyChartData = useMemo(() => {
    const forecastByTime = new Map(
      (hourlyPayload?.rows ?? []).map((row) => [row.localTime, row])
    );
    const observedByTime = new Map(
      (hourlyPayload?.observedRows ?? []).map((row) => [row.localTime, row])
    );
    const times = Array.from(
      new Set([...forecastByTime.keys(), ...observedByTime.keys()])
    ).sort();

    return times.map((localTime) => {
      const forecast = forecastByTime.get(localTime);
      const observed = observedByTime.get(localTime);
      return {
        localTime,
        label: chartTimeLabel(localTime),
        observedTempF: observed?.tempF ?? null,
        forecastTempF: forecast?.tempF ?? null,
        observedFeelsLikeTempF: observed?.feelsLikeTempF ?? null,
        forecastFeelsLikeTempF: forecast?.feelsLikeTempF ?? null,
        observedDewPointF: observed?.dewPointF ?? null,
        forecastDewPointF: forecast?.dewPointF ?? null,
        forecastTempNormalF: forecast?.tempNormalF ?? null,
        observedRelativeHumidityPct: observed?.relativeHumidityPct ?? null,
        forecastRelativeHumidityPct: forecast?.relativeHumidityPct ?? null,
        observedPrecipIn: observed?.precipIn ?? null,
        forecastPrecipIn: forecast?.precipIn ?? null,
        forecastProbabilityOfPrecipPct: forecast?.probabilityOfPrecipPct ?? null,
        observedCloudCoverPct: observed?.cloudCoverPct ?? null,
        forecastCloudCoverPct: forecast?.cloudCoverPct ?? null,
        observedWindSpeedMph: observed?.windSpeedMph ?? null,
        forecastWindSpeedMph: forecast?.windSpeedMph ?? null,
        observedWindDirectionDeg: observed?.windDirectionDeg ?? null,
        forecastWindDirectionDeg: forecast?.windDirectionDeg ?? null,
        forecastGhiWm2: forecast?.ghiWm2 ?? null,
      };
    });
  }, [hourlyPayload]);

  const toggleHourlySeries = (key: string) => {
    setHiddenHourlySeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const showHourlySeries = (series: PlotSeries[]) => {
    setHiddenHourlySeries((prev) => {
      const next = new Set(prev);
      for (const item of series) next.delete(item.key);
      return next;
    });
  };

  const hideHourlySeries = (series: PlotSeries[]) => {
    setHiddenHourlySeries((prev) => {
      const next = new Set(prev);
      for (const item of series) next.add(item.key);
      return next;
    });
  };

  const renderForecastChart = (series: PlotSeries[], heightClass: string) => (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={hourlyChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
            width={44}
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
          {series.map(
            (item) =>
              !hiddenHourlySeries.has(item.key) && (
                <Line
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  name={item.label}
                  stroke={item.color}
                  strokeWidth={2}
                  strokeDasharray={item.key.startsWith("forecast") ? "5 4" : undefined}
                  dot={false}
                  connectNulls
                />
              )
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="space-y-4">
      <div
        className="inline-flex rounded-lg border border-gray-800 bg-[#12141d] p-1 shadow-xl shadow-black/20"
        role="tablist"
        aria-label="Weather views"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "forecast-map"}
          onClick={() => setActiveTab("forecast-map")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "forecast-map"
              ? "bg-gray-800 text-white"
              : "text-gray-500 hover:bg-gray-900 hover:text-gray-300"
          }`}
        >
          Forecast Map
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "hourly-forecast"}
          onClick={() => setActiveTab("hourly-forecast")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "hourly-forecast"
              ? "bg-gray-800 text-white"
              : "text-gray-500 hover:bg-gray-900 hover:text-gray-300"
          }`}
        >
          Hourly Forecast
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "daily-summary"}
          onClick={() => setActiveTab("daily-summary")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "daily-summary"
              ? "bg-gray-800 text-white"
              : "text-gray-500 hover:bg-gray-900 hover:text-gray-300"
          }`}
        >
          Daily Summary
        </button>
      </div>

      {activeTab === "forecast-map" && <WsiForecastMap refreshToken={refreshToken} />}

      {activeTab === "daily-summary" && (
        <>
      <WeatherDateControlCard
        observedStartDate={observedStartDate}
        observedEndDate={observedEndDate}
        observedLookbackDays={observedLookbackDays}
        maxObservedLookbackDays={60}
        forecastExecutionDate={forecastExecutionDate}
        selectedForecastExecutionDate={payload?.forecastExecution.executionDate}
        availableForecastExecutionDates={payload?.availableForecastExecutionDates}
        forecastRun={forecastRun}
        intradayUnavailable={intradayUnavailable}
        forecastStartDate={forecastStartDate}
        forecastEndDate={forecastEndDate}
        onObservedStartDateChange={(value) => {
          const next = value || observedStartDate;
          setObservedStartDate(next);
          setObservedLookbackDays(dateDiffDays(next, observedEndDate));
        }}
        onObservedEndDateChange={(value) => {
          const next = value || observedEndDate;
          setObservedEndDate(next);
          setObservedStartDate(offsetDate(next, -observedLookbackDays));
        }}
        onObservedLookbackDaysChange={(value) => {
          setObservedLookbackDays(value);
          setObservedStartDate(offsetDate(observedEndDate, -value));
        }}
        onForecastExecutionDateChange={(value) => {
          setForecastExecutionDate(value);
          setForecastStartDate("");
          setForecastEndDate("");
        }}
        onForecastRunChange={(value) => {
          setForecastRun(value);
          setForecastStartDate("");
          setForecastEndDate("");
        }}
        onForecastStartDateChange={setForecastStartDate}
        onForecastEndDateChange={setForecastEndDate}
      />

      <ControlCard
        title="Region"
        subtitle={payload ? `${payload.rowCounts.stationCount.toLocaleString()} stations loaded` : undefined}
      >
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Region
              </span>
              <select
                value={region}
                onChange={(event) => {
                  setRegion(event.target.value);
                  setSelectedStations(["PJM"]);
                }}
                className="w-40 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
              >
                {regionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <MultiSelect
              label="Stations"
              options={stationOptions}
              selected={selectedStations}
              onChange={(values) => setSelectedStations(values.length ? values : ["PJM"])}
              placeholder="Select stations"
              width="w-80"
            />
          </div>
      </ControlCard>

      <ControlCard title="Metric" subtitle="Daily cell value">
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Variable
            </p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Weather variable">
              {VARIABLES.map((option) => {
                const selected = variable === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setVariable(option.key)}
                    className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                      selected
                        ? "border-sky-500/50 bg-sky-500/10 text-white"
                        : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Statistic
            </p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Weather statistic">
            {STATISTICS.map((option) => {
              const selected = statistic === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setStatistic(option.key)}
                  className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                    selected
                      ? "border-sky-500/50 bg-sky-500/10 text-white"
                      : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
            </div>
          </div>
        </div>
      </ControlCard>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Daily Summary</h2>
            <p className="mt-1 text-xs text-gray-500">
              {payload
                ? `${payload.filters.observedStartDate} through ${payload.filters.forecastEndDate}`
                : "Observed and forecast daily temperatures"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["observed", "forecast", "both"] as WeatherSource[]).map((source) => (
              <span
                key={source}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${SOURCE_STYLES[source]}`}
              >
                {sourceLabel(source)}
              </span>
            ))}
            <HeatmapToggle
              enabled={heatmapEnabled}
              onToggle={() => setHeatmapEnabled((enabled) => !enabled)}
            />
          </div>
        </div>

        {loading && !payload ? (
          <div className="rounded-md border border-gray-800 bg-gray-950/40 p-5 text-sm text-gray-500">
            Loading weather summaries...
          </div>
        ) : payload && stationRows.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-gray-800 bg-[#0d1119]">
            <table className="w-full min-w-[920px] border-collapse bg-[#0d1119] text-[10px] text-gray-200">
              <thead className="bg-gray-950 text-gray-400">
                <tr>
                  <th className="sticky left-0 z-30 w-40 border border-gray-800 bg-gray-950 px-2 py-1 text-left font-semibold uppercase tracking-wide">
                    Station
                  </th>
                  {payload.dates.map((date) => (
                    <th
                      key={date.date}
                      className={`min-w-16 border px-1 py-1 text-center font-semibold uppercase tracking-wide ${SOURCE_HEADER_STYLES[date.source]}`}
                    >
                      <span className="block text-gray-100">{dateLabel(date.date)}</span>
                      <span className="block text-[9px] opacity-70">{dayLabel(date.date)}</span>
                      <span className="mt-0.5 block text-[8px] font-bold tracking-widest opacity-90">
                        {sourceLabel(date.source)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stationRows.map((station) => (
                  <tr key={station.stationName}>
                    <td className="sticky left-0 z-20 border border-gray-800 bg-gray-950 px-2 py-1 font-medium text-gray-100">
                      <span className="block truncate">{station.stationName}</span>
                      <span className="block text-[9px] font-normal text-gray-500">
                        {station.siteId ?? "-"}
                      </span>
                    </td>
                    {payload.dates.map((date) => {
                      const cell = station.cells[date.date];
                      const diffValue = getDiffValue(cell, statistic);
                      const diffLine = fmtDiffLine(cell, statistic);
                      return (
                        <td
                          key={date.date}
                          title={toTitle(cell)}
                          className="border border-gray-800 px-1 py-0.5 text-center tabular-nums"
                          style={
                            heatmapEnabled
                              ? wsiHeatStyle(cell, variable, tempRange.min, tempRange.max)
                              : { backgroundColor: cell ? "#111827" : "#0f172a" }
                          }
                        >
                          {cell ? (
                            <>
                              <div className="font-bold leading-3 text-gray-100">
                                {fmtCellValue(cell, variable, statistic)}
                              </div>
                              {cell.source === "both" && cell.forecast && variable === "temperature" && (
                                <div className="text-[8px] leading-3 text-gray-400">
                                  Fcst {fmtSummaryValue(cell.forecast, variable, statistic)}
                                </div>
                              )}
                              {diffLine && variable === "temperature" && (
                                <div className={`text-[8px] font-semibold leading-3 ${diffTextClass(diffValue)}`}>
                                  {diffLine}
                                </div>
                              )}
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-gray-800 bg-gray-950/40 p-5 text-sm text-gray-500">
            No WSI hourly temperature rows match the selected filters.
          </div>
        )}
      </section>
        </>
      )}

      {activeTab === "hourly-forecast" && (
        <>
          <WeatherDateControlCard
            observedStartDate={hourlyObservedStartDate}
            observedEndDate={hourlyObservedEndDate}
            observedLookbackDays={hourlyObservedLookbackDays}
            maxObservedLookbackDays={60}
            forecastExecutionDate={hourlyForecastExecutionDate}
            selectedForecastExecutionDate={hourlyPayload?.forecastExecution.executionDate}
            availableForecastExecutionDates={hourlyPayload?.availableForecastExecutionDates}
            forecastRun={hourlyForecastRun}
            intradayUnavailable={hourlyIntradayUnavailable}
            forecastStartDate={hourlyForecastStartDate}
            forecastEndDate={hourlyForecastEndDate}
            onObservedStartDateChange={(value) => {
              const next = value || hourlyObservedStartDate;
              setHourlyObservedStartDate(next);
              setHourlyObservedLookbackDays(dateDiffDays(next, hourlyObservedEndDate));
            }}
            onObservedEndDateChange={(value) => {
              const next = value || hourlyObservedEndDate;
              setHourlyObservedEndDate(next);
              setHourlyObservedStartDate(offsetDate(next, -hourlyObservedLookbackDays));
            }}
            onObservedLookbackDaysChange={(value) => {
              setHourlyObservedLookbackDays(value);
              setHourlyObservedStartDate(offsetDate(hourlyObservedEndDate, -value));
            }}
            onForecastExecutionDateChange={(value) => {
              setHourlyForecastExecutionDate(value);
              setHourlyForecastStartDate("");
              setHourlyForecastEndDate("");
            }}
            onForecastRunChange={(value) => {
              setHourlyForecastRun(value);
              setHourlyForecastStartDate("");
              setHourlyForecastEndDate("");
            }}
            onForecastStartDateChange={setHourlyForecastStartDate}
            onForecastEndDateChange={setHourlyForecastEndDate}
          />

          <ControlCard
            title="Region"
            subtitle={
              hourlyPayload
                ? `${hourlyPayload.availableStations.length.toLocaleString()} stations available`
                : undefined
            }
          >
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Region
                </span>
                <select
                  value={hourlyRegion}
                  onChange={(event) => {
                    setHourlyRegion(event.target.value);
                    setHourlyStation("PJM");
                  }}
                  className="w-40 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                >
                  {hourlyRegionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Station
                </span>
                <select
                  value={hourlyStation}
                  onChange={(event) => setHourlyStation(event.target.value)}
                  className="w-80 max-w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
                >
                  {hourlyStationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </ControlCard>

          {hourlyError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {hourlyError}
            </div>
          )}

          {hourlyLoading && !hourlyPayload ? (
            <div className="rounded-lg border border-gray-800 bg-[#12141d] p-5 text-sm text-gray-500 shadow-xl shadow-black/20">
              Loading hourly forecast...
            </div>
          ) : (
            <div className="space-y-4">
              <PlotCard
                title="Temperature Forecast"
                subtitle="Temperature, feels-like, dew point, and normal"
                series={TEMPERATURE_PLOT_SERIES}
                hiddenSeries={hiddenHourlySeries}
                onToggleSeries={toggleHourlySeries}
                onShowAll={() => showHourlySeries(TEMPERATURE_PLOT_SERIES)}
                onHideAll={() => hideHourlySeries(TEMPERATURE_PLOT_SERIES)}
                focusedChildren={renderForecastChart(TEMPERATURE_PLOT_SERIES, "h-[70vh]")}
              >
                {renderForecastChart(TEMPERATURE_PLOT_SERIES, "h-[340px]")}
              </PlotCard>
              <PlotCard
                title="Moisture And Clouds"
                subtitle="Relative humidity, precipitation probability, and cloud cover"
                series={MOISTURE_PLOT_SERIES}
                hiddenSeries={hiddenHourlySeries}
                onToggleSeries={toggleHourlySeries}
                onShowAll={() => showHourlySeries(MOISTURE_PLOT_SERIES)}
                onHideAll={() => hideHourlySeries(MOISTURE_PLOT_SERIES)}
                focusedChildren={renderForecastChart(MOISTURE_PLOT_SERIES, "h-[70vh]")}
              >
                {renderForecastChart(MOISTURE_PLOT_SERIES, "h-[340px]")}
              </PlotCard>
              <PlotCard
                title="Wind And Irradiance"
                subtitle="Surface wind, wind direction, and GHI"
                series={WIND_SOLAR_PLOT_SERIES}
                hiddenSeries={hiddenHourlySeries}
                onToggleSeries={toggleHourlySeries}
                onShowAll={() => showHourlySeries(WIND_SOLAR_PLOT_SERIES)}
                onHideAll={() => hideHourlySeries(WIND_SOLAR_PLOT_SERIES)}
                focusedChildren={renderForecastChart(WIND_SOLAR_PLOT_SERIES, "h-[70vh]")}
              >
                {renderForecastChart(WIND_SOLAR_PLOT_SERIES, "h-[340px]")}
              </PlotCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}
