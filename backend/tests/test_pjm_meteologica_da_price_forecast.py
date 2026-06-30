from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from backend.scrapes.power.pjm import meteologica_da_price_forecast as forecast


def test_pjm_meteologica_da_price_feed_configs_cover_expected_content_ids():
    feeds = forecast.configured_feeds()

    assert len(feeds) == 2
    assert sorted(feed.content_id for feed in feeds) == [4397, 4400]
    assert {feed.target_table for feed in feeds} == {
        "usa_pjm_western_hub_da_power_price_forecast_hourly",
        "usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly",
    }


def test_pjm_meteologica_da_price_normalizes_deterministic_response():
    feed = forecast.FEED_DETERMINISTIC
    df = forecast.normalize_da_price_frame(
        pd.DataFrame(
            [
                {
                    "From yyyy-mm-dd hh:mm": "2026-06-30 14:00",
                    "To yyyy-mm-dd hh:mm": "2026-06-30 15:00",
                    "UTC offset from (UTC+/-hhmm)": "-0400",
                    "UTC offset to (UTC+/-hhmm)": "-0400",
                    "DayAhead": "42.75",
                }
            ]
        ),
        feed=feed,
        metadata={
            "content_id": feed.content_id,
            "content_name": feed.content_name,
            "update_id": "987",
            "issue_date": "2026-06-30T10:15:00Z",
            "source_timezone": "America/New_York",
            "source_unit": "$/MWh",
        },
        scrape_run_at_utc=datetime(2026, 6, 30, 10, 20, tzinfo=timezone.utc),
    )

    assert df.to_dict("records") == [
        {
            "content_id": 4397,
            "content_name": "USA PJM Western-HUB day ahead power price forecast Meteologica hourly",
            "update_id": "987",
            "issue_date": pd.Timestamp("2026-06-30 10:15:00+0000"),
            "forecast_period_start": pd.Timestamp("2026-06-30 14:00:00"),
            "forecast_period_end": pd.Timestamp("2026-06-30 15:00:00"),
            "utc_offset_from": "-0400",
            "utc_offset_to": "-0400",
            "day_ahead_price": 42.75,
            "source_timezone": "America/New_York",
            "source_unit": "$/MWh",
            "scrape_run_at_utc": pd.Timestamp("2026-06-30 10:20:00+0000"),
        }
    ]


def test_pjm_meteologica_da_price_normalizes_ensemble_members():
    feed = forecast.FEED_ENSEMBLE
    df = forecast.normalize_da_price_frame(
        pd.DataFrame(
            [
                {
                    "From yyyy-mm-dd hh:mm": "2026-06-30 14:00",
                    "To yyyy-mm-dd hh:mm": "2026-06-30 15:00",
                    "Average": "44.1",
                    "Bottom": "20.5",
                    "Top": "75.9",
                    "ENS00": "41.0",
                    "ENS50": "50.0",
                }
            ]
        ),
        feed=feed,
        metadata={
            "content_id": feed.content_id,
            "content_name": feed.content_name,
            "update_id": 988,
            "issue_date": "2026-06-30T10:30:00Z",
            "source_timezone": "America/New_York",
            "source_unit": "$/MWh",
        },
        scrape_run_at_utc=datetime(2026, 6, 30, 10, 35, tzinfo=timezone.utc),
    )
    record = df.to_dict("records")[0]

    assert record["content_id"] == 4400
    assert record["update_id"] == "988"
    assert record["average_price"] == 44.1
    assert record["bottom_price"] == 20.5
    assert record["top_price"] == 75.9
    assert record["ens_00_price"] == 41.0
    assert record["ens_50_price"] == 50.0
    assert "ens_49_price" in record


def test_pjm_meteologica_da_price_filters_to_14_day_horizon():
    feed = forecast.FEED_DETERMINISTIC
    df = forecast.normalize_da_price_frame(
        pd.DataFrame(
            [
                {
                    "From yyyy-mm-dd hh:mm": "2026-07-14 08:00",
                    "To yyyy-mm-dd hh:mm": "2026-07-14 09:00",
                    "DayAhead": "40.0",
                },
                {
                    "From yyyy-mm-dd hh:mm": "2026-07-14 09:00",
                    "To yyyy-mm-dd hh:mm": "2026-07-14 10:00",
                    "DayAhead": "41.0",
                },
            ]
        ),
        feed=feed,
        metadata={
            "content_id": feed.content_id,
            "content_name": feed.content_name,
            "update_id": "horizon-test",
            "issue_date": "2026-06-30T12:25:00Z",
            "source_timezone": "America/New_York",
            "source_unit": "$/MWh",
        },
        scrape_run_at_utc=datetime(2026, 6, 30, 12, 30, tzinfo=timezone.utc),
    )

    assert df["forecast_period_start"].tolist() == [pd.Timestamp("2026-07-14 08:00:00")]


def test_pjm_meteologica_da_price_pull_uses_split_source_tables(monkeypatch):
    calls: list[dict] = []

    class FakeResponse:
        def __init__(self, content_id: int, content_name: str):
            self.content_id = content_id
            self.content_name = content_name

        def json(self):
            return {
                "content_id": self.content_id,
                "content_name": self.content_name,
                "update_id": 10,
                "issue_date": "2026-06-30T10:00:00Z",
                "timezone": "America/New_York",
                "unit": "$/MWh",
                "data": [
                    {
                        "From yyyy-mm-dd hh:mm": "2026-06-30 14:00",
                        "To yyyy-mm-dd hh:mm": "2026-06-30 15:00",
                        "DayAhead": "40.0",
                        "Average": "41.0",
                        "Bottom": "30.0",
                        "Top": "50.0",
                    }
                ],
            }

    def fake_make_get_request(*args, **kwargs):
        calls.append({"args": args, "kwargs": kwargs})
        feed = kwargs["content_id"]
        content_name = (
            forecast.FEED_DETERMINISTIC.content_name
            if feed == 4397
            else forecast.FEED_ENSEMBLE.content_name
        )
        return FakeResponse(feed, content_name)

    upserts: list[tuple[str, pd.DataFrame]] = []
    horizon_purges: list[tuple[str, int]] = []
    purges: list[tuple[str, int]] = []
    monkeypatch.setattr(forecast.client, "make_get_request", fake_make_get_request)
    monkeypatch.setattr(
        forecast,
        "upsert_table",
        lambda table_name, df, database=None: upserts.append((table_name, df)),
    )
    monkeypatch.setattr(
        forecast,
        "purge_forecast_horizon_rows",
        lambda table_name, forecast_horizon_days=14, database=None: horizon_purges.append(
            (table_name, forecast_horizon_days)
        )
        or 0,
    )
    monkeypatch.setattr(
        forecast,
        "purge_old_rows",
        lambda table_name, retention_days=90, database=None: purges.append(
            (table_name, retention_days)
        )
        or 0,
    )

    result = forecast.main(database="helios_prod", run_mode="test")

    assert result is not None
    assert sorted(result) == [
        "usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly",
        "usa_pjm_western_hub_da_power_price_forecast_hourly",
    ]
    assert [call["kwargs"]["target_table"] for call in calls] == [
        "meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly",
        "meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly",
    ]
    assert sorted(table for table, _df in upserts) == sorted(result)
    assert sorted(horizon_purges) == [
        ("usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly", 14),
        ("usa_pjm_western_hub_da_power_price_forecast_hourly", 14),
    ]
    assert sorted(purges) == [
        ("usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly", 90),
        ("usa_pjm_western_hub_da_power_price_forecast_hourly", 90),
    ]


def test_pjm_meteologica_da_price_retention_uses_issue_date(monkeypatch):
    captured: dict[str, object] = {}

    def fake_purge_rows_older_than(**kwargs):
        captured.update(kwargs)
        return 7

    monkeypatch.setattr(
        forecast.retention,
        "purge_rows_older_than",
        fake_purge_rows_older_than,
    )

    deleted_rows = forecast.purge_old_rows(
        "usa_pjm_western_hub_da_power_price_forecast_hourly",
        database="helios_prod",
    )

    assert deleted_rows == 7
    assert captured == {
        "schema": "meteologica",
        "table_name": "usa_pjm_western_hub_da_power_price_forecast_hourly",
        "timestamp_column": "issue_date",
        "retention_days": 90,
        "database": "helios_prod",
    }


def test_pjm_meteologica_da_price_horizon_purge_validates_days():
    try:
        forecast.purge_forecast_horizon_rows(
            "usa_pjm_western_hub_da_power_price_forecast_hourly",
            forecast_horizon_days=0,
            database="helios_prod",
        )
    except ValueError as exc:
        assert str(exc) == "forecast_horizon_days must be >= 1"
    else:
        raise AssertionError("Expected forecast_horizon_days validation failure")
