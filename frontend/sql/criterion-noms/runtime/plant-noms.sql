with params as (
  select
    coalesce(to_date(nullif(?, '')), current_date()) as anchor_date,
    nullif(?, '') is not null as use_watchlist,
    nullif(?, '') is not null as use_state_filter
),
selected_states as (
  select trim(value::varchar) as state_abb
  from table(split_to_table(?, ','))
  where trim(value::varchar) <> ''
),
watchlist_keys as (
  select
    value:sourceTable::varchar as source_table,
    value:tspShort::varchar as tsp_short,
    value:metadataId::varchar as metadata_id
  from table(flatten(input => parse_json(?)))
),
date_window as (
  select dateadd(day, 1, anchor_date) as gas_day, 'tomorrow' as day_key
  from params
  union all
  select anchor_date, 'today'
  from params
  union all
  select dateadd(day, -1, anchor_date), 'yesterday'
  from params
  union all
  select dateadd(day, -2, anchor_date), 'two_days_old'
  from params
  union all
  select dateadd(day, -3, anchor_date), 'three_days_old'
  from params
  union all
  select dateadd(day, -4, anchor_date), 'four_days_old'
  from params
  union all
  select dateadd(day, -5, anchor_date), 'five_days_old'
  from params
  union all
  select dateadd(day, -6, anchor_date), 'six_days_old'
  from params
),
candidate_points as (
  select
    'PRODUCTION.PIPELINES.NOMINATION_POINTS' as source_table,
    to_varchar(m.metadata_id) as metadata_id,
    m.tsp_short,
    m.state_abb,
    m.pipeline_name,
    coalesce(nullif(m.loc_name, ''), nullif(m.connecting_entity, ''), to_varchar(m.metadata_id)) as location,
    m.loc::varchar as location_id,
    m.county_name,
    m.connecting_entity,
    m.category_short,
    m.rec_del_sign,
    m.loc_qti_short
  from production.pipelines.metadata m
  where m.category_short = 'Power'
    and (m.loc_qti_short = 'DPQ' or m.rec_del_sign = -1)
    and (
      not (select use_state_filter from params)
      or exists (
        select 1
        from selected_states s
        where s.state_abb = m.state_abb
      )
    )
    and (
      not (select use_watchlist from params)
      or exists (
        select 1
        from watchlist_keys wk
        where wk.source_table = 'PRODUCTION.PIPELINES.NOMINATION_POINTS'
          and wk.tsp_short = m.tsp_short
          and wk.metadata_id = to_varchar(m.metadata_id)
      )
    )
),
latest_noms as (
  select
    to_char((select anchor_date from params), 'YYYY-MM-DD') as "anchorDate",
    to_char(dw.gas_day, 'YYYY-MM-DD') as "gasDay",
    cp.source_table as "sourceTable",
    cp.tsp_short as "tspShort",
    cp.metadata_id as "metadataId",
    cp.state_abb as "state",
    cp.pipeline_name as "pipeline",
    cp.location as "location",
    cp.location_id as "locationId",
    'POWER PLANT' as "facilityType",
    cp.county_name as "county",
    cp.connecting_entity as "connectingEntity",
    cp.category_short as "categoryShort",
    cp.loc_qti_short as "locQtiShort",
    cp.rec_del_sign as "recDelSign",
    dw.day_key,
    n.scheduled_quantity * coalesce(cp.rec_del_sign, iff(cp.loc_qti_short = 'DPQ', -1, 1)) as signed_scheduled_dth,
    n.cycle_id,
    n.cycle_desc,
    n.export_timestamp
  from date_window dw
  join production.pipelines.nomination_points n
    on n.eff_gas_day = dw.gas_day
  join candidate_points cp
    on cp.metadata_id = to_varchar(n.metadata_id)
    and cp.tsp_short = n.tsp_short
  qualify row_number() over (
    partition by cp.tsp_short, cp.metadata_id, dw.gas_day
    order by n.export_timestamp desc, n.cycle_id desc
  ) = 1
),
plant_pivot as (
  select
    "anchorDate",
    "sourceTable",
    "tspShort",
    "metadataId",
    "state",
    "pipeline",
    "location",
    "locationId",
    "facilityType",
    "county",
    "connectingEntity",
    "categoryShort",
    "locQtiShort",
    "recDelSign",
    sum(iff(day_key = 'tomorrow', signed_scheduled_dth, 0)) as "tomorrow",
    sum(iff(day_key = 'today', signed_scheduled_dth, 0)) as "today",
    sum(iff(day_key = 'yesterday', signed_scheduled_dth, 0)) as "yesterday",
    sum(iff(day_key = 'two_days_old', signed_scheduled_dth, 0)) as "twoDaysOld",
    sum(iff(day_key = 'three_days_old', signed_scheduled_dth, 0)) as "threeDaysOld",
    sum(iff(day_key = 'four_days_old', signed_scheduled_dth, 0)) as "fourDaysOld",
    sum(iff(day_key = 'five_days_old', signed_scheduled_dth, 0)) as "fiveDaysOld",
    sum(iff(day_key = 'six_days_old', signed_scheduled_dth, 0)) as "sixDaysOld",
    max(cycle_id) as "cycleId",
    max(cycle_desc) as "cycleDesc",
    to_varchar(max(export_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS.FF3') as "dataAsOf"
  from latest_noms
  group by 1,2,3,4,5,6,7,8,9,10,11,12,13,14
)
select *
from plant_pivot
order by "state", abs("today") desc nulls last, "pipeline", "location"
