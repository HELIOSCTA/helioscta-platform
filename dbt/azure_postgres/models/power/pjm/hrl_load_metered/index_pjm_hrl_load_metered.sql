-- Source-table indexes for pjm.hrl_load_metered.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_hrl_load_metered_freshness
    on pjm.hrl_load_metered (
        datetime_beginning_ept
    )
    include (
        datetime_beginning_ept,
        mw
    );

create index concurrently if not exists idx_hrl_load_metered_pk_lookup
    on pjm.hrl_load_metered (
        datetime_beginning_utc, nerc_region, mkt_region, zone, load_area, is_verified
    );
