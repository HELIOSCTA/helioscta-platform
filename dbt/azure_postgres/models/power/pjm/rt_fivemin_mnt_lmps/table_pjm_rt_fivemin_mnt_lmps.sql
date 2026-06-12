-- Source-table DDL for pjm.rt_fivemin_mnt_lmps.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.rt_fivemin_mnt_lmps.

CREATE TABLE IF NOT EXISTS pjm.rt_fivemin_mnt_lmps (
    datetime_beginning_utc TIMESTAMP NOT NULL,
    datetime_beginning_ept TIMESTAMP NOT NULL,
    pnode_id INTEGER NOT NULL,
    pnode_name VARCHAR NOT NULL,
    voltage VARCHAR,
    equipment VARCHAR,
    type VARCHAR,
    zone VARCHAR,
    system_energy_price_rt DOUBLE PRECISION,
    total_lmp_rt DOUBLE PRECISION,
    congestion_price_rt DOUBLE PRECISION,
    marginal_loss_price_rt DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        pnode_id,
        pnode_name
    )
);
