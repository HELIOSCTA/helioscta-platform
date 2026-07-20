# Generated Position And Trade SQL

This directory contains standalone Postgres SQL promoted from compiled dbt
models under `dbt/azure_postgres/models/positions_and_trades_v2`.

Regenerate after changing dbt positions/trades models or product rules:

```powershell
cd dbt\azure_postgres
dbt compile --profiles-dir . --select path:models/positions_and_trades_v2
python scripts\promote_positions_trades_sql.py
```

Generated artifacts:

- `clear_street_trades/all_history_validation.sql` is promoted from
  `cs_65_eod_all_history`.
- `clear_street_trades/mufg/latest.sql` is promoted from `cs_80_mufg_latest`.
- `clear_street_trades/mufg/all_history.sql` is promoted from
  `cs_85_mufg_all_history`.
- `nav_positions/latest.sql` is promoted from `nav_50_positions_latest`.
- `nav_positions/all_history.sql` is promoted from `nav_40_positions_all_history`.

The Clear Street MUFG latest file is the packaged runtime input for the Clear
Street to MUFG upload workflow. All files remain read-only: they do not create,
update, or persist database objects.
