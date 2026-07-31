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
{%- else -%}
    {%- set start_date_expr = var('pjm_da_model_start_date_expr', "((current_timestamp at time zone 'America/New_York')::date - 730)") -%}
    {%- set end_date_expr = var('pjm_da_model_end_date_expr', "((current_timestamp at time zone 'America/New_York')::date - 1)") -%}
    {%- set region_expr = var('pjm_da_model_region_expr', "'PJM'::text") -%}
{%- endif -%}

with params as (
    select
        {{ start_date_expr }} as start_date,
        {{ end_date_expr }} as end_date,
        {{ region_expr }} as region
),

source_rows as (
    select
        w.observation_date,
        w.hour_beginning,
        w.temp_f,
        w.source_updated_at,
        w.updated_at
    from {{ source('weather', 'wsi_hourly_observed_temperatures') }} w
    cross join params p
    where w.observation_date >= p.start_date
      and w.observation_date <= p.end_date
      and w.region = p.region
),

hourly as (
    select
        s.observation_date as date,
        s.hour_beginning::int + 1 as hour_ending,
        avg(s.temp_f)::float8 as temp_at_hour,
        max(s.source_updated_at) as source_updated_at,
        max(s.updated_at) as updated_at,
        count(*) as station_count
    from source_rows s
    group by
        s.observation_date,
        s.hour_beginning::int + 1
),

FINAL as (
    select
        h.date,
        h.hour_ending,
        h.temp_at_hour,
        h.station_count,
        h.source_updated_at,
        h.updated_at
    from hourly h
)

select *
from FINAL
order by date, hour_ending
