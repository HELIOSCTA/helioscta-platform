---
name: helioscta-telemetry-health
description: Check HeliosCTA production telemetry for failed, stale, missing, slow, or silently unhealthy scheduled scripts using ops.api_fetch_log and ops.data_availability_events. Use for Codex scheduled tasks, morning health checks, failure digests, stale pipeline checks, telemetry-log review, or questions about scripts that have not run successfully.
---

# HeliosCTA Telemetry Health

## Overview

Run a read-only production telemetry health check for HeliosCTA scripts. Prefer
the read-only Helios MCP database connection and inspect local repo context only
to explain failures or propose next checks.

## Rules

- Use `mcp__heliosctadb_helios_prod_helios_readonly.query` for database
  inspection.
- Never use `mcp__heliosctadb_helios_prod_helios_admin` for scheduled health
  checks or triage.
- Do not edit repo files during a scheduled health task unless the user
  explicitly asks for implementation.
- Do not print `.env` values, credentials, secrets, tokens, or full connection
  strings.
- Treat the task as production read-only monitoring. Prefer small grouped
  counts and representative samples over broad table dumps.
- Use `ops.api_fetch_log` as the main telemetry source. Use
  `ops.data_availability_events` for data-readiness/freshness checks when a
  pipeline emits availability events.

## Default Workflow

1. Capture local context with `$env:COMPUTERNAME`, current date/time, repo root,
   and execution surface if visible.
2. Read `backend/README.md`, `infrastructure/windows-task-scheduler/README.md`,
   and `infrastructure/systemd/README.md` only when cadence/source context is
   needed for interpretation.
3. Read `references/telemetry-health-queries.md` before constructing health SQL.
4. Query recent failures from `ops.api_fetch_log`; default window is the last
   24 hours.
5. Query latest successful run per pipeline/operation/target and flag stale or
   missing scripts. Default cadence lookback is 14 days.
6. Query `ops.data_availability_events` for incomplete or stale readiness
   events in the last 7 days.
7. If failures or stale runs are found, inspect relevant local runtime files
   only enough to propose the smallest concrete next action. Do not implement.

## Health Interpretation

- A failed script is any recent `ops.api_fetch_log.status` not in
  `('success', 'succeeded', 'dry_run')`.
- A stale script is one whose latest successful telemetry is older than the
  expected cadence from repo docs, or, when cadence is unknown, older than two
  times its observed median successful-run gap over the lookback window.
- A missing script is an expected promoted scheduled workflow from repo docs
  with no successful telemetry in the lookback window.
- A recovered failure still deserves mention when failure volume is high or the
  most recent error is operator-relevant.
- `ops.data_availability_events.completeness_status <> 'complete'` is a
  readiness issue, even when API fetch telemetry succeeded.

## Output Shape

Start the report with one of these exact titles:

- `Telemetry heartbeat passed`
- `Telemetry heartbeat failed`
- `Telemetry heartbeat stale/missing`
- `Telemetry heartbeat environment failure`

Include:

- execution host/surface and timestamp;
- database connection result;
- recent failure summary;
- stale/missing summary;
- readiness-event summary when relevant;
- up to 10 representative failure rows;
- exact local file paths to inspect or change, if a fix is apparent;
- exact rerun command or MCP query family used.

If there are no failures, stale pipelines, or incomplete readiness events, keep
the report short and state that telemetry is healthy in the checked windows.

## References

- `references/telemetry-health-queries.md`: schema notes and reusable read-only
  SQL patterns for failures, latest successes, cadence, and availability events.
