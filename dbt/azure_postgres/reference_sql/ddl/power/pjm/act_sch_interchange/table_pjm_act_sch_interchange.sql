-- Source-table DDL for pjm.act_sch_interchange.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.act_sch_interchange.

CREATE TABLE IF NOT EXISTS pjm.act_sch_interchange (
    actual_flow DOUBLE PRECISION,
    datetime_beginning_ept TIMESTAMP,
    datetime_beginning_utc TIMESTAMP NOT NULL,
    datetime_ending_ept TIMESTAMP,
    datetime_ending_utc TIMESTAMP,
    inadv_flow DOUBLE PRECISION,
    sched_flow DOUBLE PRECISION,
    tie_line VARCHAR NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        tie_line
    )
);
