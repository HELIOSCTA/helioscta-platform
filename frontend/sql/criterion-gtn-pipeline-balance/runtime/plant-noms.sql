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
  )
  qualify row_number() over (order by cycle_id desc, max_export_timestamp desc) = 1
),
plant_mapping as (
  select
    column1::varchar as plant_key,
    column2::number as sort_order,
    column3::varchar as label,
    column4::varchar as corridor_key,
    column5::varchar as corridor_label,
    column6::varchar as source_table,
    column7::varchar as metadata_id,
    column8::float as assumed_heat_rate_mmbtu_per_mwh
  from values
    ('rathdrum', 10, 'Rathdrum', 'north_idaho_washington', 'Kingsgate to Station 8', 'NOMINATION_POINTS', '079160138RATHDRUMGENTAP22', 7.5),
    ('lancaster', 20, 'Lancaster', 'north_idaho_washington', 'Kingsgate to Station 8', 'NOMINATION_POINTS', '079314085LANCASTER22', 7.5),
    ('carty', 30, 'Carty', 'columbia_basin', 'Station 8 to Station 14', 'NOMINATION_POINTS', '0791401645CARTYGENERATI22', 7.5),
    ('coyote_springs', 40, 'Coyote Springs', 'columbia_basin', 'Station 8 to Station 14', 'NOMINATION_POINTS', '079198184COYOTESPRINGS22', 7.5),
    ('coyote_springs_ii', 50, 'Coyote Springs II', 'columbia_basin', 'Station 8 to Station 14', 'NOMINATION_POINTS', '079314579COYOTESPRINGS222', 7.5),
    ('hermiston_calpine', 60, 'Hermiston / Calpine', 'columbia_basin', 'Station 8 to Station 14', 'NOMINATION_POINTS', '079314578CALPINEHPP22', 7.5),
    ('south_hermiston', 70, 'South Hermiston', 'columbia_basin', 'Station 8 to Station 14', 'NOMINATION_POINTS', '079217744HERMISTONGENER22', 7.5),
    ('klamath', 80, 'Klamath', 'southern_oregon_malin', 'Station 14 to Malin', 'NOMINATION_POINTS', '079288499KLAMATHCOGEN22', 7.5),
    ('ppw_klamath_expansion', 90, 'PPW Klamath Expansion', 'southern_oregon_malin', 'Station 14 to Malin', 'NOMINATION_POINTS', '079311972KLAMATHPPM22', 7.5)
),
source_rows as (
  select
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
    m.state_abb,
    m.connecting_pipeline,
    m.connecting_entity,
    m.transportation_max_daily_quantity
  from production.pipelines.nomination_points np
  join params p on np.eff_gas_day = p.report_date
  join selected_cycle c on np.cycle_id = c.cycle_id
  join production.pipelines.metadata m on m.tsp_short = np.tsp_short and m.metadata_id = np.metadata_id
  where np.tsp_short = '079'
)
select
  to_char((select report_date from params), 'YYYY-MM-DD') as "reportDate",
  (select cycle_id from selected_cycle) as "cycleId",
  (select cycle_desc from selected_cycle) as "cycleDesc",
  p.plant_key as "plantKey",
  p.sort_order as "sortOrder",
  p.label as "label",
  p.corridor_key as "corridorKey",
  p.corridor_label as "corridorLabel",
  p.source_table as "sourceTable",
  p.metadata_id as "metadataId",
  sr.loc as "loc",
  sr.loc_name as "sourceLocName",
  sr.loc_purp_desc as "locPurpose",
  sr.category_short as "category",
  sr.rec_del_sign as "recDelSign",
  sr.loc_qti_short as "locQtiShort",
  sr.state_abb as "state",
  sr.connecting_pipeline as "connectingPipeline",
  sr.connecting_entity as "connectingEntity",
  sr.transportation_max_daily_quantity as "transportationMaxDailyQuantityDth",
  sr.scheduled_quantity as "scheduledDth",
  sr.scheduled_quantity / 1000 as "scheduledMdth",
  sr.design_capacity as "designCapacityDth",
  sr.operating_capacity as "operatingCapacityDth",
  sr.operationally_available as "operationallyAvailableDth",
  iff(nullif(sr.operating_capacity, 0) is null, null, sr.scheduled_quantity / sr.operating_capacity) as "utilizationPct",
  p.assumed_heat_rate_mmbtu_per_mwh as "assumedHeatRate",
  iff(nullif(p.assumed_heat_rate_mmbtu_per_mwh, 0) is null, null, sr.scheduled_quantity / p.assumed_heat_rate_mmbtu_per_mwh / 24) as "estimatedAvgMw",
  iff(nullif(p.assumed_heat_rate_mmbtu_per_mwh, 0) is null, null, sr.operating_capacity / p.assumed_heat_rate_mmbtu_per_mwh / 24) as "estimatedCapacityMw",
  to_varchar(sr.export_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') as "exportTimestamp"
from plant_mapping p
left join source_rows sr on sr.metadata_id = p.metadata_id
order by p.sort_order
