---
name: positions-trades-product-matching
description: Run, monitor, or triage HeliosCTA positions/trades product-matching dbt tests under dbt/azure_postgres. Use when working on scheduled or manual dbt tag:positions_trades_product_matching runs, unresolved product rule_status failures, NAV positions or Clear Street all-history rule-status tests, product alias/catalog fixes, dbt target artifacts, or failure reports for the active 2026_07_22_ref_tables model family.
---

# Positions/Trades Product Matching

Use this skill for the read-only dbt product-matching gate under
`dbt/azure_postgres`. The goal is to prove that the expected NAV source date is
loaded, NAV positions and Clear Street all-history rows resolve to valid
products, or to produce a focused rule-change proposal when they do not.

## Boundaries

- Run against Azure Postgres with the read-only dbt profile.
- Prefer `mcp__heliosctadb_helios_prod_helios_readonly.query` for freshness and
  failure-row context when that MCP tool is available.
- Never use the admin database MCP connection for scheduled freshness checks or
  triage.
- Do not print `.env` values or credentials.
- Do not create, update, delete, or persist database objects.
- Do not edit repo files during scheduled failure triage unless the user asks
  for implementation after reviewing the proposed fix.
- Treat `Permission denied (10013)` to Postgres TCP `5432` as a Codex or host
  network-permission issue, not a dbt model or credential issue.

## Freshness Precheck

Before running dbt in scheduled mode, verify the expected previous-business NAV
date exists in `nav.positions` for every selected fund. The NAV scheduler
targets the previous calendar day while skipping Saturday and Sunday. The normal
selected fund count is `4`.

Read `references/nav-freshness-precheck.md` when implementing this precheck.
If the expected NAV date is missing or has fewer than the selected fund count,
report `Product-matching dbt heartbeat pending/stale` and stop before dbt. This
prevents a pass against stale all-history rows.

## Primary Runner

From `dbt/azure_postgres`, prefer the checked-in PowerShell runner on the
Windows workstation:

```powershell
.\scripts\run_product_matching_tests.ps1
```

The runner loads `.env` without printing values, strips one paired set of
surrounding quotes from values, activates the expected Conda paths, and runs:

```powershell
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\Scripts\dbt.exe test --profiles-dir . --select tag:positions_trades_product_matching
```

Success is exactly:

```text
PASS=2 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=2
```

## Required Files

Before diagnosing model failures, inspect the relevant local SQL:

- `tests/positions_and_trades/2026_07_22_ref_tables/nav_positions/nav_all_history_product_matching_must_be_ok.sql`
- `tests/positions_and_trades/2026_07_22_ref_tables/clear_street_eod_transactions/clear_street_all_history_product_matching_must_be_ok.sql`
- `models/positions_and_trades/2026_07_22_ref_tables/utils/`
- `models/positions_and_trades/2026_07_22_ref_tables/nav_positions/`
- `models/positions_and_trades/2026_07_22_ref_tables/clear_street_eod_transactions/`

Paths are repo-root relative unless explicitly noted. For generated SQL
consumers, inspect:

- `scripts/promote_positions_trades_sql.py`
- `frontend/sql/clear-street-trades/`
- `frontend/sql/nav-positions/`
- `target/compiled/helioscta_platform/models/positions_and_trades/2026_07_22_ref_tables/` after
  `dbt compile`

For canonical failure sampling commands, read
`references/sample-failure-queries.md` only when Azure Postgres connects and a
product-matching test fails.

## Failure Workflow

If the scheduled freshness precheck is pending/stale, stop before dbt and
report the expected NAV date, latest loaded NAV date, funds seen for the
expected date, latest load timestamp, and a one-sentence stale-data explanation.

If dbt cannot start, the adapter is missing, credentials are missing, or Azure
Postgres cannot connect, report the environment failure and stop. Do not infer
product-rule causes.

If Azure Postgres connects and either product-matching test fails:

1. Read `target/run_results.json` and any compiled/run SQL for the failed test
   under `target/compiled` or `target/run`.
2. Query a read-only sample from the failed test query or exception mart. Use
   `references/sample-failure-queries.md` for canonical commands. Limit to 25
   rows per source.
3. Group failures by fields that exist in the failing relation:
   `rule_status`, source product, account/account name, contract month/year,
   `contract_yyyymm`, put/call, strike, source date, and upload timestamp.
4. Compare failing source product strings against product aliases, product
   catalog entries, account lookup rows, and month-code/date parsing rules.
5. Identify the smallest likely fix: alias, catalog, account lookup,
   month/date parser, option field handling, or source-specific normalization.
6. Produce a fix proposal with file paths and exact rule rows or SQL logic to
   review. Do not apply the fix unless asked.

## Report Format

For passing runs, keep the response short:

```text
Product-matching dbt heartbeat passed.
<host/surface>
<working directory>
<test statuses>
<final dbt summary>
```

For failing runs, lead with findings:

- Operator summary
- Failed test names
- Grouped failure counts
- Up to 10 representative rows
- Likely root cause
- Proposed fix with local file paths
- Exact rerun command
- Residual uncertainty

## Implementation Verification

When the user asks to implement a proposed dbt fix, keep the change surgical and
run the smallest meaningful checks:

```powershell
dbt parse --profiles-dir .
dbt compile --profiles-dir . --select path:models/positions_and_trades/2026_07_22_ref_tables
.\scripts\run_product_matching_tests.ps1
```

If generated SQL artifacts are affected, run:

```powershell
python scripts/promote_positions_trades_sql.py
```

Then review the generated diff and call out unrelated dirty worktree changes
that were left untouched.
