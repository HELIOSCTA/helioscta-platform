"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import DashboardTabs, { type DashboardTabOption } from "@/components/dashboard/DashboardTabs";
import SaltForecastTab, {
  makeSaltForecastApiUrl,
  type SaltForecastPayload,
  type SaltForecastRegion,
  type SaltForecastWeatherRegion,
} from "@/components/salts/SaltForecastTab";
import { seasonalYearColor } from "@/components/spark/seasonalColors";
import { fetchJsonWithCache } from "@/lib/clientJsonCache";
import {
  NEXT_DAY_GAS_PRICE_METRICS,
  type NextDayGasPriceMetric,
} from "@/lib/gasPricing/nextDayGas";

export type SaltsTab = "wx-adj-scrapes" | "salt-plots" | "salt-fc";
type FacilityScope = "focused" | "all";
type SaltModelFlowWindow = 30 | 45 | 60 | 90;
type SeasonKey = "winter" | "summer";
type WeatherMetric =
  | "southcentral_gas_hdd"
  | "conus_gas_hdd"
  | "southcentral_population_cdd"
  | "conus_population_cdd";
type SaltsMetric = "salts_total" | "salts_tx" | "salts_la" | "salts_ms" | "salts_al";
type SaltFacilityMetric =
  | "golden_triangle"
  | "keystone"
  | "moss_bluff"
  | "tres_palacios"
  | "arcadia"
  | "boardwalk"
  | "bobcat"
  | "egan"
  | "jefferson_island"
  | "la_storage"
  | "perryville"
  | "pine_prarie"
  | "eminence"
  | "leaf_river"
  | "mississippi_hub"
  | "petal"
  | "southern_pines"
  | "bay_gas";
type SaltFlowMetric = SaltsMetric | SaltFacilityMetric;
type SaltTableMetric = SaltFlowMetric | NextDayGasPriceMetric;
type SaltTablePeriod = "daily" | "weekly" | "monthly";
type SaltInventoryFacilityMetric =
  | "golden_triangle"
  | "pine_prarie"
  | "perryville"
  | "southern_pines"
  | "eminence";

interface SaltInventoryFacilityValues {
  inventoryBcf: number | null;
  inventoryDeltaBcf: number | null;
  dailyFlowMmcf: number | null;
  availableCapBcf: number | null;
  operationalCapBcf: number | null;
  designCapBcf: number | null;
}

interface SaltInventoryDailyRow {
  date: string;
  label: string;
  year: number | null;
  month: number;
  monthLabel: string;
  mmDd: string | null;
  season: SeasonKey;
  seasonLabel: string;
  facilities: Partial<Record<SaltInventoryFacilityMetric, SaltInventoryFacilityValues>>;
}

interface WxAdjPoint {
  date: string;
  label: string;
  year: number | null;
  month: number;
  monthLabel: string;
  mmDd: string | null;
  season: SeasonKey;
  seasonLabel: string;
  eiaStorageWeek: string | null;
  eiaStorageWeekNumber: number | null;
  weatherDataSource: string | null;
  x: number;
  y: number;
  weatherMetric: WeatherMetric;
  saltsMetric: SaltsMetric;
  isRecent: boolean;
}

interface WxAdjDailyRow {
  date: string;
  label: string;
  year: number | null;
  month: number;
  monthLabel: string;
  mmDd: string | null;
  season: SeasonKey;
  seasonLabel: string;
  eiaStorageWeek: string | null;
  eiaStorageWeekNumber: number | null;
  weatherDataSource: string | null;
  weather: Record<WeatherMetric, number | null>;
  salts: Partial<Record<SaltFlowMetric, number | null>>;
  gas: Partial<Record<NextDayGasPriceMetric, number | null>>;
  gasPriceTradeDate: string | null;
  gasPriceLatestTradeDate: string | null;
  gasPriceUpdatedAt: string | null;
  isRecent: boolean;
}

interface WxAdjPlot {
  id: string;
  title: string;
  weatherMetric: WeatherMetric;
  saltsMetric: SaltsMetric;
  pointCount: number;
  minDate: string | null;
  maxDate: string | null;
  points: WxAdjPoint[];
}

interface WxAdjPayload {
  selected: {
    season: SeasonKey;
    month: number;
    monthLabel: string;
    weatherMetric: WeatherMetric;
    saltsMetric: SaltsMetric;
    lookbackYears: number;
    recentDays: number;
  };
  summary: {
    pointCount: number;
    dailyRowCount?: number;
    plotCount?: number;
    metricPointCount?: number;
    minDate: string | null;
    maxDate: string | null;
    saltRowCount?: number;
    genscapeRowCount?: number;
    weatherRowCount: number;
    tableRowCount?: number;
    tableSaltRowCount?: number;
    tableWeatherRowCount?: number;
    tableGasRowCount?: number;
    tableMinDate?: string | null;
    tableMaxDate?: string | null;
    tableGasMinDate?: string | null;
    tableGasMaxDate?: string | null;
    tableLookbackMonths?: number;
    inventoryRowCount?: number;
    inventoryRawRowCount?: number;
    inventoryMinDate?: string | null;
    inventoryMaxDate?: string | null;
    saltPlotLookbackDays?: number;
    sourceStartYear: number;
  };
  dailyRows?: WxAdjDailyRow[];
  tableRows?: WxAdjDailyRow[];
  inventoryRows?: SaltInventoryDailyRow[];
  points: WxAdjPoint[];
  plots?: WxAdjPlot[];
}

interface ChartPoint extends WxAdjPoint {
  z: number;
}

interface RegressionLine {
  seasonLabel: string;
  color: string;
  rSquared: number | null;
  slope: number;
  intercept: number;
  data: Array<{ x: number; y: number }>;
}

type SeasonRole = "current" | "prior" | "history";
type AxisDomain = [number, number];

interface ChartGroup {
  seasonLabel: string;
  color: string;
  role: SeasonRole;
  pointOpacity: number;
  highlighted: boolean;
  points: ChartPoint[];
  fit: RegressionLine | null;
}

interface PlotChart {
  plot: WxAdjPlot;
  grouped: ChartGroup[];
  xDomain: AxisDomain;
  yDomain: AxisDomain;
}

interface SeasonLegendItem {
  key: SeasonRole;
  label: string;
  color: string;
  active: boolean;
}

interface TooltipPayloadItem {
  color?: string;
  payload?: Partial<ChartPoint> & { x?: number; y?: number };
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

interface SaltFacilityOption {
  value: SaltFacilityMetric;
  label: string;
  region: string;
}

interface SaltPlotsSeasonalPoint {
  seasonDay: number;
  label: string;
  currentInventory: number | null;
  lastYearInventory: number | null;
  historicalAverage: number | null;
  historicalMin: number | null;
  historicalMax: number | null;
  historicalCount: number;
}

interface SaltPlotsFlowPoint {
  date: string;
  label: string;
  dailyFlow: number | null;
  seasonCumFlow: number | null;
}

interface SaltPlotsFacilitySummary {
  metric: SaltInventoryFacilityMetric;
  label: string;
  region: string;
  latestDate: string | null;
  latestInventory: number | null;
  inventoryDoD: number | null;
  latestFlow: number | null;
  seasonToDateFlow: number | null;
  requiredPace: number | null;
  requiredPaceTarget: number | null;
  daysToTarget: number | null;
  inventoryPercentile: number | null;
  yoyInventoryDelta: number | null;
  capacityBcf: number | null;
  seasonalPercent: number | null;
  seasonalRows: SaltInventoryDailyRow[];
  flowWindowRows: SaltInventoryDailyRow[];
  seasonalSeries: SaltPlotsSeasonalPoint[];
  flowSeries: SaltPlotsFlowPoint[];
}

interface SaltsDashboardProps {
  activeTab?: SaltsTab;
  initialTab?: SaltsTab;
  onTabChange?: (tab: SaltsTab) => void;
}

export interface SaltsChrome {
  title: string;
  subtitle: string;
  footer: string;
  badges: Array<{ label: string; value: string }>;
}

interface SaltModelRegime {
  label: string;
  startDate: string;
  endDate: string;
  targetDate: string;
}

interface SaltTableMetricOption {
  value: SaltTableMetric;
  label: string;
  group: "Salts - Totals" | "Salts - Facilities" | "Gas - Next Day Cash";
  region: string;
  sortIndex: number;
  kind: "flow" | "price";
}

interface SaltPivotColumn {
  key: string;
  label: string;
}

interface SaltPivotRow {
  key: string;
  group: string;
  region: string;
  metricLabel: string;
  measure: string;
  values: Record<string, number | null>;
  heatValues: number[];
  isChange: boolean;
  valueKind: "flow" | "price";
}

interface SaltPivotTablePayload {
  period: SaltTablePeriod;
  columns: SaltPivotColumn[];
  rows: SaltPivotRow[];
  dataMinDate: string | null;
  dataMaxDate: string | null;
  sourceDayCount: number;
  valueUnit: string;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000;
const CURRENT_MONTH = new Date().getMonth() + 1;
const WINTER_MONTHS = [11, 12, 1, 2, 3] as const;
const SUMMER_MONTHS = [4, 5, 6, 7, 8, 9, 10] as const;
const MONTHS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
] as const;
const TABS: Array<DashboardTabOption<SaltsTab>> = [
  { value: "wx-adj-scrapes", label: "Salt Model", description: "Daily table + flow heatmap" },
  { value: "salt-plots", label: "Salt Plots", description: "Facility seasonality + flows" },
  { value: "salt-fc", label: "Salt Fc", description: "Weekly EIA storage forecast" },
];
const SALTS_TAB_VIEW: Record<SaltsTab, string> = {
  "wx-adj-scrapes": "gas-salt-model",
  "salt-plots": "gas-salt-plots",
  "salt-fc": "gas-salt-forecast",
};
const SALTS_CHROME: Record<SaltsTab, SaltsChrome> = {
  "wx-adj-scrapes": {
    title: "Salt Model",
    subtitle:
      "Trader-first daily salt dashboard with regional totals, facility flows, and heatmapped history.",
    footer: "South Central salt nominations | Source: AWS SQL Server (GenscapeDataFeed)",
    badges: [
      { label: "Primary Signal", value: "South Central Salt Nominations" },
      { label: "Mode", value: "Daily Table + Flow Monitor" },
    ],
  },
  "salt-plots": {
    title: "Salt Model",
    subtitle:
      "Facility-level seasonal and flow monitoring for Golden Triangle, Pine Prairie, Perryville, Southern Pines, and Eminence.",
    footer: "Salt facility inventories and flows | Source: AWS SQL Server (GenscapeDataFeed)",
    badges: [
      { label: "Facilities", value: "GT | Pine Prairie | Perryville | Southern Pines | Eminence" },
      { label: "Mode", value: "Seasonality + Injections/Withdrawals" },
    ],
  },
  "salt-fc": {
    title: "Salt Model",
    subtitle:
      "Weekly EIA storage forecast model using daily salt nominations and linear blend diagnostics.",
    footer:
      "EIA weekly underground salt storage + daily salt nominations | Source: AWS SQL Server + AWS PostgreSQL + EIA API",
    badges: [
      { label: "Target", value: "EIA Weekly Salt Working Gas Change" },
      { label: "Mode", value: "Weekly forecast + backtest diagnostics" },
    ],
  },
};

export function parseSaltsTabFromView(value: string | null): SaltsTab | null {
  if (!value) return null;
  const match = (Object.entries(SALTS_TAB_VIEW) as Array<[SaltsTab, string]>).find(
    ([, view]) => view === value,
  );
  return match?.[0] ?? null;
}

export function viewForSaltsTab(tab: SaltsTab): string {
  return SALTS_TAB_VIEW[tab];
}

export function saltsChromeForTab(tab: SaltsTab): SaltsChrome {
  return SALTS_CHROME[tab];
}

const FACILITY_SCOPE_TABS: Array<DashboardTabOption<FacilityScope>> = [
  { value: "focused", label: "Focused" },
  { value: "all", label: "All Facilities" },
];
const TABLE_PERIOD_TABS: Array<DashboardTabOption<SaltTablePeriod>> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];
const SALT_PLOTS_LOOKBACK_PRESETS = [
  { label: "1GY", value: 365 },
  { label: "3GY", value: 1095 },
  { label: "5GY", value: 2200 },
] as const;
const SALT_PLOTS_FLOW_WINDOWS: readonly SaltModelFlowWindow[] = [30, 45, 60, 90] as const;
const SEASON_OPTIONS: Array<{ value: SeasonKey; label: string }> = [
  { value: "summer", label: "Summer" },
  { value: "winter", label: "Winter" },
];
const SALTS_METRICS: Array<{ value: SaltsMetric; label: string }> = [
  { value: "salts_total", label: "Total" },
  { value: "salts_tx", label: "TX" },
  { value: "salts_la", label: "LA" },
  { value: "salts_ms", label: "MS" },
  { value: "salts_al", label: "AL" },
];
const SALT_FACILITY_METRICS: SaltFacilityOption[] = [
  { value: "golden_triangle", label: "Golden Triangle", region: "TX" },
  { value: "keystone", label: "Keystone", region: "TX" },
  { value: "moss_bluff", label: "Moss Bluff", region: "TX" },
  { value: "tres_palacios", label: "Tres Palacios", region: "TX" },
  { value: "arcadia", label: "Arcadia", region: "LA" },
  { value: "boardwalk", label: "Boardwalk", region: "LA" },
  { value: "bobcat", label: "Bobcat", region: "LA" },
  { value: "egan", label: "Egan", region: "LA" },
  { value: "jefferson_island", label: "Jefferson Island", region: "LA" },
  { value: "la_storage", label: "LA Storage", region: "LA" },
  { value: "perryville", label: "Perryville", region: "LA" },
  { value: "pine_prarie", label: "Pine Prairie", region: "LA" },
  { value: "eminence", label: "Eminence", region: "MS" },
  { value: "leaf_river", label: "Leaf River", region: "MS" },
  { value: "mississippi_hub", label: "Mississippi Hub", region: "MS" },
  { value: "petal", label: "Petal", region: "MS" },
  { value: "southern_pines", label: "Southern Pines", region: "MS" },
  { value: "bay_gas", label: "Bay Gas", region: "AL" },
];
const FOCUSED_FACILITY_METRICS: readonly SaltFacilityMetric[] = [
  "golden_triangle",
  "pine_prarie",
  "perryville",
  "southern_pines",
  "eminence",
] as const;
const SALT_PLOTS_FACILITY_METRICS: readonly SaltInventoryFacilityMetric[] = [
  "golden_triangle",
  "pine_prarie",
  "perryville",
  "southern_pines",
  "eminence",
] as const;
const WEATHER_METRICS_BY_SEASON: Record<
  SeasonKey,
  Array<{ value: WeatherMetric; label: string }>
> = {
  winter: [
    { value: "southcentral_gas_hdd", label: "South Central Gas HDD" },
    { value: "conus_gas_hdd", label: "CONUS Gas HDD" },
  ],
  summer: [
    { value: "southcentral_population_cdd", label: "South Central CDD" },
    { value: "conus_population_cdd", label: "CONUS CDD" },
  ],
};
const WEATHER_PLOT_ORDER: Record<WeatherMetric, number> = {
  conus_gas_hdd: 0,
  southcentral_gas_hdd: 1,
  conus_population_cdd: 0,
  southcentral_population_cdd: 1,
};
const SEASON_ROLE_STYLES: Record<
  SeasonRole,
  { color: string; pointOpacity: number; lineWidth: number; lineDasharray?: string }
> = {
  current: { color: "#ef4444", pointOpacity: 0.88, lineWidth: 2.2 },
  prior: { color: "#38bdf8", pointOpacity: 0.58, lineWidth: 1.8, lineDasharray: "5 4" },
  history: { color: "#64748b", pointOpacity: 0.18, lineWidth: 1.2 },
};

const labelClass = "mb-1 block text-[10px] font-semibold uppercase text-gray-500";
const controlClass =
  "h-10 w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-sm font-semibold text-gray-100 outline-none transition-colors focus:border-gray-500";

function initialSeason(): SeasonKey {
  return (WINTER_MONTHS as readonly number[]).includes(CURRENT_MONTH) ? "winter" : "summer";
}

function validMonths(season: SeasonKey): readonly number[] {
  return season === "winter" ? WINTER_MONTHS : SUMMER_MONTHS;
}

function initialMonth(season: SeasonKey): number {
  const months = validMonths(season);
  return months.includes(CURRENT_MONTH) ? CURRENT_MONTH : months[0];
}

function monthLabel(month: number): string {
  return MONTHS.find((item) => item.value === month)?.label ?? String(month);
}

function metricLabel(metric: WeatherMetric | SaltsMetric): string {
  for (const option of WEATHER_METRICS_BY_SEASON.winter) {
    if (option.value === metric) return option.label;
  }
  for (const option of WEATHER_METRICS_BY_SEASON.summer) {
    if (option.value === metric) return option.label;
  }
  return SALTS_METRICS.find((item) => item.value === metric)?.label ?? metric;
}

function plotSortValue(plot: WxAdjPlot): number {
  const saltsIndex = SALTS_METRICS.findIndex((item) => item.value === plot.saltsMetric);
  const normalizedSaltsIndex = saltsIndex === -1 ? SALTS_METRICS.length : saltsIndex;
  return normalizedSaltsIndex * 10 + WEATHER_PLOT_ORDER[plot.weatherMetric];
}

function fmtNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function fmtAxisTick(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return value.toFixed(0);
  return value.toFixed(1);
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function fmtChange(value: number | null | undefined, digits: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const formatted = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function isoDateFromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const nextDate = new Date(date.getTime());
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function shiftIsoDate(date: string, days: number): string | null {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return isoDateFromUtc(addUtcDays(parsed, days));
}

function saltFlowMmcf(row: WxAdjDailyRow, metric: SaltFlowMetric): number | null {
  const value = row.salts[metric];
  return value === null || value === undefined || !Number.isFinite(value) ? null : value * 1000;
}

function tableMetricValue(row: WxAdjDailyRow, metric: SaltTableMetricOption): number | null {
  if (metric.kind === "price") {
    const value = row.gas[metric.value as NextDayGasPriceMetric];
    return value === null || value === undefined || !Number.isFinite(value) ? null : value;
  }
  return saltFlowMmcf(row, metric.value as SaltFlowMetric);
}

function saltInventoryFacilityOption(metric: SaltInventoryFacilityMetric): SaltFacilityOption {
  return SALT_FACILITY_METRICS.find((item) => item.value === metric)!;
}

function sortedTableRows(rows: WxAdjDailyRow[]): WxAdjDailyRow[] {
  return [...rows].sort((left, right) => left.date.localeCompare(right.date));
}

function maxDate(rows: WxAdjDailyRow[]): string | null {
  return rows.map((row) => row.date).sort().at(-1) ?? null;
}

function minDate(rows: WxAdjDailyRow[]): string | null {
  return rows.map((row) => row.date).sort().at(0) ?? null;
}

function avgValues(values: Array<number | null>): number | null {
  const finiteValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!finiteValues.length) return null;
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function percentileRank(value: number | null, values: Array<number | null>): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const finiteValues = values.filter((item): item is number => item !== null && Number.isFinite(item));
  if (finiteValues.length < 3) return null;
  const belowOrEqual = finiteValues.filter((item) => item <= value).length;
  return Math.round((belowOrEqual / finiteValues.length) * 100);
}

function ordinalPercentile(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  const normalized = Math.max(0, Math.min(100, Math.round(value)));
  const suffix =
    normalized % 100 >= 11 && normalized % 100 <= 13
      ? "th"
      : normalized % 10 === 1
        ? "st"
        : normalized % 10 === 2
          ? "nd"
          : normalized % 10 === 3
            ? "rd"
            : "th";
  return `${normalized}${suffix}`;
}

function fmtPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${fmtNumber(value, 0)}%`;
}

function fmtMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString()} ms`;
}

function saltModelRegime(latestDate: string | null): SaltModelRegime | null {
  if (!latestDate) return null;
  const year = Number.parseInt(latestDate.slice(0, 4), 10);
  const month = Number.parseInt(latestDate.slice(5, 7), 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;

  if (month >= 4 && month <= 10) {
    return {
      label: "Injection (Apr-Oct)",
      startDate: `${year}-04-01`,
      endDate: `${year}-10-31`,
      targetDate: `${year}-11-01`,
    };
  }

  const winterStartYear = month >= 11 ? year : year - 1;
  return {
    label: "Withdrawal (Nov-Mar)",
    startDate: `${winterStartYear}-11-01`,
    endDate: `${winterStartYear + 1}-03-31`,
    targetDate: `${winterStartYear + 1}-04-01`,
  };
}

function daysBetween(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - start) / 86_400_000));
}

function sortedInventoryRows(rows: SaltInventoryDailyRow[]): SaltInventoryDailyRow[] {
  return [...rows].sort((left, right) => left.date.localeCompare(right.date));
}

function maxInventoryDate(rows: SaltInventoryDailyRow[]): string | null {
  return rows.map((row) => row.date).sort().at(-1) ?? null;
}

function minInventoryDate(rows: SaltInventoryDailyRow[]): string | null {
  return rows.map((row) => row.date).sort().at(0) ?? null;
}

function inventoryFacilityValues(
  row: SaltInventoryDailyRow,
  metric: SaltInventoryFacilityMetric,
): SaltInventoryFacilityValues | null {
  return row.facilities[metric] ?? null;
}

function inventoryBcf(row: SaltInventoryDailyRow, metric: SaltInventoryFacilityMetric): number | null {
  return inventoryFacilityValues(row, metric)?.inventoryBcf ?? null;
}

function inventoryDailyFlowMmcf(
  row: SaltInventoryDailyRow,
  metric: SaltInventoryFacilityMetric,
): number | null {
  return inventoryFacilityValues(row, metric)?.dailyFlowMmcf ?? null;
}

function filterInventoryRowsByLookbackDays(
  rows: SaltInventoryDailyRow[],
  lookbackDays: number,
): SaltInventoryDailyRow[] {
  const latestDate = maxInventoryDate(rows);
  if (!latestDate) return [];
  const cutoff = shiftIsoDate(latestDate, -(lookbackDays - 1));
  return cutoff ? rows.filter((row) => row.date >= cutoff) : rows;
}

function filterInventoryRowsByFlowWindow(
  rows: SaltInventoryDailyRow[],
  flowWindow: number,
): SaltInventoryDailyRow[] {
  const latestDate = maxInventoryDate(rows);
  if (!latestDate) return [];
  const cutoff = shiftIsoDate(latestDate, -(flowWindow - 1));
  return cutoff ? rows.filter((row) => row.date >= cutoff) : rows;
}

function latestInventoryValue(
  rows: SaltInventoryDailyRow[],
  metric: SaltInventoryFacilityMetric,
  selector: (row: SaltInventoryDailyRow, metric: SaltInventoryFacilityMetric) => number | null,
): { row: SaltInventoryDailyRow; value: number } | null {
  for (const row of [...rows].reverse()) {
    const value = selector(row, metric);
    if (value !== null && Number.isFinite(value)) return { row, value };
  }
  return null;
}

function previousInventoryValue(
  rows: SaltInventoryDailyRow[],
  metric: SaltInventoryFacilityMetric,
): number | null {
  const values = rows
    .map((row) => inventoryBcf(row, metric))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  return values.length >= 2 ? values[values.length - 2] : null;
}

function storageSeasonStartYear(date: string): number | null {
  const year = Number.parseInt(date.slice(0, 4), 10);
  const month = Number.parseInt(date.slice(5, 7), 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return month >= 4 ? year : year - 1;
}

function currentStorageSeasonStartYear(): number {
  const now = new Date();
  const year = now.getUTCFullYear();
  return now.getUTCMonth() + 1 >= 4 ? year : year - 1;
}

function storageSeasonDayIndex(date: string): number | null {
  const startYear = storageSeasonStartYear(date);
  if (startYear === null) return null;
  return daysBetween(`${startYear}-04-01`, date);
}

function storageSeasonDayLabel(seasonDay: number): string {
  const date = new Date(Date.UTC(2021, 3, 1));
  date.setUTCDate(date.getUTCDate() + seasonDay);
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
  });
}

function historicalInventoryTargetBcf({
  rows,
  metric,
  latestDate,
  regime,
  seasonalYears,
}: {
  rows: SaltInventoryDailyRow[];
  metric: SaltInventoryFacilityMetric;
  latestDate: string | null;
  regime: SaltModelRegime | null;
  seasonalYears: number;
}): number | null {
  if (!latestDate || !regime) return null;
  const currentStartYear = storageSeasonStartYear(latestDate);
  if (currentStartYear === null) return null;
  const targetMmDd = regime.targetDate.slice(5);
  const values = rows
    .filter((row) => {
      const seasonStart = storageSeasonStartYear(row.date);
      return (
        row.mmDd === targetMmDd &&
        seasonStart !== null &&
        seasonStart < currentStartYear &&
        seasonStart >= currentStartYear - Math.max(1, seasonalYears)
      );
    })
    .map((row) => inventoryBcf(row, metric));
  return avgValues(values);
}

function buildSaltPlotsSeasonalSeries({
  rows,
  metric,
  latestDate,
  seasonalYears,
}: {
  rows: SaltInventoryDailyRow[];
  metric: SaltInventoryFacilityMetric;
  latestDate: string | null;
  seasonalYears: number;
}): SaltPlotsSeasonalPoint[] {
  if (!latestDate) return [];
  const currentStartYear = storageSeasonStartYear(latestDate);
  if (currentStartYear === null) return [];

  const bySeasonDay = new Map<
    number,
    {
      currentInventory: number | null;
      lastYearInventory: number | null;
      history: number[];
    }
  >();

  for (const row of rows) {
    const seasonStart = storageSeasonStartYear(row.date);
    const seasonDay = storageSeasonDayIndex(row.date);
    const value = inventoryBcf(row, metric);
    if (seasonStart === null || seasonDay === null || value === null || seasonDay < 0 || seasonDay > 366) {
      continue;
    }

    const point =
      bySeasonDay.get(seasonDay) ??
      {
        currentInventory: null,
        lastYearInventory: null,
        history: [],
      };
    if (seasonStart === currentStartYear) {
      point.currentInventory = value;
    } else if (seasonStart === currentStartYear - 1) {
      point.lastYearInventory = value;
    } else if (
      seasonStart < currentStartYear - 1 &&
      seasonStart >= currentStartYear - Math.max(2, seasonalYears + 1)
    ) {
      point.history.push(value);
    }
    bySeasonDay.set(seasonDay, point);
  }

  return Array.from(bySeasonDay.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([seasonDay, point]) => ({
      seasonDay,
      label: storageSeasonDayLabel(seasonDay),
      currentInventory: point.currentInventory,
      lastYearInventory: point.lastYearInventory,
      historicalAverage: avgValues(point.history),
      historicalMin: point.history.length ? Math.min(...point.history) : null,
      historicalMax: point.history.length ? Math.max(...point.history) : null,
      historicalCount: point.history.length,
    }));
}

function buildSaltPlotsFlowSeries({
  rows,
  metric,
  latestDate,
  flowWindow,
}: {
  rows: SaltInventoryDailyRow[];
  metric: SaltInventoryFacilityMetric;
  latestDate: string | null;
  flowWindow: number;
}): SaltPlotsFlowPoint[] {
  if (!latestDate) return [];
  const regime = saltModelRegime(latestDate);
  const currentSeasonRows = regime
    ? rows.filter((row) => row.date >= regime.startDate && row.date <= latestDate)
    : rows;
  let cumulative = 0;
  const cumulativeByDate = new Map<string, number | null>();

  for (const row of currentSeasonRows) {
    const flow = inventoryDailyFlowMmcf(row, metric);
    if (flow !== null) cumulative += flow;
    cumulativeByDate.set(row.date, cumulative);
  }

  return filterInventoryRowsByFlowWindow(currentSeasonRows, flowWindow).map((row) => ({
    date: row.date,
    label: row.date.slice(5),
    dailyFlow: inventoryDailyFlowMmcf(row, metric),
    seasonCumFlow: cumulativeByDate.get(row.date) ?? null,
  }));
}

function sameSeasonPriorYearInventory(
  rows: SaltInventoryDailyRow[],
  metric: SaltInventoryFacilityMetric,
  latestDate: string | null,
): number | null {
  if (!latestDate) return null;
  const latestSeasonStart = storageSeasonStartYear(latestDate);
  const latestSeasonDay = storageSeasonDayIndex(latestDate);
  if (latestSeasonStart === null || latestSeasonDay === null) return null;
  const prior = rows.find(
    (row) =>
      storageSeasonStartYear(row.date) === latestSeasonStart - 1 &&
      storageSeasonDayIndex(row.date) === latestSeasonDay,
  );
  return prior ? inventoryBcf(prior, metric) : null;
}

function seasonalEnvelopePercent(
  latestInventory: number | null,
  historicalMin: number | null | undefined,
  historicalMax: number | null | undefined,
  historicalCount: number | null | undefined,
  seasonalYears: number,
): number | null {
  const minimumHistoryCount = Math.min(3, Math.max(2, seasonalYears));
  if (
    latestInventory === null ||
    historicalMin === null ||
    historicalMin === undefined ||
    historicalMax === null ||
    historicalMax === undefined ||
    historicalCount === null ||
    historicalCount === undefined ||
    historicalCount < minimumHistoryCount ||
    !Number.isFinite(latestInventory) ||
    !Number.isFinite(historicalMin) ||
    !Number.isFinite(historicalMax) ||
    !Number.isFinite(historicalCount)
  ) {
    return null;
  }
  const range = historicalMax - historicalMin;
  if (range <= 0) return null;
  return ((latestInventory - historicalMin) / range) * 100;
}

function buildSaltPlotsFacilitySummaries({
  rows,
  seasonalYears,
  flowWindow,
}: {
  rows: SaltInventoryDailyRow[];
  seasonalYears: number;
  flowWindow: number;
}): SaltPlotsFacilitySummary[] {
  const sortedRows = sortedInventoryRows(rows);
  const latestDate = maxInventoryDate(sortedRows);
  const regime = saltModelRegime(latestDate);
  const currentSeasonRows = regime
    ? sortedRows.filter((row) => row.date >= regime.startDate && row.date <= latestDate!)
    : [];
  const daysToTarget = daysBetween(latestDate, regime?.targetDate ?? null);

  return SALT_PLOTS_FACILITY_METRICS.map((metric) => {
    const facility = saltInventoryFacilityOption(metric);
    const latestInventory = latestInventoryValue(sortedRows, metric, inventoryBcf);
    const latestFlow = latestInventoryValue(sortedRows, metric, inventoryDailyFlowMmcf);
    const previousInventory = previousInventoryValue(sortedRows, metric);
    const directDelta =
      latestInventory?.row.facilities[metric]?.inventoryDeltaBcf ?? null;
    const inventoryDoD =
      latestInventory?.value !== undefined && previousInventory !== null
        ? latestInventory.value - previousInventory
        : directDelta;
    const target = historicalInventoryTargetBcf({
      rows: sortedRows,
      metric,
      latestDate,
      regime,
      seasonalYears,
    });
    const requiredPace =
      target !== null &&
      latestInventory?.value !== undefined &&
      daysToTarget !== null &&
      daysToTarget > 0
        ? ((target - latestInventory.value) * 1000) / daysToTarget
        : null;
    const priorYearInventory = sameSeasonPriorYearInventory(sortedRows, metric, latestDate);
    const latestFacilityValues = latestInventory?.row.facilities[metric] ?? null;
    const seasonalSeries = buildSaltPlotsSeasonalSeries({
      rows: sortedRows,
      metric,
      latestDate,
      seasonalYears,
    });
    const latestSeasonDay = latestInventory ? storageSeasonDayIndex(latestInventory.row.date) : null;
    const latestSeasonPoint =
      latestSeasonDay === null
        ? null
        : seasonalSeries.find((point) => point.seasonDay === latestSeasonDay) ?? null;
    const flowSeries = buildSaltPlotsFlowSeries({
      rows: sortedRows,
      metric,
      latestDate,
      flowWindow,
    });

    return {
      metric,
      label: facility.label,
      region: facility.region,
      latestDate: latestInventory?.row.date ?? latestDate,
      latestInventory: latestInventory?.value ?? null,
      inventoryDoD,
      latestFlow: latestFlow?.value ?? null,
      seasonToDateFlow: sumValues(currentSeasonRows.map((row) => inventoryDailyFlowMmcf(row, metric))),
      requiredPace,
      requiredPaceTarget: target,
      daysToTarget,
      inventoryPercentile: percentileRank(
        latestInventory?.value ?? null,
        sortedRows.map((row) => inventoryBcf(row, metric)),
      ),
      yoyInventoryDelta:
        latestInventory?.value !== undefined && priorYearInventory !== null
          ? latestInventory.value - priorYearInventory
          : null,
      capacityBcf: latestFacilityValues?.designCapBcf ?? latestFacilityValues?.operationalCapBcf ?? null,
      seasonalPercent: seasonalEnvelopePercent(
        latestInventory?.value ?? null,
        latestSeasonPoint?.historicalMin,
        latestSeasonPoint?.historicalMax,
        latestSeasonPoint?.historicalCount,
        seasonalYears,
      ),
      seasonalRows: sortedRows,
      flowWindowRows: filterInventoryRowsByFlowWindow(sortedRows, flowWindow),
      seasonalSeries,
      flowSeries,
    };
  });
}

function flowTone(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || Math.abs(value) < 1e-9) {
    return "text-gray-300";
  }
  return value > 0 ? "text-emerald-300" : "text-rose-300";
}

function fmtSignedInteger(value: number | null | undefined): string {
  return fmtChange(value, 0);
}

function fmtBcfDirect(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return fmtNumber(value, 1);
}

function fmtSignedBcf(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return fmtChange(value, 1);
}

function saltTableMetricOptions(facilityScope: FacilityScope): SaltTableMetricOption[] {
  const totalOptions = SALTS_METRICS.map((metric, index) => ({
    value: metric.value,
    label: metric.label,
    group: "Salts - Totals" as const,
    region: metric.label,
    sortIndex: index,
    kind: "flow" as const,
  }));
  const visibleFacilities =
    facilityScope === "focused"
      ? FOCUSED_FACILITY_METRICS
      : SALT_FACILITY_METRICS.map((facility) => facility.value);
  const facilityOptions = visibleFacilities.map((facilityKey, index) => {
    const facility = SALT_FACILITY_METRICS.find((item) => item.value === facilityKey)!;
    return {
      value: facility.value,
      label: facility.label,
      group: "Salts - Facilities" as const,
      region: facility.region,
      sortIndex: SALTS_METRICS.length + index,
      kind: "flow" as const,
    };
  });
  const gasOptions = NEXT_DAY_GAS_PRICE_METRICS.map((metric, index) => ({
    value: metric.value,
    label: metric.label,
    group: "Gas - Next Day Cash" as const,
    region: metric.symbol,
    sortIndex: SALTS_METRICS.length + facilityOptions.length + index,
    kind: "price" as const,
  }));

  return [...totalOptions, ...facilityOptions, ...gasOptions];
}

function weekEndingFriday(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  const day = parsed.getUTCDay();
  return isoDateFromUtc(addUtcDays(parsed, (5 - day + 7) % 7));
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function formatTableColumnLabel(period: SaltTablePeriod, key: string): string {
  if (period === "daily") {
    const parsed = new Date(`${key}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return key;
    return parsed.toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "2-digit",
    });
  }
  if (period === "weekly") {
    const parsed = new Date(`${key}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return key;
    return `WE ${parsed.toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "2-digit",
    })}`;
  }
  const [year, month] = key.split("-");
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  if (Number.isNaN(parsed.getTime())) return key;
  return parsed.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    year: "2-digit",
  });
}

function nonNullDifference(current: number | null, previous: number | null): number | null {
  return current !== null && previous !== null ? current - previous : null;
}

function sumValues(values: Array<number | null>): number | null {
  const finiteValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!finiteValues.length) return null;
  return finiteValues.reduce((sum, value) => sum + value, 0);
}

function buildDailyPivotValues(
  rows: WxAdjDailyRow[],
  metrics: SaltTableMetricOption[],
): Map<SaltTableMetric, Map<string, number | null>> {
  const valueByMetric = new Map<SaltTableMetric, Map<string, number | null>>();
  for (const metric of metrics) {
    valueByMetric.set(metric.value, new Map());
  }
  for (const row of rows) {
    for (const metric of metrics) {
      valueByMetric.get(metric.value)!.set(row.date, tableMetricValue(row, metric));
    }
  }
  return valueByMetric;
}

function buildAggregatedPivotValues({
  rows,
  metrics,
  period,
}: {
  rows: WxAdjDailyRow[];
  metrics: SaltTableMetricOption[];
  period: Extract<SaltTablePeriod, "weekly" | "monthly">;
}): Map<SaltTableMetric, Map<string, number | null>> {
  const groupedRows = new Map<string, WxAdjDailyRow[]>();
  for (const row of rows) {
    const key = period === "weekly" ? weekEndingFriday(row.date) : monthKey(row.date);
    groupedRows.set(key, [...(groupedRows.get(key) ?? []), row]);
  }

  const valueByMetric = new Map<SaltTableMetric, Map<string, number | null>>();
  for (const metric of metrics) {
    const valuesByPeriod = new Map<string, number | null>();
    for (const [key, periodRows] of groupedRows) {
      valuesByPeriod.set(
        key,
        metric.kind === "price"
          ? avgValues(periodRows.map((row) => tableMetricValue(row, metric)))
          : sumValues(periodRows.map((row) => tableMetricValue(row, metric))),
      );
    }
    valueByMetric.set(metric.value, valuesByPeriod);
  }
  return valueByMetric;
}

function sortedPeriodKeys(valueByMetric: Map<SaltTableMetric, Map<string, number | null>>): string[] {
  return Array.from(
    new Set(
      Array.from(valueByMetric.values()).flatMap((valuesByPeriod) => Array.from(valuesByPeriod.keys())),
    ),
  ).sort((left, right) => right.localeCompare(left));
}

function buildChangeValues(
  valuesByPeriod: Map<string, number | null>,
  sortedKeysAscending: string[],
  lookbackPeriods = 1,
): Map<string, number | null> {
  const changeValues = new Map<string, number | null>();
  sortedKeysAscending.forEach((key, index) => {
    const previousKey = sortedKeysAscending[index - lookbackPeriods];
    changeValues.set(
      key,
      previousKey ? nonNullDifference(valuesByPeriod.get(key) ?? null, valuesByPeriod.get(previousKey) ?? null) : null,
    );
  });
  return changeValues;
}

function buildSaltPivotTable(
  rows: WxAdjDailyRow[],
  facilityScope: FacilityScope,
  period: SaltTablePeriod,
): SaltPivotTablePayload {
  const sortedRows = sortedTableRows(rows);
  const dataMaxDate = maxDate(sortedRows);
  const dataMinDate = minDate(sortedRows);
  const metrics = saltTableMetricOptions(facilityScope);
  const valueByMetric =
    period === "daily"
      ? buildDailyPivotValues(sortedRows, metrics)
      : buildAggregatedPivotValues({ rows: sortedRows, metrics, period });
  const sortedKeysDescending = sortedPeriodKeys(valueByMetric);
  const selectedKeys = sortedKeysDescending.slice(
    0,
    period === "daily" ? 14 : period === "weekly" ? 6 : 12,
  );
  const sortedKeysAscending = [...sortedKeysDescending].reverse();
  const columns = selectedKeys.map((key) => ({
    key,
    label: formatTableColumnLabel(period, key),
  }));
  const tableRows = metrics.flatMap((metric) => {
    const valuesByPeriod = valueByMetric.get(metric.value) ?? new Map<string, number | null>();
    const primaryValues = Object.fromEntries(
      selectedKeys.map((key) => [key, valuesByPeriod.get(key) ?? null]),
    ) as Record<string, number | null>;
    const changeRows =
      period === "monthly"
        ? [
            { measure: "MoM", values: buildChangeValues(valuesByPeriod, sortedKeysAscending, 1) },
            { measure: "YoY", values: buildChangeValues(valuesByPeriod, sortedKeysAscending, 12) },
          ]
        : [
            {
              measure: period === "daily" ? "DoD" : "WoW",
              values: buildChangeValues(valuesByPeriod, sortedKeysAscending, 1),
            },
          ];
    const rowsForMetric: SaltPivotRow[] = [
      {
        key: `${period}:${metric.value}:${metric.kind}`,
        group: metric.group,
        region: metric.region,
        metricLabel: metric.label,
        measure:
          metric.kind === "price"
            ? period === "daily"
              ? "Price"
              : "Avg Price"
            : period === "daily"
              ? "Flow"
              : "Flow Sum",
        values: primaryValues,
        heatValues: selectedKeys
          .map((key) => primaryValues[key])
          .filter((value): value is number => value !== null && Number.isFinite(value)),
        isChange: false,
        valueKind: metric.kind,
      },
      ...changeRows.map((changeRow) => {
        const values = Object.fromEntries(
          selectedKeys.map((key) => [key, changeRow.values.get(key) ?? null]),
        ) as Record<string, number | null>;
        return {
          key: `${period}:${metric.value}:${changeRow.measure.toLowerCase()}`,
          group: metric.group,
          region: metric.region,
          metricLabel: metric.label,
          measure: changeRow.measure,
          values,
          heatValues: selectedKeys
            .map((key) => values[key])
            .filter((value): value is number => value !== null && Number.isFinite(value)),
          isChange: true,
          valueKind: metric.kind,
        };
      }),
    ];
    return rowsForMetric;
  }).filter((row) => row.heatValues.length > 0 || row.key.endsWith(":flow"));

  return {
    period,
    columns,
    rows: tableRows,
    dataMinDate,
    dataMaxDate,
    sourceDayCount: sortedRows.length,
    valueUnit: period === "daily" ? "MMcf/d + $/MMBtu" : "MMcf + avg $/MMBtu",
  };
}

function seasonSortValue(label: string): number {
  const match = label.match(/^(XH|JV)-(\d{2})$/);
  if (!match) return 0;
  const year = Number.parseInt(match[2], 10);
  const seasonOffset = match[1] === "XH" ? 0 : 1;
  return year * 10 + seasonOffset;
}

function seasonRoleForIndex(index: number): SeasonRole {
  if (index === 0) return "current";
  if (index === 1) return "prior";
  return "history";
}

function buildSeasonLegend(seasonLabels: string[]): SeasonLegendItem[] {
  const historyCount = Math.max(0, seasonLabels.length - 2);
  const items: SeasonLegendItem[] = [
    {
      key: "current",
      label: seasonLabels[0] ? `Current ${seasonLabels[0]}` : "Current",
      color: SEASON_ROLE_STYLES.current.color,
      active: Boolean(seasonLabels[0]),
    },
    {
      key: "prior",
      label: seasonLabels[1] ? `Prior ${seasonLabels[1]}` : "Prior",
      color: SEASON_ROLE_STYLES.prior.color,
      active: Boolean(seasonLabels[1]),
    },
    {
      key: "history",
      label: historyCount === 1 ? "History 1 season" : `History ${historyCount} seasons`,
      color: SEASON_ROLE_STYLES.history.color,
      active: historyCount > 0,
    },
  ];
  return items.filter((item) => item.active);
}

function roundedDomainValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

function paddedAxisDomain(values: number[], minPadding = 0.1): AxisDomain {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) return [0, 1];

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const range = max - min;
  const padding = Math.max(range * 0.08, minPadding);
  const lower = min >= 0 ? Math.max(0, min - padding) : min - padding;
  const upper = max + padding;

  if (Math.abs(range) < 1e-9) {
    const singleValuePadding = Math.max(Math.abs(min) * 0.12, minPadding);
    const singleLower = min >= 0 ? Math.max(0, min - singleValuePadding) : min - singleValuePadding;
    return [
      roundedDomainValue(singleLower),
      roundedDomainValue(max + singleValuePadding),
    ];
  }

  return [roundedDomainValue(lower), roundedDomainValue(upper)];
}

function fitLinear(points: ChartPoint[], seasonLabel: string, color: string): RegressionLine | null {
  const valid = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (valid.length < 2) return null;

  const xMean = valid.reduce((sum, point) => sum + point.x, 0) / valid.length;
  const yMean = valid.reduce((sum, point) => sum + point.y, 0) / valid.length;
  const numerator = valid.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0);
  const denominator = valid.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0);
  if (Math.abs(denominator) < 1e-9) return null;

  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;
  const yVariance = valid.reduce((sum, point) => sum + (point.y - yMean) ** 2, 0);
  const residual = valid.reduce(
    (sum, point) => sum + (point.y - (slope * point.x + intercept)) ** 2,
    0,
  );
  const rSquared = yVariance === 0 ? null : 1 - residual / yVariance;
  const xValues = valid.map((point) => point.x);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);

  return {
    seasonLabel,
    color,
    rSquared,
    slope,
    intercept,
    data: [
      { x: xMin, y: slope * xMin + intercept },
      { x: xMax, y: slope * xMax + intercept },
    ],
  };
}

function buildPlotChart(plot: WxAdjPlot, lookbackYears: number): PlotChart {
  const points: ChartPoint[] = plot.points.map((point) => ({
    ...point,
    z: point.isRecent ? 72 : 28,
  }));
  const seasonLabels = Array.from(new Set(points.map((point) => point.seasonLabel))).sort(
    (left, right) => seasonSortValue(right) - seasonSortValue(left),
  );
  const highlighted = new Set(seasonLabels.slice(0, lookbackYears));
  const grouped = seasonLabels.map((seasonLabel, index) => {
    const groupPoints = points.filter((point) => point.seasonLabel === seasonLabel);
    const role = seasonRoleForIndex(index);
    const style = SEASON_ROLE_STYLES[role];
    return {
      seasonLabel,
      color: style.color,
      role,
      pointOpacity: style.pointOpacity,
      highlighted: highlighted.has(seasonLabel),
      points: groupPoints,
      fit: highlighted.has(seasonLabel) && role !== "history"
        ? fitLinear(groupPoints, seasonLabel, style.color)
        : null,
    };
  });
  const fitYValues = grouped.flatMap((group) => group.fit?.data.map((point) => point.y) ?? []);

  return {
    plot,
    grouped,
    xDomain: paddedAxisDomain(points.map((point) => point.x), 0.25),
    yDomain: paddedAxisDomain([...points.map((point) => point.y), ...fitYValues], 0.1),
  };
}

function makeApiUrl({
  season,
  month,
  lookbackYears,
  recentDays,
  tableLookbackMonths,
  saltPlotLookbackDays,
  includeInventory,
  modelDaily,
}: {
  season: SeasonKey;
  month: number;
  lookbackYears: number;
  recentDays: number;
  tableLookbackMonths?: number;
  saltPlotLookbackDays?: number;
  includeInventory?: boolean;
  modelDaily?: boolean;
}): string {
  const params = new URLSearchParams({
    season,
    month: String(month),
    lookbackYears: String(lookbackYears),
    recentDays: String(recentDays),
  });
  if (tableLookbackMonths) {
    params.set("tableLookbackMonths", String(tableLookbackMonths));
  }
  if (saltPlotLookbackDays) {
    params.set("saltPlotLookbackDays", String(saltPlotLookbackDays));
  }
  if (includeInventory) {
    params.set("includeInventory", "1");
  }
  if (modelDaily) {
    params.set("modelDaily", "1");
  }
  return `/api/salts/wx-adj-scrapes?${params.toString()}`;
}

function NoShape() {
  return null;
}

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload.find((item) => item.payload?.date)?.payload;
  if (!point) return null;

  return (
    <div className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-200 shadow-xl shadow-black/30">
      <div className="flex items-center gap-2 font-semibold text-gray-100">
        {fmtDate(point.date)}
        {point.isRecent && (
          <span className="rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] uppercase text-amber-200">
            Highlight
          </span>
        )}
      </div>
      <div className="mt-1 text-gray-500">{point.seasonLabel}</div>
      <div className="mt-2 grid grid-cols-[auto_auto] gap-x-3 gap-y-1 tabular-nums">
        <span className="text-gray-500">{metricLabel(point.weatherMetric as WeatherMetric)}</span>
        <span className="text-right text-gray-100">{fmtNumber(point.x)}</span>
        <span className="text-gray-500">{metricLabel(point.saltsMetric as SaltsMetric)}</span>
        <span className="text-right text-gray-100">{fmtNumber(point.y)}</span>
      </div>
      {point.weatherDataSource && (
        <div className="mt-2 text-[11px] text-gray-500">{point.weatherDataSource}</div>
      )}
    </div>
  );
}

function RecentPointShape({ cx, cy, fill }: { cx?: number; cy?: number; fill?: string }) {
  if (typeof cx !== "number" || typeof cy !== "number") return null;

  return (
    <g>
      <circle cx={cx} cy={cy} r={6.2} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={0.95} />
      <circle cx={cx} cy={cy} r={3.2} fill={fill ?? "#fbbf24"} opacity={0.95} />
    </g>
  );
}

function WxAdjScatterPanel({
  plotChart,
  hiddenSeasonRoles,
  heightClass = "h-[360px]",
  showFocusButton = true,
  onFocus,
}: {
  plotChart: PlotChart;
  hiddenSeasonRoles: Set<SeasonRole>;
  heightClass?: string;
  showFocusButton?: boolean;
  onFocus?: (plotId: string) => void;
}) {
  const xLabel = metricLabel(plotChart.plot.weatherMetric);
  const yLabel = metricLabel(plotChart.plot.saltsMetric);
  const visibleGroups = plotChart.grouped.filter((group) => !hiddenSeasonRoles.has(group.role));
  const fitGroups = visibleGroups.filter(
    (group): group is ChartGroup & { fit: RegressionLine } =>
      group.fit !== null && group.role !== "history",
  );
  const recentGroups = visibleGroups
    .map((group) => ({
      ...group,
      points: group.points.filter((point) => point.isRecent),
    }))
    .filter((group) => group.points.length > 0);
  const visiblePoints = visibleGroups.flatMap((group) => group.points);
  const visibleFitYValues = fitGroups.flatMap((group) => group.fit.data.map((point) => point.y));
  const xDomain = visiblePoints.length
    ? paddedAxisDomain(visiblePoints.map((point) => point.x), 0.25)
    : plotChart.xDomain;
  const yDomain = visiblePoints.length
    ? paddedAxisDomain([...visiblePoints.map((point) => point.y), ...visibleFitYValues], 0.1)
    : plotChart.yDomain;

  return (
    <div className="min-w-0 rounded-md border border-gray-800 bg-gray-950/35">
      <div className="flex flex-col gap-2 border-b border-gray-800 px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-semibold uppercase text-gray-100">
            {yLabel} vs {xLabel}
          </h3>
          <p className="mt-0.5 text-[10px] text-gray-500">
            {plotChart.plot.pointCount.toLocaleString()} matched days
          </p>
        </div>
        {showFocusButton && onFocus && (
          <button
            type="button"
            onClick={() => onFocus(plotChart.plot.id)}
            className="self-start rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            aria-label={`Focus ${yLabel} vs ${xLabel}`}
          >
            Focus
          </button>
        )}
      </div>

      <div className={`relative ${heightClass} min-w-0 p-2`}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={220}
          minHeight={1}
          initialDimension={{ width: 640, height: 360 }}
        >
          <ScatterChart margin={{ top: 10, right: 14, bottom: 22, left: 0 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              domain={xDomain}
              tick={{ fill: "#9ca3af", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              tickFormatter={(value) => fmtAxisTick(Number(value))}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              domain={yDomain}
              tick={{ fill: "#9ca3af", fontSize: 10 }}
              tickLine={{ stroke: "#374151" }}
              axisLine={{ stroke: "#374151" }}
              tickFormatter={(value) => fmtAxisTick(Number(value))}
            />
            <ZAxis type="number" dataKey="z" range={[20, 78]} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#64748b", strokeDasharray: "3 3" }} />
            {visibleGroups.map((group) => (
              <Scatter
                key={`${group.seasonLabel}-base`}
                name={group.seasonLabel}
                data={group.points.filter((point) => !point.isRecent)}
                fill={group.color}
                fillOpacity={group.pointOpacity}
                isAnimationActive={false}
              />
            ))}
            {recentGroups.map((group) => (
              <Scatter
                key={`${group.seasonLabel}-recent`}
                name={`${group.seasonLabel} highlight`}
                data={group.points}
                fill={group.color}
                shape={<RecentPointShape />}
                isAnimationActive={false}
              />
            ))}
            {fitGroups.map((group) => (
              <Scatter
                key={`${group.seasonLabel}-fit`}
                name={`${group.seasonLabel} fit`}
                data={group.fit.data}
                fill={group.color}
                line={{
                  stroke: group.color,
                  strokeWidth: SEASON_ROLE_STYLES[group.role].lineWidth,
                  strokeDasharray: SEASON_ROLE_STYLES[group.role].lineDasharray,
                }}
                shape={<NoShape />}
                isAnimationActive={false}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
        {visibleGroups.length === 0 && (
          <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-md bg-gray-950/70 text-xs font-semibold text-gray-500">
            All season groups hidden
          </div>
        )}
      </div>

      {fitGroups.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-gray-800 px-2 py-2 text-[10px] text-gray-500">
          {fitGroups.map((group) => (
            <div
              key={`${plotChart.plot.id}-${group.seasonLabel}`}
              className="min-w-[118px] rounded border border-gray-800 bg-gray-950/50 px-2 py-1"
            >
              <div className="font-semibold text-gray-300">{group.seasonLabel}</div>
              <div className="tabular-nums">
                m {fmtNumber(group.fit.slope, 2)} | R2 {fmtNumber(group.fit.rSquared, 2)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function quantile(values: number[], percentile: number): number | null {
  const sortedValues = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sortedValues.length) return null;
  const index = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function heatmapStyle(value: number | null, rowValues: number[]): CSSProperties {
  if (value === null || !Number.isFinite(value) || rowValues.length < 4) return {};

  const min = Math.min(...rowValues);
  const max = Math.max(...rowValues);
  if (Math.abs(max - min) < 1e-9) return {};

  const q25 = quantile(rowValues, 0.25);
  const q75 = quantile(rowValues, 0.75);
  if (q25 === null || q75 === null) return {};

  if (value >= q75) {
    const intensity = q75 === max ? 0.24 : 0.18 + Math.min(0.34, ((value - q75) / (max - q75)) * 0.34);
    return {
      backgroundColor: `rgba(16, 185, 129, ${intensity})`,
      color: "#ecfdf5",
    };
  }

  if (value <= q25) {
    const intensity = q25 === min ? 0.24 : 0.18 + Math.min(0.34, ((q25 - value) / (q25 - min)) * 0.34);
    return {
      backgroundColor: `rgba(244, 63, 94, ${intensity})`,
      color: "#fff1f2",
    };
  }

  return {};
}

function tableValueTone(value: number | null): string {
  if (value === null || !Number.isFinite(value) || Math.abs(value) < 1e-9) return "text-gray-400";
  return value > 0 ? "text-emerald-200" : "text-rose-200";
}

function fmtPivotValue(value: number | null, row: SaltPivotRow): string {
  return fmtChange(value, row.valueKind === "price" ? 2 : 0);
}

function periodChangeLabel(period: SaltTablePeriod): string {
  if (period === "daily") return "DoD";
  if (period === "weekly") return "WoW";
  return "MoM / YoY";
}

function saltPivotDisplayRows(table: SaltPivotTablePayload, showPeriodChange: boolean): SaltPivotRow[] {
  return showPeriodChange ? table.rows : table.rows.filter((row) => !row.isChange);
}

function ToggleButton({
  pressed,
  onClick,
  children,
  ariaLabel,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`h-7 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
        pressed
          ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100 hover:border-cyan-400/60"
          : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function SaltPivotTable({
  table,
  showPeriodChange,
  gradientEnabled,
}: {
  table: SaltPivotTablePayload;
  showPeriodChange: boolean;
  gradientEnabled: boolean;
}) {
  const displayRows = saltPivotDisplayRows(table, showPeriodChange);

  return (
    <div className="max-h-[640px] overflow-auto">
      <table className="w-full min-w-[1320px] border-separate border-spacing-0 text-xs text-gray-200">
        <thead className="sticky top-0 z-20 bg-gray-950 text-[11px] uppercase text-gray-500">
          <tr>
            <th className="sticky left-0 z-30 w-[220px] border-b border-gray-800 bg-gray-950 px-2 py-2 text-left font-bold">
              Metric
            </th>
            <th className="sticky left-[220px] z-30 w-[92px] border-b border-gray-800 bg-gray-950 px-2 py-2 text-left font-bold">
              Measure
            </th>
            {table.columns.map((column) => (
              <th
                key={column.key}
                className="min-w-[74px] border-b border-gray-800 px-2 py-2 text-right font-bold"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, index) => {
            const previousRow = displayRows[index - 1];
            const startsGroup =
              !previousRow || previousRow.group !== row.group || previousRow.region !== row.region;
            const borderClass = startsGroup ? "border-t border-gray-700" : "border-t border-gray-900";
            return (
              <tr key={row.key} className="hover:bg-gray-900/45">
                <td className={`sticky left-0 z-10 bg-[#0d1118] px-2 py-1.5 text-left ${borderClass}`}>
                  <div className="font-semibold text-gray-100">{row.metricLabel}</div>
                  <div className="mt-0.5 text-[10px] font-semibold uppercase text-gray-500">
                    {row.group} | {row.region}
                  </div>
                </td>
                <td
                  className={`sticky left-[220px] z-10 bg-[#0d1118] px-2 py-1.5 text-left font-semibold ${borderClass} ${
                    row.isChange ? "text-rose-300" : "text-gray-300"
                  }`}
                >
                  {row.measure}
                </td>
                {table.columns.map((column) => {
                  const value = row.values[column.key] ?? null;
                  return (
                    <td
                      key={`${row.key}:${column.key}`}
                      className={`px-2 py-1.5 text-right tabular-nums ${borderClass} ${tableValueTone(value)}`}
                      style={gradientEnabled ? heatmapStyle(value, row.heatValues) : undefined}
                    >
                      {fmtPivotValue(value, row)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SaltModelKpi({
  label,
  value,
  detail,
  valueClassName = "text-gray-100",
}: {
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/70 px-4 py-3">
      <p className="text-xs uppercase tracking-widest text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${valueClassName}`}>{value}</p>
      <p className="mt-1 min-h-4 text-xs text-gray-500">{detail}</p>
    </div>
  );
}

const SALT_PLOTS_CHART_COLORS = {
  historicalAverage: "#64748b",
  historicalEnvelope: "#334155",
  grid: "#1f2937",
  ticks: "#94a3b8",
  positive: "#10b981",
  negative: "#f43f5e",
} as const;

const rechartsTooltipStyle = {
  backgroundColor: "#020617",
  border: "1px solid #374151",
  borderRadius: "6px",
  color: "#e5e7eb",
  fontSize: "12px",
} satisfies CSSProperties;

function initialChartDimension(height: CSSProperties["height"]) {
  return {
    width: 640,
    height: typeof height === "number" ? height : 420,
  };
}

function SaltPlotsNumberInput({
  label,
  value,
  onChange,
  min,
  max,
  widthClassName = "w-[120px]",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  widthClassName?: string;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          if (Number.isInteger(parsed)) onChange(Math.max(min, Math.min(max, parsed)));
        }}
        className={`mt-1 h-10 rounded-md border border-gray-700 bg-gray-900 px-3 text-sm text-gray-100 outline-none transition-colors focus:border-cyan-500 ${widthClassName}`}
      />
    </label>
  );
}

function SaltPlotsPresetButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-10 rounded-md border px-3 text-xs font-semibold transition-colors ${
        active
          ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-200"
          : "border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500 hover:bg-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

function SaltPlotsSeasonalChart({
  summary,
  height = 210,
  showLegend = false,
}: {
  summary: SaltPlotsFacilitySummary;
  height?: CSSProperties["height"];
  showLegend?: boolean;
}) {
  const monthlyTicks = [0, 30, 61, 91, 122, 153, 183, 214, 244, 275, 306, 334, 365];
  const currentSeasonYear = storageSeasonStartYear(summary.latestDate ?? "") ?? currentStorageSeasonStartYear();
  const lastSeasonYear = currentSeasonYear - 1;
  const currentSeasonColor = seasonalYearColor(currentSeasonYear);
  const lastSeasonColor = seasonalYearColor(lastSeasonYear);

  return (
    <div className="w-full min-w-0 overflow-hidden" style={{ height, minHeight: height }}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={1}
        minHeight={1}
        debounce={50}
        initialDimension={initialChartDimension(height)}
      >
        <LineChart data={summary.seasonalSeries} margin={{ top: 8, right: 12, left: -10, bottom: 8 }}>
          <CartesianGrid stroke={SALT_PLOTS_CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="seasonDay"
            type="number"
            domain={[0, 365]}
            ticks={monthlyTicks}
            tickFormatter={storageSeasonDayLabel}
            tick={{ fill: SALT_PLOTS_CHART_COLORS.ticks, fontSize: 10 }}
            axisLine={{ stroke: "#374151" }}
            tickLine={{ stroke: "#374151" }}
          />
          <YAxis
            tick={{ fill: SALT_PLOTS_CHART_COLORS.ticks, fontSize: 10 }}
            axisLine={{ stroke: "#374151" }}
            tickLine={{ stroke: "#374151" }}
            width={42}
          />
          <Tooltip
            contentStyle={rechartsTooltipStyle}
            labelFormatter={(value) => storageSeasonDayLabel(Number(value))}
            formatter={(value, name) => [fmtBcfDirect(Number(value)), name]}
          />
          {showLegend && <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 11 }} />}
          <Line
            type="monotone"
            dataKey="historicalMax"
            name="5Y Hist High"
            dot={false}
            stroke={SALT_PLOTS_CHART_COLORS.historicalEnvelope}
            strokeOpacity={0.35}
            strokeWidth={1}
          />
          <Line
            type="monotone"
            dataKey="historicalMin"
            name="5Y Hist Low"
            dot={false}
            stroke={SALT_PLOTS_CHART_COLORS.historicalEnvelope}
            strokeOpacity={0.35}
            strokeWidth={1}
          />
          <Line
            type="monotone"
            dataKey="historicalAverage"
            name="5Y Hist Avg"
            dot={false}
            stroke={SALT_PLOTS_CHART_COLORS.historicalAverage}
            strokeDasharray="4 4"
            strokeWidth={1.4}
          />
          <Line
            type="monotone"
            dataKey="lastYearInventory"
            name={String(lastSeasonYear)}
            dot={false}
            stroke={lastSeasonColor}
            strokeWidth={1.8}
          />
          <Line
            type="monotone"
            dataKey="currentInventory"
            name={String(currentSeasonYear)}
            dot={false}
            stroke={currentSeasonColor}
            strokeWidth={2.2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SaltPlotsFlowChart({
  summary,
  height = 145,
  showCumulative = false,
}: {
  summary: SaltPlotsFacilitySummary;
  height?: number;
  showCumulative?: boolean;
}) {
  const currentSeasonYear = storageSeasonStartYear(summary.latestDate ?? "") ?? currentStorageSeasonStartYear();

  return (
    <div className="w-full min-w-0 overflow-hidden" style={{ height, minHeight: height }}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={1}
        minHeight={1}
        debounce={50}
        initialDimension={initialChartDimension(height)}
      >
        <ComposedChart data={summary.flowSeries} margin={{ top: 6, right: 12, left: -8, bottom: 6 }}>
          <CartesianGrid stroke={SALT_PLOTS_CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            tick={{ fill: SALT_PLOTS_CHART_COLORS.ticks, fontSize: 10 }}
            axisLine={{ stroke: "#374151" }}
            tickLine={{ stroke: "#374151" }}
          />
          <YAxis
            yAxisId="flow"
            tick={{ fill: SALT_PLOTS_CHART_COLORS.ticks, fontSize: 10 }}
            axisLine={{ stroke: "#374151" }}
            tickLine={{ stroke: "#374151" }}
            width={42}
          />
          {showCumulative && (
            <YAxis
              yAxisId="cum"
              orientation="right"
              tick={{ fill: SALT_PLOTS_CHART_COLORS.ticks, fontSize: 10 }}
              axisLine={{ stroke: "#374151" }}
              tickLine={{ stroke: "#374151" }}
              width={46}
            />
          )}
          <Tooltip
            contentStyle={rechartsTooltipStyle}
            formatter={(value, name) => [
              name === "Season Cum Flow" ? fmtNumber(Number(value), 0) : fmtSignedInteger(Number(value)),
              name,
            ]}
            labelFormatter={(value) => String(value)}
          />
          <ReferenceLine yAxisId="flow" y={0} stroke="#64748b" strokeWidth={1} />
          <Bar yAxisId="flow" dataKey="dailyFlow" name="Daily Flow" radius={[2, 2, 0, 0]}>
            {summary.flowSeries.map((point) => (
              <Cell
                key={`${summary.metric}:${point.date}`}
                fill={
                  (point.dailyFlow ?? 0) >= 0
                    ? SALT_PLOTS_CHART_COLORS.positive
                    : SALT_PLOTS_CHART_COLORS.negative
                }
              />
            ))}
          </Bar>
          {showCumulative && (
            <Line
              yAxisId="cum"
              type="monotone"
              dataKey="seasonCumFlow"
              name="Season Cum Flow"
              dot={false}
              stroke={seasonalYearColor(currentSeasonYear)}
              strokeWidth={2}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function SaltPlotsFacilityCard({
  summary,
  onDrilldown,
  onExpand,
}: {
  summary: SaltPlotsFacilitySummary;
  onDrilldown: (metric: SaltInventoryFacilityMetric) => void;
  onExpand: (metric: SaltInventoryFacilityMetric) => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onDrilldown(summary.metric)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onDrilldown(summary.metric);
        }
      }}
      className="w-full min-w-0 cursor-pointer rounded-lg border border-gray-800 bg-gray-900/70 p-3 text-left transition-colors hover:border-cyan-500/35 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      aria-label={`Drill into ${summary.label} focused salt plot view`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-100">{summary.label}</p>
          <p className="mt-0.5 text-xs text-gray-500">{fmtDate(summary.latestDate)}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onExpand(summary.metric);
            }}
            className="h-7 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 text-[11px] font-semibold text-cyan-100 transition-colors hover:border-cyan-400/70 hover:bg-cyan-500/20"
            aria-label={`Expand ${summary.label} seasonal chart`}
          >
            Focus
          </button>
        </div>
      </div>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span className="text-gray-400">
          Inv <span className="font-mono text-gray-200">{fmtBcfDirect(summary.latestInventory)}</span>
        </span>
        <span className={flowTone(summary.latestFlow)}>
          Flow (MMcf/d) <span className="font-mono">{fmtSignedInteger(summary.latestFlow)}</span>
        </span>
      </div>
      <SaltPlotsSeasonalChart summary={summary} />
    </article>
  );
}

function SaltPlotsScoreboard({
  summaries,
}: {
  summaries: SaltPlotsFacilitySummary[];
}) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
      <p className="mb-3 text-sm font-semibold text-gray-200">Facility Scoreboard</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-xs text-gray-200">
          <thead className="bg-gray-950 text-[11px] uppercase text-gray-500">
            <tr>
              {[
                "Facility",
                "Latest Inventory",
                "Inv DoD",
                "Latest Flow (MMcf/d)",
                "YoY",
                "Seasonal %",
                "5Y %ile",
                "Season TD Flow (MMcf)",
                "Req Pace (MMcf/d)",
              ].map((header) => (
                <th key={header} className="border-b border-gray-800 px-2 py-2 text-right first:text-left">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary) => (
              <tr key={summary.metric} className="hover:bg-gray-900/45">
                <td className="border-t border-gray-900 px-2 py-2 text-left">
                  <div className="font-semibold text-gray-100">{summary.label}</div>
                  <div className="text-[10px] uppercase text-gray-500">{summary.region}</div>
                </td>
                <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-cyan-200">
                  {fmtBcfDirect(summary.latestInventory)}
                </td>
                <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(summary.inventoryDoD)}`}>
                  {fmtSignedBcf(summary.inventoryDoD)}
                </td>
                <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(summary.latestFlow)}`}>
                  {fmtSignedInteger(summary.latestFlow)}
                </td>
                <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(summary.yoyInventoryDelta)}`}>
                  {fmtSignedBcf(summary.yoyInventoryDelta)}
                </td>
                <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-gray-300">
                  {fmtPercent(summary.seasonalPercent)}
                </td>
                <td className="border-t border-gray-900 px-2 py-2 text-right tabular-nums text-sky-200">
                  {ordinalPercentile(summary.inventoryPercentile)}
                </td>
                <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(summary.seasonToDateFlow)}`}>
                  {fmtNumber(summary.seasonToDateFlow, 0)}
                </td>
                <td className={`border-t border-gray-900 px-2 py-2 text-right tabular-nums ${flowTone(summary.requiredPace)}`}>
                  {fmtSignedInteger(summary.requiredPace)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SaltPlotsTab({
  data,
  loading,
  error,
  apiElapsedMs,
  lookbackDays,
  setLookbackDays,
  seasonalYears,
  setSeasonalYears,
  flowWindow,
  setFlowWindow,
  facilityScope,
  setFacilityScope,
  selectedFacility,
  setSelectedFacility,
  focusedSeasonalMetric,
  setFocusedSeasonalMetric,
}: {
  data: WxAdjPayload | null;
  loading: boolean;
  error: string | null;
  apiElapsedMs: number | null;
  lookbackDays: number;
  setLookbackDays: Dispatch<SetStateAction<number>>;
  seasonalYears: number;
  setSeasonalYears: Dispatch<SetStateAction<number>>;
  flowWindow: number;
  setFlowWindow: Dispatch<SetStateAction<number>>;
  facilityScope: FacilityScope;
  setFacilityScope: Dispatch<SetStateAction<FacilityScope>>;
  selectedFacility: SaltInventoryFacilityMetric;
  setSelectedFacility: Dispatch<SetStateAction<SaltInventoryFacilityMetric>>;
  focusedSeasonalMetric: SaltInventoryFacilityMetric | null;
  setFocusedSeasonalMetric: Dispatch<SetStateAction<SaltInventoryFacilityMetric | null>>;
}) {
  const inventoryRows = filterInventoryRowsByLookbackDays(
    sortedInventoryRows(data?.inventoryRows ?? []),
    lookbackDays,
  );
  const summaries = buildSaltPlotsFacilitySummaries({
    rows: inventoryRows,
    seasonalYears,
    flowWindow,
  });
  const selectedSummary =
    summaries.find((summary) => summary.metric === selectedFacility) ?? summaries[0] ?? null;
  const focusedSeasonalSummary = focusedSeasonalMetric
    ? summaries.find((summary) => summary.metric === focusedSeasonalMetric) ?? null
    : null;
  const latestDate = maxInventoryDate(inventoryRows);
  const regime = saltModelRegime(latestDate);
  const minDate = minInventoryDate(inventoryRows);
  const errorMessage = error ?? (!loading && inventoryRows.length === 0 ? "No promoted salt inventory rows are available." : null);

  return (
    <section className="space-y-5 rounded-xl border border-gray-800 bg-gray-900/60 p-5 shadow-2xl">
      <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <SaltPlotsNumberInput
            label="Lookback Days"
            value={lookbackDays}
            onChange={setLookbackDays}
            min={365}
            max={3650}
            widthClassName="w-[140px]"
          />
          <div className="flex items-end gap-2 pb-[2px]" role="group" aria-label="Salt plot lookback presets">
            {SALT_PLOTS_LOOKBACK_PRESETS.map((preset) => (
              <SaltPlotsPresetButton
                key={preset.label}
                active={lookbackDays === preset.value}
                onClick={() => setLookbackDays(preset.value)}
              >
                {preset.label}
              </SaltPlotsPresetButton>
            ))}
          </div>
          <SaltPlotsNumberInput
            label="Seasonal Years"
            value={seasonalYears}
            onChange={setSeasonalYears}
            min={1}
            max={10}
          />
          <SaltPlotsNumberInput
            label="Flow Window"
            value={flowWindow}
            onChange={setFlowWindow}
            min={30}
            max={90}
          />
          <div className="flex items-end gap-2 pb-[2px]" role="group" aria-label="Salt plot flow window presets">
            {SALT_PLOTS_FLOW_WINDOWS.map((value) => (
              <SaltPlotsPresetButton
                key={value}
                active={flowWindow === value}
                onClick={() => setFlowWindow(value)}
              >
                {value}D
              </SaltPlotsPresetButton>
            ))}
          </div>
          <DashboardTabs
            tabs={FACILITY_SCOPE_TABS}
            activeValue={facilityScope}
            onChange={setFacilityScope}
            ariaLabel="Salt plots facility scope"
            variant="secondary"
            className="pb-[2px]"
          />
        </div>
        <p className="text-xs text-gray-500">
          Window {fmtDate(minDate)} to {fmtDate(latestDate)} | Rows {inventoryRows.length.toLocaleString()} | API{" "}
          {fmtMs(apiElapsedMs)}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Layout: {facilityScope === "all" ? "all 5 facilities side-by-side" : "focused facility drilldown"}
        </p>
        {regime && (
          <p className="mt-1 text-xs text-gray-500">
            Regime {regime.label} | Season {regime.startDate} to {regime.endDate} | Target {regime.targetDate} | Flow default {flowWindow}D
          </p>
        )}
      </div>

      <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
        <p className="mb-3 text-sm font-semibold text-gray-200">Facility Focus</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Salt plot facility focus">
          {SALT_PLOTS_FACILITY_METRICS.map((metric) => {
            const facility = saltInventoryFacilityOption(metric);
            const active = selectedFacility === metric;
            return (
              <button
                key={metric}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedFacility(metric)}
                className={`rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-200"
                    : "border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500 hover:bg-gray-800"
                }`}
              >
                {facility.label}
              </button>
            );
          })}
        </div>
      </section>

      {loading && (
        <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 text-sm text-gray-500">
          Loading promoted salt inventory rows...
        </div>
      )}

      {errorMessage && !loading && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && selectedSummary && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SaltModelKpi
              label="Latest Inventory"
              value={fmtBcfDirect(selectedSummary.latestInventory)}
              detail={fmtDate(selectedSummary.latestDate)}
              valueClassName="text-cyan-300"
            />
            <SaltModelKpi
              label="Inventory DoD"
              value={fmtSignedBcf(selectedSummary.inventoryDoD)}
              detail="Injection (+) / Withdrawal (-)"
              valueClassName={flowTone(selectedSummary.inventoryDoD)}
            />
            <SaltModelKpi
              label="Latest Daily Flow"
              value={fmtSignedInteger(selectedSummary.latestFlow)}
              detail="MMcf/d"
              valueClassName={flowTone(selectedSummary.latestFlow)}
            />
            <SaltModelKpi
              label="Seasonal Position"
              value={fmtPercent(selectedSummary.seasonalPercent)}
              detail={`YoY ${fmtSignedBcf(selectedSummary.yoyInventoryDelta)} | 5Y percentile ${ordinalPercentile(selectedSummary.inventoryPercentile)}`}
              valueClassName="text-cyan-200"
            />
            <SaltModelKpi
              label="5Y Percentile"
              value={ordinalPercentile(selectedSummary.inventoryPercentile)}
              detail="Same storage-year position"
              valueClassName="text-sky-200"
            />
            <SaltModelKpi
              label="Season-To-Date Flow"
              value={fmtNumber(selectedSummary.seasonToDateFlow, 0)}
              detail={`${regime?.label ?? "Season"} | MMcf`}
              valueClassName={flowTone(selectedSummary.seasonToDateFlow)}
            />
            <SaltModelKpi
              label={`Pace To ${regime?.targetDate.slice(5) ?? "Target"}`}
              value={fmtSignedInteger(selectedSummary.requiredPace)}
              detail={`5Y target ${fmtBcfDirect(selectedSummary.requiredPaceTarget)} Bcf | ${
                selectedSummary.daysToTarget ?? "-"
              }d left`}
              valueClassName="text-amber-300"
            />
          </section>

          {facilityScope === "all" ? (
            <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
              <p className="mb-3 text-sm font-semibold text-gray-200">
                Seasonal Small Multiples ({seasonalYears}Y historical envelope)
              </p>
              <div className="grid gap-4 xl:grid-cols-2">
                {summaries.map((summary) => (
                  <SaltPlotsFacilityCard
                    key={summary.metric}
                    summary={summary}
                    onDrilldown={(metric) => {
                      setSelectedFacility(metric);
                      setFacilityScope("focused");
                    }}
                    onExpand={setFocusedSeasonalMetric}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Click any card to drill into focused view. Use Focus to expand a seasonal chart.
              </p>
            </section>
          ) : (
            <section className="grid gap-4 xl:grid-cols-2">
              <div className="overflow-visible rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                <p className="mb-2 text-sm font-semibold text-gray-200">
                  Inventory Seasonality | Current vs Last Year | {seasonalYears}Y Historical Envelope
                </p>
                <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
                  <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-0.5">
                    Inventory: Bcf
                  </span>
                  <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-0.5">
                    Axis: Monthly
                  </span>
                </div>
                <SaltPlotsSeasonalChart summary={selectedSummary} height={330} showLegend />
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                <p className="mb-2 text-sm font-semibold text-gray-200">
                  Daily Injections / Withdrawals ({flowWindow}D | MMcf/d, Cum MMcf)
                </p>
                <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
                  <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-0.5">
                    Daily Flow: MMcf/d
                  </span>
                  <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-0.5">
                    Cum Flow: MMcf
                  </span>
                  <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-0.5">
                    Axis: Daily
                  </span>
                </div>
                <SaltPlotsFlowChart summary={selectedSummary} height={330} showCumulative />
              </div>
            </section>
          )}

          <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
            <p className="mb-2 text-sm font-semibold text-gray-200">
              Flow Small Multiples ({flowWindow}D | MMcf/d)
            </p>
            <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
              <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-0.5">
                Daily Flow: MMcf/d
              </span>
              <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-0.5">
                Axis: Monthly
              </span>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {summaries.map((summary) => (
                <div key={`flow:${summary.metric}`} className="rounded-lg border border-gray-800 bg-gray-900/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-gray-100">{summary.label}</p>
                    <p className={`text-xs ${flowTone(summary.latestFlow)}`}>
                      {fmtSignedInteger(summary.latestFlow)}
                    </p>
                  </div>
                  <SaltPlotsFlowChart summary={summary} />
                </div>
              ))}
            </div>
          </section>

          <SaltPlotsScoreboard summaries={summaries} />
        </>
      )}

      {focusedSeasonalSummary && (
        <div
          className="fixed inset-0 z-50 bg-black/75 p-2 sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFocusedSeasonalMetric(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="salts-seasonal-focus-title"
            className="mx-auto flex h-full max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl shadow-black/50"
          >
            <div className="flex flex-col gap-3 border-b border-gray-800 p-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 id="salts-seasonal-focus-title" className="text-sm font-semibold text-gray-100">
                  {focusedSeasonalSummary.label} Inventory Seasonality
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Latest {fmtDate(focusedSeasonalSummary.latestDate)} | Inventory{" "}
                  {fmtBcfDirect(focusedSeasonalSummary.latestInventory)} Bcf | Flow{" "}
                  {fmtSignedInteger(focusedSeasonalSummary.latestFlow)} MMcf/d | {seasonalYears}Y
                  historical envelope
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFocusedSeasonalMetric(null)}
                className="self-start rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
              <div className="mb-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border border-gray-800 bg-gray-950/60 p-3">
                  <p className="uppercase text-gray-500">Inventory DoD</p>
                  <p className={`mt-1 text-lg font-bold tabular-nums ${flowTone(focusedSeasonalSummary.inventoryDoD)}`}>
                    {fmtSignedBcf(focusedSeasonalSummary.inventoryDoD)}
                  </p>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/60 p-3">
                  <p className="uppercase text-gray-500">YoY Position</p>
                  <p className={`mt-1 text-lg font-bold tabular-nums ${flowTone(focusedSeasonalSummary.yoyInventoryDelta)}`}>
                    {fmtSignedBcf(focusedSeasonalSummary.yoyInventoryDelta)}
                  </p>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/60 p-3">
                  <p className="uppercase text-gray-500">5Y Percentile</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-sky-200">
                    {ordinalPercentile(focusedSeasonalSummary.inventoryPercentile)}
                  </p>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-950/60 p-3">
                  <p className="uppercase text-gray-500">Capacity</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-gray-100">
                    {fmtBcfDirect(focusedSeasonalSummary.capacityBcf)}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
                  <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-0.5">
                    Inventory: Bcf
                  </span>
                  <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-0.5">
                    Axis: Monthly
                  </span>
                  <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-0.5">
                    Current vs Last Year vs Historical Envelope
                  </span>
                </div>
                <SaltPlotsSeasonalChart summary={focusedSeasonalSummary} height="62vh" showLegend />
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function SaltModelTab({
  data,
  loading,
  error,
  apiElapsedMs,
  season,
  handleSeasonChange,
  month,
  setMonth,
  selectedMonthOptions,
  lookbackYears,
  setLookbackYears,
  recentDays,
  setRecentDays,
  children,
}: {
  data: WxAdjPayload | null;
  loading: boolean;
  error: string | null;
  apiElapsedMs: number | null;
  season: SeasonKey;
  handleSeasonChange: (nextSeason: SeasonKey) => void;
  month: number;
  setMonth: Dispatch<SetStateAction<number>>;
  selectedMonthOptions: Array<{ value: number; label: string }>;
  lookbackYears: number;
  setLookbackYears: Dispatch<SetStateAction<number>>;
  recentDays: number;
  setRecentDays: Dispatch<SetStateAction<number>>;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 shadow-2xl shadow-black/20">
      <div className="rounded-xl border border-gray-800 bg-[#111827]/80 p-4">
        <div className="rounded-lg border border-gray-800 bg-gray-950/80 px-4 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:max-w-3xl xl:grid-cols-[130px_120px_130px_130px]">
              <label>
                <span className={labelClass}>Season</span>
                <select
                  value={season}
                  onChange={(event) => handleSeasonChange(event.target.value as SeasonKey)}
                  className={controlClass}
                  aria-label="Season"
                >
                  {SEASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className={labelClass}>Month</span>
                <select
                  value={month}
                  onChange={(event) => setMonth(Number(event.target.value))}
                  className={controlClass}
                  aria-label="Month"
                >
                  {selectedMonthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className={labelClass}>Lookback Years</span>
                <select
                  value={lookbackYears}
                  onChange={(event) => setLookbackYears(Number(event.target.value))}
                  className={controlClass}
                  aria-label="Lookback Years"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className={labelClass}>Highlight Days</span>
                <select
                  value={recentDays}
                  onChange={(event) => setRecentDays(Number(event.target.value))}
                  className={controlClass}
                  aria-label="Highlight Days"
                >
                  {[3, 5, 7, 10, 14, 21, 31].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              disabled
              aria-disabled="true"
              className="h-10 self-start rounded-md border border-gray-700 bg-gray-800/80 px-4 text-sm font-semibold text-gray-500 disabled:cursor-not-allowed disabled:opacity-70 xl:self-end"
            >
              Export
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-500">
            <span className="rounded border border-gray-800 bg-gray-900/70 px-2 py-0.5">
              South Central salt nominations
            </span>
            <span className="rounded border border-gray-800 bg-gray-900/70 px-2 py-0.5">
              Daily flow: MMcf/d
            </span>
            <span className="rounded border border-gray-800 bg-gray-900/70 px-2 py-0.5">
              modelDaily=1
            </span>
            <span className="rounded border border-gray-800 bg-gray-900/70 px-2 py-0.5">
              API {fmtMs(apiElapsedMs)}
            </span>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/25 bg-red-950/45 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950/50 p-4 text-sm text-gray-500">
            Loading Salt Model data...
          </div>
        )}

        {!loading && !error && !data && (
          <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950/50 p-4 text-sm text-gray-500">
            No Salt Model payload is available for the selected window.
          </div>
        )}

        {data && !loading && !error && <div className="mt-4 space-y-4">{children}</div>}
      </div>
    </section>
  );
}

export default function SaltsDashboard({
  activeTab: controlledActiveTab,
  initialTab = "wx-adj-scrapes",
  onTabChange,
}: SaltsDashboardProps = {}) {
  const [internalActiveTab, setInternalActiveTab] = useState<SaltsTab>(initialTab);
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const [season, setSeason] = useState<SeasonKey>(() => initialSeason());
  const [month, setMonth] = useState(() => initialMonth(initialSeason()));
  const [lookbackYears, setLookbackYears] = useState(2);
  const [recentDays, setRecentDays] = useState(7);
  const [saltPlotsLookbackDays, setSaltPlotsLookbackDays] = useState(2200);
  const [saltPlotsSeasonalYears, setSaltPlotsSeasonalYears] = useState(5);
  const [saltPlotsFlowWindow, setSaltPlotsFlowWindow] = useState(45);
  const [saltPlotsFacilityScope, setSaltPlotsFacilityScope] = useState<FacilityScope>("all");
  const [saltPlotsFacilityFocus, setSaltPlotsFacilityFocus] =
    useState<SaltInventoryFacilityMetric>("golden_triangle");
  const [focusedSaltPlotMetric, setFocusedSaltPlotMetric] =
    useState<SaltInventoryFacilityMetric | null>(null);
  const [saltForecastRegion, setSaltForecastRegion] = useState<SaltForecastRegion>("salt-main");
  const [saltForecastWeatherRegion, setSaltForecastWeatherRegion] =
    useState<SaltForecastWeatherRegion>("SOUTHCENTRAL");
  const [saltForecastLookbackWeeks, setSaltForecastLookbackWeeks] = useState(340);
  const [facilityScope, setFacilityScope] = useState<FacilityScope>("focused");
  const [tablePeriod, setTablePeriod] = useState<SaltTablePeriod>("daily");
  const [tableCollapsed, setTableCollapsed] = useState(false);
  const [showPeriodChange, setShowPeriodChange] = useState(true);
  const [gradientEnabled, setGradientEnabled] = useState(true);
  const [plotsCollapsed, setPlotsCollapsed] = useState(false);
  const [focusedPlotId, setFocusedPlotId] = useState<string | null>(null);
  const [hiddenSeasonRoles, setHiddenSeasonRoles] = useState<Set<SeasonRole>>(() => new Set());
  const [data, setData] = useState<WxAdjPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiElapsedMs, setApiElapsedMs] = useState<number | null>(null);
  const [forecastData, setForecastData] = useState<SaltForecastPayload | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [forecastApiElapsedMs, setForecastApiElapsedMs] = useState<number | null>(null);

  useEffect(() => {
    if (!controlledActiveTab) {
      setInternalActiveTab(initialTab);
    }
  }, [controlledActiveTab, initialTab]);

  const handleTabChange = (nextTab: SaltsTab) => {
    if (!controlledActiveTab) {
      setInternalActiveTab(nextTab);
    }
    onTabChange?.(nextTab);
  };

  const requestUrl = useMemo(
    () =>
      makeApiUrl({
        season,
        month,
        lookbackYears:
          activeTab === "salt-plots" ? Math.min(7, saltPlotsSeasonalYears) : lookbackYears,
        recentDays:
          activeTab === "salt-plots" ? Math.min(saltPlotsFlowWindow, 31) : recentDays,
        tableLookbackMonths:
          activeTab === "salt-plots" ? 12 : undefined,
        saltPlotLookbackDays: activeTab === "salt-plots" ? saltPlotsLookbackDays : undefined,
        includeInventory: activeTab === "salt-plots",
        modelDaily: activeTab === "wx-adj-scrapes",
      }),
    [
      activeTab,
      lookbackYears,
      month,
      recentDays,
      saltPlotsFlowWindow,
      saltPlotsLookbackDays,
      saltPlotsSeasonalYears,
      season,
    ],
  );

  const forecastRequestUrl = useMemo(
    () =>
      makeSaltForecastApiUrl({
        saltRegion: saltForecastRegion,
        weatherRegion: saltForecastWeatherRegion,
        lookbackWeeks: saltForecastLookbackWeeks,
      }),
    [saltForecastLookbackWeeks, saltForecastRegion, saltForecastWeatherRegion],
  );

  useEffect(() => {
    if (activeTab === "salt-fc") {
      setLoading(false);
      setError(null);
      setApiElapsedMs(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    const startedAt = performance.now();
    setLoading(true);
    setError(null);
    setApiElapsedMs(null);

    fetchJsonWithCache<WxAdjPayload>({
      key: `api:salts:wx-adj:grid:${activeTab}:${season}:${month}:${lookbackYears}:${recentDays}:${saltPlotsLookbackDays}:${saltPlotsSeasonalYears}:${saltPlotsFlowWindow}`,
      url: requestUrl,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: "no-store",
    })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setApiElapsedMs(performance.now() - startedAt);
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setData(null);
        setError(err.message || "Failed to load Salt Model data");
        setApiElapsedMs(performance.now() - startedAt);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    activeTab,
    lookbackYears,
    month,
    recentDays,
    requestUrl,
    saltPlotsFlowWindow,
    saltPlotsLookbackDays,
    saltPlotsSeasonalYears,
    season,
  ]);

  useEffect(() => {
    if (activeTab !== "salt-fc") return;

    const controller = new AbortController();
    let active = true;
    const startedAt = performance.now();
    setForecastLoading(true);
    setForecastError(null);
    setForecastApiElapsedMs(null);

    fetchJsonWithCache<SaltForecastPayload>({
      key: `api:salts:forecast:${saltForecastRegion}:${saltForecastWeatherRegion}:${saltForecastLookbackWeeks}`,
      url: forecastRequestUrl,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: "no-store",
    })
      .then((payload) => {
        if (!active) return;
        setForecastData(payload);
        setForecastApiElapsedMs(performance.now() - startedAt);
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setForecastData(null);
        setForecastError(err.message || "Failed to load Salt Fc forecast diagnostics");
        setForecastApiElapsedMs(performance.now() - startedAt);
      })
      .finally(() => {
        if (active) setForecastLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    activeTab,
    forecastRequestUrl,
    saltForecastLookbackWeeks,
    saltForecastRegion,
    saltForecastWeatherRegion,
  ]);

  const chart = useMemo(() => {
    const plots = data?.plots?.length
      ? data.plots
      : [
          {
            id: `${data?.selected.weatherMetric}:${data?.selected.saltsMetric}`,
            title: `${metricLabel(data?.selected.saltsMetric ?? "salts_total")} vs ${metricLabel(data?.selected.weatherMetric ?? "southcentral_population_cdd")}`,
            weatherMetric: data?.selected.weatherMetric ?? "southcentral_population_cdd",
            saltsMetric: data?.selected.saltsMetric ?? "salts_total",
            pointCount: data?.points.length ?? 0,
            minDate: data?.summary.minDate ?? null,
            maxDate: data?.summary.maxDate ?? null,
            points: data?.points ?? [],
          },
      ];
    const plotCharts = plots
      .map((plot) => buildPlotChart(plot, lookbackYears))
      .sort((left, right) => plotSortValue(left.plot) - plotSortValue(right.plot));
    const dailyRows = data?.dailyRows ?? [];
    const seasonLabels = Array.from(
      new Set(
        dailyRows.length
          ? dailyRows.map((row) => row.seasonLabel)
          : (data?.points ?? []).map((point) => point.seasonLabel),
      ),
    ).sort(
      (left, right) => seasonSortValue(right) - seasonSortValue(left),
    );
    const seasonLegend = buildSeasonLegend(seasonLabels);
    return { plotCharts, seasonLegend };
  }, [data, lookbackYears]);

  const saltPivotTable = useMemo(
    () => buildSaltPivotTable(data?.tableRows ?? [], facilityScope, tablePeriod),
    [data?.tableRows, facilityScope, tablePeriod],
  );
  const saltPivotDisplayRowCount = saltPivotDisplayRows(saltPivotTable, showPeriodChange).length;
  const focusedPlotChart = focusedPlotId
    ? chart.plotCharts.find((plotChart) => plotChart.plot.id === focusedPlotId) ?? null
    : null;

  useEffect(() => {
    if (!focusedPlotId && !focusedSaltPlotMetric) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocusedPlotId(null);
        setFocusedSaltPlotMetric(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focusedPlotId, focusedSaltPlotMetric]);

  const selectedMonthOptions = validMonths(season).map((value) => ({
    value,
    label: monthLabel(value),
  }));
  const subtitle = `${season.toUpperCase()} ${monthLabel(month)} | Salt Model Plot Grid`;
  const highlightStartDate = data?.summary.maxDate
    ? shiftIsoDate(data.summary.maxDate, -(recentDays - 1))
    : null;

  const handleSeasonChange = (nextSeason: SeasonKey) => {
    setSeason(nextSeason);
    setMonth(initialMonth(nextSeason));
  };

  const toggleSeasonRole = (role: SeasonRole) => {
    setHiddenSeasonRoles((previous) => {
      const next = new Set(previous);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  };

  return (
    <div>
      <div className="mb-6">
        <DashboardTabs
          tabs={TABS}
          activeValue={activeTab}
          onChange={handleTabChange}
          ariaLabel="Salts dashboard tabs"
          className="rounded-lg border border-gray-700 bg-gray-900 p-1"
        />
      </div>

      {activeTab === "salt-plots" && (
        <SaltPlotsTab
          data={data}
          loading={loading}
          error={error}
          apiElapsedMs={apiElapsedMs}
          lookbackDays={saltPlotsLookbackDays}
          setLookbackDays={setSaltPlotsLookbackDays}
          seasonalYears={saltPlotsSeasonalYears}
          setSeasonalYears={setSaltPlotsSeasonalYears}
          flowWindow={saltPlotsFlowWindow}
          setFlowWindow={setSaltPlotsFlowWindow}
          facilityScope={saltPlotsFacilityScope}
          setFacilityScope={setSaltPlotsFacilityScope}
          selectedFacility={saltPlotsFacilityFocus}
          setSelectedFacility={setSaltPlotsFacilityFocus}
          focusedSeasonalMetric={focusedSaltPlotMetric}
          setFocusedSeasonalMetric={setFocusedSaltPlotMetric}
        />
      )}

      {activeTab === "salt-fc" && (
        <SaltForecastTab
          data={forecastData}
          loading={forecastLoading}
          error={forecastError}
          apiElapsedMs={forecastApiElapsedMs}
          saltRegion={saltForecastRegion}
          setSaltRegion={setSaltForecastRegion}
          weatherRegion={saltForecastWeatherRegion}
          setWeatherRegion={setSaltForecastWeatherRegion}
          lookbackWeeks={saltForecastLookbackWeeks}
          setLookbackWeeks={setSaltForecastLookbackWeeks}
        />
      )}

      {activeTab === "wx-adj-scrapes" && (
        <SaltModelTab
          data={data}
          loading={loading}
          error={error}
          apiElapsedMs={apiElapsedMs}
          season={season}
          handleSeasonChange={handleSeasonChange}
          month={month}
          setMonth={setMonth}
          selectedMonthOptions={selectedMonthOptions}
          lookbackYears={lookbackYears}
          setLookbackYears={setLookbackYears}
          recentDays={recentDays}
          setRecentDays={setRecentDays}
        >

          {data && !loading && (
            <>
              <section className="overflow-hidden rounded-lg border border-gray-800 bg-[#0d1118] shadow-xl shadow-black/20">
                <div className="flex flex-col gap-3 border-b border-gray-800 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold uppercase text-gray-100">
                      Tables - Genscape Scrapes + Cash Gas
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                      {saltPivotDisplayRowCount.toLocaleString()} rows | {saltPivotTable.columns.length.toLocaleString()} periods | {saltPivotTable.sourceDayCount.toLocaleString()} joined days | {fmtDate(saltPivotTable.dataMinDate)} to {fmtDate(saltPivotTable.dataMaxDate)} | {saltPivotTable.valueUnit}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <DashboardTabs
                      tabs={TABLE_PERIOD_TABS}
                      activeValue={tablePeriod}
                      onChange={setTablePeriod}
                      ariaLabel="Salts table period"
                      variant="secondary"
                    />
                    <DashboardTabs
                      tabs={FACILITY_SCOPE_TABS}
                      activeValue={facilityScope}
                      onChange={setFacilityScope}
                      ariaLabel="Salts facility scope"
                      variant="secondary"
                    />
                    <ToggleButton
                      pressed={showPeriodChange}
                      onClick={() => setShowPeriodChange((value) => !value)}
                      ariaLabel={`${showPeriodChange ? "Hide" : "Show"} ${periodChangeLabel(tablePeriod)} rows`}
                    >
                      {periodChangeLabel(tablePeriod)}
                    </ToggleButton>
                    <ToggleButton
                      pressed={gradientEnabled}
                      onClick={() => setGradientEnabled((value) => !value)}
                      ariaLabel={`${gradientEnabled ? "Disable" : "Enable"} table gradient`}
                    >
                      Gradient
                    </ToggleButton>
                    <button
                      type="button"
                      onClick={() => setTableCollapsed((value) => !value)}
                      aria-expanded={!tableCollapsed}
                      className="h-7 rounded-md border border-gray-700 bg-gray-800 px-2.5 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                    >
                      {tableCollapsed ? "Show" : "Hide"}
                    </button>
                  </div>
                </div>

                {!tableCollapsed && (
                  <div className="p-3">
                    {saltPivotTable.rows.length === 0 || saltPivotTable.columns.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500">
                        No joined salts table rows are available.
                      </div>
                    ) : (
                      <SaltPivotTable
                        table={saltPivotTable}
                        showPeriodChange={showPeriodChange}
                        gradientEnabled={gradientEnabled}
                      />
                    )}
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-gray-800 bg-[#0d1118] shadow-xl shadow-black/20">
                <div className="flex flex-col gap-3 border-b border-gray-800 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold uppercase text-gray-100">
                      {subtitle}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                      {(data.summary.dailyRowCount ?? data.summary.pointCount).toLocaleString()} matched days | {fmtDate(data.summary.minDate)} to {fmtDate(data.summary.maxDate)} | {data.summary.plotCount ?? chart.plotCharts.length} plots | Highlight {fmtDate(highlightStartDate)} to {fmtDate(data.summary.maxDate)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-7 items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-2.5 text-[11px] font-semibold text-amber-200">
                      <span className="h-2 w-2 rounded-full border-2 border-amber-300" />
                      Last {recentDays}D
                    </span>
                    {chart.seasonLegend.map((item) => {
                      const visible = !hiddenSeasonRoles.has(item.key);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          aria-pressed={visible}
                          aria-label={`${visible ? "Hide" : "Show"} ${item.label} across all plots`}
                          onClick={() => toggleSeasonRole(item.key)}
                          className={`inline-flex h-7 items-center gap-2 rounded-md border px-2.5 text-[11px] font-semibold transition-colors ${
                            visible
                              ? "border-gray-700 bg-gray-900 text-gray-200 hover:border-gray-600 hover:text-white"
                              : "border-gray-800 bg-gray-950/40 text-gray-600 hover:border-gray-700 hover:text-gray-400"
                          }`}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: visible ? item.color : "#475569" }}
                          />
                          {item.label}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setPlotsCollapsed((value) => !value)}
                      aria-expanded={!plotsCollapsed}
                      className="h-7 rounded-md border border-gray-700 bg-gray-800 px-2.5 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                    >
                      {plotsCollapsed ? "Show" : "Hide"}
                    </button>
                  </div>
                </div>

                {!plotsCollapsed && (
                  <div className="min-w-0 p-3">
                    {chart.plotCharts.every((plotChart) => plotChart.plot.points.length === 0) ? (
                      <div className="flex h-full items-center justify-center text-sm text-gray-500">
                        No matched rows are available for this selection.
                      </div>
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {chart.plotCharts.map((plotChart) => (
                          <WxAdjScatterPanel
                            key={plotChart.plot.id}
                            plotChart={plotChart}
                            hiddenSeasonRoles={hiddenSeasonRoles}
                            onFocus={setFocusedPlotId}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </SaltModelTab>
      )}

      {focusedPlotChart && (
        <div
          className="fixed inset-0 z-50 bg-black/75 p-2 sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFocusedPlotId(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="salts-wx-adj-focus-title"
            className="mx-auto flex h-full max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-[#12141d] shadow-2xl shadow-black/50"
          >
            <div className="flex flex-col gap-3 border-b border-gray-800 p-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 id="salts-wx-adj-focus-title" className="text-sm font-semibold text-gray-100">
                  {metricLabel(focusedPlotChart.plot.saltsMetric)} vs{" "}
                  {metricLabel(focusedPlotChart.plot.weatherMetric)}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {focusedPlotChart.plot.pointCount.toLocaleString()} matched days |{" "}
                  {fmtDate(focusedPlotChart.plot.minDate)} to {fmtDate(focusedPlotChart.plot.maxDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFocusedPlotId(null)}
                className="self-start rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
              <WxAdjScatterPanel
                plotChart={focusedPlotChart}
                hiddenSeasonRoles={hiddenSeasonRoles}
                heightClass="h-[70vh]"
                showFocusButton={false}
              />
            </div>
          </section>
        </div>
      )}

    </div>
  );
}
