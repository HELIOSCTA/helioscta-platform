# NAV Position File 2026-07-21

Versioned NAV position Excel model reference for
`nav_position_file_2026_july_21.xlsm`.

## Contents

- `nav_position_file_2026_july_21.xlsm` - local source workbook binary, ignored
  by git when present.
- `sql/` - extracted Power Query SQL from the legacy workbook tabs.
- `excel_rebuild_gap_analysis.md` - migration notes for rebuilding the workbook
  from the active `2026_07_22_ref_tables` dbt model family.
- `workbook_contract.md` - stable workbook/query object contract for safe SQL
  migration.
- `update_workbook_queries.ps1` - local helper that copies the ignored workbook
  and updates existing Power Query formulas from compiled dbt SQL.
- `refresh_and_compare_workbooks.ps1` - local helper that refreshes copied
  legacy/ref-table workbooks and compares query tables plus pivot outputs.

## Contract

- Source system: NAV SFTP Position Valuation Detail Report workbooks.
- Workbook grain: one Excel output row per workbook tab query result, usually
  latest grouped NAV position rows by product, contract, option, and account
  bucket.
- Legacy dependency: `positions_cleaned_v2` report objects referenced by the
  extracted workbook SQL.
- Active dbt counterpart:
  `dbt/azure_postgres/models/positions_and_trades/2026_07_22_ref_tables/nav_positions/excel/`.

This folder is an Excel artifact reference, not an operator-applied database
DDL package.
