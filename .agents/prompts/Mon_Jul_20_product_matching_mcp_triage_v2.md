<role>
You are Codex running the HeliosCTA positions/trades product-matching scheduled task on the local Windows workstation. Use the `positions-trades-product-matching` skill and treat this as a read-only freshness check, dbt validation, and failure-triage task, not an implementation task.
</role>

<context>
Run this task locally on this Windows PC only. Do not use Cloud execution or web execution. The project root is `C:\Users\AidanKeaveny\Documents\github\helioscta-platform`, and the command working directory is `C:\Users\AidanKeaveny\Documents\github\helioscta-platform\dbt\azure_postgres`.

The NAV positions loader is a local Windows SFTP workflow. Repo docs and code say it starts at local hour `04` by default, targets the previous business NAV date, polls every five minutes until `11:00` local time, and waits for every selected fund before upserting to `nav.positions`. Relevant paths: `backend/README.md`, `infrastructure/windows-task-scheduler/README.md`, and `backend/orchestration/nav/positions.py`.

Recent read-only MCP inspection showed the latest expected NAV date for Monday `2026-07-20` was `2026-07-17`; it loaded `2,572` rows for `4` funds at `2026-07-20 04:11:05` Mountain. Across recent live target dates since `2026-07-10`, complete NAV SFTP arrivals were between about `03:13:50` and `05:26:19` Mountain and DB loads were between about `04:00:14` and `05:32:14` Mountain. A `06:00` Mountain product-matching run usually has buffer, but the dbt tests only validate rows that already exist. If the expected NAV date has not landed, product-matching can pass against stale all-history data.

The product-matching gate validates read-only `positions_and_trades_v2` dbt models against Azure Postgres. NAV product-matching failures are any `rule_status is distinct from 'ok'`; Clear Street product-matching failures are any `rule_status` other than `ok` or the intentional `non_product_cash_adjustment` bucket.

Use the read-only Helios MCP database connection for freshness and failure-row context. Prefer `mcp__heliosctadb_helios_prod_helios_readonly.query`; if the tool is not already visible, search tool metadata for the Helios read-only database query tool. Never use the admin database MCP connection for scheduled freshness checks or triage.
</context>

<source_files>
- `.agents/skills/positions-trades-product-matching/SKILL.md`
- `backend/README.md`
- `infrastructure/windows-task-scheduler/README.md`
- `backend/orchestration/nav/positions.py`
- `dbt/azure_postgres/tests/positions_and_trades_v2/nav_positions/nav_all_history_rule_status_ok.sql`
- `dbt/azure_postgres/tests/positions_and_trades_v2/clear_street_eod_transactions/clear_street_all_history_rule_status_ok.sql`
- `dbt/azure_postgres/models/positions_and_trades_v2/utils/utils_v2_positions_and_trades_product_aliases.sql`
- `dbt/azure_postgres/models/positions_and_trades_v2/utils/utils_v2_positions_and_trades_product_catalog.sql`
- `dbt/azure_postgres/models/positions_and_trades_v2/utils/utils_v2_positions_and_trades_account_lookup.sql`
- `dbt/azure_postgres/models/positions_and_trades_v2/utils/utils_v2_positions_and_trades_month_codes.sql`
- `dbt/azure_postgres/models/positions_and_trades_v2/nav_positions/`
- `dbt/azure_postgres/models/positions_and_trades_v2/clear_street_eod_transactions/`
- `dbt/azure_postgres/scripts/promote_positions_trades_sql.py`
- `backend/scrapes/positions_and_trades/sql/generated/`
- `frontend/sql/clear-street-trades/`
- `frontend/sql/nav-positions/`
</source_files>

<task>
Run the positions/trades scheduled check in three stages. First, use the read-only MCP database connection to verify that the expected previous-business NAV date is loaded in `nav.positions` for every selected fund. If the expected NAV date is missing or incomplete, report a short `pending/stale` result and stop before dbt. If freshness is good, run the dbt product-matching tests. If dbt passes, produce a short pass report. If dbt fails after connecting to Azure Postgres, inspect local dbt artifacts and use the read-only MCP database connection to query small samples of unmatched rows, group the failures, and propose the smallest dbt alias/catalog/parser/account/rule change needed to fix the model. Do not edit repo files automatically.
</task>

<deliverables>
1. A scheduled-task report whose first line and title include one of `passed`, `failed`, or `pending/stale`.
2. On `pending/stale`, the expected NAV date, latest loaded NAV date, funds seen for the expected date, latest load timestamp, and a one-sentence explanation that product matching was skipped to avoid validating stale rows.
3. On pass, a short dbt result report.
4. On failure after database connection, grouped failing-row counts from MCP read-only queries.
5. On failure after database connection, up to 10 representative failing rows from MCP read-only queries.
6. On failure after database connection, a proposed fix with exact local file paths and exact SQL `values` rows or parser/rule logic to review.
7. The exact rerun command when dbt is run or should be rerun.
</deliverables>

<implementation_rules>
1. Run locally only. Why: this scheduled task depends on the local Windows workstation, Conda dbt environment, local `.env`, and local dbt artifacts.
2. Do not print `.env` values or credentials. Why: the report may become a desktop notification or email.
3. Use `mcp__heliosctadb_helios_prod_helios_readonly.query` for the NAV freshness precheck before running dbt. Why: the dbt tests can pass on stale all-history rows if today's expected NAV file is absent.
4. Do not use `mcp__heliosctadb_helios_prod_helios_admin` for freshness checks or scheduled triage. Why: these operations are read-only and should preserve the readonly role boundary.
5. Compute the expected NAV date the same way the NAV scheduler does: previous calendar day, skipping Saturday and Sunday. Why: `backend/orchestration/nav/positions.py` targets the previous business NAV date by default and does not currently encode a holiday calendar in `_previous_business_date`.
6. Treat the expected NAV date as fresh only when `nav.positions` has rows for all selected funds. The normal selected fund count is `4`; when possible, confirm fund codes from recent `nav_positions_scheduled` metadata or `nav.positions`. Why: partial NAV loads should not allow product matching to certify the day.
7. If the expected NAV date is missing or incomplete, report `Product-matching dbt heartbeat pending/stale` and stop before running dbt. Why: this is a source availability/timing issue, not a product-rule failure.
8. Before running dbt, load `.env` from the working directory and strip one paired set of surrounding single or double quotes from each value. Why: quoted values in `.env` should work without altering credential contents.
9. Run the exact primary command: `C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\Scripts\dbt.exe test --profiles-dir . --select tag:product_matching`. Why: the scheduled task should validate the same command every time.
10. Success is exactly `PASS=2 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=2`. Why: this gate has two data tests and no acceptable skips or warnings.
11. If dbt cannot start, the adapter is missing, credentials are missing, or Azure Postgres cannot connect, report the environment failure and stop. Why: product-rule causes cannot be inferred without a successful database-backed test.
12. If the connection fails with `Permission denied (10013)` on TCP `5432`, say the run did not use a Codex permission mode that allows outbound TCP 5432 from the local desktop environment. Why: this is a host/Codex permission issue, not a dbt model issue.
13. If either product-matching test fails after Azure Postgres connects, use `mcp__heliosctadb_helios_prod_helios_readonly.query` for failing-row context. Why: MCP gives direct read-only database context without mutating production objects.
14. Keep MCP queries small: aggregate counts first, then limit representative samples to 25 rows per failed source and report at most 10 rows. Why: scheduled notifications need signal, not a data dump.
15. Read `target/run_results.json` and the failed test SQL under `target/compiled` or `target/run` before writing failure-triage queries. Why: the compiled failed test SQL is the exact failing contract.
16. Use the failed test SQL as the source of truth for MCP sampling. Why: NAV and Clear Street intentionally have different accepted `rule_status` values.
17. Compare failing rows against aliases, product catalog, account lookup, month-code/date parsing, option handling, and source-specific normalization before proposing a fix. Why: most failures should be solved by a narrow rules change, not a broad refactor.
18. Do not edit repo files automatically during the scheduled task. Why: the operator should review proposed production-bound model changes before implementation.
19. If generated SQL artifacts appear stale, mention the needed promotion command but do not run it unless asked. Why: generated SQL updates can create broad diffs.
</implementation_rules>

<open_questions>
1. If the read-only MCP connection is unavailable before dbt runs, default to reporting that freshness could not be checked and do not run dbt unless the user explicitly asked to ignore freshness. Do not silently substitute the admin MCP connection.
2. If the expected NAV date is loaded for fewer than all selected funds, default to `pending/stale` and list missing or observed fund codes. Do not treat this as a dbt product-matching failure.
3. If the latest loaded NAV date is older than the expected previous-business NAV date, default to `pending/stale`, even if product-matching would likely pass against older all-history rows.
4. If the likely product-rule fix could be either a product alias or a new product catalog entry, default to proposing both rows together only when the product code is clearly absent from the catalog; otherwise propose the alias-only change.
5. If a failing source product looks like cash, fee, collateral, or FX rather than a tradeable product, default to proposing a source-specific rule-status exception rather than forcing it into the product catalog.
</open_questions>

<success_criteria>
- Freshness precheck uses `mcp__heliosctadb_helios_prod_helios_readonly.query` before dbt.
- Freshness precheck identifies the expected previous-business NAV date, latest loaded NAV date, row count, distinct fund count, and latest DB load timestamp in Mountain time.
- If freshness is missing or incomplete, the report title is exactly `Product-matching dbt heartbeat pending/stale`, dbt is not run, and the report explains that stale all-history rows were not validated.
- If freshness is good, the dbt command runs from `C:\Users\AidanKeaveny\Documents\github\helioscta-platform\dbt\azure_postgres`.
- The report includes execution host/surface if visible, hostname if available, working directory, exact command when dbt ran, Azure Postgres connection status, both test statuses when dbt ran, and final dbt summary line when dbt ran.
- Passing report title is exactly `Product-matching dbt heartbeat passed`.
- Failing report title is exactly `Product-matching dbt heartbeat failed`.
- Passing success line is exactly `PASS=2 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=2`.
- If product-rule tests fail, the report includes failed test names, grouped failure counts, representative rows, likely root cause, proposed local file changes, exact rerun command, and residual uncertainty.
- If product-rule tests fail, at least one MCP read-only query is used to inspect the failing rows, unless the report explicitly states that the read-only MCP tool was unavailable.
</success_criteria>

<process>
1. Read `.agents/skills/positions-trades-product-matching/SKILL.md`, `backend/orchestration/nav/positions.py`, and the two product-matching test files.
2. Capture host/surface context: use `$env:COMPUTERNAME` for hostname and mention Codex desktop/PowerShell if visible.
3. Use `mcp__heliosctadb_helios_prod_helios_readonly.query` to confirm the database context when useful: `select current_database(), current_user`.
4. Use `mcp__heliosctadb_helios_prod_helios_readonly.query` to calculate the expected previous-business NAV date and compare it with `nav.positions`.
5. For the freshness query, return at least: current date, expected NAV date, latest NAV date in `nav.positions`, row count for expected date, distinct fund count for expected date, observed fund codes for expected date, and latest `created_at` converted to `America/Denver`.
6. If the expected NAV date is missing, older than expected, or has fewer than the selected fund count, report `Product-matching dbt heartbeat pending/stale` and stop before dbt.
7. If freshness is good, change to `C:\Users\AidanKeaveny\Documents\github\helioscta-platform\dbt\azure_postgres`.
8. Load `.env` into process environment without printing values, stripping one paired set of surrounding single or double quotes from each value.
9. Run `C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\Scripts\dbt.exe test --profiles-dir . --select tag:product_matching`.
10. Parse the dbt output for `clear_street_all_history_rule_status_ok`, `nav_all_history_rule_status_ok`, connection status, and the final `Done. ...` summary.
11. If the run passes exactly, report only the short pass format and stop.
12. If dbt cannot start or connect, report the full dbt error summary and stop without model triage.
13. If one or both tests fail after connecting, read `target/run_results.json` and the failed test SQL under `target/compiled` or `target/run`.
14. Use the read-only MCP database query tool to run grouped counts over the failed test SQL. Group by available fields such as `rule_status`, source product, account/account name, `month_year`, `contract_yyyymm`, put/call, strike, source date, and upload timestamp.
15. Use the read-only MCP database query tool to fetch representative rows from the failed test SQL, ordered by newest source date/upload and highest-count groups first. Limit to 25 rows per failed source and report at most 10 rows total.
16. Inspect the relevant local dbt SQL in `models/positions_and_trades_v2/utils/`, `nav_positions/`, and `clear_street_eod_transactions/`.
17. Propose the smallest fix. Use exact paths such as `dbt/azure_postgres/models/positions_and_trades_v2/utils/utils_v2_positions_and_trades_product_aliases.sql` and include exact `values` rows or SQL logic changes.
18. Include the rerun command: `C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\Scripts\dbt.exe test --profiles-dir . --select tag:product_matching`.
19. If email notification tooling is available in this Codex task, send email only on failure to the configured HeliosCTA operator recipients and include the same concise failure report. Do not send email for a normal `pending/stale` freshness wait unless the user later asks for stale-data alerts by email.
</process>
