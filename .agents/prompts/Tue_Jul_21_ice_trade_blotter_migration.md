<role>
You are Codex working in `C:\Users\AidanKeaveny\Documents\github\helioscta-platform`. Implement a production-bound backend migration that promotes legacy ICE trade blotter ingestion into this repo so ICE trades can be inspected against NAV positions and Clear Street trades.
</role>

<context>
The user goal is to migrate `C:\Users\AidanKeaveny\Documents\github\helioscta-azure-backend\backend\scrapes\ice_trade_blotters` into `helioscta-platform` and make raw ICE blotter trades queryable now against existing `nav.positions` and `clear_street.eod_transactions` data.

Copy the legacy package files over as the implementation starting point, then adapt them to this repo's production rules. The legacy package contains `settings.py`, `__init__.py`, `scripts/manage_csv_files.py`, `scripts/upsert_ice_trade_blotters.py`, `scripts/backfill_ice_trade_blotters.py`, and tests. It also contains runtime artifacts such as `csv/`, `logs/`, and `__pycache__/`.

Keep dbt out of this task. Do not add dbt models, dbt tests, dbt macros, generated dbt SQL, or dbt verification commands. If you add operator DDL under the repo's existing `dbt/azure_postgres/reference_sql/ddl` tree, treat those files strictly as reference/operator SQL and do not run dbt.

The target durable source tables are:
- `ice_trade_blotter.ice_trade_blotter`: raw parsed ICE Deal Report rows.
- `ice_trade_blotter.file_manifest`: one row per managed source `.xls` file.

Do not add a `row_metadata` table. The legacy reference to `row_metadata` is migration cleanup baggage; the raw trade table already stores lineage through `file_hash`, `source_row_number`, and `source_row_hash`.

Existing repo patterns to preserve:
- Backend scripts run as `helios_admin` and assume direct-write tables already exist.
- Runtime DDL is not managed by backend loaders.
- API/file-fetch telemetry goes to `ops.api_fetch_log` through `backend.utils.ops_logging.log_api_fetch`.
- Do not introduce `ops.pipeline_runs` or `pipeline_run_logger`.
- Python scrape and orchestration entry points use function parameters with defaults, not `argparse`.
- ICE-related runtime is local Windows-oriented. Do not add Linux systemd units for ICE workflows.
- Raw source tables should remain raw; product/account/contract normalization belongs in read-only inspection SQL, not persisted columns.
</context>

<source_files>
Read these before editing:
- `AGENTS.md`
- `README.md`
- `backend/README.md`
- `infrastructure/azure-postgres/README.md`
- `.agents/context/one-shot-implementation-workflow.md`
- `.agents/context/assumptions-audit.md`
- `C:\Users\AidanKeaveny\Documents\github\helioscta-azure-backend\backend\scrapes\ice_trade_blotters\settings.py`
- `C:\Users\AidanKeaveny\Documents\github\helioscta-azure-backend\backend\scrapes\ice_trade_blotters\scripts\manage_csv_files.py`
- `C:\Users\AidanKeaveny\Documents\github\helioscta-azure-backend\backend\scrapes\ice_trade_blotters\scripts\upsert_ice_trade_blotters.py`
- `C:\Users\AidanKeaveny\Documents\github\helioscta-azure-backend\backend\scrapes\ice_trade_blotters\scripts\backfill_ice_trade_blotters.py`
- `C:\Users\AidanKeaveny\Documents\github\helioscta-azure-backend\backend\scrapes\ice_trade_blotters\tests\test_manage_csv_files.py`
- `C:\Users\AidanKeaveny\Documents\github\helioscta-azure-backend\backend\scrapes\ice_trade_blotters\tests\test_upsert_ice_trade_blotters.py`
- `backend/scrapes/clear_street/transactions.py`
- `backend/orchestration/clear_street/transactions.py`
- `backend/scrapes/nav/positions.py`
- `backend/scrapes/ice_python/README.md`
- `backend/scrapes/ice_python/storage.py`
- `backend/orchestration/ice_python/settlements/_runtime.py`
- `backend/utils/db.py`
- `backend/utils/ops_logging.py`
- `dbt/azure_postgres/reference_sql/ddl/setup/schemas.sql`
- `dbt/azure_postgres/reference_sql/ddl/clear_street/eod_transactions/table_clear_street_eod_transactions.sql`
- `dbt/azure_postgres/reference_sql/ddl/clear_street/eod_transactions/index_clear_street_eod_transactions.sql`
- `dbt/azure_postgres/reference_sql/ddl/nav/positions/table_nav_positions.sql`
- `backend/tests/test_clear_street_transactions.py`
- `backend/tests/test_nav_positions.py`
- `backend/tests/test_ice_python_orchestration.py`
</source_files>

<task>
Implement the ICE trade blotter migration in one pass: copy the legacy package into the promoted repo, adapt it to this repo's backend, telemetry, table-contract, and verification standards, and add plain read-only SQL files that let operators inspect ICE trades relative to NAV positions and Clear Street trades without using dbt.
</task>

<deliverables>
1. Add `backend/scrapes/ice_trade_blotters/` with the copied legacy code adapted to current repo imports, logging, database helpers, and package layout.
2. Add a promoted orchestration entry point at `backend/orchestration/ice_trade_blotters/trades.py` with `main(...)` defaults and `raise SystemExit(main())`.
3. Add a local-cache/backfill entry point at `backend/backfills/ice_trade_blotters/from_legacy_cache.py` or the nearest existing backfill pattern.
4. Add operator DDL for `ice_trade_blotter.ice_trade_blotter` and `ice_trade_blotter.file_manifest`, including primary keys and indexes.
5. Add gitignore coverage for local ICE blotter inbox/formatted/log/cache folders so source report files and logs are not committed.
6. Add read-only inspection SQL under `backend/scrapes/ice_trade_blotters/sql/inspection/`:
   - `latest_ice_trade_blotter_summary.sql`
   - `ice_vs_clear_street_trades.sql`
   - `ice_vs_nav_positions.sql`
   - `ice_trade_blotter_rule_exceptions.sql`
7. Port the legacy parser and business-key tests into `backend/tests/test_ice_trade_blotters.py`.
8. Update backend/operator docs with the source contract, manual run command, backfill command, required DDL files, cache behavior, telemetry checks, and residual manual workflow.
</deliverables>

<implementation_rules>
- Copy legacy source and test files first, then refactor. Why: this preserves parser behavior and avoids silently dropping edge-case handling such as HTML `.xls` sections and lossy scientific-notation ID checks.
- Do not commit `csv/`, `logs/`, `__pycache__/`, or historical `.xls` source files. Why: those are local runtime artifacts and may contain sensitive trade data.
- If historical `.xls` files are needed for validation or backfill, read them from the legacy path or from a gitignored local cache. Why: operators need lineage without storing source trade files in git.
- Keep the durable table names `ice_trade_blotter.ice_trade_blotter` and `ice_trade_blotter.file_manifest`. Why: this preserves the legacy contract while making it explicit in the promoted repo.
- Do not create, drop, alter, or index production tables from runtime Python modules. Why: this repo requires operator-applied direct-write table DDL before backend jobs run.
- Remove or replace all legacy `azure_postgresql_utils`, `pipeline_run_logger`, and `pipeline_runs` usage. Why: promoted backend code uses `backend.utils.db` for writes and `ops.api_fetch_log` for telemetry.
- Use `backend.utils.db.upsert_dataframe` for table writes. Why: it validates operator-created target tables and follows the repo's staging/upsert pattern.
- Use `backend.utils.ops_logging.log_api_fetch` for manual and backfill telemetry. Why: `ops.api_fetch_log` is the durable scrape telemetry ledger in this repo.
- Keep function-argument defaults for all entry points and do not add `argparse` or `sys.argv` parsing. Why: HeliosCTA scrape/orchestration modules are called by scheduler wrappers and tests without shell flags.
- Keep the raw ICE source table raw. Why: comparisons to NAV and Clear Street should be inspectable and reversible in read-only SQL.
- Preserve the legacy trade business key exactly unless repo evidence proves it is wrong: `deal_id`, `trade_date`, `user_id`, `leg_id`, `b_s`, `hub`, `contract`, `begin_date`, `end_date`, `lots`, `total_quantity`, `price`, `option`, `strike`, `strike_2`. Why: this is the current safe-rerun key and dedupe contract.
- Preserve lossy ID rejection for `deal_id`, `leg_id`, `orig_id`, and `link_id`. Why: scientific notation in exported trade IDs can create false deal identity.
- Do not add a scheduler or Windows Task Scheduler installer unless the user explicitly asks during implementation. Why: the immediate goal is manual inspection and backfill, not a new scheduled production workflow.
- Do not add dependencies unless the task is impossible without them and the user approves. Why: the legacy parser handles HTML `.xls` exports with the standard library and pandas.
- Do not add dbt models, dbt tests, dbt compile steps, dbt source YAML, or dbt-generated SQL. Why: the user explicitly removed dbt from this migration plan.
- Work around unrelated dirty worktree changes without reverting them. Why: this repo may contain user-owned work in progress.
</implementation_rules>

<open_questions>
- Should historical `.xls` files be physically copied into this repo? Default: no. Keep them outside git and load from the legacy path or a gitignored cache.
- Should ICE blotter ingestion be scheduled after this lands? Default: no. Deliver manual orchestration and backfill only.
- Should comparison outputs become persisted tables later? Default: no. Start with read-only SQL files so operators can inspect the shape before promoting derived tables.
</open_questions>

<success_criteria>
- `python -m pytest backend/tests/test_ice_trade_blotters.py`
- `python -m pytest backend/tests/test_clear_street_transactions.py backend/tests/test_nav_positions.py backend/tests/test_ice_python_orchestration.py`
- `python -m pytest backend/tests`
- `python -c "from backend.scrapes.ice_trade_blotters.scripts import manage_csv_files, upsert_ice_trade_blotters; from backend.orchestration.ice_trade_blotters import trades; print('ice trade blotter import ok')"`
- `rg -n "pipeline_runs|PipelineRunLogger|pipeline_run_logger" backend/scrapes/ice_trade_blotters backend/orchestration/ice_trade_blotters backend/backfills/ice_trade_blotters` returns no runtime matches.
- `rg -n "argparse|sys\\.argv" backend/scrapes/ice_trade_blotters backend/orchestration/ice_trade_blotters backend/backfills/ice_trade_blotters` returns no matches.
- `rg -n "CREATE TABLE|DROP TABLE|CREATE SCHEMA|CREATE INDEX|ALTER TABLE" backend/scrapes/ice_trade_blotters backend/orchestration/ice_trade_blotters backend/backfills/ice_trade_blotters` returns no runtime Python DDL matches.
- `rg -n "\\{\\{|ref\\(|source\\(" backend/scrapes/ice_trade_blotters/sql/inspection` returns no matches.
- If Azure Postgres credentials and approval to write are available, apply the operator DDL with `helios_admin`, run a small manual import/backfill from a known `.xls`, then verify:
  - row count in `ice_trade_blotter.ice_trade_blotter`
  - one `file_manifest` row per managed file hash
  - no duplicate rows by the trade business key
  - latest `ops.api_fetch_log` row for the ICE blotter operation has `status = 'success'`
  - inspection SQL returns rows or an explainable empty set.
- Final response includes changed behavior, files touched, verification results, skipped checks with exact reasons, residual risk, and any user-owned dirty worktree changes left untouched.
</success_criteria>

<process>
1. Inspect the required docs and source files. State the repo pattern you will follow and run a short assumption audit before editing.
2. Check `git status --short` and note unrelated dirty files. Do not revert user-owned changes.
3. Copy the legacy ICE trade blotter package files into the promoted repo, excluding runtime artifacts from git.
4. Refactor imports and settings to use current repo paths, `backend.utils.db`, `backend.utils.script_logging`, and `backend.utils.ops_logging`.
5. Move table/schema/index creation out of runtime Python and into operator SQL files.
6. Add orchestration and backfill entry points with function defaults and `ops.api_fetch_log` telemetry.
7. Add plain read-only inspection SQL for ICE vs Clear Street and ICE vs NAV review.
8. Port and expand tests around HTML `.xls` parsing, lossy ID rejection, file manifest behavior, dedupe by business key, upsert arguments, and telemetry payloads.
9. Run the verification commands. If database credentials or write approval are missing, run all offline tests/import checks and document exactly what database checks remain.
10. Review `git diff` for unrelated churn before final response.
</process>
