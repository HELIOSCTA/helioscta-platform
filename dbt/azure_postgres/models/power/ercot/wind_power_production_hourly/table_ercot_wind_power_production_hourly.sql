-- Source-table DDL for ercot.wind_power_production_hourly.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.ercot.wind_power_production_hourly.

CREATE TABLE IF NOT EXISTS ercot.wind_power_production_hourly (
    posteddatetime TIMESTAMP NOT NULL,
    deliverydate DATE NOT NULL,
    hourending INTEGER NOT NULL,
    gensystemwide DOUBLE PRECISION,
    cophslsystemwide DOUBLE PRECISION,
    stwpfsystemwide DOUBLE PRECISION,
    wgrppsystemwide DOUBLE PRECISION,
    genloadzonesouthhouston DOUBLE PRECISION,
    cophslloadzonesouthhouston DOUBLE PRECISION,
    stwpfloadzonesouthhouston DOUBLE PRECISION,
    wgrpploadzonesouthhouston DOUBLE PRECISION,
    genloadzonewest DOUBLE PRECISION,
    cophslloadzonewest DOUBLE PRECISION,
    stwpfloadzonewest DOUBLE PRECISION,
    wgrpploadzonewest DOUBLE PRECISION,
    genloadzonenorth DOUBLE PRECISION,
    cophslloadzonenorth DOUBLE PRECISION,
    stwpfloadzonenorth DOUBLE PRECISION,
    wgrpploadzonenorth DOUBLE PRECISION,
    hslsystemwide DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        posteddatetime,
        deliverydate,
        hourending
    )
);
