"""Orchestrate eastern power futures ICE settlement and contract-date pulls."""
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
from backend.scrapes.ice_python.symbols import east_power


API_SCRAPE_NAME = "orchestration_ice_python_settlements_east_power_futures"
DEFAULT_MONTHS_FORWARD = 36
DEFAULT_LOOKBACK_DAYS = registry.DEFAULT_LOOKBACK_DAYS

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
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object]:
    """Run the bounded eastern power futures settlement scrape with retry policy."""
    futures_symbols = east_power.get_futures_symbols_for_horizon(
        products=products,
        start_date=futures_start_date,
        months_forward=months_forward,
    )

    def operation(log_file_path: Path | None) -> dict[str, object]:
        logger.info(
            "Entry parameters: products=%s futures_start_date=%s "
            "months_forward=%s fields=%s trade_date=%s end_date=%s "
            "lookback_days=%s require_rows=%s",
            "default eastern power futures products" if products is None else products,
            futures_start_date,
            months_forward,
            "default settlement fields" if fields is None else fields,
            trade_date,
            end_date,
            lookback_days,
            require_rows,
        )
        logger.info(
            "Built %s eastern power futures symbol(s): %s",
            len(futures_symbols),
            preview_values(futures_symbols),
        )
        return registry.run_registry_settlements(
            pipeline_name=API_SCRAPE_NAME,
            registry_label="east_power_futures",
            symbols=futures_symbols,
            fields=fields,
            trade_date=trade_date,
            end_date=end_date,
            lookback_days=lookback_days,
            require_rows=require_rows,
            log_file_path=log_file_path,
            database=database,
        )

    return run_with_logging(
        pipeline_name=API_SCRAPE_NAME,
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
    database: str | None = settings.TARGET_DATABASE,
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
            database=database,
        )
        return 0
    except Exception:
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
