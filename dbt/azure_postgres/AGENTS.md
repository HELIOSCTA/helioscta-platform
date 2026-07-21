# HeliosCTA Azure Postgres dbt Agent Guide

This directory is a read-only dbt project for Azure Postgres inspection,
positions/trades transformation SQL, generated SQL promotion, and product
matching validation. Follow the root `AGENTS.md` first, then these dbt-specific
rules.

Use the repo skill at
`../../.agents/skills/positions-trades-product-matching` for scheduled or
manual product-matching dbt runs, unresolved `rule_status` failures,
NAV freshness prechecks, failure-row sampling, and alias/catalog/rule-fix
proposals. Use the repo skill at `../../.agents/skills/helioscta-dbt-final-cte`
for dbt SQL model style.

## Runtime Boundary

- Use the `helios_readonly` dbt profile for dbt runs and inspection queries.
- Do not create, update, delete, or persist database objects from this dbt
  project unless the user explicitly asks for operator SQL.
- Database DDL and permissions remain operator-applied under
  `infrastructure/azure-postgres/` or documented reference SQL.
- Do not print `.env` values, Postgres passwords, SFTP secrets, Outlook
  credentials, chat tokens, or other credential material.
- Treat `target/`, `logs/`, `dbt_packages/`, `.env`, and `profiles.yml` as
  local runtime artifacts unless the user explicitly asks to inspect them.

## Required Reads

Before editing dbt models, tests, generated SQL promotion, or scheduled
product-matching behavior, read:

- `README.md`
- `dbt_project.yml`
- The relevant source, int, mart, or test SQL under
  `models/positions_and_trades_v2/` and `tests/positions_and_trades_v2/`
- `scripts/promote_positions_trades_sql.py` when generated frontend/backend SQL
  artifacts are affected

For positions/trades product matching, also inspect:

- `models/positions_and_trades_v2/utils/`
- `models/positions_and_trades_v2/nav_positions/`
- `models/positions_and_trades_v2/clear_street_eod_transactions/`
- `tests/positions_and_trades_v2/nav_positions/nav_all_history_rule_status_ok.sql`
- `tests/positions_and_trades_v2/clear_street_eod_transactions/clear_street_all_history_rule_status_ok.sql`

## Model Style

- Keep positions/trades SQL inspectable: use explicit CTEs and a terminal
  `FINAL` CTE followed by `select * from FINAL`.
- Prefer source-specific normalization in `src` and `int` models, shared lookup
  data in `utils`, and review/export-facing shapes in `marts`.
- Keep product aliases, product catalog rows, account lookups, and month-code
  rules in the shared utility models unless the rule is genuinely
  source-specific.
- Preserve the source contracts documented in `README.md`: raw Clear Street and
  NAV tables remain source snapshots, while product/account/contract matching is
  derived by read-only SQL.
- Do not edit generated SQL artifacts directly. Change dbt models, run
  `dbt compile`, then run `python scripts/promote_positions_trades_sql.py`.

## Local Windows Product-Matching Runner

For the all-history product-matching suite on Aidan's Windows workstation, use
the checked-in runner:

```powershell
cd C:\Users\AidanKeaveny\Documents\github\helioscta-platform\dbt\azure_postgres
.\scripts\run_product_matching_tests.ps1
```

The runner selects:

```text
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\Scripts\dbt.exe
```

It loads `.env` without printing values and strips one paired set of surrounding
single or double quotes from each value.

The exact dbt command is:

```powershell
C:\Users\AidanKeaveny\miniconda3\envs\helioscta-azure-backend\Scripts\dbt.exe test --profiles-dir . --select tag:product_matching
```

Success means:

```text
PASS=2 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=2
```

`Permission denied (10013)` while connecting to Azure Postgres on TCP `5432` is
a Codex/host network-permission problem, not a dbt model or credential failure.
Do not diagnose model logic until the database connection succeeds.

## Failure Triage

For product-matching failures, invoke or follow the repo skill
`positions-trades-product-matching`. Scheduled runs should first check NAV
freshness through read-only database context. Failure triage should inspect
local dbt SQL and dbt artifacts, query small read-only failure samples, group
failures by source/product/account/contract fields, and propose the smallest
alias/catalog/parser/rule fix without editing files automatically.

## Verification

For dbt-only changes, prefer the smallest meaningful checks:

```powershell
dbt parse --profiles-dir .
dbt compile --profiles-dir . --select path:models/positions_and_trades_v2
.\scripts\run_product_matching_tests.ps1
```

For positions/trades SQL style checks, run from the repo root:

```powershell
python .agents\skills\helioscta-dbt-final-cte\scripts\check_final_cte.py dbt\azure_postgres\models\positions_and_trades_v2
```

For repo skill validation, run from the repo root:

```powershell
python C:\Users\AidanKeaveny\.codex\skills\.system\skill-creator\scripts\quick_validate.py .agents\skills\positions-trades-product-matching
python C:\Users\AidanKeaveny\.codex\skills\.system\skill-creator\scripts\quick_validate.py .agents\skills\helioscta-dbt-final-cte
```

If generated SQL changes, also run:

```powershell
python scripts/promote_positions_trades_sql.py
```

Then review the generated diff for intended changes only.
