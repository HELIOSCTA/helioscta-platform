-- Source-table indexes for pjm.hrl_dmd_bids.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_hrl_dmd_bids_freshness
    on pjm.hrl_dmd_bids (
        datetime_beginning_ept
    )
    include (
        hrly_da_demand_bid
    );

create index concurrently if not exists idx_hrl_dmd_bids_pk_lookup
    on pjm.hrl_dmd_bids (
        datetime_beginning_utc, datetime_beginning_ept, area
    );
