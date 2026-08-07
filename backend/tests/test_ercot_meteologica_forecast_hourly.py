from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from backend.scrapes.power.ercot import meteologica_forecast_hourly as forecast


def test_ercot_meteologica_feed_configs_cover_expected_7_content_ids():
    feeds = forecast.configured_feeds()

    assert len(feeds) == 7
    assert sorted(feed.content_id for feed in feeds) == [
        1840,
        1877,
        1943,
        1952,
        1953,
        1954,
        1955,
    ]
    assert {(feed.forecast_area, feed.metric) for feed in feeds} == {
        ("ERCOT", "load"),
        ("ERCOT", "solar"),
        ("ERCOT", "wind"),
        ("HOUSTON_FORECAST_ZONE", "load"),
        ("NORTH_FORECAST_ZONE", "load"),
        ("SOUTH_FORECAST_ZONE", "load"),
        ("WEST_FORECAST_ZONE", "load"),
    }


def test_ercot_meteologica_normalizes_sample_response():
    feed = next(
        feed
        for feed in forecast.configured_feeds()
        if feed.content_id == 1952
    )
    df = forecast.normalize_forecast_frame(
        pd.DataFrame(
            [
                {
                    "From yyyy-mm-dd hh:mm": "2026-06-18 14:00",
                    "To yyyy-mm-dd hh:mm": "2026-06-18 15:00",
                    "UTC offset from (UTC+/-hhmm)": "-0500",
                    "UTC offset to (UTC+/-hhmm)": "-0500",
                    "forecast": "25201.5",
                    "perc10": "24100.0",
                    "perc90": "26000.25",
                    "ECMWF HRES RUN": "2026-06-18 06:00",
                }
            ]
        ),
        feed=feed,
        metadata={
            "content_id": feed.content_id,
            "content_name": feed.content_name,
            "update_id": "773322",
            "issue_date": "2026-06-18T10:15:00Z",
            "source_timezone": "America/Chicago",
            "source_unit": "MW",
        },
        scrape_run_at_utc=datetime(2026, 6, 18, 10, 20, tzinfo=timezone.utc),
    )

    assert df.to_dict("records") == [
        {
            "content_id": 1952,
            "content_name": "USA ERCOT Houston ForecastZone power demand forecast Meteologica hourly",
            "update_id": "773322",
            "issue_date": pd.Timestamp("2026-06-18 10:15:00+0000"),
            "metric": "load",
            "region": "ERCOT",
            "forecast_area": "HOUSTON_FORECAST_ZONE",
            "forecast_period_start": pd.Timestamp("2026-06-18 14:00:00"),
            "forecast_period_end": pd.Timestamp("2026-06-18 15:00:00"),
            "utc_offset_from": "-0500",
            "utc_offset_to": "-0500",
            "forecast_mw": 25201.5,
            "perc10_mw": 24100.0,
            "perc90_mw": 26000.25,
            "arpege_run": None,
            "ecmwf_ens_run": None,
            "ecmwf_hres_run": "2026-06-18 06:00",
            "gfs_run": None,
            "nam_run": None,
            "source_timezone": "America/Chicago",
            "source_unit": "MW",
            "scrape_run_at_utc": pd.Timestamp("2026-06-18 10:20:00+0000"),
        }
    ]


def test_ercot_meteologica_pull_uses_ercot_upsert_target(monkeypatch):
    calls: list[dict] = []

    class FakeResponse:
        def json(self):
            return {
                "content_id": 1943,
                "content_name": "USA ERCOT power demand forecast Meteologica hourly",
                "update_id": 10,
                "issue_date": "2026-06-18T10:00:00Z",
                "timezone": "America/Chicago",
                "unit": "MW",
                "data": [
                    {
                        "From yyyy-mm-dd hh:mm": "2026-06-18 14:00",
                        "To yyyy-mm-dd hh:mm": "2026-06-18 15:00",
                        "forecast": "78000",
                    }
                ],
            }

    def fake_make_get_request(*args, **kwargs):
        calls.append({"args": args, "kwargs": kwargs})
        return FakeResponse()

    upserts: list[pd.DataFrame] = []
    purges: list[int] = []
    monkeypatch.setattr(forecast.client, "make_get_request", fake_make_get_request)
    monkeypatch.setattr(forecast, "_upsert", lambda df, database=None: upserts.append(df))
    monkeypatch.setattr(
        forecast,
        "_purge_old_rows",
        lambda retention_days=21, database=None: purges.append(retention_days) or 0,
    )

    df = forecast.main(
        database="helios_prod",
        feeds=(forecast.configured_feeds()[0],),
        run_mode="test",
    )

    assert df is not None
    assert len(df) == 1
    assert len(upserts) == 1
    assert purges == [21]
    assert calls[0]["kwargs"]["content_id"] == 1943
    assert calls[0]["kwargs"]["target_table"] == "meteologica.ercot_forecast_hourly"


def test_ercot_meteologica_retention_purge_uses_21_day_default(monkeypatch):
    captured: dict[str, object] = {}

    def fake_purge_rows_older_than(**kwargs):
        captured.update(kwargs)
        return 7

    monkeypatch.setattr(
        forecast.retention,
        "purge_rows_older_than",
        fake_purge_rows_older_than,
    )

    deleted_rows = forecast._purge_old_rows(database="helios_prod")

    assert deleted_rows == 7
    assert captured == {
        "schema": "meteologica",
        "table_name": "ercot_forecast_hourly",
        "timestamp_column": "issue_date",
        "retention_days": 21,
        "database": "helios_prod",
    }
