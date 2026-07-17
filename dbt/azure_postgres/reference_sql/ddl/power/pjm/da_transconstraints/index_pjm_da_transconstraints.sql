-- Source-table indexes for pjm.da_transconstraints.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_da_transconstraints_freshness
    on pjm.da_transconstraints (
        datetime_beginning_ept
    )
    include (
        datetime_beginning_ept,
        datetime_ending_ept,
        datetime_ending_utc,
        duration
    );

create index concurrently if not exists idx_da_transconstraints_pk_lookup
    on pjm.da_transconstraints (
        datetime_beginning_utc, day_ahead_congestion_event, monitored_facility, contingency_facility
    );
