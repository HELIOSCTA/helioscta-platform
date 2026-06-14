from __future__ import annotations

from io import StringIO

import pandas as pd

from backend.scrapes.power.isone import rt_hrl_scheduled_interchange


def test_isone_rt_hrl_scheduled_interchange_target_contract():
    assert (
        rt_hrl_scheduled_interchange.API_SCRAPE_NAME
        == "rt_hrl_scheduled_interchange"
    )
    assert rt_hrl_scheduled_interchange.TARGET_SCHEMA == "isone"
    assert (
        rt_hrl_scheduled_interchange.TARGET_TABLE_FQN
        == "isone.rt_hrl_scheduled_interchange"
    )
    assert rt_hrl_scheduled_interchange.PRIMARY_KEY == [
        "local_date",
        "local_hour_ending",
        "interface_name",
    ]


def test_isone_rt_hrl_scheduled_interchange_format_filters_duplicate_keys():
    df = rt_hrl_scheduled_interchange._format(
        pd.DataFrame(
            [
                {
                    "H": "D",
                    "Interface Name": ".I.SALBRYNB345 1",
                    "Local Date": "2026-06-12",
                    "Local Hour Ending": "01",
                    "Actual Interchange": "-54",
                    "Purchases": "-54",
                    "Sales": "0",
                },
                {
                    "H": "D",
                    "Interface Name": ".I.SALBRYNB345 1",
                    "Local Date": "2026-06-12",
                    "Local Hour Ending": "01",
                    "Actual Interchange": "-55",
                    "Purchases": "-55",
                    "Sales": "0",
                },
                {
                    "H": "T",
                    "Interface Name": ".I.SALBRYNB345 1",
                    "Local Date": "2026-06-12",
                    "Local Hour Ending": "02",
                    "Actual Interchange": "-60",
                    "Purchases": "-60",
                    "Sales": "0",
                },
            ]
        )
    )

    assert df.to_dict("records") == [
        {
            "interface_name": ".I.SALBRYNB345 1",
            "local_date": pd.Timestamp("2026-06-12").date(),
            "local_hour_ending": 1,
            "actual_interchange": -55,
            "purchases": -55,
            "sales": 0,
        }
    ]


def test_isone_rt_hrl_scheduled_interchange_pull_uses_csv_url_and_metadata(
    monkeypatch,
):
    captured: dict[str, object] = {}

    def fake_make_request(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return (
            "H,Interface Name,Local Date,Local Hour Ending,"
            "Actual Interchange,Purchases,Sales\n"
            "D,.I.SALBRYNB345 1,2026-06-12,01,-54,-54,0\n"
        )

    monkeypatch.setattr(
        rt_hrl_scheduled_interchange.isone_api,
        "make_request",
        fake_make_request,
    )
    monkeypatch.setattr(
        rt_hrl_scheduled_interchange.isone_api,
        "parse_csv_response",
        lambda response: pd.read_csv(StringIO(response)),
    )

    df = rt_hrl_scheduled_interchange._pull(
        start_date=pd.Timestamp("2026-06-12"),
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert captured["url"].endswith(
        "/transform/csv/actualinterchange?start=20260612&end=20260612"
    )
    assert captured["pipeline_name"] == "rt_hrl_scheduled_interchange"
    assert captured["run_id"] == "run-1"
    assert captured["feed_name"] == "rt_hrl_scheduled_interchange"
    assert captured["target_table"] == "isone.rt_hrl_scheduled_interchange"
    assert captured["database"] == "stage_db"
    assert captured["metadata"] == {
        "start_date": "2026-06-12",
        "end_date": "2026-06-12",
        "run_mode": "test",
    }
    assert len(df) == 1
