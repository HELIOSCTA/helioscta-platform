from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd
import pytest

from backend.orchestration.power.caiso import meteologica_forecast_hourly as caiso_orchestration
from backend.orchestration.power.isone import meteologica_forecast_hourly as isone_orchestration
from backend.orchestration.power.miso import meteologica_forecast_hourly as miso_orchestration
from backend.orchestration.power.nyiso import meteologica_forecast_hourly as nyiso_orchestration
from backend.orchestration.power.spp import meteologica_forecast_hourly as spp_orchestration
from backend.scrapes.power.caiso import meteologica_forecast_hourly as caiso_forecast
from backend.scrapes.power.isone import meteologica_forecast_hourly as isone_forecast
from backend.scrapes.power.miso import meteologica_forecast_hourly as miso_forecast
from backend.scrapes.power.nyiso import meteologica_forecast_hourly as nyiso_forecast
from backend.scrapes.power.spp import meteologica_forecast_hourly as spp_forecast

EXPECTED_FEEDS = {
    "caiso": {
        "module": caiso_forecast,
        "orchestration": caiso_orchestration,
        "table": "caiso_forecast_hourly",
        "target": "meteologica.caiso_forecast_hourly",
        "scope": "CAISO",
        "expected": {
            (1785, "load", "CAISO"),
            (1717, "solar", "CAISO"),
            (1755, "wind", "CAISO"),
            (1788, "load", "PGE"),
            (1791, "load", "SCE"),
            (1790, "load", "SDGE"),
            (1792, "load", "VEA"),
            (1716, "solar", "NP15"),
            (1757, "wind", "NP15"),
            (1718, "solar", "SP15"),
            (1756, "wind", "SP15"),
            (1719, "solar", "ZP26"),
            (6914, "wind", "ZP26"),
        },
    },
    "isone": {
        "module": isone_forecast,
        "orchestration": isone_orchestration,
        "table": "isone_forecast_hourly",
        "target": "meteologica.isone_forecast_hourly",
        "scope": "ISONE",
        "expected": {
            (2095, "load", "ISONE"),
            (2019, "solar", "ISONE"),
            (2029, "wind", "ISONE"),
            (2097, "load", "Connecticut"),
            (2031, "wind", "Connecticut"),
            (2096, "load", "Maine"),
            (2034, "wind", "Maine"),
            (2100, "load", "NEMass"),
            (2035, "wind", "NEMass"),
            (2102, "load", "New Hampshire"),
            (2030, "wind", "New Hampshire"),
            (2103, "load", "Rhode Island"),
            (2032, "wind", "Rhode Island"),
            (2098, "load", "SEMass"),
            (2036, "wind", "SEMass"),
            (2099, "load", "Vermont"),
            (2033, "wind", "Vermont"),
            (2101, "load", "WCMass"),
            (2037, "wind", "WCMass"),
        },
    },
    "miso": {
        "module": miso_forecast,
        "orchestration": miso_orchestration,
        "table": "miso_forecast_hourly",
        "target": "meteologica.miso_forecast_hourly",
        "scope": "MISO",
        "expected": {
            (2145, "load", "MISO"),
            (2305, "solar", "MISO"),
            (2188, "wind", "MISO"),
            (2146, "load", "North"),
            (2307, "solar", "North"),
            (2189, "wind", "North"),
            (2147, "load", "Central"),
            (2308, "solar", "Central"),
            (2196, "wind", "Central"),
            (2148, "load", "South"),
            (2306, "solar", "South"),
            (6943, "wind", "South"),
        },
    },
    "nyiso": {
        "module": nyiso_forecast,
        "orchestration": nyiso_orchestration,
        "table": "nyiso_forecast_hourly",
        "target": "meteologica.nyiso_forecast_hourly",
        "scope": "NYISO",
        "expected": {
            (2475, "load", "NYISO"),
            (2541, "solar", "NYISO"),
            (2430, "wind", "NYISO"),
            (2486, "load", "A-West"),
            (2431, "wind", "A-West"),
            (2479, "load", "B-Genesee"),
            (2432, "wind", "B-Genesee"),
            (2476, "load", "C-Central"),
            (2433, "wind", "C-Central"),
            (2483, "load", "D-North"),
            (2435, "wind", "D-North"),
            (2481, "load", "E-Mohawk Valley"),
            (2434, "wind", "E-Mohawk Valley"),
            (2477, "load", "F-Capital"),
            (2480, "load", "G-Hudson Valley"),
            (2484, "load", "H-Millwood"),
            (2478, "load", "I-Dunwoodie"),
            (2485, "load", "J-New York City"),
            (2482, "load", "K-Long Island"),
        },
    },
    "spp": {
        "module": spp_forecast,
        "orchestration": spp_orchestration,
        "table": "spp_forecast_hourly",
        "target": "meteologica.spp_forecast_hourly",
        "scope": "SPP",
        "expected": {
            (2927, "load", "SPP"),
            (2831, "solar", "SPP"),
            (2856, "wind", "SPP"),
        },
    },
}


@pytest.mark.parametrize("iso_key", EXPECTED_FEEDS)
def test_main_zone_meteologica_feed_configs_cover_locked_content_ids(iso_key):
    config = EXPECTED_FEEDS[iso_key]
    forecast = config["module"]
    expected = config["expected"]
    feeds = forecast.configured_feeds()

    assert len(feeds) == len(expected)
    assert {
        (feed.content_id, feed.metric, feed.forecast_area)
        for feed in feeds
    } == expected
    assert forecast.TARGET_TABLE_FQN == config["target"]


def test_main_zone_meteologica_feed_configs_cover_66_new_content_ids():
    content_ids = [
        feed.content_id
        for config in EXPECTED_FEEDS.values()
        for feed in config["module"].configured_feeds()
    ]

    assert len(content_ids) == 66
    assert len(set(content_ids)) == 66


def test_new_meteologica_normalizes_sample_response():
    feed = next(
        feed
        for feed in caiso_forecast.configured_feeds()
        if feed.content_id == 6914
    )
    df = caiso_forecast.normalize_forecast_frame(
        pd.DataFrame(
            [
                {
                    "From yyyy-mm-dd hh:mm": "2026-06-18 14:00",
                    "To yyyy-mm-dd hh:mm": "2026-06-18 15:00",
                    "UTC offset from (UTC+/-hhmm)": "-0700",
                    "UTC offset to (UTC+/-hhmm)": "-0700",
                    "forecast": "550.5",
                    "ECMWF ENS RUN": "2026-06-18 06:00",
                }
            ]
        ),
        feed=feed,
        metadata={
            "content_id": feed.content_id,
            "content_name": feed.content_name,
            "update_id": "998877",
            "issue_date": "2026-06-18T10:15:00Z",
            "source_timezone": "America/Los_Angeles",
            "source_unit": "MW",
        },
        scrape_run_at_utc=datetime(2026, 6, 18, 10, 20, tzinfo=timezone.utc),
    )

    record = df.to_dict("records")[0]
    assert pd.isna(record.pop("perc10_mw"))
    assert pd.isna(record.pop("perc90_mw"))
    assert record == {
        "content_id": 6914,
        "content_name": "USA CAISO ZP26 wind power generation forecast Meteologica hourly",
        "update_id": "998877",
        "issue_date": pd.Timestamp("2026-06-18 10:15:00+0000"),
        "metric": "wind",
        "region": "CAISO",
        "forecast_area": "ZP26",
        "forecast_period_start": pd.Timestamp("2026-06-18 14:00:00"),
        "forecast_period_end": pd.Timestamp("2026-06-18 15:00:00"),
        "utc_offset_from": "-0700",
        "utc_offset_to": "-0700",
        "forecast_mw": 550.5,
        "arpege_run": None,
        "ecmwf_ens_run": "2026-06-18 06:00",
        "ecmwf_hres_run": None,
        "gfs_run": None,
        "nam_run": None,
        "source_timezone": "America/Los_Angeles",
        "source_unit": "MW",
        "scrape_run_at_utc": pd.Timestamp("2026-06-18 10:20:00+0000"),
    }


@pytest.mark.parametrize("iso_key", EXPECTED_FEEDS)
def test_new_meteologica_pull_uses_iso_upsert_target(monkeypatch, iso_key):
    config = EXPECTED_FEEDS[iso_key]
    forecast = config["module"]
    feed = forecast.configured_feeds()[0]
    calls: list[dict] = []

    class FakeResponse:
        def json(self):
            return {
                "content_id": feed.content_id,
                "content_name": feed.content_name,
                "update_id": 10,
                "issue_date": "2026-06-18T10:00:00Z",
                "timezone": "UTC",
                "unit": "MW",
                "data": [
                    {
                        "From yyyy-mm-dd hh:mm": "2026-06-18 14:00",
                        "To yyyy-mm-dd hh:mm": "2026-06-18 15:00",
                        "forecast": "100",
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
        feeds=(feed,),
        run_mode="test",
    )

    assert df is not None
    assert len(df) == 1
    assert len(upserts) == 1
    assert purges == [21]
    assert calls[0]["kwargs"]["content_id"] == feed.content_id
    assert calls[0]["kwargs"]["target_table"] == config["target"]


@pytest.mark.parametrize("iso_key", EXPECTED_FEEDS)
def test_new_meteologica_retention_purge_uses_21_day_default(monkeypatch, iso_key):
    config = EXPECTED_FEEDS[iso_key]
    forecast = config["module"]
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
        "table_name": config["table"],
        "timestamp_column": "issue_date",
        "retention_days": 21,
        "database": "helios_prod",
    }


@pytest.mark.parametrize("iso_key", EXPECTED_FEEDS)
def test_new_meteologica_orchestration_emits_freshness_payload(monkeypatch, iso_key):
    config = EXPECTED_FEEDS[iso_key]
    orchestration = config["orchestration"]
    expected_rows = sorted(config["expected"])[:2]
    events: list[dict] = []

    def fake_scrape_main(**_kwargs):
        return pd.DataFrame(
            [
                {
                    "content_id": content_id,
                    "issue_date": pd.Timestamp("2026-06-18 10:00:00+0000"),
                    "forecast_period_start": pd.Timestamp("2026-06-18 14:00:00"),
                    "metric": metric,
                    "forecast_area": forecast_area,
                }
                for content_id, metric, forecast_area in expected_rows
            ]
        )

    def fake_emit_data_availability_event(**kwargs):
        events.append(kwargs)
        return {"event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(orchestration.scrape, "main", fake_scrape_main)
    monkeypatch.setattr(
        orchestration,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    result = orchestration.main(database="helios_prod")

    assert result is not None
    assert events[0]["dataset"] == f"{iso_key}_meteologica_forecast_hourly"
    assert events[0]["source_system"] == "meteologica"
    assert events[0]["availability_type"] == "freshness_forecast"
    assert events[0]["source_table"] == config["target"]
    assert events[0]["row_count"] == 2
    assert events[0]["entity_count"] == 2
    assert events[0]["period_count"] == 1
    assert events[0]["scope"] == config["scope"]
    assert events[0]["payload"]["content_ids"] == sorted(row[0] for row in expected_rows)
    assert events[0]["payload"]["metrics"] == sorted({row[1] for row in expected_rows})
    assert events[0]["payload"]["forecast_areas"] == sorted({row[2] for row in expected_rows})
