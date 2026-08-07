from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd
import pytest

from backend.scrapes.power.meteologica import forecast_hourly


def _sample_feed() -> forecast_hourly.MeteologicaForecastFeed:
    return forecast_hourly.MeteologicaForecastFeed(
        1001,
        "Sample forecast",
        forecast_hourly.METRIC_LOAD,
        "TEST",
        "TEST_AREA",
        "sample_forecast_hourly",
    )


def test_common_normalization_deduplicates_by_primary_key():
    feed = _sample_feed()
    df = forecast_hourly.normalize_forecast_frame(
        pd.DataFrame(
            [
                {
                    "From yyyy-mm-dd hh:mm": "2026-06-18 14:00",
                    "To yyyy-mm-dd hh:mm": "2026-06-18 15:00",
                    "forecast": "100",
                },
                {
                    "From yyyy-mm-dd hh:mm": "2026-06-18 14:00",
                    "To yyyy-mm-dd hh:mm": "2026-06-18 15:00",
                    "forecast": "125",
                    "perc10": "110",
                    "perc90": "140",
                },
            ]
        ),
        feed=feed,
        metadata={
            "content_id": feed.content_id,
            "content_name": feed.content_name,
            "update_id": "42",
            "issue_date": "2026-06-18T10:15:00Z",
            "source_timezone": "UTC",
            "source_unit": "MW",
        },
        scrape_run_at_utc=datetime(2026, 6, 18, 10, 20, tzinfo=timezone.utc),
    )

    assert len(df) == 1
    assert df.iloc[0]["forecast_mw"] == 125.0
    assert df.iloc[0]["perc10_mw"] == 110.0
    assert df.iloc[0]["perc90_mw"] == 140.0


def test_common_normalization_drops_rows_without_update_id():
    feed = _sample_feed()
    df = forecast_hourly.normalize_forecast_frame(
        pd.DataFrame(
            [
                {
                    "From yyyy-mm-dd hh:mm": "2026-06-18 14:00",
                    "To yyyy-mm-dd hh:mm": "2026-06-18 15:00",
                    "forecast": "100",
                }
            ]
        ),
        feed=feed,
        metadata={
            "content_id": feed.content_id,
            "content_name": feed.content_name,
            "update_id": "",
            "issue_date": "2026-06-18T10:15:00Z",
        },
        scrape_run_at_utc=datetime(2026, 6, 18, 10, 20, tzinfo=timezone.utc),
    )

    assert df.empty


def test_common_pull_feed_rejects_non_list_data(monkeypatch):
    feed = _sample_feed()

    class FakeResponse:
        def json(self):
            return {
                "content_id": feed.content_id,
                "content_name": feed.content_name,
                "update_id": "42",
                "issue_date": "2026-06-18T10:15:00Z",
                "data": {"not": "a list"},
            }

    monkeypatch.setattr(
        forecast_hourly.client,
        "make_get_request",
        lambda *args, **kwargs: FakeResponse(),
    )

    with pytest.raises(RuntimeError, match="data was not a list"):
        forecast_hourly.pull_feed(
            feed,
            pipeline_name="test_meteologica_forecast_hourly",
            target_table_fqn="meteologica.test_forecast_hourly",
        )


def test_common_upsert_uses_canonical_table_contract(monkeypatch):
    captured: dict[str, object] = {}
    frame = pd.DataFrame(
        [
            {
                column: None
                for column in forecast_hourly.OUTPUT_COLUMNS
            }
        ]
    )
    frame["content_id"] = 1001
    frame["content_name"] = "Sample forecast"
    frame["update_id"] = "42"
    frame["forecast_period_start"] = pd.Timestamp("2026-06-18 14:00")
    frame["scrape_run_at_utc"] = pd.Timestamp("2026-06-18 10:20:00+0000")

    def fake_upsert_dataframe(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(forecast_hourly.db, "upsert_dataframe", fake_upsert_dataframe)

    forecast_hourly.upsert_forecasts(
        frame,
        target_schema="meteologica",
        target_table="test_forecast_hourly",
        target_table_fqn="meteologica.test_forecast_hourly",
        database="helios_prod",
    )

    assert captured["schema"] == "meteologica"
    assert captured["table_name"] == "test_forecast_hourly"
    assert captured["columns"] == forecast_hourly.OUTPUT_COLUMNS
    assert captured["data_types"] == forecast_hourly.SQL_DATA_TYPES
    assert captured["primary_key"] == forecast_hourly.PRIMARY_KEY
    assert captured["database"] == "helios_prod"


def test_common_purge_uses_issue_date_retention(monkeypatch):
    captured: dict[str, object] = {}

    def fake_purge_rows_older_than(**kwargs):
        captured.update(kwargs)
        return 12

    monkeypatch.setattr(
        forecast_hourly.retention,
        "purge_rows_older_than",
        fake_purge_rows_older_than,
    )

    deleted_rows = forecast_hourly.purge_old_forecasts(
        target_schema="meteologica",
        target_table="test_forecast_hourly",
        retention_days=21,
        database="helios_prod",
    )

    assert deleted_rows == 12
    assert captured == {
        "schema": "meteologica",
        "table_name": "test_forecast_hourly",
        "timestamp_column": "issue_date",
        "retention_days": 21,
        "database": "helios_prod",
    }
