# One-Shot Implementation Workflow

Use this note when shaping Codex tasks that should get close to a single
implementation pass in this repo, especially backend scrapes, orchestration,
dbt, SQL, permissions, deployment docs, and database-backed dashboard work.

One-shot quality comes from narrowing uncertainty before edits, then requiring
verification that matches the risk of the change. Do not solve this by making
every prompt longer. Make the task contract clear, make repo patterns
discoverable, and make "done" testable.

## Operating Model

1. Explore first.
   Read `AGENTS.md`, the nearest README, the touched files, matching existing
   implementations, and any relevant API, SQL, schema, model, deployment, or
   permission contracts before editing.
2. Lock intent.
   State the existing pattern to follow, run an assumptions audit, and ask up
   to three high-impact questions only when repo inspection cannot answer them.
   Provide recommended defaults for unanswered questions.
3. Implement surgically.
   Touch only files needed for the stated outcome. Preserve existing runtime
   interfaces, environment variables, payload shapes, table contracts, role
   boundaries, visual standards, and deployment docs unless the request
   explicitly changes them.
4. Verify against the task.
   Run the smallest meaningful checks: targeted tests, dbt parse/compile,
   read-only SQL checks, route/API smoke checks, permission verification SQL,
   browser visual checks, and diff review.
5. Checkpoint.
   End with changed behavior, verification results, files touched, and any
   residual risk or follow-up that is not part of the request.

For complex or ambiguous work, ask Codex to plan first or explicitly ask it to
interview you and challenge weak assumptions before implementation.

## Assumptions Audit

Before implementation, Codex should push back when the request appears to
conflict with repo evidence or would create avoidable rework.

Push back on assumptions that materially affect:

- Scope: the request includes features, jobs, pages, schemas, or refactors not
  needed for the stated goal.
- Promotion readiness: legacy code or tables are being moved without a clear
  owner, table contract, validation path, safe rerun story, and deployment
  plan.
- Architecture: the request bypasses established repo boundaries, helper APIs,
  dashboard primitives, skills, data-access patterns, logging, or alerting.
- Data contract: the requested shape, grain, freshness, uniqueness key, source
  table, or downstream consumer expectation is weak, ambiguous, or inconsistent
  with repo evidence.
- UX consistency: future frontend changes would drift from established
  dashboard layout, controls, chart behavior, table behavior, or visual density.
- Credentials and permissions: the request assumes dbt can write to the
  database, uses the wrong role, or adds new secrets/config without a clear
  operator path.
- Validation: the request lacks enough checks to prove correctness.
- Complexity: the proposed implementation adds dependencies, configurability,
  abstractions, services, or migrations that are not required.

For each pushback, use this format:

```text
Assumption audit:
- Concern: <specific issue>
  Why it matters: <risk or rework it prevents>
  Recommended default: <what Codex should do if not corrected>
  Needs user input: <yes/no; ask only if the answer changes implementation>
```

Do not turn every task into an interview. If inspection answers the question,
use the repo evidence. If the concern does not change scope, architecture, data
shape, UX consistency, validation, deployment, or operations, proceed with the
simplest repo-consistent default and record the assumption.

## Prompt Contract

Prefer this shape for implementation tasks:

```text
Goal:
<one concrete outcome>

Context:
- @path/to/file
- Existing script, model, API route, query, log, screenshot, data sample, or
  deployment note
- Pattern to preserve or match

Assumptions audit:
- Push back on scope, promotion readiness, architecture, data-contract,
  permissions, UX, validation, deployment, or complexity assumptions that
  conflict with repo evidence.
- For each pushback, give the concern, why it matters, recommended default, and
  whether user input is required.
- Ask only questions that materially change the implementation.

Constraints:
- Existing behavior, schema, payloads, visual standards, roles, credentials, or
  interfaces to preserve
- Systems or files out of scope
- Repo skills or commands to use
- Ask before adding dependencies, broad refactors, schema changes, new services,
  or new credential requirements

Done when:
- Exact lint, test, type, dbt, SQL, route, browser, or permission checks to run
- What states must be inspected: loading, empty, error, stale, data
- What deployment/operator docs must be updated
- What the final response should include
```

Add this line when the task is fuzzy:

```text
Before coding, explore the repo, state the pattern you will follow, run an
assumptions audit, and ask up to three high-impact questions with recommended
defaults.
```

## Backend Add-On

For backend scrape and orchestration work, make the runtime contract explicit
before editing:

- Source system and API endpoint or file source.
- Runtime owner, schedule, and VM/systemd path when known.
- Destination schema/table, primary grain, uniqueness key, and timestamp or
  freshness fields.
- Safe rerun behavior, including expected upsert/delete/insert policy.
- API fetch telemetry in `ops.api_fetch_log` and failure visibility.
- Required environment variables and credential role.
- Smallest local test, module import, dry run, or read-only SQL check that
  proves the change.

Use function parameters with defaults for scrape scripts and orchestration
entry points. Avoid argparse unless the script is intentionally operator-facing.

## dbt, SQL, And Azure Postgres Add-On

For dbt, SQL, and Azure Postgres work, make the data and permission contract
explicit before editing:

- Source system, schema/table/model/view name, primary grain, uniqueness key,
  and timestamp/freshness fields.
- Whether the work changes runtime code, read-only dbt models, analysis SQL,
  operator SQL, permissions, indexes, docs, or only investigation notes.
- Downstream consumers to grep, especially future `frontend/` paths when a
  database contract changes.
- Whether the SQL runs as `helios_admin`, `helios_readonly`, or the Azure
  Postgres admin user.
- Smallest read-only SQL query that proves the expected source shape.
- Targeted verification command, such as dbt parse/compile for selected models
  or permission verification SQL.

Do not put production write operations into dbt models. Keep operator-only SQL
documented in `infrastructure/` or disabled/index reference files as the repo
already does.

## Frontend Add-On

For future frontend dashboard work, include these success criteria when the
change touches user-visible UI:

- Run the repo's frontend lint/test commands once a frontend exists here.
- Start or reuse the local dev server.
- Smoke any touched API route directly before opening the page.
- Open the page in the browser at desktop and mobile viewports.
- Verify normal data plus any reachable loading, empty, error, or stale state.
- Confirm charts are nonblank, correctly framed, and not resized by legends,
  toggles, hover states, or focus mode.
- Confirm tables keep dark surfaces, stable headers, horizontal overflow, row
  counts, filters, sorting, and no text overlap.
- Review `git diff` for unrelated formatting, hidden feature-flag changes, or
  accidental backend/schema edits.

Do not add Playwright or a broad E2E suite by default. Add automated browser
tests only after the same workflow becomes repeated or fragile, or when the
user asks for formal regression coverage.

## Continuing Work While Away

For long tasks, use a clear checkpoint so the next agent can resume without
guessing:

```text
Checkpoint before I log off:
- Current goal:
- Branch/worktree:
- Files touched:
- Checks passed:
- Checks failed or skipped:
- Current blocker:
- Next exact step:
```

Local goals and worktrees preserve context and isolate work, but they do not
guarantee progress if the machine or Codex app is not running. Use cloud tasks
or remote workers only after the repo branch and environment setup are pushed
and configured.
