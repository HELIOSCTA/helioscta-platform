-- Source-table DDL for ercot.dam_stlmnt_pnt_prices.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.ercot.dam_stlmnt_pnt_prices.

CREATE TABLE IF NOT EXISTS ercot.dam_stlmnt_pnt_prices (
    deliverydate DATE NOT NULL,
    hourending INTEGER NOT NULL,
    settlementpoint VARCHAR NOT NULL,
    settlementpointprice DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        deliverydate,
        hourending,
        settlementpoint
    )
);

