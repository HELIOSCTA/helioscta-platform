-- Source-table indexes for pjm.five_min_tie_flows.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_five_min_tie_flows_ept_tie
    on pjm.five_min_tie_flows (
        datetime_beginning_ept,
        tie_flow_name
    )
    include (
        actual_mw,
        scheduled_mw
    );

create index concurrently if not exists idx_five_min_tie_flows_date_tie_interval
    on pjm.five_min_tie_flows (
        ((datetime_beginning_ept)::date),
        tie_flow_name,
        (datetime_beginning_ept::time)
    )
    include (
        actual_mw,
        scheduled_mw
    );
