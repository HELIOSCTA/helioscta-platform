import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=120";
const DEFAULT_SOURCE = "preferred";
const DEFAULT_REGION = "PJM";
const DEFAULT_WEATHER_STATION = "PJM";
const DEFAULT_LOOKBACK_DAYS = 56;
const MAX_RANGE_DAYS = 120;
const MAX_MONTH_YEAR_COUNT = 6;
const SHORT_HISTORY_DAYS = 30;
const ROUTE_CONFIG = {
  route: "/api/pjm-load-growth",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=120",
  owner: "frontend",
  purpose: "PJM limited-history load-weather explorer data",
  p95TargetMs: 1_000,
  freshnessSource:
    "pjm.hrl_load_prelim.updated_at, pjm.hrl_load_metered.updated_at, weather.wsi_hourly_observed_temperatures.updated_at",
} as const;

type LoadSource = "preferred" | "prelim" | "metered";
type HourlyLoadSource = "metered" | "prelim";
type WeatherMetric = "tempF" | "dewPointF" | "feelsLikeF";
type LoadShape = "flat" | "onpeak" | "offpeak" | "peak";
type DayType = "all" | "weekdays" | "weekends";
type DateMode = "lookback" | "range" | "month-years";

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

interface CoverageRow {
  load_min_ept: string | null;
  load_max_ept: string | null;
  load_latest_update: string | null;
  weather_min_local: string | null;
  weather_max_local: string | null;
  weather_latest_update: string | null;
}

interface HourlyRow {
  datetime_beginning_ept: string;
  load_area: string;
  load_source: HourlyLoadSource;
  load_mw: number | string | null;
  load_component_count: number | string;
  weather_station_id: string;
  weather_station_name: string | null;
  region: string;
  temp_f: number | string | null;
  dew_point_f: number | string | null;
  feels_like_f: number | string | null;
  wind_chill_f: number | string | null;
  heat_index_f: number | string | null;
  wind_speed_mph: number | string | null;
  relative_humidity_pct: number | string | null;
  cloud_cover_pct: number | string | null;
  precip_in: number | string | null;
  load_updated_at: string | null;
  weather_updated_at: string | null;
}

interface HourlyPoint {
  datetimeBeginningEpt: string;
  date: string;
  hourEnding: number;
  source: HourlyLoadSource;
  loadArea: string;
  loadMw: number | null;
  loadComponentCount: number;
  weatherStationId: string;
  weatherStationName: string;
  region: string;
  tempF: number | null;
  dewPointF: number | null;
  feelsLikeF: number | null;
  windChillF: number | null;
  heatIndexF: number | null;
  windSpeedMph: number | null;
  relativeHumidityPct: number | null;
  cloudCoverPct: number | null;
  precipIn: number | null;
  loadUpdatedAt: string | null;
  weatherUpdatedAt: string | null;
}

interface RegressionResult {
  count: number;
  slope: number | null;
  intercept: number | null;
  correlation: number | null;
  rSquared: number | null;
}

function parseSource(value: string | null): LoadSource {
  if (value === "metered" || value === "prelim") return value;
  return DEFAULT_SOURCE;
}

function parseWeatherMetric(value: string | null): WeatherMetric {
  if (value === "dewPointF" || value === "feelsLikeF") return value;
  return "tempF";
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

function parseLookbackDays(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_LOOKBACK_DAYS;
  return Math.min(Math.max(parsed, 1), MAX_RANGE_DAYS);
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

function parseIdentifier(value: string | null, fallback: string): string {
  const trimmed = value?.trim().toUpperCase();
  if (!trimmed) return fallback;
  return /^[A-Z0-9_&/ -]{1,64}$/.test(trimmed) ? trimmed : fallback;
}

function parseDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function dayDiff(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

function minDate(...values: Array<Date | null>): Date | null {
  const dates = values.filter((value): value is Date => value !== null);
  if (!dates.length) return null;
  return new Date(Math.min(...dates.map((value) => value.getTime())));
}

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value !== null);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function max(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value !== null);
  return nums.length ? Math.max(...nums) : null;
}

function min(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value !== null);
  return nums.length ? Math.min(...nums) : null;
}

function isoLocal(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(" ", "T").slice(0, 19);
}

function sourceTable(source: LoadSource): string {
  if (source === "preferred") return "pjm.hrl_load_metered then pjm.hrl_load_prelim";
  return source === "metered" ? "pjm.hrl_load_metered" : "pjm.hrl_load_prelim";
}

function loadMetricName(source: LoadSource): string {
  if (source === "preferred") return "metered_mw_then_prelim_load_avg_hourly";
  return source === "metered" ? "mw" : "prelim_load_avg_hourly";
}

function weatherMetricValue(row: HourlyPoint, metric: WeatherMetric): number | null {
  return row[metric];
}

function hourMatches(row: HourlyPoint, shape: LoadShape): boolean {
  if (shape === "onpeak") return row.hourEnding >= 8 && row.hourEnding <= 23;
  if (shape === "offpeak") return row.hourEnding <= 7 || row.hourEnding === 24;
  return true;
}

function dayMatches(row: HourlyPoint, dayType: DayType): boolean {
  if (dayType === "all") return true;
  const isoDow = new Date(`${row.date}T00:00:00Z`).getUTCDay() || 7;
  if (dayType === "weekdays") return isoDow >= 1 && isoDow <= 5;
  return isoDow === 6 || isoDow === 7;
}

function filterHourlyRows(rows: HourlyPoint[], shape: LoadShape, dayType: DayType): HourlyPoint[] {
  const filtered = rows.filter((row) => hourMatches(row, shape) && dayMatches(row, dayType));
  if (shape !== "peak") return filtered;
  const byDate = new Map<string, HourlyPoint>();
  filtered.forEach((row) => {
    const existing = byDate.get(row.date);
    if (!existing || (row.loadMw ?? Number.NEGATIVE_INFINITY) > (existing.loadMw ?? Number.NEGATIVE_INFINITY)) {
      byDate.set(row.date, row);
    }
  });
  return Array.from(byDate.values()).sort((left, right) =>
    left.datetimeBeginningEpt.localeCompare(right.datetimeBeginningEpt),
  );
}

async function tableAvailable(name: string): Promise<boolean> {
  const rows = await query<{ table_name: string | null }>(
    "select to_regclass($1)::text as table_name",
    [name],
  );
  return Boolean(rows[0]?.table_name);
}

async function loadAreas(source: LoadSource): Promise<AreaRow[]> {
  if (source === "preferred") {
    return query<AreaRow>(
      `
        with area_rows as (
          select
            load_area,
            count(*) as row_count,
            min(datetime_beginning_ept) as min_ept,
            max(datetime_beginning_ept) as max_ept
          from pjm.hrl_load_metered
          where is_verified
          group by load_area
          union all
          select
            load_area,
            count(*) as row_count,
            min(datetime_beginning_ept) as min_ept,
            max(datetime_beginning_ept) as max_ept
          from pjm.hrl_load_prelim
          group by load_area
        )
        select
          load_area,
          sum(row_count)::bigint as row_count,
          to_char(min(min_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as min_ept,
          to_char(max(max_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as max_ept
        from area_rows
        group by load_area
        order by case when load_area in ('DOM', 'RTO', 'RTO_COMBINED') then 0 else 1 end, load_area
      `,
    );
  }

  if (source === "metered") {
    return query<AreaRow>(
      `
        select
          load_area,
          count(*) as row_count,
          to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as min_ept,
          to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as max_ept
        from pjm.hrl_load_metered
        group by load_area
        order by case when load_area in ('RTO', 'RTO_COMBINED') then 0 else 1 end, load_area
      `,
    );
  }

  return query<AreaRow>(
    `
      select
        load_area,
        count(*) as row_count,
        to_char(min(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as min_ept,
        to_char(max(datetime_beginning_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as max_ept
      from pjm.hrl_load_prelim
      group by load_area
      order by case when load_area in ('RTO', 'RTO_COMBINED') then 0 else 1 end, load_area
    `,
  );
}

async function weatherStations(region: string): Promise<WeatherStationRow[]> {
  return query<WeatherStationRow>(
    `
      select distinct on (station_id)
        station_id,
        station_name,
        region
      from weather.wsi_hourly_observed_temperatures
      where region = $1
        and observation_time_local >= current_date - interval '120 days'
      order by station_id, observation_time_local desc
    `,
    [region],
  );
}

async function coverage(source: LoadSource, region: string, stationId: string): Promise<CoverageRow> {
  const loadCoverageSql =
    source === "preferred"
      ? `
        select
          min(datetime_beginning_ept) as load_min_ept,
          max(datetime_beginning_ept) as load_max_ept,
          max(updated_at) as load_latest_update
        from (
          select datetime_beginning_ept, updated_at
          from pjm.hrl_load_metered
          where is_verified
          union all
          select datetime_beginning_ept, updated_at
          from pjm.hrl_load_prelim
        ) load_union
      `
      : `
        select
          min(datetime_beginning_ept) as load_min_ept,
          max(datetime_beginning_ept) as load_max_ept,
          max(updated_at) as load_latest_update
        from ${source === "metered" ? "pjm.hrl_load_metered" : "pjm.hrl_load_prelim"}
        ${source === "metered" ? "where is_verified" : ""}
      `;
  const rows = await query<CoverageRow>(
    `
      with load_coverage as (
        ${loadCoverageSql}
      ),
      weather_coverage as (
        select
          min(observation_time_local) as weather_min_local,
          max(observation_time_local) as weather_max_local,
          max(updated_at) as weather_latest_update
        from weather.wsi_hourly_observed_temperatures
        where station_id = $1
          and region = $2
      )
      select
        to_char(load_min_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as load_min_ept,
        to_char(load_max_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as load_max_ept,
        to_char(load_latest_update, 'YYYY-MM-DD"T"HH24:MI:SSOF') as load_latest_update,
        to_char(weather_min_local, 'YYYY-MM-DD"T"HH24:MI:SS') as weather_min_local,
        to_char(weather_max_local, 'YYYY-MM-DD"T"HH24:MI:SS') as weather_max_local,
        to_char(weather_latest_update, 'YYYY-MM-DD"T"HH24:MI:SSOF') as weather_latest_update
      from load_coverage, weather_coverage
    `,
    [stationId, region],
  );
  return (
    rows[0] ?? {
      load_min_ept: null,
      load_max_ept: null,
      load_latest_update: null,
      weather_min_local: null,
      weather_max_local: null,
      weather_latest_update: null,
    }
  );
}

function defaultWindow(coverageRow: CoverageRow): { startDate: string; endDate: string } {
  const loadMax = toDate(coverageRow.load_max_ept);
  const weatherMax = toDate(coverageRow.weather_max_local);
  const defaultEnd = minDate(loadMax, weatherMax) ?? loadMax ?? weatherMax ?? new Date();
  const defaultStart = addDays(defaultEnd, -6);
  return { startDate: dateOnly(defaultStart), endDate: dateOnly(defaultEnd) };
}

function boundedWindow({
  requestedStart,
  requestedEnd,
  coverageRow,
}: {
  requestedStart: Date | null;
  requestedEnd: Date | null;
  coverageRow: CoverageRow;
}) {
  const fallback = defaultWindow(coverageRow);
  let start = requestedStart ?? parseDate(fallback.startDate)!;
  const end = requestedEnd ?? parseDate(fallback.endDate)!;

  if (start > end) {
    start = end;
  }
  if (dayDiff(start, end) >= MAX_RANGE_DAYS) {
    start = addDays(end, -(MAX_RANGE_DAYS - 1));
  }

  return {
    start,
    end,
    startDate: dateOnly(start),
    endDate: dateOnly(end),
    clamped: Boolean(
      (requestedStart && dateOnly(requestedStart) !== dateOnly(start)) ||
        (requestedEnd && dateOnly(requestedEnd) !== dateOnly(end)),
    ),
  };
}

function resolveDateSelection({
  dateMode,
  lookbackDays,
  requestedStart,
  requestedEnd,
  selectedMonth,
  selectedYears,
  coverageRow,
}: {
  dateMode: DateMode;
  lookbackDays: number;
  requestedStart: Date | null;
  requestedEnd: Date | null;
  selectedMonth: number;
  selectedYears: number[];
  coverageRow: CoverageRow;
}) {
  if (dateMode === "month-years") {
    const startDate = `${selectedYears[0]}-${String(selectedMonth).padStart(2, "0")}-01`;
    const endYear = selectedYears[selectedYears.length - 1] ?? selectedYears[0];
    const endDate = dateOnly(new Date(Date.UTC(endYear, selectedMonth, 0)));
    return {
      dateMode,
      startDate,
      endDate,
      lookbackDays,
      month: selectedMonth,
      years: selectedYears,
      clamped: false,
    };
  }

  if (dateMode === "range") {
    const window = boundedWindow({ requestedStart, requestedEnd, coverageRow });
    return {
      dateMode,
      startDate: window.startDate,
      endDate: window.endDate,
      lookbackDays,
      month: selectedMonth,
      years: selectedYears,
      clamped: window.clamped,
    };
  }

  const fallback = defaultWindow(coverageRow);
  const end = requestedEnd ?? parseDate(fallback.endDate)!;
  const start = addDays(end, -(lookbackDays - 1));
  const window = boundedWindow({ requestedStart: start, requestedEnd: end, coverageRow });
  return {
    dateMode,
    startDate: window.startDate,
    endDate: window.endDate,
    lookbackDays,
    month: selectedMonth,
    years: selectedYears,
    clamped: window.clamped,
  };
}

async function hourlyRows({
  source,
  area,
  region,
  stationId,
  startDate,
  endDate,
  dateMode,
  month,
  years,
}: {
  source: LoadSource;
  area: string;
  region: string;
  stationId: string;
  startDate: string;
  endDate: string;
  dateMode: DateMode;
  month: number;
  years: number[];
}): Promise<HourlyRow[]> {
  if (source === "preferred") {
    return query<HourlyRow>(
      `
        with load_candidates as (
          select
            datetime_beginning_ept,
            load_area,
            sum(mw)::float8 as load_mw,
            count(*)::int as load_component_count,
            max(updated_at) as load_updated_at,
            'metered'::text as load_source,
            1 as priority
          from pjm.hrl_load_metered
          where load_area = $1
            and is_verified
            and (
              ($6::text = 'month-years'
                and extract(month from datetime_beginning_ept)::int = $7::int
                and extract(year from datetime_beginning_ept)::int = any($8::int[]))
              or ($6::text <> 'month-years'
                and datetime_beginning_ept >= $4::date
                and datetime_beginning_ept < ($5::date + interval '1 day'))
            )
          group by datetime_beginning_ept, load_area
          union all
          select
            datetime_beginning_ept,
            load_area,
            prelim_load_avg_hourly::float8 as load_mw,
            1::int as load_component_count,
            updated_at as load_updated_at,
            'prelim'::text as load_source,
            2 as priority
          from pjm.hrl_load_prelim
          where load_area = $1
            and (
              ($6::text = 'month-years'
                and extract(month from datetime_beginning_ept)::int = $7::int
                and extract(year from datetime_beginning_ept)::int = any($8::int[]))
              or ($6::text <> 'month-years'
                and datetime_beginning_ept >= $4::date
                and datetime_beginning_ept < ($5::date + interval '1 day'))
            )
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
        )
        select
          to_char(l.datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
          l.load_area,
          l.load_source,
          l.load_mw,
          l.load_component_count,
          w.station_id as weather_station_id,
          w.station_name as weather_station_name,
          w.region,
          w.temp_f::float8 as temp_f,
          w.dew_point_f::float8 as dew_point_f,
          w.feels_like_f::float8 as feels_like_f,
          w.wind_chill_f::float8 as wind_chill_f,
          w.heat_index_f::float8 as heat_index_f,
          w.wind_speed_mph::float8 as wind_speed_mph,
          w.relative_humidity_pct::float8 as relative_humidity_pct,
          w.cloud_cover_pct::float8 as cloud_cover_pct,
          w.precip_in::float8 as precip_in,
          to_char(l.load_updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as load_updated_at,
          to_char(w.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as weather_updated_at
        from load_hourly l
        join weather.wsi_hourly_observed_temperatures w
          on w.observation_time_local = l.datetime_beginning_ept
         and w.station_id = $2
         and w.region = $3
        order by l.datetime_beginning_ept
      `,
      [area, stationId, region, startDate, endDate, dateMode, month, years],
    );
  }

  if (source === "metered") {
    return query<HourlyRow>(
      `
        with load_hourly as (
          select
            datetime_beginning_ept,
            load_area,
            sum(mw)::float8 as load_mw,
            count(*)::int as load_component_count,
            max(updated_at) as load_updated_at
          from pjm.hrl_load_metered
          where load_area = $1
            and is_verified
            and (
              ($6::text = 'month-years'
                and extract(month from datetime_beginning_ept)::int = $7::int
                and extract(year from datetime_beginning_ept)::int = any($8::int[]))
              or ($6::text <> 'month-years'
                and datetime_beginning_ept >= $4::date
                and datetime_beginning_ept < ($5::date + interval '1 day'))
            )
          group by datetime_beginning_ept, load_area
        )
        select
          to_char(l.datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
          l.load_area,
          'metered'::text as load_source,
          l.load_mw,
          l.load_component_count,
          w.station_id as weather_station_id,
          w.station_name as weather_station_name,
          w.region,
          w.temp_f::float8 as temp_f,
          w.dew_point_f::float8 as dew_point_f,
          w.feels_like_f::float8 as feels_like_f,
          w.wind_chill_f::float8 as wind_chill_f,
          w.heat_index_f::float8 as heat_index_f,
          w.wind_speed_mph::float8 as wind_speed_mph,
          w.relative_humidity_pct::float8 as relative_humidity_pct,
          w.cloud_cover_pct::float8 as cloud_cover_pct,
          w.precip_in::float8 as precip_in,
          to_char(l.load_updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as load_updated_at,
          to_char(w.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as weather_updated_at
        from load_hourly l
        join weather.wsi_hourly_observed_temperatures w
          on w.observation_time_local = l.datetime_beginning_ept
         and w.station_id = $2
         and w.region = $3
        order by l.datetime_beginning_ept
      `,
      [area, stationId, region, startDate, endDate, dateMode, month, years],
    );
  }

  return query<HourlyRow>(
    `
      with load_hourly as (
        select
          datetime_beginning_ept,
          load_area,
          prelim_load_avg_hourly::float8 as load_mw,
          1::int as load_component_count,
          updated_at as load_updated_at
        from pjm.hrl_load_prelim
        where load_area = $1
          and (
            ($6::text = 'month-years'
              and extract(month from datetime_beginning_ept)::int = $7::int
              and extract(year from datetime_beginning_ept)::int = any($8::int[]))
            or ($6::text <> 'month-years'
              and datetime_beginning_ept >= $4::date
              and datetime_beginning_ept < ($5::date + interval '1 day'))
          )
      )
      select
        to_char(l.datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
        l.load_area,
        'prelim'::text as load_source,
        l.load_mw,
        l.load_component_count,
        w.station_id as weather_station_id,
        w.station_name as weather_station_name,
        w.region,
        w.temp_f::float8 as temp_f,
        w.dew_point_f::float8 as dew_point_f,
        w.feels_like_f::float8 as feels_like_f,
        w.wind_chill_f::float8 as wind_chill_f,
        w.heat_index_f::float8 as heat_index_f,
        w.wind_speed_mph::float8 as wind_speed_mph,
        w.relative_humidity_pct::float8 as relative_humidity_pct,
        w.cloud_cover_pct::float8 as cloud_cover_pct,
        w.precip_in::float8 as precip_in,
        to_char(l.load_updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as load_updated_at,
        to_char(w.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as weather_updated_at
      from load_hourly l
      join weather.wsi_hourly_observed_temperatures w
        on w.observation_time_local = l.datetime_beginning_ept
       and w.station_id = $2
       and w.region = $3
      order by l.datetime_beginning_ept
    `,
    [area, stationId, region, startDate, endDate, dateMode, month, years],
  );
}

function normalize(row: HourlyRow): HourlyPoint {
  const datetimeBeginningEpt = isoLocal(row.datetime_beginning_ept) ?? row.datetime_beginning_ept;
  const hour = Number(datetimeBeginningEpt.slice(11, 13));
  return {
    datetimeBeginningEpt,
    date: datetimeBeginningEpt.slice(0, 10),
    hourEnding: hour + 1,
    source: row.load_source,
    loadArea: row.load_area,
    loadMw: toNumber(row.load_mw),
    loadComponentCount: Number(row.load_component_count) || 0,
    weatherStationId: row.weather_station_id,
    weatherStationName: row.weather_station_name ?? row.weather_station_id,
    region: row.region,
    tempF: toNumber(row.temp_f),
    dewPointF: toNumber(row.dew_point_f),
    feelsLikeF: toNumber(row.feels_like_f),
    windChillF: toNumber(row.wind_chill_f),
    heatIndexF: toNumber(row.heat_index_f),
    windSpeedMph: toNumber(row.wind_speed_mph),
    relativeHumidityPct: toNumber(row.relative_humidity_pct),
    cloudCoverPct: toNumber(row.cloud_cover_pct),
    precipIn: toNumber(row.precip_in),
    loadUpdatedAt: isoLocal(row.load_updated_at),
    weatherUpdatedAt: isoLocal(row.weather_updated_at),
  };
}

function dailySummary(rows: HourlyPoint[]) {
  const byDate = new Map<string, HourlyPoint[]>();
  rows.forEach((row) => byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]));
  return Array.from(byDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, dateRows]) => ({
      date,
      hourCount: dateRows.length,
      avgLoadMw: avg(dateRows.map((row) => row.loadMw)),
      minLoadMw: min(dateRows.map((row) => row.loadMw)),
      peakLoadMw: max(dateRows.map((row) => row.loadMw)),
      meteredHours: dateRows.filter((row) => row.source === "metered").length,
      prelimHours: dateRows.filter((row) => row.source === "prelim").length,
      avgTempF: avg(dateRows.map((row) => row.tempF)),
      maxTempF: max(dateRows.map((row) => row.tempF)),
      avgDewPointF: avg(dateRows.map((row) => row.dewPointF)),
      avgFeelsLikeF: avg(dateRows.map((row) => row.feelsLikeF)),
      avgWindSpeedMph: avg(dateRows.map((row) => row.windSpeedMph)),
    }));
}

function regression(points: Array<{ x: number; y: number }>): RegressionResult {
  const count = points.length;
  if (count < 3) {
    return { count, slope: null, intercept: null, correlation: null, rSquared: null };
  }
  const xAvg = points.reduce((sum, point) => sum + point.x, 0) / count;
  const yAvg = points.reduce((sum, point) => sum + point.y, 0) / count;
  const numerator = points.reduce(
    (sum, point) => sum + (point.x - xAvg) * (point.y - yAvg),
    0,
  );
  const xVariance = points.reduce((sum, point) => sum + (point.x - xAvg) ** 2, 0);
  const yVariance = points.reduce((sum, point) => sum + (point.y - yAvg) ** 2, 0);
  if (xVariance === 0 || yVariance === 0) {
    return { count, slope: null, intercept: null, correlation: null, rSquared: null };
  }
  const slope = numerator / xVariance;
  const intercept = yAvg - slope * xAvg;
  const correlation = numerator / Math.sqrt(xVariance * yVariance);
  return {
    count,
    slope,
    intercept,
    correlation,
    rSquared: correlation ** 2,
  };
}

function overlapWindow(coverageRow: CoverageRow) {
  const loadMin = toDate(coverageRow.load_min_ept);
  const loadMax = toDate(coverageRow.load_max_ept);
  const weatherMin = toDate(coverageRow.weather_min_local);
  const weatherMax = toDate(coverageRow.weather_max_local);
  if (!loadMin || !loadMax || !weatherMin || !weatherMax) {
    return { overlapStart: null, overlapEnd: null, overlapDays: 0 };
  }
  const start = new Date(Math.max(loadMin.getTime(), weatherMin.getTime()));
  const end = new Date(Math.min(loadMax.getTime(), weatherMax.getTime()));
  if (start > end) {
    return { overlapStart: null, overlapEnd: null, overlapDays: 0 };
  }
  return {
    overlapStart: dateOnly(start),
    overlapEnd: dateOnly(end),
    overlapDays: dayDiff(start, end) + 1,
  };
}

function limitationMessages({
  source,
  area,
  coverageDays,
  rowCount,
  clamped,
  loadMinEpt,
  weatherMinLocal,
}: {
  source: LoadSource;
  area: string;
  coverageDays: number;
  rowCount: number;
  clamped: boolean;
  loadMinEpt: string | null;
  weatherMinLocal: string | null;
}): string[] {
  const loadStart = loadMinEpt?.slice(0, 10) ?? "unknown";
  const weatherStart = weatherMinLocal?.slice(0, 10) ?? "unknown";
  const messages: string[] = [];
  if (coverageDays > 0 && coverageDays < SHORT_HISTORY_DAYS) {
    messages.push(
      `Current promoted overlap is shallow: PJM ${source} load starts ${loadStart}, WSI observed weather starts ${weatherStart}, and this selection has only ${coverageDays} overlapping calendar day${coverageDays === 1 ? "" : "s"}.`,
    );
  }
  if (rowCount === 0) {
    messages.push("No joined hourly load-weather rows are available for the selected source, area, station, and window.");
  }
  if (source === "metered" && area !== "RTO") {
    messages.push(
      "Metered non-RTO areas can include multiple region/zone rows per hour; the API returns an hourly sum with component counts for inspection.",
    );
  }
  if (clamped) {
    messages.push(`The requested date range was clamped to the V0 maximum of ${MAX_RANGE_DAYS} days.`);
  }
  return messages;
}

function emptyPayload({
  source,
  region,
  stationId,
  weatherMetric,
  reason,
}: {
  source: LoadSource;
  region: string;
  stationId: string;
  weatherMetric: WeatherMetric;
  reason: string;
}) {
  const runAt = new Date().toISOString();
  return {
    iso: "pjm",
    source,
    sourceTable: sourceTable(source),
    loadMetric: loadMetricName(source),
    selected: {
      source,
      area: null,
      startDate: null,
      endDate: null,
      dateMode: "lookback",
      lookbackDays: DEFAULT_LOOKBACK_DAYS,
      month: 1,
      years: [new Date().getUTCFullYear()],
      weatherStation: stationId,
      region,
      maxRangeDays: MAX_RANGE_DAYS,
    },
    availableAreas: [],
    weatherStations: [],
    coverage: {
      loadMinEpt: null,
      loadMaxEpt: null,
      weatherMinLocal: null,
      weatherMaxLocal: null,
      overlapStart: null,
      overlapEnd: null,
      overlapDays: 0,
      selectedJoinedHours: 0,
    },
    freshness: {
      status: "Unavailable",
      asOf: null,
      loadLatestUpdate: null,
      weatherLatestUpdate: null,
      runAt,
      reason,
    },
    warnings: [reason],
    rowCount: 0,
    hourly: [],
    daily: [],
    scatter: { metric: weatherMetric, points: [], regression: regression([]) },
  };
}

export const GET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const source = parseSource(searchParams.get("source"));
  const weatherMetric = parseWeatherMetric(searchParams.get("weatherMetric"));
  const loadShape = parseLoadShape(searchParams.get("loadShape"));
  const dayType = parseDayType(searchParams.get("dayType"));
  const dateMode = parseDateMode(searchParams.get("dateMode"));
  const lookbackDays = parseLookbackDays(searchParams.get("lookbackDays"));
  const selectedMonth = parseMonth(searchParams.get("month"));
  const selectedYears = parseYears(searchParams.get("years"));
  const region = parseIdentifier(searchParams.get("region"), DEFAULT_REGION);
  const requestedStation = parseIdentifier(
    searchParams.get("weatherStation"),
    DEFAULT_WEATHER_STATION,
  );

  const requiredTables =
    source === "preferred"
      ? ["pjm.hrl_load_metered", "pjm.hrl_load_prelim", "weather.wsi_hourly_observed_temperatures"]
      : [sourceTable(source), "weather.wsi_hourly_observed_temperatures"];
  for (const table of requiredTables) {
    if (!(await tableAvailable(table))) {
      const payload = emptyPayload({
        source,
        region,
        stationId: requestedStation,
        weatherMetric,
        reason: `${table} is not available`,
      });
      return {
        payload,
        headers: { "Cache-Control": "no-store", "X-Pjm-Load-Growth-Cache": "MISS" },
        rowCount: 0,
        dataAsOf: "unavailable",
      };
    }
  }

  const [areas, stations] = await Promise.all([loadAreas(source), weatherStations(region)]);
  const availableAreas = areas.map((row) => ({
    area: row.load_area,
    rowCount: Number(row.row_count) || 0,
    minEpt: isoLocal(row.min_ept),
    maxEpt: isoLocal(row.max_ept),
  }));
  const areaNames = availableAreas.map((row) => row.area);
  const fallbackArea =
    areaNames.find((area) => area === "RTO" || area === "RTO_COMBINED") ?? areaNames[0] ?? null;
  if (!fallbackArea) {
    const payload = emptyPayload({
      source,
      region,
      stationId: requestedStation,
      weatherMetric,
      reason: `No ${source} PJM load areas are available`,
    });
    return {
      status: 404,
      payload,
      headers: { "Cache-Control": "no-store", "X-Pjm-Load-Growth-Cache": "MISS" },
      rowCount: 0,
      dataAsOf: "empty",
    };
  }

  const requestedArea = parseIdentifier(
    searchParams.get("loadArea") ?? searchParams.get("area"),
    fallbackArea,
  );
  const area = areaNames.includes(requestedArea) ? requestedArea : fallbackArea;
  const stationIds = stations.map((station) => station.station_id);
  const weatherStation = stationIds.includes(requestedStation)
    ? requestedStation
    : stationIds.includes(DEFAULT_WEATHER_STATION)
      ? DEFAULT_WEATHER_STATION
      : stationIds[0] ?? DEFAULT_WEATHER_STATION;
  const coverageRow = await coverage(source, region, weatherStation);
  const dateSelection = resolveDateSelection({
    dateMode,
    lookbackDays,
    requestedStart: parseDate(searchParams.get("start")),
    requestedEnd: parseDate(searchParams.get("end")),
    selectedMonth,
    selectedYears,
    coverageRow,
  });
  const rows = filterHourlyRows((await hourlyRows({
    source,
    area,
    region,
    stationId: weatherStation,
    startDate: dateSelection.startDate,
    endDate: dateSelection.endDate,
    dateMode,
    month: selectedMonth,
    years: selectedYears,
  })).map((row) => normalize(row)), loadShape, dayType);
  const daily = dailySummary(rows);
  const overlap = overlapWindow(coverageRow);
  const scatterPoints = rows
    .map((row) => ({
      datetimeBeginningEpt: row.datetimeBeginningEpt,
      x: weatherMetricValue(row, weatherMetric),
      y: row.loadMw,
      tempF: row.tempF,
      loadMw: row.loadMw,
    }))
    .filter(
      (row): row is {
        datetimeBeginningEpt: string;
        x: number;
        y: number;
        tempF: number | null;
        loadMw: number | null;
      } => row.x !== null && row.y !== null,
    );
  const loadLatest = rows.reduce<string | null>(
    (best, row) => (row.loadUpdatedAt && (!best || row.loadUpdatedAt > best) ? row.loadUpdatedAt : best),
    null,
  );
  const weatherLatest = rows.reduce<string | null>(
    (best, row) =>
      row.weatherUpdatedAt && (!best || row.weatherUpdatedAt > best) ? row.weatherUpdatedAt : best,
    null,
  );
  const asOf = [coverageRow.load_max_ept, coverageRow.weather_max_local]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const warnings = limitationMessages({
    source,
    area,
    coverageDays: overlap.overlapDays,
    rowCount: rows.length,
    clamped: dateSelection.clamped,
    loadMinEpt: isoLocal(coverageRow.load_min_ept),
    weatherMinLocal: isoLocal(coverageRow.weather_min_local),
  });

  return {
    payload: {
      iso: "pjm",
      source,
      sourceTable: sourceTable(source),
      loadMetric: loadMetricName(source),
      selected: {
        source,
        area,
        startDate: dateSelection.startDate,
        endDate: dateSelection.endDate,
        dateMode,
        lookbackDays,
        month: selectedMonth,
        years: selectedYears,
        weatherStation,
        region,
        maxRangeDays: MAX_RANGE_DAYS,
        loadShape,
        dayType,
      },
      availableAreas,
      weatherStations: stations.map((station) => ({
        stationId: station.station_id,
        stationName: station.station_name ?? station.station_id,
        region: station.region,
      })),
      coverage: {
        loadMinEpt: isoLocal(coverageRow.load_min_ept),
        loadMaxEpt: isoLocal(coverageRow.load_max_ept),
        weatherMinLocal: isoLocal(coverageRow.weather_min_local),
        weatherMaxLocal: isoLocal(coverageRow.weather_max_local),
        loadLatestUpdate: isoLocal(coverageRow.load_latest_update),
        weatherLatestUpdate: isoLocal(coverageRow.weather_latest_update),
        ...overlap,
        selectedJoinedHours: rows.length,
      },
      freshness: {
        status: rows.length > 0 ? "Limited" : "No overlap",
        asOf: isoLocal(asOf),
        loadLatestUpdate: loadLatest ?? isoLocal(coverageRow.load_latest_update),
        weatherLatestUpdate: weatherLatest ?? isoLocal(coverageRow.weather_latest_update),
        runAt: new Date().toISOString(),
        reason: warnings[0],
      },
      warnings,
      rowCount: rows.length,
      summary: {
        avgLoadMw: avg(rows.map((row) => row.loadMw)),
        peakLoadMw: max(rows.map((row) => row.loadMw)),
        minLoadMw: min(rows.map((row) => row.loadMw)),
        avgTempF: avg(rows.map((row) => row.tempF)),
        maxTempF: max(rows.map((row) => row.tempF)),
        avgDewPointF: avg(rows.map((row) => row.dewPointF)),
        avgFeelsLikeF: avg(rows.map((row) => row.feelsLikeF)),
      },
      hourly: rows,
      daily,
      scatter: {
        metric: weatherMetric,
        points: scatterPoints,
        regression: regression(scatterPoints.map((point) => ({ x: point.x, y: point.y }))),
      },
    },
    headers: { "Cache-Control": CACHE_HEADER, "X-Pjm-Load-Growth-Cache": "MISS" },
    rowCount: rows.length,
    dataAsOf: isoLocal(asOf) ?? (rows.length ? rows.at(-1)?.datetimeBeginningEpt : "empty"),
  };
});
