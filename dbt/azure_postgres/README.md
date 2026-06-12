# HeliosCTA Azure Postgres dbt

Read-only dbt project for validating and shaping Azure Postgres data.

The committed profile uses environment variables only. Do not commit literal
passwords or production credentials. Load a local `.env` file from this
directory before running dbt.

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
```

## PJM LMP Layout

The PJM Data Miner 2 LMP work lives under one folder per feed short name:

```text
models/power/pjm/da_hrl_lmps/
models/power/pjm/da_hrl_lmps/pjm_lmps_da/
models/power/pjm/rt_hrl_lmps/
models/power/pjm/rt_hrl_lmps/pjm_lmps_rt/
models/power/pjm/unverified_five_min_lmps/
models/power/pjm/unverified_five_min_lmps/pjm_lmps_unverified_five_min/
models/power/pjm/rt_fivemin_mnt_lmps/
models/power/pjm/rt_fivemin_mnt_lmps/pjm_lmps_rt_fivemin_mnt/
```

This mirrors the legacy power-model folder style while using the shorter
`models/power/pjm/<feed_short_name>/` path in this repo.

## Load Environment

Git Bash:

```bash
cd dbt/azure_postgres
set -a
source .env
set +a
```

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

## Read-Only Commands

```bash
cd dbt/azure_postgres
dbt debug --profiles-dir .
dbt parse --profiles-dir .
dbt compile --profiles-dir . --select path:models/power/pjm/da_hrl_lmps/pjm_lmps_da
dbt compile --profiles-dir . --select path:models/power/pjm/rt_hrl_lmps/pjm_lmps_rt
dbt compile --profiles-dir . --select path:models/power/pjm/unverified_five_min_lmps/pjm_lmps_unverified_five_min
dbt compile --profiles-dir . --select path:models/power/pjm/rt_fivemin_mnt_lmps/pjm_lmps_rt_fivemin_mnt
```

`table_*.sql` and `index_*.sql` files are disabled as dbt models because
read-only credentials cannot create application objects or indexes. Keep them
as DBA/operator reference SQL only.

## Operator SQL

`schema_*.sql`, `table_*.sql`, and `index_*.sql` files are disabled as dbt
models. They are the source of truth for application object DDL and must be
applied manually with `helios_admin`; read-only dbt credentials cannot run
them.

Shared runtime observability objects for the database `ops` schema live under
`models/ops/`.

Run order for a new database:

```text
models/setup/schemas.sql
models/ops/table_ops_api_fetch_log.sql
models/ops/table_ops_data_availability_events.sql
models/power/pjm/<feed_short_name>/table_*.sql
models/ops/index_*.sql
models/power/pjm/<feed_short_name>/index_*.sql
infrastructure/azure-postgres/permissions/01_apply_database_permissions.sql
```

Enabled dbt models remain read-only validation/query shaping only.
