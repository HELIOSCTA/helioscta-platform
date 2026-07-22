<role>
You are a senior HeliosCTA documentation agent. Create a production-facing documentation page that explains the `positions_and_trades_v2` dbt product-matching model family and, specifically, the downstream SQL artifact drift problem when product matching is fixed but frontend and Excel SQL consumers are not refreshed.
</role>

<context>
This repo is a clean production workspace. The Azure Postgres dbt project is read-only and ephemeral by default; it compiles inspection and transformation SQL but does not create tables. Backend source loaders write raw NAV and Clear Street source tables with `helios_admin`. Frontend, dbt, and inspection paths read with `helios_readonly`. Product, account, contract, rule status, frontend contract, MUFG export, and Excel/report fields are derived by dbt or generated read-only SQL, not persisted into raw source tables.

The current operational issue is artifact drift: when product matching fails and the fix is made in the dbt/shared rule layer, every downstream SQL script that embeds compiled dbt logic must be refreshed. Frontend NAV and Clear Street SQL artifacts are promoted by `dbt/azure_postgres/scripts/promote_positions_trades_sql.py`. Backend MUFG and Excel SQL should come from dbt compiled output instead of committed backend-generated SQL copies. The NAV Excel/report layer has dbt models under `dbt/azure_postgres/models/positions_and_trades_v3/nav_positions/excel/`, plus legacy extracted workbook SQL under `dbt/azure_postgres/reference_sql/ddl/nav/positions/excel_file/sql/`. Document that distinction clearly.
</context>

<source_files>
- `AGENTS.md`
- `README.md`
- `backend/README.md`
- `frontend/README.md`
- `infrastructure/windows-task-scheduler/README.md`
- `dbt/azure_postgres/AGENTS.md`
- `dbt/azure_postgres/README.md`
- `dbt/azure_postgres/dbt_project.yml`
- `dbt/azure_postgres/models/positions_and_trades_v2/utils/`
- `dbt/azure_postgres/models/positions_and_trades_v2/nav_positions/`
- `dbt/azure_postgres/models/positions_and_trades_v2/clear_street_eod_transactions/`
- `dbt/azure_postgres/models/positions_and_trades_v2/nav_positions/excel/schema.yml`
- `dbt/azure_postgres/reference_sql/ddl/nav/positions/table_nav_positions.sql`
- `dbt/azure_postgres/reference_sql/ddl/clear_street/eod_transactions/table_clear_street_eod_transactions.sql`
- `dbt/azure_postgres/reference_sql/ddl/nav/positions/excel_file/excel_rebuild_gap_analysis.md`
- `dbt/azure_postgres/reference_sql/ddl/nav/positions/excel_file/sql/`
- `dbt/azure_postgres/scripts/promote_positions_trades_sql.py`
- `frontend/sql/nav-positions/README.md`
- `frontend/sql/clear-street-trades/README.md`
- `frontend/lib/server/navPositionsSql.ts`
- `frontend/app/api/dev/nav-positions/route.ts`
- `frontend/app/api/dev/clear-street-trades/route.ts`
- `frontend/components/nav/NavPositions.tsx`
- `frontend/components/clear-street/ClearStreetTrades.tsx`
- `backend/scrapes/clear_street/mufg_upload.py`
- `backend/orchestration/nav/positions.py`
- `backend/orchestration/clear_street/transactions.py`
- `backend/orchestration/health/prod_health_check.py`
- `backend/tests/test_positions_and_trades_rules.py`
- `backend/tests/test_clear_street_mufg_upload.py`
- `backend/tests/test_clear_street_transactions.py`
- `backend/tests/test_prod_health_check.py`
- `dbt/azure_postgres/tests/positions_and_trades_v2/`
</source_files>

<task>
Create `docs/positions-and-trades-dbt-model.md` that documents the current positions/trades product-matching source of truth, the raw source contracts it depends on, and the required downstream refresh workflow for frontend SQL snapshots and dbt compiled backend/Excel SQL whenever product aliases, product catalog rows, account lookup rows, month parsing, or source-specific matching logic changes.
</task>

<deliverables>
1. A new documentation page at `docs/positions-and-trades-dbt-model.md`.
2. A short problem statement named "Why Product-Matching Fixes Can Miss Consumers" that explains stale generated SQL as the core issue.
3. A source-contract section for `nav.positions` and `clear_street.eod_transactions`, including source system, grain, primary key, freshness field, write owner, and safe rerun behavior.
4. A source-of-truth section that identifies the active dbt/rule layer: shared `utils`, NAV `src/int/marts/frontend/excel`, Clear Street `src/int/marts`, and the product-matching tests.
5. A generated-artifact matrix with columns for consumer, source dbt model, promoted/generated SQL path or compiled dbt path, promotion mechanism, and current drift risk.
6. A required checklist for product-matching fixes: update dbt/source rule logic, run dbt parse/compile/tests, promote generated frontend/backend SQL, verify the generated diff, refresh or manually update Excel SQL scripts if applicable, and run focused frontend/backend checks.
7. Consumer sections for frontend NAV Positions, local DEV Clear Street Trades, backend Clear Street MUFG upload, NAV/Clear Street scheduled jobs, production health checks, and NAV Excel workbook/report tabs.
8. A verification and operator commands section covering product-matching tests, frontend-contract tests, `promote_positions_trades_sql.py`, generated-artifact grep checks, frontend API smoke checks, and Windows Task Scheduler telemetry SQL.
9. A residual-risk/open-gaps section that explicitly calls out that Excel v2 dbt models exist, legacy extracted workbook SQL exists, but a checked-in Excel SQL promotion workflow is not currently evident from `promote_positions_trades_sql.py`.
</deliverables>

<implementation_rules>
- Center the document on artifact drift after product-matching fixes. Why: that is the current operational issue and it changes what future agents must do after rule changes.
- Base every factual claim on the source files above. Why: this repo is production-bound and the doc should not invent runtime behavior.
- Keep NAV positions and Clear Street trades separate until the shared utility layer. Why: they have different source systems, grains, schedules, and consumers.
- Preserve role boundaries: backend source writes use `helios_admin`; dbt, frontend, and inspection reads use `helios_readonly`; DDL is operator-applied reference SQL. Why: mixing roles would mislead future operators.
- Treat `frontend/sql/...` as generated frontend snapshots. Why: direct edits can diverge from dbt source-of-truth and be overwritten by `dbt compile` plus `promote_positions_trades_sql.py`.
- Do not claim backend MUFG or Excel SQL is covered by `promote_positions_trades_sql.py`. Why: those consumers should use dbt compiled output directly.
- Include the v2 Excel layer and the legacy workbook gap analysis. Why: Excel is an explicit consumer and has workbook-tab contracts separate from the frontend API contract.
- Include access and cache behavior for NAV Positions and local-only status for Clear Street Trades. Why: frontend visibility differs between production and local dev.
- Include product-matching and frontend-contract tests by name. Why: those tests are the main guardrails for rule completeness and API SQL shape.
- Do not edit dbt models, generated SQL, frontend code, backend code, DDL, credentials, or deployment config for this documentation task. Why: the requested deliverable is a document, not a behavior change.
</implementation_rules>

<open_questions>
- Excel refresh ownership: default to documenting the absence of a checked-in promotion script and naming it as an operational gap; ask before implementing any Excel SQL promotion automation.
- Final audience: default to operators plus future frontend/backend agents, with enough detail to know what must be refreshed after a product-matching change.
- Final path: default to `docs/positions-and-trades-dbt-model.md` unless an existing docs index suggests a more specific location.
- Diagram style: default to a markdown flow/table, not Mermaid, unless this repo already uses Mermaid in docs.
</open_questions>

<success_criteria>
- `git diff --check`
- `rg -n "artifact drift|product-matching fixes|nav\\.positions|clear_street\\.eod_transactions|promote_positions_trades_sql|nav_frontend_positions_latest|cs_80_mufg_latest|nav_excel_30_positions_grouped_latest|Excel|/api/nav-positions|clear_street_trades_mufg_upload" docs/positions-and-trades-dbt-model.md`
- `rg -n "nav_excel|excel_file|promote_positions_trades_sql" docs/positions-and-trades-dbt-model.md`
- The doc clearly distinguishes dbt source-of-truth files from generated/promoted SQL artifacts.
- The doc contains a checklist that future product-matching fixes can follow so frontend SQL snapshots and dbt compiled backend/Excel SQL do not drift.
- The final response lists the doc path, files touched, verification commands run, skipped checks, and residual risk.
- If any SQL/model/generated artifact changes are proposed, stop and ask before editing them.
</success_criteria>

<process>
1. Read the source files above and inspect current references with `rg` before writing.
2. Run an assumption audit for artifact drift, source contracts, role boundaries, generated artifacts, Excel parity, and verification.
3. Draft the document around the failure mode first: product-matching source of truth, generated SQL consumers, and required refresh steps.
4. Add the broader data flow: raw sources, dbt layers, generated artifacts, consumers, operations, and validation.
5. Verify path names and model names with `rg`; keep claims tied to concrete files.
6. Run docs-only checks, review the diff for accidental non-doc changes, and report residual risk.
</process>
