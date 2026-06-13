-- Source-table DDL for pjm.ancillary_services.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.ancillary_services.

CREATE TABLE IF NOT EXISTS pjm.ancillary_services (
    ancillary_service VARCHAR NOT NULL,
    datetime_beginning_ept TIMESTAMP NOT NULL,
    datetime_beginning_utc TIMESTAMP NOT NULL,
    row_is_current BOOLEAN NOT NULL,
    unit VARCHAR,
    value DOUBLE PRECISION,
    version_nbr INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        datetime_beginning_ept,
        ancillary_service,
        row_is_current,
        version_nbr
    )
);
