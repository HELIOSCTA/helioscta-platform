-- Source-table DDL for pjm.rt_unverified_hrl_lmps.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.rt_unverified_hrl_lmps.

CREATE TABLE IF NOT EXISTS pjm.rt_unverified_hrl_lmps (
    congestion_price_rt DOUBLE PRECISION,
    datetime_beginning_ept TIMESTAMP NOT NULL,
    datetime_beginning_utc TIMESTAMP NOT NULL,
    marginal_loss_price_rt DOUBLE PRECISION,
    pnode_name VARCHAR NOT NULL,
    total_lmp_rt DOUBLE PRECISION,
    type VARCHAR NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        pnode_name,
        type
    )
);
