"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import DataTableShell from "@/components/dashboard/DataTableShell";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import {
  EIA_GENERATION_FUEL_COLORS,
  EIA_GENERATION_PAGE_TABS,
  EIA_GENERATION_REGIONS,
  EIA_GENERATION_SEASON_OPTIONS,
  EIA_GENERATION_SOURCE_TABLE,
  getEiaGenerationRegion,
  type EiaGenerationDailyRow,
  type EiaGenerationMetricKey,
  type EiaGenerationPayload,
  type EiaGenerationPageTab,
  type EiaGenerationRegion,
  type EiaGenerationSeason,
  type EiaGenerationWeatherSeasonData,
  type EiaGenerationYoyMetricKey,
} from "@/lib/eiaGeneration";

export interface EiaGenerationFreshnessSummary {
  status: string;
  statusClass: string;
  summary: string;
  targetDateLabel: string;
  latestDateLabel: string;
  latestUpdateLabel: string;
}

interface EiaGenerationDashboardProps {
  refreshToken?: number;
  onFreshnessChange?: (freshness: EiaGenerationFreshnessSummary) => void;
}

interface YoyChartRow {
  monthDay: string;
  current: number | null;
  prior: number | null;
}

interface MonthlyDeltaRow {
  month: string;
  delta: number | null;
}

interface MonthlyAverageRow {
  month: string;
  currentDemandMw: number | null;
  priorDemandMw: number | null;
  demandDeltaMw: number | null;
  currentNetGenerationMw: number | null;
  gasMw: number | null;
  coalMw: number | null;
  windMw: number | null;
  solarMw: number | null;
  gasThermalPct: number | null;
  renewableSharePct: number | null;
}

interface MtdMetricRow {
  key: "demand" | "net" | "gas" | "coal" | "wind" | "solar" | "gasThermal";
  label: string;
  unit: "mw" | "pct";
  color: string;
  current: number | null;
  prior: number | null;
  delta: number | null;
}

interface RegionalModelRow {
  label: string;
  value: string;
  detail: string;
  tone: "demand" | "thermal" | EiaGenerationMetricKey;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_REGION: EiaGenerationRegion = "US48";
const DEFAULT_SEASON: EiaGenerationSeason = "summer";
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_TICKS = MONTH_LABELS.map((_, index) => `${String(index + 1).padStart(2, "0")}-01`);
const TABLE_COLUMNS: Array<{
  key: keyof EiaGenerationDailyRow | "gasPct" | "coalPct";
  label: string;
  align: "left" | "right";
  tone?: EiaGenerationMetricKey | "thermal" | "net" | "demand";
  kind: "date" | "mw" | "pct";
}> = [
  { key: "date", label: "Date", align: "left", kind: "date" },
  { key: "demandMw", label: "Demand", align: "right", tone: "demand", kind: "mw" },
  { key: "netGenerationMw", label: "Net Gen", align: "right", tone: "net", kind: "mw" },
  { key: "gasMw", label: "Gas", align: "right", tone: "gas", kind: "mw" },
  { key: "coalMw", label: "Coal", align: "right", tone: "coal", kind: "mw" },
  { key: "nukeMw", label: "Nuke", align: "right", tone: "nuke", kind: "mw" },
  { key: "hydroMw", label: "Hydro", align: "right", tone: "hydro", kind: "mw" },
  { key: "windMw", label: "Wind", align: "right", tone: "wind", kind: "mw" },
  { key: "solarMw", label: "Solar", align: "right", tone: "solar", kind: "mw" },
  { key: "otherMw", label: "Other", align: "right", tone: "other", kind: "mw" },
  { key: "gasSharePct", label: "Gas %", align: "right", tone: "gas", kind: "pct" },
  { key: "gasThermalPct", label: "Gas % of Thermal", align: "right", tone: "gas", kind: "pct" },
  { key: "thermalSharePct", label: "Thermal %", align: "right", tone: "thermal", kind: "pct" },
  { key: "coalSharePct", label: "Coal %", align: "right", tone: "coal", kind: "pct" },
  { key: "nukeSharePct", label: "Nuke %", align: "right", tone: "nuke", kind: "pct" },
  { key: "hydroSharePct", label: "Hydro %", align: "right", tone: "hydro", kind: "pct" },
  { key: "windSharePct", label: "Wind %", align: "right", tone: "wind", kind: "pct" },
  { key: "solarSharePct", label: "Solar %", align: "right", tone: "solar", kind: "pct" },
  { key: "otherSharePct", label: "Other %", align: "right", tone: "other", kind: "pct" },
];

const YOY_METRICS: Array<{
  key: EiaGenerationYoyMetricKey;
  label: string;
  unit: "mw" | "pct";
  color: string;
  showMonthlyDelta: boolean;
}> = [
  { key: "gasMw", label: "Gas Gen (MW)", unit: "mw", color: EIA_GENERATION_FUEL_COLORS.gas, showMonthlyDelta: true },
  { key: "gasThermalPct", label: "Gas % of Thermal", unit: "pct", color: EIA_GENERATION_FUEL_COLORS.gas, showMonthlyDelta: false },
  { key: "coalMw", label: "Coal Gen (MW)", unit: "mw", color: EIA_GENERATION_FUEL_COLORS.coal, showMonthlyDelta: true },
  { key: "coalThermalPct", label: "Coal % of Thermal", unit: "pct", color: EIA_GENERATION_FUEL_COLORS.coal, showMonthlyDelta: false },
  { key: "windMw", label: "Wind Gen (MW)", unit: "mw", color: EIA_GENERATION_FUEL_COLORS.wind, showMonthlyDelta: true },
  { key: "windSharePct", label: "Wind % of Total", unit: "pct", color: EIA_GENERATION_FUEL_COLORS.wind, showMonthlyDelta: false },
  { key: "solarMw", label: "Solar Gen (MW)", unit: "mw", color: EIA_GENERATION_FUEL_COLORS.solar, showMonthlyDelta: true },
  { key: "solarSharePct", label: "Solar % of Total", unit: "pct", color: EIA_GENERATION_FUEL_COLORS.solar, showMonthlyDelta: false },
];

const MONTHLY_AVERAGE_COLUMNS: Array<{
  key: keyof MonthlyAverageRow;
  label: string;
  kind: "text" | "mw" | "pct" | "delta";
}> = [
  { key: "month", label: "Month", kind: "text" },
  { key: "currentDemandMw", label: "Demand", kind: "mw" },
  { key: "priorDemandMw", label: "Prior Demand", kind: "mw" },
  { key: "demandDeltaMw", label: "Demand YoY", kind: "delta" },
  { key: "currentNetGenerationMw", label: "Net Gen", kind: "mw" },
  { key: "gasMw", label: "Gas", kind: "mw" },
  { key: "coalMw", label: "Coal", kind: "mw" },
  { key: "windMw", label: "Wind", kind: "mw" },
  { key: "solarMw", label: "Solar", kind: "mw" },
  { key: "gasThermalPct", label: "Gas % Thermal", kind: "pct" },
  { key: "renewableSharePct", label: "Renewable %", kind: "pct" },
];

const TONE_TEXT_CLASSES: Record<EiaGenerationMetricKey | "thermal" | "net" | "demand", string> = {
  gas: "text-amber-300",
  coal: "text-gray-300",
  nuke: "text-indigo-300",
  hydro: "text-blue-300",
  wind: "text-cyan-300",
  solar: "text-yellow-300",
  other: "text-purple-300",
  thermal: "text-orange-200",
  net: "text-gray-200",
  demand: "text-sky-300",
};

function initialRegionFromLocation(): EiaGenerationRegion {
  if (typeof window === "undefined") return DEFAULT_REGION;
  return getEiaGenerationRegion(new URLSearchParams(window.location.search).get("region")).key;
}

function parseSeason(value: string | null): EiaGenerationSeason | null {
  return value === "summer" || value === "winter" ? value : null;
}

function parsePageTab(value: string | null): EiaGenerationPageTab | null {
  return EIA_GENERATION_PAGE_TABS.some((tab) => tab.key === value)
    ? (value as EiaGenerationPageTab)
    : null;
}

function parseIsoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function seasonFromDate(value: string): EiaGenerationSeason {
  const month = Number.parseInt(value.slice(5, 7), 10);
  return EIA_GENERATION_SEASON_OPTIONS.find((option) => option.key === "winter")?.months.includes(month)
    ? "winter"
    : "summer";
}

function initialSeasonFromLocation(): EiaGenerationSeason {
  if (typeof window === "undefined") return DEFAULT_SEASON;
  const params = new URLSearchParams(window.location.search);
  const routedDate = parseIsoDate(params.get("date") ?? params.get("endDate"));
  return parseSeason(params.get("season")) ?? (routedDate ? seasonFromDate(routedDate) : DEFAULT_SEASON);
}

function initialTabFromLocation(): EiaGenerationPageTab {
  if (typeof window === "undefined") return "home";
  return parsePageTab(new URLSearchParams(window.location.search).get("tab")) ?? "home";
}

function seasonDayIndex(season: EiaGenerationSeason, monthDay: string): number {
  const month = Number.parseInt(monthDay.slice(0, 2), 10);
  const day = Number.parseInt(monthDay.slice(3, 5), 10);
  const months = EIA_GENERATION_SEASON_OPTIONS.find((option) => option.key === season)?.months ?? [];
  const monthIndex = months.indexOf(month);
  return (monthIndex === -1 ? month : monthIndex) * 40 + day;
}

function seasonMonthTicks(season: EiaGenerationSeason): number[] {
  const months = EIA_GENERATION_SEASON_OPTIONS.find((option) => option.key === season)?.months ?? [];
  return months.map((month) => seasonDayIndex(season, `${String(month).padStart(2, "0")}-01`));
}

function seasonTickLabel(season: EiaGenerationSeason, value: number | string): string {
  const numeric = Number(value);
  const months = EIA_GENERATION_SEASON_OPTIONS.find((option) => option.key === season)?.months ?? [];
  const month = months.find(
    (candidate) => seasonDayIndex(season, `${String(candidate).padStart(2, "0")}-01`) === numeric,
  );
  return month ? MONTH_LABELS[month - 1] : String(value);
}

function buildApiUrl(
  region: EiaGenerationRegion,
  season: EiaGenerationSeason,
  date: string | null,
  refresh: boolean,
): string {
  const params = new URLSearchParams({ region, season });
  if (date) params.set("date", date);
  if (refresh) params.set("refresh", "1");
  return `/api/eia-generation?${params.toString()}`;
}

function buildCacheKey(
  region: EiaGenerationRegion,
  season: EiaGenerationSeason,
  date: string | null,
): string {
  return `api:eia-generation:v2:${region}:${season}:${date ?? "latest"}`;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmtMw(value: number | null | undefined, suffix = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const rounded = Math.round(value).toLocaleString();
  return suffix ? `${rounded} MW` : rounded;
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function fmtDeltaPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}pp`;
}

function fmtDeltaMw(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString()}`;
}

function fmtWeather(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(1);
}

function fmtDate(value: string | null | undefined): string {
  return value ?? "-";
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace("T", " ").replace("Z", "").slice(0, 16);
}

function avg(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function round(value: number | null, digits = 1): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function dateAgeDays(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((todayUtc - parsed.getTime()) / 86_400_000);
}

function freshnessFromPayload(payload: EiaGenerationPayload | null): EiaGenerationFreshnessSummary {
  if (!payload) {
    return {
      status: "Unknown",
      statusClass: "border-gray-700 bg-gray-900 text-gray-400",
      summary: "EIA generation --",
      targetDateLabel: "--",
      latestDateLabel: "--",
      latestUpdateLabel: "--",
    };
  }

  if (!payload.selectedDate || payload.currentTable.length === 0) {
    return {
      status: "No Data",
      statusClass: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
      summary: `${payload.region.label} has no EIA-930 rows`,
      targetDateLabel: payload.region.label,
      latestDateLabel: payload.latestDate ?? "--",
      latestUpdateLabel: fmtDateTime(payload.asOf),
    };
  }

  const ageDays = dateAgeDays(payload.latestDate);
  const stale = ageDays !== null && ageDays > 3;
  return {
    status: stale ? "Stale" : "Current",
    statusClass: stale
      ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    summary: `${payload.region.label} | ${payload.selectedDate} | ${payload.freshness.selectedTimezone}`,
    targetDateLabel: payload.region.label,
    latestDateLabel: payload.latestDate ?? "--",
    latestUpdateLabel: fmtDateTime(payload.asOf),
  };
}

function tooltipStyle() {
  return {
    background: "#111827",
    border: "1px solid #374151",
    borderRadius: 8,
    color: "#e5e7eb",
  };
}

function monthTickLabel(value: string): string {
  const month = Number.parseInt(value.slice(0, 2), 10);
  return MONTH_LABELS[month - 1] ?? value;
}

function metricValue(row: EiaGenerationDailyRow | undefined, key: EiaGenerationYoyMetricKey): number | null {
  if (!row) return null;
  return toNumber(row[key]);
}

function buildYoyRows(payload: EiaGenerationPayload, key: EiaGenerationYoyMetricKey): YoyChartRow[] {
  const currentYear = payload.currentYear;
  const priorYear = payload.priorYear;
  if (!currentYear || !priorYear) return [];

  const currentByDay = new Map(
    payload.daily
      .filter((row) => row.year === currentYear)
      .map((row) => [row.monthDay, row]),
  );
  const priorByDay = new Map(
    payload.daily
      .filter((row) => row.year === priorYear)
      .map((row) => [row.monthDay, row]),
  );
  const monthDays = Array.from(new Set([...currentByDay.keys(), ...priorByDay.keys()])).sort();

  return monthDays.map((monthDay) => ({
    monthDay,
    current: metricValue(currentByDay.get(monthDay), key),
    prior: metricValue(priorByDay.get(monthDay), key),
  }));
}

function buildMonthlyDeltaRows(payload: EiaGenerationPayload, key: EiaGenerationYoyMetricKey): MonthlyDeltaRow[] {
  const currentYear = payload.currentYear;
  const priorYear = payload.priorYear;
  if (!currentYear || !priorYear) {
    return MONTH_LABELS.map((month) => ({ month, delta: null }));
  }

  return MONTH_LABELS.map((month, index) => {
    const monthNumber = index + 1;
    const currentRows = payload.daily.filter(
      (row) => row.year === currentYear && row.month === monthNumber,
    );
    if (!currentRows.length) return { month, delta: null };

    const maxCurrentDay = Math.max(...currentRows.map((row) => row.day));
    const priorRows = payload.daily.filter(
      (row) => row.year === priorYear && row.month === monthNumber && row.day <= maxCurrentDay,
    );
    const currentAvg = avg(currentRows.map((row) => metricValue(row, key)));
    const priorAvg = avg(priorRows.map((row) => metricValue(row, key)));
    return {
      month,
      delta: currentAvg === null || priorAvg === null ? null : round(currentAvg - priorAvg),
    };
  });
}

function avgDailyMetric(
  rows: EiaGenerationDailyRow[],
  key: keyof EiaGenerationDailyRow,
): number | null {
  return round(avg(rows.map((row) => toNumber(row[key]))));
}

function renewableShare(row: EiaGenerationDailyRow): number | null {
  const renewableMw = [row.hydroMw, row.windMw, row.solarMw]
    .map(toNumber)
    .reduce<number | null>((sum, value) => (value === null ? sum : (sum ?? 0) + value), null);
  return pctLocal(renewableMw, row.netGenerationMw);
}

function pctLocal(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return round((numerator / denominator) * 100, 1);
}

function buildMonthlyAverageRows(payload: EiaGenerationPayload): MonthlyAverageRow[] {
  const currentYear = payload.currentYear;
  const priorYear = payload.priorYear;
  if (!currentYear || !priorYear) {
    return MONTH_LABELS.map((month) => ({
      month,
      currentDemandMw: null,
      priorDemandMw: null,
      demandDeltaMw: null,
      currentNetGenerationMw: null,
      gasMw: null,
      coalMw: null,
      windMw: null,
      solarMw: null,
      gasThermalPct: null,
      renewableSharePct: null,
    }));
  }

  return MONTH_LABELS.map((month, index) => {
    const monthNumber = index + 1;
    const currentRows = payload.daily.filter(
      (row) => row.year === currentYear && row.month === monthNumber,
    );
    const priorRows = payload.daily.filter(
      (row) => row.year === priorYear && row.month === monthNumber,
    );
    const currentDemandMw = avgDailyMetric(currentRows, "demandMw");
    const priorDemandMw = avgDailyMetric(priorRows, "demandMw");
    return {
      month,
      currentDemandMw,
      priorDemandMw,
      demandDeltaMw:
        currentDemandMw === null || priorDemandMw === null ? null : round(currentDemandMw - priorDemandMw),
      currentNetGenerationMw: avgDailyMetric(currentRows, "netGenerationMw"),
      gasMw: avgDailyMetric(currentRows, "gasMw"),
      coalMw: avgDailyMetric(currentRows, "coalMw"),
      windMw: avgDailyMetric(currentRows, "windMw"),
      solarMw: avgDailyMetric(currentRows, "solarMw"),
      gasThermalPct: avgDailyMetric(currentRows, "gasThermalPct"),
      renewableSharePct: round(avg(currentRows.map(renewableShare))),
    };
  });
}

function buildMtdMetricRows(payload: EiaGenerationPayload): MtdMetricRow[] {
  const selectedDate = payload.selectedDate;
  const currentYear = payload.currentYear;
  const priorYear = payload.priorYear;
  if (!selectedDate || !currentYear || !priorYear) return [];
  const selectedMonth = Number.parseInt(selectedDate.slice(5, 7), 10);
  const selectedDay = Number.parseInt(selectedDate.slice(8, 10), 10);
  const currentRows = payload.daily.filter(
    (row) => row.year === currentYear && row.month === selectedMonth && row.day <= selectedDay,
  );
  const priorRows = payload.daily.filter(
    (row) => row.year === priorYear && row.month === selectedMonth && row.day <= selectedDay,
  );
  const configs: Array<{
    key: MtdMetricRow["key"];
    label: string;
    unit: "mw" | "pct";
    color: string;
    selector: (row: EiaGenerationDailyRow) => number | null;
  }> = [
    { key: "demand", label: "Demand", unit: "mw", color: "#38bdf8", selector: (row) => row.demandMw },
    { key: "net", label: "Net Gen", unit: "mw", color: "#e5e7eb", selector: (row) => row.netGenerationMw },
    { key: "gas", label: "Gas", unit: "mw", color: EIA_GENERATION_FUEL_COLORS.gas, selector: (row) => row.gasMw },
    { key: "coal", label: "Coal", unit: "mw", color: EIA_GENERATION_FUEL_COLORS.coal, selector: (row) => row.coalMw },
    { key: "wind", label: "Wind", unit: "mw", color: EIA_GENERATION_FUEL_COLORS.wind, selector: (row) => row.windMw },
    { key: "solar", label: "Solar", unit: "mw", color: EIA_GENERATION_FUEL_COLORS.solar, selector: (row) => row.solarMw },
    { key: "gasThermal", label: "Gas % Thermal", unit: "pct", color: EIA_GENERATION_FUEL_COLORS.gas, selector: (row) => row.gasThermalPct },
  ];

  return configs.map((config) => {
    const current = round(avg(currentRows.map(config.selector)));
    const prior = round(avg(priorRows.map(config.selector)));
    return {
      key: config.key,
      label: config.label,
      unit: config.unit,
      color: config.color,
      current,
      prior,
      delta: current === null || prior === null ? null : round(current - prior),
    };
  });
}

function buildMtdChartRows(payload: EiaGenerationPayload): YoyChartRow[] {
  const selectedDate = payload.selectedDate;
  const currentYear = payload.currentYear;
  const priorYear = payload.priorYear;
  if (!selectedDate || !currentYear || !priorYear) return [];
  const selectedMonth = Number.parseInt(selectedDate.slice(5, 7), 10);
  const selectedDay = Number.parseInt(selectedDate.slice(8, 10), 10);
  const currentByDay = new Map(
    payload.daily
      .filter((row) => row.year === currentYear && row.month === selectedMonth && row.day <= selectedDay)
      .map((row) => [row.day, row]),
  );
  const priorByDay = new Map(
    payload.daily
      .filter((row) => row.year === priorYear && row.month === selectedMonth && row.day <= selectedDay)
      .map((row) => [row.day, row]),
  );

  return Array.from({ length: selectedDay }, (_, index) => index + 1).map((day) => ({
    monthDay: String(day).padStart(2, "0"),
    current: toNumber(currentByDay.get(day)?.demandMw),
    prior: toNumber(priorByDay.get(day)?.demandMw),
  }));
}

function buildRegionalModelRows(
  payload: EiaGenerationPayload,
  weather: EiaGenerationWeatherSeasonData,
): RegionalModelRow[] {
  const latest = payload.selectedDate
    ? payload.daily.find((row) => row.date === payload.selectedDate)
    : undefined;
  const demandMw = toNumber(latest?.demandMw);
  const netGenerationMw = toNumber(latest?.netGenerationMw);
  const thermalMw = [latest?.gasMw, latest?.coalMw]
    .map(toNumber)
    .reduce<number | null>((sum, value) => (value === null ? sum : (sum ?? 0) + value), null);
  const renewablePct = latest ? renewableShare(latest) : null;
  const currentWeatherPoint = weather.currentPoints.at(-1);
  return [
    {
      label: "Demand minus net generation",
      value: fmtDeltaMw(demandMw === null || netGenerationMw === null ? null : demandMw - netGenerationMw),
      detail: `${fmtMw(demandMw, true)} demand | ${fmtMw(netGenerationMw, true)} net gen`,
      tone: "demand",
    },
    {
      label: "Thermal dispatch",
      value: fmtMw(thermalMw, true),
      detail: `${fmtPct(latest?.thermalSharePct)} of net generation`,
      tone: "thermal",
    },
    {
      label: "Renewables",
      value: fmtPct(renewablePct),
      detail: "Hydro + wind + solar share of net generation",
      tone: "wind",
    },
    {
      label: "Weather anomaly",
      value: fmtDeltaMw(currentWeatherPoint?.demandAnomalyMw),
      detail: `${weather.entityLabel ?? weather.entityId ?? "Weather"} | ${weather.metricLabel}`,
      tone: "solar",
    },
  ];
}

function cellValue(row: EiaGenerationDailyRow, column: (typeof TABLE_COLUMNS)[number]): ReactNode {
  if (column.kind === "date") return row.date;
  const value = toNumber(row[column.key as keyof EiaGenerationDailyRow]);
  return column.kind === "pct" ? fmtPct(value) : fmtMw(value);
}

function Sparkline({
  points,
  color,
}: {
  points: Array<{ date: string; valuePct: number | null }>;
  color: string;
}) {
  const values = points.map((point) => point.valuePct).filter((value): value is number => value !== null);
  if (values.length < 2) {
    return <div className="h-8 w-24 rounded bg-gray-950/60" />;
  }

  const width = 96;
  const height = 32;
  const padding = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const coords = points
    .map((point, index) => {
      const value = point.valuePct;
      if (value === null) return null;
      const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / spread) * (height - padding * 2);
      return [x, y] as const;
    })
    .filter((coord): coord is readonly [number, number] => coord !== null);
  const path = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${path} L ${coords.at(-1)?.[0].toFixed(1) ?? width} ${height - padding} L ${coords[0]?.[0].toFixed(1) ?? padding} ${height - padding} Z`;

  return (
    <svg className="h-8 w-24" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recent trend">
      <path d={area} fill={color} opacity={0.18} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.8} />
    </svg>
  );
}

function KpiCard({ kpi }: { kpi: EiaGenerationPayload["kpis"][number] }) {
  const color = EIA_GENERATION_FUEL_COLORS[kpi.key];
  const deltaClass =
    kpi.deltaPctPoint === null
      ? "text-gray-500"
      : kpi.deltaPctPoint >= 0
        ? "text-emerald-300"
        : "text-rose-300";

  return (
    <div className="min-w-[164px] rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{kpi.label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-xl font-semibold tabular-nums" style={{ color }}>
              {fmtPct(kpi.valuePct)}
            </p>
            <p className={`text-xs font-semibold tabular-nums ${deltaClass}`}>{fmtDeltaPct(kpi.deltaPctPoint)}</p>
          </div>
        </div>
        <Sparkline points={kpi.sparkline} color={color} />
      </div>
    </div>
  );
}

function RegionControls({
  region,
  data,
  requestedDate,
  onRegionChange,
  onDateChange,
  onLatestClick,
}: {
  region: EiaGenerationRegion;
  data: EiaGenerationPayload | null;
  requestedDate: string | null;
  onRegionChange: (region: EiaGenerationRegion) => void;
  onDateChange: (date: string | null) => void;
  onLatestClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-gray-800 pb-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-wrap gap-2">
        {EIA_GENERATION_REGIONS.map((item) => {
          const active = item.key === region;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onRegionChange(item.key)}
              className={`h-8 rounded-md border px-3 text-xs font-semibold transition-colors ${
                active
                  ? "border-blue-500 bg-blue-600 text-white"
                  : "border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-700 hover:text-gray-200"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <label className="flex h-8 items-center gap-2 rounded-md border border-gray-800 bg-gray-900 px-2 text-xs text-gray-500">
          <span className="font-semibold uppercase tracking-wide">Date</span>
          <input
            type="date"
            value={requestedDate ?? ""}
            min={data?.freshness.minPeriod ?? undefined}
            max={data?.latestDate ?? undefined}
            onChange={(event) => onDateChange(parseIsoDate(event.target.value))}
            className="h-6 bg-transparent text-xs font-semibold tabular-nums text-gray-200 outline-none [color-scheme:dark]"
          />
        </label>
        <button
          type="button"
          onClick={onLatestClick}
          className="h-8 rounded-md border border-gray-800 bg-gray-900 px-3 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-200"
        >
          Latest
        </button>
        <div className="text-xs text-gray-500 lg:text-right">
          Latest: <span className="font-semibold tabular-nums text-gray-200">{fmtDate(data?.latestDate)}</span>
        </div>
      </div>
    </div>
  );
}

function HomeTabStrip({
  activeTab,
  onTabChange,
}: {
  activeTab: EiaGenerationPageTab;
  onTabChange: (tab: EiaGenerationPageTab) => void;
}) {
  return (
    <div className="flex flex-wrap gap-6 border-b border-gray-800">
      {EIA_GENERATION_PAGE_TABS.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`h-11 border-b-2 px-1 text-xs font-bold uppercase tracking-wider transition-colors ${
              active
                ? "border-blue-500 text-blue-300"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function SourceContractStrip({ data }: { data: EiaGenerationPayload }) {
  const items = [
    { label: "Fuel", value: EIA_GENERATION_SOURCE_TABLE },
    { label: "Demand", value: data.metadata.demandSourceTable },
    { label: "Weather", value: data.region.weatherEntityLabel ?? data.metadata.weatherSourceTable },
    { label: "Timezone", value: data.freshness.selectedTimezone },
    { label: "Rows", value: data.freshness.rowCount.toLocaleString() },
  ];

  return (
    <section className="grid gap-2 rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 md:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{item.label}</p>
          <p className="mt-1 truncate text-xs font-semibold text-gray-200" title={item.value}>
            {item.value}
          </p>
        </div>
      ))}
    </section>
  );
}

function DailyGenerationTable({
  title,
  rows,
  showPendingDemand,
}: {
  title: string;
  rows: EiaGenerationDailyRow[];
  showPendingDemand: boolean;
}) {
  return (
    <DataTableShell
      title={title}
      subtitle={showPendingDemand ? "Demand column is held blank until EIA daily region-data rows are available." : undefined}
      bodyClassName="border-gray-800"
    >
      <table className="w-full min-w-[1760px] border-collapse bg-[#0d1119] text-xs text-gray-200">
        <thead className="bg-gray-950 text-gray-500">
          <tr>
            {TABLE_COLUMNS.map((column) => (
              <th
                key={String(column.key)}
                className={`px-3 py-2 font-semibold uppercase tracking-wide ${
                  column.align === "left" ? "text-left" : "text-right"
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {rows.map((row, index) => (
            <tr
              key={row.date}
              className={index === 0 ? "bg-amber-950/30" : "hover:bg-gray-900/60"}
            >
              {TABLE_COLUMNS.map((column) => {
                const toneClass = column.tone ? TONE_TEXT_CLASSES[column.tone] : "text-gray-200";
                const pendingDemand = column.key === "demandMw" && showPendingDemand;
                return (
                  <td
                    key={`${row.date}-${String(column.key)}`}
                    title={pendingDemand ? "Daily ISO demand source pending" : undefined}
                    className={`px-3 py-2 tabular-nums ${
                      column.align === "left" ? "text-left font-semibold text-gray-100" : `text-right ${toneClass}`
                    }`}
                  >
                    {cellValue(row, column)}
                  </td>
                );
              })}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={TABLE_COLUMNS.length} className="px-3 py-8 text-center text-sm text-gray-500">
                No EIA-930 rows are available for this selection.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </DataTableShell>
  );
}

function YoyMetricPanel({
  payload,
  metric,
}: {
  payload: EiaGenerationPayload;
  metric: (typeof YOY_METRICS)[number];
}) {
  const rows = useMemo(() => buildYoyRows(payload, metric.key), [payload, metric.key]);
  const monthlyDeltas = useMemo(
    () => buildMonthlyDeltaRows(payload, metric.key),
    [payload, metric.key],
  );
  const currentYear = payload.currentYear ?? new Date().getUTCFullYear();
  const priorYear = payload.priorYear ?? currentYear - 1;
  const hasRows = rows.some((row) => row.current !== null || row.prior !== null);
  const axisFormatter =
    metric.unit === "pct"
      ? (value: number) => `${Math.round(value)}%`
      : (value: number) => `${Math.round(value / 1000)}k`;
  const valueFormatter =
    metric.unit === "pct"
      ? (value: unknown) => fmtPct(toNumber(value))
      : (value: unknown) => fmtMw(toNumber(value), true);

  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">
            {payload.region.label} - {metric.label}: {currentYear} vs {priorYear}
          </h2>
        </div>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-700 text-[11px] font-semibold text-gray-500">
          ?
        </span>
      </div>
      {hasRows ? (
        <>
          <div className={metric.showMonthlyDelta ? "h-[230px]" : "h-[320px]"}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 18, bottom: 6, left: 6 }}>
                <CartesianGrid stroke="#253041" strokeDasharray="3 3" />
                <XAxis
                  dataKey="monthDay"
                  ticks={MONTH_TICKS}
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  tickFormatter={monthTickLabel}
                  minTickGap={18}
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  tickFormatter={axisFormatter}
                  width={58}
                />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  labelFormatter={(label) => String(label)}
                  formatter={(value, name) => [valueFormatter(value), String(name)]}
                />
                <Line
                  type="monotone"
                  dataKey="current"
                  name={String(currentYear)}
                  stroke={metric.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="prior"
                  name={String(priorYear)}
                  stroke={metric.color}
                  strokeOpacity={0.45}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {metric.showMonthlyDelta && (
            <div className="mt-3">
              <p className="mb-1 text-[11px] text-gray-500">Monthly Avg Delta (MW)</p>
              <div className="h-[86px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyDeltas} margin={{ top: 4, right: 18, bottom: 0, left: 6 }}>
                    <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <YAxis hide />
                    <ReferenceLine y={0} stroke="#475569" />
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      formatter={(value) => [fmtDeltaMw(toNumber(value)), "Avg delta"]}
                    />
                    <Bar dataKey="delta" isAnimationActive={false}>
                      {monthlyDeltas.map((row) => (
                        <Cell
                          key={row.month}
                          fill={row.delta === null ? "#1f2937" : row.delta >= 0 ? "#059669" : "#dc2626"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-[320px] items-center justify-center rounded-md border border-gray-800 bg-gray-950/40 text-sm text-gray-500">
          No YoY rows are available for this metric.
        </div>
      )}
    </section>
  );
}

function MonthlyAveragesTab({ payload }: { payload: EiaGenerationPayload }) {
  const rows = useMemo(() => buildMonthlyAverageRows(payload), [payload]);
  const chartRows = rows.map((row) => ({
    month: row.month,
    gas: row.gasMw,
    coal: row.coalMw,
    wind: row.windMw,
    solar: row.solarMw,
  }));

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-gray-100">
            {payload.region.label} Monthly Fuel Stack
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {payload.currentYear ?? "-"} daily-average MW by month
          </p>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} margin={{ top: 8, right: 18, bottom: 0, left: 6 }}>
              <CartesianGrid stroke="#253041" strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                width={58}
              />
              <Tooltip
                contentStyle={tooltipStyle()}
                formatter={(value, name) => [fmtMw(toNumber(value), true), String(name)]}
              />
              <Bar dataKey="gas" stackId="fuel" name="Gas" fill={EIA_GENERATION_FUEL_COLORS.gas} isAnimationActive={false} />
              <Bar dataKey="coal" stackId="fuel" name="Coal" fill={EIA_GENERATION_FUEL_COLORS.coal} isAnimationActive={false} />
              <Bar dataKey="wind" stackId="fuel" name="Wind" fill={EIA_GENERATION_FUEL_COLORS.wind} isAnimationActive={false} />
              <Bar dataKey="solar" stackId="fuel" name="Solar" fill={EIA_GENERATION_FUEL_COLORS.solar} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <DataTableShell title={`${payload.region.label} Monthly Averages`} bodyClassName="border-gray-800">
        <table className="w-full min-w-[1160px] border-collapse bg-[#0d1119] text-xs text-gray-200">
          <thead className="bg-gray-950 text-gray-500">
            <tr>
              {MONTHLY_AVERAGE_COLUMNS.map((column) => (
                <th
                  key={String(column.key)}
                  className={`px-3 py-2 font-semibold uppercase tracking-wide ${
                    column.kind === "text" ? "text-left" : "text-right"
                  }`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {rows.map((row) => (
              <tr key={row.month} className="hover:bg-gray-900/60">
                {MONTHLY_AVERAGE_COLUMNS.map((column) => {
                  const value = row[column.key];
                  const numeric = typeof value === "number" ? value : null;
                  const display =
                    column.kind === "text"
                      ? String(value)
                      : column.kind === "pct"
                        ? fmtPct(numeric)
                        : column.kind === "delta"
                          ? fmtDeltaMw(numeric)
                          : fmtMw(numeric);
                  const deltaClass =
                    column.kind === "delta" && numeric !== null
                      ? numeric >= 0
                        ? "text-emerald-300"
                        : "text-rose-300"
                      : "text-gray-200";
                  return (
                    <td
                      key={`${row.month}-${String(column.key)}`}
                      className={`px-3 py-2 tabular-nums ${
                        column.kind === "text" ? "text-left font-semibold text-gray-100" : `text-right ${deltaClass}`
                      }`}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableShell>
    </div>
  );
}

function RegionalModelingTab({
  payload,
  season,
}: {
  payload: EiaGenerationPayload;
  season: EiaGenerationSeason;
}) {
  const weather = payload.weatherBySeason[season];
  const rows = useMemo(() => buildRegionalModelRows(payload, weather), [payload, weather]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{row.label}</p>
            <p className={`mt-2 text-xl font-semibold tabular-nums ${TONE_TEXT_CLASSES[row.tone]}`}>
              {row.value}
            </p>
            <p className="mt-1 truncate text-xs text-gray-500" title={row.detail}>
              {row.detail}
            </p>
          </div>
        ))}
      </div>

      <DataTableShell title={`${payload.region.label} Model Inputs`} bodyClassName="border-gray-800">
        <table className="w-full min-w-[780px] border-collapse bg-[#0d1119] text-xs text-gray-200">
          <thead className="bg-gray-950 text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Input</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">Value</th>
              <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {rows.map((row) => (
              <tr key={row.label} className="hover:bg-gray-900/60">
                <td className="px-3 py-2 font-semibold text-gray-100">{row.label}</td>
                <td className={`px-3 py-2 text-right font-semibold tabular-nums ${TONE_TEXT_CLASSES[row.tone]}`}>
                  {row.value}
                </td>
                <td className="px-3 py-2 text-gray-400">{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableShell>

      <div className="grid gap-4 xl:grid-cols-2">
        <WeatherResponsePanel weather={weather} />
        <WeatherAnomalyPanel weather={weather} />
      </div>
    </div>
  );
}

function YoyMtdTab({ payload }: { payload: EiaGenerationPayload }) {
  const rows = useMemo(() => buildMtdMetricRows(payload), [payload]);
  const chartRows = useMemo(() => buildMtdChartRows(payload), [payload]);
  const currentYear = payload.currentYear ?? new Date().getUTCFullYear();
  const priorYear = payload.priorYear ?? currentYear - 1;
  const selectedMonthLabel = payload.selectedDate
    ? MONTH_LABELS[Number.parseInt(payload.selectedDate.slice(5, 7), 10) - 1]
    : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {rows.map((row) => {
          const formatter = row.unit === "pct" ? fmtPct : fmtMw;
          const deltaFormatter = row.unit === "pct" ? fmtDeltaPct : fmtDeltaMw;
          const deltaClass =
            row.delta === null
              ? "text-gray-500"
              : row.delta >= 0
                ? "text-emerald-300"
                : "text-rose-300";
          return (
            <div key={row.key} className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{row.label}</p>
              <p className="mt-2 text-xl font-semibold tabular-nums" style={{ color: row.color }}>
                {formatter(row.current)}
              </p>
              <p className={`mt-1 text-xs font-semibold tabular-nums ${deltaClass}`}>
                {deltaFormatter(row.delta)}
              </p>
            </div>
          );
        })}
      </div>

      <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-gray-100">
            {payload.region.label} Demand MTD: {currentYear} vs {priorYear}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {selectedMonthLabel ?? "Selected month"} through {fmtDate(payload.selectedDate)}
          </p>
        </div>
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows} margin={{ top: 8, right: 18, bottom: 6, left: 6 }}>
              <CartesianGrid stroke="#253041" strokeDasharray="3 3" />
              <XAxis dataKey="monthDay" tick={{ fill: "#9ca3af", fontSize: 11 }} minTickGap={12} />
              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                width={58}
              />
              <Tooltip
                contentStyle={tooltipStyle()}
                labelFormatter={(label) => `${selectedMonthLabel ?? "Day"} ${String(label)}`}
                formatter={(value, name) => [fmtMw(toNumber(value), true), String(name)]}
              />
              <Line
                type="monotone"
                dataKey="current"
                name={String(currentYear)}
                stroke="#38bdf8"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="prior"
                name={String(priorYear)}
                stroke="#f59e0b"
                strokeWidth={1.6}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {YOY_METRICS.slice(0, 4).map((metric) => (
          <YoyMetricPanel key={metric.key} payload={payload} metric={metric} />
        ))}
      </div>
    </div>
  );
}

function SeasonToggle({
  season,
  onSeasonChange,
}: {
  season: EiaGenerationSeason;
  onSeasonChange: (season: EiaGenerationSeason) => void;
}) {
  return (
    <div className="flex justify-end">
      <div className="inline-flex rounded-lg border border-gray-800 bg-[#12141d] p-1">
        {EIA_GENERATION_SEASON_OPTIONS.map((option) => {
          const active = season === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onSeasonChange(option.key)}
              className={`h-8 rounded-md px-3 text-xs font-semibold transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-500 hover:bg-gray-900 hover:text-gray-300"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PendingPanel({
  title,
  subtitle,
  season,
  message,
}: {
  title: string;
  subtitle: string;
  season: EiaGenerationSeason;
  message?: string | null;
}) {
  const seasonLabel = EIA_GENERATION_SEASON_OPTIONS.find((item) => item.key === season)?.label ?? season;
  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
        <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
      </div>
      <div className="flex h-[320px] flex-col items-center justify-center rounded-md border border-dashed border-gray-700 bg-gray-950/40 px-4 text-center">
        <p className="text-sm font-semibold text-gray-300">Demand/weather source pending</p>
        <p className="mt-2 max-w-md text-xs leading-5 text-gray-500">
          {message ?? `${seasonLabel} is selected. This panel needs demand rows and electric degree-day buckets before live values are displayed.`}
        </p>
      </div>
    </section>
  );
}

function WeatherResponsePanel({
  weather,
}: {
  weather: EiaGenerationWeatherSeasonData;
}) {
  if (weather.status !== "available") {
    return (
      <PendingPanel
        title="Weather Response: Current vs Prior"
        subtitle="Historical response curve with current and prior daily demand."
        season={weather.season}
        message={weather.message}
      />
    );
  }

  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Weather Response: Current vs Prior</h2>
          <p className="mt-1 text-xs text-gray-500">
            {weather.entityLabel ?? weather.entityId} | {weather.metricLabel}
          </p>
        </div>
      </div>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 18, bottom: 10, left: 8 }}>
            <CartesianGrid stroke="#253041" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="weatherValue"
              name={weather.metricLabel}
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              tickFormatter={(value) => fmtWeather(toNumber(value))}
            />
            <YAxis
              type="number"
              dataKey="demandMw"
              name="Demand"
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
              width={58}
            />
            <Tooltip
              contentStyle={tooltipStyle()}
              formatter={(value, name) => {
                const label = String(name);
                const numeric = toNumber(value);
                return [
                  label.includes("Demand") || label.includes("median")
                    ? fmtMw(numeric, true)
                    : fmtWeather(numeric),
                  label,
                ];
              }}
            />
            <Scatter
              name="Historical Demand"
              data={weather.historicalPoints}
              fill="#64748b"
              fillOpacity={0.22}
              isAnimationActive={false}
            />
            <Scatter
              name={`${weather.priorYear} Demand`}
              data={weather.priorPoints}
              fill="#f59e0b"
              fillOpacity={0.82}
              isAnimationActive={false}
            />
            <Scatter
              name={`${weather.currentYear} Demand`}
              data={weather.currentPoints}
              fill="#38bdf8"
              fillOpacity={0.9}
              isAnimationActive={false}
            />
            <Line
              name="Historical median"
              data={weather.bucketMedians}
              type="monotone"
              dataKey="historicalMedianDemandMw"
              stroke="#e5e7eb"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function WeatherAnomalyPanel({
  weather,
}: {
  weather: EiaGenerationWeatherSeasonData;
}) {
  if (weather.status !== "available") {
    return (
      <PendingPanel
        title="Weather-Adjusted Demand Anomaly"
        subtitle="Actual demand minus historical weather-bucket median."
        season={weather.season}
        message={weather.message}
      />
    );
  }

  return (
    <section className="rounded-lg border border-gray-800 bg-[#12141d] p-3 shadow-xl shadow-black/20 sm:p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Weather-Adjusted Demand Anomaly</h2>
          <p className="mt-1 text-xs text-gray-500">
            Actual demand minus historical median by {weather.metricLabel} bucket
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-right text-xs">
          <div className="rounded-md border border-gray-800 bg-gray-950/60 px-2 py-1">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">{weather.currentYear}</p>
            <p className="font-semibold tabular-nums text-sky-300">{fmtDeltaMw(weather.currentAvgAnomalyMw)}</p>
          </div>
          <div className="rounded-md border border-gray-800 bg-gray-950/60 px-2 py-1">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">{weather.priorYear}</p>
            <p className="font-semibold tabular-nums text-amber-300">{fmtDeltaMw(weather.priorAvgAnomalyMw)}</p>
          </div>
        </div>
      </div>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={weather.anomalyRows} margin={{ top: 8, right: 18, bottom: 6, left: 6 }}>
            <CartesianGrid stroke="#253041" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="seasonDayIndex"
              ticks={seasonMonthTicks(weather.season)}
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              tickFormatter={(value) => seasonTickLabel(weather.season, value)}
              minTickGap={18}
            />
            <YAxis
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
              width={58}
            />
            <ReferenceLine y={0} stroke="#64748b" />
            <Tooltip
              contentStyle={tooltipStyle()}
              labelFormatter={(_, payload) => {
                const monthDay = payload?.[0]?.payload?.monthDay;
                return typeof monthDay === "string" ? monthDay : "";
              }}
              formatter={(value, name) => [fmtDeltaMw(toNumber(value)), String(name)]}
            />
            <Line
              type="monotone"
              dataKey="current"
              name={String(weather.currentYear)}
              stroke="#38bdf8"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="prior"
              name={String(weather.priorYear)}
              stroke="#f59e0b"
              strokeWidth={1.6}
              strokeDasharray="4 4"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="h-[74px] animate-pulse rounded-lg border border-gray-800 bg-gray-900/50" />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded-lg border border-gray-800 bg-gray-900/50" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
      {message}
    </div>
  );
}

export default function EiaGenerationDashboard({
  refreshToken = 0,
  onFreshnessChange,
}: EiaGenerationDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [region, setRegion] = useState<EiaGenerationRegion>(initialRegionFromLocation);
  const [activeTab, setActiveTab] = useState<EiaGenerationPageTab>(initialTabFromLocation);
  const [season, setSeason] = useState<EiaGenerationSeason>(initialSeasonFromLocation);
  const [data, setData] = useState<EiaGenerationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestedDate = useMemo(
    () => parseIsoDate(searchParams.get("date") ?? searchParams.get("endDate")),
    [searchParams],
  );

  useEffect(() => {
    const routedRegion = getEiaGenerationRegion(searchParams.get("region")).key;
    const routedSeason = parseSeason(searchParams.get("season"));
    const routedDate = parseIsoDate(searchParams.get("date") ?? searchParams.get("endDate"));
    const routedTab = parsePageTab(searchParams.get("tab"));
    setRegion((current) => (current === routedRegion ? current : routedRegion));
    if (routedSeason) {
      setSeason((current) => (current === routedSeason ? current : routedSeason));
    } else if (routedDate) {
      const dateSeason = seasonFromDate(routedDate);
      setSeason((current) => (current === dateSeason ? current : dateSeason));
    }
    if (routedTab) {
      setActiveTab((current) => (current === routedTab ? current : routedTab));
    }
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);

    const forceRefresh = refreshToken > 0;
    fetchJsonWithCache<EiaGenerationPayload>({
      key: buildCacheKey(region, season, requestedDate),
      url: buildApiUrl(region, season, requestedDate, forceRefresh),
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: forceRefresh ? "no-store" : "default",
      forceRefresh,
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        onFreshnessChange?.(freshnessFromPayload(payload));
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        const message = err.message || "Failed to load EIA generation data";
        setError(message);
        onFreshnessChange?.({
          status: "Error",
          statusClass: "border-red-500/40 bg-red-500/10 text-red-200",
          summary: "EIA generation query failed",
          targetDateLabel: region,
          latestDateLabel: "--",
          latestUpdateLabel: "--",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [onFreshnessChange, refreshToken, region, requestedDate, season]);

  useEffect(() => {
    if (!data?.selectedDate || requestedDate || parseSeason(searchParams.get("season"))) return;
    const selectedDateSeason = seasonFromDate(data.selectedDate);
    if (selectedDateSeason === season) return;
    setSeason(selectedDateSeason);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "eia-generation");
    params.set("region", region);
    params.set("season", selectedDateSeason);
    params.set("tab", activeTab);
    params.delete("section");
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [activeTab, data?.selectedDate, region, requestedDate, router, searchParams, season]);

  const handleRegionChange = (nextRegion: EiaGenerationRegion) => {
    setRegion(nextRegion);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "eia-generation");
    params.set("region", nextRegion);
    params.set("season", season);
    params.set("tab", activeTab);
    params.delete("section");
    router.replace(`/?${params.toString()}`, { scroll: false });
  };

  const handleSeasonChange = (nextSeason: EiaGenerationSeason) => {
    setSeason(nextSeason);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "eia-generation");
    params.set("region", region);
    params.set("season", nextSeason);
    params.set("tab", activeTab);
    params.delete("section");
    router.replace(`/?${params.toString()}`, { scroll: false });
  };

  const handleDateChange = (nextDate: string | null) => {
    const nextSeason = nextDate ? seasonFromDate(nextDate) : season;
    setSeason(nextSeason);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "eia-generation");
    params.set("region", region);
    params.set("season", nextSeason);
    params.set("tab", activeTab);
    params.delete("section");
    if (nextDate) {
      params.set("date", nextDate);
      params.delete("endDate");
    } else {
      params.delete("date");
      params.delete("endDate");
    }
    router.replace(`/?${params.toString()}`, { scroll: false });
  };

  const handleLatestClick = () => {
    handleDateChange(null);
  };

  const handleTabChange = (nextTab: EiaGenerationPageTab) => {
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "eia-generation");
    params.set("region", region);
    params.set("season", season);
    params.set("tab", nextTab);
    params.delete("section");
    router.replace(`/?${params.toString()}`, { scroll: false });
  };

  const selectedRegion = getEiaGenerationRegion(region);
  const currentTitle =
    data?.currentYear != null
      ? `${selectedRegion.label} - Last 15 Days (${data.currentYear})`
      : `${selectedRegion.label} - Last 15 Days`;
  const priorTitle =
    data?.priorYear != null
      ? `${selectedRegion.label} - Same Period Last Year (${data.priorYear})`
      : `${selectedRegion.label} - Same Period Last Year`;

  return (
    <div className="space-y-5">
      <RegionControls
        region={region}
        data={data}
        requestedDate={requestedDate}
        onRegionChange={handleRegionChange}
        onDateChange={handleDateChange}
        onLatestClick={handleLatestClick}
      />
      <HomeTabStrip activeTab={activeTab} onTabChange={handleTabChange} />

      {error && <ErrorState message={error} />}
      {loading && !data && <LoadingState />}

      {!loading && !error && data && (
        <>
          <SourceContractStrip data={data} />

          <SeasonToggle season={season} onSeasonChange={handleSeasonChange} />

          {activeTab === "home" && (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                {data.kpis.map((kpi) => (
                  <KpiCard key={kpi.key} kpi={kpi} />
                ))}
              </div>

              <div className="space-y-4">
                <DailyGenerationTable
                  title={currentTitle}
                  rows={data.currentTable}
                  showPendingDemand={data.demandStatus === "source_pending"}
                />
                <DailyGenerationTable
                  title={priorTitle}
                  rows={data.priorTable}
                  showPendingDemand={data.demandStatus === "source_pending"}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {YOY_METRICS.map((metric) => (
                  <YoyMetricPanel key={metric.key} payload={data} metric={metric} />
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <WeatherResponsePanel weather={data.weatherBySeason[season]} />
                <WeatherAnomalyPanel weather={data.weatherBySeason[season]} />
              </div>
            </>
          )}

          {activeTab === "monthly-averages" && <MonthlyAveragesTab payload={data} />}
          {activeTab === "regional-modeling" && (
            <RegionalModelingTab payload={data} season={season} />
          )}
          {activeTab === "yoy-mtd" && <YoyMtdTab payload={data} />}
        </>
      )}

      {!loading && !error && !data && (
        <div className="rounded-lg border border-gray-800 bg-[#12141d] p-6 text-sm text-gray-500">
          No EIA generation payload is available.
        </div>
      )}
    </div>
  );
}
