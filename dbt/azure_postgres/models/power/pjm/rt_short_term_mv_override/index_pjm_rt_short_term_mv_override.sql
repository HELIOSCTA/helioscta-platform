-- Source-table indexes for pjm.rt_short_term_mv_override.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_rt_short_term_mv_override_freshness
    on pjm.rt_short_term_mv_override (
        posted_day
    )
    include (
        effective_datetime_ept,
        posted_day,
        short_term_transmission_constraint_penalty_factor,
        terminate_datetime_ept,
        terminate_datetime_utc
    );

create index concurrently if not exists idx_rt_short_term_mv_override_pk_lookup
    on pjm.rt_short_term_mv_override (
        constraint_name, contingency_description, effective_datetime_utc
    );
