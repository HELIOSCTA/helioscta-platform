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
    {%- set load_region_expr = "%(load_region)s::text" -%}
{%- else -%}
    {%- set start_date_expr = var('pjm_da_model_start_date_expr', "((current_timestamp at time zone 'America/New_York')::date + 1)") -%}
    {%- set end_date_expr = var('pjm_da_model_end_date_expr', "((current_timestamp at time zone 'America/New_York')::date + 7)") -%}
    {%- set cutoff_utc_expr = var('pjm_da_model_cutoff_utc_expr', "((((current_timestamp at time zone 'America/New_York')::date + time '10:00') at time zone 'America/New_York')::timestamptz)") -%}
    {%- set load_region_expr = var('pjm_da_model_load_region_expr', "'RTO'::text") -%}
{%- endif -%}

with params as (
    select
        {{ start_date_expr }} as start_date,
        {{ end_date_expr }} as end_date,
        {{ cutoff_utc_expr }} as cutoff_utc,
        {{ load_region_expr }} as load_region
),

source_rows as (
    select
        l.evaluated_at_datetime_ept,
        l.evaluated_at_datetime_utc,
        l.forecast_datetime_beginning_ept::date as forecast_date,
        extract(hour from l.forecast_datetime_beginning_ept)::int + 1 as hour_ending,
        case
            when l.forecast_area in ('RTO_COMBINED', 'RTO COMBINED') then 'RTO'
            else l.forecast_area::text
        end as region,
        l.forecast_load_mw::float8 as forecast_load_mw,
        l.updated_at
    from {{ source('pjm', 'load_frcstd_7_day') }} l
    cross join params p
    where l.forecast_datetime_beginning_ept >= p.start_date::timestamp
      and l.forecast_datetime_beginning_ept < p.end_date::timestamp + interval '1 day'
      and case
            when l.forecast_area in ('RTO_COMBINED', 'RTO COMBINED') then 'RTO'
            else l.forecast_area::text
          end = p.load_region
      and l.evaluated_at_datetime_ept is not null
      and (
          p.cutoff_utc is null
          or l.evaluated_at_datetime_ept <= (p.cutoff_utc at time zone 'America/New_York')
      )
      and (
          p.cutoff_utc is null
          or l.evaluated_at_datetime_ept > (
              (p.cutoff_utc at time zone 'America/New_York') - interval '48 hours'
          )
      )
),

ranked as (
    select
        s.*,
        row_number() over (
            partition by s.forecast_date, s.hour_ending, s.region
            order by s.evaluated_at_datetime_ept desc, s.updated_at desc nulls last
        ) as row_rank
    from source_rows s
),

FINAL as (
    select
        r.forecast_date as date,
        r.hour_ending,
        r.region,
        r.forecast_load_mw,
        r.forecast_load_mw as load_mw_at_hour,
        r.evaluated_at_datetime_ept as forecast_execution_datetime_ept,
        r.evaluated_at_datetime_utc as forecast_execution_datetime_utc,
        r.updated_at
    from ranked r
    where r.row_rank = 1
)

select *
from FINAL
order by date, hour_ending
