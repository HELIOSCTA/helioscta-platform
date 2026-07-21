from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from backend.orchestration.weather.wsi import daily_weighted_forecasts
from backend.scrapes.weather.wsi import daily_weighted_degree_day_forecast
from backend.scrapes.weather.wsi import daily_weighted_temperature_forecast


def _forecast_rows(
    *,
    dataset: str,
    issue_key: str,
    entities: list[str],
    metrics: list[str],
    day_count: int = 15,
) -> pd.DataFrame:
    rows = []
    first_forecast_date = date(2026, 7, 21)
    for entity_id in entities:
        for day_offset in range(day_count):
            forecast_date = first_forecast_date + timedelta(days=day_offset)
            for metric_name in metrics:
                rows.append(
                    {
                        "source_issue_key": issue_key,
                        "source_issue_at_utc": pd.Timestamp(
                            "2026-07-21 10:28:00+0000"
                        ),
                        "scrape_run_at_utc": pd.Timestamp(
                            "2026-07-21 10:44:00+0000"
                        ),
                        "entity_id": entity_id,
                        "forecast_date": forecast_date,
                        "metric_name": metric_name,
                        "dataset": dataset,
                    }
                )
    return pd.DataFrame(rows)


def test_daily_weighted_forecasts_main_runs_both_scrapes_and_emits_events(
    monkeypatch,
):
    emitted: list[dict] = []
    temp_df = _forecast_rows(
        dataset="temperature",
        issue_key="wsi:GetModelForecast:WSI:Daily:202607211028",
        entities=["PJM"],
        metrics=daily_weighted_temperature_forecast.EXPECTED_METRIC_NAMES,
    )
    degree_df = _forecast_rows(
        dataset="degree_day",
        issue_key="wsi:GetWeightedDegreeDayForecast:WSI:Daily:202607211028",
        entities=daily_weighted_degree_day_forecast.DEFAULT_STATIONS,
        metrics=daily_weighted_degree_day_forecast.EXPECTED_METRIC_NAMES,
    )

    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_temperature_forecast,
        "main",
        lambda **_kwargs: temp_df,
    )
    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_degree_day_forecast,
        "main",
        lambda **_kwargs: degree_df,
    )
    monkeypatch.setattr(
        daily_weighted_forecasts,
        "emit_data_availability_event",
        lambda **kwargs: emitted.append(kwargs)
        or {"event_key": kwargs["event_key"], "created": True},
    )

    result = daily_weighted_forecasts.main(database="helios_prod")

    assert set(result["events"]) == {"temperature", "degree_day"}
    assert [event["dataset"] for event in emitted] == [
        "wsi_daily_weighted_temperature_forecasts",
        "wsi_daily_weighted_degree_day_forecasts",
    ]
    assert all(event["completeness_status"] == "complete" for event in emitted)
    assert emitted[0]["source_table"] == (
        "weather.wsi_daily_weighted_temperature_forecasts"
    )
    assert emitted[1]["source_table"] == (
        "weather.wsi_daily_weighted_degree_day_forecasts"
    )


def test_daily_weighted_forecast_event_marks_missing_metric_partial(monkeypatch):
    emitted: list[dict] = []
    df = _forecast_rows(
        dataset="temperature",
        issue_key="wsi:GetModelForecast:WSI:Daily:202607211028",
        entities=["PJM"],
        metrics=["min_temp_f", "max_temp_f", "hdd", "cdd"],
    )

    monkeypatch.setattr(
        daily_weighted_forecasts,
        "emit_data_availability_event",
        lambda **kwargs: emitted.append(kwargs)
        or {"event_key": kwargs["event_key"], "created": True},
    )

    daily_weighted_forecasts._emit_freshness_event(
        df=df,
        dataset="wsi_daily_weighted_temperature_forecasts",
        source_table="weather.wsi_daily_weighted_temperature_forecasts",
        expected_entities=["PJM"],
        expected_metric_names=daily_weighted_temperature_forecast.EXPECTED_METRIC_NAMES,
        scope="PJM",
        database="helios_prod",
    )

    assert emitted[0]["completeness_status"] == "partial"
    assert emitted[0]["payload"]["missing_metric_names"] == ["heat_index_f"]
    assert emitted[0]["payload"]["missing_entity_metric_date_count"] == 15


def test_daily_weighted_forecast_event_marks_short_horizon_partial(monkeypatch):
    emitted: list[dict] = []
    df = _forecast_rows(
        dataset="degree_day",
        issue_key="wsi:GetWeightedDegreeDayForecast:WSI:Daily:202607211028",
        entities=daily_weighted_degree_day_forecast.DEFAULT_STATIONS,
        metrics=daily_weighted_degree_day_forecast.EXPECTED_METRIC_NAMES,
        day_count=14,
    )

    monkeypatch.setattr(
        daily_weighted_forecasts,
        "emit_data_availability_event",
        lambda **kwargs: emitted.append(kwargs)
        or {"event_key": kwargs["event_key"], "created": True},
    )

    daily_weighted_forecasts._emit_freshness_event(
        df=df,
        dataset="wsi_daily_weighted_degree_day_forecasts",
        source_table="weather.wsi_daily_weighted_degree_day_forecasts",
        expected_entities=daily_weighted_degree_day_forecast.DEFAULT_STATIONS,
        expected_metric_names=daily_weighted_degree_day_forecast.EXPECTED_METRIC_NAMES,
        scope="NA",
        database="helios_prod",
    )

    assert emitted[0]["completeness_status"] == "partial"
    assert emitted[0]["payload"]["expected_forecast_day_count"] == 15
    assert emitted[0]["payload"]["actual_forecast_day_count"] == 14
