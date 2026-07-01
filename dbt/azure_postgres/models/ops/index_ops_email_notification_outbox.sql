-- Indexes for ops.email_notification_outbox.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role after applying
-- table_ops_email_notification_outbox.sql.

CREATE INDEX IF NOT EXISTS idx_email_notification_outbox_due
    ON ops.email_notification_outbox (status, next_attempt_at, created_at)
    WHERE status IN ('pending', 'failed', 'sending');

CREATE INDEX IF NOT EXISTS idx_email_notification_outbox_source_event
    ON ops.email_notification_outbox (source_event_key);

CREATE INDEX IF NOT EXISTS idx_email_notification_outbox_created_at
    ON ops.email_notification_outbox (created_at DESC);
