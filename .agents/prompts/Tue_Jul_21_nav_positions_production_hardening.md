<role>
You are Codex working in the HeliosCTA production workspace. This is a production-hardening investigation and implementation task for the NAV Positions frontend, its promoted dbt SQL contract, and the Azure Postgres indexes that support it.
</role>

<context>
The NAV Positions page now exposes production routes at `/api/nav-positions` and `/api/nav-positions/drilldown`. The route loads promoted compiled dbt SQL from `frontend/sql/nav-positions/frontend/latest.sql` and `frontend/sql/nav-positions/frontend/all_history.sql` through `frontend/lib/server/navPositionsSql.ts`.

Current architecture: dbt remains the source of truth for product normalization and product matching rules. The frontend API wraps the promoted dbt SQL with `selected_positions` CTEs, then builds summary and drilldown JSON for the React ladder table. The frontend applies default table filters for Power and PJM client-side, which means the first API request still computes a broad product summary before the UI narrows it.

Recent production-readiness review found:
- The route declares `p95TargetMs: 2000`, but local route smokes for `/api/nav-positions?fund=all` returned roughly 3.3s to 6.0s wall time.
- A route-shaped read-only `EXPLAIN ANALYZE` for the latest summary query executed around 1.5s in the database, scanned about 360k `nav.positions` rows, and used temp blocks.
- Live DB indexes observed on July 21, 2026 were `positions_pkey`, `idx_nav_positions_fund_nav_date`, `idx_nav_positions_account_trade_date`, and `idx_nav_positions_updated_at`.
- Repo reference index SQL also recommends `idx_nav_positions_latest_file`, `idx_nav_positions_product_lookup`, and `idx_nav_positions_account_lookup`, but those exact index definitions were not present in the live DB during review.
- `frontend/README.md` still describes NAV Positions as local-only and `/api/dev/nav-positions`, which contradicts the current production route surface.

The goal is not to bypass dbt. The goal is to determine whether frontend-oriented filters and query shape belong in the dbt frontend models, in the API wrapper around promoted SQL, or in both, while preserving the v2 product matching logic and proving that row-level identity and aggregates still match.
</context>

<source_files>
Read these first:
- `AGENTS.md`
- `README.md`
- `.agents/context/one-shot-implementation-workflow.md`
- `.agents/context/assumptions-audit.md`
- `.agents/context/frontend-parallel-worktree-workflow.md`
- `frontend/README.md`
- `frontend/app/api/dev/nav-positions/route.ts`
- `frontend/app/api/nav-positions/route.ts`
- `frontend/app/api/nav-positions/drilldown/route.ts`
- `frontend/lib/server/navPositionsSql.ts`
- `frontend/lib/server/apiObservability.ts`
- `frontend/lib/positionsAndTrades/navPositionsTypes.ts`
- `frontend/components/nav/NavPositions.tsx`
- `frontend/vercel.json`
- `dbt/azure_postgres/AGENTS.md`, if present
- `dbt/azure_postgres/models/positions_and_trades_v2/nav_positions/frontend/nav_frontend_positions_latest.sql`
- `dbt/azure_postgres/models/positions_and_trades_v2/nav_positions/frontend/nav_frontend_positions_all_history.sql`
- `dbt/azure_postgres/models/positions_and_trades_v2/nav_positions/marts/nav_50_positions_latest.sql`
- `dbt/azure_postgres/models/positions_and_trades_v2/nav_positions/marts/nav_40_positions_all_history.sql`
- `dbt/azure_postgres/tests/positions_and_trades_v2/nav_positions/nav_frontend_latest_matches_v2.sql`
- `dbt/azure_postgres/tests/positions_and_trades_v2/nav_positions/nav_frontend_all_history_matches_v2.sql`
- `dbt/azure_postgres/scripts/promote_positions_trades_sql.py`
- `dbt/azure_postgres/reference_sql/ddl/nav/positions/table_nav_positions.sql`
- `dbt/azure_postgres/reference_sql/ddl/nav/positions/index_nav_positions.sql`
</source_files>

<task>
Explore and implement the next NAV Positions production-hardening pass: push the default and user-selected table filters down to SQL/API where it reduces origin work, confirm the live database index state against the operator index contract, rerun `EXPLAIN ANALYZE` before and after, and update the frontend operator documentation so the production route, promoted SQL files, cache behavior, and validation workflow are accurate.
</task>

<deliverables>
1. A short assumptions audit before edits that states where the filter boundary should live: dbt frontend model, API wrapper, or React-only.
2. A measured before/after performance note for `/api/nav-positions` and at least one `/api/nav-positions/drilldown` request.
3. Any required dbt frontend model changes that preserve v2 product matching logic and follow the repo's final CTE style.
4. Any required API changes so default Power/PJM and selected filters can reduce SQL work instead of only reducing rendered rows.
5. Any required React changes to pass supported filter params without breaking the current card controls, ladder table, drilldown modal, or client cache key behavior.
6. An index verification note that lists live `nav.positions` indexes and compares them to `dbt/azure_postgres/reference_sql/ddl/nav/positions/index_nav_positions.sql`.
7. Operator SQL or documentation for missing indexes if they are needed. Do not apply DDL unless the user explicitly asks.
8. Updated `frontend/README.md` section documenting the production NAV Positions contract, routes, promoted SQL source, caching, params, and validation commands.
</deliverables>

<implementation_rules>
Keep dbt as the product matching source of truth. Why: React and API code should consume normalized product identity, not duplicate rule matching logic.

Use the existing `nav_positions/frontend/` dbt folder for frontend-specific SQL shape. Why: this keeps UI-serving contracts beside marts while preserving the v2 marts as the canonical matching logic.

If editing dbt SQL, use an explicit terminal `FINAL` CTE and end with `SELECT * FROM FINAL`. Why: this repo relies on inspectable dbt model structure for positions and trades work.

Preserve the current response contract unless a change is required for filter pushdown. Why: `NavPositions.tsx`, freshness cards, and drilldown types already depend on the current payload shape.

Prefer API query params for filters that affect row volume or product summary volume: product group, product region, product code, option/future, put/call, account/fund, NAV snapshot date, and product search. Why: filters that materially reduce rows should reduce database and serialization work.

Do not move product matching rules into TypeScript. Why: product matching must remain centrally testable in dbt and promoted SQL.

Do not create persistent frontend cache tables or database objects from application code. Why: database DDL and migrations are operator-managed in this repo.

Do not apply `CREATE INDEX CONCURRENTLY` from the app or from an automated script unless the user explicitly approves. Why: index creation is an operator action and must run with autocommit and a write-capable role.

Keep the Vercel CDN cache strategy unless measurements show it is wrong. Why: `Vercel-CDN-Cache-Control` is the intended Vercel-specific cache control surface, while browser responses can stay private/no-store.

Keep raw drilldown rows bounded. Why: drilldown is for cell investigation, not an unbounded export endpoint.

Do not broaden unrelated frontend, backend, dbt, Slack, ICE, gas, or infrastructure changes. Why: the current worktree is dirty and production review needs scoped diffs.
</implementation_rules>

<open_questions>
Should the default Power/PJM filter be a true server default or only passed from the current page? Default: pass explicit `productGroup=Power&productRegion=PJM` from the page so API behavior is visible and overrideable.

Should the API support multi-select filter params as repeated params or comma-separated params? Default: use repeated params if adding new array params, but preserve current single-value params where already shipped.

Should missing live indexes be applied in this pass? Default: do not apply DDL; document the missing indexes and provide operator SQL unless the user explicitly asks to run it.

Should dbt frontend models pre-compute a narrower frontend contract or should the API wrapper filter after loading the promoted model? Default: keep product identity and expensive derivations in dbt; push request-specific filters into the API wrapper unless a dbt model change demonstrably reduces repeated computation without changing v2 logic.
</open_questions>

<success_criteria>
Run and report:
- `git diff -- frontend dbt/azure_postgres`
- `npm run lint` from `frontend/`
- `npx tsc --noEmit --incremental false` from `frontend/`
- `cd dbt/azure_postgres; dbt compile --profiles-dir . --select path:models/positions_and_trades_v2/nav_positions`
- `cd dbt/azure_postgres; dbt test --profiles-dir . --select tag:frontend_contract`
- `cd dbt/azure_postgres; python scripts/promote_positions_trades_sql.py`

Run read-only database checks and report summarized output without secrets:
- Query `pg_indexes` for `schemaname = 'nav' and tablename = 'positions'`.
- `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for the route-shaped latest summary query before and after changes.
- `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for at least one drilldown query before and after changes.

Run API/browser checks:
- Smoke `/api/nav-positions` with the default page filters and confirm status 200, payload size, cache headers, and `Server-Timing`.
- Smoke `/api/nav-positions/drilldown` with a populated cell drilldown and confirm bounded rows, cache headers, and `Server-Timing`.
- Open `/?section=nav-positions` on port 3000 at desktop and mobile widths and confirm filters, sticky headers/columns, ladder cells, and drilldown modal still work.

Acceptance thresholds:
- The default route should avoid broad product summary work when the visible UI defaults to Power/PJM.
- The route should move closer to the declared 2s p95 target on local origin timing or have a documented reason why remaining latency requires DB/operator index work.
- dbt frontend contract tests should continue proving that frontend SQL does not alter v2 matching logic unexpectedly.
- `frontend/README.md` should no longer describe production-visible NAV Positions as local-only.
</success_criteria>

<process>
1. Read the source files and current diffs first. Identify user-owned dirty changes and avoid touching unrelated files.
2. Run an assumptions audit focused on dbt/API/frontend filter boundaries, index operations, and production visibility.
3. Capture baseline route timings, payload sizes, cache headers, live index list, and read-only `EXPLAIN ANALYZE` summaries.
4. Decide the minimal implementation: API-only filter pushdown, dbt frontend model adjustment, or both.
5. Implement scoped changes with `apply_patch`; use existing helpers and payload types.
6. If dbt SQL changes, compile/test dbt and promote the compiled SQL with `dbt/azure_postgres/scripts/promote_positions_trades_sql.py`.
7. Run frontend lint/type checks, API smokes, and browser checks at desktop and mobile widths.
8. Update `frontend/README.md` with the actual production route and validation contract.
9. Review `git diff` and finish with changed behavior, files touched, verification results, and residual risk.
</process>
