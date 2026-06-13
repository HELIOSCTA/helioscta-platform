-- Source-table DDL for pjm.da_transconstraints.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.da_transconstraints.

CREATE TABLE IF NOT EXISTS pjm.da_transconstraints (
    contingency_facility VARCHAR NOT NULL,
    datetime_beginning_ept TIMESTAMP,
    datetime_beginning_utc TIMESTAMP NOT NULL,
    datetime_ending_ept TIMESTAMP,
    datetime_ending_utc TIMESTAMP,
    day_ahead_congestion_event VARCHAR NOT NULL,
    duration INTEGER,
    monitored_facility VARCHAR NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        datetime_beginning_utc,
        day_ahead_congestion_event,
        monitored_facility,
        contingency_facility
    )
);
