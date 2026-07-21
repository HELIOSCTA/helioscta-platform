# WoodMac NatGas Datafeed Import

Migration status: copied into this repo for reference and future scheduler
management only. Do not run the `.ts.*.ps1` registration scripts from this
checkout until the task cutover is explicitly approved.

The live Windows Task Scheduler jobs currently remain under the legacy task
folder and still point at the legacy `helioscta-azure-backend` checkout:

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
- `.ts.delta.ps1`, `.ts.hourly.ps1`, `.ts.metadata.ps1` - copied Task
  Scheduler registration helpers. These are not active from this repo yet.
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

## Observed Schedule

The copied `.ts.*` scripts match the currently observed Windows schedule:

| Task mode | Task names | Cadence | Script argument |
|-----------|------------|---------|-----------------|
| Metadata | `metadata` | Hourly at `:05` and `:10` | `-sourceType metadata` |
| Delta | `delta 20`, `delta 30`, `delta 40` | Hourly at `:20`, `:30`, `:40` | `-sourceType delta` |
| Hourly | `hourly` | Hourly at `:50` | `-sourceType hourly` |
| Baseline | none scheduled | Manual only | `-sourceType baseline` |

`delta` is a task mode, not a value stored in `natgas.source.source_type`.
Inside `gasdatafeed_import.ps1`, `-sourceType delta` selects
`source_type = 'hourly' AND load_type = 'incremental'`. The `-sourceType
hourly` task selects `source_type = 'hourly' AND load_type != 'incremental'`.

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

Read-only verification examples live in `.verify/notes.md`.

## Manual Commands

These commands are for explicit manual operator use only. Run them from the
package directory after confirming the target config file and credentials are
correct:

```powershell
.\gasdatafeed_import.ps1 -sourceType metadata -writeLog true -Verbose
.\gasdatafeed_import.ps1 -sourceType hourly -writeLog true -Verbose
.\gasdatafeed_import.ps1 -sourceType delta -writeLog true -Verbose
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
3. Decide the final Task Scheduler folder and task names.
4. Re-register tasks only during an approved cutover window.
5. Verify Scheduler state, `natgas.load_status`, `administration.error_log`,
   and recent `C:\Datafeed\` logs after cutover.
