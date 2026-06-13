-- Source-table DDL for ercot.settlement_point_prices.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.ercot.settlement_point_prices.

CREATE TABLE IF NOT EXISTS ercot.settlement_point_prices (
    deliverydate DATE NOT NULL,
    deliveryhour INTEGER NOT NULL,
    deliveryinterval INTEGER NOT NULL,
    settlementpoint VARCHAR NOT NULL,
    settlementpointtype VARCHAR,
    settlementpointprice DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        deliverydate,
        deliveryhour,
        deliveryinterval,
        settlementpoint
    )
);

