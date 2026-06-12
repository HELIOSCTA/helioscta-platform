-- Indexes for ops.data_availability_events.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role after applying
-- table_ops_data_availability_events.sql.

CREATE INDEX IF NOT EXISTS idx_data_availability_events_dataset_date
    ON ops.data_availability_events (dataset, business_date DESC);

CREATE INDEX IF NOT EXISTS idx_data_availability_events_created_at
    ON ops.data_availability_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_availability_events_type_status
    ON ops.data_availability_events (
        availability_type,
        completeness_status,
        created_at DESC
    );
