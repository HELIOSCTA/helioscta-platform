# Assumptions Audit

Use this note when a user request sounds plausible but may conflict with repo
evidence, production constraints, data contracts, or deployment reality.

The goal is not to slow work down. The goal is to prevent avoidable rework by
challenging assumptions that materially change what should be built.

## When To Challenge

Push back when an assumption affects:

- Scope: the request includes features, tables, pages, jobs, schemas, or
  refactors that are not required for the stated goal.
- Promotion readiness: code or tables are being copied from legacy systems
  without an owner, table contract, validation path, safe rerun story, and
  deployment plan.
- Architecture: the request bypasses existing `backend/scrapes/`,
  `backend/orchestration/`, `backend/utils/`, dbt model layout, permission SQL,
  logging, or alerting patterns.
- Data contract: source table, schema, grain, uniqueness key, freshness field,
  payload shape, or downstream consumer expectations are missing or weak.
- Credentials and permissions: the request assumes write access from read-only
  dbt, uses the wrong role, adds secrets to git, or changes environment
  variable boundaries.
- Validation: there is no practical check proving the change works, or the
  proposed check does not match the risk.
- Deployment and operations: scheduled VM jobs, systemd timers, logs,
  permissions, or alerting behavior would change without docs.
- Complexity: the proposal adds dependencies, abstractions, config surfaces, or
  migrations that are not necessary for the outcome.

## Audit Format

Use this exact shape when the concern matters:

```text
Assumption audit:
- Concern: <specific issue>
  Why it matters: <risk or rework it prevents>
  Recommended default: <what the agent should do if not corrected>
  Needs user input: <yes/no; ask only if the answer changes implementation>
```

## Decision Rules

- Use repo inspection before asking the user.
- If the evidence is clear, state the assumption and continue.
- Ask no more than three high-impact questions before implementation.
- Give a recommended default for every question.
- Do not challenge preferences that do not change scope, architecture, data
  shape, UX consistency, validation, deployment, or operations.
- Do not accept "just copy the legacy version" as sufficient for this repo.
- Ask before adding dependencies, schema changes, broad refactors, new services,
  or new credential requirements.

## Strong Defaults

When the user does not specify otherwise:

- Keep changes narrow and repo-consistent.
- Prefer read-only verification before production writes.
- Preserve existing payloads, table shapes, environment variables, and role
  boundaries.
- Add documentation only where it helps future operators run or verify the
  promoted workflow.
- Treat missing credentials as a verification limitation, not permission to
  skip explaining how the work should be checked.

## Examples

```text
Assumption audit:
- Concern: The request asks to add a dbt model that writes an index, but this
  repo's dbt credentials are read-only.
  Why it matters: dbt runs should remain safe for validation and query shaping;
  write operations belong in operator SQL or setup scripts.
  Recommended default: Keep the index SQL as operator reference SQL and verify
  dbt with parse/compile only.
  Needs user input: no
```

```text
Assumption audit:
- Concern: The target source table and freshness field are not named.
  Why it matters: The dbt model grain and stale-data checks cannot be validated
  without knowing the source contract.
  Recommended default: Inspect existing models and use the closest documented
  source contract if it matches the requested workflow.
  Needs user input: yes, if repo inspection cannot identify the source.
```
