-- Source-table indexes for ercot.solar_power_production_hourly.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_solar_power_hourly_updated_at
    ON ercot.solar_power_production_hourly (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_solar_power_hourly_delivery
    ON ercot.solar_power_production_hourly (deliverydate DESC, hourending);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_solar_power_hourly_posted
    ON ercot.solar_power_production_hourly (posteddatetime DESC);
