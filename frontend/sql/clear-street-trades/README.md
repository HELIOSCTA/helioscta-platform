# Clear Street Trades SQL

These are standalone, read-only SQL scripts promoted from the Azure Postgres
dbt project for the local Clear Street trades review page.

Generate the dbt SQL first:

```powershell
cd dbt\azure_postgres
dbt compile --profiles-dir . --select cs_ref_65_eod_all_history
```

Promote the compiled positions/trades SQL to the frontend snapshot:

```powershell
cd dbt\azure_postgres
python scripts\promote_positions_trades_sql.py
```

## Source

The source of truth is:

```text
dbt/azure_postgres/models/positions_and_trades/2026_07_22_ref_tables/clear_street_eod_transactions/marts/cs_ref_65_eod_all_history.sql
```

The frontend API reads:

```text
frontend/sql/clear-street-trades/marts/eod_all_history.sql
```

Do not edit the promoted SQL file directly. For lookup-only product/account
changes, update and apply the reference values sync SQL under
`dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/`;
no frontend SQL copy is needed. For query logic or output-contract changes,
change the active ref-table dbt model, run `dbt compile`, then promote the
compiled SQL.

The promoted review mart exposes standardized account and route fields beside
raw Clear Street columns: `source_account_key`, `account_code`,
`account_lookup_status`, `source_exchange_name`, `exchange_route_code`,
`route_family`, and `is_product_record`. Frontend warning logic should use
`route_family`, require ICE codes for ICE product records, and ignore rows
where `is_product_record = false`.

Clear Street source rows can still carry raw PDA CUSIPs for PJM day-ahead
weekend deliveries. The promoted review SQL exposes those rows as effective
`product_code = 'PDO'` with `ice_product_code = 'PDO P1-IUS'`.
