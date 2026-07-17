-- Source-table indexes for pjm.dispatched_reserves.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_dispatched_reserves_freshness
    on pjm.dispatched_reserves (
        datetime_beginning_ept
    )
    include (
        market_clearing_price,
        reliability_requirement,
        reserve_quantity,
        reserve_requirement,
        shortage_indicator,
        extended_requirement,
        mw_adjustment
    );

create index concurrently if not exists idx_dispatched_reserves_pk_lookup
    on pjm.dispatched_reserves (
        datetime_beginning_utc, datetime_beginning_ept, area, reserve_type
    );
