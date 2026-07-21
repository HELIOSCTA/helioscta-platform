from __future__ import annotations

from datetime import datetime

import pandas as pd
import pytest

from backend.scrapes.weather.wsi import client, hourly_observed


def test_wsi_hourly_observed_normalizes_live_shape():
    df = hourly_observed.normalize_hourly_observed_frame(
        pd.DataFrame(
            [
                {
                    "Date": "06/17/2026",
                    "Hour": "13",
                    "Temperature": "84",
                    "Dewpoint": "64",
                    "Cloud Cover": "25%",
                    "Wind Direction": "220",
                    "Wind Speed": "12",
                    "Heat Index": "86",
                    "Wind Chill": "",
                    "Relative Humidity": "52",
                    "Precipitation": "0.01",
                }
            ]
        ),
        region="PJM",
        station_id="KDCA",
        station_name="Washington",
        source_updated_at=datetime(2026, 6, 17, 19, 30),
    )

    assert df.to_dict("records") == [
        {
            "station_id": "KDCA",
            "station_name": "Washington",
            "region": "PJM",
            "observation_date": pd.Timestamp("2026-06-17").date(),
            "hour_beginning": 13,
            "observation_time_local": pd.Timestamp("2026-06-17 13:00:00"),
            "temp_f": 84,
            "dew_point_f": 64,
            "feels_like_f": 86,
            "wind_chill_f": None,
            "heat_index_f": 86,
            "wind_speed_mph": 12,
            "wind_dir_degrees": 220,
            "relative_humidity_pct": 52,
            "cloud_cover_pct": 25,
            "precip_in": 0.01,
            "source_product_id": "HISTORICAL_HOURLY_OBSERVED",
            "source_updated_at": pd.Timestamp("2026-06-17 19:30:00+0000", tz="UTC"),
        }
    ]


def test_wsi_credentials_contract(monkeypatch):
    monkeypatch.setattr(client.credentials, "WSI_TRADER_USERNAME", None)
    monkeypatch.setattr(client.credentials, "WSI_TRADER_NAME", "profile")
    monkeypatch.setattr(client.credentials, "WSI_TRADER_PASSWORD", "password")

    assert not client.wsi_credentials_available()


def test_wsi_csv_parse_failure_logs_fetch_failure(monkeypatch):
    captured: list[dict[str, object]] = []

    class FakeHttpClient:
        def get_text(self, **_kwargs):
            return "Unexpected,Columns\n1,2\n"

    monkeypatch.setattr(
        client,
        "log_wsi_fetch_event",
        lambda **kwargs: captured.append(kwargs),
    )

    with pytest.raises(ValueError, match="missing required columns"):
        client.read_wsi_csv(
            base_url="https://www.wsitrader.com/Services/GetHistoricalObservations",
            params={},
            skiprows=0,
            required_columns=["Date", "Hour"],
            pipeline_name="wsi_hourly_observed_temperatures",
            operation_name="GetHistoricalObservations",
            target_table="weather.wsi_hourly_observed_temperatures",
            run_id="run-1",
            feed_name="wsi_hourly_observed_temperatures",
            database="helios_prod",
            metadata={"region": "PJM"},
            http_client=FakeHttpClient(),
        )

    assert captured[0]["status"] == "failure"
    assert captured[0]["http_status"] == 200
    assert captured[0]["operation_name"] == "GetHistoricalObservations"
    assert captured[0]["metadata"] == {
        "region": "PJM",
        "telemetry_stage": "parse_csv",
    }


def test_wsi_hourly_observed_pull_uses_station_metadata(monkeypatch):
    captured: dict[str, object] = {}

    def fake_read_wsi_csv(**kwargs):
        captured.update(kwargs)
        return pd.DataFrame([{"Date": "06/17/2026", "Hour": 1, "Temperature": 70}])

    monkeypatch.setattr(hourly_observed.client, "read_wsi_csv", fake_read_wsi_csv)
    df = hourly_observed._pull(
        start_date=datetime(2026, 6, 17),
        end_date=datetime(2026, 6, 17),
        region="PJM",
        stations={"KDCA": "Washington"},
        run_id="run-1",
        database="helios_prod",
    )

    assert captured["operation_name"] == "GetHistoricalObservations"
    assert captured["target_table"] == "weather.wsi_hourly_observed_temperatures"
    assert captured["metadata"]["station_id"] == "KDCA"
    assert df[["station_id", "station_name", "region"]].to_dict("records") == [
        {"station_id": "KDCA", "station_name": "Washington", "region": "PJM"}
    ]
