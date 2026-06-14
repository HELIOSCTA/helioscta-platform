from __future__ import annotations

from io import StringIO

import pandas as pd

from backend.scrapes.power.isone import hourly_system_demand


def test_isone_hourly_system_demand_target_contract():
    assert hourly_system_demand.API_SCRAPE_NAME == "hourly_system_demand"
    assert hourly_system_demand.TARGET_SCHEMA == "isone"
    assert hourly_system_demand.TARGET_TABLE == hourly_system_demand.API_SCRAPE_NAME
    assert hourly_system_demand.TARGET_TABLE_FQN == "isone.hourly_system_demand"
    assert hourly_system_demand.PRIMARY_KEY == ["date", "hour_ending"]


def test_isone_hourly_system_demand_format_filters_header_rows_and_duplicates():
    df = hourly_system_demand._format(
        pd.DataFrame(
            [
                {
                    "H": "D",
                    "Date": "06/12/2026",
                    "Hour Ending": "01",
                    "Total Load": "16142.94",
                },
                {
                    "H": "D",
                    "Date": "06/12/2026",
                    "Hour Ending": "01",
                    "Total Load": "16150.00",
                },
                {
                    "H": "T",
                    "Date": "06/12/2026",
                    "Hour Ending": "02",
                    "Total Load": "16200.00",
                },
                {
                    "H": "D",
                    "Date": "06/12/2026",
                    "Hour Ending": "02X",
                    "Total Load": "16300.00",
                },
            ]
        )
    )

    assert df.to_dict("records") == [
        {
            "date": pd.Timestamp("2026-06-12").date(),
            "hour_ending": 1,
            "total_load": 16150.0,
        }
    ]


def test_isone_hourly_system_demand_pull_uses_csv_url_and_metadata(monkeypatch):
    captured: dict[str, object] = {}

    def fake_make_request(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return "H,Date,Hour Ending,Total Load\nD,06/12/2026,01,16142.94\n"

    monkeypatch.setattr(
        hourly_system_demand.isone_api,
        "make_request",
        fake_make_request,
    )
    monkeypatch.setattr(
        hourly_system_demand.isone_api,
        "parse_csv_response",
        lambda response: pd.read_csv(StringIO(response)),
    )

    df = hourly_system_demand._pull(
        start_date=pd.Timestamp("2026-06-12"),
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert captured["url"].endswith(
        "/transform/csv/hourlysystemdemand?start=20260612&end=20260612"
    )
    assert captured["pipeline_name"] == "hourly_system_demand"
    assert captured["run_id"] == "run-1"
    assert captured["feed_name"] == "hourly_system_demand"
    assert captured["target_table"] == "isone.hourly_system_demand"
    assert captured["database"] == "stage_db"
    assert captured["metadata"] == {
        "start_date": "2026-06-12",
        "end_date": "2026-06-12",
        "run_mode": "test",
    }
    assert len(df) == 1
