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
const DEFAULT_LOOKBACK_DAYS = 365;
const MAX_RANGE_DAYS = 2_192;
const DEFAULT_MAX_POINTS = 1_800;
const MIN_MAX_POINTS = 250;
const MAX_MAX_POINTS = 7_500;
const ROUTE_CONFIG = {
  route: "/api/pjm-actuals-regime-scatter",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "Local-dev PJM hourly actual net load, weather, RT price scatter data",
  p95TargetMs: 2_500,
  freshnessSource:
    "pjm.hrl_load_metered/prelim, pjm.wind_gen, pjm.solar_gen, weather.wsi_hourly_observed_temperatures, pjm.rt_hrl_lmps, pjm.gen_outages_by_type updated_at",
} as const;

type RtSource = "verified" | "unverified";
type PriceComponent = "total" | "energy" | "congestion" | "loss";
type SeasonFilter = "all" | "winter" | "spring" | "summer" | "fall";
type HourFilter = "all_hours" | "weekday_onpeak" | "all_he8_23" | "offpeak";
type DayType = "all" | "weekdays" | "weekends";
type RegimeColor = "season" | "outage" | "hour" | "year" | "price";
type DateMode = "exact" | "seasonal";

interface AreaRow {
  area: string;
  row_count: number | string;
  min_ept: string | null;
  max_ept: string | null;
}

interface WeatherStationRow {
  station_id: string;
  station_name: string | null;
  region: string;
}

interface ScatterRow {
  datetime_beginning_ept: string;
  hour_ending: number | string;
  year: number | string;
  season: string;
  hour_regime: string;
  price_regime: string;
  outage_regime: string;
  color_regime: string;
  load_source: string;
  gross_load_mw: number | string | null;
  wind_mw: number | string | null;
  solar_mw: number | string | null;
  net_load_mw: number | string | null;
  temp_f: number | string | null;
  dew_point_f: number | string | null;
  feels_like_f: number | string | null;
  rt_price: number | string | null;
  total_outages_mw: number | string | null;
  planned_outages_mw: number | string | null;
  forced_outages_mw: number | string | null;
  maintenance_outages_mw: number | string | null;
  row_count: number | string;
  matched_count: number | string;
  sample_step: number | string;
  as_of: string | null;
}

interface SummaryRow {
  matched_count: number | string;
  returned_count: number | string;
  min_ept: string | null;
  max_ept: string | null;
  avg_temp_f: number | string | null;
  avg_net_load_mw: number | string | null;
  avg_rt_price: number | string | null;
  min_rt_price: number | string | null;
  max_rt_price: number | string | null;
  avg_total_outages_mw: number | string | null;
  sample_step: number | string;
  as_of: string | null;
}

interface ScatterPayloadRow {
  points: ScatterRow[] | string | null;
  summary: SummaryRow | string | null;
  price_distribution: PriceDistributionSql | string | null;
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

interface PriceDistributionSqlHistogramBin {
  bin_index: number | string;
  bin_start: number | string | null;
  bin_end: number | string | null;
  bin_count: number | string;
  pct: number | string | null;
}

interface PriceDistributionSqlLatest {
  datetime_beginning_ept: string | null;
  hour_ending: number | string | null;
  season: string | null;
  hour_regime: string | null;
  rt_price: number | string | null;
  temp_f: number | string | null;
  net_load_mw: number | string | null;
  total_outages_mw: number | string | null;
  percentile_rank: number | string | null;
  z_score: number | string | null;
}

interface PriceDistributionSqlAnalogPoint {
  datetime_beginning_ept: string | null;
  hour_ending: number | string | null;
  season: string | null;
  hour_regime: string | null;
  rt_price: number | string | null;
  temp_f: number | string | null;
  net_load_mw: number | string | null;
  total_outages_mw: number | string | null;
  distance: number | string | null;
}

interface PriceDistributionSqlAnalog {
  count: number | string;
  percentile_rank: number | string | null;
  stats: PriceDistributionSqlStats | null;
  points: PriceDistributionSqlAnalogPoint[] | null;
}

interface PriceDistributionSql {
  stats: PriceDistributionSqlStats | null;
  tails: PriceDistributionSqlTails | null;
  histogram: PriceDistributionSqlHistogramBin[] | null;
  latest: PriceDistributionSqlLatest | null;
  analog: PriceDistributionSqlAnalog | null;
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

function parseDateMode(value: string | null): DateMode {
  return value === "seasonal" ? "seasonal" : "exact";
}

function parseMonthDay(value: string | null, fallback: string): string {
  return value && /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value) ? value : fallback;
}

function parseRtSource(value: string | null): RtSource {
  return value === "unverified" ? "unverified" : "verified";
}

function parsePriceComponent(value: string | null): PriceComponent {
  if (value === "energy" || value === "congestion" || value === "loss") return value;
  return "total";
}

function parseSeason(value: string | null): SeasonFilter {
  if (value === "winter" || value === "spring" || value === "summer" || value === "fall") {
    return value;
  }
  return "all";
}

function parseHourFilter(value: string | null): HourFilter {
  if (
    value === "weekday_onpeak" ||
    value === "all_he8_23" ||
    value === "offpeak" ||
    value === "all_hours"
  ) {
    return value;
  }
  return "weekday_onpeak";
}

function parseDayType(value: string | null): DayType {
  if (value === "weekdays" || value === "weekends") return value;
  return "all";
}

function parseRegimeColor(value: string | null): RegimeColor {
  if (value === "outage" || value === "hour" || value === "year" || value === "price") {
    return value;
  }
  return "season";
}

function parseBoundedNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMaxPoints(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_POINTS;
  return Math.min(Math.max(parsed, MIN_MAX_POINTS), MAX_MAX_POINTS);
}

function parseLookbackYears(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(Math.max(parsed, 1), 5);
}

function parseBoolean(value: string | null, fallback = false): boolean {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

function parseIntList(value: string | null, min: number, max: number): number[] {
  if (!value) return [];
  const parsed = value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((item) => Number.isInteger(item) && item >= min && item <= max);
  return Array.from(new Set(parsed)).sort((left, right) => left - right);
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

function deriveSeasonalDateWindow({
  dateMode,
  requestedStartDate,
  requestedEndDate,
  seasonStart,
  seasonEnd,
  lookbackYears,
  includeCurrentYear,
}: {
  dateMode: DateMode;
  requestedStartDate: string | null;
  requestedEndDate: string | null;
  seasonStart: string;
  seasonEnd: string;
  lookbackYears: number;
  includeCurrentYear: boolean;
}) {
  if (dateMode !== "seasonal") {
    return {
      startDate: requestedStartDate,
      endDate: requestedEndDate,
      years: [] as number[],
      months: [] as number[],
    };
  }

  const currentYear = new Date().getUTCFullYear();
  const lastHistoricalYear = currentYear - 1;
  const firstYear = lastHistoricalYear - lookbackYears + 1;
  const years = Array.from({ length: lookbackYears }, (_, index) => firstYear + index);
  if (includeCurrentYear) years.push(currentYear);

  return {
    startDate: `${years[0]}-${seasonStart}`,
    endDate: `${years[years.length - 1]}-${seasonEnd}`,
    years,
    months: [] as number[],
  };
}

function mapPriceDistributionStats(row: PriceDistributionSqlStats | null | undefined) {
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

function mapPriceDistribution(raw: PriceDistributionSql | null | undefined) {
  const analog = raw?.analog;
  return {
    stats: mapPriceDistributionStats(raw?.stats),
    tails: {
      belowZero: toNumber(raw?.tails?.below_zero),
      above100: toNumber(raw?.tails?.above_100),
      above250: toNumber(raw?.tails?.above_250),
      above500: toNumber(raw?.tails?.above_500),
    },
    histogram: (raw?.histogram ?? []).map((row) => ({
      binIndex: toInt(row.bin_index),
      binStart: toNumber(row.bin_start),
      binEnd: toNumber(row.bin_end),
      count: toInt(row.bin_count),
      pct: toNumber(row.pct),
    })),
    latest: raw?.latest
      ? {
          datetimeBeginningEpt: isoLocal(raw.latest.datetime_beginning_ept),
          hourEnding: toInt(raw.latest.hour_ending),
          season: raw.latest.season,
          hourRegime: raw.latest.hour_regime,
          rtPrice: toNumber(raw.latest.rt_price),
          tempF: toNumber(raw.latest.temp_f),
          netLoadMw: toNumber(raw.latest.net_load_mw),
          totalOutagesMw: toNumber(raw.latest.total_outages_mw),
          percentileRank: toNumber(raw.latest.percentile_rank),
          zScore: toNumber(raw.latest.z_score),
        }
      : null,
    analog: {
      count: toInt(analog?.count),
      percentileRank: toNumber(analog?.percentile_rank),
      stats: mapPriceDistributionStats(analog?.stats),
      points: (analog?.points ?? []).map((row) => ({
        datetimeBeginningEpt: isoLocal(row.datetime_beginning_ept),
        hourEnding: toInt(row.hour_ending),
        season: row.season,
        hourRegime: row.hour_regime,
        rtPrice: toNumber(row.rt_price),
        tempF: toNumber(row.temp_f),
        netLoadMw: toNumber(row.net_load_mw),
        totalOutagesMw: toNumber(row.total_outages_mw),
        distance: toNumber(row.distance),
      })),
    },
  };
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
        and datetime_beginning_ept >= (select bounded_start from windows)
        and datetime_beginning_ept < (select bounded_end_exclusive from windows)
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
      and datetime_beginning_ept >= (select bounded_start from windows)
      and datetime_beginning_ept < (select bounded_end_exclusive from windows)
  `;
}

function labelForRegimeColor(regimeColor: RegimeColor): string {
  if (regimeColor === "outage") return "Outage regime";
  if (regimeColor === "hour") return "Hour regime";
  if (regimeColor === "year") return "Year";
  if (regimeColor === "price") return "Price regime";
  return "Season";
}

async function loadAreas(): Promise<AreaRow[]> {
  return query<AreaRow>(
    `
      with area_rows as (
        select
          load_area as area,
          count(*) as row_count,
          min(datetime_beginning_ept) as min_ept,
          max(datetime_beginning_ept) as max_ept
        from pjm.hrl_load_metered
        where datetime_beginning_ept >= current_date - interval '730 days'
        group by load_area
        union all
        select
          load_area as area,
          count(*) as row_count,
          min(datetime_beginning_ept) as min_ept,
          max(datetime_beginning_ept) as max_ept
        from pjm.hrl_load_prelim
        where datetime_beginning_ept >= current_date - interval '730 days'
        group by load_area
      )
      select
        area,
        sum(row_count)::bigint as row_count,
        to_char(min(min_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as min_ept,
        to_char(max(max_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as max_ept
      from area_rows
      group by area
      having sum(row_count) >= 168
      order by case when area in ('RTO', 'PJM', 'RTO_COMBINED') then 0 else 1 end, area
    `,
  );
}

async function generationAreas(): Promise<AreaRow[]> {
  return query<AreaRow>(
    `
      with areas as (
        select
          coalesce(w.area, s.area) as area,
          count(*) as row_count,
          min(coalesce(w.datetime_beginning_ept, s.datetime_beginning_ept)) as min_ept,
          max(coalesce(w.datetime_beginning_ept, s.datetime_beginning_ept)) as max_ept
        from pjm.wind_gen w
        full join pjm.solar_gen s
          on s.area = w.area
         and s.datetime_beginning_ept = w.datetime_beginning_ept
        where coalesce(w.datetime_beginning_ept, s.datetime_beginning_ept) >= current_date - interval '730 days'
        group by coalesce(w.area, s.area)
      )
      select
        area,
        row_count,
        to_char(min_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as min_ept,
        to_char(max_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as max_ept
      from areas
      where row_count >= 168
      order by case when area in ('RTO', 'PJM', 'RTO_COMBINED') then 0 else 1 end, area
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
        and observation_time_local >= current_date - interval '730 days'
      group by station_id, region
      order by case when station_id = 'PJM' then 0 else 1 end, station_id
    `,
    [region],
  );
}

function buildScatterSql(rtSource: RtSource, component: PriceComponent): string {
  const priceSql = priceSourceSql(rtSource, component);
  return `
    with params as (
      select
        $1::text as load_area,
        $2::text as generation_area,
        $3::text as station_id,
        $4::text as region,
        $5::text as hub,
        coalesce($6::date, current_date - interval '${DEFAULT_LOOKBACK_DAYS} days')::date as requested_start,
        coalesce($7::date, current_date - interval '1 day')::date as requested_end,
        $8::int[] as months,
        $9::int[] as years,
        $10::text as season_filter,
        $11::text as hour_filter,
        $12::text as day_type,
        $13::float8 as min_price,
        $14::float8 as max_price,
        $15::float8 as min_outages,
        $16::float8 as max_outages,
        $17::int as max_points,
        $18::text as regime_color,
        $19::text as date_mode,
        $20::text as season_start_mmdd,
        $21::text as season_end_mmdd
    ),
    windows as (
      select
        greatest(
          least(requested_start, requested_end),
          greatest(requested_start, requested_end) - interval '${MAX_RANGE_DAYS - 1} days'
        )::timestamp as bounded_start,
        (greatest(requested_start, requested_end) + interval '1 day')::timestamp as bounded_end_exclusive
      from params
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
      cross join windows w
      where m.load_area = p.load_area
        and m.is_verified = false
        and m.datetime_beginning_ept >= w.bounded_start
        and m.datetime_beginning_ept < w.bounded_end_exclusive
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
      cross join windows w
      where p_load.load_area = p.load_area
        and p_load.datetime_beginning_ept >= w.bounded_start
        and p_load.datetime_beginning_ept < w.bounded_end_exclusive
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
      cross join windows w
      where s.area = p.generation_area
        and s.datetime_beginning_ept >= w.bounded_start
        and s.datetime_beginning_ept < w.bounded_end_exclusive
    ),
    wind_hourly as (
      select
        w_gen.datetime_beginning_ept,
        w_gen.wind_generation_mw::float8 as wind_mw,
        w_gen.updated_at
      from pjm.wind_gen w_gen
      cross join params p
      cross join windows w
      where w_gen.area = p.generation_area
        and w_gen.datetime_beginning_ept >= w.bounded_start
        and w_gen.datetime_beginning_ept < w.bounded_end_exclusive
    ),
    weather_hourly as (
      select
        wobs.observation_time_local,
        avg(wobs.temp_f::float8) as temp_f,
        avg(wobs.dew_point_f::float8) as dew_point_f,
        avg(wobs.feels_like_f::float8) as feels_like_f,
        max(wobs.updated_at) as updated_at
      from weather.wsi_hourly_observed_temperatures wobs
      cross join params p
      cross join windows w
      where wobs.station_id = p.station_id
        and wobs.region = p.region
        and wobs.observation_time_local >= w.bounded_start
        and wobs.observation_time_local < w.bounded_end_exclusive
      group by wobs.observation_time_local
    ),
    price_hourly as (
      ${priceSql}
    ),
    outage_daily as (
      select
        o.forecast_date,
        o.total_outages_mw::float8 as total_outages_mw,
        o.planned_outages_mw::float8 as planned_outages_mw,
        o.forced_outages_mw::float8 as forced_outages_mw,
        o.maintenance_outages_mw::float8 as maintenance_outages_mw,
        o.updated_at
      from pjm.gen_outages_by_type o
      cross join windows w
      where o.region = 'PJM RTO'
        and o.forecast_date = o.forecast_execution_date_ept
        and o.forecast_date >= w.bounded_start::date
        and o.forecast_date < w.bounded_end_exclusive::date
    ),
    joined as (
      select
        l.datetime_beginning_ept,
        extract(hour from l.datetime_beginning_ept)::int + 1 as hour_ending,
        extract(isodow from l.datetime_beginning_ept)::int as iso_dow,
        extract(month from l.datetime_beginning_ept)::int as month,
        extract(year from l.datetime_beginning_ept)::int as year,
        case
          when extract(month from l.datetime_beginning_ept)::int in (12, 1, 2) then 'Winter'
          when extract(month from l.datetime_beginning_ept)::int in (3, 4, 5) then 'Spring'
          when extract(month from l.datetime_beginning_ept)::int in (6, 7, 8) then 'Summer'
          else 'Fall'
        end as season,
        case
          when extract(isodow from l.datetime_beginning_ept)::int between 1 and 5
           and extract(hour from l.datetime_beginning_ept)::int + 1 between 8 and 23
            then 'Weekday On-Peak'
          when extract(hour from l.datetime_beginning_ept)::int + 1 between 8 and 23
            then 'HE8-23 Weekend'
          else 'Off-Peak'
        end as hour_regime,
        l.load_source,
        l.gross_load_mw,
        wind.wind_mw,
        solar.solar_mw,
        (l.gross_load_mw - wind.wind_mw - solar.solar_mw)::float8 as net_load_mw,
        wx.temp_f,
        wx.dew_point_f,
        wx.feels_like_f,
        price.rt_price,
        outage.total_outages_mw,
        outage.planned_outages_mw,
        outage.forced_outages_mw,
        outage.maintenance_outages_mw,
        greatest(
          l.updated_at,
          wind.updated_at,
          solar.updated_at,
          wx.updated_at,
          price.updated_at,
          coalesce(outage.updated_at, l.updated_at)
        ) as row_as_of
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
    prefiltered as (
      select j.*
      from joined j
      cross join params p
      where (
          cardinality(p.months) = 0
          or j.month = any(p.months)
        )
        and (
          cardinality(p.years) = 0
          or j.year = any(p.years)
        )
        and (
          p.date_mode <> 'seasonal'
          or (
            p.season_start_mmdd <= p.season_end_mmdd
            and to_char(j.datetime_beginning_ept, 'MM-DD') between p.season_start_mmdd and p.season_end_mmdd
          )
          or (
            p.season_start_mmdd > p.season_end_mmdd
            and (
              to_char(j.datetime_beginning_ept, 'MM-DD') >= p.season_start_mmdd
              or to_char(j.datetime_beginning_ept, 'MM-DD') <= p.season_end_mmdd
            )
          )
        )
        and (
          p.season_filter = 'all'
          or (p.season_filter = 'winter' and j.month in (12, 1, 2))
          or (p.season_filter = 'spring' and j.month in (3, 4, 5))
          or (p.season_filter = 'summer' and j.month in (6, 7, 8))
          or (p.season_filter = 'fall' and j.month in (9, 10, 11))
        )
        and (
          p.hour_filter = 'all_hours'
          or (p.hour_filter = 'weekday_onpeak' and j.iso_dow between 1 and 5 and j.hour_ending between 8 and 23)
          or (p.hour_filter = 'all_he8_23' and j.hour_ending between 8 and 23)
          or (p.hour_filter = 'offpeak' and (j.iso_dow in (6, 7) or j.hour_ending not between 8 and 23))
        )
        and (
          p.day_type = 'all'
          or (p.day_type = 'weekdays' and j.iso_dow between 1 and 5)
          or (p.day_type = 'weekends' and j.iso_dow in (6, 7))
        )
        and (p.min_price is null or j.rt_price >= p.min_price)
        and (p.max_price is null or j.rt_price <= p.max_price)
        and (p.min_outages is null or j.total_outages_mw >= p.min_outages)
        and (p.max_outages is null or j.total_outages_mw <= p.max_outages)
    ),
    thresholds as (
      select
        percentile_cont(0.33) within group (order by total_outages_mw) as p33_outage,
        percentile_cont(0.67) within group (order by total_outages_mw) as p67_outage,
        percentile_cont(0.90) within group (order by rt_price) as p90_price,
        percentile_cont(0.10) within group (order by rt_price) as p10_price
      from prefiltered
    ),
    annotated as (
      select
        p.*,
        case
          when p.total_outages_mw is null then 'No outage row'
          when t.p33_outage is null or t.p67_outage is null then 'Outage data'
          when p.total_outages_mw <= t.p33_outage then 'Low outage'
          when p.total_outages_mw >= t.p67_outage then 'High outage'
          else 'Mid outage'
        end as outage_regime,
        case
          when t.p10_price is null or t.p90_price is null then 'Price data'
          when p.rt_price >= t.p90_price then 'Top price decile'
          when p.rt_price <= t.p10_price then 'Bottom price decile'
          else 'Middle price'
        end as price_regime,
        case
          when (select regime_color from params) = 'outage' then
            case
              when p.total_outages_mw is null then 'No outage row'
              when t.p33_outage is null or t.p67_outage is null then 'Outage data'
              when p.total_outages_mw <= t.p33_outage then 'Low outage'
              when p.total_outages_mw >= t.p67_outage then 'High outage'
              else 'Mid outage'
            end
          when (select regime_color from params) = 'hour' then p.hour_regime
          when (select regime_color from params) = 'year' then p.year::text
          when (select regime_color from params) = 'price' then
            case
              when t.p10_price is null or t.p90_price is null then 'Price data'
              when p.rt_price >= t.p90_price then 'Top price decile'
              when p.rt_price <= t.p10_price then 'Bottom price decile'
              else 'Middle price'
            end
          else p.season
        end as color_regime
      from prefiltered p
      cross join thresholds t
    ),
    counted as (
      select
        a.*,
        count(*) over () as matched_count,
        greatest(ceil(count(*) over ()::numeric / nullif((select max_points from params), 0)), 1)::int as sample_step,
        row_number() over (order by datetime_beginning_ept) as rn
      from annotated a
    ),
    sampled as (
      select *
      from counted
      where ((rn - 1) % sample_step = 0)
      order by datetime_beginning_ept
      limit (select max_points from params)
    )
    select
      to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
      hour_ending,
      year,
      season,
      hour_regime,
      price_regime,
      outage_regime,
      color_regime,
      load_source,
      gross_load_mw,
      wind_mw,
      solar_mw,
      net_load_mw,
      temp_f,
      dew_point_f,
      feels_like_f,
      rt_price,
      total_outages_mw,
      planned_outages_mw,
      forced_outages_mw,
      maintenance_outages_mw,
      count(*) over () as row_count,
      matched_count,
      sample_step,
      to_char(max(row_as_of) over (), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
    from sampled
    order by datetime_beginning_ept
  `;
}

function buildScatterPayloadSql(rtSource: RtSource, component: PriceComponent): string {
  const scatterSql = buildScatterSql(rtSource, component);
  const prefix = scatterSql.slice(0, scatterSql.lastIndexOf("select"));
  return `
    ${prefix},
    point_rows as (
      select
        to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
        hour_ending,
        year,
        season,
        hour_regime,
        price_regime,
        outage_regime,
        color_regime,
        load_source,
        gross_load_mw,
        wind_mw,
        solar_mw,
        net_load_mw,
        temp_f,
        dew_point_f,
        feels_like_f,
        rt_price,
        total_outages_mw,
        planned_outages_mw,
        forced_outages_mw,
        maintenance_outages_mw,
        count(*) over () as row_count,
        matched_count,
        sample_step,
        to_char(max(row_as_of) over (), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
      from sampled
    ),
    summary_row as (
      select
        count(*) as matched_count,
        (select count(*) from sampled) as returned_count,
        to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as min_ept,
        to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as max_ept,
        avg(temp_f)::float8 as avg_temp_f,
        avg(net_load_mw)::float8 as avg_net_load_mw,
        avg(rt_price)::float8 as avg_rt_price,
        min(rt_price)::float8 as min_rt_price,
        max(rt_price)::float8 as max_rt_price,
        avg(total_outages_mw)::float8 as avg_total_outages_mw,
        coalesce((select max(sample_step) from sampled), 1) as sample_step,
        to_char(max(row_as_of), 'YYYY-MM-DD"T"HH24:MI:SS') as as_of
      from annotated
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
      from annotated
      where rt_price is not null
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
      left join annotated a
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
      from annotated
      where rt_price is not null
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
      left join annotated a
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
    latest_actual as (
      select *
      from annotated
      where rt_price is not null
      order by datetime_beginning_ept desc
      limit 1
    ),
    latest_position as (
      select
        to_char(l.datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
        l.hour_ending,
        l.season,
        l.hour_regime,
        l.rt_price,
        l.temp_f,
        l.net_load_mw,
        l.total_outages_mw,
        (
          select count(*)::float8
          from annotated a
          where a.rt_price is not null
            and a.rt_price <= l.rt_price
        ) / nullif(ps."count"::float8, 0) as percentile_rank,
        case
          when ps.std_dev is null or ps.std_dev = 0 then null
          else ((l.rt_price - ps.mean_price) / ps.std_dev)::float8
        end as z_score
      from latest_actual l
      cross join price_stats ps
    ),
    feature_ranges as (
      select
        min(temp_f)::float8 as min_temp,
        max(temp_f)::float8 as max_temp,
        min(net_load_mw)::float8 as min_load,
        max(net_load_mw)::float8 as max_load,
        min(coalesce(total_outages_mw, 0))::float8 as min_outage,
        max(coalesce(total_outages_mw, 0))::float8 as max_outage
      from annotated
    ),
    analog_ranked as (
      select
        to_char(a.datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
        a.hour_ending,
        a.season,
        a.hour_regime,
        a.rt_price,
        a.temp_f,
        a.net_load_mw,
        a.total_outages_mw,
        (
          coalesce(abs(((a.temp_f - fr.min_temp) / nullif(fr.max_temp - fr.min_temp, 0)) - ((l.temp_f - fr.min_temp) / nullif(fr.max_temp - fr.min_temp, 0))), 0) * 0.34
          + coalesce(abs(((a.net_load_mw - fr.min_load) / nullif(fr.max_load - fr.min_load, 0)) - ((l.net_load_mw - fr.min_load) / nullif(fr.max_load - fr.min_load, 0))), 0) * 0.38
          + coalesce(abs(((coalesce(a.total_outages_mw, 0) - fr.min_outage) / nullif(fr.max_outage - fr.min_outage, 0)) - ((coalesce(l.total_outages_mw, 0) - fr.min_outage) / nullif(fr.max_outage - fr.min_outage, 0))), 0) * 0.18
          + case when a.season = l.season then 0 else 0.25 end
          + case when a.hour_regime = l.hour_regime then 0 else 0.35 end
        )::float8 as distance
      from annotated a
      cross join latest_actual l
      cross join feature_ranges fr
      where a.rt_price is not null
        and a.temp_f is not null
        and a.net_load_mw is not null
        and a.datetime_beginning_ept <> l.datetime_beginning_ept
      order by distance, a.datetime_beginning_ept desc
      limit 80
    ),
    analog_stats_base as (
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
      from analog_ranked
    ),
    analog_stats as (
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
      from analog_stats_base b
      left join analog_ranked a
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
    analog_position as (
      select
        (
          select count(*)::float8
          from analog_ranked a
          cross join latest_actual l
          where a.rt_price <= l.rt_price
        ) / nullif((select "count"::float8 from analog_stats), 0) as percentile_rank
    ),
    analog_point_rows as (
      select *
      from analog_ranked
      order by distance, datetime_beginning_ept desc
      limit 10
    )
    select
      coalesce(
        (select jsonb_agg(to_jsonb(point_rows) order by datetime_beginning_ept) from point_rows),
        '[]'::jsonb
      ) as points,
      (select to_jsonb(summary_row) from summary_row) as summary,
      jsonb_build_object(
        'stats', (select to_jsonb(price_stats) from price_stats),
        'tails', (select to_jsonb(tail_stats) from tail_stats),
        'histogram', coalesce(
          (select jsonb_agg(to_jsonb(histogram_counts) order by bin_index) from histogram_counts),
          '[]'::jsonb
        ),
        'latest', (select to_jsonb(latest_position) from latest_position),
        'analog', jsonb_build_object(
          'count', coalesce((select "count" from analog_stats), 0),
          'percentile_rank', (select percentile_rank from analog_position),
          'stats', (select to_jsonb(analog_stats) from analog_stats),
          'points', coalesce(
            (select jsonb_agg(to_jsonb(analog_point_rows) order by distance, datetime_beginning_ept desc) from analog_point_rows),
            '[]'::jsonb
          )
        )
      ) as price_distribution
  `;
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const region = parseIdentifier(searchParams.get("region"), DEFAULT_REGION);
  const requestedLoadArea = parseIdentifier(searchParams.get("loadArea"), DEFAULT_LOAD_AREA);
  const requestedGenerationArea = parseIdentifier(
    searchParams.get("generationArea"),
    DEFAULT_GENERATION_AREA,
  );
  const requestedStationId = parseIdentifier(searchParams.get("stationId"), DEFAULT_STATION_ID);
  const requestedHub = searchParams.get("hub")?.trim().toUpperCase() || DEFAULT_HUB;
  const hub = PRICE_HUBS.includes(requestedHub as (typeof PRICE_HUBS)[number])
    ? requestedHub
    : DEFAULT_HUB;
  const rtSource = parseRtSource(searchParams.get("rtSource"));
  const component = parsePriceComponent(searchParams.get("component"));
  const dateMode = parseDateMode(searchParams.get("dateMode"));
  const seasonStart = parseMonthDay(searchParams.get("seasonStart"), "05-01");
  const seasonEnd = parseMonthDay(searchParams.get("seasonEnd"), "08-31");
  const lookbackYears = parseLookbackYears(searchParams.get("lookbackYears"));
  const includeCurrentYear = parseBoolean(searchParams.get("includeCurrentYear"), false);
  const requestedStartDate = parseDate(searchParams.get("start"));
  const requestedEndDate = parseDate(searchParams.get("end"));
  const requestedMonths = parseIntList(searchParams.get("months"), 1, 12);
  const requestedYears = parseIntList(searchParams.get("years"), 2000, new Date().getUTCFullYear() + 1);
  const seasonalWindow = deriveSeasonalDateWindow({
    dateMode,
    requestedStartDate,
    requestedEndDate,
    seasonStart,
    seasonEnd,
    lookbackYears,
    includeCurrentYear,
  });
  const startDate = seasonalWindow.startDate;
  const endDate = seasonalWindow.endDate;
  const months = dateMode === "seasonal" ? seasonalWindow.months : requestedMonths;
  const years =
    dateMode === "seasonal"
      ? seasonalWindow.years
      : requestedYears;
  const season = parseSeason(searchParams.get("season"));
  const hourFilter = parseHourFilter(searchParams.get("hourFilter"));
  const dayType = parseDayType(searchParams.get("dayType"));
  const regimeColor = parseRegimeColor(searchParams.get("regimeColor"));
  const minPrice = parseBoundedNumber(searchParams.get("minPrice"));
  const maxPrice = parseBoundedNumber(searchParams.get("maxPrice"));
  const minOutages = parseBoundedNumber(searchParams.get("minOutages"));
  const maxOutages = parseBoundedNumber(searchParams.get("maxOutages"));
  const maxPoints = parseMaxPoints(searchParams.get("maxPoints"));

  const [areaRows, generationRows, stationRows] = await Promise.all([
    loadAreas(),
    generationAreas(),
    weatherStations(region),
  ]);
  const availableLoadAreas = areaRows.map((row) => row.area);
  const availableGenerationAreas = generationRows.map((row) => row.area);
  const availableStations = stationRows.map((row) => row.station_id);
  const loadArea = availableLoadAreas.includes(requestedLoadArea)
    ? requestedLoadArea
    : availableLoadAreas.includes(DEFAULT_LOAD_AREA)
      ? DEFAULT_LOAD_AREA
      : availableLoadAreas[0] ?? requestedLoadArea;
  const generationArea = availableGenerationAreas.includes(requestedGenerationArea)
    ? requestedGenerationArea
    : availableGenerationAreas.includes(DEFAULT_GENERATION_AREA)
      ? DEFAULT_GENERATION_AREA
      : availableGenerationAreas[0] ?? requestedGenerationArea;
  const stationId = availableStations.includes(requestedStationId)
    ? requestedStationId
    : availableStations.includes(DEFAULT_STATION_ID)
      ? DEFAULT_STATION_ID
      : availableStations[0] ?? requestedStationId;

  const params = [
    loadArea,
    generationArea,
    stationId,
    region,
    hub,
    startDate,
    endDate,
    months,
    years,
    season,
    hourFilter,
    dayType,
    minPrice,
    maxPrice,
    minOutages,
    maxOutages,
    maxPoints,
    regimeColor,
    dateMode,
    seasonStart,
    seasonEnd,
  ] as const;

  const [payloadRow] = await query<ScatterPayloadRow>(
    buildScatterPayloadSql(rtSource, component),
    params,
  );
  const rows = parseJsonField<ScatterRow[]>(payloadRow?.points, []);
  const summary = parseJsonField<SummaryRow | null>(payloadRow?.summary, null);
  const priceDistribution = parseJsonField<PriceDistributionSql | null>(
    payloadRow?.price_distribution,
    null,
  );
  const asOf = rows[0]?.as_of ?? summary?.as_of ?? null;

  return {
    payload: {
      iso: "pjm",
      source:
        "pjm.hrl_load_metered/prelim + pjm.wind_gen + pjm.solar_gen + weather.wsi_hourly_observed_temperatures + PJM RT LMPs",
      formula: "net_load_mw = gross_load_mw - wind_mw - solar_mw",
      selected: {
        loadArea,
        generationArea,
        stationId,
        stationName:
          stationRows.find((station) => station.station_id === stationId)?.station_name ?? stationId,
        region,
        hub,
        rtSource,
        component,
        startDate,
        endDate,
        dateMode,
        seasonStart,
        seasonEnd,
        lookbackYears,
        includeCurrentYear,
        months,
        years,
        season,
        hourFilter,
        dayType,
        minPrice,
        maxPrice,
        minOutages,
        maxOutages,
        maxPoints,
        regimeColor,
        regimeColorLabel: labelForRegimeColor(regimeColor),
      },
      availableLoadAreas: areaRows.map((row) => ({
        area: row.area,
        rowCount: toInt(row.row_count),
        minEpt: isoLocal(row.min_ept),
        maxEpt: isoLocal(row.max_ept),
      })),
      availableGenerationAreas: generationRows.map((row) => ({
        area: row.area,
        rowCount: toInt(row.row_count),
        minEpt: isoLocal(row.min_ept),
        maxEpt: isoLocal(row.max_ept),
      })),
      weatherStations: stationRows.map((row) => ({
        stationId: row.station_id,
        stationName: row.station_name ?? row.station_id,
        region: row.region,
      })),
      availableHubs: PRICE_HUBS,
      summary: {
        matchedCount: toInt(summary?.matched_count),
        returnedCount: rows.length,
        minEpt: isoLocal(summary?.min_ept),
        maxEpt: isoLocal(summary?.max_ept),
        avgTempF: toNumber(summary?.avg_temp_f),
        avgNetLoadMw: toNumber(summary?.avg_net_load_mw),
        avgRtPrice: toNumber(summary?.avg_rt_price),
        minRtPrice: toNumber(summary?.min_rt_price),
        maxRtPrice: toNumber(summary?.max_rt_price),
        avgTotalOutagesMw: toNumber(summary?.avg_total_outages_mw),
        sampleStep: toInt(summary?.sample_step) || toInt(rows[0]?.sample_step) || 1,
        asOf,
      },
      priceDistribution: mapPriceDistribution(priceDistribution),
      points: rows.map((row) => ({
        datetimeBeginningEpt: isoLocal(row.datetime_beginning_ept),
        hourEnding: toInt(row.hour_ending),
        year: toInt(row.year),
        season: row.season,
        hourRegime: row.hour_regime,
        priceRegime: row.price_regime,
        outageRegime: row.outage_regime,
        loadSource: row.load_source,
        grossLoadMw: toNumber(row.gross_load_mw),
        windMw: toNumber(row.wind_mw),
        solarMw: toNumber(row.solar_mw),
        netLoadMw: toNumber(row.net_load_mw),
        tempF: toNumber(row.temp_f),
        dewPointF: toNumber(row.dew_point_f),
        feelsLikeF: toNumber(row.feels_like_f),
        rtPrice: toNumber(row.rt_price),
        totalOutagesMw: toNumber(row.total_outages_mw),
        plannedOutagesMw: toNumber(row.planned_outages_mw),
        forcedOutagesMw: toNumber(row.forced_outages_mw),
        maintenanceOutagesMw: toNumber(row.maintenance_outages_mw),
        colorRegime: row.color_regime,
      })),
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: rows.length,
    dataAsOf: asOf,
  };
});

export async function GET(request: Request): Promise<Response> {
  if (!isActualsRegimeScatterDevEnabled()) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return observedGET(request);
}
