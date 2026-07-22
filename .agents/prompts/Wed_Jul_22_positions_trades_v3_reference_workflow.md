<role>
You are a senior HeliosCTA dbt/backend architecture agent. Document and harden the production workflow for `positions_and_trades_v3`, where lookup data is database-backed and dbt remains read-only.
</role>

<context>
`positions_and_trades_v3` is the promoted runtime model family. v3 reads `positions_and_trades_ref` tables instead of embedding product catalog, product alias, account lookup, and month-code values in dbt SQL. Frontend SQL is promoted as committed snapshots; backend MUFG and Excel SQL should use dbt compiled output directly.

The workflow has changed from "edit dbt inline values, compile, and promote SQL everywhere" to "review lookup changes, update the maintained reference values SQL, sync approved rows into `positions_and_trades_ref`, and let compiled table-backed SQL read the updated rows." The values SQL is a current-state sync: rows in the file are inserted or updated, and rows removed from the file are deleted from the live tables.

Runtime lookup tables do not use `approval_status`, `is_active`, `valid_from`, `valid_to`, or `change_reason`. A row is approved because it is present in the maintained operator SQL and has been applied by an operator-capable role. Clear Street PMI/P1X CUSIP matching now lives in `product_alias_rules` with `match_type = 'cusip_prefix'`, not hard-coded dbt SQL.
</context>

<source_files>
- `AGENTS.md`
- `dbt/azure_postgres/AGENTS.md`
- `dbt/azure_postgres/README.md`
- `dbt/azure_postgres/models/positions_and_trades_v3/README.md`
- `dbt/azure_postgres/models/positions_and_trades_v3/utils/sources.yml`
- `dbt/azure_postgres/models/positions_and_trades_v3/clear_street_eod_transactions/int/cs_v3_40_int_product_matches.sql`
- `dbt/azure_postgres/models/positions_and_trades_v3/nav_positions/int/nav_v3_20_int_product_matches.sql`
- `dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/`
- `dbt/azure_postgres/scripts/promote_positions_trades_sql.py`
- `frontend/sql/`
- `backend/scrapes/clear_street/mufg_upload.py`
</source_files>

<task>
Create a production-grade workflow document for positions/trades v3 reference-data maintenance. Explain how product matching changes are made now, how operators apply and verify lookup changes, and when dbt compile or frontend SQL promotion is still required.
</task>

<deliverables>
1. Document the `positions_and_trades_ref` table contracts for `product_catalog`, `product_alias_rules`, `account_lookup`, and `month_codes`.
2. Add an operator runbook: edit values SQL, review diff, apply DDL or migration only if needed, apply values sync, apply indexes, run verification SQL, run dbt tests.
3. Add a decision table for product-matching failures: reference-data change, parser/model-code change, frontend SQL promotion, or backend/Excel dbt compile refresh.
4. Document that ordinary lookup row changes should not require dbt compile or SQL promotion after v3 cutover.
5. Include the Clear Street `cusip_prefix` rule pattern and the `IFEDPMI -> PMI`, `IFEDP1X -> P1X` rows as examples.
</deliverables>

<implementation_rules>
- Keep dbt read-only. Why: the dbt project uses `helios_readonly` and must not mutate database objects.
- Keep DDL and values sync under `dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/`. Why: these are operator-applied database changes.
- Treat `upsert_positions_and_trades_reference_values.sql` as the maintained source of truth despite its historical filename. Why: it now syncs live rows exactly to file contents.
- Do not reintroduce runtime approval or active-window columns. Why: current approved state is represented by the maintained values file.
- Keep Clear Street CUSIP-prefix logic in `product_alias_rules`. Why: new CUSIP-prefix fixes should be reviewed data changes, not dbt SQL edits.
- Promote frontend SQL only when v3 model logic or frontend output contracts change. Why: lookup-only changes are read from reference tables at query time.
</implementation_rules>

<open_questions>
- Documentation location: default to `dbt/azure_postgres/models/positions_and_trades_v3/README.md` plus the reference-table README.
- Rename values script: default to keeping the existing filename and documenting that it performs a full sync.
- Rule identity: default to keeping `(source, source_priority)` because full sync handles moved priorities; propose `rule_id` only if audit/versioning becomes required.
</open_questions>

<success_criteria>
- `git diff --check`
- `python .agents/skills/helioscta-dbt-final-cte/scripts/check_final_cte.py dbt/azure_postgres/models/positions_and_trades_v3`
- From `dbt/azure_postgres`: `dbt parse --profiles-dir <profile_dir>`
- From `dbt/azure_postgres`: `dbt compile --profiles-dir <profile_dir> --select path:models/positions_and_trades_v3`
- From `dbt/azure_postgres`: `dbt test --profiles-dir <profile_dir> --select tag:positions_and_trades_v3`
- `rg -n "approval_status|is_active|valid_from|valid_to|change_reason" dbt/azure_postgres/models/positions_and_trades_v3 dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/upsert_positions_and_trades_reference_values.sql` returns no runtime lookup usage.
- `rg -n "cusip_prefix|IFEDPMI|IFEDP1X" dbt/azure_postgres/models/positions_and_trades_v3 dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables`
</success_criteria>

<process>
1. Read the repo/dbt instructions, v3 README, reference-table SQL, and v3 matching models.
2. Write an assumption audit for operator ownership, current-state sync semantics, v2 production status, and generated SQL promotion boundaries.
3. Update documentation so the workflow is explicit and operator-safe.
4. Verify docs do not contradict implemented SQL behavior, then run the smallest meaningful dbt/style checks available.
</process>
