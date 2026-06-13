-- Source-table indexes for pjm.load_frcstd_hist.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_load_frcstd_hist_freshness
    on pjm.load_frcstd_hist (
        forecast_hour_beginning_ept
    )
    include (
        forecast_load_mw
    );

create index concurrently if not exists idx_load_frcstd_hist_pk_lookup
    on pjm.load_frcstd_hist (
        evaluated_at_utc, evaluated_at_ept, forecast_hour_beginning_utc, forecast_hour_beginning_ept, forecast_area
    );
