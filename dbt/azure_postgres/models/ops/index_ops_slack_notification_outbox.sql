-- Indexes for ops.slack_notification_outbox.
--
-- Run manually with helios_admin after
-- table_ops_slack_notification_outbox.sql.

CREATE INDEX IF NOT EXISTS idx_slack_notification_outbox_due
    ON ops.slack_notification_outbox (status, next_attempt_at, created_at)
    WHERE status IN ('pending', 'failed', 'sending');

CREATE INDEX IF NOT EXISTS idx_slack_notification_outbox_source_event
    ON ops.slack_notification_outbox (source_event_key);

CREATE INDEX IF NOT EXISTS idx_slack_notification_outbox_created_at
    ON ops.slack_notification_outbox (created_at DESC);
