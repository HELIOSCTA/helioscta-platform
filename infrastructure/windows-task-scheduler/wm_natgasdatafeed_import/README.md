# WoodMac NatGas Datafeed Import

Migration status: platform tasks are registered from this repo under
`\HeliosCTA\NatGas\` on the scheduler host. Use the elevated installer after
pulling scheduler changes so the registered task definitions match this package.

The previous legacy Windows Task Scheduler jobs used this folder and checkout:

```text
\helioscta-azure-backend\NatGas\wm_natgasdatafeed_import delta 20
\helioscta-azure-backend\NatGas\wm_natgasdatafeed_import delta 30
\helioscta-azure-backend\NatGas\wm_natgasdatafeed_import delta 40
\helioscta-azure-backend\NatGas\wm_natgasdatafeed_import hourly
\helioscta-azure-backend\NatGas\wm_natgasdatafeed_import metadata
```

## Contents

- `gasdatafeed_import.ps1` - vendor PowerShell import runtime.
- `gasdatafeed_merge_sql_scripts.ps1` - merge SQL generator used by the import.
- `wm_natgasdatafeed_task_lib.ps1` - shared scheduler wrapper helpers for
  config validation, locking, DB checks, vendor-script execution, and health
  gates.
- `run_wm_natgasdatafeed_delta.ps1` - scheduled delta wrapper.
- `run_wm_natgasdatafeed_hourly.ps1` - scheduled hourly wrapper that runs
  `metadata` first, then the explicitly scheduled hourly sources
  `pipeline_inventory` and `gas_production_forecast`.
- `run_wm_natgasdatafeed_index_of_customers.ps1` - manual-only wrapper for the
  quarterly Index of Customers load.
- `install_wm_natgasdatafeed_tasks.ps1` - elevated cutover installer that
  registers the platform-owned wrapper tasks and can disable the legacy tasks.
- `.ts.delta.ps1`, `.ts.hourly.ps1`, `.ts.metadata.ps1` - copied Task
  Scheduler registration helper names retained as compatibility entry points.
  They delegate to `install_wm_natgasdatafeed_tasks.ps1`.
- `sql/` - vendor table, procedure, and source registry setup scripts.
- `.verify/` - local verification notes and read-only health queries.
- `gasdatafeed_import.json` - local runtime config, intentionally gitignored
  because it contains live SQL/API credentials.
  It must include `base_url`, `api_key`, `datafeed_secret`, `working_path`, and
  `db_conf` values on the scheduler host.

Vendor PDF references are stored outside git under:

```text
.local/.vendor-docs/wm_natgasdatafeed_import/
```

## Target Schedule

The platform schedule follows the WoodMac setup guide job model while using
Windows Task Scheduler instead of SQL Agent:

| Task | Cadence | Wrapper behavior |
|------|---------|------------------|
| `HeliosCTA WM NatGas DataFeed Delta` | Every 5 minutes by default | Runs `gasdatafeed_import.ps1 -sourceType delta` |
| `HeliosCTA WM NatGas DataFeed Hourly` | Hourly at `:10` by default | Waits up to 15 minutes for the shared lock, then runs `metadata`, `hourly -sourceName pipeline_inventory`, and `hourly -sourceName gas_production_forecast` |
| `HeliosCTA WM NatGas DataFeed Index of Customers Manual` | Manual/no trigger | Runs `hourly -sourceName index_of_customers` on demand |
| `HeliosCTA WM NatGas DataFeed Status` | Manual/no trigger | Visible read-only status window |

The delta and hourly wrappers share one lock under the configured
`working_path`, so overlapping launches do not collide on shared temp/staging
tables. Delta skips when another import is already active; hourly waits before
skipping so a short delta run does not cause the hourly feed to miss its whole
window.

The lock is owner-aware:

- lock files include the creating task, machine, process id, process start time,
  and owner id.
- a wrapper releases the lock only when it still owns the current lock file.
- orphaned locks with a dead or reused PID are removed automatically.
- live but idle locks are not removed automatically; they are marked stale in
  `wm_natgasdatafeed_import.lock.stale.json`, logged as errors, and cause the
  wrapper to exit nonzero.

The installer sets Task Scheduler's multiple-instance policy to `IgnoreNew`.
Task Scheduler prevents duplicate task instances for the same task, while the
shared wrapper lock still serializes delta, hourly, and manual Index of
Customers runs against each other.

Routine delta and hourly task actions launch through
`conhost.exe --headless powershell.exe`, matching the ICE Python scheduler
pattern. This prevents the frequent import windows from stealing focus in the
interactive Windows session. The status task remains visible and is the
operator surface for checking scheduler, lock, load-status, SQL-error, and log
health.

The wrapper log is written under:

```text
C:\Datafeed\_scheduler\wm_natgasdatafeed_task_scheduler.log
```

## Legacy Observed Schedule

The currently registered legacy tasks use this older split schedule:

| Task mode | Task names | Cadence | Script argument |
|-----------|------------|---------|-----------------|
| Metadata | `metadata` | Hourly at `:05` and `:10` | `-sourceType metadata` |
| Delta | `delta 20`, `delta 30`, `delta 40` | Hourly at `:20`, `:30`, `:40` | `-sourceType delta` |
| Hourly | `hourly` | Hourly at `:50` | `-sourceType hourly` |
| Baseline | none scheduled | Manual only | `-sourceType baseline` |

`delta` is a task mode, not a value stored in `natgas.source.source_type`.
Inside `gasdatafeed_import.ps1`, `-sourceType delta` selects
`source_type = 'hourly' AND load_type = 'incremental'`. A raw `-sourceType
hourly` command selects every `source_type = 'hourly' AND load_type !=
'incremental'` source row, including manual-only rows such as
`index_of_customers`. The platform hourly wrapper intentionally calls only the
scheduled hourly source names.

## Monitoring

Use all three surfaces when checking feed health:

1. Task Scheduler state confirms whether Windows launched the process.
2. Per-run logs live under the configured `working_path`, currently
   `C:\Datafeed\datafeed_<guid>\gasdatafeed_import_*.log` on the scheduler
   host when tasks pass `-writeLog true`.
3. Database tables confirm whether files actually merged:
   - `natgas.load_status` is the import ledger.
   - `administration.error_log` captures SQL procedure failures.

Task Scheduler success alone is not enough; a task can return `0` while merge
procedures write rows to `administration.error_log`.

The platform wrappers add a scheduler-level health gate: after a vendor script
returns, the wrapper checks for new pending `natgas.load_status` rows and new
`administration.error_log` rows. New merge errors cause the wrapper task to exit
nonzero even when the vendor script returns `0`.

Read-only verification examples live in `.verify/notes.md`.

## Status Window

Use the status helper directly from PowerShell:

```powershell
.\show_wm_natgasdatafeed_status.ps1
```

Install or update the visible no-trigger Task Scheduler status task:

```powershell
.\install_wm_natgasdatafeed_status_task.ps1
```

Then open the status window from Task Scheduler, or start it from PowerShell:

```powershell
Start-ScheduledTask `
  -TaskPath "\HeliosCTA\NatGas\" `
  -TaskName "HeliosCTA WM NatGas DataFeed Status"
```

The helper is read-only. It shows platform and legacy task state, shared-lock
state, latest `natgas.load_status` rows by source, recent per-source history,
pending load rows, recent `administration.error_log` rows when visible, and
latest `C:\Datafeed\datafeed_*` log files.

## Manual Commands

These commands are for explicit manual operator use only. Run them from the
package directory after confirming the target config file and credentials are
correct:

```powershell
.\gasdatafeed_import.ps1 -sourceType metadata -writeLog true -Verbose
.\gasdatafeed_import.ps1 -sourceType hourly -sourceName pipeline_inventory -writeLog true -Verbose
.\gasdatafeed_import.ps1 -sourceType hourly -sourceName gas_production_forecast -writeLog true -Verbose
.\gasdatafeed_import.ps1 -sourceType delta -writeLog true -Verbose
```

Index of Customers is a quarterly vendor dataset and is not part of the hourly
schedule. Run it only when needed:

```powershell
.\run_wm_natgasdatafeed_index_of_customers.ps1
```

Or start its no-trigger Task Scheduler task:

```powershell
Start-ScheduledTask `
  -TaskPath "\HeliosCTA\NatGas\" `
  -TaskName "HeliosCTA WM NatGas DataFeed Index of Customers Manual"
```

Baseline loads are historical and can take hours or days:

```powershell
.\gasdatafeed_import.ps1 -sourceType baseline -writeLog true -Verbose
```

## Cutover Notes

Before scheduling this repo copy:

1. Confirm `gasdatafeed_import.json` exists locally on the scheduler host and
   is not committed.
2. Confirm vendor docs and `.verify/notes.md` checks match the target database.
3. Re-register tasks only during an approved cutover window.
4. Verify Scheduler state, `natgas.load_status`, `administration.error_log`,
   and recent `C:\Datafeed\` logs after cutover.

Run the cutover from an elevated PowerShell session:

```powershell
cd C:\Users\AidanKeaveny\Documents\github\helioscta-platform\infrastructure\windows-task-scheduler\wm_natgasdatafeed_import
.\install_wm_natgasdatafeed_tasks.ps1 -DisableLegacy
```

The default delta cadence is 5 minutes. Use `-DeltaIntervalMinutes 1` only if
you need WoodMac's every-minute cadence and have confirmed the wrapper logs stay
clean at that frequency.

Expected platform task path after cutover:

```text
\HeliosCTA\NatGas\
```
