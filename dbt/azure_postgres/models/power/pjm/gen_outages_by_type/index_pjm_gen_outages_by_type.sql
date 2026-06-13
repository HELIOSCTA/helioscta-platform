-- Source-table indexes for pjm.gen_outages_by_type.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_gen_outages_by_type_freshness
    on pjm.gen_outages_by_type (
        forecast_execution_date_ept
    )
    include (
        forced_outages_mw,
        maintenance_outages_mw,
        planned_outages_mw,
        total_outages_mw
    );

create index concurrently if not exists idx_gen_outages_by_type_pk_lookup
    on pjm.gen_outages_by_type (
        forecast_execution_date_ept, forecast_date, region
    );
