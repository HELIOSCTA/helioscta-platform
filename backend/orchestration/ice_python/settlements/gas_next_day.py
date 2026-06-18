"""Orchestrate next-day gas ICE settlement and contract-date pulls."""
from __future__ import annotations

import logging
from datetime import date
from pathlib import Path

from backend.orchestration.ice_python._policies import ice_transient_retry_policy
from backend.orchestration.ice_python.settlements import registry
from backend.orchestration.ice_python.settlements._runtime import run_with_logging
from backend.scrapes.ice_python import settings
from backend.scrapes.ice_python.symbols import gas


API_SCRAPE_NAME = "orchestration_ice_python_settlements_gas_next_day"
DEFAULT_LOOKBACK_DAYS = registry.DEFAULT_LOOKBACK_DAYS

logger = logging.getLogger(__name__)


@ice_transient_retry_policy(attempts=2)
def run(
    symbols: list[str] | None = None,
    fields: list[str] | None = None,
    trade_date: date | None = None,
    end_date: date | None = None,
    lookback_days: int | None = DEFAULT_LOOKBACK_DAYS,
    require_rows: bool = True,
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object]:
    """Run the next-day gas settlement scrape with retry policy."""
    selected_symbols = symbols or gas.get_next_day_gas_symbol_codes()

    def operation(log_file_path: Path | None) -> dict[str, object]:
        logger.info(
            "Entry parameters: symbols=%s fields=%s trade_date=%s end_date=%s "
            "lookback_days=%s require_rows=%s",
            "default next-day gas" if symbols is None else len(symbols),
            "default settlement fields" if fields is None else fields,
            trade_date,
            end_date,
            lookback_days,
            require_rows,
        )
        return registry.run_registry_settlements(
            pipeline_name=API_SCRAPE_NAME,
            registry_label="gas_next_day",
            symbols=selected_symbols,
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
    symbols: list[str] | None = None,
    fields: list[str] | None = None,
    trade_date: date | None = None,
    end_date: date | None = None,
    lookback_days: int | None = DEFAULT_LOOKBACK_DAYS,
    require_rows: bool = True,
    database: str | None = settings.TARGET_DATABASE,
) -> int:
    try:
        run(
            symbols=symbols,
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
