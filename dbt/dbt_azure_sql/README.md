# HeliosCTA Azure SQL dbt

Azure SQL Server dbt project for salt cavern storage views sourced from the
NatGas WM DataFeed tables in `GenscapeDataFeed`.

```text
models/salts/
```

## Database Contract

- **Source system:** Wood Mackenzie / Genscape NatGas DataFeed.
- **Database:** Azure SQL Server `GenscapeDataFeed`.
- **Raw schema:** `natgas`.
- **Output schema:** `salts` for salt cavern storage marts.
- **Raw tables:** `nominations`, `nomination_cycles`, `no_notice`,
  `location_role`, `location_extended`, `pipelines`.
- **Raw freshness:** WM DataFeed import tasks refresh delta rows every
  20/30/40 minutes and metadata hourly. Operational status lives in
  `natgas.load_status` and `administration.error_log`.
- **dbt materialization:** source, staging, and utility models are ephemeral;
  marts are SQL Server views.

## Salts Mart Views

| View | Grain | Purpose |
| --- | --- | --- |
| `salts.marts_v1_salt_facilities_bcf` | `gas_day` | Daily salt cavern storage flows in BCF by facility and region. |
| `salts.marts_v1_salt_inventories` | `gas_day` | Daily salt cavern inventory, flow, and capacity metrics for tracked facilities. |

The Salts models live under `models/salts`. Source and staging models are
ephemeral; only `models/salts/marts` materializes views.

## Credentials

Copy the checked-in examples to local runtime files:

```powershell
cd dbt\dbt_azure_sql
Copy-Item profiles.yml.example profiles.yml
Copy-Item .env.example .env
```

Fill in `.env` locally:

```text
AZURE_SQL_SERVER=heliosazuresql.database.windows.net
AZURE_SQL_DATABASE=GenscapeDataFeed
AZURE_SQL_PORT=1433
AZURE_SQL_ODBC_DRIVER=ODBC Driver 18 for SQL Server
AZURE_SQL_USER=
AZURE_SQL_PASSWORD=
```

Use a principal with enough permission to create or replace views in `salts`
when running `dbt run`. Read-only users are suitable for inspection and
compile-only workflows, but they cannot deploy views.

Load `.env` in PowerShell without printing values:

```powershell
Get-Content .env | ForEach-Object {
    if ($_ -and -not $_.Trim().StartsWith("#")) {
        $name, $value = $_ -split "=", 2
        Set-Item -Path "Env:$($name.Trim())" -Value $value.Trim().Trim('"').Trim("'")
    }
}
```

## Dependencies

This project requires:

```text
dbt-core==1.8.*
dbt-sqlserver==1.8.*
pyodbc
ODBC Driver 18 for SQL Server
```

Install those in the local dbt environment before running dbt commands.

## Commands

```powershell
cd dbt\dbt_azure_sql
dbt debug --profiles-dir .
dbt parse --profiles-dir .
dbt compile --profiles-dir .
dbt run --profiles-dir . --select salts.marts
```

Run the style check from the repo root:

```powershell
python C:\Users\AidanKeaveny\.codex\skills\helioscta-dbt-final-cte\scripts\check_final_cte.py dbt\dbt_azure_sql\models\salts\marts
```

## Migration Notes

This project was promoted from the legacy
`helioscta-backend/backend/dbt/dbt_azure_sql` project. Legacy local artifacts
such as `.env`, `profiles.yml`, `logs/`, `target/`, and `.user.yml` are not
source-controlled here.

As of July 28, 2026, salts-specific models were moved from
`models/natgas/natgas_cleaned` into `models/salts`. The previous NatGas-path
salts SQL and schema/doc snapshots are archived under
`archived_models/natgas_cleaned_salts_2026_07_28`.

As of July 28, 2026, the remaining `models/natgas/natgas_cleaned` tree was
archived under `archived_models/natgas_cleaned_2026_07_28` so active dbt model
code lives only under `models/salts`. The legacy
`genscape_state_region_mapping` seed used by the archived NatGas mart was moved
into the same archive. Existing deployed `natgas_cleaned.*` views remain legacy
Azure SQL objects until an operator removes them if desired.
