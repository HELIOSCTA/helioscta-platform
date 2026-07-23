# Workbook Contract

This workbook is macro-enabled and local-only. Git tracks the extracted SQL,
dbt-backed update script, and this contract; `.xlsm` binaries are ignored.

## Safe Update Rule

Preserve existing Excel object names. Update only the Power Query formula body
for the existing workbook queries:

- `SFTP_METADATA`
- `ICE_SETTLES`
- `ICE_BALDAY`
- `ICE_OPTIONS`
- `ICE_FUTURES`
- `GAS_OPTIONS`
- `GAS_FUTURES`
- `GAS_BALMO`
- `GAS_OPTIONS_OTHER`
- `GAS_FUTURES_PIVOT`
- `GAS_OPTIONS_PIVOT`

Do not rename worksheets, ListObjects, query names, connection names, pivot
tables, or named ranges as part of a SQL-source migration.

## Query-To-dbt Mapping

| Workbook query | dbt compiled SQL |
| --- | --- |
| `SFTP_METADATA` | `nav_ref_excel_sftp_metadata.sql` |
| `ICE_SETTLES` | `nav_ref_excel_ice_settles.sql` |
| `ICE_BALDAY` | `nav_ref_excel_ice_balday.sql` |
| `ICE_OPTIONS` | `nav_ref_excel_ice_options.sql` |
| `ICE_FUTURES` | `nav_ref_excel_ice_futures.sql` |
| `GAS_OPTIONS` | `nav_ref_excel_gas_options.sql` |
| `GAS_FUTURES` | `nav_ref_excel_gas_futures.sql` |
| `GAS_BALMO` | `nav_ref_excel_gas_balmo.sql` |
| `GAS_OPTIONS_OTHER` | `nav_ref_excel_gas_options_other.sql` |
| `GAS_FUTURES_PIVOT` | `nav_ref_excel_gas_futures_pivot.sql` |
| `GAS_OPTIONS_PIVOT` | `nav_ref_excel_gas_options_pivot.sql` |

## Workbook Tables

The workbook currently has query-loaded tables with these stable ListObject
names:

- `SFTP_METADATA` on `Publish`
- `GAS_OPTIONS_PIVOT` on `Publish`
- `ICE_OPTIONS` and `ICE_FUTURES` on `ICE_OPTIONS`
- `ICE_SETTLES` and `ICE_BALDAY` on `ICE_SETTLES`
- `GAS_OPTIONS`, `GAS_FUTURES`, `GAS_BALMO`, and `GAS_OPTIONS_OTHER` on
  `GAS_SETTLES`

The inspected workbook had no accessible VBA module text, but preserving these
object names also protects formulas, connections, pivots, and any hidden or
external automation that refers to workbook objects by name.

## Refresh Workflow

From repo root:

```powershell
cd dbt\azure_postgres
Get-Content .env | ForEach-Object {
    if ($_ -and -not $_.Trim().StartsWith("#")) {
        $name, $value = $_ -split "=", 2
        Set-Item -Path "Env:$($name.Trim())" -Value $value.Trim().Trim('"').Trim("'")
    }
}
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\Scripts\dbt.exe compile --profiles-dir . --select path:models/positions_and_trades/2026_07_22_ref_tables/nav_positions/excel
cd ..\..
.\excel\nav\positions\2026_07_21_nav_position_file\update_workbook_queries.ps1
```

The script writes `nav_position_file_2026_july_21_ref_tables_local.xlsm` by
default. That output is ignored by git. The script refuses in-place updates and
restores `xl/vbaProject.bin` from the original workbook after Excel saves the
query changes, so the macro project binary remains byte-for-byte identical to
the source workbook. It also strips dbt's Postgres database qualifier from
compiled relation names, because Excel ODBC cannot execute three-part names such
as `"helios_prod"."nav"."positions"` against Postgres. The generated ref-table
queries use `dsn=Azure PostgreSQL;Database=helios_prod;SSLmode=require` by
default, so the existing DSN can keep supporting the legacy workbook while the
new workbook points at the promoted Azure Postgres database.

To refresh both local workbook copies and compare query tables plus pivot
outputs:

```powershell
.\excel\nav\positions\2026_07_21_nav_position_file\refresh_and_compare_workbooks.ps1
```

The comparison writes ignored local outputs under `.local/excel_compare/`.
