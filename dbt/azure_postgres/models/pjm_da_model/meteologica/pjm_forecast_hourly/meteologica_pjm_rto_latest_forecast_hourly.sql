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
    {%- set forecast_area_expr = "%(forecast_area)s::text" -%}
{%- else -%}
    {%- set start_date_expr = var('pjm_da_model_start_date_expr', "((current_timestamp at time zone 'America/New_York')::date + 1)") -%}
    {%- set end_date_expr = var('pjm_da_model_end_date_expr', "((current_timestamp at time zone 'America/New_York')::date + 14)") -%}
    {%- set cutoff_utc_expr = var('pjm_da_model_cutoff_utc_expr', "((((current_timestamp at time zone 'America/New_York')::date + time '10:00') at time zone 'America/New_York')::timestamptz)") -%}
    {%- set region_expr = var('pjm_da_model_region_expr', "'PJM'::text") -%}
    {%- set forecast_area_expr = var('pjm_da_model_forecast_area_expr', "'RTO'::text") -%}
{%- endif -%}

with params as (
    select
        {{ start_date_expr }} as start_date,
        {{ end_date_expr }} as end_date,
        {{ cutoff_utc_expr }} as cutoff_utc,
        {{ region_expr }} as region,
        {{ forecast_area_expr }} as forecast_area
),

source_rows as (
    select
        m.content_id,
        m.update_id,
        m.issue_date,
        m.metric,
        m.region,
        m.forecast_area,
        m.forecast_period_start,
        m.forecast_mw,
        m.updated_at
    from {{ source('meteologica', 'pjm_forecast_hourly') }} m
    cross join params p
    where m.forecast_period_start >= p.start_date::timestamp
      and m.forecast_period_start < p.end_date::timestamp + interval '1 day'
      and m.region = p.region
      and m.forecast_area = p.forecast_area
      and m.metric in ('load', 'solar', 'wind')
      and m.issue_date is not null
      and (p.cutoff_utc is null or m.issue_date <= p.cutoff_utc)
      and (
          p.cutoff_utc is null
          or m.issue_date > p.cutoff_utc - interval '48 hours'
      )
),

ranked as (
    select
        s.*,
        row_number() over (
            partition by s.metric, s.forecast_period_start
            order by s.issue_date desc, s.updated_at desc nulls last, s.update_id desc, s.content_id desc
        ) as row_rank
    from source_rows s
),

latest_rows as (
    select
        r.forecast_period_start,
        r.metric,
        r.forecast_mw,
        r.issue_date,
        r.updated_at
    from ranked r
    where r.row_rank = 1
),

hourly as (
    select
        l.forecast_period_start::date as date,
        extract(hour from l.forecast_period_start)::int + 1 as hour_ending,
        avg(case when l.metric = 'load' then l.forecast_mw end)::float8 as load_mw_at_hour,
        avg(case when l.metric = 'solar' then l.forecast_mw end)::float8 as solar_at_hour,
        avg(case when l.metric = 'wind' then l.forecast_mw end)::float8 as wind_at_hour,
        max(l.issue_date) as latest_issue_date,
        max(l.updated_at) as updated_at
    from latest_rows l
    group by
        l.forecast_period_start::date,
        extract(hour from l.forecast_period_start)::int + 1
),

FINAL as (
    select
        h.date,
        h.hour_ending,
        h.load_mw_at_hour,
        h.solar_at_hour,
        h.wind_at_hour,
        (
            h.load_mw_at_hour
            - coalesce(h.solar_at_hour, 0.0)
            - coalesce(h.wind_at_hour, 0.0)
        )::float8 as net_load_at_hour,
        h.latest_issue_date,
        h.updated_at
    from hourly h
)

select *
from FINAL
order by date, hour_ending
