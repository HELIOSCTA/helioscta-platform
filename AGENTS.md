# HeliosCTA Platform Agent Guide

This repo is a clean production workspace for promoted HeliosCTA backend
scripts, Azure deployment notes, and future frontend integration. Treat every
change as production-bound unless the user explicitly says it is exploratory.

## First Reads

Before editing, read the nearest relevant docs and contracts:

- Root scope and promotion rule: `README.md`
- Any nested `AGENTS.md` between the repo root and the working directory; the
  nearest file owns subtree-specific workflow and verification details.
- Backend runtime and dependencies: `backend/README.md`
- Azure Postgres setup and permissions: `infrastructure/azure-postgres/README.md`
- Agent workflow: `.agents/context/one-shot-implementation-workflow.md`
- Assumption challenge rules: `.agents/context/assumptions-audit.md`
- Parallel frontend/worktree workflow:
  `.agents/context/frontend-parallel-worktree-workflow.md`

For read-only investigation or narrow subtree work, skip unrelated docs when a
nearer `AGENTS.md` or README provides the complete local workflow.

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
- Validation or analysis SQL where data shape matters.
- A safe rerun story.
- API fetch telemetry in `ops.api_fetch_log` or failure visibility for
  scheduled work.
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

## SQL Rules

- Keep source contract details explicit: source system, schema/table, primary
  grain, uniqueness key, timestamp/freshness field, and downstream consumers.
- Use read-only sample queries to verify shape before changing downstream SQL
  or application code that depends on production tables.
- Database DDL and migrations are not managed in this repo.

## Verification Defaults

Choose the smallest meaningful checks for the change:

- Backend Python: `pytest backend/tests`
- Permissions/setup SQL: review with the matching README and use verification
  SQL when credentials are available.
- Frontend work, when present: lint/test, route smoke checks, and browser checks
  at desktop and mobile widths.

If a check cannot run because credentials, services, or dependencies are
missing, say exactly what was skipped and why.

## Frontend Parallel Work

When multiple agents may edit or inspect frontend pages concurrently, read
`.agents/context/frontend-parallel-worktree-workflow.md` before starting,
restarting, building, or clearing a frontend dev server. Do not run multiple
`next dev` servers from the same `frontend/` directory. Keep port `3000` for the
integration checkout unless the user explicitly asks otherwise.

## Final Response

End with changed behavior, files touched, verification results, and residual
risk. Call out any user-owned dirty worktree changes that were intentionally
left untouched.
