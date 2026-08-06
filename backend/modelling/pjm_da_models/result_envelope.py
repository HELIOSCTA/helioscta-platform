"""Shared result envelope helpers for PJM DA model runners."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime
from typing import Any

import pandas as pd

from .source_registry import artifact_diagnostics, artifact_filenames_for


def canonical_log_name(model_family: str, input_family: str, horizon: str) -> str:
    parts = ["pjm_da", model_family, input_family, horizon]
    return "_".join(part.strip("_") for part in parts if part)


def horizon_name_for_days(horizon_days: int | None) -> str:
    if horizon_days is None:
        return "full_prediction_window"
    days = int(horizon_days)
    if days == 1:
        return "tomorrow"
    return f"next_{days}_days"


def iso_date(value: date | datetime | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def iso_dates(values: list[date | datetime | str] | tuple[date | datetime | str, ...]) -> list[str]:
    return [resolved for value in values if (resolved := iso_date(value)) is not None]


def max_timestamp(frame: pd.DataFrame, column: str) -> str | None:
    if frame.empty or column not in frame.columns:
        return None
    values = pd.to_datetime(frame[column], errors="coerce").dropna()
    if values.empty:
        return None
    return pd.Timestamp(values.max()).isoformat()


def row_count(value: Any) -> int:
    if isinstance(value, pd.DataFrame):
        return int(len(value))
    if isinstance(value, Mapping):
        return sum(row_count(nested) for nested in value.values())
    if isinstance(value, (list, tuple)):
        return int(len(value))
    return 0


def table_row_counts(tables: Mapping[str, Any]) -> dict[str, int]:
    return {name: row_count(value) for name, value in tables.items()}


def build_result_envelope(
    *,
    model_family: str,
    model_name: str,
    input_family: str,
    horizon: str,
    run_id: str,
    run_date: date | datetime | str,
    target_date: date | datetime | str | None,
    target_dates: list[date | datetime | str] | tuple[date | datetime | str, ...],
    hub: str,
    cutoff_utc: str | None,
    include_actuals: bool,
    tables: Mapping[str, Any],
    status: Mapping[str, Any] | None = None,
    diagnostics: Mapping[str, Any] | None = None,
    aliases: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    provided_status = dict(status or {})
    provided_row_counts = provided_status.pop("row_counts", {})
    row_counts = table_row_counts(tables)
    row_counts.update(dict(provided_row_counts))
    warnings = list(provided_status.pop("warnings", []))

    resolved_status: dict[str, Any] = {
        "row_counts": row_counts,
        "has_actuals": False,
        "features_complete": None,
        "warnings": warnings,
    }
    resolved_status.update(provided_status)

    resolved_diagnostics: dict[str, Any] = dict(diagnostics or {})
    resolved_diagnostics.setdefault(
        "sql_inputs",
        artifact_diagnostics(
            model_family=model_family,
            input_family=input_family,
            include_actuals=include_actuals,
        ),
    )
    resolved_diagnostics.setdefault(
        "sql_artifacts",
        list(
            artifact_filenames_for(
                model_family=model_family,
                input_family=input_family,
                include_actuals=include_actuals,
            )
        ),
    )

    result: dict[str, Any] = {
        "model_family": model_family,
        "model_name": model_name,
        "input_family": input_family,
        "horizon": horizon,
        "run_id": run_id,
        "run_date": iso_date(run_date),
        "target_date": iso_date(target_date),
        "target_dates": iso_dates(tuple(target_dates)),
        "hub": hub,
        "cutoff_utc": cutoff_utc,
        "include_actuals": include_actuals,
        "status": resolved_status,
        "tables": dict(tables),
        "diagnostics": resolved_diagnostics,
    }
    if aliases:
        result.update(dict(aliases))
    return result
