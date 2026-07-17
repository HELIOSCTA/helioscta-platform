-- Source-table DDL for pjm.rt_marginal_value.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.rt_marginal_value.

CREATE TABLE IF NOT EXISTS pjm.rt_marginal_value (
    contingency_facility VARCHAR NOT NULL,
    datetime_beginning_ept TIMESTAMP,
    datetime_beginning_utc TIMESTAMP NOT NULL,
    datetime_ending_ept TIMESTAMP,
    datetime_ending_utc TIMESTAMP,
    monitored_facility VARCHAR NOT NULL,
    shadow_price DOUBLE PRECISION,
    limit_control_percentage DOUBLE PRECISION,
    transmission_constraint_penalty_factor DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        monitored_facility,
        contingency_facility
    )
);
