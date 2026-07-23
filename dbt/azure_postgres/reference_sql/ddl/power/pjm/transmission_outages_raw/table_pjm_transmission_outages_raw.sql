-- Source-table DDL for pjm.transmission_outages_raw.
--
-- Source system: PJM eDART Transmission Facilities Outage List.
-- Endpoint: https://edart.pjm.com/reports/linesout.txt, served as a ZIP.
-- Runtime module: backend.scrapes.power.pjm.transmission_outages.
-- Grain: one parsed outage/equipment record per source TXT file.
-- Primary key: source_file_sha256, source_row_number, where
-- source_row_number is the first source line for that parsed record.
-- Freshness field: source_report_timestamp from the TXT TIMESTAMP header.
-- Retention: runtime purges ingested_at older than 7 days after successful
-- upserts by default.
-- Downstream consumers: frontend/dbt typed projections and raw table
-- validation.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Apply it manually with the helios_admin role
-- before scheduling backend.scrapes.power.pjm.transmission_outages.

CREATE TABLE IF NOT EXISTS pjm.transmission_outages_raw (
    source_report_timestamp TIMESTAMP NOT NULL,
    source_report_timezone VARCHAR NOT NULL DEFAULT 'America/New_York',
    source_file_sha256 VARCHAR(64) NOT NULL,
    source_section VARCHAR NOT NULL,
    source_row_number INTEGER NOT NULL,
    source_end_row_number INTEGER NOT NULL,
    record_kind VARCHAR NOT NULL,
    item_number INTEGER,
    ticket_id BIGINT,
    zone_company VARCHAR,
    facility_name TEXT,
    equipment_type VARCHAR,
    station VARCHAR,
    voltage_kv NUMERIC,
    start_datetime TIMESTAMP,
    end_datetime TIMESTAMP,
    status VARCHAR,
    outage_state VARCHAR,
    last_revised TIMESTAMP,
    rtep VARCHAR,
    availability VARCHAR,
    risk VARCHAR,
    approval_status VARCHAR,
    on_time VARCHAR,
    last_evaluated TIMESTAMP,
    equipment_count INTEGER NOT NULL DEFAULT 0,
    cause TEXT,
    source_columns JSONB NOT NULL,
    equipment_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
    date_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    history_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_line TEXT NOT NULL,
    raw_record_text TEXT NOT NULL,
    source_row_hash VARCHAR(64) NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source_file_sha256, source_row_number),
    CONSTRAINT chk_pjm_transmission_outages_raw_source_columns_object
        CHECK (jsonb_typeof(source_columns) = 'object'),
    CONSTRAINT chk_pjm_transmission_outages_raw_equipment_rows_array
        CHECK (jsonb_typeof(equipment_rows) = 'array'),
    CONSTRAINT chk_pjm_transmission_outages_raw_date_log_array
        CHECK (jsonb_typeof(date_log) = 'array'),
    CONSTRAINT chk_pjm_transmission_outages_raw_history_log_array
        CHECK (jsonb_typeof(history_log) = 'array')
);

ALTER TABLE pjm.transmission_outages_raw
    ADD COLUMN IF NOT EXISTS source_end_row_number INTEGER,
    ADD COLUMN IF NOT EXISTS record_kind VARCHAR,
    ADD COLUMN IF NOT EXISTS item_number INTEGER,
    ADD COLUMN IF NOT EXISTS ticket_id BIGINT,
    ADD COLUMN IF NOT EXISTS zone_company VARCHAR,
    ADD COLUMN IF NOT EXISTS facility_name TEXT,
    ADD COLUMN IF NOT EXISTS equipment_type VARCHAR,
    ADD COLUMN IF NOT EXISTS station VARCHAR,
    ADD COLUMN IF NOT EXISTS voltage_kv NUMERIC,
    ADD COLUMN IF NOT EXISTS start_datetime TIMESTAMP,
    ADD COLUMN IF NOT EXISTS end_datetime TIMESTAMP,
    ADD COLUMN IF NOT EXISTS status VARCHAR,
    ADD COLUMN IF NOT EXISTS outage_state VARCHAR,
    ADD COLUMN IF NOT EXISTS last_revised TIMESTAMP,
    ADD COLUMN IF NOT EXISTS rtep VARCHAR,
    ADD COLUMN IF NOT EXISTS availability VARCHAR,
    ADD COLUMN IF NOT EXISTS risk VARCHAR,
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR,
    ADD COLUMN IF NOT EXISTS on_time VARCHAR,
    ADD COLUMN IF NOT EXISTS last_evaluated TIMESTAMP,
    ADD COLUMN IF NOT EXISTS equipment_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cause TEXT,
    ADD COLUMN IF NOT EXISTS equipment_rows JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS date_log JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS history_log JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS raw_record_text TEXT;

UPDATE pjm.transmission_outages_raw
SET
    source_end_row_number = COALESCE(source_end_row_number, source_row_number),
    record_kind = COALESCE(record_kind, 'legacy_unparsed'),
    equipment_count = COALESCE(equipment_count, 0),
    equipment_rows = COALESCE(equipment_rows, '[]'::jsonb),
    date_log = COALESCE(date_log, '[]'::jsonb),
    history_log = COALESCE(history_log, '[]'::jsonb),
    raw_record_text = COALESCE(raw_record_text, raw_line);

ALTER TABLE pjm.transmission_outages_raw
    ALTER COLUMN source_end_row_number SET NOT NULL,
    ALTER COLUMN record_kind SET NOT NULL,
    ALTER COLUMN equipment_count SET NOT NULL,
    ALTER COLUMN equipment_rows SET NOT NULL,
    ALTER COLUMN date_log SET NOT NULL,
    ALTER COLUMN history_log SET NOT NULL,
    ALTER COLUMN raw_record_text SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_pjm_transmission_outages_raw_equipment_rows_array'
    ) THEN
        ALTER TABLE pjm.transmission_outages_raw
            ADD CONSTRAINT chk_pjm_transmission_outages_raw_equipment_rows_array
            CHECK (jsonb_typeof(equipment_rows) = 'array');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_pjm_transmission_outages_raw_date_log_array'
    ) THEN
        ALTER TABLE pjm.transmission_outages_raw
            ADD CONSTRAINT chk_pjm_transmission_outages_raw_date_log_array
            CHECK (jsonb_typeof(date_log) = 'array');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_pjm_transmission_outages_raw_history_log_array'
    ) THEN
        ALTER TABLE pjm.transmission_outages_raw
            ADD CONSTRAINT chk_pjm_transmission_outages_raw_history_log_array
            CHECK (jsonb_typeof(history_log) = 'array');
    END IF;
END $$;
