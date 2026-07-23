# Archived Positions And Trades Models

These folders are historical dbt model snapshots. They are intentionally stored
outside `dbt/azure_postgres/models` and `dbt/azure_postgres/tests` so normal dbt
parsing, compilation, and product-matching tests only target the active model.

## Archives

- `2026_01_01_old_dbt_model`: old NAV workbook compatibility model copied into
  dbt as a reference for Excel rebuild work.
- `2026_07_21_sql_embedded`: SQL-embedded positions/trades model that kept
  product catalog, product alias, account, and month-code values in dbt utility
  models.

## Active Model

The active production model is:

`dbt/azure_postgres/models/positions_and_trades/2026_07_22_ref_tables`

It reads operator-maintained lookup values from the
`positions_and_trades_ref` schema instead of embedding those values in dbt SQL.

## Restore Procedure

Do not point dbt directly at archived folders. To restore an archive for a
controlled comparison, copy it into a temporary branch under
`dbt/azure_postgres/models`, add explicit `dbt_project.yml` config, and update
the related tests under `dbt/azure_postgres/tests`. Remove that temporary config
before promoting changes back to the active model.
