# Workflow Promotion Checklist

Use this checklist before a scrape or orchestration becomes a scheduled
production workflow. Apply application tables and indexes with `helios_admin`
before runtime code writes to them.

## 1. Scope And Ownership

- Name the owner and runtime path.
- Confirm the source system, endpoint/feed short name, and source metadata.
- Confirm the destination schema/table and whether the workflow is critical or
  support-batch only.
- Confirm the schedule is tied to business value and source publish cadence.
- Challenge whether a dedicated timer is needed; default to the support batch
  unless downstream readiness depends on the feed.

## 2. Data Contract

- Document grain, uniqueness key, freshness timestamp, and safe rerun behavior.
- Document the table DDL and required indexes in the deployment or setup notes.
- Add or update read-only query SQL where the table feeds downstream queries.
- Verify sample shape with read-only SQL before changing downstream code.

## 3. Runtime

- Use backend `helios_admin` credentials through existing environment variables.
- Keep script parameters as function arguments with defaults, not `argparse`.
- Use idempotent upserts or another documented rerun-safe write policy.
- Add API telemetry to `ops.api_fetch_log` for external API calls.
- Add `ops.data_availability_events` only for workflows that downstream
  reporting or health checks treat as ready/not-ready signals.
- Use `flock` for dedicated systemd services that might overlap with manual or
  persistent timer runs.

## 4. Verification

- Run backend tests for touched modules.
- Apply table/index SQL with `helios_admin` before deploying writers.
- Run a VM import or service smoke check.
- Verify through MCP/read-only SQL:
  - row count and latest timestamp
  - expected entity and period counts
  - duplicate uniqueness keys
  - latest `ops.api_fetch_log` rows
  - latest readiness event when applicable

## 5. Deployment

- Commit and push before deploying to the VM.
- Pull with `git pull --ff-only` on `/opt/helioscta-platform`.
- Reinstall backend dependencies only when requirements or package metadata
  changed.
- Copy updated systemd service/timer files to `/etc/systemd/system/`.
- Run `systemctl daemon-reload`.
- Enable/restart the relevant timer.
- Run the service manually once when safe for the source publish window.
- Confirm `systemctl list-timers 'helios-*'` and `journalctl` output.

## 6. Documentation

- Update `docs/deployments.md` with host, commit, schedule, unit files, and
  verification result.
- Update `docs/production-readiness.md` when production posture changes.
- Update `docs/data-catalogue/` when a feed changes tier, runtime stance, or
  criticality.
- Record any known source API limitation, such as unsupported filters or
  rejected batch parameters.

## Criticality Defaults

- Critical dedicated workflows now:
  - `da_hrl_lmps`
  - `rt_fivemin_hrl_lmps`
- Support-batch feeds remain non-critical by default, including
  `rt_fivemin_mnt_lmps`, unless a downstream consumer needs a readiness event.
