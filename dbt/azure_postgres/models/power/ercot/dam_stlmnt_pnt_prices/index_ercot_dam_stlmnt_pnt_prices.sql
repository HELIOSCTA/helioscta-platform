-- Source-table indexes for ercot.dam_stlmnt_pnt_prices.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE INDEX
-- CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_ercot_dam_spp_point_date_hour
    on ercot.dam_stlmnt_pnt_prices (
        settlementpoint,
        deliverydate,
        hourending
    )
    include (
        settlementpointprice
    );

create index concurrently if not exists idx_ercot_dam_spp_hubs_date_hour
    on ercot.dam_stlmnt_pnt_prices (
        deliverydate,
        hourending,
        settlementpoint
    )
    include (
        settlementpointprice
    )
    where settlementpoint in (
        'HB_NORTH',
        'HB_SOUTH',
        'HB_WEST',
        'HB_HOUSTON'
    );

