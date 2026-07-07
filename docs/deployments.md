# Deployment Register

Use this file to track production runtime deployments. Update the relevant
entry whenever a VM host, deployed commit, schedule, unit file, credential
boundary, or log path changes.

## production-vm-operations

- Status: deployed; CI/checklist discipline, log retention policy, and VM
  rebuild runbook are versioned.
- Host: `helioscta-prod-vm-01`.
- Runtime path: `/opt/helioscta-platform`.
- Service user: `helios`.
- Operator SSH user: `azureuser`.
- Log retention unit: `infrastructure/systemd/journald-helioscta.conf`.
- Installed path: `/etc/systemd/journald.conf.d/helioscta.conf`.
- Deployed commit: verify on the VM with
  `sudo -u helios -H git -C /opt/helioscta-platform rev-parse HEAD`.
- Policy: journald capped at `1G` and `30day`; runtime journal capped at
  `256M`; failed scrape file logs retained under `/var/log/helioscta`.
- Operator docs:
  - `docs/workflow-promotion-checklist.md`
  - `docs/operations/log-retention.md`
  - `docs/operations/manual-backfills.md`
  - `docs/operations/vm-rebuild-runbook.md`
- Verification:
  - GitHub Actions CI validates backend tests.
  - VM verification commands: `journalctl --disk-usage` and
    `systemctl list-timers 'helios-*'`.

## frontend-pjm-da-lmp-release-report

- Status: deployed to Vercel production on `2026-06-30`.
- Deployment ID: `dpl_5WmQHANXX3gA94RRQuXtDAGek5ZW`.
- Production aliases:
  - `https://frontend-helioscta.vercel.app`
  - `https://frontend-nzg1fn64h-helioscta.vercel.app`
- Report link shape:
  `/?section=pjm-da-lmps&view=single-day&product=da&date=YYYY-MM-DD&hub=WESTERN%20HUB&component=all&refresh=1`.
- Verification: `HEAD /api/pjm-da-lmps?date=2026-07-01&refresh=1` returned
  `200` with `Cache-Control: no-store` when called with the Vercel protection
  bypass header.

## helios-pjm-da-hrl-lmps

- Status: deployed; timer enabled and latest manual run succeeded.
- Workflow: PJM Day-Ahead Hourly LMP orchestration.
- Runtime module: `backend.orchestration.power.pjm.da_hrl_lmps`.
- Lower-level scrape module: `backend.scrapes.power.pjm.da_hrl_lmps`.
- Source system: PJM Data Miner 2 `da_hrl_lmps`.
- Destination table: `pjm.da_hrl_lmps`.
- API telemetry: `ops.api_fetch_log`.
- Data readiness output: `ops.data_availability_events`.
- Release notification output: `ops.slack_notification_outbox`.
- Unit files:
  - `infrastructure/systemd/helios-pjm-da-hrl-lmps.service`
  - `infrastructure/systemd/helios-pjm-da-hrl-lmps.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Public SSH endpoint: `azureuser@20.59.106.155`.
- Private VM IP: `10.42.1.4`.
- OS: Ubuntu 22.04.5 LTS.
- Service user: `helios`.
- Operator SSH user: `azureuser`.
- Environment file: `/etc/helioscta/backend.env`.
- File log path: `/var/log/helioscta`.
- Journal logs: `journalctl -u helios-pjm-da-hrl-lmps.service`.
- Schedule: daily at `15:30 UTC` (`11:30 America/New_York` during daylight
  saving time), polling every `60` seconds for up to `5` hours.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-da-hrl-lmps.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- First enabled at: `2026-06-12 20:13:05 UTC`.
- Deployed commit: `5d4b10b0933a1b4df087cdb811b7e9e335433c3c`.
- Deployed by: Aidan Keaveny via Codex.
- Last manual verification: `2026-06-12 20:31:09 UTC`; emitted
  `pjm_da_hrl_lmps:data_ready:2026-06-13:hub`.
- First scheduled run observed: `2026-06-13 16:00:00 UTC`.

Verification SQL for API telemetry:

```sql
SELECT
    provider,
    operation_name,
    status,
    http_status,
    rows_returned,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name = 'da_hrl_lmps'
ORDER BY created_at DESC
LIMIT 10;
```

Verification SQL for Slack release notifications:

```sql
SELECT
    notification_key,
    channel_id,
    channel_name,
    status,
    attempts,
    next_attempt_at,
    sent_at,
    created_at
FROM ops.slack_notification_outbox
WHERE dataset = 'pjm_da_hrl_lmps'
ORDER BY created_at DESC
LIMIT 10;
```

## helios-email-notification-outbox

- Status: deployed on `helioscta-prod-vm-01` on `2026-06-30`; disabled on
  `2026-07-01` while release alerts are Slack-only. Microsoft Graph
  credentials were configured, and a manual smoke email was sent before
  disabling the sender.
- Workflow: durable email notification retry sender.
- Runtime module: `backend.orchestration.notifications.email_outbox`.
- Destination table: updates `ops.email_notification_outbox`.
- Email provider: Microsoft Graph via existing Azure Outlook app credentials.
- Unit files:
  - `infrastructure/systemd/helios-email-notification-outbox.service`
  - `infrastructure/systemd/helios-email-notification-outbox.timer`
- Schedule when enabled: every five minutes, with `RandomizedDelaySec=30s`.
- Recipient scope: defaults to `aidan.keaveny@helioscta.com`; production should
  keep `HELIOS_EMAIL_RECIPIENTS=aidan.keaveny@helioscta.com` until the recipient
  list is explicitly expanded.
- Send status: disabled in `/etc/helioscta/backend.env` with
  `HELIOS_EMAIL_NOTIFICATIONS_ENABLED=false`; the timer should remain disabled
  unless email workflows are explicitly re-enabled.
- Smoke verification: `manual_email_smoke:20260630T202529Z` was marked `sent`
  at `2026-06-30 20:23:06 UTC` on attempt `1`.
- Duplicate suppression: unique outbox key on `(notification_key,
  recipient_email)`.
- Retry policy: failed rows remain in the outbox and are retried until
  `HELIOS_EMAIL_MAX_ATTEMPTS`, then marked `dead` for manual inspection.
- Residual delivery caveat: if Microsoft Graph accepts a message and the
  process crashes before the row is marked `sent`, a later stale-row retry can
  send the same recipient a duplicate email.

## helios-slack-notification-outbox

- Status: deployed on `helioscta-prod-vm-01` on `2026-06-30`; timer enabled,
  Slack bot credentials configured, and manual smoke messages sent.
- Workflow: durable Slack notification retry sender.
- Runtime module: `backend.orchestration.notifications.slack_outbox`.
- Destination table: updates `ops.slack_notification_outbox`.
- Provider: Slack Web API `chat.postMessage` through `SLACK_BOT_TOKEN`; incoming
  webhook remains fallback only.
- Unit files:
  - `infrastructure/systemd/helios-slack-notification-outbox.service`
  - `infrastructure/systemd/helios-slack-notification-outbox.timer`
- Schedule: every minute, with `RandomizedDelaySec=10s`.
- Default channel scope: `SLACK_DEFAULT_CHANNEL_ID` or
  `SLACK_DEFAULT_CHANNEL_NAME`; production uses channel IDs.
- Send status: enabled in `/etc/helioscta/backend.env` with
  `HELIOS_SLACK_NOTIFICATIONS_ENABLED=true`.
- Slack bot: `helioscta_alerts`.
- Default channel: `#helios-alerts-power` / `C0BEDBTAL2H`.
- Active managed public alert channel:
  - `#helios-alerts-power` / `C0BEDBTAL2H`
- Archived during cleanup:
  - `#helios-alerts-critical` / `C0BEJJYEM8R`
  - `#helios-alerts-gas` / `C0BEJJXR3SM`
  - `#helios-alerts-weather` / `C0BEADC03MZ`
  - `#helios-alerts-positions` / `C0BELD1UV1S`
  - `#helios-alerts-dev` / `C0BEDBTS71T`
  - `#helioscta-alerts`
  - `#test123`
- Smoke verification: `manual_slack_bot_smoke:20260630T222122Z` was marked
  `sent` at `2026-06-30 22:21:33 UTC` on attempt `1` via
  `slack_chat_post_message`; provider channel ID was `C0BEE4WSA0L`.
- Channel setup verification: `manual_slack_dev_channel_smoke:20260701T143202Z`
  was marked `sent` at `2026-07-01 14:32:09 UTC` on attempt `1` via
  `slack_chat_post_message`; provider channel ID was `C0BEDBTS71T`.
- Earlier failed smoke rows from the inactive token/webhook tests were also
  retried and marked `sent` after the valid bot token was installed.
- Duplicate suppression: unique outbox key on `(notification_key, channel_id)`.
- Retry policy: failed rows remain in the outbox and are retried until
  `HELIOS_SLACK_MAX_ATTEMPTS`, then marked `dead` for manual inspection.

## ercot-congestion-batch

- Status: deployed; timer enabled and latest manual run succeeded.
- Runtime module: `backend.orchestration.power.ercot.congestion_batch`.
- Lower-level scrape modules:
  - `backend.scrapes.power.ercot.dam_shadow_prices`
  - `backend.scrapes.power.ercot.sced_shadow_prices`
- Destination tables:
  - `ercot.dam_shadow_prices`
  - `ercot.sced_shadow_prices`
- Schedule: daily at `12:45 UTC` with `Persistent=true` and
  `RandomizedDelaySec=10min`; scheduled defaults pull the prior complete
  congestion day.
- Systemd units:
  - `infrastructure/systemd/helios-ercot-congestion-batch.service`
  - `infrastructure/systemd/helios-ercot-congestion-batch.timer`
- Journal logs: `journalctl -u helios-ercot-congestion-batch.service`.
- Safe rerun story: upsert on each feed's source primary key.
- Deployed commit: `3181193`.
- Latest manual verification: `2026-06-13 18:06:48 UTC`; service exited
  `status=0/SUCCESS`, upserted 1,128 DAM shadow price rows and 2,618 SCED
  shadow price rows for `2026-06-12`, and completed with `2 succeeded, 0
  failed`.
- Next scheduled run observed: `2026-06-14 12:52:17 UTC`.

## ercot-renewables-batch

- Status: deployed; timer enabled and latest manual run succeeded.
- Runtime module: `backend.orchestration.power.ercot.renewables_batch`.
- Lower-level scrape modules:
  - `backend.scrapes.power.ercot.wind_power_production_hourly`
  - `backend.scrapes.power.ercot.solar_power_production_hourly`
- Destination tables:
  - `ercot.wind_power_production_hourly`
  - `ercot.solar_power_production_hourly`
- Schedule: daily at `13:10 UTC` with `Persistent=true` and
  `RandomizedDelaySec=10min`; scheduled defaults pull yesterday through seven
  days forward to capture actuals plus the forecast curve.
- Systemd units:
  - `infrastructure/systemd/helios-ercot-renewables-batch.service`
  - `infrastructure/systemd/helios-ercot-renewables-batch.timer`
- Journal logs: `journalctl -u helios-ercot-renewables-batch.service`.
- Safe rerun story: upsert on each feed's source primary key.
- Deployed commit: `4d5e4ce`.
- Latest manual verification: `2026-06-13 18:32:57 UTC`; service exited
  `status=0/SUCCESS`, ran delivery dates `2026-06-12` through `2026-06-20`,
  upserted 20,910 wind rows and 20,910 solar rows, and completed with
  `2 succeeded, 0 failed`.
- Next scheduled run observed: `2026-06-14 13:11:44 UTC`.

## ercot-renewables-5min-batch

- Status: deployed; timer enabled and latest manual run succeeded.
- Runtime module: `backend.orchestration.power.ercot.renewables_5min_batch`.
- Lower-level scrape modules:
  - `backend.scrapes.power.ercot.wind_power_actual_5min`
  - `backend.scrapes.power.ercot.solar_power_actual_5min`
- Destination tables:
  - `ercot.wind_power_actual_5min`
  - `ercot.solar_power_actual_5min`
- Schedule: daily at `13:25 UTC` with `Persistent=true` and
  `RandomizedDelaySec=10min`; scheduled defaults pull the prior complete
  interval-ending day.
- Systemd units:
  - `infrastructure/systemd/helios-ercot-renewables-5min-batch.service`
  - `infrastructure/systemd/helios-ercot-renewables-5min-batch.timer`
- Journal logs: `journalctl -u helios-ercot-renewables-5min-batch.service`.
- Safe rerun story: upsert on each feed's source primary key.
- Deployed commit: `a32d01e`.
- Latest manual verification: `2026-06-13 19:06:14 UTC`; service exited
  `status=0/SUCCESS`, ran interval-ending day `2026-06-12`, upserted 3,456
  wind rows and 3,456 solar rows, and completed with `2 succeeded, 0 failed`.
- Next scheduled run observed: `2026-06-14 13:28:28 UTC`.

## ercot-outage-capacity-batch

- Status: deployed; timer enabled and latest manual run succeeded.
- Runtime module: `backend.orchestration.power.ercot.outage_capacity_batch`.
- Lower-level scrape modules:
  - `backend.scrapes.power.ercot.hourly_resource_outage_capacity`
  - `backend.scrapes.power.ercot.short_term_system_adequacy`
- Destination tables:
  - `ercot.hourly_resource_outage_capacity`
  - `ercot.short_term_system_adequacy`
- Schedule: daily at `13:35 UTC` with `Persistent=true` and
  `RandomizedDelaySec=10min`; scheduled defaults pull the prior complete
  outage/capacity operating day and STSA delivery date.
- Systemd units:
  - `infrastructure/systemd/helios-ercot-outage-capacity-batch.service`
  - `infrastructure/systemd/helios-ercot-outage-capacity-batch.timer`
- Journal logs: `journalctl -u helios-ercot-outage-capacity-batch.service`.
- Safe rerun story: upsert on the source primary key.
- Deployed commit: `40280af`.
- Latest manual verification: `2026-06-13 20:22:46 UTC`; service exited
  `status=0/SUCCESS`, ran operating/delivery date `2026-06-12`, upserted
  4,600 hourly resource outage capacity rows and 4,032 short-term system
  adequacy rows, and completed with `2 succeeded, 0 failed`.
- Next scheduled run observed: `2026-06-14 13:40:00 UTC`.

Verification SQL for data-availability events:

```sql
SELECT
    dataset,
    source_system,
    availability_type,
    business_date,
    scope,
    grain,
    completeness_status,
    row_count,
    entity_count,
    period_count,
    created_at
FROM ops.data_availability_events
WHERE dataset = 'pjm_da_hrl_lmps'
ORDER BY created_at DESC
LIMIT 10;
```

Operational notes:

- Run the service manually only during the PJM publish window unless waiting
  through the polling ceiling is intentional.
- Use `journalctl -u helios-pjm-da-hrl-lmps.service` for process status and
  `/var/log/helioscta` for retained failure logs.
- `/opt/helioscta-platform` is owned for the `helios` service user. From the
  `azureuser` shell, run repo commands as
  `sudo -u helios -H git -C /opt/helioscta-platform ...`; do not expect sudo
  to work after switching into a `helios` shell.
- Keep the deployment on the orchestration module so the scheduled path emits
  API telemetry and data readiness events.
- Keep one `KEY=value` per line in `/etc/helioscta/backend.env` and leave a
  trailing newline. Do not print the environment file or secrets in terminals,
  logs, or command history.
- After future `git pull --ff-only` deployments, update this register with the
  VM commit, timer state, and verification result.

## ercot-dam-stlmnt-pnt-prices

- Status: deployed; timer enabled and latest manual VM run succeeded.
- Workflow: ERCOT DAM Settlement Point Prices orchestration.
- Runtime module: `backend.orchestration.power.ercot.dam_stlmnt_pnt_prices`.
- Lower-level scrape module:
  `backend.scrapes.power.ercot.dam_stlmnt_pnt_prices`.
- Source system: ERCOT Public Reports `NP4-190-CD`.
- Report Type ID: `12331`.
- Destination table: `ercot.dam_stlmnt_pnt_prices`.
- API telemetry: `ops.api_fetch_log`.
- Data readiness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-ercot-dam-stlmnt-pnt-prices.service`
  - `infrastructure/systemd/helios-ercot-dam-stlmnt-pnt-prices.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Journal logs: `journalctl -u helios-ercot-dam-stlmnt-pnt-prices.service`.
- Schedule: daily at `16:15 UTC` with `RandomizedDelaySec=5min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-ercot-dam-stlmnt-pnt-prices.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Application DDL applied locally with `psql` on `2026-06-13`.
- Manual verification: `2026-06-13 16:52 UTC`; conda env
  `helioscta-platform-backend` ran the orchestration for business date
  `2026-06-13`, upserted 96 hub rows, and emitted
  `ercot_dam_stlmnt_pnt_prices:data_ready:2026-06-13:hub`.
- Deployed runtime commit: `172be4d`.
- Deployment register finalized in a follow-up docs commit.
- VM deployment: working-tree overlay verified, committed, pushed, and
  fast-forwarded on `/opt/helioscta-platform` on `2026-06-13 17:35 UTC`.
- Last VM verification: `2026-06-13 17:31 UTC`; service exited
  `status=0/SUCCESS`, upserted 96 hub rows for delivery date `2026-06-13`,
  and observed existing readiness event
  `ercot_dam_stlmnt_pnt_prices:data_ready:2026-06-13:hub`.
- Next scheduled run observed: `2026-06-14 16:15:08 UTC`.

Verification SQL for data-availability events:

```sql
SELECT
    dataset,
    source_system,
    availability_type,
    business_date,
    scope,
    grain,
    completeness_status,
    row_count,
    entity_count,
    period_count,
    created_at
FROM ops.data_availability_events
WHERE dataset = 'ercot_dam_stlmnt_pnt_prices'
ORDER BY created_at DESC
LIMIT 10;
```

## helios-isone-da-hrl-lmps

- Status: deployed; timer enabled and latest VM run succeeded.
- Workflow: ISO-NE Day-Ahead Hourly LMP orchestration.
- Runtime module: `backend.orchestration.power.isone.da_hrl_lmps`.
- Lower-level scrape module: `backend.scrapes.power.isone.da_hrl_lmps`.
- Source system: ISO-NE ISO Express `Hourly Day-Ahead LMPs`.
- Destination table: `isone.da_hrl_lmps`.
- API telemetry: `ops.api_fetch_log`.
- Data readiness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-isone-da-hrl-lmps.service`
  - `infrastructure/systemd/helios-isone-da-hrl-lmps.timer`
- Schedule: daily at `17:10 UTC` with `RandomizedDelaySec=5min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-isone-da-hrl-lmps.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Application DDL applied locally on `2026-06-13`.
- Manual verification: `2026-06-13`; conda env
  `helioscta-platform-backend` ran the orchestration for operating date
  `2026-06-13`, upserted 29,016 rows, wrote ISO-NE API telemetry, and emitted
  `isone_da_hrl_lmps:data_ready:2026-06-13:all_locations`.
- Deployed runtime commit: `4b0901c`.
- VM deployment: fast-forwarded on `/opt/helioscta-platform`, unit files
  installed, and timer enabled on `2026-06-14 00:21 UTC`.
- Last VM verification: `2026-06-14 00:21 UTC`; service exited
  `status=0/SUCCESS`, upserted 29,016 rows for operating date `2026-06-13`,
  and observed existing readiness event
  `isone_da_hrl_lmps:data_ready:2026-06-13:all_locations`.
- Next scheduled run observed: `2026-06-14 17:10:45 UTC`.

Verification SQL for data-availability events:

```sql
SELECT
    dataset,
    source_system,
    availability_type,
    business_date,
    scope,
    grain,
    completeness_status,
    row_count,
    entity_count,
    period_count,
    created_at
FROM ops.data_availability_events
WHERE dataset = 'isone_da_hrl_lmps'
ORDER BY created_at DESC
LIMIT 10;
```

## helios-isone-rt-hrl-lmps-final

- Status: deployed; timer enabled and latest VM run succeeded.
- Workflow: ISO-NE Final Real-Time Hourly LMP orchestration.
- Runtime module: `backend.orchestration.power.isone.rt_hrl_lmps_final`.
- Lower-level scrape module: `backend.scrapes.power.isone.rt_hrl_lmps_final`.
- Source system: ISO-NE ISO Express `Final Real-Time Hourly LMPs`.
- Destination table: `isone.rt_hrl_lmps_final`.
- API telemetry: `ops.api_fetch_log`.
- Data readiness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-isone-rt-hrl-lmps-final.service`
  - `infrastructure/systemd/helios-isone-rt-hrl-lmps-final.timer`
- Schedule: daily at `20:10 UTC` with `RandomizedDelaySec=5min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-isone-rt-hrl-lmps-final.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Application DDL applied locally on `2026-06-13`.
- Manual verification: `2026-06-13`; conda env
  `helioscta-platform-backend` ran the orchestration for operating date
  `2026-06-11`, upserted 29,016 rows, wrote ISO-NE API telemetry, and emitted
  `isone_rt_hrl_lmps_final:data_ready:2026-06-11:all_locations`.
- Deployed runtime commit: `4b0901c`.
- VM deployment: fast-forwarded on `/opt/helioscta-platform`, unit files
  installed, and timer enabled on `2026-06-14 00:21 UTC`.
- Last VM verification: `2026-06-14 00:21 UTC`; service exited
  `status=0/SUCCESS`, upserted 29,016 rows for operating date `2026-06-11`,
  and observed existing readiness event
  `isone_rt_hrl_lmps_final:data_ready:2026-06-11:all_locations`.
- Runtime fix deployed: `2026-06-15 17:06 UTC`; commit `457ddd0` changed the
  lower-level scrape to treat ISO-NE's `No data exists for this period.` CSV
  body as an empty result instead of a failed run. VM verification exited
  `status=0/SUCCESS`, upserted 29,016 rows for operating date `2026-06-13`,
  and emitted
  `isone_rt_hrl_lmps_final:data_ready:2026-06-13:all_locations`.
- Next scheduled run observed: `2026-06-14 20:14:29 UTC`.

Verification SQL for data-availability events:

```sql
SELECT
    dataset,
    source_system,
    availability_type,
    business_date,
    scope,
    grain,
    completeness_status,
    row_count,
    entity_count,
    period_count,
    created_at
FROM ops.data_availability_events
WHERE dataset = 'isone_rt_hrl_lmps_final'
ORDER BY created_at DESC
LIMIT 10;
```

## helios-isone-rt-hrl-lmps-prelim

- Status: deployed; timer enabled and latest VM run succeeded.
- Workflow: ISO-NE Preliminary Real-Time Hourly LMP orchestration.
- Runtime module: `backend.orchestration.power.isone.rt_hrl_lmps_prelim`.
- Lower-level scrape module: `backend.scrapes.power.isone.rt_hrl_lmps_prelim`.
- Source system: ISO-NE ISO Express `Preliminary Real-Time Hourly LMPs`.
- Destination table: `isone.rt_hrl_lmps_prelim`.
- API telemetry: `ops.api_fetch_log`.
- Data readiness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-isone-rt-hrl-lmps-prelim.service`
  - `infrastructure/systemd/helios-isone-rt-hrl-lmps-prelim.timer`
- Schedule: daily at `01:10 UTC` with `RandomizedDelaySec=5min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-isone-rt-hrl-lmps-prelim.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Application DDL applied locally on `2026-06-13`.
- Manual verification: `2026-06-13`; conda env
  `helioscta-platform-backend` ran the orchestration for operating date
  `2026-06-13`, upserted 24,180 partial current-day rows, correctly skipped
  readiness because only 20 hours were present, then ran operating date
  `2026-06-12`, upserted 29,016 complete-day rows, and emitted
  `isone_rt_hrl_lmps_prelim:data_ready:2026-06-12:all_locations`.
- Deployed runtime commit: `d758ecd`.
- VM deployment: fast-forwarded on `/opt/helioscta-platform`, unit files
  installed, and timer enabled on `2026-06-14 00:57 UTC`.
- Last VM verification: `2026-06-14 00:57 UTC`; service exited
  `status=0/SUCCESS`, upserted 24,180 partial current-day rows for operating
  date `2026-06-13`, and correctly skipped readiness because only 20 hours
  were present.
- Next scheduled run observed: `2026-06-14 01:13:38 UTC`.

Verification SQL for data-availability events:

```sql
SELECT
    dataset,
    source_system,
    availability_type,
    business_date,
    scope,
    grain,
    completeness_status,
    row_count,
    entity_count,
    period_count,
    created_at
FROM ops.data_availability_events
WHERE dataset = 'isone_rt_hrl_lmps_prelim'
ORDER BY created_at DESC
LIMIT 10;
```

## helios-isone-hourly-system-demand

- Status: deployed; timer enabled and latest VM run succeeded.
- Workflow: ISO-NE Hourly System Demand orchestration.
- Runtime module: `backend.orchestration.power.isone.hourly_system_demand`.
- Lower-level scrape module: `backend.scrapes.power.isone.hourly_system_demand`.
- Source system: ISO-NE ISO Express `Real-Time Hourly System Load Report`.
- Destination table: `isone.hourly_system_demand`.
- API telemetry: `ops.api_fetch_log`.
- Data readiness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-isone-hourly-system-demand.service`
  - `infrastructure/systemd/helios-isone-hourly-system-demand.timer`
- Schedule: daily at `06:10 UTC` with `RandomizedDelaySec=5min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-isone-hourly-system-demand.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Application DDL applied locally on `2026-06-13`.
- Manual verification: `2026-06-13`; conda env
  `helioscta-platform-backend` ran the orchestration for operating date
  `2026-06-12`, upserted 24 rows, and emitted
  `isone_hourly_system_demand:data_ready:2026-06-12:system`.
- Deployed runtime commit: `c6b42d9`.
- VM deployment: fast-forwarded on `/opt/helioscta-platform`, unit files
  installed, and timer enabled on `2026-06-14 01:12 UTC`.
- Last VM verification: `2026-06-14 01:12 UTC`; service exited
  `status=0/SUCCESS`, upserted 24 rows for operating date `2026-06-12`,
  and observed existing readiness event
  `isone_hourly_system_demand:data_ready:2026-06-12:system`.
- Next scheduled run observed: `2026-06-14 06:11:24 UTC`.

## helios-isone-da-hrl-cleared-demand

- Status: deployed; timer enabled and latest VM run succeeded.
- Workflow: ISO-NE Day-Ahead Hourly Cleared Demand orchestration.
- Runtime module: `backend.orchestration.power.isone.da_hrl_cleared_demand`.
- Lower-level scrape module: `backend.scrapes.power.isone.da_hrl_cleared_demand`.
- Source system: ISO-NE ISO Express `Day-Ahead Hourly Cleared Demand Report`.
- Destination table: `isone.da_hrl_cleared_demand`.
- API telemetry: `ops.api_fetch_log`.
- Data readiness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-isone-da-hrl-cleared-demand.service`
  - `infrastructure/systemd/helios-isone-da-hrl-cleared-demand.timer`
- Schedule: daily at `17:20 UTC` with `RandomizedDelaySec=5min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-isone-da-hrl-cleared-demand.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Application DDL applied locally on `2026-06-13`.
- Manual verification: `2026-06-13`; conda env
  `helioscta-platform-backend` ran the orchestration for operating date
  `2026-06-13`, upserted 24 rows, and emitted
  `isone_da_hrl_cleared_demand:data_ready:2026-06-13:system`.
- Deployed runtime commit: `c6b42d9`.
- VM deployment: fast-forwarded on `/opt/helioscta-platform`, unit files
  installed, and timer enabled on `2026-06-14 01:12 UTC`.
- Last VM verification: `2026-06-14 01:12 UTC`; service exited
  `status=0/SUCCESS`, upserted 24 rows for operating date `2026-06-13`,
  and observed existing readiness event
  `isone_da_hrl_cleared_demand:data_ready:2026-06-13:system`.
- Next scheduled run observed: `2026-06-14 17:23:33 UTC`.

Verification SQL for ISO-NE demand readiness:

```sql
SELECT
    dataset,
    source_system,
    availability_type,
    business_date,
    scope,
    grain,
    completeness_status,
    row_count,
    entity_count,
    period_count,
    created_at
FROM ops.data_availability_events
WHERE dataset IN (
    'isone_hourly_system_demand',
    'isone_da_hrl_cleared_demand'
)
ORDER BY created_at DESC
LIMIT 10;
```

## helios-isone-forecast-batch

- Status: deployed; timer enabled and latest VM run succeeded.
- Workflow: ISO-NE Forecast Batch orchestration.
- Runtime module: `backend.orchestration.power.isone.forecast_batch`.
- Shared scrape module: `backend.scrapes.power.isone.forecast_feeds`.
- Source system: ISO-NE ISO Express forecast CSV reports.
- Destination tables:
  - `isone.three_day_reliability_region_demand_forecast`
  - `isone.seven_day_capacity_forecast`
  - `isone.seven_day_wind_forecast`
  - `isone.seven_day_solar_forecast`
- API telemetry: `ops.api_fetch_log`.
- Unit files:
  - `infrastructure/systemd/helios-isone-forecast-batch.service`
  - `infrastructure/systemd/helios-isone-forecast-batch.timer`
- Schedule: daily at `15:20 UTC` with `RandomizedDelaySec=5min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-isone-forecast-batch.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Application DDL applied locally on `2026-06-13`.
- Manual verification: `2026-06-13`; conda env
  `helioscta-platform-backend` ran the batch for report date `2026-06-13`,
  upserted 2,632 regional demand forecast rows, 6 capacity forecast rows,
  144 wind forecast rows, and 168 solar forecast rows. The four SQL
  duplicate-key tests passed.
- Deployed runtime commit: `16012dc`.
- VM deployment: fast-forwarded on `/opt/helioscta-platform`, unit files
  installed, and timer enabled on `2026-06-14 01:27 UTC`.
- Last VM verification: `2026-06-14 01:27 UTC`; service exited
  `status=0/SUCCESS` for all four feed pipelines with the same row counts as
  local verification.
- Next scheduled run observed: `2026-06-14 15:23:07 UTC`.
- Scope note: ISO-NE five-minute demand and zonal forecast feeds are
  intentionally excluded from this promotion.

Verification SQL for ISO-NE forecast API telemetry:

```sql
SELECT
    feed_name,
    status,
    http_status,
    rows_returned,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name IN (
    'three_day_reliability_region_demand_forecast',
    'seven_day_capacity_forecast',
    'seven_day_wind_forecast',
    'seven_day_solar_forecast'
)
ORDER BY created_at DESC
LIMIT 12;
```

Verification SQL for ISO-NE forecast table freshness:

```sql
SELECT
    'three_day_reliability_region_demand_forecast' AS feed_name,
    COUNT(*) AS rows,
    MAX(updated_at) AS latest_updated_at
FROM isone.three_day_reliability_region_demand_forecast
UNION ALL
SELECT
    'seven_day_capacity_forecast',
    COUNT(*),
    MAX(updated_at)
FROM isone.seven_day_capacity_forecast
UNION ALL
SELECT
    'seven_day_wind_forecast',
    COUNT(*),
    MAX(updated_at)
FROM isone.seven_day_wind_forecast
UNION ALL
SELECT
    'seven_day_solar_forecast',
    COUNT(*),
    MAX(updated_at)
FROM isone.seven_day_solar_forecast;
```

## helios-isone-rt-hrl-scheduled-interchange

- Status: deployed; timer enabled and latest VM run succeeded.
- Workflow: ISO-NE Real-Time Hourly Scheduled Interchange orchestration.
- Runtime module:
  `backend.orchestration.power.isone.rt_hrl_scheduled_interchange`.
- Lower-level scrape module:
  `backend.scrapes.power.isone.rt_hrl_scheduled_interchange`.
- Source system: ISO-NE ISO Express `Real-Time Market Actual Scheduled
  Interchange`.
- Destination table: `isone.rt_hrl_scheduled_interchange`.
- API telemetry: `ops.api_fetch_log`.
- Data readiness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-isone-rt-hrl-scheduled-interchange.service`
  - `infrastructure/systemd/helios-isone-rt-hrl-scheduled-interchange.timer`
- Schedule: daily at `06:25 UTC` with `RandomizedDelaySec=5min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-isone-rt-hrl-scheduled-interchange.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Application DDL applied locally on `2026-06-13`.
- Manual verification: `2026-06-13`; conda env
  `helioscta-platform-backend` ran the orchestration for local date
  `2026-06-12`, upserted 168 rows across 7 interfaces x 24 hours, and emitted
  `isone_rt_hrl_scheduled_interchange:data_ready:2026-06-12:all_interfaces`.
- Deployed runtime commit: `3a5c15c`.
- VM deployment: fast-forwarded on `/opt/helioscta-platform`, unit files
  installed, and timer enabled on `2026-06-14 01:58 UTC`.
- Last VM verification: `2026-06-14 01:58 UTC`; service exited
  `status=0/SUCCESS`, upserted 168 rows for local date `2026-06-12`,
  and observed existing readiness event
  `isone_rt_hrl_scheduled_interchange:data_ready:2026-06-12:all_interfaces`.
- Next scheduled run observed: `2026-06-14 06:26:45 UTC`.

## helios-isone-external-interface-metered-data

- Status: deployed; timer enabled and latest VM run succeeded.
- Workflow: ISO-NE External Interface Metered Data orchestration.
- Runtime module:
  `backend.orchestration.power.isone.external_interface_metered_data`.
- Lower-level scrape module:
  `backend.scrapes.power.isone.external_interface_metered_data`.
- Source system: ISO-NE ISO Express `External Interface Metered Data` annual
  XLSX workbook.
- Destination table: `isone.external_interface_metered_data`.
- API telemetry: `ops.api_fetch_log`.
- Data readiness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-isone-external-interface-metered-data.service`
  - `infrastructure/systemd/helios-isone-external-interface-metered-data.timer`
- Schedule: weekly on Mondays at `07:10 UTC` with
  `RandomizedDelaySec=10min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-isone-external-interface-metered-data.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Application DDL applied locally on `2026-06-14`.
- Manual verification: `2026-06-14`; conda env
  `helioscta-platform-backend` ran the orchestration for local dates
  `2026-01-01` through `2026-04-30`, upserted 23,032 rows across 8 entities,
  and emitted complete-date readiness events through `2026-04-30`.
- Deployed runtime commit: `b0b4263`.
- VM deployment: fast-forwarded on `/opt/helioscta-platform`, unit files
  installed, and timer enabled on `2026-06-14 04:00 UTC`.
- Last VM verification: `2026-06-14 04:00 UTC`; service exited
  `status=0/SUCCESS`, upserted 23,032 rows for workbook dates
  `2026-01-01` through `2026-04-30`, and observed existing readiness events.
- Next scheduled run observed: `2026-06-15 07:15:04 UTC`.

## ercot-settlement-point-prices

- Status: deployed; timer enabled and latest manual VM/timer run succeeded.
- Workflow: ERCOT RT Settlement Point Prices orchestration.
- Runtime module: `backend.orchestration.power.ercot.settlement_point_prices`.
- Lower-level scrape module:
  `backend.scrapes.power.ercot.settlement_point_prices`.
- Source system: ERCOT Public Reports `NP6-905-CD`.
- Report Type ID: `12301`.
- Destination table: `ercot.settlement_point_prices`.
- Default runtime scope: `HB_NORTH`, `HB_SOUTH`, `HB_WEST`, `HB_HOUSTON`.
- API telemetry: `ops.api_fetch_log`.
- Data readiness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-ercot-settlement-point-prices.service`
  - `infrastructure/systemd/helios-ercot-settlement-point-prices.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Journal logs: `journalctl -u helios-ercot-settlement-point-prices.service`.
- Schedule: every 15 minutes with `RandomizedDelaySec=2min`.
- Timer behavior: `Persistent=false`; missed intraday runs do not replay after
  VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-ercot-settlement-point-prices.lock`.
- Application DDL applied locally with `psql` on `2026-06-13`.
- Manual verification: `2026-06-13 17:02 UTC`; conda env
  `helioscta-platform-backend` ran the scrape for delivery date
  `2026-06-13`, upserted 188 hub rows across 47 published intervals, and wrote
  successful ERCOT API telemetry for all four hubs.
- Deployed runtime commit: `172be4d`.
- Deployment register finalized in a follow-up docs commit.
- VM deployment: working-tree overlay verified, committed, pushed, and
  fast-forwarded on `/opt/helioscta-platform` on `2026-06-13 17:35 UTC`.
- Last VM verification: `2026-06-13 17:31 UTC`; manual service run and first
  timer run exited `status=0/SUCCESS`, upserted 384 hub rows for complete
  delivery date `2026-06-12`, upserted 196 currently published hub rows for
  delivery date `2026-06-13`, observed existing readiness event
  `ercot_settlement_point_prices:data_ready:2026-06-12:hub`, and correctly
  skipped readiness for incomplete delivery date `2026-06-13`.
- Next scheduled run observed: `2026-06-13 17:46:55 UTC`.

## ercot-load-batch

- Status: deployed; timer enabled and latest manual VM run succeeded.
- Workflow: ERCOT load support scrape batch.
- Runtime module: `backend.orchestration.power.ercot.load_batch`.
- Lower-level scrape modules:
  - `backend.scrapes.power.ercot.actual_system_load`
  - `backend.scrapes.power.ercot.seven_day_load_forecast`
- Source systems:
  - ERCOT Public Reports `NP6-346-CD`, Actual System Load by Forecast Zone.
  - ERCOT Public Reports `NP3-565-CD`, Seven-Day Load Forecast by Model and
    Weather Zone.
- Destination tables:
  - `ercot.actual_system_load`
  - `ercot.seven_day_load_forecast`
- API telemetry: `ops.api_fetch_log`.
- Unit files:
  - `infrastructure/systemd/helios-ercot-load-batch.service`
  - `infrastructure/systemd/helios-ercot-load-batch.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Journal logs: `journalctl -u helios-ercot-load-batch.service`.
- Schedule: daily at `12:20 UTC` with `RandomizedDelaySec=10min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-ercot-load-batch.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Application DDL applied locally with `psql` on `2026-06-13`.
- Manual verification: `2026-06-13 17:48 UTC`; conda env
  `helioscta-platform-backend` ran `actual_system_load` for operating day
  `2026-06-12`, upserted 24 rows, ran `seven_day_load_forecast` for delivery
  date `2026-06-13`, upserted 4,344 rows, and wrote successful ERCOT API
  telemetry for both feeds.
- Deployed runtime commit: `1184fc0`.
- Last VM verification: `2026-06-13 17:50 UTC`; service exited
  `status=0/SUCCESS`, ran both load feeds, upserted 168 actual-load rows for
  complete operating days and 18,624 forecast rows for the seven-day forecast
  window, and reported `2 succeeded, 0 failed`.
- Next scheduled run observed: `2026-06-14 12:25:49 UTC`.

## helios-pjm-rt-hrl-lmps

- Status: deployed; timer enabled and scheduled VM run succeeded most recently
  on `2026-07-01 15:31 UTC`.
- Workflow: PJM verified hourly Real-Time LMP publication polling.
- Runtime module: `backend.orchestration.power.pjm.rt_hrl_lmps`.
- Lower-level scrape module: `backend.scrapes.power.pjm.rt_hrl_lmps`.
- Source system: PJM Data Miner 2 `rt_hrl_lmps`.
- Destination table: `pjm.rt_hrl_lmps`.
- API telemetry: `ops.api_fetch_log`.
- Unit files:
  - `infrastructure/systemd/helios-pjm-rt-hrl-lmps.service`
  - `infrastructure/systemd/helios-pjm-rt-hrl-lmps.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Journal logs: `journalctl -u helios-pjm-rt-hrl-lmps.service`.
- Schedule: business days at `11:30 America/New_York` with
  `RandomizedDelaySec=5min`, inside PJM's documented verified hourly RT
  posting window between `11 a.m.` and `12 p.m.` EPT.
- Polling policy: poll every `300` seconds for up to `5` hours until the
  target market date returns a complete hub hourly shape.
- Data readiness: emits
  `pjm_rt_hrl_lmps:data_ready:<business_date>:hub` after the scrape succeeds.
- Slack release notification: scheduled runs enqueue one durable outbox message
  to `#helios-alerts-power` with the single-day RT LMP report link; duplicates
  are suppressed by `(notification_key, channel_id)`.
- Latest VM verification: service exited `status=0/SUCCESS`, poll telemetry
  found target market date `2026-06-30` on attempt `1`, the scrape upserted
  `2,016` rows across recent posted market dates, emitted complete readiness
  event `pjm_rt_hrl_lmps:data_ready:2026-06-30:hub` with `288` rows, `12`
  hubs, and `24` periods, and sent Slack notification
  `pjm_rt_hrl_lmps:data_ready:2026-06-30:hub:slack:release` to
  `#helios-alerts-power` / `C0BEDBTAL2H` on attempt `1`.
- Timer behavior: `Persistent=true`; missed daily runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-rt-hrl-lmps.lock`.
- Safe rerun story: upsert on `(datetime_beginning_utc, pnode_id, pnode_name,
  row_is_current, version_nbr)`.

## helios-pjm-hourly-price-backfill-7-day

- Status: deployed; timer enabled and initial VM repair run succeeded.
- Workflow: PJM LMP price seven-day backfill repair.
- Runtime module:
  `backend.orchestration.power.pjm.hourly_price_backfill_7_day`.
- Backfill modules:
  - `backend.backfills.power.pjm.da_hrl_lmps`
  - `backend.backfills.power.pjm.rt_hrl_lmps`
  - `backend.backfills.power.pjm.rt_unverified_hrl_lmps`
  - `backend.orchestration.power.pjm.rt_fivemin_hrl_lmps` via the repair
    workflow adapter.
- Source system: PJM Data Miner 2 LMP feeds.
- Destination tables:
  - `pjm.da_hrl_lmps`
  - `pjm.rt_hrl_lmps`
  - `pjm.rt_fivemin_hrl_lmps`
  - `pjm.rt_unverified_hrl_lmps`
- API telemetry: `ops.api_fetch_log` with `run_mode=backfill` metadata.
- Data readiness: the verified RT five-minute leg emits complete-day
  `ops.data_availability_events` through the existing orchestration path.
- Unit files:
  - `infrastructure/systemd/helios-pjm-hourly-price-backfill-7-day.service`
  - `infrastructure/systemd/helios-pjm-hourly-price-backfill-7-day.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Journal logs:
  `journalctl -u helios-pjm-hourly-price-backfill-7-day.service`.
- Schedule: daily at `02:00 America/New_York` with
  `RandomizedDelaySec=10min`.
- Timer behavior: `Persistent=true`; missed daily runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-hourly-price-backfill-7-day.lock`.
- Safe rerun story: each backfill uses the destination table's existing
  primary-key upsert.
- Repair windows:
  - DA hourly LMPs: current PJM market date through six days back.
  - Verified RT hourly LMPs: two market dates back through eight days back.
  - Verified RT five-minute HRL LMPs: two market dates back through eight days
    back.
  - Unverified RT hourly LMPs: prior market date through seven days back.
- Deployed commit: `09911a1`.
- Deployed at: `2026-06-29 15:15 UTC`.
- Latest VM verification: manual service run exited `status=0/SUCCESS` on
  `2026-06-29 15:20 UTC`; journal summary reported `4 succeeded, 0 failed`.
  The run upserted 2,016 DA hourly rows for `2026-06-23` through
  `2026-06-29`, 2,016 verified RT hourly rows for `2026-06-21` through
  `2026-06-27`, 84,672 verified RT five-minute HRL rows for `2026-06-21`
  through `2026-06-27`, and 6,765 unverified RT hourly rows for `2026-06-22`
  through `2026-06-28`.
- Next scheduled run observed: `2026-06-30 06:04:29 UTC`.
- Deployment note: prior VM untracked forecast files that conflicted with the
  fast-forward pull were preserved under
  `/tmp/helioscta-untracked-backup-20260629T142628Z`.

## pjm-data-miner-scrape-modules

- Status: deployed; daily batch timer enabled.
- Scope: promoted PJM Data Miner scrape modules under
  `backend.scrapes.power.pjm`; 23 support scrapes run through the shared batch
  after `da_hrl_lmps`, `rt_fivemin_hrl_lmps`, `rt_hrl_lmps`,
  `rt_unverified_hrl_lmps`, `gen_by_fuel`, `load_frcstd_7_day`,
  `hrl_load_prelim`, `hrl_dmd_bids`, `da_transconstraints`,
  `da_reserve_market_results`, `gen_outages_by_type`, and the four Operations
  Summary feeds were promoted to dedicated timers.
- Destination schema: `pjm`.
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Initial deployed commit: `5d4b10b0933a1b4df087cdb811b7e9e335433c3c`.
- Latest `gen_by_fuel` runtime commit: `88ed50a21270baf9da839fbe7afb17456bb3e2bb`.
- Latest `rt_and_self_ecomax` runtime commit:
  `e1ba0b8e9fd64a3b3bad456921c6f07e7dc03ab0`.
- Deployed by: Aidan Keaveny via Codex.
- Deployed at: `2026-06-13 02:17 UTC`.
- Verification: VM fast-forward pull succeeded, dependencies reinstalled, and
  a server-side import smoke check loaded all 31 PJM scrape modules.
- Unit files:
  - `infrastructure/systemd/helios-pjm-data-miner-batch.service`
  - `infrastructure/systemd/helios-pjm-data-miner-batch.timer`
- Schedule: daily at `04:30 UTC` with `RandomizedDelaySec=10min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-data-miner-batch.lock`.
- Runtime update: `gen_by_fuel` was promoted into the shared batch on
  `2026-06-30`. Production table and index DDL were applied, and an
  initial scrape populated `pjm.gen_by_fuel` with `570` rows across `10` fuel
  types through `2026-06-30 18:00 UTC`.
- Runtime change: `gen_by_fuel` is moved from the daily support batch into
  `backend.orchestration.power.pjm.hourly_bucket` so intraday fuel-mix rows
  refresh hourly through `helios-pjm-hourly-bucket.timer` after this repo
  update is deployed to the VM.
- VM verification: `/opt/helioscta-platform` fast-forwarded to `88ed50a` on
  `2026-06-30`; a transient systemd run of
  `backend.scrapes.power.pjm.gen_by_fuel` exited `status=0/SUCCESS` at
  `2026-06-30 14:12 UTC`. The `helios-pjm-data-miner-batch.timer` remained
  enabled with next run observed at `2026-07-01 04:31:14 UTC`.
- Runtime update: `rt_and_self_ecomax` was promoted into the shared batch on
  `2026-06-30`. Production table and index DDL were applied, and an
  initial VM scrape populated `pjm.rt_and_self_ecomax` with `48` rows for
  `2026-06-27 00:00` through `2026-06-28 23:00` EPT. The source returned no
  rows yet for the `2026-06-29` and `2026-06-30` EPT windows during the
  `2026-06-30 14:51 UTC` smoke run.
- VM verification: `/opt/helioscta-platform` fast-forwarded to `e1ba0b8` on
  `2026-06-30`; a transient systemd run of
  `backend.scrapes.power.pjm.rt_and_self_ecomax` exited `status=0/SUCCESS` at
  `2026-06-30 14:51 UTC`. Read-only verification found `48` table rows, zero
  duplicate `datetime_beginning_utc` keys, and `4` successful
  `ops.api_fetch_log` rows for run ID
  `8bd9992a-8c62-48bb-8ea4-f8cfd9df8a66`.
- Runtime change: `hrl_load_prelim` is moved from the early daily support batch
  into `helios-pjm-hrl-load-prelim.timer` so the scrape runs after PJM Data
  Miner's documented `04:55 a.m.` EPT source availability instead of the
  previous `04:30 UTC` support-batch window.
- Scheduling posture: the batch keeps the non-priority support scrape tables
  fresh daily. `helios-pjm-da-hrl-lmps.timer` and
  `helios-pjm-rt-fivemin-hrl-lmps.timer` remain separate because those price
  workflows emit data-readiness events. `helios-pjm-rt-hrl-lmps.timer` runs
  later because verified hourly RT LMPs post after the early support batch.
  `helios-pjm-hourly-bucket.timer` runs hourly because unverified RT hourly
  prices and generation-by-fuel rows update throughout the operating day; this
  bucket is the extension point for other PJM feeds with the same cadence and
  safe rerun shape.
  `helios-pjm-hrl-load-prelim.timer` runs after the preliminary-load source's
  morning publication window because the early support batch can return empty
  newest-day responses before PJM publishes the feed.
  `helios-pjm-load-frcstd-7-day.timer` remains separate because the forecast
  source posts hourly and drives the forecast dashboard.
  `helios-pjm-hrl-dmd-bids.timer` remains separate because the demand-bid feed
  needs same-afternoon publication polling after the DA LMP timer starts.
  `helios-pjm-da-reserve-market-results.timer` remains separate because the
  day-ahead ancillary service market results post after the early support batch
  and need a post-publication retry window.
  `helios-pjm-gen-outages-by-type.timer` runs later because the source was
  observed unavailable at the early `04:30 UTC` batch but available during a
  manual `13:55 UTC` VM run.
  `helios-pjm-ops-sum.timer` runs after the source's 05:00-08:00 EPT refresh
  window because these feeds are frontend dashboard context.

## helios-pjm-hourly-bucket

- Status: deployed on `helioscta-prod-vm-01`; timer enabled, old
  `helios-pjm-rt-unverified-hrl-lmps.timer` disabled, and manual VM smoke run
  succeeded on `2026-06-30 17:20 UTC`.
- Workflow: PJM hourly scrape bucket.
- Runtime module:
  `backend.orchestration.power.pjm.hourly_bucket`.
- Bucket members:
  `backend.orchestration.power.pjm.rt_unverified_hrl_lmps`, which calls lower
  level scrape module `backend.scrapes.power.pjm.rt_unverified_hrl_lmps`, and
  `backend.orchestration.power.pjm.gen_by_fuel`, which calls lower level
  scrape module `backend.scrapes.power.pjm.gen_by_fuel`.
- Source systems: PJM Data Miner 2 `rt_unverified_hrl_lmps` and
  `gen_by_fuel`.
- Destination tables: `pjm.rt_unverified_hrl_lmps` and `pjm.gen_by_fuel`.
- Source grains: `datetime_beginning_utc x pnode_name x type` for
  `rt_unverified_hrl_lmps`; `datetime_beginning_utc x fuel_type` for
  `gen_by_fuel`.
- API telemetry: `ops.api_fetch_log`.
- Unit files:
  - `infrastructure/systemd/helios-pjm-hourly-bucket.service`
  - `infrastructure/systemd/helios-pjm-hourly-bucket.timer`
- Schedule: hourly at minute `15` UTC with `Persistent=false` and
  `RandomizedDelaySec=2min`.
- Latest VM verification: bucket service exited `status=0/SUCCESS`; latest
  `rt_unverified_hrl_lmps` telemetry rows use scheduler
  `helios-pjm-hourly-bucket.timer` with `bucket=pjm_hourly_bucket` and
  `bucket_feed=rt_unverified_hrl_lmps`. After deploying the `2026-07-01`
  runtime update, verify latest `gen_by_fuel` telemetry has the same scheduler
  and `bucket_feed=gen_by_fuel`.
- Retired units:
  `helios-pjm-rt-unverified-hrl-lmps.service` and
  `helios-pjm-rt-unverified-hrl-lmps.timer`.
- Timer behavior: missed hourly starts do not replay after VM downtime; the
  bucket should contain only feeds that pull a rolling recent window or current
  snapshot. The nightly price repair covers recent posted LMP market dates.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-hourly-bucket.lock`.
- Safe rerun story: upsert on
  `(datetime_beginning_utc, pnode_name, type)` for `rt_unverified_hrl_lmps`
  and `(datetime_beginning_utc, fuel_type)` for `gen_by_fuel`.

Verification SQL for table freshness:

```sql
SELECT
    datetime_beginning_ept::date AS market_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT pnode_name) AS nodes,
    MIN(datetime_beginning_ept) AS min_ept,
    MAX(datetime_beginning_ept) AS max_ept,
    MAX(updated_at) AS latest_updated_at
FROM pjm.rt_unverified_hrl_lmps
GROUP BY datetime_beginning_ept::date
ORDER BY market_date DESC
LIMIT 10;
```

Verification SQL for `gen_by_fuel` freshness:

```sql
SELECT
    datetime_beginning_ept::date AS operating_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT datetime_beginning_utc) AS hours,
    COUNT(DISTINCT fuel_type) AS fuel_types,
    MIN(datetime_beginning_ept) AS min_ept,
    MAX(datetime_beginning_ept) AS max_ept,
    MAX(updated_at) AS latest_updated_at
FROM pjm.gen_by_fuel
GROUP BY datetime_beginning_ept::date
ORDER BY operating_date DESC
LIMIT 10;
```

Verification SQL for API telemetry:

```sql
SELECT
    status,
    http_status,
    rows_returned,
    metadata,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name = 'rt_unverified_hrl_lmps'
ORDER BY created_at DESC
LIMIT 20;
```

Use `pipeline_name = 'gen_by_fuel'` for the generation-by-fuel hourly member.

## helios-pjm-hrl-load-prelim

- Status: promoted for VM deployment; timer should be enabled after pulling this
  repo update on `helioscta-prod-vm-01`.
- Workflow: PJM hourly preliminary load refresh.
- Runtime module: `backend.scrapes.power.pjm.hrl_load_prelim`.
- Source system: PJM Data Miner 2 `hrl_load_prelim`.
- Destination table: `pjm.hrl_load_prelim`.
- API telemetry: `ops.api_fetch_log`.
- Unit files:
  - `infrastructure/systemd/helios-pjm-hrl-load-prelim.service`
  - `infrastructure/systemd/helios-pjm-hrl-load-prelim.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Journal logs: `journalctl -u helios-pjm-hrl-load-prelim.service`.
- Schedule: daily at `05:05 America/New_York` with `AccuracySec=1min`, ten
  minutes after PJM Data Miner's documented `04:55 a.m.` EPT update
  availability.
- Timer behavior: `Persistent=true`; missed daily runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-hrl-load-prelim.lock`.
- Safe rerun story: lower-level scrape upserts on
  `(datetime_beginning_utc, load_area)` and uses a rolling default lookback.
- Deploy commands:
  ```bash
  sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-hrl-load-prelim.service /etc/systemd/system/
  sudo cp /opt/helioscta-platform/infrastructure/systemd/helios-pjm-hrl-load-prelim.timer /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now helios-pjm-hrl-load-prelim.timer
  sudo systemctl start helios-pjm-hrl-load-prelim.service
  ```
- Immediate gap repair for July 5 preliminary load:
  ```bash
  cd /opt/helioscta-platform
  sudo -u helios -H /opt/helioscta-platform/.venv/bin/python - <<'PY'
  from backend.backfills.power.pjm.hrl_load_prelim import main
  print(main(start_date="2026-07-05", end_date="2026-07-05"))
  PY
  ```
- Verification SQL:
  ```sql
  SELECT
      datetime_beginning_ept::date AS operating_date,
      COUNT(*) AS rows,
      COUNT(DISTINCT load_area) AS load_areas,
      COUNT(DISTINCT datetime_beginning_ept) AS hours,
      MAX(updated_at) AS updated_at
  FROM pjm.hrl_load_prelim
  WHERE datetime_beginning_ept::date >= CURRENT_DATE - INTERVAL '3 days'
  GROUP BY 1
  ORDER BY 1 DESC;
  ```

## helios-pjm-hrl-dmd-bids

- Status: deployed on `helioscta-prod-vm-01`; timer enabled and manual VM smoke
  succeeded.
- Workflow: PJM hourly demand bid refresh.
- Runtime module: `backend.orchestration.power.pjm.hrl_dmd_bids`.
- Lower-level scrape module: `backend.scrapes.power.pjm.hrl_dmd_bids`.
- Source system: PJM Data Miner 2 `hrl_dmd_bids`.
- Destination table: `pjm.hrl_dmd_bids`.
- Source grain: `datetime_beginning_utc x datetime_beginning_ept x area`.
- API telemetry: `ops.api_fetch_log`.
- Unit files:
  - `infrastructure/systemd/helios-pjm-hrl-dmd-bids.service`
  - `infrastructure/systemd/helios-pjm-hrl-dmd-bids.timer`
- Schedule: daily at `17:00 UTC`, 90 minutes after
  `helios-pjm-da-hrl-lmps.timer`, with `Persistent=true`.
- Polling policy: poll every `120` seconds for up to `4` hours until the
  target market day has complete rows for `PJM_RTO`, `MID_ATLANTIC_REGION`,
  and `WESTERN_REGION`.
- Timer behavior: missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-hrl-dmd-bids.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Safe rerun story: upsert on
  `(datetime_beginning_utc, datetime_beginning_ept, area)`.
- Deployed commit: `9ca22e9` (`Schedule PJM hourly demand bids polling`).
- Production timer: `helios-pjm-hrl-dmd-bids.timer` enabled and active/waiting;
  next scheduled run observed as `2026-06-30 17:00:00 UTC`.
- Manual VM verification on `2026-06-29 19:15 UTC`: service completed
  successfully for target market date `2026-06-30`, journal reported `72` rows
  upserted into `pjm.hrl_dmd_bids`, table freshness query returned `72` rows
  across `3` areas for `2026-06-30`, and `ops.api_fetch_log.id = 101044`
  recorded `status = success`, `rows_returned = 72`, `poll_count = 1`.

Verification SQL for table freshness:

```sql
SELECT
    datetime_beginning_ept::date AS market_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT area) AS areas,
    MIN(datetime_beginning_ept) AS min_ept,
    MAX(datetime_beginning_ept) AS max_ept,
    MAX(updated_at) AS latest_updated_at
FROM pjm.hrl_dmd_bids
GROUP BY datetime_beginning_ept::date
ORDER BY market_date DESC
LIMIT 10;
```

Verification SQL for API telemetry:

```sql
SELECT
    provider,
    operation_name,
    status,
    http_status,
    rows_returned,
    metadata,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name = 'hrl_dmd_bids'
ORDER BY created_at DESC
LIMIT 20;
```

## helios-pjm-da-transconstraints

- Status: deployed on `helioscta-prod-vm-01`; timer enabled.
- Workflow: PJM day-ahead transmission constraints refresh.
- Runtime module: `backend.orchestration.power.pjm.da_transconstraints`.
- Lower-level scrape module: `backend.scrapes.power.pjm.da_transconstraints`.
- Source system: PJM Data Miner 2 `da_transconstraints`.
- Destination table: `pjm.da_transconstraints`.
- Source grain:
  `datetime_beginning_utc x day_ahead_congestion_event x monitored_facility x contingency_facility`.
- API telemetry: `ops.api_fetch_log`.
- Unit files:
  - `infrastructure/systemd/helios-pjm-da-transconstraints.service`
  - `infrastructure/systemd/helios-pjm-da-transconstraints.timer`
- Schedule: daily at `17:00 UTC`, matching
  `helios-pjm-hrl-dmd-bids.timer`, with `Persistent=true`.
- Polling policy: poll every `120` seconds for up to `4` hours until the
  target market day returns normalized constraint rows with no duplicate
  primary keys.
- Timer behavior: missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-da-transconstraints.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Safe rerun story: upsert on
  `(datetime_beginning_utc, day_ahead_congestion_event, monitored_facility, contingency_facility)`.

Verification SQL for table freshness:

```sql
SELECT
    datetime_beginning_ept::date AS market_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT day_ahead_congestion_event) AS congestion_events,
    MIN(datetime_beginning_ept) AS min_ept,
    MAX(datetime_beginning_ept) AS max_ept,
    MAX(updated_at) AS latest_updated_at
FROM pjm.da_transconstraints
GROUP BY datetime_beginning_ept::date
ORDER BY market_date DESC
LIMIT 10;
```

Verification SQL for API telemetry:

```sql
SELECT
    provider,
    operation_name,
    status,
    http_status,
    rows_returned,
    metadata,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name = 'da_transconstraints'
ORDER BY created_at DESC
LIMIT 20;
```

## helios-pjm-da-reserve-market-results

- Status: production DDL applied and initial local scrape succeeded; timer
  unit is promoted for VM deployment.
- Workflow: PJM Day-Ahead Ancillary Service Market Results orchestration.
- Runtime module:
  `backend.orchestration.power.pjm.da_reserve_market_results`.
- Lower-level scrape module:
  `backend.scrapes.power.pjm.da_reserve_market_results`.
- Source system: PJM Data Miner 2 `da_reserve_market_results`.
- Destination table: `pjm.da_reserve_market_results`.
- Source grain: `datetime_beginning_utc x locale x service`.
- API telemetry: `ops.api_fetch_log`.
- Data readiness output: `ops.data_availability_events`.
- Release notification output: `ops.slack_notification_outbox`.
- Unit files:
  - `infrastructure/systemd/helios-pjm-da-reserve-market-results.service`
  - `infrastructure/systemd/helios-pjm-da-reserve-market-results.timer`
- Schedule: daily at `13:45 America/New_York` with `Persistent=true`,
  `AccuracySec=1min`, and `RandomizedDelaySec=2min`.
- Timer behavior: missed runs fire after VM downtime. The orchestration polls
  every two minutes for up to four hours, and safe reruns upsert on the source
  primary key.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-da-reserve-market-results.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Application DDL applied locally on `2026-07-01`.
- Initial local scrape verification on `2026-07-01`: run ID
  `9220dd85-5f87-48b3-a534-77dd4f4dadf1` upserted `1,320` rows covering
  `2026-06-21 00:00` through `2026-07-01 23:00` EPT, across `2` locales and
  `3` services, with zero duplicate primary-key groups.
- Polling orchestration update: scheduled runtime now waits for a complete
  current PJM/Eastern market-date publication, emits
  `pjm_da_reserve_market_results:data_ready:<YYYY-MM-DD>:locale_service`, and
  queues one Slack release alert keyed by that readiness event.
- Production hotfix on `2026-07-01 19:29 UTC`: VM runtime was missing
  `backend.scrapes.power.pjm.da_reserve_market_results` and the matching
  `FEED_CONFIGS["da_reserve_market_results"]` entry. Copied the missing scrape
  module, inserted the feed config, changed the orchestrator default from the
  unavailable next market day to the current PJM/Eastern market date, and
  reran `helios-pjm-da-reserve-market-results.service`. The service exited
  `status=0/SUCCESS`, upserted `120` rows for `2026-07-01`, created readiness
  event `pjm_da_reserve_market_results:data_ready:2026-07-01:locale_service`,
  and sent Slack notification
  `pjm_da_reserve_market_results:data_ready:2026-07-01:locale_service:slack:release`
  to `#helios-alerts-power` / `C0BEDBTAL2H` on attempt `1`.

Verification SQL for table freshness:

```sql
SELECT
    datetime_beginning_ept::date AS market_date,
    COUNT(*) AS rows,
    COUNT(DISTINCT locale) AS locales,
    COUNT(DISTINCT service) AS services,
    MIN(datetime_beginning_ept) AS min_ept,
    MAX(datetime_beginning_ept) AS max_ept,
    MAX(updated_at) AS latest_updated_at
FROM pjm.da_reserve_market_results
GROUP BY datetime_beginning_ept::date
ORDER BY market_date DESC
LIMIT 10;
```

Verification SQL for API telemetry:

```sql
SELECT
    provider,
    operation_name,
    status,
    http_status,
    rows_returned,
    metadata,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name = 'da_reserve_market_results'
ORDER BY created_at DESC
LIMIT 20;
```

Verification SQL for data-availability events:

```sql
SELECT
    dataset,
    source_system,
    availability_type,
    business_date,
    scope,
    grain,
    completeness_status,
    row_count,
    entity_count,
    period_count,
    created_at
FROM ops.data_availability_events
WHERE dataset = 'pjm_da_reserve_market_results'
ORDER BY created_at DESC
LIMIT 10;
```

Verification SQL for Slack release notifications:

```sql
SELECT
    notification_key,
    channel_id,
    channel_name,
    status,
    attempts,
    next_attempt_at,
    sent_at,
    created_at
FROM ops.slack_notification_outbox
WHERE dataset = 'pjm_da_reserve_market_results'
ORDER BY created_at DESC
LIMIT 10;
```

## helios-pjm-ops-sum

- Status: deployed; timer enabled, manual VM scrape succeeded, and historical
  backfill completed.
- Workflow: PJM Operations Summary refresh.
- Runtime module: `backend.orchestration.power.pjm.ops_sum`.
- Lower-level scrape modules:
  - `backend.scrapes.power.pjm.ops_sum_frcstd_tran_lim`
  - `backend.scrapes.power.pjm.ops_sum_frcst_peak_area`
  - `backend.scrapes.power.pjm.ops_sum_frcst_peak_rto`
  - `backend.scrapes.power.pjm.ops_sum_prev_period`
  - `backend.scrapes.power.pjm.ops_sum_prjctd_tie_flow`
- Source system: PJM Data Miner 2 Operations Summary feeds.
- Destination tables:
  - `pjm.ops_sum_frcstd_tran_lim`
  - `pjm.ops_sum_frcst_peak_area`
  - `pjm.ops_sum_frcst_peak_rto`
  - `pjm.ops_sum_prev_period`
  - `pjm.ops_sum_prjctd_tie_flow`
- API telemetry: `ops.api_fetch_log`.
- Unit files:
  - `infrastructure/systemd/helios-pjm-ops-sum.service`
  - `infrastructure/systemd/helios-pjm-ops-sum.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Journal logs: `journalctl -u helios-pjm-ops-sum.service`.
- VM deployment: fast-forwarded on `/opt/helioscta-platform`, dependencies
  reinstalled, unit files copied to `/etc/systemd/system/`, and
  `helios-pjm-ops-sum.timer` enabled on `2026-06-29`.
- Last VM verification: manual service run exited `status=0/SUCCESS` at
  `2026-06-29 15:32 UTC`; production health-check service exited
  `status=0/SUCCESS` at `2026-06-29 15:35 UTC`.
- Historical backfill coverage: `ops_sum_frcstd_tran_lim` `27,058` rows,
  `ops_sum_frcst_peak_area` `56,221` rows, `ops_sum_frcst_peak_rto` `5,421`
  rows, `ops_sum_prev_period` `1,088,852` rows, and
  `ops_sum_prjctd_tie_flow` `108,360` rows.
- Schedule: daily at `05:05`, `06:05`, `07:05`, and
  `08:05 America/New_York` with `Persistent=true` and `AccuracySec=1min`.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-ops-sum.lock`.
- Safe rerun story: each feed upserts by projected or operating interval plus
  its source dimension. `generated_at_ept` is retained as the PJM source
  freshness timestamp, and later 05:05-08:05 EPT runs overwrite the same
  current-day rows when PJM refreshes them.
- Historical shape note: `ops_sum_prev_period` is sparse peak/valley history
  before `2017-05-31`; complete hourly-by-area rows begin `2017-05-31`.
- Post-run smoke SQL:

```sql
SELECT 'ops_sum_frcstd_tran_lim' AS table_name, COUNT(*) AS rows, MAX(generated_at_ept) AS latest_generated
FROM pjm.ops_sum_frcstd_tran_lim
UNION ALL
SELECT 'ops_sum_frcst_peak_area', COUNT(*), MAX(generated_at_ept)
FROM pjm.ops_sum_frcst_peak_area
UNION ALL
SELECT 'ops_sum_frcst_peak_rto', COUNT(*), MAX(generated_at_ept)
FROM pjm.ops_sum_frcst_peak_rto
UNION ALL
SELECT 'ops_sum_prev_period', COUNT(*), MAX(generated_at_ept)
FROM pjm.ops_sum_prev_period
UNION ALL
SELECT 'ops_sum_prjctd_tie_flow', COUNT(*), MAX(generated_at_ept)
FROM pjm.ops_sum_prjctd_tie_flow;

SELECT
    pipeline_name,
    status,
    rows_returned,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name LIKE 'ops_sum_%'
ORDER BY created_at DESC
LIMIT 20;
```

## helios-pjm-gen-outages-by-type

- Status: deployed; timer enabled and manual VM run succeeded.
- Workflow: PJM Generation Outage for Seven Days by Type refresh.
- Runtime module: `backend.scrapes.power.pjm.gen_outages_by_type`.
- Source system: PJM Data Miner 2 `gen_outages_by_type`.
- Destination table: `pjm.gen_outages_by_type`.
- API telemetry: `ops.api_fetch_log`.
- Unit files:
  - `infrastructure/systemd/helios-pjm-gen-outages-by-type.service`
  - `infrastructure/systemd/helios-pjm-gen-outages-by-type.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Journal logs: `journalctl -u helios-pjm-gen-outages-by-type.service`.
- Schedule: daily at `06:05`, `06:30`, and `07:00 America/New_York` with
  `AccuracySec=1min`, targeting 5, 30, and 60 minutes after PJM Data Miner's
  documented `06:00 a.m.` EPT update availability. During daylight saving time
  this is `10:05`, `10:30`, and `11:00 UTC`; during standard time this is
  `11:05`, `11:30`, and `12:00 UTC`.
- Timer behavior: `Persistent=true`; missed daily runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-gen-outages-by-type.lock`.
- Safe rerun story: upsert on `(forecast_execution_date_ept, forecast_date,
  region)`.
- Manual verification: `2026-06-18 13:55 UTC`; VM service run exited
  `status=0/SUCCESS`, upserted 21 rows for execution date `2026-06-18`, and
  refreshed the outage dashboard source after the early batch missed the
  morning publication.

## helios-pjm-load-frcstd-7-day

- Status: retired after promotion of combined
  `helios-pjm-forecast-hourly.timer`; keep the lower-level orchestration module
  for manual reruns, but do not keep this timer enabled with the combined job.
- Workflow: PJM Seven-Day Load Forecast refresh.
- Runtime module: `backend.orchestration.power.pjm.load_frcstd_7_day`.
- Lower-level scrape module: `backend.scrapes.power.pjm.load_frcstd_7_day`.
- Source system: PJM Data Miner 2 `load_frcstd_7_day`.
- Destination table: `pjm.load_frcstd_7_day`.
- API telemetry: `ops.api_fetch_log`.
- Unit files:
  - `infrastructure/systemd/helios-pjm-load-frcstd-7-day.service`
  - `infrastructure/systemd/helios-pjm-load-frcstd-7-day.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Journal logs: `journalctl -u helios-pjm-load-frcstd-7-day.service`.
- Schedule: hourly at minute `25` UTC with `RandomizedDelaySec=3min`.
- Timer behavior: `Persistent=false`; missed hourly current-snapshot runs do
  not replay after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-load-frcstd-7-day.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Safe rerun story: upsert on `(evaluated_at_datetime_utc,
  forecast_datetime_beginning_utc, forecast_area)`.
- Deployed commit: `6c9fdeb`.
- VM deployment: fast-forwarded on `/opt/helioscta-platform`, unit files
  installed, and timer enabled on `2026-06-17 12:17 UTC`.
- Local manual verification: `2026-06-17 06:15 MDT`; orchestration module
  upserted 4,200 rows into `pjm.load_frcstd_7_day`.
- Last VM manual verification: `2026-06-17 12:16 UTC`; service exited
  `status=0/SUCCESS` and upserted 4,200 rows.
- First timer verification: `2026-06-17 12:26 UTC`; timer-triggered service
  run exited `status=0/SUCCESS` and upserted 4,200 rows.
- Next scheduled run observed: `2026-06-17 13:26:03 UTC`.

Verification SQL for table freshness:

```sql
SELECT
    COUNT(*) AS rows,
    MAX(evaluated_at_datetime_ept) AS latest_evaluated_at_ept,
    MAX(updated_at) AS latest_updated_at
FROM pjm.load_frcstd_7_day;
```

Verification SQL for API telemetry:

```sql
SELECT
    provider,
    operation_name,
    status,
    http_status,
    rows_returned,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name = 'load_frcstd_7_day'
ORDER BY created_at DESC
LIMIT 10;
```

## helios-pjm-forecast-hourly

- Status: promoted; source tables created and local manual run succeeded, but
  VM timer state must be verified after install.
- Workflow: PJM Data Miner hourly load, solar, and wind forecast refresh.
- Runtime module: `backend.orchestration.power.pjm.forecast_hourly`.
- Lower-level scrape modules:
  - `backend.scrapes.power.pjm.load_frcstd_7_day`
  - `backend.scrapes.power.pjm.hourly_solar_power_forecast`
  - `backend.scrapes.power.pjm.hourly_wind_power_forecast`
- Source system: PJM Data Miner 2 `load_frcstd_7_day`,
  `hourly_solar_power_forecast`, and `hourly_wind_power_forecast`.
- Destination tables:
  - `pjm.load_frcstd_7_day`
  - `pjm.hourly_solar_power_forecast`
  - `pjm.hourly_wind_power_forecast`
- Source grain:
  - `load_frcstd_7_day`: `(evaluated_at_datetime_utc,
    forecast_datetime_beginning_utc, forecast_area)`
  - renewable feeds: `(evaluated_at_utc, datetime_beginning_utc)`
- API telemetry: `ops.api_fetch_log`.
- Unit files:
  - `infrastructure/systemd/helios-pjm-forecast-hourly.service`
  - `infrastructure/systemd/helios-pjm-forecast-hourly.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Journal logs: `journalctl -u helios-pjm-forecast-hourly.service`.
- Schedule: hourly at minute `35` UTC with `RandomizedDelaySec=3min`.
- Timer behavior: `Persistent=false`; missed hourly forecast runs do not
  replay after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-forecast-hourly.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Safe rerun story: upsert on each feed's source primary key.
- Local manual verification: `2026-06-18 15:43 UTC`; orchestration module
  processed 4,200 load rows, 1,704 solar rows, and 9,677 wind rows into Azure
  Postgres when run as separate predecessor jobs.

Verification SQL for table freshness:

```sql
SELECT
    'load' AS feed,
    COUNT(*) AS rows,
    MAX(evaluated_at_datetime_ept) AS latest_evaluated_at_ept,
    MAX(forecast_datetime_beginning_ept) AS latest_forecast_hour_ept,
    MAX(updated_at) AS latest_updated_at
FROM pjm.load_frcstd_7_day
UNION ALL
SELECT
    'solar' AS feed,
    COUNT(*) AS rows,
    MAX(evaluated_at_ept) AS latest_evaluated_at_ept,
    MAX(datetime_beginning_ept) AS latest_forecast_hour_ept,
    MAX(updated_at) AS latest_updated_at
FROM pjm.hourly_solar_power_forecast
UNION ALL
SELECT
    'wind' AS feed,
    COUNT(*) AS rows,
    MAX(evaluated_at_ept) AS latest_evaluated_at_ept,
    MAX(datetime_beginning_ept) AS latest_forecast_hour_ept,
    MAX(updated_at) AS latest_updated_at
FROM pjm.hourly_wind_power_forecast;
```

## helios-pjm-meteologica-forecast-hourly

- Status: deployed and enabled on `helioscta-prod-vm-01`.
- Deployed commit: `4329a189d38443b623bf17cafbf1dc8e2cef1321`.
- Deployment verification: manual systemd service run succeeded on
  2026-06-18 at 17:06 UTC, upserting 4,116 rows and emitting API telemetry plus
  a forecast freshness event. On 2026-06-30 at 17:13 UTC, the same service was
  updated and manually verified to run both the 12 load/solar/wind forecast
  content IDs and the DA price content IDs `4397` and `4400`; all Meteologica
  API fetch telemetry rows were successful. On 2026-06-30 at 17:37 UTC, the
  DA price leg was updated to enforce the 14-day forward horizon; the service
  purged 11 deterministic out-of-horizon rows and left zero out-of-horizon rows
  in both DA price source tables. Timer enabled with next scheduled run visible
  in `systemctl list-timers`.
- Workflow: PJM Meteologica forecast refresh, including hourly load/solar/wind
  forecasts and Western Hub DA price forecasts.
- Runtime module: `backend.orchestration.power.pjm.meteologica_forecast_hourly`.
- Lower-level scrape modules:
  - `backend.scrapes.power.pjm.meteologica_forecast_hourly`
  - `backend.scrapes.power.pjm.meteologica_da_price_forecast`
- Source system: Meteologica xTraders Markets API `contents/{content_id}/data`.
- Destination tables:
  - `meteologica.pjm_forecast_hourly`
  - `meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly`
  - `meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly`
- Source grain: `content_id x update_id x forecast_period_start`.
- Metrics and areas: load, solar, and wind for `RTO`, `MIDATL`, `SOUTH`, and
  `WEST`; hydro is excluded from v1. DA price content IDs are `4397`
  deterministic Western Hub DA price and `4400` ECMWF ENS Western Hub DA price.
- API telemetry: `ops.api_fetch_log`.
- Data freshness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-pjm-meteologica-forecast-hourly.service`
  - `infrastructure/systemd/helios-pjm-meteologica-forecast-hourly.timer`
- Schedule: every 30 minutes at `:20` and `:50` UTC with
  `RandomizedDelaySec=2min`.
- Timer behavior: `Persistent=false`; current forecast snapshots should not
  replay after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-meteologica-forecast-hourly.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Required VM credentials:
  `XTRADERS_API_USERNAME_ISO` and `XTRADERS_API_PASSWORD_ISO` in
  `/etc/helioscta/backend.env`.
- Application DDL required before first run is managed outside this repo.
- Safe rerun story: upsert on
  `(content_id, update_id, forecast_period_start)`.
- Retention: 90 days by `issue_date` in the hot tables; the runtime purges
  older rows after successful upserts. DA price rows are also limited to 14
  days forward from each source issue timestamp in the source timezone.

Verification SQL for table freshness:

```sql
SELECT
    forecast_area,
    metric,
    COUNT(*) AS rows,
    COUNT(DISTINCT update_id) AS update_count,
    MAX(issue_date) AS latest_issue_date,
    MIN(forecast_period_start) AS min_forecast_period_start,
    MAX(forecast_period_start) AS max_forecast_period_start,
    MAX(updated_at) AS latest_updated_at
FROM meteologica.pjm_forecast_hourly
GROUP BY forecast_area, metric
ORDER BY forecast_area, metric;
```

Verification SQL for API telemetry:

```sql
SELECT
    provider,
    operation_name,
    content_id,
    feed_name,
    status,
    http_status,
    rows_returned,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name = 'pjm_meteologica_forecast_hourly'
ORDER BY created_at DESC
LIMIT 20;
```

## helios-pjm-meteologica-da-price-forecast

- Status: retired as a standalone timer on 2026-06-30 at 17:13 UTC; the DA
  price refresh is now run by `helios-pjm-meteologica-forecast-hourly.timer`
  with the other Meteologica forecasts.
- Deployed base commit: `f6b5b24`; runtime files were installed as a focused
  working-tree overlay because the local workspace had unrelated dirty changes.
- Deployment verification: production source-table DDL and indexes were applied
  on 2026-06-30. A local orchestration run at 16:53 UTC upserted 347
  deterministic rows and 138 ECMWF ENS rows. The VM systemd service run at
  16:55 UTC exited `status=0/SUCCESS`, upserted the same two source tables,
  wrote Meteologica API telemetry, and observed the existing forecast
  freshness event for the current issue.
- Workflow: PJM Meteologica Western Hub DA price forecast refresh.
- Runtime module:
  `backend.orchestration.power.pjm.meteologica_da_price_forecast`.
- Lower-level scrape module:
  `backend.scrapes.power.pjm.meteologica_da_price_forecast`.
- Source system: Meteologica xTraders Markets API `contents/{content_id}/data`.
- Destination tables:
  - `meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly`
  - `meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly`
- Source grain: `content_id x update_id x forecast_period_start`.
- Content IDs: `4397` deterministic Western Hub DA price and `4400` ECMWF ENS
  Western Hub DA price.
- API telemetry: `ops.api_fetch_log`.
- Data freshness output: `ops.data_availability_events`.
- Schedule: no standalone schedule; called from
  `backend.orchestration.power.pjm.meteologica_forecast_hourly` on the
  `helios-pjm-meteologica-forecast-hourly.timer` cadence.
- Timer behavior: inherited from the Meteologica forecast timer
  (`Persistent=false`).
- Overlap protection: inherited from `/usr/bin/flock` with
  `/tmp/helios-pjm-meteologica-forecast-hourly.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Required VM credentials:
  `XTRADERS_API_USERNAME_ISO` and `XTRADERS_API_PASSWORD_ISO` in
  `/etc/helioscta/backend.env`.
- Application DDL required before first run is managed outside this repo.
- Safe rerun story: upsert on
  `(content_id, update_id, forecast_period_start)` in each source table.
- Retention: 90 days by `issue_date` in both hot tables; the runtime purges
  older rows after successful upserts.
- Forecast horizon: 14 days forward from each source issue timestamp in the
  source timezone; out-of-horizon rows are filtered on ingest and purged after
  successful upserts.

Verification SQL for table freshness:

```sql
SELECT
    'deterministic' AS feed,
    COUNT(*) AS rows,
    COUNT(DISTINCT update_id) AS update_count,
    MAX(issue_date) AS latest_issue_date,
    MIN(forecast_period_start) AS min_forecast_period_start,
    MAX(forecast_period_start) AS max_forecast_period_start,
    MAX(updated_at) AS latest_updated_at
FROM meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly
UNION ALL
SELECT
    'ecmwf_ens' AS feed,
    COUNT(*) AS rows,
    COUNT(DISTINCT update_id) AS update_count,
    MAX(issue_date) AS latest_issue_date,
    MIN(forecast_period_start) AS min_forecast_period_start,
    MAX(forecast_period_start) AS max_forecast_period_start,
    MAX(updated_at) AS latest_updated_at
FROM meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly;
```

Verification SQL for API telemetry:

```sql
SELECT
    provider,
    operation_name,
    content_id,
    feed_name,
    target_table,
    status,
    http_status,
    rows_returned,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name = 'pjm_meteologica_da_price_forecast'
ORDER BY created_at DESC
LIMIT 20;
```

## helios-pjm-rt-fivemin-hrl-lmps

- Status: deployed; timer enabled and latest manual run succeeded.
- Workflow: PJM verified five-minute Real-Time HRL LMP orchestration.
- Runtime module: `backend.orchestration.power.pjm.rt_fivemin_hrl_lmps`.
- Lower-level scrape module: `backend.scrapes.power.pjm.rt_fivemin_hrl_lmps`.
- Source system: PJM Data Miner 2 `rt_fivemin_hrl_lmps`.
- Destination table: `pjm.rt_fivemin_hrl_lmps`.
- API telemetry: `ops.api_fetch_log`.
- Data readiness output: `ops.data_availability_events`.
- Release notification output: `ops.slack_notification_outbox`.
- Unit files:
  - `infrastructure/systemd/helios-pjm-rt-fivemin-hrl-lmps.service`
  - `infrastructure/systemd/helios-pjm-rt-fivemin-hrl-lmps.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- File log path: `/var/log/helioscta`.
- Journal logs: `journalctl -u helios-pjm-rt-fivemin-hrl-lmps.service`.
- Schedule: daily at `09:30 UTC` with `RandomizedDelaySec=5min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-pjm-rt-fivemin-hrl-lmps.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- First enabled at: `2026-06-13 02:48:32 UTC`.
- Deployed commit: `5d4b10b0933a1b4df087cdb811b7e9e335433c3c`.
- Deployed by: Aidan Keaveny via Codex.
- Last manual verification: `2026-06-13 02:49:41 UTC`; service exited
  `status=0/SUCCESS`, upserted 12,096 rows for business date `2026-06-11`,
  and emitted
  `pjm_rt_fivemin_hrl_lmps:data_ready:2026-06-11:hub_zone_interface`.
- Next scheduled run observed: `2026-06-13 09:33:32 UTC`.
- API batching note: PJM rejected comma-separated multi-ID `pnode_id` requests
  during production optimization testing, so the runtime intentionally keeps
  `pnode_id_batch_size=1`.

Verification SQL for Slack release notifications:

```sql
SELECT
    notification_key,
    channel_id,
    channel_name,
    status,
    attempts,
    next_attempt_at,
    sent_at,
    created_at
FROM ops.slack_notification_outbox
WHERE dataset = 'pjm_rt_fivemin_hrl_lmps'
ORDER BY created_at DESC
LIMIT 10;
```

## helios-prod-health-check

- Status: deployed; timer enabled and latest manual run succeeded.
- Workflow: read-only production health digest covering critical DA/RT
  readiness and support-batch API/table freshness.
- Runtime module: `backend.orchestration.health.prod_health_check`.
- Unit files:
  - `infrastructure/systemd/helios-prod-health-check.service`
  - `infrastructure/systemd/helios-prod-health-check.timer`
- VM path: `/opt/helioscta-platform`.
- Azure VM host/name: `helioscta-prod-vm-01`.
- Service user: `helios`.
- Environment file: `/etc/helioscta/backend.env`.
- Journal logs: `journalctl -u helios-prod-health-check.service`.
- Schedule: daily at `10:15 UTC` and `16:30 UTC` with
  `RandomizedDelaySec=2min`.
- Timer behavior: `Persistent=true`; missed runs fire after VM downtime.
- Alerting: intentionally disabled; digest is reviewed on demand.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- First enabled at: `2026-06-13 03:08 UTC`.
- Deployed commit: `5d4b10b0933a1b4df087cdb811b7e9e335433c3c`.
- Deployed by: Aidan Keaveny via Codex.
- Last manual verification: `2026-06-13 20:22:55 UTC`; service exited
  `status=0/SUCCESS`, reported complete DA readiness for `2026-06-14`,
  complete RT verified five-minute HRL readiness for `2026-06-11`, complete
  ERCOT DAM SPP readiness for `2026-06-13`, complete ERCOT RT SPP readiness
  for `2026-06-12`, zero duplicate keys, support-batch coverage of `api=39/39`
  and `tables=39/39`, all support API latest statuses as `success`, and all
  critical/support service results as `success`. Findings result was
  `PASS: no critical failures or warnings detected`.
- API failure findings now warn only when the latest fetch failed or recovered
  failures dominate the health window.
- Next scheduled run observed: `2026-06-13 10:16:43 UTC`.

Verification SQL for API telemetry:

```sql
SELECT
    provider,
    operation_name,
    status,
    http_status,
    rows_returned,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name = 'rt_fivemin_hrl_lmps'
ORDER BY created_at DESC
LIMIT 20;
```

Verification SQL for data-availability events:

```sql
SELECT
    dataset,
    source_system,
    availability_type,
    business_date,
    scope,
    grain,
    completeness_status,
    row_count,
    entity_count,
    period_count,
    created_at
FROM ops.data_availability_events
WHERE dataset = 'pjm_rt_fivemin_hrl_lmps'
ORDER BY created_at DESC
LIMIT 10;
```

## helios-weather-noaa-metar-observations

- Status: deployed on the production VM; timer enabled and latest manual run
  succeeded.
- Workflow: NOAA AviationWeather METAR observation refresh for the PJM station
  basket.
- Runtime module: `backend.orchestration.weather.noaa.metar_observations`.
- Lower-level scrape module:
  `backend.scrapes.weather.noaa.metar_observations`.
- Source system: NOAA/NWS AviationWeather Data API `/api/data/metar`.
- Destination table: `weather.noaa_metar_observations`.
- Source grain: `station_id x observation_time_utc`.
- API telemetry: `ops.api_fetch_log`.
- Data freshness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-weather-noaa-metar-observations.service`
  - `infrastructure/systemd/helios-weather-noaa-metar-observations.timer`
- Proposed schedule: every 15 minutes at `07`, `22`, `37`, and `52` minutes
  past the hour UTC with `RandomizedDelaySec=2min`.
- Timer behavior: `Persistent=false`; scheduled runs pull a rolling recent
  observation window.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-weather-noaa-metar-observations.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- VM deployment: working-tree overlay copied to `/opt/helioscta-platform` on
  `2026-06-17`; unit files installed under `/etc/systemd/system/`.
- Production DDL: `weather` schema, NOAA table, NOAA indexes, WSI table, WSI
  indexes, and refreshed read-only grants applied on `2026-06-17`.
- Application DDL required before first run is managed outside this repo.
- Safe rerun story: upsert on `(station_id, observation_time_utc)`.
- Local verification: `pytest backend/tests/test_weather_wsi_hourly_observed.py
  backend/tests/test_weather_wsi_hourly_observed_orchestration.py
  backend/tests/test_weather_noaa_metar_observations.py
  backend/tests/test_weather_noaa_metar_observations_orchestration.py`, and historical read-only SQL shape checks passed on `2026-06-17`. pytest reported only pre-existing cache write warnings for
  `backend/.pytest_cache`.
- Production validation: read-only primary-key checks passed on `2026-06-17`.
- VM verification: manual service run on `2026-06-17 21:04 UTC` exited
  `status=0/SUCCESS`, upserted 1,651 rows for 33 PJM stations, wrote five
  successful batched NOAA API telemetry rows, and emitted
  `weather_noaa_metar_observations:freshness_observed:PJM:202606172058`.
  First timer-triggered run completed on `2026-06-17 21:07:52 UTC`, exited
  `status=0/SUCCESS`, and upserted 1,651 rows. Next scheduled run observed at
  `2026-06-17 21:23:25 UTC`.

Verification SQL for NOAA table freshness:

```sql
SELECT
    region,
    COUNT(*) AS rows,
    COUNT(DISTINCT station_id) AS station_count,
    MAX(observation_time_utc) AS latest_observation_time_utc,
    MAX(updated_at) AS latest_updated_at
FROM weather.noaa_metar_observations
GROUP BY region
ORDER BY region;
```

Verification SQL for NOAA API telemetry:

```sql
SELECT
    provider,
    operation_name,
    status,
    http_status,
    rows_returned,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name = 'noaa_metar_observations'
ORDER BY created_at DESC
LIMIT 20;
```

## helios-weather-wsi-hourly-observed

- Status: deployed on the production VM; timer enabled and latest manual run
  succeeded.
- Workflow: WSI hourly observed weather refresh for the PJM station basket.
- Runtime module: `backend.orchestration.weather.wsi.hourly_observed`.
- Lower-level scrape module: `backend.scrapes.weather.wsi.hourly_observed`.
- Source system: WSI Trader Historical Observations
  `GetHistoricalObservations` / `HISTORICAL_HOURLY_OBSERVED`.
- Destination table: `weather.wsi_hourly_observed_temperatures`.
- Source grain: `station_id x observation_time_local x region`.
- API telemetry: `ops.api_fetch_log`.
- Data freshness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-weather-wsi-hourly-observed.service`
  - `infrastructure/systemd/helios-weather-wsi-hourly-observed.timer`
- Proposed schedule: hourly at minute `20` UTC with
  `RandomizedDelaySec=3min`.
- Timer behavior: `Persistent=false`; scheduled runs pull a rolling recent
  observation window.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-weather-wsi-hourly-observed.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Required VM credentials:
  `WSI_TRADER_USERNAME`, `WSI_TRADER_NAME`, and `WSI_TRADER_PASSWORD` in
  `/etc/helioscta/backend.env`.
- VM credentials: WSI credential keys were installed in
  `/etc/helioscta/backend.env` on `2026-06-18`; values are intentionally not
  recorded in this repo.
- VM deployment: working-tree overlay copied to `/opt/helioscta-platform` on
  `2026-06-17`; unit files installed under `/etc/systemd/system/`.
- Production DDL: `weather` schema, WSI table, WSI indexes, NOAA table, NOAA
  indexes, and refreshed read-only grants applied on `2026-06-17`.
- Application DDL required before first run is managed outside this repo.
- Safe rerun story: upsert on
  `(station_id, observation_time_local, region)`.
- Local verification: `pytest backend/tests/test_weather_wsi_hourly_observed.py
  backend/tests/test_weather_wsi_hourly_observed_orchestration.py`, and
  historical read-only SQL shape checks passed on `2026-06-17`. pytest reported
  only pre-existing cache write warnings for `backend/.pytest_cache`.
- Production validation: read-only primary-key checks passed on `2026-06-18`.
- VM verification: manual service run on `2026-06-18 13:54 UTC` exited
  `status=0/SUCCESS`, upserted 1,935 rows for 34 PJM station IDs, wrote
  successful WSI API telemetry, and emitted
  `weather_wsi_hourly_observed_temperatures:freshness_observed:PJM:2026061808`.
  `helios-weather-wsi-hourly-observed.timer` is enabled with next run observed
  at `2026-06-18 14:22:37 UTC`.

Verification SQL for table freshness:

```sql
SELECT
    region,
    COUNT(*) AS rows,
    COUNT(DISTINCT station_id) AS station_count,
    MAX(observation_time_local) AS latest_observation_time_local,
    MAX(updated_at) AS latest_updated_at
FROM weather.wsi_hourly_observed_temperatures
GROUP BY region
ORDER BY region;
```

Verification SQL for WSI API telemetry:

```sql
SELECT
    provider,
    operation_name,
    status,
    http_status,
    rows_returned,
    created_at
FROM ops.api_fetch_log
WHERE pipeline_name = 'wsi_hourly_observed_temperatures'
ORDER BY created_at DESC
LIMIT 20;
```

## helios-weather-wsi-hourly-forecast

- Status: production DDL applied and initial refresh succeeded; timer unit is
  promoted for VM deployment.
- Workflow: WSI hourly forecast weather refresh for the PJM station basket.
- Runtime module: `backend.orchestration.weather.wsi.hourly_forecast`.
- Lower-level scrape module: `backend.scrapes.weather.wsi.hourly_forecast`.
- Source system: WSI Trader Hourly Forecast `GetHourlyForecast`.
- Destination table: `weather.wsi_hourly_forecasts`.
- Source grain:
  `station_id x region x forecast_issued_at_utc x forecast_time_utc`.
- API telemetry: `ops.api_fetch_log`.
- Data freshness output: `ops.data_availability_events`.
- Unit files:
  - `infrastructure/systemd/helios-weather-wsi-hourly-forecast.service`
  - `infrastructure/systemd/helios-weather-wsi-hourly-forecast.timer`
- Proposed schedule: hourly at minute `32` UTC with
  `RandomizedDelaySec=3min`.
- Timer behavior: `Persistent=false`; scheduled runs store the latest WSI
  forecast issue returned by the source.
- Overlap protection: service uses `/usr/bin/flock` with
  `/tmp/helios-weather-wsi-hourly-forecast.lock`.
- Database role: `helios_admin` through `AZURE_POSTGRES_WRITER_*`.
- Required VM credentials:
  `WSI_TRADER_USERNAME`, `WSI_TRADER_NAME`, and `WSI_TRADER_PASSWORD` in
  `/etc/helioscta/backend.env`.
- Application DDL required before first run is managed outside this repo.
- Safe rerun story: upsert on
  `(station_id, region, forecast_issued_at_utc, forecast_time_utc)`.
- Local verification: `pytest backend/tests/test_weather_wsi_hourly_forecast.py
  backend/tests/test_weather_wsi_hourly_forecast_orchestration.py
  backend/tests/test_weather_wsi_hourly_observed.py
  backend/tests/test_weather_wsi_hourly_observed_orchestration.py`, and
  historical read-only SQL shape checks passed on `2026-06-18`. pytest reported
  only pre-existing cache write warnings for `backend/.pytest_cache`.
- Production DDL: `weather.wsi_hourly_forecasts` table and three forecast
  indexes were applied on `2026-06-18`:
  `idx_weather_wsi_hourly_fcst_latest`,
  `idx_weather_wsi_hourly_fcst_valid_time`, and
  `idx_weather_wsi_hourly_fcst_updated_at`.
- Production validation: read-only primary-key checks passed on `2026-06-18`.
- Production refresh verification: local orchestration run on
  `2026-06-18 14:19 UTC` upserted 12,240 rows for 34 PJM station IDs and one
  WSI forecast issue, wrote four successful batched WSI API telemetry rows,
  produced zero duplicate primary-key groups, and emitted
  `weather_wsi_hourly_forecasts:freshness_forecast:PJM:202606181028`.

Verification SQL for forecast table freshness:

```sql
SELECT
    region,
    COUNT(*) AS rows,
    COUNT(DISTINCT station_id) AS station_count,
    COUNT(DISTINCT forecast_issued_at_utc) AS issue_count,
    MAX(forecast_issued_at_utc) AS latest_forecast_issued_at_utc,
    MIN(forecast_time_utc) AS min_forecast_time_utc,
    MAX(forecast_time_utc) AS max_forecast_time_utc,
    MAX(updated_at) AS latest_updated_at
FROM weather.wsi_hourly_forecasts
GROUP BY region
ORDER BY region;
```

Verification SQL for WSI forecast API telemetry:

```sql
SELECT
    provider,
    operation_name,
    status,
    http_status,
    target_table,
    created_at,
    metadata
FROM ops.api_fetch_log
WHERE pipeline_name = 'wsi_hourly_forecasts'
ORDER BY created_at DESC
LIMIT 20;
```
