import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isTightnessLookbackDevEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const PRICE_HUBS = ["WESTERN HUB", "EASTERN HUB", "AEP-DAYTON HUB"] as const;
const ROUTE_CONFIG = {
  route: "/api/pjm-tightness-lookback",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "Local-dev PJM system tightness lookback",
  p95TargetMs: 2_500,
  freshnessSource:
    "PJM hourly load, reserves, LMPs, constraints, interchange, generation, and outage source tables",
} as const;

interface AvailableDateRow {
  operating_date: string;
}

interface CoverageSourceRow {
  source_table: string;
  row_count: number | string;
  interval_count: number | string;
  min_ept: string | null;
  max_ept: string | null;
  latest_update_at: string | null;
}

interface HourlySourceRow {
  hour_ept: string;
  hour_utc: string | null;
  hour_ending: number | string;
  load_source: string | null;
  actual_load_mw: number | string | null;
  reserve_area: string | null;
  reserve_type: string | null;
  reserve_requirement_mw: number | string | null;
  reliability_requirement_mw: number | string | null;
  total_reserve_mw: number | string | null;
  reserve_deficit_mw: number | string | null;
  reserve_margin_mw: number | string | null;
  shortage_indicator: boolean | null;
  dispatched_reserve_mcp: number | string | null;
  reserve_market_service: string | null;
  reserve_market_locale: string | null;
  reserve_market_mcp: number | string | null;
  western_hub_rt_lmp: number | string | null;
  eastern_hub_rt_lmp: number | string | null;
  aep_dayton_hub_rt_lmp: number | string | null;
  western_hub_rt_lmp_max: number | string | null;
  rt_price_source: string | null;
  generation_mw: number | string | null;
  renewable_mw: number | string | null;
  eco_max_mw: number | string | null;
  emergency_max_mw: number | string | null;
  total_committed_mw: number | string | null;
  rt_ecomax_mw: number | string | null;
  self_ecomax_mw: number | string | null;
  interchange_actual_mw: number | string | null;
  interchange_scheduled_mw: number | string | null;
  interchange_source: string | null;
  constraint_count: number | string;
  max_shadow_price: number | string | null;
  top_constraint_name: string | null;
  top_contingency_name: string | null;
  row_as_of: string | null;
}

interface ConstraintSourceRow {
  monitored_facility: string;
  contingency_facility: string;
  intervals: number | string;
  first_ept: string | null;
  last_ept: string | null;
  max_shadow_price: number | string | null;
  total_abs_shadow_price: number | string | null;
  max_limit_control_percentage: number | string | null;
}

interface OutageSourceRow {
  source_table: string;
  forecast_execution_date: string | null;
  forecast_date: string | null;
  total_outages_mw: number | string | null;
  planned_outages_mw: number | string | null;
  maintenance_outages_mw: number | string | null;
  forced_outages_mw: number | string | null;
  forecast_gen_outage_mw_rto: number | string | null;
  forecast_gen_outage_mw_west: number | string | null;
  forecast_gen_outage_mw_other: number | string | null;
  updated_at: string | null;
}

function parseDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function yesterdayEptDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  const todayUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return new Date(todayUtc - 86_400_000).toISOString().slice(0, 10);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInt(value: unknown): number {
  const parsed = toNumber(value);
  return parsed === null ? 0 : Math.trunc(parsed);
}

function round(value: number | null, digits = 1): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isoLocal(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value === "-infinity" || value === "infinity") return null;
  return value.replace(" ", "T").replace(/\+\d\d(?::?\d\d)?$/, "").slice(0, 19);
}

function maxStamp(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function normalizeCoverage(row: CoverageSourceRow) {
  return {
    sourceTable: row.source_table,
    rowCount: toInt(row.row_count),
    intervalCount: toInt(row.interval_count),
    minEpt: isoLocal(row.min_ept),
    maxEpt: isoLocal(row.max_ept),
    latestUpdateAt: isoLocal(row.latest_update_at),
  };
}

function normalizeHourly(row: HourlySourceRow) {
  const actualLoadMw = round(toNumber(row.actual_load_mw));
  const reserveRequirementMw = round(toNumber(row.reserve_requirement_mw));
  const totalReserveMw = round(toNumber(row.total_reserve_mw));
  const reserveMarginMw = round(toNumber(row.reserve_margin_mw));
  const totalCommittedMw = round(toNumber(row.total_committed_mw));

  return {
    hourEpt: isoLocal(row.hour_ept),
    hourUtc: isoLocal(row.hour_utc),
    hourEnding: toInt(row.hour_ending),
    loadSource: row.load_source,
    actualLoadMw,
    reserveArea: row.reserve_area,
    reserveType: row.reserve_type,
    reserveRequirementMw,
    reliabilityRequirementMw: round(toNumber(row.reliability_requirement_mw)),
    totalReserveMw,
    reserveDeficitMw: round(toNumber(row.reserve_deficit_mw)),
    reserveMarginMw,
    shortageIndicator: row.shortage_indicator === true,
    dispatchedReserveMcp: round(toNumber(row.dispatched_reserve_mcp), 2),
    reserveMarketService: row.reserve_market_service,
    reserveMarketLocale: row.reserve_market_locale,
    reserveMarketMcp: round(toNumber(row.reserve_market_mcp), 2),
    westernHubRtLmp: round(toNumber(row.western_hub_rt_lmp), 2),
    easternHubRtLmp: round(toNumber(row.eastern_hub_rt_lmp), 2),
    aepDaytonHubRtLmp: round(toNumber(row.aep_dayton_hub_rt_lmp), 2),
    westernHubRtLmpMax: round(toNumber(row.western_hub_rt_lmp_max), 2),
    rtPriceSource: row.rt_price_source,
    generationMw: round(toNumber(row.generation_mw)),
    renewableMw: round(toNumber(row.renewable_mw)),
    ecoMaxMw: round(toNumber(row.eco_max_mw)),
    emergencyMaxMw: round(toNumber(row.emergency_max_mw)),
    totalCommittedMw,
    rtEcomaxMw: round(toNumber(row.rt_ecomax_mw)),
    selfEcomaxMw: round(toNumber(row.self_ecomax_mw)),
    loadToCommittedPct:
      actualLoadMw !== null && totalCommittedMw && totalCommittedMw !== 0
        ? round((actualLoadMw / totalCommittedMw) * 100, 2)
        : null,
    interchangeActualMw: round(toNumber(row.interchange_actual_mw)),
    interchangeScheduledMw: round(toNumber(row.interchange_scheduled_mw)),
    interchangeSource: row.interchange_source,
    constraintCount: toInt(row.constraint_count),
    maxShadowPrice: round(toNumber(row.max_shadow_price), 2),
    topConstraintName: row.top_constraint_name,
    topContingencyName: row.top_contingency_name,
    rowAsOf: isoLocal(row.row_as_of),
  };
}

function normalizeConstraint(row: ConstraintSourceRow) {
  return {
    monitoredFacility: row.monitored_facility,
    contingencyFacility: row.contingency_facility,
    intervals: toInt(row.intervals),
    firstEpt: isoLocal(row.first_ept),
    lastEpt: isoLocal(row.last_ept),
    maxShadowPrice: round(toNumber(row.max_shadow_price), 2),
    totalAbsShadowPrice: round(toNumber(row.total_abs_shadow_price), 2),
    maxLimitControlPercentage: round(toNumber(row.max_limit_control_percentage), 2),
  };
}

function normalizeOutage(row: OutageSourceRow) {
  const genOutagesByType = row.source_table === "pjm.gen_outages_by_type";
  return {
    sourceTable: row.source_table,
    forecastExecutionDate: row.forecast_execution_date,
    forecastDate: row.forecast_date,
    totalOutagesMw: round(
      genOutagesByType ? toNumber(row.total_outages_mw) : toNumber(row.forecast_gen_outage_mw_rto),
    ),
    plannedOutagesMw: round(toNumber(row.planned_outages_mw)),
    maintenanceOutagesMw: round(toNumber(row.maintenance_outages_mw)),
    forcedOutagesMw: round(toNumber(row.forced_outages_mw)),
    forecastGenOutageMwRto: round(toNumber(row.forecast_gen_outage_mw_rto)),
    forecastGenOutageMwWest: round(toNumber(row.forecast_gen_outage_mw_west)),
    forecastGenOutageMwOther: round(toNumber(row.forecast_gen_outage_mw_other)),
    updatedAt: isoLocal(row.updated_at),
  };
}

function maxBy<T>(rows: T[], valueOf: (row: T) => number | null): T | null {
  return rows.reduce<T | null>((best, row) => {
    const value = valueOf(row);
    if (value === null) return best;
    const bestValue = best ? valueOf(best) : null;
    return bestValue === null || value > bestValue ? row : best;
  }, null);
}

function minBy<T>(rows: T[], valueOf: (row: T) => number | null): T | null {
  return rows.reduce<T | null>((best, row) => {
    const value = valueOf(row);
    if (value === null) return best;
    const bestValue = best ? valueOf(best) : null;
    return bestValue === null || value < bestValue ? row : best;
  }, null);
}

const HOURLY_SQL = `
  with target_hours as (
    select generate_series(
      $1::date::timestamp,
      $1::date::timestamp + interval '23 hours',
      interval '1 hour'
    ) as hour_ept
  ),
  load_candidates as (
    select
      datetime_beginning_ept,
      datetime_beginning_utc,
      mw::float8 as actual_load_mw,
      updated_at,
      'metered_unverified'::text as load_source,
      1 as priority
    from pjm.hrl_load_metered
    where datetime_beginning_ept >= $1::date::timestamp
      and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
      and load_area = 'RTO'
      and is_verified = false
    union all
    select
      datetime_beginning_ept,
      datetime_beginning_utc,
      prelim_load_avg_hourly::float8 as actual_load_mw,
      updated_at,
      'prelim'::text as load_source,
      2 as priority
    from pjm.hrl_load_prelim
    where datetime_beginning_ept >= $1::date::timestamp
      and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
      and load_area = 'RTO'
  ),
  load_hourly as (
    select *
    from (
      select
        date_trunc('hour', datetime_beginning_ept) as hour_ept,
        datetime_beginning_utc,
        actual_load_mw,
        updated_at,
        load_source,
        row_number() over (
          partition by date_trunc('hour', datetime_beginning_ept)
          order by priority, updated_at desc nulls last
        ) as row_rank
      from load_candidates
    ) ranked
    where row_rank = 1
  ),
  reserve_ranked as (
    select
      date_trunc('hour', datetime_beginning_ept) as hour_ept,
      area,
      reserve_type,
      reserve_reqmt_mw::float8 as reserve_requirement_mw,
      reliability_reqmt_mw::float8 as reliability_requirement_mw,
      total_reserve_mw::float8 as total_reserve_mw,
      deficit_mw::float8 as reserve_deficit_mw,
      (total_reserve_mw - reserve_reqmt_mw)::float8 as reserve_margin_mw,
      updated_at,
      row_number() over (
        partition by date_trunc('hour', datetime_beginning_ept)
        order by
          coalesce(deficit_mw, 0) desc,
          (total_reserve_mw - reserve_reqmt_mw) asc nulls last,
          reserve_reqmt_mw desc nulls last,
          reserve_type
      ) as row_rank
    from pjm.rt_dispatch_reserves
    where datetime_beginning_ept >= $1::date::timestamp
      and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
  ),
  reserve_hourly as (
    select *
    from reserve_ranked
    where row_rank = 1
  ),
  dispatched_hourly as (
    select
      date_trunc('hour', datetime_beginning_ept) as hour_ept,
      bool_or(coalesce(shortage_indicator, false)) as shortage_indicator,
      max(market_clearing_price)::float8 as dispatched_reserve_mcp,
      max(updated_at) as updated_at
    from pjm.dispatched_reserves
    where datetime_beginning_ept >= $1::date::timestamp
      and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
    group by 1
  ),
  reserve_market_ranked as (
    select
      date_trunc('hour', datetime_beginning_ept) as hour_ept,
      service,
      locale,
      mcp::float8 as mcp,
      updated_at,
      row_number() over (
        partition by date_trunc('hour', datetime_beginning_ept)
        order by mcp desc nulls last, service, locale
      ) as row_rank
    from pjm.reserve_market_results
    where datetime_beginning_ept >= $1::date::timestamp
      and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
  ),
  reserve_market_hourly as (
    select *
    from reserve_market_ranked
    where row_rank = 1
  ),
  fivemin_prices as (
    select
      date_trunc('hour', datetime_beginning_ept) as hour_ept,
      pnode_name,
      avg(total_lmp_rt)::float8 as avg_lmp,
      max(total_lmp_rt)::float8 as max_lmp,
      max(updated_at) as updated_at,
      count(*) as source_intervals,
      1 as priority,
      'pjm.rt_fivemin_hrl_lmps'::text as source_table
    from pjm.rt_fivemin_hrl_lmps
    where datetime_beginning_ept >= $1::date::timestamp
      and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
      and row_is_current = true
      and pnode_name = any($2::text[])
    group by 1, 2
  ),
  unverified_prices as (
    select
      date_trunc('hour', datetime_beginning_ept) as hour_ept,
      pnode_name,
      avg(total_lmp_rt)::float8 as avg_lmp,
      max(total_lmp_rt)::float8 as max_lmp,
      max(updated_at) as updated_at,
      count(*) as source_intervals,
      2 as priority,
      'pjm.rt_unverified_hrl_lmps'::text as source_table
    from pjm.rt_unverified_hrl_lmps
    where datetime_beginning_ept >= $1::date::timestamp
      and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
      and pnode_name = any($2::text[])
    group by 1, 2
  ),
  price_selected as (
    select *
    from (
      select
        *,
        row_number() over (partition by hour_ept, pnode_name order by priority) as row_rank
      from (
        select * from fivemin_prices
        union all
        select * from unverified_prices
      ) price_candidates
    ) ranked
    where row_rank = 1
  ),
  price_hourly as (
    select
      hour_ept,
      max(avg_lmp) filter (where pnode_name = 'WESTERN HUB') as western_hub_rt_lmp,
      max(avg_lmp) filter (where pnode_name = 'EASTERN HUB') as eastern_hub_rt_lmp,
      max(avg_lmp) filter (where pnode_name = 'AEP-DAYTON HUB') as aep_dayton_hub_rt_lmp,
      max(max_lmp) filter (where pnode_name = 'WESTERN HUB') as western_hub_rt_lmp_max,
      min(source_table) as rt_price_source,
      max(updated_at) as updated_at
    from price_selected
    group by 1
  ),
  fuel_hourly as (
    select
      date_trunc('hour', datetime_beginning_ept) as hour_ept,
      sum(mw)::float8 as generation_mw,
      sum(mw) filter (where is_renewable is true)::float8 as renewable_mw,
      max(updated_at) as updated_at
    from pjm.gen_by_fuel
    where datetime_beginning_ept >= $1::date::timestamp
      and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
    group by 1
  ),
  capacity_hourly as (
    select
      date_trunc('hour', bid_datetime_beginning_ept) as hour_ept,
      max(eco_max)::float8 as eco_max_mw,
      max(emerg_max)::float8 as emergency_max_mw,
      max(total_committed)::float8 as total_committed_mw,
      max(updated_at) as updated_at
    from pjm.day_gen_capacity
    where bid_datetime_beginning_ept >= $1::date::timestamp
      and bid_datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
    group by 1
  ),
  ecomax_hourly as (
    select
      date_trunc('hour', datetime_beginning_ept) as hour_ept,
      max(rt_ecomax)::float8 as rt_ecomax_mw,
      max(self_ecomax)::float8 as self_ecomax_mw,
      max(updated_at) as updated_at
    from pjm.rt_and_self_ecomax
    where datetime_beginning_ept >= $1::date::timestamp
      and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
    group by 1
  ),
  tie_fivemin as (
    select
      date_trunc('hour', datetime_beginning_ept) as hour_ept,
      sum(actual_mw)::float8 as actual_mw,
      sum(scheduled_mw)::float8 as scheduled_mw,
      max(updated_at) as updated_at,
      count(distinct datetime_beginning_utc) as source_intervals,
      'pjm.five_min_tie_flows'::text as source_table
    from pjm.five_min_tie_flows
    where datetime_beginning_ept >= $1::date::timestamp
      and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
    group by 1
  ),
  tie_hourly as (
    select
      date_trunc('hour', datetime_beginning_ept) as hour_ept,
      sum(actual_flow)::float8 as actual_mw,
      sum(sched_flow)::float8 as scheduled_mw,
      max(updated_at) as updated_at,
      count(distinct datetime_beginning_utc) as source_intervals,
      'pjm.act_sch_interchange'::text as source_table
    from pjm.act_sch_interchange
    where datetime_beginning_ept >= $1::date::timestamp
      and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
    group by 1
  ),
  tie_selected as (
    select
      coalesce(f.hour_ept, h.hour_ept) as hour_ept,
      coalesce(f.actual_mw, h.actual_mw) as actual_mw,
      coalesce(f.scheduled_mw, h.scheduled_mw) as scheduled_mw,
      coalesce(f.updated_at, h.updated_at) as updated_at,
      case when f.hour_ept is not null then f.source_table else h.source_table end as source_table
    from tie_fivemin f
    full join tie_hourly h using (hour_ept)
  ),
  constraint_ranked as (
    select
      date_trunc('hour', datetime_beginning_ept) as hour_ept,
      monitored_facility,
      contingency_facility,
      shadow_price::float8 as shadow_price,
      updated_at,
      row_number() over (
        partition by date_trunc('hour', datetime_beginning_ept)
        order by abs(shadow_price) desc nulls last, monitored_facility, contingency_facility
      ) as row_rank,
      count(*) over (partition by date_trunc('hour', datetime_beginning_ept)) as constraint_count
    from pjm.rt_marginal_value
    where datetime_beginning_ept >= $1::date::timestamp
      and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
      and shadow_price is not null
      and abs(shadow_price) > 0
  ),
  constraint_hourly as (
    select
      hour_ept,
      max(constraint_count) as constraint_count,
      max(abs(shadow_price)) as max_shadow_price,
      max(monitored_facility) filter (where row_rank = 1) as top_constraint_name,
      max(contingency_facility) filter (where row_rank = 1) as top_contingency_name,
      max(updated_at) as updated_at
    from constraint_ranked
    group by 1
  )
  select
    to_char(h.hour_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as hour_ept,
    to_char(l.datetime_beginning_utc, 'YYYY-MM-DD"T"HH24:MI:SS') as hour_utc,
    (extract(hour from h.hour_ept)::int + 1) as hour_ending,
    l.load_source,
    l.actual_load_mw,
    r.area as reserve_area,
    r.reserve_type,
    r.reserve_requirement_mw,
    r.reliability_requirement_mw,
    r.total_reserve_mw,
    r.reserve_deficit_mw,
    r.reserve_margin_mw,
    d.shortage_indicator,
    d.dispatched_reserve_mcp,
    rm.service as reserve_market_service,
    rm.locale as reserve_market_locale,
    rm.mcp as reserve_market_mcp,
    p.western_hub_rt_lmp,
    p.eastern_hub_rt_lmp,
    p.aep_dayton_hub_rt_lmp,
    p.western_hub_rt_lmp_max,
    p.rt_price_source,
    f.generation_mw,
    f.renewable_mw,
    c.eco_max_mw,
    c.emergency_max_mw,
    c.total_committed_mw,
    e.rt_ecomax_mw,
    e.self_ecomax_mw,
    t.actual_mw as interchange_actual_mw,
    t.scheduled_mw as interchange_scheduled_mw,
    t.source_table as interchange_source,
    coalesce(ch.constraint_count, 0) as constraint_count,
    ch.max_shadow_price,
    ch.top_constraint_name,
    ch.top_contingency_name,
    to_char(greatest(
      coalesce(l.updated_at, '-infinity'::timestamptz),
      coalesce(r.updated_at, '-infinity'::timestamptz),
      coalesce(d.updated_at, '-infinity'::timestamptz),
      coalesce(rm.updated_at, '-infinity'::timestamptz),
      coalesce(p.updated_at, '-infinity'::timestamptz),
      coalesce(f.updated_at, '-infinity'::timestamptz),
      coalesce(c.updated_at, '-infinity'::timestamptz),
      coalesce(e.updated_at, '-infinity'::timestamptz),
      coalesce(t.updated_at, '-infinity'::timestamptz),
      coalesce(ch.updated_at, '-infinity'::timestamptz)
    ), 'YYYY-MM-DD"T"HH24:MI:SS') as row_as_of
  from target_hours h
  left join load_hourly l using (hour_ept)
  left join reserve_hourly r using (hour_ept)
  left join dispatched_hourly d using (hour_ept)
  left join reserve_market_hourly rm using (hour_ept)
  left join price_hourly p using (hour_ept)
  left join fuel_hourly f using (hour_ept)
  left join capacity_hourly c using (hour_ept)
  left join ecomax_hourly e using (hour_ept)
  left join tie_selected t using (hour_ept)
  left join constraint_hourly ch using (hour_ept)
  order by h.hour_ept
`;

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const requestedDate = parseDate(searchParams.get("date"));
  const defaultDate = yesterdayEptDate();
  const selectedDate = requestedDate ?? defaultDate;

  const [availableRows, coverageRows, hourlyRows, constraintRows, outageRows] =
    await Promise.all([
      query<AvailableDateRow>(
        `
          with dates as (
            select datetime_beginning_ept::date as operating_date
            from pjm.hrl_load_metered
            where load_area = 'RTO'
              and is_verified = false
              and datetime_beginning_ept >= current_date - interval '120 days'
            union
            select datetime_beginning_ept::date as operating_date
            from pjm.hrl_load_prelim
            where load_area = 'RTO'
              and datetime_beginning_ept >= current_date - interval '120 days'
            union
            select datetime_beginning_ept::date as operating_date
            from pjm.rt_dispatch_reserves
            where datetime_beginning_ept >= current_date - interval '120 days'
            union
            select datetime_beginning_ept::date as operating_date
            from pjm.rt_unverified_hrl_lmps
            where pnode_name = any($1::text[])
              and datetime_beginning_ept >= current_date - interval '120 days'
          )
          select operating_date::text as operating_date
          from dates
          where operating_date is not null
          order by operating_date desc
          limit 90
        `,
        [PRICE_HUBS],
      ),
      query<CoverageSourceRow>(
        `
          select 'pjm.hrl_load_metered' as source_table,
                 count(*) as row_count,
                 count(distinct datetime_beginning_utc) as interval_count,
                 to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as min_ept,
                 to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as max_ept,
                 to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as latest_update_at
          from pjm.hrl_load_metered
          where datetime_beginning_ept >= $1::date::timestamp
            and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
            and load_area = 'RTO'
            and is_verified = false
          union all
          select 'pjm.hrl_load_prelim',
                 count(*),
                 count(distinct datetime_beginning_utc),
                 to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS')
          from pjm.hrl_load_prelim
          where datetime_beginning_ept >= $1::date::timestamp
            and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
            and load_area = 'RTO'
          union all
          select 'pjm.rt_dispatch_reserves',
                 count(*),
                 count(distinct datetime_beginning_utc),
                 to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS')
          from pjm.rt_dispatch_reserves
          where datetime_beginning_ept >= $1::date::timestamp
            and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
          union all
          select 'pjm.dispatched_reserves',
                 count(*),
                 count(distinct datetime_beginning_utc),
                 to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS')
          from pjm.dispatched_reserves
          where datetime_beginning_ept >= $1::date::timestamp
            and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
          union all
          select 'pjm.reserve_market_results',
                 count(*),
                 count(distinct datetime_beginning_utc),
                 to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS')
          from pjm.reserve_market_results
          where datetime_beginning_ept >= $1::date::timestamp
            and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
          union all
          select 'pjm.rt_fivemin_hrl_lmps',
                 count(*),
                 count(distinct datetime_beginning_utc),
                 to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS')
          from pjm.rt_fivemin_hrl_lmps
          where datetime_beginning_ept >= $1::date::timestamp
            and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
            and row_is_current = true
            and pnode_name = any($2::text[])
          union all
          select 'pjm.rt_unverified_hrl_lmps',
                 count(*),
                 count(distinct datetime_beginning_utc),
                 to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS')
          from pjm.rt_unverified_hrl_lmps
          where datetime_beginning_ept >= $1::date::timestamp
            and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
            and pnode_name = any($2::text[])
          union all
          select 'pjm.rt_marginal_value',
                 count(*),
                 count(distinct datetime_beginning_utc),
                 to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS')
          from pjm.rt_marginal_value
          where datetime_beginning_ept >= $1::date::timestamp
            and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
          union all
          select 'pjm.five_min_tie_flows',
                 count(*),
                 count(distinct datetime_beginning_utc),
                 to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS')
          from pjm.five_min_tie_flows
          where datetime_beginning_ept >= $1::date::timestamp
            and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
          union all
          select 'pjm.gen_by_fuel',
                 count(*),
                 count(distinct datetime_beginning_utc),
                 to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
                 to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS')
          from pjm.gen_by_fuel
          where datetime_beginning_ept >= $1::date::timestamp
            and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
          order by source_table
        `,
        [selectedDate, PRICE_HUBS],
      ),
      query<HourlySourceRow>(HOURLY_SQL, [selectedDate, PRICE_HUBS]),
      query<ConstraintSourceRow>(
        `
          select
            monitored_facility,
            contingency_facility,
            count(*) as intervals,
            to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as first_ept,
            to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as last_ept,
            max(abs(shadow_price))::float8 as max_shadow_price,
            sum(abs(shadow_price))::float8 as total_abs_shadow_price,
            max(limit_control_percentage)::float8 as max_limit_control_percentage
          from pjm.rt_marginal_value
          where datetime_beginning_ept >= $1::date::timestamp
            and datetime_beginning_ept < ($1::date::timestamp + interval '1 day')
            and shadow_price is not null
            and abs(shadow_price) > 0
          group by monitored_facility, contingency_facility
          order by total_abs_shadow_price desc nulls last, max_shadow_price desc nulls last
          limit 15
        `,
        [selectedDate],
      ),
      query<OutageSourceRow>(
        `
          (
            select
              'pjm.gen_outages_by_type' as source_table,
              forecast_execution_date_ept::text as forecast_execution_date,
              forecast_date::text as forecast_date,
              total_outages_mw::float8 as total_outages_mw,
              planned_outages_mw::float8 as planned_outages_mw,
              maintenance_outages_mw::float8 as maintenance_outages_mw,
              forced_outages_mw::float8 as forced_outages_mw,
              null::float8 as forecast_gen_outage_mw_rto,
              null::float8 as forecast_gen_outage_mw_west,
              null::float8 as forecast_gen_outage_mw_other,
              to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
            from pjm.gen_outages_by_type
            where forecast_date = $1::date
              and region = 'PJM RTO'
            order by forecast_execution_date_ept desc
            limit 1
          )
          union all
          (
            select
              'pjm.frcstd_gen_outages' as source_table,
              forecast_execution_date_ept::text as forecast_execution_date,
              forecast_date::text as forecast_date,
              null::float8 as total_outages_mw,
              null::float8 as planned_outages_mw,
              null::float8 as maintenance_outages_mw,
              null::float8 as forced_outages_mw,
              forecast_gen_outage_mw_rto::float8 as forecast_gen_outage_mw_rto,
              forecast_gen_outage_mw_west::float8 as forecast_gen_outage_mw_west,
              forecast_gen_outage_mw_other::float8 as forecast_gen_outage_mw_other,
              to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
            from pjm.frcstd_gen_outages
            where forecast_date = $1::date
            order by forecast_execution_date_ept desc
            limit 1
          )
        `,
        [selectedDate],
      ),
    ]);

  const hourly = hourlyRows.map(normalizeHourly);
  const coverage = coverageRows.map(normalizeCoverage);
  const constraints = constraintRows.map(normalizeConstraint);
  const outages = outageRows.map(normalizeOutage);
  const peakLoadHour = maxBy(hourly, (row) => row.actualLoadMw);
  const tightestReserveHour = minBy(hourly, (row) => row.reserveMarginMw);
  const maxDeficitHour = maxBy(hourly, (row) => row.reserveDeficitMw);
  const maxReservePriceHour = maxBy(hourly, (row) => {
    const values = [row.dispatchedReserveMcp, row.reserveMarketMcp].filter(
      (value): value is number => value !== null,
    );
    return values.length ? Math.max(...values) : null;
  });
  const maxWesternHubPriceHour = maxBy(hourly, (row) => row.westernHubRtLmpMax ?? row.westernHubRtLmp);
  const asOf = maxStamp([
    ...coverage.map((row) => row.latestUpdateAt),
    ...hourly.map((row) => row.rowAsOf),
    ...outages.map((row) => row.updatedAt),
  ]);

  return {
    payload: {
      iso: "pjm",
      source:
        "PJM load, reserve, price, constraint, interchange, generation, and outage source tables",
      selectedDate,
      defaultDate,
      latestAvailableDate: availableRows[0]?.operating_date ?? null,
      availableDates: availableRows.map((row) => row.operating_date),
      asOf,
      coverage,
      summary: {
        hourCount: hourly.length,
        hoursWithLoad: hourly.filter((row) => row.actualLoadMw !== null).length,
        hoursWithReserveMargin: hourly.filter((row) => row.reserveMarginMw !== null).length,
        hoursWithShortage: hourly.filter((row) => row.shortageIndicator).length,
        peakLoadHour,
        tightestReserveHour,
        maxDeficitHour,
        maxReservePriceHour,
        maxWesternHubPriceHour,
        outageContext: outages[0] ?? null,
      },
      hourly,
      constraints,
      outages,
      metadata: {
        timezone: "America/New_York",
        priceHubs: PRICE_HUBS,
        reserveSelection:
          "One tightest reserve row per EPT hour, ordered by highest deficit then lowest reserve margin.",
        loadSelection:
          "RTO metered unverified load is preferred; RTO preliminary hourly load is the fallback.",
      },
    },
    headers: { "Cache-Control": CACHE_HEADER, "X-Pjm-Tightness-Lookback-Cache": "MISS" },
    rowCount: hourly.length,
    dataAsOf: asOf,
  };
});

export async function GET(request: Request): Promise<Response> {
  if (!isTightnessLookbackDevEnabled()) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return observedGET(request);
}
