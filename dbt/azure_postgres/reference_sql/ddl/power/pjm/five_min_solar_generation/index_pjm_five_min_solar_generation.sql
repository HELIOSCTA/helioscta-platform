-- Source-table indexes for pjm.five_min_solar_generation.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_five_min_solar_generation_freshness
    on pjm.five_min_solar_generation (
        datetime_beginning_ept
    )
    include (
        datetime_beginning_ept,
        solar_generation_mw
    );

create index concurrently if not exists idx_five_min_solar_generation_pk_lookup
    on pjm.five_min_solar_generation (
        datetime_beginning_utc
    );
