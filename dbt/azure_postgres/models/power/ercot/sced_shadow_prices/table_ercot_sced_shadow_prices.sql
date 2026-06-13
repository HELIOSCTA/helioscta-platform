-- Source-table DDL for ercot.sced_shadow_prices.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.ercot.sced_shadow_prices.

CREATE TABLE IF NOT EXISTS ercot.sced_shadow_prices (
    scedtimestamp TIMESTAMP NOT NULL,
    repeatedhourflag BOOLEAN,
    constraintid INTEGER NOT NULL,
    constraintname VARCHAR NOT NULL,
    contingencyname VARCHAR NOT NULL,
    shadowprice DOUBLE PRECISION,
    maxshadowprice DOUBLE PRECISION,
    "limit" DOUBLE PRECISION,
    "value" DOUBLE PRECISION,
    violatedmw DOUBLE PRECISION,
    fromstation VARCHAR,
    tostation VARCHAR,
    fromstationkv DOUBLE PRECISION,
    tostationkv DOUBLE PRECISION,
    cctstatus VARCHAR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        scedtimestamp,
        constraintid,
        constraintname,
        contingencyname
    )
);
