-- Source-table indexes for pjm.reserve_market_results.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_reserve_market_results_freshness
    on pjm.reserve_market_results (
        datetime_beginning_ept
    )
    include (
        as_mw,
        as_req_mw,
        datetime_beginning_ept,
        dsr_as_mw,
        ircmwt2,
        mcp,
        mcp_capped,
        nsr_mw
    );

create index concurrently if not exists idx_reserve_market_results_pk_lookup
    on pjm.reserve_market_results (
        datetime_beginning_utc, locale, service
    );
