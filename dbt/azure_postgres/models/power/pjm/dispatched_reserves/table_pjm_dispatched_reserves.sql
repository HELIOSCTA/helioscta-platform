-- Source-table DDL for pjm.dispatched_reserves.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.dispatched_reserves.

CREATE TABLE IF NOT EXISTS pjm.dispatched_reserves (
    area VARCHAR NOT NULL,
    datetime_beginning_ept TIMESTAMP NOT NULL,
    datetime_beginning_utc TIMESTAMP NOT NULL,
    market_clearing_price DOUBLE PRECISION,
    reliability_requirement DOUBLE PRECISION,
    reserve_quantity DOUBLE PRECISION,
    reserve_requirement DOUBLE PRECISION,
    reserve_type VARCHAR NOT NULL,
    shortage_indicator BOOLEAN,
    extended_requirement DOUBLE PRECISION,
    mw_adjustment DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        datetime_beginning_ept,
        area,
        reserve_type
    )
);
