# Production Readiness

Use this document as the backend production standard and gap tracker. Keep
factual deployment state in `docs/deployments.md`; keep VM mechanics in
`infrastructure/azure-vm/README.md` and systemd mechanics in
`infrastructure/systemd/README.md`.

## Current Maturity

- DA hourly LMP workflow: production-ready first scheduled workflow.
- Backend repo: early production foundation.

This means the DA workflow can run as a scheduled production job, but the repo
is not yet a mature backend platform with automated deploys, monitoring,
recovery, and full workflow lifecycle controls.

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
| Secrets | In place | Production jobs consume `/etc/helioscta/backend.env`. |
| API telemetry | In place | DA orchestration writes `ops.api_fetch_log`. |
| Data readiness | In place | DA orchestration writes `ops.data_availability_events`. |
| Alert schema dependency | Removed | Backend no longer depends on `alerts.events`. |
| Deployment register | In place | `docs/deployments.md` records host, commit, timer, and verification. |
| Operator SQL | In progress | Application DDL is moving to disabled dbt operator SQL. |

## Current Gaps

These are not blockers for the first DA workflow, but they are blockers for a
mature production backend platform:

- No automated deploy pipeline.
- No systemd failure notification path.
- No documented journald retention policy.
- No overlap protection for long-running timers.
- No formal database migration tool.
- No centralized freshness or pipeline-health dashboard.
- No Vercel/report consumer for `ops.data_availability_events`.
- No disaster recovery runbook for rebuilding the VM.
- No standard deploy checklist per future workflow.
- No explicit decision log for which PJM feeds deserve timers.

## Hardening Backlog

Recommended order:

1. Add systemd failure notifications or a lightweight health check.
2. Add overlap protection to service units.
3. Create a workflow deployment checklist and use it for every new timer.
4. Decide which PJM scrapes deserve schedules and at what cadence.
5. Build the Vercel/report consumer from `ops.data_availability_events`.
6. Document journald and `/var/log/helioscta` retention.
7. Add VM rebuild and recovery instructions.
8. Evaluate whether manual operator SQL is sufficient or a migration tool is
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
| `rt_hrl_lmps` | Candidate for hourly or daily schedule | Useful, but cadence should match reporting needs. |
| `unverified_five_min_lmps` | Do not schedule until use case is clear | High-frequency data can create volume and telemetry noise. |
| `rt_fivemin_mnt_lmps` | Candidate for daily or hourly schedule | Settlement-verified feed is less urgent than live operations. |

## Review Cadence

Review this document after:

- Adding a new scheduled workflow.
- Changing database role, schema, or operator SQL boundaries.
- Changing VM, timer, logging, or deployment behavior.
- Adding frontend/report delivery from data-availability events.
- Any production incident or failed scheduled run.
