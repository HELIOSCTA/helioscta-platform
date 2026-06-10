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

## PJM DA LMP Layout

The PJM DA hourly LMP work lives under:

```text
models/power/pjm/da_hrl_lmps/
models/power/pjm/da_hrl_lmps/marts/
```

This mirrors the legacy power-model folder style while using the shorter
`models/power/pjm/da_hrl_lmps/` path in this repo.

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
dbt compile --profiles-dir . --select path:models/power/pjm/da_hrl_lmps/marts
```

`index_*.sql` files are disabled as dbt models because read-only credentials
cannot create indexes. Keep them as DBA/operator reference SQL only.
