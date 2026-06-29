-- Source-table DDL for pjm.ops_sum_frcst_peak_area.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.ops_sum_frcst_peak_area.

CREATE TABLE IF NOT EXISTS pjm.ops_sum_frcst_peak_area (
    area VARCHAR NOT NULL,
    generated_at_ept TIMESTAMP NOT NULL,
    internal_scheduled_capacity DOUBLE PRECISION,
    pjm_load_forecast DOUBLE PRECISION,
    projected_peak_datetime_ept TIMESTAMP,
    projected_peak_datetime_utc TIMESTAMP NOT NULL,
    unscheduled_steam_capacity DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        projected_peak_datetime_utc,
        generated_at_ept,
        area
    )
);
