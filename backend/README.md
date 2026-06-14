# Backend Runtime

Backend scrape scripts use the `helios_admin` database role. dbt uses separate
read-only credentials under `dbt/azure_postgres`.

## Environment

Create `backend/.env` for local development or set these as process
environment variables:

```text
AZURE_POSTGRES_WRITER_HOST=
AZURE_POSTGRES_WRITER_USER=helios_admin
AZURE_POSTGRES_WRITER_PASSWORD=
AZURE_POSTGRES_WRITER_PORT=5432
AZURE_POSTGRES_WRITER_DBNAME=helios_prod
AZURE_POSTGRES_WRITER_SSLMODE=require

PJM_API_KEY=

ERCOT_USERNAME=
ERCOT_PASSCODE=
ERCOT_API_KEY=
```

Legacy `AZURE_POSTGRESQL_DB_*` variables still work as fallbacks. The backend
environment variable names still say `WRITER`, but the configured database user
is now the app owner role, `helios_admin`.

Production VM jobs should not use `backend/.env`; they consume the root-owned
systemd environment file at `/etc/helioscta/backend.env`. Keep one `KEY=value`
per line and leave the file with a trailing newline so adjacent secrets and
settings cannot be concatenated.

Set `HELIOS_LOG_DIR=/var/log/helioscta` on Linux VMs if you want file logs
outside the git checkout. Without it, scripts write under their local `logs/`
folder.

The script logger writes the same structured sections to the terminal and to a
file. Production systemd jobs should rely on journald for process status and
`/var/log/helioscta` for retained failure logs; successful file logs are
deleted by default when scripts initialize logging with `delete_if_no_errors`.

ERCOT Public API helpers use the existing `ERCOT_USERNAME`,
`ERCOT_PASSCODE`, and `ERCOT_API_KEY` environment variables. The first ERCOT
runtime module is `backend.scrapes.power.ercot.dam_stlmnt_pnt_prices`, backed
by disabled operator SQL under `dbt/azure_postgres/models/power/ercot/`.
Promoted ERCOT schedules run orchestration modules through systemd so API
telemetry and data-readiness events are emitted with the database writes.

ISO-NE ISO Express CSV helpers use public static CSV report URLs and do not
require ISO-NE-specific credentials. The first ISO-NE runtime module is
`backend.scrapes.power.isone.da_hrl_lmps`, backed by disabled operator SQL
under `dbt/azure_postgres/models/power/isone/`. ISO-NE final RT hourly LMPs
use the same credential boundary through
`backend.scrapes.power.isone.rt_hrl_lmps_final`; preliminary RT hourly LMPs
use `backend.scrapes.power.isone.rt_hrl_lmps_prelim`.

## Permissions Contract

Application schemas, shared platform tables, and promoted direct-write feed
tables are documented as disabled dbt operator SQL under
`dbt/azure_postgres/models/`. Backend scripts assume those objects exist and
only perform application writes.

Scheduled orchestration that emits API telemetry or data-availability events
also assumes the shared `ops.api_fetch_log` and `ops.data_availability_events`
tables have been applied by operator SQL before the timer is enabled.

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
