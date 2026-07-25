-- Source-table indexes for Meteologica PJM Western Hub DA price forecasts.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_meteologica_pjm_da_price_det_latest
    on meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly (
        forecast_period_start,
        issue_date desc,
        update_id desc
    );

create index concurrently if not exists idx_meteologica_pjm_da_price_det_issue
    on meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly (
        issue_date desc
    );

create index concurrently if not exists idx_meteologica_pjm_da_price_det_updated_at
    on meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly (
        updated_at desc
    );

create index concurrently if not exists idx_meteologica_pjm_da_price_ens_latest
    on meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly (
        forecast_period_start,
        issue_date desc,
        update_id desc
    );

create index concurrently if not exists idx_meteologica_pjm_da_price_ens_issue
    on meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly (
        issue_date desc
    );

create index concurrently if not exists idx_meteologica_pjm_da_price_ens_updated_at
    on meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly (
        updated_at desc
    );
