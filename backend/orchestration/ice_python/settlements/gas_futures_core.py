"""Orchestrate core gas futures ICE settlement and contract-date pulls."""
from __future__ import annotations

from datetime import date

from backend.orchestration.ice_python.settlements import gas_futures
from backend.scrapes.ice_python import settings


API_SCRAPE_NAME = "orchestration_ice_python_settlements_gas_futures_core"
REGISTRY_LABEL = "gas_futures_core"
PRODUCTS = ["HNG", "PHH"]


def run(
    futures_start_date: date | None = None,
    months_forward: int = gas_futures.DEFAULT_MONTHS_FORWARD,
    fields: list[str] | None = None,
    trade_date: date | None = None,
    end_date: date | None = None,
    lookback_days: int | None = gas_futures.DEFAULT_LOOKBACK_DAYS,
    require_rows: bool = True,
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object]:
    """Run the core Henry Hub gas futures settlement scrape."""
    return gas_futures.run(
        products=PRODUCTS,
        futures_start_date=futures_start_date,
        months_forward=months_forward,
        fields=fields,
        trade_date=trade_date,
        end_date=end_date,
        lookback_days=lookback_days,
        require_rows=require_rows,
        database=database,
        pipeline_name=API_SCRAPE_NAME,
        registry_label=REGISTRY_LABEL,
    )


def main(
    futures_start_date: date | None = None,
    months_forward: int = gas_futures.DEFAULT_MONTHS_FORWARD,
    fields: list[str] | None = None,
    trade_date: date | None = None,
    end_date: date | None = None,
    lookback_days: int | None = gas_futures.DEFAULT_LOOKBACK_DAYS,
    require_rows: bool = True,
    database: str | None = settings.TARGET_DATABASE,
) -> int:
    try:
        run(
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
