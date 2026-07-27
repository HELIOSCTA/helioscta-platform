with params as (
  select to_date(?) as report_date
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
  select
    column1::varchar as point_key,
    column2::varchar as source_table,
    column3::varchar as metadata_id
  from values
    ('flow_past_kingsgate', 'NOMINATION_SEGMENTS', '0793500FLOWPASTKINGSGAT43'),
    ('station_8', 'NOMINATION_SEGMENTS', '07928218STATION8CFTP43'),
    ('station_14', 'NOMINATION_SEGMENTS', '07918446STATION14CFTP43'),
    ('malin_delivery', 'NOMINATION_POINTS', '0791820MALIN22')
),
corridor_mapping as (
  select
    column1::varchar as corridor_key,
    column2::number as sort_order,
    column3::varchar as label,
    column4::varchar as upstream_point_key,
    column5::varchar as downstream_point_key
  from values
    ('north_idaho_washington', 10, 'Kingsgate to Station 8', 'flow_past_kingsgate', 'station_8'),
    ('columbia_basin', 20, 'Station 8 to Station 14', 'station_8', 'station_14'),
    ('southern_oregon_malin', 30, 'Station 14 to Malin', 'station_14', 'malin_delivery')
),
plant_mapping as (
  select
    column1::varchar as plant_key,
    column2::varchar as label,
    column3::varchar as corridor_key,
    column4::varchar as source_table,
    column5::varchar as metadata_id
  from values
    ('rathdrum', 'Rathdrum', 'north_idaho_washington', 'NOMINATION_POINTS', '079160138RATHDRUMGENTAP22'),
    ('lancaster', 'Lancaster', 'north_idaho_washington', 'NOMINATION_POINTS', '079314085LANCASTER22'),
    ('carty', 'Carty', 'columbia_basin', 'NOMINATION_POINTS', '0791401645CARTYGENERATI22'),
    ('coyote_springs', 'Coyote Springs', 'columbia_basin', 'NOMINATION_POINTS', '079198184COYOTESPRINGS22'),
    ('coyote_springs_ii', 'Coyote Springs II', 'columbia_basin', 'NOMINATION_POINTS', '079314579COYOTESPRINGS222'),
    ('hermiston_calpine', 'Hermiston / Calpine', 'columbia_basin', 'NOMINATION_POINTS', '079314578CALPINEHPP22'),
    ('south_hermiston', 'South Hermiston', 'columbia_basin', 'NOMINATION_POINTS', '079217744HERMISTONGENER22'),
    ('klamath', 'Klamath', 'southern_oregon_malin', 'NOMINATION_POINTS', '079288499KLAMATHCOGEN22'),
    ('ppw_klamath_expansion', 'PPW Klamath Expansion', 'southern_oregon_malin', 'NOMINATION_POINTS', '079311972KLAMATHPPM22')
),
source_rows as (
  select
    'NOMINATION_POINTS' as source_table,
    np.metadata_id,
    np.scheduled_quantity,
    np.operating_capacity,
    np.design_capacity,
    np.operationally_available,
    np.export_timestamp,
    np.cycle_id,
    np.cycle_desc
  from production.pipelines.nomination_points np
  join params p on np.eff_gas_day = p.report_date
  join selected_cycle c on np.cycle_id = c.cycle_id
  where np.tsp_short = '079'
  union all
  select
    'NOMINATION_SEGMENTS' as source_table,
    ns.metadata_id,
    ns.scheduled_quantity,
    ns.operating_capacity,
    ns.design_capacity,
    ns.operationally_available,
    ns.export_timestamp,
    ns.cycle_id,
    ns.cycle_desc
  from production.pipelines.nomination_segments ns
  join params p on ns.eff_gas_day = p.report_date
  join selected_cycle c on ns.cycle_id = c.cycle_id
  where ns.tsp_short = '079'
),
flow_values as (
  select
    f.point_key,
    sr.scheduled_quantity,
    sr.operating_capacity,
    sr.design_capacity,
    sr.export_timestamp,
    sr.cycle_id,
    sr.cycle_desc
  from flow_mapping f
  left join source_rows sr
    on sr.source_table = f.source_table
    and sr.metadata_id = f.metadata_id
),
plant_values as (
  select
    p.corridor_key,
    count_if(sr.metadata_id is not null) as mapped_plant_count,
    sum(sr.scheduled_quantity) as mapped_power_dth,
    sum(sr.operating_capacity) as mapped_power_capacity_dth,
    max(sr.export_timestamp) as plant_export_timestamp,
    array_to_string(array_agg(p.label) within group (order by p.label), ', ') as mapped_plants
  from plant_mapping p
  left join source_rows sr
    on sr.source_table = p.source_table
    and sr.metadata_id = p.metadata_id
  group by p.corridor_key
)
select
  to_char((select report_date from params), 'YYYY-MM-DD') as "reportDate",
  (select cycle_id from selected_cycle) as "cycleId",
  (select cycle_desc from selected_cycle) as "cycleDesc",
  c.corridor_key as "corridorKey",
  c.sort_order as "sortOrder",
  c.label as "label",
  c.upstream_point_key as "upstreamPointKey",
  c.downstream_point_key as "downstreamPointKey",
  u.scheduled_quantity as "upstreamFlowDth",
  d.scheduled_quantity as "downstreamFlowDth",
  u.operating_capacity as "upstreamOperatingCapacityDth",
  d.operating_capacity as "downstreamOperatingCapacityDth",
  u.scheduled_quantity - d.scheduled_quantity as "corridorDeltaDth",
  (u.scheduled_quantity - d.scheduled_quantity) / 1000 as "corridorDeltaMdth",
  pv.mapped_power_dth as "mappedPowerDth",
  pv.mapped_power_dth / 1000 as "mappedPowerMdth",
  pv.mapped_power_capacity_dth as "mappedPowerCapacityDth",
  (u.scheduled_quantity - d.scheduled_quantity) - coalesce(pv.mapped_power_dth, 0) as "residualDth",
  ((u.scheduled_quantity - d.scheduled_quantity) - coalesce(pv.mapped_power_dth, 0)) / 1000 as "residualMdth",
  iff(nullif(u.scheduled_quantity - d.scheduled_quantity, 0) is null, null, pv.mapped_power_dth / (u.scheduled_quantity - d.scheduled_quantity)) as "mappedPowerShare",
  pv.mapped_plant_count as "mappedPlantCount",
  pv.mapped_plants as "mappedPlants",
  to_varchar(greatest(coalesce(u.export_timestamp, '1900-01-01'::timestamp), coalesce(d.export_timestamp, '1900-01-01'::timestamp), coalesce(pv.plant_export_timestamp, '1900-01-01'::timestamp)), 'YYYY-MM-DD"T"HH24:MI:SS.FF3') as "exportTimestamp"
from corridor_mapping c
left join flow_values u on u.point_key = c.upstream_point_key
left join flow_values d on d.point_key = c.downstream_point_key
left join plant_values pv on pv.corridor_key = c.corridor_key
order by c.sort_order
