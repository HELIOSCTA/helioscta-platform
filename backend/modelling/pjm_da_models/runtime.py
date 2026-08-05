"""Shared runtime helpers for backend PJM DA model loaders."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

from .db import SqlParams, fetch_df


PJM_DA_MODELS_ROOT = Path(__file__).resolve().parent
BACKEND_ROOT = PJM_DA_MODELS_ROOT.parents[1]
SQL_INPUTS_ROOT = PJM_DA_MODELS_ROOT / "sql_inputs"
DEFAULT_LOG_DIR = BACKEND_ROOT / "logs"
EASTERN_TZ = ZoneInfo("America/New_York")
UTC_TZ = ZoneInfo("UTC")


def coerce_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def today_ept() -> date:
    return datetime.now(EASTERN_TZ).date()


def default_cutoff_utc(run_date: date | datetime | str | None = None) -> str:
    resolved_run_date = coerce_date(run_date) if run_date is not None else today_ept()
    cutoff_ept = datetime.combine(resolved_run_date, time(10, 0), tzinfo=EASTERN_TZ)
    return cutoff_ept.astimezone(UTC_TZ).isoformat()


def read_sql_input(name: str) -> str:
    path = SQL_INPUTS_ROOT / name
    if not path.exists():
        raise FileNotFoundError(
            f"Missing backend PJM DA model SQL artifact: {path}. "
            "Compile dbt in runtime mode and run "
            "dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py."
        )
    return path.read_text(encoding="utf-8")


def load_sql_input_frame(name: str, params: SqlParams = ()) -> pd.DataFrame:
    return fetch_df(read_sql_input(name), params)


def normalize_hourly(
    rows: pd.DataFrame,
    *,
    numeric_columns: Iterable[str] = (),
) -> pd.DataFrame:
    output = rows.copy()
    if output.empty:
        return output
    output["date"] = pd.to_datetime(output["date"], errors="coerce").dt.date
    output["hour_ending"] = pd.to_numeric(
        output["hour_ending"],
        errors="coerce",
    ).astype("Int64")
    output = output.dropna(subset=["date", "hour_ending"]).copy()
    output["hour_ending"] = output["hour_ending"].astype(int)
    for column in numeric_columns:
        if column in output.columns:
            output[column] = pd.to_numeric(output[column], errors="coerce")
    return output.sort_values(["date", "hour_ending"]).reset_index(drop=True)


def normalize_daily(
    rows: pd.DataFrame,
    *,
    numeric_columns: Iterable[str] = (),
) -> pd.DataFrame:
    output = rows.copy()
    if output.empty:
        return output
    output["date"] = pd.to_datetime(output["date"], errors="coerce").dt.date
    output = output.dropna(subset=["date"]).copy()
    for column in numeric_columns:
        if column in output.columns:
            output[column] = pd.to_numeric(output[column], errors="coerce")
    return output.sort_values("date").reset_index(drop=True)
