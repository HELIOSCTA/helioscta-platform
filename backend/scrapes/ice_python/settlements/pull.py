"""Pull daily settlement fields from ICE Python."""
from __future__ import annotations

import logging
from datetime import date, datetime, time
from pathlib import Path

import pandas as pd

from backend.scrapes.ice_python import ice_client, settings
from backend.scrapes.ice_python.fields import (
    DEFAULT_SETTLEMENT_FIELDS,
    PJM_SHORT_TERM_FIELDS,
    SETTLEMENT_COLUMNS,
    SETTLEMENT_DATA_TYPES,
    SETTLEMENT_PRIMARY_KEY,
)
from backend.scrapes.ice_python.settlements.format import format_settlements
from backend.scrapes.ice_python.storage import upsert_dataframe
from backend.scrapes.ice_python.symbols import pjm
from backend.utils import script_logging
from backend.utils.ops_logging import redact_secrets


API_SCRAPE_NAME = "ice_python_settlements"
DEFAULT_GRANULARITY = "D"

logger = logging.getLogger(__name__)


def _date_to_datetime(value: date) -> datetime:
    return datetime.combine(value, time.min)


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


def _pull(
    symbols: list[str],
    fields: list[str],
    start_date: date,
    end_date: date,
    granularity: str = DEFAULT_GRANULARITY,
    max_retries: int = 3,
) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    start_dt = _date_to_datetime(start_date)
    end_dt = _date_to_datetime(end_date)
    for symbol in symbols:
        for field in fields:
            df = ice_client.get_timeseries_with_retry(
                symbol=symbol,
                data_type=field,
                granularity=granularity,
                start_date=start_dt,
                end_date=end_dt,
                max_retries=max_retries,
            )
            df = ice_client.format_timeseries(df=df, keep_zeros=True)
            if not df.empty:
                frames.append(df)
    return ice_client.combine_frames(frames)


def _upsert(
    df: pd.DataFrame,
    database: str | None = settings.TARGET_DATABASE,
) -> None:
    upsert_dataframe(
        df=df,
        database=database,
        schema=settings.SCHEMA,
        table_name=settings.SETTLEMENTS_TABLE,
        columns=SETTLEMENT_COLUMNS,
        data_types=SETTLEMENT_DATA_TYPES,
        primary_key=SETTLEMENT_PRIMARY_KEY,
    )


def run_settlements(
    symbols: list[str],
    fields: list[str] | None = None,
    trade_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    granularity: str = DEFAULT_GRANULARITY,
    max_retries: int = 3,
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object]:
    selected_symbols = list(
        dict.fromkeys(symbol.strip() for symbol in symbols if symbol and symbol.strip())
    )
    if not selected_symbols:
        raise ValueError("At least one symbol is required.")
    selected_fields = list(
        dict.fromkeys(
            field.strip()
            for field in (fields or DEFAULT_SETTLEMENT_FIELDS)
            if field.strip()
        )
    )
    if not selected_fields:
        raise ValueError("At least one field is required.")

    resolved_start_date, resolved_end_date = resolve_date_range(
        trade_date=trade_date,
        start_date=start_date,
        end_date=end_date,
    )
    raw_df = _pull(
        symbols=selected_symbols,
        fields=selected_fields,
        start_date=resolved_start_date,
        end_date=resolved_end_date,
        granularity=granularity,
        max_retries=max_retries,
    )
    df = format_settlements(raw_df)
    _upsert(df=df, database=database)
    returned_symbols = sorted(df["symbol"].unique().tolist()) if not df.empty else []
    return {
        "start_date": resolved_start_date.isoformat(),
        "end_date": resolved_end_date.isoformat(),
        "symbols_requested": len(selected_symbols),
        "symbols_returned": len(returned_symbols),
        "symbols_missing": sorted(set(selected_symbols) - set(returned_symbols)),
        "fields_requested": selected_fields,
        "rows_processed": len(df),
        "target_table": f"{settings.SCHEMA}.{settings.SETTLEMENTS_TABLE}",
    }


def main(
    symbols: list[str] | None = None,
    fields: list[str] | None = None,
    trade_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    granularity: str = DEFAULT_GRANULARITY,
    max_retries: int = 3,
    database: str | None = settings.TARGET_DATABASE,
) -> int:
    selected_symbols = pjm.get_symbols(symbols=symbols)
    selected_fields = fields or PJM_SHORT_TERM_FIELDS
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    try:
        run_logger.header(API_SCRAPE_NAME)
        summary = run_settlements(
            symbols=selected_symbols,
            fields=selected_fields,
            trade_date=trade_date,
            start_date=start_date,
            end_date=end_date,
            granularity=granularity,
            max_retries=max_retries,
            database=database,
        )
        run_logger.success(
            f"Upserted {summary['rows_processed']:,} ICE settlement row(s)."
        )
        return 0
    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    finally:
        script_logging.close_logging()


if __name__ == "__main__":
    raise SystemExit(main())
