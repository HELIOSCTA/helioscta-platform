{{-
  config(
    materialized='ephemeral'
  )
}}

{%- set param_mode = var('pjm_da_model_param_mode', 'defaults') -%}
{%- if param_mode == 'runtime' -%}
    {%- set start_date_expr = "%(start_date)s::date" -%}
    {%- set end_date_expr = "%(end_date)s::date" -%}
    {%- set cutoff_utc_expr = "%(cutoff_utc)s::timestamptz" -%}
    {%- set region_expr = "%(region)s::text" -%}
{%- else -%}
    {%- set start_date_expr = var('pjm_da_model_start_date_expr', "((current_timestamp at time zone 'America/New_York')::date + 1)") -%}
    {%- set end_date_expr = var('pjm_da_model_end_date_expr', "((current_timestamp at time zone 'America/New_York')::date + 14)") -%}
    {%- set cutoff_utc_expr = var('pjm_da_model_cutoff_utc_expr', "((((current_timestamp at time zone 'America/New_York')::date + time '10:00') at time zone 'America/New_York')::timestamptz)") -%}
    {%- set region_expr = var('pjm_da_model_region_expr', "'PJM'::text") -%}
{%- endif -%}

with params as (
    select
        {{ start_date_expr }} as start_date,
        {{ end_date_expr }} as end_date,
        {{ cutoff_utc_expr }} as cutoff_utc,
        {{ region_expr }} as region
),

source_rows as (
    select
        w.station_id,
        w.region,
        w.forecast_issued_at_utc,
        w.forecast_time_utc,
        (w.forecast_time_utc at time zone 'America/New_York')::date as forecast_date_ept,
        extract(hour from (w.forecast_time_utc at time zone 'America/New_York'))::int + 1
            as hour_ending,
        w.temp_f,
        w.updated_at
    from {{ source('weather', 'wsi_hourly_forecasts') }} w
    cross join params p
    where (w.forecast_time_utc at time zone 'America/New_York')::date >= p.start_date
      and (w.forecast_time_utc at time zone 'America/New_York')::date <= p.end_date
      and w.region = p.region
      and (p.cutoff_utc is null or w.forecast_issued_at_utc <= p.cutoff_utc)
),

ranked as (
    select
        s.*,
        row_number() over (
            partition by s.station_id, s.forecast_time_utc
            order by s.forecast_issued_at_utc desc, s.updated_at desc nulls last
        ) as row_rank
    from source_rows s
),

latest_station_rows as (
    select
        r.forecast_date_ept,
        r.hour_ending,
        r.temp_f,
        r.forecast_issued_at_utc,
        r.updated_at
    from ranked r
    where r.row_rank = 1
),

hourly as (
    select
        l.forecast_date_ept as date,
        l.hour_ending,
        avg(l.temp_f)::float8 as temp_at_hour,
        max(l.forecast_issued_at_utc) as forecast_issued_at_utc,
        max(l.updated_at) as updated_at,
        count(*) as station_count
    from latest_station_rows l
    group by
        l.forecast_date_ept,
        l.hour_ending
),

FINAL as (
    select
        h.date,
        h.hour_ending,
        h.temp_at_hour,
        h.station_count,
        h.forecast_issued_at_utc,
        h.updated_at
    from hourly h
)

select *
from FINAL
order by date, hour_ending
