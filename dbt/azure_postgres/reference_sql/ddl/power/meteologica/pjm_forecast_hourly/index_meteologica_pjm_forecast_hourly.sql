-- Source-table indexes for meteologica.pjm_forecast_hourly.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_pjm_fcst_latest
    ON meteologica.pjm_forecast_hourly (
        forecast_area,
        metric,
        forecast_period_start,
        issue_date DESC,
        update_id DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_pjm_fcst_issue
    ON meteologica.pjm_forecast_hourly (issue_date DESC, forecast_area, metric);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meteologica_pjm_fcst_updated_at
    ON meteologica.pjm_forecast_hourly (updated_at DESC);
