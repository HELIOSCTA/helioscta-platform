"""Shared implementation for direct-read Meteologica DA price pipelines."""

from __future__ import annotations

import sys
import uuid
from datetime import date, timedelta

import pandas as pd

from ...logging_utils import init_logging, print_divider, print_header
from ...result_envelope import (
    build_result_envelope,
    canonical_log_name,
    horizon_name_for_days,
    max_timestamp,
)
from ...runtime import DEFAULT_LOG_DIR
from .. import loader
from ..tables import (
    build_bands_table,
    build_bands_vs_actuals,
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

MODEL_FAMILY = "meteo_baseline_price"
MODEL_NAME = "meteologica_da_price_baseline"
INPUT_FAMILY = "meteo_da_price"
DEFAULT_HUB = "WESTERN HUB"
DEFAULT_LEAD_DAYS = 1


def _logger_name(horizon: str) -> str:
    return canonical_log_name(MODEL_FAMILY, INPUT_FAMILY, horizon)


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


def _timestamp_iso(value: pd.Timestamp | None) -> str | None:
    return value.isoformat() if value is not None else None


def _configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")


def _features_complete(forecast: pd.DataFrame) -> bool:
    required = (
        "da_price_deterministic",
        "da_price_ens_average",
        "da_price_ens_bottom",
        "da_price_ens_top",
    )
    if len(forecast) < 24:
        return False
    return all(
        column in forecast.columns and not forecast[column].isna().any()
        for column in required
    )


def _resolve_single_params(
    *,
    target_date: date | str | None,
    run_date: date | str | None,
    cutoff_utc: str | None,
    lead_days: int | None,
) -> tuple[date, date, str]:
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
    return resolved_target, resolved_run_date, resolved_cutoff_utc


def _run_single_day_result(
    *,
    logger,
    horizon: str,
    target_date: date,
    run_date: date,
    hub: str,
    cutoff_utc: str,
    lead_days: int | None,
    include_actuals: bool,
    quiet: bool,
) -> dict[str, object]:
    run_id = str(uuid.uuid4())

    with logger.timer("load source inputs"):
        forecast = loader.load_meteologica_da_price_forecast(
            target_date=target_date,
            cutoff_utc=cutoff_utc,
            lead_days=lead_days,
        )
        det_exec = _first_timestamp(forecast, "det_forecast_execution_datetime_local")
        ens_exec = _first_timestamp(forecast, "ens_forecast_execution_datetime_local")

    actuals = pd.DataFrame()
    actuals_by_hour = None
    if include_actuals and not forecast.empty:
        with logger.timer("load actuals"):
            actuals = loader.load_actual_da_lmps(target_date=target_date, hub=hub)
            actuals_by_hour = loader.actuals_hourly(actuals)

    with logger.timer("run model"):
        dispersion_metrics = compute_dispersion_metrics(forecast)

    with logger.timer("build outputs"):
        bands_table = build_bands_table(target_date, forecast)
        forecast_vs_actuals = build_forecast_vs_actuals(
            target_date,
            forecast,
            actuals_by_hour,
        )
        bands_vs_actuals = build_bands_vs_actuals(
            target_date,
            forecast,
            actuals_by_hour,
        )
        members_table = build_members_table(target_date, forecast)
        dispersion_table = build_dispersion_table(target_date, dispersion_metrics)

    features_complete = _features_complete(forecast)
    has_actuals = actuals_by_hour is not None
    warnings: list[str] = []
    if forecast.empty:
        warnings.append(
            f"No Meteologica DA-price forecast for {target_date} "
            f"(lead_days={lead_days})."
        )
    elif not features_complete:
        warnings.append(f"Forecast source rows are incomplete for {target_date}.")

    if not quiet:
        with logger.timer("print report"):
            print_header(
                f"BASELINE METEO DA-PRICE - {hub} ($/MWh)  |  {target_date}",
                "=",
                120,
            )
            print_config(target_date, hub, lead_days, det_exec, ens_exec)

            if forecast.empty:
                logger.warning(warnings[-1])
            else:
                logger.info(
                    f"forecast rows: {len(forecast)} | "
                    f"actuals: {'yes' if actuals_by_hour else 'no'}"
                )

            print_bands_section(target_date, bands_table, dispersion_metrics)

            if actuals_by_hour is not None:
                print_forecast_vs_actuals_section(target_date, forecast_vs_actuals)
                print_bands_vs_actuals_section(target_date, bands_vs_actuals)

            print()
            print_divider("=", 120, dim=False)
            print()

    tables = {
        "forecast": forecast,
        "actuals": actuals,
        "bands": bands_table,
        "forecast_vs_actuals": forecast_vs_actuals,
        "ens_vs_actuals": bands_vs_actuals,
        "members": members_table,
        "dispersion": dispersion_table,
    }
    status = {
        "row_counts": {
            "forecast_rows": len(forecast),
            "actual_rows": len(actuals),
            "bands_rows": len(bands_table),
            "forecast_vs_actuals_rows": len(forecast_vs_actuals),
        },
        "has_actuals": has_actuals,
        "features_complete": features_complete,
        "warnings": warnings,
    }
    diagnostics = {
        "source_freshness": {
            "det_forecast_execution_datetime_local": _timestamp_iso(det_exec),
            "ens_forecast_execution_datetime_local": _timestamp_iso(ens_exec),
            "actuals_updated_at": max_timestamp(actuals, "updated_at"),
        },
        "settings": {
            "lead_days": lead_days,
        },
    }
    aliases = {
        "forecast_date": target_date.isoformat(),
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
        "has_actuals": has_actuals,
    }
    return build_result_envelope(
        model_family=MODEL_FAMILY,
        model_name=MODEL_NAME,
        input_family=INPUT_FAMILY,
        horizon=horizon,
        run_id=run_id,
        run_date=run_date,
        target_date=target_date,
        target_dates=(target_date,),
        hub=hub,
        cutoff_utc=cutoff_utc,
        include_actuals=include_actuals,
        tables=tables,
        status=status,
        diagnostics=diagnostics,
        aliases=aliases,
    )


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
    _configure_stdio()
    horizon = "tomorrow"
    logger = init_logging(
        name=_logger_name(horizon),
        log_dir=DEFAULT_LOG_DIR,
        log_to_file=False,
        log_to_console=not quiet,
    )
    try:
        with logger.timer("resolve params"):
            resolved_target, resolved_run_date, resolved_cutoff_utc = _resolve_single_params(
                target_date=target_date,
                run_date=run_date,
                cutoff_utc=cutoff_utc,
                lead_days=lead_days,
            )
        with logger.timer("resolve target dates"):
            target_dates = [resolved_target]
        return _run_single_day_result(
            logger=logger,
            horizon=horizon,
            target_date=target_dates[0],
            run_date=resolved_run_date,
            hub=hub,
            cutoff_utc=resolved_cutoff_utc,
            lead_days=lead_days,
            include_actuals=include_actuals,
            quiet=quiet,
        )
    finally:
        logger.close()


def run_latest_horizon(
    *,
    run_date: date | str | None = None,
    horizon_days: int | None = 14,
    hub: str = DEFAULT_HUB,
    cutoff_utc: str | None = None,
    include_actuals: bool = False,
    quiet: bool = False,
) -> dict[str, object]:
    """Run the baseline summary for the latest forward horizon.

    Pass horizon_days=None to use the full prediction window currently
    available from the promoted Meteologica input SQL.
    """
    _configure_stdio()
    horizon = horizon_name_for_days(horizon_days)
    logger = init_logging(
        name=_logger_name(horizon),
        log_dir=DEFAULT_LOG_DIR,
        log_to_file=False,
        log_to_console=not quiet,
    )
    try:
        with logger.timer("resolve params"):
            resolved_run_date = _resolve_date(run_date, default=loader.today_ept())
            resolved_cutoff_utc = cutoff_utc or loader.default_cutoff_utc(resolved_run_date)
            start_date = resolved_run_date + timedelta(days=1)
            available_limit = 60 if horizon_days is None else horizon_days

        with logger.timer("resolve target dates"):
            target_dates = loader.available_target_dates(
                start_date=start_date,
                cutoff_utc=resolved_cutoff_utc,
                limit=available_limit,
            )

        rows: list[dict[str, object]] = []
        results: list[dict[str, object]] = []
        with logger.timer("load source inputs"):
            for target in target_dates:
                result = _run_single_day_result(
                    logger=logger,
                    horizon="tomorrow",
                    target_date=target,
                    run_date=resolved_run_date,
                    hub=hub,
                    cutoff_utc=resolved_cutoff_utc,
                    lead_days=None,
                    include_actuals=include_actuals,
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
                        "det_issue_local": result[
                            "det_forecast_execution_datetime_local"
                        ],
                        "ens_issue_local": result[
                            "ens_forecast_execution_datetime_local"
                        ],
                    }
                )
                results.append(result)

        with logger.timer("build outputs"):
            summary = pd.DataFrame(rows)

        if not quiet:
            with logger.timer("print report"):
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

        features_by_date = {
            str(result["target_date"]): bool(result["status"]["features_complete"])
            for result in results
        }
        actuals_by_date = {
            str(result["target_date"]): bool(result["status"]["has_actuals"])
            for result in results
        }
        features_complete = all(features_by_date.values()) if features_by_date else False
        has_actuals = any(actuals_by_date.values())
        warnings = []
        if not target_dates:
            warnings.append("No available target dates found for the requested horizon.")

        tables = {"summary": summary}
        status = {
            "row_counts": {
                "target_dates": len(target_dates),
                "summary_rows": len(summary),
            },
            "has_actuals": has_actuals,
            "features_complete": features_complete,
            "warnings": warnings,
        }
        diagnostics = {
            "settings": {
                "horizon_days_requested": horizon_days,
                "prediction_window_days": len(target_dates),
            },
            "features_complete_by_date": features_by_date,
            "has_actuals_by_date": actuals_by_date,
            "per_day_run_ids": [str(result["run_id"]) for result in results],
        }
        aliases = {
            "horizon_days_requested": horizon_days,
            "prediction_window_days": len(target_dates),
            "summary_table": summary,
            "results": results,
        }
        return build_result_envelope(
            model_family=MODEL_FAMILY,
            model_name=MODEL_NAME,
            input_family=INPUT_FAMILY,
            horizon=horizon,
            run_id=str(uuid.uuid4()),
            run_date=resolved_run_date,
            target_date=None,
            target_dates=target_dates,
            hub=hub,
            cutoff_utc=resolved_cutoff_utc,
            include_actuals=include_actuals,
            tables=tables,
            status=status,
            diagnostics=diagnostics,
            aliases=aliases,
        )
    finally:
        logger.close()
