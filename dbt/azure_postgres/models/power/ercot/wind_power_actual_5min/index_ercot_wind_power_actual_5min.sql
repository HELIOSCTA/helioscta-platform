-- Source-table indexes for ercot.wind_power_actual_5min.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_wind_actual_5min_updated_at
    ON ercot.wind_power_actual_5min (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_wind_actual_5min_interval
    ON ercot.wind_power_actual_5min (intervalending DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_wind_actual_5min_posted
    ON ercot.wind_power_actual_5min (posteddatetime DESC);
