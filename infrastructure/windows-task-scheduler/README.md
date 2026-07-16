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

Task Scheduler owns the operator-facing schedule. Each `run_once` launch runs
the current ICE batch for that local-time window, even if a feed already failed
earlier in the same hour. The hourly settlement batch, including `gas_futures`,
runs in the `06:00-10:00` and `14:00-19:00` windows. The Python coordinator
still persists per-window state for status, prevents overlap with a local lock
file, launches each ICE job in a child Python process, applies hard timeouts,
and writes durable telemetry to `ops.api_fetch_log`.

Routine scheduled task actions launch PowerShell visibly under the interactive
Windows user. This keeps Task Scheduler as the single operator surface: start
the normal scheduled task directly when you want to watch a run.

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
- registers or updates one hidden scheduled coordinator task under the current
  Windows user.

Install or update the visible status task:

```powershell
.\infrastructure\windows-task-scheduler\install_ice_python_status_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -StateDir C:\Users\AidanKeaveny\helioscta-prod\state `
  -HistoryPerFeed 5
```

This registers one no-trigger Task Scheduler task:

```text
\HeliosCTA\ICE Python\HeliosCTA ICE Python Status
```

Start it from Task Scheduler when you want a visible status window. It reads
`ice_python_service_state.json`, prints a latest summary table with last
success and failure times, prints recent history for each feed, and waits for
input before closing.

From the status window, press `R` and Enter to rerun only the latest failed or
stale-running records. Feeds with a newer successful record are skipped.

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

Start the scheduled coordinator manually. This runs quietly; open the status
task to inspect latest results and feed history.

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

Open the status window from PowerShell:

```powershell
Start-ScheduledTask `
  -TaskPath "\HeliosCTA\ICE Python\" `
  -TaskName "HeliosCTA ICE Python Status"
```

In the status window:

- press Enter to close;
- press `R` and Enter to rerun latest unresolved failures, then review the
  refreshed status table.

If a historical log opens in VS Code with red `NUL` markers, strip NUL
characters while viewing it:

```powershell
(Get-Content C:\Users\AidanKeaveny\helioscta-prod\logs\ice-python-task-scheduler.log -Raw) `
  -replace "`0", "" |
  Set-Content C:\Users\AidanKeaveny\helioscta-prod\logs\ice-python-task-scheduler.clean.log
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
`poll_wait_seconds`, and the target trade date in metadata. Its success Slack
notification confirms only that the target source trade file landed and loaded
to `clear_street.eod_transactions`; downstream SQL readiness should use a
separate notification after that layer runs and validates.
After the source file succeeds, the same scheduled process generates
`Helios_Transactions_YYYYMMDD_filtered.csv` from the packaged
`sql/generated/clear_street_trades/mufg/latest.sql` extract using the Clear Street target
trade date for the filename, uploads the CSV to MUFG SFTP, writes separate
`ops.api_fetch_log` telemetry with `provider = 'mufg_sftp'`, and queues
positions/trades Slack success or failure notifications for the MUFG leg. The
source-file success path also enqueues an internal email to
`HELIOS_EMAIL_RECIPIENTS` with the downloaded raw Clear Street CSV attached.
MUFG upload success enqueues an internal email with the generated filtered MUFG
CSV attached, and the email body includes any MUFG-side warnings. If
the MUFG output has rows with blank/null `product_code_grouping`, blank/null
`product_code_region`, and at least one blank/null vendor product code among
`ice_product_code`, `cme_product_code`, or `bbg_product_code`, it also queues a
separate positions/trades Slack warning listing the affected source products
and their Clear Street identifiers, with per-column counts in the payload for
matching rows. These internal alert emails use `ops.email_notification_outbox`;
attachment paths are stored in the outbox payload and require cached CSVs to
remain available until sent. The same source CSV is also emailed to NAV through
Microsoft Graph with separate `ops.api_fetch_log` telemetry using
`provider = 'microsoft_graph'`. The Clear Street target source file is the
scheduler's freshness gate;
MUFG-side empty-extract and SQL `sftp_date` mismatch conditions are metadata
only. MUFG and NAV are attempted independently after source success. If either
downstream handoff fails, the scheduled task exits nonzero after attempting the
enabled downstream handoffs, while the Clear Street source-load telemetry
remains successful.

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
It also verifies `MUFG_SFTP_HOST`, `MUFG_SFTP_USER`, and
`MUFG_SFTP_PASSWORD`; `MUFG_SFTP_PORT` defaults to `22`, and
`MUFG_SFTP_REMOTE_DIR` defaults to `/`. NAV email delivery requires
`AZURE_OUTLOOK_CLIENT_ID`, `AZURE_OUTLOOK_TENANT_ID`, and
`AZURE_OUTLOOK_CLIENT_SECRET`. Email sends default to
`aidan.keaveny@helioscta.com` through `AZURE_OUTLOOK_SENDER` or
`CLEAR_STREET_NAV_EMAIL_SENDER`, and `CLEAR_STREET_NAV_EMAIL_RECIPIENTS`
defaults to the legacy NAV recipient list. Slack delivery also requires
`SLACK_BOT_TOKEN`,
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
WHERE provider IN ('clear_street_sftp', 'mufg_sftp', 'microsoft_graph')
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

## NAV Positions

Task Scheduler runs one daily task:

```text
\HeliosCTA\Positions And Trades\HeliosCTA NAV Positions
```

The task starts daily at local hour `04` by default and polls every five
minutes until `11:00` local time. Each launch calls:

```powershell
python -c "from backend.orchestration.nav import positions; raise SystemExit(positions.scheduled_main(lookback_days=1, poll_wait_seconds=300, poll_window_minutes=420, poll_deadline_hour=11))"
```

The Python orchestration targets the previous business NAV date by default,
downloads matching NAV `Position Valuation Detail Report` workbooks for `agr`,
`moross`, `pnt`, and `titan`, and caches arrivals under
`backend\scrapes\nav\downloads\<fund>\`. It waits to parse and upsert
`nav.positions` until every selected fund has the target NAV date. The
scheduled path writes one resolved `ops.api_fetch_log` row with
`operation_name = 'nav_positions_scheduled'`, `run_mode = 'scheduler'`,
`poll_count`, `poll_wait_seconds`, `poll_deadline_hour`, `target_nav_date`, and
missing-fund metadata. It exits nonzero if the target files miss the polling
window. When the scheduled load succeeds, it enqueues one duplicate-safe
ready-for-review email per `HELIOS_EMAIL_RECIPIENTS` recipient with the cached
NAV workbooks attached; actual Microsoft Graph delivery still depends on
`HELIOS_EMAIL_NOTIFICATIONS_ENABLED=true` and the email outbox sender.

Run from the production clone in PowerShell:

```powershell
.\infrastructure\windows-task-scheduler\install_nav_positions_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -InstallDependencies `
  -RunImportSmoke
```

The installer verifies writer credentials plus `NAV_SFTP_HOST`,
`NAV_SFTP_USER`, and `NAV_SFTP_PASSWORD` from machine/user environment
variables or the untracked `backend\.env` in the production clone.
`NAV_SFTP_PORT` defaults to `22`, and `NAV_SFTP_REMOTE_DIR` defaults to `/`.

Manual smoke:

```powershell
.\infrastructure\windows-task-scheduler\run_nav_positions_once.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs
```

Inspect task status and logs:

```powershell
Get-ScheduledTask `
  -TaskPath "\HeliosCTA\Positions And Trades\" `
  -TaskName "HeliosCTA NAV Positions"

Get-ScheduledTaskInfo `
  -TaskPath "\HeliosCTA\Positions And Trades\" `
  -TaskName "HeliosCTA NAV Positions"

Get-Content C:\Users\AidanKeaveny\helioscta-prod\logs\nav-positions-task-scheduler.log -Tail 100
```

## NAV Trade Breaks

Task Scheduler runs one daily task:

```text
\HeliosCTA\Positions And Trades\HeliosCTA NAV Trade Breaks
```

The task starts daily at local hour `04` by default and polls every five
minutes until `11:00` local time, matching NAV positions. Each launch calls:

```powershell
python -c "from backend.orchestration.nav import trade_breaks_email; raise SystemExit(trade_breaks_email.scheduled_main(lookback_days=1, poll_wait_seconds=300, poll_window_minutes=420, poll_deadline_hour=11))"
```

The Python orchestration targets the previous business NAV date by default,
downloads the matching NAV `Trade Breaks Detail Report` workbook, and caches it
under `backend\scrapes\nav\downloads\trade_breaks\`. A target workbook with
zero parsed trade-break rows is still a successful arrival and sends a
templated "No NAV trade breaks found" email with the workbook attached. The
scheduled path writes one resolved `ops.api_fetch_log` row with
`operation_name = 'nav_trade_breaks_email_scheduled'`, `run_mode =
'scheduler'`, `poll_count`, `poll_wait_seconds`, `poll_deadline_hour`, and
`target_nav_date`. It exits nonzero if the target Trade Breaks workbook misses
the polling window.

Run from the production clone in PowerShell:

```powershell
.\infrastructure\windows-task-scheduler\install_nav_trade_breaks_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -InstallDependencies `
  -RunImportSmoke
```

Manual smoke:

```powershell
.\infrastructure\windows-task-scheduler\run_nav_trade_breaks_once.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs
```

Inspect task status and logs:

```powershell
Get-ScheduledTask `
  -TaskPath "\HeliosCTA\Positions And Trades\" `
  -TaskName "HeliosCTA NAV Trade Breaks"

Get-ScheduledTaskInfo `
  -TaskPath "\HeliosCTA\Positions And Trades\" `
  -TaskName "HeliosCTA NAV Trade Breaks"

Get-Content C:\Users\AidanKeaveny\helioscta-prod\logs\nav-trade-breaks-task-scheduler.log -Tail 100
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
WHERE provider = 'nav_sftp'
ORDER BY created_at DESC
LIMIT 20;

SELECT
    fund_code,
    COUNT(*) AS row_count,
    MAX(nav_date) AS latest_nav_date,
    MAX(sftp_upload_timestamp) AS latest_upload
FROM nav.positions
GROUP BY fund_code
ORDER BY fund_code;
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
