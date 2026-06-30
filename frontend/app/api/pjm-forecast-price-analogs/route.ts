import { unstable_cache } from "next/cache";

import { observedJsonRoute, type ObservedRouteResult } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=600, stale-while-revalidate=300";
const DEFAULT_LOAD_AREA = "RTO";
const DEFAULT_GENERATION_AREA = "RTO";
const DEFAULT_STATION_ID = "PJM";
const DEFAULT_REGION = "PJM";
const DEFAULT_HUB = "WESTERN HUB";
const DEFAULT_ANALOGS_PER_HOUR = 40;
const RESPONSE_CACHE_TTL_MS = 10 * 60 * 1000;
const RESPONSE_CACHE_MAX_ENTRIES = 80;
const DATA_CACHE_REVALIDATE_SECONDS = 10 * 60;
const ROUTE_CONFIG = {
  route: "/api/pjm-forecast-price-analogs",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "vercel-data-cache=600, s-maxage=600, stale-while-revalidate=300",
  owner: "frontend",
  purpose: "Forecast-conditioned PJM RT price analog distribution",
  p95TargetMs: 3_000,
  freshnessSource:
    "pjm.load_frcstd_7_day, pjm.hourly_solar_power_forecast, pjm.hourly_wind_power_forecast, meteologica.pjm_forecast_hourly, weather.wsi_hourly_forecasts, PJM RT LMP actuals",
} as const;

type RtSource = "verified" | "unverified";
type PriceComponent = "total" | "energy" | "congestion" | "loss";
type DayType = "all" | "weekdays" | "weekends";
type ForecastSourceMode = "pjm" | "meteologica";

interface ForecastAnalogRow {
  payload: ForecastAnalogSql | string | null;
}

interface ForecastAnalogRequestInput {
  region: string;
  loadArea: string;
  generationArea: string;
  stationId: string;
  hub: string;
  rtSource: RtSource;
  component: PriceComponent;
  forecastSource: ForecastSourceMode;
  forecastDate: string | null;
  hourStart: number;
  hourEnd: number;
  seasonStart: string;
  seasonEnd: string;
  lookbackYears: number;
  includeCurrentYear: boolean;
  dayType: DayType;
  minPrice: number | null;
  maxPrice: number | null;
  minOutages: number | null;
  maxOutages: number | null;
  analogsPerHour: number;
  datesOnly: boolean;
}

interface ResponseCacheEntry {
  expiresAt: number;
  result: ObservedRouteResult;
}

declare global {
  var __pjmForecastPriceAnalogResponseCache: Map<string, ResponseCacheEntry> | undefined;
  var __pjmForecastPriceAnalogInFlight: Map<string, Promise<ObservedRouteResult>> | undefined;
}

interface ForecastAnalogSql {
  selected?: Record<string, unknown> | null;
  available_dates?: string[] | null;
  forecast_hours?: ForecastHourSql[] | null;
  price_distribution?: PriceDistributionSql | null;
  hourly_distributions?: HourlyDistributionSql[] | null;
  year_shift?: YearShiftSql | null;
  year_counts?: YearCountsSql | null;
  historical_rows?: HistoricalRowSql[] | null;
  analog_points?: AnalogPointSql[] | null;
  summary?: Record<string, unknown> | null;
}

interface ForecastHourSql {
  forecast_datetime_ept: string | null;
  hour_ending: number | string | null;
  load_mw: number | string | null;
  wind_mw: number | string | null;
  solar_mw: number | string | null;
  net_load_mw: number | string | null;
  temp_f: number | string | null;
  total_outages_mw: number | string | null;
  evaluated_at_ept: string | null;
}

interface PriceDistributionSqlStats {
  count: number | string;
  min_price: number | string | null;
  p05: number | string | null;
  p25: number | string | null;
  median: number | string | null;
  p75: number | string | null;
  p95: number | string | null;
  max_price: number | string | null;
  mean_price: number | string | null;
  std_dev: number | string | null;
  skewness: number | string | null;
}

interface PriceDistributionSqlTails {
  below_zero: number | string | null;
  above_100: number | string | null;
  above_250: number | string | null;
  above_500: number | string | null;
}

interface PriceHistogramBinSql {
  bin_index: number | string;
  bin_start: number | string | null;
  bin_end: number | string | null;
  bin_count: number | string;
  pct: number | string | null;
}

interface PriceDistributionSql {
  stats: PriceDistributionSqlStats | null;
  tails: PriceDistributionSqlTails | null;
  histogram: PriceHistogramBinSql[] | null;
}

interface HourlyDistributionSql {
  forecast_datetime_ept: string | null;
  hour_ending: number | string | null;
  analog_count: number | string;
  p25: number | string | null;
  median: number | string | null;
  p75: number | string | null;
  p95: number | string | null;
}

interface YearShiftSql {
  current_year: number | string;
  current_year_count: number | string;
  prior_year_count: number | string;
  current_year_median: number | string | null;
  prior_year_median: number | string | null;
  median_shift: number | string | null;
}

interface YearCountSql {
  actual_year: number | string;
  row_count: number | string;
}

interface YearCountsSql {
  historical_pool?: YearCountSql[] | null;
  analog_pool?: YearCountSql[] | null;
}

interface HistoricalRowSql {
  datetime_beginning_ept: string | null;
  hour_ending: number | string | null;
  actual_year: number | string | null;
  rt_price: number | string | null;
  temp_f: number | string | null;
  gross_load_mw: number | string | null;
  wind_mw: number | string | null;
  solar_mw: number | string | null;
  net_load_mw: number | string | null;
  total_outages_mw: number | string | null;
  row_as_of: string | null;
}

interface AnalogPointSql {
  target_datetime_ept: string | null;
  target_hour_ending: number | string | null;
  datetime_beginning_ept: string | null;
  hour_ending: number | string | null;
  actual_year: number | string | null;
  rt_price: number | string | null;
  temp_f: number | string | null;
  gross_load_mw: number | string | null;
  wind_mw: number | string | null;
  solar_mw: number | string | null;
  net_load_mw: number | string | null;
  total_outages_mw: number | string | null;
  distance: number | string | null;
}

const PRICE_HUBS = [
  "WESTERN HUB",
  "EASTERN HUB",
  "AEP-DAYTON HUB",
  "DOMINION HUB",
  "NEW JERSEY HUB",
  "CHICAGO HUB",
  "OHIO HUB",
  "N ILLINOIS HUB",
  "AEP GEN HUB",
  "ATSI GEN HUB",
  "CHICAGO GEN HUB",
  "WEST INT HUB",
] as const;

function parseIdentifier(value: string | null, fallback: string): string {
  const trimmed = value?.trim().toUpperCase();
  if (!trimmed) return fallback;
  return /^[A-Z0-9_&/ .-]{1,80}$/.test(trimmed) ? trimmed : fallback;
}

function parseDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseMonthDay(value: string | null, fallback: string): string {
  return value && /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value) ? value : fallback;
}

function parseHour(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 24);
}

function parseLookbackYears(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(Math.max(parsed, 1), 5);
}

function parseAnalogsPerHour(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_ANALOGS_PER_HOUR;
  return Math.min(Math.max(parsed, 20), 100);
}

function parseBoolean(value: string | null, fallback = true): boolean {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

function responseCache(): Map<string, ResponseCacheEntry> {
  global.__pjmForecastPriceAnalogResponseCache ??= new Map<string, ResponseCacheEntry>();
  return global.__pjmForecastPriceAnalogResponseCache;
}

function inFlightCache(): Map<string, Promise<ObservedRouteResult>> {
  global.__pjmForecastPriceAnalogInFlight ??= new Map<string, Promise<ObservedRouteResult>>();
  return global.__pjmForecastPriceAnalogInFlight;
}

function responseCacheKey(parts: Array<boolean | number | string | null | undefined>): string {
  return parts.map((part) => (part === null || part === undefined ? "" : String(part))).join("|");
}

function responseHeaders(cacheControl = CACHE_HEADER): Record<string, string> {
  return {
    "Cache-Control": cacheControl,
    "CDN-Cache-Control": cacheControl,
    "Vercel-CDN-Cache-Control": cacheControl,
  };
}

function withResponseCacheHeader(
  result: ObservedRouteResult,
  state: "miss" | "fresh" | "deduped",
): ObservedRouteResult {
  const headers = new Headers(result.headers);
  headers.set("X-Helios-Response-Cache", state);
  return { ...result, headers };
}

function isCacheableResponse(result: ObservedRouteResult): boolean {
  const status = result.status ?? 200;
  return status >= 200 && status < 300;
}

function storeResponseCacheEntry(key: string, result: ObservedRouteResult): void {
  const cache = responseCache();
  cache.set(key, {
    expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
    result,
  });

  while (cache.size > RESPONSE_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function parseRtSource(value: string | null): RtSource {
  return value === "unverified" ? "unverified" : "verified";
}

function parsePriceComponent(value: string | null): PriceComponent {
  if (value === "energy" || value === "congestion" || value === "loss") return value;
  return "total";
}

function parseDayType(value: string | null): DayType {
  if (value === "weekdays" || value === "weekends") return value;
  return "all";
}

function parseForecastSource(value: string | null): ForecastSourceMode {
  const normalized = value?.trim().toLowerCase();
  return normalized === "meteologica" || normalized === "meteo" ? "meteologica" : "pjm";
}

function parseBoundedNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInt(value: unknown): number {
  return Math.trunc(toNumber(value) ?? 0);
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isoLocal(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(" ", "T").slice(0, 19);
}

function priceExpression(rtSource: RtSource, component: PriceComponent): string {
  if (component === "energy" && rtSource === "unverified") {
    return "(total_lmp_rt - congestion_price_rt - marginal_loss_price_rt)";
  }
  if (component === "energy") return "system_energy_price_rt";
  if (component === "congestion") return "congestion_price_rt";
  if (component === "loss") return "marginal_loss_price_rt";
  return "total_lmp_rt";
}

function historicalHourPredicate(timestampExpression: string): string {
  return `
        and extract(hour from ${timestampExpression})::int + 1 between p.hour_start and p.hour_end
        and (
          p.day_type = 'all'
          or (p.day_type = 'weekdays' and extract(isodow from ${timestampExpression})::int between 1 and 5)
          or (p.day_type = 'weekends' and extract(isodow from ${timestampExpression})::int in (6, 7))
        )
        and (
          (
            p.season_start_mmdd <= p.season_end_mmdd
            and to_char(${timestampExpression}, 'MM-DD') between p.season_start_mmdd and p.season_end_mmdd
          )
          or (
            p.season_start_mmdd > p.season_end_mmdd
            and (
              to_char(${timestampExpression}, 'MM-DD') >= p.season_start_mmdd
              or to_char(${timestampExpression}, 'MM-DD') <= p.season_end_mmdd
            )
          )
        )`;
}

function priceSourceSql(rtSource: RtSource, component: PriceComponent): string {
  const expr = priceExpression(rtSource, component);
  if (rtSource === "unverified") {
    return `
      select
        datetime_beginning_ept,
        pnode_name,
        ${expr}::float8 as rt_price,
        updated_at
      from pjm.rt_unverified_hrl_lmps
      cross join params p
      where pnode_name = p.hub
        and datetime_beginning_ept >= (select history_start from history_bounds)
        and datetime_beginning_ept < (select history_end_exclusive from history_bounds)
        ${historicalHourPredicate("datetime_beginning_ept")}
    `;
  }
  return `
    select
      datetime_beginning_ept,
      pnode_name,
      ${expr}::float8 as rt_price,
      updated_at
    from pjm.rt_hrl_lmps
    cross join params p
    where pnode_name = p.hub
      and row_is_current = true
      and datetime_beginning_ept >= (select history_start from history_bounds)
      and datetime_beginning_ept < (select history_end_exclusive from history_bounds)
      ${historicalHourPredicate("datetime_beginning_ept")}
  `;
}

function forecastSourceLabel(forecastSource: ForecastSourceMode): string {
  return forecastSource === "meteologica" ? "METEO" : "PJM";
}

function forecastFundamentalsSql(forecastSource: ForecastSourceMode): string {
  if (forecastSource === "meteologica") {
    return `
    forecast_date_candidates as (
      select load.forecast_period_start::date as forecast_date
      from meteologica.pjm_forecast_hourly load
      cross join params p
      where load.region = 'PJM'
        and load.forecast_area = 'RTO'
        and load.metric = 'load'
        and load.forecast_period_start::date >= current_date
        and load.forecast_period_start is not null
        and load.issue_date is not null
        and load.forecast_mw is not null
        and extract(hour from load.forecast_period_start)::int + 1 between p.hour_start and p.hour_end
      group by load.forecast_period_start::date
    ),
    available_latest_load_issue as (
      select
        c.forecast_date,
        max(load.issue_date) as evaluated_at_utc
      from forecast_date_candidates c
      join meteologica.pjm_forecast_hourly load
        on load.forecast_period_start::date = c.forecast_date
      cross join params p
      where load.region = 'PJM'
        and load.forecast_area = 'RTO'
        and load.metric = 'load'
        and load.issue_date is not null
        and load.forecast_period_start is not null
        and load.forecast_mw is not null
        and extract(hour from load.forecast_period_start)::int + 1 between p.hour_start and p.hour_end
      group by c.forecast_date
    ),
    available_load_rows as (
      select
        load.forecast_period_start::date as forecast_date,
        load.forecast_period_start as forecast_datetime_beginning_ept,
        load.issue_date as evaluated_at_utc,
        extract(hour from load.forecast_period_start)::int + 1 as hour_ending,
        load.forecast_mw::float8 as load_mw,
        load.updated_at as load_updated_at
      from meteologica.pjm_forecast_hourly load
      join available_latest_load_issue issue
        on load.forecast_period_start::date = issue.forecast_date
       and load.issue_date = issue.evaluated_at_utc
      cross join params p
      where load.region = 'PJM'
        and load.forecast_area = 'RTO'
        and load.metric = 'load'
        and extract(hour from load.forecast_period_start)::int + 1 between p.hour_start and p.hour_end
        and load.forecast_mw is not null
    ),
    available_net_load_rows as (
      select
        l.forecast_date,
        l.forecast_datetime_beginning_ept,
        l.evaluated_at_utc,
        l.hour_ending,
        l.load_mw,
        solar.solar_mw,
        wind.wind_mw
      from available_load_rows l
      join lateral (
        select solar.forecast_mw::float8 as solar_mw
        from meteologica.pjm_forecast_hourly solar
        where solar.region = 'PJM'
          and solar.forecast_area = 'RTO'
          and solar.metric = 'solar'
          and solar.forecast_period_start = l.forecast_datetime_beginning_ept
          and solar.issue_date <= l.evaluated_at_utc
          and solar.forecast_mw is not null
        order by solar.issue_date desc
        limit 1
      ) solar on true
      join lateral (
        select wind.forecast_mw::float8 as wind_mw
        from meteologica.pjm_forecast_hourly wind
        where wind.region = 'PJM'
          and wind.forecast_area = 'RTO'
          and wind.metric = 'wind'
          and wind.forecast_period_start = l.forecast_datetime_beginning_ept
          and wind.issue_date <= l.evaluated_at_utc
          and wind.forecast_mw is not null
        order by wind.issue_date desc
        limit 1
      ) wind on true
    ),
    available_weather_issue as (
      select
        c.forecast_date,
        max(forecast.forecast_issued_at_utc) as forecast_issued_at_utc
      from (select distinct forecast_date from available_net_load_rows) c
      join weather.wsi_hourly_forecasts forecast
        on forecast.forecast_time_utc::date = c.forecast_date
      cross join params p
      where forecast.region = p.region
        and (forecast.station_name = p.station_id or forecast.station_id = p.station_id)
        and forecast.temp_f is not null
      group by c.forecast_date
    ),
    available_weather_rows as (
      select
        forecast.forecast_time_utc::date as forecast_date,
        extract(hour from forecast.forecast_time_utc)::int + 1 as hour_ending
      from weather.wsi_hourly_forecasts forecast
      join available_weather_issue issue
        on forecast.forecast_time_utc::date = issue.forecast_date
       and forecast.forecast_issued_at_utc = issue.forecast_issued_at_utc
      cross join params p
      where forecast.region = p.region
        and (forecast.station_name = p.station_id or forecast.station_id = p.station_id)
        and forecast.temp_f is not null
        and extract(hour from forecast.forecast_time_utc)::int + 1 between p.hour_start and p.hour_end
      group by forecast.forecast_time_utc::date, extract(hour from forecast.forecast_time_utc)::int + 1
    ),
    available_dates as (
      select n.forecast_date
      from available_net_load_rows n
      join available_weather_rows w
        on w.forecast_date = n.forecast_date
       and w.hour_ending = n.hour_ending
      cross join params p
      group by n.forecast_date
      having count(distinct n.hour_ending) = max(p.hour_end - p.hour_start + 1)
         and count(distinct w.hour_ending) = max(p.hour_end - p.hour_start + 1)
    ),
    selected_date as (
      select case
        when (select requested_forecast_date from params) is not null then (
          select forecast_date
          from available_dates
          where forecast_date = (select requested_forecast_date from params)
        )
        else (select min(forecast_date) from available_dates)
      end as forecast_date
    ),
    year_bounds as (
      select
        extract(year from current_date)::int as current_year,
        extract(year from current_date)::int - (select lookback_years from params) as first_history_year,
        case
          when (select include_current_year from params) then extract(year from current_date)::int
          else extract(year from current_date)::int - 1
        end as last_history_year
    ),
    selected_years as (
      select generate_series(first_history_year, last_history_year)::int as year
      from year_bounds
    ),
    history_bounds as (
      select
        make_date((select min(year) from selected_years), 1, 1)::timestamp as history_start,
        (make_date((select max(year) from selected_years), 12, 31) + interval '1 day')::timestamp as history_end_exclusive
    ),
    latest_load_issue as (
      select max(load.issue_date) as evaluated_at_utc
      from meteologica.pjm_forecast_hourly load
      join selected_date d
        on load.forecast_period_start::date = d.forecast_date
      where load.region = 'PJM'
        and load.forecast_area = 'RTO'
        and load.metric = 'load'
        and load.issue_date is not null
        and load.forecast_period_start is not null
        and load.forecast_mw is not null
    ),
    forecast_load_rows as (
      select
        load.forecast_period_start as forecast_datetime_beginning_ept,
        load.issue_date as evaluated_at_datetime_ept,
        load.issue_date as evaluated_at_datetime_utc,
        extract(hour from load.forecast_period_start)::int + 1 as hour_ending,
        load.forecast_mw::float8 as load_mw,
        load.updated_at as load_updated_at
      from meteologica.pjm_forecast_hourly load
      join latest_load_issue issue
        on load.issue_date = issue.evaluated_at_utc
      join selected_date d
        on load.forecast_period_start::date = d.forecast_date
      cross join params p
      where load.region = 'PJM'
        and load.forecast_area = 'RTO'
        and load.metric = 'load'
        and extract(hour from load.forecast_period_start)::int + 1 between p.hour_start and p.hour_end
        and load.forecast_mw is not null
    ),
    forecast_net_load as (
      select
        l.forecast_datetime_beginning_ept,
        l.evaluated_at_datetime_ept,
        l.evaluated_at_datetime_utc,
        l.hour_ending,
        l.load_mw,
        solar.solar_mw,
        wind.wind_mw,
        (l.load_mw - solar.solar_mw - wind.wind_mw)::float8 as net_load_mw,
        greatest(l.load_updated_at, coalesce(solar.updated_at, l.load_updated_at), coalesce(wind.updated_at, l.load_updated_at)) as updated_at
      from forecast_load_rows l
      join lateral (
        select
          solar.forecast_mw::float8 as solar_mw,
          solar.updated_at
        from meteologica.pjm_forecast_hourly solar
        where solar.region = 'PJM'
          and solar.forecast_area = 'RTO'
          and solar.metric = 'solar'
          and solar.forecast_period_start = l.forecast_datetime_beginning_ept
          and solar.issue_date <= l.evaluated_at_datetime_utc
          and solar.forecast_mw is not null
        order by solar.issue_date desc
        limit 1
      ) solar on true
      join lateral (
        select
          wind.forecast_mw::float8 as wind_mw,
          wind.updated_at
        from meteologica.pjm_forecast_hourly wind
        where wind.region = 'PJM'
          and wind.forecast_area = 'RTO'
          and wind.metric = 'wind'
          and wind.forecast_period_start = l.forecast_datetime_beginning_ept
          and wind.issue_date <= l.evaluated_at_datetime_utc
          and wind.forecast_mw is not null
        order by wind.issue_date desc
        limit 1
      ) wind on true
    )`;
  }

  return `
    forecast_date_candidates as (
      select load.forecast_datetime_beginning_ept::date as forecast_date
      from pjm.load_frcstd_7_day load
      cross join params p
      where load.forecast_area = 'RTO_COMBINED'
        and load.forecast_datetime_beginning_ept::date >= current_date
        and load.forecast_datetime_beginning_ept is not null
        and load.forecast_datetime_beginning_utc is not null
        and load.evaluated_at_datetime_utc is not null
        and load.forecast_load_mw is not null
        and extract(hour from load.forecast_datetime_beginning_ept)::int + 1 between p.hour_start and p.hour_end
      group by load.forecast_datetime_beginning_ept::date
    ),
    available_latest_load_issue as (
      select
        c.forecast_date,
        max(load.evaluated_at_datetime_utc) as evaluated_at_utc
      from forecast_date_candidates c
      join pjm.load_frcstd_7_day load
        on load.forecast_datetime_beginning_ept::date = c.forecast_date
      cross join params p
      where load.forecast_area = 'RTO_COMBINED'
        and load.evaluated_at_datetime_utc is not null
        and load.forecast_datetime_beginning_ept is not null
        and load.forecast_datetime_beginning_utc is not null
        and load.forecast_load_mw is not null
        and extract(hour from load.forecast_datetime_beginning_ept)::int + 1 between p.hour_start and p.hour_end
      group by c.forecast_date
    ),
    available_load_rows as (
      select
        load.forecast_datetime_beginning_ept::date as forecast_date,
        load.forecast_datetime_beginning_ept,
        load.forecast_datetime_beginning_utc,
        load.evaluated_at_datetime_utc,
        extract(hour from load.forecast_datetime_beginning_ept)::int + 1 as hour_ending,
        load.forecast_load_mw::float8 as load_mw
      from pjm.load_frcstd_7_day load
      join available_latest_load_issue issue
        on load.forecast_datetime_beginning_ept::date = issue.forecast_date
       and load.evaluated_at_datetime_utc = issue.evaluated_at_utc
      cross join params p
      where load.forecast_area = 'RTO_COMBINED'
        and extract(hour from load.forecast_datetime_beginning_ept)::int + 1 between p.hour_start and p.hour_end
        and load.forecast_load_mw is not null
    ),
    available_net_load_rows as (
      select
        l.forecast_date,
        l.forecast_datetime_beginning_ept,
        l.forecast_datetime_beginning_utc,
        l.evaluated_at_datetime_utc,
        l.hour_ending,
        l.load_mw,
        solar.solar_mw,
        wind.wind_mw
      from available_load_rows l
      join lateral (
        select solar_forecast_mwh::float8 as solar_mw
        from pjm.hourly_solar_power_forecast solar
        where solar.datetime_beginning_utc = l.forecast_datetime_beginning_utc
          and solar.evaluated_at_utc is not null
          and solar.evaluated_at_utc <= l.evaluated_at_datetime_utc
          and solar.solar_forecast_mwh is not null
        order by solar.evaluated_at_utc desc
        limit 1
      ) solar on true
      join lateral (
        select wind_forecast_mwh::float8 as wind_mw
        from pjm.hourly_wind_power_forecast wind
        where wind.datetime_beginning_utc = l.forecast_datetime_beginning_utc
          and wind.evaluated_at_utc is not null
          and wind.evaluated_at_utc <= l.evaluated_at_datetime_utc
          and wind.wind_forecast_mwh is not null
        order by wind.evaluated_at_utc desc
        limit 1
      ) wind on true
    ),
    available_weather_issue as (
      select
        c.forecast_date,
        max(forecast.forecast_issued_at_utc) as forecast_issued_at_utc
      from (select distinct forecast_date from available_net_load_rows) c
      join weather.wsi_hourly_forecasts forecast
        on forecast.forecast_time_utc::date = c.forecast_date
      cross join params p
      where forecast.region = p.region
        and (forecast.station_name = p.station_id or forecast.station_id = p.station_id)
        and forecast.temp_f is not null
      group by c.forecast_date
    ),
    available_weather_rows as (
      select
        forecast.forecast_time_utc::date as forecast_date,
        extract(hour from forecast.forecast_time_utc)::int + 1 as hour_ending
      from weather.wsi_hourly_forecasts forecast
      join available_weather_issue issue
        on forecast.forecast_time_utc::date = issue.forecast_date
       and forecast.forecast_issued_at_utc = issue.forecast_issued_at_utc
      cross join params p
      where forecast.region = p.region
        and (forecast.station_name = p.station_id or forecast.station_id = p.station_id)
        and forecast.temp_f is not null
        and extract(hour from forecast.forecast_time_utc)::int + 1 between p.hour_start and p.hour_end
      group by forecast.forecast_time_utc::date, extract(hour from forecast.forecast_time_utc)::int + 1
    ),
    available_dates as (
      select n.forecast_date
      from available_net_load_rows n
      join available_weather_rows w
        on w.forecast_date = n.forecast_date
       and w.hour_ending = n.hour_ending
      cross join params p
      group by n.forecast_date
      having count(distinct n.hour_ending) = max(p.hour_end - p.hour_start + 1)
         and count(distinct w.hour_ending) = max(p.hour_end - p.hour_start + 1)
    ),
    selected_date as (
      select case
        when (select requested_forecast_date from params) is not null then (
          select forecast_date
          from available_dates
          where forecast_date = (select requested_forecast_date from params)
        )
        else (select min(forecast_date) from available_dates)
      end as forecast_date
    ),
    year_bounds as (
      select
        extract(year from current_date)::int as current_year,
        extract(year from current_date)::int - (select lookback_years from params) as first_history_year,
        case
          when (select include_current_year from params) then extract(year from current_date)::int
          else extract(year from current_date)::int - 1
        end as last_history_year
    ),
    selected_years as (
      select generate_series(first_history_year, last_history_year)::int as year
      from year_bounds
    ),
    history_bounds as (
      select
        make_date((select min(year) from selected_years), 1, 1)::timestamp as history_start,
        (make_date((select max(year) from selected_years), 12, 31) + interval '1 day')::timestamp as history_end_exclusive
    ),
    latest_load_issue as (
      select max(load.evaluated_at_datetime_utc) as evaluated_at_utc
      from pjm.load_frcstd_7_day load
      join selected_date d
        on load.forecast_datetime_beginning_ept::date = d.forecast_date
      where load.forecast_area = 'RTO_COMBINED'
        and load.evaluated_at_datetime_utc is not null
        and load.forecast_datetime_beginning_ept is not null
        and load.forecast_datetime_beginning_utc is not null
        and load.forecast_load_mw is not null
    ),
    forecast_load_rows as (
      select
        load.forecast_datetime_beginning_ept,
        load.forecast_datetime_beginning_utc,
        load.evaluated_at_datetime_ept,
        load.evaluated_at_datetime_utc,
        extract(hour from load.forecast_datetime_beginning_ept)::int + 1 as hour_ending,
        load.forecast_load_mw::float8 as load_mw,
        load.updated_at as load_updated_at
      from pjm.load_frcstd_7_day load
      join latest_load_issue issue
        on load.evaluated_at_datetime_utc = issue.evaluated_at_utc
      join selected_date d
        on load.forecast_datetime_beginning_ept::date = d.forecast_date
      cross join params p
      where load.forecast_area = 'RTO_COMBINED'
        and extract(hour from load.forecast_datetime_beginning_ept)::int + 1 between p.hour_start and p.hour_end
        and load.forecast_load_mw is not null
    ),
    forecast_net_load as (
      select
        l.forecast_datetime_beginning_ept,
        l.evaluated_at_datetime_ept,
        l.evaluated_at_datetime_utc,
        l.hour_ending,
        l.load_mw,
        solar.solar_mw,
        wind.wind_mw,
        (l.load_mw - solar.solar_mw - wind.wind_mw)::float8 as net_load_mw,
        greatest(l.load_updated_at, coalesce(solar.updated_at, l.load_updated_at), coalesce(wind.updated_at, l.load_updated_at)) as updated_at
      from forecast_load_rows l
      join lateral (
        select
          solar_forecast_mwh::float8 as solar_mw,
          updated_at
        from pjm.hourly_solar_power_forecast solar
        where solar.datetime_beginning_utc = l.forecast_datetime_beginning_utc
          and solar.evaluated_at_utc is not null
          and solar.evaluated_at_utc <= l.evaluated_at_datetime_utc
          and solar.solar_forecast_mwh is not null
        order by solar.evaluated_at_utc desc
        limit 1
      ) solar on true
      join lateral (
        select
          wind_forecast_mwh::float8 as wind_mw,
          updated_at
        from pjm.hourly_wind_power_forecast wind
        where wind.datetime_beginning_utc = l.forecast_datetime_beginning_utc
          and wind.evaluated_at_utc is not null
          and wind.evaluated_at_utc <= l.evaluated_at_datetime_utc
          and wind.wind_forecast_mwh is not null
        order by wind.evaluated_at_utc desc
        limit 1
      ) wind on true
    )`;
}

interface ForecastHour {
  forecastDatetimeEpt: string | null;
  hourEnding: number;
  loadMw: number | null;
  windMw: number | null;
  solarMw: number | null;
  netLoadMw: number | null;
  tempF: number | null;
  totalOutagesMw: number | null;
  evaluatedAtEpt: string | null;
}

interface HistoricalRow {
  datetimeBeginningEpt: string | null;
  hourEnding: number;
  actualYear: number;
  rtPrice: number | null;
  tempF: number | null;
  grossLoadMw: number | null;
  windMw: number | null;
  solarMw: number | null;
  netLoadMw: number | null;
  totalOutagesMw: number | null;
  rowAsOf: string | null;
}

interface AnalogPoint {
  targetDatetimeEpt: string | null;
  targetHourEnding: number;
  datetimeBeginningEpt: string | null;
  hourEnding: number;
  actualYear: number;
  rtPrice: number | null;
  tempF: number | null;
  grossLoadMw: number | null;
  windMw: number | null;
  solarMw: number | null;
  netLoadMw: number | null;
  totalOutagesMw: number | null;
  distance: number | null;
}

function percentile(sortedValues: number[], pct: number): number | null {
  if (!sortedValues.length) return null;
  const bounded = Math.min(Math.max(pct, 0), 1);
  const position = (sortedValues.length - 1) * bounded;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function emptyStats() {
  return {
    count: 0,
    minPrice: null,
    p05: null,
    p25: null,
    median: null,
    p75: null,
    p95: null,
    maxPrice: null,
    meanPrice: null,
    stdDev: null,
    skewness: null,
  };
}

function statsFromPrices(rawPrices: Array<number | null | undefined>) {
  const prices = rawPrices
    .filter((price): price is number => price !== null && price !== undefined && Number.isFinite(price))
    .sort((a, b) => a - b);
  if (!prices.length) return emptyStats();

  const count = prices.length;
  const minPrice = prices[0];
  const maxPrice = prices[count - 1];
  const meanPrice = prices.reduce((sum, price) => sum + price, 0) / count;
  const variance = prices.reduce((sum, price) => sum + (price - meanPrice) ** 2, 0) / count;
  const stdDev = Math.sqrt(variance);
  const skewness =
    stdDev > 0
      ? prices.reduce((sum, price) => sum + ((price - meanPrice) / stdDev) ** 3, 0) / count
      : null;

  return {
    count,
    minPrice,
    p05: percentile(prices, 0.05),
    p25: percentile(prices, 0.25),
    median: percentile(prices, 0.5),
    p75: percentile(prices, 0.75),
    p95: percentile(prices, 0.95),
    maxPrice,
    meanPrice,
    stdDev,
    skewness,
  };
}

function tailsFromPrices(rawPrices: Array<number | null | undefined>) {
  const prices = rawPrices.filter(
    (price): price is number => price !== null && price !== undefined && Number.isFinite(price),
  );
  if (!prices.length) {
    return { belowZero: null, above100: null, above250: null, above500: null };
  }
  const count = prices.length;
  return {
    belowZero: prices.filter((price) => price < 0).length / count,
    above100: prices.filter((price) => price > 100).length / count,
    above250: prices.filter((price) => price > 250).length / count,
    above500: prices.filter((price) => price > 500).length / count,
  };
}

function histogramFromPrices(rawPrices: Array<number | null | undefined>, binCount = 18) {
  const prices = rawPrices.filter(
    (price): price is number => price !== null && price !== undefined && Number.isFinite(price),
  );
  if (!prices.length) {
    return Array.from({ length: binCount }, (_, binIndex) => ({
      binIndex,
      binStart: null,
      binEnd: null,
      count: 0,
      pct: null,
    }));
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const bins = Array.from({ length: binCount }, (_, binIndex) => ({
    binIndex,
    binStart: minPrice === maxPrice ? minPrice : minPrice + ((maxPrice - minPrice) * binIndex) / binCount,
    binEnd: minPrice === maxPrice ? maxPrice : minPrice + ((maxPrice - minPrice) * (binIndex + 1)) / binCount,
    count: 0,
    pct: 0,
  }));

  prices.forEach((price) => {
    const rawIndex = minPrice === maxPrice ? 0 : Math.floor(((price - minPrice) / (maxPrice - minPrice)) * binCount);
    bins[Math.min(Math.max(rawIndex, 0), binCount - 1)].count += 1;
  });

  return bins.map((bin) => ({
    ...bin,
    pct: bin.count / prices.length,
  }));
}

function groupYearCounts(rows: Array<{ actualYear: number }>) {
  const counts = new Map<number, number>();
  rows.forEach((row) => {
    counts.set(row.actualYear, (counts.get(row.actualYear) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .sort(([left], [right]) => left - right)
    .map(([year, rowCount]) => ({ year, rowCount }));
}

function analogTargetKey(point: Pick<AnalogPoint, "targetDatetimeEpt" | "targetHourEnding">): string {
  return `${point.targetDatetimeEpt ?? "unknown"}|${point.targetHourEnding}`;
}

function computeAnalogPoints(
  forecastHours: ForecastHour[],
  historicalRows: HistoricalRow[],
  analogsPerHour: number,
): AnalogPoint[] {
  const temps = historicalRows
    .map((row) => row.tempF)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const loads = historicalRows
    .map((row) => row.netLoadMw)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const minTemp = temps.length ? Math.min(...temps) : 0;
  const maxTemp = temps.length ? Math.max(...temps) : 1;
  const minLoad = loads.length ? Math.min(...loads) : 0;
  const maxLoad = loads.length ? Math.max(...loads) : 1;
  const tempRange = maxTemp - minTemp || 1;
  const loadRange = maxLoad - minLoad || 1;
  const rowsByHour = new Map<number, HistoricalRow[]>();

  historicalRows.forEach((row) => {
    const current = rowsByHour.get(row.hourEnding) ?? [];
    current.push(row);
    rowsByHour.set(row.hourEnding, current);
  });

  return forecastHours.flatMap((hour) => {
    if (hour.tempF === null || hour.netLoadMw === null) return [];
    const targetTempF = hour.tempF;
    const targetNetLoadMw = hour.netLoadMw;
    const candidates = (rowsByHour.get(hour.hourEnding) ?? [])
      .map((row) => {
        const distance =
          Math.abs(((row.tempF ?? minTemp) - minTemp) / tempRange - (targetTempF - minTemp) / tempRange) * 0.45 +
          Math.abs(((row.netLoadMw ?? minLoad) - minLoad) / loadRange - (targetNetLoadMw - minLoad) / loadRange) * 0.55;
        return {
          targetDatetimeEpt: hour.forecastDatetimeEpt,
          targetHourEnding: hour.hourEnding,
          datetimeBeginningEpt: row.datetimeBeginningEpt,
          hourEnding: row.hourEnding,
          actualYear: row.actualYear,
          rtPrice: row.rtPrice,
          tempF: row.tempF,
          grossLoadMw: row.grossLoadMw,
          windMw: row.windMw,
          solarMw: row.solarMw,
          netLoadMw: row.netLoadMw,
          totalOutagesMw: row.totalOutagesMw,
          distance,
        };
      })
      .sort((left, right) => {
        if ((left.distance ?? 0) !== (right.distance ?? 0)) return (left.distance ?? 0) - (right.distance ?? 0);
        return (right.datetimeBeginningEpt ?? "").localeCompare(left.datetimeBeginningEpt ?? "");
      });

    const years = Array.from(new Set(candidates.map((candidate) => candidate.actualYear)));
    const quota = Math.max(1, Math.floor(analogsPerHour / Math.max(years.length, 1)));
    const selected: AnalogPoint[] = [];
    const selectedKeys = new Set<string>();

    years.forEach((year) => {
      candidates
        .filter((candidate) => candidate.actualYear === year)
        .slice(0, quota)
        .forEach((candidate) => {
          const key = `${candidate.datetimeBeginningEpt}|${candidate.actualYear}`;
          if (!selectedKeys.has(key) && selected.length < analogsPerHour) {
            selectedKeys.add(key);
            selected.push(candidate);
          }
        });
    });

    candidates.forEach((candidate) => {
      const key = `${candidate.datetimeBeginningEpt}|${candidate.actualYear}`;
      if (!selectedKeys.has(key) && selected.length < analogsPerHour) {
        selectedKeys.add(key);
        selected.push(candidate);
      }
    });

    return selected.sort((left, right) => {
      if ((left.distance ?? 0) !== (right.distance ?? 0)) return (left.distance ?? 0) - (right.distance ?? 0);
      return (right.datetimeBeginningEpt ?? "").localeCompare(left.datetimeBeginningEpt ?? "");
    });
  });
}

function hourlyDistributionsFromAnalogs(analogPoints: AnalogPoint[]) {
  const byTarget = new Map<string, AnalogPoint[]>();
  analogPoints.forEach((point) => {
    const key = analogTargetKey(point);
    const current = byTarget.get(key) ?? [];
    current.push(point);
    byTarget.set(key, current);
  });

  return Array.from(byTarget.values())
    .map((points) => {
      const first = points[0];
      const stats = statsFromPrices(points.map((point) => point.rtPrice));
      return {
        forecastDatetimeEpt: first.targetDatetimeEpt,
        hourEnding: first.targetHourEnding,
        analogCount: stats.count,
        p25: stats.p25,
        median: stats.median,
        p75: stats.p75,
        p95: stats.p95,
      };
    })
    .sort((left, right) => (left.forecastDatetimeEpt ?? "").localeCompare(right.forecastDatetimeEpt ?? ""));
}

function yearShiftFromAnalogs(analogPoints: AnalogPoint[]) {
  const currentYear = new Date().getFullYear();
  const currentYearPoints = analogPoints.filter((point) => point.actualYear === currentYear);
  const priorYearPoints = analogPoints.filter((point) => point.actualYear !== currentYear);
  const currentYearMedian = statsFromPrices(currentYearPoints.map((point) => point.rtPrice)).median;
  const priorYearMedian = statsFromPrices(priorYearPoints.map((point) => point.rtPrice)).median;
  return {
    currentYear,
    currentYearCount: currentYearPoints.length,
    priorYearCount: priorYearPoints.length,
    currentYearMedian,
    priorYearMedian,
    medianShift:
      currentYearMedian !== null && priorYearMedian !== null ? currentYearMedian - priorYearMedian : null,
  };
}

function buildForecastAvailableDatesSql(forecastSource: ForecastSourceMode): string {
  const fundamentalsSql = forecastFundamentalsSql(forecastSource);
  const sourceLabel = forecastSourceLabel(forecastSource);
  return `
    with params as (
      select
        $1::text as load_area,
        $2::text as generation_area,
        $3::text as station_id,
        $4::text as region,
        $5::text as hub,
        $6::date as requested_forecast_date,
        least($7::int, $8::int) as hour_start,
        greatest($7::int, $8::int) as hour_end,
        $9::text as season_start_mmdd,
        $10::text as season_end_mmdd,
        $11::int as lookback_years,
        $12::boolean as include_current_year,
        $13::text as day_type,
        $14::float8 as min_price,
        $15::float8 as max_price,
        $16::float8 as min_outages,
        $17::float8 as max_outages,
        $18::int as analogs_per_hour
    ),
    ${fundamentalsSql}
    select jsonb_build_object(
      'selected', jsonb_build_object(
        'forecastDate', (select forecast_date::text from selected_date),
        'hourStart', (select hour_start from params),
        'hourEnd', (select hour_end from params),
        'loadArea', (select load_area from params),
        'generationArea', (select generation_area from params),
        'stationId', (select station_id from params),
        'region', (select region from params),
        'hub', (select hub from params),
        'forecastSource', '${forecastSource}',
        'forecastSourceLabel', '${sourceLabel}',
        'sourceArea', 'RTO'
      ),
      'available_dates', coalesce((select jsonb_agg(forecast_date::text order by forecast_date) from available_dates), '[]'::jsonb)
    ) as payload
  `;
}

function buildForecastAnalogSql(
  rtSource: RtSource,
  component: PriceComponent,
  forecastSource: ForecastSourceMode,
): string {
  const priceSql = priceSourceSql(rtSource, component);
  const fundamentalsSql = forecastFundamentalsSql(forecastSource);
  const sourceLabel = forecastSourceLabel(forecastSource);
  return `
    with params as (
      select
        $1::text as load_area,
        $2::text as generation_area,
        $3::text as station_id,
        $4::text as region,
        $5::text as hub,
        $6::date as requested_forecast_date,
        least($7::int, $8::int) as hour_start,
        greatest($7::int, $8::int) as hour_end,
        $9::text as season_start_mmdd,
        $10::text as season_end_mmdd,
        $11::int as lookback_years,
        $12::boolean as include_current_year,
        $13::text as day_type,
        $14::float8 as min_price,
        $15::float8 as max_price,
        $16::float8 as min_outages,
        $17::float8 as max_outages,
        $18::int as analogs_per_hour
    ),
    ${fundamentalsSql},
    latest_weather_issue as (
      select max(forecast.forecast_issued_at_utc) as forecast_issued_at_utc
      from weather.wsi_hourly_forecasts forecast
      cross join params p
      cross join selected_date d
      where forecast.region = p.region
        and (forecast.station_name = p.station_id or forecast.station_id = p.station_id)
        and forecast.forecast_time_utc::date = d.forecast_date
    ),
    forecast_weather as (
      select
        forecast.forecast_time_utc::date as forecast_date,
        extract(hour from forecast.forecast_time_utc)::int + 1 as hour_ending,
        avg(forecast.temp_f::float8) as temp_f,
        max(forecast.updated_at) as updated_at
      from weather.wsi_hourly_forecasts forecast
      cross join params p
      join latest_weather_issue issue
        on forecast.forecast_issued_at_utc = issue.forecast_issued_at_utc
      join selected_date d
        on forecast.forecast_time_utc::date = d.forecast_date
      where forecast.region = p.region
        and (forecast.station_name = p.station_id or forecast.station_id = p.station_id)
        and forecast.temp_f is not null
      group by forecast.forecast_time_utc::date, extract(hour from forecast.forecast_time_utc)::int + 1
    ),
    latest_outage_issue as (
      select max(o.forecast_execution_date_ept) as forecast_execution_date_ept
      from pjm.gen_outages_by_type o
      join selected_date d
        on o.forecast_date = d.forecast_date
      where o.region = 'PJM RTO'
    ),
    forecast_outage as (
      select
        o.forecast_date,
        o.total_outages_mw::float8 as total_outages_mw,
        o.updated_at
      from pjm.gen_outages_by_type o
      join latest_outage_issue issue
        on o.forecast_execution_date_ept = issue.forecast_execution_date_ept
      join selected_date d
        on o.forecast_date = d.forecast_date
      where o.region = 'PJM RTO'
    ),
    target_hours as (
      select
        f.forecast_datetime_beginning_ept,
        f.evaluated_at_datetime_ept,
        f.hour_ending,
        f.load_mw,
        f.solar_mw,
        f.wind_mw,
        f.net_load_mw,
        w.temp_f,
        coalesce(o.total_outages_mw, 0)::float8 as total_outages_mw,
        greatest(f.updated_at, coalesce(w.updated_at, f.updated_at), coalesce(o.updated_at, f.updated_at)) as row_as_of
      from forecast_net_load f
      join forecast_weather w
        on w.forecast_date = f.forecast_datetime_beginning_ept::date
       and w.hour_ending = f.hour_ending
      left join forecast_outage o
        on o.forecast_date = f.forecast_datetime_beginning_ept::date
    ),
    load_candidates as (
      select
        m.datetime_beginning_ept,
        m.datetime_beginning_utc,
        m.mw::float8 as gross_load_mw,
        m.updated_at,
        'metered_unverified' as load_source,
        1 as priority
      from pjm.hrl_load_metered m
      cross join params p
      cross join history_bounds hb
      where m.load_area = p.load_area
        and m.is_verified = false
        and m.datetime_beginning_ept >= hb.history_start
        and m.datetime_beginning_ept < hb.history_end_exclusive
        ${historicalHourPredicate("m.datetime_beginning_ept")}
      union all
      select
        p_load.datetime_beginning_ept,
        p_load.datetime_beginning_utc,
        p_load.prelim_load_avg_hourly::float8 as gross_load_mw,
        p_load.updated_at,
        'prelim' as load_source,
        3 as priority
      from pjm.hrl_load_prelim p_load
      cross join params p
      cross join history_bounds hb
      where p_load.load_area = p.load_area
        and p_load.datetime_beginning_ept >= hb.history_start
        and p_load.datetime_beginning_ept < hb.history_end_exclusive
        ${historicalHourPredicate("p_load.datetime_beginning_ept")}
    ),
    load_hourly as (
      select *
      from (
        select
          *,
          row_number() over (partition by datetime_beginning_ept order by priority) as rn
        from load_candidates
      ) ranked
      where rn = 1
    ),
    solar_hourly as (
      select
        s.datetime_beginning_ept,
        s.solar_generation_mw::float8 as solar_mw,
        s.updated_at
      from pjm.solar_gen s
      cross join params p
      cross join history_bounds hb
      where s.area = p.generation_area
        and s.datetime_beginning_ept >= hb.history_start
        and s.datetime_beginning_ept < hb.history_end_exclusive
        ${historicalHourPredicate("s.datetime_beginning_ept")}
    ),
    wind_hourly as (
      select
        w_gen.datetime_beginning_ept,
        w_gen.wind_generation_mw::float8 as wind_mw,
        w_gen.updated_at
      from pjm.wind_gen w_gen
      cross join params p
      cross join history_bounds hb
      where w_gen.area = p.generation_area
        and w_gen.datetime_beginning_ept >= hb.history_start
        and w_gen.datetime_beginning_ept < hb.history_end_exclusive
        ${historicalHourPredicate("w_gen.datetime_beginning_ept")}
    ),
    weather_hourly as (
      select
        wobs.observation_time_local,
        avg(wobs.temp_f::float8) as temp_f,
        max(wobs.updated_at) as updated_at
      from weather.wsi_hourly_observed_temperatures wobs
      cross join params p
      cross join history_bounds hb
      where wobs.station_id = p.station_id
        and wobs.region = p.region
        and wobs.observation_time_local >= hb.history_start
        and wobs.observation_time_local < hb.history_end_exclusive
        ${historicalHourPredicate("wobs.observation_time_local")}
      group by wobs.observation_time_local
    ),
    outage_daily as (
      select
        o.forecast_date,
        sum(o.total_outages_mw)::float8 as total_outages_mw,
        max(o.updated_at) as updated_at
      from pjm.gen_outages_by_type o
      cross join history_bounds hb
      where o.region = 'PJM RTO'
        and o.forecast_date = o.forecast_execution_date_ept
        and o.forecast_date >= hb.history_start::date
        and o.forecast_date < hb.history_end_exclusive::date
      group by o.forecast_date
    ),
    price_hourly as (
      ${priceSql}
    ),
    joined_actuals as (
      select
        l.datetime_beginning_ept,
        extract(year from l.datetime_beginning_ept)::int as actual_year,
        extract(month from l.datetime_beginning_ept)::int as month,
        extract(isodow from l.datetime_beginning_ept)::int as iso_dow,
        extract(hour from l.datetime_beginning_ept)::int + 1 as hour_ending,
        l.gross_load_mw,
        wind.wind_mw,
        solar.solar_mw,
        (l.gross_load_mw - wind.wind_mw - solar.solar_mw)::float8 as net_load_mw,
        wx.temp_f,
        price.rt_price,
        coalesce(outage.total_outages_mw, 0)::float8 as total_outages_mw,
        greatest(l.updated_at, wind.updated_at, solar.updated_at, wx.updated_at, price.updated_at, coalesce(outage.updated_at, l.updated_at)) as row_as_of
      from load_hourly l
      join wind_hourly wind
        on wind.datetime_beginning_ept = l.datetime_beginning_ept
      join solar_hourly solar
        on solar.datetime_beginning_ept = l.datetime_beginning_ept
      join weather_hourly wx
        on wx.observation_time_local = l.datetime_beginning_ept
      join price_hourly price
        on price.datetime_beginning_ept = l.datetime_beginning_ept
      left join outage_daily outage
        on outage.forecast_date = l.datetime_beginning_ept::date
    ),
    filtered_actuals as (
      select a.*
      from joined_actuals a
      cross join params p
      where a.actual_year in (select year from selected_years)
        and (
          (
            p.season_start_mmdd <= p.season_end_mmdd
            and to_char(a.datetime_beginning_ept, 'MM-DD') between p.season_start_mmdd and p.season_end_mmdd
          )
          or (
            p.season_start_mmdd > p.season_end_mmdd
            and (
              to_char(a.datetime_beginning_ept, 'MM-DD') >= p.season_start_mmdd
              or to_char(a.datetime_beginning_ept, 'MM-DD') <= p.season_end_mmdd
            )
          )
        )
    ),
    prefiltered_actuals as (
      select a.*
      from filtered_actuals a
      cross join params p
      where a.rt_price is not null
        and a.temp_f is not null
        and a.net_load_mw is not null
        and a.hour_ending between p.hour_start and p.hour_end
        and (
          p.day_type = 'all'
          or (p.day_type = 'weekdays' and a.iso_dow between 1 and 5)
          or (p.day_type = 'weekends' and a.iso_dow in (6, 7))
        )
        and (p.min_price is null or a.rt_price >= p.min_price)
        and (p.max_price is null or a.rt_price <= p.max_price)
        and (p.min_outages is null or a.total_outages_mw >= p.min_outages)
        and (p.max_outages is null or a.total_outages_mw <= p.max_outages)
    ),
    forecast_hour_rows as (
      select
        to_char(forecast_datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as forecast_datetime_ept,
        hour_ending,
        load_mw,
        wind_mw,
        solar_mw,
        net_load_mw,
        temp_f,
        total_outages_mw,
        to_char(evaluated_at_datetime_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept
      from target_hours
      order by forecast_datetime_beginning_ept
    ),
    historical_rows as (
      select
        to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
        hour_ending,
        actual_year,
        rt_price,
        temp_f,
        gross_load_mw,
        wind_mw,
        solar_mw,
        net_load_mw,
        total_outages_mw,
        to_char(row_as_of, 'YYYY-MM-DD"T"HH24:MI:SS') as row_as_of
      from prefiltered_actuals
      order by datetime_beginning_ept
    ),
    summary_row as (
      select
        (select count(*) from target_hours) as forecast_hour_count,
        (select count(*) from prefiltered_actuals) as historical_pool_count,
        to_char(
          greatest(
            coalesce((select max(row_as_of) from target_hours), timestamp 'epoch'),
            coalesce((select max(row_as_of) from prefiltered_actuals), timestamp 'epoch')
          ),
          'YYYY-MM-DD"T"HH24:MI:SS'
        ) as as_of
    )
    select jsonb_build_object(
      'selected', jsonb_build_object(
        'forecastDate', (select forecast_date::text from selected_date),
        'hourStart', (select hour_start from params),
        'hourEnd', (select hour_end from params),
        'loadArea', (select load_area from params),
        'generationArea', (select generation_area from params),
        'stationId', (select station_id from params),
        'region', (select region from params),
        'hub', (select hub from params),
        'forecastSource', '${forecastSource}',
        'forecastSourceLabel', '${sourceLabel}',
        'sourceArea', 'RTO',
        'rtSource', '${rtSource}',
        'component', '${component}',
        'seasonStart', (select season_start_mmdd from params),
        'seasonEnd', (select season_end_mmdd from params),
        'lookbackYears', (select lookback_years from params),
        'includeCurrentYear', (select include_current_year from params),
        'dayType', (select day_type from params),
        'analogsPerHour', (select analogs_per_hour from params)
      ),
      'available_dates', coalesce((select jsonb_agg(forecast_date::text order by forecast_date) from available_dates), '[]'::jsonb),
      'forecast_hours', coalesce((select jsonb_agg(to_jsonb(forecast_hour_rows) order by forecast_datetime_ept) from forecast_hour_rows), '[]'::jsonb),
      'historical_rows', coalesce((select jsonb_agg(to_jsonb(historical_rows) order by datetime_beginning_ept) from historical_rows), '[]'::jsonb),
      'summary', (select to_jsonb(summary_row) from summary_row)
    ) as payload
  `;
}

function forecastAnalogMemoryCacheKey(input: ForecastAnalogRequestInput): string {
  const normalizedHourStart = Math.min(input.hourStart, input.hourEnd);
  const normalizedHourEnd = Math.max(input.hourStart, input.hourEnd);

  return responseCacheKey([
    input.datesOnly ? "dates" : "full",
    input.forecastSource,
    input.loadArea,
    input.generationArea,
    input.stationId,
    input.region,
    input.hub,
    input.datesOnly ? "" : input.rtSource,
    input.datesOnly ? "" : input.component,
    input.forecastDate,
    normalizedHourStart,
    normalizedHourEnd,
    input.seasonStart,
    input.seasonEnd,
    input.lookbackYears,
    input.includeCurrentYear,
    input.dayType,
    input.minPrice,
    input.maxPrice,
    input.minOutages,
    input.maxOutages,
    input.analogsPerHour,
  ]);
}

async function loadForecastAnalogResult(input: ForecastAnalogRequestInput): Promise<ObservedRouteResult> {
  const {
    region,
    loadArea,
    generationArea,
    stationId,
    hub,
    rtSource,
    component,
    forecastSource,
    forecastDate,
    hourStart,
    hourEnd,
    seasonStart,
    seasonEnd,
    lookbackYears,
    includeCurrentYear,
    dayType,
    minPrice,
    maxPrice,
    minOutages,
    maxOutages,
    analogsPerHour,
    datesOnly,
  } = input;
  const queryParams = [
    loadArea,
    generationArea,
    stationId,
    region,
    hub,
    forecastDate,
    hourStart,
    hourEnd,
    seasonStart,
    seasonEnd,
    lookbackYears,
    includeCurrentYear,
    dayType,
    minPrice,
    maxPrice,
    minOutages,
    maxOutages,
    analogsPerHour,
  ];

  if (datesOnly) {
    const [row] = await query<ForecastAnalogRow>(buildForecastAvailableDatesSql(forecastSource), queryParams);
    const raw = parseJsonField<ForecastAnalogSql | null>(row?.payload, null);
    const availableForecastDates = raw?.available_dates ?? [];

    return {
      payload: {
        iso: "pjm",
        source: `${forecastSourceLabel(forecastSource)} RTO complete forecast dates`,
        selected: raw?.selected ?? {},
        availableForecastDates,
      },
      headers: responseHeaders(),
      rowCount: availableForecastDates.length,
    };
  }

  const [row] = await query<ForecastAnalogRow>(
    buildForecastAnalogSql(rtSource, component, forecastSource),
    queryParams,
  );

  const raw = parseJsonField<ForecastAnalogSql | null>(row?.payload, null);
  if (!raw) {
    return {
      status: 404,
      payload: { error: "No complete forward forecast fundamentals are available for the selected date and hours" },
      headers: responseHeaders("no-store"),
    };
  }

  const summary = raw?.summary ?? {};
  const asOf = typeof summary.as_of === "string" ? summary.as_of : null;
  const forecastHours: ForecastHour[] = (raw.forecast_hours ?? []).map((item) => ({
    forecastDatetimeEpt: isoLocal(item.forecast_datetime_ept),
    hourEnding: toInt(item.hour_ending),
    loadMw: toNumber(item.load_mw),
    windMw: toNumber(item.wind_mw),
    solarMw: toNumber(item.solar_mw),
    netLoadMw: toNumber(item.net_load_mw),
    tempF: toNumber(item.temp_f),
    totalOutagesMw: toNumber(item.total_outages_mw),
    evaluatedAtEpt: isoLocal(item.evaluated_at_ept),
  }));

  if (!forecastHours.length) {
    return {
      status: 404,
      payload: { error: "No complete forward forecast fundamentals are available for the selected date and hours" },
      headers: responseHeaders("no-store"),
    };
  }

  const historicalRows: HistoricalRow[] = (raw.historical_rows ?? []).map((item) => ({
    datetimeBeginningEpt: isoLocal(item.datetime_beginning_ept),
    hourEnding: toInt(item.hour_ending),
    actualYear: toInt(item.actual_year),
    rtPrice: toNumber(item.rt_price),
    tempF: toNumber(item.temp_f),
    grossLoadMw: toNumber(item.gross_load_mw),
    windMw: toNumber(item.wind_mw),
    solarMw: toNumber(item.solar_mw),
    netLoadMw: toNumber(item.net_load_mw),
    totalOutagesMw: toNumber(item.total_outages_mw),
    rowAsOf: isoLocal(item.row_as_of),
  }));
  const analogPoints = computeAnalogPoints(forecastHours, historicalRows, analogsPerHour);
  const analogPrices = analogPoints.map((point) => point.rtPrice);
  const analogCount = analogPoints.length;
  const yearShift = yearShiftFromAnalogs(analogPoints);

  return {
    payload: {
      iso: "pjm",
      source:
        `${forecastSourceLabel(forecastSource)} RTO net load forecast + WSI latest weather forecast + historical RT price analogs`,
      formula: "forecast net_load_mw = load - solar - wind; analog distance = normalized temp/load similarity",
      selected: raw.selected ?? {},
      availableForecastDates: raw.available_dates ?? [],
      forecastHours,
      priceDistribution: {
        stats: statsFromPrices(analogPrices),
        tails: tailsFromPrices(analogPrices),
        histogram: histogramFromPrices(analogPrices),
      },
      hourlyDistributions: hourlyDistributionsFromAnalogs(analogPoints),
      yearShift,
      yearCounts: {
        historicalPool: groupYearCounts(historicalRows),
        analogPool: groupYearCounts(analogPoints),
      },
      analogPoints: analogPoints
        .slice()
        .sort((left, right) => {
          if ((left.distance ?? 0) !== (right.distance ?? 0)) return (left.distance ?? 0) - (right.distance ?? 0);
          if ((left.targetDatetimeEpt ?? "") !== (right.targetDatetimeEpt ?? "")) {
            return (left.targetDatetimeEpt ?? "").localeCompare(right.targetDatetimeEpt ?? "");
          }
          return (right.datetimeBeginningEpt ?? "").localeCompare(left.datetimeBeginningEpt ?? "");
        })
        .slice(0, 2000),
      summary: {
        forecastHourCount: toInt(summary.forecast_hour_count),
        historicalPoolCount: historicalRows.length,
        analogCount,
        asOf: isoLocal(asOf),
      },
    },
    headers: responseHeaders(),
    rowCount: analogCount,
    dataAsOf: asOf,
  };
}

const loadForecastAnalogResultCached = unstable_cache(
  async (input: ForecastAnalogRequestInput) => loadForecastAnalogResult(input),
  ["pjm-forecast-price-analogs-v1"],
  {
    revalidate: DATA_CACHE_REVALIDATE_SECONDS,
    tags: ["pjm-forecast-price-analogs"],
  },
);

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const requestedHub = searchParams.get("hub")?.trim().toUpperCase() || DEFAULT_HUB;
  const hub = PRICE_HUBS.includes(requestedHub as (typeof PRICE_HUBS)[number])
    ? requestedHub
    : DEFAULT_HUB;
  const input: ForecastAnalogRequestInput = {
    region: parseIdentifier(searchParams.get("region"), DEFAULT_REGION),
    loadArea: parseIdentifier(searchParams.get("loadArea"), DEFAULT_LOAD_AREA),
    generationArea: parseIdentifier(searchParams.get("generationArea"), DEFAULT_GENERATION_AREA),
    stationId: parseIdentifier(searchParams.get("stationId"), DEFAULT_STATION_ID),
    hub,
    rtSource: parseRtSource(searchParams.get("rtSource")),
    component: parsePriceComponent(searchParams.get("component")),
    forecastSource: parseForecastSource(searchParams.get("source")),
    forecastDate: parseDate(searchParams.get("forecastDate")),
    hourStart: parseHour(searchParams.get("hourStart"), 8),
    hourEnd: parseHour(searchParams.get("hourEnd"), 23),
    seasonStart: parseMonthDay(searchParams.get("seasonStart"), "05-01"),
    seasonEnd: parseMonthDay(searchParams.get("seasonEnd"), "08-31"),
    lookbackYears: parseLookbackYears(searchParams.get("lookbackYears")),
    includeCurrentYear: parseBoolean(searchParams.get("includeCurrentYear"), true),
    dayType: parseDayType(searchParams.get("dayType")),
    minPrice: parseBoundedNumber(searchParams.get("minPrice")),
    maxPrice: parseBoundedNumber(searchParams.get("maxPrice")),
    minOutages: parseBoundedNumber(searchParams.get("minOutages")),
    maxOutages: parseBoundedNumber(searchParams.get("maxOutages")),
    analogsPerHour: parseAnalogsPerHour(searchParams.get("analogsPerHour")),
    datesOnly: parseBoolean(searchParams.get("datesOnly"), false),
  };
  const forceRefresh = parseBoolean(searchParams.get("refresh"), false);
  const cacheKey = forecastAnalogMemoryCacheKey(input);

  if (!forceRefresh) {
    const cached = responseCache().get(cacheKey);
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        return withResponseCacheHeader(cached.result, "fresh");
      }
      responseCache().delete(cacheKey);
    }

    const inFlight = inFlightCache().get(cacheKey);
    if (inFlight) {
      return withResponseCacheHeader(await inFlight, "deduped");
    }
  }

  const resultPromise = forceRefresh
    ? loadForecastAnalogResult(input)
    : loadForecastAnalogResultCached(input);

  if (!forceRefresh) {
    inFlightCache().set(cacheKey, resultPromise);
  }

  try {
    const result = await resultPromise;
    if (!forceRefresh && isCacheableResponse(result)) {
      storeResponseCacheEntry(cacheKey, result);
      return withResponseCacheHeader(result, "miss");
    }
    return result;
  } finally {
    if (!forceRefresh) {
      inFlightCache().delete(cacheKey);
    }
  }
});

export async function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
