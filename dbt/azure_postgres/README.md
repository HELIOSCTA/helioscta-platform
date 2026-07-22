# HeliosCTA Azure Postgres dbt

Read-only dbt project for compiling exploratory and active trade SQL against
Azure Postgres. Models are ephemeral by default and do not create, update,
insert, delete, or persist database objects.

```text
models/clear_street_eod_transactions_v1/
models/positions_and_trades_v2/
models/positions_and_trades_v3/
```

## Credentials

Use a read-only Postgres role. Copy `.env.example` to `.env` in this directory:

```powershell
Copy-Item .env.example .env
```

Then fill in:

```text
DBT_POSTGRES_HOST=
DBT_POSTGRES_READONLY_USER=helios_readonly
DBT_POSTGRES_READONLY_PASSWORD=
DBT_POSTGRES_PORT=5432
DBT_POSTGRES_DBNAME=helios_prod
DBT_POSTGRES_SSLMODE=require
```

Local `.env`, `profiles.yml`, `target/`, `dbt_packages/`, `logs/`, and
`.archive/` paths are ignored by git.

## Load Environment

PowerShell:

```powershell
cd dbt/azure_postgres
Get-Content .env | ForEach-Object {
    if ($_ -and -not $_.Trim().StartsWith("#")) {
        $name, $value = $_ -split "=", 2
        Set-Item -Path "Env:$($name.Trim())" -Value $value.Trim().Trim('"').Trim("'")
    }
}
```

Git Bash:

```bash
cd dbt/azure_postgres
set -a
source .env
set +a
```

## Product-Matching Test Runner

On the Windows workstation, run the all-history product-matching suite through
the checked-in runner. It selects the local `helioscta-azure-backend` Conda
environment, loads `.env` without printing its values, strips paired outer
single or double quotes from values, and then runs the required dbt command.

```powershell
cd dbt/azure_postgres
.\scripts\run_product_matching_tests.ps1
```

The default Conda root is `$env:USERPROFILE\miniconda3`. Override it only when
the environment is installed elsewhere:

```powershell
.\scripts\run_product_matching_tests.ps1 -CondaRoot 'C:\\path\\to\\miniconda3'
```

The runner requires outbound TCP access to the configured Azure Postgres host
on port 5432. A `Permission denied (10013)` connection error is an execution
host network-policy problem, not a dbt or credential error.

## Positions And Trades v2 Product Matching

```text
models/positions_and_trades_v2/utils/
models/positions_and_trades_v2/clear_street_eod_transactions/src/
models/positions_and_trades_v2/clear_street_eod_transactions/int/
models/positions_and_trades_v2/clear_street_eod_transactions/marts/
models/positions_and_trades_v2/nav_positions/src/
models/positions_and_trades_v2/nav_positions/int/
models/positions_and_trades_v2/nav_positions/marts/
```

The v2 product flow is frozen as the pre-reference-table implementation. It
keeps product definitions, product aliases, account lookup
rows, and month-code lookup rows in shared utility SQL. Clear Street trades and
NAV positions then use source-specific `src` models for raw source contracts,
`int` models for normalization and rule matching, and `marts` models for
latest/all-history review or export-facing queries.

Source contract:
Clear Street SFTP `Helios_Transactions_*.csv` files, table grain
`trade_date_from_sftp x sftp_upload_timestamp x row_number_for_trades`,
primary key on that grain, freshness field `sftp_upload_timestamp`. Safe reruns
upsert by primary key while preserving separate Clear Street uploads for the
same trade date. Product, account, and MUFG export fields are derived by
read-only SQL or frontend rules at query time; they are not persisted in the
raw source table.

NAV source contract:
NAV SFTP Position Valuation Detail Report workbooks, table grain
`fund_code x nav_date x sftp_upload_timestamp x source_file_name x
source_file_row_number`, primary key on that grain, freshness field
`sftp_upload_timestamp`. Safe reruns upsert by primary key while preserving
distinct NAV uploads for the same NAV date. Product, account, contract, option,
and normalization status fields are derived by read-only SQL at query time; they
are not persisted in the raw source table.

## Positions And Trades v3 Reference Tables

`models/positions_and_trades_v3/` is the active promotion source for generated
positions/trades SQL. It ports the v2 NAV and Clear Street model shape to
unique v3 model names, but replaces the inline lookup `values` blocks with
read-only sources:

```text
positions_and_trades_ref.product_catalog
positions_and_trades_ref.product_alias_rules
positions_and_trades_ref.account_lookup
positions_and_trades_ref.month_codes
```

The reference tables are operator-managed current-state approved runtime
tables. There is no `approval_status`, `is_active`, or validity-window logic in
the dbt runtime contract; rows are approved by the fact that an operator has
inserted them into these lookup tables after review. Candidate intake and
approvals remain separate operator workflow outside this dbt project.

Reference-table DDL lives under:

```text
reference_sql/ddl/positions_and_trades/reference_tables/
```

Apply the table DDL, current-state values sync SQL, and indexes with
`helios_admin`, then run the verification SQL and v3 dbt tests with read-only
credentials. Lookup-only changes should update and apply the reference values
sync SQL; they do not require recompiling or promoting generated SQL.

## Commands

```bash
cd dbt/azure_postgres
dbt debug --profiles-dir .
dbt parse --profiles-dir .
dbt compile --profiles-dir . --select path:models/positions_and_trades_v3
dbt test --profiles-dir . --select tag:product_matching_v3
dbt show --profiles-dir . --select cs_v3_80_mufg_latest --limit 5
dbt show --profiles-dir . --select nav_v3_50_positions_latest --limit 5
```

After compiling the active v3 positions/trades models, promote the compiled
standalone SQL artifacts consumed by the frontend:

```powershell
python scripts/promote_positions_trades_sql.py
```

The copied SQL under `frontend/sql/...` is generated output. Do not edit those
files directly; change the dbt source/int/mart models and promote compiled SQL
again. Backend MUFG export and Excel SQL extracts use dbt compiled output
directly from `target/compiled/helioscta_platform/models/positions_and_trades_v3/`
after `dbt compile`; no generated backend SQL package is maintained.
