-- Source-table DDL for pjm.rt_dispatch_reserves.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.rt_dispatch_reserves.

CREATE TABLE IF NOT EXISTS pjm.rt_dispatch_reserves (
    area VARCHAR NOT NULL,
    datetime_beginning_ept TIMESTAMP NOT NULL,
    datetime_beginning_utc TIMESTAMP NOT NULL,
    deficit_mw DOUBLE PRECISION,
    extended_reqmt_mw DOUBLE PRECISION,
    mkt_day DATE NOT NULL,
    reliability_reqmt_mw DOUBLE PRECISION,
    reserve_reqmt_mw DOUBLE PRECISION,
    reserve_type VARCHAR NOT NULL,
    total_reserve_mw DOUBLE PRECISION,
    additional_extended_reqmt_mw DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        mkt_day,
        datetime_beginning_utc,
        datetime_beginning_ept,
        area,
        reserve_type
    )
);
