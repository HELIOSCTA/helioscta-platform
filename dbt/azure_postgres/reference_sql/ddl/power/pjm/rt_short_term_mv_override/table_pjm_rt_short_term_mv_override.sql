-- Source-table DDL for pjm.rt_short_term_mv_override.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.rt_short_term_mv_override.

CREATE TABLE IF NOT EXISTS pjm.rt_short_term_mv_override (
    constraint_name VARCHAR NOT NULL,
    contingency_description VARCHAR NOT NULL,
    effective_datetime_ept TIMESTAMP,
    effective_datetime_utc TIMESTAMP NOT NULL,
    posted_day DATE,
    short_term_transmission_constraint_penalty_factor DOUBLE PRECISION,
    terminate_datetime_ept TIMESTAMP,
    terminate_datetime_utc TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        constraint_name,
        contingency_description,
        effective_datetime_utc
    )
);
