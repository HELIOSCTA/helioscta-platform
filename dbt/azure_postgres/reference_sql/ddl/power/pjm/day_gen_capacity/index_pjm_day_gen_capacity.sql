-- Source-table indexes for pjm.day_gen_capacity.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_day_gen_capacity_freshness
    on pjm.day_gen_capacity (
        bid_datetime_beginning_ept
    )
    include (
        bid_datetime_beginning_ept,
        eco_max,
        emerg_max,
        total_committed
    );

create index concurrently if not exists idx_day_gen_capacity_pk_lookup
    on pjm.day_gen_capacity (
        bid_datetime_beginning_utc
    );
