import {
  observedJsonRoute,
  type ObservedRouteResult,
} from "@/lib/server/apiObservability";
import {
  NEXT_DAY_GAS_PRICE_COLUMNS,
  type NextDayGasPriceMetric,
} from "@/lib/gasPricing/nextDayGas";
import { query } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import { localOnlyObservedNotFound } from "@/lib/server/localOnlyApi";
import { mssqlQuery } from "@/lib/server/mssql";
import { bindPromotedSql, readPjmDaPromotedSql } from "@/lib/server/pjmDaPromotedSql";
import {
  buildSaltFacilitiesTableSql,
  buildSaltFacilitiesWxAdjSql,
  buildSaltInventoriesTableSql,
  loadPromotedSaltFacilitiesBcfSql,
  loadPromotedSaltInventoriesSql,
} from "@/lib/salts/sql";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "private, no-store";
const ROUTE = "/api/salts/wx-adj-scrapes";
const MIN_SOURCE_YEAR = 2020;
const DEFAULT_TABLE_LOOKBACK_MONTHS = 36;
const MIN_TABLE_LOOKBACK_MONTHS = 12;
const MAX_TABLE_LOOKBACK_MONTHS = 84;
const DEFAULT_SALT_PLOT_LOOKBACK_DAYS = 2200;
const MIN_SALT_PLOT_LOOKBACK_DAYS = 365;
const MAX_SALT_PLOT_LOOKBACK_DAYS = 3650;

const ROUTE_CONFIG = {
  route: ROUTE,
  cacheHeader: CACHE_HEADER,
  cachePolicy: "no-store",
  owner: "gas",
  purpose: "Local-dev Salts Home weather-adjusted Genscape table and scatter data.",
  p95TargetMs: 3_000,
  freshnessSource:
    "Promoted dbt salts mart SQL over GenscapeDataFeed.natgas and helios_prod WSI observations/forecasts",
} as const;

type Season = "WINTER" | "SUMMER";
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
type PlotScope = "month" | "season";
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
type SaltTableMetric = SaltsMetric | SaltFacilityMetric;

interface GasPromptMarketConfig {
  key: GasPromptMarketKey;
  label: string;
  cashSymbol: string;
  balmoSymbol: string;
  weatherMetricBySeason: Record<Season, WeatherMetric>;
  sortIndex: number;
}

const WINTER_MONTHS = [11, 12, 1, 2, 3] as const;
const SUMMER_MONTHS = [4, 5, 6, 7, 8, 9, 10] as const;
const TDD_WEATHER_METRICS = ["southcentral_tdd", "conus_tdd"] as const;
const DEFAULT_WEATHER_METRICS_BY_SEASON: Record<Season, WeatherMetric> = {
  WINTER: "conus_gas_hdd",
  SUMMER: "conus_population_cdd",
};
const GAS_PROMPT_PRICE_METRIC = "cash_balmo" as const;
const GAS_PROMPT_PRICE_METRICS = [GAS_PROMPT_PRICE_METRIC] as const;
const GAS_PROMPT_MARKETS: readonly GasPromptMarketConfig[] = [
  {
    key: "henry_hub",
    label: "Henry Hub",
    cashSymbol: "XGF D1-IPG",
    balmoSymbol: "HHD B0-IUS",
    weatherMetricBySeason: {
      WINTER: "conus_gas_hdd",
      SUMMER: "conus_population_cdd",
    },
    sortIndex: 0,
  },
  {
    key: "transco_st85",
    label: "St 85",
    cashSymbol: "XVA D1-IPG",
    balmoSymbol: "TRW B0-IUS",
    weatherMetricBySeason: {
      WINTER: "southcentral_gas_hdd",
      SUMMER: "southcentral_population_cdd",
    },
    sortIndex: 1,
  },
] as const;
const WINTER_WEATHER_METRICS = [
  "southcentral_gas_hdd",
  "conus_gas_hdd",
  ...TDD_WEATHER_METRICS,
] as const;
const SUMMER_WEATHER_METRICS = [
  "southcentral_population_cdd",
  "conus_population_cdd",
  ...TDD_WEATHER_METRICS,
] as const;
const ALL_WEATHER_METRICS = [
  "southcentral_gas_hdd",
  "conus_gas_hdd",
  "southcentral_population_cdd",
  "conus_population_cdd",
  ...TDD_WEATHER_METRICS,
] as const;
const SALTS_METRICS = ["salts_total", "salts_tx", "salts_la", "salts_ms", "salts_al"] as const;
const SALT_FACILITY_METRICS = [
  "golden_triangle",
  "keystone",
  "moss_bluff",
  "tres_palacios",
  "arcadia",
  "boardwalk",
  "bobcat",
  "egan",
  "jefferson_island",
  "la_storage",
  "perryville",
  "pine_prarie",
  "eminence",
  "leaf_river",
  "mississippi_hub",
  "petal",
  "southern_pines",
  "bay_gas",
] as const;
const SALT_TABLE_METRICS = [...SALTS_METRICS, ...SALT_FACILITY_METRICS] as const;
const SALT_INVENTORY_FACILITY_METRICS = [
  "golden_triangle",
  "pine_prarie",
  "perryville",
  "southern_pines",
  "eminence",
] as const;

const MONTH_LABELS = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const SOURCE_CONTRACT = {
  sourceSystem: "Promoted dbt salts mart SQL with explicit split-source reads",
  grain: "one gas day after joining Azure SQL salts values to helios_prod weather and ICE gas cash observations by date/gas_day",
  joins:
    "Azure SQL GenscapeDataFeed salts rows are joined in the route process to helios_prod WSI weather rows on date and ICE next-day gas prices on gas_day.",
  azureSqlTables: [
    "natgas.nominations",
    "natgas.nomination_cycles",
    "natgas.no_notice",
    "natgas.location_role",
    "natgas.location_extended",
    "natgas.pipelines",
  ],
  heliosProdTables: [
    "weather.wsi_daily_weighted_degree_day_observations",
    "weather.wsi_daily_weighted_degree_day_forecasts",
    "ice_python.settlements",
  ],
  units: {
    salts: "BCF daily total, regional, and facility salt cavern flow metrics from the promoted marts_v1_salt_facilities_bcf dbt SQL.",
    weather:
      "Daily WSI weighted degree-day observations, with latest WSI daily forecast rows used only to fill observation lag through the route current date. TDD is derived as gas_hdd + population_cdd.",
    gasPrices:
      "Daily next-day physical gas cash prices in $/MMBtu from the promoted long-form ice_python_next_day_gas dbt SQL, keyed by gas_day x symbol and retaining trade_date.",
    gasPromptPrices:
      "Henry Hub and St 85 cash minus BalMo prices in $/MMBtu, using promoted gas-day cash rows and ICE BalMo settlements joined on the source ICE trade date.",
    inventories:
      "Facility inventory, daily flow, and capacity metrics from the promoted marts_v1_salt_inventories dbt SQL.",
  },
  tables:
    "Frontend derives daily, Friday week-ending, and calendar-month tables from a bounded 36-month route-level join. No Azure SQL or helios_prod objects are created.",
} as const;

const PROMOTED_GAS_PRICE_SQL = {
  path: "backend/modelling/pjm_da_models/sql_inputs/ice_python_next_day_gas.sql",
  dbtModel:
    "dbt/azure_postgres/models/pjm_da_model/ice_python/settlements/ice_python_next_day_gas.sql",
  dbtCompiledSql:
    "dbt/azure_postgres/target/compiled/helioscta_platform/models/pjm_da_model/ice_python/settlements/ice_python_next_day_gas.sql",
} as const;

interface RawSaltRow extends Record<string, unknown> {
  date: string | Date | null;
}

interface RawWeatherRow extends Record<string, unknown> {
  date: string | Date | null;
  weather_data_source: string | null;
}

interface RawGasPriceRow extends Record<string, unknown> {
  gas_day: string | Date | null;
  trade_date: string | Date | null;
  symbol: string | null;
  hub_name: string | null;
  region: string | null;
  gas_price: number | string | null;
  price_basis: string | null;
  latest_trade_date: string | Date | null;
  updated_at: string | Date | null;
}

interface RawGasPromptPriceRow extends Record<string, unknown> {
  gas_day: string | Date | null;
  market_key: string | null;
  market_label: string | null;
  cash_symbol: string | null;
  balmo_symbol: string | null;
  cash_price: number | string | null;
  balmo_price: number | string | null;
  cash_balmo: number | string | null;
  cash_price_basis: string | null;
  balmo_price_basis: string | null;
  cash_trade_date: string | Date | null;
  balmo_trade_date: string | Date | null;
  latest_cash_trade_date: string | Date | null;
  updated_at: string | Date | null;
}

interface RawSaltInventoryRow extends Record<string, unknown> {
  date: string | Date | null;
}

interface InventoryFacilityPayload {
  inventoryBcf: number | null;
  inventoryDeltaBcf: number | null;
  dailyFlowMmcf: number | null;
  availableCapBcf: number | null;
  operationalCapBcf: number | null;
  designCapBcf: number | null;
}

interface GasPriceDailyBucket {
  prices: Partial<Record<NextDayGasPriceMetric, number | null>>;
  tradeDate: string | null;
  latestTradeDate: string | null;
  updatedAt: string | null;
}

interface InventoryDailyRow {
  date: string;
  label: string;
  year: number | null;
  month: number;
  monthLabel: string;
  mmDd: string | null;
  season: SeasonKey;
  seasonLabel: string;
  facilities: Partial<Record<(typeof SALT_INVENTORY_FACILITY_METRICS)[number], InventoryFacilityPayload>>;
}

interface JoinedPoint {
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

interface DailyJoinedRow {
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
  salts: Partial<Record<SaltTableMetric, number | null>>;
  gas: Partial<Record<NextDayGasPriceMetric, number | null>>;
  gasPriceTradeDate: string | null;
  gasPriceLatestTradeDate: string | null;
  gasPriceUpdatedAt: string | null;
  isRecent: boolean;
  lookbackRole: LookbackRole | null;
}

interface PlotPayload {
  id: string;
  title: string;
  scope: PlotScope;
  scopeLabel: string;
  weatherMetric: WeatherMetric;
  saltsMetric: SaltsMetric;
  pointCount: number;
  minDate: string | null;
  maxDate: string | null;
  points: JoinedPoint[];
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

interface GasPromptPlotPayload {
  id: string;
  title: string;
  scope: PlotScope;
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

function defaultSeason(): Season {
  const currentMonth = new Date().getUTCMonth() + 1;
  return (WINTER_MONTHS as readonly number[]).includes(currentMonth) ? "WINTER" : "SUMMER";
}

function parseSeason(value: string | null): Season {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "WINTER" || normalized === "XH") return "WINTER";
  if (normalized === "SUMMER" || normalized === "JV") return "SUMMER";
  return defaultSeason();
}

function validMonthsForSeason(season: Season): readonly number[] {
  return season === "WINTER" ? WINTER_MONTHS : SUMMER_MONTHS;
}

function defaultMonthForSeason(season: Season): number {
  const currentMonth = new Date().getUTCMonth() + 1;
  const validMonths = validMonthsForSeason(season);
  return validMonths.includes(currentMonth) ? currentMonth : validMonths[0];
}

function parseMonth(value: string | null, season: Season): number {
  const parsed = Number.parseInt(value ?? "", 10);
  const validMonths = validMonthsForSeason(season);
  if (Number.isInteger(parsed) && validMonths.includes(parsed)) return parsed;
  return defaultMonthForSeason(season);
}

function parseInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseWeatherMetric(value: string | null, season: Season): WeatherMetric {
  const validMetrics: readonly WeatherMetric[] =
    season === "WINTER" ? WINTER_WEATHER_METRICS : SUMMER_WEATHER_METRICS;
  return validMetrics.includes(value as WeatherMetric)
    ? (value as WeatherMetric)
    : DEFAULT_WEATHER_METRICS_BY_SEASON[season];
}

function parseSaltsMetric(value: string | null): SaltsMetric {
  return SALTS_METRICS.includes(value as SaltsMetric) ? (value as SaltsMetric) : "salts_total";
}

function dateString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return null;
}

function numberValue(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metricValue(row: Record<string, unknown> | undefined, key: string): number | null {
  if (!row) return null;
  return numberValue(row[key]);
}

function currentIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function maxIsoDate(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function minIsoDate(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(0) ?? null;
}

function addUtcDays(date: Date, days: number): Date {
  const nextDate = new Date(date.getTime());
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function addUtcYears(date: Date, years: number): Date {
  const nextDate = new Date(date.getTime());
  nextDate.setUTCFullYear(nextDate.getUTCFullYear() + years);
  return nextDate;
}

function isoDateFromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function highlightWindows(
  latestDate: string | null,
  recentDays: number,
): Array<{ role: LookbackRole; start: string; end: string }> {
  if (!latestDate) return [];
  const endDate = new Date(`${latestDate}T00:00:00Z`);
  if (Number.isNaN(endDate.getTime())) return [];
  const startDate = addUtcDays(endDate, -(recentDays - 1));

  return [
    {
      role: "cy",
      start: isoDateFromUtc(startDate),
      end: isoDateFromUtc(endDate),
    },
    {
      role: "ly",
      start: isoDateFromUtc(addUtcYears(startDate, -1)),
      end: isoDateFromUtc(addUtcYears(endDate, -1)),
    },
  ];
}

function lookbackRoleForDate(
  date: string,
  windows: Array<{ role: LookbackRole; start: string; end: string }>,
): LookbackRole | null {
  return windows.find((window) => date >= window.start && date <= window.end)?.role ?? null;
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function promotedSqlBody(sql: string): string {
  return sql.trim().replace(/;\s*$/, "");
}

function gasPromptMarketValuesSql(): string {
  return GAS_PROMPT_MARKETS.map((market) =>
    [
      "        (",
      [
        sqlText(market.key),
        sqlText(market.label),
        sqlText(market.cashSymbol),
        sqlText(market.balmoSymbol),
        market.sortIndex,
      ].join(", "),
      ")",
    ].join(""),
  ).join(",\n");
}

function buildWeatherByDate(rows: RawWeatherRow[]): Map<string, RawWeatherRow> {
  const weatherByDate = new Map<string, RawWeatherRow>();
  for (const row of rows) {
    const rowDate = dateString(row.date);
    if (rowDate) weatherByDate.set(rowDate, row);
  }
  return weatherByDate;
}

function buildGasPriceBuckets(rows: RawGasPriceRow[]): Map<string, GasPriceDailyBucket> {
  const buckets = new Map<string, GasPriceDailyBucket>();

  for (const row of rows) {
    const rowDate = dateString(row.gas_day);
    const symbol = typeof row.symbol === "string" && row.symbol.length > 0 ? row.symbol : null;
    if (!rowDate || !symbol) continue;

    let bucket = buckets.get(rowDate);
    if (!bucket) {
      bucket = {
        prices: {},
        tradeDate: null,
        latestTradeDate: null,
        updatedAt: null,
      };
      buckets.set(rowDate, bucket);
    }

    bucket.prices[symbol] = numberValue(row.gas_price);
    bucket.tradeDate = maxIsoDate([bucket.tradeDate, dateString(row.trade_date)]);
    bucket.latestTradeDate = maxIsoDate([
      bucket.latestTradeDate,
      dateString(row.latest_trade_date),
    ]);
    bucket.updatedAt = maxIsoDate([bucket.updatedAt, dateString(row.updated_at)]);
  }

  return buckets;
}

function coalescedWeatherSql(dateFilter: (field: string) => string): string {
  return `
    WITH observed_rows AS (
      SELECT
        observation_date::date AS weather_date,
        entity_id::text AS entity_id,
        metric_name::text AS metric_name,
        metric_value::double precision AS metric_value,
        'observed'::text AS weather_data_source
      FROM weather.wsi_daily_weighted_degree_day_observations
      WHERE ${dateFilter("observation_date")}
        AND entity_id IN ('CONUS', 'SOUTHCENTRAL')
        AND metric_name IN ('gas_hdd', 'population_cdd')
    ),
    observed_boundary AS (
      SELECT MAX(weather_date) AS latest_observed_date
      FROM observed_rows
    ),
    latest_wsi_issue AS (
      SELECT source_issue_key
      FROM weather.wsi_daily_weighted_degree_day_forecasts
      WHERE request_region = 'NA'
        AND model = 'WSI'
        AND forecast_type = 'Daily'
        AND bias_corrected = false
        AND entity_id IN ('CONUS', 'SOUTHCENTRAL')
        AND metric_name IN ('gas_hdd', 'population_cdd')
        AND forecast_date >= COALESCE(
          (SELECT latest_observed_date FROM observed_boundary),
          current_date
        )
        AND forecast_date <= current_date
      GROUP BY source_issue_key
      ORDER BY MAX(COALESCE(source_issue_at_utc, scrape_run_at_utc)) DESC, source_issue_key DESC
      LIMIT 1
    ),
    forecast_rows AS (
      SELECT
        f.forecast_date::date AS weather_date,
        f.entity_id::text AS entity_id,
        f.metric_name::text AS metric_name,
        f.metric_value::double precision AS metric_value,
        'wsi_forecast'::text AS weather_data_source
      FROM weather.wsi_daily_weighted_degree_day_forecasts f
      CROSS JOIN observed_boundary boundary
      INNER JOIN latest_wsi_issue issue
        ON issue.source_issue_key = f.source_issue_key
      WHERE ${dateFilter("f.forecast_date")}
        AND f.request_region = 'NA'
        AND f.model = 'WSI'
        AND f.forecast_type = 'Daily'
        AND f.bias_corrected = false
        AND f.entity_id IN ('CONUS', 'SOUTHCENTRAL')
        AND f.metric_name IN ('gas_hdd', 'population_cdd')
        AND f.forecast_date >= COALESCE(boundary.latest_observed_date, current_date)
        AND f.forecast_date <= current_date
    ),
    ranked_rows AS (
      SELECT
        weather_date,
        entity_id,
        metric_name,
        metric_value,
        weather_data_source,
        ROW_NUMBER() OVER (
          PARTITION BY weather_date, entity_id, metric_name
          ORDER BY
            CASE
              WHEN weather_data_source = 'observed' AND metric_value IS NOT NULL THEN 0
              WHEN weather_data_source = 'wsi_forecast' AND metric_value IS NOT NULL THEN 1
              WHEN weather_data_source = 'observed' THEN 2
              ELSE 3
            END
        ) AS source_rank
      FROM (
        SELECT * FROM observed_rows
        UNION ALL
        SELECT * FROM forecast_rows
      ) merged_rows
    ),
    selected_rows AS (
      SELECT
        weather_date,
        entity_id,
        metric_name,
        metric_value,
        weather_data_source
      FROM ranked_rows
      WHERE source_rank = 1
    )
    SELECT
      to_char(weather_date, 'YYYY-MM-DD') AS date,
      CASE
        WHEN BOOL_OR(weather_data_source = 'observed')
          AND BOOL_OR(weather_data_source = 'wsi_forecast')
          THEN 'observed+wsi_forecast'
        WHEN BOOL_OR(weather_data_source = 'observed') THEN 'observed'
        WHEN BOOL_OR(weather_data_source = 'wsi_forecast') THEN 'wsi_forecast'
        ELSE NULL
      END AS weather_data_source,
      AVG(metric_value) FILTER (
        WHERE entity_id = 'CONUS' AND metric_name = 'gas_hdd'
      ) AS conus_gas_hdd,
      AVG(metric_value) FILTER (
        WHERE entity_id = 'CONUS' AND metric_name = 'population_cdd'
      ) AS conus_population_cdd,
      (
        AVG(metric_value) FILTER (
          WHERE entity_id = 'CONUS' AND metric_name = 'gas_hdd'
        )
        + AVG(metric_value) FILTER (
          WHERE entity_id = 'CONUS' AND metric_name = 'population_cdd'
        )
      ) AS conus_tdd,
      AVG(metric_value) FILTER (
        WHERE entity_id = 'SOUTHCENTRAL' AND metric_name = 'gas_hdd'
      ) AS southcentral_gas_hdd,
      AVG(metric_value) FILTER (
        WHERE entity_id = 'SOUTHCENTRAL' AND metric_name = 'population_cdd'
      ) AS southcentral_population_cdd,
      (
        AVG(metric_value) FILTER (
          WHERE entity_id = 'SOUTHCENTRAL' AND metric_name = 'gas_hdd'
        )
        + AVG(metric_value) FILTER (
          WHERE entity_id = 'SOUTHCENTRAL' AND metric_name = 'population_cdd'
        )
      ) AS southcentral_tdd
    FROM selected_rows
    GROUP BY weather_date
    ORDER BY weather_date ASC;
  `;
}

function weatherSql(): string {
  return coalescedWeatherSql(
    (field) => `
        ${field} >= make_date($1::int, 1, 1)
        AND ${field} <= current_date
        AND EXTRACT(month FROM ${field})::int = ANY($2::int[])`,
  );
}

function weatherTableSql(): string {
  return coalescedWeatherSql(
    (field) => `
        ${field} >= current_date - ($1::int * interval '1 month')
        AND ${field} <= current_date`,
  );
}

function gasTableDateRange(tableLookbackMonths: number): { startDate: string; endDate: string } {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime());
  start.setUTCMonth(start.getUTCMonth() - tableLookbackMonths);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function gasPriceSql(tableLookbackMonths: number): { text: string; values: unknown[] } {
  const { startDate, endDate } = gasTableDateRange(tableLookbackMonths);
  return bindPromotedSql(readPjmDaPromotedSql("ice_python_next_day_gas"), {
    start_date: startDate,
    end_date: endDate,
  });
}

function gasPromptPriceSql({
  startYear,
  months,
}: {
  startYear: number;
  months: readonly number[];
}): { text: string; values: unknown[] } {
  const promoted = bindPromotedSql(readPjmDaPromotedSql("ice_python_next_day_gas"), {
    start_date: `${startYear}-01-01`,
    end_date: currentIsoDate(),
  });
  const monthsParam = `$${promoted.values.length + 1}`;

  return {
    text: `
      WITH gas_day_source AS (
${promotedSqlBody(promoted.text)}
      ),
      target_markets AS (
        SELECT *
        FROM (
          VALUES
${gasPromptMarketValuesSql()}
        ) AS mapped(market_key, market_label, cash_symbol, balmo_symbol, sort_index)
      ),
      cash_rows AS (
        SELECT
          g.gas_day::date AS gas_day,
          g.trade_date::date AS cash_trade_date,
          g.latest_trade_date::date AS latest_cash_trade_date,
          m.market_key::text AS market_key,
          m.market_label::text AS market_label,
          m.cash_symbol::text AS cash_symbol,
          m.balmo_symbol::text AS balmo_symbol,
          m.sort_index::int AS sort_index,
          g.gas_price::double precision AS cash_price,
          g.price_basis::text AS cash_price_basis,
          g.updated_at AS cash_updated_at
        FROM gas_day_source g
        INNER JOIN target_markets m
          ON m.cash_symbol = g.symbol
        WHERE EXTRACT(month FROM g.gas_day)::int = ANY(${monthsParam}::int[])
      ),
      balmo_rows_raw AS (
        SELECT
          s.trade_date::date AS trade_date,
          m.market_key::text AS market_key,
          COALESCE(
            NULLIF(s.vwap_close::text, 'NaN')::double precision,
            NULLIF(s.settlement::text, 'NaN')::double precision,
            NULLIF(s.close::text, 'NaN')::double precision
          ) AS balmo_price,
          CASE
            WHEN NULLIF(s.vwap_close::text, 'NaN') IS NOT NULL THEN 'vwap_close'
            WHEN NULLIF(s.settlement::text, 'NaN') IS NOT NULL THEN 'settlement'
            WHEN NULLIF(s.close::text, 'NaN') IS NOT NULL THEN 'close'
          END AS balmo_price_basis,
          s.updated_at AS balmo_updated_at,
          ROW_NUMBER() OVER (
            PARTITION BY s.trade_date::date, m.market_key
            ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
          ) AS row_priority
        FROM ice_python.settlements s
        INNER JOIN target_markets m
          ON m.balmo_symbol = s.symbol
        WHERE s.trade_date::date >= COALESCE(
            (SELECT MIN(cash_trade_date) FROM cash_rows),
            CURRENT_DATE
          ) - INTERVAL '10 days'
          AND s.trade_date::date <= COALESCE(
            (SELECT MAX(cash_trade_date) FROM cash_rows),
            CURRENT_DATE
          ) + INTERVAL '10 days'
          AND COALESCE(
            NULLIF(s.vwap_close::text, 'NaN')::double precision,
            NULLIF(s.settlement::text, 'NaN')::double precision,
            NULLIF(s.close::text, 'NaN')::double precision
          ) IS NOT NULL
      ),
      balmo_rows AS (
        SELECT
          trade_date,
          market_key,
          balmo_price,
          balmo_price_basis,
          balmo_updated_at
        FROM balmo_rows_raw
        WHERE row_priority = 1
      )
      SELECT
        TO_CHAR(c.gas_day, 'YYYY-MM-DD') AS gas_day,
        c.market_key,
        c.market_label,
        c.cash_symbol,
        c.balmo_symbol,
        c.cash_price,
        b.balmo_price,
        CASE
          WHEN c.cash_price IS NULL OR b.balmo_price IS NULL THEN NULL
          ELSE c.cash_price - b.balmo_price
        END AS cash_balmo,
        c.cash_price_basis,
        b.balmo_price_basis,
        TO_CHAR(c.cash_trade_date, 'YYYY-MM-DD') AS cash_trade_date,
        TO_CHAR(b.trade_date, 'YYYY-MM-DD') AS balmo_trade_date,
        TO_CHAR(c.latest_cash_trade_date, 'YYYY-MM-DD') AS latest_cash_trade_date,
        (
          SELECT MAX(value)
          FROM (VALUES (c.cash_updated_at), (b.balmo_updated_at)) AS updated(value)
        ) AS updated_at
      FROM cash_rows c
      LEFT JOIN balmo_rows b
        ON b.market_key = c.market_key
       AND b.trade_date = c.cash_trade_date
      ORDER BY c.gas_day ASC, c.sort_index ASC;
    `,
    values: [...promoted.values, [...months]],
  };
}

function seasonForMonth(month: number): Season {
  return (WINTER_MONTHS as readonly number[]).includes(month) ? "WINTER" : "SUMMER";
}

function buildSeasonLabel(date: string, season: Season): string {
  const year = Number.parseInt(date.slice(0, 4), 10);
  const month = Number.parseInt(date.slice(5, 7), 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return season;

  const seasonYear = season === "WINTER" && month >= 11 ? year + 1 : year;
  const prefix = season === "WINTER" ? "XH" : "JV";
  return `${prefix}-${String(seasonYear).slice(-2)}`;
}

function metricTitle(metric: WeatherMetric | SaltsMetric): string {
  switch (metric) {
    case "southcentral_gas_hdd":
      return "South Central Gas HDD";
    case "conus_gas_hdd":
      return "CONUS Gas HDD";
    case "southcentral_population_cdd":
      return "South Central Population CDD";
    case "conus_population_cdd":
      return "CONUS Population CDD";
    case "southcentral_tdd":
      return "South Central TDD";
    case "conus_tdd":
      return "CONUS TDD";
  }
  return metric.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildDailyRows({
  saltRows,
  weatherRows,
  gasRows = [],
  recentDays,
  saltMetrics,
}: {
  saltRows: RawSaltRow[];
  weatherRows: RawWeatherRow[];
  gasRows?: RawGasPriceRow[];
  recentDays: number;
  saltMetrics: readonly SaltTableMetric[];
}): DailyJoinedRow[] {
  const weatherByDate = buildWeatherByDate(weatherRows);
  const gasByDate = buildGasPriceBuckets(gasRows);

  const highlightDateWindows = highlightWindows(
    maxIsoDate(saltRows.map((row) => dateString(row.date))),
    recentDays,
  );

  const rows: DailyJoinedRow[] = [];
  for (const saltRow of saltRows) {
    const date = dateString(saltRow.date);
    if (!date) continue;
    const weatherRow = weatherByDate.get(date);
    if (!weatherRow) continue;
    const gasBucket = gasByDate.get(date);

    const lookbackRole = lookbackRoleForDate(date, highlightDateWindows);
    const isRecent = lookbackRole !== null;
    const year = Number.parseInt(date.slice(0, 4), 10);
    const month = Number.parseInt(date.slice(5, 7), 10);
    const rowMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : 0;
    const rowSeason = seasonForMonth(rowMonth);
    const weather = Object.fromEntries(
      ALL_WEATHER_METRICS.map((metric) => [metric, metricValue(weatherRow, metric)]),
    ) as Record<WeatherMetric, number | null>;
    const salts = Object.fromEntries(
      saltMetrics.map((metric) => [metric, metricValue(saltRow, metric)]),
    ) as Partial<Record<SaltTableMetric, number | null>>;
    const gas = Object.fromEntries(
      NEXT_DAY_GAS_PRICE_COLUMNS.map((metric) => [metric, gasBucket?.prices[metric] ?? null]),
    ) as Partial<Record<NextDayGasPriceMetric, number | null>>;

    rows.push({
      date,
      label: date,
      year: Number.isFinite(year) ? year : null,
      month: rowMonth,
      monthLabel: MONTH_LABELS[rowMonth] ?? "",
      mmDd: date.slice(5),
      season: rowSeason === "WINTER" ? "winter" : "summer",
      seasonLabel: buildSeasonLabel(date, rowSeason),
      eiaStorageWeek: null,
      eiaStorageWeekNumber: null,
      weatherDataSource: weatherRow?.weather_data_source ?? null,
      weather,
      salts,
      gas,
      gasPriceTradeDate: gasBucket?.tradeDate ?? null,
      gasPriceLatestTradeDate: gasBucket?.latestTradeDate ?? null,
      gasPriceUpdatedAt: gasBucket?.updatedAt ?? null,
      isRecent,
      lookbackRole,
    });
  }

  return rows.sort((left, right) => left.date.localeCompare(right.date));
}

function priceMetricTitle(metric: GasPromptPriceMetric): string {
  switch (metric) {
    case "cash_balmo":
      return "Cash-BalMo";
  }
}

function buildGasPromptPoints({
  weatherRows,
  gasRows,
  market,
  month,
  weatherMetric,
  recentDays,
}: {
  weatherRows: RawWeatherRow[];
  gasRows: RawGasPromptPriceRow[];
  market: GasPromptMarketConfig;
  month: number;
  weatherMetric: WeatherMetric;
  recentDays: number;
}): GasPromptPoint[] {
  const weatherByDate = buildWeatherByDate(weatherRows);
  const scopedRows = gasRows.filter((row) => {
    if (row.market_key !== market.key) return false;
    const date = dateString(row.gas_day);
    if (!date) return false;
    const rowMonth = Number.parseInt(date.slice(5, 7), 10);
    return rowMonth === month;
  });
  const highlightDateWindows = highlightWindows(
    maxIsoDate(scopedRows.map((row) => dateString(row.gas_day))),
    recentDays,
  );

  const points: GasPromptPoint[] = [];

  for (const row of scopedRows) {
    const date = dateString(row.gas_day);
    if (!date) continue;
    const weatherRow = weatherByDate.get(date);
    const x = metricValue(weatherRow, weatherMetric);
    const y = numberValue(row.cash_balmo);
    if (x === null || y === null) continue;

    const lookbackRole = lookbackRoleForDate(date, highlightDateWindows);
    const isRecent = lookbackRole !== null;
    const year = Number.parseInt(date.slice(0, 4), 10);
    const parsedMonth = Number.parseInt(date.slice(5, 7), 10);
    const rowMonth =
      Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : 0;
    const rowSeason = seasonForMonth(rowMonth);

    points.push({
      date,
      label: date,
      year: Number.isFinite(year) ? year : null,
      month: rowMonth,
      monthLabel: MONTH_LABELS[rowMonth] ?? "",
      mmDd: date.slice(5),
      season: rowSeason === "WINTER" ? "winter" : "summer",
      seasonLabel: buildSeasonLabel(date, rowSeason),
      weatherDataSource: weatherRow?.weather_data_source ?? null,
      x,
      y,
      weatherMetric,
      priceMetric: GAS_PROMPT_PRICE_METRIC,
      priceMetricLabel: priceMetricTitle(GAS_PROMPT_PRICE_METRIC),
      marketKey: market.key,
      marketLabel: market.label,
      cashPrice: numberValue(row.cash_price),
      balmoPrice: numberValue(row.balmo_price),
      cashTradeDate: dateString(row.cash_trade_date),
      balmoTradeDate: dateString(row.balmo_trade_date),
      latestCashTradeDate: dateString(row.latest_cash_trade_date),
      priceBasis: [row.cash_price_basis, row.balmo_price_basis].filter(Boolean).join(" / ") || null,
      isRecent,
      lookbackRole,
    });
  }

  return points.sort((left, right) => left.date.localeCompare(right.date));
}

function buildGasPromptPlots({
  weatherRows,
  gasRows,
  month,
  weatherMetric,
  recentDays,
}: {
  weatherRows: RawWeatherRow[];
  gasRows: RawGasPromptPriceRow[];
  month: number;
  weatherMetric: WeatherMetric;
  recentDays: number;
}): GasPromptPlotPayload[] {
  const scope = "month" as const;
  const scopeLabel = MONTH_LABELS[month];

  return GAS_PROMPT_MARKETS.map((market) => {
    const points = buildGasPromptPoints({
      weatherRows,
      gasRows,
      market,
      month,
      weatherMetric,
      recentDays,
    });
    const dates = points.map((point) => point.date);
    const priceMetricLabel = priceMetricTitle(GAS_PROMPT_PRICE_METRIC);

    return {
      id: `${market.key}:${weatherMetric}:${GAS_PROMPT_PRICE_METRIC}:${scope}:${month}`,
      title: `${market.label} ${priceMetricLabel} vs ${metricTitle(weatherMetric)} | ${scopeLabel}`,
      scope,
      scopeLabel,
      marketKey: market.key,
      marketLabel: market.label,
      weatherMetric,
      priceMetric: GAS_PROMPT_PRICE_METRIC,
      priceMetricLabel,
      pointCount: points.length,
      minDate: minIsoDate(dates),
      maxDate: maxIsoDate(dates),
      points,
    };
  });
}

function rawToBcf(row: Record<string, unknown>, key: string): number | null {
  const value = metricValue(row, key);
  return value === null ? null : value / 1_000_000;
}

function rawToMmcf(row: Record<string, unknown>, key: string): number | null {
  const value = metricValue(row, key);
  return value === null ? null : value / 1_000;
}

function buildInventoryRows(rows: RawSaltInventoryRow[]): InventoryDailyRow[] {
  return rows
    .map((row): InventoryDailyRow | null => {
      const date = dateString(row.date);
      if (!date) return null;

      const year = Number.parseInt(date.slice(0, 4), 10);
      const month = Number.parseInt(date.slice(5, 7), 10);
      const rowMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : 0;
      const rowSeason = seasonForMonth(rowMonth);
      const facilities = Object.fromEntries(
        SALT_INVENTORY_FACILITY_METRICS.map((metric) => [
          metric,
          {
            inventoryBcf: rawToBcf(row, `${metric}_inv`),
            inventoryDeltaBcf: rawToBcf(row, `${metric}_delta`),
            dailyFlowMmcf: rawToMmcf(row, `${metric}_daily_flows`),
            availableCapBcf: rawToBcf(row, `${metric}_available_cap`),
            operationalCapBcf: rawToBcf(row, `${metric}_operational_cap`),
            designCapBcf: rawToBcf(row, `${metric}_design_cap`),
          },
        ]),
      ) as InventoryDailyRow["facilities"];

      return {
        date,
        label: date,
        year: Number.isFinite(year) ? year : null,
        month: rowMonth,
        monthLabel: MONTH_LABELS[rowMonth] ?? "",
        mmDd: date.slice(5),
        season: rowSeason === "WINTER" ? "winter" : "summer",
        seasonLabel: buildSeasonLabel(date, rowSeason),
        facilities,
      };
    })
    .filter((row): row is InventoryDailyRow => row !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildPoints({
  dailyRows,
  weatherMetric,
  saltsMetric,
  recentDays,
}: {
  dailyRows: DailyJoinedRow[];
  weatherMetric: WeatherMetric;
  saltsMetric: SaltsMetric;
  recentDays: number;
}): JoinedPoint[] {
  const highlightDateWindows = highlightWindows(maxIsoDate(dailyRows.map((row) => row.date)), recentDays);

  const points: JoinedPoint[] = [];

  for (const row of dailyRows) {
    const x = row.weather[weatherMetric];
    const y = row.salts[saltsMetric] ?? null;
    if (x === null || y === null) continue;

    const lookbackRole = lookbackRoleForDate(row.date, highlightDateWindows);
    const isRecent = lookbackRole !== null;

    points.push({
      date: row.date,
      label: row.label,
      year: row.year,
      month: row.month,
      monthLabel: row.monthLabel,
      mmDd: row.mmDd,
      season: row.season,
      seasonLabel: row.seasonLabel,
      eiaStorageWeek: row.eiaStorageWeek,
      eiaStorageWeekNumber: row.eiaStorageWeekNumber,
      weatherDataSource: row.weatherDataSource,
      x,
      y,
      weatherMetric,
      saltsMetric,
      isRecent,
      lookbackRole,
    });
  }

  return points;
}

function buildPlots({
  dailyRows,
  season,
  month,
  weatherMetric,
  recentDays,
}: {
  dailyRows: DailyJoinedRow[];
  season: Season;
  month: number;
  weatherMetric: WeatherMetric;
  recentDays: number;
}): PlotPayload[] {
  const monthRows = dailyRows.filter((row) => row.month === month);
  const scopeRows: Array<{
    scope: PlotScope;
    scopeLabel: string;
    dailyRows: DailyJoinedRow[];
  }> = [
    {
      scope: "month",
      scopeLabel: MONTH_LABELS[month],
      dailyRows: monthRows,
    },
    {
      scope: "season",
      scopeLabel: season === "WINTER" ? "Full Winter" : "Full Summer",
      dailyRows,
    },
  ];

  return SALTS_METRICS.flatMap((saltsMetric) =>
    scopeRows.map(({ scope, scopeLabel, dailyRows: scopedRows }) => {
      const points = buildPoints({
        dailyRows: scopedRows,
        weatherMetric,
        saltsMetric,
        recentDays,
      });
      const dates = points.map((point) => point.date);

      return {
        id: `${weatherMetric}:${saltsMetric}:${scope}`,
        title: `${metricTitle(saltsMetric)} vs ${metricTitle(weatherMetric)} | ${scopeLabel}`,
        scope,
        scopeLabel,
        weatherMetric,
        saltsMetric,
        pointCount: points.length,
        minDate: minIsoDate(dates),
        maxDate: maxIsoDate(dates),
        points,
      };
    }),
  );
}

const observedGET = observedJsonRoute(
  ROUTE_CONFIG,
  async (request: Request): Promise<ObservedRouteResult> => {
    if (!isLocalOnlyFeatureEnabled()) {
      return localOnlyObservedNotFound();
    }

    const { searchParams } = new URL(request.url);
    const modelDaily = searchParams.get("modelDaily") === "1";
    const season = parseSeason(searchParams.get("season"));
    const month = parseMonth(searchParams.get("month"), season);
    const weatherMetric = parseWeatherMetric(searchParams.get("weatherMetric"), season);
    const saltsMetric = parseSaltsMetric(searchParams.get("saltsMetric"));
    const lookbackYears = parseInteger(searchParams.get("lookbackYears"), 2, 1, 7);
    const recentDays = parseInteger(searchParams.get("recentDays"), 7, 1, 31);
    const tableLookbackMonths = parseInteger(
      searchParams.get("tableLookbackMonths"),
      DEFAULT_TABLE_LOOKBACK_MONTHS,
      MIN_TABLE_LOOKBACK_MONTHS,
      MAX_TABLE_LOOKBACK_MONTHS,
    );
    const saltPlotLookbackDays = parseInteger(
      searchParams.get("saltPlotLookbackDays"),
      DEFAULT_SALT_PLOT_LOOKBACK_DAYS,
      MIN_SALT_PLOT_LOOKBACK_DAYS,
      MAX_SALT_PLOT_LOOKBACK_DAYS,
    );
    const gasPromptOnly = searchParams.get("gasPromptOnly") === "1";
    const includeGasPrompt = gasPromptOnly || searchParams.get("includeGasPrompt") !== "0";
    const inventoryOnly = searchParams.get("inventoryOnly") === "1";
    const includeInventory = inventoryOnly || searchParams.get("includeInventory") === "1";
    const startYear = MIN_SOURCE_YEAR;
    const seasonMonths = [...validMonthsForSeason(season)];
    const gasPromptMonths = [month];
    const selected = {
      season: season === "WINTER" ? "winter" : "summer",
      month,
      monthLabel: MONTH_LABELS[month],
      weatherMetric,
      saltsMetric,
      lookbackYears,
      recentDays,
    };
    const available = {
      monthsBySeason: {
        winter: WINTER_MONTHS,
        summer: SUMMER_MONTHS,
      },
      weatherMetricsBySeason: {
        winter: WINTER_WEATHER_METRICS,
        summer: SUMMER_WEATHER_METRICS,
      },
      saltsMetrics: SALTS_METRICS,
      saltFacilityMetrics: SALT_FACILITY_METRICS,
      saltTableMetrics: SALT_TABLE_METRICS,
      gasPriceMetrics: NEXT_DAY_GAS_PRICE_COLUMNS,
      gasPromptMarkets: GAS_PROMPT_MARKETS.map((market) => ({
        key: market.key,
        label: market.label,
        cashSymbol: market.cashSymbol,
        balmoSymbol: market.balmoSymbol,
        weatherMetricBySeason: market.weatherMetricBySeason,
      })),
      gasPromptPriceMetrics: GAS_PROMPT_PRICE_METRICS,
    };

    if (gasPromptOnly) {
      const gasPromptSql = gasPromptPriceSql({ startYear, months: gasPromptMonths });
      const [weatherRows, gasPromptRows] = await Promise.all([
        query<RawWeatherRow>(weatherSql(), [startYear, gasPromptMonths]),
        query<RawGasPromptPriceRow>(gasPromptSql.text, gasPromptSql.values),
      ]);
      const gasPromptPlots = buildGasPromptPlots({
        weatherRows,
        gasRows: gasPromptRows,
        month,
        weatherMetric,
        recentDays,
      });
      const gasPromptDates = gasPromptPlots.flatMap((plot) =>
        plot.points.map((point) => point.date),
      );
      const weatherDates = weatherRows.map((row) => dateString(row.date));
      const gasPromptDataAsOf = maxIsoDate(gasPromptDates);

      return {
        payload: {
          selected,
          available,
          summary: {
            pointCount: 0,
            dailyRowCount: 0,
            plotCount: 0,
            metricPointCount: 0,
            minDate: null,
            maxDate: null,
            saltRowCount: 0,
            genscapeRowCount: 0,
            weatherRowCount: weatherRows.length,
            tableRowCount: 0,
            tableSaltRowCount: 0,
            tableWeatherRowCount: 0,
            tableGasRowCount: 0,
            tableMinDate: null,
            tableMaxDate: null,
            tableGasMinDate: null,
            tableGasMaxDate: null,
            tableLookbackMonths,
            gasPromptRowCount: gasPromptRows.length,
            gasPromptPlotCount: gasPromptPlots.length,
            gasPromptPointCount: gasPromptPlots.reduce((sum, plot) => sum + plot.pointCount, 0),
            gasPromptMinDate: minIsoDate(gasPromptDates),
            gasPromptMaxDate: gasPromptDataAsOf,
            inventoryRowCount: 0,
            inventoryRawRowCount: 0,
            inventoryMinDate: null,
            inventoryMaxDate: null,
            saltPlotLookbackDays,
            sourceStartYear: startYear,
          },
          sourceContract: {
            ...SOURCE_CONTRACT,
            promotedSql: null,
            promotedGasPriceSql: {
              ...PROMOTED_GAS_PRICE_SQL,
            },
            promotedInventorySql: null,
          },
          dailyRows: [],
          tableRows: [],
          inventoryRows: [],
          points: [],
          plots: [],
          gasPromptPlots,
        },
        headers: {
          "Cache-Control": CACHE_HEADER,
          "X-Salts-Wx-Adj-Cache": "ORIGIN",
        },
        rowCount: weatherRows.length + gasPromptRows.length,
        dataAsOf: gasPromptDataAsOf ?? maxIsoDate(weatherDates),
      };
    }

    if (inventoryOnly) {
      const promotedInventorySql = await loadPromotedSaltInventoriesSql();
      const inventorySaltRows = await mssqlQuery<RawSaltInventoryRow>(
        buildSaltInventoriesTableSql(promotedInventorySql.sql),
        { saltPlotLookbackDays },
      );
      const inventoryRows = buildInventoryRows(inventorySaltRows);
      const inventoryDates = inventoryRows.map((row) => row.date);
      const inventoryDataAsOf = maxIsoDate(inventoryDates);

      return {
        payload: {
          selected,
          available,
          summary: {
            pointCount: 0,
            dailyRowCount: 0,
            plotCount: 0,
            metricPointCount: 0,
            minDate: null,
            maxDate: null,
            saltRowCount: 0,
            genscapeRowCount: 0,
            weatherRowCount: 0,
            tableRowCount: 0,
            tableSaltRowCount: 0,
            tableWeatherRowCount: 0,
            tableGasRowCount: 0,
            tableMinDate: null,
            tableMaxDate: null,
            tableGasMinDate: null,
            tableGasMaxDate: null,
            tableLookbackMonths,
            gasPromptRowCount: 0,
            gasPromptPlotCount: 0,
            gasPromptPointCount: 0,
            gasPromptMinDate: null,
            gasPromptMaxDate: null,
            inventoryRowCount: inventoryRows.length,
            inventoryRawRowCount: inventorySaltRows.length,
            inventoryMinDate: minIsoDate(inventoryDates),
            inventoryMaxDate: inventoryDataAsOf,
            saltPlotLookbackDays,
            sourceStartYear: startYear,
          },
          sourceContract: {
            ...SOURCE_CONTRACT,
            promotedSql: null,
            promotedGasPriceSql: null,
            promotedInventorySql: {
              path: promotedInventorySql.promotedSqlPath,
              dbtModel: promotedInventorySql.dbtModelPath,
              dbtCompiledSql: promotedInventorySql.dbtCompiledPath,
            },
          },
          dailyRows: [],
          tableRows: [],
          inventoryRows,
          points: [],
          plots: [],
          gasPromptPlots: [],
        },
        headers: {
          "Cache-Control": CACHE_HEADER,
          "X-Salts-Wx-Adj-Cache": "ORIGIN",
        },
        rowCount: inventorySaltRows.length,
        dataAsOf: inventoryDataAsOf,
      };
    }

    const [promotedSql, promotedInventorySql] = await Promise.all([
      loadPromotedSaltFacilitiesBcfSql(),
      includeInventory ? loadPromotedSaltInventoriesSql() : Promise.resolve(null),
    ]);

    const gasSql = gasPriceSql(tableLookbackMonths);
    const gasPromptSql = includeGasPrompt
      ? gasPromptPriceSql({ startYear, months: gasPromptMonths })
      : null;
    const [
      saltRows,
      weatherRows,
      tableSaltRows,
      tableWeatherRows,
      tableGasRows,
      gasPromptRows,
      inventorySaltRows,
    ] = await Promise.all([
      mssqlQuery<RawSaltRow>(buildSaltFacilitiesWxAdjSql(promotedSql.sql, season), {
        startYear,
      }),
      query<RawWeatherRow>(weatherSql(), [startYear, seasonMonths]),
      mssqlQuery<RawSaltRow>(buildSaltFacilitiesTableSql(promotedSql.sql), {
        tableLookbackMonths,
      }),
      query<RawWeatherRow>(weatherTableSql(), [tableLookbackMonths]),
      query<RawGasPriceRow>(gasSql.text, gasSql.values),
      gasPromptSql
        ? query<RawGasPromptPriceRow>(gasPromptSql.text, gasPromptSql.values)
        : Promise.resolve([]),
      promotedInventorySql
        ? mssqlQuery<RawSaltInventoryRow>(buildSaltInventoriesTableSql(promotedInventorySql.sql), {
            saltPlotLookbackDays,
          })
        : Promise.resolve([]),
    ]);

    const dailyRows = buildDailyRows({
      saltRows,
      weatherRows,
      recentDays,
      saltMetrics: SALTS_METRICS,
    });
    const tableRows = buildDailyRows({
      saltRows: tableSaltRows,
      weatherRows: tableWeatherRows,
      gasRows: tableGasRows,
      recentDays,
      saltMetrics: SALT_TABLE_METRICS,
    });
    const inventoryRows = buildInventoryRows(inventorySaltRows);
    if (modelDaily && tableRows.length === 0) {
      return {
        payload: { error: "Salt query returned no rows for the selected window." },
        status: 422,
        rowCount: 0,
        dataAsOf: null,
        headers: { "Cache-Control": CACHE_HEADER },
      };
    }
    const plots = buildPlots({
      dailyRows,
      season,
      month,
      weatherMetric,
      recentDays,
    });
    const gasPromptPlots = includeGasPrompt
      ? buildGasPromptPlots({
          weatherRows,
          gasRows: gasPromptRows,
          month,
          weatherMetric,
          recentDays,
        })
      : [];
    const selectedMonthRows = dailyRows.filter((row) => row.month === month);
    const selectedPoints = buildPoints({
      dailyRows: selectedMonthRows,
      weatherMetric,
      saltsMetric,
      recentDays,
    });
    const dates = dailyRows.map((row) => row.date);
    const tableDates = tableRows.map((row) => row.date);
    const tableGasDates = tableGasRows.map((row) => dateString(row.gas_day));
    const gasPromptDates = gasPromptPlots.flatMap((plot) => plot.points.map((point) => point.date));
    const inventoryDates = inventoryRows.map((row) => row.date);
    const dataAsOf = maxIsoDate(dates);
    const tableDataAsOf = maxIsoDate(tableDates);
    const tableGasDataAsOf = maxIsoDate(tableGasDates);
    const gasPromptDataAsOf = maxIsoDate(gasPromptDates);
    const inventoryDataAsOf = maxIsoDate(inventoryDates);

    return {
      payload: {
        selected,
        available,
        summary: {
          pointCount: selectedPoints.length,
          dailyRowCount: dailyRows.length,
          plotCount: plots.length,
          metricPointCount: plots.reduce((sum, plot) => sum + plot.pointCount, 0),
          minDate: minIsoDate(dates),
          maxDate: dataAsOf,
          saltRowCount: saltRows.length,
          genscapeRowCount: saltRows.length,
          weatherRowCount: weatherRows.length,
          tableRowCount: tableRows.length,
          tableSaltRowCount: tableSaltRows.length,
          tableWeatherRowCount: tableWeatherRows.length,
          tableGasRowCount: tableGasRows.length,
          tableMinDate: minIsoDate(tableDates),
          tableMaxDate: tableDataAsOf,
          tableGasMinDate: minIsoDate(tableGasDates),
          tableGasMaxDate: tableGasDataAsOf,
          tableLookbackMonths,
          gasPromptRowCount: gasPromptRows.length,
          gasPromptPlotCount: gasPromptPlots.length,
          gasPromptPointCount: gasPromptPlots.reduce((sum, plot) => sum + plot.pointCount, 0),
          gasPromptMinDate: minIsoDate(gasPromptDates),
          gasPromptMaxDate: gasPromptDataAsOf,
          inventoryRowCount: inventoryRows.length,
          inventoryRawRowCount: inventorySaltRows.length,
          inventoryMinDate: minIsoDate(inventoryDates),
          inventoryMaxDate: inventoryDataAsOf,
          saltPlotLookbackDays,
          sourceStartYear: startYear,
        },
        sourceContract: {
          ...SOURCE_CONTRACT,
          promotedSql: {
            path: promotedSql.promotedSqlPath,
            dbtModel: promotedSql.dbtModelPath,
            dbtCompiledSql: promotedSql.dbtCompiledPath,
          },
          promotedGasPriceSql: {
            ...PROMOTED_GAS_PRICE_SQL,
          },
          promotedInventorySql: promotedInventorySql
            ? {
                path: promotedInventorySql.promotedSqlPath,
                dbtModel: promotedInventorySql.dbtModelPath,
                dbtCompiledSql: promotedInventorySql.dbtCompiledPath,
              }
            : null,
        },
        dailyRows,
        tableRows,
        inventoryRows,
        points: selectedPoints,
        plots,
        gasPromptPlots,
      },
      headers: {
        "Cache-Control": CACHE_HEADER,
        "X-Salts-Wx-Adj-Cache": "ORIGIN",
      },
      rowCount:
        saltRows.length +
        weatherRows.length +
        tableSaltRows.length +
        tableWeatherRows.length +
        tableGasRows.length +
        gasPromptRows.length +
        inventorySaltRows.length,
      dataAsOf: inventoryDataAsOf ?? tableDataAsOf ?? tableGasDataAsOf ?? gasPromptDataAsOf ?? dataAsOf,
    };
  },
);

export function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
