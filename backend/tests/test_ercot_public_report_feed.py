from __future__ import annotations

from datetime import datetime

import pandas as pd

from backend.scrapes.power.ercot import public_report_feed
from backend.scrapes.power.ercot.feed_configs import FEED_CONFIGS
from backend.scrapes.power.ercot.public_report_feed import (
    normalize_public_report_frame,
    upsert_public_report_frame,
)


def test_normalize_public_report_frame_canonicalizes_coerces_and_dedupes():
    config = FEED_CONFIGS["dam_stlmnt_pnt_prices"]
    df = normalize_public_report_frame(
        pd.DataFrame(
            [
                {
                    "Delivery Date": "2026-06-13",
                    "Hour Ending": "01:00",
                    "Settlement Point": " HB_NORTH ",
                    "Settlement Point Price": "25.50",
                },
                {
                    "Delivery Date": "2026-06-13",
                    "Hour Ending": "01:00",
                    "Settlement Point": " HB_NORTH ",
                    "Settlement Point Price": "26.50",
                },
            ]
        ),
        config,
    )

    assert len(df) == 1
    assert df["deliverydate"].iloc[0].isoformat() == "2026-06-13"
    assert df["hourending"].iloc[0] == 1
    assert df["settlementpoint"].iloc[0] == "HB_NORTH"
    assert df["settlementpointprice"].iloc[0] == 26.50


def test_upsert_public_report_frame_uses_configured_contract(monkeypatch):
    config = FEED_CONFIGS["dam_stlmnt_pnt_prices"]
    captured: dict[str, object] = {}

    def fake_upsert_dataframe(**kwargs):
        captured.update(kwargs)
        return True

    monkeypatch.setattr(public_report_feed.db, "upsert_dataframe", fake_upsert_dataframe)

    upsert_public_report_frame(
        pd.DataFrame(
            [
                {
                    "deliverydate": pd.Timestamp("2026-06-13").date(),
                    "hourending": 1,
                    "settlementpoint": "HB_NORTH",
                    "settlementpointprice": 25.5,
                }
            ]
        ),
        config,
        database="stage_db",
    )

    assert captured["database"] == "stage_db"
    assert captured["schema"] == "ercot"
    assert captured["table_name"] == "dam_stlmnt_pnt_prices"
    assert captured["primary_key"] == ["deliverydate", "hourending", "settlementpoint"]
    assert captured["data_types"] == [
        "DATE",
        "INTEGER",
        "VARCHAR",
        "DOUBLE PRECISION",
    ]


def test_run_public_report_passes_metadata_to_pull(monkeypatch):
    config = FEED_CONFIGS["rt_price_adders_15min"]
    captured: dict[str, object] = {}

    class FakeLogger:
        def header(self, *_args):
            pass

        def info(self, *_args):
            pass

        def section(self, *_args):
            pass

        def success(self, *_args):
            pass

        def exception(self, *_args):
            pass

    def fake_pull_public_report(config, params=None, run_id=None, database=None, metadata=None):
        captured.update(
            {
                "config": config,
                "params": params,
                "run_id": run_id,
                "database": database,
                "metadata": metadata,
            }
        )
        return pd.DataFrame(
            [
                {
                    "deliverydate": pd.Timestamp("2026-07-16").date(),
                    "deliveryhour": 1,
                    "deliveryinterval": 1,
                    "rtrdpa": 2.5,
                    "rtrdpru": 0.0,
                    "rtrdprd": 0.0,
                    "rtrdprrs": 0.0,
                    "rtrdpecrs": 0.0,
                    "rtrdpns": 0.0,
                    "repeathourflag": False,
                }
            ]
        )

    monkeypatch.setattr(public_report_feed, "pull_public_report", fake_pull_public_report)
    monkeypatch.setattr(public_report_feed, "upsert_public_report_frame", lambda *_, **__: None)
    monkeypatch.setattr(public_report_feed.script_logging, "init_logging", lambda **_: FakeLogger())
    monkeypatch.setattr(public_report_feed.script_logging, "close_logging", lambda: None)

    result = public_report_feed.run_public_report(
        config,
        start_date=datetime(2026, 7, 16),
        end_date=datetime(2026, 7, 16),
        database="stage_db",
        metadata={"run_mode": "backfill"},
    )

    assert result is not None
    assert len(result) == 1
    assert captured["config"] == config
    assert captured["params"] == {
        "deliveryDateFrom": "2026-07-16",
        "deliveryDateTo": "2026-07-16",
    }
    assert captured["database"] == "stage_db"
    assert captured["metadata"] == {"run_mode": "backfill"}

