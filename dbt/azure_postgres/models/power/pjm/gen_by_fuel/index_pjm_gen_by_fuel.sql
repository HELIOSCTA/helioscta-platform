-- Source-table indexes for pjm.gen_by_fuel.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_gen_by_fuel_freshness
    on pjm.gen_by_fuel (
        datetime_beginning_ept
    )
    include (
        fuel_type,
        mw,
        fuel_percentage_of_total,
        is_renewable
    );

create index concurrently if not exists idx_gen_by_fuel_pk_lookup
    on pjm.gen_by_fuel (
        datetime_beginning_utc,
        fuel_type
    );
