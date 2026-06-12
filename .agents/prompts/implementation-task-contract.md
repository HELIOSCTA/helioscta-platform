# Implementation Task Contract

Use this template when turning a rough request into a one-shot-ready Codex task
for this repo.

```text
Goal:
<One concrete production outcome. Avoid bundling unrelated cleanup.>

Context:
- Repo: helioscta-platform
- Relevant files:
  - @<path>
  - @<path>
- Existing pattern to preserve:
  - <backend scrape/orchestration/dbt/SQL/frontend/deployment pattern>
- Source or runtime context:
  - <API/source table/model/schema/job/timer/log/screenshot/data sample>

Assumptions audit:
- Before coding, explore the repo, state the pattern you will follow, run an
  assumptions audit, and ask up to three high-impact questions with recommended
  defaults.
- Push back on scope, promotion readiness, architecture, data-contract,
  credentials, permissions, UX, validation, deployment, and complexity
  assumptions that conflict with repo evidence.
- Do not accept legacy code promotion unless owner, table contract, validation
  path, safe rerun story, and deployment plan are clear.

Constraints:
- Preserve:
  - <schemas/tables/payloads/env vars/roles/interfaces/visual standards>
- Out of scope:
  - <systems/files/refactors/migrations/features>
- Ask before:
  - Adding dependencies
  - Adding broad abstractions
  - Changing schema or credentials
  - Adding services, timers, or deployment behavior
  - Mutating data from dbt

Done when:
- Implementation:
  - <specific behavior is present>
- Verification:
  - <pytest command, dbt parse/compile selector, read-only SQL, route smoke,
    browser check, permission verification, or doc review>
- States checked:
  - <normal/empty/error/stale/loading/data freshness as relevant>
- Final response includes:
  - Changed behavior
  - Files touched
  - Checks passed, failed, or skipped with reasons
  - Residual risk or follow-up
```

## Quick Version

```text
Before coding, explore the repo, state the pattern you will follow, run an
assumptions audit, and ask up to three high-impact questions with recommended
defaults. Keep the change narrow, preserve existing contracts, and verify with
the smallest meaningful checks.
```
