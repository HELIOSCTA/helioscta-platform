-- Source-table DDL for pjm.load_frcstd_7_day.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.load_frcstd_7_day.

CREATE TABLE IF NOT EXISTS pjm.load_frcstd_7_day (
    evaluated_at_datetime_ept TIMESTAMP,
    evaluated_at_datetime_utc TIMESTAMP NOT NULL,
    forecast_area VARCHAR NOT NULL,
    forecast_datetime_beginning_ept TIMESTAMP,
    forecast_datetime_beginning_utc TIMESTAMP NOT NULL,
    forecast_datetime_ending_ept TIMESTAMP,
    forecast_datetime_ending_utc TIMESTAMP,
    forecast_load_mw DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        evaluated_at_datetime_utc,
        forecast_datetime_beginning_utc,
        forecast_area
    )
);
