# Generated Position And Trade SQL

This directory contains standalone Postgres SQL promoted from compiled dbt
models under `dbt/azure_postgres/models/positions_and_trades_v3`.

Regenerate after changing v3 dbt positions/trades query logic or output
contracts. Lookup-only changes should be made through the
`positions_and_trades_ref` reference values sync SQL and do not require
regenerating these files.

```powershell
cd dbt\azure_postgres
dbt compile --profiles-dir . --select path:models/positions_and_trades_v3
python scripts\promote_positions_trades_sql.py
```

Generated artifacts:

- `clear_street_trades/all_history_validation.sql` is promoted from
  `cs_v3_65_eod_all_history`.
- `clear_street_trades/mufg/latest.sql` is promoted from `cs_v3_80_mufg_latest`.
- `clear_street_trades/mufg/all_history.sql` is promoted from
  `cs_v3_85_mufg_all_history`.
- `nav_positions/latest.sql` is promoted from `nav_v3_50_positions_latest`.
- `nav_positions/all_history.sql` is promoted from `nav_v3_40_positions_all_history`.
- `nav_positions/frontend/latest.sql` is promoted from
  `nav_v3_frontend_positions_latest`.
- `nav_positions/frontend/all_history.sql` is promoted from
  `nav_v3_frontend_positions_all_history`.
- `nav_positions/excel/*.sql` files are promoted from the v3 NAV Excel final-tab
  models under `models/positions_and_trades_v3/nav_positions/excel/`.

The Clear Street MUFG latest file is the packaged runtime input for the Clear
Street to MUFG upload workflow. All files remain read-only: they do not create,
update, or persist database objects.
