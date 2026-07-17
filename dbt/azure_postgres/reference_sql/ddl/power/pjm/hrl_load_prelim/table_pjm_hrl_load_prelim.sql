-- Source-table DDL for pjm.hrl_load_prelim.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.hrl_load_prelim.

CREATE TABLE IF NOT EXISTS pjm.hrl_load_prelim (
    datetime_beginning_ept TIMESTAMP,
    datetime_beginning_utc TIMESTAMP NOT NULL,
    datetime_ending_ept TIMESTAMP,
    datetime_ending_utc TIMESTAMP,
    load_area VARCHAR NOT NULL,
    prelim_load_avg_hourly DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        load_area
    )
);
