# Local-Only ICE Python Settlements

Reusable ICE Python settlement tooling lives here. Keep this package focused
on ICE symbols, contract dates, and market-data settlement pulls that can be
used by more than one source system. This is a local Windows runtime package;
it is not activated on the Linux production VM.

```text
ice_python/
  settings.py          Shared schema, table, and logging defaults
  storage.py           PostgreSQL upsert helper over operator-created tables
  fields/              ICE field names, output columns, and field presets
  symbols/             Settlement adapters over shared ICE symbol registries
    pjm.py             PJM short-term symbols and futures products
    ercot.py           ERCOT short-term symbols and futures products
    gas.py             Gas next-day, BALMO, and futures products
    west_power.py      Mid-C and SP15 monthly power futures products
    east_power.py      NEPOOL monthly power futures products
  contract_dates/      Contract-date pulls for settlement symbols
  settlements/         Settlement time series pulls and formatting
  logs/                Runtime logs
```

This package owns its ICE client helpers, settlement fields, PJM symbols, and
PJM settlement products. It should not import from the legacy ICE Python scrape
package; older PJM registry modules there are compatibility wrappers only.
`symbols/pjm.py` is the backend source of truth for PJM ICE product metadata,
including ICE product URLs, trading-screen hub names, settlement source tables,
hour buckets, and contract labels.
`symbols/ercot.py`, `symbols/gas.py`, `symbols/west_power.py`, and
`symbols/east_power.py` are active non-options registries for ERCOT, gas,
western power, and eastern power product metadata. The package-level
`symbols.get_product_dictionary_entries()` returns PJM, ERCOT, gas, western
power, and eastern power rows together. Options are intentionally out of scope
for this promoted local-only package.

Source-specific packages, such as `backend.scrapes.ice_trade_blotters`, should
prepare their own positions or instruments, then call into this package for
symbol metadata and settlement values. Do not put source-specific blotter
parsing, position netting, or file-management logic here.

Orchestration wrappers live under `backend/orchestration/ice_python/settlements/`:

```powershell
python -m backend.orchestration.ice_python.settlements.pjm_short_term
python -m backend.orchestration.ice_python.settlements.pjm_futures
python -m backend.orchestration.ice_python.settlements.ercot_short_term
python -m backend.orchestration.ice_python.settlements.ercot_futures
python -m backend.orchestration.ice_python.settlements.west_power_futures
python -m backend.orchestration.ice_python.settlements.east_power_futures
python -m backend.orchestration.ice_python.settlements.gas_next_day
python -m backend.orchestration.ice_python.settlements.gas_balmo
python -m backend.orchestration.ice_python.settlements.gas_futures
python -m backend.orchestration.ice_python.settlements.gas_futures_core
python -m backend.orchestration.ice_python.settlements.gas_futures_gulf
python -m backend.orchestration.ice_python.settlements.gas_futures_west
python -m backend.orchestration.ice_python.settlements.gas_futures_east
```

Production local Windows activation is the Task Scheduler coordinator under
`infrastructure/windows-task-scheduler/ice_python/`. The scheduled tasks call the
historically named coordinator module in `run_once` mode:

```powershell
python -c "from backend.orchestration.ice_python import service; raise SystemExit(service.main(run_once=True, job_group='<group>'))"
```

`backend.orchestration.ice_python.service` is a Python module name, not the
active Windows Service Control Manager deployment model. The older NSSM service
deployment path is not retained in this repo; use the Task Scheduler cleanup
script to disable any old `HeliosCTA-IcePython` service startup. Do not add
Linux systemd units for ICE Python.

Each wrapper defaults to today's contract-date snapshot plus a 14-day inclusive
settlement lookback window. Set `lookback_days=0` for single-date behavior.
PJM, ERCOT, western power, eastern power, and gas futures wrappers default from
the current month through 36 months forward. The scheduled gas futures feed is
split into core, Gulf, West, and East wrappers for clearer status and smaller
reruns; the unsplit `gas_futures` wrapper remains available for manual backfill
or broad ad hoc runs.

The runtime writes to `ice_python.settlements` and
`ice_python.settlement_contract_dates`. Those tables are operator-created from
operator-created DDL. The code does not create schemas or tables at runtime.
