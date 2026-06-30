-- Source-table indexes for Meteologica Western Hub DA price forecast tables.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_pjm_da_price_det_latest
    ON meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly (
        forecast_period_start,
        issue_date DESC,
        update_id DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_pjm_da_price_det_issue
    ON meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly (issue_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_pjm_da_price_det_updated_at
    ON meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_pjm_da_price_ens_latest
    ON meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly (
        forecast_period_start,
        issue_date DESC,
        update_id DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_pjm_da_price_ens_issue
    ON meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly (issue_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_pjm_da_price_ens_updated_at
    ON meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly (updated_at DESC);
