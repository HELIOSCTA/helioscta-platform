{{
  config(
    materialized='ephemeral'
  )
}}

with params as (
    select
        %(start_date)s::date as start_date,
        %(cutoff_utc)s::timestamptz as cutoff_utc
),

det_source as (
    select
        d.forecast_period_start
    from {{ ref('mbp_00_src_meteologica_det_da_price_forecast_hourly') }} d
    where d.forecast_period_start >= %(start_date)s::date::timestamp
      and (%(cutoff_utc)s::timestamptz is null or d.issue_date <= %(cutoff_utc)s::timestamptz)
),

ens_source as (
    select
        e.forecast_period_start
    from {{ ref('mbp_00_src_meteologica_ens_da_price_forecast_hourly') }} e
    where e.forecast_period_start >= %(start_date)s::date::timestamp
      and (%(cutoff_utc)s::timestamptz is null or e.issue_date <= %(cutoff_utc)s::timestamptz)
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
limit %(limit)s
