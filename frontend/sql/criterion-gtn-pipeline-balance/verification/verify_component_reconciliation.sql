with params as (
  select '2026-07-27'::date as report_date, 1::float as tolerance_dth
),
selected_cycle as (
  select cycle_id, cycle_desc
  from (
    select cycle_id, cycle_desc, max(export_timestamp) as max_export_timestamp
    from production.pipelines.nomination_points np
    join params p on np.eff_gas_day = p.report_date
    where np.tsp_short = '079'
    group by cycle_id, cycle_desc
    union all
    select cycle_id, cycle_desc, max(export_timestamp) as max_export_timestamp
    from production.pipelines.nomination_segments ns
    join params p on ns.eff_gas_day = p.report_date
    where ns.tsp_short = '079'
    group by cycle_id, cycle_desc
  )
  qualify row_number() over (order by cycle_id desc, max_export_timestamp desc) = 1
),
flow_mapping as (
  select column1::varchar as point_key, column2::varchar as source_table, column3::varchar as metadata_id
  from values
    ('flow_past_kingsgate', 'NOMINATION_SEGMENTS', '0793500FLOWPASTKINGSGAT43'),
    ('station_8', 'NOMINATION_SEGMENTS', '07928218STATION8CFTP43'),
    ('station_14', 'NOMINATION_SEGMENTS', '07918446STATION14CFTP43'),
    ('malin_delivery', 'NOMINATION_POINTS', '0791820MALIN22')
),
corridor_mapping as (
  select column1::varchar as corridor_key, column2::varchar as label, column3::varchar as upstream_point_key, column4::varchar as downstream_point_key
  from values
    ('north_idaho_washington', 'Kingsgate to Station 8', 'flow_past_kingsgate', 'station_8'),
    ('columbia_basin', 'Station 8 to Station 14', 'station_8', 'station_14'),
    ('southern_oregon_malin', 'Station 14 to Malin', 'station_14', 'malin_delivery')
),
source_rows as (
  select 'NOMINATION_POINTS' as source_table, metadata_id, scheduled_quantity
  from production.pipelines.nomination_points np
  join params p on np.eff_gas_day = p.report_date
  join selected_cycle c on np.cycle_id = c.cycle_id
  where np.tsp_short = '079'
  union all
  select 'NOMINATION_SEGMENTS' as source_table, metadata_id, scheduled_quantity
  from production.pipelines.nomination_segments ns
  join params p on ns.eff_gas_day = p.report_date
  join selected_cycle c on ns.cycle_id = c.cycle_id
  where ns.tsp_short = '079'
),
flow_values as (
  select fm.point_key, sr.scheduled_quantity
  from flow_mapping fm
  left join source_rows sr
    on sr.source_table = fm.source_table
    and sr.metadata_id = fm.metadata_id
),
checks as (
  select
    cm.corridor_key,
    cm.label,
    u.scheduled_quantity as upstream_flow_dth,
    d.scheduled_quantity as downstream_flow_dth,
    u.scheduled_quantity - d.scheduled_quantity as component_delta_dth,
    u.scheduled_quantity - (u.scheduled_quantity - d.scheduled_quantity) as reconciled_downstream_flow_dth,
    d.scheduled_quantity as observed_downstream_flow_dth
  from corridor_mapping cm
  left join flow_values u on u.point_key = cm.upstream_point_key
  left join flow_values d on d.point_key = cm.downstream_point_key
)
select
  (select report_date from params) as report_date,
  (select cycle_id from selected_cycle) as cycle_id,
  (select cycle_desc from selected_cycle) as cycle_desc,
  corridor_key,
  label,
  upstream_flow_dth,
  downstream_flow_dth,
  component_delta_dth,
  reconciled_downstream_flow_dth,
  observed_downstream_flow_dth,
  abs(reconciled_downstream_flow_dth - observed_downstream_flow_dth) as absolute_diff_dth,
  iff(abs(reconciled_downstream_flow_dth - observed_downstream_flow_dth) <= (select tolerance_dth from params), 'pass', 'fail') as check_status
from checks
order by corridor_key;
