"""Shared orchestration helper for PJM ICE settlement pulls."""
from __future__ import annotations

from datetime import date
from pathlib import Path

from backend.orchestration.ice_python.settlements import registry
from backend.scrapes.ice_python import settings
from backend.scrapes.ice_python.fields import PJM_SHORT_TERM_FIELDS
from backend.scrapes.ice_python.symbols import pjm as pjm_symbols


API_SCRAPE_NAME = "orchestration_ice_python_settlements_pjm"
DEFAULT_LOOKBACK_DAYS = registry.DEFAULT_LOOKBACK_DAYS


def run(
    symbols: list[str] | None = None,
    fields: list[str] | None = None,
    trade_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    lookback_days: int | None = DEFAULT_LOOKBACK_DAYS,
    include_short_term: bool = True,
    futures_symbols: list[str] | None = None,
    futures_products: list[str] | None = None,
    futures_strips: list[str] | None = None,
    futures_contract_year: int | None = None,
    pull_contract_dates_enabled: bool = True,
    pull_settlements_enabled: bool = True,
    require_rows: bool = True,
    max_retries: int = 3,
    log_file_path: str | Path | None = None,
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object]:
    """Pull PJM contract dates and settlements for selected symbols."""
    selected_symbols = pjm_symbols.select_symbols(
        symbols=symbols,
        include_short_term=include_short_term,
        futures_symbols=futures_symbols,
        futures_products=futures_products,
        futures_strips=futures_strips,
        futures_contract_year=futures_contract_year,
    )
    selected_fields = fields or PJM_SHORT_TERM_FIELDS
    return registry.run_registry_settlements(
        pipeline_name=API_SCRAPE_NAME,
        registry_label="pjm",
        symbols=selected_symbols,
        fields=selected_fields,
        trade_date=trade_date,
        start_date=start_date,
        end_date=end_date,
        lookback_days=lookback_days,
        pull_contract_dates_enabled=pull_contract_dates_enabled,
        pull_settlements_enabled=pull_settlements_enabled,
        require_rows=require_rows,
        max_retries=max_retries,
        log_file_path=log_file_path,
        database=database,
    )
