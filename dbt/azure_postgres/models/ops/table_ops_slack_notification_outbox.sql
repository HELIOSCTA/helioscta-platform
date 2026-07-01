-- Table DDL for ops.slack_notification_outbox.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Apply manually with helios_admin before enabling
-- backend.orchestration.notifications.slack_outbox.

CREATE TABLE IF NOT EXISTS ops.slack_notification_outbox (
    id BIGSERIAL PRIMARY KEY,
    notification_key VARCHAR NOT NULL,
    channel_id VARCHAR NOT NULL,
    channel_name VARCHAR,
    dataset VARCHAR,
    source_event_key VARCHAR,
    source_event_id BIGINT,
    message_text TEXT NOT NULL,
    message_blocks JSONB,
    status VARCHAR NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 6,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_attempt_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    provider VARCHAR,
    provider_message_id VARCHAR,
    provider_channel_id VARCHAR,
    last_error_type VARCHAR,
    last_error_message TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_slack_notification_key_channel
        UNIQUE (notification_key, channel_id),
    CONSTRAINT chk_slack_notification_status
        CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'dead')),
    CONSTRAINT chk_slack_notification_attempts
        CHECK (attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts)
);
