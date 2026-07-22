# Clear Street Trades SQL

These are standalone, read-only SQL scripts promoted from the Azure Postgres
dbt project for the local Clear Street trades review page.

Generate the dbt SQL first:

```powershell
cd dbt\azure_postgres
dbt compile --profiles-dir . --select cs_v3_65_eod_all_history
```

Promote the compiled positions/trades SQL to the frontend snapshot:

```powershell
cd dbt\azure_postgres
python scripts\promote_positions_trades_sql.py
```

## Source

The source of truth is:

```text
dbt/azure_postgres/models/positions_and_trades_v3/clear_street_eod_transactions/marts/cs_v3_65_eod_all_history.sql
```

The frontend API reads:

```text
frontend/sql/clear-street-trades/marts/eod_all_history.sql
```

Do not edit the promoted SQL file directly. For lookup-only product/account
changes, update and apply the reference values sync SQL under
`dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/`;
no frontend SQL copy is needed. For query logic or output-contract changes,
change the v3 dbt model, run `dbt compile`, then promote the compiled SQL.
