-- GENERATED FILE. DO NOT EDIT.
-- Source dbt model: dbt/azure_postgres/models/pjm_da_model/pjm/gen_by_fuel/pjm_gen_by_fuel_renewables_hourly_history.sql
-- Source dbt compiled SQL: dbt\azure_postgres\target\compiled\helioscta_platform\models\pjm_da_model\pjm\gen_by_fuel\pjm_gen_by_fuel_renewables_hourly_history.sql
-- Promotion script: dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py
-- Rebuild from dbt/azure_postgres:
--   dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
--   python scripts/promote_pjm_da_model_backend_sql.py
with params as (
    select
        %(start_date)s::date as start_date,
        %(end_date)s::date as end_date
),

gen_by_fuel_source_rows as (
    select
        g.datetime_beginning_ept,
        g.fuel_type,
        g.mw,
        g.updated_at
    from "helios_prod"."pjm"."gen_by_fuel" g
    cross join params p
    where g.datetime_beginning_ept >= p.start_date::timestamp
      and g.datetime_beginning_ept < p.end_date::timestamp + interval '1 day'
      and g.fuel_type in ('Solar', 'Wind')
),

gen_by_fuel_hourly as (
    select
        s.datetime_beginning_ept::date as date,
        extract(hour from s.datetime_beginning_ept)::int + 1 as hour_ending,
        avg(case when s.fuel_type = 'Solar' then s.mw end)::float8 as solar_at_hour,
        avg(case when s.fuel_type = 'Wind' then s.mw end)::float8 as wind_at_hour,
        max(s.updated_at) as updated_at
    from gen_by_fuel_source_rows s
    group by
        s.datetime_beginning_ept::date,
        extract(hour from s.datetime_beginning_ept)::int + 1
),

solar_actual_hourly as (
    select
        s.datetime_beginning_ept::date as date,
        extract(hour from s.datetime_beginning_ept)::int + 1 as hour_ending,
        avg(s.solar_generation_mw)::float8 as solar_at_hour,
        max(s.updated_at) as updated_at
    from "helios_prod"."pjm"."solar_gen" s
    cross join params p
    where s.datetime_beginning_ept >= p.start_date::timestamp
      and s.datetime_beginning_ept < p.end_date::timestamp + interval '1 day'
      and s.area = 'RTO'
    group by
        s.datetime_beginning_ept::date,
        extract(hour from s.datetime_beginning_ept)::int + 1
),

five_min_solar_actual_hourly as (
    select
        s.datetime_beginning_ept::date as date,
        extract(hour from s.datetime_beginning_ept)::int + 1 as hour_ending,
        avg(s.solar_generation_mw)::float8 as solar_at_hour,
        max(s.updated_at) as updated_at
    from "helios_prod"."pjm"."five_min_solar_generation" s
    cross join params p
    where s.datetime_beginning_ept >= p.start_date::timestamp
      and s.datetime_beginning_ept < p.end_date::timestamp + interval '1 day'
    group by
        s.datetime_beginning_ept::date,
        extract(hour from s.datetime_beginning_ept)::int + 1
),

wind_actual_hourly as (
    select
        w.datetime_beginning_ept::date as date,
        extract(hour from w.datetime_beginning_ept)::int + 1 as hour_ending,
        avg(w.wind_generation_mw)::float8 as wind_at_hour,
        max(w.updated_at) as updated_at
    from "helios_prod"."pjm"."wind_gen" w
    cross join params p
    where w.datetime_beginning_ept >= p.start_date::timestamp
      and w.datetime_beginning_ept < p.end_date::timestamp + interval '1 day'
      and w.area = 'RTO'
    group by
        w.datetime_beginning_ept::date,
        extract(hour from w.datetime_beginning_ept)::int + 1
),

actual_hourly_keys as (
    select date, hour_ending from gen_by_fuel_hourly
    union
    select date, hour_ending from solar_actual_hourly
    union
    select date, hour_ending from five_min_solar_actual_hourly
    union
    select date, hour_ending from wind_actual_hourly
),

actual_hourly as (
    select
        k.date,
        k.hour_ending,
        coalesce(s.solar_at_hour, fs.solar_at_hour, g.solar_at_hour)::float8
            as solar_actual_at_hour,
        coalesce(w.wind_at_hour, g.wind_at_hour)::float8 as wind_actual_at_hour,
        greatest(
            coalesce(s.updated_at, '-infinity'::timestamptz),
            coalesce(fs.updated_at, '-infinity'::timestamptz),
            coalesce(w.updated_at, '-infinity'::timestamptz),
            coalesce(g.updated_at, '-infinity'::timestamptz)
        ) as updated_at
    from actual_hourly_keys k
    left join gen_by_fuel_hourly g
      on g.date = k.date
     and g.hour_ending = k.hour_ending
    left join solar_actual_hourly s
      on s.date = k.date
     and s.hour_ending = k.hour_ending
    left join five_min_solar_actual_hourly fs
      on fs.date = k.date
     and fs.hour_ending = k.hour_ending
    left join wind_actual_hourly w
      on w.date = k.date
     and w.hour_ending = k.hour_ending
),

solar_forecast_source as (
    select
        s.datetime_beginning_ept::date as date,
        extract(hour from s.datetime_beginning_ept)::int + 1 as hour_ending,
        s.evaluated_at_ept,
        s.solar_forecast_mwh::float8 as solar_at_hour,
        s.updated_at
    from "helios_prod"."pjm"."hourly_solar_power_forecast" s
    cross join params p
    where s.datetime_beginning_ept >= p.start_date::timestamp
      and s.datetime_beginning_ept < p.end_date::timestamp + interval '1 day'
      and s.evaluated_at_ept <= (
          s.datetime_beginning_ept::date - interval '1 day' + interval '10 hours'
      )
),

solar_forecast_ranked as (
    select
        s.*,
        row_number() over (
            partition by s.date, s.hour_ending
            order by s.evaluated_at_ept desc nulls last, s.updated_at desc nulls last
        ) as row_rank
    from solar_forecast_source s
),

solar_forecast_hourly as (
    select
        s.date,
        s.hour_ending,
        s.solar_at_hour,
        s.updated_at
    from solar_forecast_ranked s
    where s.row_rank = 1
),

wind_forecast_source as (
    select
        w.datetime_beginning_ept::date as date,
        extract(hour from w.datetime_beginning_ept)::int + 1 as hour_ending,
        w.evaluated_at_ept,
        w.wind_forecast_mwh::float8 as wind_at_hour,
        w.updated_at
    from "helios_prod"."pjm"."hourly_wind_power_forecast" w
    cross join params p
    where w.datetime_beginning_ept >= p.start_date::timestamp
      and w.datetime_beginning_ept < p.end_date::timestamp + interval '1 day'
      and w.evaluated_at_ept <= (
          w.datetime_beginning_ept::date - interval '1 day' + interval '10 hours'
      )
),

wind_forecast_ranked as (
    select
        w.*,
        row_number() over (
            partition by w.date, w.hour_ending
            order by w.evaluated_at_ept desc nulls last, w.updated_at desc nulls last
        ) as row_rank
    from wind_forecast_source w
),

wind_forecast_hourly as (
    select
        w.date,
        w.hour_ending,
        w.wind_at_hour,
        w.updated_at
    from wind_forecast_ranked w
    where w.row_rank = 1
),

hourly_keys as (
    select date, hour_ending from actual_hourly
    union
    select date, hour_ending from solar_forecast_hourly
    union
    select date, hour_ending from wind_forecast_hourly
),

updated_by_key as (
    select
        u.date,
        u.hour_ending,
        max(u.updated_at) as updated_at
    from (
        select date, hour_ending, updated_at from actual_hourly
        union all
        select date, hour_ending, updated_at from solar_forecast_hourly
        union all
        select date, hour_ending, updated_at from wind_forecast_hourly
    ) u
    group by u.date, u.hour_ending
),

hourly as (
    select
        k.date,
        k.hour_ending,
        s.solar_at_hour::float8 as solar_pjm_forecast_at_hour,
        w.wind_at_hour::float8 as wind_pjm_forecast_at_hour,
        a.solar_actual_at_hour::float8 as solar_actual_at_hour,
        a.wind_actual_at_hour::float8 as wind_actual_at_hour,
        coalesce(s.solar_at_hour, a.solar_actual_at_hour)::float8 as solar_at_hour,
        coalesce(w.wind_at_hour, a.wind_actual_at_hour)::float8 as wind_at_hour,
        u.updated_at
    from hourly_keys k
    left join actual_hourly a
      on a.date = k.date
     and a.hour_ending = k.hour_ending
    left join solar_forecast_hourly s
      on s.date = k.date
     and s.hour_ending = k.hour_ending
    left join wind_forecast_hourly w
      on w.date = k.date
     and w.hour_ending = k.hour_ending
    left join updated_by_key u
      on u.date = k.date
     and u.hour_ending = k.hour_ending
),

FINAL as (
    select
        h.date,
        h.hour_ending,
        h.solar_pjm_forecast_at_hour,
        h.wind_pjm_forecast_at_hour,
        h.solar_actual_at_hour,
        h.wind_actual_at_hour,
        h.solar_at_hour,
        h.wind_at_hour,
        h.updated_at
    from hourly h
)

select *
from FINAL
order by date, hour_ending