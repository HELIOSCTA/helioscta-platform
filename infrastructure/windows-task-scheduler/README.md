# Windows Task Scheduler Runtime

This folder is the local-only activation surface for Windows-hosted workflows.
ICE Python requires a licensed Windows ICE XL / ICE Python runtime, and Clear
Street EOD transaction pulls use local SFTP credentials, so these jobs remain
excluded from Linux VM systemd until explicitly promoted there.

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
cd C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe -m pip install -r backend\requirements-local-windows.txt -e backend
```

Recommended local runtime layout:

```text
C:\Users\AidanKeaveny\helioscta-prod\
  helioscta-platform\
  state\
  logs\
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
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -StateDir C:\Users\AidanKeaveny\helioscta-prod\state `
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
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -StateDir C:\Users\AidanKeaveny\helioscta-prod\state
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

Get-Content C:\Users\AidanKeaveny\helioscta-prod\logs\ice-python-task-scheduler.log -Tail 100
```

Per-pull application logs still live under
`C:\Users\AidanKeaveny\helioscta-prod\logs`. Successful per-pull logs are deleted by
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

## Clear Street EOD Transactions

Task Scheduler runs one overnight task:

```text
\HeliosCTA\Positions And Trades\HeliosCTA Clear Street EOD Transactions
```

The task starts daily at local hour `19`. Each launch calls:

```powershell
python -c "from backend.orchestration.clear_street import transactions; raise SystemExit(transactions.scheduled_main(poll_wait_seconds=300))"
```

The Python orchestration owns the target-date policy. For an overnight window
that starts at 19:00 and ends at 05:00, the target trade date is the date at
the 19:00 window start. After midnight, the same process continues polling for
the prior evening's target file. It exits as soon as the target
`Helios_Transactions_YYYYMMDD.csv` file is processed, or exits nonzero at the
05:00 timeout. The scheduled path writes one resolved `ops.api_fetch_log` row
with `operation_name = 'clear_street_eod_transactions_poll'`, `poll_count`,
`poll_wait_seconds`, and the target trade date in metadata.

Run from the production clone in PowerShell:

```powershell
.\infrastructure\windows-task-scheduler\install_clear_street_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -StateDir C:\Users\AidanKeaveny\helioscta-prod\state `
  -InstallDependencies `
  -RunImportSmoke
```

The installer verifies writer credentials plus `CLEAR_STREET_SFTP_HOST`,
`CLEAR_STREET_SFTP_USER`, and `CLEAR_STREET_SSH_KEY_CONTENT` from machine/user
environment variables or the untracked `backend\.env` in the production clone.
Slack delivery also requires `SLACK_BOT_TOKEN`,
`SLACK_POSITIONS_TRADES_ALERTS_CHANNEL_ID`, and
`HELIOS_SLACK_NOTIFICATIONS_ENABLED=true`.

Manual smoke:

```powershell
.\infrastructure\windows-task-scheduler\run_clear_street_transactions_poll.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -StateDir C:\Users\AidanKeaveny\helioscta-prod\state
```

Inspect task status and logs:

```powershell
Get-ScheduledTask `
  -TaskPath "\HeliosCTA\Positions And Trades\" `
  -TaskName "HeliosCTA Clear Street EOD Transactions"

Get-ScheduledTaskInfo `
  -TaskPath "\HeliosCTA\Positions And Trades\" `
  -TaskName "HeliosCTA Clear Street EOD Transactions"

Get-Content C:\Users\AidanKeaveny\helioscta-prod\logs\clear-street-task-scheduler.log -Tail 100
```

Verify data and telemetry with read-only SQL:

```sql
SELECT
    created_at,
    operation_name,
    status,
    rows_written,
    error_type,
    error_message,
    metadata
FROM ops.api_fetch_log
WHERE provider = 'clear_street_sftp'
ORDER BY created_at DESC
LIMIT 20;

SELECT
    trade_date_from_sftp,
    COUNT(*) AS row_count,
    MAX(sftp_upload_timestamp) AS latest_upload
FROM clear_street.eod_transactions
GROUP BY trade_date_from_sftp
ORDER BY trade_date_from_sftp DESC
LIMIT 10;
```

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
