-- Source-table indexes for pjm.load_frcstd_7_day.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_load_frcstd_7_day_freshness
    on pjm.load_frcstd_7_day (
        evaluated_at_datetime_ept
    )
    include (
        evaluated_at_datetime_ept,
        forecast_datetime_beginning_ept,
        forecast_datetime_ending_ept,
        forecast_datetime_ending_utc,
        forecast_load_mw
    );

create index concurrently if not exists idx_load_frcstd_7_day_pk_lookup
    on pjm.load_frcstd_7_day (
        evaluated_at_datetime_utc, forecast_datetime_beginning_utc, forecast_area
    );
