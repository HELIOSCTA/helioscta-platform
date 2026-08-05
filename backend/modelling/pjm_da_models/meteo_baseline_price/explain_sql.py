"""EXPLAIN helpers for backend Meteologica DA-price SQL inputs."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterable

if __package__ in (None, ""):
    _MODULE_DIR = Path(__file__).resolve().parent
    _REPO_ROOT = _MODULE_DIR.parents[3]
    if str(_REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(_REPO_ROOT))
    from backend.modelling.pjm_da_models.db import connect  # type: ignore[import-not-found]
    from backend.modelling.pjm_da_models.runtime import (  # type: ignore[import-not-found]
        default_cutoff_utc,
        read_sql_input,
    )
else:
    from ..db import connect
    from ..runtime import default_cutoff_utc, read_sql_input

DEFAULT_TARGET_DATE = "2026-07-25"
DEFAULT_RUN_DATE = "2026-07-24"
DEFAULT_HUB = "WESTERN HUB"
PLAN_KEYWORDS = (
    "Index Scan",
    "Index Only Scan",
    "Bitmap Index Scan",
    "Seq Scan",
    "Execution Time",
    "Planning Time",
    "Buffers",
    "Rows Removed",
)


def _print_plan(name: str, lines: Iterable[str], *, verbose: bool) -> None:
    print()
    print(f"--- {name} ---")
    for line in lines:
        if verbose or any(keyword in line for keyword in PLAN_KEYWORDS):
            print(line)


def explain_query(
    *,
    name: str,
    sql_file: str,
    params: dict[str, object] | tuple[object, ...],
    verbose: bool = False,
) -> None:
    """Print EXPLAIN ANALYZE output for one promoted SQL artifact."""
    connection = connect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "explain (analyze, buffers, format text) " + read_sql_input(sql_file),
                params,
            )
            _print_plan(name, (row[0] for row in cursor.fetchall()), verbose=verbose)
    finally:
        connection.close()


def run_explain(
    *,
    target_date: str = DEFAULT_TARGET_DATE,
    run_date: str = DEFAULT_RUN_DATE,
    cutoff_utc: str | None = None,
    lead_days: int | None = 1,
    hub: str = DEFAULT_HUB,
    available_limit: int = 60,
    verbose: bool = False,
) -> None:
    """Run repeatable speed checks for the promoted SQL artifacts."""
    resolved_cutoff_utc = cutoff_utc or default_cutoff_utc(run_date)
    explain_query(
        name="forecast",
        sql_file="meteo_da_price_forecast_hourly.sql",
        params={
            "target_date": target_date,
            "cutoff_utc": resolved_cutoff_utc,
            "lead_days": lead_days,
        },
        verbose=verbose,
    )
    explain_query(
        name="actuals",
        sql_file="actual_da_lmps_hourly.sql",
        params={
            "target_date": target_date,
            "hub": hub,
        },
        verbose=verbose,
    )
    explain_query(
        name="available_dates",
        sql_file="available_target_dates.sql",
        params={
            "start_date": run_date,
            "cutoff_utc": resolved_cutoff_utc,
            "limit": available_limit,
        },
        verbose=verbose,
    )


if __name__ == "__main__":
    from backend.modelling.pjm_da_models._entrypoint import run_entrypoint

    run_entrypoint(
        name="pjm_da_meteo_baseline_price_explain",
        module_file=__file__,
        runner=run_explain,
    )
