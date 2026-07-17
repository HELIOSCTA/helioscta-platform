-- Source-table indexes for ercot.seven_day_load_forecast.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_seven_day_load_forecast_updated_at
    ON ercot.seven_day_load_forecast (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_seven_day_load_forecast_delivery
    ON ercot.seven_day_load_forecast (deliverydate DESC, hourending, model);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_seven_day_load_forecast_posted
    ON ercot.seven_day_load_forecast (posteddatetime DESC);
