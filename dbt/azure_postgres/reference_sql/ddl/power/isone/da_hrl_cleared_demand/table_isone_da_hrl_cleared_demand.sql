-- Source-table DDL for isone.da_hrl_cleared_demand.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.isone.da_hrl_cleared_demand or
-- backend.orchestration.power.isone.da_hrl_cleared_demand.

CREATE TABLE IF NOT EXISTS isone.da_hrl_cleared_demand (
    date DATE NOT NULL,
    hour_ending INTEGER NOT NULL,
    day_ahead_cleared_demand DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        date,
        hour_ending
    )
);
