<role>
You are Codex working in the HeliosCTA production workspace. This is a frontend implementation task with a small API-shape component: standardize the local DEV Clear Street trades page so it behaves and reads like the production ICE Trade Blotter raw-trades experience.
</role>

<context>
The repo root is `C:\Users\AidanKeaveny\Documents\github\helioscta-platform`. Treat changes as production-bound even though the Clear Street page is local-only. The current Clear Street page at `/?section=clear-street-trades` is wired through `frontend/app/HomePageClient.tsx`, appears only when `showLocalDevFeatures` is true, and is listed in the DEV sidebar as `Trades`. The production ICE raw blotter at `/?section=ice-trade-blotter` is the visual and interaction reference: it uses a compact filter control card, freshness/status badges, a product-by-contract ladder with sticky sortable/filterable headers, and a bounded raw-row modal opened from either a cell or the full table. Clear Street currently uses `frontend/components/clear-street/ClearStreetTrades.tsx` with review tabs and a generic raw row table from `GET /api/dev/clear-street-trades`; it does not yet expose the ICE-style date/filter/aggregate/drilldown model.

The Clear Street source contract is local DEV only. The API reads promoted dbt SQL from `frontend/sql/clear-street-trades/marts/eod_all_history.sql`, generated from `dbt/azure_postgres/models/positions_and_trades_v2/clear_street_eod_transactions/marts/cs_65_eod_all_history.sql`. Do not edit the promoted SQL directly. If source fields or rules are missing, change dbt first, compile, and promote; otherwise keep this task in `frontend/` only. Existing README guidance says the route is local-only, accepts bounded `limit=25..2000` plus optional `search`, highlights the latest SFTP file, keeps product matching in dbt, and does not mutate data or create cache tables.
</context>

<source_files>
Read these first:
1. `AGENTS.md`
2. `README.md`
3. `.agents/context/one-shot-implementation-workflow.md`
4. `.agents/context/assumptions-audit.md`
5. `.agents/context/frontend-parallel-worktree-workflow.md`
6. `frontend/README.md`
7. `frontend/components/clear-street/ClearStreetTrades.tsx`
8. `frontend/app/api/dev/clear-street-trades/route.ts`
9. `frontend/sql/clear-street-trades/README.md`
10. `frontend/sql/clear-street-trades/marts/eod_all_history.sql`
11. `frontend/components/positions/RawIceTradeBlotter.tsx`
12. `frontend/lib/positionsAndTrades/iceTradeBlotterTypes.ts`
13. `frontend/lib/server/rawIceTradeBlotterSql.ts`
14. `frontend/app/api/ice-trade-blotter/raw/route.ts`
15. `frontend/app/api/ice-trade-blotter/raw/drilldown/route.ts`
16. `frontend/components/dashboard/DataTableShell.tsx`
17. `frontend/components/dashboard/ColumnFilterMenu.tsx`
18. `frontend/components/dashboard/DashboardTabs.tsx`
19. `frontend/components/ui/MultiSelect.tsx`
20. `frontend/app/HomePageClient.tsx`
21. `frontend/components/Sidebar.tsx`
</source_files>

<task>
Goal: make the Clear Street trades UI consistent with the ICE raw trade blotter. The Clear Street page should default to an ICE-style trade summary experience: one control card, SFTP snapshot/date selection where supported, compact filters, freshness/status badges, a product/contract ladder of signed quantities, and a bounded raw-row drilldown modal. Preserve the Clear Street product-mapping review value by keeping needs-review/vendor-warning/matched status visible in the new workflow instead of leaving the page as a separate tab-first review UI.
</task>

<deliverables>
1. Update `frontend/app/api/dev/clear-street-trades/route.ts` and, if needed, add `frontend/app/api/dev/clear-street-trades/drilldown/route.ts` plus local types/helpers so Clear Street has an ICE-like payload: `selectedDate`, `latestDate`, `availableDates`, `filters`, `summary`, `productSummary`, `metadata`, and bounded raw rows for drilldown.
2. Update `frontend/components/clear-street/ClearStreetTrades.tsx` so its first screen matches `RawIceTradeBlotter.tsx`: centered control card, stable dark table shell, sortable/filterable sticky headers via `ColumnFilterMenu`, signed quantity cell buttons, and a modal raw-row table with compact/all column modes.
3. Keep Clear Street review diagnostics available in the standardized page. Default: expose status counts and row/cell status tone in the ladder, and keep a secondary `DataTableShell` for latest/review/history signatures only if it remains useful after the ladder is added.
4. Update `frontend/README.md` only if route parameters, response shape, or operator workflow changes.
5. Return a concise final summary with behavior changed, files touched, verification results, and residual risk.
</deliverables>

<implementation_rules>
1. Keep Clear Street local-only through `isLocalOnlyFeatureEnabled()`. Why: README promises Vercel hides the page and route.
2. Keep product matching and vendor-code logic in dbt/promoted SQL, not TypeScript. Why: `frontend/README.md` says dbt owns cleanup, account lookup, product matching, `rule_status`, and vendor export code logic.
3. Do not edit `frontend/sql/clear-street-trades/marts/eod_all_history.sql` directly. Why: `frontend/sql/clear-street-trades/README.md` says to change the dbt model, compile, and promote.
4. Use the ICE raw blotter as the UI contract, especially `ControlCard`, `BlotterLadderTable`, `RawRowsModal`, `ColumnFilterMenu`, signed lots/quantity behavior, sticky headers, bounded drilldown, and dense dark styling. Why: consistency should be behavioral and visual, not just color matching.
5. Prefer extracting small shared trade-blotter primitives only if Clear Street and ICE both use them cleanly. Put shared UI under `frontend/components/positions/` or `frontend/components/dashboard/` using the existing naming style. Why: broad refactors of the 2,121-line ICE component are higher risk than targeted reuse.
6. Build Clear Street signed quantity from `quantity_cleaned` when present, otherwise use Clear Street side codes where `buy_sell = 1` is buy and `buy_sell = 2` is sell. Why: the existing Clear Street route already uses this fallback.
7. Group the Clear Street ladder by stable display identity. Recommended default: product row identity from `product_code`, `product_family`, `market_name`, and source product text; contract column identity from `contract_yyyymm`, `contract_day`, `prompt_day`, `put_call_code`, and normalized strike fields. Why: Clear Street does not have the exact ICE `begin_date`/`end_date` contract model.
8. Bound all server-side params and drilldown limits, and use parameterized SQL. Why: the ICE raw routes are bounded and safe for production-style local use.
9. Do not add dependencies, migrations, cache tables, background jobs, or new credentials. Why: this is a frontend/API standardization task.
10. Follow the frontend parallel workflow before starting or restarting a dev server. Why: multiple `next dev` servers from the same `frontend/` directory can race on `.next`.
</implementation_rules>

<open_questions>
1. Clear Street has SFTP file dates rather than ICE trade snapshots. Default: label the selector `SFTP Snapshot`, send it as `date=YYYY-MM-DD`, and map it to `sftp_date`.
2. Clear Street review statuses do not exist in the ICE raw blotter. Default: keep them as status badges/counts and optional row/cell tones while preserving the ICE table interaction model.
3. If the desired ladder grain is ambiguous, default to the stable dbt-derived product/contract fields listed above and document the chosen grain in `frontend/README.md` if it changes the API contract.
</open_questions>

<success_criteria>
1. `cd frontend; npm run lint` passes.
2. With the local app running or reused according to `.agents/context/frontend-parallel-worktree-workflow.md`, `GET /api/dev/clear-street-trades?limit=25` returns the enriched summary payload, and any new drilldown route returns bounded rows for either no drilldown or a clicked ladder cell.
3. Browser smoke `/?section=clear-street-trades` at desktop and mobile widths: page loads, filters fit, the ladder is nonblank when data exists, headers remain stable while scrolling, cell click opens raw rows, compact/all column modes work, empty/error/loading states do not overlap, and the `FreshnessCard` still updates.
4. `/?section=ice-trade-blotter` still renders and behaves as before.
5. `rg -n "isLocalOnlyFeatureEnabled|clear-street-trades/drilldown|ClearStreetTrades" frontend/app/api/dev frontend/components/clear-street` shows local-only gating and the expected Clear Street wiring.
6. `git diff -- frontend` shows only intentional frontend/API/doc changes, with no unrelated dbt or backend churn unless the task explicitly required a dbt model update.
</success_criteria>

<process>
1. Read the source files above and inspect `git status` so user-owned dirty changes are not overwritten.
2. State the ICE pattern to follow and run an assumptions audit before coding. Ask at most one question only if the ladder grain cannot be chosen from repo evidence.
3. Implement the Clear Street API payload/drilldown changes first, keeping local-only access and bounded params.
4. Implement the Clear Street UI to match the ICE raw blotter interaction model while preserving review status visibility.
5. Run lint and route/browser smoke checks. If credentials, auth, or local services block a check, record the exact skipped check and reason.
6. Review the diff for unrelated changes and finish with files touched, verification, and residual risk.
</process>
