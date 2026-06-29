-- Source-table DDL for pjm.ops_sum_prev_period.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.ops_sum_prev_period.

CREATE TABLE IF NOT EXISTS pjm.ops_sum_prev_period (
    actual_load DOUBLE PRECISION,
    area VARCHAR NOT NULL,
    area_load_forecast DOUBLE PRECISION,
    datetime_beginning_ept TIMESTAMP,
    datetime_beginning_utc TIMESTAMP NOT NULL,
    datetime_ending_ept TIMESTAMP,
    datetime_ending_utc TIMESTAMP,
    dispatch_rate DOUBLE PRECISION,
    generated_at_ept TIMESTAMP NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        area
    )
);
