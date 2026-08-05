from __future__ import annotations

from datetime import date

import pandas as pd

from backend.scrapes.power.spp import _lmp, da_lmps, rt_lmps_prelim


class FakeResponse:
    def __init__(self, text: str, status_code: int = 200):
        self.text = text
        self.status_code = status_code
        self.headers = {}


def test_spp_portal_csv_request_uses_file_browser_path_and_retries(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_get(url, **kwargs):
        calls.append({"url": url, **kwargs})
        if len(calls) == 1:
            return FakeResponse("", status_code=503)
        return FakeResponse(
            "\n".join(
                [
                    "Interval,GMTIntervalEnd,BAA,Settlement Location,Pnode,LMP,MLC,MCC,MEC",
                    "08/05/2026 01:00:00,08/05/2026 06:00:00,SPP,SPPNORTH_HUB,SPPNORTH_H,19.2598,0.0185,1.2258,18.0155",
                ]
            )
        )

    monkeypatch.setattr(_lmp.requests, "get", fake_get)
    monkeypatch.setattr(_lmp.time, "sleep", lambda _seconds: None)

    result = _lmp.fetch_portal_csv(
        endpoint_url=_lmp.DA_ENDPOINT,
        portal_path="/2026/08/By_Day/DA-LMP-SL-202608050100.csv",
        retry_delay_seconds=0,
    )

    assert len(calls) == 2
    assert calls[0]["url"] == (
        "https://portal.spp.org/file-browser-api/download/"
        "da-lmp-by-settlement-location"
    )
    assert calls[0]["params"] == {
        "path": "/2026/08/By_Day/DA-LMP-SL-202608050100.csv"
    }
    assert "headers" not in calls[0]
    assert result.http_status == 200
    assert list(result.df.columns) == [
        "Interval",
        "GMTIntervalEnd",
        "BAA",
        "Settlement Location",
        "Pnode",
        "LMP",
        "MLC",
        "MCC",
        "MEC",
    ]


def test_spp_da_lmp_format_maps_components_and_latest_duplicate():
    raw = pd.DataFrame(
        [
            {
                "Interval": "08/05/2026 01:00:00",
                "GMTIntervalEnd": "08/05/2026 06:00:00",
                "BAA": "SPP",
                "Settlement Location": "SPPNORTH_HUB",
                "Pnode": "SPPNORTH_H",
                "LMP": "19.2598",
                "MLC": "0.0185",
                "MCC": "1.2258",
                "MEC": "18.0155",
            },
            {
                "Interval": "08/05/2026 01:00:00",
                "GMTIntervalEnd": "08/05/2026 06:00:00",
                "BAA": "SPP",
                "Settlement Location": "SPPNORTH_HUB",
                "Pnode": "SPPNORTH_H",
                "LMP": "20.0000",
                "MLC": "0.5000",
                "MCC": "1.2500",
                "MEC": "18.2500",
            },
            {
                "Interval": "08/05/2026 01:00:00",
                "GMTIntervalEnd": "08/05/2026 06:00:00",
                "BAA": "SPP",
                "Settlement Location": "NOT_A_HUB",
                "Pnode": "OTHER",
                "LMP": "99.0000",
                "MLC": "0.0000",
                "MCC": "0.0000",
                "MEC": "99.0000",
            },
        ]
    )

    df = da_lmps._format(raw, operating_date=date(2026, 8, 5))

    assert len(df) == 1
    row = df.iloc[0]
    assert row["interval_start_time_utc"] == pd.Timestamp("2026-08-05T05:00:00Z")
    assert row["interval_end_time_utc"] == pd.Timestamp("2026-08-05T06:00:00Z")
    assert row["operating_date"] == date(2026, 8, 5)
    assert row["operating_hour"] == 1
    assert row["operating_interval"] == 0
    assert row["node_id"] == "SPPNORTH_HUB"
    assert row["node"] == "SPPNORTH_H"
    assert row["market_run_id"] == "DAM"
    assert row["price_status"] == "Published"
    assert row["time_resolution"] == "hourly"
    assert row["locational_marginal_price"] == 20.0
    assert row["energy_component"] == 18.25
    assert row["congestion_component"] == 1.25
    assert row["loss_component"] == 0.5


def test_spp_rt_lmp_format_maps_five_minute_interval():
    raw = pd.DataFrame(
        [
            {
                "Interval": "08/04/2026 00:05:00",
                "GMTIntervalEnd": "08/04/2026 05:05:00",
                "Settlement Location": "SPPSOUTH_HUB",
                "Pnode": "SPPSOUTH_H",
                "LMP": "17.7760",
                "MLC": "0.0847",
                "MCC": "15.0080",
                "MEC": "2.6833",
                "BAA": "SPP",
            }
        ]
    )

    df = rt_lmps_prelim._format(raw, operating_date=date(2026, 8, 4))

    assert len(df) == 1
    row = df.iloc[0]
    assert row["interval_start_time_utc"] == pd.Timestamp("2026-08-04T05:00:00Z")
    assert row["interval_end_time_utc"] == pd.Timestamp("2026-08-04T05:05:00Z")
    assert row["operating_hour"] == 1
    assert row["operating_interval"] == 1
    assert row["node_id"] == "SPPSOUTH_HUB"
    assert row["market_run_id"] == "RTBM"
    assert row["price_status"] == "Preliminary"
    assert row["time_resolution"] == "five_minute"
    assert row["locational_marginal_price"] == 17.776
    assert row["energy_component"] == 2.6833
    assert row["congestion_component"] == 15.008
    assert row["loss_component"] == 0.0847


def test_spp_lmp_pull_logs_one_summary_row(monkeypatch):
    logs: list[dict[str, object]] = []

    def fake_fetcher(**kwargs):
        assert kwargs["endpoint_url"] == _lmp.DA_ENDPOINT
        assert kwargs["portal_path"] == "/2026/08/By_Day/DA-LMP-SL-202608050100.csv"
        return _lmp.PortalCsvResult(
            df=pd.DataFrame(
                [
                    {
                        "Interval": "08/05/2026 01:00:00",
                        "GMTIntervalEnd": "08/05/2026 06:00:00",
                        "BAA": "SPP",
                        "Settlement Location": "SPPNORTH_HUB",
                        "Pnode": "SPPNORTH_H",
                        "LMP": "19.2598",
                        "MLC": "0.0185",
                        "MCC": "1.2258",
                        "MEC": "18.0155",
                    }
                ]
            ),
            endpoint_url=_lmp.DA_ENDPOINT,
            portal_path=kwargs["portal_path"],
            http_status=200,
        )

    monkeypatch.setattr(_lmp, "log_api_fetch", lambda **kwargs: logs.append(kwargs))

    df = _lmp.pull_lmps(
        operating_date=date(2026, 8, 5),
        market_run_id="DAM",
        price_status="Published",
        time_resolution="hourly",
        pipeline_name="spp_da_lmps",
        target_table="spp.da_lmps",
        endpoint_url=_lmp.DA_ENDPOINT,
        portal_paths=(_lmp.da_portal_path(date(2026, 8, 5)),),
        nodes=("SPPNORTH_HUB",),
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
        csv_fetcher=fake_fetcher,
    )

    assert len(df) == 1
    assert len(logs) == 1
    log = logs[0]
    assert log["provider"] == "spp"
    assert log["pipeline_name"] == "spp_da_lmps"
    assert log["target_table"] == "spp.da_lmps"
    assert log["target_host"] == "portal.spp.org"
    assert log["target_path"] == "/file-browser-api/download/da-lmp-by-settlement-location"
    assert log["rows_returned"] == 1
    assert log["database"] == "stage_db"
    assert log["metadata"]["run_mode"] == "test"
    assert log["metadata"]["api_family"] == "spp_portal_file_browser"
    assert log["metadata"]["files_expected"] == 1
    assert log["metadata"]["files_fetched"] == 1


def test_spp_rt_probe_failure_logs_summary_row(monkeypatch):
    logs: list[dict[str, object]] = []

    def fake_fetch_portal_csv(**kwargs):
        raise _lmp.SPPPortalDataNotAvailable(
            f"not published: {kwargs['portal_path']}",
            status_code=404,
        )

    monkeypatch.setattr(_lmp, "fetch_portal_csv", fake_fetch_portal_csv)
    monkeypatch.setattr(_lmp, "log_api_fetch", lambda **kwargs: logs.append(kwargs))

    try:
        rt_lmps_prelim._pull(
            operating_date=date(2026, 8, 4),
            nodes=("SPPNORTH_HUB",),
            run_id="run-1",
            database="stage_db",
            metadata={"run_mode": "backfill"},
        )
    except _lmp.SPPPortalDataNotAvailable as exc:
        assert "not published" in str(exc)
    else:
        raise AssertionError("expected SPPPortalDataNotAvailable")

    assert len(logs) == 1
    log = logs[0]
    assert log["provider"] == "spp"
    assert log["pipeline_name"] == "spp_rt_lmps_prelim"
    assert log["target_table"] == "spp.rt_lmps_prelim"
    assert log["status"] == "failure"
    assert log["http_status"] == 404
    assert log["database"] == "stage_db"
    assert log["metadata"]["run_mode"] == "backfill"
    assert log["metadata"]["files_expected"] == 288
    assert log["metadata"]["files_fetched"] == 0
    assert log["metadata"]["publication_probe_path"] == (
        "/2026/08/By_Interval/04/RTBM-LMP-SL-202608050000.csv"
    )


def test_spp_rt_paths_include_last_interval_in_start_day_folder():
    paths = _lmp.rt_portal_paths_for_day(date(2026, 8, 4))

    assert len(paths) == 288
    assert paths[0] == "/2026/08/By_Interval/04/RTBM-LMP-SL-202608040005.csv"
    assert paths[-1] == "/2026/08/By_Interval/04/RTBM-LMP-SL-202608050000.csv"
    assert _lmp.rt_final_interval_portal_path(date(2026, 8, 4)) == paths[-1]


def test_spp_lmp_upsert_uses_contract_columns(monkeypatch):
    captured: dict[str, object] = {}
    df = da_lmps._format(
        pd.DataFrame(
            [
                {
                    "Interval": "08/05/2026 01:00:00",
                    "GMTIntervalEnd": "08/05/2026 06:00:00",
                    "BAA": "SPP",
                    "Settlement Location": "SPPNORTH_HUB",
                    "Pnode": "SPPNORTH_H",
                    "LMP": "19.2598",
                    "MLC": "0.0185",
                    "MCC": "1.2258",
                    "MEC": "18.0155",
                }
            ]
        ),
        operating_date=date(2026, 8, 5),
    )

    def fake_upsert_dataframe(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(_lmp.db, "upsert_dataframe", fake_upsert_dataframe)

    da_lmps._upsert(df, database="stage_db")

    assert captured["database"] == "stage_db"
    assert captured["schema"] == "spp"
    assert captured["table_name"] == "da_lmps"
    assert captured["columns"] == _lmp.TARGET_COLUMNS
    assert captured["primary_key"] == _lmp.PRIMARY_KEY
    assert list(captured["df"].columns) == _lmp.TARGET_COLUMNS
