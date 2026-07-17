-- Source-table DDL for pjm.hrl_dmd_bids.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.hrl_dmd_bids.

CREATE TABLE IF NOT EXISTS pjm.hrl_dmd_bids (
    datetime_beginning_ept TIMESTAMP NOT NULL,
    datetime_beginning_utc TIMESTAMP NOT NULL,
    hrly_da_demand_bid DOUBLE PRECISION,
    area VARCHAR NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        datetime_beginning_ept,
        area
    )
);
