with flow_mapping as (
  select column1::varchar as point_key, column2::varchar as source_table, column3::varchar as metadata_id
  from values
    ('flow_past_kingsgate', 'NOMINATION_SEGMENTS', '0793500FLOWPASTKINGSGAT43'),
    ('station_8', 'NOMINATION_SEGMENTS', '07928218STATION8CFTP43'),
    ('station_14', 'NOMINATION_SEGMENTS', '07918446STATION14CFTP43'),
    ('malin_delivery', 'NOMINATION_POINTS', '0791820MALIN22')
),
required_points as (
  select metadata_id from flow_mapping
  union all
  select column1::varchar as metadata_id
  from values
    ('0793498KINGSGATE11'),
    ('0791401645CARTYGENERATI22'),
    ('079198184COYOTESPRINGS22'),
    ('079314579COYOTESPRINGS222'),
    ('079314578CALPINEHPP22'),
    ('079217744HERMISTONGENER22'),
    ('079288499KLAMATHCOGEN22'),
    ('079311972KLAMATHPPM22'),
    ('079314085LANCASTER22'),
    ('079160138RATHDRUMGENTAP22')
),
point_days as (
  select
    eff_gas_day,
    count(distinct metadata_id) as required_point_count,
    max(export_timestamp) as max_export_timestamp
  from production.pipelines.nomination_points
  where tsp_short = '079'
    and cycle_id = 5
    and metadata_id in (select metadata_id from required_points)
  group by eff_gas_day
),
segment_days as (
  select
    eff_gas_day,
    count(distinct metadata_id) as required_segment_count,
    max(export_timestamp) as max_export_timestamp
  from production.pipelines.nomination_segments
  where tsp_short = '079'
    and cycle_id = 5
    and metadata_id in (
      select metadata_id
      from flow_mapping
      where source_table = 'NOMINATION_SEGMENTS'
    )
  group by eff_gas_day
),
complete_days as (
  select
    p.eff_gas_day,
    greatest(p.max_export_timestamp, s.max_export_timestamp) as max_export_timestamp
  from point_days p
  join segment_days s on s.eff_gas_day = p.eff_gas_day
  where p.required_point_count >= 10
    and s.required_segment_count >= 3
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
latest_complete as (
  select
    eff_gas_day,
    max_export_timestamp
  from complete_days
  qualify row_number() over (order by eff_gas_day desc) = 1
)
select
  to_char(lc.eff_gas_day, 'YYYY-MM-DD') as "latestAvailableDate",
  to_varchar(lc.max_export_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') as "latestCompleteExportTimestamp",
  to_char(ls.latest_seen_gas_day, 'YYYY-MM-DD') as "latestSeenGasDay",
  to_varchar(ls.latest_seen_export_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') as "latestSeenExportTimestamp"
from latest_seen ls
left join latest_complete lc on true
