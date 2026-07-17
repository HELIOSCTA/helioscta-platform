-- Source-table DDL for pjm.gen_outages_by_type.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.gen_outages_by_type.

CREATE TABLE IF NOT EXISTS pjm.gen_outages_by_type (
    forced_outages_mw DOUBLE PRECISION,
    forecast_date DATE NOT NULL,
    forecast_execution_date_ept DATE NOT NULL,
    maintenance_outages_mw DOUBLE PRECISION,
    planned_outages_mw DOUBLE PRECISION,
    region VARCHAR NOT NULL,
    total_outages_mw DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        forecast_execution_date_ept,
        forecast_date,
        region
    )
);
