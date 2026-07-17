-- Source-table indexes for pjm.hourly_solar_power_forecast.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_hourly_solar_power_forecast_freshness
    on pjm.hourly_solar_power_forecast (
        evaluated_at_ept desc
    )
    include (
        datetime_beginning_ept,
        datetime_ending_ept,
        solar_forecast_mwh,
        solar_forecast_btm_mwh
    );

create index concurrently if not exists idx_hourly_solar_power_forecast_hour_lookup
    on pjm.hourly_solar_power_forecast (
        datetime_beginning_utc, evaluated_at_utc desc
    );
