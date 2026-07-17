-- Source-table DDL for pjm.da_hrl_lmps.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.da_hrl_lmps.

CREATE TABLE IF NOT EXISTS pjm.da_hrl_lmps (
    datetime_beginning_utc TIMESTAMP NOT NULL,
    datetime_beginning_ept TIMESTAMP NOT NULL,
    pnode_id INTEGER NOT NULL,
    pnode_name VARCHAR NOT NULL,
    voltage VARCHAR,
    equipment VARCHAR,
    type VARCHAR,
    zone VARCHAR,
    system_energy_price_da DOUBLE PRECISION,
    total_lmp_da DOUBLE PRECISION,
    congestion_price_da DOUBLE PRECISION,
    marginal_loss_price_da DOUBLE PRECISION,
    row_is_current BOOLEAN NOT NULL,
    version_nbr INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        pnode_id,
        pnode_name,
        row_is_current,
        version_nbr
    )
);
