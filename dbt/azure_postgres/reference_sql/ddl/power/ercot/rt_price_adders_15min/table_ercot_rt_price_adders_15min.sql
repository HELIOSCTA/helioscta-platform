-- Source-table DDL for ercot.rt_price_adders_15min.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.ercot.rt_price_adders_15min.

CREATE TABLE IF NOT EXISTS ercot.rt_price_adders_15min (
    deliverydate DATE NOT NULL,
    deliveryhour INTEGER NOT NULL,
    deliveryinterval INTEGER NOT NULL,
    rtrdpa DOUBLE PRECISION,
    rtrdpru DOUBLE PRECISION,
    rtrdprd DOUBLE PRECISION,
    rtrdprrs DOUBLE PRECISION,
    rtrdpecrs DOUBLE PRECISION,
    rtrdpns DOUBLE PRECISION,
    repeathourflag BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        deliverydate,
        deliveryhour,
        deliveryinterval,
        repeathourflag
    )
);
