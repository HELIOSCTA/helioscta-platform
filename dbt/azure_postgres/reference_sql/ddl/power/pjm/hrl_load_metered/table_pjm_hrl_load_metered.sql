-- Source-table DDL for pjm.hrl_load_metered.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.hrl_load_metered.

CREATE TABLE IF NOT EXISTS pjm.hrl_load_metered (
    datetime_beginning_ept TIMESTAMP,
    datetime_beginning_utc TIMESTAMP NOT NULL,
    is_verified BOOLEAN NOT NULL,
    load_area VARCHAR NOT NULL,
    mkt_region VARCHAR NOT NULL,
    mw DOUBLE PRECISION,
    nerc_region VARCHAR NOT NULL,
    zone VARCHAR NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        nerc_region,
        mkt_region,
        zone,
        load_area,
        is_verified
    )
);
