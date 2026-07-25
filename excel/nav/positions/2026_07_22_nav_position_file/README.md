# NAV Position File 2026-07-22

Versioned ref-table NAV position Excel model built from the current
old-backend source workbook `marex_and_nav_position_file_2026_may_11.xlsm`.

## Contents

- `marex_and_nav_position_file_2026_may_11.xlsm` - local copied old-backend
  source workbook binary, ignored by git when present.
- `marex_and_nav_position_file_2026_may_11_ref_tables.xlsm` - local new Excel
  model with Power Query formulas updated to the active ref-table dbt SQL,
  ignored by git when present.
- `sql/` - compiled dbt SQL snapshots used to populate the workbook's Power
  Query formulas at promotion time.
- `workbook_contract.md` - stable workbook/query object contract for safe SQL
  updates.
- `update_workbook_queries.ps1` - local helper that copies the ignored workbook
  and updates existing Power Query formulas from compiled dbt SQL.

## Contract

- Source system: NAV SFTP Position Valuation Detail Report workbooks.
- Workbook grain: one Excel output row per workbook tab query result, usually
  latest grouped NAV position rows by product, contract, option, and account
  bucket.
- Source workbook:
  `excel/nav/positions/2026_07_21_nav_position_file_old_backend/marex_and_nav_position_file_2026_may_11.xlsm`.
- Active dbt counterpart:
  `dbt/azure_postgres/models/positions_and_trades/2026_07_22_ref_tables/nav_positions/excel/`.

This folder is an Excel artifact reference, not an operator-applied database
DDL package.
