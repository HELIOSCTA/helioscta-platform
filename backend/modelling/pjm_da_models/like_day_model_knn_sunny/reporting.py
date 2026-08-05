"""Native report builders for promoted KNN Sunny pipelines."""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd

from ..logging_utils import print_divider, print_header
from ..reporting import (
    build_analog_date_table,
    build_analog_lmp_table,
    print_frame,
)
from . import configs


_FEATURE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("da_onpk", "DA OnPk"),
    ("load", "Load"),
    ("temp", "Temp"),
    ("solar", "Solar"),
    ("wind", "Wind"),
    ("outages", "Outages"),
    ("m3", "M3"),
)


def build_config_table(
    *,
    target_date: date,
    run_date: date,
    cutoff_utc: str,
    config: configs.KnnModelConfig,
    history_days: int,
    features_complete: bool,
) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {"Field": "Target", "Value": f"{target_date} ({target_date.strftime('%a')})"},
            {"Field": "Run Date", "Value": str(run_date)},
            {"Field": "Cutoff UTC", "Value": cutoff_utc},
            {"Field": "Day Type", "Value": config.with_day_type_overrides(target_date)[1]},
            {"Field": "Hub", "Value": config.hub},
            {"Field": "Spec", "Value": config.model_name},
            {"Field": "N Analogs", "Value": config.n_analogs},
            {"Field": "History Days", "Value": history_days},
            {"Field": "Season Window Days", "Value": config.season_window_days},
            {"Field": "Min Pool Size", "Value": config.min_pool_size},
            {"Field": "Same DOW Group", "Value": config.same_dow_group},
            {"Field": "Same Weekend Group", "Value": config.same_weekend_group},
            {"Field": "Exclude Holidays", "Value": config.exclude_holidays},
            {"Field": "Half-Life Days", "Value": config.recency_half_life_days},
            {"Field": "Label Source", "Value": config.label_source},
            {"Field": "Features Complete", "Value": features_complete},
        ]
    )


def build_feature_weights_table(
    *,
    config: configs.KnnModelConfig,
    effective_weights: dict[str, float] | None,
) -> pd.DataFrame:
    spec = config.resolved_spec()
    weights = effective_weights or spec.feature_group_weights
    rows: list[dict[str, object]] = []
    for group, raw_weight in sorted(
        spec.raw_feature_group_weights.items(),
        key=lambda item: -float(weights.get(item[0], 0.0)),
    ):
        rows.append(
            {
                "Group": group,
                "Raw": float(raw_weight),
                "Norm": float(weights.get(group, 0.0)),
                "Columns": ", ".join(spec.feature_groups.get(group, [])),
            }
        )
    return pd.DataFrame(rows)


def build_pool_summary_table(
    *,
    pool: pd.DataFrame,
    analogs: pd.DataFrame,
    config: configs.KnnModelConfig,
    target_date: date,
) -> pd.DataFrame:
    if pool.empty:
        return pd.DataFrame(columns=["Stage", "Filter", "Detail", "Survives"])

    pool_dates = pd.to_datetime(pool["date"], errors="coerce").dt.date
    raw_dates = int(pool_dates.nunique())
    pre_target = pool.loc[pool_dates < target_date]
    pre_target_dates = int(pd.to_datetime(pre_target["date"], errors="coerce").dt.date.nunique())

    target_doy = pd.Timestamp(target_date).dayofyear
    if pre_target.empty or config.season_window_days <= 0:
        season_dates = pre_target_dates
    else:
        doy = pd.to_datetime(pre_target["date"], errors="coerce").dt.dayofyear.to_numpy(dtype=float)
        direct = np.abs(doy - float(target_doy))
        circular = np.minimum(direct, 366.0 - direct)
        season_dates = int(
            pd.to_datetime(pre_target.loc[circular <= config.season_window_days, "date"], errors="coerce")
            .dt.date
            .nunique()
        )

    rows: list[dict[str, object]] = [
        {
            "Stage": 0,
            "Filter": "raw history",
            "Detail": f"{len(pool):,} rows",
            "Survives": raw_dates,
        },
        {
            "Stage": 1,
            "Filter": "chronological cut",
            "Detail": f"date < target ({target_date})",
            "Survives": pre_target_dates,
        },
        {
            "Stage": 2,
            "Filter": "season window",
            "Detail": f"+/-{config.season_window_days}d",
            "Survives": season_dates,
        },
    ]

    if not analogs.empty:
        per_hour = analogs.groupby("hour_ending")["date"].nunique()
        rows.append(
            {
                "Stage": "Final",
                "Filter": "selected analogs",
                "Detail": (
                    f"per HE min={int(per_hour.min())}, "
                    f"median={int(per_hour.median())}, max={int(per_hour.max())}"
                ),
                "Survives": int(analogs["date"].nunique()),
            }
        )
    return pd.DataFrame(rows)


def _daily_features_long(pool: pd.DataFrame) -> pd.DataFrame:
    if pool.empty or "date" not in pool.columns:
        return pd.DataFrame()

    dates = pd.Index(sorted(pd.to_datetime(pool["date"], errors="coerce").dt.date.dropna().unique()), name="date")
    output = pd.DataFrame(index=dates)
    grouped = pool.groupby("date", sort=True)
    if "lmp" in pool.columns:
        onpeak = pool[pool["hour_ending"].between(8, 23, inclusive="both")].groupby("date")["lmp"].mean()
        output["da_onpk"] = onpeak
    if "load_mw_at_hour" in pool.columns:
        output["load"] = grouped["load_mw_at_hour"].max()
    if "temp_at_hour" in pool.columns:
        output["temp"] = grouped["temp_at_hour"].mean()
    if "solar_at_hour" in pool.columns:
        output["solar"] = grouped["solar_at_hour"].max()
    if "wind_at_hour" in pool.columns:
        output["wind"] = grouped["wind_at_hour"].max()
    if "outage_total_mw" in pool.columns:
        output["outages"] = grouped["outage_total_mw"].first()
    if "gas_m3_daily_avg" in pool.columns:
        output["m3"] = grouped["gas_m3_daily_avg"].first()
    return output


def _daily_features_from_query(query: pd.DataFrame) -> dict[str, float | None]:
    def _max(column: str) -> float | None:
        if column not in query.columns:
            return None
        values = pd.to_numeric(query[column], errors="coerce").dropna()
        return float(values.max()) if not values.empty else None

    def _mean(column: str) -> float | None:
        if column not in query.columns:
            return None
        values = pd.to_numeric(query[column], errors="coerce").dropna()
        return float(values.mean()) if not values.empty else None

    def _scalar(column: str) -> float | None:
        if column not in query.columns:
            return None
        values = pd.to_numeric(query[column], errors="coerce").dropna()
        return float(values.iloc[0]) if not values.empty else None

    return {
        "da_onpk": None,
        "load": _max("load_mw_at_hour"),
        "temp": _mean("temp_at_hour"),
        "solar": _max("solar_at_hour"),
        "wind": _max("wind_at_hour"),
        "outages": _scalar("outage_total_mw"),
        "m3": _scalar("gas_m3_daily_avg"),
    }


def build_analog_features_table(
    *,
    analogs: pd.DataFrame,
    pool: pd.DataFrame,
    query: pd.DataFrame,
    target_date: date,
    max_rows: int = 20,
    rank_hours: tuple[int, ...] = configs.ANALOG_RANK_HOURS,
) -> pd.DataFrame:
    columns = [
        "Rank",
        "Like Date",
        "Mean Distance",
        "Sum Weight",
        "Weight",
        "HEs",
        *[label for _, label in _FEATURE_COLUMNS],
    ]
    if analogs.empty:
        return pd.DataFrame(columns=columns)

    rank_analogs = analogs[analogs["hour_ending"].astype(int).isin(rank_hours)]
    if rank_analogs.empty:
        return pd.DataFrame(columns=columns)

    by_date = (
        rank_analogs.groupby("date", as_index=False)
        .agg(summed_weight=("weight", "sum"), mean_distance=("distance", "mean"), n_hours=("hour_ending", "nunique"))
        .sort_values("summed_weight", ascending=False)
        .reset_index(drop=True)
    )
    total_weight = float(by_date["summed_weight"].sum())
    by_date["weight"] = by_date["summed_weight"] / total_weight if total_weight > 0 else 0.0

    daily = _daily_features_long(pool)
    target_features = _daily_features_from_query(query)
    if target_features["da_onpk"] is None and target_date in daily.index:
        value = daily.loc[target_date, "da_onpk"]
        target_features["da_onpk"] = float(value) if pd.notna(value) else None

    rows: list[dict[str, object]] = [
        {
            "Rank": "Target",
            "Like Date": str(target_date),
            "Mean Distance": None,
            "Sum Weight": None,
            "Weight": None,
            "HEs": None,
            **{label: target_features[key] for key, label in _FEATURE_COLUMNS},
        }
    ]

    weighted_avg = {key: 0.0 for key, _ in _FEATURE_COLUMNS}
    weighted_seen = {key: 0.0 for key, _ in _FEATURE_COLUMNS}
    for rank, row in enumerate(by_date.head(max_rows).itertuples(index=False), start=1):
        like_date = row.date
        features = {
            key: (
                float(daily.loc[like_date, key])
                if like_date in daily.index and key in daily.columns and pd.notna(daily.loc[like_date, key])
                else None
            )
            for key, _ in _FEATURE_COLUMNS
        }
        weight = float(row.weight)
        for key, value in features.items():
            if value is not None:
                weighted_avg[key] += value * weight
                weighted_seen[key] += weight
        rows.append(
            {
                "Rank": rank,
                "Like Date": str(like_date),
                "Mean Distance": float(row.mean_distance),
                "Sum Weight": float(row.summed_weight),
                "Weight": weight,
                "HEs": int(row.n_hours),
                **{label: features[key] for key, label in _FEATURE_COLUMNS},
            }
        )

    avg_features = {
        key: (weighted_avg[key] / weighted_seen[key] if weighted_seen[key] > 0 else None)
        for key, _ in _FEATURE_COLUMNS
    }
    rows.append(
        {
            "Rank": "Avg",
            "Like Date": "Like-Day Avg (wtd)",
            "Mean Distance": None,
            "Sum Weight": total_weight,
            "Weight": 1.0,
            "HEs": None,
            **{label: avg_features[key] for key, label in _FEATURE_COLUMNS},
        }
    )
    return pd.DataFrame(rows, columns=columns)


def build_metrics_table(metrics: dict[str, float]) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    mapping = (
        ("mae", "MAE ($/MWh)", 1.0),
        ("rmse", "RMSE ($/MWh)", 1.0),
        ("mape", "MAPE (%)", 1.0),
        ("rmae", "rMAE vs Last Week", 1.0),
        ("coverage_80pct", "80% PI Coverage (%)", 100.0),
        ("coverage_90pct", "90% PI Coverage (%)", 100.0),
        ("coverage_98pct", "98% PI Coverage (%)", 100.0),
        ("sharpness_90pct", "90% PI Width ($/MWh)", 1.0),
        ("crps", "CRPS", 1.0),
    )
    for key, label, scale in mapping:
        if key in metrics and metrics[key] is not None:
            rows.append({"Metric": label, "Value": float(metrics[key]) * scale})
    return pd.DataFrame(rows)


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
    config = result.get("config")
    if not isinstance(config, configs.KnnModelConfig):
        config = configs.KnnModelConfig(forecast_date=target_date.isoformat(), hub=hub)

    print_header(title, "=", 120)
    logger.info(
        f"run_date={run_date} | cutoff_utc={cutoff_utc} | "
        f"history_days={history_days:,} | pool_rows={result['n_pool']:,} | "
        f"analog_rows={len(result['analogs']):,}"
    )
    if not result["features_complete"]:
        logger.warning(f"Target feature set is incomplete for {target_date}.")

    print_frame(
        "Forecast Configuration",
        build_config_table(
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
        build_feature_weights_table(
            config=config,
            effective_weights=result.get("feature_weights") if isinstance(result.get("feature_weights"), dict) else None,
        ),
    )
    print_frame(
        "Pool Summary",
        build_pool_summary_table(
            pool=pool,
            analogs=result["analogs"],
            config=config,
            target_date=target_date,
        ),
    )
    print_frame(
        "Like-Day Analogs - Daily Features + Engine View",
        build_analog_features_table(
            analogs=result["analogs"],
            pool=pool,
            query=query,
            target_date=target_date,
        ),
    )
    print_frame(
        f"DA LMP Like-Day Forecast - {hub} ($/MWh)",
        result["output_table"],
    )
    metrics = result.get("metrics")
    if isinstance(metrics, dict) and metrics:
        print_frame("Forecast Metrics", build_metrics_table(metrics))
    print_frame("Quantile Bands ($/MWh)", result["quantiles_table"])
    print_frame("Analog Match LMPs ($/MWh)", build_analog_lmp_table(result["analogs"]))
    print_frame("Analog Match Dates", build_analog_date_table(result["analogs"]))
    print()
    print_divider("=", 120, dim=False)
    print()


def print_horizon_report(
    logger,
    *,
    title: str,
    run_date: date,
    hub: str,
    cutoff_utc: str,
    pool_rows: int,
    target_dates: list[date],
    strip_table: pd.DataFrame,
) -> None:
    print_header(title, "=", 120)
    logger.info(
        f"run_date={run_date} | cutoff_utc={cutoff_utc} | "
        f"target_dates={len(target_dates)} | pool_rows={pool_rows:,}"
    )
    if not target_dates:
        logger.warning("No available target dates found for the requested horizon.")
    print_frame("Forward Strip ($/MWh)", strip_table)
    print()
    print_divider("=", 120, dim=False)
    print()
