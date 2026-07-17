-- Source-table DDL for ercot.seven_day_load_forecast.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.ercot.seven_day_load_forecast.

CREATE TABLE IF NOT EXISTS ercot.seven_day_load_forecast (
    posteddatetime TIMESTAMP NOT NULL,
    deliverydate DATE NOT NULL,
    hourending INTEGER NOT NULL,
    coast DOUBLE PRECISION,
    east DOUBLE PRECISION,
    farwest DOUBLE PRECISION,
    north DOUBLE PRECISION,
    northcentral DOUBLE PRECISION,
    southcentral DOUBLE PRECISION,
    southern DOUBLE PRECISION,
    west DOUBLE PRECISION,
    systemtotal DOUBLE PRECISION,
    model VARCHAR NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (posteddatetime, deliverydate, hourending, model)
);
