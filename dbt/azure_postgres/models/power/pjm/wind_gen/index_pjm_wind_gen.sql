-- Source-table indexes for pjm.wind_gen.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_wind_gen_freshness
    on pjm.wind_gen (
        datetime_beginning_ept
    )
    include (
        datetime_beginning_ept,
        wind_generation_mw
    );

create index concurrently if not exists idx_wind_gen_pk_lookup
    on pjm.wind_gen (
        datetime_beginning_utc, area
    );
