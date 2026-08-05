from __future__ import annotations

from datetime import date

import pandas as pd

from backend.scrapes.power.nyiso import _lmp, da_lmps, rt_lmps_prelim


class FakeResponse:
    def __init__(self, text: str, status_code: int = 200):
        self.text = text
        self.status_code = status_code
        self.headers = {}


def test_nyiso_mis_csv_request_retries_without_credentials(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_get(url, **kwargs):
        calls.append({"url": url, **kwargs})
        if len(calls) == 1:
            return FakeResponse("", status_code=503)
        return FakeResponse(
            "\n".join(
                [
                    "Time Stamp,Name,PTID,LBMP ($/MWHr),"
                    "Marginal Cost Losses ($/MWHr),"
                    "Marginal Cost Congestion ($/MWHr)",
                    "08/06/2026 00:00,CAPITL,61757,51.29,1.73,0.00",
                ]
            )
        )

    monkeypatch.setattr(_lmp.requests, "get", fake_get)
    monkeypatch.setattr(_lmp.time, "sleep", lambda _seconds: None)

    result = _lmp.fetch_mis_csv(
        endpoint_url=_lmp.da_csv_url(date(2026, 8, 6)),
        retry_delay_seconds=0,
    )

    assert len(calls) == 2
    assert calls[0]["url"] == (
        "https://mis.nyiso.com/public/csv/damlbmp/20260806damlbmp_zone.csv"
    )
    assert "headers" not in calls[0]
    assert "params" not in calls[0]
    assert result.http_status == 200
    assert list(result.df.columns) == [
        "Time Stamp",
        "Name",
        "PTID",
        "LBMP ($/MWHr)",
        "Marginal Cost Losses ($/MWHr)",
        "Marginal Cost Congestion ($/MWHr)",
    ]


def test_nyiso_da_lmp_format_maps_components_and_filters_load_zones():
    raw = pd.DataFrame(
        [
            {
                "Time Stamp": "08/06/2026 00:00",
                "Name": "N.Y.C.",
                "PTID": "61761",
                "LBMP ($/MWHr)": "54.00",
                "Marginal Cost Losses ($/MWHr)": "3.00",
                "Marginal Cost Congestion ($/MWHr)": "1.00",
            },
            {
                "Time Stamp": "08/06/2026 00:00",
                "Name": "Not A Load Zone",
                "PTID": "99999",
                "LBMP ($/MWHr)": "99.00",
                "Marginal Cost Losses ($/MWHr)": "0.00",
                "Marginal Cost Congestion ($/MWHr)": "0.00",
            },
        ]
    )

    df = da_lmps._format(raw, operating_date=date(2026, 8, 6))

    assert len(df) == 1
    row = df.iloc[0]
    assert row["interval_start_time_utc"] == pd.Timestamp("2026-08-06T04:00:00Z")
    assert row["interval_end_time_utc"] == pd.Timestamp("2026-08-06T05:00:00Z")
    assert row["operating_date"] == date(2026, 8, 6)
    assert row["operating_hour"] == 1
    assert row["operating_interval"] == 0
    assert row["ptid"] == 61761
    assert row["node_id"] == "N.Y.C."
    assert row["node"] == "N.Y.C."
    assert row["market_run_id"] == "DAM"
    assert row["price_status"] == "Published"
    assert row["time_resolution"] == "hourly"
    assert row["locational_marginal_price"] == 54.0
    assert row["energy_component"] == 50.0
    assert row["congestion_component"] == 1.0
    assert row["loss_component"] == 3.0


def test_nyiso_rt_lmp_format_maps_five_minute_interval():
    raw = pd.DataFrame(
        [
            {
                "Time Stamp": "08/04/2026 00:05:00",
                "Name": "LONGIL",
                "PTID": "61762",
                "LBMP ($/MWHr)": "36.87",
                "Marginal Cost Losses ($/MWHr)": "2.48",
                "Marginal Cost Congestion ($/MWHr)": "0.00",
            }
        ]
    )

    df = rt_lmps_prelim._format(raw, operating_date=date(2026, 8, 4))

    assert len(df) == 1
    row = df.iloc[0]
    assert row["interval_start_time_utc"] == pd.Timestamp("2026-08-04T04:00:00Z")
    assert row["interval_end_time_utc"] == pd.Timestamp("2026-08-04T04:05:00Z")
    assert row["operating_hour"] == 1
    assert row["operating_interval"] == 1
    assert row["ptid"] == 61762
    assert row["node_id"] == "LONGIL"
    assert row["market_run_id"] == "RTD"
    assert row["price_status"] == "Preliminary"
    assert row["time_resolution"] == "five_minute"
    assert row["locational_marginal_price"] == 36.87
    assert round(row["energy_component"], 2) == 34.39
    assert row["congestion_component"] == 0.0
    assert row["loss_component"] == 2.48


def test_nyiso_rt_lmp_format_drops_non_canonical_rows():
    raw = pd.DataFrame(
        [
            {
                "Time Stamp": "08/04/2026 00:05:00",
                "Name": "N.Y.C.",
                "PTID": "61761",
                "LBMP ($/MWHr)": "36.87",
                "Marginal Cost Losses ($/MWHr)": "2.48",
                "Marginal Cost Congestion ($/MWHr)": "0.00",
            },
            {
                "Time Stamp": "08/04/2026 09:25:27",
                "Name": "N.Y.C.",
                "PTID": "61761",
                "LBMP ($/MWHr)": "999.00",
                "Marginal Cost Losses ($/MWHr)": "0.00",
                "Marginal Cost Congestion ($/MWHr)": "0.00",
            },
            {
                "Time Stamp": "08/04/2026 00:10:00",
                "Name": "N.Y.C.",
                "PTID": "61761",
                "LBMP ($/MWHr)": "37.25",
                "Marginal Cost Losses ($/MWHr)": "2.50",
                "Marginal Cost Congestion ($/MWHr)": "0.00",
            },
            {
                "Time Stamp": "08/05/2026 00:05:00",
                "Name": "N.Y.C.",
                "PTID": "61761",
                "LBMP ($/MWHr)": "998.00",
                "Marginal Cost Losses ($/MWHr)": "0.00",
                "Marginal Cost Congestion ($/MWHr)": "0.00",
            },
        ]
    )

    df = rt_lmps_prelim._format(raw, operating_date=date(2026, 8, 4))

    assert len(df) == 2
    assert list(df["locational_marginal_price"]) == [36.87, 37.25]
    assert list(df["interval_end_time_utc"]) == [
        pd.Timestamp("2026-08-04T04:05:00Z"),
        pd.Timestamp("2026-08-04T04:10:00Z"),
    ]


def test_nyiso_lmp_pull_logs_one_summary_row(monkeypatch):
    logs: list[dict[str, object]] = []

    def fake_fetcher(**kwargs):
        assert kwargs["endpoint_url"] == _lmp.da_csv_url(date(2026, 8, 6))
        return _lmp.MISCsvResult(
            df=pd.DataFrame(
                [
                    {
                        "Time Stamp": "08/06/2026 00:00",
                        "Name": "N.Y.C.",
                        "PTID": "61761",
                        "LBMP ($/MWHr)": "54.00",
                        "Marginal Cost Losses ($/MWHr)": "3.00",
                        "Marginal Cost Congestion ($/MWHr)": "1.00",
                    }
                ]
            ),
            endpoint_url=kwargs["endpoint_url"],
            http_status=200,
        )

    monkeypatch.setattr(_lmp, "log_api_fetch", lambda **kwargs: logs.append(kwargs))

    df = _lmp.pull_lmps(
        operating_date=date(2026, 8, 6),
        market_run_id="DAM",
        price_status="Published",
        time_resolution="hourly",
        pipeline_name="nyiso_da_lmps",
        target_table="nyiso.da_lmps",
        endpoint_url=_lmp.da_csv_url(date(2026, 8, 6)),
        nodes=("N.Y.C.",),
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
        csv_fetcher=fake_fetcher,
    )

    assert len(df) == 1
    assert len(logs) == 1
    log = logs[0]
    assert log["provider"] == "nyiso"
    assert log["pipeline_name"] == "nyiso_da_lmps"
    assert log["target_table"] == "nyiso.da_lmps"
    assert log["target_host"] == "mis.nyiso.com"
    assert log["target_path"] == "/public/csv/damlbmp/20260806damlbmp_zone.csv"
    assert log["rows_returned"] == 1
    assert log["database"] == "stage_db"
    assert log["metadata"]["run_mode"] == "test"
    assert log["metadata"]["api_family"] == "nyiso_mis_csv"
    assert log["metadata"]["files_expected"] == 1
    assert log["metadata"]["files_fetched"] == 1
    assert log["metadata"]["operating_date"] == "2026-08-06"


def test_nyiso_lmp_upsert_uses_contract_columns(monkeypatch):
    captured: dict[str, object] = {}
    df = da_lmps._format(
        pd.DataFrame(
            [
                {
                    "Time Stamp": "08/06/2026 00:00",
                    "Name": "N.Y.C.",
                    "PTID": "61761",
                    "LBMP ($/MWHr)": "54.00",
                    "Marginal Cost Losses ($/MWHr)": "3.00",
                    "Marginal Cost Congestion ($/MWHr)": "1.00",
                }
            ]
        ),
        operating_date=date(2026, 8, 6),
    )

    def fake_upsert_dataframe(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(_lmp.db, "upsert_dataframe", fake_upsert_dataframe)

    da_lmps._upsert(df, database="stage_db")

    assert captured["database"] == "stage_db"
    assert captured["schema"] == "nyiso"
    assert captured["table_name"] == "da_lmps"
    assert captured["columns"] == _lmp.TARGET_COLUMNS
    assert captured["primary_key"] == _lmp.PRIMARY_KEY
    assert list(captured["df"].columns) == _lmp.TARGET_COLUMNS
