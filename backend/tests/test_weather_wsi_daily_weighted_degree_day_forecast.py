from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import pytest

from backend.scrapes.weather.wsi import daily_weighted_degree_day_forecast as scrape

FIXTURE_PATH = (
    Path(__file__).parent
    / "fixtures"
    / "wsi"
    / "daily_weighted_degree_day_forecast.csv"
)
SCRAPE_RUN_AT = datetime(2026, 7, 21, 10, 44, tzinfo=timezone.utc)


def _fixture_text() -> str:
    return FIXTURE_PATH.read_text(encoding="utf-8")


def test_daily_weighted_degree_day_forecast_normalizes_long_form_metrics():
    df = scrape.parse_daily_weighted_degree_day_forecast_text(
        _fixture_text(),
        scrape_run_at_utc=SCRAPE_RUN_AT,
    )

    assert len(df) == 64
    assert set(df["entity_id"]) == {"CONUS", "EAST"}
    assert set(df["metric_name"]) == set(scrape.EXPECTED_METRIC_NAMES)
    assert df["source_issue_key"].unique().tolist() == [
        "wsi:GetWeightedDegreeDayForecast:WSI:Daily:202607211028"
    ]

    conus_gas_cdd = df[
        (df["entity_id"] == "CONUS") & (df["metric_name"] == "gas_cdd")
    ].iloc[0]
    assert conus_gas_cdd.to_dict() == {
        "source_issue_key": (
            "wsi:GetWeightedDegreeDayForecast:WSI:Daily:202607211028"
        ),
        "source_issue_at_utc": pd.Timestamp("2026-07-21 10:28:00+0000"),
        "source_banner": (
            "WSI Weighted Degree Day Forecast - Forecast Updated "
            "Jul 21 2026 1028 UTC"
        ),
        "scrape_run_at_utc": pd.Timestamp(SCRAPE_RUN_AT),
        "source_product_id": "WEIGHTED_DEGREE_DAY_FORECAST",
        "request_region": "NA",
        "entity_id": "CONUS",
        "model": "WSI",
        "forecast_type": "Daily",
        "bias_corrected": False,
        "forecast_period": "Day 1",
        "forecast_date": date(2026, 7, 21),
        "period_end_date": date(2026, 7, 21),
        "metric_name": "gas_cdd",
        "metric_value": 12.2,
        "metric_unit": "degree_day_f",
    }


def test_daily_weighted_degree_day_pull_uses_expected_request_params(monkeypatch):
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
    assert captured[0]["operation_name"] == "GetWeightedDegreeDayForecast"
    assert captured[0]["target_table"] == (
        "weather.wsi_daily_weighted_degree_day_forecasts"
    )
    assert captured[0]["params"] == {
        "Region": "NA",
        "ForecastType": "Daily",
        "Model": "WSI",
        "BiasCorrected": "false",
        "stations[]": scrape.DEFAULT_STATIONS,
        "datatypes[]": scrape.DEFAULT_DATA_TYPES,
    }
    assert captured[0]["metadata"]["stations"] == scrape.DEFAULT_STATIONS
    assert captured[0]["metadata"]["data_types"] == scrape.DEFAULT_DATA_TYPES
    assert captured[0]["metadata"]["run_mode"] == "test"


def test_daily_weighted_degree_day_valid_empty_csv_preserves_issue_context():
    lines = _fixture_text().splitlines()
    text = "\n".join(lines[:2]) + "\n"

    df = scrape.parse_daily_weighted_degree_day_forecast_text(
        text,
        scrape_run_at_utc=SCRAPE_RUN_AT,
    )

    assert df.empty
    assert df.columns.tolist() == scrape.OUTPUT_COLUMNS
    assert df.attrs["source_issue_key"] == (
        "wsi:GetWeightedDegreeDayForecast:WSI:Daily:202607211028"
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


def test_daily_weighted_degree_day_parse_failure_logs_fetch_failure(monkeypatch):
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        scrape.client._HTTP_CLIENT,
        "get_text",
        lambda **_kwargs: (
            "WSI Weighted Degree Day Forecast - Forecast Updated "
            "Jul 21 2026 1028 UTC\nsite_id,period\nCONUS,Day 1\n"
        ),
    )
    monkeypatch.setattr(
        scrape.client,
        "log_wsi_fetch_event",
        lambda **kwargs: captured.append(kwargs),
    )

    with pytest.raises(ValueError, match="missing required columns"):
        scrape._pull(
            run_id="run-1",
            database="helios_prod",
            scrape_run_at_utc=SCRAPE_RUN_AT,
        )

    assert captured[0]["status"] == "failure"
    assert captured[0]["http_status"] == 200
    assert captured[0]["operation_name"] == "GetWeightedDegreeDayForecast"
    assert captured[0]["metadata"]["telemetry_stage"] == (
        "parse_daily_weighted_degree_day_csv"
    )


def test_daily_weighted_degree_day_upsert_uses_long_form_primary_key(monkeypatch):
    captured: dict[str, object] = {}
    df = scrape.parse_daily_weighted_degree_day_forecast_text(
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
    assert captured["table_name"] == "wsi_daily_weighted_degree_day_forecasts"
    assert captured["columns"] == scrape.OUTPUT_COLUMNS
    assert captured["data_types"] == scrape.SQL_DATA_TYPES
    assert captured["primary_key"] == scrape.PRIMARY_KEY
    assert captured["database"] == "helios_prod"


def test_daily_weighted_degree_day_retention_uses_source_issue_fallback(monkeypatch):
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        scrape.common,
        "purge_rows_older_than_source_issue_or_scrape",
        lambda **kwargs: captured.update(kwargs) or 4,
    )

    deleted_rows = scrape._purge_old_rows(database="helios_prod")

    assert deleted_rows == 4
    assert captured == {
        "schema": "weather",
        "table_name": "wsi_daily_weighted_degree_day_forecasts",
        "retention_days": 90,
        "database": "helios_prod",
    }
