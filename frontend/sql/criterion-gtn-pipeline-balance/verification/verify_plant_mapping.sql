with params as (
  select '2026-07-27'::date as report_date
),
plant_mapping as (
  select column1::varchar as plant_key, column2::varchar as label, column3::varchar as corridor_key, column4::varchar as metadata_id
  from values
    ('rathdrum', 'Rathdrum', 'north_idaho_washington', '079160138RATHDRUMGENTAP22'),
    ('lancaster', 'Lancaster', 'north_idaho_washington', '079314085LANCASTER22'),
    ('carty', 'Carty', 'columbia_basin', '0791401645CARTYGENERATI22'),
    ('coyote_springs', 'Coyote Springs', 'columbia_basin', '079198184COYOTESPRINGS22'),
    ('coyote_springs_ii', 'Coyote Springs II', 'columbia_basin', '079314579COYOTESPRINGS222'),
    ('hermiston_calpine', 'Hermiston / Calpine', 'columbia_basin', '079314578CALPINEHPP22'),
    ('south_hermiston', 'South Hermiston', 'columbia_basin', '079217744HERMISTONGENER22'),
    ('klamath', 'Klamath', 'southern_oregon_malin', '079288499KLAMATHCOGEN22'),
    ('ppw_klamath_expansion', 'PPW Klamath Expansion', 'southern_oregon_malin', '079311972KLAMATHPPM22')
),
selected_cycle as (
  select cycle_id
  from production.pipelines.nomination_points np
  join params p on np.eff_gas_day = p.report_date
  where np.tsp_short = '079'
  group by cycle_id
  order by cycle_id desc
  limit 1
)
select
  pm.plant_key,
  pm.label,
  pm.corridor_key,
  pm.metadata_id,
  md.loc_name,
  md.category_short,
  md.connecting_entity,
  np.scheduled_quantity,
  np.operating_capacity,
  np.export_timestamp,
  iff(md.category_short = 'Power' and np.metadata_id is not null, 'pass', 'fail') as check_status
from plant_mapping pm
left join production.pipelines.metadata md
  on md.tsp_short = '079'
  and md.metadata_id = pm.metadata_id
left join production.pipelines.nomination_points np
  on np.tsp_short = '079'
  and np.metadata_id = pm.metadata_id
  and np.eff_gas_day = (select report_date from params)
  and np.cycle_id = (select cycle_id from selected_cycle)
order by check_status, pm.corridor_key, pm.label;
