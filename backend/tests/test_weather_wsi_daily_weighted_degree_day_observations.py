from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import pytest

from backend.scrapes.weather.wsi import daily_weighted_degree_day_observations as scrape

FIXTURE_PATH = (
    Path(__file__).parent
    / "fixtures"
    / "wsi"
    / "daily_weighted_degree_day_observations.csv"
)
SCRAPE_RUN_AT = datetime(2026, 7, 21, 10, 44, tzinfo=timezone.utc)
START_DATE = date(2026, 7, 14)
END_DATE = date(2026, 7, 21)


def _fixture_text() -> str:
    return FIXTURE_PATH.read_text(encoding="utf-8")


def test_daily_weighted_degree_day_observations_normalizes_long_form():
    df = scrape.parse_daily_weighted_degree_day_observations_text(
        _fixture_text(),
        request_start_date=START_DATE,
        request_end_date=END_DATE,
        scrape_run_at_utc=SCRAPE_RUN_AT,
    )

    assert len(df) == 32
    assert set(df["entity_id"]) == {"CONUS", "EAST"}
    assert set(df["metric_name"]) == set(scrape.EXPECTED_METRIC_NAMES)

    conus_gas_cdd = df[
        (df["entity_id"] == "CONUS")
        & (df["observation_date"] == date(2026, 7, 14))
        & (df["metric_name"] == "gas_cdd")
    ].iloc[0]
    assert conus_gas_cdd.to_dict() == {
        "source_product_id": "HISTORICAL_WEIGHTED_DEGREEDAYS",
        "source_banner": "Historical Weighted Degree Day Observations",
        "scrape_run_at_utc": pd.Timestamp(SCRAPE_RUN_AT),
        "request_start_date": START_DATE,
        "request_end_date": END_DATE,
        "request_region": "NA",
        "entity_id": "CONUS",
        "temp_units": "F",
        "is_daily": True,
        "is_temp": True,
        "is_display_dates": True,
        "observation_date": date(2026, 7, 14),
        "metric_name": "gas_cdd",
        "metric_value": 13.1,
        "metric_unit": "degree_day_f",
    }


def test_daily_weighted_degree_day_observations_pull_uses_expected_params(
    monkeypatch,
):
    captured: list[dict[str, object]] = []

    def fake_get_text(**kwargs):
        captured.append(kwargs)
        return _fixture_text()

    monkeypatch.setattr(scrape.client._HTTP_CLIENT, "get_text", fake_get_text)

    df = scrape._pull(
        start_date=START_DATE,
        end_date=END_DATE,
        run_id="run-1",
        database="helios_prod",
        scrape_run_at_utc=SCRAPE_RUN_AT,
        metadata={"run_mode": "test"},
    )

    assert len(df) == 32
    assert captured[0]["operation_name"] == "GetHistoricalObservations"
    assert captured[0]["target_table"] == (
        "weather.wsi_daily_weighted_degree_day_observations"
    )
    assert captured[0]["params"] == {
        "StartDate": "07/14/2026",
        "EndDate": "07/21/2026",
        "CityIds[]": scrape.DEFAULT_STATIONS,
        "HistoricalProductID": "HISTORICAL_WEIGHTED_DEGREEDAYS",
        "DataTypes[]": scrape.DEFAULT_DATA_TYPES,
        "TempUnits": "F",
        "IsDaily": "true",
        "IsTemp": "true",
        "IsDisplayDates": "true",
    }
    assert captured[0]["metadata"]["run_mode"] == "test"


def test_daily_weighted_degree_day_observations_parse_failure_logs_fetch_failure(
    monkeypatch,
):
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        scrape.client._HTTP_CLIENT,
        "get_text",
        lambda **_kwargs: (
            "Historical Weighted Degree Day Observations\n"
            "site_id,electric_cdd\nCONUS,13.9\n"
        ),
    )
    monkeypatch.setattr(
        scrape.client,
        "log_wsi_fetch_event",
        lambda **kwargs: captured.append(kwargs),
    )

    with pytest.raises(ValueError, match="missing required columns"):
        scrape._pull(
            start_date=START_DATE,
            end_date=END_DATE,
            run_id="run-1",
            database="helios_prod",
            scrape_run_at_utc=SCRAPE_RUN_AT,
        )

    assert captured[0]["status"] == "failure"
    assert captured[0]["http_status"] == 200
    assert captured[0]["operation_name"] == "GetHistoricalObservations"
    assert captured[0]["metadata"]["telemetry_stage"] == (
        "parse_daily_weighted_degree_day_observations_csv"
    )


def test_daily_weighted_degree_day_observations_upsert_uses_primary_key(
    monkeypatch,
):
    captured: dict[str, object] = {}
    df = scrape.parse_daily_weighted_degree_day_observations_text(
        _fixture_text(),
        request_start_date=START_DATE,
        request_end_date=END_DATE,
        scrape_run_at_utc=SCRAPE_RUN_AT,
    )

    monkeypatch.setattr(
        scrape.db,
        "upsert_dataframe",
        lambda **kwargs: captured.update(kwargs),
    )

    scrape._upsert(df, database="helios_prod")

    assert captured["schema"] == "weather"
    assert captured["table_name"] == "wsi_daily_weighted_degree_day_observations"
    assert captured["columns"] == scrape.OUTPUT_COLUMNS
    assert captured["data_types"] == scrape.SQL_DATA_TYPES
    assert captured["primary_key"] == scrape.PRIMARY_KEY
    assert captured["database"] == "helios_prod"
