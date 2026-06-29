import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";
import { isNetLoadForecastDevEnabled } from "@/lib/server/devFeatures";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ANCHOR_TOLERANCE_MS = 6 * 3_600_000;
const DELTA_WINDOWS = [1, 12, 24, 48, 72] as const;
const ROUTE_CONFIG = {
  route: "/api/pjm-net-load-forecast-explorer",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "Local-dev PJM net load forecast explorer summary",
  p95TargetMs: 1_500,
  freshnessSource:
    "pjm.load_frcstd_7_day.evaluated_at_datetime_ept or meteologica.pjm_forecast_hourly.issue_date",
} as const;

interface SummaryRow {
  forecast_area: string;
  forecast_date: string;
  evaluated_at_ept: string;
  vintage_count: number | string;
  net_flat_avg: number | string | null;
  net_on_peak_avg: number | string | null;
  net_off_peak_avg: number | string | null;
  net_peak_mw: number | string | null;
  net_min_mw: number | string | null;
  load_peak_mw: number | string | null;
  load_on_peak_avg: number | string | null;
  load_off_peak_avg: number | string | null;
  load_flat_avg: number | string | null;
  solar_peak_mw: number | string | null;
  solar_on_peak_avg: number | string | null;
  solar_off_peak_avg: number | string | null;
  solar_flat_avg: number | string | null;
  wind_peak_mw: number | string | null;
  wind_on_peak_avg: number | string | null;
  wind_off_peak_avg: number | string | null;
  wind_flat_avg: number | string | null;
  renewable_flat_avg: number | string | null;
  complete_hour_count: number | string;
  updated_at: string | null;
}

interface MetricSummary {
  netFlatAvg: number | null;
  netOnPeakAvg: number | null;
  netOffPeakAvg: number | null;
  netPeakMw: number | null;
  netMinMw: number | null;
  loadPeakMw: number | null;
  loadOnPeakAvg: number | null;
  loadOffPeakAvg: number | null;
  loadFlatAvg: number | null;
  solarPeakMw: number | null;
  solarOnPeakAvg: number | null;
  solarOffPeakAvg: number | null;
  solarFlatAvg: number | null;
  windPeakMw: number | null;
  windOnPeakAvg: number | null;
  windOffPeakAvg: number | null;
  windFlatAvg: number | null;
  renewableFlatAvg: number | null;
}

interface DeltaSummary extends MetricSummary {
  hours: number;
  anchorEvaluatedAtEpt: string;
}

interface ExplorerCell extends MetricSummary {
  area: string;
  forecastDate: string;
  vintageCount: number;
  latestEvaluatedAtEpt: string;
  completeHourCount: number;
  deltas: Record<string, DeltaSummary | null>;
}

type ForecastSourceMode = "pjm" | "meteologica";

interface SourceConfig {
  mode: ForecastSourceMode;
  source: string;
  sourceLabel: string;
  summarySql: string;
  coverageNote: string;
  noDataMessage: string;
}

const FORMULA = "net_load_mw = load - solar - wind";
const METEOLOGICA_COVERAGE_NOTE =
  "Meteologica mode pairs each regional load issue to the latest prior non-null solar and wind forecast for the same forecast area and hour. Rows include only forecast hours where load, solar, and wind all have non-null MW values.";
const PJM_COVERAGE_NOTE =
  "PJM mode uses RTO_COMBINED load, solar_forecast_mwh, and wind_forecast_mwh. Rows include only forecast hours where load, solar, and wind all have non-null MW values.";

const METEOLOGICA_SUMMARY_SQL = `
  with load_issues as (
    select
      forecast_area,
      forecast_period_start::date as forecast_date,
      issue_date
    from meteologica.pjm_forecast_hourly
    where region = 'PJM'
      and metric = 'load'
      and forecast_area is not null
      and issue_date is not null
      and forecast_mw is not null
      and forecast_period_start::date >= current_date
    group by
      forecast_area,
      forecast_period_start::date,
      issue_date
  ),
  issue_stats as (
    select
      forecast_area,
      forecast_date,
      max(issue_date) as latest_issue_date,
      count(*) as vintage_count
    from load_issues
    group by
      forecast_area,
      forecast_date
  ),
  selected_issues as (
    select
      forecast_area,
      forecast_date,
      latest_issue_date as issue_date,
      vintage_count
    from issue_stats
    union
    select
      issue_stats.forecast_area,
      issue_stats.forecast_date,
      anchor.issue_date,
      issue_stats.vintage_count
    from issue_stats
    cross join (values (1), (12), (24), (48), (72)) as lag_hours(hours)
    join lateral (
      select load_issues.issue_date
      from load_issues
      where load_issues.forecast_area = issue_stats.forecast_area
        and load_issues.forecast_date = issue_stats.forecast_date
        and load_issues.issue_date <> issue_stats.latest_issue_date
        and abs(
          extract(
            epoch from (
              load_issues.issue_date
              - (issue_stats.latest_issue_date - (lag_hours.hours::text || ' hours')::interval)
            )
          )
        ) <= ${ANCHOR_TOLERANCE_MS / 1000}
      order by
        abs(
          extract(
            epoch from (
              load_issues.issue_date
              - (issue_stats.latest_issue_date - (lag_hours.hours::text || ' hours')::interval)
            )
          )
        ),
        load_issues.issue_date desc
      limit 1
    ) anchor on true
  ),
  load_rows as (
    select
      selected_issues.forecast_area,
      selected_issues.forecast_date,
      selected_issues.issue_date as evaluated_at_ept,
      selected_issues.vintage_count,
      load.forecast_period_start,
      load.forecast_mw as load_mw,
      load.updated_at as load_updated_at
    from selected_issues
    join meteologica.pjm_forecast_hourly as load
      on load.region = 'PJM'
      and load.forecast_area = selected_issues.forecast_area
      and load.metric = 'load'
      and load.issue_date = selected_issues.issue_date
      and load.forecast_period_start::date = selected_issues.forecast_date
      and load.forecast_mw is not null
  ),
  paired_components as (
    select
      load_rows.forecast_date,
      load_rows.forecast_area,
      load_rows.evaluated_at_ept,
      load_rows.vintage_count,
      load_rows.forecast_period_start,
      load_rows.load_mw,
      solar_mw,
      wind_mw,
      greatest(
        load_rows.load_updated_at,
        coalesce(solar_updated_at, load_rows.load_updated_at),
        coalesce(wind_updated_at, load_rows.load_updated_at)
      ) as updated_at
    from load_rows
    join lateral (
      select
        forecast_mw as solar_mw,
        updated_at as solar_updated_at
      from meteologica.pjm_forecast_hourly as solar
      where solar.region = 'PJM'
        and solar.forecast_area = load_rows.forecast_area
        and solar.metric = 'solar'
        and solar.forecast_period_start = load_rows.forecast_period_start
        and solar.issue_date <= load_rows.evaluated_at_ept
        and solar.forecast_mw is not null
      order by solar.issue_date desc
      limit 1
    ) solar on true
    join lateral (
      select
        forecast_mw as wind_mw,
        updated_at as wind_updated_at
      from meteologica.pjm_forecast_hourly as wind
      where wind.region = 'PJM'
        and wind.forecast_area = load_rows.forecast_area
        and wind.metric = 'wind'
        and wind.forecast_period_start = load_rows.forecast_period_start
        and wind.issue_date <= load_rows.evaluated_at_ept
        and wind.forecast_mw is not null
      order by wind.issue_date desc
      limit 1
    ) wind on true
  ),
  net_hourly as (
    select
      forecast_date,
      forecast_area,
      evaluated_at_ept,
      vintage_count,
      forecast_period_start,
      load_mw,
      solar_mw,
      wind_mw,
      case
        when load_mw is null or solar_mw is null or wind_mw is null then null
        else load_mw - solar_mw - wind_mw
      end as net_load_mw,
      updated_at
    from paired_components
  )
  select
    forecast_date::text as forecast_date,
    forecast_area,
    to_char(evaluated_at_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
    max(vintage_count) as vintage_count,
    avg(net_load_mw)::float8 as net_flat_avg,
    avg(net_load_mw) filter (
      where extract(hour from forecast_period_start)::int between 7 and 22
    )::float8 as net_on_peak_avg,
    avg(net_load_mw) filter (
      where extract(hour from forecast_period_start)::int < 7
         or extract(hour from forecast_period_start)::int > 22
    )::float8 as net_off_peak_avg,
    max(net_load_mw)::float8 as net_peak_mw,
    min(net_load_mw)::float8 as net_min_mw,
    max(load_mw)::float8 as load_peak_mw,
    avg(load_mw) filter (
      where extract(hour from forecast_period_start)::int between 7 and 22
    )::float8 as load_on_peak_avg,
    avg(load_mw) filter (
      where extract(hour from forecast_period_start)::int < 7
         or extract(hour from forecast_period_start)::int > 22
    )::float8 as load_off_peak_avg,
    avg(load_mw)::float8 as load_flat_avg,
    max(solar_mw)::float8 as solar_peak_mw,
    avg(solar_mw) filter (
      where extract(hour from forecast_period_start)::int between 7 and 22
    )::float8 as solar_on_peak_avg,
    avg(solar_mw) filter (
      where extract(hour from forecast_period_start)::int < 7
         or extract(hour from forecast_period_start)::int > 22
    )::float8 as solar_off_peak_avg,
    avg(solar_mw)::float8 as solar_flat_avg,
    max(wind_mw)::float8 as wind_peak_mw,
    avg(wind_mw) filter (
      where extract(hour from forecast_period_start)::int between 7 and 22
    )::float8 as wind_on_peak_avg,
    avg(wind_mw) filter (
      where extract(hour from forecast_period_start)::int < 7
         or extract(hour from forecast_period_start)::int > 22
    )::float8 as wind_off_peak_avg,
    avg(wind_mw)::float8 as wind_flat_avg,
    avg(solar_mw + wind_mw)::float8 as renewable_flat_avg,
    count(*) filter (where net_load_mw is not null) as complete_hour_count,
    to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
  from net_hourly
  where net_load_mw is not null
  group by
    forecast_area,
    forecast_date,
    evaluated_at_ept
  order by forecast_area, forecast_date, evaluated_at_ept
`;

const PJM_SUMMARY_SQL = `
  with load_rows as (
    select
      'RTO'::text as forecast_area,
      forecast_datetime_beginning_ept::date as forecast_date,
      evaluated_at_datetime_ept as evaluated_at_ept,
      evaluated_at_datetime_utc as evaluated_at_utc,
      forecast_datetime_beginning_ept as forecast_period_start_ept,
      forecast_datetime_beginning_utc as forecast_period_start_utc,
      forecast_load_mw as load_mw,
      updated_at as load_updated_at
    from pjm.load_frcstd_7_day
    where forecast_area = 'RTO_COMBINED'
      and evaluated_at_datetime_ept is not null
      and evaluated_at_datetime_utc is not null
      and forecast_datetime_beginning_ept is not null
      and forecast_datetime_beginning_utc is not null
      and forecast_load_mw is not null
      and forecast_datetime_beginning_ept::date >= current_date
  ),
  paired_components as (
    select
      load_rows.forecast_date,
      load_rows.forecast_area,
      load_rows.evaluated_at_ept,
      load_rows.forecast_period_start_ept,
      load_rows.load_mw,
      solar_mw,
      wind_mw,
      greatest(
        load_rows.load_updated_at,
        coalesce(solar_updated_at, load_rows.load_updated_at),
        coalesce(wind_updated_at, load_rows.load_updated_at)
      ) as updated_at
    from load_rows
    join lateral (
      select
        solar_forecast_mwh as solar_mw,
        updated_at as solar_updated_at
      from pjm.hourly_solar_power_forecast as solar
      where solar.datetime_beginning_utc = load_rows.forecast_period_start_utc
        and solar.evaluated_at_utc is not null
        and solar.evaluated_at_utc <= load_rows.evaluated_at_utc
        and solar.solar_forecast_mwh is not null
      order by solar.evaluated_at_utc desc
      limit 1
    ) solar on true
    join lateral (
      select
        wind_forecast_mwh as wind_mw,
        updated_at as wind_updated_at
      from pjm.hourly_wind_power_forecast as wind
      where wind.datetime_beginning_utc = load_rows.forecast_period_start_utc
        and wind.evaluated_at_utc is not null
        and wind.evaluated_at_utc <= load_rows.evaluated_at_utc
        and wind.wind_forecast_mwh is not null
      order by wind.evaluated_at_utc desc
      limit 1
    ) wind on true
  ),
  net_hourly as (
    select
      forecast_date,
      forecast_area,
      evaluated_at_ept,
      forecast_period_start_ept,
      load_mw,
      solar_mw,
      wind_mw,
      case
        when load_mw is null or solar_mw is null or wind_mw is null then null
        else load_mw - solar_mw - wind_mw
      end as net_load_mw,
      updated_at
    from paired_components
  )
  select
    forecast_date::text as forecast_date,
    forecast_area,
    to_char(evaluated_at_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as evaluated_at_ept,
    count(*) over (partition by forecast_area, forecast_date) as vintage_count,
    avg(net_load_mw)::float8 as net_flat_avg,
    avg(net_load_mw) filter (
      where extract(hour from forecast_period_start_ept)::int between 7 and 22
    )::float8 as net_on_peak_avg,
    avg(net_load_mw) filter (
      where extract(hour from forecast_period_start_ept)::int < 7
         or extract(hour from forecast_period_start_ept)::int > 22
    )::float8 as net_off_peak_avg,
    max(net_load_mw)::float8 as net_peak_mw,
    min(net_load_mw)::float8 as net_min_mw,
    max(load_mw)::float8 as load_peak_mw,
    avg(load_mw) filter (
      where extract(hour from forecast_period_start_ept)::int between 7 and 22
    )::float8 as load_on_peak_avg,
    avg(load_mw) filter (
      where extract(hour from forecast_period_start_ept)::int < 7
         or extract(hour from forecast_period_start_ept)::int > 22
    )::float8 as load_off_peak_avg,
    avg(load_mw)::float8 as load_flat_avg,
    max(solar_mw)::float8 as solar_peak_mw,
    avg(solar_mw) filter (
      where extract(hour from forecast_period_start_ept)::int between 7 and 22
    )::float8 as solar_on_peak_avg,
    avg(solar_mw) filter (
      where extract(hour from forecast_period_start_ept)::int < 7
         or extract(hour from forecast_period_start_ept)::int > 22
    )::float8 as solar_off_peak_avg,
    avg(solar_mw)::float8 as solar_flat_avg,
    max(wind_mw)::float8 as wind_peak_mw,
    avg(wind_mw) filter (
      where extract(hour from forecast_period_start_ept)::int between 7 and 22
    )::float8 as wind_on_peak_avg,
    avg(wind_mw) filter (
      where extract(hour from forecast_period_start_ept)::int < 7
         or extract(hour from forecast_period_start_ept)::int > 22
    )::float8 as wind_off_peak_avg,
    avg(wind_mw)::float8 as wind_flat_avg,
    avg(solar_mw + wind_mw)::float8 as renewable_flat_avg,
    count(*) filter (where net_load_mw is not null) as complete_hour_count,
    to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS') as updated_at
  from net_hourly
  where net_load_mw is not null
  group by
    forecast_area,
    forecast_date,
    evaluated_at_ept
  order by forecast_area, forecast_date, evaluated_at_ept
`;

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampMs(value: string): number {
  return new Date(`${value}Z`).getTime();
}

function metrics(row: SummaryRow): MetricSummary {
  return {
    netFlatAvg: toNumber(row.net_flat_avg),
    netOnPeakAvg: toNumber(row.net_on_peak_avg),
    netOffPeakAvg: toNumber(row.net_off_peak_avg),
    netPeakMw: toNumber(row.net_peak_mw),
    netMinMw: toNumber(row.net_min_mw),
    loadPeakMw: toNumber(row.load_peak_mw),
    loadOnPeakAvg: toNumber(row.load_on_peak_avg),
    loadOffPeakAvg: toNumber(row.load_off_peak_avg),
    loadFlatAvg: toNumber(row.load_flat_avg),
    solarPeakMw: toNumber(row.solar_peak_mw),
    solarOnPeakAvg: toNumber(row.solar_on_peak_avg),
    solarOffPeakAvg: toNumber(row.solar_off_peak_avg),
    solarFlatAvg: toNumber(row.solar_flat_avg),
    windPeakMw: toNumber(row.wind_peak_mw),
    windOnPeakAvg: toNumber(row.wind_on_peak_avg),
    windOffPeakAvg: toNumber(row.wind_off_peak_avg),
    windFlatAvg: toNumber(row.wind_flat_avg),
    renewableFlatAvg: toNumber(row.renewable_flat_avg),
  };
}

function diffMetric(latest: number | null, anchor: number | null): number | null {
  return latest === null || anchor === null ? null : latest - anchor;
}

function diffMetrics(latest: MetricSummary, anchor: MetricSummary): MetricSummary {
  return {
    netFlatAvg: diffMetric(latest.netFlatAvg, anchor.netFlatAvg),
    netOnPeakAvg: diffMetric(latest.netOnPeakAvg, anchor.netOnPeakAvg),
    netOffPeakAvg: diffMetric(latest.netOffPeakAvg, anchor.netOffPeakAvg),
    netPeakMw: diffMetric(latest.netPeakMw, anchor.netPeakMw),
    netMinMw: diffMetric(latest.netMinMw, anchor.netMinMw),
    loadPeakMw: diffMetric(latest.loadPeakMw, anchor.loadPeakMw),
    loadOnPeakAvg: diffMetric(latest.loadOnPeakAvg, anchor.loadOnPeakAvg),
    loadOffPeakAvg: diffMetric(latest.loadOffPeakAvg, anchor.loadOffPeakAvg),
    loadFlatAvg: diffMetric(latest.loadFlatAvg, anchor.loadFlatAvg),
    solarPeakMw: diffMetric(latest.solarPeakMw, anchor.solarPeakMw),
    solarOnPeakAvg: diffMetric(latest.solarOnPeakAvg, anchor.solarOnPeakAvg),
    solarOffPeakAvg: diffMetric(latest.solarOffPeakAvg, anchor.solarOffPeakAvg),
    solarFlatAvg: diffMetric(latest.solarFlatAvg, anchor.solarFlatAvg),
    windPeakMw: diffMetric(latest.windPeakMw, anchor.windPeakMw),
    windOnPeakAvg: diffMetric(latest.windOnPeakAvg, anchor.windOnPeakAvg),
    windOffPeakAvg: diffMetric(latest.windOffPeakAvg, anchor.windOffPeakAvg),
    windFlatAvg: diffMetric(latest.windFlatAvg, anchor.windFlatAvg),
    renewableFlatAvg: diffMetric(latest.renewableFlatAvg, anchor.renewableFlatAvg),
  };
}

function pickAnchor(rows: SummaryRow[], latest: SummaryRow, hours: number): SummaryRow | null {
  const targetMs = timestampMs(latest.evaluated_at_ept) - hours * 3_600_000;
  const prior = rows.filter((row) => row.evaluated_at_ept !== latest.evaluated_at_ept);
  const best = prior.reduce<{ row: SummaryRow; diffMs: number } | null>((acc, row) => {
    const diffMs = Math.abs(timestampMs(row.evaluated_at_ept) - targetMs);
    return !acc || diffMs < acc.diffMs ? { row, diffMs } : acc;
  }, null);
  return best && best.diffMs <= ANCHOR_TOLERANCE_MS ? best.row : null;
}

function parseSource(value: string | null): ForecastSourceMode {
  return value?.toLowerCase() === "meteologica" ? "meteologica" : "pjm";
}

function sourceConfig(mode: ForecastSourceMode): SourceConfig {
  if (mode === "meteologica") {
    return {
      mode,
      source: "meteologica.pjm_forecast_hourly",
      sourceLabel: "Meteologica",
      summarySql: METEOLOGICA_SUMMARY_SQL,
      coverageNote: METEOLOGICA_COVERAGE_NOTE,
      noDataMessage: "No Meteologica regional net load forecast data is available",
    };
  }

  return {
    mode,
    source:
      "pjm.load_frcstd_7_day + pjm.hourly_solar_power_forecast + pjm.hourly_wind_power_forecast",
    sourceLabel: "PJM Data Miner",
    summarySql: PJM_SUMMARY_SQL,
    coverageNote: PJM_COVERAGE_NOTE,
    noDataMessage: "No PJM Data Miner RTO net load forecast data is available",
  };
}

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const config = sourceConfig(parseSource(searchParams.get("source")));
  const rows = await query<SummaryRow>(config.summarySql);

  if (!rows.length) {
    return {
      status: 404,
      payload: { error: config.noDataMessage },
      headers: { "Cache-Control": "no-store" },
    };
  }

  const groups = new Map<string, SummaryRow[]>();
  rows.forEach((row) => {
    const key = `${row.forecast_area}|${row.forecast_date}`;
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  });

  const cells: ExplorerCell[] = [];
  groups.forEach((values) => {
    const sorted = values.sort((a, b) => a.evaluated_at_ept.localeCompare(b.evaluated_at_ept));
    const latest = sorted.at(-1)!;
    const latestMetrics = metrics(latest);
    const deltas = Object.fromEntries(
      DELTA_WINDOWS.map((hours) => {
        const anchor = pickAnchor(sorted, latest, hours);
        return [
          `${hours}h`,
          anchor
            ? {
                hours,
                anchorEvaluatedAtEpt: anchor.evaluated_at_ept,
                ...diffMetrics(latestMetrics, metrics(anchor)),
              }
            : null,
        ];
      }),
    ) as Record<string, DeltaSummary | null>;

    cells.push({
      area: latest.forecast_area,
      forecastDate: latest.forecast_date,
      vintageCount: Number(latest.vintage_count),
      latestEvaluatedAtEpt: latest.evaluated_at_ept,
      completeHourCount: Number(latest.complete_hour_count),
      ...latestMetrics,
      deltas,
    });
  });

  const areas = Array.from(new Set(cells.map((row) => row.area))).sort();
  const forecastDates = Array.from(new Set(cells.map((row) => row.forecastDate))).sort();
  const asOf = cells
    .map((row) => row.latestEvaluatedAtEpt)
    .sort()
    .at(-1);
  const latestUpdate = rows
    .map((row) => row.updated_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const totalVintageCount = cells.reduce((sum, row) => sum + row.vintageCount, 0);

  return {
    payload: {
      iso: "pjm",
      area: config.mode === "meteologica" ? "ALL" : "RTO",
      areas,
      source: config.source,
      sourceMode: config.mode,
      sourceLabel: config.sourceLabel,
      formula: FORMULA,
      coverageNote: config.coverageNote,
      asOf,
      latestUpdate,
      forecastDates,
      rowCount: totalVintageCount,
      cellCount: cells.length,
      cells: cells.sort((a, b) =>
        a.area === b.area
          ? a.forecastDate.localeCompare(b.forecastDate)
          : a.area.localeCompare(b.area),
      ),
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount: totalVintageCount,
    dataAsOf: asOf,
  };
});

export async function GET(request: Request): Promise<Response> {
  if (!isNetLoadForecastDevEnabled()) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return observedGET(request);
}
