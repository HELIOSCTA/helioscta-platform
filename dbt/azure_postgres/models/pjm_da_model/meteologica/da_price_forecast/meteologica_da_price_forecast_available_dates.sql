{{-
  config(
    materialized='ephemeral'
  )
}}

{%- set param_mode = var('pjm_da_model_param_mode', 'defaults') -%}
{%- if param_mode == 'runtime' -%}
    {%- set start_date_expr = "%(start_date)s::date" -%}
    {%- set cutoff_utc_expr = "%(cutoff_utc)s::timestamptz" -%}
    {%- set limit_expr = "%(limit)s::int" -%}
{%- else -%}
    {%- set start_date_expr = var('pjm_da_model_start_date_expr', "((current_timestamp at time zone 'America/New_York')::date + 1)") -%}
    {%- set cutoff_utc_expr = var('pjm_da_model_cutoff_utc_expr', "((((current_timestamp at time zone 'America/New_York')::date + time '10:00') at time zone 'America/New_York')::timestamptz)") -%}
    {%- set limit_expr = var('pjm_da_model_limit_expr', "60") -%}
{%- endif -%}

with params as (
    select
        {{ start_date_expr }} as start_date,
        {{ cutoff_utc_expr }} as cutoff_utc,
        {{ limit_expr }} as row_limit
),

det_source as (
    select
        d.forecast_period_start
    from {{ source('meteologica', 'usa_pjm_western_hub_da_power_price_forecast_hourly') }} d
    cross join params p
    where d.forecast_period_start >= p.start_date::timestamp
      and (p.cutoff_utc is null or d.issue_date <= p.cutoff_utc)
),

ens_source as (
    select
        e.forecast_period_start
    from {{ source('meteologica', 'usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly') }} e
    cross join params p
    where e.forecast_period_start >= p.start_date::timestamp
      and (p.cutoff_utc is null or e.issue_date <= p.cutoff_utc)
),

det_dates as (
    select
        d.forecast_period_start::date as forecast_date
    from det_source d
    group by d.forecast_period_start::date
    having count(distinct extract(hour from d.forecast_period_start)) >= 24
),

ens_dates as (
    select
        e.forecast_period_start::date as forecast_date
    from ens_source e
    group by e.forecast_period_start::date
    having count(distinct extract(hour from e.forecast_period_start)) >= 24
),

FINAL as (
    select
        det_dates.forecast_date::text as forecast_date
    from det_dates
    inner join ens_dates using (forecast_date)
)

select *
from FINAL
order by forecast_date
limit (select row_limit from params)
