# Clear Street Trades SQL

These are standalone, read-only SQL scripts promoted from the Azure Postgres
dbt project for the local Clear Street trades review page.

Generate the dbt SQL first:

```powershell
cd dbt\azure_postgres
dbt compile --profiles-dir . --select cs_65_eod_all_history
```

Promote the compiled mart to the frontend:

```powershell
cd dbt\azure_postgres
python scripts\promote_positions_trades_sql.py
```

## Source

The source of truth is:

```text
dbt/azure_postgres/models/positions_and_trades_v2/clear_street_eod_transactions/marts/cs_65_eod_all_history.sql
```

The frontend API reads:

```text
frontend/sql/clear-street-trades/marts/eod_all_history.sql
```

Do not edit the promoted SQL file directly. Change the dbt model or its
upstream int/util models, run `dbt compile`, then promote the compiled SQL.
