# Gas Pricing SQL

Standalone, read-only SQL scripts for ICE next-day gas price shaping.

## Files

- `marts/ice_python_next_day_gas_hourly.sql`: reproduces the legacy
  `ice_python_next_day_gas_hourly` mart shape from the promoted
  `ice_python.settlements` table.
- `verification/verify_ice_physical_gas_calendar.sql`: read-only calendar
  verifier for weekday ICE physical gas holidays that interrupt normal trading,
  including the prior trade date, next trade date, and affected gas-day strip.

## Shape

The hourly gas script emits one row per gas-day hour. Gas days run from
`09:00` to `09:00` in `America/Chicago`. `trade_date` is the ICE session that
priced the delivery gas day.

The output keeps the old 14 PJM-relevant hub columns. Four legacy symbols
(`Z28 D1-IPG`, `YVQ D1-IPG`, `XZL D1-IPG`, and `XIH D1-IPG`) are not currently
present in the promoted ICE registry or production rows, so their columns
remain null until those symbols are intentionally added to the scrape runtime.
The legacy column names end in `_cash`, but this script's default value basis
is `vwap_close`.

The old dbt model used a separate ICE non-trading-day seed. This standalone
script does not depend on a database seed table; it generates the ICE physical
gas trading calendar from the shared TypeScript calendar module and uses that
calendar to assign each gas day to the ICE session that priced it. Weekend and
holiday strips are therefore handled from the same source as API routes.

## TypeScript Builder

The matching SQL builder lives at:

```text
frontend/lib/gasPricing/hourlyGasPricingSql.ts
```

Use `buildIcePythonNextDayGasHourlySql()` to generate the same query with
optional `startGasDay`, `endGasDay`, and `priceBasis` parameters.

Calendar primitives live under:

```text
frontend/lib/tradingCalendars
```
