-- Source-table DDL for isone.rt_hrl_lmps_prelim.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.isone.rt_hrl_lmps_prelim or
-- backend.orchestration.power.isone.rt_hrl_lmps_prelim.
--
-- Contract: stores ISO-NE internal hub rows only:
-- location = '.H.INTERNAL_HUB'.

CREATE TABLE IF NOT EXISTS isone.rt_hrl_lmps_prelim (
    date DATE NOT NULL,
    hour_ending INTEGER NOT NULL,
    location VARCHAR NOT NULL,
    lmp DOUBLE PRECISION,
    energy DOUBLE PRECISION,
    congestion DOUBLE PRECISION,
    loss DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_isone_rt_hrl_lmps_prelim_internal_hub
        CHECK (location = '.H.INTERNAL_HUB'),
    PRIMARY KEY (
        date,
        hour_ending,
        location
    )
);
