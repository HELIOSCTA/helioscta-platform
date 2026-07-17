-- Source-table indexes for pjm.act_sch_interchange.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_act_sch_interchange_freshness
    on pjm.act_sch_interchange (
        datetime_beginning_ept
    )
    include (
        actual_flow,
        datetime_beginning_ept,
        datetime_ending_ept,
        datetime_ending_utc,
        inadv_flow,
        sched_flow
    );

create index concurrently if not exists idx_act_sch_interchange_pk_lookup
    on pjm.act_sch_interchange (
        datetime_beginning_utc, tie_line
    );
