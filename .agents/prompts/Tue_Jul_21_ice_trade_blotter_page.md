<role>
You are Codex working in the HeliosCTA platform repo. Implement a production-visible frontend page called ICE Trade Blotter that mirrors the NAV Positions page patterns while reading only raw ICE Deal Report rows.
</role>

<context>
Repo root: C:\Users\AidanKeaveny\Documents\github\helioscta-platform.

Follow AGENTS.md and the frontend workflow docs before editing. This repo is production-bound. Preserve unrelated dirty worktree changes, inspect `git status --short` first, and do not reset/revert user-owned changes.

Existing NAV Positions is the template: it is production-visible at `/?section=nav-positions`, appears in the POSITIONS sidebar group, uses a top freshness card, has bounded API routes, uses `observedJsonRoute`, reads with `helios_readonly`, renders a dense dark dashboard table, supports selected/latest dates, filters, refresh, summary metadata, a ladder-style aggregate view, and a bounded drilldown modal/table.

ICE trade blotter source contract:
- Source system: manually downloaded ICE Deal Report `.xls`/CSV exports.
- Source table: `ice_trade_blotter.ice_trade_blotter`.
- File lineage table: `ice_trade_blotter.file_manifest`.
- Grain: one raw ICE deal-leg row from one managed source file.
- Uniqueness key: `deal_id x trade_date x user_id x leg_id x b_s x hub x contract x begin_date x end_date x lots x total_quantity x price x option x strike x strike_2`, enforced by operator SQL with UNIQUE NULLS NOT DISTINCT.
- Freshness fields: `ice_trade_blotter.ice_trade_blotter.updated_at`, `report_date`, `trade_date`, and optionally `ice_trade_blotter.file_manifest.loaded_at`.
- Important user constraint: keep this raw-only for visual inspection. Do not standardize products, do not add dbt models, do not write frontend cache tables, and do not mutate source data.

There is already an older ICE/settlement workstation under `frontend/components/positions/IceTradeBlotter.tsx` and existing API routes under `frontend/app/api/ice-trade-blotter/*` used by the Power ICE Settles page. Do not break that page. If route names conflict, add new raw routes under `frontend/app/api/ice-trade-blotter/raw/route.ts` and `frontend/app/api/ice-trade-blotter/raw/drilldown/route.ts` and use those from the new page.
</context>

<source_files>
Read these first:
- `AGENTS.md`
- `.agents/context/one-shot-implementation-workflow.md`
- `.agents/context/assumptions-audit.md`
- `.agents/context/frontend-parallel-worktree-workflow.md`
- `frontend/README.md`
- `frontend/package.json`
- `frontend/app/page.tsx`
- `frontend/app/HomePageClient.tsx`
- `frontend/components/Sidebar.tsx`
- `frontend/components/nav/NavPositions.tsx`
- `frontend/lib/positionsAndTrades/navPositionsTypes.ts`
- `frontend/app/api/dev/nav-positions/route.ts`
- `frontend/app/api/nav-positions/route.ts`
- `frontend/app/api/nav-positions/drilldown/route.ts`
- `frontend/lib/server/apiObservability.ts`
- `frontend/lib/server/db.ts`
- `frontend/vercel.json`
- `dbt/azure_postgres/reference_sql/ddl/ice_trade_blotter/ice_trade_blotter/table_ice_trade_blotter.sql`
- `dbt/azure_postgres/reference_sql/ddl/ice_trade_blotter/file_manifest/table_ice_trade_blotter_file_manifest.sql`
- `backend/scrapes/ice_trade_blotters/sql/inspection/raw_trade_blotter_rows.sql`
- `backend/scrapes/ice_trade_blotters/sql/inspection/latest_ice_trade_blotter_summary.sql`
- Existing ICE routes/components only to avoid regressions: `frontend/app/api/ice-trade-blotter/route.ts`, `frontend/app/api/ice-trade-blotter/positions/route.ts`, `frontend/components/positions/IceTradeBlotter.tsx`.
</source_files>

<template_file>
Use the current checked-out contents of `frontend/components/nav/NavPositions.tsx` and `frontend/app/api/dev/nav-positions/route.ts` as the implementation templates. Mirror their structure, interaction model, cache policy, observability wrapper, date handling, refresh behavior, loading/empty/error states, table density, and drilldown pattern. Read the live files instead of relying on this prompt's summaries, because the worktree already has user-owned uncommitted changes.
</template_file>

<task>
Add an ICE Trade Blotter page that feels standardized with NAV Positions: same app shell integration, same freshness-card pattern, same dense dark data table language, same latest/date selection behavior, same bounded API/drilldown split, and comparable filtering. The page should let the user visually inspect raw ICE trade blotter rows by selected trade date and compare the row-level details later against NAV Positions and Clear Street Trades, without adding a standardization layer.
</task>

<deliverables>
1. Add a production-visible sidebar section item with section id `ice-trade-blotter` and label `ICE Trade Blotter`, placed under the existing POSITIONS group alongside NAV Positions.
2. Add a React client component for the new page, preferably named to avoid conflicting with the existing Power ICE Settles component, for example `frontend/components/positions/RawIceTradeBlotter.tsx`.
3. Add TypeScript payload types for the raw ICE page, for example `frontend/lib/positionsAndTrades/iceTradeBlotterTypes.ts`.
4. Add read-only API routes for the raw page. Use `/api/ice-trade-blotter/raw` for summary data and `/api/ice-trade-blotter/raw/drilldown` for bounded rows unless repo inspection shows a cleaner non-breaking route.
5. Wire `HomePageClient` to parse `?section=ice-trade-blotter`, show title `ICE Trade Blotter`, show a FreshnessCard, pass refresh tokens, and render the new component.
6. Update `frontend/vercel.json` for any new production API function duration/region entries, matching NAV Positions where appropriate.
7. Update `frontend/README.md` with an ICE Trade Blotter source contract, route contract, filters, cache behavior, and explicit raw-only/no-dbt note.
</deliverables>

<implementation_rules>
- Use only `ice_trade_blotter.ice_trade_blotter` and `ice_trade_blotter.file_manifest` for the raw page. Why: the user wants a visual raw data source, not standardized positions/trades.
- Do not add dbt models, generated dbt SQL, product catalogs, product-alias matching, or persisted normalization columns. Why: the current goal explicitly removed DBT and standardization.
- Do not repurpose or break the existing Power ICE Settles page or its current API behavior. Why: `frontend/components/positions/IceTradeBlotter.tsx` and existing `/api/ice-trade-blotter/*` routes already serve a different settlement workflow.
- Follow the NAV Positions production API pattern: `runtime = "nodejs"`, bounded params, `observedJsonRoute`, `query` from `frontend/lib/server/db.ts`, private browser no-store headers, Vercel CDN cache headers where safe, `refresh=1`, row counts, data-as-of metadata, and typed mapping helpers. Why: the page should be standardized with NAV Positions and observable in production.
- Keep API inputs bounded. Why: the raw ICE trade table has all history and the frontend must not accidentally request unbounded row-level history.
- Default to the latest `trade_date` if no `date` is provided. Why: this matches NAV Positions latest-snapshot behavior and supports daily inspection.
- Support date selection with up to the latest 90 trade dates. Why: this matches NAV Positions date picker scale and keeps metadata payloads small.
- Support practical raw filters: `date`, `side`/`b_s`, `trader`, `clearingAcct`, `custAcct`, `clearingFirm`, `product`, `hub`, `contract`, `option`, `dealSection`, `source`, `userId`, `search`, `limit`, and `refresh`. Why: these are raw source fields users need for visual inspection and follow-up reconciliation.
- Build a NAV-style aggregate ladder using raw display identity, not normalized product identity. Suggested grouping fields: `product`, `hub`, `contract`, `begin_date`, `end_date`, `option`, `strike`, `strike_2`, `cc`, `strip`, and `deal_section`. Why: this gives the same inspection affordance as NAV Positions without inventing standardization.
- For signed quantity, treat sell-side rows as negative only for display aggregates when `b_s` clearly starts with `S`; otherwise use the raw `total_quantity`. Also expose gross quantity and row count. Why: this supports visual netting while preserving raw row details.
- The drilldown route must return bounded raw rows for a clicked aggregate cell or active filters, including core source columns: trade/report dates, time, deal/leg/orig/link ids, B/S, product, hub, contract, begin/end, clearing/cust account, clearing firm, price, price units, option, strikes, style, lots, total quantity, quantity units, trader, counterparty, memo, source, user id, deal section, file hash, source row number, and updated_at. Why: the user wants to inspect the source rows.
- Keep UI styling consistent with NAV Positions: dark surfaces, restrained controls, stable table dimensions, sticky row/column headers where NAV uses them, horizontal overflow, no card nesting beyond established page panels/modals, and no explanatory marketing copy. Why: this should look like part of the same positions workflow.
- Use existing shared components such as `FreshnessCard`, `DataTableShell`, `ColumnFilterMenu`, `MultiSelect`, and `fetchJsonWithCache` where they fit. Why: this preserves app-level behavior and avoids duplicate UI primitives.
- Do not add dependencies, new credentials, backend ingestion changes, schema changes, or scheduled jobs. Why: the data is already loaded and this task is frontend/read-only.
- Before any long-running frontend dev server work, follow `.agents/context/frontend-parallel-worktree-workflow.md`. Why: Next.js dev servers share `.next` state and this repo may have parallel frontend work.
</implementation_rules>

<open_questions>
- Should the page be production-visible? Recommended default: yes, because NAV Positions is production-visible and the raw ICE source table is now promoted. Needs user input: no unless the user explicitly says local-only.
- Should the page use the exact `/api/ice-trade-blotter` route? Recommended default: no, add `/api/ice-trade-blotter/raw` to avoid breaking existing Power ICE Settles behavior. Needs user input: no.
- Should raw ICE rows be normalized into the existing product matching catalog? Recommended default: no. Use only raw columns plus display-only grouping and signed quantity. Needs user input: no because the user explicitly said not to standardize.
</open_questions>

<success_criteria>
- `git status --short` is reviewed before editing and the final diff contains only files required for the ICE Trade Blotter page.
- `rg -n "ice-trade-blotter|ICE Trade Blotter|RawIceTradeBlotter" frontend/app frontend/components frontend/lib frontend/README.md frontend/vercel.json` shows the new page, routes, docs, and app-shell wiring.
- `rg -n "loadPromotedNavPositionsSql|positions_and_trades_v2|product_alias|product_catalog|dbt/azure_postgres" frontend/app/api/ice-trade-blotter/raw frontend/components/positions/RawIceTradeBlotter.tsx frontend/lib/positionsAndTrades/iceTradeBlotterTypes.ts` returns no matches, except if a different non-conflicting component path is chosen update the command accordingly.
- `rg -n "isLocalOnlyFeatureEnabled" frontend/app/api/ice-trade-blotter/raw` returns no matches. Why: the requested page should follow NAV Positions production visibility.
- `cd frontend; npm run lint` passes.
- `cd frontend; npm run build` passes, or any failure is clearly unrelated and documented with exact error text.
- With frontend DB credentials available, start or reuse one Next.js dev server according to the frontend worktree rules and smoke:
  - `Invoke-RestMethod "http://localhost:3000/api/ice-trade-blotter/raw?refresh=1"`.
  - `Invoke-RestMethod "http://localhost:3000/api/ice-trade-blotter/raw/drilldown?limit=25&refresh=1"`.
  Confirm both return JSON with non-null source metadata and bounded row counts.
- Open `http://localhost:3000/?section=ice-trade-blotter` at desktop and mobile widths. Verify loading, data, empty, error, refresh, filters, date selection, horizontal overflow, aggregate-cell drilldown, and no overlapping text.
- Existing NAV Positions still opens at `/?section=nav-positions`.
- Existing Power ICE Settles still opens at `/?section=ice-settlements` and its API usage is not broken by route changes.
</success_criteria>

<process>
1. Read all source files listed above, then state the NAV Positions pattern you will follow.
2. Run an assumptions audit before coding using the repo's required format. Proceed with the recommended defaults unless the audit finds a material blocker.
3. Inspect `git status --short` and identify unrelated dirty files that must be preserved.
4. Design the raw ICE API payload to be NAV-like but raw-only: available dates, filters, summary, aggregate rows, drilldown rows, metadata, cache headers, and data-as-of.
5. Implement the API routes first and keep SQL bounded with parameterized queries.
6. Implement the client component by adapting the NAV Positions interaction model and labels to raw ICE trade terminology.
7. Wire the new section into `Sidebar`, `HomePageClient`, `page.tsx` if needed, `vercel.json`, and README docs.
8. Run lint/build and route smoke checks. If credentials are missing, still run static checks and document skipped DB/browser checks precisely.
9. Review the final diff for accidental dbt/backend/schema changes, local-only gating, unbounded SQL, and regressions to NAV Positions or Power ICE Settles.
10. Final response must include changed behavior, files touched, verification results, residual risk, and any user-owned dirty worktree changes left untouched.
</process>
