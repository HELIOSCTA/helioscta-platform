"""PJM-owned terminal printer for the old KNN Sunny single-day report."""

from __future__ import annotations

from datetime import date

import pandas as pd

from ...logging_utils import print_divider, print_header
from ...reporting import print_frame
from .. import configs
from .. import reporting as knn_reporting


def _resolve_config(
    *,
    result: dict[str, object],
    target_date: date,
    hub: str,
) -> configs.KnnModelConfig:
    config = result.get("config")
    if isinstance(config, configs.KnnModelConfig):
        return config
    return configs.KnnModelConfig(forecast_date=target_date.isoformat(), hub=hub)


def print_single_day_report(
    logger,
    *,
    title: str,
    target_date: date,
    run_date: date,
    hub: str,
    cutoff_utc: str,
    history_days: int,
    pool: pd.DataFrame,
    query: pd.DataFrame,
    result: dict[str, object],
) -> None:
    config = _resolve_config(result=result, target_date=target_date, hub=hub)
    logger.info(title)
    logger.info(
        f"run_date={run_date} | cutoff_utc={cutoff_utc} | "
        f"history_days={history_days:,} | pool_rows={result['n_pool']:,} | "
        f"analog_rows={len(result['analogs']):,}"
    )
    if not result["features_complete"]:
        logger.warning(f"Target feature set is incomplete for {target_date}.")

    print_header("FORECAST CONFIGURATION", "=", 90)
    print_frame(
        "Configuration",
        knn_reporting.build_config_table(
            target_date=target_date,
            run_date=run_date,
            cutoff_utc=cutoff_utc,
            config=config,
            history_days=history_days,
            features_complete=bool(result["features_complete"]),
        ),
    )
    print_frame(
        "Feature Group Weights",
        knn_reporting.build_feature_weights_table(
            config=config,
            effective_weights=(
                result.get("feature_weights")
                if isinstance(result.get("feature_weights"), dict)
                else None
            ),
        ),
    )
    print_divider("=", 90, dim=False)

    print_header("POOL SUMMARY", "=", 110)
    print_frame(
        "Pool Summary",
        knn_reporting.build_pool_summary_table(
            pool=pool,
            analogs=result["analogs"],
            config=config,
            target_date=target_date,
        ),
    )
    print_divider("=", 110, dim=False)

    print_header("LIKE-DAY ANALOGS - Daily Features + Engine View", "=", 120)
    print_frame(
        "Like-Day Analogs",
        knn_reporting.build_analog_features_table(
            analogs=result["analogs"],
            pool=pool,
            query=query,
            target_date=target_date,
        ),
    )

    print_header(f"DA LMP LIKE-DAY FORECAST - {hub} ($/MWh)", "=", 120)
    print_frame("Forecast", result["output_table"])
    metrics = result.get("metrics")
    if isinstance(metrics, dict) and metrics:
        print_frame("Forecast Metrics", knn_reporting.build_metrics_table(metrics))
    print_divider("=", 120, dim=False)

    print()
    print("  Quantile Bands ($/MWh)")
    print_frame("Quantile Bands", result["quantiles_table"])
    print_frame("Analog Match LMPs", knn_reporting.build_analog_lmp_table(result["analogs"]))
    print_frame("Analog Match Dates", knn_reporting.build_analog_date_table(result["analogs"]))
