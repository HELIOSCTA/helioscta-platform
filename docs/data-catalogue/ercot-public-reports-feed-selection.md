# ERCOT Public Reports Feed Selection

This note records which ERCOT Public Reports feeds are worth pulling into this
project and which feeds should stay out of the first promotion wave.

Source reviewed on 2026-06-13:

- ERCOT Data Product Details pages under `https://www.ercot.com/mp/data-products/`.
- ERCOT Public Reports base URL: `https://api.ercot.com/api/public-reports`.
- Live API probe for `NP6-905-CD` endpoint
  `np6-905-cd/spp_node_zone_hub`.

## Selection Rules

Promote feeds that support ERCOT price formation, hub basis, load and renewable
context, outage risk, congestion, or reference data needed to join those
datasets.

Defer reports that are billing, settlement-charge detail, credit, market notice,
administrative, or ad hoc unless a downstream consumer requires them.

High-frequency feeds should stay scoped to the four hub settlement points until
there is a clear consumer for all nodes, zones, or resources.

## Current Production Criticality

- `dam_stlmnt_pnt_prices` provides day-ahead hub price readiness.
- `settlement_point_prices` is scaffolded as the next real-time hub price feed
  but is not yet deployed or scheduled.

## Pull Tiers

### Tier 0 - Promoted Or In Flight

| Feed | ERCOT product | Endpoint | Runtime stance |
|---|---|---|---|
| dam_stlmnt_pnt_prices | NP4-190-CD | np4-190-cd/dam_stlmnt_pnt_prices | Promoted; manual smoke complete; unscheduled |
| settlement_point_prices | NP6-905-CD | np6-905-cd/spp_node_zone_hub | Promoted; manual smoke complete; unscheduled |

### Tier 1 - Promote Next

| Feed area | Why pull |
|---|---|
| RT settlement point prices | Completes ERCOT DA/RT hub basis and intraday price history |
| DAM shadow prices | Day-ahead congestion drivers |
| SCED shadow prices | Real-time congestion drivers |
| System-wide load and load forecast | Core demand driver for price moves |
| Wind and solar actuals | Renewable actual context for RT price and congestion |
| Wind and solar forecasts | Forecast error and net-load signal |
| Generation outages / capacity availability | Supply stack and risk context |

### Tier 2 - Promote When The Use Case Needs It

| Feed area | Why pull later |
|---|---|
| Ancillary service prices and awards | Reserve market analytics |
| Binding constraints and contingencies | Deeper congestion diagnostics |
| Settlement charge detail | Back-office reconciliation rather than first-pass market analytics |
| Credit and collateral reports | Specialized risk workflow |
| Market notices and documents | Requires document/file handling and consumer design |

## Recommended Promotion Order

1. DAM shadow prices
2. SCED shadow prices
3. ERCOT load actuals
4. ERCOT load forecast
5. Wind actuals
6. Solar actuals
7. Wind forecast
8. Solar forecast
9. Generation outage or capacity availability feed

## Per-Feed Promotion Contract

For every ERCOT Public Reports feed promoted from this selection note:

- Backend module name and destination table name should match the selected
  snake_case feed name.
- Destination schema is `ercot`.
- Table DDL and index SQL live in
  `dbt/azure_postgres/models/power/ercot/<feed_name>/` as disabled operator
  SQL.
- Enabled dbt files stay read-only: source, staging, and final shaping models.
- The source contract must document EMIL ID, report type ID, endpoint, display
  name, grain, uniqueness key, freshness field, and runtime filters.
- Runtime writes use backend `helios_admin` upserts.
- Initial promotion does not backfill unless explicitly requested.
- High-frequency feeds must use a bounded default lookback and source filters
  when ERCOT supports them.
