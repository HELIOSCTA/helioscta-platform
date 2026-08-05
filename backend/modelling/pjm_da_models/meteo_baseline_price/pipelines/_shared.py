"""Shared implementation for direct-read Meteologica DA price pipelines."""

from __future__ import annotations

import sys
import uuid
from datetime import date, timedelta

import pandas as pd

from ...logging_utils import init_logging, print_divider, print_header
from ...runtime import DEFAULT_LOG_DIR
from .. import loader
from ..tables import (
    build_bands_vs_actuals,
    build_bands_table,
    build_dispersion_table,
    build_forecast_vs_actuals,
    build_members_table,
    compute_dispersion_metrics,
    onpeak_value,
    print_bands_section,
    print_bands_vs_actuals_section,
    print_config,
    print_forecast_vs_actuals_section,
    print_frame,
)

DEFAULT_HUB = "WESTERN HUB"
DEFAULT_LEAD_DAYS = 1


def _resolve_date(value: date | str | None, *, default: date) -> date:
    if value is None:
        return default
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _first_timestamp(df: pd.DataFrame, column: str) -> pd.Timestamp | None:
    if column not in df.columns:
        return None
    values = pd.to_datetime(df[column], errors="coerce").dropna()
    if values.empty:
        return None
    return pd.Timestamp(values.iloc[0])


def run_single_day(
    *,
    target_date: date | str | None = None,
    run_date: date | str | None = None,
    hub: str = DEFAULT_HUB,
    cutoff_utc: str | None = None,
    lead_days: int | None = DEFAULT_LEAD_DAYS,
    include_actuals: bool = True,
    quiet: bool = False,
) -> dict[str, object]:
    """Run the baseline for one delivery date using direct helios_prod reads.

    Defaults to tomorrow with an active 10:00 EPT DA cutoff. Pass lead_days=1
    to emulate the old DA-cutoff cache-loader vintage.
    """
    default_run_date = loader.today_ept()
    resolved_target = _resolve_date(
        target_date,
        default=default_run_date + timedelta(days=1),
    )
    resolved_run_date = _resolve_date(run_date, default=default_run_date)
    if cutoff_utc:
        resolved_cutoff_utc = cutoff_utc
    elif run_date is None and lead_days is not None:
        resolved_cutoff_utc = loader.default_cutoff_utc(
            resolved_target - timedelta(days=int(lead_days))
        )
    else:
        resolved_cutoff_utc = loader.default_cutoff_utc(resolved_run_date)
    run_id = str(uuid.uuid4())

    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")

    logger = init_logging(
        name="baseline_meteo_da_price",
        log_dir=DEFAULT_LOG_DIR,
        log_to_file=False,
        log_to_console=not quiet,
    )
    try:
        with logger.timer("load Meteologica DA-price forecast"):
            forecast = loader.load_meteologica_da_price_forecast(
                target_date=resolved_target,
                cutoff_utc=resolved_cutoff_utc,
                lead_days=lead_days,
            )

        det_exec = _first_timestamp(forecast, "det_forecast_execution_datetime_local")
        ens_exec = _first_timestamp(forecast, "ens_forecast_execution_datetime_local")

        actuals = pd.DataFrame()
        actuals_by_hour = None
        if include_actuals and not forecast.empty:
            with logger.timer(f"load settled DA LMP at {hub}"):
                actuals = loader.load_actual_da_lmps(target_date=resolved_target, hub=hub)
            actuals_by_hour = loader.actuals_hourly(actuals)

        bands_table = build_bands_table(resolved_target, forecast)
        forecast_vs_actuals = build_forecast_vs_actuals(
            resolved_target,
            forecast,
            actuals_by_hour,
        )
        bands_vs_actuals = build_bands_vs_actuals(
            resolved_target,
            forecast,
            actuals_by_hour,
        )
        members_table = build_members_table(resolved_target, forecast)
        dispersion_metrics = compute_dispersion_metrics(forecast)
        dispersion_table = build_dispersion_table(resolved_target, dispersion_metrics)

        if not quiet:
            print_header(
                f"BASELINE METEO DA-PRICE \u2014 {hub} ($/MWh)  |  {resolved_target}",
                "=",
                120,
            )
            print_config(resolved_target, hub, lead_days, det_exec, ens_exec)

            if forecast.empty:
                logger.warning(
                    f"No Meteologica DA-price forecast for {resolved_target} "
                    f"(lead_days={lead_days}). Tables are empty."
                )
            else:
                logger.info(
                    f"forecast rows: {len(forecast)} | "
                    f"actuals: {'yes' if actuals_by_hour else 'no'}"
                )

            print_bands_section(resolved_target, bands_table, dispersion_metrics)

            if actuals_by_hour is not None:
                print_forecast_vs_actuals_section(resolved_target, forecast_vs_actuals)
                print_bands_vs_actuals_section(resolved_target, bands_vs_actuals)

            print()
            print_divider("=", 120, dim=False)
            print()

        return {
            "run_id": run_id,
            "forecast_date": resolved_target.isoformat(),
            "target_date": resolved_target.isoformat(),
            "run_date": resolved_run_date.isoformat(),
            "hub": hub,
            "cutoff_utc": resolved_cutoff_utc,
            "lead_days": lead_days,
            "det_forecast_executed": det_exec,
            "ens_forecast_executed": ens_exec,
            "det_forecast_execution_datetime_local": det_exec,
            "ens_forecast_execution_datetime_local": ens_exec,
            "df_forecast": forecast,
            "forecast": forecast,
            "actuals": actuals,
            "bands_table": bands_table,
            "forecast_vs_actuals": forecast_vs_actuals,
            "bands_vs_actuals": bands_vs_actuals,
            "members_table": members_table,
            "dispersion_metrics": dispersion_metrics,
            "dispersion_table": dispersion_table,
            "headline_onpeak": onpeak_value(bands_table, "Det"),
            "has_actuals": actuals_by_hour is not None,
        }
    finally:
        logger.close()


def run_latest_horizon(
    *,
    run_date: date | str | None = None,
    horizon_days: int | None = 14,
    hub: str = DEFAULT_HUB,
    cutoff_utc: str | None = None,
    quiet: bool = False,
) -> dict[str, object]:
    """Run the baseline summary for the latest forward horizon.

    Pass horizon_days=None to use the full prediction window currently
    available from the promoted Meteologica input SQL.
    """
    resolved_run_date = _resolve_date(run_date, default=loader.today_ept())
    resolved_cutoff_utc = cutoff_utc or loader.default_cutoff_utc(resolved_run_date)
    start_date = resolved_run_date + timedelta(days=1)
    available_limit = 60 if horizon_days is None else horizon_days
    target_dates = loader.available_target_dates(
        start_date=start_date,
        cutoff_utc=resolved_cutoff_utc,
        limit=available_limit,
    )

    rows: list[dict[str, object]] = []
    results: list[dict[str, object]] = []
    for target in target_dates:
        result = run_single_day(
            target_date=target,
            run_date=resolved_run_date,
            hub=hub,
            cutoff_utc=resolved_cutoff_utc,
            lead_days=None,
            include_actuals=False,
            quiet=True,
        )
        bands = result["bands_table"]
        assert isinstance(bands, pd.DataFrame)
        lead = (target - resolved_run_date).days
        rows.append(
            {
                "target_date": target.isoformat(),
                "lead_days": lead,
                "det_onpeak": onpeak_value(bands, "Det"),
                "ens_avg_onpeak": onpeak_value(bands, "ENS Avg"),
                "ens_bottom_onpeak": onpeak_value(bands, "ENS Bottom"),
                "ens_top_onpeak": onpeak_value(bands, "ENS Top"),
                "det_issue_local": result["det_forecast_execution_datetime_local"],
                "ens_issue_local": result["ens_forecast_execution_datetime_local"],
            }
        )
        results.append(result)

    summary = pd.DataFrame(rows)
    if not quiet:
        window_label = (
            "FULL PREDICTION WINDOW"
            if horizon_days is None
            else f"NEXT {horizon_days} DAYS"
        )
        print(
            f"BASELINE METEO DA PRICE {window_label} | "
            f"{hub} | run_date {resolved_run_date}"
        )
        print(f"cutoff_utc: {resolved_cutoff_utc}")
        print(f"target_dates: {len(target_dates)}")
        print_frame("Forward OnPeak Summary", summary)

    return {
        "run_date": resolved_run_date.isoformat(),
        "hub": hub,
        "cutoff_utc": resolved_cutoff_utc,
        "horizon_days_requested": horizon_days,
        "prediction_window_days": len(target_dates),
        "target_dates": [target.isoformat() for target in target_dates],
        "summary_table": summary,
        "results": results,
    }
