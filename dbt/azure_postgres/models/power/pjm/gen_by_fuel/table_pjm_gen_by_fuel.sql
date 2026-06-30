-- Source-table DDL for pjm.gen_by_fuel.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.gen_by_fuel.

CREATE TABLE IF NOT EXISTS pjm.gen_by_fuel (
    datetime_beginning_utc TIMESTAMP NOT NULL,
    datetime_beginning_ept TIMESTAMP,
    fuel_type VARCHAR NOT NULL,
    mw DOUBLE PRECISION,
    fuel_percentage_of_total DOUBLE PRECISION,
    is_renewable BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        fuel_type
    )
);
