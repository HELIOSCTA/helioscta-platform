-- Source-table DDL for ercot.actual_system_load.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.ercot.actual_system_load.

CREATE TABLE IF NOT EXISTS ercot.actual_system_load (
    operatingday DATE NOT NULL,
    hourending INTEGER NOT NULL,
    north DOUBLE PRECISION,
    south DOUBLE PRECISION,
    west DOUBLE PRECISION,
    houston DOUBLE PRECISION,
    total DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (operatingday, hourending)
);
