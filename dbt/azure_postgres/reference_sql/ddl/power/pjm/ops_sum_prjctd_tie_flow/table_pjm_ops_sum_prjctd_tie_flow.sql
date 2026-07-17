-- Source-table DDL for pjm.ops_sum_prjctd_tie_flow.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.ops_sum_prjctd_tie_flow.

CREATE TABLE IF NOT EXISTS pjm.ops_sum_prjctd_tie_flow (
    generated_at_ept TIMESTAMP NOT NULL,
    interface VARCHAR NOT NULL,
    projected_peak_datetime_ept TIMESTAMP,
    projected_peak_datetime_utc TIMESTAMP NOT NULL,
    scheduled_tie_flow DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        projected_peak_datetime_utc,
        interface
    )
);
