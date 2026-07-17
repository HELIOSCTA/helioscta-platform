-- Source-table indexes for pjm.rt_fivemin_mnt_lmps.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_rt_fivemin_mnt_lmps_ept_hub
    on pjm.rt_fivemin_mnt_lmps (
        datetime_beginning_ept,
        pnode_name
    )
    include (
        pnode_id,
        total_lmp_rt,
        system_energy_price_rt,
        congestion_price_rt,
        marginal_loss_price_rt
    );

create index concurrently if not exists idx_rt_fivemin_mnt_lmps_date_hub_interval
    on pjm.rt_fivemin_mnt_lmps (
        ((datetime_beginning_ept)::date),
        pnode_name,
        (datetime_beginning_ept::time)
    )
    include (
        pnode_id,
        total_lmp_rt,
        system_energy_price_rt,
        congestion_price_rt,
        marginal_loss_price_rt
    );
