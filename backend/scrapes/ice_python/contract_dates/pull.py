"""Pull settlement contract dates from ICE Python."""
from __future__ import annotations

import logging
from datetime import date
from pathlib import Path

import pandas as pd

from backend.scrapes.ice_python import ice_client, settings
from backend.scrapes.ice_python.contract_dates import utils as contract_dates_utils
from backend.scrapes.ice_python.storage import upsert_dataframe
from backend.scrapes.ice_python.symbols import pjm
from backend.utils import script_logging
from backend.utils.ops_logging import redact_secrets


API_SCRAPE_NAME = "ice_python_settlements_contract_dates"

COLUMNS = contract_dates_utils.CONTRACT_DATES_COLUMNS
DATA_TYPES = contract_dates_utils.CONTRACT_DATES_DATA_TYPES
PRIMARY_KEY = contract_dates_utils.CONTRACT_DATES_PRIMARY_KEY

logger = logging.getLogger(__name__)


def _pull(symbols: list[str]) -> list:
    return contract_dates_utils.get_contract_dates_snapshot(symbols=symbols)


def _format(raw_data: list, trade_date: date | None = None) -> pd.DataFrame:
    return contract_dates_utils.format_contract_dates(
        raw_data=raw_data,
        trade_date=trade_date,
    )


def resolve_date_range(
    trade_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> tuple[date, date]:
    """Resolve mutually exclusive single-date or date-range inputs."""
    if trade_date and (start_date or end_date):
        raise ValueError("Use either trade_date or start_date/end_date, not both.")
    if trade_date:
        return trade_date, trade_date
    if start_date or end_date:
        if not start_date or not end_date:
            raise ValueError("Both start_date and end_date are required together.")
        if start_date > end_date:
            raise ValueError("start_date must be on or before end_date.")
        return start_date, end_date
    today = ice_client.current_trade_date_mst()
    return today, today


def _upsert(
    df: pd.DataFrame,
    database: str | None = settings.TARGET_DATABASE,
) -> None:
    upsert_dataframe(
        df=df,
        database=database,
        schema=settings.SCHEMA,
        table_name=settings.CONTRACT_DATES_TABLE,
        columns=COLUMNS,
        data_types=DATA_TYPES,
        primary_key=PRIMARY_KEY,
    )


def run_contract_dates(
    symbols: list[str],
    trade_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object]:
    selected_symbols = list(
        dict.fromkeys(symbol.strip() for symbol in symbols if symbol and symbol.strip())
    )
    if not selected_symbols:
        raise ValueError("At least one symbol is required.")

    resolved_start_date, resolved_end_date = resolve_date_range(
        trade_date=trade_date,
        start_date=start_date,
        end_date=end_date,
    )
    if resolved_start_date != resolved_end_date:
        raise ValueError(
            "Historical contract-date ranges require an ICE-backed as-of source. "
            "The current get_quotes contract-date path only returns the live "
            "rolling snapshot."
        )

    raw_data = _pull(symbols=selected_symbols)
    df = _format(raw_data=raw_data, trade_date=resolved_end_date)
    _upsert(df=df, database=database)
    returned_symbols = sorted(df["symbol"].unique().tolist()) if not df.empty else []
    return {
        "start_date": resolved_start_date.isoformat(),
        "end_date": resolved_end_date.isoformat(),
        "trade_date": resolved_end_date.isoformat(),
        "symbols_requested": len(selected_symbols),
        "symbols_returned": len(returned_symbols),
        "symbols_missing": sorted(set(selected_symbols) - set(returned_symbols)),
        "rows_processed": len(df),
        "target_table": f"{settings.SCHEMA}.{settings.CONTRACT_DATES_TABLE}",
    }


def main(
    symbols: list[str] | None = None,
    trade_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    database: str | None = settings.TARGET_DATABASE,
) -> int:
    selected_symbols = pjm.get_symbols(symbols=symbols)
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    try:
        run_logger.header(API_SCRAPE_NAME)
        summary = run_contract_dates(
            symbols=selected_symbols,
            trade_date=trade_date,
            start_date=start_date,
            end_date=end_date,
            database=database,
        )
        run_logger.success(
            f"Upserted {summary['rows_processed']:,} ICE contract date row(s)."
        )
        return 0
    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    finally:
        script_logging.close_logging()


if __name__ == "__main__":
    raise SystemExit(main())
