-- Source-table DDL for pjm.pnode.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.pnode.

CREATE TABLE IF NOT EXISTS pjm.pnode (
    pnode_id BIGINT NOT NULL,
    pnode_name VARCHAR NOT NULL,
    pnode_type VARCHAR,
    pnode_subtype VARCHAR,
    zone VARCHAR,
    voltage_level VARCHAR,
    effective_date DATE,
    termination_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pnode_id)
);
