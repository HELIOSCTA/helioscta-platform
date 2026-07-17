from __future__ import annotations

from datetime import date
from io import BytesIO
from zipfile import ZipFile

import pandas as pd

from backend.scrapes.power.caiso import _lmp, da_lmps, oasis, rt_lmps


def test_caiso_da_lmps_target_contract():
    assert da_lmps.API_SCRAPE_NAME == "da_lmps"
    assert da_lmps.OASIS_QUERY_NAME == "PRC_LMP"
    assert da_lmps.MARKET_RUN_ID == "DAM"
    assert da_lmps.TARGET_SCHEMA == "caiso"
    assert da_lmps.TARGET_TABLE == "da_lmps"
    assert da_lmps.TARGET_TABLE_FQN == "caiso.da_lmps"
    assert da_lmps.DEFAULT_NODES == ("TH_NP15_GEN-APND", "TH_SP15_GEN-APND")
    assert da_lmps.PRIMARY_KEY == [
        "interval_start_time_utc",
        "node_id",
        "market_run_id",
    ]


def test_caiso_rt_lmps_target_contract():
    assert rt_lmps.API_SCRAPE_NAME == "rt_lmps"
    assert rt_lmps.OASIS_QUERY_NAME == "PRC_INTVL_LMP"
    assert rt_lmps.MARKET_RUN_ID == "RTM"
    assert rt_lmps.TARGET_SCHEMA == "caiso"
    assert rt_lmps.TARGET_TABLE == "rt_lmps"
    assert rt_lmps.TARGET_TABLE_FQN == "caiso.rt_lmps"
    assert rt_lmps.DEFAULT_NODES == ("TH_NP15_GEN-APND", "TH_SP15_GEN-APND")


def test_caiso_market_day_window_uses_pacific_dst_offsets():
    summer_start, summer_end = _lmp.market_day_window_utc(date(2026, 7, 16))
    winter_start, winter_end = _lmp.market_day_window_utc(date(2026, 1, 16))
    spring_start, spring_end = _lmp.market_day_window_utc(date(2026, 3, 8))

    assert _lmp.format_oasis_datetime(summer_start) == "20260716T07:00-0000"
    assert _lmp.format_oasis_datetime(summer_end) == "20260717T07:00-0000"
    assert _lmp.format_oasis_datetime(winter_start) == "20260116T08:00-0000"
    assert _lmp.format_oasis_datetime(winter_end) == "20260117T08:00-0000"
    assert _lmp.format_oasis_datetime(spring_start) == "20260308T08:00-0000"
    assert _lmp.format_oasis_datetime(spring_end) == "20260309T07:00-0000"


def test_caiso_da_lmp_format_pivots_component_rows():
    df = da_lmps._format(
        pd.DataFrame(
            [
                _raw_lmp_row("LMP", "33.25", price_column="MW"),
                _raw_lmp_row("MCE", "30.00", price_column="MW"),
                _raw_lmp_row("MCC", "2.00", price_column="MW"),
                _raw_lmp_row("MCL", "1.25", price_column="MW"),
                _raw_lmp_row("MGHG", "0.00", price_column="MW"),
                _raw_lmp_row("LMP", "34.25", price_column="MW"),
            ]
        )
    )

    assert len(df) == 1
    row = df.iloc[0]
    assert row["interval_start_time_utc"] == pd.Timestamp(
        "2026-07-16T07:00:00Z"
    )
    assert row["operating_date"] == pd.Timestamp("2026-07-16").date()
    assert row["operating_hour"] == 1
    assert row["operating_interval"] == 0
    assert row["node_id"] == "TH_NP15_GEN-APND"
    assert row["market_run_id"] == "DAM"
    assert row["locational_marginal_price"] == 34.25
    assert row["energy_component"] == 30.0
    assert row["congestion_component"] == 2.0
    assert row["loss_component"] == 1.25
    assert row["greenhouse_gas_component"] == 0.0
    assert row["source_query_name"] == "PRC_LMP"
    assert row["source_version"] == 12


def test_caiso_rt_lmp_format_uses_value_column():
    df = rt_lmps._format(
        pd.DataFrame(
            [
                _raw_lmp_row(
                    "LMP",
                    "41.10",
                    market_run_id="RTM",
                    opr_interval="6",
                    price_column="VALUE",
                ),
                _raw_lmp_row(
                    "MCE",
                    "39.00",
                    market_run_id="RTM",
                    opr_interval="6",
                    price_column="VALUE",
                ),
            ]
        )
    )

    assert len(df) == 1
    row = df.iloc[0]
    assert row["market_run_id"] == "RTM"
    assert row["operating_interval"] == 6
    assert row["locational_marginal_price"] == 41.1
    assert row["energy_component"] == 39.0
    assert row["source_query_name"] == "PRC_INTVL_LMP"
    assert row["source_version"] == 2


def test_caiso_da_pull_uses_oasis_query_and_metadata(monkeypatch):
    captured: dict[str, object] = {}

    def fake_fetch_single_zip_csv(**kwargs):
        captured.update(kwargs)
        return pd.DataFrame([_raw_lmp_row("LMP", "33.25", price_column="MW")])

    monkeypatch.setattr(da_lmps._lmp.oasis, "fetch_single_zip_csv", fake_fetch_single_zip_csv)

    df = da_lmps._pull(
        trading_date=date(2026, 7, 16),
        nodes=("NODE_A", "NODE_B"),
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert captured["query_name"] == "PRC_LMP"
    assert captured["market_run_id"] == "DAM"
    assert captured["version"] == 12
    assert captured["startdatetime"] == "20260716T07:00-0000"
    assert captured["enddatetime"] == "20260717T07:00-0000"
    assert captured["nodes"] == ("NODE_A", "NODE_B")
    assert captured["pipeline_name"] == "da_lmps"
    assert captured["feed_name"] == "da_lmps"
    assert captured["target_table"] == "caiso.da_lmps"
    assert captured["operation_name"] == "da_lmps"
    assert captured["run_id"] == "run-1"
    assert captured["database"] == "stage_db"
    assert captured["metadata"] == {
        "trading_date": "2026-07-16",
        "run_mode": "test",
    }
    assert len(df) == 1


def test_caiso_oasis_fetch_single_zip_csv_logs_and_parses(monkeypatch):
    logs: list[dict[str, object]] = []
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200
        headers = {"Content-Type": "application/x-zip-compressed"}
        content = _zip_bytes(
            "sample.csv",
            "INTERVALSTARTTIME_GMT,NODE,MW\n"
            "2026-07-16T07:00:00-00:00,TH_NP15_GEN-APND,33.25\n",
        )

    def fake_get(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return FakeResponse()

    monkeypatch.setattr(oasis.requests, "get", fake_get)
    monkeypatch.setattr(oasis, "log_api_fetch", lambda **kwargs: logs.append(kwargs))

    df = oasis.fetch_single_zip_csv(
        query_name="PRC_LMP",
        market_run_id="DAM",
        version=12,
        startdatetime="20260716T07:00-0000",
        enddatetime="20260717T07:00-0000",
        nodes=("TH_NP15_GEN-APND", "TH_SP15_GEN-APND"),
        pipeline_name="da_lmps",
        run_id="run-1",
        feed_name="da_lmps",
        target_table="caiso.da_lmps",
        operation_name="da_lmps",
        metadata={"run_mode": "test"},
        database="stage_db",
    )

    assert captured["url"] == oasis.OASIS_SINGLE_ZIP_URL
    assert captured["params"]["node"] == "TH_NP15_GEN-APND,TH_SP15_GEN-APND"
    assert df.to_dict("records") == [
        {
            "INTERVALSTARTTIME_GMT": "2026-07-16T07:00:00-00:00",
            "NODE": "TH_NP15_GEN-APND",
            "MW": 33.25,
        }
    ]
    assert len(logs) == 1
    log = logs[0]
    assert log["provider"] == "caiso"
    assert log["pipeline_name"] == "da_lmps"
    assert log["operation_name"] == "da_lmps"
    assert log["target_table"] == "caiso.da_lmps"
    assert log["status"] == "success"
    assert log["http_status"] == 200
    assert log["rows_returned"] == 1
    assert log["database"] == "stage_db"
    assert log["metadata"]["csv_filename"] == "sample.csv"
    assert log["metadata"]["run_mode"] == "test"


def _raw_lmp_row(
    lmp_type: str,
    price: str,
    *,
    market_run_id: str = "DAM",
    opr_interval: str = "0",
    price_column: str,
) -> dict[str, str]:
    return {
        "INTERVALSTARTTIME_GMT": "2026-07-16T07:00:00-00:00",
        "INTERVALENDTIME_GMT": "2026-07-16T08:00:00-00:00",
        "OPR_DT": "2026-07-16",
        "OPR_HR": "1",
        "OPR_INTERVAL": opr_interval,
        "NODE_ID_XML": "TH_NP15_GEN-APND",
        "NODE_ID": "TH_NP15_GEN-APND",
        "NODE": "TH_NP15_GEN-APND",
        "MARKET_RUN_ID": market_run_id,
        "LMP_TYPE": lmp_type,
        "XML_DATA_ITEM": "LMP_PRC",
        "PNODE_RESMRID": "TH_NP15_GEN-APND",
        "GRP_TYPE": "ALL_APNODES",
        "POS": "0",
        price_column: price,
        "GROUP": "1",
    }


def _zip_bytes(filename: str, content: str) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr(filename, content)
    return buffer.getvalue()
