-- Source-table indexes for meteologica.nyiso_forecast_hourly.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Run with autocommit enabled because these use CREATE INDEX CONCURRENTLY.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_nyiso_fcst_latest
    ON meteologica.nyiso_forecast_hourly (
        forecast_area,
        metric,
        forecast_period_start,
        issue_date DESC,
        update_id DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_nyiso_fcst_issue
    ON meteologica.nyiso_forecast_hourly (issue_date DESC, content_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_nyiso_fcst_updated_at
    ON meteologica.nyiso_forecast_hourly (updated_at DESC);
