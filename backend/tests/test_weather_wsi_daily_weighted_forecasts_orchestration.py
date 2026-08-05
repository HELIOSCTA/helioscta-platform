from __future__ import annotations

from datetime import date, timedelta

import pandas as pd
import pytest

from backend.orchestration.weather.wsi import daily_weighted_forecasts
from backend.scrapes.weather.wsi import daily_weighted_degree_day_forecast
from backend.scrapes.weather.wsi import daily_weighted_temperature_forecast


class _FakeRunLogger:
    def header(self, _value):
        pass

    def info(self, *_args):
        pass

    def section(self, _value):
        pass

    def success(self, _value):
        pass

    def exception(self, _value):
        pass


def _forecast_rows(
    *,
    dataset: str,
    issue_key: str,
    entities: list[str],
    metrics: list[str],
    model: str = "WSI",
    bias_corrected: bool = False,
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
                        "model": model,
                        "bias_corrected": bias_corrected,
                        "dataset": dataset,
                    }
                )
    return pd.DataFrame(rows)


def _model_run_rows(
    *,
    issue_key: str = "wsi:GetWeightedDegreeDayForecast:GFS_OP:Daily:202608051200",
    entity_id: str = "CONUS",
    metric_name: str = "electric_cdd",
    model: str = "GFS_OP",
    source_init_cycle: str = "12Z",
    model_run_cycle: str = "12Z",
    day_count: int = 15,
) -> pd.DataFrame:
    rows = []
    first_forecast_date = date(2026, 8, 5)
    source_init_at = pd.Timestamp("2026-08-05 12:00:00+0000")
    if source_init_cycle == "06Z":
        source_init_at = pd.Timestamp("2026-08-05 06:00:00+0000")
    for day_offset in range(day_count):
        rows.append(
            {
                "source_issue_key": issue_key,
                "source_issue_at_utc": pd.Timestamp("2026-08-05 12:00:00+0000"),
                "source_banner": (
                    "Model Weighted Degree Day Forecast - Forecast Updated "
                    "Aug 5 2026 1200 UTC"
                ),
                "scrape_run_at_utc": pd.Timestamp("2026-08-05 12:30:00+0000"),
                "source_product_id": "WEIGHTED_DEGREE_DAY_FORECAST",
                "source_model": f"MF_{model}",
                "source_init_at_utc": source_init_at,
                "source_init_cycle": source_init_cycle,
                "model_run_cycle": model_run_cycle,
                "request_region": "NA",
                "entity_id": entity_id,
                "model": model,
                "forecast_type": "Daily",
                "bias_corrected": False,
                "forecast_period": f"Day {day_offset + 1}",
                "forecast_day": day_offset + 1,
                "forecast_date": first_forecast_date + timedelta(days=day_offset),
                "period_end_date": first_forecast_date + timedelta(days=day_offset),
                "metric_name": metric_name,
                "metric_value": float(day_offset),
                "metric_unit": "degree_day_f",
            }
        )
    return pd.DataFrame(rows, columns=daily_weighted_degree_day_forecast.OUTPUT_COLUMNS)


def _patch_model_run_logging(monkeypatch):
    monkeypatch.setattr(
        daily_weighted_forecasts.script_logging,
        "init_logging",
        lambda **_kwargs: _FakeRunLogger(),
    )
    monkeypatch.setattr(
        daily_weighted_forecasts.script_logging,
        "close_logging",
        lambda: None,
    )


def _empty_rows(*, issue_key: str, columns: list[str] | None = None) -> pd.DataFrame:
    df = pd.DataFrame(
        columns=columns or daily_weighted_temperature_forecast.OUTPUT_COLUMNS
    )
    df.attrs.update(
        {
            "source_issue_key": issue_key,
            "source_issue_at_utc": pd.Timestamp("2026-07-21 10:28:00+0000"),
            "source_banner": "WSI empty test fixture",
            "scrape_run_at_utc": pd.Timestamp("2026-07-21 10:44:00+0000"),
        }
    )
    return df


def test_daily_weighted_forecasts_main_runs_temperature_and_all_degree_models(
    monkeypatch,
):
    emitted: list[dict] = []
    degree_calls: list[dict] = []
    temp_df = _forecast_rows(
        dataset="temperature",
        issue_key="wsi:GetModelForecast:WSI:Daily:202607211028",
        entities=daily_weighted_temperature_forecast.DEFAULT_ENTITY_IDS,
        metrics=daily_weighted_temperature_forecast.EXPECTED_METRIC_NAMES,
    )

    def fake_degree_day_main(**kwargs):
        degree_calls.append(kwargs)
        model = kwargs["model"]
        return _forecast_rows(
            dataset="degree_day",
            issue_key=(
                f"wsi:GetWeightedDegreeDayForecast:{model}:Daily:202607211028"
            ),
            entities=daily_weighted_degree_day_forecast.DEFAULT_STATIONS,
            metrics=daily_weighted_degree_day_forecast.expected_metric_names_for_model(
                model
            ),
            model=model,
            bias_corrected=kwargs["bias_corrected"],
        )

    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_temperature_forecast,
        "main",
        lambda **_kwargs: temp_df,
    )
    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_degree_day_forecast,
        "main",
        fake_degree_day_main,
    )
    monkeypatch.setattr(
        daily_weighted_forecasts,
        "emit_data_availability_event",
        lambda **kwargs: emitted.append(kwargs)
        or {"event_key": kwargs["event_key"], "created": True},
    )

    result = daily_weighted_forecasts.main(database="helios_prod")

    assert set(result["events"]) == {"temperature", "degree_day"}
    assert list(result["degree_day_by_model"]) == (
        daily_weighted_degree_day_forecast.DEFAULT_MODELS
    )
    assert list(result["events"]["degree_day"]) == (
        daily_weighted_degree_day_forecast.DEFAULT_MODELS
    )
    assert result["degree_day"]["model"].drop_duplicates().tolist() == (
        daily_weighted_degree_day_forecast.DEFAULT_MODELS
    )
    assert [call["model"] for call in degree_calls] == (
        daily_weighted_degree_day_forecast.DEFAULT_MODELS
    )
    assert all(call["bias_corrected"] is False for call in degree_calls)
    assert emitted[0]["dataset"] == "wsi_daily_weighted_temperature_forecasts"
    assert [event["dataset"] for event in emitted[1:]] == [
        "wsi_daily_weighted_degree_day_forecasts"
    ] * len(daily_weighted_degree_day_forecast.DEFAULT_MODELS)
    assert [event["payload"]["model"] for event in emitted[1:]] == (
        daily_weighted_degree_day_forecast.DEFAULT_MODELS
    )
    assert all(event["payload"]["bias_corrected"] is False for event in emitted[1:])
    assert all(event["completeness_status"] == "complete" for event in emitted)
    assert emitted[0]["source_table"] == (
        "weather.wsi_daily_weighted_temperature_forecasts"
    )
    assert emitted[0]["scope"] == "NA"
    assert emitted[1]["source_table"] == (
        "weather.wsi_daily_weighted_degree_day_forecasts"
    )


def test_daily_weighted_forecasts_main_emits_partial_events_for_empty_results(
    monkeypatch,
):
    emitted: list[dict] = []
    temp_df = _empty_rows(issue_key="wsi:GetModelForecast:WSI:Daily:202607211028")

    def fake_degree_day_main(**kwargs):
        model = kwargs["model"]
        return _empty_rows(
            issue_key=(
                f"wsi:GetWeightedDegreeDayForecast:{model}:Daily:202607211028"
            ),
            columns=daily_weighted_degree_day_forecast.OUTPUT_COLUMNS,
        )

    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_temperature_forecast,
        "main",
        lambda **_kwargs: temp_df,
    )
    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_degree_day_forecast,
        "main",
        fake_degree_day_main,
    )
    monkeypatch.setattr(
        daily_weighted_forecasts,
        "emit_data_availability_event",
        lambda **kwargs: emitted.append(kwargs)
        or {"event_key": kwargs["event_key"], "created": True},
    )

    result = daily_weighted_forecasts.main(database="helios_prod")

    assert set(result["events"]) == {"temperature", "degree_day"}
    assert all(event["completeness_status"] == "partial" for event in emitted)
    assert [event["row_count"] for event in emitted] == [0] * (
        1 + len(daily_weighted_degree_day_forecast.DEFAULT_MODELS)
    )
    assert emitted[0]["payload"]["missing_entity_ids"] == sorted(
        daily_weighted_temperature_forecast.DEFAULT_ENTITY_IDS
    )
    assert emitted[0]["payload"]["missing_metric_names"] == sorted(
        daily_weighted_temperature_forecast.EXPECTED_METRIC_NAMES
    )
    assert emitted[1]["payload"]["missing_entity_ids"] == sorted(
        daily_weighted_degree_day_forecast.DEFAULT_STATIONS
    )
    assert [event["payload"]["model"] for event in emitted[1:]] == (
        daily_weighted_degree_day_forecast.DEFAULT_MODELS
    )


def test_daily_weighted_forecasts_attempts_remaining_degree_models_before_raising(
    monkeypatch,
):
    emitted: list[dict] = []
    degree_calls: list[str] = []
    selected_models = ["WSI", "GFS_OP", "AIFS"]
    temp_df = _forecast_rows(
        dataset="temperature",
        issue_key="wsi:GetModelForecast:WSI:Daily:202607211028",
        entities=daily_weighted_temperature_forecast.DEFAULT_ENTITY_IDS,
        metrics=daily_weighted_temperature_forecast.EXPECTED_METRIC_NAMES,
    )

    def fake_degree_day_main(**kwargs):
        model = kwargs["model"]
        degree_calls.append(model)
        if model == "GFS_OP":
            raise ValueError("source unavailable")
        return _forecast_rows(
            dataset="degree_day",
            issue_key=(
                f"wsi:GetWeightedDegreeDayForecast:{model}:Daily:202607211028"
            ),
            entities=daily_weighted_degree_day_forecast.DEFAULT_STATIONS,
            metrics=daily_weighted_degree_day_forecast.expected_metric_names_for_model(
                model
            ),
            model=model,
        )

    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_temperature_forecast,
        "main",
        lambda **_kwargs: temp_df,
    )
    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_degree_day_forecast,
        "main",
        fake_degree_day_main,
    )
    monkeypatch.setattr(
        daily_weighted_forecasts,
        "emit_data_availability_event",
        lambda **kwargs: emitted.append(kwargs)
        or {"event_key": kwargs["event_key"], "created": True},
    )

    with pytest.raises(RuntimeError, match="GFS_OP"):
        daily_weighted_forecasts.main(
            database="helios_prod",
            degree_day_models=selected_models,
        )

    assert degree_calls == selected_models
    assert [event["payload"].get("model") for event in emitted[1:]] == [
        "WSI",
        "AIFS",
    ]


def test_degree_day_model_run_poller_upserts_complete_first_attempt(monkeypatch):
    _patch_model_run_logging(monkeypatch)
    emitted: list[dict] = []
    poll_logs: list[dict] = []
    upserts: list[pd.DataFrame] = []
    complete = _model_run_rows()

    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_degree_day_forecast,
        "_pull",
        lambda **_kwargs: complete,
    )
    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_degree_day_forecast,
        "_upsert",
        lambda df, database=None: upserts.append(df),
    )
    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_degree_day_forecast,
        "_purge_old_rows",
        lambda **_kwargs: 0,
    )
    monkeypatch.setattr(
        daily_weighted_forecasts.client,
        "log_wsi_fetch_event",
        lambda **kwargs: poll_logs.append(kwargs),
    )
    monkeypatch.setattr(
        daily_weighted_forecasts,
        "emit_data_availability_event",
        lambda **kwargs: emitted.append(kwargs)
        or {"event_key": kwargs["event_key"], "created": True},
    )

    result = daily_weighted_forecasts.run_degree_day_model_run(
        model="GFS_OP",
        model_run_cycle="12Z",
        database="helios_prod",
        expected_entities=["CONUS"],
        expected_metric_names=["electric_cdd"],
        poll_ceiling_seconds=0,
        poll_wait_seconds=0,
    )

    assert result is complete
    assert len(upserts) == 1
    assert upserts[0] is complete
    assert poll_logs[0]["status"] == "success"
    assert poll_logs[0]["operation_name"] == (
        "wsi_daily_weighted_degree_day_forecasts_model_run_poll"
    )
    assert poll_logs[0]["metadata"]["model_run_cycle"] == "12Z"
    assert poll_logs[0]["metadata"]["expected_source_init_cycle"] == "12Z"
    assert emitted[0]["completeness_status"] == "complete"
    assert emitted[0]["payload"]["model"] == "GFS_OP"
    assert emitted[0]["payload"]["model_run_cycle"] == "12Z"
    assert emitted[0]["run_id"] is not None


def test_degree_day_model_run_poller_retries_until_complete(monkeypatch):
    _patch_model_run_logging(monkeypatch)
    incomplete = _model_run_rows(day_count=14)
    complete = _model_run_rows()
    pulls = [incomplete, complete]
    upserts: list[pd.DataFrame] = []

    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_degree_day_forecast,
        "_pull",
        lambda **_kwargs: pulls.pop(0),
    )
    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_degree_day_forecast,
        "_upsert",
        lambda df, database=None: upserts.append(df),
    )
    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_degree_day_forecast,
        "_purge_old_rows",
        lambda **_kwargs: 0,
    )
    monkeypatch.setattr(
        daily_weighted_forecasts.client,
        "log_wsi_fetch_event",
        lambda **_kwargs: None,
    )
    monkeypatch.setattr(
        daily_weighted_forecasts,
        "emit_data_availability_event",
        lambda **kwargs: {"event_key": kwargs["event_key"], "created": True},
    )

    result = daily_weighted_forecasts.run_degree_day_model_run(
        model="GFS_OP",
        model_run_cycle="12Z",
        database="helios_prod",
        expected_entities=["CONUS"],
        expected_metric_names=["electric_cdd"],
        poll_ceiling_seconds=60,
        poll_wait_seconds=0,
    )

    assert result is complete
    assert len(upserts) == 1
    assert upserts[0] is complete
    assert pulls == []


def test_degree_day_model_run_timeout_does_not_upsert_partial(monkeypatch):
    _patch_model_run_logging(monkeypatch)
    emitted: list[dict] = []
    poll_logs: list[dict] = []
    upserts: list[pd.DataFrame] = []
    incomplete = _model_run_rows(day_count=14)

    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_degree_day_forecast,
        "_pull",
        lambda **_kwargs: incomplete,
    )
    monkeypatch.setattr(
        daily_weighted_forecasts.daily_weighted_degree_day_forecast,
        "_upsert",
        lambda df, database=None: upserts.append(df),
    )
    monkeypatch.setattr(
        daily_weighted_forecasts.client,
        "log_wsi_fetch_event",
        lambda **kwargs: poll_logs.append(kwargs),
    )
    monkeypatch.setattr(
        daily_weighted_forecasts,
        "emit_data_availability_event",
        lambda **kwargs: emitted.append(kwargs)
        or {"event_key": kwargs["event_key"], "created": True},
    )

    with pytest.raises(
        daily_weighted_forecasts.DegreeDayModelRunNotAvailable,
        match="not complete",
    ):
        daily_weighted_forecasts.run_degree_day_model_run(
            model="GFS_OP",
            model_run_cycle="12Z",
            database="helios_prod",
            expected_entities=["CONUS"],
            expected_metric_names=["electric_cdd"],
            poll_ceiling_seconds=0,
            poll_wait_seconds=0,
        )

    assert upserts == []
    assert poll_logs[0]["status"] == "failure"
    assert poll_logs[0]["error_type"] == "DegreeDayModelRunNotAvailable"
    assert emitted[0]["completeness_status"] == "partial"
    assert emitted[0]["payload"]["actual_forecast_day_count"] == 14
    assert emitted[0]["payload"]["model_run_cycle"] == "12Z"


def test_degree_day_model_run_wrong_cycle_is_not_available(monkeypatch):
    wrong_cycle = _model_run_rows(source_init_cycle="06Z", model_run_cycle="12Z")

    availability = daily_weighted_forecasts._degree_day_model_run_availability(
        df=wrong_cycle,
        model="GFS_OP",
        model_run_cycle="12Z",
        bias_corrected=False,
        expected_entities=["CONUS"],
        expected_metric_names=["electric_cdd"],
        expected_forecast_days=15,
    )

    assert availability["is_complete"] is False
    assert availability["missing_source_init_cycles"] == ["12Z"]
    assert availability["unexpected_source_init_cycles"] == ["06Z"]


def test_degree_day_model_run_instance_parses_model_and_cycle():
    assert daily_weighted_forecasts._parse_degree_day_model_run_instance(
        "GFS_OP-00Z"
    ) == ("GFS_OP", "00Z")


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


def test_daily_weighted_forecast_event_marks_gapped_horizon_partial(monkeypatch):
    emitted: list[dict] = []
    df = _forecast_rows(
        dataset="temperature",
        issue_key="wsi:GetModelForecast:WSI:Daily:202607211028",
        entities=["PJM"],
        metrics=daily_weighted_temperature_forecast.EXPECTED_METRIC_NAMES,
        day_count=16,
    )
    df = df[df["forecast_date"] != date(2026, 7, 25)].reset_index(drop=True)

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
    assert emitted[0]["payload"]["actual_forecast_day_count"] == 15
    assert emitted[0]["payload"]["missing_forecast_dates"] == ["2026-07-25"]
    assert emitted[0]["payload"]["unexpected_forecast_dates"] == ["2026-08-05"]
