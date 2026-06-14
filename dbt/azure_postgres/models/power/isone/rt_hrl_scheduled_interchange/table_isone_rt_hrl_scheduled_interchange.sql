-- Source-table DDL for isone.rt_hrl_scheduled_interchange.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.isone.rt_hrl_scheduled_interchange or
-- backend.orchestration.power.isone.rt_hrl_scheduled_interchange.

CREATE TABLE IF NOT EXISTS isone.rt_hrl_scheduled_interchange (
    local_date DATE NOT NULL,
    local_hour_ending INTEGER NOT NULL,
    interface_name VARCHAR NOT NULL,
    actual_interchange DOUBLE PRECISION,
    purchases DOUBLE PRECISION,
    sales DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        local_date,
        local_hour_ending,
        interface_name
    )
);
