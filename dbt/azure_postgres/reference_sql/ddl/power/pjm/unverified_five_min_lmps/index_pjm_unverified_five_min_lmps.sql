-- Source-table indexes for pjm.unverified_five_min_lmps.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_unverified_five_min_lmps_ept_node
    on pjm.unverified_five_min_lmps (
        datetime_beginning_ept,
        name,
        type
    )
    include (
        five_min_rtlmp,
        hourly_lmp
    );

create index concurrently if not exists idx_unverified_five_min_lmps_date_node_interval
    on pjm.unverified_five_min_lmps (
        ((datetime_beginning_ept)::date),
        name,
        (datetime_beginning_ept::time)
    )
    include (
        type,
        five_min_rtlmp,
        hourly_lmp
    );
