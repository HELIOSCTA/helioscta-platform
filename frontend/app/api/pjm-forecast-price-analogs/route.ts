import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isActualsRegimeScatterDevEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const DEFAULT_LOAD_AREA = "RTO";
const DEFAULT_GENERATION_AREA = "RTO";
const DEFAULT_STATION_ID = "PJM";
const DEFAULT_REGION = "PJM";
const DEFAULT_HUB = "WESTERN HUB";
const DEFAULT_ANALOGS_PER_HOUR = 20;
const ROUTE_CONFIG = {
  route: "/api/pjm-forecast-price-analogs",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "Local-dev forecast-conditioned PJM RT price analog distribution",
  p95TargetMs: 3_000,
  freshnessSource:
    "pjm.load_frcstd_7_day, pjm.hourly_solar_power_forecast, pjm.hourly_wind_power_forecast, weather.wsi_hourly_forecasts, pjm.gen_outages_by_type, PJM RT LMP actuals",
} as const;

type RtSource = "verified" | "unverified";
type PriceComponent = "total" | "energy" | "congestion" | "loss";
type DayType = "all" | "weekdays" | "weekends";

interface ForecastAnalogRow {
  payload: ForecastAnalogSql | string | null;
}

interface ForecastAnalogSql {
  selected?: Record<string, unknown> | null;
  available_dates?: string[] | null;
  forecast_hours?: ForecastHourSql[] | null;
  price_distribution?: PriceDistributionSql | null;
  hourly_distributions?: HourlyDistributionSql[] | null;
  year_shift?: YearShiftSql | null;
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

interface AnalogPointSql {
  target_datetime_ept: string | null;
  target_hour_ending: number | string | null;
  datetime_beginning_ept: string | null;
  hour_ending: number | string | null;
  actual_year: number | string | null;
  rt_price: number | string | null;
  temp_f: number | string | null;
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
  return Math.min(Math.max(parsed, 5), 60);
}

function parseBoolean(value: string | null, fallback = true): boolean {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
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
      where pnode_name = (select hub from params)
        and datetime_beginning_ept >= (select history_start from history_bounds)
        and datetime_beginning_ept < (select history_end_exclusive from history_bounds)
    `;
  }
  return `
    select
      datetime_beginning_ept,
      pnode_name,
      ${expr}::float8 as rt_price,
      updated_at
    from pjm.rt_hrl_lmps
    where pnode_name = (select hub from params)
      and row_is_current = true
      and datetime_beginning_ept >= (select history_start from history_bounds)
      and datetime_beginning_ept < (select history_end_exclusive from history_bounds)
  `;
}

function mapStats(row: PriceDistributionSqlStats | null | undefined) {
  return {
    count: toInt(row?.count),
    minPrice: toNumber(row?.min_price),
    p05: toNumber(row?.p05),
    p25: toNumber(row?.p25),
    median: toNumber(row?.median),
    p75: toNumber(row?.p75),
    p95: toNumber(row?.p95),
    maxPrice: toNumber(row?.max_price),
    meanPrice: toNumber(row?.mean_price),
    stdDev: toNumber(row?.std_dev),
    skewness: toNumber(row?.skewness),
  };
}

function buildForecastAnalogSql(rtSource: RtSource, component: PriceComponent): string {
  const priceSql = priceSourceSql(rtSource, component);
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
    available_dates as (
      select distinct forecast_datetime_beginning_ept::date as forecast_date
      from pjm.load_frcstd_7_day
      where forecast_area = 'RTO_COMBINED'
        and forecast_datetime_beginning_ept::date >= current_date
        and forecast_datetime_beginning_ept is not null
        and forecast_load_mw is not null
    ),
    selected_date as (
      select coalesce(
        (select forecast_date from available_dates where forecast_date = (select requested_forecast_date from params)),
        (select min(forecast_date) from available_dates)
      ) as forecast_date
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
    ),
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
    feature_ranges as (
      select
        min(temp_f)::float8 as min_temp,
        max(temp_f)::float8 as max_temp,
        min(net_load_mw)::float8 as min_load,
        max(net_load_mw)::float8 as max_load,
        min(total_outages_mw)::float8 as min_outage,
        max(total_outages_mw)::float8 as max_outage
      from prefiltered_actuals
    ),
    analog_candidates as (
      select
        t.forecast_datetime_beginning_ept as target_datetime_ept,
        t.hour_ending as target_hour_ending,
        t.net_load_mw as target_net_load_mw,
        t.temp_f as target_temp_f,
        t.total_outages_mw as target_outages_mw,
        a.datetime_beginning_ept,
        a.hour_ending,
        a.actual_year,
        a.rt_price,
        a.temp_f,
        a.net_load_mw,
        a.total_outages_mw,
        (
          coalesce(abs(((a.temp_f - fr.min_temp) / nullif(fr.max_temp - fr.min_temp, 0)) - ((t.temp_f - fr.min_temp) / nullif(fr.max_temp - fr.min_temp, 0))), 0) * 0.34
          + coalesce(abs(((a.net_load_mw - fr.min_load) / nullif(fr.max_load - fr.min_load, 0)) - ((t.net_load_mw - fr.min_load) / nullif(fr.max_load - fr.min_load, 0))), 0) * 0.43
          + coalesce(abs(((a.total_outages_mw - fr.min_outage) / nullif(fr.max_outage - fr.min_outage, 0)) - ((t.total_outages_mw - fr.min_outage) / nullif(fr.max_outage - fr.min_outage, 0))), 0) * 0.18
          + case when a.hour_ending = t.hour_ending then 0 else 0.25 end
        )::float8 as distance
      from target_hours t
      join prefiltered_actuals a
        on a.hour_ending = t.hour_ending
      cross join feature_ranges fr
    ),
    analog_ranked as (
      select
        *,
        row_number() over (partition by target_datetime_ept order by distance, datetime_beginning_ept desc) as target_rank
      from analog_candidates
    ),
    analogs as (
      select *
      from analog_ranked
      where target_rank <= (select analogs_per_hour from params)
    ),
    price_stats_base as (
      select
        count(*) as "count",
        min(rt_price)::float8 as min_price,
        percentile_cont(0.05) within group (order by rt_price)::float8 as p05,
        percentile_cont(0.25) within group (order by rt_price)::float8 as p25,
        percentile_cont(0.50) within group (order by rt_price)::float8 as median,
        percentile_cont(0.75) within group (order by rt_price)::float8 as p75,
        percentile_cont(0.95) within group (order by rt_price)::float8 as p95,
        max(rt_price)::float8 as max_price,
        avg(rt_price)::float8 as mean_price,
        stddev_pop(rt_price)::float8 as std_dev
      from analogs
    ),
    price_stats as (
      select
        b."count",
        b.min_price,
        b.p05,
        b.p25,
        b.median,
        b.p75,
        b.p95,
        b.max_price,
        b.mean_price,
        b.std_dev,
        case
          when b.std_dev is null or b.std_dev = 0 then null
          else avg(power((a.rt_price - b.mean_price) / b.std_dev, 3))::float8
        end as skewness
      from price_stats_base b
      left join analogs a
        on a.rt_price is not null
      group by
        b."count",
        b.min_price,
        b.p05,
        b.p25,
        b.median,
        b.p75,
        b.p95,
        b.max_price,
        b.mean_price,
        b.std_dev
    ),
    tail_stats as (
      select
        avg(case when rt_price < 0 then 1.0 else 0.0 end)::float8 as below_zero,
        avg(case when rt_price > 100 then 1.0 else 0.0 end)::float8 as above_100,
        avg(case when rt_price > 250 then 1.0 else 0.0 end)::float8 as above_250,
        avg(case when rt_price > 500 then 1.0 else 0.0 end)::float8 as above_500
      from analogs
    ),
    histogram_bins as (
      select
        gs::int as bin_index,
        case
          when ps."count" = 0 then null
          when ps.max_price = ps.min_price then ps.min_price
          else ps.min_price + ((ps.max_price - ps.min_price) * gs / 18.0)
        end as bin_start,
        case
          when ps."count" = 0 then null
          when ps.max_price = ps.min_price then ps.max_price
          else ps.min_price + ((ps.max_price - ps.min_price) * (gs + 1) / 18.0)
        end as bin_end
      from price_stats ps
      cross join generate_series(0, 17) as gs
    ),
    histogram_counts as (
      select
        h.bin_index,
        h.bin_start::float8 as bin_start,
        h.bin_end::float8 as bin_end,
        count(a.rt_price) as bin_count,
        case
          when ps."count" = 0 then null
          else (count(a.rt_price)::float8 / ps."count"::float8)
        end as pct
      from histogram_bins h
      cross join price_stats ps
      left join analogs a
        on a.rt_price is not null
       and (
         (ps.max_price = ps.min_price and h.bin_index = 0 and a.rt_price = ps.min_price)
         or (
           ps.max_price > ps.min_price
           and a.rt_price >= h.bin_start
           and (a.rt_price < h.bin_end or (h.bin_index = 17 and a.rt_price <= h.bin_end))
         )
       )
      group by h.bin_index, h.bin_start, h.bin_end, ps."count"
    ),
    hourly_distributions as (
      select
        to_char(target_datetime_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as forecast_datetime_ept,
        target_hour_ending as hour_ending,
        count(*) as analog_count,
        percentile_cont(0.25) within group (order by rt_price)::float8 as p25,
        percentile_cont(0.50) within group (order by rt_price)::float8 as median,
        percentile_cont(0.75) within group (order by rt_price)::float8 as p75,
        percentile_cont(0.95) within group (order by rt_price)::float8 as p95
      from analogs
      group by target_datetime_ept, target_hour_ending
    ),
    year_shift as (
      select
        (select current_year from year_bounds) as current_year,
        count(*) filter (where actual_year = (select current_year from year_bounds)) as current_year_count,
        count(*) filter (where actual_year <> (select current_year from year_bounds)) as prior_year_count,
        percentile_cont(0.50) within group (order by rt_price) filter (where actual_year = (select current_year from year_bounds))::float8 as current_year_median,
        percentile_cont(0.50) within group (order by rt_price) filter (where actual_year <> (select current_year from year_bounds))::float8 as prior_year_median,
        (
          percentile_cont(0.50) within group (order by rt_price) filter (where actual_year = (select current_year from year_bounds))
          - percentile_cont(0.50) within group (order by rt_price) filter (where actual_year <> (select current_year from year_bounds))
        )::float8 as median_shift
      from analogs
    ),
    analog_point_rows as (
      select
        to_char(target_datetime_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as target_datetime_ept,
        target_hour_ending,
        to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
        hour_ending,
        actual_year,
        rt_price,
        temp_f,
        net_load_mw,
        total_outages_mw,
        distance
      from analogs
      order by distance, target_datetime_ept, datetime_beginning_ept desc
      limit 80
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
    summary_row as (
      select
        (select count(*) from target_hours) as forecast_hour_count,
        (select count(*) from prefiltered_actuals) as historical_pool_count,
        (select count(*) from analogs) as analog_count,
        to_char(max(row_as_of), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
      from target_hours
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
      'price_distribution', jsonb_build_object(
        'stats', (select to_jsonb(price_stats) from price_stats),
        'tails', (select to_jsonb(tail_stats) from tail_stats),
        'histogram', coalesce((select jsonb_agg(to_jsonb(histogram_counts) order by bin_index) from histogram_counts), '[]'::jsonb)
      ),
      'hourly_distributions', coalesce((select jsonb_agg(to_jsonb(hourly_distributions) order by forecast_datetime_ept) from hourly_distributions), '[]'::jsonb),
      'year_shift', (select to_jsonb(year_shift) from year_shift),
      'analog_points', coalesce((select jsonb_agg(to_jsonb(analog_point_rows) order by distance, target_datetime_ept, datetime_beginning_ept desc) from analog_point_rows), '[]'::jsonb),
      'summary', (select to_jsonb(summary_row) from summary_row)
    ) as payload
  `;
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const region = parseIdentifier(searchParams.get("region"), DEFAULT_REGION);
  const loadArea = parseIdentifier(searchParams.get("loadArea"), DEFAULT_LOAD_AREA);
  const generationArea = parseIdentifier(searchParams.get("generationArea"), DEFAULT_GENERATION_AREA);
  const stationId = parseIdentifier(searchParams.get("stationId"), DEFAULT_STATION_ID);
  const requestedHub = searchParams.get("hub")?.trim().toUpperCase() || DEFAULT_HUB;
  const hub = PRICE_HUBS.includes(requestedHub as (typeof PRICE_HUBS)[number])
    ? requestedHub
    : DEFAULT_HUB;
  const rtSource = parseRtSource(searchParams.get("rtSource"));
  const component = parsePriceComponent(searchParams.get("component"));
  const forecastDate = parseDate(searchParams.get("forecastDate"));
  const hourStart = parseHour(searchParams.get("hourStart"), 8);
  const hourEnd = parseHour(searchParams.get("hourEnd"), 23);
  const seasonStart = parseMonthDay(searchParams.get("seasonStart"), "05-01");
  const seasonEnd = parseMonthDay(searchParams.get("seasonEnd"), "08-31");
  const lookbackYears = parseLookbackYears(searchParams.get("lookbackYears"));
  const includeCurrentYear = parseBoolean(searchParams.get("includeCurrentYear"), true);
  const dayType = parseDayType(searchParams.get("dayType"));
  const minPrice = parseBoundedNumber(searchParams.get("minPrice"));
  const maxPrice = parseBoundedNumber(searchParams.get("maxPrice"));
  const minOutages = parseBoundedNumber(searchParams.get("minOutages"));
  const maxOutages = parseBoundedNumber(searchParams.get("maxOutages"));
  const analogsPerHour = parseAnalogsPerHour(searchParams.get("analogsPerHour"));

  const [row] = await query<ForecastAnalogRow>(buildForecastAnalogSql(rtSource, component), [
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
  ]);

  const raw = parseJsonField<ForecastAnalogSql | null>(row?.payload, null);
  const summary = raw?.summary ?? {};
  const asOf = typeof summary.as_of === "string" ? summary.as_of : null;
  const analogCount = toInt(summary.analog_count);

  if (!raw || !raw.forecast_hours?.length) {
    return {
      status: 404,
      payload: { error: "No complete forward forecast fundamentals are available for the selected date and hours" },
      headers: { "Cache-Control": "no-store" },
    };
  }

  return {
    payload: {
      iso: "pjm",
      source:
        "pjm latest net load forecast + WSI latest weather forecast + PJM latest outage forecast + historical RT price analogs",
      formula: "forecast net_load_mw = load - solar - wind; analog distance = normalized temp/load/outage similarity",
      selected: raw.selected ?? {},
      availableForecastDates: raw.available_dates ?? [],
      forecastHours: (raw.forecast_hours ?? []).map((item) => ({
        forecastDatetimeEpt: isoLocal(item.forecast_datetime_ept),
        hourEnding: toInt(item.hour_ending),
        loadMw: toNumber(item.load_mw),
        windMw: toNumber(item.wind_mw),
        solarMw: toNumber(item.solar_mw),
        netLoadMw: toNumber(item.net_load_mw),
        tempF: toNumber(item.temp_f),
        totalOutagesMw: toNumber(item.total_outages_mw),
        evaluatedAtEpt: isoLocal(item.evaluated_at_ept),
      })),
      priceDistribution: {
        stats: mapStats(raw.price_distribution?.stats),
        tails: {
          belowZero: toNumber(raw.price_distribution?.tails?.below_zero),
          above100: toNumber(raw.price_distribution?.tails?.above_100),
          above250: toNumber(raw.price_distribution?.tails?.above_250),
          above500: toNumber(raw.price_distribution?.tails?.above_500),
        },
        histogram: (raw.price_distribution?.histogram ?? []).map((item) => ({
          binIndex: toInt(item.bin_index),
          binStart: toNumber(item.bin_start),
          binEnd: toNumber(item.bin_end),
          count: toInt(item.bin_count),
          pct: toNumber(item.pct),
        })),
      },
      hourlyDistributions: (raw.hourly_distributions ?? []).map((item) => ({
        forecastDatetimeEpt: isoLocal(item.forecast_datetime_ept),
        hourEnding: toInt(item.hour_ending),
        analogCount: toInt(item.analog_count),
        p25: toNumber(item.p25),
        median: toNumber(item.median),
        p75: toNumber(item.p75),
        p95: toNumber(item.p95),
      })),
      yearShift: raw.year_shift
        ? {
            currentYear: toInt(raw.year_shift.current_year),
            currentYearCount: toInt(raw.year_shift.current_year_count),
            priorYearCount: toInt(raw.year_shift.prior_year_count),
            currentYearMedian: toNumber(raw.year_shift.current_year_median),
            priorYearMedian: toNumber(raw.year_shift.prior_year_median),
            medianShift: toNumber(raw.year_shift.median_shift),
          }
        : null,
      analogPoints: (raw.analog_points ?? []).map((item) => ({
        targetDatetimeEpt: isoLocal(item.target_datetime_ept),
        targetHourEnding: toInt(item.target_hour_ending),
        datetimeBeginningEpt: isoLocal(item.datetime_beginning_ept),
        hourEnding: toInt(item.hour_ending),
        actualYear: toInt(item.actual_year),
        rtPrice: toNumber(item.rt_price),
        tempF: toNumber(item.temp_f),
        netLoadMw: toNumber(item.net_load_mw),
        totalOutagesMw: toNumber(item.total_outages_mw),
        distance: toNumber(item.distance),
      })),
      summary: {
        forecastHourCount: toInt(summary.forecast_hour_count),
        historicalPoolCount: toInt(summary.historical_pool_count),
        analogCount,
        asOf: isoLocal(asOf),
      },
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: analogCount,
    dataAsOf: asOf,
  };
});

export async function GET(request: Request): Promise<Response> {
  if (!isActualsRegimeScatterDevEnabled()) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return observedGET(request);
}
