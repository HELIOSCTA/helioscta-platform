-- Source-table DDL for pjm.da_interface_flows_and_limits.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.da_interface_flows_and_limits.

CREATE TABLE IF NOT EXISTS pjm.da_interface_flows_and_limits (
    datetime_beginning_ept TIMESTAMP,
    datetime_beginning_utc TIMESTAMP NOT NULL,
    flow_mw DOUBLE PRECISION,
    interface_limit_name VARCHAR NOT NULL,
    limit_mw DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        interface_limit_name
    )
);
