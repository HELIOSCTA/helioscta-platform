-- Runtime pipeline run event log.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before scheduling workflows
-- that use backend.utils.ops_logging.PipelineRunLogger.

CREATE TABLE IF NOT EXISTS ops.pipeline_runs (
    run_id VARCHAR NOT NULL,
    pipeline_name VARCHAR NOT NULL,
    event_type VARCHAR NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL,
    duration_seconds DOUBLE PRECISION,
    status VARCHAR,
    error_type VARCHAR,
    error_message TEXT,
    log_file_content TEXT,
    rows_processed INTEGER,
    files_processed INTEGER,
    source VARCHAR,
    priority VARCHAR,
    tags VARCHAR,
    hostname VARCHAR,
    notification_channel VARCHAR,
    notification_recipient VARCHAR,
    metadata JSONB,
    target_table VARCHAR,
    operation_type VARCHAR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, event_type, event_timestamp)
);
