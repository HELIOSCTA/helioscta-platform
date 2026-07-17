-- Source-table DDL for caiso.rt_lmps.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.caiso.rt_lmps or
-- backend.orchestration.power.caiso.rt_lmps.

CREATE TABLE IF NOT EXISTS caiso.rt_lmps (
    interval_start_time_utc TIMESTAMPTZ NOT NULL,
    interval_end_time_utc TIMESTAMPTZ NOT NULL,
    operating_date DATE NOT NULL,
    operating_hour INTEGER NOT NULL,
    operating_interval INTEGER NOT NULL,
    node_id_xml VARCHAR NOT NULL,
    node_id VARCHAR NOT NULL,
    node VARCHAR NOT NULL,
    market_run_id VARCHAR NOT NULL,
    pnode_resmrid VARCHAR,
    grp_type VARCHAR,
    locational_marginal_price DOUBLE PRECISION,
    energy_component DOUBLE PRECISION,
    congestion_component DOUBLE PRECISION,
    loss_component DOUBLE PRECISION,
    greenhouse_gas_component DOUBLE PRECISION,
    source_query_name VARCHAR NOT NULL,
    source_version INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        interval_start_time_utc,
        node_id,
        market_run_id
    )
);
