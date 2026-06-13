-- Source-table DDL for pjm.day_gen_capacity.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.day_gen_capacity.

CREATE TABLE IF NOT EXISTS pjm.day_gen_capacity (
    bid_datetime_beginning_ept TIMESTAMP,
    bid_datetime_beginning_utc TIMESTAMP NOT NULL,
    eco_max DOUBLE PRECISION,
    emerg_max DOUBLE PRECISION,
    total_committed DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        bid_datetime_beginning_utc
    )
);
