"""Orchestrate gas futures ICE settlement and contract-date pulls."""
from __future__ import annotations

import logging
from datetime import date
from pathlib import Path

from backend.orchestration.ice_python._policies import ice_transient_retry_policy
from backend.orchestration.ice_python.settlements import registry
from backend.orchestration.ice_python.settlements._runtime import (
    preview_values,
    run_with_logging,
)
from backend.scrapes.ice_python import settings
from backend.scrapes.ice_python.symbols import gas


API_SCRAPE_NAME = "orchestration_ice_python_settlements_gas_futures"
REGISTRY_LABEL = "gas_futures"
DEFAULT_MONTHS_FORWARD = 36
DEFAULT_LOOKBACK_DAYS = registry.DEFAULT_LOOKBACK_DAYS
DEFAULT_MAX_MISSING_SYMBOL_RATIO = 0.0

logger = logging.getLogger(__name__)


@ice_transient_retry_policy(attempts=2)
def run(
    products: list[str] | None = None,
    futures_start_date: date | None = None,
    months_forward: int = DEFAULT_MONTHS_FORWARD,
    fields: list[str] | None = None,
    trade_date: date | None = None,
    end_date: date | None = None,
    lookback_days: int | None = DEFAULT_LOOKBACK_DAYS,
    require_rows: bool = True,
    max_missing_symbol_ratio: float | None = DEFAULT_MAX_MISSING_SYMBOL_RATIO,
    database: str | None = settings.TARGET_DATABASE,
    pipeline_name: str = API_SCRAPE_NAME,
    registry_label: str = REGISTRY_LABEL,
) -> dict[str, object]:
    """Run the bounded gas futures settlement scrape with retry policy."""
    futures_symbols = gas.get_futures_symbols_for_horizon(
        products=products,
        start_date=futures_start_date,
        months_forward=months_forward,
    )

    def operation(log_file_path: Path | None) -> dict[str, object]:
        logger.info(
            "Entry parameters: products=%s futures_start_date=%s "
            "months_forward=%s fields=%s trade_date=%s end_date=%s "
            "lookback_days=%s require_rows=%s",
            "default gas futures products" if products is None else products,
            futures_start_date,
            months_forward,
            "default settlement fields" if fields is None else fields,
            trade_date,
            end_date,
            lookback_days,
            require_rows,
        )
        logger.info(
            "Built %s gas futures symbol(s): %s",
            len(futures_symbols),
            preview_values(futures_symbols),
        )
        return registry.run_registry_settlements(
            pipeline_name=pipeline_name,
            registry_label=registry_label,
            symbols=futures_symbols,
            fields=fields,
            trade_date=trade_date,
            end_date=end_date,
            lookback_days=lookback_days,
            require_rows=require_rows,
            max_missing_symbol_ratio=max_missing_symbol_ratio,
            log_file_path=log_file_path,
            database=database,
        )

    return run_with_logging(
        pipeline_name=pipeline_name,
        log_dir=Path(__file__).parent / "logs",
        operation=operation,
        database=database,
    )


def main(
    products: list[str] | None = None,
    futures_start_date: date | None = None,
    months_forward: int = DEFAULT_MONTHS_FORWARD,
    fields: list[str] | None = None,
    trade_date: date | None = None,
    end_date: date | None = None,
    lookback_days: int | None = DEFAULT_LOOKBACK_DAYS,
    require_rows: bool = True,
    max_missing_symbol_ratio: float | None = DEFAULT_MAX_MISSING_SYMBOL_RATIO,
    database: str | None = settings.TARGET_DATABASE,
    pipeline_name: str = API_SCRAPE_NAME,
    registry_label: str = REGISTRY_LABEL,
) -> int:
    try:
        run(
            products=products,
            futures_start_date=futures_start_date,
            months_forward=months_forward,
            fields=fields,
            trade_date=trade_date,
            end_date=end_date,
            lookback_days=lookback_days,
            require_rows=require_rows,
            max_missing_symbol_ratio=max_missing_symbol_ratio,
            database=database,
            pipeline_name=pipeline_name,
            registry_label=registry_label,
        )
        return 0
    except Exception:
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
