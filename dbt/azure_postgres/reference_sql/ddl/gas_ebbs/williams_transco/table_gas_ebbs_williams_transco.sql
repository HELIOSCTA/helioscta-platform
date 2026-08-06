-- Source-table DDL for Williams Transco gas EBB notices.
--
-- Source system: Williams 1Line public EBB.
-- Pipeline: Transco, buid=80.
-- Runtime module: backend.orchestration.gas_ebbs.williams_transco.
-- Listing endpoints:
--   /xhtml/notice_list.jsf?buid=80&archive=N&critical_ind=Y
--   /xhtml/notice_list.jsf?buid=80&archive=N&critical_ind=N
-- Detail endpoint: /1Line/wgp/download?delvid=<source_notice_id>.
-- Primary listing grain: source_family x pipeline_key x source_notice_id.
-- Revision grain: one row per source content hash for a source notice.
-- Freshness fields: posted_at_utc from source and last_seen_at_utc from scrape.
-- Lifecycle: notices are current while present on either successful listing
-- stream and are marked stale only after both critical and non-critical
-- listing streams succeed in the same run.
-- Retention: runtime keeps 365 days of non-current business history and
-- 30 days of bulky/supporting detail data after the source notice becomes
-- stale. Rows for current source notices are never purged by the runtime
-- retention step.
-- Downstream consumers: backend/operator analysis first. No frontend route or
-- API contract is promoted in this pass.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Apply it manually with the helios_admin role
-- before scheduling backend.orchestration.gas_ebbs.williams_transco.

CREATE SCHEMA IF NOT EXISTS gas_ebbs AUTHORIZATION helios_admin;

CREATE TABLE IF NOT EXISTS gas_ebbs.notices (
    source_family VARCHAR NOT NULL,
    pipeline_key VARCHAR NOT NULL,
    pipeline_name VARCHAR NOT NULL,
    buid INTEGER NOT NULL,
    notice_stream VARCHAR NOT NULL,
    source_notice_id VARCHAR NOT NULL,
    critical_ind BOOLEAN NOT NULL,
    notice_type VARCHAR,
    notice_status_desc VARCHAR,
    subject TEXT,
    posted_at_utc TIMESTAMPTZ,
    posted_at_source VARCHAR,
    effective_at_utc TIMESTAMPTZ,
    effective_at_source VARCHAR,
    end_at_utc TIMESTAMPTZ,
    end_at_source VARCHAR,
    response_at_utc TIMESTAMPTZ,
    response_at_source VARCHAR,
    prior_notice_id VARCHAR,
    detail_url TEXT NOT NULL,
    download_url TEXT,
    listing_url TEXT NOT NULL,
    latest_listing_content_hash VARCHAR(64) NOT NULL,
    latest_source_content_hash VARCHAR(64),
    latest_detail_content_hash VARCHAR(64),
    is_current_on_ebb BOOLEAN NOT NULL DEFAULT TRUE,
    first_seen_at_utc TIMESTAMPTZ NOT NULL,
    last_seen_at_utc TIMESTAMPTZ NOT NULL,
    first_missing_at_utc TIMESTAMPTZ,
    stale_at_utc TIMESTAMPTZ,
    last_detail_fetched_at_utc TIMESTAMPTZ,
    last_detail_error_at_utc TIMESTAMPTZ,
    last_detail_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_gas_ebbs_notices_stream
        CHECK (notice_stream IN ('critical', 'noncritical')),
    CONSTRAINT chk_gas_ebbs_notices_source_hash
        CHECK (latest_source_content_hash IS NULL OR length(latest_source_content_hash) = 64),
    PRIMARY KEY (
        source_family,
        pipeline_key,
        source_notice_id
    )
);

CREATE TABLE IF NOT EXISTS gas_ebbs.notice_revisions (
    source_family VARCHAR NOT NULL,
    pipeline_key VARCHAR NOT NULL,
    source_notice_id VARCHAR NOT NULL,
    source_content_hash VARCHAR(64) NOT NULL,
    listing_content_hash VARCHAR(64) NOT NULL,
    detail_content_hash VARCHAR(64) NOT NULL,
    notice_stream VARCHAR NOT NULL,
    critical_ind BOOLEAN NOT NULL,
    notice_type VARCHAR,
    subject TEXT,
    posted_at_utc TIMESTAMPTZ,
    effective_at_utc TIMESTAMPTZ,
    end_at_utc TIMESTAMPTZ,
    response_at_utc TIMESTAMPTZ,
    detail_url TEXT NOT NULL,
    download_url TEXT,
    revision_observed_at_utc TIMESTAMPTZ NOT NULL,
    detail_fetched_at_utc TIMESTAMPTZ NOT NULL,
    source_url TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_gas_ebb_notice_revisions_notice
        FOREIGN KEY (
            source_family,
            pipeline_key,
            source_notice_id
        )
        REFERENCES gas_ebbs.notices (
            source_family,
            pipeline_key,
            source_notice_id
        )
        ON DELETE CASCADE,
    PRIMARY KEY (
        source_family,
        pipeline_key,
        source_notice_id,
        source_content_hash
    )
);

CREATE TABLE IF NOT EXISTS gas_ebbs.notice_details (
    source_family VARCHAR NOT NULL,
    pipeline_key VARCHAR NOT NULL,
    source_notice_id VARCHAR NOT NULL,
    source_content_hash VARCHAR(64) NOT NULL,
    detail_content_hash VARCHAR(64) NOT NULL,
    detail_url TEXT NOT NULL,
    detail_fetched_at_utc TIMESTAMPTZ NOT NULL,
    detail_clean_text TEXT NOT NULL,
    notice_text TEXT NOT NULL,
    detail_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    supporting_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_detail_sha256 VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_gas_ebb_notice_details_revision
        FOREIGN KEY (
            source_family,
            pipeline_key,
            source_notice_id,
            source_content_hash
        )
        REFERENCES gas_ebbs.notice_revisions (
            source_family,
            pipeline_key,
            source_notice_id,
            source_content_hash
        )
        ON DELETE CASCADE,
    PRIMARY KEY (
        source_family,
        pipeline_key,
        source_notice_id,
        source_content_hash
    )
);

CREATE TABLE IF NOT EXISTS gas_ebbs.planned_outages (
    source_family VARCHAR NOT NULL,
    pipeline_key VARCHAR NOT NULL,
    source_notice_id VARCHAR NOT NULL,
    source_content_hash VARCHAR(64) NOT NULL,
    outage_sequence INTEGER NOT NULL,
    classification VARCHAR NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    notice_type VARCHAR,
    subject TEXT,
    effective_start_at_utc TIMESTAMPTZ,
    effective_end_at_utc TIMESTAMPTZ,
    location_id VARCHAR,
    location_name TEXT,
    zone VARCHAR,
    delivery_receipt VARCHAR,
    tsb_type VARCHAR,
    available_capacity_mdt_per_day DOUBLE PRECISION,
    highest_priority_included VARCHAR,
    flow_direction VARCHAR,
    job_number VARCHAR,
    source_table_title TEXT,
    source_row_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    derived_at_utc TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_gas_ebb_planned_outages_revision
        FOREIGN KEY (
            source_family,
            pipeline_key,
            source_notice_id,
            source_content_hash
        )
        REFERENCES gas_ebbs.notice_revisions (
            source_family,
            pipeline_key,
            source_notice_id,
            source_content_hash
        )
        ON DELETE CASCADE,
    PRIMARY KEY (
        source_family,
        pipeline_key,
        source_notice_id,
        source_content_hash,
        outage_sequence
    )
);
