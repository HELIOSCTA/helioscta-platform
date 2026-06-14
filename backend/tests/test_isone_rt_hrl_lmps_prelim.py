from __future__ import annotations

import pandas as pd

from backend.scrapes.power.isone import rt_hrl_lmps_prelim


def test_isone_rt_hrl_lmps_prelim_target_contract():
    assert rt_hrl_lmps_prelim.API_SCRAPE_NAME == "rt_hrl_lmps_prelim"
    assert rt_hrl_lmps_prelim.TARGET_SCHEMA == "isone"
    assert rt_hrl_lmps_prelim.TARGET_TABLE == rt_hrl_lmps_prelim.API_SCRAPE_NAME
    assert rt_hrl_lmps_prelim.TARGET_TABLE_FQN == "isone.rt_hrl_lmps_prelim"
    assert rt_hrl_lmps_prelim.PRIMARY_KEY == ["date", "hour_ending", "location"]


def test_isone_rt_hrl_lmps_prelim_format_filters_rows_and_duplicates():
    df = rt_hrl_lmps_prelim._format(
        pd.DataFrame(
            [
                {
                    "H": "D",
                    "Date": "06/13/2026",
                    "Hour Ending": "1",
                    "Location": " .H.INTERNAL_HUB ",
                    "LMP": "20.5",
                    "Energy": "19.0",
                    "Congestion": "1.0",
                    "Loss": "0.5",
                },
                {
                    "H": "D",
                    "Date": "06/13/2026",
                    "Hour Ending": "1",
                    "Location": ".H.INTERNAL_HUB",
                    "LMP": "21.5",
                    "Energy": "20.0",
                    "Congestion": "1.0",
                    "Loss": "0.5",
                },
                {
                    "H": "T",
                    "Date": "06/13/2026",
                    "Hour Ending": "2",
                    "Location": ".H.INTERNAL_HUB",
                    "LMP": "22.5",
                    "Energy": "21.0",
                    "Congestion": "1.0",
                    "Loss": "0.5",
                },
                {
                    "H": "D",
                    "Date": "06/13/2026",
                    "Hour Ending": "2X",
                    "Location": ".H.INTERNAL_HUB",
                    "LMP": "23.5",
                    "Energy": "22.0",
                    "Congestion": "1.0",
                    "Loss": "0.5",
                },
            ]
        )
    )

    assert df.to_dict("records") == [
        {
            "date": pd.Timestamp("2026-06-13").date(),
            "hour_ending": 1,
            "location": ".H.INTERNAL_HUB",
            "lmp": 21.5,
            "energy": 20.0,
            "congestion": 1.0,
            "loss": 0.5,
        }
    ]


def test_isone_rt_hrl_lmps_prelim_pull_uses_static_csv_url_and_metadata(monkeypatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        content = (
            b"header\nheader\nheader\nheader\n"
            b"H,Date,Hour Ending,Location,LMP,Energy,Congestion,Loss\n"
            b"skip\n"
            b"D,06/13/2026,1,.H.INTERNAL_HUB,20.5,19.0,1.0,0.5\n"
            b"footer\n"
        )

    def fake_make_request(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return FakeResponse()

    monkeypatch.setattr(rt_hrl_lmps_prelim.isone_api, "make_request", fake_make_request)

    df = rt_hrl_lmps_prelim._pull(
        start_date=pd.Timestamp("2026-06-13"),
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert captured["url"].endswith(
        "/static-transform/csv/histRpts/rt-lmp/lmp_rt_prelim_20260613.csv"
    )
    assert captured["pipeline_name"] == "rt_hrl_lmps_prelim"
    assert captured["run_id"] == "run-1"
    assert captured["feed_name"] == "rt_hrl_lmps_prelim"
    assert captured["target_table"] == "isone.rt_hrl_lmps_prelim"
    assert captured["database"] == "stage_db"
    assert len(df) == 1
