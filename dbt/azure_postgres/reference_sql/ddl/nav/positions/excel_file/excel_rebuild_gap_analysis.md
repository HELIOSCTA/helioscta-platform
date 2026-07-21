# NAV Excel Workbook Rebuild Gap Analysis

## Goal

Re-create `nav_position_file_2026_july_21.xlsm` using the promoted
`positions_and_trades_v2` dbt models instead of the legacy
`positions_cleaned_v2` objects referenced by the workbook's Power Query SQL.

## Current Inputs

- Workbook source:
  `dbt/azure_postgres/reference_sql/ddl/nav/positions/excel_file/nav_position_file_2026_july_21.xlsm`
- Extracted workbook SQL:
  `dbt/azure_postgres/reference_sql/ddl/nav/positions/excel_file/sql/`
- Legacy dbt snapshot used by that workbook:
  `dbt/azure_postgres/reference_sql/ddl/nav/positions/excel_file/positions_and_trades/`
- Current promoted dbt models:
  `dbt/azure_postgres/models/positions_and_trades_v2/`

## Workbook SQL Contract

The extracted SQL files are workbook/report queries, not source models. They
expect these legacy objects:

- `positions_cleaned_v2.nav_position_agr`
- `positions_cleaned_v2.nav_position_pnt`
- `positions_cleaned_v2.nav_position_moross`
- `positions_cleaned_v2.nav_position_titan`
- `positions_cleaned_v2.nav_position`
- `positions_cleaned_v2.nav_positions_grouped_latest`

The workbook tabs mainly consume `nav_positions_grouped_latest`, which already
includes product grouping, symbols, account bucket quantities, previous settle,
DoD quantity, and PnL fields. `GAS_FUTURES_PIVOT` is the exception: it consumes
the row-level `nav_position` mart.

## Current v2 Gap

The promoted v2 NAV models currently expose normalized row-level records and
rule status fields. They do not yet expose the legacy Excel report layer.

Missing or renamed fields needed by the workbook:

- Date aliases: `sftp_date`, `previous_sftp_date`, `contract_yyyymmdd`,
  `contract_year`, `contract_month`.
- Product/report fields: `exchange_code`, `exchange_code_grouping`,
  `exchange_code_region`, `exchange_code_underlying`, `marex_description`.
- Instrument helper fields: `is_option`, `put_call`, `strike_price`,
  `futures_contract_month`, `futures_contract_month_y`,
  `futures_contract_month_yy`.
- Excel/vendor symbols: `ice_xl_symbol`, `ice_xl_symbol_underlying`,
  `cme_excel_symbol`, `bbg_symbol`, `bbg_option_description`.
- Grouped measures: `lots`, `settlement_price_total`, `trade_price_total`,
  `market_value_total`, `qty_total`, `qty_acim`, `qty_andy`, `qty_mac`,
  `qty_pnt`, `qty_dickson`, `qty_titan`.
- Prior-day measures: `previous_marex_delta`,
  `previous_settlement_price_total`, `previous_market_value_total`,
  `previous_qty_total`, `dod_qty_total`, `daily_change_total`,
  `daily_pnl_total`.

Current v2 also uses these newer names and concepts:

- `nav_date` instead of workbook `sftp_date`.
- `product_code`, `product_family`, and `market_name` instead of legacy
  `exchange_code`, `exchange_code_grouping`, and `exchange_code_region`.
- `put_call_code` and `strike_price_normalized` instead of the workbook's
  `put_call` and rounded `strike_price` convention.
- `rule_status`, `rule_priority`, `rule_match_type`, and `rule_pattern`, which
  are useful for validation but not part of the old workbook output contract.

## Current Decision

Before changing `positions_and_trades_v2`, create an isolated v0 copy of the old
NAV dbt model under:

`dbt/azure_postgres/models/positions_and_trades_v0/positions_cleaned_v0/`

This gives us a compilable legacy reference inside dbt so the workbook SQL can
be validated against the old output contract first. The copied v0 models should
stay ephemeral/read-only and should not become the long-term promoted NAV mart.

The original legacy snapshot tables (`nav_sftp_positions_*_v2_2026_feb_23`) are
not present in the live `nav` schema. The v0 source adapters therefore read the
current consolidated `nav.positions` table and filter by `fund_code` to preserve
the old per-fund model contract without changing `positions_and_trades_v2`.

The extracted workbook SQL has also been integrated as ephemeral v0 dbt models
under:

`dbt/azure_postgres/models/positions_and_trades_v0/positions_cleaned_v0/marts/excel_file/`

## Earlier Recommendation

Do not promote the legacy `positions_and_trades` folder as active `_v0` dbt
models under `dbt/azure_postgres/models` as the final solution.

Reasons:

- The legacy snapshot points at old NAV source table names such as
  `nav_sftp_positions_*_2026_feb_23`, not the promoted `nav.positions` source.
- It uses old materialization assumptions (`incremental` and `view`) inside a
  repo where the dbt project is read-only and active models are ephemeral.
- It would duplicate product and account mapping logic already being promoted
  in `positions_and_trades_v2`.
- It would make the workbook rebuild depend on a compatibility copy instead of
  proving that v2 can reproduce the workbook contract.

Use the legacy folder and extracted SQL as a golden reference first. After the
v0 contract is inspectable, build a v2-native Excel/reporting layer instead.

## Proposed v2 Migration Shape

Add a narrow Excel-oriented subtree under:

`dbt/azure_postgres/models/positions_and_trades_v2/nav_positions/excel/`

Recommended model sequence:

1. `nav_excel_10_position_rows`
   - Input: `nav_40_positions_all_history`.
   - Output: row-level legacy-compatible names and helper fields.
   - Adds `sftp_date`, `nav_product`, `exchange_code*`, contract date helpers,
     futures month codes, trade sign, gas lots, and vendor symbols.

2. `nav_excel_20_positions_grouped`
   - Input: `nav_excel_10_position_rows`.
   - Output: old `nav_positions_grouped` style grain.
   - Groups by date, product, contract, option, and symbol fields.
   - Computes account bucket quantities and total value/settle/trade measures.

3. `nav_excel_30_positions_grouped_latest`
   - Input: `nav_excel_20_positions_grouped`.
   - Output: old `nav_positions_grouped_latest` style report mart.
   - Calculates previous NAV date/settle/value/quantity and daily PnL.
   - Uses workbook/global latest-date semantics unless intentionally changed.

4. Workbook tab models or generated SQL outputs
   - Port the 11 extracted SQL files to read from the v2 Excel marts.
   - Preserve workbook tab names and presentation aliases where practical:
     `SFTP_METADATA`, `ICE_SETTLES`, `ICE_BALDAY`, `ICE_OPTIONS`,
     `ICE_FUTURES`, `GAS_OPTIONS`, `GAS_FUTURES`, `GAS_BALMO`,
     `GAS_OPTIONS_OTHER`, `GAS_FUTURES_PIVOT`, and `GAS_OPTIONS_PIVOT`.

## Validation Plan

- Run `dbt parse --profiles-dir .`.
- Compile the v2 NAV Excel models.
- Run the repo FINAL CTE style checker against
  `dbt/azure_postgres/models/positions_and_trades_v2`.
- If legacy `positions_cleaned_v2` objects are still queryable, compare each
  workbook tab query old-vs-new on row count and key totals.
- If legacy objects are not queryable, validate v2 output shape with
  `dbt show` samples and compare columns/filters against the extracted SQL.
