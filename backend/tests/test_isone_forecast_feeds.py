from __future__ import annotations

import pandas as pd

from backend.scrapes.power.isone import forecast_feeds


def test_isone_forecast_feed_configs_target_contracts():
    assert set(forecast_feeds.FEED_CONFIGS) == {
        "three_day_reliability_region_demand_forecast",
        "seven_day_capacity_forecast",
        "seven_day_wind_forecast",
        "seven_day_solar_forecast",
    }
    for name, config in forecast_feeds.FEED_CONFIGS.items():
        assert config.feed_name == name
        assert config.target_table_fqn == f"isone.{name}"
        assert config.hot_retention_days == 90

    assert (
        forecast_feeds.FEED_CONFIGS[
            "three_day_reliability_region_demand_forecast"
        ].hot_retention_column
        == "published_date"
    )
    assert (
        forecast_feeds.FEED_CONFIGS["seven_day_capacity_forecast"].hot_retention_column
        == "forecast_execution_date"
    )


def test_isone_retention_purge_uses_config(monkeypatch):
    config = forecast_feeds.FEED_CONFIGS["seven_day_wind_forecast"]
    captured: dict[str, object] = {}

    class FakeLogger:
        def section(self, message):
            captured["message"] = message

    def fake_purge_rows_older_than(**kwargs):
        captured.update(kwargs)
        return 9

    monkeypatch.setattr(
        forecast_feeds.retention,
        "purge_rows_older_than",
        fake_purge_rows_older_than,
    )

    deleted_rows = forecast_feeds._purge_retention_if_configured(
        config=config,
        database="helios_prod",
        rows_processed=1,
        run_logger=FakeLogger(),
    )

    assert deleted_rows == 9
    assert captured["schema"] == "isone"
    assert captured["table_name"] == "seven_day_wind_forecast"
    assert captured["timestamp_column"] == "forecast_execution_date"
    assert captured["retention_days"] == 90
    assert captured["database"] == "helios_prod"


def test_reliability_region_demand_forecast_format():
    config = forecast_feeds.FEED_CONFIGS[
        "three_day_reliability_region_demand_forecast"
    ]
    df = forecast_feeds._format(
        config=config,
        start_date=pd.Timestamp("2026-06-13"),
        df=pd.DataFrame(
            [
                {
                    "H": "D",
                    "Forecast Date": "06/13/2026",
                    "Hour": "01",
                    "Reliability Region": ".Z.CONNECTICUT",
                    "MW": "3704.035",
                    "%": "23.668",
                    "Published Date": "06/12/2026 16:18:32",
                }
            ]
        ),
    )

    assert df.to_dict("records") == [
        {
            "published_date": pd.Timestamp("2026-06-12 16:18:32"),
            "forecast_date": pd.Timestamp("2026-06-13").date(),
            "hour_ending": 1,
            "reliability_region": ".Z.CONNECTICUT",
            "mw": 3704.035,
            "percentage": 23.668,
        }
    ]


def test_capacity_forecast_format_transposes_report():
    config = forecast_feeds.FEED_CONFIGS["seven_day_capacity_forecast"]
    df = forecast_feeds._format(
        config=config,
        start_date=pd.Timestamp("2026-06-13"),
        df=pd.DataFrame(
            [
                {"D": "D", "Date": "High Temperature - Boston", "06/14/2026": "89"},
                {"D": "D", "Date": "Dew Point - Boston", "06/14/2026": "56"},
                {
                    "D": "D",
                    "Date": "Total Capacity Supply Obligation (CSO)",
                    "06/14/2026": "26608",
                },
                {"D": "D", "Date": "Power Watch", "06/14/2026": "No"},
            ]
        ),
    )

    row = df.iloc[0].to_dict()
    assert row["forecast_execution_date"] == pd.Timestamp("2026-06-13").date()
    assert row["date"] == pd.Timestamp("2026-06-14").date()
    assert row["high_temperature_boston"] == 89
    assert row["total_capacity_supply_obligation"] == 26608
    assert row["power_watch"] == "No"


def test_wind_forecast_format_melts_date_columns_and_drops_blank_values():
    config = forecast_feeds.FEED_CONFIGS["seven_day_wind_forecast"]
    df = forecast_feeds._format(
        config=config,
        start_date=pd.Timestamp("2026-06-13"),
        df=pd.DataFrame(
            [
                {
                    "D": "D",
                    "Hour Ending": "01",
                    "06/13/2026": "",
                    "06/14/2026": "587",
                }
            ]
        ),
    )

    assert df.to_dict("records") == [
        {
            "forecast_execution_date": pd.Timestamp("2026-06-13").date(),
            "forecast_date": pd.Timestamp("2026-06-14").date(),
            "hour_ending": 1,
            "wind_forecast_mw": 587.0,
        }
    ]
