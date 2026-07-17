-- Source-table DDL for pjm.hourly_solar_power_forecast.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.hourly_solar_power_forecast.

CREATE TABLE IF NOT EXISTS pjm.hourly_solar_power_forecast (
    evaluated_at_utc TIMESTAMP NOT NULL,
    evaluated_at_ept TIMESTAMP,
    datetime_beginning_utc TIMESTAMP NOT NULL,
    datetime_beginning_ept TIMESTAMP,
    datetime_ending_utc TIMESTAMP,
    datetime_ending_ept TIMESTAMP,
    solar_forecast_mwh DOUBLE PRECISION,
    solar_forecast_btm_mwh DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        evaluated_at_utc,
        datetime_beginning_utc
    )
);
