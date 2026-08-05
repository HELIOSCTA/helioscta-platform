-- Source-table DDL for spp.rt_lmps_prelim.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.orchestration.power.spp.rt_lmps_prelim.

CREATE TABLE IF NOT EXISTS spp.rt_lmps_prelim (
    interval_start_time_utc TIMESTAMPTZ NOT NULL,
    interval_end_time_utc TIMESTAMPTZ NOT NULL,
    operating_date DATE NOT NULL,
    operating_hour INTEGER NOT NULL,
    operating_interval INTEGER NOT NULL,
    node_id VARCHAR NOT NULL,
    node VARCHAR NOT NULL,
    market_run_id VARCHAR NOT NULL,
    price_status VARCHAR NOT NULL,
    time_resolution VARCHAR NOT NULL,
    locational_marginal_price DOUBLE PRECISION,
    energy_component DOUBLE PRECISION,
    congestion_component DOUBLE PRECISION,
    loss_component DOUBLE PRECISION,
    source_endpoint VARCHAR NOT NULL,
    source_version VARCHAR NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        interval_start_time_utc,
        node_id,
        market_run_id
    )
);

