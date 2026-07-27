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
mapping as (
  select
    column1::varchar as mapping_type,
    column2::varchar as point_key,
    column3::varchar as label,
    column4::varchar as source_table,
    column5::varchar as metadata_id
  from values
    ('flow', 'kingsgate_receipt', 'Kingsgate Receipt', 'NOMINATION_POINTS', '0793498KINGSGATE11'),
    ('flow', 'flow_past_kingsgate', 'Flow Past Kingsgate', 'NOMINATION_SEGMENTS', '0793500FLOWPASTKINGSGAT43'),
    ('flow', 'station_8', 'Station 8 CFTP', 'NOMINATION_SEGMENTS', '07928218STATION8CFTP43'),
    ('flow', 'station_14', 'Station 14 CFTP', 'NOMINATION_SEGMENTS', '07918446STATION14CFTP43'),
    ('flow', 'malin_delivery', 'Malin / GTN to PG&E', 'NOMINATION_POINTS', '0791820MALIN22'),
    ('plant', 'rathdrum', 'Rathdrum', 'NOMINATION_POINTS', '079160138RATHDRUMGENTAP22'),
    ('plant', 'lancaster', 'Lancaster', 'NOMINATION_POINTS', '079314085LANCASTER22'),
    ('plant', 'carty', 'Carty', 'NOMINATION_POINTS', '0791401645CARTYGENERATI22'),
    ('plant', 'coyote_springs', 'Coyote Springs', 'NOMINATION_POINTS', '079198184COYOTESPRINGS22'),
    ('plant', 'coyote_springs_ii', 'Coyote Springs II', 'NOMINATION_POINTS', '079314579COYOTESPRINGS222'),
    ('plant', 'hermiston_calpine', 'Hermiston / Calpine', 'NOMINATION_POINTS', '079314578CALPINEHPP22'),
    ('plant', 'south_hermiston', 'South Hermiston', 'NOMINATION_POINTS', '079217744HERMISTONGENER22'),
    ('plant', 'klamath', 'Klamath', 'NOMINATION_POINTS', '079288499KLAMATHCOGEN22'),
    ('plant', 'ppw_klamath_expansion', 'PPW Klamath Expansion', 'NOMINATION_POINTS', '079311972KLAMATHPPM22')
),
source_rows as (
  select
    'NOMINATION_POINTS' as source_table,
    np.metadata_id,
    np.scheduled_quantity,
    np.export_timestamp
  from production.pipelines.nomination_points np
  join params p on np.eff_gas_day = p.report_date
  join selected_cycle c on np.cycle_id = c.cycle_id
  where np.tsp_short = '079'
  union all
  select
    'NOMINATION_SEGMENTS' as source_table,
    ns.metadata_id,
    ns.scheduled_quantity,
    ns.export_timestamp
  from production.pipelines.nomination_segments ns
  join params p on ns.eff_gas_day = p.report_date
  join selected_cycle c on ns.cycle_id = c.cycle_id
  where ns.tsp_short = '079'
),
mapping_counts as (
  select
    m.mapping_type,
    m.point_key,
    m.label,
    m.source_table,
    m.metadata_id,
    count(sr.metadata_id) as source_row_count,
    sum(sr.scheduled_quantity) as scheduled_quantity,
    max(sr.export_timestamp) as export_timestamp
  from mapping m
  left join source_rows sr
    on sr.source_table = m.source_table
    and sr.metadata_id = m.metadata_id
  group by m.mapping_type, m.point_key, m.label, m.source_table, m.metadata_id
),
metadata_counts as (
  select
    m.mapping_type,
    m.point_key,
    m.label,
    m.source_table,
    m.metadata_id,
    count(md.metadata_id) as metadata_row_count,
    max(md.loc_name) as loc_name
  from mapping m
  left join production.pipelines.metadata md
    on md.tsp_short = '079'
    and md.metadata_id = m.metadata_id
  group by m.mapping_type, m.point_key, m.label, m.source_table, m.metadata_id
),
latest_seen as (
  select
    max(eff_gas_day) as latest_seen_gas_day,
    max(export_timestamp) as latest_seen_export_timestamp
  from (
    select eff_gas_day, export_timestamp
    from production.pipelines.nomination_points
    where tsp_short = '079'
    union all
    select eff_gas_day, export_timestamp
    from production.pipelines.nomination_segments
    where tsp_short = '079'
  )
),
cycle_status as (
  select
    iff((select cycle_id from selected_cycle) = 5, 'info', 'warning') as severity,
    'selected_cycle' as diagnostic_key,
    'Selected cycle is ' || coalesce((select cycle_desc from selected_cycle), 'missing') || ' for the requested gas day.' as message,
    null as mapping_type,
    null as point_key,
    null as label,
    null as source_table,
    null as metadata_id,
    (select cycle_id from selected_cycle) as observed_count,
    null as observed_value,
    null as export_timestamp
),
latest_status as (
  select
    iff((select report_date from params) <= latest_seen_gas_day, 'info', 'error') as severity,
    'latest_seen_date' as diagnostic_key,
    'Latest GTN gas day observed in Criterion is ' || coalesce(to_char(latest_seen_gas_day, 'YYYY-MM-DD'), 'missing') || '.' as message,
    null as mapping_type,
    null as point_key,
    null as label,
    null as source_table,
    null as metadata_id,
    null as observed_count,
    null as observed_value,
    latest_seen_export_timestamp as export_timestamp
  from latest_seen
),
source_status as (
  select
    case
      when source_row_count = 0 then 'error'
      when source_row_count > 1 then 'warning'
      else 'info'
    end as severity,
    case
      when source_row_count = 0 then 'missing_source_row'
      when source_row_count > 1 then 'duplicate_source_rows'
      else 'mapped_source_row'
    end as diagnostic_key,
    case
      when source_row_count = 0 then 'No selected-cycle source row found for ' || label || '.'
      when source_row_count > 1 then 'Multiple selected-cycle source rows found for ' || label || '.'
      else label || ' mapped to one selected-cycle source row.'
    end as message,
    mapping_type,
    point_key,
    label,
    source_table,
    metadata_id,
    source_row_count as observed_count,
    scheduled_quantity as observed_value,
    export_timestamp
  from mapping_counts
),
metadata_status as (
  select
    case
      when metadata_row_count = 0 then 'error'
      when metadata_row_count > 1 then 'warning'
      else 'info'
    end as severity,
    case
      when metadata_row_count = 0 then 'missing_metadata_row'
      when metadata_row_count > 1 then 'duplicate_metadata_rows'
      else 'mapped_metadata_row'
    end as diagnostic_key,
    case
      when metadata_row_count = 0 then 'No Criterion metadata row found for ' || label || '.'
      when metadata_row_count > 1 then 'Multiple Criterion metadata rows found for ' || label || '.'
      else label || ' metadata is present as ' || coalesce(loc_name, metadata_id) || '.'
    end as message,
    mapping_type,
    point_key,
    label,
    source_table,
    metadata_id,
    metadata_row_count as observed_count,
    null as observed_value,
    null as export_timestamp
  from metadata_counts
)
select
  to_char((select report_date from params), 'YYYY-MM-DD') as "reportDate",
  (select cycle_id from selected_cycle) as "cycleId",
  (select cycle_desc from selected_cycle) as "cycleDesc",
  severity as "severity",
  diagnostic_key as "diagnosticKey",
  message as "message",
  mapping_type as "mappingType",
  point_key as "pointKey",
  label as "label",
  source_table as "sourceTable",
  metadata_id as "metadataId",
  observed_count as "observedCount",
  observed_value as "observedValue",
  to_varchar(export_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') as "exportTimestamp"
from (
  select * from cycle_status
  union all
  select * from latest_status
  union all
  select * from source_status
  union all
  select * from metadata_status
)
order by
  case severity when 'error' then 1 when 'warning' then 2 else 3 end,
  diagnostic_key,
  point_key
