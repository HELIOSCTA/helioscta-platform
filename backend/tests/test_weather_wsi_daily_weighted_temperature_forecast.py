from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import pytest

from backend.scrapes.weather.wsi import daily_weighted_temperature_forecast as scrape

FIXTURE_PATH = (
    Path(__file__).parent
    / "fixtures"
    / "wsi"
    / "daily_weighted_temperature_forecast.csv"
)
SCRAPE_RUN_AT = datetime(2026, 7, 21, 10, 44, tzinfo=timezone.utc)


def _fixture_text() -> str:
    return FIXTURE_PATH.read_text(encoding="utf-8")


def test_daily_weighted_temperature_forecast_normalizes_all_regions_long_form():
    df = scrape.parse_daily_weighted_temperature_forecast_text(
        _fixture_text(),
        scrape_run_at_utc=SCRAPE_RUN_AT,
    )

    assert len(df) == 20
    assert df["entity_id"].unique().tolist() == ["NEISO", "PJM"]
    assert set(df["metric_name"]) == set(scrape.EXPECTED_METRIC_NAMES)
    assert df["source_issue_key"].unique().tolist() == [
        "wsi:GetModelForecast:WSI:Daily:202607211028"
    ]

    day_one = df[
        (df["entity_id"] == "PJM")
        & (df["forecast_date"] == date(2026, 7, 21))
        & (df["metric_name"] == "max_temp_f")
    ].iloc[0]
    assert day_one.to_dict() == {
        "source_issue_key": "wsi:GetModelForecast:WSI:Daily:202607211028",
        "source_issue_at_utc": pd.Timestamp("2026-07-21 10:28:00+0000"),
        "source_banner": (
            "WSI ISO Region Weighted Forecast - Forecast Updated "
            "Jul 21 2026 1028 UTC"
        ),
        "scrape_run_at_utc": pd.Timestamp(SCRAPE_RUN_AT),
        "source_product_id": "WEIGHTED_TEMPERATURE_FORECAST",
        "request_region": "NA",
        "entity_id": "PJM",
        "model": "WSI",
        "forecast_type": "Daily",
        "temp_units": "F",
        "bias_corrected": False,
        "all_regions": True,
        "forecast_period": "Day 1",
        "forecast_date": date(2026, 7, 21),
        "metric_name": "max_temp_f",
        "metric_value": 85.0,
        "metric_unit": "fahrenheit",
    }


def test_daily_weighted_temperature_forecast_fallback_issue_key_is_hourly():
    text = _fixture_text().replace(
        "WSI ISO Region Weighted Forecast - Forecast Updated Jul 21 2026 1028 UTC",
        "WSI ISO Region Weighted Forecast",
    )

    df = scrape.parse_daily_weighted_temperature_forecast_text(
        text,
        scrape_run_at_utc=SCRAPE_RUN_AT,
    )

    assert df["source_issue_at_utc"].isna().all()
    assert df["source_issue_key"].unique().tolist() == [
        "wsi:GetModelForecast:WSI:Daily:202607211000"
    ]


def test_daily_weighted_temperature_valid_empty_filter_preserves_issue_context():
    df = scrape.parse_daily_weighted_temperature_forecast_text(
        _fixture_text(),
        entity_ids=["MISO"],
        scrape_run_at_utc=SCRAPE_RUN_AT,
    )

    assert df.empty
    assert df.columns.tolist() == scrape.OUTPUT_COLUMNS
    assert df.attrs["source_issue_key"] == (
        "wsi:GetModelForecast:WSI:Daily:202607211028"
    )
    assert df.attrs["source_issue_at_utc"] == datetime(
        2026,
        7,
        21,
        10,
        28,
        tzinfo=timezone.utc,
    )
    assert df.attrs["scrape_run_at_utc"] == SCRAPE_RUN_AT


def test_daily_weighted_temperature_pull_uses_expected_request_params(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_get_text(**kwargs):
        captured.append(kwargs)
        return _fixture_text()

    monkeypatch.setattr(scrape.client._HTTP_CLIENT, "get_text", fake_get_text)

    df = scrape._pull(
        run_id="run-1",
        database="helios_prod",
        scrape_run_at_utc=SCRAPE_RUN_AT,
        metadata={"run_mode": "test"},
    )

    assert df is not None
    assert captured[0]["operation_name"] == "GetModelForecast"
    assert captured[0]["target_table"] == (
        "weather.wsi_daily_weighted_temperature_forecasts"
    )
    assert captured[0]["params"] == {
        "Region": "NA",
        "ForecastType": "Daily",
        "Model": "WSI",
        "TempUnits": "F",
        "BiasCorrected": "false",
        "allregions": "true",
        "ShowDifferences": "false",
    }
    assert captured[0]["metadata"]["entity_ids"] == scrape.DEFAULT_ENTITY_IDS
    assert captured[0]["metadata"]["run_mode"] == "test"


def test_daily_weighted_temperature_forecast_default_entities_are_all_regions():
    assert len(scrape.DEFAULT_ENTITY_IDS) == 25
    assert {"PJM", "MISO", "ERCOT", "CAISO", "US NATIONAL"} <= set(
        scrape.DEFAULT_ENTITY_IDS
    )


def test_daily_weighted_temperature_parse_failure_logs_fetch_failure(monkeypatch):
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        scrape.client._HTTP_CLIENT,
        "get_text",
        lambda **_kwargs: "WSI ISO Region Weighted Forecast\nPJM\nnot a header\n",
    )
    monkeypatch.setattr(
        scrape.client,
        "log_wsi_fetch_event",
        lambda **kwargs: captured.append(kwargs),
    )

    with pytest.raises(ValueError, match="unexpected header"):
        scrape._pull(
            run_id="run-1",
            database="helios_prod",
            scrape_run_at_utc=SCRAPE_RUN_AT,
        )

    assert captured[0]["status"] == "failure"
    assert captured[0]["http_status"] == 200
    assert captured[0]["operation_name"] == "GetModelForecast"
    assert captured[0]["metadata"]["telemetry_stage"] == (
        "parse_daily_weighted_temperature_csv"
    )


def test_daily_weighted_temperature_short_metric_row_logs_parse_failure(monkeypatch):
    captured: list[dict[str, object]] = []
    malformed = _fixture_text().replace(
        "Day 1-7/21/2026,71,85,0,13.1,89,",
        "Day 1-7/21/2026,71,85,0,13.1",
    )

    monkeypatch.setattr(
        scrape.client._HTTP_CLIENT,
        "get_text",
        lambda **_kwargs: malformed,
    )
    monkeypatch.setattr(
        scrape.client,
        "log_wsi_fetch_event",
        lambda **kwargs: captured.append(kwargs),
    )

    with pytest.raises(ValueError, match="has 4 metric values; expected 5"):
        scrape._pull(
            run_id="run-1",
            database="helios_prod",
            scrape_run_at_utc=SCRAPE_RUN_AT,
        )

    assert captured[0]["status"] == "failure"
    assert captured[0]["operation_name"] == "GetModelForecast"
    assert captured[0]["metadata"]["telemetry_stage"] == (
        "parse_daily_weighted_temperature_csv"
    )


def test_daily_weighted_temperature_upsert_uses_long_form_primary_key(monkeypatch):
    captured: dict[str, object] = {}
    df = scrape.parse_daily_weighted_temperature_forecast_text(
        _fixture_text(),
        scrape_run_at_utc=SCRAPE_RUN_AT,
    )

    monkeypatch.setattr(
        scrape.db,
        "upsert_dataframe",
        lambda **kwargs: captured.update(kwargs),
    )

    scrape._upsert(df, database="helios_prod")

    assert captured["schema"] == "weather"
    assert captured["table_name"] == "wsi_daily_weighted_temperature_forecasts"
    assert captured["columns"] == scrape.OUTPUT_COLUMNS
    assert captured["data_types"] == scrape.SQL_DATA_TYPES
    assert captured["primary_key"] == scrape.PRIMARY_KEY
    assert captured["database"] == "helios_prod"


def test_daily_weighted_temperature_retention_uses_source_issue_fallback(monkeypatch):
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        scrape.common,
        "purge_rows_older_than_source_issue_or_scrape",
        lambda **kwargs: captured.update(kwargs) or 3,
    )

    deleted_rows = scrape._purge_old_rows(database="helios_prod")

    assert deleted_rows == 3
    assert captured == {
        "schema": "weather",
        "table_name": "wsi_daily_weighted_temperature_forecasts",
        "retention_days": 90,
        "database": "helios_prod",
    }
