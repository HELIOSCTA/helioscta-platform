-- Source-table DDL for pjm.transmission_outages_raw.
--
-- Source system: PJM eDART Transmission Facilities Outage List.
-- Endpoint: https://edart.pjm.com/reports/linesout.txt, served as a ZIP.
-- Runtime module: backend.scrapes.power.pjm.transmission_outages.
-- Grain: one raw TXT file per source_file_sha256.
-- Primary key: source_file_sha256.
-- Freshness field: source_report_timestamp from the TXT TIMESTAMP header.
-- Retention: runtime purges ingested_at older than 7 days after successful
-- upserts by default.
-- Downstream consumers: read-time parsers, ad hoc analysis, and raw file
-- validation. Ticket/equipment rows are not persisted in this table.
--
-- This reset is intentionally destructive because the first promoted version
-- stored parsed row snapshots and was replaced with raw TXT file storage only.
-- Apply it manually with the helios_admin role before scheduling
-- backend.scrapes.power.pjm.transmission_outages.

DROP TABLE IF EXISTS pjm.transmission_outages_raw;

CREATE TABLE pjm.transmission_outages_raw (
    source_report_timestamp TIMESTAMP NOT NULL,
    source_report_timezone VARCHAR NOT NULL DEFAULT 'America/New_York',
    source_file_sha256 VARCHAR(64) NOT NULL,
    source_url TEXT NOT NULL,
    source_content_type VARCHAR,
    source_content_length INTEGER,
    source_line_count INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source_file_sha256)
);
