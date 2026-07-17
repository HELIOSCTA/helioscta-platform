-- Source-table indexes for pjm.ancillary_services.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- If an operator applies it, use a write-capable role in a SQL editor with
-- autocommit enabled. Do not wrap CREATE INDEX CONCURRENTLY in BEGIN/COMMIT.

create index concurrently if not exists idx_ancillary_services_freshness
    on pjm.ancillary_services (
        datetime_beginning_ept
    )
    include (
        value
    );

create index concurrently if not exists idx_ancillary_services_pk_lookup
    on pjm.ancillary_services (
        datetime_beginning_utc, datetime_beginning_ept, ancillary_service, row_is_current, version_nbr
    );
