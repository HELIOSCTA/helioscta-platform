# Positions And Trades Reference Tables

This directory contains operator-applied SQL for the approved runtime lookup
tables used by `models/positions_and_trades/2026_07_22_ref_tables/`.

dbt reads these tables through the `positions_and_trades_ref` source with the
`helios_readonly` profile. dbt does not create the schema, load rows, upsert
rules, or manage candidate review state.

Apply order:

```text
table_positions_and_trades_reference_tables.sql
upsert_positions_and_trades_reference_values.sql
index_positions_and_trades_reference_tables.sql
verify_positions_and_trades_reference_tables.sql
```

If the tables were already created with active-window metadata columns or the
older product-alias match-type constraint, apply
`migrate_positions_and_trades_reference_tables_current_only.sql` before rerunning
the values and index scripts.

`upsert_positions_and_trades_reference_values.sql` is intentionally a full
current-state sync despite the historical filename. It inserts or updates rows
present in the file and removes rows no longer present in the file. Production
rows in these tables are assumed to be approved by the fact that an operator
has inserted or updated them here.
