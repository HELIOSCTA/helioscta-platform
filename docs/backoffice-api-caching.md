# Back Office API Caching

This note documents the current frontend-safe caching layer and the recommended
backend snapshot contract for Back Office Positions & Trades pages.

## Current Frontend Cache

The Back Office API routes use private caches only. Responses must not be cached
publicly at the CDN while the pages are Microsoft-auth protected and may expose
operator-only data.

Implemented layers:

- Client JSON cache in `frontend/lib/clientJsonCache.ts`.
- Warm server route cache in `frontend/lib/server/routeCache.ts`.
- Private HTTP cache headers with `Vercel-CDN-Cache-Control: no-store`.
- `refresh=1` or `refresh=<nonce>` bypasses the route cache and browser cache.

Current route TTL defaults:

| Route | Latest TTL | Date-pinned TTL | Notes |
| --- | ---: | ---: | --- |
| `/api/backoffice-home` | 5 min | n/a | Source-file readiness and telemetry summary. |
| `/api/backoffice-monitor` | 5 min | n/a | Email routing and send telemetry summary. |
| `/api/backoffice-positions-trades` | 2 min | 60 min | Historical NAV dates are treated as stable. |
| `/api/backoffice-trade-pipeline` | 60 sec | 15 min | Date-pinned Titan preview is treated as stable. |
| `/api/backoffice-nav-daily-position-sheet` | 60 sec | 60 min | Date-pinned NAV gas matrix/options are treated as stable. |
| `/api/back-office/trade-pipeline/preview` | n/a | 15 min | Date-scoped Titan CSV download. |

## Backend Snapshot Contract

The route cache reduces repeated frontend reads, but it does not replace a
backend source-of-truth cache. The VM should eventually write small
dashboard-ready snapshots after each successful source load, dbt validation, or
MUFG upload. This keeps Vercel routes from running large promoted dbt SQL on
every cold start.

Recommended snapshot tables are intentionally documented here, not created by
this repo. Database DDL is managed outside the application code.

### `backoffice.home_snapshot`

Grain: one row per source family and source file type.

Suggested uniqueness key:

- `source_family`
- `source_id`
- `business_date`

Freshness fields:

- `business_date`
- `source_loaded_at`
- `db_checked_at`
- `snapshot_generated_at`

Payload fields:

- source status
- DB mirror status
- row count
- exception reason
- latest filename
- latest available date

### `backoffice.trade_pipeline_snapshot`

Grain: one row per Clear Street business date.

Suggested uniqueness key:

- `sftp_date`
- `profile`

Freshness fields:

- `sftp_date`
- `source_loaded_at`
- `mufg_uploaded_at`
- `snapshot_generated_at`

Payload fields:

- raw row count
- Titan row count
- MUFG upload status
- checksum
- artifact path/name
- warning/failure counts

### `backoffice.nav_daily_position_sheet_snapshot`

Grain: one row per NAV date and view.

Suggested uniqueness key:

- `nav_date`
- `view_name`

Freshness fields:

- `nav_date`
- `latest_upload_at`
- `snapshot_generated_at`

Payload fields:

- gas futures matrix JSON
- gas options ladder JSON
- excluded futures/options counts
- riskmatrix file count when promoted
- source validation metadata

### `backoffice.positions_trades_validation_snapshot`

Grain: one row per validation run and check.

Suggested uniqueness key:

- `validation_run_id`
- `validation_scope`
- `check_id`

Freshness fields:

- `validated_at`
- `source_data_as_of`

Payload fields:

- pass/warn/fail status
- failing row count
- sample failure detail
- bounded failure-row JSON for the UI

## Invalidation

Backend writers should invalidate or replace snapshots when these source events
change:

- `nav.positions` latest `nav_date` or `sftp_upload_timestamp`
- `clear_street.eod_transactions` latest `sftp_date` or upload timestamp
- MUFG upload telemetry in `ops.api_fetch_log`
- dbt validation telemetry or promoted validation SQL output
- Microsoft Graph email send telemetry

Until these snapshots are promoted, the frontend route cache is the safe
intermediate optimization.
