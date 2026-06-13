-- Source-table DDL for ercot.dam_shadow_prices.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.ercot.dam_shadow_prices.

CREATE TABLE IF NOT EXISTS ercot.dam_shadow_prices (
    deliverydate DATE NOT NULL,
    hourending INTEGER,
    constraintid INTEGER NOT NULL,
    constraintname VARCHAR NOT NULL,
    contingencyname VARCHAR NOT NULL,
    constraintlimit DOUBLE PRECISION,
    constraintvalue DOUBLE PRECISION,
    violationamount DOUBLE PRECISION,
    shadowprice DOUBLE PRECISION,
    fromstation VARCHAR,
    tostation VARCHAR,
    fromstationkv DOUBLE PRECISION,
    tostationkv DOUBLE PRECISION,
    deliverytime TIMESTAMP NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        deliverytime,
        constraintid,
        constraintname,
        contingencyname
    )
);
