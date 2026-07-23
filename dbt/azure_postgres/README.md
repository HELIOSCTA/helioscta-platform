# HeliosCTA Azure Postgres dbt

Read-only dbt project for compiling exploratory and active trade SQL against
Azure Postgres. Models are ephemeral by default and do not create, update,
insert, delete, or persist database objects.

```text
models/positions_and_trades/2026_07_22_ref_tables/
archived_models/positions_and_trades/2026_01_01_old_dbt_model/
archived_models/positions_and_trades/2026_07_21_sql_embedded/
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

## Archived Positions And Trades Models

```text
archived_models/positions_and_trades/2026_01_01_old_dbt_model/
archived_models/positions_and_trades/2026_07_21_sql_embedded/
```

`2026_01_01_old_dbt_model` preserves the old NAV position workbook model.
`2026_07_21_sql_embedded` preserves the pre-reference-table positions/trades
implementation where product definitions, product aliases, account lookup
rows, and month-code lookup rows lived as inline dbt SQL values. These archives
are outside `model-paths` and `test-paths`, so dbt does not parse or run them.

The legacy Clear Street v1 model family is no longer kept in this repo.

## Excel Workbook Models

Versioned Excel workbook artifacts live under the repo-level `excel/` folder,
not under database DDL reference SQL. The first NAV position workbook reference
is:

```text
excel/nav/positions/2026_07_21_nav_position_file/
```

That folder contains the extracted legacy workbook SQL and rebuild notes. Active
read-only dbt models that compile SQL for Excel consumers remain under:

```text
dbt/azure_postgres/models/positions_and_trades/2026_07_22_ref_tables/nav_positions/excel/
```

## Positions And Trades 2026-07-22 Ref Tables

`models/positions_and_trades/2026_07_22_ref_tables/` is the active promotion
source for generated positions/trades SQL. It ports the archived
`2026_07_21_sql_embedded` NAV and Clear Street model shape to semantic
`*_ref_*` model names and replaces inline lookup `values` blocks with read-only
sources:

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
`helios_admin`, then run the verification SQL and active product-matching dbt
tests with read-only credentials. Lookup-only changes should update and apply
the reference values sync SQL; they do not require recompiling or promoting
generated SQL.

Source contract:
Clear Street SFTP `Helios_Transactions_*.csv` files, table grain
`trade_date_from_sftp x sftp_upload_timestamp x row_number_for_trades`,
primary key on that grain, freshness field `sftp_upload_timestamp`. Safe reruns
upsert by primary key while preserving separate Clear Street uploads for the
same trade date. Product, account, and MUFG export fields are derived by
read-only SQL or frontend rules at query time; they are not persisted in the
raw source table.
NAV and Clear Street review-facing models share the generated
`product_code_family`, `product_code_grouping`, `product_code_region`, and
`product_code_underlying` columns so product classification is consistent
across frontend review and Excel-oriented SQL. `product_code_grouping` is
limited to `gas_future`, `gas_option`, `power_future`, and `power_option`;
current gas basis products retain `product_code_family = 'Basis'` but collapse
into the gas grouping buckets. The final MUFG backend upload artifact
intentionally exports the legacy raw Clear Street CSV columns plus only
`trade_status`, `ice_product_code`, `cme_product_code`, `bbg_product_code`, and
`product_code_grouping`. The MUFG upload warning contract treats blank/null
`product_code_grouping` as a taxonomy failure for product records, and
vendor-code completeness is keyed by the standardized `route_family`: NYMEX
rows require at least one of `cme_product_code` or `bbg_product_code`, while
ICE rows require `ice_product_code`. Short-term ICE power classification uses
a simple Mon-Fri business-day offset and a Monday-start week offset. Weekday
daily rows use verified D0/D1 rules, Friday-to-Monday delivery is treated as
D1, PDP/PWA weekly rows map through W0-W4, and PJM day-ahead PDA rows with
Saturday/Sunday delivery are exposed downstream as the effective PDO weekend
product with `PDO P1-IUS`. Rows outside verified short-term symbol patterns
remain visible as vendor-code warnings until a verified code-generation rule is
added. Review-facing NAV and Clear Street marts also expose
`source_account_key`, `account_code`, `account_lookup_status`,
`source_exchange_name`, `exchange_route_code`, `route_family`, and
`is_product_record`. Clear Street residual cash adjustments remain visible with
`is_product_record = false` but are excluded from product-rule exceptions and
vendor-code warnings.

NAV source contract:
NAV SFTP Position Valuation Detail Report workbooks, table grain
`fund_code x nav_date x sftp_upload_timestamp x source_file_name x
source_file_row_number`, primary key on that grain, freshness field
`sftp_upload_timestamp`. Safe reruns upsert by primary key while preserving
distinct NAV uploads for the same NAV date. Product, account, contract, option,
and normalization status fields are derived by read-only SQL at query time; they
are not persisted in the raw source table.

## Commands

```bash
cd dbt/azure_postgres
dbt debug --profiles-dir .
dbt parse --profiles-dir .
dbt compile --profiles-dir . --select path:models/positions_and_trades/2026_07_22_ref_tables
dbt test --profiles-dir . --select tag:positions_trades_product_matching
dbt show --profiles-dir . --select cs_ref_80_mufg_latest --limit 5
dbt show --profiles-dir . --select nav_ref_50_positions_latest --limit 5
```

After compiling the active positions/trades ref-table models, promote the
compiled standalone SQL artifacts consumed by frontend and backend runtime
paths:

```powershell
python scripts/promote_positions_trades_sql.py
```

The script also writes `frontend/sql/positions-and-trades/manifest.json`, the
promotion-boundary metadata file that maps stable operator labels such as
Positions & Trades Reference Model, NAV Positions Frontend Contract, and Clear
Street Trades Review Contract to their active dbt models and promoted SQL files.
The copied SQL under `frontend/sql/...` and
`backend/orchestration/positions_and_trades/sql/...` is generated output. Do not
edit those files directly; change the dbt source/int/mart/export models and
promote compiled SQL again. Product mapping-only changes should update and
apply the reference-table SQL under
`reference_sql/ddl/positions_and_trades/reference_tables/`; because the
generated SQL queries `positions_and_trades_ref` tables at runtime, mapping
updates do not require dbt compile or SQL promotion unless the dbt model shape
also changes.
