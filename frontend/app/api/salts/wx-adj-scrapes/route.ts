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
  purpose: "Local-dev Salt Model weather-adjusted Genscape table and scatter data.",
  p95TargetMs: 3_000,
  freshnessSource:
    "Promoted dbt salts mart SQL over GenscapeDataFeed.natgas and helios_prod WSI observations",
} as const;

type Season = "WINTER" | "SUMMER";
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
type SaltTableMetric = SaltsMetric | SaltFacilityMetric;

const WINTER_MONTHS = [11, 12, 1, 2, 3] as const;
const SUMMER_MONTHS = [4, 5, 6, 7, 8, 9, 10] as const;
const WINTER_WEATHER_METRICS = ["southcentral_gas_hdd", "conus_gas_hdd"] as const;
const SUMMER_WEATHER_METRICS = [
  "southcentral_population_cdd",
  "conus_population_cdd",
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
    "ice_python.settlements",
  ],
  units: {
    salts: "BCF daily total, regional, and facility salt cavern flow metrics from the promoted marts_v1_salt_facilities_bcf dbt SQL.",
    weather: "Daily degree-day observations from helios_prod WSI weighted degree-day rows.",
    gasPrices:
      "Daily next-day physical gas cash prices in $/MMBtu from the promoted long-form ice_python_next_day_gas dbt SQL, keyed by gas_day x symbol and retaining trade_date.",
    inventories:
      "Facility inventory, daily flow, and capacity metrics from the promoted marts_v1_salt_inventories dbt SQL.",
  },
  tables:
    "Frontend derives daily, Friday week-ending, and calendar-month tables from a bounded 36-month route-level join. No Azure SQL or helios_prod objects are created.",
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
}

interface PlotPayload {
  id: string;
  title: string;
  weatherMetric: WeatherMetric;
  saltsMetric: SaltsMetric;
  pointCount: number;
  minDate: string | null;
  maxDate: string | null;
  points: JoinedPoint[];
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
    : validMetrics[0];
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

function maxIsoDate(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function minIsoDate(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(0) ?? null;
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

function weatherSql(): string {
  return `
    SELECT
      to_char(observation_date::date, 'YYYY-MM-DD') AS date,
      'observed'::text AS weather_data_source,
      AVG(metric_value) FILTER (
        WHERE entity_id = 'CONUS' AND metric_name = 'gas_hdd'
      ) AS conus_gas_hdd,
      AVG(metric_value) FILTER (
        WHERE entity_id = 'CONUS' AND metric_name = 'population_cdd'
      ) AS conus_population_cdd,
      AVG(metric_value) FILTER (
        WHERE entity_id = 'SOUTHCENTRAL' AND metric_name = 'gas_hdd'
      ) AS southcentral_gas_hdd,
      AVG(metric_value) FILTER (
        WHERE entity_id = 'SOUTHCENTRAL' AND metric_name = 'population_cdd'
      ) AS southcentral_population_cdd
    FROM weather.wsi_daily_weighted_degree_day_observations
    WHERE observation_date >= make_date($1::int, 1, 1)
      AND observation_date <= current_date
      AND EXTRACT(month FROM observation_date)::int = $2::int
      AND entity_id IN ('CONUS', 'SOUTHCENTRAL')
      AND metric_name IN ('gas_hdd', 'population_cdd')
    GROUP BY observation_date::date
    ORDER BY observation_date::date ASC;
  `;
}

function weatherTableSql(): string {
  return `
    SELECT
      to_char(observation_date::date, 'YYYY-MM-DD') AS date,
      'observed'::text AS weather_data_source,
      AVG(metric_value) FILTER (
        WHERE entity_id = 'CONUS' AND metric_name = 'gas_hdd'
      ) AS conus_gas_hdd,
      AVG(metric_value) FILTER (
        WHERE entity_id = 'CONUS' AND metric_name = 'population_cdd'
      ) AS conus_population_cdd,
      AVG(metric_value) FILTER (
        WHERE entity_id = 'SOUTHCENTRAL' AND metric_name = 'gas_hdd'
      ) AS southcentral_gas_hdd,
      AVG(metric_value) FILTER (
        WHERE entity_id = 'SOUTHCENTRAL' AND metric_name = 'population_cdd'
      ) AS southcentral_population_cdd
    FROM weather.wsi_daily_weighted_degree_day_observations
    WHERE observation_date >= current_date - ($1::int * interval '1 month')
      AND observation_date <= current_date
      AND entity_id IN ('CONUS', 'SOUTHCENTRAL')
      AND metric_name IN ('gas_hdd', 'population_cdd')
    GROUP BY observation_date::date
    ORDER BY observation_date::date ASC;
  `;
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
  const weatherByDate = new Map<string, RawWeatherRow>();
  for (const row of weatherRows) {
    const rowDate = dateString(row.date);
    if (rowDate) weatherByDate.set(rowDate, row);
  }
  const gasByDate = buildGasPriceBuckets(gasRows);

  const latestDate = maxIsoDate(saltRows.map((row) => dateString(row.date)));
  const recentCutoff = latestDate ? new Date(`${latestDate}T00:00:00Z`) : null;
  if (recentCutoff) recentCutoff.setUTCDate(recentCutoff.getUTCDate() - (recentDays - 1));

  const rows: DailyJoinedRow[] = [];
  for (const saltRow of saltRows) {
    const date = dateString(saltRow.date);
    if (!date) continue;
    const weatherRow = weatherByDate.get(date);
    if (!weatherRow) continue;
    const gasBucket = gasByDate.get(date);

    const pointDate = new Date(`${date}T00:00:00Z`);
    const isRecent =
      Boolean(recentCutoff) && !Number.isNaN(pointDate.getTime()) && pointDate >= recentCutoff!;
    const year = Number.parseInt(date.slice(0, 4), 10);
    const month = Number.parseInt(date.slice(5, 7), 10);
    const rowMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : 0;
    const rowSeason = seasonForMonth(rowMonth);
    const weather = Object.fromEntries(
      ([
        ...WINTER_WEATHER_METRICS,
        ...SUMMER_WEATHER_METRICS,
      ] as readonly WeatherMetric[]).map((metric) => [metric, metricValue(weatherRow, metric)]),
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
    });
  }

  return rows.sort((left, right) => left.date.localeCompare(right.date));
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
}: {
  dailyRows: DailyJoinedRow[];
  weatherMetric: WeatherMetric;
  saltsMetric: SaltsMetric;
}): JoinedPoint[] {
  const points: JoinedPoint[] = [];

  for (const row of dailyRows) {
    const x = row.weather[weatherMetric];
    const y = row.salts[saltsMetric] ?? null;
    if (x === null || y === null) continue;

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
      isRecent: row.isRecent,
    });
  }

  return points;
}

function buildPlots({
  dailyRows,
  season,
}: {
  dailyRows: DailyJoinedRow[];
  season: Season;
}): PlotPayload[] {
  const weatherMetrics = season === "WINTER" ? WINTER_WEATHER_METRICS : SUMMER_WEATHER_METRICS;

  return weatherMetrics.flatMap((weatherMetric) =>
    SALTS_METRICS.map((saltsMetric) => {
      const points = buildPoints({
        dailyRows,
        weatherMetric,
        saltsMetric,
      });
      const dates = points.map((point) => point.date);

      return {
        id: `${weatherMetric}:${saltsMetric}`,
        title: `${metricTitle(saltsMetric)} vs ${metricTitle(weatherMetric)}`,
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
    const includeInventory = searchParams.get("includeInventory") === "1";
    const startYear = MIN_SOURCE_YEAR;
    const [promotedSql, promotedInventorySql] = await Promise.all([
      loadPromotedSaltFacilitiesBcfSql(),
      includeInventory ? loadPromotedSaltInventoriesSql() : Promise.resolve(null),
    ]);

    const gasSql = gasPriceSql(tableLookbackMonths);
    const [saltRows, weatherRows, tableSaltRows, tableWeatherRows, tableGasRows, inventorySaltRows] = await Promise.all([
      mssqlQuery<RawSaltRow>(buildSaltFacilitiesWxAdjSql(promotedSql.sql), {
        month,
        startYear,
      }),
      query<RawWeatherRow>(weatherSql(), [startYear, month]),
      mssqlQuery<RawSaltRow>(buildSaltFacilitiesTableSql(promotedSql.sql), {
        tableLookbackMonths,
      }),
      query<RawWeatherRow>(weatherTableSql(), [tableLookbackMonths]),
      query<RawGasPriceRow>(gasSql.text, gasSql.values),
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
    });
    const selectedPoints = buildPoints({
      dailyRows,
      weatherMetric,
      saltsMetric,
    });
    const dates = dailyRows.map((row) => row.date);
    const tableDates = tableRows.map((row) => row.date);
    const tableGasDates = tableGasRows.map((row) => dateString(row.gas_day));
    const inventoryDates = inventoryRows.map((row) => row.date);
    const dataAsOf = maxIsoDate(dates);
    const tableDataAsOf = maxIsoDate(tableDates);
    const tableGasDataAsOf = maxIsoDate(tableGasDates);
    const inventoryDataAsOf = maxIsoDate(inventoryDates);

    return {
      payload: {
        selected: {
          season: season === "WINTER" ? "winter" : "summer",
          month,
          monthLabel: MONTH_LABELS[month],
          weatherMetric,
          saltsMetric,
          lookbackYears,
          recentDays,
        },
        available: {
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
        },
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
            path: "backend/modelling/pjm_da_models/sql_inputs/ice_python_next_day_gas.sql",
            dbtModel:
              "dbt/azure_postgres/models/pjm_da_model/ice_python/settlements/ice_python_next_day_gas.sql",
            dbtCompiledSql:
              "dbt/azure_postgres/target/compiled/helioscta_platform/models/pjm_da_model/ice_python/settlements/ice_python_next_day_gas.sql",
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
        inventorySaltRows.length,
      dataAsOf: inventoryDataAsOf ?? tableDataAsOf ?? tableGasDataAsOf ?? dataAsOf,
    };
  },
);

export function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
