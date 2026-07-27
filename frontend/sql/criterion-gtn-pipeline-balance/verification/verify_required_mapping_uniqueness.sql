with params as (
  select '2026-07-27'::date as report_date
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
mapped_points as (
  select column1::varchar as mapping_type, column2::varchar as point_key, column3::varchar as label, column4::varchar as source_table, column5::varchar as metadata_id
  from values
    ('flow', 'kingsgate_receipt', 'Kingsgate Receipt', 'NOMINATION_POINTS', '0793498KINGSGATE11'),
    ('flow', 'flow_past_kingsgate', 'Flow Past Kingsgate', 'NOMINATION_SEGMENTS', '0793500FLOWPASTKINGSGAT43'),
    ('flow', 'station_8', 'Station 8 CFTP', 'NOMINATION_SEGMENTS', '07928218STATION8CFTP43'),
    ('flow', 'station_14', 'Station 14 CFTP', 'NOMINATION_SEGMENTS', '07918446STATION14CFTP43'),
    ('flow', 'malin_delivery', 'Malin / GTN to PG&E', 'NOMINATION_POINTS', '0791820MALIN22'),
    ('plant', 'carty', 'Carty', 'NOMINATION_POINTS', '0791401645CARTYGENERATI22'),
    ('plant', 'coyote_springs', 'Coyote Springs', 'NOMINATION_POINTS', '079198184COYOTESPRINGS22'),
    ('plant', 'coyote_springs_ii', 'Coyote Springs II', 'NOMINATION_POINTS', '079314579COYOTESPRINGS222'),
    ('plant', 'hermiston_calpine', 'Hermiston / Calpine', 'NOMINATION_POINTS', '079314578CALPINEHPP22'),
    ('plant', 'south_hermiston', 'South Hermiston', 'NOMINATION_POINTS', '079217744HERMISTONGENER22'),
    ('plant', 'klamath', 'Klamath', 'NOMINATION_POINTS', '079288499KLAMATHCOGEN22'),
    ('plant', 'ppw_klamath_expansion', 'PPW Klamath Expansion', 'NOMINATION_POINTS', '079311972KLAMATHPPM22'),
    ('plant', 'lancaster', 'Lancaster', 'NOMINATION_POINTS', '079314085LANCASTER22'),
    ('plant', 'rathdrum', 'Rathdrum', 'NOMINATION_POINTS', '079160138RATHDRUMGENTAP22')
),
source_rows as (
  select 'NOMINATION_POINTS' as source_table, metadata_id
  from production.pipelines.nomination_points np
  join params p on np.eff_gas_day = p.report_date
  join selected_cycle c on np.cycle_id = c.cycle_id
  where np.tsp_short = '079'
  union all
  select 'NOMINATION_SEGMENTS' as source_table, metadata_id
  from production.pipelines.nomination_segments ns
  join params p on ns.eff_gas_day = p.report_date
  join selected_cycle c on ns.cycle_id = c.cycle_id
  where ns.tsp_short = '079'
)
select
  mp.mapping_type,
  mp.point_key,
  mp.label,
  mp.source_table,
  mp.metadata_id,
  count(md.metadata_id) as metadata_row_count,
  count(sr.metadata_id) as selected_cycle_source_row_count,
  iff(count(md.metadata_id) = 1 and count(sr.metadata_id) = 1, 'pass', 'fail') as check_status
from mapped_points mp
left join production.pipelines.metadata md
  on md.tsp_short = '079'
  and md.metadata_id = mp.metadata_id
left join source_rows sr
  on sr.source_table = mp.source_table
  and sr.metadata_id = mp.metadata_id
group by mp.mapping_type, mp.point_key, mp.label, mp.source_table, mp.metadata_id
order by check_status, mp.mapping_type, mp.point_key;
