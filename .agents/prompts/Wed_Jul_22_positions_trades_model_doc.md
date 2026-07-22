<role>
You are a senior HeliosCTA documentation agent. Create a production-facing documentation page that explains the `positions_and_trades_v2` dbt models and how their outputs are consumed by backend, frontend, and Excel/report workflows.
</role>

<context>
This repo is a clean production workspace. The Azure Postgres dbt project is read-only and ephemeral by default; it compiles inspection and transformation SQL but does not create tables. Backend source loaders write raw NAV and Clear Street source tables with `helios_admin`. Frontend and dbt inspection paths read with `helios_readonly`. Product, account, contract, rule status, frontend contract, MUFG export, and Excel/report fields are derived by dbt or generated read-only SQL, not persisted into raw source tables.
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
- `dbt/azure_postgres/tests/positions_and_trades_v2/`
</source_files>

<task>
Create `docs/positions-and-trades-dbt-model.md` that documents the current positions/trades dbt model family, the raw source contracts it depends on, the generated SQL promotion path, and how the outputs are used by backend jobs, frontend APIs/UI, production health checks, and Excel workbook/report tabs.
</task>

<deliverables>
1. A new documentation page at `docs/positions-and-trades-dbt-model.md`.
2. A source-contract section for `nav.positions` and `clear_street.eod_transactions`, including source system, grain, primary key, freshness field, write owner, and safe rerun behavior.
3. A dbt model map for shared `utils`, NAV `src/int/marts/frontend/excel`, Clear Street `src/int/marts`, and product-matching tests.
4. A generated-artifact map from dbt model to `frontend/sql/...` targets and dbt compiled output consumed directly by backend/Excel workflows.
5. Consumer sections for frontend, backend orchestration, MUFG/NAV handoffs, production health checks, and Excel workbook/report tabs.
6. Verification and operator commands for docs-only review, dbt compile/promotion when SQL changes, product-matching tests, frontend API checks, and Windows Task Scheduler telemetry checks.
7. A short residual-risk/open-gaps section covering credentials, live database access, Excel workbook parity, and generated SQL drift.
</deliverables>

<implementation_rules>
- Base every factual claim on the source files above. Why: this repo is production-bound and the doc should not invent runtime behavior.
- Keep NAV positions and Clear Street trades separate until the shared utility layer. Why: they have different source systems, grains, schedules, and consumers.
- Preserve role boundaries: backend source writes use `helios_admin`; dbt, frontend, and inspection reads use `helios_readonly`; DDL is operator-applied reference SQL. Why: mixing roles would mislead future operators.
- Treat `frontend/sql/...` as generated frontend snapshots. Why: direct edits would be overwritten by `dbt compile` plus `promote_positions_trades_sql.py`; backend/Excel SQL should come from dbt compiled output.
- Include the v2 Excel layer and the legacy workbook gap analysis. Why: Excel is an explicit consumer and has workbook-tab contracts separate from the frontend API contract.
- Include access and cache behavior for NAV Positions and local-only status for Clear Street Trades. Why: frontend visibility differs between production and local dev.
- Include product-matching and frontend-contract tests by name. Why: those tests are the main guardrails for rule completeness and API SQL shape.
- Do not edit dbt models, generated SQL, frontend code, backend code, DDL, credentials, or deployment config for this documentation task. Why: the requested deliverable is a document, not a behavior change.
</implementation_rules>

<open_questions>
- Final audience: default to operators plus future frontend/backend agents, with enough detail for debugging without reading every model.
- Final path: default to `docs/positions-and-trades-dbt-model.md` unless an existing docs index suggests a more specific location.
- Diagram style: default to a text flow diagram or markdown table, not Mermaid, unless this repo already uses Mermaid in docs.
</open_questions>

<success_criteria>
- `git diff --check`
- `rg -n "nav\\.positions|clear_street\\.eod_transactions|promote_positions_trades_sql|nav_frontend_positions_latest|cs_80_mufg_latest|nav_excel_30_positions_grouped_latest|/api/nav-positions|clear_street_trades_mufg_upload" docs/positions-and-trades-dbt-model.md`
- The final response lists the doc path, files touched, verification commands run, skipped checks, and residual risk.
- If any SQL/model/generated artifact changes are proposed, stop and ask before editing them.
</success_criteria>

<process>
1. Read the source files above and inspect current references with `rg` before writing.
2. Run an assumption audit for scope, source contracts, role boundaries, generated artifacts, Excel parity, and verification.
3. Draft the document around the data flow: raw sources, dbt layers, generated artifacts, consumers, operations, and validation.
4. Verify path names and model names with `rg`; keep claims tied to concrete files.
5. Run docs-only checks, review the diff for accidental non-doc changes, and report residual risk.
</process>
