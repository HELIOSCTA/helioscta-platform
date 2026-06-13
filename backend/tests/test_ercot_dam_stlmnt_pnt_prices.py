from __future__ import annotations

import pandas as pd

from backend.scrapes.power.ercot import dam_stlmnt_pnt_prices


def test_dam_spp_filter_and_format_keeps_configured_hubs_and_latest_duplicate():
    df = dam_stlmnt_pnt_prices._filter_and_format(
        pd.DataFrame(
            [
                {
                    "deliverydate": pd.Timestamp("2026-06-13").date(),
                    "hourending": 1,
                    "settlementpoint": " HB_NORTH ",
                    "settlementpointprice": "25.5",
                },
                {
                    "deliverydate": pd.Timestamp("2026-06-13").date(),
                    "hourending": 1,
                    "settlementpoint": "HB_NORTH",
                    "settlementpointprice": "26.5",
                },
                {
                    "deliverydate": pd.Timestamp("2026-06-13").date(),
                    "hourending": 1,
                    "settlementpoint": "LZ_NORTH",
                    "settlementpointprice": "24.5",
                },
            ]
        ),
        settlement_points=("HB_NORTH",),
    )

    assert df.to_dict("records") == [
        {
            "deliverydate": pd.Timestamp("2026-06-13").date(),
            "hourending": 1,
            "settlementpoint": "HB_NORTH",
            "settlementpointprice": 26.5,
        }
    ]


def test_dam_spp_pull_passes_date_window_and_metadata(monkeypatch):
    captured: dict[str, object] = {}

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
                    "deliverydate": pd.Timestamp("2026-06-13").date(),
                    "hourending": 1,
                    "settlementpoint": "HB_NORTH",
                    "settlementpointprice": 25.5,
                }
            ]
        )

    monkeypatch.setattr(dam_stlmnt_pnt_prices, "pull_public_report", fake_pull_public_report)

    df = dam_stlmnt_pnt_prices._pull(
        start_date=pd.Timestamp("2026-06-13"),
        run_id="run-1",
        database="stage_db",
        settlement_points=("HB_NORTH",),
        metadata={"run_mode": "test"},
    )

    assert len(df) == 1
    assert captured["params"] == {
        "deliveryDateFrom": "2026-06-13",
        "deliveryDateTo": "2026-06-13",
    }
    assert captured["run_id"] == "run-1"
    assert captured["database"] == "stage_db"
    assert captured["metadata"] == {
        "settlement_points": ["HB_NORTH"],
        "run_mode": "test",
    }

