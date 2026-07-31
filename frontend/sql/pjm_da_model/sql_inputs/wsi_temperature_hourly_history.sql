-- GENERATED FILE. DO NOT EDIT.
-- Source dbt model: dbt/azure_postgres/models/pjm_da_model/weather/wsi_hourly_temperature/weather_wsi_hourly_temperature_history.sql
-- Source dbt compiled SQL: dbt\azure_postgres\target\compiled\helioscta_platform\models\pjm_da_model\weather\wsi_hourly_temperature\weather_wsi_hourly_temperature_history.sql
-- Promotion script: dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py
-- Rebuild from dbt/azure_postgres:
--   dbt compile --profiles-dir . --select +path:models/pjm_da_model --vars "{pjm_da_model_param_mode: runtime}"
--   python scripts/promote_pjm_da_model_backend_sql.py
with params as (
    select
        %(start_date)s::date as start_date,
        %(end_date)s::date as end_date,
        %(region)s::text as region
),

source_rows as (
    select
        w.observation_date,
        w.hour_beginning,
        w.temp_f,
        w.source_updated_at,
        w.updated_at
    from "helios_prod"."weather"."wsi_hourly_observed_temperatures" w
    cross join params p
    where w.observation_date >= p.start_date
      and w.observation_date <= p.end_date
      and w.region = p.region
),

hourly as (
    select
        s.observation_date as date,
        s.hour_beginning::int + 1 as hour_ending,
        avg(s.temp_f)::float8 as temp_at_hour,
        max(s.source_updated_at) as source_updated_at,
        max(s.updated_at) as updated_at,
        count(*) as station_count
    from source_rows s
    group by
        s.observation_date,
        s.hour_beginning::int + 1
),

FINAL as (
    select
        h.date,
        h.hour_ending,
        h.temp_at_hour,
        h.station_count,
        h.source_updated_at,
        h.updated_at
    from hourly h
)

select *
from FINAL
order by date, hour_ending