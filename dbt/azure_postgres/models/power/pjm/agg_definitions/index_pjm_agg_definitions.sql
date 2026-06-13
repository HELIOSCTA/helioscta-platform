-- Source-table indexes for pjm.agg_definitions.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_agg_definitions_active_agg
    on pjm.agg_definitions (
        agg_pnode_id,
        terminate_date_ept
    )
    include (
        agg_pnode_name,
        bus_pnode_id,
        bus_pnode_factor
    );

create index concurrently if not exists idx_agg_definitions_bus_lookup
    on pjm.agg_definitions (
        bus_pnode_id,
        terminate_date_ept
    )
    include (
        bus_pnode_name,
        agg_pnode_id,
        bus_pnode_factor
    );
