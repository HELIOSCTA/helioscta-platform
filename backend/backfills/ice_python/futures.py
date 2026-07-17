"""Backfill ICE monthly futures settlements across product registries."""
from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from pathlib import Path

from backend.orchestration.ice_python.settlements._runtime import run_with_logging
from backend.orchestration.ice_python.settlements.registry import run_registry_settlements
from backend.scrapes.ice_python import settings
from backend.scrapes.ice_python.fields import DEFAULT_SETTLEMENT_FIELDS
from backend.scrapes.ice_python.symbols import east_power, ercot, gas, pjm, west_power


DEFAULT_START_DATE = date(2020, 1, 1)
DEFAULT_END_DATE = date.today()
DEFAULT_START_YEAR = 2020
DEFAULT_END_YEAR = 2028
DEFAULT_BATCH_SIZE = 8
DEFAULT_STRIPS = ("F", "G", "H", "J", "K", "M", "N", "Q", "U", "V", "X", "Z")

REGISTRIES = {
    "pjm": pjm,
    "ercot": ercot,
    "gas": gas,
    "west_power": west_power,
    "east_power": east_power,
}


def _normalize_registries(registries: Sequence[str] | None) -> list[str]:
    if registries is None:
        return list(REGISTRIES)
    selected = [registry.strip().lower() for registry in registries if registry.strip()]
    unknown = sorted(set(selected) - set(REGISTRIES))
    if unknown:
        valid = ", ".join(REGISTRIES)
        raise ValueError(f"Unknown ICE futures registries {unknown}. Valid: {valid}.")
    return list(dict.fromkeys(selected))


def _products_for_registry(
    module,
    registry_name: str,
    products: Sequence[str] | None,
    products_by_registry: dict[str, Sequence[str]] | None,
) -> list[str]:
    if products_by_registry and registry_name in products_by_registry:
        selected = list(products_by_registry[registry_name])
    elif products is not None:
        selected = list(products)
    else:
        selected = None
    return module.resolve_futures_products(selected)


def _resolve_strips(module, strips: Sequence[str] | None) -> list[str]:
    return module.resolve_strips(list(strips or DEFAULT_STRIPS))


def build_symbols(
    registries: Sequence[str] | None = None,
    products: Sequence[str] | None = None,
    products_by_registry: dict[str, Sequence[str]] | None = None,
    strips: Sequence[str] | None = None,
    start_year: int = DEFAULT_START_YEAR,
    end_year: int = DEFAULT_END_YEAR,
) -> dict[str, list[str]]:
    """Build expected monthly futures symbols by registry."""
    if start_year > end_year:
        raise ValueError("start_year must be on or before end_year.")
    selected_registries = _normalize_registries(registries)
    if products is not None and len(selected_registries) > 1:
        raise ValueError("Use products_by_registry when backfilling multiple registries.")

    symbols_by_registry: dict[str, list[str]] = {}
    for registry_name in selected_registries:
        module = REGISTRIES[registry_name]
        selected_products = _products_for_registry(
            module,
            registry_name,
            products,
            products_by_registry,
        )
        selected_strips = _resolve_strips(module, strips)
        symbols: list[str] = []
        for contract_year in range(start_year, end_year + 1):
            symbols.extend(
                module.get_futures_symbols(
                    contract_year=contract_year,
                    strips=selected_strips,
                    products=selected_products,
                )
            )
        symbols_by_registry[registry_name] = symbols
    return symbols_by_registry


def _chunk(values: list[str], size: int) -> list[list[str]]:
    return [values[index : index + size] for index in range(0, len(values), size)]


def _merge_missing(target: list[str], summary: dict[str, object]) -> None:
    settlements = summary.get("settlements")
    if isinstance(settlements, dict):
        missing = settlements.get("symbols_missing")
        if isinstance(missing, list):
            target.extend(str(symbol) for symbol in missing)


def run(
    registries: Sequence[str] | None = None,
    products: Sequence[str] | None = None,
    products_by_registry: dict[str, Sequence[str]] | None = None,
    strips: Sequence[str] | None = None,
    start_year: int = DEFAULT_START_YEAR,
    end_year: int = DEFAULT_END_YEAR,
    start_date: date = DEFAULT_START_DATE,
    end_date: date | None = None,
    fields: Sequence[str] | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
    pipeline_name: str = "backfill_ice_python_futures",
    max_retries: int = 3,
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object]:
    """Run a rerunnable monthly futures settlement backfill."""
    if batch_size <= 0:
        raise ValueError("batch_size must be greater than 0.")
    selected_fields = list(fields or DEFAULT_SETTLEMENT_FIELDS)
    symbols_by_registry = build_symbols(
        registries=registries,
        products=products,
        products_by_registry=products_by_registry,
        strips=strips,
        start_year=start_year,
        end_year=end_year,
    )
    resolved_end_date = end_date or date.today()

    all_symbols: list[str] = []
    missing_symbols: list[str] = []
    rows_processed = 0

    for registry_name, symbols in symbols_by_registry.items():
        all_symbols.extend(symbols)
        for batch_number, batch_symbols in enumerate(_chunk(symbols, batch_size), start=1):
            summary = run_registry_settlements(
                pipeline_name=f"{pipeline_name}_{registry_name}_batch_{batch_number}",
                registry_label=f"{registry_name}_futures_backfill",
                symbols=batch_symbols,
                fields=selected_fields,
                start_date=start_date,
                end_date=resolved_end_date,
                lookback_days=None,
                pull_contract_dates_enabled=False,
                pull_settlements_enabled=True,
                require_rows=False,
                require_contract_date_rows=False,
                max_missing_symbol_ratio=None,
                max_retries=max_retries,
                database=database,
            )
            rows_processed += int(summary.get("rows_processed", 0))
            _merge_missing(missing_symbols, summary)

    return {
        "registry": "ice_python_futures_backfill",
        "start_date": start_date.isoformat(),
        "end_date": resolved_end_date.isoformat(),
        "symbols": all_symbols,
        "fields": selected_fields,
        "settlements": {
            "rows_processed": rows_processed,
            "symbols_requested": len(all_symbols),
            "symbols_missing": sorted(set(missing_symbols)),
        },
        "contract_dates_required": False,
        "rows_processed": rows_processed,
    }


def main(
    registries: Sequence[str] | None = None,
    products: Sequence[str] | None = None,
    products_by_registry: dict[str, Sequence[str]] | None = None,
    strips: Sequence[str] | None = None,
    start_year: int = DEFAULT_START_YEAR,
    end_year: int = DEFAULT_END_YEAR,
    start_date: date = DEFAULT_START_DATE,
    end_date: date | None = None,
    fields: Sequence[str] | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
    pipeline_name: str = "backfill_ice_python_futures",
    max_retries: int = 3,
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object]:
    """Run the futures backfill with standard telemetry."""
    return run_with_logging(
        pipeline_name=pipeline_name,
        log_dir=Path(__file__).parent / "logs",
        database=database,
        operation=lambda _log_file_path: run(
            registries=registries,
            products=products,
            products_by_registry=products_by_registry,
            strips=strips,
            start_year=start_year,
            end_year=end_year,
            start_date=start_date,
            end_date=end_date,
            fields=fields,
            batch_size=batch_size,
            pipeline_name=pipeline_name,
            max_retries=max_retries,
            database=database,
        ),
    )


def dry_run(
    registries: Sequence[str] | None = None,
    products: Sequence[str] | None = None,
    products_by_registry: dict[str, Sequence[str]] | None = None,
    strips: Sequence[str] | None = None,
    start_year: int = DEFAULT_START_YEAR,
    end_year: int = DEFAULT_END_YEAR,
) -> dict[str, list[str]]:
    """Return the symbols that would be requested without calling ICE."""
    return build_symbols(
        registries=registries,
        products=products,
        products_by_registry=products_by_registry,
        strips=strips,
        start_year=start_year,
        end_year=end_year,
    )


if __name__ == "__main__":
    main()
