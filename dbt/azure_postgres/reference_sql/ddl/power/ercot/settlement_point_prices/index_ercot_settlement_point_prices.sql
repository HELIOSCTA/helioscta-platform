-- Source-table indexes for ercot.settlement_point_prices.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE INDEX
-- CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_ercot_rt_spp_point_date_hour_interval
    on ercot.settlement_point_prices (
        settlementpoint,
        deliverydate,
        deliveryhour,
        deliveryinterval
    )
    include (
        settlementpointprice,
        settlementpointtype
    );

create index concurrently if not exists idx_ercot_rt_spp_hubs_date_hour_interval
    on ercot.settlement_point_prices (
        deliverydate,
        deliveryhour,
        deliveryinterval,
        settlementpoint
    )
    include (
        settlementpointprice,
        settlementpointtype
    )
    where settlementpoint in (
        'HB_NORTH',
        'HB_SOUTH',
        'HB_WEST',
        'HB_HOUSTON'
    );
