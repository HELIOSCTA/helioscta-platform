{{-
  config(
    materialized='ephemeral'
  )
}}

{%- set param_mode = var('pjm_da_model_param_mode', 'defaults') -%}
{%- if param_mode == 'runtime' -%}
    {%- set start_date_expr = "%(start_date)s::date" -%}
    {%- set end_date_expr = "%(end_date)s::date" -%}
    {%- set region_expr = "%(region)s::text" -%}
    {%- set lead_days_expr = "%(lead_days)s::int" -%}
{%- else -%}
    {%- set start_date_expr = var('pjm_da_model_start_date_expr', "((current_timestamp at time zone 'America/New_York')::date - 730)") -%}
    {%- set end_date_expr = var('pjm_da_model_end_date_expr', "((current_timestamp at time zone 'America/New_York')::date - 1)") -%}
    {%- set region_expr = var('pjm_da_model_region_expr', "'RTO'::text") -%}
    {%- set lead_days_expr = var('pjm_da_model_lead_days_expr', "1::int") -%}
{%- endif -%}

with params as (
    select
        {{ start_date_expr }} as start_date,
        {{ end_date_expr }} as end_date,
        {{ region_expr }} as region,
        {{ lead_days_expr }} as lead_days
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
      and o.forecast_execution_date_ept = o.forecast_date - p.lead_days
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
