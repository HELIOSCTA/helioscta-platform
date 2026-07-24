# Positions And Trades Reference Tables

This directory contains operator-applied SQL for the approved runtime lookup
tables used by `models/positions_and_trades/2026_07_22_ref_tables/`.

dbt reads these tables through the `positions_and_trades_ref` source with the
`helios_readonly` profile. dbt does not create the schema, load rows, upsert
rules, or manage candidate review state.

Preferred apply command from `dbt/azure_postgres`:

```powershell
python scripts/apply_positions_trades_reference_tables.py
```

The script loads writer credentials from process environment or `backend/.env`
using the `AZURE_POSTGRES_WRITER_*` names, applies the SQL files in the normal
order, and runs the verification SQL. It does not print passwords.

Normal apply order:

```text
table_positions_and_trades_reference_tables.sql
upsert_positions_and_trades_reference_values.sql
index_positions_and_trades_reference_tables.sql
verify_positions_and_trades_reference_tables.sql
```

If the tables were already created with active-window metadata columns or the
older product-alias match-type constraint, apply
`migrate_positions_and_trades_reference_tables_current_only.sql` before
rerunning the values and index scripts. With the Python wrapper, set
`POSITIONS_TRADES_REFERENCE_INCLUDE_MIGRATION=1` for that one repair run.

`upsert_positions_and_trades_reference_values.sql` is intentionally a full
current-state sync despite the historical filename. It inserts or updates rows
present in the file and removes rows no longer present in the file. Production
rows in these tables are assumed to be approved by the fact that an operator
has inserted or updated them here.

Useful script switches:

```text
POSITIONS_TRADES_REFERENCE_DRY_RUN=1              -- check files without connecting
POSITIONS_TRADES_REFERENCE_INCLUDE_MIGRATION=1    -- include the one-time migration
POSITIONS_TRADES_REFERENCE_SKIP_VERIFY=1          -- apply without verification
POSITIONS_TRADES_REFERENCE_DBNAME=helios_prod     -- override database name
POSITIONS_TRADES_REFERENCE_DIR=<path>             -- override SQL directory
```
