{{-
  config(
    materialized='ephemeral'
  )
}}

{%- set param_mode = var('pjm_da_model_param_mode', 'defaults') -%}
{%- if param_mode == 'runtime' -%}
    {%- set start_date_expr = "%(start_date)s::date" -%}
    {%- set end_date_expr = "%(end_date)s::date" -%}
{%- else -%}
    {%- set start_date_expr = var('pjm_da_model_start_date_expr', "((current_timestamp at time zone 'America/New_York')::date - 730)") -%}
    {%- set end_date_expr = var('pjm_da_model_end_date_expr', "((current_timestamp at time zone 'America/New_York')::date + 14)") -%}
{%- endif -%}

with params as (
    select
        {{ start_date_expr }} as start_date,
        {{ end_date_expr }} as end_date
),

gas_daily as (
    select
        gas_day,
        trade_date,
        gas_henry_hub,
        gas_m3,
        gas_tco,
        gas_tz6,
        gas_dom_south,
        latest_trade_date,
        updated_at,
        contract_dates_updated_at
    from {{ ref('ice_python_next_day_gas_pjm_features') }}
),

hours as (
    select hour_ending
    from generate_series(1, 24) as h(hour_ending)
),

pjm_hours as (
    select
        (d.date::timestamp + ((h.hour_ending - 1) * interval '1 hour')) as datetime,
        d.date,
        h.hour_ending,
        (
            (d.date::timestamp + ((h.hour_ending - 1) * interval '1 hour'))
            at time zone 'America/New_York'
            at time zone 'America/Chicago'
        ) as pjm_central_local
    from (
        select spine_date::date as date
        from params p
        cross join lateral generate_series(
            p.start_date::timestamp,
            p.end_date::timestamp,
            interval '1 day'
        ) as spine(spine_date)
    ) d
    cross join hours h
),

pjm_hours_with_gas_day as (
    select
        datetime,
        date,
        hour_ending,
        case
            when pjm_central_local::time >= time '09:00:00'
                then pjm_central_local::date
            else (pjm_central_local::date - interval '1 day')::date
        end as gas_day
    from pjm_hours
),

FINAL as (
    select
        p.datetime,
        p.date,
        p.hour_ending,
        p.gas_day,
        g.trade_date,
        g.gas_henry_hub,
        g.gas_m3,
        g.gas_tco,
        g.gas_tz6,
        g.gas_dom_south,
        g.latest_trade_date,
        g.updated_at,
        g.contract_dates_updated_at
    from pjm_hours_with_gas_day p
    left join gas_daily g
      on g.gas_day = p.gas_day
)

select *
from FINAL
order by date, hour_ending
