import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";
import { buildIcePhysicalGasNonTradingDaysValuesSql } from "@/lib/tradingCalendars";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const LOOKBACK_DAYS = 45;
const DEFAULT_SCATTER_LOOKBACK_DAYS = 30;
const MIN_SCATTER_LOOKBACK_DAYS = 7;
const MAX_SCATTER_LOOKBACK_DAYS = 90;
const DEFAULT_HUB = "WESTERN HUB";
const TETCO_M3_SYMBOL = "XZR D1-IPG";
const LOAD_AREAS = [
  "AEP",
  "AP",
  "ATSI",
  "DAY",
  "DEOK",
  "DOM",
  "DUQ",
  "EKPC",
  "MIDATL",
  "NI",
] as const;
const REPORT_HUBS = [
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

const ROUTE_CONFIG = {
  route: "/api/pjm-price-view",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "Local-dev PJM hourly net-load and price views",
  p95TargetMs: 2_500,
  freshnessSource:
    "pjm.hrl_load_metered, pjm.hrl_load_prelim, pjm.gen_by_fuel, pjm.rt_hrl_lmps, pjm.da_hrl_lmps, ice_python.settlements updated_at",
} as const;

type ReportHub = (typeof REPORT_HUBS)[number];
type PriceViewMode = "matrix" | "da-net-load-scatter";
type ScatterDateMode = "latest" | "month-years";

interface MatrixRow {
  payload: PriceViewPayload | string | null;
}

interface PriceViewPayload {
  selectedDate?: string | null;
  requestedDate?: string | null;
  defaultDate?: string | null;
  availableDates?: string[] | null;
  asOf?: string | null;
  rowCount?: number | string | null;
  source?: string | null;
  formula?: string | null;
  rows?: Array<{
    metric: string;
    dataSource: string;
    verified: string;
    note: string;
    values: Array<number | string | null>;
  }> | null;
  selectedHours?: Array<{
    he: number | string | null;
    netLoadGw: number | string | null;
    rtPrice: number | string | null;
    tetcoM3Gas?: number | string | null;
    heatRate?: number | string | null;
    gasDay?: string | null;
    gasTradeDate?: string | null;
  }> | null;
}

interface DaNetLoadScatterRow {
  operating_date: string;
  datetime_beginning_ept: string;
  hour_ending: number | string | null;
  da_lmp: number | string | null;
  load_mw: number | string | null;
  wind_mw: number | string | null;
  solar_mw: number | string | null;
  net_load_mw: number | string | null;
  tetco_m3_gas: number | string | null;
  da_heat_rate: number | string | null;
  gas_day: string | null;
  gas_trade_date: string | null;
  load_data_source: string | null;
  load_source_status: string | null;
  row_as_of: string | null;
}

function parseDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseView(value: string | null): PriceViewMode {
  return value === "da-net-load-scatter" ? "da-net-load-scatter" : "matrix";
}

function parseLookbackDays(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed)) return DEFAULT_SCATTER_LOOKBACK_DAYS;
  return Math.min(Math.max(parsed, MIN_SCATTER_LOOKBACK_DAYS), MAX_SCATTER_LOOKBACK_DAYS);
}

function parseScatterDateMode(value: string | null): ScatterDateMode {
  return value === "month-years" ? "month-years" : "latest";
}

function parseHub(value: string | null): ReportHub {
  const normalized = value?.trim().toUpperCase();
  return REPORT_HUBS.find((hub) => hub === normalized) ?? DEFAULT_HUB;
}

function parseMonthList(value: string | null): number[] {
  const currentMonth = new Date().getMonth() + 1;
  const parsed = Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((item) => Number.parseInt(item.trim(), 10))
        .filter((item) => Number.isInteger(item) && item >= 1 && item <= 12),
    ),
  ).sort((left, right) => left - right);
  return parsed.length ? parsed : [currentMonth];
}

function parseYearList(value: string | null): number[] {
  const currentYear = new Date().getFullYear();
  const parsed = Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((item) => Number.parseInt(item.trim(), 10))
        .filter((item) => Number.isInteger(item) && item >= 2000 && item <= currentYear + 1),
    ),
  ).sort((left, right) => left - right);
  if (parsed.length) return parsed.slice(-8);
  return [currentYear - 1, currentYear];
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

function toInt(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: unknown, digits: number): number | null {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  const multiplier = 10 ** digits;
  return Math.round(parsed * multiplier) / multiplier;
}

const PRICE_VIEW_SQL = `
  with params as (
    select
      $1::date as requested_date,
      $2::text[] as load_areas,
      $3::int as lookback_days,
      $4::text as tetco_m3_symbol
  ),
  non_trading_days as (
${buildIcePhysicalGasNonTradingDaysValuesSql(2020, 2030)}
  ),
  date_window as (
    select
      (current_date - (select lookback_days from params) * interval '1 day')::date as start_date,
      current_date::date as end_date
  ),
  prelim_complete as (
    select
      datetime_beginning_ept::date as operating_date,
      count(*) as row_count,
      count(distinct load_area) as area_count,
      count(distinct datetime_beginning_ept) as hour_count
    from pjm.hrl_load_prelim
    cross join params p
    cross join date_window w
    where datetime_beginning_ept::date between w.start_date and w.end_date
      and load_area = any(p.load_areas)
      and prelim_load_avg_hourly is not null
    group by datetime_beginning_ept::date
    having count(*) = array_length((select load_areas from params), 1) * 24
       and count(distinct load_area) = array_length((select load_areas from params), 1)
       and count(distinct datetime_beginning_ept) = 24
  ),
  metered_ranked as (
    select
      datetime_beginning_ept::date as operating_date,
      datetime_beginning_ept,
      datetime_beginning_utc,
      extract(hour from datetime_beginning_ept)::int + 1 as he,
      mw::float8 as load_mw,
      is_verified,
      updated_at,
      row_number() over (
        partition by datetime_beginning_ept
        order by updated_at desc nulls last, is_verified desc
      ) as rn
    from pjm.hrl_load_metered
    cross join date_window w
    where datetime_beginning_ept::date between w.start_date and w.end_date
      and load_area = 'RTO'
      and mw is not null
  ),
  metered_hourly as (
    select
      operating_date,
      datetime_beginning_ept,
      datetime_beginning_utc,
      he,
      load_mw,
      is_verified,
      updated_at
    from metered_ranked
    where rn = 1
  ),
  metered_complete as (
    select
      operating_date,
      count(*) as row_count,
      count(distinct datetime_beginning_ept) as hour_count
    from metered_hourly
    group by operating_date
    having count(*) = 24
       and count(distinct datetime_beginning_ept) = 24
  ),
  fuel_complete as (
    select
      datetime_beginning_ept::date as operating_date,
      count(*) filter (where fuel_type = 'Wind') as wind_rows,
      count(*) filter (where fuel_type = 'Solar') as solar_rows
    from pjm.gen_by_fuel
    cross join date_window w
    where datetime_beginning_ept::date between w.start_date and w.end_date
      and fuel_type in ('Wind', 'Solar')
      and mw is not null
    group by datetime_beginning_ept::date
    having count(*) filter (where fuel_type = 'Wind') = 24
       and count(*) filter (where fuel_type = 'Solar') = 24
  ),
  rt_complete as (
    select
      datetime_beginning_ept::date as operating_date,
      count(*) as row_count
    from pjm.rt_hrl_lmps
    cross join date_window w
    where pnode_name = 'WESTERN HUB'
      and row_is_current = true
      and datetime_beginning_ept::date between w.start_date and w.end_date
      and total_lmp_rt is not null
    group by datetime_beginning_ept::date
    having count(*) = 24
  ),
  complete_dates as (
    select load_available.operating_date
    from (
      select
        coalesce(metered_complete.operating_date, prelim_complete.operating_date) as operating_date,
        case
          when metered_complete.operating_date is not null then 'metered'
          else 'prelim'
        end as load_source
      from metered_complete
      full outer join prelim_complete using (operating_date)
    ) load_available
    join fuel_complete using (operating_date)
    join rt_complete using (operating_date)
  ),
  load_source_by_date as (
    select
      coalesce(metered_complete.operating_date, prelim_complete.operating_date) as operating_date,
      case
        when metered_complete.operating_date is not null then 'metered'
        else 'prelim'
      end as load_source
    from metered_complete
    full outer join prelim_complete using (operating_date)
    join complete_dates
      on complete_dates.operating_date = coalesce(metered_complete.operating_date, prelim_complete.operating_date)
  ),
  selected_date as (
    select
      case
        when (select requested_date from params) in (select operating_date from complete_dates)
          then (select requested_date from params)
        else (select max(operating_date) from complete_dates)
      end as operating_date,
      (select max(operating_date) from complete_dates) as default_date
  ),
  prelim_hourly_all as (
    select
      datetime_beginning_ept::date as operating_date,
      datetime_beginning_ept,
      datetime_beginning_utc,
      extract(hour from datetime_beginning_ept)::int + 1 as he,
      sum(prelim_load_avg_hourly)::float8 as load_mw,
      max(updated_at) as updated_at
    from pjm.hrl_load_prelim
    cross join params p
    join complete_dates d
      on datetime_beginning_ept::date = d.operating_date
    where load_area = any(p.load_areas)
    group by datetime_beginning_ept::date, datetime_beginning_ept, datetime_beginning_utc
  ),
  load_hourly_all as (
    select
      m.operating_date,
      m.datetime_beginning_ept,
      m.datetime_beginning_utc,
      m.he,
      m.load_mw,
      'pjm.hrl_load_metered' as data_source,
      'Metered RTO' as source_status,
      case
        when bool_and(m.is_verified) over (partition by m.operating_date) then 'Latest load_area = RTO rows, verified, GW'
        else 'Latest load_area = RTO rows by updated_at, GW'
      end as source_note,
      m.updated_at
    from metered_hourly m
    join load_source_by_date s
      on s.operating_date = m.operating_date
     and s.load_source = 'metered'
    union all
    select
      p.operating_date,
      p.datetime_beginning_ept,
      p.datetime_beginning_utc,
      p.he,
      p.load_mw,
      'pjm.hrl_load_prelim' as data_source,
      'Prelim fallback' as source_status,
      'Summed component areas fallback, GW' as source_note,
      p.updated_at
    from prelim_hourly_all p
    join load_source_by_date s
      on s.operating_date = p.operating_date
     and s.load_source = 'prelim'
  ),
  fuel_hourly_all as (
    select
      datetime_beginning_ept::date as operating_date,
      datetime_beginning_ept,
      datetime_beginning_utc,
      extract(hour from datetime_beginning_ept)::int + 1 as he,
      sum(mw) filter (where fuel_type = 'Wind')::float8 as wind_mw,
      sum(mw) filter (where fuel_type = 'Solar')::float8 as solar_mw,
      max(updated_at) as updated_at
    from pjm.gen_by_fuel
    join complete_dates d
      on datetime_beginning_ept::date = d.operating_date
    where fuel_type in ('Wind', 'Solar')
    group by datetime_beginning_ept::date, datetime_beginning_ept, datetime_beginning_utc
  ),
  rt_hourly_all as (
    select
      datetime_beginning_ept::date as operating_date,
      datetime_beginning_ept,
      datetime_beginning_utc,
      total_lmp_rt::float8 as rt_lmp,
      updated_at
    from pjm.rt_hrl_lmps
    join complete_dates d
      on datetime_beginning_ept::date = d.operating_date
    where pnode_name = 'WESTERN HUB'
      and row_is_current = true
  ),
  gas_date_spine as (
    select distinct generate_series(
      (operating_date - interval '10 days')::date,
      (operating_date + interval '15 days')::date,
      interval '1 day'
    )::date as calendar_date
    from complete_dates
  ),
  gas_trading_days as (
    select calendar_date as trade_date
    from gas_date_spine
    where extract(dow from calendar_date) between 1 and 5
      and calendar_date not in (select non_trading_date from non_trading_days)
  ),
  tetco_source_prices as (
    select
      s.trade_date::date as trade_date,
      avg(s.vwap_close)::double precision as tetco_m3_gas,
      max(s.updated_at) as updated_at
    from ice_python.settlements s
    cross join params p
    where s.symbol = p.tetco_m3_symbol
      and s.trade_date::date in (select trade_date from gas_trading_days)
    group by s.trade_date::date
  ),
  aligned_tetco_prices as (
    select
      td.trade_date,
      p.tetco_m3_gas,
      p.updated_at
    from gas_trading_days td
    left join tetco_source_prices p
      on p.trade_date = td.trade_date
  ),
  grouped_tetco_prices as (
    select
      trade_date,
      tetco_m3_gas,
      updated_at,
      count(tetco_m3_gas) over (
        order by trade_date
        rows between unbounded preceding and current row
      ) as price_group
    from aligned_tetco_prices
  ),
  filled_tetco_prices as (
    select
      trade_date,
      max(tetco_m3_gas) over (partition by price_group)::double precision as tetco_m3_gas,
      max(updated_at) over (partition by price_group) as updated_at
    from grouped_tetco_prices
  ),
  gas_sessions as (
    select
      trade_date,
      lead(trade_date) over (order by trade_date) as next_trade_date
    from gas_trading_days
  ),
  gas_day_trade_dates as (
    select
      s.trade_date,
      gas_day::date as gas_day
    from gas_sessions s
    cross join lateral generate_series(
      (s.trade_date + interval '1 day')::date,
      coalesce(
        s.next_trade_date,
        case
          when extract(dow from s.trade_date) = 5
            then (s.trade_date + interval '3 days')::date
          else (s.trade_date + interval '1 day')::date
        end
      )::date,
      interval '1 day'
    ) as gas_day
  ),
  gas_hours as (
    select generate_series(1, 24) as gas_hour_ending
  ),
  tetco_hourly as (
    select
      (
        (
          g.gas_day
          + time '09:00:00'
          + ((h.gas_hour_ending - 1) * interval '1 hour')
        ) at time zone 'America/Chicago' at time zone 'UTC'
      ) as datetime_beginning_utc,
      g.gas_day as tetco_m3_gas_day,
      g.trade_date as tetco_m3_trade_date,
      p.tetco_m3_gas,
      p.updated_at as tetco_m3_updated_at
    from gas_day_trade_dates g
    cross join gas_hours h
    cross join date_window w
    left join filled_tetco_prices p
      on p.trade_date = g.trade_date
    where g.gas_day between (w.start_date - interval '1 day')::date and (w.end_date + interval '1 day')::date
  ),
  joined_all as (
    select
      l.operating_date,
      l.datetime_beginning_utc,
      l.he,
      l.load_mw,
      l.data_source as load_data_source,
      l.source_status as load_source_status,
      l.source_note as load_source_note,
      f.wind_mw,
      f.solar_mw,
      (l.load_mw - f.wind_mw - f.solar_mw)::float8 as net_load_mw,
      rt.rt_lmp,
      tg.tetco_m3_gas_day,
      tg.tetco_m3_trade_date,
      tg.tetco_m3_gas,
      case
        when tg.tetco_m3_gas > 0 then (rt.rt_lmp / tg.tetco_m3_gas)::float8
        else null
      end as heat_rate,
      greatest(l.updated_at, f.updated_at, rt.updated_at, tg.tetco_m3_updated_at) as row_as_of
    from load_hourly_all l
    join fuel_hourly_all f using (operating_date, datetime_beginning_ept, datetime_beginning_utc)
    join rt_hourly_all rt using (operating_date, datetime_beginning_ept, datetime_beginning_utc)
    left join tetco_hourly tg using (datetime_beginning_utc)
  ),
  joined as (
    select a.*
    from joined_all a
    join selected_date d
      on a.operating_date = d.operating_date
  ),
  long_rows as (
    select
      1 as sort_order,
      'Load' as metric,
      load_data_source as data_source,
      load_source_status as verified,
      load_source_note as note,
      he,
      load_mw / 1000.0 as value
    from joined
    union all
    select
      2,
      'Wind',
      'pjm.gen_by_fuel',
      'Actual',
      'fuel_type = Wind, GW',
      he,
      wind_mw / 1000.0
    from joined
    union all
    select
      3,
      'Solar',
      'pjm.gen_by_fuel',
      'Actual',
      'fuel_type = Solar, GW',
      he,
      solar_mw / 1000.0
    from joined
    union all
    select
      4,
      'Net Load',
      'derived',
      'Derived',
      'Load - wind - solar, GW',
      he,
      net_load_mw / 1000.0
    from joined
    union all
    select
      5,
      'RT LMP',
      'pjm.rt_hrl_lmps',
      'Verified RT',
      'WESTERN HUB total LMP, $/MWh',
      he,
      rt_lmp
    from joined
    union all
    select
      6,
      'Tetco M3 Gas',
      'ice_python.settlements',
      'ICE WVAP',
      'XZR D1-IPG vwap_close, $/MMBtu, hourly 09:00 CT gas-day strip',
      he,
      tetco_m3_gas
    from joined
    union all
    select
      7,
      'Heat Rate',
      'derived',
      'Derived',
      'Western Hub RT LMP / Tetco M3 WVAP Close, MMBtu/MWh',
      he,
      heat_rate
    from joined
  ),
  matrix_rows as (
    select
      sort_order,
      metric,
      data_source,
      verified,
      note,
      jsonb_agg(
        case
          when value is null then null
          when metric = 'Tetco M3 Gas' then round(value::numeric, 3)
          else round(value::numeric, 2)
        end
        order by he
      ) as values
    from long_rows
    group by sort_order, metric, data_source, verified, note
  ),
  stats as (
    select
      count(*) as hour_count,
      to_char(max(row_as_of), 'YYYY-MM-DD"T"HH24:MI:SSOF') as as_of
    from joined
  ),
  selected_hours as (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'he', he,
        'netLoadGw', round((net_load_mw / 1000.0)::numeric, 2),
        'rtPrice', round(rt_lmp::numeric, 2),
        'tetcoM3Gas', case when tetco_m3_gas is null then null else round(tetco_m3_gas::numeric, 3) end,
        'heatRate', case when heat_rate is null then null else round(heat_rate::numeric, 2) end,
        'gasDay', tetco_m3_gas_day::text,
        'gasTradeDate', tetco_m3_trade_date::text
      ) order by he),
      '[]'::jsonb
    ) as value
    from joined
  )
  select jsonb_build_object(
    'selectedDate', (select operating_date::text from selected_date),
    'requestedDate', (select requested_date::text from params),
    'defaultDate', (select default_date::text from selected_date),
    'availableDates', coalesce(
      (select jsonb_agg(operating_date::text order by operating_date desc) from complete_dates),
      '[]'::jsonb
    ),
    'asOf', (select as_of from stats),
    'rowCount', (select hour_count from stats),
    'source', 'pjm.hrl_load_metered RTO with pjm.hrl_load_prelim fallback + pjm.gen_by_fuel + pjm.rt_hrl_lmps + ice_python.settlements XZR D1-IPG',
    'formula', 'net_load_gw = selected load GW - gen_by_fuel Wind GW - gen_by_fuel Solar GW; heat_rate = Western Hub RT LMP / Tetco M3 WVAP Close',
    'rows', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'metric', metric,
        'dataSource', data_source,
        'verified', verified,
        'note', note,
        'values', values
      ) order by sort_order) from matrix_rows),
      '[]'::jsonb
    ),
    'selectedHours', (select value from selected_hours)
  ) as payload
`;

const DA_NET_LOAD_SCATTER_SQL = `
  with params as (
    select
      $1::int as complete_date_count,
      $2::text as hub,
      $3::text[] as load_areas,
      $4::int as scan_days,
      $5::text as date_mode,
      $6::int[] as selected_months,
      $7::int[] as selected_years,
      $8::text as tetco_m3_symbol
  ),
  non_trading_days as (
${buildIcePhysicalGasNonTradingDaysValuesSql(2020, 2030)}
  ),
  date_window as (
    select
      case
        when p.date_mode = 'month-years'
          then make_date((select min(year_value) from unnest(p.selected_years) as years(year_value)), 1, 1)
        else (current_date - p.scan_days * interval '1 day')::date
      end as start_date,
      case
        when p.date_mode = 'month-years'
          then make_date((select max(year_value) from unnest(p.selected_years) as years(year_value)), 12, 31)
        else current_date::date
      end as end_date
    from params p
  ),
  price_ranked as (
    select
      datetime_beginning_ept::date as operating_date,
      datetime_beginning_ept,
      datetime_beginning_utc,
      extract(hour from datetime_beginning_ept)::int + 1 as he,
      total_lmp_da::float8 as da_lmp,
      updated_at,
      row_number() over (
        partition by datetime_beginning_ept
        order by version_nbr desc, updated_at desc nulls last
      ) as rn
    from pjm.da_hrl_lmps
    cross join params p
    cross join date_window w
    where row_is_current = true
      and pnode_name = p.hub
      and datetime_beginning_ept::date between w.start_date and w.end_date
      and total_lmp_da is not null
  ),
  price_hourly as (
    select
      operating_date,
      datetime_beginning_ept,
      datetime_beginning_utc,
      he,
      da_lmp,
      updated_at
    from price_ranked
    where rn = 1
  ),
  price_complete as (
    select
      operating_date,
      count(*) as row_count,
      count(distinct datetime_beginning_ept) as hour_count
    from price_hourly
    group by operating_date
    having count(*) = 24
       and count(distinct datetime_beginning_ept) = 24
  ),
  metered_ranked as (
    select
      datetime_beginning_ept::date as operating_date,
      datetime_beginning_ept,
      datetime_beginning_utc,
      extract(hour from datetime_beginning_ept)::int + 1 as he,
      mw::float8 as load_mw,
      is_verified,
      updated_at,
      row_number() over (
        partition by datetime_beginning_ept
        order by updated_at desc nulls last, is_verified desc
      ) as rn
    from pjm.hrl_load_metered
    cross join date_window w
    where datetime_beginning_ept::date between w.start_date and w.end_date
      and load_area = 'RTO'
      and mw is not null
  ),
  metered_hourly as (
    select
      operating_date,
      datetime_beginning_ept,
      datetime_beginning_utc,
      he,
      load_mw,
      is_verified,
      updated_at
    from metered_ranked
    where rn = 1
  ),
  metered_complete as (
    select
      operating_date,
      count(*) as row_count,
      count(distinct datetime_beginning_ept) as hour_count
    from metered_hourly
    group by operating_date
    having count(*) = 24
       and count(distinct datetime_beginning_ept) = 24
  ),
  prelim_complete as (
    select
      datetime_beginning_ept::date as operating_date,
      count(*) as row_count,
      count(distinct load_area) as area_count,
      count(distinct datetime_beginning_ept) as hour_count
    from pjm.hrl_load_prelim
    cross join params p
    cross join date_window w
    where datetime_beginning_ept::date between w.start_date and w.end_date
      and load_area = any(p.load_areas)
      and prelim_load_avg_hourly is not null
    group by datetime_beginning_ept::date
    having count(*) = array_length((select load_areas from params), 1) * 24
       and count(distinct load_area) = array_length((select load_areas from params), 1)
       and count(distinct datetime_beginning_ept) = 24
  ),
  load_complete as (
    select
      coalesce(metered_complete.operating_date, prelim_complete.operating_date) as operating_date,
      case
        when metered_complete.operating_date is not null then 'metered'
        else 'prelim'
      end as load_source
    from metered_complete
    full outer join prelim_complete using (operating_date)
  ),
  fuel_hourly_all as (
    select
      datetime_beginning_ept::date as operating_date,
      datetime_beginning_ept,
      datetime_beginning_utc,
      extract(hour from datetime_beginning_ept)::int + 1 as he,
      sum(mw) filter (where fuel_type = 'Wind')::float8 as wind_mw,
      sum(mw) filter (where fuel_type = 'Solar')::float8 as solar_mw,
      max(updated_at) as updated_at
    from pjm.gen_by_fuel
    cross join date_window w
    where datetime_beginning_ept::date between w.start_date and w.end_date
      and fuel_type in ('Wind', 'Solar')
      and mw is not null
    group by datetime_beginning_ept::date, datetime_beginning_ept, datetime_beginning_utc
  ),
  fuel_complete as (
    select
      operating_date,
      count(*) as row_count
    from fuel_hourly_all
    where wind_mw is not null
      and solar_mw is not null
    group by operating_date
    having count(*) = 24
  ),
  complete_dates_ranked as (
    select
      p.operating_date,
      row_number() over (order by p.operating_date desc) as recent_rank
    from price_complete p
    join load_complete l using (operating_date)
    join fuel_complete f using (operating_date)
    cross join params cfg
    where cfg.date_mode <> 'month-years'
       or (
        extract(month from p.operating_date)::int = any(cfg.selected_months)
        and extract(year from p.operating_date)::int = any(cfg.selected_years)
      )
  ),
  complete_dates as (
    select d.operating_date
    from complete_dates_ranked d
    cross join params p
    where p.date_mode = 'month-years'
       or d.recent_rank <= p.complete_date_count
  ),
  load_source_by_date as (
    select l.operating_date, l.load_source
    from load_complete l
    join complete_dates d using (operating_date)
  ),
  prelim_hourly_all as (
    select
      datetime_beginning_ept::date as operating_date,
      datetime_beginning_ept,
      datetime_beginning_utc,
      extract(hour from datetime_beginning_ept)::int + 1 as he,
      sum(prelim_load_avg_hourly)::float8 as load_mw,
      max(updated_at) as updated_at
    from pjm.hrl_load_prelim
    cross join params p
    join complete_dates d
      on datetime_beginning_ept::date = d.operating_date
    where load_area = any(p.load_areas)
      and prelim_load_avg_hourly is not null
    group by datetime_beginning_ept::date, datetime_beginning_ept, datetime_beginning_utc
  ),
  load_hourly_all as (
    select
      m.operating_date,
      m.datetime_beginning_ept,
      m.datetime_beginning_utc,
      m.he,
      m.load_mw,
      'pjm.hrl_load_metered' as data_source,
      case
        when bool_and(m.is_verified) over (partition by m.operating_date) then 'Metered RTO verified'
        else 'Metered RTO latest'
      end as source_status,
      m.updated_at
    from metered_hourly m
    join load_source_by_date s
      on s.operating_date = m.operating_date
     and s.load_source = 'metered'
    union all
    select
      p.operating_date,
      p.datetime_beginning_ept,
      p.datetime_beginning_utc,
      p.he,
      p.load_mw,
      'pjm.hrl_load_prelim' as data_source,
      'Prelim component-area fallback' as source_status,
      p.updated_at
    from prelim_hourly_all p
    join load_source_by_date s
      on s.operating_date = p.operating_date
     and s.load_source = 'prelim'
  ),
  gas_calendar_bounds as (
    select
      (start_date - interval '10 days')::date as start_date,
      (end_date + interval '15 days')::date as end_date
    from date_window
  ),
  gas_date_spine as (
    select generate_series(start_date, end_date, interval '1 day')::date as calendar_date
    from gas_calendar_bounds
  ),
  gas_trading_days as (
    select calendar_date as trade_date
    from gas_date_spine
    where extract(dow from calendar_date) between 1 and 5
      and calendar_date not in (select non_trading_date from non_trading_days)
  ),
  tetco_source_prices as (
    select
      s.trade_date::date as trade_date,
      avg(s.vwap_close)::double precision as tetco_m3_gas,
      max(s.updated_at) as updated_at
    from ice_python.settlements s
    cross join params p
    cross join gas_calendar_bounds b
    where s.symbol = p.tetco_m3_symbol
      and s.trade_date::date between b.start_date and b.end_date
    group by s.trade_date::date
  ),
  aligned_tetco_prices as (
    select
      td.trade_date,
      p.tetco_m3_gas,
      p.updated_at
    from gas_trading_days td
    left join tetco_source_prices p
      on p.trade_date = td.trade_date
  ),
  grouped_tetco_prices as (
    select
      trade_date,
      tetco_m3_gas,
      updated_at,
      count(tetco_m3_gas) over (
        order by trade_date
        rows between unbounded preceding and current row
      ) as price_group
    from aligned_tetco_prices
  ),
  filled_tetco_prices as (
    select
      trade_date,
      max(tetco_m3_gas) over (partition by price_group)::double precision as tetco_m3_gas,
      max(updated_at) over (partition by price_group) as updated_at
    from grouped_tetco_prices
  ),
  gas_sessions as (
    select
      trade_date,
      lead(trade_date) over (order by trade_date) as next_trade_date
    from gas_trading_days
  ),
  gas_day_trade_dates as (
    select
      s.trade_date,
      gas_day::date as gas_day
    from gas_sessions s
    cross join lateral generate_series(
      (s.trade_date + interval '1 day')::date,
      coalesce(
        s.next_trade_date,
        case
          when extract(dow from s.trade_date) = 5
            then (s.trade_date + interval '3 days')::date
          else (s.trade_date + interval '1 day')::date
        end
      )::date,
      interval '1 day'
    ) as gas_day
  ),
  gas_hours as (
    select generate_series(1, 24) as gas_hour_ending
  ),
  tetco_hourly as (
    select
      (
        (
          g.gas_day
          + time '09:00:00'
          + ((h.gas_hour_ending - 1) * interval '1 hour')
        ) at time zone 'America/Chicago' at time zone 'UTC'
      ) as datetime_beginning_utc,
      g.gas_day as tetco_m3_gas_day,
      g.trade_date as tetco_m3_trade_date,
      p.tetco_m3_gas,
      p.updated_at as tetco_m3_updated_at
    from gas_day_trade_dates g
    cross join gas_hours h
    left join filled_tetco_prices p
      on p.trade_date = g.trade_date
    where exists (
      select 1
      from complete_dates d
      where g.gas_day between (d.operating_date - interval '1 day')::date
        and (d.operating_date + interval '1 day')::date
    )
  )
  select
    l.operating_date::text as operating_date,
    to_char(l.datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
    l.he as hour_ending,
    p.da_lmp,
    l.load_mw,
    f.wind_mw,
    f.solar_mw,
    (l.load_mw - f.wind_mw - f.solar_mw)::float8 as net_load_mw,
    tg.tetco_m3_gas,
    case
      when tg.tetco_m3_gas > 0 then (p.da_lmp / tg.tetco_m3_gas)::float8
      else null
    end as da_heat_rate,
    tg.tetco_m3_gas_day::text as gas_day,
    tg.tetco_m3_trade_date::text as gas_trade_date,
    l.data_source as load_data_source,
    l.source_status as load_source_status,
    to_char(greatest(l.updated_at, f.updated_at, p.updated_at, tg.tetco_m3_updated_at), 'YYYY-MM-DD"T"HH24:MI:SSOF') as row_as_of
  from load_hourly_all l
  join fuel_hourly_all f using (operating_date, datetime_beginning_ept, datetime_beginning_utc)
  join price_hourly p using (operating_date, datetime_beginning_ept, datetime_beginning_utc)
  join complete_dates d using (operating_date)
  left join tetco_hourly tg using (datetime_beginning_utc)
  order by l.operating_date, l.datetime_beginning_ept
`;

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const view = parseView(searchParams.get("view"));

  if (view === "da-net-load-scatter") {
    const lookbackDays = parseLookbackDays(searchParams.get("lookbackDays"));
    const hub = parseHub(searchParams.get("hub"));
    const dateMode = parseScatterDateMode(searchParams.get("dateMode"));
    const months = parseMonthList(searchParams.get("months"));
    const years = parseYearList(searchParams.get("years"));
    const scanDays = Math.max(lookbackDays * 4, 120);
    const rows = await query<DaNetLoadScatterRow>(DA_NET_LOAD_SCATTER_SQL, [
      lookbackDays,
      hub,
      LOAD_AREAS,
      scanDays,
      dateMode,
      months,
      years,
      TETCO_M3_SYMBOL,
    ]);
    const mappedRows = rows.map((row) => ({
      date: row.operating_date,
      datetimeBeginningEpt: row.datetime_beginning_ept,
      he: toInt(row.hour_ending),
      hub,
      daLmp: round(row.da_lmp, 2),
      westernHubDaLmp: round(row.da_lmp, 2),
      loadGw: round((toNumber(row.load_mw) ?? Number.NaN) / 1000, 2),
      windGw: round((toNumber(row.wind_mw) ?? Number.NaN) / 1000, 2),
      solarGw: round((toNumber(row.solar_mw) ?? Number.NaN) / 1000, 2),
      netLoadGw: round((toNumber(row.net_load_mw) ?? Number.NaN) / 1000, 2),
      tetcoM3Gas: round(row.tetco_m3_gas, 3),
      daHeatRate: round(row.da_heat_rate, 2),
      gasDay: row.gas_day,
      gasTradeDate: row.gas_trade_date,
      loadDataSource: row.load_data_source,
      loadSourceStatus: row.load_source_status,
      asOf: row.row_as_of,
    }));
    const asOf = mappedRows.reduce<string | null>(
      (best, row) => (row.asOf && (!best || row.asOf > best) ? row.asOf : best),
      null,
    );
    const dates = Array.from(new Set(mappedRows.map((row) => row.date)));

    if (!mappedRows.length) {
      return {
        status: 404,
        payload: {
          error: "No complete PJM DA net-load scatter dates are available",
          view,
          hub,
          lookbackDays,
          dateMode,
          months,
          years,
          availableHubs: REPORT_HUBS,
        },
        headers: { "Cache-Control": "no-store" },
        rowCount: 0,
      };
    }

    return {
      payload: {
        iso: "pjm",
        view,
        hub,
        lookbackDays,
        dateMode,
        months,
        years,
        availableHubs: REPORT_HUBS,
        startDate: dates[0] ?? null,
        endDate: dates[dates.length - 1] ?? null,
        completeDates: dates,
        asOf,
        source: "pjm.da_hrl_lmps + pjm.hrl_load_metered RTO with pjm.hrl_load_prelim fallback + pjm.gen_by_fuel + ice_python.settlements XZR D1-IPG",
        formula: "net_load_gw = (load_mw - wind_mw - solar_mw) / 1000; da_heat_rate = DA LMP / Tetco M3 WVAP Close",
        rows: mappedRows,
      },
      headers: { "Cache-Control": CACHE_HEADER },
      rowCount: mappedRows.length,
      dataAsOf: asOf,
    };
  }

  const date = parseDate(searchParams.get("date"));
  const [row] = await query<MatrixRow>(PRICE_VIEW_SQL, [date, LOAD_AREAS, LOOKBACK_DAYS, TETCO_M3_SYMBOL]);
  const payload = parseJsonField<PriceViewPayload | null>(row?.payload, null);

  if (!payload?.selectedDate || !payload.rows?.length) {
    return {
      status: 404,
      payload: {
        error: "No complete PJM price-view matrix date is available",
        requestedDate: date,
      },
      headers: { "Cache-Control": "no-store" },
      rowCount: 0,
    };
  }

  return {
    payload: {
      iso: "pjm",
      selectedDate: payload.selectedDate,
      requestedDate: payload.requestedDate,
      defaultDate: payload.defaultDate,
      availableDates: payload.availableDates ?? [],
      asOf: payload.asOf ?? null,
      source: payload.source,
      formula: payload.formula,
      rows: payload.rows,
      selectedHours: payload.selectedHours ?? [],
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: toInt(payload.rowCount),
    dataAsOf: payload.asOf ?? null,
  };
});

export async function GET(request: Request): Promise<Response> {
  if (!isLocalOnlyFeatureEnabled()) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return observedGET(request);
}
