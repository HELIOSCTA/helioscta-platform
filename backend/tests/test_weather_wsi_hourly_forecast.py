from __future__ import annotations

from datetime import UTC, datetime

import pandas as pd

from backend.scrapes.weather.wsi import hourly_forecast


def test_wsi_hourly_forecast_normalizes_live_shape():
    df = hourly_forecast.normalize_hourly_forecast_frame(
        pd.DataFrame(
            [
                {
                    "UTC Time": "6/18/2026 4:00:00 AM",
                    "Temp": "78.08",
                    "TempDiff": "4.5",
                    "TempNormal": "73.5",
                    "DewPoint": "66.2",
                    "Cloud Cover": "75",
                    "FeelsLikeTemp": "80.1",
                    "FeelsLikeTempDiff": "5.2",
                    "Precip": "0.01",
                    "WindDir": "220",
                    "WindSpeed(mph)": "12",
                    "GHIrradiance": "0",
                    "POP": "35",
                    "Relative Humidity (RH)": "71",
                }
            ]
        ),
        region="PJM",
        station_id="KDCA",
        station_name="Washington",
        source_banner="NA-KDCA , Hourly Forecast Made Jun 18 2026 1028 UTC",
        scrape_run_at_utc=datetime(2026, 6, 18, 10, 30, tzinfo=UTC),
    )

    assert df.to_dict("records") == [
        {
            "station_id": "KDCA",
            "station_name": "Washington",
            "region": "PJM",
            "forecast_issued_at_utc": pd.Timestamp("2026-06-18 10:28:00+0000"),
            "forecast_time_utc": pd.Timestamp("2026-06-18 04:00:00+0000"),
            "temp_f": 78.08,
            "temp_diff_f": 4.5,
            "temp_normal_f": 73.5,
            "dew_point_f": 66.2,
            "cloud_cover_pct": 75,
            "feels_like_f": 80.1,
            "feels_like_diff_f": 5.2,
            "precip_in": 0.01,
            "wind_dir_degrees": 220,
            "wind_speed_mph": 12,
            "ghi_irradiance": 0,
            "probability_of_precip_pct": 35,
            "relative_humidity_pct": 71,
            "source_product_id": "HOURLY_FORECAST",
            "source_banner": "NA-KDCA , Hourly Forecast Made Jun 18 2026 1028 UTC",
            "scrape_run_at_utc": pd.Timestamp("2026-06-18 10:30:00+0000"),
        }
    ]


def test_wsi_hourly_forecast_parses_sectioned_multi_station_response():
    text = """NA-KDCA , Hourly Forecast Made Jun 18 2026 1028 UTC
UTC Time, Temp, DewPoint
6/18/2026 4:00:00 AM,78,66
NA-KPHL , Hourly Forecast Made Jun 18 2026 1028 UTC
UTC Time, Temp, DewPoint
6/18/2026 4:00:00 AM,79,65
"""

    df = hourly_forecast.parse_hourly_forecast_text(
        text,
        region="PJM",
        station_names={"KDCA": "Washington", "KPHL": "Philadelphia"},
        scrape_run_at_utc=datetime(2026, 6, 18, 10, 30, tzinfo=UTC),
    )

    assert df[["station_id", "station_name", "temp_f", "dew_point_f"]].to_dict(
        "records"
    ) == [
        {
            "station_id": "KDCA",
            "station_name": "Washington",
            "temp_f": 78,
            "dew_point_f": 66,
        },
        {
            "station_id": "KPHL",
            "station_name": "Philadelphia",
            "temp_f": 79,
            "dew_point_f": 65,
        },
    ]


def test_wsi_hourly_forecast_pull_uses_batched_site_ids(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_get_text(**kwargs):
        captured.append(kwargs)
        ids = kwargs["params"]["SiteIds[]"]
        return "\n".join(
            [
                "\n".join(
                    [
                        f"NA-{station_id} , Hourly Forecast Made Jun 18 2026 1028 UTC",
                        "UTC Time, Temp",
                        "6/18/2026 4:00:00 AM,78",
                    ]
                )
                for station_id in ids
            ]
        )

    monkeypatch.setattr(hourly_forecast.client._HTTP_CLIENT, "get_text", fake_get_text)
    df = hourly_forecast._pull(
        region="PJM",
        stations={"KDCA": "Washington", "KPHL": "Philadelphia", "KPIT": "Pittsburgh"},
        run_id="run-1",
        database="helios_prod",
        scrape_run_at_utc=datetime(2026, 6, 18, 10, 30, tzinfo=UTC),
        batch_size=2,
    )

    assert len(captured) == 2
    assert captured[0]["operation_name"] == "GetHourlyForecast"
    assert captured[0]["target_table"] == "weather.wsi_hourly_forecasts"
    assert captured[0]["params"]["SiteIds[]"] == ["KDCA", "KPHL"]
    assert captured[1]["params"]["SiteIds[]"] == ["KPIT"]
    assert set(df["station_id"]) == {"KDCA", "KPHL", "KPIT"}
