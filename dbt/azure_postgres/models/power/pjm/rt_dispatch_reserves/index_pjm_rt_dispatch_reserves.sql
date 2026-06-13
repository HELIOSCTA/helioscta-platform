-- Source-table indexes for pjm.rt_dispatch_reserves.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_rt_dispatch_reserves_freshness
    on pjm.rt_dispatch_reserves (
        datetime_beginning_ept
    )
    include (
        deficit_mw,
        extended_reqmt_mw,
        reliability_reqmt_mw,
        reserve_reqmt_mw,
        total_reserve_mw,
        additional_extended_reqmt_mw
    );

create index concurrently if not exists idx_rt_dispatch_reserves_pk_lookup
    on pjm.rt_dispatch_reserves (
        mkt_day, datetime_beginning_utc, datetime_beginning_ept, area, reserve_type
    );
