from __future__ import annotations

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

