-- Source-table DDL for pjm.agg_definitions.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.agg_definitions.

CREATE TABLE IF NOT EXISTS pjm.agg_definitions (
    agg_pnode_id BIGINT NOT NULL,
    terminate_date_ept DATE,
    agg_pnode_name VARCHAR,
    bus_pnode_factor DOUBLE PRECISION,
    bus_pnode_id BIGINT NOT NULL,
    bus_pnode_name VARCHAR,
    effective_date_ept DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        agg_pnode_id,
        bus_pnode_id,
        effective_date_ept
    )
);
