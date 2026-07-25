# Workbook Contract

This folder is a single-query test copy of the active ref-table NAV position
Excel workbook. It must not replace the promoted workbook until manually
accepted.

## Preserved Objects

The following existing output table names and sheet locations are preserved:

- `SFTP_METADATA` on `Publish`
- `GAS_OPTIONS_PIVOT` on `Publish`
- `ICE_OPTIONS` and `ICE_FUTURES` on `ICE_OPTIONS`
- `ICE_SETTLES` and `ICE_BALDAY` on `ICE_SETTLES`
- `GAS_OPTIONS`, `GAS_FUTURES`, `GAS_BALMO`, and `GAS_OPTIONS_OTHER` on
  `GAS_SETTLES`

The connection-only `GAS_FUTURES_PIVOT` query is retained as a local
`NAV_EXCEL_BASE` consumer for compatibility with the existing workbook query
contract.

## Single-Query Rule

Only the `NAV_EXCEL_BASE` Power Query should use `Odbc.Query`. All other
workbook queries should read from:

```text
Excel.CurrentWorkbook(){[Name="NAV_EXCEL_BASE"]}[Content]
```

The `_NAV_EXCEL_BASE` sheet is intentionally visible so the base data can be
audited directly.

## Visual Contract

Visible query tables and PivotTables follow the old-backend `ICE_SETTLES_NEW`
visual language: dark blue header bands, light blue data bodies, compact row
heights, capped column widths, explicit borders, and accounting-style negative
number formats. Blank worksheet workspace should remain normal Excel grid
space, not a broad painted white canvas. QueryTable formatting preservation
stays enabled so Excel refreshes do not intentionally reset the workbook
presentation.

## Stale Tab Candidates

The workbook keeps all copied tabs for safety. Current stale-delete candidates
are documented on `Workbook_Index`:

- High confidence: `ICE XL -->`, `OPEX Mar 26th`, `Sheet1`
- Review as a group: `ICE_SETTLES_NEW`, `Positions`, `Lookback_NEW`

`Lookback` is not considered stale yet because formulas on `ICE_SETTLES`
reference it. `Publish`, `ICE_OPTIONS`, `ICE_SETTLES`, `GAS_SETTLES`, and
`_NAV_EXCEL_BASE` are active workbook tabs.

## Rebuild

From repo root:

```powershell
cd dbt\azure_postgres
dbt compile --profiles-dir . --select nav_ref_excel_base_all_tabs
cd ..\..
Copy-Item `
  -LiteralPath excel\nav\positions\2026_07_22_nav_position_file\marex_and_nav_position_file_2026_may_11_ref_tables.xlsm `
  -Destination excel\nav\positions\2026_07_22_nav_position_file_single_query_test\marex_and_nav_position_file_2026_may_11_single_query_test.xlsm `
  -Force
Copy-Item `
  -LiteralPath dbt\azure_postgres\target\compiled\helioscta_platform\models\positions_and_trades\2026_07_22_ref_tables\nav_positions\excel\nav_ref_excel_base_all_tabs.sql `
  -Destination excel\nav\positions\2026_07_22_nav_position_file_single_query_test\sql\nav_ref_excel_base_all_tabs.sql `
  -Force
.\excel\nav\positions\2026_07_22_nav_position_file_single_query_test\update_single_query_workbook.ps1
```

The script restores `xl/vbaProject.bin` from the promoted workbook after save
so the macro project remains byte-for-byte identical.
