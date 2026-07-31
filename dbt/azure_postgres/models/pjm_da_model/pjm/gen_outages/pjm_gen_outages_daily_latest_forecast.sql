{{-
  config(
    materialized='ephemeral'
  )
}}

{%- set param_mode = var('pjm_da_model_param_mode', 'defaults') -%}
{%- if param_mode == 'runtime' -%}
    {%- set start_date_expr = "%(start_date)s::date" -%}
    {%- set end_date_expr = "%(end_date)s::date" -%}
    {%- set cutoff_date_expr = "%(cutoff_date)s::date" -%}
    {%- set region_expr = "%(region)s::text" -%}
{%- else -%}
    {%- set start_date_expr = var('pjm_da_model_start_date_expr', "((current_timestamp at time zone 'America/New_York')::date + 1)") -%}
    {%- set end_date_expr = var('pjm_da_model_end_date_expr', "((current_timestamp at time zone 'America/New_York')::date + 14)") -%}
    {%- set cutoff_date_expr = var('pjm_da_model_cutoff_date_expr', "(current_timestamp at time zone 'America/New_York')::date") -%}
    {%- set region_expr = var('pjm_da_model_region_expr', "'RTO'::text") -%}
{%- endif -%}

with params as (
    select
        {{ start_date_expr }} as start_date,
        {{ end_date_expr }} as end_date,
        {{ cutoff_date_expr }} as cutoff_date,
        {{ region_expr }} as region
),

source_rows as (
    select
        o.forecast_date,
        o.forecast_execution_date_ept,
        case
            when o.region = 'PJM RTO' then 'RTO'
            when o.region = 'Western' then 'WEST'
            when o.region = 'Mid Atlantic - Dominion' then 'MIDATL_DOM'
            else o.region::text
        end as region,
        o.total_outages_mw,
        o.updated_at
    from {{ source('pjm', 'gen_outages_by_type') }} o
    cross join params p
    where o.forecast_date >= p.start_date
      and o.forecast_date <= p.end_date
      and (p.cutoff_date is null or o.forecast_execution_date_ept <= p.cutoff_date)
      and case
            when o.region = 'PJM RTO' then 'RTO'
            when o.region = 'Western' then 'WEST'
            when o.region = 'Mid Atlantic - Dominion' then 'MIDATL_DOM'
            else o.region::text
          end = p.region
),

ranked as (
    select
        s.*,
        row_number() over (
            partition by s.forecast_date, s.region
            order by s.forecast_execution_date_ept desc nulls last, s.updated_at desc nulls last
        ) as row_rank
    from source_rows s
),

FINAL as (
    select
        r.forecast_date as date,
        r.region::text as region,
        r.total_outages_mw::float8 as outage_total_mw,
        r.forecast_execution_date_ept,
        r.updated_at
    from ranked r
    where r.row_rank = 1
)

select *
from FINAL
order by date
