# NAV Position File 2026-07-21 Old Backend

Versioned old-backend NAV position Excel model reference for
`marex_and_nav_position_file_2026_may_11.xlsm`.

## Contents

- `marex_and_nav_position_file_2026_may_11.xlsm` - local old-backend workbook
  binary, ignored by git when present.
- `sql/` - extracted Power Query SQL from the old backend workbook tabs.
- `excel_rebuild_gap_analysis.md` - migration notes for rebuilding the workbook
  from the active `2026_07_22_ref_tables` dbt model family.
- `workbook_contract.md` - stable workbook/query object contract for safe SQL
  migration.
- `update_workbook_queries.ps1` and `refresh_and_compare_workbooks.ps1` -
  historical migration helpers retained for old-vs-ref-table comparison.

## Contract

- Source system: NAV SFTP Position Valuation Detail Report workbooks.
- Workbook grain: one Excel output row per workbook tab query result, usually
  latest grouped NAV position rows by product, contract, option, and account
  bucket.
- Old backend dependency: `positions_cleaned_v2` report objects referenced by
  the extracted workbook SQL.
- Active dbt counterpart:
  `dbt/azure_postgres/models/positions_and_trades/2026_07_22_ref_tables/nav_positions/excel/`.

This folder is an old-backend Excel artifact archive, not an operator-applied
database DDL package. New ref-table workbook work should use
`excel/nav/positions/2026_07_22_nav_position_file/`.
