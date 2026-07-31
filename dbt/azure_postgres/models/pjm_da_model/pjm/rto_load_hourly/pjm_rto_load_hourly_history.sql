{{-
  config(
    materialized='ephemeral'
  )
}}

{%- set param_mode = var('pjm_da_model_param_mode', 'defaults') -%}
{%- if param_mode == 'runtime' -%}
    {%- set start_date_expr = "%(start_date)s::date" -%}
    {%- set end_date_expr = "%(end_date)s::date" -%}
    {%- set load_region_expr = "%(load_region)s::text" -%}
{%- else -%}
    {%- set start_date_expr = var('pjm_da_model_start_date_expr', "((current_timestamp at time zone 'America/New_York')::date - 730)") -%}
    {%- set end_date_expr = var('pjm_da_model_end_date_expr', "((current_timestamp at time zone 'America/New_York')::date - 1)") -%}
    {%- set load_region_expr = var('pjm_da_model_load_region_expr', "'RTO'::text") -%}
{%- endif -%}

with params as (
    select
        {{ start_date_expr }} as start_date,
        {{ end_date_expr }} as end_date,
        {{ load_region_expr }} as load_region
),

metered_source_rows as (
    select
        l.datetime_beginning_ept,
        l.load_area,
        l.mkt_region,
        l.nerc_region,
        l.zone,
        l.mw,
        l.is_verified,
        l.updated_at
    from {{ source('pjm', 'hrl_load_metered') }} l
    cross join params p
    where l.datetime_beginning_ept >= p.start_date::timestamp
      and l.datetime_beginning_ept < p.end_date::timestamp + interval '1 day'
      and l.load_area = p.load_region
),

metered_hourly as (
    select
        s.datetime_beginning_ept::date as date,
        extract(hour from s.datetime_beginning_ept)::int + 1 as hour_ending,
        s.load_area::text as region,
        avg(s.mw)::float8 as load_mw_at_hour,
        bool_or(coalesce(s.is_verified, false)) as is_verified,
        max(s.updated_at) as updated_at
    from metered_source_rows s
    group by
        s.datetime_beginning_ept::date,
        extract(hour from s.datetime_beginning_ept)::int + 1,
        s.load_area
),

prelim_source_rows as (
    select
        pld.datetime_beginning_ept,
        pld.load_area,
        pld.prelim_load_avg_hourly,
        pld.updated_at
    from {{ source('pjm', 'hrl_load_prelim') }} pld
    cross join params p
    where pld.datetime_beginning_ept >= p.start_date::timestamp
      and pld.datetime_beginning_ept < p.end_date::timestamp + interval '1 day'
      and pld.load_area = p.load_region
),

prelim_hourly as (
    select
        s.datetime_beginning_ept::date as date,
        extract(hour from s.datetime_beginning_ept)::int + 1 as hour_ending,
        s.load_area::text as region,
        avg(s.prelim_load_avg_hourly)::float8 as load_mw_at_hour,
        max(s.updated_at) as updated_at
    from prelim_source_rows s
    group by
        s.datetime_beginning_ept::date,
        extract(hour from s.datetime_beginning_ept)::int + 1,
        s.load_area
),

hourly_keys as (
    select date, hour_ending, region from metered_hourly
    union
    select date, hour_ending, region from prelim_hourly
),

hourly as (
    select
        k.date,
        k.hour_ending,
        k.region,
        coalesce(m.load_mw_at_hour, p.load_mw_at_hour)::float8 as load_mw_at_hour,
        coalesce(m.is_verified, false) as is_verified,
        case
            when m.load_mw_at_hour is not null then 'metered'
            when p.load_mw_at_hour is not null then 'prelim'
            else null
        end::text as load_source,
        greatest(
            coalesce(m.updated_at, '-infinity'::timestamptz),
            coalesce(p.updated_at, '-infinity'::timestamptz)
        ) as updated_at
    from hourly_keys k
    left join metered_hourly m
      on m.date = k.date
     and m.hour_ending = k.hour_ending
     and m.region = k.region
    left join prelim_hourly p
      on p.date = k.date
     and p.hour_ending = k.hour_ending
     and p.region = k.region
),

FINAL as (
    select
        h.date,
        h.hour_ending,
        h.region,
        h.load_mw_at_hour,
        h.is_verified,
        h.load_source,
        h.updated_at
    from hourly h
)

select *
from FINAL
order by date, hour_ending
