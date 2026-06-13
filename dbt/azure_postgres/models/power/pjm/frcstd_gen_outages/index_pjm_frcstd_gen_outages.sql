-- Source-table indexes for pjm.frcstd_gen_outages.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_frcstd_gen_outages_freshness
    on pjm.frcstd_gen_outages (
        forecast_execution_date_ept
    )
    include (
        forecast_gen_outage_mw_other,
        forecast_gen_outage_mw_rto,
        forecast_gen_outage_mw_west
    );

create index concurrently if not exists idx_frcstd_gen_outages_pk_lookup
    on pjm.frcstd_gen_outages (
        forecast_execution_date_ept, forecast_date
    );
