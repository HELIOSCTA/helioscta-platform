from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from backend.modelling.pjm_da_models import result_envelope, source_registry
from backend.modelling.pjm_da_models import pipelines as root_pipelines
from backend.modelling.pjm_da_models.pipelines.tomorrow import (
    like_day_knn_sunny_pjm_rto_hourly as knn_pjm_tomorrow,
)
from backend.modelling.pjm_da_models.pipelines.tomorrow import (
    like_day_knn_sunny_meteo_rto_hourly as knn_meteo_tomorrow,
)
from backend.modelling.pjm_da_models.pipelines.tomorrow import (
    meteo_baseline_price_meteo_da_price as baseline_tomorrow,
)
from backend.modelling.pjm_da_models.pipelines.next_3_days import (
    like_day_knn_sunny_meteo_rto_hourly as knn_meteo_next_3_days,
)
from backend.modelling.pjm_da_models.pipelines.next_3_days import (
    meteo_baseline_price_meteo_da_price as baseline_next_3_days,
)
from backend.modelling.pjm_da_models.pipelines.next_14_days import (
    like_day_knn_sunny_meteo_rto_hourly as knn_meteo_next_14_days,
)
from backend.modelling.pjm_da_models.pipelines.next_14_days import (
    meteo_baseline_price_meteo_da_price as baseline_next_14_days,
)
from backend.modelling.pjm_da_models.meteo_baseline_price.pipelines import (
    _shared as baseline_shared,
)
from backend.modelling.pjm_da_models.meteo_baseline_price.pipelines import (
    forecast_next_3_days as old_baseline_next_3_days,
)
from backend.modelling.pjm_da_models.meteo_baseline_price.pipelines import (
    forecast_tomorrow as old_baseline_tomorrow,
)
from backend.modelling.pjm_da_models.like_day_model_knn_sunny import (
    configs,
    domains,
    loader as knn_loader,
    pipeline_shared,
)
from backend.modelling.pjm_da_models.like_day_model_knn_sunny.meteo_rto_hourly.pipelines import (
    _shared as knn_meteo_shared,
)
from backend.modelling.pjm_da_models.like_day_model_knn_sunny.meteo_rto_hourly.pipelines import (
    forecast_next_3_days as old_knn_meteo_next_3_days,
)
from backend.modelling.pjm_da_models.like_day_model_knn_sunny.meteo_rto_hourly.pipelines import (
    forecast_tomorrow as old_knn_meteo_tomorrow,
)
from backend.modelling.pjm_da_models.like_day_model_knn_sunny.pjm_rto_hourly.pipelines import (
    _shared as knn_pjm_shared,
)
from backend.modelling.pjm_da_models.like_day_model_knn_sunny.pjm_rto_hourly import (
    run_single_day as exported_knn_pjm_single_day,
)
from backend.modelling.pjm_da_models.like_day_model_knn_sunny.pjm_rto_hourly.pipelines import (
    run_single_day as exported_knn_pjm_pipeline_single_day,
)
from backend.modelling.pjm_da_models.like_day_model_knn_sunny.pjm_rto_hourly.pipelines import (
    forecast_single_day as old_knn_pjm_single_day,
)
from backend.modelling.pjm_da_models.like_day_model_knn_sunny.pjm_rto_hourly.pipelines import (
    forecast_tomorrow as old_knn_pjm_tomorrow,
)


RUN_DATE = date(2026, 1, 9)
TARGET_DATE = date(2026, 1, 10)
CUTOFF_UTC = "2026-01-09T15:00:00+00:00"


def _baseline_forecast_frame(target: date = TARGET_DATE) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for hour in configs.HOURS:
        rows.append(
            {
                "as_of_date": target - timedelta(days=1),
                "date": target,
                "hour_ending": hour,
                "forecast_period_start": pd.Timestamp(target) + pd.Timedelta(hours=hour - 1),
                "da_price_deterministic": 40.0 + hour,
                "da_price_ens_average": 41.0 + hour,
                "da_price_ens_bottom": 35.0 + hour,
                "da_price_ens_top": 47.0 + hour,
                "det_forecast_execution_datetime_local": pd.Timestamp("2026-01-09 08:00"),
                "ens_forecast_execution_datetime_local": pd.Timestamp("2026-01-09 07:00"),
            }
        )
    return pd.DataFrame(rows)


def _actuals_frame(target: date = TARGET_DATE) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "date": target,
                "hour_ending": hour,
                "region": configs.HUB,
                "lmp": 42.0 + hour,
                "lmp_system_energy_price": 40.0 + hour,
                "updated_at": pd.Timestamp("2026-01-11T12:00:00Z"),
            }
            for hour in configs.HOURS
        ]
    )


def _query_frame(target: date = TARGET_DATE) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for hour in configs.HOURS:
        row: dict[str, object] = {"date": target, "hour_ending": hour}
        for column in domains.feature_columns():
            row[column] = float(hour)
        rows.append(row)
    return pd.DataFrame(rows)


def _pool_frame(pool_date: date | None = None) -> pd.DataFrame:
    pool_date = pool_date or (TARGET_DATE - timedelta(days=30))
    rows: list[dict[str, object]] = []
    for hour in configs.HOURS:
        row: dict[str, object] = {"date": pool_date, "hour_ending": hour}
        for column in domains.feature_columns():
            row[column] = float(hour)
        row["lmp"] = 50.0 + hour
        rows.append(row)
    return pd.DataFrame(rows)


def _hourly_frame(
    target: date,
    columns: dict[str, float | None],
) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for hour in configs.HOURS:
        row: dict[str, object] = {"date": target, "hour_ending": hour}
        for column, base_value in columns.items():
            row[column] = (
                None if base_value is None else float(base_value) + float(hour)
            )
        rows.append(row)
    return pd.DataFrame(rows)


def _daily_frame(target: date, columns: dict[str, float | None]) -> pd.DataFrame:
    row: dict[str, object] = {"date": target}
    row.update(columns)
    return pd.DataFrame([row])


def _knn_forecast_result(target: date, *, has_actuals: bool) -> dict[str, object]:
    df_forecast = pd.DataFrame(
        [
            {
                "hour_ending": hour,
                "point_forecast": 50.0 + hour,
                "q_0.10": 45.0 + hour,
                "q_0.50": 50.0 + hour,
                "q_0.90": 55.0 + hour,
            }
            for hour in configs.HOURS
        ]
    )
    output_rows = [
        {"Date": target, "Type": "Forecast", "HE1": 51.0, "OnPeak": 60.0}
    ]
    if has_actuals:
        output_rows.insert(0, {"Date": target, "Type": "Actual", "HE1": 43.0})
    return {
        "forecast_date": target.isoformat(),
        "output_table": pd.DataFrame(output_rows),
        "df_forecast": df_forecast,
        "quantiles_table": pd.DataFrame(
            [{"Date": target, "Type": "P50", "HE1": 51.0}]
        ),
        "analogs": pd.DataFrame(
            [
                {
                    "date": target - timedelta(days=30),
                    "hour_ending": hour,
                    "rank": 1,
                    "lmp": 50.0 + hour,
                    "weight": 1.0,
                    "distance": 0.1,
                }
                for hour in configs.HOURS
            ]
        ),
        "target_features": _query_frame(target),
        "target_features_by_hour": {},
        "has_actuals": has_actuals,
        "metrics": {"mae": 1.0} if has_actuals else {},
        "feature_weights": {"load": 1.0},
        "day_type": "weekday",
    }


def _patch_baseline_loaders(monkeypatch) -> None:
    monkeypatch.setattr(baseline_shared.loader, "today_ept", lambda: RUN_DATE)
    monkeypatch.setattr(
        baseline_shared.loader,
        "default_cutoff_utc",
        lambda *_args, **_kwargs: CUTOFF_UTC,
    )
    monkeypatch.setattr(
        baseline_shared.loader,
        "load_meteologica_da_price_forecast",
        lambda *, target_date, **_kwargs: _baseline_forecast_frame(target_date),
    )
    monkeypatch.setattr(
        baseline_shared.loader,
        "load_actual_da_lmps",
        lambda *, target_date, **_kwargs: _actuals_frame(target_date),
    )
    monkeypatch.setattr(
        baseline_shared.loader,
        "available_target_dates",
        lambda *, start_date, limit, **_kwargs: [
            start_date + timedelta(days=index) for index in range(int(limit))
        ],
    )


def test_baseline_tomorrow_returns_shared_envelope_and_legacy_aliases(monkeypatch):
    _patch_baseline_loaders(monkeypatch)

    result = baseline_tomorrow.run(quiet=True)

    assert result["model_family"] == "meteo_baseline_price"
    assert result["model_name"] == "meteologica_da_price_baseline"
    assert result["input_family"] == "meteo_da_price"
    assert result["horizon"] == "tomorrow"
    assert result["target_date"] == TARGET_DATE.isoformat()
    assert result["target_dates"] == [TARGET_DATE.isoformat()]
    assert result["status"]["has_actuals"] is True
    assert result["status"]["features_complete"] is True
    assert result["tables"]["forecast"] is result["df_forecast"]
    assert result["tables"]["bands"] is result["bands_table"]
    assert "meteo_da_price_forecast_hourly.sql" in result["diagnostics"]["sql_artifacts"]


def test_baseline_include_actuals_false_suppresses_actual_outputs(monkeypatch):
    _patch_baseline_loaders(monkeypatch)
    monkeypatch.setattr(
        baseline_shared.loader,
        "load_actual_da_lmps",
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError("actuals loaded")),
    )

    result = baseline_tomorrow.run(include_actuals=False, quiet=True)

    assert result["include_actuals"] is False
    assert result["status"]["has_actuals"] is False
    assert result["actuals"].empty
    assert result["forecast_vs_actuals"].empty
    assert "actual_da_lmps_hourly.sql" not in result["diagnostics"]["sql_artifacts"]


def test_baseline_horizon_returns_envelope_and_results_alias(monkeypatch):
    _patch_baseline_loaders(monkeypatch)

    result = baseline_next_3_days.run(
        run_date=RUN_DATE,
        horizon_days=3,
        include_actuals=False,
        quiet=True,
    )

    assert result["horizon"] == "next_3_days"
    assert result["target_dates"] == [
        (RUN_DATE + timedelta(days=offset)).isoformat() for offset in range(1, 4)
    ]
    assert len(result["results"]) == 3
    assert result["summary_table"] is result["tables"]["summary"]
    assert result["status"]["has_actuals"] is False


def test_baseline_horizon_defaults_to_forecast_only(monkeypatch):
    _patch_baseline_loaders(monkeypatch)
    monkeypatch.setattr(
        baseline_shared.loader,
        "load_actual_da_lmps",
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError("actuals loaded")),
    )

    result = baseline_next_3_days.run(run_date=RUN_DATE, quiet=True)

    assert baseline_next_3_days.INCLUDE_ACTUALS is False
    assert baseline_next_14_days.INCLUDE_ACTUALS is False
    assert result["include_actuals"] is False
    assert result["status"]["has_actuals"] is False
    assert "actual_da_lmps_hourly.sql" not in result["diagnostics"]["sql_artifacts"]


def test_knn_single_day_returns_shared_envelope_and_legacy_aliases(monkeypatch):
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        pipeline_shared.loader,
        "today_ept",
        lambda: RUN_DATE,
    )
    monkeypatch.setattr(
        pipeline_shared.loader,
        "default_cutoff_utc",
        lambda *_args, **_kwargs: CUTOFF_UTC,
    )
    monkeypatch.setattr(
        pipeline_shared.loader,
        "load_actual_da_lmps",
        lambda *, target_date, **_kwargs: _actuals_frame(target_date),
    )

    def fake_run_forecast(**kwargs):
        captured["actual_hourly"] = kwargs["actual_hourly"]
        captured["include_pool_actuals"] = kwargs["include_pool_actuals"]
        return _knn_forecast_result(kwargs["target_date"], has_actuals=True)

    monkeypatch.setattr(pipeline_shared.forecast, "run_forecast", fake_run_forecast)

    result = pipeline_shared.run_single_day_forecast(
        source_label="PJM RTO",
        model_name=configs.PJM_RTO_HOURLY_SUNNY_SPEC.name,
        input_family="pjm_rto_hourly",
        pool_builder=lambda **_kwargs: _pool_frame(),
        query_builder=lambda target_date, *_args: _query_frame(target_date),
        run_date=RUN_DATE,
        quiet=True,
    )

    assert captured["actual_hourly"][1] == 43.0
    assert captured["include_pool_actuals"] is True
    assert result["model_family"] == "like_day_knn_sunny"
    assert result["input_family"] == "pjm_rto_hourly"
    assert result["horizon"] == "tomorrow"
    assert result["tables"]["forecast"] is result["df_forecast"]
    assert result["tables"]["output"] is result["output_table"]
    assert result["tables"]["quantiles"] is result["quantiles_table"]
    assert result["tables"]["analogs"] is result["analogs"]
    assert result["status"]["has_actuals"] is True
    assert "actual_da_lmps_hourly.sql" in result["diagnostics"]["sql_artifacts"]


def test_knn_include_actuals_false_suppresses_actual_load_and_metrics(monkeypatch):
    captured: dict[str, object] = {}

    monkeypatch.setattr(pipeline_shared.loader, "today_ept", lambda: RUN_DATE)
    monkeypatch.setattr(
        pipeline_shared.loader,
        "default_cutoff_utc",
        lambda *_args, **_kwargs: CUTOFF_UTC,
    )
    monkeypatch.setattr(
        pipeline_shared.loader,
        "load_actual_da_lmps",
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError("actuals loaded")),
    )

    def fake_run_forecast(**kwargs):
        captured["actual_hourly"] = kwargs["actual_hourly"]
        captured["include_pool_actuals"] = kwargs["include_pool_actuals"]
        return _knn_forecast_result(kwargs["target_date"], has_actuals=False)

    monkeypatch.setattr(pipeline_shared.forecast, "run_forecast", fake_run_forecast)

    result = pipeline_shared.run_single_day_forecast(
        source_label="PJM RTO",
        model_name=configs.PJM_RTO_HOURLY_SUNNY_SPEC.name,
        input_family="pjm_rto_hourly",
        pool_builder=lambda **_kwargs: _pool_frame(),
        query_builder=lambda target_date, *_args: _query_frame(target_date),
        run_date=RUN_DATE,
        include_actuals=False,
        quiet=True,
    )

    assert captured["actual_hourly"] is None
    assert captured["include_pool_actuals"] is False
    assert result["include_actuals"] is False
    assert result["status"]["has_actuals"] is False
    assert result["actuals"].empty
    assert result["metrics"] == {}


def test_knn_pjm_tomorrow_delegates_to_nested_shared(monkeypatch):
    captured: dict[str, object] = {}

    def fake_run_single_day(**kwargs):
        captured.update(kwargs)
        return {"delegated": True}

    monkeypatch.setattr(knn_pjm_shared, "run_single_day", fake_run_single_day)

    result = knn_pjm_tomorrow.run(
        target_date=TARGET_DATE,
        run_date=RUN_DATE,
        n_analogs=7,
        publish=False,
        quiet=True,
    )

    assert result == {"delegated": True}
    assert captured["target_date"] == TARGET_DATE
    assert captured["run_date"] == RUN_DATE
    assert captured["n_analogs"] == 7
    assert captured["publish"] is False
    assert captured["quiet"] is True


def test_knn_pjm_runner_accepts_old_kwargs_and_preserves_aliases(monkeypatch):
    captured: dict[str, object] = {}
    pool = _pool_frame()
    pool["lmp_system_energy_price"] = pool["lmp"] + 100.0
    y_naive = np.arange(24, dtype=float)
    weight_override = {"outage_daily": 0.0}

    monkeypatch.setattr(knn_pjm_shared.loader, "today_ept", lambda: RUN_DATE)
    monkeypatch.setattr(
        knn_pjm_shared.loader,
        "default_cutoff_utc",
        lambda *_args, **_kwargs: CUTOFF_UTC,
    )
    monkeypatch.setattr(
        knn_pjm_shared,
        "build_query_row",
        lambda target_date, **_kwargs: _query_frame(target_date),
    )
    monkeypatch.setattr(
        knn_pjm_shared.loader,
        "load_actual_da_lmps",
        lambda *, target_date, **_kwargs: _actuals_frame(target_date),
    )

    def fake_run_forecast(**kwargs):
        captured.update(kwargs)
        return _knn_forecast_result(kwargs["target_date"], has_actuals=True)

    monkeypatch.setattr(knn_pjm_shared.forecast, "run_forecast", fake_run_forecast)

    result = knn_pjm_shared.run_single_day(
        target_date=TARGET_DATE,
        run_date=RUN_DATE,
        model_name=configs.PJM_RTO_HOURLY_SUNNY_SPEC.name,
        n_analogs=7,
        season_window_days=11,
        min_pool_size=13,
        label_source="system_energy",
        recency_half_life_days=123.0,
        quantiles=[0.5, 0.9],
        display_quantiles=[0.5],
        pool=pool,
        y_naive_override=y_naive,
        feature_group_weights_override=weight_override,
        quiet=True,
    )

    config = captured["config"]
    assert isinstance(config, configs.KnnModelConfig)
    assert config.n_analogs == 7
    assert config.season_window_days == 11
    assert config.min_pool_size == 13
    assert config.label_source == "system_energy"
    assert config.recency_half_life_days == 123.0
    assert config.resolved_quantiles() == [0.5, 0.9]
    assert config.resolved_display_quantiles() == [0.5]
    assert captured["display_quantiles"] == [0.5]
    assert captured["y_naive_override"] is y_naive
    assert captured["feature_group_weights_override"] == weight_override
    assert captured["pool"]["lmp"].iloc[0] == 151.0

    assert result["tables"]["forecast"] is result["df_forecast"]
    assert result["tables"]["output"] is result["output_table"]
    assert result["tables"]["quantiles"] is result["quantiles_table"]
    assert result["tables"]["analogs"] is result["analogs"]
    assert result["metrics"] == {"mae": 1.0}
    assert result["day_type"] == "weekday"
    assert result["n_pool"] == len(pool)
    assert result["run_date"] == RUN_DATE.isoformat()


def test_knn_pjm_runner_defaults_to_old_recency_half_life(monkeypatch):
    captured: dict[str, object] = {}

    monkeypatch.setattr(knn_pjm_shared.loader, "today_ept", lambda: RUN_DATE)
    monkeypatch.setattr(
        knn_pjm_shared.loader,
        "default_cutoff_utc",
        lambda *_args, **_kwargs: CUTOFF_UTC,
    )
    monkeypatch.setattr(
        knn_pjm_shared,
        "build_query_row",
        lambda target_date, **_kwargs: _query_frame(target_date),
    )

    def fake_run_forecast(**kwargs):
        captured.update(kwargs)
        return _knn_forecast_result(kwargs["target_date"], has_actuals=False)

    monkeypatch.setattr(knn_pjm_shared.forecast, "run_forecast", fake_run_forecast)

    result = knn_pjm_shared.run_single_day(
        target_date=TARGET_DATE,
        run_date=RUN_DATE,
        pool=_pool_frame(),
        include_actuals=False,
        publish=False,
        quiet=True,
    )

    config = captured["config"]
    assert isinstance(config, configs.KnnModelConfig)
    assert config.recency_half_life_days == 730.0
    assert result["diagnostics"]["settings"]["publish_requested"] is False


def test_pjm_old_semantics_query_uses_history_loaders_not_latest(monkeypatch):
    calls: list[str] = []

    def fail_latest(**_kwargs):
        raise AssertionError("latest-forward loader should not be called")

    def load_history(*, start_date, **_kwargs):
        calls.append("load_history")
        return _hourly_frame(start_date, {"load_mw_at_hour": 50.0})

    monkeypatch.setattr(knn_loader, "load_rto_load_latest_forecast", fail_latest)
    monkeypatch.setattr(knn_loader, "load_renewables_latest_forecast", fail_latest)
    monkeypatch.setattr(knn_loader, "load_gen_outages_latest_forecast", fail_latest)
    monkeypatch.setattr(
        knn_loader,
        "load_rto_load_forecast_history",
        lambda **_kwargs: calls.append("load_forecast_history")
        or _hourly_frame(TARGET_DATE, {"load_mw_at_hour": 100.0}),
    )
    monkeypatch.setattr(knn_loader, "load_rto_load_history", load_history)
    monkeypatch.setattr(
        knn_loader,
        "load_renewables_pjm_forecast_history",
        lambda **_kwargs: calls.append("renewables_history")
        or _hourly_frame(
            TARGET_DATE,
            {
                "solar_pjm_forecast_at_hour": 10.0,
                "wind_pjm_forecast_at_hour": None,
            },
        ),
    )
    monkeypatch.setattr(
        knn_loader,
        "load_meteologica_rto_forecast_history",
        lambda **_kwargs: calls.append("meteo_history")
        or _hourly_frame(
            TARGET_DATE,
            {"solar_at_hour": 20.0, "wind_at_hour": 30.0},
        ),
    )
    monkeypatch.setattr(
        knn_loader,
        "load_wsi_temperature_latest_forecast",
        lambda **_kwargs: _hourly_frame(TARGET_DATE, {"temp_at_hour": 70.0}),
    )
    monkeypatch.setattr(
        knn_loader,
        "load_wsi_temperature_history",
        lambda **_kwargs: _hourly_frame(TARGET_DATE, {"temp_at_hour": 20.0}),
    )
    monkeypatch.setattr(
        knn_loader,
        "load_gen_outages_history",
        lambda **_kwargs: calls.append("outage_history")
        or _daily_frame(TARGET_DATE, {"outage_total_mw": 500.0}),
    )
    monkeypatch.setattr(
        knn_loader,
        "load_gas_daily",
        lambda **_kwargs: _daily_frame(TARGET_DATE, {"gas_m3_daily_avg": 3.0}),
    )

    result = knn_loader.build_pjm_query_frames(
        target_dates=[TARGET_DATE],
        run_date=RUN_DATE,
        cutoff_utc=CUTOFF_UTC,
    )[TARGET_DATE]

    first = result[result["hour_ending"] == 1].iloc[0]
    assert first["load_mw_at_hour"] == 101.0
    assert first["solar_at_hour"] == 11.0
    assert first["wind_at_hour"] == 31.0
    assert first["temp_at_hour"] == 71.0
    assert first["outage_total_mw"] == 500.0
    assert first["gas_m3_daily_avg"] == 3.0
    assert first["net_load_at_hour"] == 59.0
    assert first["load_ramp_1h_at_hour"] == 27.0
    assert {"load_forecast_history", "renewables_history", "outage_history"}.issubset(
        calls
    )


def test_pjm_old_semantics_query_keeps_missing_target_features_null(monkeypatch):
    empty_hourly = pd.DataFrame(columns=["date", "hour_ending"])
    empty_load = pd.DataFrame(columns=["date", "hour_ending", "load_mw_at_hour"])
    empty_temp = pd.DataFrame(columns=["date", "hour_ending", "temp_at_hour"])
    empty_daily = pd.DataFrame(columns=["date", "outage_total_mw"])

    monkeypatch.setattr(knn_loader, "load_rto_load_forecast_history", lambda **_kwargs: empty_load.copy())
    monkeypatch.setattr(knn_loader, "load_rto_load_history", lambda **_kwargs: empty_load.copy())
    monkeypatch.setattr(knn_loader, "load_renewables_pjm_forecast_history", lambda **_kwargs: empty_hourly.copy())
    monkeypatch.setattr(knn_loader, "load_meteologica_rto_forecast_history", lambda **_kwargs: empty_hourly.copy())
    monkeypatch.setattr(knn_loader, "load_wsi_temperature_latest_forecast", lambda **_kwargs: empty_temp.copy())
    monkeypatch.setattr(knn_loader, "load_wsi_temperature_history", lambda **_kwargs: empty_temp.copy())
    monkeypatch.setattr(knn_loader, "load_gen_outages_history", lambda **_kwargs: empty_daily.copy())
    monkeypatch.setattr(
        knn_loader,
        "load_gas_daily",
        lambda **_kwargs: pd.DataFrame(columns=["date", "gas_m3_daily_avg"]),
    )

    result = knn_loader.build_pjm_query_frames(
        target_dates=[TARGET_DATE],
        run_date=RUN_DATE,
        cutoff_utc=CUTOFF_UTC,
    )[TARGET_DATE]

    non_calendar = [
        column
        for column in domains.feature_columns()
        if column not in domains.CALENDAR_COLUMNS
    ]
    assert len(result) == 24
    assert result[non_calendar].isna().all().all()
    assert not result[list(domains.CALENDAR_COLUMNS)].isna().any().any()


def test_pjm_old_style_report_sections_are_printed(monkeypatch, capsys):
    monkeypatch.setattr(
        knn_pjm_shared,
        "build_query_row",
        lambda target_date, **_kwargs: _query_frame(target_date),
    )
    monkeypatch.setattr(
        knn_pjm_shared.forecast,
        "run_forecast",
        lambda **kwargs: _knn_forecast_result(
            kwargs["target_date"],
            has_actuals=False,
        ),
    )

    knn_pjm_shared.run_single_day(
        target_date=TARGET_DATE,
        run_date=RUN_DATE,
        pool=_pool_frame(),
        include_actuals=False,
        quiet=False,
    )

    output = capsys.readouterr().out
    assert "FORECAST CONFIGURATION" in output
    assert "POOL SUMMARY" in output
    assert "LIKE-DAY ANALOGS" in output
    assert "DA LMP LIKE-DAY FORECAST" in output
    assert "Quantile Bands" in output


def test_knn_meteo_horizon_returns_envelope_and_results_by_date(monkeypatch):
    targets = [RUN_DATE + timedelta(days=offset) for offset in range(1, 4)]

    monkeypatch.setattr(knn_meteo_shared.loader, "today_ept", lambda: RUN_DATE)
    monkeypatch.setattr(
        knn_meteo_shared.loader,
        "default_cutoff_utc",
        lambda *_args, **_kwargs: CUTOFF_UTC,
    )
    monkeypatch.setattr(
        knn_meteo_shared.loader,
        "available_target_dates",
        lambda **_kwargs: targets,
    )
    monkeypatch.setattr(
        knn_meteo_shared.loader,
        "load_lmp_history",
        lambda *, start_date, end_date, **_kwargs: pd.concat(
            [_actuals_frame(target) for target in targets],
            ignore_index=True,
        ),
    )
    monkeypatch.setattr(knn_meteo_shared, "build_pool", lambda **_kwargs: _pool_frame())
    monkeypatch.setattr(
        knn_meteo_shared,
        "build_horizon_query_rows",
        lambda target_dates, **_kwargs: {
            target: _query_frame(target) for target in target_dates
        },
    )
    monkeypatch.setattr(
        knn_meteo_shared.forecast,
        "run_forecast",
        lambda **kwargs: _knn_forecast_result(
            kwargs["target_date"],
            has_actuals=kwargs["actual_hourly"] is not None,
        ),
    )

    result = knn_meteo_next_3_days.run(
        run_date=RUN_DATE,
        include_actuals=True,
        per_day_detail=False,
        quiet=True,
    )

    assert result["model_family"] == "like_day_knn_sunny"
    assert result["model_name"] == configs.METEO_RTO_HOURLY_SUNNY_SPEC.name
    assert result["input_family"] == "meteo_rto_hourly"
    assert result["horizon"] == "next_3_days"
    assert result["target_dates"] == [target.isoformat() for target in targets]
    assert set(result["results_by_date"]) == set(result["target_dates"])
    assert result["strip_table"] is result["tables"]["strip"]
    assert result["status"]["has_actuals"] is True


def test_canonical_module_and_entrypoint_names_are_stable():
    assert root_pipelines.__all__ == [
        "run_like_day_knn_sunny_meteo_rto_hourly_next_14_days",
        "run_like_day_knn_sunny_meteo_rto_hourly_next_3_days",
        "run_like_day_knn_sunny_meteo_rto_hourly_tomorrow",
        "run_like_day_knn_sunny_pjm_rto_hourly_tomorrow",
        "run_meteo_baseline_price_meteo_da_price_next_14_days",
        "run_meteo_baseline_price_meteo_da_price_next_3_days",
        "run_meteo_baseline_price_meteo_da_price_tomorrow",
    ]
    assert (
        baseline_tomorrow.__name__
        == "backend.modelling.pjm_da_models.pipelines.tomorrow."
        "meteo_baseline_price_meteo_da_price"
    )
    assert (
        knn_meteo_tomorrow.__name__
        == "backend.modelling.pjm_da_models.pipelines.tomorrow."
        "like_day_knn_sunny_meteo_rto_hourly"
    )
    assert (
        knn_pjm_tomorrow.__name__
        == "backend.modelling.pjm_da_models.pipelines.tomorrow."
        "like_day_knn_sunny_pjm_rto_hourly"
    )
    assert (
        baseline_next_3_days.__name__
        == "backend.modelling.pjm_da_models.pipelines.next_3_days."
        "meteo_baseline_price_meteo_da_price"
    )
    assert (
        knn_meteo_next_3_days.__name__
        == "backend.modelling.pjm_da_models.pipelines.next_3_days."
        "like_day_knn_sunny_meteo_rto_hourly"
    )
    assert (
        baseline_next_14_days.__name__
        == "backend.modelling.pjm_da_models.pipelines.next_14_days."
        "meteo_baseline_price_meteo_da_price"
    )
    assert (
        knn_meteo_next_14_days.__name__
        == "backend.modelling.pjm_da_models.pipelines.next_14_days."
        "like_day_knn_sunny_meteo_rto_hourly"
    )
    assert (
        baseline_tomorrow.ENTRYPOINT_NAME
        == "pjm_da_meteo_baseline_price_meteo_da_price_tomorrow"
    )
    assert (
        knn_meteo_tomorrow.ENTRYPOINT_NAME
        == "pjm_da_like_day_knn_sunny_meteo_rto_hourly_tomorrow"
    )
    assert (
        result_envelope.canonical_log_name(
            "like_day_knn_sunny",
            "pjm_rto_hourly",
            "tomorrow",
        )
        == "pjm_da_like_day_knn_sunny_pjm_rto_hourly_tomorrow"
    )
    assert not hasattr(knn_pjm_tomorrow, "_build_single_day_query")
    assert knn_pjm_shared.INPUT_FAMILY == "pjm_rto_hourly"
    assert exported_knn_pjm_single_day is knn_pjm_shared.run_single_day
    assert exported_knn_pjm_pipeline_single_day is knn_pjm_shared.run_single_day


def test_legacy_pipeline_modules_delegate_to_canonical_modules():
    assert old_baseline_tomorrow.run is baseline_tomorrow.run
    assert old_baseline_tomorrow.ENTRYPOINT_NAME == baseline_tomorrow.ENTRYPOINT_NAME
    assert old_baseline_next_3_days.run is baseline_next_3_days.run
    assert (
        old_baseline_next_3_days.ENTRYPOINT_NAME
        == baseline_next_3_days.ENTRYPOINT_NAME
    )
    assert old_knn_meteo_tomorrow.run is knn_meteo_tomorrow.run
    assert old_knn_meteo_tomorrow.ENTRYPOINT_NAME == knn_meteo_tomorrow.ENTRYPOINT_NAME
    assert old_knn_meteo_next_3_days.run is knn_meteo_next_3_days.run
    assert (
        old_knn_meteo_next_3_days.ENTRYPOINT_NAME
        == knn_meteo_next_3_days.ENTRYPOINT_NAME
    )
    assert old_knn_pjm_tomorrow.run is knn_pjm_tomorrow.run
    assert old_knn_pjm_tomorrow.ENTRYPOINT_NAME == knn_pjm_tomorrow.ENTRYPOINT_NAME
    assert old_knn_pjm_single_day.run is knn_pjm_tomorrow.run
    assert old_knn_pjm_single_day.ENTRYPOINT_NAME == knn_pjm_tomorrow.ENTRYPOINT_NAME


def test_source_registry_documents_promoted_artifact_contracts():
    artifacts = source_registry.artifacts_for(
        model_family="like_day_knn_sunny",
        input_family="meteo_rto_hourly",
        include_actuals=True,
    )

    assert artifacts
    assert all(artifact.filename.endswith(".sql") for artifact in artifacts)
    assert all(artifact.source_tables for artifact in artifacts)
    assert all(artifact.grain for artifact in artifacts)
    assert all(artifact.required_params for artifact in artifacts)
    filenames = {artifact.filename for artifact in artifacts}
    assert "meteo_pjm_rto_latest_forecast_hourly.sql" in filenames
    assert "rto_load_latest_forecast_hourly.sql" not in filenames

    pjm_artifacts = source_registry.artifacts_for(
        model_family="like_day_knn_sunny",
        input_family="pjm_rto_hourly",
        include_actuals=False,
    )
    pjm_filenames = {artifact.filename for artifact in pjm_artifacts}
    assert "rto_load_forecast_hourly_history.sql" in pjm_filenames
    assert "renewables_hourly_history.sql" in pjm_filenames
    assert "gen_outages_daily_history.sql" in pjm_filenames
    assert "meteo_pjm_rto_forecast_hourly_history.sql" in pjm_filenames
    assert "rto_load_latest_forecast_hourly.sql" not in pjm_filenames
    assert "renewables_latest_forecast_hourly.sql" not in pjm_filenames
    assert "gen_outages_daily_latest_forecast.sql" not in pjm_filenames
    assert "meteo_pjm_rto_latest_forecast_hourly.sql" not in pjm_filenames
