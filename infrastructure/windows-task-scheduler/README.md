# Windows Task Scheduler Runtime

This folder is the local-only activation surface for Windows-hosted workflows.
ICE Python requires a licensed Windows ICE XL / ICE Python runtime, and Clear
Street EOD transaction pulls use local SFTP credentials, so these jobs remain
excluded from Linux VM systemd until explicitly promoted there.

## Folder Layout

```text
ice_python/                 ICE Python coordinator, status, and legacy cleanup
positions_and_trades/       NAV and Clear Street scheduled jobs and status
wm_natgasdatafeed_import/   WoodMac/Genscape migration reference package
```

## Production Model

Task Scheduler runs two ICE coordinator tasks:

```text
\HeliosCTA\ICE Python\HeliosCTA ICE Python Short Term Coordinator
\HeliosCTA\ICE Python\HeliosCTA ICE Python Futures Coordinator
```

The short-term coordinator runs weekdays every 15 minutes from local `05:10`
through `22:55` with `job_group=short_term`. It refreshes the near-term markets
used by the frontend short-term price views:

```text
pjm_short_term
ercot_short_term
gas_next_day
gas_balmo
```

Within that group, each job runs as a current-day price refresh for `Settle`,
`VWAP Close`, and `Volume`, with contract-date pulls skipped. That keeps the
frequent frontend freshness path separate from the heavier historical and
contract-date work.

The futures coordinator runs hourly on weekdays at local hours `05` through
`22` with `job_group=futures`. It refreshes heavier futures/monthly markets:

```text
pjm_futures
ercot_futures
west_power_futures
east_power_futures
gas_futures_core
gas_futures_gulf
gas_futures_west
gas_futures_east
```

Both tasks call the same wrapper and Python coordinator module:

```powershell
python -c "from backend.orchestration.ice_python import service; raise SystemExit(service.main(run_once=True, job_group='<group>'))"
```

The imported module is still named `service` for compatibility with the older
NSSM path, but Task Scheduler owns the operator-facing schedule. Each
`run_once` launch runs the selected ICE job group for that local-time window,
even if a feed already failed earlier in the same hour. The Python coordinator
still persists
per-window state for status, prevents same-feed overlap with local lock files,
launches each ICE job in a child Python process, applies hard timeouts, and
writes durable telemetry to `ops.api_fetch_log`.

Routine scheduled coordinator actions launch hidden under the interactive
Windows user. Use the visible status task as the operator surface.

This is intentionally one scheduled coordinator task per job group, not one
Task Scheduler entry per ICE feed. Feed-level status and retries are handled
inside the coordinator/status scripts. The legacy `all` coordinator can remain
registered as a fallback, but it should be disabled once the short-term and
futures coordinators are active to avoid duplicate pulls.

## Runtime Setup

On the licensed Windows ICE host:

```powershell
cd C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe -m pip install -r backend\requirements-local-windows.txt -e backend
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe .\infrastructure\windows-task-scheduler\ice_python\install_ice_python.py
```

Recommended local runtime layout:

```text
C:\Users\AidanKeaveny\helioscta-prod\
  helioscta-platform\
  state\
  logs\
```

The ICE Python installer resolves the proprietary wheel from the licensed ICE XL
bin directory, defaulting to
`%LOCALAPPDATA%\ICE Data Services\ICE XL\bin`. If the wheel lives somewhere
else, pass `--wheel` or `--ice-bin`:

```powershell
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe .\infrastructure\windows-task-scheduler\ice_python\install_ice_python.py `
  --wheel "C:\Path\To\theice.com_ICEPython-0.0.6-py3-none-any.whl"
```

Then verify:

```powershell
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe -c "import icepython; print('icepython ok')"
```

Configure Azure Postgres writer credentials using machine/user environment
variables or an untracked `backend\.env` in the production clone. Do not commit
secrets.

## Install Or Update

Run from the production clone in PowerShell.

Use `-InstallIcePython` on the first install or after the licensed ICE XL wheel
changes. Omit it for routine scheduler-only updates.

Install or update the short-term coordinator:

```powershell
.\infrastructure\windows-task-scheduler\ice_python\install_ice_python_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -TaskName "HeliosCTA ICE Python Short Term Coordinator" `
  -JobGroup short_term `
  -RunStartHour 5 `
  -RunEndHour 22 `
  -StartMinute 10 `
  -IntervalMinutes 15 `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -StateDir C:\Users\AidanKeaveny\helioscta-prod\state `
  -PullLatest `
  -InstallDependencies `
  -InstallIcePython `
  -RunImportSmoke
```

Install or update the futures coordinator:

```powershell
.\infrastructure\windows-task-scheduler\ice_python\install_ice_python_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -TaskName "HeliosCTA ICE Python Futures Coordinator" `
  -JobGroup futures `
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
- registers or updates one hidden weekday coordinator task under the current
  Windows user. Python also decides whether any selected ICE feeds are due for
  that local-time window.

Install or update the visible status task:

```powershell
.\infrastructure\windows-task-scheduler\ice_python\install_ice_python_status_task.ps1 `
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

The status window shows an `ACTIONS` block. Press `R` to rerun only the latest
failed or stale-running records, or press `Q`/Enter to close. Feeds with a newer
successful record are skipped.

ICE reruns use per-feed lock files. That means a failed `gas_balmo` retry can
run while the coordinator is still working on `west_power_futures`, but a second
`gas_balmo` run will be blocked until the first one exits.

The default task uses interactive logon for the current user. That is usually
the simplest choice when ICE licensing is tied to the logged-in Windows profile.
If you change the task user in the Task Scheduler UI, verify the selected user
can import `icepython`, access the Python environment, and read writer config.

## Manual Smoke

Run one short-term coordinator tick directly:

```powershell
.\infrastructure\windows-task-scheduler\ice_python\run_ice_python_once.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -StateDir C:\Users\AidanKeaveny\helioscta-prod\state `
  -JobGroup short_term
```

Start a scheduled coordinator manually. This runs quietly; open the status task
to inspect latest results and feed history.

```powershell
Start-ScheduledTask `
  -TaskPath "\HeliosCTA\ICE Python\" `
  -TaskName "HeliosCTA ICE Python Short Term Coordinator"
```

Inspect task status and logs:

```powershell
Get-ScheduledTask `
  -TaskPath "\HeliosCTA\ICE Python\" `
  -TaskName "HeliosCTA ICE Python Short Term Coordinator"

Get-ScheduledTaskInfo `
  -TaskPath "\HeliosCTA\ICE Python\" `
  -TaskName "HeliosCTA ICE Python Short Term Coordinator"

Get-Content C:\Users\AidanKeaveny\helioscta-prod\logs\ice-python-task-scheduler.log -Tail 100
```

Open the status window from PowerShell:

```powershell
Start-ScheduledTask `
  -TaskPath "\HeliosCTA\ICE Python\" `
  -TaskName "HeliosCTA ICE Python Status"
```

In the status window:

- press `R` to rerun latest unresolved failures, then review the refreshed
  status table;
- press `Q` or Enter to close.

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

## WoodMac NatGas Datafeed Import

The legacy raw WoodMac/Genscape NatGas datafeed Task Scheduler package has
been copied here for migration and scheduler management context only:

```text
infrastructure/windows-task-scheduler/wm_natgasdatafeed_import/
```

Migration status: reference-only in this repo. Do not run the copied `.ts.*`
registration scripts until the Task Scheduler cutover is explicitly approved.

The current live tasks still run from the legacy
`helioscta-azure-backend` checkout until cutover:

```text
\helioscta-azure-backend\NatGas\wm_natgasdatafeed_import delta 20
\helioscta-azure-backend\NatGas\wm_natgasdatafeed_import delta 30
\helioscta-azure-backend\NatGas\wm_natgasdatafeed_import delta 40
\helioscta-azure-backend\NatGas\wm_natgasdatafeed_import hourly
\helioscta-azure-backend\NatGas\wm_natgasdatafeed_import metadata
```

The copied package includes the original `.ts.*` registration helpers, SQL
setup and verification files, and the PowerShell import runtime. The local
`gasdatafeed_import.json` file is intentionally gitignored because it contains
live SQL/API credentials. Keep the local file available on the scheduler host,
but do not commit it.

Observed live cadence:

- metadata: hourly at `:05` and `:10`;
- delta: hourly at `:20`, `:30`, and `:40`;
- hourly: hourly at `:50`;
- baseline: manual only.

For monitoring, use Task Scheduler state, per-run logs under the configured
datafeed working path, `natgas.load_status`, and `administration.error_log`.
Task Scheduler success alone does not prove the feed merged successfully.

## Positions And Trades Status Window

Routine NAV and Clear Street scheduled actions launch hidden under the
interactive Windows user. Use the visible positions/trades status task as the
operator surface for task state, recent logs, and explicit manual starts.

Install or update the visible status task:

```powershell
.\infrastructure\windows-task-scheduler\positions_and_trades\install_positions_trades_status_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -HistoryLines 35
```

This registers one no-trigger Task Scheduler task:

```text
\HeliosCTA\Positions And Trades\HeliosCTA Positions And Trades Status
```

Start it from Task Scheduler when you want a visible status window. It prints
the latest Task Scheduler state for NAV Positions, NAV Trade Breaks, and Clear
Street EOD Transactions, shows recent scheduler log tails with NUL characters
stripped for readability, and waits for input before closing.

The status window shows an `ACTIONS` block. Press `P` to start NAV Positions,
`T` to start NAV Trade Breaks, `C` to start Clear Street EOD Transactions, or
press `Q`/Enter to close. Manual starts use the installed hidden scheduled task
definitions, so the status window remains the visible operator surface.

After pulling a repo version that includes the hidden routine-window behavior,
rerun the NAV Positions, NAV Trade Breaks, and Clear Street installers so the
registered task actions pick up `-WindowStyle Hidden`.

## Clear Street EOD Transactions

Task Scheduler runs one overnight task:

```text
\HeliosCTA\Positions And Trades\HeliosCTA Clear Street EOD Transactions
```

The task starts daily at local hour `19`. Each launch calls:

```powershell
python -c "from backend.orchestration.clear_street import transactions; raise SystemExit(transactions.scheduled_main(poll_wait_seconds=300))"
```

Routine Clear Street launches are hidden; use the positions/trades status task
when you want a visible operator window.

The Python orchestration owns the target-date policy. For an overnight window
that starts at 19:00 and ends at 05:00, the target trade date is the date at
the 19:00 window start. After midnight, the same process continues polling for
the prior evening's target file. It exits as soon as the target
`Helios_Transactions_YYYYMMDD.csv` file is processed, or exits nonzero at the
05:00 timeout. The scheduled path writes one resolved `ops.api_fetch_log` row
with `operation_name = 'clear_street_eod_transactions_poll'`, `poll_count`,
`poll_wait_seconds`, and the target trade date in metadata.
After the source file succeeds, the same scheduled process generates
`Helios_Transactions_YYYYMMDD_filtered.csv` from the packaged
`sql/generated/clear_street_trades/mufg/latest.sql` extract using the Clear Street target
trade date for the filename, uploads the CSV to MUFG SFTP, writes separate
`ops.api_fetch_log` telemetry with `provider = 'mufg_sftp'`. The source-file
success path also enqueues an internal email to
`HELIOS_EMAIL_RECIPIENTS` with the downloaded raw Clear Street CSV attached.
MUFG upload success enqueues an internal email with the generated filtered MUFG
CSV attached, and the email body includes any MUFG-side warnings. If
the MUFG output has rows with blank/null `product_code_grouping`, blank/null
`product_code_region`, and at least one blank/null vendor product code among
`ice_product_code`, `cme_product_code`, or `bbg_product_code`, the email body
includes the affected source products and their Clear Street identifiers. These
internal alert emails use `ops.email_notification_outbox`;
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
.\infrastructure\windows-task-scheduler\positions_and_trades\install_clear_street_task.ps1 `
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
defaults to the legacy NAV recipient list.

Manual smoke:

```powershell
.\infrastructure\windows-task-scheduler\positions_and_trades\run_clear_street_transactions_poll.ps1 `
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

Routine NAV Positions launches are hidden; use the positions/trades status task
when you want a visible operator window.

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
.\infrastructure\windows-task-scheduler\positions_and_trades\install_nav_positions_task.ps1 `
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
.\infrastructure\windows-task-scheduler\positions_and_trades\run_nav_positions_once.ps1 `
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

Routine NAV Trade Breaks launches are hidden; use the positions/trades status
task when you want a visible operator window.

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
.\infrastructure\windows-task-scheduler\positions_and_trades\install_nav_trade_breaks_task.ps1 `
  -RepoRoot C:\Users\AidanKeaveny\helioscta-prod\helioscta-platform `
  -PythonExe C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\python.exe `
  -LogDir C:\Users\AidanKeaveny\helioscta-prod\logs `
  -InstallDependencies `
  -RunImportSmoke
```

Manual smoke:

```powershell
.\infrastructure\windows-task-scheduler\positions_and_trades\run_nav_trade_breaks_once.ps1 `
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

Before enabling these coordinators, stop or disable old ICE Task Scheduler
entries that call individual ICE modules from legacy repositories. Keep only the
short-term and futures coordinators active for promoted ICE settlements. Do not
delete legacy tasks until the coordinators have run successfully and downstream
consumers have been verified.

Run the cutover cleanup from an elevated PowerShell session:

```powershell
.\infrastructure\windows-task-scheduler\ice_python\disable_legacy_ice_tasks.ps1
```

The cleanup script exports legacy task definitions to
`C:\ProgramData\HeliosCTA\state\task-backups`, stops and disables the legacy
per-feed ICE tasks, stops lingering ICE Python processes, and disables the old
`HeliosCTA-IcePython` NSSM service startup.

## Remove

```powershell
.\infrastructure\windows-task-scheduler\ice_python\remove_ice_python_task.ps1
```
