-- GENERATED FILE. DO NOT EDIT.
-- Source dbt model: dbt/azure_postgres/models/pjm_da_model/weather/wsi_hourly_temperature/weather_wsi_hourly_temperature_latest_forecast.sql
-- Source dbt compiled SQL: dbt\azure_postgres\target\compiled\helioscta_platform\models\pjm_da_model\weather\wsi_hourly_temperature\weather_wsi_hourly_temperature_latest_forecast.sql
-- Promotion script: dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py
-- Rebuild from dbt/azure_postgres:
--   dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
--   python scripts/promote_pjm_da_model_backend_sql.py
with params as (
    select
        %(start_date)s::date as start_date,
        %(end_date)s::date as end_date,
        %(cutoff_utc)s::timestamptz as cutoff_utc,
        %(region)s::text as region
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
    from "helios_prod"."weather"."wsi_hourly_forecasts" w
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