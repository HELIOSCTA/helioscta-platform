# ICE Python Settlement Inputs

Read-only input SQL for ICE Python settlement marks used by PJM DA model
features.

Source tables:

- `ice_python.settlements`
- `ice_python.settlement_contract_dates`

The shaped next-day gas model `ice_python_next_day_gas` uses all active ICE
physical gas D1 symbols from `backend.scrapes.ice_python.symbols.gas` and
returns long-form rows with this stable output grain:

```text
gas_day x symbol
```

The daily long-form output includes `trade_date`, `symbol`, `hub_name`,
`region`, `sort_index`, `gas_price`, `price_basis`, `latest_trade_date`,
`updated_at`, and `contract_dates_updated_at`. This is the reusable contract
for frontend tables and future dbt inputs that need more than the original PJM
five-hub subset.

The symbol map is generated from the backend Python registry into the dbt macro
`ice_python_next_day_gas_symbol_values()`, not hand-maintained inside the model.
Run this after changing `backend/scrapes/ice_python/symbols/gas.py`:

```powershell
python frontend/scripts/sync-ice-gas-registry.py
```

That command refreshes both
`frontend/lib/gasPricing/ice_gas_registry.json` and
`dbt/azure_postgres/macros/pjm_da_model/ice_python_next_day_gas_symbol_values.sql`.

`ice_python_next_day_gas_pjm_features` references the long-form model and maps
the original five PJM loader symbols into the legacy wide feature columns:

```text
XGF D1-IPG -> gas_henry_hub
XZR D1-IPG -> gas_m3
XIZ D1-IPG -> gas_tco
XWK D1-IPG -> gas_tz6
XJL D1-IPG -> gas_dom_south
```

Primary source grain is `trade_date x symbol`. The shaped long-form model
output grain is one physical `gas_day x symbol`; `trade_date` is retained as
the ICE trading session that priced that gas day. The shaped model uses
`ice_python.settlements.trade_date` as the ICE trading session date, builds a
gas-day spine from the old modelling dbt logic, and exposes stable cash price
rows for downstream dbt/frontend consumers. The PJM-specific hourly input
model `ice_python_next_day_gas_hourly` references
`ice_python_next_day_gas_pjm_features` and maps each PJM electric hour to the
physical gas day active at that instant while preserving the five-column PJM
model-loader feature contract.

The gas-day rule is intentionally simple: weekday `settlements.trade_date`
sessions from Monday through Thursday price the next calendar gas day, and
Friday sessions price Saturday, Sunday, and Monday gas days. Weekend-dated
source rows are not treated as trade sessions. The model does not maintain a
separate holiday or non-trading-day calendar.

`ice_python.settlement_contract_dates` remains available for source inspection
through `src_ice_python_settlement_contract_dates.sql`, but it is not used to
price gas days for this PJM DA model input.

For price marks, the model prefers `vwap_close`, then falls back to
`settlement`, then `close`. Sparse trade-date marks are forward-filled at
trade-date grain before being joined to the gas-day spine, matching the old dbt
gas-day model behavior.
