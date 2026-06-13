-- Source-table DDL for pjm.rt_default_mv_override.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.rt_default_mv_override.

CREATE TABLE IF NOT EXISTS pjm.rt_default_mv_override (
    constraint_name VARCHAR NOT NULL,
    contingency_description VARCHAR NOT NULL,
    default_transmission_constraint_penalty_factor DOUBLE PRECISION,
    effective_day DATE NOT NULL,
    posted_day DATE,
    terminate_day DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        constraint_name,
        contingency_description,
        effective_day
    )
);
