-- Source-table indexes for pjm.pnode.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_pnode_name
    on pjm.pnode (pnode_name)
    include (
        pnode_type,
        pnode_subtype,
        zone
    );

create index concurrently if not exists idx_pnode_type_zone
    on pjm.pnode (
        pnode_type,
        pnode_subtype,
        zone
    )
    include (
        pnode_name,
        voltage_level
    );
