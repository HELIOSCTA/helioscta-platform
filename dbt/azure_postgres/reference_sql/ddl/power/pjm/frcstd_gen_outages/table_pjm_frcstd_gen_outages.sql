-- Source-table DDL for pjm.frcstd_gen_outages.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.frcstd_gen_outages.

CREATE TABLE IF NOT EXISTS pjm.frcstd_gen_outages (
    forecast_date DATE NOT NULL,
    forecast_execution_date_ept DATE NOT NULL,
    forecast_gen_outage_mw_other DOUBLE PRECISION,
    forecast_gen_outage_mw_rto DOUBLE PRECISION,
    forecast_gen_outage_mw_west DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        forecast_execution_date_ept,
        forecast_date
    )
);
