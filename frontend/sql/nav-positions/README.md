# NAV Positions SQL

These are standalone, read-only SQL scripts promoted from the Azure Postgres
dbt project for local validation of `nav.positions`.

Generate the dbt SQL first:

```powershell
cd dbt\azure_postgres
dbt compile --profiles-dir . --select path:models/positions_and_trades_v3
```

Promote the compiled positions/trades SQL to the frontend snapshots:

```powershell
cd dbt\azure_postgres
python scripts\promote_positions_trades_sql.py
```

## Source

The source of truth is:

```text
dbt/azure_postgres/models/positions_and_trades_v3/nav_positions/marts/nav_v3_40_positions_all_history.sql
dbt/azure_postgres/models/positions_and_trades_v3/nav_positions/marts/nav_v3_50_positions_latest.sql
dbt/azure_postgres/models/positions_and_trades_v3/nav_positions/frontend/nav_v3_frontend_positions_all_history.sql
dbt/azure_postgres/models/positions_and_trades_v3/nav_positions/frontend/nav_v3_frontend_positions_latest.sql
dbt/azure_postgres/models/positions_and_trades_v3/nav_positions/marts/pat_v3_90_rule_exceptions.sql
dbt/azure_postgres/models/positions_and_trades_v3/nav_positions/marts/nav_v3_55_rule_exceptions_latest.sql
```

The frontend API reads:

```text
frontend/sql/nav-positions/marts/all_history.sql
frontend/sql/nav-positions/marts/latest.sql
frontend/sql/nav-positions/checks/rule_exceptions.sql
frontend/sql/nav-positions/checks/rule_exceptions_latest.sql
```

Do not edit promoted SQL files directly. For lookup-only product/account/month
changes, update and apply the reference values sync SQL under
`dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/`;
no frontend SQL copy is needed. For query logic or output-contract changes,
change the v3 dbt model, run `dbt compile`, then promote the compiled SQL.

## Files

- `marts/all_history.sql`: every loaded NAV source row with dbt-derived rule fields.
- `marts/latest.sql`: latest NAV date and upload per fund with dbt-derived rule fields.
- `checks/rule_exceptions.sql`: combined Clear Street and NAV unresolved rule rows.
- `checks/rule_exceptions_latest.sql`: latest NAV unresolved rule rows for dbt-promoted diagnostics.
