with date_window as (
  select dateadd(day, -14, current_date()) as start_date
),
point_days as (
  select
    eff_gas_day,
    cycle_id,
    cycle_desc,
    count(*) as point_row_count,
    count(distinct metadata_id) as point_count,
    max(export_timestamp) as point_export_timestamp
  from production.pipelines.nomination_points
  where tsp_short = '079'
    and eff_gas_day >= (select start_date from date_window)
  group by eff_gas_day, cycle_id, cycle_desc
),
segment_days as (
  select
    eff_gas_day,
    cycle_id,
    cycle_desc,
    count(*) as segment_row_count,
    count(distinct metadata_id) as segment_count,
    max(export_timestamp) as segment_export_timestamp
  from production.pipelines.nomination_segments
  where tsp_short = '079'
    and eff_gas_day >= (select start_date from date_window)
  group by eff_gas_day, cycle_id, cycle_desc
)
select
  coalesce(p.eff_gas_day, s.eff_gas_day) as eff_gas_day,
  coalesce(p.cycle_id, s.cycle_id) as cycle_id,
  coalesce(p.cycle_desc, s.cycle_desc) as cycle_desc,
  coalesce(p.point_row_count, 0) as point_row_count,
  coalesce(p.point_count, 0) as point_count,
  coalesce(s.segment_row_count, 0) as segment_row_count,
  coalesce(s.segment_count, 0) as segment_count,
  greatest(coalesce(p.point_export_timestamp, '1900-01-01'::timestamp), coalesce(s.segment_export_timestamp, '1900-01-01'::timestamp)) as max_export_timestamp,
  iff(coalesce(p.cycle_id, s.cycle_id) = 5 and coalesce(p.point_count, 0) >= 50 and coalesce(s.segment_count, 0) >= 3, 'complete_intraday_3', 'partial_or_current_cycle') as completeness_status
from point_days p
full outer join segment_days s
  on s.eff_gas_day = p.eff_gas_day
  and s.cycle_id = p.cycle_id
order by eff_gas_day desc, cycle_id desc;
