# NAV Positions SQL

These are standalone, read-only SQL scripts for local validation of
`nav.positions`.

Generate them from the shared JSON rule files:

```powershell
cd frontend
python scripts\generate-nav-position-sql.py
```

Generate and verify against Postgres:

```powershell
cd frontend
python scripts\verify-nav-position-sql.py
```

The npm aliases are:

```powershell
npm run sql:nav-positions
npm run verify:nav-positions-sql
```

## Rule Source

The product rules live here:

```text
frontend/lib/positionsAndTrades/rules/product_definitions.json
frontend/lib/positionsAndTrades/rules/product_aliases.json
```

TypeScript reads those JSON files for the UI/API rule logic. Python reads the
same JSON files to generate the local SQL files.

## Shape

Each SQL file includes the same inline staging CTEs:

```text
params
product_catalog
product_aliases
source_positions
latest_positions
positions_with_rules
filtered_positions
final
```

There is no separate staging SQL file to run. The mart/check/drilldown scripts
depend on staging conceptually, but the staging logic is embedded in each
standalone script so the file can be pasted into a SQL editor and run by itself.

## Files

- `marts/grouped_latest.sql`: grouped positions across funds.
- `marts/grouped_with_raw_examples.sql`: grouped positions with raw NAV values and matched rule evidence.
- `marts/account_breakout.sql`: grouped positions split by fund/account.
- `checks/rule_exceptions.sql`: unresolved or incomplete rule mappings.
- `checks/grouped_vs_raw_totals.sql`: proves grouped totals reconcile to raw rows.
- `drilldowns/raw_rows_for_group.sql`: raw rows with rule columns for inspection.
- `rules_manifest.json`: generated snapshot of the JSON rule files.

Only change values in the `params` CTE when validating filters manually. Do not
edit generated SQL files directly.
