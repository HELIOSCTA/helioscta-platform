-- Source-table DDL for isone.rt_hrl_lmps_final.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.isone.rt_hrl_lmps_final or
-- backend.orchestration.power.isone.rt_hrl_lmps_final.

CREATE TABLE IF NOT EXISTS isone.rt_hrl_lmps_final (
    date DATE NOT NULL,
    hour_ending INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    location_name VARCHAR NOT NULL,
    location_type VARCHAR NOT NULL,
    locational_marginal_price DOUBLE PRECISION,
    energy_component DOUBLE PRECISION,
    congestion_component DOUBLE PRECISION,
    marginal_loss_component DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        date,
        hour_ending,
        location_id,
        location_name,
        location_type
    )
);
