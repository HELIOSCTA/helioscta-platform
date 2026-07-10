"""Shared orchestration helper for ICE settlement registry pulls."""
from __future__ import annotations

import logging
from datetime import date, timedelta
from pathlib import Path

from backend.scrapes.ice_python import settings
from backend.scrapes.ice_python.contract_dates import pull as contract_dates_pull
from backend.scrapes.ice_python.fields import DEFAULT_SETTLEMENT_FIELDS
from backend.scrapes.ice_python.settlements import pull as settlements_pull
from backend.orchestration.ice_python.settlements._runtime import preview_values


DEFAULT_LOOKBACK_DAYS = 14
DEFAULT_MAX_MISSING_SYMBOL_RATIO = 0.20

logger = logging.getLogger(__name__)


def _log_step_summary(step_name: str, summary: dict[str, object]) -> None:
    rows_processed = int(summary.get("rows_processed", 0))
    symbols_requested = summary.get("symbols_requested", "n/a")
    symbols_returned = summary.get("symbols_returned", "n/a")
    missing_symbols = summary.get("symbols_missing") or []
    target_table = summary.get("target_table", "n/a")

    logger.info(
        "%s complete: rows=%s symbols_returned=%s/%s target=%s",
        step_name,
        f"{rows_processed:,}",
        symbols_returned,
        symbols_requested,
        target_table,
    )
    if missing_symbols:
        logger.warning(
            "%s missing %s symbol(s): %s",
            step_name,
            len(missing_symbols),
            preview_values(list(missing_symbols)),
        )


def _validate_rows(
    summary: dict[str, object],
    step_name: str,
    require_rows: bool,
) -> None:
    rows_processed = int(summary.get("rows_processed", 0))
    if require_rows and rows_processed <= 0:
        raise RuntimeError(
            f"{step_name} returned zero rows from ICE; treating this as a failed "
            "live pull."
        )


def _validate_symbol_coverage(
    summary: dict[str, object],
    step_name: str,
    require_rows: bool,
    max_missing_symbol_ratio: float | None,
) -> None:
    if not require_rows or max_missing_symbol_ratio is None:
        return
    if not 0 <= max_missing_symbol_ratio <= 1:
        raise ValueError("max_missing_symbol_ratio must be between 0 and 1.")

    symbols_requested = int(summary.get("symbols_requested", 0))
    missing_symbols = summary.get("symbols_missing") or []
    if symbols_requested <= 0 or not missing_symbols:
        return

    missing_ratio = len(missing_symbols) / symbols_requested
    if missing_ratio > max_missing_symbol_ratio:
        raise RuntimeError(
            f"{step_name} missed {len(missing_symbols)} of {symbols_requested} "
            "ICE symbol(s), exceeding the configured coverage threshold of "
            f"{max_missing_symbol_ratio:.0%}."
        )


def resolve_lookback_date_range(
    end_date: date | None = None,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> tuple[date, date]:
    """Resolve an inclusive lookback range ending on end_date or today."""
    if lookback_days < 0:
        raise ValueError("lookback_days must be greater than or equal to 0.")
    _, resolved_end_date = settlements_pull.resolve_date_range(trade_date=end_date)
    return resolved_end_date - timedelta(days=lookback_days), resolved_end_date


def run_registry_settlements(
    pipeline_name: str,
    registry_label: str,
    symbols: list[str],
    fields: list[str] | None = None,
    trade_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    lookback_days: int | None = DEFAULT_LOOKBACK_DAYS,
    pull_contract_dates_enabled: bool = True,
    pull_settlements_enabled: bool = True,
    require_rows: bool = True,
    require_contract_date_rows: bool = True,
    max_missing_symbol_ratio: float | None = DEFAULT_MAX_MISSING_SYMBOL_RATIO,
    max_retries: int = 3,
    log_file_path: str | Path | None = None,
    database: str | None = settings.TARGET_DATABASE,
) -> dict[str, object]:
    """Pull contract dates and settlements for a concrete ICE symbol list."""
    del log_file_path
    selected_symbols = list(
        dict.fromkeys(symbol.strip() for symbol in symbols if symbol and symbol.strip())
    )
    if not selected_symbols:
        raise ValueError("At least one ICE settlement symbol is required.")
    selected_fields = fields or DEFAULT_SETTLEMENT_FIELDS
    if lookback_days is not None:
        if start_date is not None:
            raise ValueError("Use either start_date or lookback_days, not both.")
        if trade_date is not None and end_date is not None:
            raise ValueError("Use either trade_date or end_date, not both.")
        resolved_start_date, resolved_end_date = resolve_lookback_date_range(
            end_date=end_date or trade_date,
            lookback_days=lookback_days,
        )
    else:
        resolved_start_date, resolved_end_date = settlements_pull.resolve_date_range(
            trade_date=trade_date,
            start_date=start_date,
            end_date=end_date,
        )

    logger.info(
        "Starting %s: registry=%s start_date=%s end_date=%s lookback_days=%s "
        "contract_dates=%s settlements=%s require_rows=%s "
        "require_contract_date_rows=%s max_missing_symbol_ratio=%s max_retries=%s",
        pipeline_name,
        registry_label,
        resolved_start_date.isoformat(),
        resolved_end_date.isoformat(),
        lookback_days,
        pull_contract_dates_enabled,
        pull_settlements_enabled,
        require_rows,
        require_contract_date_rows,
        max_missing_symbol_ratio,
        max_retries,
    )
    logger.info(
        "Selected %s ICE symbol(s): %s",
        len(selected_symbols),
        preview_values(selected_symbols),
    )
    logger.info(
        "Selected %s ICE field(s): %s",
        len(selected_fields),
        ", ".join(selected_fields),
    )

    contract_dates_summary: dict[str, object] = {
        "skipped": True,
        "rows_processed": 0,
    }
    if pull_contract_dates_enabled:
        contract_dates_summary = contract_dates_pull.run_contract_dates(
            symbols=selected_symbols,
            trade_date=resolved_end_date,
            database=database,
        )
        _log_step_summary("contract_dates", contract_dates_summary)
        contract_dates_required = require_rows and require_contract_date_rows
        _validate_rows(
            summary=contract_dates_summary,
            step_name="contract_dates",
            require_rows=contract_dates_required,
        )
        _validate_symbol_coverage(
            summary=contract_dates_summary,
            step_name="contract_dates",
            require_rows=contract_dates_required,
            max_missing_symbol_ratio=max_missing_symbol_ratio,
        )
        if (
            not contract_dates_required
            and int(contract_dates_summary.get("rows_processed", 0)) <= 0
        ):
            logger.warning(
                "contract_dates returned zero rows but this registry treats the "
                "contract-date refresh as non-fatal; continuing to settlement pull."
            )

    settlements_summary: dict[str, object] = {
        "skipped": True,
        "rows_processed": 0,
    }
    if pull_settlements_enabled:
        settlements_summary = settlements_pull.run_settlements(
            symbols=selected_symbols,
            fields=selected_fields,
            start_date=resolved_start_date,
            end_date=resolved_end_date,
            max_retries=max_retries,
            database=database,
        )
        _log_step_summary("settlements", settlements_summary)
        _validate_rows(
            summary=settlements_summary,
            step_name="settlements",
            require_rows=require_rows,
        )
        _validate_symbol_coverage(
            summary=settlements_summary,
            step_name="settlements",
            require_rows=require_rows,
            max_missing_symbol_ratio=max_missing_symbol_ratio,
        )

    rows_processed = (
        int(contract_dates_summary.get("rows_processed", 0))
        + int(settlements_summary.get("rows_processed", 0))
    )
    return {
        "registry": registry_label,
        "start_date": resolved_start_date.isoformat(),
        "end_date": resolved_end_date.isoformat(),
        "symbols": selected_symbols,
        "fields": selected_fields,
        "contract_dates": contract_dates_summary,
        "settlements": settlements_summary,
        "contract_dates_required": require_rows and require_contract_date_rows,
        "rows_processed": rows_processed,
    }
