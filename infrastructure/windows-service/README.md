# Archived Windows Service Runtime

This NSSM service path is retained for rollback and legacy-cleanup reference
only. The active local ICE activation path is the Task Scheduler coordinator in
`infrastructure/windows-task-scheduler/`.

This folder is separate from the Linux VM deploy manifest in
`infrastructure/systemd/`.

ICE Python is local-only because it requires a licensed Windows ICE XL / ICE
Python runtime. The files may exist in a VM checkout after `git pull`, but they
must not be activated on Linux: do not add ICE dependencies to
`backend/requirements.txt`, do not add ICE systemd units, and do not add ICE
jobs to `docs/deployments.md`.

Do not install or restart `HeliosCTA-IcePython` for normal production
operation. Before enabling the Task Scheduler coordinators, use
`infrastructure/windows-task-scheduler/disable_legacy_ice_tasks.ps1` to export,
stop, and disable legacy per-feed tasks and the old NSSM service startup.

## Legacy Model

The old Windows host model ran one supervised service through Windows Service
Control Manager. The service command was:

```powershell
python -m backend.orchestration.ice_python.service
```

That process owned the schedule loop, similar to a dedicated `systemd`
service. The current Task Scheduler model instead calls the same Python module
with `service.main(run_once=True, job_group='<group>')`; Task Scheduler owns
the schedule and the Python coordinator owns feed selection, child-process
timeouts, per-window state, and API telemetry.

The repository installer used NSSM as the service wrapper because a normal
Python process does not implement the Windows service protocol by itself. NSSM
also provided restart behavior and stdout/stderr log capture.

The old service scheduler stayed resident, but each due ICE job launched as a
child Python process. That isolation pattern is still used by the Task
Scheduler coordinator.

The GitHub Actions self-hosted runner notes in `deployment-runner.md` are also
archived with this service path. They are not the current deployment standard.

## Legacy Runtime Setup

On the licensed Windows host, the dependency shape was:

```powershell
cd C:\path\to\helioscta-platform
python -m pip install -r backend\requirements-local-windows.txt -e backend
```

Install the proprietary ICE Python wheel from the local ICE XL installation
outside this repo, then verify:

```powershell
python -c "import icepython; print('icepython ok')"
```

Use the same Azure Postgres writer environment variables documented in
`backend/README.md`. The database role is still `helios_admin`. Configure
secrets as machine-level environment variables, user environment variables, or
an untracked `backend\.env`; do not commit secrets into this repo.

## Legacy Schedule

The old service loop ran:

- Hourly settlement jobs once per local hour Monday-Friday during
  `[05:00, 23:00)`, which includes the `22:00` launch.
- Split gas futures jobs (`gas_futures_core`, `gas_futures_gulf`,
  `gas_futures_west`, and `gas_futures_east`) run with the hourly settlement
  jobs.

It persisted attempt state at:

```text
C:\ProgramData\HeliosCTA\state\ice_python_service_state.json
```

State records include `running`, `succeeded`, `failed`, and `timed_out`
statuses plus row counts and error details when available. The current Task
Scheduler path continues to use this state file, but does not require a
resident Windows service.

The default hard timeout is 45 minutes per job. Override it with
`HELIOS_ICE_JOB_TIMEOUT_SECONDS` or the installer `-JobTimeoutSeconds`
parameter.

## Legacy Logging

The old installer set:

```powershell
HELIOS_LOG_DIR=C:\ProgramData\HeliosCTA\logs
HELIOS_STATE_DIR=C:\ProgramData\HeliosCTA\state
HELIOS_ICE_SERVICE_POLL_SECONDS=60
HELIOS_ICE_JOB_TIMEOUT_SECONDS=2700
HELIOS_ICE_JOB_LOCK_FILE=C:\ProgramData\HeliosCTA\state\ice_python_jobs.lock
```

There were two log layers:

- Service lifecycle stdout/stderr captured by NSSM:
  - `C:\ProgramData\HeliosCTA\logs\ice-python-service.stdout.log`
  - `C:\ProgramData\HeliosCTA\logs\ice-python-service.stderr.log`
- Per-pull application logs written by `backend.utils.script_logging` under
  `C:\ProgramData\HeliosCTA\logs`.

Successful per-pull file logs are deleted by default by the application logger.
Failed per-pull logs are retained. The old service stdout log recorded job
starts, job completions, failed job names, timeout events, and service
start/stop events.

Every orchestration wrapper writes one durable `ops.api_fetch_log` row for the
ICE job result. Timeout rows are written by the coordinator if the child
process is killed before the wrapper can finish. Use these rows for production
smoke checks and failure investigations.

The lock file prevents overlapping local ICE calls from a scheduled job and a
manual run. If a manual run starts while the coordinator is actively running a
job, the manual run fails fast instead of sharing the licensed ICE runtime.

## Rollback-Only Install Reference

Do not use this section for normal production operations. It exists only so an
operator can reconstruct the old NSSM service after an explicitly approved
rollback.

Install NSSM on the Windows host and make `nssm.exe` available on `PATH`, or
pass its full path with `-NssmExe`.

Run PowerShell as Administrator. The installer requires elevation and fails if
any NSSM command fails, so service updates cannot silently half-apply:

```powershell
.\infrastructure\windows-service\install_ice_python_service.ps1 `
  -PythonExe "C:\path\to\venv\Scripts\python.exe"
```

The installer creates or updates the `HeliosCTA-IcePython` service but does not
start it. Set the service Log On account in Services or NSSM if ICE XL licensing
is tied to a specific Windows user.

Before starting the legacy service, run one smoke locally:

```powershell
python -c "from backend.orchestration.ice_python.settlements import gas_next_day; raise SystemExit(gas_next_day.main(lookback_days=0))"
python -c "from backend.orchestration.ice_python import service; raise SystemExit(service.main(run_once=True))"
```

Then start and inspect the legacy service:

```powershell
nssm start HeliosCTA-IcePython
nssm status HeliosCTA-IcePython
Get-Content C:\ProgramData\HeliosCTA\logs\ice-python-service.stdout.log -Tail 100
```

Verify rows with read-only SQL against:

- `ice_python.settlements`
- `ice_python.settlement_contract_dates`
- `ops.api_fetch_log` with `provider = 'ice_python'`
- latest retained failure log under `C:\ProgramData\HeliosCTA\logs`

Recent telemetry check:

```sql
SELECT
    created_at,
    pipeline_name,
    operation_name,
    status,
    rows_written,
    error_type,
    error_message,
    metadata
FROM ops.api_fetch_log
WHERE provider = 'ice_python'
ORDER BY created_at DESC
LIMIT 20;
```

## Stop Or Remove Legacy Service

```powershell
nssm stop HeliosCTA-IcePython
.\infrastructure\windows-service\remove_ice_python_service.ps1
```
