<role>
You are Codex acting as a senior full-stack engineer in the HeliosCTA platform repo. Implement a production-bound change that exposes the active positions/trades dbt validation checks on the frontend Positions Home tab.
</role>

<context>
The repo root is `C:\Users\AidanKeaveny\Documents\github\helioscta-platform`. The active dbt project is `dbt/azure_postgres`, and the active positions/trades model family is `models/positions_and_trades/2026_07_22_ref_tables`.

The current dbt test suite has four data tests:
- Clear Street product matching, hard error: `tests/positions_and_trades/2026_07_22_ref_tables/clear_street_eod_transactions/clear_street_all_history_product_matching_must_be_ok.sql`
- Clear Street vendor-code warning: `tests/positions_and_trades/2026_07_22_ref_tables/clear_street_eod_transactions/clear_street_all_history_vendor_codes_should_exist_by_exchange_route.sql`
- NAV product matching, hard error: `tests/positions_and_trades/2026_07_22_ref_tables/nav_positions/nav_all_history_product_matching_must_be_ok.sql`
- NAV vendor-code warning: `tests/positions_and_trades/2026_07_22_ref_tables/nav_positions/nav_excel_all_history_vendor_codes_should_exist_by_exchange_route.sql`

As of the last run, the hard product-matching tests passed for NAV and Clear Street, NAV vendor-code warnings passed with zero rows, and Clear Street vendor-code warnings returned 115 rows. Those 115 rows are all `G4` / `gas_option` / `NYME` / `nymex` rows where `rule_status = 'ok'` but both `cme_product_code` and `bbg_product_code` are null. This is a non-blocking vendor-code coverage warning, not a product-match failure.

The frontend Positions Home tab currently lives in `frontend/components/positions/PositionsHome.tsx`, with data served by `frontend/app/api/positions-home/route.ts` and types in `frontend/lib/positionsAndTrades/positionsHomeTypes.ts`. The current panel named `Reference Repair` already shows reference table row counts and integrity checks. Extend that panel so operators can see the same dbt validation signals without reading dbt logs, backend logs, or repo SQL files.

Generated SQL artifacts are promoted by `dbt/azure_postgres/scripts/promote_positions_trades_sql.py` into `frontend/sql/...` and listed in `frontend/sql/positions-and-trades/manifest.json`. Do not hand-edit generated SQL artifacts; add or change dbt models, run `dbt compile`, then run the promotion script.
</context>

<source_files>
Read these first:
- `dbt/azure_postgres/AGENTS.md`
- `dbt/azure_postgres/README.md`
- `dbt/azure_postgres/dbt_project.yml`
- `dbt/azure_postgres/scripts/promote_positions_trades_sql.py`
- `dbt/azure_postgres/models/positions_and_trades/2026_07_22_ref_tables/README.md`
- `dbt/azure_postgres/models/positions_and_trades/2026_07_22_ref_tables/clear_street_eod_transactions/marts/cs_ref_65_eod_all_history.sql`
- `dbt/azure_postgres/models/positions_and_trades/2026_07_22_ref_tables/nav_positions/excel/nav_ref_excel_20_positions_grouped.sql`
- The four dbt test SQL files listed in `<context>`
- `frontend/app/api/positions-home/route.ts`
- `frontend/components/positions/PositionsHome.tsx`
- `frontend/lib/positionsAndTrades/positionsHomeTypes.ts`
- `frontend/lib/server/positionsAndTradesManifest.ts`
- `frontend/lib/server/navPositionsSql.ts`
- `frontend/sql/positions-and-trades/manifest.json`
</source_files>

<task>
Add a dbt-owned, promoted validation summary for the positions/trades reference-table model, then display it on the frontend Positions Home tab. The frontend should clearly show which checks are hard failures versus non-blocking warnings, with counts and concise details. The SQL predicates must mirror the existing dbt tests so dbt and frontend cannot drift conceptually.
</task>

<deliverables>
1. Add a dbt model named `pat_ref_95_validation_summary.sql` under the active `2026_07_22_ref_tables` model family, preferably in `nav_positions/marts/` next to `pat_ref_90_rule_exceptions.sql`.
2. The model must return one row per validation check with at least: `check_id`, `check_label`, `source_system`, `severity`, `status`, `failing_count`, `detail`, `sample_product_code`, `sample_product_grouping`, `sample_route_family`, `first_observed_date`, `last_observed_date`, and `sort_order`.
3. Add the validation summary to `scripts/promote_positions_trades_sql.py` as a frontend manifest artifact, promoted to `frontend/sql/positions-and-trades/checks/validation_summary.sql`.
4. Extend `frontend/lib/positionsAndTrades/positionsHomeTypes.ts` with a validation-check type and include those rows in the Positions Home payload, likely as `reference.validationChecks`.
5. Extend `frontend/app/api/positions-home/route.ts` to load the promoted validation summary SQL from the manifest and query it through the normal `query()` helper. Do not run dbt from the frontend route.
6. Update `frontend/components/positions/PositionsHome.tsx` so the current `Reference Repair` panel shows three clear groups: reference tables, reference integrity, and model validation.
7. Keep warning rows visible as `Watch` or `Warn`, not `Repair`. Hard error checks with failing rows should be shown as `Needs Repair`.
</deliverables>

<implementation_rules>
Use dbt as the source of truth for validation SQL. Why: the frontend must present the same predicates as the dbt test suite, not a TypeScript reimplementation that can drift.

Mirror the four existing dbt tests exactly when calculating failing counts. Why: operators should be able to reconcile frontend counts with `dbt test --profiles-dir .`.

Use `severity = 'error'` for product-matching rows and `severity = 'warn'` for vendor-code rows in the summary model. Why: product matching blocks correctness; vendor-code gaps are operational warnings unless separately escalated.

Use a terminal `FINAL` CTE followed by `select * from FINAL` in the new dbt model. Why: this repo requires inspectable positions/trades dbt models with explicit terminal output.

Promote compiled SQL through `scripts/promote_positions_trades_sql.py`; do not edit promoted frontend SQL directly. Why: generated artifacts must remain reproducible from dbt.

If adding a generic promoted-SQL loader, keep it in `frontend/lib/server` and reuse the manifest path logic from `navPositionsSql.ts` or extract shared logic carefully. Why: the app already has a manifest-driven generated SQL contract.

Use the existing `PositionsHomeStatus` vocabulary: `stable`, `watch`, `needs_repair`, and `error`. Why: the UI already maps these statuses to badge styling and overall status ranking.

Do not let a warning-only validation result display as `Repair`. Why: the Clear Street `G4` gap is intentionally non-blocking and should not imply the reference tables are broken.

Do not change product mappings or vendor-code generation in this task. Why: this task is about visibility on the Positions Home tab, not resolving the `G4` vendor-code gap.

Do not add new database tables, migrations, credentials, or dependencies. Why: this is a read-only dbt/frontend reporting change using existing Postgres access.
</implementation_rules>

<open_questions>
Panel naming: default to renaming `Reference Repair` to `Reference & Model Validation` if the existing label feels too narrow.

Overall status behavior: default to `watch` when there are warning-only validation rows and no hard failures; default to `needs_repair` when an error-severity validation row has failures.

Warning detail text: default the Clear Street vendor-code warning detail to include the top product/route group, for example `G4 gas_option on NYME/nymex is missing CME or Bloomberg vendor codes`.

Sample fields: default to one representative product/route grouping per check using the largest failing group, while keeping the full count at check level.
</open_questions>

<success_criteria>
The frontend Positions Home tab shows four model-validation rows: Clear Street product matching, Clear Street vendor codes by exchange route, NAV product matching, and NAV vendor codes by exchange route.

With the current production data, the expected displayed validation result is:
- Clear Street product matching: Pass, 0
- Clear Street vendor codes by exchange route: Watch/Warn, 115, `G4`
- NAV product matching: Pass, 0
- NAV vendor codes by exchange route: Pass, 0

Run from `dbt/azure_postgres`:
```powershell
dbt parse --profiles-dir .
dbt compile --profiles-dir . --select path:models/positions_and_trades/2026_07_22_ref_tables
python scripts\promote_positions_trades_sql.py
dbt test --profiles-dir .
```

Run from the repo root:
```powershell
python .agents\skills\helioscta-dbt-final-cte\scripts\check_final_cte.py dbt\azure_postgres\models\positions_and_trades\2026_07_22_ref_tables
```

Run from `frontend`:
```powershell
npm run lint
```

Grep checks:
```powershell
rg -n "positions_trades_validation_summary|validation_summary" dbt\azure_postgres\scripts\promote_positions_trades_sql.py frontend dbt\azure_postgres\models\positions_and_trades\2026_07_22_ref_tables
rg -n "Clear Street Vendor|NAV Vendor|Product Matching|Model Validation" frontend\components\positions\PositionsHome.tsx frontend\app\api\positions-home\route.ts
```

If a local frontend server is needed for visual QA, start it from `frontend` with `npm run dev` on an available port and inspect the Positions Home tab. Do not start a second dev server on port 3000 if one is already running from the same checkout.
</success_criteria>

<process>
1. Read the source files listed above and confirm the current four dbt predicates before editing.
2. Add the dbt validation summary model with one row per check and aggregate detail fields.
3. Add the new SQL artifact to `promote_positions_trades_sql.py`, including markers that prove the compiled artifact contains the validation contract.
4. Compile dbt and promote generated SQL.
5. Add frontend payload types and route loading/query logic for the promoted validation summary.
6. Update the Positions Home UI so the validation rows are visible, compact, and clearly separated from table-count checks.
7. Run dbt parse, compile, promotion, dbt tests, FINAL CTE check, and frontend lint.
8. Report files changed, test results, expected current warning count, and any residual risk.
</process>
