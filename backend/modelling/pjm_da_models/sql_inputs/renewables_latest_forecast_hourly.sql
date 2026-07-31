-- GENERATED FILE. DO NOT EDIT.
-- Source dbt model: dbt/azure_postgres/models/pjm_da_model/pjm/gen_by_fuel/pjm_renewables_latest_forecast_hourly.sql
-- Source dbt compiled SQL: dbt\azure_postgres\target\compiled\helioscta_platform\models\pjm_da_model\pjm\gen_by_fuel\pjm_renewables_latest_forecast_hourly.sql
-- Promotion script: dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py
-- Rebuild from dbt/azure_postgres:
--   dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
--   python scripts/promote_pjm_da_model_backend_sql.py
with params as (
    select
        %(start_date)s::date as start_date,
        %(end_date)s::date as end_date,
        %(cutoff_utc)s::timestamptz as cutoff_utc
),

solar_source as (
    select
        s.datetime_beginning_ept::date as date,
        extract(hour from s.datetime_beginning_ept)::int + 1 as hour_ending,
        s.evaluated_at_ept,
        s.evaluated_at_utc,
        s.solar_forecast_mwh::float8 as solar_at_hour,
        s.updated_at
    from "helios_prod"."pjm"."hourly_solar_power_forecast" s
    cross join params p
    where s.datetime_beginning_ept >= p.start_date::timestamp
      and s.datetime_beginning_ept < p.end_date::timestamp + interval '1 day'
      and s.evaluated_at_ept is not null
      and (
          p.cutoff_utc is null
          or s.evaluated_at_ept <= (p.cutoff_utc at time zone 'America/New_York')
      )
      and (
          p.cutoff_utc is null
          or s.evaluated_at_ept > (
              (p.cutoff_utc at time zone 'America/New_York') - interval '48 hours'
          )
      )
),

solar_ranked as (
    select
        s.*,
        row_number() over (
            partition by s.date, s.hour_ending
            order by s.evaluated_at_ept desc, s.updated_at desc nulls last
        ) as row_rank
    from solar_source s
),

solar_hourly as (
    select
        date,
        hour_ending,
        solar_at_hour,
        evaluated_at_ept,
        evaluated_at_utc,
        updated_at
    from solar_ranked
    where row_rank = 1
),

wind_source as (
    select
        w.datetime_beginning_ept::date as date,
        extract(hour from w.datetime_beginning_ept)::int + 1 as hour_ending,
        w.evaluated_at_ept,
        w.evaluated_at_utc,
        w.wind_forecast_mwh::float8 as wind_at_hour,
        w.updated_at
    from "helios_prod"."pjm"."hourly_wind_power_forecast" w
    cross join params p
    where w.datetime_beginning_ept >= p.start_date::timestamp
      and w.datetime_beginning_ept < p.end_date::timestamp + interval '1 day'
      and w.evaluated_at_ept is not null
      and (
          p.cutoff_utc is null
          or w.evaluated_at_ept <= (p.cutoff_utc at time zone 'America/New_York')
      )
      and (
          p.cutoff_utc is null
          or w.evaluated_at_ept > (
              (p.cutoff_utc at time zone 'America/New_York') - interval '48 hours'
          )
      )
),

wind_ranked as (
    select
        w.*,
        row_number() over (
            partition by w.date, w.hour_ending
            order by w.evaluated_at_ept desc, w.updated_at desc nulls last
        ) as row_rank
    from wind_source w
),

wind_hourly as (
    select
        date,
        hour_ending,
        wind_at_hour,
        evaluated_at_ept,
        evaluated_at_utc,
        updated_at
    from wind_ranked
    where row_rank = 1
),

hourly_keys as (
    select date, hour_ending from solar_hourly
    union
    select date, hour_ending from wind_hourly
),

FINAL as (
    select
        k.date,
        k.hour_ending,
        s.solar_at_hour,
        w.wind_at_hour,
        greatest(
            coalesce(s.evaluated_at_ept, '-infinity'::timestamp),
            coalesce(w.evaluated_at_ept, '-infinity'::timestamp)
        ) as latest_evaluated_at_ept,
        greatest(
            coalesce(s.evaluated_at_utc, '-infinity'::timestamp),
            coalesce(w.evaluated_at_utc, '-infinity'::timestamp)
        ) as latest_evaluated_at_utc,
        greatest(
            coalesce(s.updated_at, '-infinity'::timestamptz),
            coalesce(w.updated_at, '-infinity'::timestamptz)
        ) as updated_at
    from hourly_keys k
    left join solar_hourly s
      on s.date = k.date
     and s.hour_ending = k.hour_ending
    left join wind_hourly w
      on w.date = k.date
     and w.hour_ending = k.hour_ending
)

select *
from FINAL
order by date, hour_ending