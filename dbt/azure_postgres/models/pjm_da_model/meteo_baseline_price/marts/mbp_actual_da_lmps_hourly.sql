{{
  config(
    materialized='ephemeral'
  )
}}

with params as (
    select
        %(target_date)s::date as target_date,
        %(hub)s::text as hub
),

source_rows as (
    select
        a.datetime_beginning_ept,
        a.pnode_name,
        a.total_lmp_da,
        a.system_energy_price_da,
        a.updated_at
    from {{ ref('mbp_00_src_pjm_da_lmps_hourly') }} a
    where a.datetime_beginning_ept >= %(target_date)s::date::timestamp
      and a.datetime_beginning_ept < %(target_date)s::date::timestamp + interval '1 day'
      and a.pnode_name = %(hub)s::text
      and a.row_is_current = true
),

FINAL as (
    select
        a.datetime_beginning_ept::date as date,
        extract(hour from a.datetime_beginning_ept)::int + 1 as hour_ending,
        a.pnode_name::text as region,
        a.total_lmp_da::float8 as lmp,
        a.system_energy_price_da::float8 as lmp_system_energy_price,
        a.updated_at as updated_at
    from source_rows a
)

select *
from FINAL
order by hour_ending
