# Positions And Trades v3

`positions_and_trades_v3` is the active read-only dbt model family for
positions/trades generated SQL promotion.

The key difference from v2 is lookup ownership. v2 stores product catalog,
product alias, account lookup, and month-code rows as inline dbt `values`
blocks under `models/positions_and_trades_v2/utils/`. v3 reads those lookups
from operator-managed Azure Postgres reference tables in the
`positions_and_trades_ref` schema. The live reference tables are current-state
approved rows only; candidate/review workflow is separate operator process and
is not implemented here.

This subtree does not create database objects, load seed rows, or upsert lookup
data. Apply the reference DDL under
`dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/`
with `helios_admin` before running v3 model tests against Azure Postgres.
Use `upsert_positions_and_trades_reference_values.sql` in that directory to
sync the approved current lookup rows. Despite the historical filename, that
script inserts or updates rows present in the file and removes rows no longer
present in the file.

After compiling v3, run `python scripts/promote_positions_trades_sql.py` from
`dbt/azure_postgres` to copy compiled v3 SQL into the frontend, backend, and
Excel-facing generated SQL paths.

## Reference Sources

- `positions_and_trades_ref.product_catalog`
- `positions_and_trades_ref.product_alias_rules`
- `positions_and_trades_ref.account_lookup`
- `positions_and_trades_ref.month_codes`

The v3 utility models expose the current rows in these tables directly. NAV
uses `exact` and `regex` product-alias rules against normalized product text.
Clear Street uses `cusip_prefix` product-alias rules for reviewed CUSIP-prefix
overrides before falling back to exchange commodity code matches.

## Verification

From `dbt/azure_postgres`:

```powershell
dbt parse --profiles-dir .
dbt compile --profiles-dir . --select path:models/positions_and_trades_v3
dbt test --profiles-dir . --select tag:product_matching_v3
```

If the reference schema or tables are not present yet, `dbt parse` can still
prove project syntax, but compile/tests that require relation introspection or
queries may fail until the operator-applied DDL is installed.
