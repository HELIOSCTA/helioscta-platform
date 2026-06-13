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
| DA LMP schedule | In place | `helios-da-hrl-lmps.timer` runs daily at `16:00 UTC`. |
| RT verified five-minute HRL LMP schedule | In place | `helios-rt-fivemin-hrl-lmps.timer` runs daily at `09:30 UTC`. |
| PJM Data Miner batch schedule | In place | `helios-pjm-data-miner-batch.timer` runs the 29 support scrapes daily at `04:30 UTC`. |
| Production health digest schedule | In place | `helios-prod-health-check.timer` runs after RT and DA priority timers. |
| Secrets | In place | Production jobs consume `/etc/helioscta/backend.env`. |
| API telemetry | In place | Scheduled PJM API scrapes write `ops.api_fetch_log`. |
| Data readiness | In place | DA and priority RT verified five-minute orchestration write `ops.data_availability_events`. |
| Production health digest | In place | `backend.orchestration.health.prod_health_check` prints a read-only operator summary for morning review. |
| CI validation | In place | GitHub Actions runs backend tests plus dbt parse/compile on pushes and pull requests. |
| Log retention | In place | Journald retention is versioned in `infrastructure/systemd/journald-helioscta.conf`; operator policy is documented in `docs/operations/log-retention.md`. |
| Alert schema dependency | Removed | Backend no longer depends on `alerts.events`. |
| Deployment register | In place | `docs/deployments.md` records host, commit, timer, and verification. |
| Workflow promotion checklist | In place | `docs/workflow-promotion-checklist.md` is the default checklist for new timers. |
| VM rebuild runbook | In place | `docs/operations/vm-rebuild-runbook.md` documents rebuilding the scheduler VM from committed code. |
| Operator SQL | In progress | Application DDL is moving to disabled dbt operator SQL. |

## Current Gaps

These are not blockers for the first DA workflow, but they are blockers for a
mature production backend platform:

- No automated deploy pipeline.
- No systemd failure notification path; alerts are intentionally deferred.
- No standardized overlap protection for every future timer; current critical
  DA, RT five-minute HRL, and PJM batch jobs use `flock`.
- No formal database migration tool.
- No centralized freshness or pipeline-health dashboard; use the operator
  health digest until a dashboard is promoted.
- No Vercel/report consumer for `ops.data_availability_events`.

## Hardening Backlog

Recommended order:

1. Build the Vercel/report consumer from `ops.data_availability_events`.
2. Add systemd failure notifications when an alert channel is selected.
3. Standardize overlap protection for future dedicated timers.
4. Evaluate whether manual operator SQL is sufficient or a migration tool is
   needed.

## Workflow Promotion Checklist

Before a new scrape or orchestration becomes a scheduled production workflow:

- Source system and endpoint are documented.
- Destination schema/table, grain, and primary key are explicit.
- Table DDL exists under disabled operator SQL.
- Required table DDL has been applied with `helios_admin`.
- Scrape or orchestration tests exist.
- dbt source/staging models parse.
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
| `rt_hrl_lmps` | Scheduled daily in the PJM Data Miner batch | Useful, but not yet promoted to its own readiness workflow. |
| `unverified_five_min_lmps` | Scheduled daily in the PJM Data Miner batch | High-frequency feed is constrained to daily refresh until a stronger live-ops use case is selected. |
| `rt_fivemin_mnt_lmps` | Scheduled daily in the PJM Data Miner batch | Settlement-verified feed is refreshed daily. |

Current criticality decision:

- Critical dedicated timers: `da_hrl_lmps` and `rt_fivemin_hrl_lmps`.
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
journalctl -u helios-prod-health-check.service -n 120 --no-pager
```

The service uses `/etc/helioscta/backend.env`, matching the production scrape
jobs. The digest is read-only. It checks the latest DA and RT verified
five-minute readiness events, RT five-minute table shape, duplicate keys,
recent critical API fetch failures, systemd service results, and `helios-*`
timer schedule.

Exit codes:

- `0`: no critical failures.
- `1`: one or more critical DA or RT verified five-minute checks failed.

Warnings are printed for non-critical gaps, such as missing telemetry in the
selected lookback window or support-batch issues.

Scheduling:

- `helios-prod-health-check.timer` runs at `10:15 UTC` after the RT verified
  five-minute workflow and at `16:30 UTC` after the DA workflow.

RT verified five-minute HRL LMP API note:

- PJM accepts the feed when queried one `pnode_id` at a time, but rejects
  comma-separated multi-ID requests for this endpoint. Keep
  `DEFAULT_PNODE_ID_BATCH_SIZE = 1` unless PJM changes that behavior.

## Review Cadence

Review this document after:

- Adding a new scheduled workflow.
- Changing database role, schema, or operator SQL boundaries.
- Changing VM, timer, logging, or deployment behavior.
- Adding frontend/report delivery from data-availability events.
- Any production incident or failed scheduled run.
