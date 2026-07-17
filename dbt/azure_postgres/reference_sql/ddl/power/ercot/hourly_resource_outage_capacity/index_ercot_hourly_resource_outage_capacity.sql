-- Source-table indexes for ercot.hourly_resource_outage_capacity.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_hourly_outage_capacity_updated_at
    ON ercot.hourly_resource_outage_capacity (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_hourly_outage_capacity_operating
    ON ercot.hourly_resource_outage_capacity (operatingdate DESC, hourending);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ercot_hourly_outage_capacity_posted
    ON ercot.hourly_resource_outage_capacity (posteddatetime DESC);
