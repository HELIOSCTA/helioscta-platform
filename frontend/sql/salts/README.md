# Salts Promoted SQL

This folder holds compiled Azure SQL dbt SQL promoted for the local DEV Salts
frontend page. The API executes these files as read-only SQL because the
configured Azure SQL credentials cannot deploy dbt views.

## Source

Compile from the repo root:

```powershell
cd dbt\dbt_azure_sql
dbt compile --profiles-dir . --select +marts_v1_salt_facilities_bcf +marts_v1_salt_inventories --no-partial-parse
```

Promoted files:

```text
frontend/sql/salts/marts/marts_v1_salt_facilities_bcf.sql
frontend/sql/salts/marts/marts_v1_salt_inventories.sql
```

dbt source models:

```text
dbt/dbt_azure_sql/models/salts/marts/marts_v1_salt_facilities_bcf.sql
dbt/dbt_azure_sql/models/salts/marts/marts_v1_salt_inventories.sql
```

The Salt Model API route (`/api/salts/wx-adj-scrapes`) reads
`marts_v1_salt_facilities_bcf.sql`, injects bounded `@startYear` and `@month`
predicates into the raw nominations CTE, and projects the final daily salts
flow columns for the weather join.
