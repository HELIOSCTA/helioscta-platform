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
    column2::number as sort_order,
    column3::varchar as label,
    column4::varchar as report_group,
    column5::varchar as source_table,
    column6::varchar as metadata_id
  from values
    ('kingsgate_receipt', 10, 'Kingsgate Receipt', 'Receipt', 'NOMINATION_POINTS', '0793498KINGSGATE11'),
    ('flow_past_kingsgate', 20, 'Flow Past Kingsgate', 'Mainline Flow', 'NOMINATION_SEGMENTS', '0793500FLOWPASTKINGSGAT43'),
    ('station_8', 30, 'Station 8 CFTP', 'Mainline Flow', 'NOMINATION_SEGMENTS', '07928218STATION8CFTP43'),
    ('station_14', 40, 'Station 14 CFTP', 'Mainline Flow', 'NOMINATION_SEGMENTS', '07918446STATION14CFTP43'),
    ('malin_delivery', 50, 'Malin / GTN to PG&E', 'Delivery', 'NOMINATION_POINTS', '0791820MALIN22')
),
plant_mapping as (
  select column1::varchar as plant_key, column2::varchar as source_table, column3::varchar as metadata_id
  from values
    ('carty', 'NOMINATION_POINTS', '0791401645CARTYGENERATI22'),
    ('coyote_springs', 'NOMINATION_POINTS', '079198184COYOTESPRINGS22'),
    ('coyote_springs_ii', 'NOMINATION_POINTS', '079314579COYOTESPRINGS222'),
    ('hermiston_calpine', 'NOMINATION_POINTS', '079314578CALPINEHPP22'),
    ('south_hermiston', 'NOMINATION_POINTS', '079217744HERMISTONGENER22'),
    ('klamath', 'NOMINATION_POINTS', '079288499KLAMATHCOGEN22'),
    ('ppw_klamath_expansion', 'NOMINATION_POINTS', '079311972KLAMATHPPM22'),
    ('lancaster', 'NOMINATION_POINTS', '079314085LANCASTER22'),
    ('rathdrum', 'NOMINATION_POINTS', '079160138RATHDRUMGENTAP22')
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
    np.export_timestamp,
    m.loc,
    m.loc_name,
    m.loc_purp_desc,
    m.category_short,
    m.rec_del_sign,
    m.loc_qti_short,
    m.connecting_pipeline,
    m.connecting_entity
  from production.pipelines.nomination_points np
  join params p on np.eff_gas_day = p.report_date
  join selected_cycle c on np.cycle_id = c.cycle_id
  join production.pipelines.metadata m on m.tsp_short = np.tsp_short and m.metadata_id = np.metadata_id
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
    ns.export_timestamp,
    m.loc,
    m.loc_name,
    m.loc_purp_desc,
    m.category_short,
    m.rec_del_sign,
    m.loc_qti_short,
    m.connecting_pipeline,
    m.connecting_entity
  from production.pipelines.nomination_segments ns
  join params p on ns.eff_gas_day = p.report_date
  join selected_cycle c on ns.cycle_id = c.cycle_id
  join production.pipelines.metadata m on m.tsp_short = ns.tsp_short and m.metadata_id = ns.metadata_id
  where ns.tsp_short = '079'
),
flow_rows as (
  select
    f.sort_order,
    f.point_key,
    f.label,
    f.report_group,
    f.source_table,
    f.metadata_id,
    sr.loc,
    sr.loc_name,
    sr.loc_purp_desc,
    sr.category_short,
    sr.rec_del_sign,
    sr.loc_qti_short,
    sr.connecting_pipeline,
    sr.connecting_entity,
    sr.cycle_id,
    sr.cycle_desc,
    sr.design_capacity,
    sr.operating_capacity,
    sr.scheduled_quantity,
    sr.operationally_available,
    sr.export_timestamp
  from flow_mapping f
  left join source_rows sr
    on sr.source_table = f.source_table
    and sr.metadata_id = f.metadata_id
),
plant_total as (
  select
    60 as sort_order,
    'mapped_power_total' as point_key,
    'Mapped Power Plant Noms' as label,
    'Derived' as report_group,
    'NOMINATION_POINTS' as source_table,
    'plant_mapping' as metadata_id,
    null as loc,
    'Mapped GTN power plant deliveries' as loc_name,
    'Delivery Quantity' as loc_purp_desc,
    'Power' as category_short,
    -1 as rec_del_sign,
    null as loc_qti_short,
    null as connecting_pipeline,
    null as connecting_entity,
    max(sr.cycle_id) as cycle_id,
    max(sr.cycle_desc) as cycle_desc,
    sum(sr.design_capacity) as design_capacity,
    sum(sr.operating_capacity) as operating_capacity,
    sum(sr.scheduled_quantity) as scheduled_quantity,
    sum(sr.operationally_available) as operationally_available,
    max(sr.export_timestamp) as export_timestamp
  from plant_mapping p
  left join source_rows sr
    on sr.source_table = p.source_table
    and sr.metadata_id = p.metadata_id
)
select
  to_char((select report_date from params), 'YYYY-MM-DD') as "reportDate",
  coalesce(fr.cycle_id, (select cycle_id from selected_cycle)) as "cycleId",
  coalesce(fr.cycle_desc, (select cycle_desc from selected_cycle)) as "cycleDesc",
  fr.point_key as "pointKey",
  fr.sort_order as "sortOrder",
  fr.label as "label",
  fr.report_group as "reportGroup",
  fr.source_table as "sourceTable",
  fr.metadata_id as "metadataId",
  fr.loc as "loc",
  fr.loc_name as "sourceLocName",
  fr.loc_purp_desc as "locPurpose",
  fr.category_short as "category",
  fr.rec_del_sign as "recDelSign",
  fr.loc_qti_short as "locQtiShort",
  fr.connecting_pipeline as "connectingPipeline",
  fr.connecting_entity as "connectingEntity",
  fr.scheduled_quantity as "scheduledDth",
  fr.scheduled_quantity / 1000 as "scheduledMdth",
  fr.operating_capacity as "operatingCapacityDth",
  fr.design_capacity as "designCapacityDth",
  fr.operationally_available as "operationallyAvailableDth",
  iff(nullif(fr.operating_capacity, 0) is null, null, fr.scheduled_quantity / fr.operating_capacity) as "utilizationPct",
  to_varchar(fr.export_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') as "exportTimestamp"
from (
  select * from flow_rows
  union all
  select * from plant_total
) fr
order by fr.sort_order
