-- Source-table indexes for pjm.rt_marginal_value.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_rt_marginal_value_freshness
    on pjm.rt_marginal_value (
        datetime_beginning_ept
    )
    include (
        datetime_beginning_ept,
        datetime_ending_ept,
        datetime_ending_utc,
        shadow_price,
        limit_control_percentage,
        transmission_constraint_penalty_factor
    );

create index concurrently if not exists idx_rt_marginal_value_pk_lookup
    on pjm.rt_marginal_value (
        datetime_beginning_utc, monitored_facility, contingency_facility
    );
