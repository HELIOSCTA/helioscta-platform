-- Source-table DDL for ercot.wind_power_actual_5min.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.ercot.wind_power_actual_5min.

CREATE TABLE IF NOT EXISTS ercot.wind_power_actual_5min (
    posteddatetime TIMESTAMP NOT NULL,
    intervalending TIMESTAMP NOT NULL,
    gensystemwide DOUBLE PRECISION,
    lzsouthhouston DOUBLE PRECISION,
    lzwest DOUBLE PRECISION,
    lznorth DOUBLE PRECISION,
    hslsystemwide DOUBLE PRECISION,
    dstflag BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        posteddatetime,
        intervalending
    )
);
