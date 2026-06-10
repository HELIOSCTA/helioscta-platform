# Backend Runtime

Backend scrape scripts use the `helios_admin` database role. dbt uses separate
read-only credentials under `dbt/azure_postgres`.

## Environment

Create `backend/.env` on the VM or set these as process environment variables:

```text
AZURE_POSTGRES_WRITER_HOST=
AZURE_POSTGRES_WRITER_USER=helios_admin
AZURE_POSTGRES_WRITER_PASSWORD=
AZURE_POSTGRES_WRITER_PORT=5432
AZURE_POSTGRES_WRITER_DBNAME=helios_prod
AZURE_POSTGRES_WRITER_SSLMODE=require

PJM_API_KEY=
```

Legacy `AZURE_POSTGRESQL_DB_*` variables still work as fallbacks. The backend
environment variable names still say `WRITER`, but the configured database user
is now the app owner role, `helios_admin`.

## Permissions Contract

Schemas are created by `helios_admin`. Backend scripts may create or upsert
tables inside any non-system application schema.

After the Azure Postgres permission defaults have been installed, new schemas
and tables created by `helios_admin` inherit the expected read-only grants
automatically.
