-- Source-table DDL for ercot.hourly_resource_outage_capacity.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.ercot.hourly_resource_outage_capacity.

CREATE TABLE IF NOT EXISTS ercot.hourly_resource_outage_capacity (
    posteddatetime TIMESTAMP NOT NULL,
    operatingdate DATE NOT NULL,
    hourending INTEGER NOT NULL,
    totalresourcemwzonesouth DOUBLE PRECISION,
    totalresourcemwzonenorth DOUBLE PRECISION,
    totalresourcemwzonewest DOUBLE PRECISION,
    totalresourcemwzonehouston DOUBLE PRECISION,
    totalirrmwzonesouth DOUBLE PRECISION,
    totalirrmwzonenorth DOUBLE PRECISION,
    totalirrmwzonewest DOUBLE PRECISION,
    totalirrmwzonehouston DOUBLE PRECISION,
    totalnewequipresourcemwzonesouth DOUBLE PRECISION,
    totalnewequipresourcemwzonenorth DOUBLE PRECISION,
    totalnewequipresourcemwzonewest DOUBLE PRECISION,
    totalnewequipresourcemwzonehouston DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        posteddatetime,
        operatingdate,
        hourending
    )
);
