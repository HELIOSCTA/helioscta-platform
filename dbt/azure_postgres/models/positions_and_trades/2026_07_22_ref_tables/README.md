# Positions And Trades 2026-07-22 Ref Tables

`2026_07_22_ref_tables` is the active read-only dbt model family for
positions/trades product matching, backend MUFG export SQL, frontend promoted
SQL, and Excel extract SQL.

The key difference from `2026_07_21_sql_embedded` is lookup ownership. That
archived model stores product catalog, product alias, account lookup, and
month-code rows as inline dbt `values` blocks. This active
model reads those lookups from operator-managed Azure Postgres reference tables in the
`positions_and_trades_ref` schema. The live reference tables are current-state
approved rows only; candidate/review workflow is separate operator process and
is not implemented here.

This subtree does not create database objects, load seed rows, or upsert lookup
data. Apply the reference DDL under
`dbt/azure_postgres/reference_sql/ddl/positions_and_trades/reference_tables/`
with `helios_admin` before running ref-table model tests against Azure Postgres.
Use `upsert_positions_and_trades_reference_values.sql` in that directory to
sync the approved current lookup rows. Despite the historical filename, that
script inserts or updates rows present in the file and removes rows no longer
present in the file.

After compiling the active model family, run `python scripts/promote_positions_trades_sql.py` from
`dbt/azure_postgres` only when frontend SQL snapshots need to be refreshed.
That promotion also writes
`frontend/sql/positions-and-trades/manifest.json`, which keeps the dated
ref-table implementation family internal while exposing stable
operator/frontend labels for promoted artifacts. Backend MUFG export and Excel
workflows read compiled dbt SQL directly from
`target/compiled/helioscta_platform/models/positions_and_trades/2026_07_22_ref_tables/`.

Clear Street review models live under `clear_street_eod_transactions/marts/`.
MUFG-specific export models live under `clear_street_eod_transactions/mufg/`
so the scheduled SFTP handoff has a separate dbt contract boundary from the
frontend/operator review marts.

## Shared Product-Code Columns

NAV and Clear Street review models expose the same generated product-code
contract at their outward-facing dbt boundaries:

```text
product_code_family      -- broad family: Gas, Power, Basis
product_code_grouping    -- MUFG/export bucket: gas_future, gas_option,
                             power_future, or power_option
product_code_region      -- market/hub/ISO region, e.g. Henry Hub, PJM
product_code_underlying  -- option underlying product code when applicable
```

`product_code_family`, `product_code_region`, and `product_code_underlying`
come from `positions_and_trades_ref.product_catalog` after source-specific
matching. `product_code_grouping` is derived in dbt from product family and
option/future classification so NAV and Clear Street share the same four
export buckets. Current `Basis` products are gas basis products, so they map
to the gas future/option buckets rather than creating `basis_*` groupings.
Legacy aliases such as `product_family`, `market_name`, `underlying_product_code`,
`product_group`, and `product_region` remain only for current downstream
compatibility.

## Shared Account And Route Columns

NAV and Clear Street marts expose source-specific raw fields and standardized
review fields side by side. Keep this contract consistent whenever either
source changes:

```text
source_account_key     -- raw source account value used for lookup
account_code           -- canonical Helios account code: ACIM, PNT, DICKSON, TITAN
account_name           -- compatibility/display alias for account_code
account_lookup_status  -- matched, missing_source_account, or unmapped
source_exchange_name   -- raw source exchange label, untouched
exchange_route_code    -- canonical vendor route used for generated codes
route_family           -- ice, nymex, missing, or unsupported
is_product_record      -- false for Clear Street residual cash adjustments
```

`exchange_route_code` is the field that code-generation and warning checks
should use. `exchange_name` remains a source/legacy column and should not be
reinterpreted as a standardized route in new consumers. `route_family` groups
`IFED`/`IFE`/`IPE` as `ice` and `NYME`/`NYM`/`NYMEX`/`NMY` as `nymex`.

Clear Street review marts and NAV Excel vendor-code marts derive ICE vendor
codes directly. Short-term power classification uses a simple Mon-Fri
business-day offset and a Monday-start week offset. Weekday daily rows use
verified D0/D1 rules, Friday-to-Monday delivery is D1, PDP/PWA weekly rows map
through W0-W4, and PJM day-ahead PDA rows with Saturday/Sunday delivery are
exposed downstream as the effective PDO weekend product with `PDO P1-IUS`. ICE
holiday calendars are not applied in this model family.

Clear Street residual cash adjustment rows remain visible in review marts with
`is_product_record = false`, but they are intentionally excluded from product
matching exceptions and vendor-code warning tests. They are operational cash
rows, not missing product mappings.

The final MUFG upload model is a stricter CSV artifact boundary. It keeps the
legacy raw Clear Street columns and exports only the MUFG-appended fields
`trade_status`, `ice_product_code`, `cme_product_code`, `bbg_product_code`, and
`product_code_grouping`. Metadata and richer product-code review fields stay
upstream in the Clear Street marts. The backend warning treats blank/null
`product_code_grouping` as a taxonomy failure for product records, then uses
the standardized route-family contract to validate vendor-code completeness:
ICE rows need `ice_product_code`, while NYMEX rows need either
`cme_product_code` or `bbg_product_code`.
Short-term ICE power classification uses the same simple Mon-Fri business-day
and Monday-start week offsets as NAV. Weekday daily rows use verified D0/D1
rules, Friday-to-Monday delivery is D1, PDP/PWA weekly rows map through W0-W4,
and PJM day-ahead PDA rows with Saturday/Sunday delivery are exposed downstream
as the effective PDO weekend product with `PDO P1-IUS`. Rows outside verified
short-term symbol patterns create vendor-code warnings until a verified
code-generation rule is added.

## Reference Sources

- `positions_and_trades_ref.product_catalog`
- `positions_and_trades_ref.product_alias_rules`
- `positions_and_trades_ref.account_lookup`
- `positions_and_trades_ref.month_codes`

The ref-table utility models expose the current rows in these tables directly. NAV
uses `exact` and `regex` product-alias rules against normalized product text.
Clear Street uses `cusip_prefix` product-alias rules for reviewed CUSIP-prefix
overrides before falling back to exchange commodity code matches.

## Verification

From `dbt/azure_postgres`:

```powershell
dbt parse --profiles-dir .
dbt compile --profiles-dir . --select path:models/positions_and_trades/2026_07_22_ref_tables
dbt test --profiles-dir . --select tag:positions_trades_product_matching
```

If the reference schema or tables are not present yet, `dbt parse` can still
prove project syntax, but compile/tests that require relation introspection or
queries may fail until the operator-applied DDL is installed.
