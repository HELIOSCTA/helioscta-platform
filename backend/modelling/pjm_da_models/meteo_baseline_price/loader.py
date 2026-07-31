"""Direct loaders for Meteologica Western Hub DA price forecasts.

Source contract:
- Deterministic: meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly
- Ensemble: meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly
- Actual DA LMP: pjm.da_hrl_lmps

Forecast source grain is content_id x update_id x forecast_period_start.
The loader returns the latest issue for a selected delivery date bounded by a
UTC issue cutoff and/or lead-day filter. When omitted, the cutoff defaults to
the old DA boundary: 10:00 America/New_York on the relevant run date.
"""

from __future__ import annotations

import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Iterable
from zoneinfo import ZoneInfo

import pandas as pd

if __package__ in (None, ""):
    _MODULE_DIR = Path(__file__).resolve().parent
    if str(_MODULE_DIR) not in sys.path:
        sys.path.insert(0, str(_MODULE_DIR))
    from db import fetch_df  # type: ignore[import-not-found]
else:
    from .db import fetch_df

DET_TABLE = "meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly"
ENS_TABLE = "meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly"
ACTUAL_DA_TABLE = "pjm.da_hrl_lmps"
DEFAULT_HUB = "WESTERN HUB"
SQL_ROOT = Path(__file__).resolve().parents[1] / "sql_inputs"
EASTERN_TZ = ZoneInfo("America/New_York")
UTC_TZ = ZoneInfo("UTC")

ENS_MEMBER_COLUMNS = tuple(f"da_price_ens_{index:02d}" for index in range(51))
FORECAST_COLUMNS = (
    "as_of_date",
    "date",
    "hour_ending",
    "forecast_period_start",
    "da_price_deterministic",
    "da_price_ens_average",
    "da_price_ens_bottom",
    "da_price_ens_top",
    "det_forecast_execution_datetime_local",
    "ens_forecast_execution_datetime_local",
    *ENS_MEMBER_COLUMNS,
)


def _coerce_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def today_ept() -> date:
    return datetime.now(EASTERN_TZ).date()


def default_cutoff_utc(run_date: date | datetime | str | None = None) -> str:
    resolved_run_date = _coerce_date(run_date) if run_date is not None else today_ept()
    cutoff_ept = datetime.combine(resolved_run_date, time(10, 0), tzinfo=EASTERN_TZ)
    return cutoff_ept.astimezone(UTC_TZ).isoformat()


def _empty_forecast_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=list(FORECAST_COLUMNS))


def _read_sql(name: str) -> str:
    path = SQL_ROOT / name
    if not path.exists():
        raise FileNotFoundError(f"Missing backend PJM DA model SQL artifact: {path}. Compile dbt in runtime mode and run dbt/azure_postgres/scripts/promote_pjm_da_model_backend_sql.py.")
    return path.read_text(encoding="utf-8")


def _expand_ens_member_values(rows: pd.DataFrame) -> pd.DataFrame:
    if "ens_member_values" not in rows.columns:
        return rows

    output = rows.copy()
    for index, column in enumerate(ENS_MEMBER_COLUMNS):
        output[column] = output["ens_member_values"].map(
            lambda values, idx=index: values[idx]
            if isinstance(values, (list, tuple)) and len(values) > idx
            else None
        )
    return output.drop(columns=["ens_member_values"])


def available_target_dates(
    *,
    start_date: date | str,
    cutoff_utc: str | None = None,
    limit: int = 60,
) -> list[date]:
    """Return future delivery dates with 24-hour deterministic and ENS coverage."""
    resolved_start = _coerce_date(start_date)
    resolved_cutoff_utc = cutoff_utc or default_cutoff_utc(
        resolved_start - timedelta(days=1)
    )
    bounded_limit = max(1, min(int(limit), 90))
    rows = fetch_df(
        _read_sql("available_target_dates.sql"),
        {
            "start_date": resolved_start,
            "cutoff_utc": resolved_cutoff_utc,
            "limit": bounded_limit,
        },
    )
    return [date.fromisoformat(str(row.forecast_date)) for row in rows.itertuples()]


def load_meteologica_da_price_forecast(
    *,
    target_date: date | str,
    cutoff_utc: str | None = None,
    lead_days: int | None = None,
) -> pd.DataFrame:
    """Load one delivery date of Western Hub DA price forecast rows.

    The output mirrors the old cache loader's normalized column names:
    date, hour_ending, da_price_deterministic, da_price_ens_average,
    da_price_ens_bottom, da_price_ens_top, execution timestamps, and
    da_price_ens_00 through da_price_ens_50.
    """
    resolved_target = _coerce_date(target_date)
    cutoff_run_date = (
        resolved_target - timedelta(days=int(lead_days))
        if lead_days is not None
        else today_ept()
    )
    resolved_cutoff_utc = cutoff_utc or default_cutoff_utc(cutoff_run_date)
    rows = fetch_df(
        _read_sql("meteo_da_price_forecast_hourly.sql"),
        {
            "target_date": resolved_target,
            "cutoff_utc": resolved_cutoff_utc,
            "lead_days": lead_days,
        },
    )
    if rows.empty:
        return _empty_forecast_frame()

    rows = _expand_ens_member_values(rows)
    output = rows.reindex(columns=list(FORECAST_COLUMNS)).copy()
    output["date"] = pd.to_datetime(output["date"], errors="coerce").dt.date
    output["as_of_date"] = pd.to_datetime(output["as_of_date"], errors="coerce").dt.date
    output["hour_ending"] = pd.to_numeric(output["hour_ending"], errors="coerce").astype("Int64")
    for column in (
        "da_price_deterministic",
        "da_price_ens_average",
        "da_price_ens_bottom",
        "da_price_ens_top",
        *ENS_MEMBER_COLUMNS,
    ):
        output[column] = pd.to_numeric(output[column], errors="coerce")
    for column in (
        "forecast_period_start",
        "det_forecast_execution_datetime_local",
        "ens_forecast_execution_datetime_local",
    ):
        output[column] = pd.to_datetime(output[column], errors="coerce")
    output = output.dropna(subset=["date", "hour_ending"]).copy()
    output["hour_ending"] = output["hour_ending"].astype(int)
    return output.sort_values("hour_ending").reset_index(drop=True)


def load_actual_da_lmps(
    *,
    target_date: date | str,
    hub: str = DEFAULT_HUB,
) -> pd.DataFrame:
    """Load settled/current DA LMP actuals for one hub and delivery date."""
    resolved_target = _coerce_date(target_date)
    rows = fetch_df(
        _read_sql("actual_da_lmps_hourly.sql"),
        {
            "target_date": resolved_target,
            "hub": hub,
        },
    )
    if rows.empty:
        return pd.DataFrame(
            columns=[
                "date",
                "hour_ending",
                "region",
                "lmp",
                "lmp_system_energy_price",
                "updated_at",
            ]
        )
    rows["date"] = pd.to_datetime(rows["date"], errors="coerce").dt.date
    rows["hour_ending"] = pd.to_numeric(rows["hour_ending"], errors="coerce").astype(int)
    rows["lmp"] = pd.to_numeric(rows["lmp"], errors="coerce")
    rows["lmp_system_energy_price"] = pd.to_numeric(
        rows["lmp_system_energy_price"],
        errors="coerce",
    )
    rows["updated_at"] = pd.to_datetime(rows["updated_at"], errors="coerce")
    return rows.reset_index(drop=True)


def actuals_hourly(actuals: pd.DataFrame) -> dict[int, float] | None:
    """Convert an actuals frame to {hour_ending: lmp}, or None when empty."""
    if actuals.empty:
        return None
    out: dict[int, float] = {}
    for row in actuals.itertuples(index=False):
        if pd.notna(row.lmp):
            out[int(row.hour_ending)] = float(row.lmp)
    return out or None


def first_timestamp(df: pd.DataFrame, columns: Iterable[str]) -> pd.Timestamp | None:
    """Return the first non-null timestamp from the requested columns."""
    for column in columns:
        if column not in df.columns:
            continue
        values = pd.to_datetime(df[column], errors="coerce").dropna()
        if not values.empty:
            return pd.Timestamp(values.iloc[0])
    return None
