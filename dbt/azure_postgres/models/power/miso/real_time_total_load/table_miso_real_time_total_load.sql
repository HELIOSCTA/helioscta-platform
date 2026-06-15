-- Source-table DDL for miso.real_time_total_load.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.orchestration.power.miso.real_time_total_load.

CREATE TABLE IF NOT EXISTS miso.real_time_total_load (
    operating_date DATE NOT NULL,
    series VARCHAR NOT NULL,
    period_label VARCHAR NOT NULL,
    hour_ending INTEGER,
    interval_start TIMESTAMP,
    load_mw DOUBLE PRECISION,
    source_ref_id VARCHAR,
    source_interval_start TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (series, operating_date, period_label)
);
