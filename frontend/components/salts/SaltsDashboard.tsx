"use client";

import {
  Fragment,
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
import PlotCard, { type PlotSeries } from "@/components/dashboard/PlotCard";
import SaltForecastTab, {
  SimpleSaltRegressionTab,
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

export type SaltsTab = "wx-adj-scrapes" | "salt-plots" | "salt-fc-simple" | "salt-fc";
type FacilityScope = "focused" | "all";
type SaltModelFlowWindow = 30 | 45 | 60 | 90;
type SeasonKey = "winter" | "summer";
type WeatherMetric =
  | "southcentral_gas_hdd"
  | "conus_gas_hdd"
  | "southcentral_population_cdd"
  | "conus_population_cdd"
  | "southcentral_tdd"
  | "conus_tdd";
type SaltsMetric = "salts_total" | "salts_tx" | "salts_la" | "salts_ms" | "salts_al";
type GasPromptMarketKey = "henry_hub" | "transco_st85";
type GasPromptPriceMetric = "cash_balmo";
type WxAdjPlotScope = "month" | "season";
type LookbackRole = "cy" | "ly";
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
type SaltTableMetric = WeatherMetric | SaltFlowMetric | NextDayGasPriceMetric;
type SaltTablePeriod = "daily" | "weekly" | "monthly";
type SaltPivotMeasureKey = "weather" | "cash" | "salt";
type SaltFacilityRegionKey = "TX" | "LA" | "MS" | "AL";
type SaltPivotPrimaryDeltaLabel = "DoD" | "WoW" | "MoM";
type SaltPivotSecondaryDeltaLabel = "YoY";
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
  lookbackRole: LookbackRole | null;
}

interface GasPromptPoint {
  date: string;
  label: string;
  year: number | null;
  month: number;
  monthLabel: string;
  mmDd: string | null;
  season: SeasonKey;
  seasonLabel: string;
  weatherDataSource: string | null;
  x: number;
  y: number;
  weatherMetric: WeatherMetric;
  priceMetric: GasPromptPriceMetric;
  priceMetricLabel: string;
  marketKey: GasPromptMarketKey;
  marketLabel: string;
  cashPrice: number | null;
  balmoPrice: number | null;
  cashTradeDate: string | null;
  balmoTradeDate: string | null;
  latestCashTradeDate: string | null;
  priceBasis: string | null;
  isRecent: boolean;
  lookbackRole: LookbackRole | null;
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
  lookbackRole: LookbackRole | null;
}

interface WxAdjPlot {
  id: string;
  title: string;
  scope: WxAdjPlotScope;
  scopeLabel: string;
  weatherMetric: WeatherMetric;
  saltsMetric: SaltsMetric;
  pointCount: number;
  minDate: string | null;
  maxDate: string | null;
  points: WxAdjPoint[];
}

interface GasPromptPlot {
  id: string;
  title: string;
  scope: WxAdjPlotScope;
  scopeLabel: string;
  marketKey: GasPromptMarketKey;
  marketLabel: string;
  weatherMetric: WeatherMetric;
  priceMetric: GasPromptPriceMetric;
  priceMetricLabel: string;
  pointCount: number;
  minDate: string | null;
  maxDate: string | null;
  points: GasPromptPoint[];
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
    gasPromptRowCount?: number;
    gasPromptPlotCount?: number;
    gasPromptPointCount?: number;
    gasPromptMinDate?: string | null;
    gasPromptMaxDate?: string | null;
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
  gasPromptPlots?: GasPromptPlot[];
}

type ScatterPlotPayload = WxAdjPlot | GasPromptPlot;
type ChartPoint = (WxAdjPoint | GasPromptPoint) & { z: number };

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

interface PlotChart<TPlot extends ScatterPlotPayload = ScatterPlotPayload> {
  plot: TPlot;
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
  group: "Weather" | "Gas Prices - Next Day Cash" | "Salt Noms - Totals" | "Salt Noms - Facilities";
  region: string;
  sortIndex: number;
  kind: "weather" | "flow" | "price";
}

interface SaltPivotColumn {
  key: string;
  label: string;
  sourceDayCount: number;
  expectedDayCount: number;
  eiaWeekKey?: string;
  eiaWeekLabel?: string;
  eiaWeekIndex?: number;
  startsEiaWeek?: boolean;
}

interface SaltPivotTrendPoint {
  key: string;
  label: string;
  value: number | null;
}

interface SaltPivotRow {
  key: string;
  group: string;
  region: string;
  metricLabel: string;
  measureKey: SaltPivotMeasureKey;
  measure: string;
  values: Record<string, number | null>;
  heatValues: number[];
  primaryDeltaLabel: SaltPivotPrimaryDeltaLabel;
  primaryDeltaValues: Record<string, number | null>;
  secondaryDeltaLabel?: SaltPivotSecondaryDeltaLabel;
  secondaryDeltaValues?: Record<string, number | null>;
  valueKind: "weather" | "flow" | "price";
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
const CURRENT_YEAR = new Date().getFullYear();
const MIN_CONTRACT_YEAR = 2020;
const MAX_CONTRACT_YEAR_OPTIONS = 7;
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
  { value: "wx-adj-scrapes", label: "Salts Home", description: "Daily table + flow heatmap" },
  { value: "salt-plots", label: "Salts Inv", description: "Facility seasonality + flows" },
  {
    value: "salt-fc-simple",
    label: "Salts Forecast Simple",
    description: "Single-factor seasonal regression",
  },
  { value: "salt-fc", label: "Salts Forecast Blend", description: "Blended weekly forecast" },
];
const SALTS_TAB_VIEW: Record<SaltsTab, string> = {
  "wx-adj-scrapes": "gas-salt-model",
  "salt-plots": "gas-salt-plots",
  "salt-fc-simple": "gas-salt-fc-simple",
  "salt-fc": "gas-salt-forecast",
};
const SALTS_TAB_VIEW_ALIASES: Record<string, SaltsTab> = {
  "gas-salt-regression": "salt-fc-simple",
};
const SALTS_CHROME: Record<SaltsTab, SaltsChrome> = {
  "wx-adj-scrapes": {
    title: "Salts Home",
    subtitle:
      "Trader-first daily salts dashboard with regional totals, facility flows, and heatmapped history.",
    footer: "South Central salt nominations | Source: AWS SQL Server (GenscapeDataFeed)",
    badges: [
      { label: "Primary Signal", value: "South Central Salt Nominations" },
      { label: "Mode", value: "Daily Table + Flow Monitor" },
    ],
  },
  "salt-plots": {
    title: "Salts Inv",
    subtitle:
      "Facility-level inventory seasonality and flow monitoring for Golden Triangle, Pine Prairie, Perryville, Southern Pines, and Eminence.",
    footer: "Salt facility inventories and flows | Source: AWS SQL Server (GenscapeDataFeed)",
    badges: [
      { label: "Facilities", value: "GT | Pine Prairie | Perryville | Southern Pines | Eminence" },
      { label: "Mode", value: "Inventory Seasonality + Flows" },
    ],
  },
  "salt-fc": {
    title: "Salts Forecast Blend",
    subtitle:
      "Blended weekly EIA salt storage forecast using salt nominations, weather, momentum, and backtest diagnostics.",
    footer:
      "EIA weekly underground salt storage + daily salt nominations | Source: AWS SQL Server + AWS PostgreSQL + EIA API",
    badges: [
      { label: "Target", value: "EIA Weekly Salt Working Gas Change" },
      { label: "Mode", value: "Blended Weekly Forecast" },
    ],
  },
  "salt-fc-simple": {
    title: "Salts Forecast Simple",
    subtitle:
      "Simple seasonal weekly regressions for EIA salt change against salt nominations and South Central degree days.",
    footer:
      "EIA weekly underground salt storage + daily salt nominations | Source: AWS SQL Server + AWS PostgreSQL + EIA API",
    badges: [
      { label: "Target", value: "EIA Weekly Salt Working Gas Change" },
      { label: "Mode", value: "Simple Seasonal OLS Regression" },
    ],
  },
};

export function parseSaltsTabFromView(value: string | null): SaltsTab | null {
  if (!value) return null;
  const match = (Object.entries(SALTS_TAB_VIEW) as Array<[SaltsTab, string]>).find(
    ([, view]) => view === value,
  );
  return match?.[0] ?? SALTS_TAB_VIEW_ALIASES[value] ?? null;
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
const SALT_TABLE_PERIODS: readonly SaltTablePeriod[] = ["daily", "weekly", "monthly"] as const;
const SALT_PIVOT_COLUMN_LIMITS: Record<SaltTablePeriod, number> = {
  daily: 62,
  weekly: 26,
  monthly: 24,
};
const SALT_DAILY_TREND_LOOKBACK_DAYS = 7;
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
const SALT_FACILITY_REGIONS: readonly SaltFacilityRegionKey[] = ["TX", "LA", "MS", "AL"] as const;
const SALT_MODEL_CASH_PRICE_METRICS: readonly NextDayGasPriceMetric[] = [
  "XGF D1-IPG",
  "XVA D1-IPG",
] as const;
const GAS_PROMPT_MARKETS: Array<{ value: GasPromptMarketKey; label: string }> = [
  { value: "henry_hub", label: "Henry Hub" },
  { value: "transco_st85", label: "St 85" },
];
const FOCUSED_FACILITY_METRICS: readonly SaltFacilityMetric[] = [
  "golden_triangle",
  "pine_prarie",
  "perryville",
  "southern_pines",
  "eminence",
] as const;
const DEFAULT_WEATHER_METRICS_BY_SEASON: Record<SeasonKey, WeatherMetric> = {
  winter: "conus_gas_hdd",
  summer: "conus_population_cdd",
};
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
    { value: "southcentral_tdd", label: "South Central TDD" },
    { value: "conus_tdd", label: "CONUS TDD" },
  ],
  summer: [
    { value: "southcentral_population_cdd", label: "South Central CDD" },
    { value: "conus_population_cdd", label: "CONUS CDD" },
    { value: "southcentral_tdd", label: "South Central TDD" },
    { value: "conus_tdd", label: "CONUS TDD" },
  ],
};
const WEATHER_PLOT_ORDER: Record<WeatherMetric, number> = {
  conus_gas_hdd: 0,
  southcentral_gas_hdd: 1,
  conus_population_cdd: 0,
  southcentral_population_cdd: 1,
  conus_tdd: 0,
  southcentral_tdd: 1,
};
const PLOT_SCOPE_ORDER: Record<WxAdjPlotScope, number> = {
  month: 0,
  season: 1,
};
const SEASON_ROLE_STYLES: Record<
  SeasonRole,
  { color: string; pointOpacity: number; lineWidth: number; lineDasharray?: string }
> = {
  current: { color: "#ef4444", pointOpacity: 0.88, lineWidth: 2.2 },
  prior: { color: "#38bdf8", pointOpacity: 0.58, lineWidth: 1.8, lineDasharray: "5 4" },
  history: { color: "#64748b", pointOpacity: 0.18, lineWidth: 1.2 },
};
const DEFAULT_SELECTED_CONTRACT_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1].filter(
  (year) => year >= MIN_CONTRACT_YEAR,
);
const DEFAULT_HIDDEN_SEASON_ROLES: readonly SeasonRole[] = [];
const LOOKBACK_ROLE_OPTIONS: ReadonlyArray<{ key: LookbackRole; label: string }> = [
  { key: "cy", label: "CY Lookback" },
  { key: "ly", label: "LY Lookback" },
];
const BASE_SCATTER_POINT_Z = 28;
const RECENT_SCATTER_POINT_MIN_Z = 42;
const RECENT_SCATTER_POINT_MAX_Z = 96;

const labelClass = "mb-1 block text-[10px] font-semibold uppercase text-gray-500";
const controlClass =
  "h-8 w-full rounded-md border border-gray-700 bg-gray-950 px-2.5 text-xs font-semibold text-gray-100 outline-none transition-colors focus:border-gray-500";

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

function defaultWeatherMetric(season: SeasonKey): WeatherMetric {
  const metrics = WEATHER_METRICS_BY_SEASON[season];
  const defaultMetric = DEFAULT_WEATHER_METRICS_BY_SEASON[season];
  return metrics.some((metric) => metric.value === defaultMetric)
    ? defaultMetric
    : metrics[0].value;
}

function weatherMetricForSeason(season: SeasonKey, preferredMetric: WeatherMetric): WeatherMetric {
  return WEATHER_METRICS_BY_SEASON[season].some((metric) => metric.value === preferredMetric)
    ? preferredMetric
    : defaultWeatherMetric(season);
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

function isGasPromptPlot(plot: ScatterPlotPayload): plot is GasPromptPlot {
  return "priceMetric" in plot;
}

function isGasPromptPoint(point: Partial<ChartPoint>): point is Partial<GasPromptPoint> {
  return typeof (point as Partial<GasPromptPoint>).priceMetricLabel === "string";
}

function lookbackLabel(role: LookbackRole | null | undefined): string | null {
  if (role === "cy") return "CY Lookback";
  if (role === "ly") return "LY Lookback";
  return null;
}

function lookbackRecencyBucket(point: {
  seasonLabel: string;
  lookbackRole?: LookbackRole | null;
}): string {
  return `${point.seasonLabel}:${point.lookbackRole ?? "lookback"}`;
}

function isVisibleLookbackPoint(
  point: Partial<ChartPoint>,
  hiddenLookbackRoles: Set<LookbackRole>,
): boolean {
  if (!point.isRecent) return false;
  const role = point.lookbackRole ?? null;
  return role === null || !hiddenLookbackRoles.has(role);
}

function scatterYLabel(plot: ScatterPlotPayload): string {
  return isGasPromptPlot(plot) ? plot.priceMetricLabel : metricLabel(plot.saltsMetric);
}

function scatterPlotTitle(plot: ScatterPlotPayload): string {
  if (isGasPromptPlot(plot)) {
    return plot.title;
  }
  return `${scatterYLabel(plot)} vs ${metricLabel(plot.weatherMetric)} | ${plot.scopeLabel}`;
}

function pointYLabel(point: Partial<ChartPoint>): string {
  return isGasPromptPoint(point)
    ? point.priceMetricLabel ?? "Cash-BalMo"
    : metricLabel(point.saltsMetric as SaltsMetric);
}

function scatterYDigits(plot: ScatterPlotPayload): number {
  return isGasPromptPlot(plot) ? 2 : 1;
}

function pointYDigits(point: Partial<ChartPoint>): number {
  return isGasPromptPoint(point) ? 2 : 1;
}

function plotSortValue(plot: WxAdjPlot): number {
  const saltsIndex = SALTS_METRICS.findIndex((item) => item.value === plot.saltsMetric);
  const normalizedSaltsIndex = saltsIndex === -1 ? SALTS_METRICS.length : saltsIndex;
  return (
    normalizedSaltsIndex * 10 +
    (PLOT_SCOPE_ORDER[plot.scope] ?? 0) +
    WEATHER_PLOT_ORDER[plot.weatherMetric] / 10
  );
}

function gasPromptPlotSortValue(plot: GasPromptPlot): number {
  const marketIndex = GAS_PROMPT_MARKETS.findIndex((item) => item.value === plot.marketKey);
  const normalizedMarketIndex = marketIndex === -1 ? GAS_PROMPT_MARKETS.length : marketIndex;
  return (
    normalizedMarketIndex * 10 +
    (PLOT_SCOPE_ORDER[plot.scope] ?? 0) +
    WEATHER_PLOT_ORDER[plot.weatherMetric] / 10
  );
}

function fmtNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function fmtAxisTick(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return value.toFixed(0);
  return value.toFixed(digits);
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

function shiftIsoYear(date: string | null, years: number): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCFullYear(parsed.getUTCFullYear() + years);
  return isoDateFromUtc(parsed);
}

function minIsoDate(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(0) ?? null;
}

function maxIsoDate(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function saltFlowMmcf(row: WxAdjDailyRow, metric: SaltFlowMetric): number | null {
  const value = row.salts[metric];
  return value === null || value === undefined || !Number.isFinite(value) ? null : value * 1000;
}

function tableMetricValue(row: WxAdjDailyRow, metric: SaltTableMetricOption): number | null {
  if (metric.kind === "weather") {
    const value = row.weather[metric.value as WeatherMetric];
    return value === null || value === undefined || !Number.isFinite(value) ? null : value;
  }
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
  const visibleFacilities =
    facilityScope === "focused"
      ? FOCUSED_FACILITY_METRICS
      : SALT_FACILITY_METRICS.map((facility) => facility.value);
  const weatherOptions: SaltTableMetricOption[] = [
    {
      value: "southcentral_gas_hdd",
      label: "South Central Gas HDD",
      group: "Weather",
      region: "SOUTHCENTRAL",
      sortIndex: 0,
      kind: "weather",
    },
    {
      value: "southcentral_population_cdd",
      label: "South Central Population CDD",
      group: "Weather",
      region: "SOUTHCENTRAL",
      sortIndex: 1,
      kind: "weather",
    },
    {
      value: "southcentral_tdd",
      label: "South Central TDD",
      group: "Weather",
      region: "SOUTHCENTRAL",
      sortIndex: 2,
      kind: "weather",
    },
    {
      value: "conus_gas_hdd",
      label: "CONUS Gas HDD",
      group: "Weather",
      region: "CONUS",
      sortIndex: 3,
      kind: "weather",
    },
    {
      value: "conus_population_cdd",
      label: "CONUS Population CDD",
      group: "Weather",
      region: "CONUS",
      sortIndex: 4,
      kind: "weather",
    },
    {
      value: "conus_tdd",
      label: "CONUS TDD",
      group: "Weather",
      region: "CONUS",
      sortIndex: 5,
      kind: "weather",
    },
  ];
  const gasOptions = NEXT_DAY_GAS_PRICE_METRICS.filter((metric) =>
    SALT_MODEL_CASH_PRICE_METRICS.includes(metric.value),
  ).map((metric, index) => ({
    value: metric.value,
    label: metric.label,
    group: "Gas Prices - Next Day Cash" as const,
    region: metric.symbol,
    sortIndex: SALTS_METRICS.length + visibleFacilities.length + weatherOptions.length + index,
    kind: "price" as const,
  }));
  const totalOptions = SALTS_METRICS.map((metric, index) => ({
    value: metric.value,
    label: metric.label,
    group: "Salt Noms - Totals" as const,
    region: metric.label,
    sortIndex: index,
    kind: "flow" as const,
  }));
  const facilityOptions = visibleFacilities.map((facilityKey, index) => {
    const facility = SALT_FACILITY_METRICS.find((item) => item.value === facilityKey)!;
    return {
      value: facility.value,
      label: facility.label,
      group: "Salt Noms - Facilities" as const,
      region: facility.region,
      sortIndex: SALTS_METRICS.length + index,
      kind: "flow" as const,
    };
  });

  return [...totalOptions, ...facilityOptions, ...weatherOptions, ...gasOptions];
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

function daysInMonthKey(key: string): number {
  const [year, month] = key.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month)) return 0;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function expectedSaltPivotDayCount(period: SaltTablePeriod, key: string): number {
  if (period === "daily") return 1;
  if (period === "weekly") return 7;
  return daysInMonthKey(key);
}

function buildSaltPivotSourceDayCounts(
  rows: WxAdjDailyRow[],
  period: SaltTablePeriod,
): Map<string, number> {
  const datesByPeriod = new Map<string, Set<string>>();
  for (const row of rows) {
    const key =
      period === "daily"
        ? row.date
        : period === "weekly"
          ? weekEndingFriday(row.date)
          : monthKey(row.date);
    datesByPeriod.set(key, new Set([...(datesByPeriod.get(key) ?? []), row.date]));
  }
  return new Map(
    Array.from(datesByPeriod.entries()).map(([key, dates]) => [key, dates.size]),
  );
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

function primarySaltPivotMeasure(metric: SaltTableMetricOption, period: SaltTablePeriod): {
  key: SaltPivotMeasureKey;
  label: string;
} {
  if (metric.kind === "weather") {
    return {
      key: "weather",
      label: period === "daily" ? "Weather Degree Days" : "Weather Degree Day Sum",
    };
  }
  if (metric.kind === "price") {
    return {
      key: "cash",
      label: period === "daily" ? "Cash Prices" : "Avg Cash Prices",
    };
  }
  return {
    key: "salt",
    label: period === "daily" ? "Salt Flows" : "Salt Flow Sum",
  };
}

function primaryDeltaLabel(period: SaltTablePeriod): SaltPivotPrimaryDeltaLabel {
  if (period === "daily") return "DoD";
  if (period === "weekly") return "WoW";
  return "MoM";
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
  const selectedKeys = sortedKeysDescending.slice(0, SALT_PIVOT_COLUMN_LIMITS[period]);
  const sortedKeysAscending = [...sortedKeysDescending].reverse();
  const sourceDayCounts = buildSaltPivotSourceDayCounts(sortedRows, period);
  let currentEiaWeekKey: string | undefined;
  let eiaWeekIndex = -1;
  const columns = selectedKeys.map((key) => {
    const eiaWeekKey = period === "daily" ? weekEndingFriday(key) : undefined;
    const startsEiaWeek = Boolean(eiaWeekKey && eiaWeekKey !== currentEiaWeekKey);
    if (startsEiaWeek) {
      currentEiaWeekKey = eiaWeekKey;
      eiaWeekIndex += 1;
    }
    return {
      key,
      label: formatTableColumnLabel(period, key),
      sourceDayCount: sourceDayCounts.get(key) ?? 0,
      expectedDayCount: expectedSaltPivotDayCount(period, key),
      eiaWeekKey,
      eiaWeekLabel: eiaWeekKey ? formatTableColumnLabel("weekly", eiaWeekKey) : undefined,
      eiaWeekIndex: eiaWeekKey ? eiaWeekIndex : undefined,
      startsEiaWeek,
    };
  });
  const tableRows = metrics.map((metric): SaltPivotRow => {
    const valuesByPeriod = valueByMetric.get(metric.value) ?? new Map<string, number | null>();
    const primaryValues = Object.fromEntries(
      selectedKeys.map((key) => [key, valuesByPeriod.get(key) ?? null]),
    ) as Record<string, number | null>;
    const primaryDeltaValuesByPeriod = buildChangeValues(valuesByPeriod, sortedKeysAscending, 1);
    const primaryDeltaValues = Object.fromEntries(
      selectedKeys.map((key) => [key, primaryDeltaValuesByPeriod.get(key) ?? null]),
    ) as Record<string, number | null>;
    const secondaryDeltaValuesByPeriod =
      period === "monthly" ? buildChangeValues(valuesByPeriod, sortedKeysAscending, 12) : null;
    const secondaryDeltaValues =
      secondaryDeltaValuesByPeriod === null
        ? undefined
        : (Object.fromEntries(
            selectedKeys.map((key) => [key, secondaryDeltaValuesByPeriod.get(key) ?? null]),
          ) as Record<string, number | null>);

    const secondaryDeltaLabel: SaltPivotSecondaryDeltaLabel | undefined =
      period === "monthly" ? "YoY" : undefined;
    const measure = primarySaltPivotMeasure(metric, period);

    return {
      key: `${period}:${metric.value}:${metric.kind}`,
      group: metric.group,
      region: metric.region,
      metricLabel: metric.label,
      measureKey: measure.key,
      measure: measure.label,
      values: primaryValues,
      heatValues: selectedKeys
        .map((key) => primaryValues[key])
        .filter((value): value is number => value !== null && Number.isFinite(value)),
      primaryDeltaLabel: primaryDeltaLabel(period),
      primaryDeltaValues,
      secondaryDeltaLabel,
      secondaryDeltaValues,
      valueKind: metric.kind,
    };
  }).filter((row) => row.heatValues.length > 0 || row.key.endsWith(":flow"));

  return {
    period,
    columns,
    rows: tableRows,
    dataMinDate,
    dataMaxDate,
    sourceDayCount: sortedRows.length,
    valueUnit: period === "daily" ? "DD + $/MMBtu + MMcf/d" : "DD + avg $/MMBtu + MMcf",
  };
}

function seasonSortValue(label: string): number {
  const match = label.match(/^(XH|JV)-(\d{2})$/);
  if (!match) return 0;
  const year = Number.parseInt(match[2], 10);
  const seasonOffset = match[1] === "XH" ? 0 : 1;
  return year * 10 + seasonOffset;
}

function seasonContractYear(label: string): number | null {
  const match = label.match(/^(XH|JV)-(\d{2})$/);
  if (!match) return null;
  const year = Number.parseInt(match[2], 10);
  return Number.isFinite(year) ? 2000 + year : null;
}

function seasonChartColor(label: string): string {
  const contractYear = seasonContractYear(label);
  return contractYear === null ? SEASON_ROLE_STYLES.history.color : seasonalYearColor(contractYear);
}

function sortedUniqueYears(years: Iterable<number>): number[] {
  return Array.from(
    new Set(
      Array.from(years).filter(
        (year) => Number.isInteger(year) && year >= MIN_CONTRACT_YEAR,
      ),
    ),
  ).sort((left, right) => right - left);
}

function defaultContractYearOptions(): number[] {
  return Array.from(
    { length: Math.min(MAX_CONTRACT_YEAR_OPTIONS, CURRENT_YEAR - MIN_CONTRACT_YEAR + 1) },
    (_, index) => CURRENT_YEAR - index,
  );
}

function contractYearForPoint(point: {
  seasonLabel?: string | null;
  year?: number | null;
}): number | null {
  const seasonYear = point.seasonLabel ? seasonContractYear(point.seasonLabel) : null;
  if (seasonYear !== null) return seasonYear;
  return typeof point.year === "number" && Number.isInteger(point.year) ? point.year : null;
}

function contractYearOptionsFromPayload(
  payload: WxAdjPayload | null,
  selectedYears: readonly number[],
): number[] {
  const years = [
    ...DEFAULT_SELECTED_CONTRACT_YEARS,
    ...selectedYears,
    ...(payload?.dailyRows ?? []).map(contractYearForPoint),
    ...(payload?.points ?? []).map(contractYearForPoint),
    ...(payload?.plots ?? []).flatMap((plot) => plot.points.map(contractYearForPoint)),
    ...(payload?.gasPromptPlots ?? []).flatMap((plot) => plot.points.map(contractYearForPoint)),
  ].filter((year): year is number => year !== null);
  const options = sortedUniqueYears(years);
  return options.length ? options.slice(0, MAX_CONTRACT_YEAR_OPTIONS) : defaultContractYearOptions();
}

function setSelectedYear(
  previous: readonly number[],
  year: number,
  selectedState: boolean,
): number[] {
  const selected = new Set(previous);
  if (selectedState) {
    selected.add(year);
  } else if (selected.has(year)) {
    if (selected.size === 1) return sortedUniqueYears(previous);
    selected.delete(year);
  }
  return sortedUniqueYears(selected);
}

function lookbackYearsForSelectedYears(selectedYears: readonly number[]): number {
  const oldestSelectedYear = selectedYears.reduce<number | null>((oldest, year) => {
    if (!Number.isInteger(year) || year < MIN_CONTRACT_YEAR) return oldest;
    return oldest === null ? year : Math.min(oldest, year);
  }, null);
  if (oldestSelectedYear === null) return 1;
  return Math.min(
    Math.max(CURRENT_YEAR - oldestSelectedYear + 1, 1),
    MAX_CONTRACT_YEAR_OPTIONS,
  );
}

function filterPlotBySelectedYears<TPlot extends ScatterPlotPayload>(
  plot: TPlot,
  selectedYears: Set<number>,
): TPlot {
  const points = plot.points.filter((point) => {
    const contractYear = contractYearForPoint(point);
    return contractYear !== null && selectedYears.has(contractYear);
  });
  const dates = points.map((point) => point.date);
  return {
    ...plot,
    pointCount: points.length,
    minDate: minIsoDate(dates),
    maxDate: maxIsoDate(dates),
    points,
  };
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
      color: seasonLabels[0] ? seasonChartColor(seasonLabels[0]) : SEASON_ROLE_STYLES.current.color,
      active: Boolean(seasonLabels[0]),
    },
    {
      key: "prior",
      label: seasonLabels[1] ? `Compare ${seasonLabels[1]}` : "Compare",
      color: seasonLabels[1] ? seasonChartColor(seasonLabels[1]) : SEASON_ROLE_STYLES.prior.color,
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

function buildPlotChart<TPlot extends ScatterPlotPayload>(plot: TPlot): PlotChart<TPlot> {
  const recentDatesByBucket = new Map<string, string[]>();
  for (const point of plot.points) {
    if (!point.isRecent) continue;
    const bucket = lookbackRecencyBucket(point);
    const dates = recentDatesByBucket.get(bucket) ?? [];
    dates.push(point.date);
    recentDatesByBucket.set(bucket, dates);
  }
  const recentDateIndexByBucket = new Map(
    Array.from(recentDatesByBucket.entries()).map(([bucket, dates]) => [
      bucket,
      new Map(Array.from(new Set(dates)).sort().map((date, index) => [date, index])),
    ]),
  );
  const points: ChartPoint[] = plot.points.map((point) => ({
    ...point,
    z: point.isRecent
      ? RECENT_SCATTER_POINT_MIN_Z +
        ((recentDateIndexByBucket.get(lookbackRecencyBucket(point))?.get(point.date) ?? 0) /
          Math.max(1, (recentDateIndexByBucket.get(lookbackRecencyBucket(point))?.size ?? 1) - 1)) *
          (RECENT_SCATTER_POINT_MAX_Z - RECENT_SCATTER_POINT_MIN_Z)
      : BASE_SCATTER_POINT_Z,
  }));
  const seasonLabels = Array.from(new Set(points.map((point) => point.seasonLabel))).sort(
    (left, right) => seasonSortValue(right) - seasonSortValue(left),
  );
  const highlighted = new Set(seasonLabels);
  const grouped = seasonLabels.map((seasonLabel, index) => {
    const groupPoints = points.filter((point) => point.seasonLabel === seasonLabel);
    const role = seasonRoleForIndex(index);
    const style = SEASON_ROLE_STYLES[role];
    const color = seasonChartColor(seasonLabel);
    return {
      seasonLabel,
      color,
      role,
      pointOpacity: style.pointOpacity,
      highlighted: highlighted.has(seasonLabel),
      points: groupPoints,
      fit: highlighted.has(seasonLabel) && role !== "history"
        ? fitLinear(groupPoints, seasonLabel, color)
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
  weatherMetric,
  lookbackYears,
  recentDays,
  tableLookbackMonths,
  saltPlotLookbackDays,
  includeInventory,
  inventoryOnly,
  includeGasPrompt,
  gasPromptOnly,
  modelDaily,
}: {
  season: SeasonKey;
  month: number;
  weatherMetric: WeatherMetric;
  lookbackYears: number;
  recentDays: number;
  tableLookbackMonths?: number;
  saltPlotLookbackDays?: number;
  includeInventory?: boolean;
  inventoryOnly?: boolean;
  includeGasPrompt?: boolean;
  gasPromptOnly?: boolean;
  modelDaily?: boolean;
}): string {
  const params = new URLSearchParams({
    season,
    month: String(month),
    weatherMetric,
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
  if (inventoryOnly) {
    params.set("inventoryOnly", "1");
  }
  if (includeGasPrompt === false) {
    params.set("includeGasPrompt", "0");
  } else if (includeGasPrompt === true) {
    params.set("includeGasPrompt", "1");
  }
  if (gasPromptOnly) {
    params.set("gasPromptOnly", "1");
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
  const gasPoint = isGasPromptPoint(point) ? point : null;
  const pointLookbackLabel = lookbackLabel(point.lookbackRole) ?? (point.isRecent ? "Lookback" : null);

  return (
    <div className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-200 shadow-xl shadow-black/30">
      <div className="flex items-center gap-2 font-semibold text-gray-100">
        {fmtDate(point.date)}
        {pointLookbackLabel && (
          <span className="rounded border border-gray-600 bg-gray-900 px-1.5 py-0.5 text-[10px] uppercase text-gray-200">
            {pointLookbackLabel}
          </span>
        )}
      </div>
      <div className="mt-1 text-gray-500">{point.seasonLabel}</div>
      <div className="mt-2 grid grid-cols-[auto_auto] gap-x-3 gap-y-1 tabular-nums">
        <span className="text-gray-500">{metricLabel(point.weatherMetric as WeatherMetric)}</span>
        <span className="text-right text-gray-100">{fmtNumber(point.x)}</span>
        <span className="text-gray-500">{pointYLabel(point)}</span>
        <span className="text-right text-gray-100">{fmtNumber(point.y, pointYDigits(point))}</span>
        {gasPoint && (
          <>
            <span className="text-gray-500">Cash</span>
            <span className="text-right text-gray-100">{fmtNumber(gasPoint.cashPrice, 2)}</span>
            <span className="text-gray-500">BalMo</span>
            <span className="text-right text-gray-100">{fmtNumber(gasPoint.balmoPrice, 2)}</span>
          </>
        )}
      </div>
      {gasPoint?.cashTradeDate && (
        <div className="mt-2 text-[11px] text-gray-500">
          ICE {fmtDate(gasPoint.cashTradeDate)}
          {gasPoint.priceBasis ? ` | ${gasPoint.priceBasis}` : ""}
        </div>
      )}
      {point.weatherDataSource && (
        <div className="mt-2 text-[11px] text-gray-500">{point.weatherDataSource}</div>
      )}
    </div>
  );
}

function recentPointRadius(z: number | undefined): number {
  if (z === undefined || !Number.isFinite(z)) return 4.2;
  const normalized =
    (Math.max(RECENT_SCATTER_POINT_MIN_Z, Math.min(RECENT_SCATTER_POINT_MAX_Z, z)) -
      RECENT_SCATTER_POINT_MIN_Z) /
    (RECENT_SCATTER_POINT_MAX_Z - RECENT_SCATTER_POINT_MIN_Z);
  return 3.2 + normalized * 3.4;
}

function RecentPointShape({
  cx,
  cy,
  fill,
  payload,
}: {
  cx?: number;
  cy?: number;
  fill?: string;
  payload?: Partial<ChartPoint>;
}) {
  if (typeof cx !== "number" || typeof cy !== "number") return null;

  const radius = recentPointRadius(payload?.z);
  const pointColor = fill ?? "#e5e7eb";

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={radius + 2.6}
        fill="none"
        stroke={pointColor}
        strokeWidth={2}
        opacity={0.95}
      />
      <circle cx={cx} cy={cy} r={radius} fill={pointColor} opacity={0.95} />
    </g>
  );
}

function WxAdjScatterPanel({
  plotChart,
  hiddenSeasonRoles,
  hiddenLookbackRoles,
  heightClass = "h-[360px]",
}: {
  plotChart: PlotChart;
  hiddenSeasonRoles: Set<SeasonRole>;
  hiddenLookbackRoles: Set<LookbackRole>;
  heightClass?: string;
}) {
  const xLabel = metricLabel(plotChart.plot.weatherMetric);
  const yLabel = scatterYLabel(plotChart.plot);
  const yDigits = scatterYDigits(plotChart.plot);
  const visibleGroups = plotChart.grouped.filter((group) => !hiddenSeasonRoles.has(group.role));
  const fitGroups = visibleGroups.filter(
    (group): group is ChartGroup & { fit: RegressionLine } =>
      group.fit !== null && group.role !== "history",
  );
  const recentGroups = visibleGroups
    .map((group) => ({
      ...group,
      points: group.points.filter((point) => isVisibleLookbackPoint(point, hiddenLookbackRoles)),
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
    <div className="min-w-0">
      <div className={`relative ${heightClass} min-w-0 rounded-md border border-gray-800 bg-gray-950/35 p-2`}>
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
              tickFormatter={(value) => fmtAxisTick(Number(value), yDigits)}
            />
            <ZAxis type="number" dataKey="z" range={[BASE_SCATTER_POINT_Z, RECENT_SCATTER_POINT_MAX_Z]} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#64748b", strokeDasharray: "3 3" }} />
            {visibleGroups.map((group) => (
              <Scatter
                key={`${group.seasonLabel}-base`}
                name={group.seasonLabel}
                data={group.points.filter(
                  (point) => !isVisibleLookbackPoint(point, hiddenLookbackRoles),
                )}
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

function seasonLegendPlotSeries(seasonLegend: SeasonLegendItem[]): PlotSeries[] {
  return seasonLegend.map((item) => ({
    key: item.key,
    label: item.label,
    color: item.color,
  }));
}

function LookbackControls({
  hiddenLookbackRoles,
  onToggleLookbackRole,
}: {
  hiddenLookbackRoles: Set<LookbackRole>;
  onToggleLookbackRole: (role: LookbackRole) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lookback marker visibility">
      {LOOKBACK_ROLE_OPTIONS.map((option) => {
        const visible = !hiddenLookbackRoles.has(option.key);
        return (
          <ToggleButton
            key={option.key}
            pressed={visible}
            onClick={() => onToggleLookbackRole(option.key)}
            ariaLabel={`${visible ? "Hide" : "Show"} ${option.label} markers`}
          >
            {option.label}
          </ToggleButton>
        );
      })}
    </div>
  );
}

function WxAdjScatterPlotCard({
  plotChart,
  seasonLegend,
  hiddenSeasonRoles,
  hiddenLookbackRoles,
  onToggleSeasonRole,
  onToggleLookbackRole,
  onShowAllSeasonRoles,
  onHideAllSeasonRoles,
  controls,
}: {
  plotChart: PlotChart;
  seasonLegend: SeasonLegendItem[];
  hiddenSeasonRoles: Set<SeasonRole>;
  hiddenLookbackRoles: Set<LookbackRole>;
  onToggleSeasonRole: (role: SeasonRole) => void;
  onToggleLookbackRole: (role: LookbackRole) => void;
  onShowAllSeasonRoles: () => void;
  onHideAllSeasonRoles: () => void;
  controls?: ReactNode;
}) {
  const hiddenSeries = new Set<string>(hiddenSeasonRoles);

  return (
    <PlotCard
      title={scatterPlotTitle(plotChart.plot)}
      subtitle={`${plotChart.plot.pointCount.toLocaleString()} matched days | ${fmtDate(
        plotChart.plot.minDate,
      )} to ${fmtDate(plotChart.plot.maxDate)}`}
      series={seasonLegendPlotSeries(seasonLegend)}
      hiddenSeries={hiddenSeries}
      onToggleSeries={(key) => onToggleSeasonRole(key as SeasonRole)}
      onShowAll={onShowAllSeasonRoles}
      onHideAll={onHideAllSeasonRoles}
      focusedChildren={
        <WxAdjScatterPanel
          plotChart={plotChart}
          hiddenSeasonRoles={hiddenSeasonRoles}
          hiddenLookbackRoles={hiddenLookbackRoles}
          heightClass="h-[70vh]"
        />
      }
      seriesControlsExtra={
        <LookbackControls
          hiddenLookbackRoles={hiddenLookbackRoles}
          onToggleLookbackRole={onToggleLookbackRole}
        />
      }
      controls={controls}
    >
      <WxAdjScatterPanel
        plotChart={plotChart}
        hiddenSeasonRoles={hiddenSeasonRoles}
        hiddenLookbackRoles={hiddenLookbackRoles}
      />
    </PlotCard>
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

function pivotValueTone(value: number | null, row: SaltPivotRow): string {
  if (value === null || !Number.isFinite(value)) return "text-gray-500";
  if (row.valueKind !== "flow" || Math.abs(value) < 1e-9) return "text-gray-200";
  return value > 0 ? "text-emerald-200" : "text-rose-200";
}

function fmtPivotValue(value: number | null, row: SaltPivotRow): string {
  if (row.valueKind === "weather") return fmtNumber(value, 1);
  if (row.valueKind === "price") return fmtNumber(value, 2);
  return fmtChange(value, 0);
}

function fmtPivotDelta(value: number | null, row: SaltPivotRow): string {
  if (row.valueKind === "weather") return fmtChange(value, 1);
  if (row.valueKind === "price") return fmtChange(value, 2);
  return fmtChange(value, 0);
}

function deltaTone(value: number | null): string {
  if (value === null || !Number.isFinite(value) || Math.abs(value) < 1e-9) return "text-gray-500";
  return value > 0 ? "text-emerald-300" : "text-rose-300";
}

function saltPivotCellTitle({
  row,
  column,
  value,
  primaryDelta,
  secondaryDelta,
}: {
  row: SaltPivotRow;
  column: SaltPivotColumn;
  value: number | null;
  primaryDelta: number | null;
  secondaryDelta: number | null;
}): string {
  const lines = [
    `${row.metricLabel} | ${column.label}`,
    `Value: ${fmtPivotValue(value, row)}`,
    `${row.primaryDeltaLabel}: ${fmtPivotDelta(primaryDelta, row)}`,
  ];
  if (row.secondaryDeltaLabel) {
    lines.push(`${row.secondaryDeltaLabel}: ${fmtPivotDelta(secondaryDelta, row)}`);
  }
  if (column.eiaWeekLabel) {
    lines.push(`EIA week: ${column.eiaWeekLabel}`);
  }
  if (column.expectedDayCount > 1) {
    lines.push(`Days completed: ${column.sourceDayCount}/${column.expectedDayCount}`);
  }
  return lines.join("\n");
}

function saltPivotColumnChromeClass(period: SaltTablePeriod, column: SaltPivotColumn): string {
  if (period !== "daily") return "";
  const weekTint =
    column.eiaWeekIndex !== undefined && column.eiaWeekIndex % 2 === 0
      ? "bg-cyan-950/10"
      : "bg-gray-950/10";
  const weekDivider = column.startsEiaWeek
    ? "border-l border-cyan-600/70"
    : "border-l border-gray-900/60";
  return `${weekTint} ${weekDivider}`;
}

function saltPivotColumnCompletionTone(column: SaltPivotColumn): string {
  if (column.expectedDayCount <= 1) return "text-gray-600";
  return column.sourceDayCount >= column.expectedDayCount ? "text-emerald-400" : "text-amber-300";
}

function SaltPivotColumnHeader({
  period,
  column,
}: {
  period: SaltTablePeriod;
  column: SaltPivotColumn;
}) {
  if (period === "daily") {
    return (
      <span className="block leading-tight">
        <span className="block">{column.label}</span>
        <span
          className={`mt-0.5 block text-[9px] font-semibold ${
            column.startsEiaWeek ? "text-cyan-300" : "text-gray-600"
          }`}
        >
          {column.startsEiaWeek ? column.eiaWeekLabel : " "}
        </span>
      </span>
    );
  }
  return (
    <span className="block leading-tight">
      <span className="block">{column.label}</span>
      <span className={`mt-0.5 block text-[9px] font-semibold ${saltPivotColumnCompletionTone(column)}`}>
        {column.sourceDayCount}/{column.expectedDayCount}d
      </span>
    </span>
  );
}

function saltPivotTrendPoints(row: SaltPivotRow, columns: SaltPivotColumn[]): SaltPivotTrendPoint[] {
  return [...columns].reverse().map((column) => ({
    key: column.key,
    label: column.label,
    value: row.values[column.key] ?? null,
  }));
}

function saltPivotTrendStroke(delta: number): string {
  if (!Number.isFinite(delta) || Math.abs(delta) < 1e-9) return "#6b7280";
  return delta > 0 ? "#10b981" : "#f87171";
}

function SaltPivotTrendSparkline({
  row,
  columns,
}: {
  row: SaltPivotRow;
  columns: SaltPivotColumn[];
}) {
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(
    null,
  );
  const trendColumns = columns.slice(0, SALT_DAILY_TREND_LOOKBACK_DAYS);
  const numericPoints = saltPivotTrendPoints(row, trendColumns).filter(
    (point): point is SaltPivotTrendPoint & { value: number } =>
      point.value !== null && Number.isFinite(point.value),
  );

  if (numericPoints.length < 2) {
    return <span className="text-[10px] text-gray-600">-</span>;
  }

  const width = 54;
  const height = 18;
  const pad = 2;
  const values = numericPoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const lastIndex = numericPoints.length - 1;
  const coordinates = numericPoints.map((point, index) => ({
    x: pad + (index / lastIndex) * (width - pad * 2),
    y: height - pad - ((point.value - min) / range) * (height - pad * 2),
  }));
  const points = coordinates.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const delta = numericPoints[lastIndex].value - numericPoints[0].value;
  const stroke = saltPivotTrendStroke(delta);
  const lastCoordinate = coordinates[lastIndex];

  function showTooltip(target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    const widthPx = 218;
    const heightPx = Math.min(328, 50 + numericPoints.length * 22);
    const left = Math.min(Math.max(8, rect.right - widthPx), window.innerWidth - widthPx - 8);
    const below = rect.bottom + 8;
    const top =
      below + heightPx > window.innerHeight
        ? Math.max(8, rect.top - heightPx - 8)
        : below;
    setTooltipPosition({ left, top });
  }

  return (
    <div
      className="relative flex items-center justify-end"
      tabIndex={0}
      onMouseEnter={(event) => showTooltip(event.currentTarget)}
      onMouseLeave={() => setTooltipPosition(null)}
      onFocus={(event) => showTooltip(event.currentTarget)}
      onBlur={() => setTooltipPosition(null)}
      aria-label={`Last ${SALT_DAILY_TREND_LOOKBACK_DAYS} day trend for ${row.metricLabel}`}
    >
      <svg
        aria-hidden="true"
        className="h-[18px] w-[54px] shrink-0"
        viewBox={`0 0 ${width} ${height}`}
      >
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="#293241" />
        <polyline
          fill="none"
          points={points}
          stroke={stroke}
          strokeLinecap="round"
          strokeWidth="1.8"
        />
        <circle cx={lastCoordinate.x} cy={lastCoordinate.y} fill={stroke} r="1.8" />
      </svg>
      {tooltipPosition && (
        <div
          className="pointer-events-none fixed z-50 max-h-[328px] min-w-[218px] overflow-y-auto rounded-md border border-gray-700 bg-gray-950 p-2 text-xs shadow-2xl shadow-black/60"
          style={{ left: tooltipPosition.left, top: tooltipPosition.top }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Last {SALT_DAILY_TREND_LOOKBACK_DAYS} Days ({fmtPivotDelta(delta, row)})
          </div>
          <div className="mt-2 space-y-1">
            {[...numericPoints].reverse().map((point) => (
              <div key={`${row.key}:${point.key}`} className="flex items-center justify-between gap-4">
                <span className="text-gray-500">{point.label}</span>
                <span className="font-semibold tabular-nums text-gray-100">
                  {fmtPivotValue(point.value, row)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function saltPivotPeriodTitle(period: SaltTablePeriod): string {
  if (period === "daily") return "Daily";
  if (period === "weekly") return "Weekly";
  return "Monthly";
}

function saltFacilityRegion(value: string): SaltFacilityRegionKey | null {
  return (SALT_FACILITY_REGIONS as readonly string[]).includes(value)
    ? (value as SaltFacilityRegionKey)
    : null;
}

function visibleSaltPivotRowCount(
  rows: SaltPivotRow[],
  collapsedMeasureKeys: Set<SaltPivotMeasureKey>,
  expandedFacilityRegions: Set<SaltFacilityRegionKey>,
): number {
  return rows.filter((row) => {
    if (collapsedMeasureKeys.has(row.measureKey)) return false;
    if (row.group !== "Salt Noms - Facilities") return true;
    const region = saltFacilityRegion(row.region);
    return region !== null && expandedFacilityRegions.has(region);
  }).length;
}

function YearMultiSelect({
  label,
  years,
  selectedYears,
  onYearSelected,
  ariaLabel,
}: {
  label: string;
  years: readonly number[];
  selectedYears: readonly number[];
  onYearSelected: (year: number, selected: boolean) => void;
  ariaLabel: string;
}) {
  const selected = new Set(selectedYears);

  return (
    <div className="min-w-0">
      <span className={labelClass}>{label}</span>
      <div className="flex min-h-8 flex-wrap items-center gap-1" role="group" aria-label={ariaLabel}>
        {years.map((year) => {
          const active = selected.has(year);
          const yearColor = seasonalYearColor(year);
          return (
            <button
              key={year}
              type="button"
              aria-pressed={active}
              onClick={() => onYearSelected(year, !active)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold tabular-nums transition-colors ${
                active
                  ? "border-gray-600 bg-gray-800 text-gray-100"
                  : "border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300"
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: active ? yearColor : "#4b5563" }}
                aria-hidden="true"
              />
              {year}
            </button>
          );
        })}
      </div>
    </div>
  );
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

function saltPivotPeriodWidthClass(period: SaltTablePeriod, collapsed: boolean): string {
  if (period === "daily") {
    return "w-full min-w-0 xl:min-w-[620px] xl:max-w-[2400px] xl:flex-[2_1_620px]";
  }
  if (collapsed) {
    return "w-full min-w-0 xl:min-w-[168px] xl:max-w-[220px] xl:flex-[0_1_180px]";
  }
  return "w-full min-w-0 xl:min-w-[300px] xl:max-w-[620px] xl:flex-[1_1_300px]";
}

function SaltPivotPeriodSection({
  table,
  showDeltas,
  gradientEnabled,
  collapsedMeasureKeys,
  expandedFacilityRegions,
  periodCollapsed,
  onToggleMeasure,
  onToggleFacilityRegion,
  onTogglePeriodCollapse,
}: {
  table: SaltPivotTablePayload;
  showDeltas: boolean;
  gradientEnabled: boolean;
  collapsedMeasureKeys: Set<SaltPivotMeasureKey>;
  expandedFacilityRegions: Set<SaltFacilityRegionKey>;
  periodCollapsed: boolean;
  onToggleMeasure: (measureKey: SaltPivotMeasureKey) => void;
  onToggleFacilityRegion: (region: SaltFacilityRegionKey) => void;
  onTogglePeriodCollapse: (period: SaltTablePeriod) => void;
}) {
  const visibleRowCount = visibleSaltPivotRowCount(
    table.rows,
    collapsedMeasureKeys,
    expandedFacilityRegions,
  );
  const title = saltPivotPeriodTitle(table.period);
  const maxHeightClass = "max-h-[82vh]";
  const sectionWidthClass = saltPivotPeriodWidthClass(table.period, periodCollapsed);
  const canCollapse = table.period !== "daily";

  return (
    <section
      className={`${sectionWidthClass} space-y-2`}
      aria-label={`${title} table`}
    >
      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-200">
            {title} Table
          </h3>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {visibleRowCount.toLocaleString()}/{table.rows.length.toLocaleString()} rows |{" "}
            {table.columns.length.toLocaleString()} periods |{" "}
            Deltas {showDeltas ? "shown" : "hidden"} | {table.valueUnit}
          </p>
        </div>
        {canCollapse && (
          <button
            type="button"
            aria-expanded={!periodCollapsed}
            onClick={() => onTogglePeriodCollapse(table.period)}
            className="h-7 shrink-0 rounded-md border border-gray-800 bg-gray-950/40 px-2.5 text-[11px] font-semibold text-gray-500 transition-colors hover:border-gray-700 hover:text-gray-300"
          >
            {periodCollapsed ? "Expand" : "Collapse"}
          </button>
        )}
      </div>
      {periodCollapsed ? null : table.rows.length === 0 || table.columns.length === 0 ? (
        <div className="rounded-md border border-gray-800 bg-gray-950/50 p-4 text-sm text-gray-500">
          No {title.toLowerCase()} table rows are available.
        </div>
      ) : (
        <SaltPivotTable
          table={table}
          showDeltas={showDeltas}
          gradientEnabled={gradientEnabled}
          collapsedMeasureKeys={collapsedMeasureKeys}
          expandedFacilityRegions={expandedFacilityRegions}
          onToggleMeasure={onToggleMeasure}
          onToggleFacilityRegion={onToggleFacilityRegion}
          maxHeightClass={maxHeightClass}
        />
      )}
    </section>
  );
}

function SaltPivotTable({
  table,
  showDeltas,
  gradientEnabled,
  collapsedMeasureKeys,
  expandedFacilityRegions,
  onToggleMeasure,
  onToggleFacilityRegion,
  maxHeightClass = "max-h-[640px]",
}: {
  table: SaltPivotTablePayload;
  showDeltas: boolean;
  gradientEnabled: boolean;
  collapsedMeasureKeys: Set<SaltPivotMeasureKey>;
  expandedFacilityRegions: Set<SaltFacilityRegionKey>;
  onToggleMeasure: (measureKey: SaltPivotMeasureKey) => void;
  onToggleFacilityRegion: (region: SaltFacilityRegionKey) => void;
  maxHeightClass?: string;
}) {
  const displayRows = table.rows;
  const showTrendColumn = table.period === "daily";
  const measureGroups = displayRows.reduce<
    Array<{ key: SaltPivotMeasureKey; label: string; rows: SaltPivotRow[] }>
  >((groups, row) => {
    const currentGroup = groups.at(-1);
    if (currentGroup && currentGroup.key === row.measureKey) {
      currentGroup.rows.push(row);
      return groups;
    }
    groups.push({ key: row.measureKey, label: row.measure, rows: [row] });
    return groups;
  }, []);
  const renderDataRow = ({
    row,
    borderClass,
    metricContent,
  }: {
    row: SaltPivotRow;
    borderClass: string;
    metricContent?: ReactNode;
  }) => (
    <tr key={row.key} className="hover:bg-gray-900/45">
      <td className={`bg-[#0d1118] px-2 py-1.5 text-left ${borderClass}`}>
        {metricContent ?? (
          <>
            <div className="font-semibold text-gray-100">{row.metricLabel}</div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase text-gray-500">
              {row.group} | {row.region}
            </div>
          </>
        )}
      </td>
      {showTrendColumn && (
        <td className={`w-[68px] px-2 py-1.5 text-right tabular-nums ${borderClass}`}>
          <SaltPivotTrendSparkline row={row} columns={table.columns} />
        </td>
      )}
      {table.columns.map((column) => {
        const value = row.values[column.key] ?? null;
        const primaryDelta = row.primaryDeltaValues[column.key] ?? null;
        const secondaryDelta = row.secondaryDeltaValues?.[column.key] ?? null;
        return (
          <td
            key={`${row.key}:${column.key}`}
            title={saltPivotCellTitle({
              row,
              column,
              value,
              primaryDelta,
              secondaryDelta,
            })}
            className={`px-2 py-1.5 text-right tabular-nums ${borderClass} ${saltPivotColumnChromeClass(
              table.period,
              column,
            )} ${pivotValueTone(value, row)}`}
            style={gradientEnabled ? heatmapStyle(value, row.heatValues) : undefined}
          >
            <div className="font-semibold leading-tight">{fmtPivotValue(value, row)}</div>
            {showDeltas && (
              <div className={`mt-0.5 text-[10px] leading-none ${deltaTone(primaryDelta)}`}>
                {row.primaryDeltaLabel} {fmtPivotDelta(primaryDelta, row)}
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className={`${maxHeightClass} max-w-full overflow-auto`}>
      <table className="w-max table-auto border-collapse text-xs text-gray-200 whitespace-nowrap">
        <thead className="sticky top-0 z-20 bg-gray-950 text-[11px] uppercase text-gray-500">
          <tr>
            <th className="w-[220px] border-b border-gray-800 bg-gray-950 px-2 py-2 text-left font-bold">
              Metric
            </th>
            {showTrendColumn && (
              <th className="w-[68px] border-b border-gray-800 px-2 py-2 text-right font-bold">
                Trend
              </th>
            )}
            {table.columns.map((column) => (
              <th
                key={column.key}
                className={`min-w-[82px] border-b border-gray-800 px-2 py-2 text-right font-bold ${saltPivotColumnChromeClass(
                  table.period,
                  column,
                )}`}
                title={
                  column.expectedDayCount > 1
                    ? `${column.label} | ${column.sourceDayCount}/${column.expectedDayCount} days completed`
                    : column.eiaWeekLabel
                      ? `${column.label} | ${column.eiaWeekLabel}`
                      : column.label
                }
              >
                <SaltPivotColumnHeader period={table.period} column={column} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {measureGroups.map((group) => {
            const collapsed = collapsedMeasureKeys.has(group.key);
            return (
              <Fragment key={group.key}>
                <tr>
                  <td
                    colSpan={table.columns.length + 1 + (showTrendColumn ? 1 : 0)}
                    className="border-t border-b border-gray-800 bg-gray-950/80 p-0 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500"
                  >
                    <button
                      type="button"
                      aria-expanded={!collapsed}
                      aria-label={`${collapsed ? "Show" : "Hide"} ${group.label} rows`}
                      onClick={() => onToggleMeasure(group.key)}
                      className="flex w-full items-center justify-between gap-4 px-2 py-1 text-left transition-colors hover:bg-gray-900/80 hover:text-gray-300"
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex w-3 justify-center text-gray-400">
                          {collapsed ? "+" : "-"}
                        </span>
                        <span>{group.label}</span>
                      </span>
                      <span className="text-[10px] font-semibold text-gray-600">
                        {collapsed ? "Hidden" : `${group.rows.length} rows`}
                      </span>
                    </button>
                  </td>
                </tr>
                {!collapsed && group.key !== "salt" && group.rows.map((row, index) => {
                  const previousRow = group.rows[index - 1];
                  const startsGroup =
                    !previousRow || previousRow.group !== row.group || previousRow.region !== row.region;
                  const borderClass = startsGroup ? "border-t border-gray-700" : "border-t border-gray-900";
                  return renderDataRow({ row, borderClass });
                })}
                {!collapsed && group.key === "salt" && (() => {
                  const facilityRowsByRegion = new Map<SaltFacilityRegionKey, SaltPivotRow[]>();
                  group.rows
                    .filter((row) => row.group === "Salt Noms - Facilities")
                    .forEach((row) => {
                      const region = saltFacilityRegion(row.region);
                      if (!region) return;
                      facilityRowsByRegion.set(region, [...(facilityRowsByRegion.get(region) ?? []), row]);
                    });
                  return group.rows
                    .filter((row) => row.group !== "Salt Noms - Facilities")
                    .flatMap((row, index) => {
                      const previousTotalRow = group.rows
                        .filter((candidate) => candidate.group !== "Salt Noms - Facilities")
                        .at(index - 1);
                      const startsGroup =
                        !previousTotalRow ||
                        previousTotalRow.group !== row.group ||
                        previousTotalRow.region !== row.region;
                      const borderClass = startsGroup ? "border-t border-gray-700" : "border-t border-gray-900";
                      const region = saltFacilityRegion(row.region);
                      const facilityRows = region ? facilityRowsByRegion.get(region) ?? [] : [];
                      const expanded = region ? expandedFacilityRegions.has(region) : false;
                      const totalRow = renderDataRow({
                        row,
                        borderClass,
                        metricContent:
                          region && facilityRows.length > 0 ? (
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-label={`${expanded ? "Hide" : "Show"} ${region} salt facilities`}
                              onClick={() => onToggleFacilityRegion(region)}
                              className="flex w-full items-center justify-between gap-3 text-left"
                            >
                              <span>
                                <span className="inline-flex w-3 justify-center text-gray-400">
                                  {expanded ? "-" : "+"}
                                </span>
                                <span className="font-semibold text-gray-100">{row.metricLabel}</span>
                                <span className="ml-2 text-[10px] font-semibold uppercase text-gray-500">
                                  {row.group} | {row.region}
                                </span>
                              </span>
                              <span className="text-[10px] font-semibold text-gray-600">
                                {facilityRows.length} facilities
                              </span>
                            </button>
                          ) : undefined,
                      });
                      if (!region || !expanded) return [totalRow];
                      return [
                        totalRow,
                        ...facilityRows.map((facilityRow) =>
                          renderDataRow({
                            row: facilityRow,
                            borderClass: "border-t border-gray-900",
                            metricContent: (
                              <>
                                <div className="pl-5 font-semibold text-gray-200">
                                  {facilityRow.metricLabel}
                                </div>
                                <div className="mt-0.5 pl-5 text-[10px] font-semibold uppercase text-gray-500">
                                  Facility | {facilityRow.region}
                                </div>
                              </>
                            ),
                          }),
                        ),
                      ];
                    });
                })()}
              </Fragment>
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

interface SaltPlotsFlowTooltipPayloadItem {
  payload?: Partial<SaltPlotsFlowPoint>;
}

function SaltPlotsFlowTooltip({
  active,
  payload,
  summary,
}: {
  active?: boolean;
  payload?: SaltPlotsFlowTooltipPayloadItem[];
  summary: SaltPlotsFacilitySummary;
}) {
  if (!active || !payload?.length) return null;
  const point = payload.find((item) => item.payload?.date)?.payload;
  if (!point?.date) return null;

  return (
    <div className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-200 shadow-xl shadow-black/30">
      <div className="font-semibold text-gray-100">{summary.label}</div>
      <div className="mt-0.5 text-[11px] text-gray-500">{fmtDate(point.date)}</div>
      <div className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
        <span className="text-gray-400">Daily Flow</span>
        <span className={`text-right tabular-nums ${flowTone(point.dailyFlow)}`}>
          {fmtSignedInteger(point.dailyFlow)}
        </span>
        <span className="text-gray-400">Season Cum Flow</span>
        <span className={`text-right tabular-nums ${flowTone(point.seasonCumFlow)}`}>
          {fmtNumber(point.seasonCumFlow, 0)}
        </span>
      </div>
      <div className="mt-2 text-[11px] text-gray-500">MMcf/d | MMcf</div>
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
          <Tooltip content={<SaltPlotsFlowTooltip summary={summary} />} />
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
  flowWindow,
  onDrilldown,
  onExpand,
}: {
  summary: SaltPlotsFacilitySummary;
  flowWindow: number;
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
      <div className="mt-4 border-t border-gray-800 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase text-gray-500">{flowWindow}D Flow</p>
          <p className={`text-xs tabular-nums ${flowTone(summary.latestFlow)}`}>
            {fmtSignedInteger(summary.latestFlow)}
          </p>
        </div>
        <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
          <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-0.5">
            Daily Flow: MMcf/d
          </span>
          <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-0.5">
            Axis: Daily
          </span>
        </div>
        <SaltPlotsFlowChart summary={summary} />
      </div>
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
          <SaltPlotsScoreboard summaries={summaries} />

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
                Facility Small Multiples ({seasonalYears}Y historical envelope | {flowWindow}D flow)
              </p>
              <div className="grid gap-4 xl:grid-cols-2">
                {summaries.map((summary) => (
                  <SaltPlotsFacilityCard
                    key={summary.metric}
                    summary={summary}
                    flowWindow={flowWindow}
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

          {facilityScope === "focused" && (
            <section className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
              <p className="mb-2 text-sm font-semibold text-gray-200">
                Flow Small Multiples ({flowWindow}D | MMcf/d)
              </p>
              <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
                <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-0.5">
                  Daily Flow: MMcf/d
                </span>
                <span className="rounded border border-gray-700 bg-gray-900/70 px-2 py-0.5">
                  Axis: Daily
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
          )}
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
  apiElapsedMs,
  children,
}: {
  apiElapsedMs: number | null;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 shadow-2xl shadow-black/20">
      <div className="rounded-xl border border-gray-800 bg-[#111827]/80 p-4">
        <div className="rounded-lg border border-gray-800 bg-gray-950/80 px-4 py-3">
          <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
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

        <div className="mt-4 space-y-4">{children}</div>
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
  const [weatherMetric, setWeatherMetric] = useState<WeatherMetric>(() =>
    defaultWeatherMetric(initialSeason()),
  );
  const [selectedYears, setSelectedYears] = useState<number[]>(
    () => DEFAULT_SELECTED_CONTRACT_YEARS,
  );
  const [recentDays, setRecentDays] = useState(7);
  const [cashSeason, setCashSeason] = useState<SeasonKey>(() => initialSeason());
  const [cashMonth, setCashMonth] = useState(() => initialMonth(initialSeason()));
  const [cashWeatherMetric, setCashWeatherMetric] = useState<WeatherMetric>(() =>
    defaultWeatherMetric(initialSeason()),
  );
  const [cashSelectedYears, setCashSelectedYears] = useState<number[]>(
    () => DEFAULT_SELECTED_CONTRACT_YEARS,
  );
  const [cashRecentDays, setCashRecentDays] = useState(7);
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
  const [tableCollapsed, setTableCollapsed] = useState(false);
  const [showDeltas, setShowDeltas] = useState(false);
  const [gradientEnabled, setGradientEnabled] = useState(true);
  const [collapsedSaltPivotMeasureKeys, setCollapsedSaltPivotMeasureKeys] = useState<
    Set<SaltPivotMeasureKey>
  >(() => new Set(["weather", "cash"]));
  const [expandedSaltFacilityRegions, setExpandedSaltFacilityRegions] = useState<
    Set<SaltFacilityRegionKey>
  >(() => new Set());
  const [collapsedSaltPivotPeriods, setCollapsedSaltPivotPeriods] = useState<
    Set<SaltTablePeriod>
  >(() => new Set(["weekly", "monthly"]));
  const [plotsCollapsed, setPlotsCollapsed] = useState(false);
  const [cashPlotsCollapsed, setCashPlotsCollapsed] = useState(false);
  const [hiddenSeasonRoles, setHiddenSeasonRoles] = useState<Set<SeasonRole>>(
    () => new Set(DEFAULT_HIDDEN_SEASON_ROLES),
  );
  const [cashHiddenSeasonRoles, setCashHiddenSeasonRoles] = useState<Set<SeasonRole>>(
    () => new Set(DEFAULT_HIDDEN_SEASON_ROLES),
  );
  const [hiddenLookbackRoles, setHiddenLookbackRoles] = useState<Set<LookbackRole>>(
    () => new Set(),
  );
  const [cashHiddenLookbackRoles, setCashHiddenLookbackRoles] = useState<Set<LookbackRole>>(
    () => new Set(),
  );
  const [data, setData] = useState<WxAdjPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiElapsedMs, setApiElapsedMs] = useState<number | null>(null);
  const [cashData, setCashData] = useState<WxAdjPayload | null>(null);
  const [cashLoading, setCashLoading] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const [cashApiElapsedMs, setCashApiElapsedMs] = useState<number | null>(null);
  const [forecastData, setForecastData] = useState<SaltForecastPayload | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [forecastApiElapsedMs, setForecastApiElapsedMs] = useState<number | null>(null);
  const lookbackYears = lookbackYearsForSelectedYears(selectedYears);
  const cashLookbackYears = lookbackYearsForSelectedYears(cashSelectedYears);

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
        weatherMetric,
        lookbackYears:
          activeTab === "salt-plots" ? Math.min(7, saltPlotsSeasonalYears) : lookbackYears,
        recentDays:
          activeTab === "salt-plots" ? Math.min(saltPlotsFlowWindow, 31) : recentDays,
        tableLookbackMonths:
          activeTab === "salt-plots" ? 12 : undefined,
        saltPlotLookbackDays: activeTab === "salt-plots" ? saltPlotsLookbackDays : undefined,
        includeInventory: activeTab === "salt-plots",
        inventoryOnly: activeTab === "salt-plots",
        includeGasPrompt: activeTab === "wx-adj-scrapes" ? false : undefined,
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
      weatherMetric,
    ],
  );

  const cashRequestUrl = useMemo(
    () =>
      makeApiUrl({
        season: cashSeason,
        month: cashMonth,
        weatherMetric: cashWeatherMetric,
        lookbackYears: cashLookbackYears,
        recentDays: cashRecentDays,
        gasPromptOnly: true,
      }),
    [cashLookbackYears, cashMonth, cashRecentDays, cashSeason, cashWeatherMetric],
  );

  const forecastActive = activeTab === "salt-fc" || activeTab === "salt-fc-simple";
  const forecastSaltRegion: SaltForecastRegion =
    activeTab === "salt-fc-simple" ? "salt-main" : saltForecastRegion;
  const forecastWeatherRegion: SaltForecastWeatherRegion =
    activeTab === "salt-fc-simple" ? "SOUTHCENTRAL" : saltForecastWeatherRegion;

  const forecastRequestUrl = useMemo(
    () =>
      makeSaltForecastApiUrl({
        saltRegion: forecastSaltRegion,
        weatherRegion: forecastWeatherRegion,
        lookbackWeeks: saltForecastLookbackWeeks,
      }),
    [forecastSaltRegion, forecastWeatherRegion, saltForecastLookbackWeeks],
  );

  useEffect(() => {
    if (forecastActive) {
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
      key: `api:salts:wx-adj:grid:${activeTab}:${season}:${month}:${weatherMetric}:${lookbackYears}:${recentDays}:${saltPlotsLookbackDays}:${saltPlotsSeasonalYears}:${saltPlotsFlowWindow}`,
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
        setError(err.message || "Failed to load Salts Home data");
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
    forecastActive,
    lookbackYears,
    month,
    recentDays,
    requestUrl,
    saltPlotsFlowWindow,
    saltPlotsLookbackDays,
    saltPlotsSeasonalYears,
    season,
      weatherMetric,
    ]);

  useEffect(() => {
    if (activeTab !== "wx-adj-scrapes") {
      setCashLoading(false);
      setCashError(null);
      setCashApiElapsedMs(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    const startedAt = performance.now();
    setCashLoading(true);
    setCashError(null);
    setCashApiElapsedMs(null);

    fetchJsonWithCache<WxAdjPayload>({
      key: `api:salts:cash-balmo:${cashSeason}:${cashMonth}:${cashWeatherMetric}:${cashLookbackYears}:${cashRecentDays}`,
      url: cashRequestUrl,
      ttlMs: API_CACHE_TTL_MS,
      signal: controller.signal,
      cacheMode: "no-store",
    })
      .then((payload) => {
        if (!active) return;
        setCashData(payload);
        setCashApiElapsedMs(performance.now() - startedAt);
      })
      .catch((err: Error) => {
        if (!active || err.name === "AbortError") return;
        setCashData(null);
        setCashError(err.message || "Failed to load Cash-BalMo data");
        setCashApiElapsedMs(performance.now() - startedAt);
      })
      .finally(() => {
        if (active) setCashLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    activeTab,
    cashLookbackYears,
    cashMonth,
    cashRecentDays,
    cashRequestUrl,
    cashSeason,
    cashWeatherMetric,
  ]);

  useEffect(() => {
    if (!forecastActive) return;

    const controller = new AbortController();
    let active = true;
    const startedAt = performance.now();
    setForecastLoading(true);
    setForecastError(null);
    setForecastApiElapsedMs(null);

    fetchJsonWithCache<SaltForecastPayload>({
      key: `api:salts:forecast:${forecastSaltRegion}:${forecastWeatherRegion}:${saltForecastLookbackWeeks}`,
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
        setForecastError(err.message || "Failed to load Salts Forecast diagnostics");
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
    forecastActive,
    forecastRequestUrl,
    forecastSaltRegion,
    forecastWeatherRegion,
    saltForecastLookbackWeeks,
  ]);

  const saltChart = useMemo(() => {
    const selectedYearSet = new Set(selectedYears);
    const plots: WxAdjPlot[] = data?.plots?.length
      ? data.plots
      : [
          {
            id: `${data?.selected.weatherMetric}:${data?.selected.saltsMetric}`,
            title: `${metricLabel(data?.selected.saltsMetric ?? "salts_total")} vs ${metricLabel(data?.selected.weatherMetric ?? weatherMetric)}`,
            scope: "month",
            scopeLabel: monthLabel(data?.selected.month ?? month),
            weatherMetric: data?.selected.weatherMetric ?? weatherMetric,
            saltsMetric: data?.selected.saltsMetric ?? "salts_total",
            pointCount: data?.points.length ?? 0,
            minDate: data?.summary.minDate ?? null,
            maxDate: data?.summary.maxDate ?? null,
            points: data?.points ?? [],
          },
      ];
    const plotCharts = plots
      .map((plot) => buildPlotChart(filterPlotBySelectedYears(plot, selectedYearSet)))
      .sort((left, right) => plotSortValue(left.plot) - plotSortValue(right.plot));
    const plotRows = SALTS_METRICS.map((metric) => {
      const metricCharts = plotCharts.filter((plotChart) => plotChart.plot.saltsMetric === metric.value);
      return {
        saltsMetric: metric.value,
        saltLabel: metric.label,
        monthChart: metricCharts.find((plotChart) => plotChart.plot.scope === "month") ?? null,
        seasonChart: metricCharts.find((plotChart) => plotChart.plot.scope === "season") ?? null,
      };
    }).filter((row) => row.monthChart || row.seasonChart);
    const seasonLabels = Array.from(
      new Set(
        plotCharts.flatMap((plotChart) => plotChart.plot.points.map((point) => point.seasonLabel)),
      ),
    ).sort(
      (left, right) => seasonSortValue(right) - seasonSortValue(left),
    );
    const seasonLegend = buildSeasonLegend(seasonLabels);
    return { plotCharts, plotRows, seasonLegend };
  }, [data, month, selectedYears, weatherMetric]);

  const cashChart = useMemo(() => {
    const selectedYearSet = new Set(cashSelectedYears);
    const gasPromptPlotCharts = (cashData?.gasPromptPlots ?? [])
      .map((plot) => buildPlotChart(filterPlotBySelectedYears(plot, selectedYearSet)))
      .sort((left, right) => gasPromptPlotSortValue(left.plot) - gasPromptPlotSortValue(right.plot));
    const gasPromptMonthCharts = GAS_PROMPT_MARKETS.map((market) =>
      gasPromptPlotCharts.find(
        (plotChart) =>
          plotChart.plot.marketKey === market.value && plotChart.plot.scope === "month",
      ),
    ).filter((plotChart): plotChart is PlotChart<GasPromptPlot> => Boolean(plotChart));
    const seasonLabels = Array.from(
      new Set(
        gasPromptMonthCharts.flatMap((plotChart) =>
          plotChart.plot.points.map((point) => point.seasonLabel),
        ),
      ),
    ).sort((left, right) => seasonSortValue(right) - seasonSortValue(left));
    const seasonLegend = buildSeasonLegend(seasonLabels);
    return { gasPromptMonthCharts, seasonLegend };
  }, [cashData?.gasPromptPlots, cashSelectedYears]);

  const contractYearOptions = useMemo(
    () => contractYearOptionsFromPayload(data, selectedYears),
    [data, selectedYears],
  );
  const cashContractYearOptions = useMemo(
    () => contractYearOptionsFromPayload(cashData, cashSelectedYears),
    [cashData, cashSelectedYears],
  );

  const saltPivotTables = useMemo(
    () =>
      SALT_TABLE_PERIODS.map((period) =>
        buildSaltPivotTable(data?.tableRows ?? [], "all", period),
      ),
    [data?.tableRows],
  );
  const saltPivotRowCount = saltPivotTables.reduce(
    (sum, table) => sum + table.rows.length,
    0,
  );
  const saltPivotVisibleRowCount = saltPivotTables.reduce(
    (sum, table) =>
      sum +
      visibleSaltPivotRowCount(
        table.rows,
        collapsedSaltPivotMeasureKeys,
        expandedSaltFacilityRegions,
      ),
    0,
  );
  const saltPivotDataMinDate = saltPivotTables[0]?.dataMinDate ?? null;
  const saltPivotDataMaxDate = saltPivotTables[0]?.dataMaxDate ?? null;
  const saltPivotSourceDayCount = saltPivotTables[0]?.sourceDayCount ?? 0;
  const saltPivotPeriodSummary = saltPivotTables
    .map((table) => `${table.columns.length} ${saltPivotPeriodTitle(table.period).toLowerCase()}`)
    .join(" | ");

  useEffect(() => {
    if (!focusedSaltPlotMetric) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocusedSaltPlotMetric(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focusedSaltPlotMetric]);

  const selectedMonthOptions = validMonths(season).map((value) => ({
    value,
    label: monthLabel(value),
  }));
  const cashSelectedMonthOptions = validMonths(cashSeason).map((value) => ({
    value,
    label: monthLabel(value),
  }));
  const selectedWeatherMetricOptions = WEATHER_METRICS_BY_SEASON[season];
  const selectedWeatherMetricLabel =
    selectedWeatherMetricOptions.find((option) => option.value === weatherMetric)?.label ??
    metricLabel(weatherMetric);
  const selectedCashWeatherMetricOptions = WEATHER_METRICS_BY_SEASON[cashSeason];
  const selectedCashWeatherMetricLabel =
    selectedCashWeatherMetricOptions.find((option) => option.value === cashWeatherMetric)?.label ??
    metricLabel(cashWeatherMetric);
  const hasSaltPlotPoints = saltChart.plotCharts.some((plotChart) => plotChart.plot.points.length > 0);
  const hasGasPromptPlotPoints = cashChart.gasPromptMonthCharts.some(
    (plotChart) => plotChart.plot.points.length > 0,
  );
  const gasPromptRenderedDates = cashChart.gasPromptMonthCharts.flatMap((plotChart) =>
    plotChart.plot.points.map((point) => point.date),
  );
  const gasPromptRenderedSortedDates = [...gasPromptRenderedDates].sort();
  const gasPromptRenderedMinDate = gasPromptRenderedSortedDates[0] ?? null;
  const gasPromptRenderedMaxDate = gasPromptRenderedSortedDates.at(-1) ?? null;
  const gasPromptPointCount = cashChart.gasPromptMonthCharts.reduce(
    (sum, plotChart) => sum + plotChart.plot.pointCount,
    0,
  );
  const saltScatterPlotCount = data ? data.summary.plotCount ?? saltChart.plotCharts.length : 0;
  const gasPromptPlotCount = cashChart.gasPromptMonthCharts.length;
  const saltPlotSubtitle = `${season.toUpperCase()} ${monthLabel(month)} + Season | ${selectedWeatherMetricLabel}`;
  const cashPlotSubtitle = `${cashSeason.toUpperCase()} ${monthLabel(cashMonth)} | ${selectedCashWeatherMetricLabel}`;
  const highlightStartDate = data?.summary.maxDate
    ? shiftIsoDate(data.summary.maxDate, -(recentDays - 1))
    : null;
  const highlightPriorStartDate = shiftIsoYear(highlightStartDate, -1);
  const highlightPriorEndDate = shiftIsoYear(data?.summary.maxDate ?? null, -1);
  const cashHighlightStartDate = gasPromptRenderedMaxDate
    ? shiftIsoDate(gasPromptRenderedMaxDate, -(cashRecentDays - 1))
    : null;
  const cashHighlightPriorStartDate = shiftIsoYear(cashHighlightStartDate, -1);
  const cashHighlightPriorEndDate = shiftIsoYear(gasPromptRenderedMaxDate, -1);

  const handleSeasonChange = (nextSeason: SeasonKey) => {
    setSeason(nextSeason);
    setMonth(initialMonth(nextSeason));
    setWeatherMetric(defaultWeatherMetric(nextSeason));
  };

  const handleCashSeasonChange = (nextSeason: SeasonKey) => {
    setCashSeason(nextSeason);
    setCashMonth(initialMonth(nextSeason));
    setCashWeatherMetric((currentMetric) => weatherMetricForSeason(nextSeason, currentMetric));
  };

  const toggleSaltPivotMeasure = (measureKey: SaltPivotMeasureKey) => {
    setCollapsedSaltPivotMeasureKeys((previous) => {
      const next = new Set(previous);
      if (next.has(measureKey)) {
        next.delete(measureKey);
      } else {
        next.add(measureKey);
      }
      return next;
    });
  };

  const toggleSaltFacilityRegion = (region: SaltFacilityRegionKey) => {
    setExpandedSaltFacilityRegions((previous) => {
      const next = new Set(previous);
      if (next.has(region)) {
        next.delete(region);
      } else {
        next.add(region);
      }
      return next;
    });
  };

  const toggleSaltPivotPeriodCollapse = (period: SaltTablePeriod) => {
    if (period === "daily") return;
    setCollapsedSaltPivotPeriods((previous) => {
      const next = new Set(previous);
      if (next.has(period)) {
        next.delete(period);
      } else {
        next.add(period);
      }
      return next;
    });
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

  const showAllSeasonRoles = () => {
    setHiddenSeasonRoles(new Set());
  };

  const hideAllSeasonRoles = () => {
    setHiddenSeasonRoles(new Set(saltChart.seasonLegend.map((item) => item.key)));
  };

  const setContractYearSelected = (year: number, selected: boolean) => {
    setSelectedYears((previous) => setSelectedYear(previous, year, selected));
  };

  const toggleLookbackRole = (role: LookbackRole) => {
    setHiddenLookbackRoles((previous) => {
      const next = new Set(previous);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  };

  const toggleCashSeasonRole = (role: SeasonRole) => {
    setCashHiddenSeasonRoles((previous) => {
      const next = new Set(previous);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  };

  const showAllCashSeasonRoles = () => {
    setCashHiddenSeasonRoles(new Set());
  };

  const hideAllCashSeasonRoles = () => {
    setCashHiddenSeasonRoles(new Set(cashChart.seasonLegend.map((item) => item.key)));
  };

  const setCashContractYearSelected = (year: number, selected: boolean) => {
    setCashSelectedYears((previous) => setSelectedYear(previous, year, selected));
  };

  const toggleCashLookbackRole = (role: LookbackRole) => {
    setCashHiddenLookbackRoles((previous) => {
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

      {activeTab === "salt-fc-simple" && (
        <SimpleSaltRegressionTab
          data={forecastData}
          loading={forecastLoading}
          error={forecastError}
          apiElapsedMs={forecastApiElapsedMs}
          lookbackWeeks={saltForecastLookbackWeeks}
          setLookbackWeeks={setSaltForecastLookbackWeeks}
        />
      )}

      {activeTab === "wx-adj-scrapes" && (
        <SaltModelTab apiElapsedMs={apiElapsedMs}>
          <section className="overflow-hidden rounded-lg border border-gray-800 bg-[#0d1118] shadow-xl shadow-black/20">
            <div className="flex flex-col gap-3 border-b border-gray-800 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold uppercase text-gray-100">
                  Tables - Salt Noms + Weather + Cash Gas
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {saltPivotVisibleRowCount.toLocaleString()}/{saltPivotRowCount.toLocaleString()} metric rows |{" "}
                  {saltPivotPeriodSummary} | Deltas {showDeltas ? "shown" : "hidden"} |{" "}
                  {saltPivotSourceDayCount.toLocaleString()} joined days | {fmtDate(saltPivotDataMinDate)} to{" "}
                  {fmtDate(saltPivotDataMaxDate)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ToggleButton
                  pressed={showDeltas}
                  onClick={() => setShowDeltas((value) => !value)}
                  ariaLabel={`${showDeltas ? "Hide" : "Show"} inline table deltas`}
                >
                  Deltas
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
              <div className="px-3 py-4">
                {loading ? (
                  <div className="p-4 text-sm text-gray-500">Loading Salts Home table data...</div>
                ) : error ? (
                  <div className="rounded-lg border border-red-500/25 bg-red-950/45 px-4 py-3 text-sm text-red-200">
                    {error}
                  </div>
                ) : !data ? (
                  <div className="p-4 text-sm text-gray-500">
                    No Salts Home table payload is available for the selected window.
                  </div>
                ) : saltPivotTables.every((table) => table.rows.length === 0 || table.columns.length === 0) ? (
                  <div className="p-4 text-sm text-gray-500">
                    No joined salts table rows are available.
                  </div>
                ) : (
                  <div className="flex w-full flex-col items-start gap-4 xl:flex-row xl:flex-nowrap">
                    {saltPivotTables.map((table) => (
                      <SaltPivotPeriodSection
                        key={table.period}
                        table={table}
                        showDeltas={showDeltas}
                        gradientEnabled={gradientEnabled}
                        collapsedMeasureKeys={collapsedSaltPivotMeasureKeys}
                        expandedFacilityRegions={expandedSaltFacilityRegions}
                        periodCollapsed={collapsedSaltPivotPeriods.has(table.period)}
                        onToggleMeasure={toggleSaltPivotMeasure}
                        onToggleFacilityRegion={toggleSaltFacilityRegion}
                        onTogglePeriodCollapse={toggleSaltPivotPeriodCollapse}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-800 bg-[#0d1118] shadow-xl shadow-black/20">
            <div className="flex flex-col gap-3 border-b border-gray-800 px-4 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold uppercase text-gray-100">
                    Cash-BalMo vs Weather
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {cashPlotSubtitle} | {gasPromptPointCount.toLocaleString()} matched points |{" "}
                    {fmtDate(gasPromptRenderedMinDate)} to{" "}
                    {fmtDate(gasPromptRenderedMaxDate)} | {gasPromptPlotCount.toLocaleString()} plots | API{" "}
                    {fmtMs(cashApiElapsedMs)} | Highlight {fmtDate(cashHighlightStartDate)} to{" "}
                    {fmtDate(gasPromptRenderedMaxDate)} | LY {fmtDate(cashHighlightPriorStartDate)} to{" "}
                    {fmtDate(cashHighlightPriorEndDate)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-7 items-center gap-2 rounded-md border border-gray-700 bg-gray-900/60 px-2.5 text-[11px] font-semibold text-gray-300">
                    <span className="h-2 w-2 rounded-full border-2 border-gray-400" />
                    Last {cashRecentDays}D + LY
                  </span>
                  <button
                    type="button"
                    onClick={() => setCashPlotsCollapsed((value) => !value)}
                    aria-expanded={!cashPlotsCollapsed}
                    className="h-7 rounded-md border border-gray-700 bg-gray-800 px-2.5 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                  >
                    {cashPlotsCollapsed ? "Show" : "Hide"}
                  </button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(260px,1fr)_130px_120px_210px_130px]">
                <YearMultiSelect
                  label="Years"
                  years={cashContractYearOptions}
                  selectedYears={cashSelectedYears}
                  onYearSelected={setCashContractYearSelected}
                  ariaLabel="Cash-BalMo Contract Years"
                />

                <label>
                  <span className={labelClass}>Season</span>
                  <select
                    value={cashSeason}
                    onChange={(event) => handleCashSeasonChange(event.target.value as SeasonKey)}
                    className={controlClass}
                    aria-label="Cash-BalMo Season"
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
                    value={cashMonth}
                    onChange={(event) => setCashMonth(Number(event.target.value))}
                    className={controlClass}
                    aria-label="Cash-BalMo Month"
                  >
                    {cashSelectedMonthOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className={labelClass}>Weather Metric</span>
                  <select
                    value={cashWeatherMetric}
                    onChange={(event) => setCashWeatherMetric(event.target.value as WeatherMetric)}
                    className={controlClass}
                    aria-label="Cash-BalMo Weather Metric"
                  >
                    {selectedCashWeatherMetricOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className={labelClass}>Highlight Days</span>
                  <select
                    value={cashRecentDays}
                    onChange={(event) => setCashRecentDays(Number(event.target.value))}
                    className={controlClass}
                    aria-label="Cash-BalMo Highlight Days"
                  >
                    {[3, 5, 7, 10, 14, 21, 31].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {!cashPlotsCollapsed && (
              <div className="min-w-0 p-3">
                {cashLoading ? (
                  <div className="flex h-full items-center justify-center p-4 text-sm text-gray-500">
                    Loading Cash-BalMo plots...
                  </div>
                ) : cashError ? (
                  <div className="rounded-lg border border-red-500/25 bg-red-950/45 px-4 py-3 text-sm text-red-200">
                    {cashError}
                  </div>
                ) : !cashData ? (
                  <div className="flex h-full items-center justify-center p-4 text-sm text-gray-500">
                    No Cash-BalMo payload is available for this selection.
                  </div>
                ) : !hasGasPromptPlotPoints ? (
                  <div className="flex h-full items-center justify-center p-4 text-sm text-gray-500">
                    No matched Cash-BalMo price/weather rows are available for this selection.
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {cashChart.gasPromptMonthCharts.map((plotChart) => (
                      <WxAdjScatterPlotCard
                        key={plotChart.plot.id}
                        plotChart={plotChart}
                        seasonLegend={cashChart.seasonLegend}
                        hiddenSeasonRoles={cashHiddenSeasonRoles}
                        hiddenLookbackRoles={cashHiddenLookbackRoles}
                        onToggleSeasonRole={toggleCashSeasonRole}
                        onToggleLookbackRole={toggleCashLookbackRole}
                        onShowAllSeasonRoles={showAllCashSeasonRoles}
                        onHideAllSeasonRoles={hideAllCashSeasonRoles}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-800 bg-[#0d1118] shadow-xl shadow-black/20">
            <div className="flex flex-col gap-3 border-b border-gray-800 px-4 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold uppercase text-gray-100">
                    Salts Wx Adj Plots
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {saltPlotSubtitle} |{" "}
                    {(data?.summary.dailyRowCount ?? data?.summary.pointCount ?? 0).toLocaleString()} matched days |{" "}
                    {fmtDate(data?.summary.minDate)} to {fmtDate(data?.summary.maxDate)} |{" "}
                    {saltScatterPlotCount.toLocaleString()} plots | Highlight {fmtDate(highlightStartDate)} to{" "}
                    {fmtDate(data?.summary.maxDate)} | LY {fmtDate(highlightPriorStartDate)} to{" "}
                    {fmtDate(highlightPriorEndDate)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-7 items-center gap-2 rounded-md border border-gray-700 bg-gray-900/60 px-2.5 text-[11px] font-semibold text-gray-300">
                    <span className="h-2 w-2 rounded-full border-2 border-gray-400" />
                    Last {recentDays}D + LY
                  </span>
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

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(260px,1fr)_130px_120px_210px_130px]">
                <YearMultiSelect
                  label="Years"
                  years={contractYearOptions}
                  selectedYears={selectedYears}
                  onYearSelected={setContractYearSelected}
                  ariaLabel="Contract Years"
                />

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
                  <span className={labelClass}>Weather Metric</span>
                  <select
                    value={weatherMetric}
                    onChange={(event) => setWeatherMetric(event.target.value as WeatherMetric)}
                    className={controlClass}
                    aria-label="Weather Metric"
                  >
                    {selectedWeatherMetricOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
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
            </div>

            {!plotsCollapsed && (
              <div className="min-w-0 p-3">
                {loading ? (
                  <div className="flex h-full items-center justify-center p-4 text-sm text-gray-500">
                    Loading Salts Wx Adj plots...
                  </div>
                ) : error ? (
                  <div className="rounded-lg border border-red-500/25 bg-red-950/45 px-4 py-3 text-sm text-red-200">
                    {error}
                  </div>
                ) : !data ? (
                  <div className="flex h-full items-center justify-center p-4 text-sm text-gray-500">
                    No Salts Wx Adj payload is available for this selection.
                  </div>
                ) : !hasSaltPlotPoints ? (
                  <div className="flex h-full items-center justify-center p-4 text-sm text-gray-500">
                    No matched salts rows are available for this selection.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {saltChart.plotRows.map((plotRow) => (
                      <div key={plotRow.saltsMetric} className="grid gap-3 lg:grid-cols-2">
                        {plotRow.monthChart && (
                          <WxAdjScatterPlotCard
                            key={plotRow.monthChart.plot.id}
                            plotChart={plotRow.monthChart}
                            seasonLegend={saltChart.seasonLegend}
                            hiddenSeasonRoles={hiddenSeasonRoles}
                            hiddenLookbackRoles={hiddenLookbackRoles}
                            onToggleSeasonRole={toggleSeasonRole}
                            onToggleLookbackRole={toggleLookbackRole}
                            onShowAllSeasonRoles={showAllSeasonRoles}
                            onHideAllSeasonRoles={hideAllSeasonRoles}
                          />
                        )}
                        {plotRow.seasonChart && (
                          <WxAdjScatterPlotCard
                            key={plotRow.seasonChart.plot.id}
                            plotChart={plotRow.seasonChart}
                            seasonLegend={saltChart.seasonLegend}
                            hiddenSeasonRoles={hiddenSeasonRoles}
                            hiddenLookbackRoles={hiddenLookbackRoles}
                            onToggleSeasonRole={toggleSeasonRole}
                            onToggleLookbackRole={toggleLookbackRole}
                            onShowAllSeasonRoles={showAllSeasonRoles}
                            onHideAllSeasonRoles={hideAllSeasonRoles}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </SaltModelTab>
      )}

    </div>
  );
}
