-- Source-table indexes for pjm.da_interface_flows_and_limits.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_da_interface_flows_and_limits_freshness
    on pjm.da_interface_flows_and_limits (
        datetime_beginning_ept
    )
    include (
        datetime_beginning_ept,
        flow_mw,
        limit_mw
    );

create index concurrently if not exists idx_da_interface_flows_and_limits_pk_lookup
    on pjm.da_interface_flows_and_limits (
        datetime_beginning_utc, interface_limit_name
    );
