-- Source-table indexes for pjm.hrl_load_prelim.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_hrl_load_prelim_freshness
    on pjm.hrl_load_prelim (
        datetime_beginning_ept
    )
    include (
        datetime_beginning_ept,
        datetime_ending_ept,
        datetime_ending_utc,
        prelim_load_avg_hourly
    );

create index concurrently if not exists idx_hrl_load_prelim_pk_lookup
    on pjm.hrl_load_prelim (
        datetime_beginning_utc, load_area
    );
