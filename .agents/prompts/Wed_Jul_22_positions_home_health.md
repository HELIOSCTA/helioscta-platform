<role>
You are Codex implementing a production-bound frontend/data-health feature in the HeliosCTA platform repo. Build a Positions Home dashboard that gives operators a compact health view for NAV Positions, Clear Street Trades, ICE Trade Blotters, and the reference data that drives product/account matching.
</role>

<context>
This repo is production-bound; follow `AGENTS.md`, the promotion rule in `README.md`, and the frontend workflow in `.agents/context/frontend-parallel-worktree-workflow.md`. The frontend is a Next.js app under `frontend/` with one main `HomePageClient` that switches views by `section` query param and `Sidebar.ActiveSection`. Existing positions pages already exist for NAV, Clear Street, and ICE, and they expose freshness summaries through component callbacks. NAV Positions are loaded from local NAV SFTP workbooks into `nav.positions`; expected funds are `agr`, `moross`, `pnt`, and `titan`, with remote files shaped like `Position Valuation Detail Report_<YYYYMMDD>_<legal entity>.xlsx`. Clear Street Trades are loaded from local Clear Street SFTP files into `clear_street.eod_transactions`; expected files are shaped like `Helios_Transactions_<YYYYMMDD>.csv`, with the scheduled poll window starting at 19:00 local and ending at 05:00 local. ICE Trade Blotters are a manual local-file workflow writing `ice_trade_blotter.ice_trade_blotter` plus `ice_trade_blotter.file_manifest`; do not invent a scheduler for them. The active NAV/Clear Street matching lookups are operator-managed tables in `positions_and_trades_ref`, backed by reference SQL under `dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/`; dbt/frontend read those tables and must not write them.
</context>

<source_files>
- `AGENTS.md`
- `README.md`
- `backend/README.md`
- `.agents/context/one-shot-implementation-workflow.md`
- `.agents/context/assumptions-audit.md`
- `.agents/context/frontend-parallel-worktree-workflow.md`
- `frontend/app/page.tsx`
- `frontend/app/HomePageClient.tsx`
- `frontend/components/Sidebar.tsx`
- `frontend/components/dashboard/FreshnessCard.tsx`
- `frontend/components/dashboard/DataTableShell.tsx`
- `frontend/components/nav/NavPositions.tsx`
- `frontend/components/clear-street/ClearStreetTrades.tsx`
- `frontend/components/positions/RawIceTradeBlotter.tsx`
- `frontend/app/api/nav-positions/route.ts`
- `frontend/app/api/dev/nav-positions/route.ts`
- `frontend/app/api/dev/clear-street-trades/route.ts`
- `frontend/app/api/ice-trade-blotter/raw/route.ts`
- `frontend/lib/server/apiObservability.ts`
- `frontend/lib/server/db.ts`
- `frontend/lib/server/devFeatures.ts`
- `frontend/lib/server/navPositionsSql.ts`
- `frontend/lib/server/clearStreetTradesSql.ts`
- `frontend/lib/server/rawIceTradeBlotterSql.ts`
- `frontend/lib/positionsAndTrades/navPositionsTypes.ts`
- `frontend/lib/positionsAndTrades/clearStreetTradesTypes.ts`
- `frontend/lib/positionsAndTrades/iceTradeBlotterTypes.ts`
- `frontend/lib/iceTradeBlotterProductDictionary.ts`
- `frontend/lib/iceTradeBlotterRules.ts`
- `backend/scrapes/nav/positions.py`
- `backend/orchestration/nav/positions.py`
- `backend/scrapes/clear_street/transactions.py`
- `backend/orchestration/clear_street/transactions.py`
- `backend/scrapes/ice_trade_blotters/settings.py`
- `dbt/azure_postgres/models/positions_and_trades_v3/README.md`
- `dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/README.md`
- `dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/table_positions_and_trades_reference_tables.sql`
- `dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/verify_positions_and_trades_reference_tables.sql`
</source_files>

<task>
Implement a new `positions-home` section that appears first in the POSITIONS group and shows expected source-file/snapshot health for NAV Positions, Clear Street Trades, and ICE Trade Blotters, plus a reference-data summary that says whether the current matching references need operator repair. This page should be a dashboard home for the existing detail pages, not a replacement for NAV Positions, Clear Street Trades, or ICE Trade Blotter views.
</task>

<deliverables>
1. A dedicated summary API, preferably `frontend/app/api/positions-home/route.ts`, wrapped with `observedJsonRoute`.
2. Shared TypeScript payload types under `frontend/lib/positionsAndTrades/` if the shape is reused by component and route.
3. A new `frontend/components/positions/PositionsHome.tsx` component using the existing dark dashboard style.
4. `Sidebar` and `HomePageClient` updates for `section=positions-home`, including route metadata and refresh behavior.
5. Focused operator-facing summaries: source status cards/table, reference repair cards/table, and links or buttons that switch to existing detail sections.
</deliverables>

<implementation_rules>
- Keep all DB work read-only and use `helios_readonly` frontend connection patterns. Why: frontend status pages must not mutate production source or reference tables.
- Do not edit promoted SQL files under `frontend/sql/**` or generated backend SQL. Why: those artifacts are promoted from dbt and must be changed through the dbt compile/promote path.
- Query Postgres directly in the summary API using `query` and existing server helpers; do not call the app's own API routes from the server route. Why: server-to-server self-fetches add auth/cache ambiguity and duplicate failure modes.
- Return a single payload with independent status objects for each feed and reference family; catch per-section query errors and mark that section `error` where practical. Why: one missing optional table should not blank the whole home page.
- Use explicit status values: `stable`, `watch`, `stale`, `missing`, and `error`. Why: the UI needs stable sorting, colors, and worst-status aggregation.
- NAV status must compare latest loaded `nav.positions` data against expected funds `agr`, `moross`, `pnt`, and `titan` for the previous business NAV date by default. Why: the scheduled NAV workflow only considers the day complete when every selected fund file has arrived.
- Clear Street status must compare latest `clear_street.eod_transactions.trade_date_from_sftp` against the target date implied by the 19:00-to-05:00 local polling window. Why: before the overnight deadline, a missing target file is a watch state; after the deadline it is stale or missing.
- ICE Trade Blotter status must be labeled as manual/local-file and based on latest `ice_trade_blotter.ice_trade_blotter.trade_date` plus `file_manifest.loaded_at`. Why: ICE blotters are not a promoted scheduled feed in this repo.
- Reference repair status must include `positions_and_trades_ref.product_catalog`, `product_alias_rules`, `account_lookup`, and `month_codes`, using the same defect checks as `verify_positions_and_trades_reference_tables.sql`. Why: repair signals should match the operator-applied reference contract.
- Include unresolved matching signals from existing NAV/Clear Street rule-status outputs where available, but do not apply repair SQL automatically. Why: resolving product matches is an operator-reviewed data change.
- If `frontend/lib/server/navPositionsSql.ts` still names v2 dbt paths while the promoted SQL/docs point to v3, inspect `dbt/azure_postgres/scripts/promote_positions_trades_sql.py` and correct only metadata labels if needed. Why: stale labels create operator confusion, but model logic should not be refactored for this page.
- Preserve the existing local-only gate for full Clear Street detail views unless the user explicitly asks to promote that full page. Why: the home page can summarize production health without broadening access to every drilldown.
- Do not add dependencies, DDL, migrations, schedulers, or new credentials. Why: this is a frontend/read-only status feature.
</implementation_rules>

<open_questions>
- Should this become the app-wide default landing page? Default: no; preserve the current default and add `Positions Home` as the first POSITIONS sidebar item.
- What freshness threshold should ICE manual blotters use? Default: `stable` when latest trade date is within two business days and has rows, `watch` when older, `missing` when no manifest/source rows exist.
- Should the API expose raw filenames? Default: show remote/local filename metadata already stored in source summaries or manifest tables when available, but do not include local absolute paths in the UI.
</open_questions>

<success_criteria>
- `cd frontend; npm run lint`
- Start or reuse the frontend dev server per `.agents/context/frontend-parallel-worktree-workflow.md`.
- Smoke `GET /api/positions-home` and confirm it returns JSON with `overallStatus`, `feeds`, and `references`.
- Open `/?section=positions-home` at desktop and mobile widths and verify loading, error, empty, stale/watch, and normal-data states do not overlap or resize awkwardly.
- Confirm existing sections still work: `?section=nav-positions`, `?section=ice-trade-blotter`, and, when local features are enabled, `?section=clear-street-trades`.
- Review `git diff` and confirm no generated SQL, DDL, scheduler, credential, or unrelated formatting files changed.
</success_criteria>

<process>
1. Read the source files above and state the existing frontend/API pattern you will follow.
2. Run an assumptions audit for source status thresholds, Clear Street access, reference repair definitions, and any v2/v3 metadata mismatch.
3. Design the payload shape before coding, including per-feed status, expected artifact, latest loaded snapshot, missing items, row counts, data-as-of, and reference defects.
4. Implement the summary API with small read-only SQL queries and typed mapping helpers.
5. Build the Positions Home component using existing cards/tables and compact operator-focused copy.
6. Wire `positions-home` into `Sidebar`, `HomePageClient`, metadata, refresh, and URL state.
7. Run lint, smoke the API, inspect the page in browser desktop/mobile, and finish with files touched, verification results, and residual risks.
</process>
