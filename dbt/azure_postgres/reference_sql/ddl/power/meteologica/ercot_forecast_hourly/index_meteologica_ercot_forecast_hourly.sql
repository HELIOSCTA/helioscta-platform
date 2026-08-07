-- Source-table indexes for meteologica.ercot_forecast_hourly.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Run with autocommit enabled because these use CREATE INDEX CONCURRENTLY.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_ercot_fcst_latest
    ON meteologica.ercot_forecast_hourly (
        forecast_area,
        metric,
        forecast_period_start,
        issue_date DESC,
        update_id DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_ercot_fcst_issue
    ON meteologica.ercot_forecast_hourly (issue_date DESC, content_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_ercot_fcst_updated_at
    ON meteologica.ercot_forecast_hourly (updated_at DESC);
