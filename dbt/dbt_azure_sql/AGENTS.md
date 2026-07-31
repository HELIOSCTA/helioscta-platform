# HeliosCTA Azure SQL dbt Agent Guide

This directory contains the promoted Azure SQL Server dbt project for salt
cavern storage views sourced from the NatGas WM DataFeed. Follow the root
`AGENTS.md` first, then these project-specific rules.

## Runtime Boundary

- This project uses `dbt-sqlserver` and T-SQL against Azure SQL Server database
  `GenscapeDataFeed`.
- Raw source tables live in schema `natgas`; active dbt mart views are
  materialized in schema `salts`.
- `source/`, `staging/`, and `utils/` models must remain ephemeral. Only
  models under `marts/` should be materialized as database views.
- Do not commit `.env`, `profiles.yml`, `target/`, `logs/`, or real
  credentials.
- Use `AZURE_SQL_*` environment variables for local profiles. Preserve those
  variable names unless the user explicitly changes the credential contract.
- `dbt run` requires a database principal that can create or replace views in
  `salts`.

## Required Reads

Before editing models or tests here, read:

- `README.md`
- `dbt_project.yml`
- The relevant model SQL and sibling `schema.yml`
- `models/salts/sources.yml` when source contracts change
- `models/salts/` when salt cavern storage flow or inventory contracts change
- `infrastructure/azure-sql/README.md` from the repo root when credential,
  permission, or operator behavior changes

## Model Style

- Keep SQL Server syntax explicit; this project is not PostgreSQL.
- Keep mart models inspectable with named CTEs, a terminal `FINAL` CTE, and
  `SELECT * FROM FINAL`.
- Keep ephemeral source, staging, and utility models SQL Server-safe when dbt
  inlines them. Do not use a top-level `WITH` in ephemeral models, because
  dbt-sqlserver nests ephemeral SQL inside another CTE and Azure SQL rejects
  nested `WITH` syntax.
- Preserve mart output columns and documented grain unless the user explicitly
  changes the contract.
- Do not add unused seeds or reference data. Any seed included here should be
  required by a current model or documented operator workflow.

## Verification

Use the smallest meaningful checks:

```powershell
cd dbt\dbt_azure_sql
Copy-Item profiles.yml.example profiles.yml
Copy-Item .env.example .env
# Fill .env locally, then load it into the shell.
dbt parse --profiles-dir .
dbt compile --profiles-dir .
```

From the repo root, run the FINAL CTE style check:

```powershell
python C:\Users\AidanKeaveny\.codex\skills\helioscta-dbt-final-cte\scripts\check_final_cte.py dbt\dbt_azure_sql\models\salts\marts
```
