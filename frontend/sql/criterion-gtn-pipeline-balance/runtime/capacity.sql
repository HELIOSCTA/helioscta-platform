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
capacity_mapping as (
  select
    column1::varchar as point_key,
    column2::number as sort_order,
    column3::varchar as label,
    column4::varchar as report_group,
    column5::varchar as source_table,
    column6::varchar as metadata_id
  from values
    ('flow_past_kingsgate', 10, 'Flow Past Kingsgate', 'Flow', 'NOMINATION_SEGMENTS', '0793500FLOWPASTKINGSGAT43'),
    ('station_8', 20, 'Station 8 CFTP', 'Flow', 'NOMINATION_SEGMENTS', '07928218STATION8CFTP43'),
    ('station_14', 30, 'Station 14 CFTP', 'Flow', 'NOMINATION_SEGMENTS', '07918446STATION14CFTP43'),
    ('malin_delivery', 40, 'Malin / GTN to PG&E', 'Flow', 'NOMINATION_POINTS', '0791820MALIN22'),
    ('rathdrum', 110, 'Rathdrum', 'Plant', 'NOMINATION_POINTS', '079160138RATHDRUMGENTAP22'),
    ('lancaster', 120, 'Lancaster', 'Plant', 'NOMINATION_POINTS', '079314085LANCASTER22'),
    ('carty', 130, 'Carty', 'Plant', 'NOMINATION_POINTS', '0791401645CARTYGENERATI22'),
    ('coyote_springs', 140, 'Coyote Springs', 'Plant', 'NOMINATION_POINTS', '079198184COYOTESPRINGS22'),
    ('coyote_springs_ii', 150, 'Coyote Springs II', 'Plant', 'NOMINATION_POINTS', '079314579COYOTESPRINGS222'),
    ('hermiston_calpine', 160, 'Hermiston / Calpine', 'Plant', 'NOMINATION_POINTS', '079314578CALPINEHPP22'),
    ('south_hermiston', 170, 'South Hermiston', 'Plant', 'NOMINATION_POINTS', '079217744HERMISTONGENER22'),
    ('klamath', 180, 'Klamath', 'Plant', 'NOMINATION_POINTS', '079288499KLAMATHCOGEN22'),
    ('ppw_klamath_expansion', 190, 'PPW Klamath Expansion', 'Plant', 'NOMINATION_POINTS', '079311972KLAMATHPPM22')
),
source_rows as (
  select
    'NOMINATION_POINTS' as source_table,
    np.metadata_id,
    np.eff_gas_day,
    np.cycle_id,
    np.cycle_desc,
    np.design_capacity,
    np.operating_capacity,
    np.scheduled_quantity,
    np.operationally_available,
    np.export_timestamp
  from production.pipelines.nomination_points np
  join params p on np.eff_gas_day = p.report_date
  join selected_cycle c on np.cycle_id = c.cycle_id
  where np.tsp_short = '079'
  union all
  select
    'NOMINATION_SEGMENTS' as source_table,
    ns.metadata_id,
    ns.eff_gas_day,
    ns.cycle_id,
    ns.cycle_desc,
    ns.design_capacity,
    ns.operating_capacity,
    ns.scheduled_quantity,
    ns.operationally_available,
    ns.export_timestamp
  from production.pipelines.nomination_segments ns
  join params p on ns.eff_gas_day = p.report_date
  join selected_cycle c on ns.cycle_id = c.cycle_id
  where ns.tsp_short = '079'
)
select
  to_char((select report_date from params), 'YYYY-MM-DD') as "reportDate",
  coalesce(sr.cycle_id, (select cycle_id from selected_cycle)) as "cycleId",
  coalesce(sr.cycle_desc, (select cycle_desc from selected_cycle)) as "cycleDesc",
  c.point_key as "pointKey",
  c.sort_order as "sortOrder",
  c.label as "label",
  c.report_group as "reportGroup",
  c.source_table as "sourceTable",
  c.metadata_id as "metadataId",
  sr.scheduled_quantity as "scheduledDth",
  sr.scheduled_quantity / 1000 as "scheduledMdth",
  sr.design_capacity as "designCapacityDth",
  sr.design_capacity / 1000 as "designCapacityMdth",
  sr.operating_capacity as "operatingCapacityDth",
  sr.operating_capacity / 1000 as "operatingCapacityMdth",
  sr.operationally_available as "operationallyAvailableDth",
  sr.operationally_available / 1000 as "operationallyAvailableMdth",
  iff(nullif(sr.operating_capacity, 0) is null, null, sr.scheduled_quantity / sr.operating_capacity) as "utilizationPct",
  to_varchar(sr.export_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') as "exportTimestamp"
from capacity_mapping c
left join source_rows sr
  on sr.source_table = c.source_table
  and sr.metadata_id = c.metadata_id
order by c.sort_order
