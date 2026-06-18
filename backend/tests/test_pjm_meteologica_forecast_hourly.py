from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from backend.scrapes.power.pjm import meteologica_forecast_hourly as forecast


def test_pjm_meteologica_feed_configs_cover_expected_12_content_ids():
    feeds = forecast.configured_feeds()

    assert len(feeds) == 12
    assert sorted(feed.content_id for feed in feeds) == [
        2553,
        2554,
        2555,
        2556,
        2597,
        2599,
        2602,
        2604,
        2688,
        2706,
        2707,
        2722,
    ]
    assert {(feed.forecast_area, feed.metric) for feed in feeds} == {
        (area, metric)
        for area in ["RTO", "MIDATL", "SOUTH", "WEST"]
        for metric in ["load", "solar", "wind"]
    }


def test_pjm_meteologica_normalizes_sample_response():
    feed = forecast.configured_feeds()[1]
    df = forecast.normalize_forecast_frame(
        pd.DataFrame(
            [
                {
                    "From yyyy-mm-dd hh:mm": "2026-06-18 14:00",
                    "To yyyy-mm-dd hh:mm": "2026-06-18 15:00",
                    "UTC offset from (UTC+/-hhmm)": "-0400",
                    "UTC offset to (UTC+/-hhmm)": "-0400",
                    "forecast": "812.5",
                    "perc10": "702.1",
                    "perc90": "901.2",
                    "GFS RUN": "2026-06-18 06:00",
                }
            ]
        ),
        feed=feed,
        metadata={
            "content_id": feed.content_id,
            "content_name": feed.content_name,
            "update_id": "123456",
            "issue_date": "2026-06-18T10:15:00Z",
            "source_timezone": "America/New_York",
            "source_unit": "MW",
        },
        scrape_run_at_utc=datetime(2026, 6, 18, 10, 20, tzinfo=timezone.utc),
    )

    assert df.to_dict("records") == [
        {
            "content_id": 2553,
            "content_name": "USA PJM photovoltaic power generation forecast Meteologica hourly",
            "update_id": "123456",
            "issue_date": pd.Timestamp("2026-06-18 10:15:00+0000"),
            "metric": "solar",
            "region": "PJM",
            "forecast_area": "RTO",
            "forecast_period_start": pd.Timestamp("2026-06-18 14:00:00"),
            "forecast_period_end": pd.Timestamp("2026-06-18 15:00:00"),
            "utc_offset_from": "-0400",
            "utc_offset_to": "-0400",
            "forecast_mw": 812.5,
            "perc10_mw": 702.1,
            "perc90_mw": 901.2,
            "arpege_run": None,
            "ecmwf_ens_run": None,
            "ecmwf_hres_run": None,
            "gfs_run": "2026-06-18 06:00",
            "nam_run": None,
            "source_timezone": "America/New_York",
            "source_unit": "MW",
            "scrape_run_at_utc": pd.Timestamp("2026-06-18 10:20:00+0000"),
        }
    ]


def test_pjm_meteologica_pull_uses_one_canonical_upsert_path(monkeypatch):
    calls: list[dict] = []

    class FakeResponse:
        def json(self):
            return {
                "content_id": 2706,
                "content_name": "USA PJM power demand forecast Meteologica hourly",
                "update_id": 10,
                "issue_date": "2026-06-18T10:00:00Z",
                "timezone": "America/New_York",
                "unit": "MW",
                "data": [
                    {
                        "From yyyy-mm-dd hh:mm": "2026-06-18 14:00",
                        "To yyyy-mm-dd hh:mm": "2026-06-18 15:00",
                        "forecast": "100000",
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
        lambda retention_days=90, database=None: purges.append(retention_days) or 0,
    )

    df = forecast.main(
        database="helios_prod",
        feeds=(forecast.configured_feeds()[0],),
        run_mode="test",
    )

    assert df is not None
    assert len(df) == 1
    assert len(upserts) == 1
    assert purges == [90]
    assert calls[0]["kwargs"]["content_id"] == 2706
    assert calls[0]["kwargs"]["target_table"] == "meteologica.pjm_forecast_hourly"


def test_pjm_meteologica_retention_purge_uses_90_day_default(monkeypatch):
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
        "table_name": "pjm_forecast_hourly",
        "timestamp_column": "issue_date",
        "retention_days": 90,
        "database": "helios_prod",
    }
