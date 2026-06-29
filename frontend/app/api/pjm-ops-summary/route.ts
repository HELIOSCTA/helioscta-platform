import { observedJsonRoute } from "@/lib/server/apiObservability";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=60";
const ROUTE_CONFIG = {
  route: "/api/pjm-ops-summary",
  cacheHeader: CACHE_HEADER,
  cachePolicy: "s-maxage=300, stale-while-revalidate=60",
  owner: "frontend",
  purpose: "PJM Operations Summary dashboard data",
  p95TargetMs: 1_500,
  freshnessSource: "PJM Operations Summary generated_at_ept",
} as const;

interface ReferenceRow {
  latest_peak_date: string | null;
  peak_dates: string[] | null;
}

interface FreshnessSourceRow {
  table_name: string;
  row_count: number | string;
  latest_generated: string | null;
  latest_updated_at: string | null;
}

interface RtoPeakSourceRow {
  peak_date: string | null;
  area: string;
  generated_at_ept: string | null;
  projected_peak_datetime_ept: string | null;
  load_forecast: number | string | null;
  internal_scheduled_capacity: number | string | null;
  total_scheduled_capacity: number | string | null;
  operating_reserve: number | string | null;
  scheduled_tie_flow_total: number | string | null;
  unscheduled_steam_capacity: number | string | null;
  capacity_adjustments: number | string | null;
}

interface AreaPeakSourceRow {
  peak_date: string | null;
  area: string;
  generated_at_ept: string | null;
  projected_peak_datetime_ept: string | null;
  pjm_load_forecast: number | string | null;
  internal_scheduled_capacity: number | string | null;
  unscheduled_steam_capacity: number | string | null;
}

interface TransferLimitSourceRow {
  peak_date: string | null;
  transfer_limit_name: string;
  generated_at_ept: string | null;
  projected_peak_datetime_ept: string | null;
  transfer_limit_mw: number | string | null;
}

interface ProjectedTieFlowSourceRow {
  peak_date: string | null;
  interface: string;
  generated_at_ept: string | null;
  projected_peak_datetime_ept: string | null;
  scheduled_tie_flow: number | string | null;
}

interface PrevPeriodDateRow {
  period_date: string | null;
}

interface PrevPeriodSourceRow {
  period_date: string | null;
  area: string;
  generated_at_ept: string | null;
  datetime_beginning_ept: string | null;
  datetime_beginning_utc: string | null;
  datetime_ending_ept: string | null;
  actual_load: number | string | null;
  dispatch_rate: number | string | null;
}

interface MetricStatsSourceRow {
  area: string | null;
  metric_key: string;
  sample_count: number | string;
  min_value: number | string | null;
  min_peak_date: string | null;
  max_value: number | string | null;
  max_peak_date: string | null;
}

function isDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFreshness(row: FreshnessSourceRow) {
  return {
    tableName: row.table_name,
    rowCount: toNumber(row.row_count) ?? 0,
    latestGeneratedAtEpt: row.latest_generated,
    latestUpdatedAt: row.latest_updated_at,
  };
}

function normalizeRtoPeak(row: RtoPeakSourceRow | undefined) {
  if (!row) return null;

  const loadForecastMw = toNumber(row.load_forecast);
  const internalScheduledCapacityMw = toNumber(row.internal_scheduled_capacity);
  const totalScheduledCapacityMw = toNumber(row.total_scheduled_capacity);

  return {
    peakDate: row.peak_date,
    area: row.area,
    generatedAtEpt: row.generated_at_ept,
    projectedPeakDatetimeEpt: row.projected_peak_datetime_ept,
    loadForecastMw,
    internalScheduledCapacityMw,
    totalScheduledCapacityMw,
    operatingReserveMw: toNumber(row.operating_reserve),
    scheduledTieFlowTotalMw: toNumber(row.scheduled_tie_flow_total),
    unscheduledSteamCapacityMw: toNumber(row.unscheduled_steam_capacity),
    capacityAdjustmentsMw: toNumber(row.capacity_adjustments),
    capacityMarginMw:
      loadForecastMw === null || totalScheduledCapacityMw === null
        ? null
        : totalScheduledCapacityMw - loadForecastMw,
    internalCapacityMarginMw:
      loadForecastMw === null || internalScheduledCapacityMw === null
        ? null
        : internalScheduledCapacityMw - loadForecastMw,
  };
}

function normalizeAreaPeak(row: AreaPeakSourceRow | undefined) {
  if (!row) return null;

  const loadForecastMw = toNumber(row.pjm_load_forecast);
  const internalScheduledCapacityMw = toNumber(row.internal_scheduled_capacity);

  return {
    peakDate: row.peak_date,
    area: row.area,
    generatedAtEpt: row.generated_at_ept,
    projectedPeakDatetimeEpt: row.projected_peak_datetime_ept,
    loadForecastMw,
    internalScheduledCapacityMw,
    unscheduledSteamCapacityMw: toNumber(row.unscheduled_steam_capacity),
    capacityMarginMw:
      loadForecastMw === null || internalScheduledCapacityMw === null
        ? null
        : internalScheduledCapacityMw - loadForecastMw,
  };
}

function normalizeTransferLimit(row: TransferLimitSourceRow | undefined) {
  if (!row) return null;

  return {
    peakDate: row.peak_date,
    transferLimitName: row.transfer_limit_name,
    generatedAtEpt: row.generated_at_ept,
    projectedPeakDatetimeEpt: row.projected_peak_datetime_ept,
    transferLimitMw: toNumber(row.transfer_limit_mw),
  };
}

function normalizeProjectedTieFlow(row: ProjectedTieFlowSourceRow | undefined) {
  if (!row) return null;

  return {
    peakDate: row.peak_date,
    interfaceName: row.interface,
    generatedAtEpt: row.generated_at_ept,
    projectedPeakDatetimeEpt: row.projected_peak_datetime_ept,
    scheduledTieFlowMw: toNumber(row.scheduled_tie_flow),
  };
}

function normalizePrevPeriod(row: PrevPeriodSourceRow | undefined) {
  if (!row) return null;

  return {
    periodDate: row.period_date,
    area: row.area,
    generatedAtEpt: row.generated_at_ept,
    datetimeBeginningEpt: row.datetime_beginning_ept,
    datetimeBeginningUtc: row.datetime_beginning_utc,
    datetimeEndingEpt: row.datetime_ending_ept,
    actualLoadMw: toNumber(row.actual_load),
    dispatchRate: toNumber(row.dispatch_rate),
  };
}

function normalizeMetricStats(row: MetricStatsSourceRow) {
  return {
    area: row.area,
    metricKey: row.metric_key,
    sampleCount: toNumber(row.sample_count) ?? 0,
    minValue: toNumber(row.min_value),
    minPeakDate: row.min_peak_date,
    maxValue: toNumber(row.max_value),
    maxPeakDate: row.max_peak_date,
  };
}

const RTO_ROW_SQL = `
  select
    projected_peak_datetime_ept::date::text as peak_date,
    area,
    to_char(generated_at_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as generated_at_ept,
    to_char(projected_peak_datetime_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as projected_peak_datetime_ept,
    load_forecast::float8 as load_forecast,
    internal_scheduled_capacity::float8 as internal_scheduled_capacity,
    total_scheduled_capacity::float8 as total_scheduled_capacity,
    operating_reserve::float8 as operating_reserve,
    scheduled_tie_flow_total::float8 as scheduled_tie_flow_total,
    unscheduled_steam_capacity::float8 as unscheduled_steam_capacity,
    capacity_adjustments::float8 as capacity_adjustments
  from pjm.ops_sum_frcst_peak_rto
`;

const AREA_ROW_SQL = `
  select
    projected_peak_datetime_ept::date::text as peak_date,
    area,
    to_char(generated_at_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as generated_at_ept,
    to_char(projected_peak_datetime_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as projected_peak_datetime_ept,
    pjm_load_forecast::float8 as pjm_load_forecast,
    internal_scheduled_capacity::float8 as internal_scheduled_capacity,
    unscheduled_steam_capacity::float8 as unscheduled_steam_capacity
  from pjm.ops_sum_frcst_peak_area
`;

const TRANSFER_LIMIT_ROW_SQL = `
  select
    projected_peak_datetime_ept::date::text as peak_date,
    transfer_limit_name,
    to_char(generated_at_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as generated_at_ept,
    to_char(projected_peak_datetime_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as projected_peak_datetime_ept,
    transfer_limit_mw::float8 as transfer_limit_mw
  from pjm.ops_sum_frcstd_tran_lim
`;

const PROJECTED_TIE_FLOW_ROW_SQL = `
  select
    projected_peak_datetime_ept::date::text as peak_date,
    interface,
    to_char(generated_at_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as generated_at_ept,
    to_char(projected_peak_datetime_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as projected_peak_datetime_ept,
    scheduled_tie_flow::float8 as scheduled_tie_flow
  from pjm.ops_sum_prjctd_tie_flow
`;

const PREV_PERIOD_BASE_SQL = `
  select
    datetime_beginning_ept::date as period_date,
    area,
    generated_at_ept,
    datetime_beginning_ept,
    datetime_beginning_utc,
    datetime_ending_ept,
    actual_load::float8 as actual_load,
    dispatch_rate::float8 as dispatch_rate
  from pjm.ops_sum_prev_period
`;

const observedGET = observedJsonRoute(ROUTE_CONFIG, async (request: Request) => {
  const { searchParams } = new URL(request.url);

  const [reference] = await query<ReferenceRow>(`
    with ops_dates as (
      select distinct projected_peak_datetime_ept::date as d
      from pjm.ops_sum_frcst_peak_rto
      where projected_peak_datetime_ept is not null
      union
      select distinct projected_peak_datetime_ept::date as d
      from pjm.ops_sum_frcst_peak_area
      where projected_peak_datetime_ept is not null
      union
      select distinct projected_peak_datetime_ept::date as d
      from pjm.ops_sum_frcstd_tran_lim
      where projected_peak_datetime_ept is not null
      union
      select distinct projected_peak_datetime_ept::date as d
      from pjm.ops_sum_prjctd_tie_flow
      where projected_peak_datetime_ept is not null
      union
      select distinct datetime_beginning_ept::date as d
      from pjm.ops_sum_prev_period
      where datetime_beginning_ept is not null
    ),
    recent_ops_dates as (
      select d, d::text as date_text
      from ops_dates
      order by d desc
      limit 45
    )
    select
      (select max(d)::text from ops_dates) as latest_peak_date,
      (select array_agg(date_text order by d desc) from recent_ops_dates) as peak_dates
  `);

  const peakDates = reference?.peak_dates ?? [];
  const selectedDate = isDate(searchParams.get("date"))
    ? searchParams.get("date")!
    : reference?.latest_peak_date;

  if (!selectedDate) {
    return {
      payload: {
        iso: "pjm",
        source: "PJM Data Miner Operations Summary",
        selectedDate: null,
        availableDates: peakDates,
        rowCount: 0,
        freshness: [],
        latestGeneratedAtEpt: null,
        rtoPeak: null,
        recentRtoPeaks: [],
        rtoMetricStats: [],
        availableZones: [],
        zonePeaks: [],
        recentZonePeaks: [],
        zoneMetricStats: [],
        transferLimits: [],
        recentTransferLimits: [],
        transferLimitStats: [],
        projectedTieFlows: [],
        recentProjectedTieFlows: [],
        projectedTieFlowStats: [],
        prevPeriodDate: null,
        prevPeriodRows: [],
        recentPrevPeriodRows: [],
        prevPeriodStats: [],
      },
      headers: { "Cache-Control": CACHE_HEADER },
      rowCount: 0,
      dataAsOf: null,
    };
  }

  const [
    freshnessRows,
    rtoPeakRows,
    recentRtoRows,
    rtoMetricStatsRows,
    zoneRows,
    transferLimitRows,
    recentTransferLimitRows,
    transferLimitStatsRows,
    projectedTieFlowRows,
    recentProjectedTieFlowRows,
    projectedTieFlowStatsRows,
    prevPeriodDateRows,
  ] = await Promise.all([
    query<FreshnessSourceRow>(`
      select 'ops_sum_frcstd_tran_lim' as table_name,
             count(*)::int as row_count,
             to_char(max(generated_at_ept), 'YYYY-MM-DD"T"HH24:MI:SS') as latest_generated,
             to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SSOF') as latest_updated_at
      from pjm.ops_sum_frcstd_tran_lim
      union all
      select 'ops_sum_frcst_peak_area',
             count(*)::int,
             to_char(max(generated_at_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
             to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SSOF')
      from pjm.ops_sum_frcst_peak_area
      union all
      select 'ops_sum_frcst_peak_rto',
             count(*)::int,
             to_char(max(generated_at_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
             to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SSOF')
      from pjm.ops_sum_frcst_peak_rto
      union all
      select 'ops_sum_prev_period',
             count(*)::int,
             to_char(max(generated_at_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
             to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SSOF')
      from pjm.ops_sum_prev_period
      union all
      select 'ops_sum_prjctd_tie_flow',
             count(*)::int,
             to_char(max(generated_at_ept), 'YYYY-MM-DD"T"HH24:MI:SS'),
             to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SSOF')
      from pjm.ops_sum_prjctd_tie_flow
      order by table_name
    `),
    query<RtoPeakSourceRow>(
      `
        ${RTO_ROW_SQL}
        where projected_peak_datetime_ept::date = $1::date
        order by projected_peak_datetime_ept desc
        limit 1
      `,
      [selectedDate],
    ),
    query<RtoPeakSourceRow>(
      `
        ${RTO_ROW_SQL}
        where projected_peak_datetime_ept::date <= $1::date
        order by projected_peak_datetime_ept desc
        limit 7
      `,
      [selectedDate],
    ),
    query<MetricStatsSourceRow>(
      `
        with history as (
          select
            projected_peak_datetime_ept::date as peak_date,
            internal_scheduled_capacity::float8 as internal_scheduled_capacity_mw,
            scheduled_tie_flow_total::float8 as scheduled_tie_flow_total_mw,
            capacity_adjustments::float8 as capacity_adjustments_mw,
            total_scheduled_capacity::float8 as total_scheduled_capacity_mw,
            load_forecast::float8 as load_forecast_mw,
            operating_reserve::float8 as operating_reserve_mw,
            unscheduled_steam_capacity::float8 as unscheduled_steam_capacity_mw
          from pjm.ops_sum_frcst_peak_rto
          where projected_peak_datetime_ept::date <= $1::date
        ),
        metric_values as (
          select metric.metric_key, history.peak_date, metric.value
          from history
          cross join lateral (
            values
              ('internalScheduledCapacityMw', history.internal_scheduled_capacity_mw),
              ('scheduledTieFlowTotalMw', history.scheduled_tie_flow_total_mw),
              ('capacityAdjustmentsMw', history.capacity_adjustments_mw),
              ('totalScheduledCapacityMw', history.total_scheduled_capacity_mw),
              ('loadForecastMw', history.load_forecast_mw),
              ('operatingReserveMw', history.operating_reserve_mw),
              ('unscheduledSteamCapacityMw', history.unscheduled_steam_capacity_mw)
          ) as metric(metric_key, value)
          where metric.value is not null
        ),
        ranked as (
          select
            metric_key,
            peak_date,
            value,
            count(*) over (partition by metric_key) as sample_count,
            row_number() over (partition by metric_key order by value asc, peak_date asc) as min_rank,
            row_number() over (partition by metric_key order by value desc, peak_date asc) as max_rank
          from metric_values
        )
        select
          null::text as area,
          metric_key,
          max(sample_count)::int as sample_count,
          max(value) filter (where min_rank = 1) as min_value,
          (max(peak_date) filter (where min_rank = 1))::text as min_peak_date,
          max(value) filter (where max_rank = 1) as max_value,
          (max(peak_date) filter (where max_rank = 1))::text as max_peak_date
        from ranked
        group by metric_key
      `,
      [selectedDate],
    ),
    query<AreaPeakSourceRow>(
      `
        ${AREA_ROW_SQL}
        where projected_peak_datetime_ept::date = $1::date
        order by pjm_load_forecast desc nulls last, area
      `,
      [selectedDate],
    ),
    query<TransferLimitSourceRow>(
      `
        ${TRANSFER_LIMIT_ROW_SQL}
        where projected_peak_datetime_ept::date = $1::date
        order by transfer_limit_name
      `,
      [selectedDate],
    ),
    query<TransferLimitSourceRow>(
      `
        with selected_names as (
          select transfer_limit_name
          from pjm.ops_sum_frcstd_tran_lim
          where projected_peak_datetime_ept::date = $1::date
        ),
        ranked as (
          select
            transfer_rows.*,
            row_number() over (
              partition by transfer_limit_name
              order by projected_peak_datetime_ept desc
            ) as recent_rank
          from (
            ${TRANSFER_LIMIT_ROW_SQL}
          ) as transfer_rows
          where transfer_limit_name in (select transfer_limit_name from selected_names)
            and projected_peak_datetime_ept::date <= $1::date
        )
        select
          peak_date,
          transfer_limit_name,
          generated_at_ept,
          projected_peak_datetime_ept,
          transfer_limit_mw
        from ranked
        where recent_rank <= 7
        order by transfer_limit_name, projected_peak_datetime_ept
      `,
      [selectedDate],
    ),
    query<MetricStatsSourceRow>(
      `
        with selected_names as (
          select transfer_limit_name
          from pjm.ops_sum_frcstd_tran_lim
          where projected_peak_datetime_ept::date = $1::date
        ),
        metric_values as (
          select
            transfer_limit_name as area,
            'transferLimitMw'::text as metric_key,
            projected_peak_datetime_ept::date as peak_date,
            transfer_limit_mw::float8 as value
          from pjm.ops_sum_frcstd_tran_lim
          where transfer_limit_name in (select transfer_limit_name from selected_names)
            and projected_peak_datetime_ept::date <= $1::date
            and transfer_limit_mw is not null
        ),
        ranked as (
          select
            area,
            metric_key,
            peak_date,
            value,
            count(*) over (partition by area, metric_key) as sample_count,
            row_number() over (
              partition by area, metric_key
              order by value asc, peak_date asc
            ) as min_rank,
            row_number() over (
              partition by area, metric_key
              order by value desc, peak_date asc
            ) as max_rank
          from metric_values
        )
        select
          area,
          metric_key,
          max(sample_count)::int as sample_count,
          max(value) filter (where min_rank = 1) as min_value,
          (max(peak_date) filter (where min_rank = 1))::text as min_peak_date,
          max(value) filter (where max_rank = 1) as max_value,
          (max(peak_date) filter (where max_rank = 1))::text as max_peak_date
        from ranked
        group by area, metric_key
      `,
      [selectedDate],
    ),
    query<ProjectedTieFlowSourceRow>(
      `
        ${PROJECTED_TIE_FLOW_ROW_SQL}
        where projected_peak_datetime_ept::date = $1::date
        order by interface
      `,
      [selectedDate],
    ),
    query<ProjectedTieFlowSourceRow>(
      `
        with selected_interfaces as (
          select interface
          from pjm.ops_sum_prjctd_tie_flow
          where projected_peak_datetime_ept::date = $1::date
        ),
        ranked as (
          select
            tie_rows.*,
            row_number() over (
              partition by interface
              order by projected_peak_datetime_ept desc
            ) as recent_rank
          from (
            ${PROJECTED_TIE_FLOW_ROW_SQL}
          ) as tie_rows
          where interface in (select interface from selected_interfaces)
            and projected_peak_datetime_ept::date <= $1::date
        )
        select
          peak_date,
          interface,
          generated_at_ept,
          projected_peak_datetime_ept,
          scheduled_tie_flow
        from ranked
        where recent_rank <= 7
        order by interface, projected_peak_datetime_ept
      `,
      [selectedDate],
    ),
    query<MetricStatsSourceRow>(
      `
        with selected_interfaces as (
          select interface
          from pjm.ops_sum_prjctd_tie_flow
          where projected_peak_datetime_ept::date = $1::date
        ),
        metric_values as (
          select
            interface as area,
            'scheduledTieFlowMw'::text as metric_key,
            projected_peak_datetime_ept::date as peak_date,
            scheduled_tie_flow::float8 as value
          from pjm.ops_sum_prjctd_tie_flow
          where interface in (select interface from selected_interfaces)
            and projected_peak_datetime_ept::date <= $1::date
            and scheduled_tie_flow is not null
        ),
        ranked as (
          select
            area,
            metric_key,
            peak_date,
            value,
            count(*) over (partition by area, metric_key) as sample_count,
            row_number() over (
              partition by area, metric_key
              order by value asc, peak_date asc
            ) as min_rank,
            row_number() over (
              partition by area, metric_key
              order by value desc, peak_date asc
            ) as max_rank
          from metric_values
        )
        select
          area,
          metric_key,
          max(sample_count)::int as sample_count,
          max(value) filter (where min_rank = 1) as min_value,
          (max(peak_date) filter (where min_rank = 1))::text as min_peak_date,
          max(value) filter (where max_rank = 1) as max_value,
          (max(peak_date) filter (where max_rank = 1))::text as max_peak_date
        from ranked
        group by area, metric_key
      `,
      [selectedDate],
    ),
    query<PrevPeriodDateRow>(
      `
        select max(datetime_beginning_ept::date)::text as period_date
        from pjm.ops_sum_prev_period
        where datetime_beginning_ept < ($1::date + interval '1 day')
      `,
      [selectedDate],
    ),
  ]);

  const availableZones = zoneRows.map((row) => row.area).filter(Boolean);
  const [recentZoneRows, zoneMetricStatsRows] = availableZones.length > 0
    ? await Promise.all([
        query<AreaPeakSourceRow>(
          `
            with ranked as (
              select
                area_rows.*,
                row_number() over (
                  partition by area
                  order by projected_peak_datetime_ept desc
                ) as recent_rank
              from (
                ${AREA_ROW_SQL}
              ) as area_rows
              where area = any($2::text[])
                and projected_peak_datetime_ept::date <= $1::date
            )
            select
              peak_date,
              area,
              generated_at_ept,
              projected_peak_datetime_ept,
              pjm_load_forecast,
              internal_scheduled_capacity,
              unscheduled_steam_capacity
            from ranked
            where recent_rank <= 7
            order by area, projected_peak_datetime_ept
          `,
          [selectedDate, availableZones],
        ),
        query<MetricStatsSourceRow>(
          `
            with history as (
              select
                area,
                projected_peak_datetime_ept::date as peak_date,
                internal_scheduled_capacity::float8 as internal_scheduled_capacity_mw,
                pjm_load_forecast::float8 as load_forecast_mw,
                unscheduled_steam_capacity::float8 as unscheduled_steam_capacity_mw,
                (internal_scheduled_capacity - pjm_load_forecast)::float8 as capacity_margin_mw
              from pjm.ops_sum_frcst_peak_area
              where area = any($2::text[])
                and projected_peak_datetime_ept::date <= $1::date
            ),
            metric_values as (
              select history.area, metric.metric_key, history.peak_date, metric.value
              from history
              cross join lateral (
                values
                  ('internalScheduledCapacityMw', history.internal_scheduled_capacity_mw),
                  ('loadForecastMw', history.load_forecast_mw),
                  ('capacityMarginMw', history.capacity_margin_mw),
                  ('unscheduledSteamCapacityMw', history.unscheduled_steam_capacity_mw)
              ) as metric(metric_key, value)
              where metric.value is not null
            ),
            ranked as (
              select
                area,
                metric_key,
                peak_date,
                value,
                count(*) over (partition by area, metric_key) as sample_count,
                row_number() over (
                  partition by area, metric_key
                  order by value asc, peak_date asc
                ) as min_rank,
                row_number() over (
                  partition by area, metric_key
                  order by value desc, peak_date asc
                ) as max_rank
              from metric_values
            )
            select
              area,
              metric_key,
              max(sample_count)::int as sample_count,
              max(value) filter (where min_rank = 1) as min_value,
              (max(peak_date) filter (where min_rank = 1))::text as min_peak_date,
              max(value) filter (where max_rank = 1) as max_value,
              (max(peak_date) filter (where max_rank = 1))::text as max_peak_date
            from ranked
            group by area, metric_key
          `,
          [selectedDate, availableZones],
        ),
      ])
    : [[], []];

  const prevPeriodDate = prevPeriodDateRows[0]?.period_date ?? null;
  const [prevPeriodRowsRaw, recentPrevPeriodRowsRaw, prevPeriodStatsRows] = prevPeriodDate
    ? await Promise.all([
        query<PrevPeriodSourceRow>(
          `
            with ranked as (
              select
                prev_rows.*,
                row_number() over (
                  partition by area
                  order by actual_load desc nulls last,
                           dispatch_rate desc nulls last,
                           datetime_beginning_ept desc
                ) as daily_rank
              from (
                ${PREV_PERIOD_BASE_SQL}
                where datetime_beginning_ept >= $1::date
                  and datetime_beginning_ept < ($1::date + interval '1 day')
              ) as prev_rows
            )
            select
              period_date::text as period_date,
              area,
              to_char(generated_at_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as generated_at_ept,
              to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
              to_char(datetime_beginning_utc, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_utc,
              to_char(datetime_ending_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_ending_ept,
              actual_load,
              dispatch_rate
            from ranked
            where daily_rank = 1
            order by actual_load desc nulls last, area
          `,
          [prevPeriodDate],
        ),
        query<PrevPeriodSourceRow>(
          `
            with selected_areas as (
              select distinct area
              from pjm.ops_sum_prev_period
              where datetime_beginning_ept >= $1::date
                and datetime_beginning_ept < ($1::date + interval '1 day')
            ),
            daily_ranked as (
              select
                prev_rows.*,
                row_number() over (
                  partition by area, period_date
                  order by actual_load desc nulls last,
                           dispatch_rate desc nulls last,
                           datetime_beginning_ept desc
                ) as daily_rank
              from (
                ${PREV_PERIOD_BASE_SQL}
                where area in (select area from selected_areas)
                  and datetime_beginning_ept >= ($1::date - interval '21 days')
                  and datetime_beginning_ept < ($1::date + interval '1 day')
              ) as prev_rows
            ),
            recent_ranked as (
              select
                daily_ranked.*,
                row_number() over (
                  partition by area
                  order by period_date::date desc
                ) as recent_rank
              from daily_ranked
              where daily_rank = 1
            )
            select
              period_date::text as period_date,
              area,
              to_char(generated_at_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as generated_at_ept,
              to_char(datetime_beginning_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_ept,
              to_char(datetime_beginning_utc, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_beginning_utc,
              to_char(datetime_ending_ept, 'YYYY-MM-DD"T"HH24:MI:SS') as datetime_ending_ept,
              actual_load,
              dispatch_rate
            from recent_ranked
            where recent_rank <= 7
            order by area, period_date::date
          `,
          [prevPeriodDate],
        ),
        Promise.resolve([] as MetricStatsSourceRow[]),
      ])
    : [[], [], []];

  const freshness = freshnessRows.map(normalizeFreshness);
  const rtoPeak = normalizeRtoPeak(rtoPeakRows[0]);
  const recentRtoPeaks = recentRtoRows.map(normalizeRtoPeak).filter(Boolean).reverse();
  const rtoMetricStats = rtoMetricStatsRows.map(normalizeMetricStats);
  const zonePeaks = zoneRows.map(normalizeAreaPeak).filter(Boolean);
  const recentZonePeaks = recentZoneRows.map(normalizeAreaPeak).filter(Boolean);
  const zoneMetricStats = zoneMetricStatsRows.map(normalizeMetricStats);
  const transferLimits = transferLimitRows.map(normalizeTransferLimit).filter(Boolean);
  const recentTransferLimits = recentTransferLimitRows
    .map(normalizeTransferLimit)
    .filter(Boolean);
  const transferLimitStats = transferLimitStatsRows.map(normalizeMetricStats);
  const projectedTieFlows = projectedTieFlowRows.map(normalizeProjectedTieFlow).filter(Boolean);
  const recentProjectedTieFlows = recentProjectedTieFlowRows
    .map(normalizeProjectedTieFlow)
    .filter(Boolean);
  const projectedTieFlowStats = projectedTieFlowStatsRows.map(normalizeMetricStats);
  const prevPeriodRows = prevPeriodRowsRaw.map(normalizePrevPeriod).filter(Boolean);
  const recentPrevPeriodRows = recentPrevPeriodRowsRaw
    .map(normalizePrevPeriod)
    .filter(Boolean);
  const prevPeriodStats = prevPeriodStatsRows.map(normalizeMetricStats);
  const latestGenerated =
    freshness
      .map((row) => row.latestGeneratedAtEpt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const rowCount =
    (rtoPeak ? 1 : 0) +
    recentRtoPeaks.length +
    rtoMetricStats.length +
    zonePeaks.length +
    recentZonePeaks.length +
    zoneMetricStats.length +
    transferLimits.length +
    recentTransferLimits.length +
    transferLimitStats.length +
    projectedTieFlows.length +
    recentProjectedTieFlows.length +
    projectedTieFlowStats.length +
    prevPeriodRows.length +
    recentPrevPeriodRows.length +
    prevPeriodStats.length +
    freshness.length;

  return {
    payload: {
      iso: "pjm",
      source: "PJM Data Miner Operations Summary",
      selectedDate,
      availableDates: peakDates,
      rowCount,
      freshness,
      latestGeneratedAtEpt: latestGenerated,
      rtoPeak,
      recentRtoPeaks,
      rtoMetricStats,
      availableZones,
      zonePeaks,
      recentZonePeaks,
      zoneMetricStats,
      transferLimits,
      recentTransferLimits,
      transferLimitStats,
      projectedTieFlows,
      recentProjectedTieFlows,
      projectedTieFlowStats,
      prevPeriodDate,
      prevPeriodRows,
      recentPrevPeriodRows,
      prevPeriodStats,
    },
    headers: { "Cache-Control": CACHE_HEADER },
    rowCount,
    dataAsOf: latestGenerated,
  };
});

export async function GET(request: Request): Promise<Response> {
  return observedGET(request);
}
