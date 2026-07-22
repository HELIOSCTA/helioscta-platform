<role>
You are a senior HeliosCTA dbt/backend architecture agent. Create a v3 positions/trades dbt model family that moves product/account/month lookup rules out of inline dbt `values` CTEs and into database-backed reference table contracts, without applying DDL or loading/upserting rule rows to the database in this task.
</role>

<context>
This repo is a production-bound HeliosCTA workspace. The current `positions_and_trades_v2` dbt models are ephemeral/read-only and carry product catalog, product alias, account lookup, and month-code data as inline SQL under `dbt/azure_postgres/models/positions_and_trades_v2/utils/`. That made initial dbt work easy, but it causes downstream drift: when product matching changes, compiled SQL artifacts for frontend, backend MUFG, and Excel/report consumers can become stale.

The target v3 direction is table-backed lookup data. Live consumers should eventually read stable SQL that joins to approved reference tables, so adding or correcting a product alias can be handled as a reviewed database reference-data change instead of requiring a dbt compile and copied SQL refresh for every consumer. This task should create the dbt/source/table-contract structure only. It should not apply SQL against Azure Postgres, should not upsert or seed lookup rows, and should not change production consumers yet.
</context>

<source_files>
- `AGENTS.md`
- `README.md`
- `backend/README.md`
- `infrastructure/azure-postgres/README.md`
- `.agents/context/one-shot-implementation-workflow.md`
- `.agents/context/assumptions-audit.md`
- `dbt/azure_postgres/AGENTS.md`
- `dbt/azure_postgres/README.md`
- `dbt/azure_postgres/dbt_project.yml`
- `dbt/azure_postgres/models/positions_and_trades_v2/utils/utils_v2_positions_and_trades_product_catalog.sql`
- `dbt/azure_postgres/models/positions_and_trades_v2/utils/utils_v2_positions_and_trades_product_aliases.sql`
- `dbt/azure_postgres/models/positions_and_trades_v2/utils/utils_v2_positions_and_trades_account_lookup.sql`
- `dbt/azure_postgres/models/positions_and_trades_v2/utils/utils_v2_positions_and_trades_month_codes.sql`
- `dbt/azure_postgres/models/positions_and_trades_v2/nav_positions/`
- `dbt/azure_postgres/models/positions_and_trades_v2/clear_street_eod_transactions/`
- `dbt/azure_postgres/tests/positions_and_trades_v2/`
- `dbt/azure_postgres/scripts/promote_positions_trades_sql.py`
- `dbt/azure_postgres/reference_sql/ddl/nav/positions/table_nav_positions.sql`
- `dbt/azure_postgres/reference_sql/ddl/clear_street/eod_transactions/table_clear_street_eod_transactions.sql`
- `frontend/README.md`
- `frontend/sql/nav-positions/README.md`
- `frontend/sql/clear-street-trades/README.md`
- `frontend/sql/`
- `backend/orchestration/health/prod_health_check.py`
- `.agents/prompts/Wed_Jul_22_positions_trades_model_doc_v2.md`
</source_files>

<task>
Create a v3 positions/trades dbt package and reference-table contract that replaces inline lookup utility models with source-backed database reference tables. Keep v2 intact. Do not apply DDL, do not load/upsert reference data, do not change frontend/backend/Excel runtime consumers, and do not promote generated SQL in this task.
</task>

<deliverables>
1. Add a `positions_and_trades_v3` dbt model subtree under `dbt/azure_postgres/models/positions_and_trades_v3/`.
2. Add source YAML for a new reference schema, using a clear schema name such as `positions_and_trades_ref`, with sources for product catalog, product alias rules, account lookup, and month codes.
3. Add v3 utility models that read from the reference sources and expose the same logical columns currently used by v2: product catalog fields, alias rule fields, account lookup fields, and month-code fields.
4. Port the v2 NAV and Clear Street model layers into v3 so they reference the v3 utilities while preserving source contracts, output columns, grain, and rule status semantics unless a contract change is explicitly justified.
5. Add operator-applied reference DDL under `dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/`, including schema/table definitions, primary keys or unique constraints, useful indexes, comments explaining grain, and read-only grant expectations.
6. Add an example reviewed-insert SQL file or documentation stub for future rule rows, but do not run it and do not add an upsert loader.
7. Add v3 data tests mirroring the current v2 product-matching tests where they can compile against the v3 models. Mark or document any tests that cannot pass until the reference tables exist and have data.
8. Update dbt docs/README references to explain that v3 lookup tables are database-backed contracts and that v3 is not cut over to frontend/backend/Excel consumers yet.
9. Do not edit generated SQL artifacts under `frontend/sql/...`.
</deliverables>

<implementation_rules>
- Keep `positions_and_trades_v2` unchanged. Why: v2 is the current promoted model family and runtime-generated artifacts still depend on it.
- Use database reference sources in v3 instead of inline `values` CTEs for product aliases, product catalog, account lookup, and month codes. Why: lookup-row corrections should not require recompiling every downstream SQL artifact after the future cutover.
- Do not use dbt seeds for the operational rule update path. Why: the goal is to avoid needing dbt runs every time a reviewed lookup row lands.
- Do not apply DDL, run write SQL, create an upsert script, or mutate Azure Postgres. Why: this task defines the contract only; database application and data loading need separate operator approval.
- Keep DDL under `reference_sql/ddl` as operator-applied SQL. Why: this repo does not manage database migrations through dbt.
- Use `source()` for reference tables and `ref()` for v3 dbt models. Why: it keeps database-owned reference data separate from dbt transformations.
- Preserve existing role boundaries: backend writes use `helios_admin`, dbt/frontend/inspection reads use `helios_readonly`, and reference table DDL is applied by an operator-capable role. Why: the current repo contracts depend on these credential boundaries.
- Every v3 SQL model that exposes a shaped contract must end with a terminal `FINAL` CTE followed by `select * from FINAL`. Why: HeliosCTA dbt models are kept inspectable with a consistent terminal CTE style.
- Keep NAV and Clear Street source grains separate. Why: `nav.positions` and `clear_street.eod_transactions` have different source systems, primary keys, schedules, and freshness fields.
- Do not change frontend/backend/Excel consumers in this task. Why: v3 should be reviewable before any production cutover.
</implementation_rules>

<open_questions>
- Reference schema name: default to `positions_and_trades_ref` unless repo evidence suggests an existing approved schema.
- Live-table shape: default to live approved rows only, with `is_active`, `valid_from`, `valid_to`, `created_at`, `created_by`, and `change_reason`; do not add `approval_status` to live tables unless the user asks.
- Candidate workflow: default to documenting candidate/review rows as out of scope for this task, or as a separate optional table if needed later.
- Initial data migration: default to not generating full insert statements from v2 inline values; include only a small example/stub unless the user asks for a full bootstrap script.
- Verification with live dbt tests: default to `dbt parse` and `dbt compile` only if reference tables do not exist in the target database; report skipped data tests clearly.
</open_questions>

<success_criteria>
- `git diff --check`
- `python C:/Users/AidanKeaveny/.codex/skills/helioscta-dbt-final-cte/scripts/check_final_cte.py dbt/azure_postgres/models/positions_and_trades_v3`
- From `dbt/azure_postgres`: `dbt parse --profiles-dir .`
- From `dbt/azure_postgres`: `dbt compile --profiles-dir . --select path:models/positions_and_trades_v3`
- `rg -n "values\\s*$|values\\s*\\(" dbt/azure_postgres/models/positions_and_trades_v3/utils` returns no inline lookup value blocks for product catalog, aliases, account lookup, or month codes.
- `rg -n "source\\('positions_and_trades_ref'|positions_and_trades_ref|product_alias|product_catalog|account_lookup|month_codes" dbt/azure_postgres/models/positions_and_trades_v3 dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables`
- `git diff -- frontend/sql` shows no generated runtime SQL changes.
- Any skipped database/data tests are listed with the exact missing table or credential reason.
</success_criteria>

<process>
1. Read the required repo guidance and v2 positions/trades model files before editing.
2. Run an assumption audit for schema naming, role boundaries, no-upsert scope, DDL ownership, v2 compatibility, and future consumer cutover.
3. Design the reference table contracts first, including table grain and keys, then create v3 source YAML and utility models against those sources.
4. Port v2 model layers to v3 with minimal changes: only update refs to v3 utility/source-backed models unless a source contract requires more.
5. Add v3 tests and documentation that make the not-yet-loaded reference table limitation explicit.
6. Run style and compile checks that do not require applying database writes.
7. Review the diff for accidental generated SQL, frontend, backend runtime, credential, or DDL-application changes before final response.
</process>
