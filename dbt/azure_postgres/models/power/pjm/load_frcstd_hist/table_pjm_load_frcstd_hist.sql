-- Source-table DDL for pjm.load_frcstd_hist.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.load_frcstd_hist.

CREATE TABLE IF NOT EXISTS pjm.load_frcstd_hist (
    evaluated_at_ept TIMESTAMP NOT NULL,
    evaluated_at_utc TIMESTAMP NOT NULL,
    forecast_area VARCHAR NOT NULL,
    forecast_hour_beginning_ept TIMESTAMP NOT NULL,
    forecast_hour_beginning_utc TIMESTAMP NOT NULL,
    forecast_load_mw DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        evaluated_at_utc,
        evaluated_at_ept,
        forecast_hour_beginning_utc,
        forecast_hour_beginning_ept,
        forecast_area
    )
);
