-- Source-table DDL for pjm.five_min_tie_flows.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.five_min_tie_flows.

CREATE TABLE IF NOT EXISTS pjm.five_min_tie_flows (
    datetime_beginning_utc TIMESTAMP NOT NULL,
    datetime_beginning_ept TIMESTAMP NOT NULL,
    tie_flow_name VARCHAR NOT NULL,
    actual_mw DOUBLE PRECISION,
    scheduled_mw DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        datetime_beginning_ept,
        tie_flow_name
    )
);
