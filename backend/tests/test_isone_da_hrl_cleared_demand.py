from __future__ import annotations

from io import StringIO

import pandas as pd

from backend.scrapes.power.isone import da_hrl_cleared_demand


def test_isone_da_hrl_cleared_demand_target_contract():
    assert da_hrl_cleared_demand.API_SCRAPE_NAME == "da_hrl_cleared_demand"
    assert da_hrl_cleared_demand.TARGET_SCHEMA == "isone"
    assert (
        da_hrl_cleared_demand.TARGET_TABLE
        == da_hrl_cleared_demand.API_SCRAPE_NAME
    )
    assert (
        da_hrl_cleared_demand.TARGET_TABLE_FQN
        == "isone.da_hrl_cleared_demand"
    )
    assert da_hrl_cleared_demand.PRIMARY_KEY == ["date", "hour_ending"]


def test_isone_da_hrl_cleared_demand_format_filters_header_rows_and_duplicates():
    df = da_hrl_cleared_demand._format(
        pd.DataFrame(
            [
                {
                    "H": "D",
                    "Date": "06/13/2026",
                    "Hour Ending": "01",
                    "Day-Ahead Cleared Demand": "15008.0",
                },
                {
                    "H": "D",
                    "Date": "06/13/2026",
                    "Hour Ending": "01",
                    "Day-Ahead Cleared Demand": "15010.0",
                },
                {
                    "H": "T",
                    "Date": "06/13/2026",
                    "Hour Ending": "02",
                    "Day-Ahead Cleared Demand": "15100.0",
                },
                {
                    "H": "D",
                    "Date": "06/13/2026",
                    "Hour Ending": "02X",
                    "Day-Ahead Cleared Demand": "15200.0",
                },
            ]
        )
    )

    assert df.to_dict("records") == [
        {
            "date": pd.Timestamp("2026-06-13").date(),
            "hour_ending": 1,
            "day_ahead_cleared_demand": 15010.0,
        }
    ]


def test_isone_da_hrl_cleared_demand_pull_uses_csv_url_and_metadata(monkeypatch):
    captured: dict[str, object] = {}

    def fake_make_request(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return (
            "H,Date,Hour Ending,Day-Ahead Cleared Demand\n"
            "D,06/13/2026,01,15008.0\n"
        )

    monkeypatch.setattr(
        da_hrl_cleared_demand.isone_api,
        "make_request",
        fake_make_request,
    )
    monkeypatch.setattr(
        da_hrl_cleared_demand.isone_api,
        "parse_csv_response",
        lambda response: pd.read_csv(StringIO(response)),
    )

    df = da_hrl_cleared_demand._pull(
        start_date=pd.Timestamp("2026-06-13"),
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert captured["url"].endswith(
        "/transform/csv/hourlydayaheaddemand?start=20260613&end=20260613"
    )
    assert captured["pipeline_name"] == "da_hrl_cleared_demand"
    assert captured["run_id"] == "run-1"
    assert captured["feed_name"] == "da_hrl_cleared_demand"
    assert captured["target_table"] == "isone.da_hrl_cleared_demand"
    assert captured["database"] == "stage_db"
    assert captured["metadata"] == {
        "start_date": "2026-06-13",
        "end_date": "2026-06-13",
        "run_mode": "test",
    }
    assert len(df) == 1
