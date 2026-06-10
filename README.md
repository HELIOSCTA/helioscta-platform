# HeliosCTA Platform

Clean production workspace for HeliosCTA backend scripts, read-only dbt
validation/query shaping, deployment notes, and frontend integration.

This repo is the target for promoted code only. Legacy scripts, tables, and
manual workflows should stay in the old repo until they have an owner, table
contract, validation path, and deployment plan.

## Working Model

Promote one backend script or workflow at a time:

1. Identify the legacy script and current database table.
2. Define the source/table contract and grain in dbt.
3. Add read-only dbt tests and analysis SQL.
4. Add validation checks before and after writes.
5. Add pipeline run logging and failure visibility.
6. Deploy the script as a scheduled Azure VM job.
7. Document the deployed commit, host, schedule, and logs.

## Repo Layout

- `backend/` - promoted Python scrapes, orchestration, and runtime helpers.
- `dbt/azure_postgres/` - read-only dbt models, source definitions, tests,
  and disabled index reference SQL.
- `frontend/` - dashboard code when promoted into this repo.
- `infrastructure/` - Azure VM setup, systemd timers, and deployment notes.
- `docs/` - migration, deployment, and operating playbooks.

## Promotion Rule

Nothing should enter this repo just because it exists in the legacy system.
Code is promoted when it has a clear owner, a documented dbt source contract, a
safe rerun story, and read-only verification that proves the output is usable.
