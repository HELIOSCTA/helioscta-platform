from __future__ import annotations

import pytest
import pandas as pd

from backend.scrapes.power.isone import isone_api_utils, rt_hrl_lmps_final


def test_isone_rt_hrl_lmps_final_target_contract():
    assert rt_hrl_lmps_final.API_SCRAPE_NAME == "rt_hrl_lmps_final"
    assert rt_hrl_lmps_final.TARGET_SCHEMA == "isone"
    assert rt_hrl_lmps_final.TARGET_TABLE == rt_hrl_lmps_final.API_SCRAPE_NAME
    assert rt_hrl_lmps_final.TARGET_TABLE_FQN == "isone.rt_hrl_lmps_final"
    assert rt_hrl_lmps_final.PRIMARY_KEY == [
        "date",
        "hour_ending",
        "location_id",
        "location_name",
        "location_type",
    ]


def test_isone_rt_hrl_lmps_final_format_filters_header_rows_and_duplicate_keys():
    df = rt_hrl_lmps_final._format(
        pd.DataFrame(
            [
                {
                    "H": "D",
                    "Date": "06/11/2026",
                    "Hour Ending": "1",
                    "Location ID": "4000",
                    "Location Name": " .H.INTERNAL_HUB ",
                    "Location Type": " HUB ",
                    "Locational Marginal Price": "20.5",
                    "Energy Component": "19.0",
                    "Congestion Component": "1.0",
                    "Marginal Loss Component": "0.5",
                },
                {
                    "H": "D",
                    "Date": "06/11/2026",
                    "Hour Ending": "1",
                    "Location ID": "4000",
                    "Location Name": ".H.INTERNAL_HUB",
                    "Location Type": "HUB",
                    "Locational Marginal Price": "21.5",
                    "Energy Component": "20.0",
                    "Congestion Component": "1.0",
                    "Marginal Loss Component": "0.5",
                },
                {
                    "H": "T",
                    "Date": "06/11/2026",
                    "Hour Ending": "2",
                    "Location ID": "4000",
                    "Location Name": ".H.INTERNAL_HUB",
                    "Location Type": "HUB",
                    "Locational Marginal Price": "22.5",
                    "Energy Component": "21.0",
                    "Congestion Component": "1.0",
                    "Marginal Loss Component": "0.5",
                },
                {
                    "H": "D",
                    "Date": "06/11/2026",
                    "Hour Ending": "1",
                    "Location ID": "4001",
                    "Location Name": ".H.OTHER_HUB",
                    "Location Type": "HUB",
                    "Locational Marginal Price": "99.5",
                    "Energy Component": "98.0",
                    "Congestion Component": "1.0",
                    "Marginal Loss Component": "0.5",
                },
            ]
        )
    )

    assert df.to_dict("records") == [
        {
            "date": pd.Timestamp("2026-06-11").date(),
            "hour_ending": 1,
            "location_id": 4000,
            "location_name": ".H.INTERNAL_HUB",
            "location_type": "HUB",
            "locational_marginal_price": 21.5,
            "energy_component": 20.0,
            "congestion_component": 1.0,
            "marginal_loss_component": 0.5,
        }
    ]


def test_isone_rt_hrl_lmps_final_pull_uses_static_csv_url_and_metadata(monkeypatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        content = (
            b"header\nheader\nheader\nheader\n"
            b"Date,Hour Ending,Location ID,Location Name,Location Type,"
            b"Locational Marginal Price,Energy Component,Congestion Component,"
            b"Marginal Loss Component,H\n"
            b"skip\n"
            b"06/11/2026,1,4000,.H.INTERNAL_HUB,HUB,20.5,19.0,1.0,0.5,D\n"
            b"footer\n"
        )

    def fake_make_request(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return FakeResponse()

    monkeypatch.setattr(rt_hrl_lmps_final.isone_api, "make_request", fake_make_request)

    df = rt_hrl_lmps_final._pull(
        start_date=pd.Timestamp("2026-06-11"),
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert captured["url"].endswith(
        "/static-transform/csv/histRpts/rt-lmp/lmp_rt_final_20260611.csv"
    )
    assert captured["pipeline_name"] == "rt_hrl_lmps_final"
    assert captured["run_id"] == "run-1"
    assert captured["feed_name"] == "rt_hrl_lmps_final"
    assert captured["target_table"] == "isone.rt_hrl_lmps_final"
    assert captured["database"] == "stage_db"
    assert captured["metadata"] == {
        "operating_date": "2026-06-11",
        "run_mode": "test",
    }
    assert len(df) == 1


def test_isone_rt_hrl_lmps_final_pull_returns_empty_on_source_no_data(monkeypatch):
    class FakeResponse:
        content = b"No data exists for this period.\n"

    monkeypatch.setattr(
        rt_hrl_lmps_final.isone_api,
        "make_request",
        lambda *args, **kwargs: FakeResponse(),
    )

    df = rt_hrl_lmps_final._pull(start_date=pd.Timestamp("2026-06-12"))

    assert df.empty


def test_isone_parse_csv_response_raises_on_source_no_data_message():
    class FakeResponse:
        content = b"No data exists for this period.\n"

    with pytest.raises(RuntimeError, match="No data exists"):
        isone_api_utils.parse_csv_response(FakeResponse())
