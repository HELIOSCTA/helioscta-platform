# Windows Task Scheduler Runtime

This folder is the local-only activation surface for ICE Python workflows.
ICE Python requires a licensed Windows ICE XL / ICE Python runtime, so these
jobs remain excluded from Linux VM systemd.

## Production Model

Task Scheduler runs one coordinator task:

```text
\HeliosCTA\ICE Python\HeliosCTA ICE Python Coordinator
```

The task runs at local hours `06`, `07`, `08`, `09`, `14`, `15`, `16`, `17`,
and `18`. Each launch calls:

```powershell
python -c "from backend.orchestration.ice_python import service; raise SystemExit(service.main(run_once=True))"
```

The Python coordinator owns the real schedule policy. It only runs due jobs,
persists once-per-hour or once-per-day state, prevents overlap with a local lock
file, launches each ICE job in a child Python process, applies hard timeouts,
and writes durable telemetry to `ops.api_fetch_log`.

This is intentionally one scheduled task, not one Task Scheduler entry per ICE
feed. Running each feed as a separate task can overload the local ICE runtime
and recreate the hung-process behavior this promoted path avoids.

## Runtime Setup

On the licensed Windows ICE host:

```powershell
cd C:\Users\AidanKeaveny\Documents\github\helioscta-platform-prod
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe -m pip install -r backend\requirements-local-windows.txt -e backend
```

Install the proprietary ICE Python wheel outside this repo, then verify:

```powershell
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe -c "import icepython; print('icepython ok')"
```

Configure Azure Postgres writer credentials using machine/user environment
variables or an untracked `backend\.env` in the production clone. Do not commit
secrets.

## Install Or Update

Run from the production clone in PowerShell:

```powershell
.\infrastructure\windows-task-scheduler\install_ice_python_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\Documents\github\helioscta-platform-prod `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -PullLatest `
  -InstallDependencies `
  -RunImportSmoke
```

The installer:

- refuses to pull when the production clone has uncommitted changes;
- fast-forwards the production clone when `-PullLatest` is passed;
- verifies writer host/user/password config exists;
- optionally installs local Windows dependencies;
- registers or updates one coordinator task under the current Windows user.

The default task uses interactive logon for the current user. That is usually
the simplest choice when ICE licensing is tied to the logged-in Windows profile.
If you change the task user in the Task Scheduler UI, verify the selected user
can import `icepython`, access the Python environment, and read writer config.

## Manual Smoke

Run one coordinator tick directly:

```powershell
.\infrastructure\windows-task-scheduler\run_ice_python_once.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\Documents\github\helioscta-platform-prod `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe
```

Start the scheduled task manually:

```powershell
Start-ScheduledTask `
  -TaskPath "\HeliosCTA\ICE Python\" `
  -TaskName "HeliosCTA ICE Python Coordinator"
```

Inspect task status and logs:

```powershell
Get-ScheduledTask `
  -TaskPath "\HeliosCTA\ICE Python\" `
  -TaskName "HeliosCTA ICE Python Coordinator"

Get-ScheduledTaskInfo `
  -TaskPath "\HeliosCTA\ICE Python\" `
  -TaskName "HeliosCTA ICE Python Coordinator"

Get-Content C:\ProgramData\HeliosCTA\logs\ice-python-task-scheduler.log -Tail 100
```

Per-pull application logs still live under
`C:\ProgramData\HeliosCTA\logs`. Successful per-pull logs are deleted by
default; failed per-pull logs are retained.

## Verify Data

Use read-only SQL:

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

Also check freshness on:

- `ice_python.settlements`
- `ice_python.settlement_contract_dates`

## Cutover From Legacy Tasks

Before enabling this coordinator, stop or disable old ICE Task Scheduler entries
that call individual ICE modules from legacy repositories. Keep only this one
coordinator active for promoted ICE settlements. Do not delete legacy tasks
until the coordinator has run successfully and downstream consumers have been
verified.

Run the cutover cleanup from an elevated PowerShell session:

```powershell
.\infrastructure\windows-task-scheduler\disable_legacy_ice_tasks.ps1
```

The cleanup script exports legacy task definitions to
`C:\ProgramData\HeliosCTA\state\task-backups`, stops and disables the legacy
per-feed ICE tasks, stops lingering ICE Python processes, and disables the old
`HeliosCTA-IcePython` NSSM service startup.

## Remove

```powershell
.\infrastructure\windows-task-scheduler\remove_ice_python_task.ps1
```
