from __future__ import annotations

import pandas as pd

from backend.scrapes.power.isone import da_hrl_lmps


def test_isone_da_hrl_lmps_target_contract():
    assert da_hrl_lmps.API_SCRAPE_NAME == "da_hrl_lmps"
    assert da_hrl_lmps.TARGET_SCHEMA == "isone"
    assert da_hrl_lmps.TARGET_TABLE == da_hrl_lmps.API_SCRAPE_NAME
    assert da_hrl_lmps.TARGET_TABLE_FQN == "isone.da_hrl_lmps"
    assert da_hrl_lmps.PRIMARY_KEY == [
        "date",
        "hour_ending",
        "location_id",
        "location_name",
        "location_type",
    ]


def test_isone_da_hrl_lmps_format_filters_header_rows_and_duplicate_keys():
    df = da_hrl_lmps._format(
        pd.DataFrame(
            [
                {
                    "H": "D",
                    "Date": "06/13/2026",
                    "Hour Ending": "1",
                    "Location ID": "4000",
                    "Location Name": " .H.INTERNAL_HUB ",
                    "Location Type": " HUB ",
                    "Locational Marginal Price": "25.5",
                    "Energy Component": "24.0",
                    "Congestion Component": "1.0",
                    "Marginal Loss Component": "0.5",
                },
                {
                    "H": "D",
                    "Date": "06/13/2026",
                    "Hour Ending": "1",
                    "Location ID": "4000",
                    "Location Name": ".H.INTERNAL_HUB",
                    "Location Type": "HUB",
                    "Locational Marginal Price": "26.5",
                    "Energy Component": "25.0",
                    "Congestion Component": "1.0",
                    "Marginal Loss Component": "0.5",
                },
                {
                    "H": "T",
                    "Date": "06/13/2026",
                    "Hour Ending": "2",
                    "Location ID": "4000",
                    "Location Name": ".H.INTERNAL_HUB",
                    "Location Type": "HUB",
                    "Locational Marginal Price": "27.5",
                    "Energy Component": "26.0",
                    "Congestion Component": "1.0",
                    "Marginal Loss Component": "0.5",
                },
                {
                    "H": "D",
                    "Date": "06/13/2026",
                    "Hour Ending": "2X",
                    "Location ID": "4000",
                    "Location Name": ".H.INTERNAL_HUB",
                    "Location Type": "HUB",
                    "Locational Marginal Price": "28.5",
                    "Energy Component": "27.0",
                    "Congestion Component": "1.0",
                    "Marginal Loss Component": "0.5",
                },
            ]
        )
    )

    assert df.to_dict("records") == [
        {
            "date": pd.Timestamp("2026-06-13").date(),
            "hour_ending": 1,
            "location_id": 4000,
            "location_name": ".H.INTERNAL_HUB",
            "location_type": "HUB",
            "locational_marginal_price": 26.5,
            "energy_component": 25.0,
            "congestion_component": 1.0,
            "marginal_loss_component": 0.5,
        }
    ]


def test_isone_da_hrl_lmps_pull_uses_static_csv_url_and_metadata(monkeypatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        content = (
            b"header\nheader\nheader\nheader\n"
            b"Date,Hour Ending,Location ID,Location Name,Location Type,"
            b"Locational Marginal Price,Energy Component,Congestion Component,"
            b"Marginal Loss Component,H\n"
            b"skip\n"
            b"06/13/2026,1,4000,.H.INTERNAL_HUB,HUB,25.5,24.0,1.0,0.5,D\n"
            b"footer\n"
        )

    def fake_make_request(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return FakeResponse()

    monkeypatch.setattr(da_hrl_lmps.isone_api, "make_request", fake_make_request)

    df = da_hrl_lmps._pull(
        start_date=pd.Timestamp("2026-06-13"),
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert captured["url"].endswith(
        "/static-transform/csv/histRpts/da-lmp/WW_DALMP_ISO_20260613.csv"
    )
    assert captured["pipeline_name"] == "da_hrl_lmps"
    assert captured["run_id"] == "run-1"
    assert captured["feed_name"] == "da_hrl_lmps"
    assert captured["target_table"] == "isone.da_hrl_lmps"
    assert captured["database"] == "stage_db"
    assert captured["metadata"] == {
        "operating_date": "2026-06-13",
        "run_mode": "test",
    }
    assert len(df) == 1
