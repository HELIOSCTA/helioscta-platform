{{-
  config(
    materialized='ephemeral'
  )
}}

{%- set param_mode = var('pjm_da_model_param_mode', 'defaults') -%}
{%- if param_mode == 'runtime' -%}
    {%- set start_date_expr = "%(start_date)s::date" -%}
    {%- set end_date_expr = "%(end_date)s::date" -%}
    {%- set hub_expr = "%(hub)s::text" -%}
{%- else -%}
    {%- set start_date_expr = var('pjm_da_model_start_date_expr', "((current_timestamp at time zone 'America/New_York')::date - 730)") -%}
    {%- set end_date_expr = var('pjm_da_model_end_date_expr', "((current_timestamp at time zone 'America/New_York')::date - 1)") -%}
    {%- set hub_expr = var('pjm_da_model_hub_expr', "'WESTERN HUB'::text") -%}
{%- endif -%}

with params as (
    select
        {{ start_date_expr }} as start_date,
        {{ end_date_expr }} as end_date,
        {{ hub_expr }} as hub
),

source_rows as (
    select
        a.datetime_beginning_ept,
        a.pnode_name,
        a.total_lmp_da,
        a.system_energy_price_da,
        a.updated_at
    from {{ source('pjm', 'da_hrl_lmps') }} a
    cross join params p
    where a.datetime_beginning_ept >= p.start_date::timestamp
      and a.datetime_beginning_ept < p.end_date::timestamp + interval '1 day'
      and a.pnode_name = p.hub
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
order by date, hour_ending
