-- Source-table indexes for pjm.da_hrl_lmps.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_da_hrl_lmps_current_ept_hub
    on pjm.da_hrl_lmps (
        datetime_beginning_ept,
        pnode_name
    )
    include (
        total_lmp_da,
        system_energy_price_da,
        congestion_price_da,
        marginal_loss_price_da
    )
    where row_is_current = true;

create index concurrently if not exists idx_da_hrl_lmps_current_date_hub_hour
    on pjm.da_hrl_lmps (
        ((datetime_beginning_ept)::date),
        pnode_name,
        (EXTRACT(HOUR FROM datetime_beginning_ept)::int + 1)
    )
    include (
        total_lmp_da,
        system_energy_price_da,
        congestion_price_da,
        marginal_loss_price_da
    )
    where row_is_current = true;
