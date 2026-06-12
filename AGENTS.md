# HeliosCTA Platform Agent Guide

This repo is a clean production workspace for promoted HeliosCTA backend
scripts, read-only dbt validation/query shaping, Azure deployment notes, and
future frontend integration. Treat every change as production-bound unless the
user explicitly says it is exploratory.

## First Reads

Before editing, read the nearest relevant docs and contracts:

- Root scope and promotion rule: `README.md`
- Backend runtime and dependencies: `backend/README.md`
- dbt read-only workflow: `dbt/azure_postgres/README.md`
- Azure Postgres setup and permissions: `infrastructure/azure-postgres/README.md`
- Agent workflow: `.agents/context/one-shot-implementation-workflow.md`
- Assumption challenge rules: `.agents/context/assumptions-audit.md`

## Assumption Audit

Challenge weak assumptions before implementation when they affect scope,
architecture, data contracts, validation, credentials, deployment, or operator
workflow. Use repo evidence first. Ask the user only when the answer materially
changes the implementation.

Use this format:

```text
Assumption audit:
- Concern: <specific issue>
  Why it matters: <risk or rework it prevents>
  Recommended default: <what to do if not corrected>
  Needs user input: <yes/no>
```

Do not turn routine work into an interview. If inspection answers the question,
state the assumption and proceed with the simplest repo-consistent default.

## Promotion Rule

Do not promote legacy code or tables into this repo just because they exist.
Promoted work needs:

- A clear owner and runtime path.
- A documented source/table contract and grain.
- Read-only dbt validation or analysis SQL where data shape matters.
- A safe rerun story.
- Pipeline logging or failure visibility for scheduled work.
- Deployment notes when VM, timer, credential, or permission behavior changes.

## Backend Rules

- Backend scripts run with the `helios_admin` role and assume direct-write
  tables are created by Azure Postgres setup SQL.
- New runtime scripts should follow existing `backend/scrapes/`,
  `backend/orchestration/`, `backend/utils/`, and logging patterns.
- Python scrape scripts and orchestration entry points should take function
  parameters with defaults, not argparse, unless the file is intentionally an
  operator-facing CLI.
- Preserve existing environment variable names and credential boundaries unless
  the task explicitly changes them.
- Ask before adding dependencies, background services, migrations, broad
  refactors, or new credential requirements.

## dbt And SQL Rules

- dbt in this repo is read-only validation and query shaping for Azure
  Postgres. Do not use dbt to mutate production data.
- Keep source contract details explicit: source system, schema/table, primary
  grain, uniqueness key, timestamp/freshness field, and downstream consumers.
- `index_*.sql` files under dbt are operator reference SQL only when read-only
  credentials cannot create indexes.
- Use read-only sample queries to verify shape before changing models that
  depend on production tables.

## Verification Defaults

Choose the smallest meaningful checks for the change:

- Backend Python: `pytest backend/tests`
- dbt syntax/shape: `cd dbt/azure_postgres && dbt parse --profiles-dir .`
- Selected dbt compile: `cd dbt/azure_postgres && dbt compile --profiles-dir . --select <selector>`
- Permissions/setup SQL: review with the matching README and use verification
  SQL when credentials are available.
- Frontend work, when present: lint/test, route smoke checks, and browser checks
  at desktop and mobile widths.

If a check cannot run because credentials, services, or dependencies are
missing, say exactly what was skipped and why.

## Final Response

End with changed behavior, files touched, verification results, and residual
risk. Call out any user-owned dirty worktree changes that were intentionally
left untouched.
