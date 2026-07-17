# Production Readiness

Use this document as the backend production standard and gap tracker. Keep
factual deployment state in `docs/deployments.md`; keep VM mechanics in
`infrastructure/azure-vm/README.md` and systemd mechanics in
`infrastructure/systemd/README.md`.

## Current Maturity

- DA hourly LMP workflow: production-ready scheduled workflow.
- RT verified five-minute HRL LMP workflow: dedicated production workflow.
- Backend repo: early production foundation.

This means the DA and priority verified five-minute RT LMP workflows can run as
scheduled production jobs, but the repo is not yet a mature backend platform
with automated deploys, monitoring, recovery, and full workflow lifecycle
controls.

## Production-Ready Criteria

A backend workflow is production-ready when it has:

- Committed runtime code deployed from Git.
- Secrets outside Git in `/etc/helioscta/backend.env` or another approved
  secret boundary.
- Required application tables applied before the workflow is enabled.
- Safe rerun behavior documented, usually idempotent upserts.
- API fetch telemetry in `ops.api_fetch_log` when it calls external APIs.
- A data-availability event in `ops.data_availability_events` when downstream
  reporting or notifications depend on completed data.
- Terminal logs in journald and retained failure logs under `/var/log/helioscta`
  when file logging is enabled.
- A systemd `.service` and `.timer` for scheduled VM workflows.
- A deployment register entry in `docs/deployments.md`.
- Targeted tests or smoke checks that match the risk of the change.
- A VM dry run or service run verified after deployment.

## Current Production Coverage

| Area | Current State | Notes |
| --- | --- | --- |
| VM runtime | In place | `helioscta-prod-vm-01` runs committed code from `/opt/helioscta-platform`. |
| DA LMP schedule | In place | `helios-pjm-da-hrl-lmps.timer` runs daily at `15:30 UTC`, polls every minute for up to 5 hours, and uses a 5-hour systemd timeout. |
| RT verified five-minute HRL LMP schedule | In place | `helios-pjm-rt-fivemin-hrl-lmps.timer` runs daily at `09:30 UTC`. |
| RT verified hourly LMP schedule | In place | `helios-pjm-rt-hrl-lmps.timer` starts on business days at `11:30 America/New_York`, polls for up to 5 hours, and waits 5 minutes between attempts. |
| DA transmission constraints schedule | In place | `helios-pjm-da-transconstraints.timer` runs daily at `17:00 UTC`, matching hourly demand bids, and polls for up to 4 hours. |
| ERCOT DAM SPP schedule | In place | `helios-ercot-dam-stlmnt-pnt-prices.timer` runs daily at `11:15 America/Chicago`. |
| ERCOT RT SPP schedule | In place | `helios-ercot-settlement-point-prices.timer` runs every 15 minutes. |
| ISO-NE DA hourly LMP schedule | In place | `helios-isone-da-hrl-lmps.timer` runs daily at `17:10 UTC`. |
| ISO-NE RT preliminary hourly LMP schedule | In place | `helios-isone-rt-hrl-lmps-prelim.timer` runs daily at `01:10 UTC`. |
| ISO-NE RT final hourly LMP schedule | In place | `helios-isone-rt-hrl-lmps-final.timer` runs daily at `20:10 UTC`. |
| PJM load forecast schedule | In place | `helios-pjm-load-frcstd-7-day.timer` runs `load_frcstd_7_day` hourly. |
| PJM Data Miner batch schedule | In place | `helios-pjm-data-miner-batch.timer` runs the remaining 23 support scrapes daily at `04:30 UTC`; `helios-pjm-hrl-load-prelim.timer`, `helios-pjm-da-transconstraints.timer`, `helios-pjm-da-reserve-market-results.timer`, and `helios-pjm-gen-outages-by-type.timer` cover promoted dedicated feeds. |
| PJM Operations Summary schedule | Promoted for VM install | `helios-pjm-ops-sum.timer` runs the Ops Sum feeds daily after PJM's 05:00-08:00 EPT refresh window. |
| LMP price repair | Ready to deploy | `helios-lmp-price-backfill-7-day.timer` reruns seven-day PJM, ISO-NE, and ERCOT LMP scrape/backfill repairs nightly at `22:15 UTC`; it replaces the older PJM-only repair timer. |
| Production health digest schedule | In place | `helios-prod-health-check.timer` runs after RT and DA priority timers. |
| Secrets | In place | Production jobs consume `/etc/helioscta/backend.env`. |
| API telemetry | In place | Scheduled PJM, ERCOT, and ISO-NE API scrapes write `ops.api_fetch_log`. |
| Data readiness | In place | Critical PJM, ERCOT, and ISO-NE price orchestration write `ops.data_availability_events`. |
| Release notifications | In place | PJM DA HRL LMPs, NEPOOL DA HRL LMPs, and ERCOT DAM SPPs queue backend HTML email release notices with inline DA LMP hub/hour tables and Vercel report links. PJM DA still sends Slack during the transition. Verified RT HRL LMPs, verified RT five-minute HRL LMPs, and DA reserve market results send Slack. |
| Production health digest | In place | `backend.orchestration.health.prod_health_check` prints a read-only operator summary for critical PJM/ERCOT readiness and PJM/ERCOT support-batch freshness. |
| Manual PJM backfills | In place | `docs/operations/manual-backfills.md` documents controlled date-window replays into the canonical production tables. |
| CI validation | In place | GitHub Actions runs backend tests on pushes and pull requests. |
| Log retention | In place | Journald retention is versioned in `infrastructure/systemd/journald-helioscta.conf`; operator policy is documented in `docs/operations/log-retention.md`. |
| Alert schema dependency | Removed | Backend no longer depends on `alerts.events`. |
| Deployment register | In place | `docs/deployments.md` records host, commit, timer, and verification. |
| Workflow promotion checklist | In place | `docs/workflow-promotion-checklist.md` is the default checklist for new timers. |
| VM rebuild runbook | In place | `docs/operations/vm-rebuild-runbook.md` documents rebuilding the scheduler VM from committed code. |
| Database DDL | In progress | Application DDL is managed outside this repo; backend jobs assume required tables already exist. |

## Current Gaps

These are not blockers for the first DA workflow, but they are blockers for a
mature production backend platform:

- No automated deploy pipeline.
- No systemd failure notification path; current Slack coverage is limited to
  data-release notifications.
- No standardized overlap protection for every future timer; current critical
  DA, RT five-minute HRL, and PJM batch jobs use `flock`.
- No formal database migration tool.
- No centralized freshness or pipeline-health dashboard; use the operator
  health digest until a dashboard is promoted.
- PJM DA and verified RT hourly LMP release report links are deployed to Vercel
  and can open the single-day LMP view from a data-availability event business
  date. Verified RT five-minute release Slack currently links to the PJM source
  definition only.

## Hardening Backlog

Recommended order:

1. Extend release notifications beyond the current critical PJM LMP release
   flows only after recipient and alert criteria are explicitly approved.
2. Add systemd failure notifications when an alert channel is selected.
3. Standardize overlap protection for future dedicated timers.
4. Evaluate whether manual application DDL is sufficient or a migration tool is
   needed.

## Workflow Promotion Checklist

Before a new scrape or orchestration becomes a scheduled production workflow:

- Source system and endpoint are documented.
- Destination schema/table, grain, and primary key are explicit.
- Table DDL is documented in the deployment or setup notes.
- Required table DDL has been applied with `helios_admin`.
- Scrape or orchestration tests exist.
- Safe rerun behavior is documented.
- Cadence is tied to business value, not the fastest API polling interval.
- Expected data volume is acceptable for Azure Postgres.
- API fetch telemetry is enabled.
- Data readiness event exists if downstream reports depend on the loaded data.
- systemd service and timer exist.
- Deployment register entry exists.
- VM import or dry-run smoke check passes.
- First service run is verified through journald and read-only SQL.

## PJM Scheduling Guidance

Do not schedule every PJM scrape just because the script exists. Decide based
on downstream value, feed update cadence, and database cost.

| Feed | Default Posture | Rationale |
| --- | --- | --- |
| `da_hrl_lmps` | Scheduled daily with readiness event | Daily published data drives downstream reporting. |
| `rt_fivemin_hrl_lmps` | Scheduled daily with readiness event | Priority verified five-minute RT price feed for hub, zone, and interface prices. |
| `load_frcstd_7_day` | Scheduled hourly with API telemetry | Hourly PJM load forecast snapshots drive the forecast dashboard and vintage comparisons. |
| `rt_hrl_lmps` | Scheduled business-day polling with API telemetry | Verified hourly RT hub prices drive frontend term/history views and post between 11 a.m. and noon EPT, so the timer starts at 11:30 a.m. EPT and polls for up to 5 hours. |
| `rt_unverified_hrl_lmps` | PJM hourly bucket with API telemetry and nightly repair | Short-retention unverified hourly prices update throughout the operating day; the hourly bucket keeps the hot table fresh while the repair window reruns recent posted market dates. |
| `unverified_five_min_lmps` | Scheduled daily in the PJM Data Miner batch | High-frequency feed is constrained to daily refresh until a stronger live-ops use case is selected. |
| `rt_fivemin_mnt_lmps` | Scheduled daily in the PJM Data Miner batch | Settlement-verified feed is refreshed daily. |

Current criticality decision:

- Critical dedicated timers: `da_hrl_lmps`, `rt_fivemin_hrl_lmps`,
  `ercot-dam-stlmnt-pnt-prices`, and `ercot-settlement-point-prices`.
- Dedicated support price timer: `rt_hrl_lmps`, because the verified hourly RT
  feed posts after the early PJM Data Miner support batch. It starts at
  11:30 a.m. EPT on business days and polls every 5 minutes for up to 5 hours.
- Dedicated day-ahead ancillary service timer:
  `da_reserve_market_results`, because the feed posts after the early PJM Data
  Miner support batch. It starts at 13:45 America/New_York, polls every two
  minutes for up to four hours, emits a complete-day readiness event, and
  queues one Slack release notification.
- PJM hourly bucket: `rt_unverified_hrl_lmps` runs hourly after the source's
  typical top-of-hour refresh and stays out of the daily support batch so
  dashboard-facing RT prices do not wait for the next overnight job. Add other
  PJM feeds to this bucket only when they share the same simple hourly cadence
  and safe rerun behavior.
- Nightly repair timer: `lmp_price_backfill_7_day` reruns recent promoted
  PJM, ISO-NE, ERCOT, and CAISO LMP/price-adder scrape repairs with
  feed-specific publication lags and logs backfill telemetry in
  `ops.api_fetch_log`.
- Dedicated dashboard-context timer: `ops_sum` runs at 05:05, 06:05, 07:05,
  and 08:05 EPT after PJM's morning Operations Summary refresh postings.
- Support batch: all other currently promoted PJM Data Miner feeds, including
  `rt_fivemin_mnt_lmps`.
- Promote `rt_fivemin_mnt_lmps` only when a downstream consumer needs
  settlement-final five-minute readiness separate from the operational
  verified RT five-minute HRL feed.

## Morning Health Digest

Run this from the production VM when an operator asks for the current backend
state:

```bash
sudo systemctl start helios-prod-health-check.service
journalctl -u helios-prod-health-check.service -n 220 --no-pager
```

The service uses `/etc/helioscta/backend.env`, matching the production scrape
jobs. The digest is read-only. It checks the latest PJM DA, PJM RT verified
five-minute, ERCOT DAM SPP, and ERCOT RT SPP readiness events, RT five-minute
table shape, duplicate keys, recent critical API fetch failures, PJM/ERCOT
support-batch API/table freshness, systemd service results, and `helios-*`
timer schedule.

Recovered API failures are not findings when the latest fetch succeeded and
the failure rate is low. The digest warns on an API path when the latest fetch
is still failed or when failures dominate the health window.

Exit codes:

- `0`: no critical failures.
- `1`: one or more critical PJM or ERCOT price checks failed.

Warnings are printed for non-critical gaps, such as missing telemetry in the
selected lookback window or support-batch issues.

Scheduling:

- `helios-prod-health-check.timer` runs at `10:15 UTC` after the RT verified
  five-minute workflow and at `16:30 UTC` after the DA workflows.

## Manual Backfills

Manual backfills are available for the priority PJM workflows:

- `backend.backfills.power.pjm.da_hrl_lmps`
- `backend.backfills.power.pjm.rt_hrl_lmps`
- `backend.backfills.power.pjm.rt_unverified_hrl_lmps`
- `backend.backfills.power.pjm.gen_outages_by_type`

They write to the same canonical `pjm` tables with the same upsert keys as the
scheduled jobs, and tag PJM API telemetry with `run_mode=backfill` in
`ops.api_fetch_log.metadata`. Scheduled orchestrators remain responsible for
polling and readiness events; manual backfill wrappers call lower-level scrape
modules where available. Use `docs/operations/manual-backfills.md` for exact VM
commands and verification SQL. Promoted LMP price repairs run through the
nightly `helios-lmp-price-backfill-7-day.timer` repair job; other backfills
remain on demand only.

RT verified five-minute HRL LMP API note:

- PJM accepts the feed when queried one `pnode_id` at a time, but rejects
  comma-separated multi-ID requests for this endpoint. Keep
  `DEFAULT_PNODE_ID_BATCH_SIZE = 1` unless PJM changes that behavior.

## Review Cadence

Review this document after:

- Adding a new scheduled workflow.
- Changing database role, schema, or application DDL boundaries.
- Changing VM, timer, logging, or deployment behavior.
- Adding frontend/report delivery from data-availability events.
- Any production incident or failed scheduled run.
