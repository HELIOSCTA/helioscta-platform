from __future__ import annotations

import pandas as pd

from backend.scrapes.power.ercot import settlement_point_prices


def test_rt_spp_filter_and_format_keeps_hubs_and_latest_duplicate():
    df = settlement_point_prices._filter_and_format(
        pd.DataFrame(
            [
                {
                    "deliverydate": pd.Timestamp("2026-06-13").date(),
                    "deliveryhour": 1,
                    "deliveryinterval": 1,
                    "settlementpoint": " HB_NORTH ",
                    "settlementpointtype": "HU",
                    "settlementpointprice": "24.38",
                },
                {
                    "deliverydate": pd.Timestamp("2026-06-13").date(),
                    "deliveryhour": 1,
                    "deliveryinterval": 1,
                    "settlementpoint": "HB_NORTH",
                    "settlementpointtype": "HU",
                    "settlementpointprice": "25.38",
                },
                {
                    "deliverydate": pd.Timestamp("2026-06-13").date(),
                    "deliveryhour": 1,
                    "deliveryinterval": 1,
                    "settlementpoint": "LZ_NORTH",
                    "settlementpointtype": "LZ",
                    "settlementpointprice": "23.38",
                },
            ]
        ),
        settlement_points=("HB_NORTH",),
    )

    assert df.to_dict("records") == [
        {
            "deliverydate": pd.Timestamp("2026-06-13").date(),
            "deliveryhour": 1,
            "deliveryinterval": 1,
            "settlementpoint": "HB_NORTH",
            "settlementpointtype": "HU",
            "settlementpointprice": 25.38,
        }
    ]


def test_rt_spp_pull_requests_each_settlement_point(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_pull_public_report(config, params=None, run_id=None, database=None, metadata=None):
        captured.append(
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
                    "deliveryhour": 1,
                    "deliveryinterval": 1,
                    "settlementpoint": params["settlementPoint"],
                    "settlementpointtype": "HU",
                    "settlementpointprice": 25.0,
                }
            ]
        )

    monkeypatch.setattr(
        settlement_point_prices,
        "pull_public_report",
        fake_pull_public_report,
    )

    df = settlement_point_prices._pull(
        start_date=pd.Timestamp("2026-06-13"),
        run_id="run-1",
        database="stage_db",
        settlement_points=("HB_NORTH", "HB_SOUTH"),
        metadata={"run_mode": "test"},
    )

    assert len(df) == 2
    assert [call["params"]["settlementPoint"] for call in captured] == [
        "HB_NORTH",
        "HB_SOUTH",
    ]
    assert captured[0]["params"] == {
        "deliveryDateFrom": "2026-06-13",
        "deliveryDateTo": "2026-06-13",
        "settlementPoint": "HB_NORTH",
    }
    assert captured[0]["run_id"] == "run-1"
    assert captured[0]["database"] == "stage_db"
    assert captured[0]["metadata"] == {
        "settlement_point": "HB_NORTH",
        "run_mode": "test",
    }

