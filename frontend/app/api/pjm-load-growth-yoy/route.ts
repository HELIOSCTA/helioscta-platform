import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=900, stale-while-revalidate=300";
const DEFAULT_LOAD_AREA = "DOM";
const DEFAULT_STATION_ID = "KRIC";
const DEFAULT_REGION = "PJM";
const DEFAULT_LOOKBACK_DAYS = 56;
const MAX_LOOKBACK_DAYS = 120;
const MAX_DATE_RANGE_DAYS = 120;
const MAX_MONTH_YEAR_COUNT = 6;
const MIN_AREA_RECENT_ROWS = 14 * 24;
const ROUTE_CONFIG = {
  route: "/api/pjm-load-growth-yoy",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=900, stale-while-revalidate=300",
  owner: "frontend",
  purpose: "PJM daily weather-normalization load-growth YoY summary",
  p95TargetMs: 750,
  freshnessSource:
    "pjm.hrl_load_metered.updated_at, pjm.hrl_load_prelim.updated_at, weather.wsi_hourly_observed_temperatures.updated_at",
} as const;

type LoadShape = "flat" | "onpeak" | "offpeak" | "peak";
type DayType = "all" | "weekdays" | "weekends";
type DateMode = "lookback" | "range" | "month-years";

interface DailyYoyRow {
  mm_dd: string;
  current_date: string;
  last_year_date: string;
  current_load_mw: number | string | null;
  last_year_load_mw: number | string | null;
  diff_mw: number | string | null;
  growth_pct: number | string | null;
  current_temp_f: number | string | null;
  last_year_temp_f: number | string | null;
  current_feels_like_f: number | string | null;
  last_year_feels_like_f: number | string | null;
  current_hour_count: number | string;
  last_year_hour_count: number | string;
  current_unverified_hours: number | string;
  current_prelim_hours: number | string;
  last_year_unverified_hours: number | string;
  last_year_prelim_hours: number | string;
}

interface CoverageRow {
  load_area: string;
  station_id: string;
  station_name: string | null;
  region: string;
  current_start: string;
  current_end_exclusive: string;
  last_year_start: string;
  last_year_end_exclusive: string;
  load_min_ept: string | null;
  load_max_ept: string | null;
  weather_min_local: string | null;
  weather_max_local: string | null;
}

interface AreaRow {
  load_area: string;
  row_count: number | string;
  min_ept: string | null;
  max_ept: string | null;
}

interface WeatherStationRow {
  station_id: string;
  station_name: string | null;
  region: string;
}

function parseIdentifier(value: string | null, fallback: string): string {
  const trimmed = value?.trim().toUpperCase();
  if (!trimmed) return fallback;
  return /^[A-Z0-9_&/ -]{1,64}$/.test(trimmed) ? trimmed : fallback;
}

function parseLookbackDays(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_LOOKBACK_DAYS;
  return Math.min(Math.max(parsed, 14), MAX_LOOKBACK_DAYS);
}

function parseLoadShape(value: string | null): LoadShape {
  if (value === "onpeak" || value === "offpeak" || value === "peak") return value;
  return "flat";
}

function parseDayType(value: string | null): DayType {
  if (value === "weekdays" || value === "weekends") return value;
  return "all";
}

function parseDateMode(value: string | null): DateMode {
  if (value === "range" || value === "month-years") return value;
  return "lookback";
}

function parseDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function parseMonth(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) return 1;
  return parsed;
}

function parseYears(value: string | null): number[] {
  const currentYear = new Date().getUTCFullYear();
  const parsed = (value ?? "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((year) => Number.isInteger(year) && year >= 2000 && year <= currentYear + 1);
  const unique = Array.from(new Set(parsed)).sort((left, right) => left - right);
  return unique.length ? unique.slice(0, MAX_MONTH_YEAR_COUNT) : [currentYear];
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoLocal(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(" ", "T").slice(0, 19);
}

function sumNumbers<T>(rows: T[], selector: (row: T) => unknown): number {
  return rows.reduce((sum, row) => sum + Math.trunc(toNumber(selector(row)) ?? 0), 0);
}

function avgNumbers<T>(rows: T[], selector: (row: T) => unknown): number | null {
  const nums = rows.map(selector).map(toNumber).filter((value): value is number => value !== null);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

async function loadAreas(): Promise<AreaRow[]> {
  return query<AreaRow>(
    `
      with area_rows as (
        select
          load_area,
          count(*) as row_count,
          min(datetime_beginning_ept) as min_ept,
          max(datetime_beginning_ept) as max_ept
        from pjm.hrl_load_metered
        where is_verified = false
          and datetime_beginning_ept >= current_date - interval '395 days'
        group by load_area
        union all
        select
          load_area,
          count(*) as row_count,
          min(datetime_beginning_ept) as min_ept,
          max(datetime_beginning_ept) as max_ept
        from pjm.hrl_load_prelim
        where datetime_beginning_ept >= current_date - interval '395 days'
        group by load_area
      )
      select
        load_area,
        sum(row_count)::bigint as row_count,
        to_char(min(min_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as min_ept,
        to_char(max(max_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as max_ept
      from area_rows
      group by load_area
      having sum(row_count) >= ${MIN_AREA_RECENT_ROWS}
      order by case when load_area in ('DOM', 'RTO', 'RTO_COMBINED') then 0 else 1 end, load_area
    `,
  );
}

async function weatherStations(region: string): Promise<WeatherStationRow[]> {
  return query<WeatherStationRow>(
    `
      select
        station_id,
        max(station_name) as station_name,
        region
      from weather.wsi_hourly_observed_temperatures
      where region = $1
        and observation_time_local >= current_date - interval '120 days'
      group by station_id, region
      order by station_id
    `,
    [region],
  );
}

const DAILY_SQL = `
with params as (
  select
    $1::text as load_area,
    $2::text as station_id,
    $3::text as region,
    $4::int as lookback_days,
    coalesce($5::date, current_date)::date as as_of_date,
    $6::text as load_shape,
    $7::text as day_type,
    $8::text as date_mode,
    $9::date as requested_start,
    $10::date as requested_end,
    $11::int as selected_month,
    $12::int[] as selected_years
),
range_bounds as (
  select
    *,
    least(coalesce(requested_start, as_of_date - (lookback_days * interval '1 day')), coalesce(requested_end, as_of_date - interval '1 day'))::date as range_start,
    greatest(coalesce(requested_start, as_of_date - (lookback_days * interval '1 day')), coalesce(requested_end, as_of_date - interval '1 day'))::date as range_end
  from params
),
target_dates_raw as (
  select gs::date as target_dt
  from range_bounds p
  cross join lateral generate_series(
    case
      when p.date_mode = 'range' then greatest(p.range_start, (p.range_end - interval '${MAX_DATE_RANGE_DAYS - 1} days')::date)
      else (p.as_of_date - (p.lookback_days * interval '1 day'))::date
    end,
    case
      when p.date_mode = 'range' then p.range_end
      else (p.as_of_date - interval '1 day')::date
    end,
    interval '1 day'
  ) gs
  where p.date_mode in ('lookback', 'range')
  union all
  select gs::date as target_dt
  from params p
  cross join lateral unnest(p.selected_years) selected_year
  cross join lateral generate_series(
    make_date(selected_year, p.selected_month, 1),
    (make_date(selected_year, p.selected_month, 1) + interval '1 month - 1 day')::date,
    interval '1 day'
  ) gs
  where p.date_mode = 'month-years'
),
target_dates as (
  select distinct target_dt
  from target_dates_raw
  order by target_dt
  limit ${MAX_DATE_RANGE_DAYS * 2}
),
comparison_dates as (
  select target_dt as anchor_dt, target_dt as selected_dt, 'current'::text as period
  from target_dates
  union all
  select target_dt as anchor_dt, (target_dt - interval '1 year')::date as selected_dt, 'last_year'::text as period
  from target_dates
),
windows as (
  select
    p.load_area,
    p.station_id,
    p.region,
    p.lookback_days,
    min(t.target_dt)::date as current_start,
    (max(t.target_dt) + interval '1 day')::date as current_end,
    min((t.target_dt - interval '1 year')::date) as last_year_start,
    (max((t.target_dt - interval '1 year')::date) + interval '1 day')::date as last_year_end
  from params p
  left join target_dates t on true
  group by p.load_area, p.station_id, p.region, p.lookback_days
),
load_candidates as (
  select
    d.anchor_dt,
    d.period,
    m.datetime_beginning_ept,
    m.mw::float8 as load_mw,
    'metered_unverified' as source,
    1 as priority
  from pjm.hrl_load_metered m
  cross join params p
  join comparison_dates d
    on m.datetime_beginning_ept >= d.selected_dt
   and m.datetime_beginning_ept < d.selected_dt + interval '1 day'
  where m.is_verified = false
    and m.load_area = p.load_area
  union all
  select
    d.anchor_dt,
    d.period,
    p.datetime_beginning_ept,
    p.prelim_load_avg_hourly::float8 as load_mw,
    'prelim' as source,
    2 as priority
  from pjm.hrl_load_prelim p
  cross join params prm
  join comparison_dates d
    on p.datetime_beginning_ept >= d.selected_dt
   and p.datetime_beginning_ept < d.selected_dt + interval '1 day'
  where p.load_area = prm.load_area
),
load_hourly as (
  select *
  from (
    select
      *,
      row_number() over (partition by anchor_dt, period, datetime_beginning_ept order by priority) as rn
    from load_candidates
  ) ranked
  where rn = 1
),
weather_hourly as (
  select
    d.anchor_dt,
    d.period,
    wobs.observation_time_local,
    max(wobs.station_name) as station_name,
    avg(wobs.temp_f::float8) as temp_f,
    avg(wobs.feels_like_f::float8) as feels_like_f
  from weather.wsi_hourly_observed_temperatures wobs
  cross join params p
  join comparison_dates d
    on wobs.observation_time_local >= d.selected_dt
   and wobs.observation_time_local < d.selected_dt + interval '1 day'
  where wobs.station_id = p.station_id
    and wobs.region = p.region
  group by d.anchor_dt, d.period, wobs.observation_time_local
),
joined_hourly as (
  select
    l.anchor_dt,
    l.datetime_beginning_ept,
    l.datetime_beginning_ept::date as dt,
    to_char(l.anchor_dt, 'MM-DD') as mm_dd,
    extract(hour from l.datetime_beginning_ept)::int + 1 as hour_ending,
    extract(isodow from l.datetime_beginning_ept)::int as iso_dow,
    l.load_mw,
    l.source,
    w.temp_f,
    w.feels_like_f,
    l.period
  from load_hourly l
  join weather_hourly w
    on w.anchor_dt = l.anchor_dt
   and w.period = l.period
   and w.observation_time_local = l.datetime_beginning_ept
),
filtered_hourly as (
  select j.*
  from joined_hourly j
  cross join params p
  where (
      p.load_shape in ('flat', 'peak')
      or (p.load_shape = 'onpeak' and j.hour_ending between 8 and 23)
      or (p.load_shape = 'offpeak' and (j.hour_ending between 1 and 7 or j.hour_ending = 24))
    )
    and (
      p.day_type = 'all'
      or (p.day_type = 'weekdays' and j.iso_dow between 1 and 5)
      or (p.day_type = 'weekends' and j.iso_dow in (6, 7))
    )
),
shaped_hourly as (
  select *
  from (
    select
      f.*,
      row_number() over (partition by f.anchor_dt, f.period order by f.load_mw desc nulls last, f.datetime_beginning_ept) as peak_rank,
      (select load_shape from params) as load_shape
    from filtered_hourly f
  ) ranked
  where load_shape <> 'peak' or peak_rank = 1
),
daily as (
  select
    anchor_dt,
    dt,
    mm_dd,
    case when (select load_shape from params) = 'peak' then max(load_mw) else avg(load_mw) end as load_mw,
    avg(temp_f) as avg_temp_f,
    avg(feels_like_f) as avg_feels_like_f,
    count(*) as hour_count,
    count(*) filter (where source = 'metered_unverified') as unverified_hours,
    count(*) filter (where source = 'prelim') as prelim_hours,
    max(period) as period
  from shaped_hourly
  group by anchor_dt, dt, mm_dd, period
),
paired as (
  select
    c.mm_dd,
    c.dt as current_dt,
    ly.dt as last_year_dt,
    c.load_mw as current_load_mw,
    ly.load_mw as last_year_load_mw,
    c.avg_temp_f as current_temp_f,
    ly.avg_temp_f as last_year_temp_f,
    c.avg_feels_like_f as current_feels_like_f,
    ly.avg_feels_like_f as last_year_feels_like_f,
    c.hour_count as current_hour_count,
    ly.hour_count as last_year_hour_count,
    c.unverified_hours as current_unverified_hours,
    c.prelim_hours as current_prelim_hours,
    ly.unverified_hours as last_year_unverified_hours,
    ly.prelim_hours as last_year_prelim_hours
  from daily c
  join daily ly
    on ly.anchor_dt = c.anchor_dt
   and ly.period = 'last_year'
  where c.period = 'current'
)
select
  mm_dd,
  to_char(current_dt, 'YYYY-MM-DD') as current_date,
  to_char(last_year_dt, 'YYYY-MM-DD') as last_year_date,
  current_load_mw,
  last_year_load_mw,
  current_load_mw - last_year_load_mw as diff_mw,
  ((current_load_mw / nullif(last_year_load_mw, 0)) - 1) * 100 as growth_pct,
  current_temp_f,
  last_year_temp_f,
  current_feels_like_f,
  last_year_feels_like_f,
  current_hour_count,
  last_year_hour_count,
  current_unverified_hours,
  current_prelim_hours,
  last_year_unverified_hours,
  last_year_prelim_hours
from paired
order by current_dt desc
`;

const DAILY_RANGE_SQL = `
with params as (
  select
    $1::text as load_area,
    $2::text as station_id,
    $3::text as region,
    $4::int as lookback_days,
    coalesce($5::date, current_date)::date as as_of_date,
    $6::text as load_shape,
    $7::text as day_type,
    $8::text as date_mode,
    $9::date as requested_start,
    $10::date as requested_end,
    $11::int as selected_month,
    $12::int[] as selected_years
),
range_bounds as (
  select
    *,
    least(coalesce(requested_start, as_of_date - (lookback_days * interval '1 day')), coalesce(requested_end, as_of_date - interval '1 day'))::date as range_start,
    greatest(coalesce(requested_start, as_of_date - (lookback_days * interval '1 day')), coalesce(requested_end, as_of_date - interval '1 day'))::date as range_end
  from params
),
window_base as (
  select
    load_area,
    station_id,
    region,
    lookback_days,
    load_shape,
    day_type,
    case
      when date_mode = 'range' then greatest(range_start, (range_end - interval '${MAX_DATE_RANGE_DAYS - 1} days')::date)
      else (as_of_date - (lookback_days * interval '1 day'))::date
    end as current_start,
    case
      when date_mode = 'range' then (range_end + interval '1 day')::date
      else as_of_date
    end as current_end
  from range_bounds
),
windows as (
  select
    *,
    (current_start - interval '1 year')::date as last_year_start,
    (current_end - interval '1 year')::date as last_year_end
  from window_base
),
load_candidates as (
  select
    m.datetime_beginning_ept::date as anchor_dt,
    'current'::text as period,
    m.datetime_beginning_ept,
    m.mw::float8 as load_mw,
    'metered_unverified' as source,
    1 as priority
  from pjm.hrl_load_metered m
  cross join windows w
  where m.is_verified = false
    and m.load_area = w.load_area
    and m.datetime_beginning_ept >= w.current_start
    and m.datetime_beginning_ept < w.current_end
  union all
  select
    (m.datetime_beginning_ept + interval '1 year')::date as anchor_dt,
    'last_year'::text as period,
    m.datetime_beginning_ept,
    m.mw::float8 as load_mw,
    'metered_unverified' as source,
    1 as priority
  from pjm.hrl_load_metered m
  cross join windows w
  where m.is_verified = false
    and m.load_area = w.load_area
    and m.datetime_beginning_ept >= w.last_year_start
    and m.datetime_beginning_ept < w.last_year_end
  union all
  select
    p.datetime_beginning_ept::date as anchor_dt,
    'current'::text as period,
    p.datetime_beginning_ept,
    p.prelim_load_avg_hourly::float8 as load_mw,
    'prelim' as source,
    2 as priority
  from pjm.hrl_load_prelim p
  cross join windows w
  where p.load_area = w.load_area
    and p.datetime_beginning_ept >= w.current_start
    and p.datetime_beginning_ept < w.current_end
  union all
  select
    (p.datetime_beginning_ept + interval '1 year')::date as anchor_dt,
    'last_year'::text as period,
    p.datetime_beginning_ept,
    p.prelim_load_avg_hourly::float8 as load_mw,
    'prelim' as source,
    2 as priority
  from pjm.hrl_load_prelim p
  cross join windows w
  where p.load_area = w.load_area
    and p.datetime_beginning_ept >= w.last_year_start
    and p.datetime_beginning_ept < w.last_year_end
),
load_hourly as (
  select *
  from (
    select
      *,
      row_number() over (partition by anchor_dt, period, datetime_beginning_ept order by priority) as rn
    from load_candidates
  ) ranked
  where rn = 1
),
weather_hourly as (
  select
    wobs.observation_time_local::date as anchor_dt,
    'current'::text as period,
    wobs.observation_time_local,
    max(wobs.station_name) as station_name,
    avg(wobs.temp_f::float8) as temp_f,
    avg(wobs.feels_like_f::float8) as feels_like_f
  from weather.wsi_hourly_observed_temperatures wobs
  cross join windows w
  where wobs.station_id = w.station_id
    and wobs.region = w.region
    and wobs.observation_time_local >= w.current_start
    and wobs.observation_time_local < w.current_end
  group by wobs.observation_time_local
  union all
  select
    (wobs.observation_time_local + interval '1 year')::date as anchor_dt,
    'last_year'::text as period,
    wobs.observation_time_local,
    max(wobs.station_name) as station_name,
    avg(wobs.temp_f::float8) as temp_f,
    avg(wobs.feels_like_f::float8) as feels_like_f
  from weather.wsi_hourly_observed_temperatures wobs
  cross join windows w
  where wobs.station_id = w.station_id
    and wobs.region = w.region
    and wobs.observation_time_local >= w.last_year_start
    and wobs.observation_time_local < w.last_year_end
  group by wobs.observation_time_local
),
joined_hourly as (
  select
    l.anchor_dt,
    l.datetime_beginning_ept,
    l.datetime_beginning_ept::date as dt,
    to_char(l.anchor_dt, 'MM-DD') as mm_dd,
    extract(hour from l.datetime_beginning_ept)::int + 1 as hour_ending,
    extract(isodow from l.datetime_beginning_ept)::int as iso_dow,
    l.load_mw,
    l.source,
    w.temp_f,
    w.feels_like_f,
    l.period
  from load_hourly l
  join weather_hourly w
    on w.anchor_dt = l.anchor_dt
   and w.period = l.period
   and w.observation_time_local = l.datetime_beginning_ept
),
filtered_hourly as (
  select j.*
  from joined_hourly j
  cross join windows w
  where (
      w.load_shape in ('flat', 'peak')
      or (w.load_shape = 'onpeak' and j.hour_ending between 8 and 23)
      or (w.load_shape = 'offpeak' and (j.hour_ending between 1 and 7 or j.hour_ending = 24))
    )
    and (
      w.day_type = 'all'
      or (w.day_type = 'weekdays' and j.iso_dow between 1 and 5)
      or (w.day_type = 'weekends' and j.iso_dow in (6, 7))
    )
),
shaped_hourly as (
  select *
  from (
    select
      f.*,
      row_number() over (partition by f.anchor_dt, f.period order by f.load_mw desc nulls last, f.datetime_beginning_ept) as peak_rank,
      (select load_shape from windows) as load_shape
    from filtered_hourly f
  ) ranked
  where load_shape <> 'peak' or peak_rank = 1
),
daily as (
  select
    anchor_dt,
    dt,
    mm_dd,
    case when (select load_shape from windows) = 'peak' then max(load_mw) else avg(load_mw) end as load_mw,
    avg(temp_f) as avg_temp_f,
    avg(feels_like_f) as avg_feels_like_f,
    count(*) as hour_count,
    count(*) filter (where source = 'metered_unverified') as unverified_hours,
    count(*) filter (where source = 'prelim') as prelim_hours,
    max(period) as period
  from shaped_hourly
  group by anchor_dt, dt, mm_dd, period
),
paired as (
  select
    c.mm_dd,
    c.dt as current_dt,
    ly.dt as last_year_dt,
    c.load_mw as current_load_mw,
    ly.load_mw as last_year_load_mw,
    c.avg_temp_f as current_temp_f,
    ly.avg_temp_f as last_year_temp_f,
    c.avg_feels_like_f as current_feels_like_f,
    ly.avg_feels_like_f as last_year_feels_like_f,
    c.hour_count as current_hour_count,
    ly.hour_count as last_year_hour_count,
    c.unverified_hours as current_unverified_hours,
    c.prelim_hours as current_prelim_hours,
    ly.unverified_hours as last_year_unverified_hours,
    ly.prelim_hours as last_year_prelim_hours
  from daily c
  join daily ly
    on ly.anchor_dt = c.anchor_dt
   and ly.period = 'last_year'
  where c.period = 'current'
)
select
  mm_dd,
  to_char(current_dt, 'YYYY-MM-DD') as current_date,
  to_char(last_year_dt, 'YYYY-MM-DD') as last_year_date,
  current_load_mw,
  last_year_load_mw,
  current_load_mw - last_year_load_mw as diff_mw,
  ((current_load_mw / nullif(last_year_load_mw, 0)) - 1) * 100 as growth_pct,
  current_temp_f,
  last_year_temp_f,
  current_feels_like_f,
  last_year_feels_like_f,
  current_hour_count,
  last_year_hour_count,
  current_unverified_hours,
  current_prelim_hours,
  last_year_unverified_hours,
  last_year_prelim_hours
from paired
order by current_dt desc
`;

const COVERAGE_SQL = `
with params as (
  select
    $1::text as load_area,
    $2::text as station_id,
    $3::text as region,
    $4::int as lookback_days,
    coalesce($5::date, current_date)::date as as_of_date,
    $6::text as date_mode,
    $7::date as requested_start,
    $8::date as requested_end,
    $9::int as selected_month,
    $10::int[] as selected_years
),
range_bounds as (
  select
    *,
    least(coalesce(requested_start, as_of_date - (lookback_days * interval '1 day')), coalesce(requested_end, as_of_date - interval '1 day'))::date as range_start,
    greatest(coalesce(requested_start, as_of_date - (lookback_days * interval '1 day')), coalesce(requested_end, as_of_date - interval '1 day'))::date as range_end
  from params
),
target_dates_raw as (
  select gs::date as target_dt
  from range_bounds p
  cross join lateral generate_series(
    case
      when p.date_mode = 'range' then greatest(p.range_start, (p.range_end - interval '${MAX_DATE_RANGE_DAYS - 1} days')::date)
      else (p.as_of_date - (p.lookback_days * interval '1 day'))::date
    end,
    case
      when p.date_mode = 'range' then p.range_end
      else (p.as_of_date - interval '1 day')::date
    end,
    interval '1 day'
  ) gs
  where p.date_mode in ('lookback', 'range')
  union all
  select gs::date as target_dt
  from params p
  cross join lateral unnest(p.selected_years) selected_year
  cross join lateral generate_series(
    make_date(selected_year, p.selected_month, 1),
    (make_date(selected_year, p.selected_month, 1) + interval '1 month - 1 day')::date,
    interval '1 day'
  ) gs
  where p.date_mode = 'month-years'
),
target_dates as (
  select distinct target_dt
  from target_dates_raw
  order by target_dt
  limit ${MAX_DATE_RANGE_DAYS * 2}
),
windows as (
  select
    p.load_area,
    p.station_id,
    p.region,
    min(t.target_dt)::date as current_start,
    (max(t.target_dt) + interval '1 day')::date as current_end,
    min((t.target_dt - interval '1 year')::date) as last_year_start,
    (max((t.target_dt - interval '1 year')::date) + interval '1 day')::date as last_year_end
  from params p
  left join target_dates t on true
  group by p.load_area, p.station_id, p.region
),
load_coverage as (
  select
    min(datetime_beginning_ept) as load_min_ept,
    max(datetime_beginning_ept) as load_max_ept
  from (
    select m.datetime_beginning_ept
    from pjm.hrl_load_metered m
    join windows w
      on m.datetime_beginning_ept >= w.last_year_start
     and m.datetime_beginning_ept < w.current_end
    where m.load_area = $1
    union all
    select p.datetime_beginning_ept
    from pjm.hrl_load_prelim p
    join windows w
      on p.datetime_beginning_ept >= w.last_year_start
     and p.datetime_beginning_ept < w.current_end
    where p.load_area = $1
  ) l
),
weather_coverage as (
  select
    max(wobs.station_name) as station_name,
    min(wobs.observation_time_local) as weather_min_local,
    max(wobs.observation_time_local) as weather_max_local
  from weather.wsi_hourly_observed_temperatures wobs
  join windows w
    on wobs.observation_time_local >= w.last_year_start
   and wobs.observation_time_local < w.current_end
  where wobs.station_id = $2
    and wobs.region = $3
)
select
  w.load_area,
  w.station_id,
  wc.station_name,
  w.region,
  to_char(w.current_start, 'YYYY-MM-DD') as current_start,
  to_char(w.current_end, 'YYYY-MM-DD') as current_end_exclusive,
  to_char(w.last_year_start, 'YYYY-MM-DD') as last_year_start,
  to_char(w.last_year_end, 'YYYY-MM-DD') as last_year_end_exclusive,
  to_char(lc.load_min_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as load_min_ept,
  to_char(lc.load_max_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as load_max_ept,
  to_char(wc.weather_min_local, 'YYYY-MM-DD"T"HH24:MI:SS') as weather_min_local,
  to_char(wc.weather_max_local, 'YYYY-MM-DD"T"HH24:MI:SS') as weather_max_local
from windows w, load_coverage lc, weather_coverage wc
`;

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const requestedLoadArea = parseIdentifier(searchParams.get("loadArea"), DEFAULT_LOAD_AREA);
  const requestedStationId = parseIdentifier(searchParams.get("stationId"), DEFAULT_STATION_ID);
  const region = parseIdentifier(searchParams.get("region"), DEFAULT_REGION);
  const lookbackDays = parseLookbackDays(searchParams.get("lookbackDays"));
  const asOfDate = parseDate(searchParams.get("asOfDate"));
  const loadShape = parseLoadShape(searchParams.get("loadShape"));
  const dayType = parseDayType(searchParams.get("dayType"));
  const dateMode = parseDateMode(searchParams.get("dateMode"));
  const startDate = parseDate(searchParams.get("start"));
  const endDate = parseDate(searchParams.get("end"));
  const selectedMonth = parseMonth(searchParams.get("month"));
  const selectedYears = parseYears(searchParams.get("years"));
  const [areaRows, stationRows] = await Promise.all([loadAreas(), weatherStations(region)]);
  const areaNames = areaRows.map((row) => row.load_area);
  const loadArea = areaNames.includes(requestedLoadArea)
    ? requestedLoadArea
    : areaNames.includes(DEFAULT_LOAD_AREA)
      ? DEFAULT_LOAD_AREA
      : areaNames[0] ?? requestedLoadArea;
  const stationIds = stationRows.map((row) => row.station_id);
  const stationId = stationIds.includes(requestedStationId)
    ? requestedStationId
    : stationIds.includes(DEFAULT_STATION_ID)
      ? DEFAULT_STATION_ID
      : stationIds[0] ?? requestedStationId;
  const params = [
    loadArea,
    stationId,
    region,
    lookbackDays,
    asOfDate,
    loadShape,
    dayType,
    dateMode,
    startDate,
    endDate,
    selectedMonth,
    selectedYears,
  ];
  const coverageParams = [
    loadArea,
    stationId,
    region,
    lookbackDays,
    asOfDate,
    dateMode,
    startDate,
    endDate,
    selectedMonth,
    selectedYears,
  ];

  const dailySql = dateMode === "month-years" ? DAILY_SQL : DAILY_RANGE_SQL;
  const [dailyRows, coverageRows] = await Promise.all([
    query<DailyYoyRow>(dailySql, params),
    query<CoverageRow>(COVERAGE_SQL, coverageParams),
  ]);
  const coverage = coverageRows[0];
  const runAt = new Date().toISOString();
  const currentAvgLoadMw = avgNumbers(dailyRows, (row) => row.current_load_mw);
  const lastYearAvgLoadMw = avgNumbers(dailyRows, (row) => row.last_year_load_mw);
  const avgLoadGrowthPct =
    currentAvgLoadMw !== null && lastYearAvgLoadMw !== null && lastYearAvgLoadMw !== 0
      ? ((currentAvgLoadMw / lastYearAvgLoadMw) - 1) * 100
      : null;

  const payload = {
    iso: "pjm",
    source: "metered_unverified_then_prelim",
    selected: {
      loadArea,
      stationId,
      stationName: coverage?.station_name ?? stationId,
      region,
      lookbackDays,
      asOfDate: asOfDate ?? null,
      dateMode,
      startDate,
      endDate,
      month: selectedMonth,
      years: selectedYears,
      loadShape,
      dayType,
    },
    availableAreas: areaRows.map((row) => ({
      area: row.load_area,
      rowCount: Math.trunc(toNumber(row.row_count) ?? 0),
      minEpt: isoLocal(row.min_ept),
      maxEpt: isoLocal(row.max_ept),
    })),
    weatherStations: stationRows.map((station) => ({
      stationId: station.station_id,
      stationName: station.station_name ?? station.station_id,
      region: station.region,
    })),
    windows: {
      currentStart: coverage?.current_start ?? null,
      currentEndExclusive: coverage?.current_end_exclusive ?? null,
      lastYearStart: coverage?.last_year_start ?? null,
      lastYearEndExclusive: coverage?.last_year_end_exclusive ?? null,
    },
    coverage: {
      loadMinEpt: coverage?.load_min_ept ?? null,
      loadMaxEpt: coverage?.load_max_ept ?? null,
      weatherMinLocal: coverage?.weather_min_local ?? null,
      weatherMaxLocal: coverage?.weather_max_local ?? null,
    },
    freshness: {
      status: dailyRows.length >= lookbackDays ? "Ready" : "Partial",
      runAt,
      reason:
        dailyRows.length >= lookbackDays
          ? null
          : `Only ${dailyRows.length} paired daily rows are available for the ${lookbackDays}-day request.`,
    },
    summary: {
      matchedDays: dailyRows.length,
      currentAvgLoadMw,
      lastYearAvgLoadMw,
      avgLoadDiffMw:
        currentAvgLoadMw !== null && lastYearAvgLoadMw !== null ? currentAvgLoadMw - lastYearAvgLoadMw : null,
      avgLoadGrowthPct,
      currentAvgTempF: avgNumbers(dailyRows, (row) => row.current_temp_f),
      lastYearAvgTempF: avgNumbers(dailyRows, (row) => row.last_year_temp_f),
      currentAvgFeelsLikeF: avgNumbers(dailyRows, (row) => row.current_feels_like_f),
      lastYearAvgFeelsLikeF: avgNumbers(dailyRows, (row) => row.last_year_feels_like_f),
      currentHourCount: sumNumbers(dailyRows, (row) => row.current_hour_count),
      lastYearHourCount: sumNumbers(dailyRows, (row) => row.last_year_hour_count),
      currentUnverifiedHours: sumNumbers(dailyRows, (row) => row.current_unverified_hours),
      currentPrelimHours: sumNumbers(dailyRows, (row) => row.current_prelim_hours),
      lastYearUnverifiedHours: sumNumbers(dailyRows, (row) => row.last_year_unverified_hours),
      lastYearPrelimHours: sumNumbers(dailyRows, (row) => row.last_year_prelim_hours),
    },
    daily: dailyRows.map((row) => ({
      mmDd: row.mm_dd,
      currentDate: isoDate(row.current_date),
      lastYearDate: isoDate(row.last_year_date),
      currentLoadMw: toNumber(row.current_load_mw),
      lastYearLoadMw: toNumber(row.last_year_load_mw),
      diffMw: toNumber(row.diff_mw),
      growthPct: toNumber(row.growth_pct),
      currentTempF: toNumber(row.current_temp_f),
      lastYearTempF: toNumber(row.last_year_temp_f),
      currentFeelsLikeF: toNumber(row.current_feels_like_f),
      lastYearFeelsLikeF: toNumber(row.last_year_feels_like_f),
      currentHourCount: Math.trunc(toNumber(row.current_hour_count) ?? 0),
      lastYearHourCount: Math.trunc(toNumber(row.last_year_hour_count) ?? 0),
      currentUnverifiedHours: Math.trunc(toNumber(row.current_unverified_hours) ?? 0),
      currentPrelimHours: Math.trunc(toNumber(row.current_prelim_hours) ?? 0),
      lastYearUnverifiedHours: Math.trunc(toNumber(row.last_year_unverified_hours) ?? 0),
      lastYearPrelimHours: Math.trunc(toNumber(row.last_year_prelim_hours) ?? 0),
    })),
  };

  return {
    payload,
    headers: { "Cache-Control": CACHE_HEADER, "X-Pjm-Load-Growth-Yoy-Cache": "MISS" },
    rowCount: dailyRows.length,
    dataAsOf: payload.windows.currentEndExclusive ?? "empty",
  };
});
