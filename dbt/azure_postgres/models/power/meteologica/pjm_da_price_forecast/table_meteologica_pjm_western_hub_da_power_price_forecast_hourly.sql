-- Source-table DDL for Meteologica Western Hub deterministic DA price forecast.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.orchestration.power.pjm.meteologica_da_price_forecast.

CREATE TABLE IF NOT EXISTS meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly (
    content_id INTEGER NOT NULL,
    content_name VARCHAR NOT NULL,
    update_id VARCHAR NOT NULL,
    issue_date TIMESTAMPTZ,
    forecast_period_start TIMESTAMP NOT NULL,
    forecast_period_end TIMESTAMP,
    utc_offset_from VARCHAR,
    utc_offset_to VARCHAR,
    day_ahead_price DOUBLE PRECISION,
    source_timezone VARCHAR,
    source_unit VARCHAR,
    scrape_run_at_utc TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (content_id, update_id, forecast_period_start)
);
