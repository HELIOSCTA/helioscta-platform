-- Source-table DDL for isone.da_hrl_lmps.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.isone.da_hrl_lmps or
-- backend.orchestration.power.isone.da_hrl_lmps.
--
-- Contract: stores ISO-NE internal hub rows only:
-- location_id = 4000, location_name = '.H.INTERNAL_HUB', location_type = 'HUB'.

CREATE TABLE IF NOT EXISTS isone.da_hrl_lmps (
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
    CONSTRAINT chk_isone_da_hrl_lmps_internal_hub
        CHECK (
            location_id = 4000
            AND location_name = '.H.INTERNAL_HUB'
            AND location_type = 'HUB'
        ),
    PRIMARY KEY (
        date,
        hour_ending,
        location_id,
        location_name,
        location_type
    )
);
