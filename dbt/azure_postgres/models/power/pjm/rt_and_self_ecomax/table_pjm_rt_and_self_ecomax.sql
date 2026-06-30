-- Source-table DDL for pjm.rt_and_self_ecomax.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.rt_and_self_ecomax.

CREATE TABLE IF NOT EXISTS pjm.rt_and_self_ecomax (
    datetime_beginning_utc TIMESTAMP NOT NULL,
    datetime_beginning_ept TIMESTAMP,
    rt_ecomax DOUBLE PRECISION,
    conf_disclaimer VARCHAR,
    self_ecomax DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc
    )
);
