from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from backend.modelling.pjm_da_models.like_day_model_knn_sunny import (
    configs,
    domains,
    pipeline_shared,
)
from backend.modelling.pjm_da_models.like_day_model_knn_sunny.pjm_rto_hourly import (
    forecast,
)


def _query_frame(target_date: date) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for hour in configs.HOURS:
        row: dict[str, object] = {"date": target_date, "hour_ending": hour}
        for column in domains.feature_columns():
            row[column] = float(hour)
        rows.append(row)
    return pd.DataFrame(rows)


def _pool_frame(pool_date: date, *, include_lmp: bool = True) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for hour in configs.HOURS:
        row: dict[str, object] = {"date": pool_date, "hour_ending": hour}
        for column in domains.feature_columns():
            row[column] = float(hour)
        if include_lmp:
            row["lmp"] = 10.0 + hour
        rows.append(row)
    return pd.DataFrame(rows)


def _analog_frame(like_date: date) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "date": like_date,
                "hour_ending": hour,
                "lmp": 50.0 + hour,
                "weight": 1.0,
                "distance": 0.1,
            }
            for hour in configs.HOURS
        ]
    )


def test_run_forecast_uses_explicit_actuals_when_target_not_in_pool(monkeypatch):
    target = date(2026, 1, 10)
    monkeypatch.setattr(
        forecast,
        "find_twins",
        lambda **_kwargs: _analog_frame(target - timedelta(days=30)),
    )

    result = forecast.run_forecast(
        target_date=target,
        query=_query_frame(target),
        pool=_pool_frame(target - timedelta(days=30)),
        config=configs.KnnModelConfig(forecast_date=target.isoformat()),
        actual_hourly={hour: 100.0 + hour for hour in configs.HOURS},
        include_pool_actuals=False,
    )

    table = result["output_table"]
    assert table["Type"].tolist() == ["Actual", "Forecast", "Error"]
    assert table.loc[table["Type"] == "Actual", "HE1"].iloc[0] == 101.0
    assert table.loc[table["Type"] == "Forecast", "HE1"].iloc[0] == 51.0
    assert table.loc[table["Type"] == "Error", "HE1"].iloc[0] == -50.0
    assert result["has_actuals"] is True
    assert result["metrics"]["mae"] == 50.0


def test_run_forecast_can_suppress_pool_actuals_for_display(monkeypatch):
    target = date(2026, 1, 10)
    monkeypatch.setattr(
        forecast,
        "find_twins",
        lambda **_kwargs: _analog_frame(target - timedelta(days=30)),
    )

    result = forecast.run_forecast(
        target_date=target,
        query=_query_frame(target),
        pool=_pool_frame(target),
        config=configs.KnnModelConfig(forecast_date=target.isoformat()),
        include_pool_actuals=False,
    )

    assert result["output_table"]["Type"].tolist() == ["Forecast"]
    assert result["has_actuals"] is False
    assert result["metrics"] == {}


def test_single_day_runner_loads_actuals_separately(monkeypatch):
    target = date(2026, 1, 10)
    captured: dict[str, object] = {}

    def fake_load_actual_da_lmps(*, target_date, hub):
        captured["actual_target_date"] = target_date
        captured["actual_hub"] = hub
        return pd.DataFrame(
            [{"date": target_date, "hour_ending": 1, "lmp": 44.5}]
        )

    def fake_run_forecast(**kwargs):
        captured["actual_hourly"] = kwargs["actual_hourly"]
        captured["include_pool_actuals"] = kwargs["include_pool_actuals"]
        return {}

    monkeypatch.setattr(
        pipeline_shared.loader,
        "load_actual_da_lmps",
        fake_load_actual_da_lmps,
    )
    monkeypatch.setattr(pipeline_shared.forecast, "run_forecast", fake_run_forecast)

    result = pipeline_shared.run_single_day_forecast(
        source_label="PJM RTO",
        logger_name="test_pjm_da_knn_sunny_actuals",
        model_name=configs.PJM_RTO_HOURLY_SUNNY_SPEC.name,
        pool_builder=lambda **_kwargs: _pool_frame(target - timedelta(days=30)),
        query_builder=lambda target_date, *_args: _query_frame(target_date),
        target_date=target,
        run_date=target - timedelta(days=1),
        quiet=True,
    )

    assert captured["actual_target_date"] == target
    assert captured["actual_hub"] == configs.HUB
    assert captured["actual_hourly"] == {1: 44.5}
    assert captured["include_pool_actuals"] is True
    assert isinstance(result["actuals"], pd.DataFrame)
