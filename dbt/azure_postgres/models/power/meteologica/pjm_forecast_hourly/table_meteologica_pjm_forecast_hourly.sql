-- Source-table DDL for meteologica.pjm_forecast_hourly.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.orchestration.power.pjm.meteologica_forecast_hourly.

CREATE TABLE IF NOT EXISTS meteologica.pjm_forecast_hourly (
    content_id INTEGER NOT NULL,
    content_name VARCHAR NOT NULL,
    update_id VARCHAR NOT NULL,
    issue_date TIMESTAMPTZ,
    metric VARCHAR NOT NULL,
    region VARCHAR NOT NULL,
    forecast_area VARCHAR NOT NULL,
    forecast_period_start TIMESTAMP NOT NULL,
    forecast_period_end TIMESTAMP,
    utc_offset_from VARCHAR,
    utc_offset_to VARCHAR,
    forecast_mw DOUBLE PRECISION,
    perc10_mw DOUBLE PRECISION,
    perc90_mw DOUBLE PRECISION,
    arpege_run VARCHAR,
    ecmwf_ens_run VARCHAR,
    ecmwf_hres_run VARCHAR,
    gfs_run VARCHAR,
    nam_run VARCHAR,
    source_timezone VARCHAR,
    source_unit VARCHAR,
    scrape_run_at_utc TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (content_id, update_id, forecast_period_start)
);
