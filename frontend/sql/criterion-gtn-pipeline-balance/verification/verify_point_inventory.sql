with mapped_points as (
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
)
select
  mp.mapping_type,
  mp.point_key,
  mp.label,
  mp.source_table,
  mp.metadata_id,
  md.loc,
  md.loc_name,
  md.loc_purp_desc,
  md.category_short,
  md.sub_category_desc,
  md.rec_del_sign,
  md.loc_qti_short,
  md.state_abb,
  md.connecting_pipeline,
  md.connecting_entity,
  md.transportation_max_daily_quantity
from mapped_points mp
left join production.pipelines.metadata md
  on md.tsp_short = '079'
  and md.metadata_id = mp.metadata_id
order by mp.mapping_type, mp.point_key;
