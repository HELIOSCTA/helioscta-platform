-- Source-table DDL for pjm.unverified_five_min_lmps.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.unverified_five_min_lmps.

CREATE TABLE IF NOT EXISTS pjm.unverified_five_min_lmps (
    datetime_beginning_utc TIMESTAMP NOT NULL,
    datetime_beginning_ept TIMESTAMP NOT NULL,
    name VARCHAR NOT NULL,
    type VARCHAR NOT NULL,
    five_min_rtlmp DOUBLE PRECISION,
    hourly_lmp DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        datetime_beginning_ept,
        name,
        type
    )
);
