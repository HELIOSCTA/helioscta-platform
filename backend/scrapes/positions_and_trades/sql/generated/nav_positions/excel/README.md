# NAV Positions Excel SQL

This directory contains standalone Postgres SQL promoted from v3 NAV Excel
final-tab dbt models under:

```text
dbt/azure_postgres/models/positions_and_trades_v3/nav_positions/excel/
```

Regenerate these files only after changing v3 Excel query logic or output
columns:

```powershell
cd dbt\azure_postgres
dbt compile --profiles-dir . --select path:models/positions_and_trades_v3
python scripts\promote_positions_trades_sql.py
```

Lookup-only product, alias, account, or month-code changes should be made by
updating and applying the `positions_and_trades_ref` reference values sync SQL;
they do not require regenerating these Excel SQL files.
