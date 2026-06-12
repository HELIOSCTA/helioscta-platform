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

Set `HELIOS_LOG_DIR=/var/log/helioscta` on Linux VMs if you want file logs
outside the git checkout. Without it, scripts write under their local `logs/`
folder.

## Permissions Contract

Schemas and direct-write tables are created by the Azure Postgres init SQL.
Backend scripts assume those tables exist and only perform application writes.

After the Azure Postgres permission defaults have been installed, new schemas
and tables created by `helios_admin` inherit the expected read-only grants
automatically.

## Dependencies

For VM runtime jobs:

```bash
pip install -r backend/requirements.txt -e backend
```

For dbt compilation:

```bash
pip install -r backend/requirements-dbt.txt
```

For local tests:

```bash
pip install -r backend/requirements-dev.txt -e backend
pytest backend/tests
```
