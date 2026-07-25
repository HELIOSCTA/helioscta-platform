# NAV Position File Single-Query Test

Isolated experiment for the 2026-07-22 NAV position workbook. This folder
keeps the promoted workbook untouched and tests a one-database-query Excel
architecture.

## Contents

- `marex_and_nav_position_file_2026_may_11_single_query_test.xlsm` - local
  copied test workbook, ignored by git when present.
- `sql/nav_ref_excel_base_all_tabs.sql` - compiled dbt SQL snapshot loaded by
  the visible `_NAV_EXCEL_BASE` workbook sheet.
- `update_single_query_workbook.ps1` - rebuilds the copied workbook so
  `NAV_EXCEL_BASE` is the only ODBC query and the visible report tables are
  populated from the loaded base table.
- `workbook_contract.md` - workbook/query contract and verification notes.

## Design

The workbook uses one database pull into the visible `_NAV_EXCEL_BASE` sheet.
The existing workbook tables keep their names, shapes, formulas, and sheet
locations. The script also leaves the connection-only `GAS_FUTURES_PIVOT`
Power Query in place as a local query against `NAV_EXCEL_BASE`.

`Workbook_Index` is a visible navigation/status sheet. It documents active
tabs, support tabs, and stale-delete candidates without deleting or renaming
anything.

This is an Excel-only artifact test. The dbt model is ephemeral and does not
create a database view or table.
