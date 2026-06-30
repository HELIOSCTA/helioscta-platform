-- Source-table indexes for pjm.rt_and_self_ecomax.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_rt_and_self_ecomax_freshness
    on pjm.rt_and_self_ecomax (
        datetime_beginning_ept
    )
    include (
        rt_ecomax,
        conf_disclaimer,
        self_ecomax
    );

create index concurrently if not exists idx_rt_and_self_ecomax_pk_lookup
    on pjm.rt_and_self_ecomax (
        datetime_beginning_utc
    );
