-- Alert outbox constraints and indexes for alerts.events.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.
-- Apply the ALTER statements with a write-capable role. The CREATE INDEX
-- CONCURRENTLY statements must run with autocommit enabled and outside an
-- explicit BEGIN/COMMIT transaction.

alter table alerts.events
    alter column recipient_emails set default '[]'::jsonb;

update alerts.events
set
    recipient_emails = '[]'::jsonb,
    updated_at = now()
where recipient_emails is null;

alter table alerts.events
    drop constraint if exists alerts_events_email_status_check;

alter table alerts.events
    add constraint alerts_events_email_status_check
    check (
        email_status in (
            'pending',
            'sending',
            'sent',
            'failed',
            'suppressed'
        )
    );

update alerts.events
set
    email_status = 'pending',
    email_claimed_at = null,
    email_claim_token = null,
    email_claimed_by = null,
    updated_at = now()
where email_status = 'sending'
  and email_claimed_at < now() - interval '15 minutes';

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'events_alert_key_key'
          and conrelid = 'alerts.events'::regclass
    ) then
        alter table alerts.events
            add constraint events_alert_key_key unique (alert_key);
    end if;
end $$;

create index concurrently if not exists idx_alerts_events_email_status
    on alerts.events (
        email_status,
        email_attempts,
        event_time
    );

create index concurrently if not exists idx_alerts_events_email_claim
    on alerts.events (
        email_status,
        email_claimed_at
    )
    where email_status = 'sending';

create index concurrently if not exists idx_alerts_events_recent
    on alerts.events (
        event_time desc,
        id desc
    );

create index concurrently if not exists idx_alerts_events_source_time
    on alerts.events (
        source_system,
        event_time desc
    );
