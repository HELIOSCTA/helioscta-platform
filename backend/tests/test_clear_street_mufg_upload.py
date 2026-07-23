from __future__ import annotations

from datetime import date
from pathlib import Path

import pandas as pd
import pytest

from backend.orchestration.positions_and_trades import clear_street_mufg_upload
from backend.scrapes.clear_street import (
    mufg_upload as mufg_clear_street_trades,
)


def _extract_df(
    *,
    trade_date: date = date(2026, 7, 6),
    trade_status: str = "New",
) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "RECORD_ID": "T",
                "ACCOUNT_NUMBER": "GHELI",
                "TRADE_DATE": trade_date.strftime("%Y%m%d"),
                "GIVE_IN_OUT_FIRM_NUM": "905",
                "SECURITY_DESCRIPTION": "NATURAL GAS HENRY HUB FUTURE",
                "INSTRUMENT_DESCRIPTION": "NYMEX HENRY HUB NATURAL GAS FUTURE",
                "SYMBOL": "NG",
                "FUTURES_CODE": "Q6",
                "EXCH_COMM_CD": "NG",
                "EXCHANGE_NAME": "NYME",
                "trade_status": trade_status,
                "ice_product_code": "NG Q26-IUS",
                "cme_product_code": "NGQ6",
                "bbg_product_code": "NGQ6 Comdty",
                "product_code_grouping": "gas_future",
            }
        ]
    )


def test_load_mufg_extract_sql_strips_trailing_semicolon(tmp_path):
    sql_dir = tmp_path / "sql"
    sql_dir.mkdir()
    (sql_dir / "extract.sql").write_text("select 1;\n", encoding="utf-8")

    sql = mufg_clear_street_trades.load_mufg_extract_sql(
        sql_filename="extract.sql",
        sql_dir=sql_dir,
    )

    assert sql == "select 1"


def test_load_mufg_extract_sql_requires_generated_sql_dir():
    with pytest.raises(FileNotFoundError, match="generated SQL requires"):
        mufg_clear_street_trades.load_mufg_extract_sql()


def test_default_generated_sql_artifact_is_packaged_and_loadable():
    sql_path = (
        clear_street_mufg_upload.DEFAULT_SQL_DIR
        / clear_street_mufg_upload.DEFAULT_SQL_FILENAME
    )
    assert sql_path.is_file()

    sql = mufg_clear_street_trades.load_mufg_extract_sql(
        sql_dir=clear_street_mufg_upload.DEFAULT_SQL_DIR,
    )

    assert "__dbt__cte__cs_ref_70_eod_latest" in sql
    assert "trade_status" in sql
    assert "product_code_grouping" in sql
    assert "where give_in_out_firm_num in ('ADU', '905')" in sql


def test_clear_street_scheduler_import_smoke_checks_generated_sql():
    repo_root = Path(__file__).resolve().parents[2]
    installer = (
        repo_root
        / "infrastructure"
        / "windows-task-scheduler"
        / "positions_and_trades"
        / "install_clear_street_task.ps1"
    )

    script = installer.read_text(encoding="utf-8")

    assert "clear_street_mufg_upload.DEFAULT_SQL_DIR" in script
    assert "clear_street_mufg_upload.DEFAULT_SQL_FILENAME" in script
    assert "mufg_upload.load_mufg_extract_sql" in script


def test_write_mufg_extract_csv_uses_v3_filename(tmp_path):
    local_path = mufg_clear_street_trades.write_mufg_extract_csv(
        df=_extract_df(),
        trade_date=date(2026, 7, 6),
        local_dir=tmp_path,
    )

    assert local_path == tmp_path / "helios_transactions_v3_20260706_filtered.csv"
    assert "ice_product_code" in local_path.read_text(encoding="utf-8")


def test_product_code_null_summary_uses_exchange_route_vendor_code_criteria():
    df = pd.DataFrame(
        [
            {
                "SECURITY_DESCRIPTION": "NYME gas row with Bloomberg only",
                "EXCHANGE_NAME": "NYME",
                "product_code_grouping": "gas_future",
                "ice_product_code": "",
                "cme_product_code": None,
                "bbg_product_code": "NGQ6 Comdty",
            },
            {
                "SECURITY_DESCRIPTION": "CRI basis row with ICE only",
                "FUTURES_CODE": "H9",
                "EXCH_COMM_CD": "CRI",
                "EXCHANGE_NAME": "IPE",
                "CONTRACT_YEAR_MONTH": "202611",
                "product_code_grouping": "gas_future",
                "ice_product_code": "CRI Q26-IUS",
                "cme_product_code": "",
                "bbg_product_code": "",
            },
            {
                "SECURITY_DESCRIPTION": "IPE row missing ICE",
                "FUTURES_CODE": "PJM",
                "EXCH_COMM_CD": "PJM",
                "EXCHANGE_NAME": "IFE",
                "CONTRACT_YEAR_MONTH": "202611",
                "product_code_grouping": "power_future",
                "ice_product_code": "",
                "cme_product_code": "PJM",
                "bbg_product_code": "PJM X26 Comdty",
            },
            {
                "SECURITY_DESCRIPTION": "PWA weekly strip missing weekly code",
                "FUTURES_CODE": "NF",
                "EXCH_COMM_CD": "PWA",
                "EXCHANGE_NAME": "IFE",
                "TRADE_DATE": "20260706",
                "CONTRACT_YEAR_MONTH": "202607",
                "PROMPT_DAY": "15",
                "CUSIP": "IFEDPWA20260715",
                "product_code_grouping": "power_future",
                "ice_product_code": "",
                "cme_product_code": "",
                "bbg_product_code": "",
            },
            {
                "SECURITY_DESCRIPTION": "PDA Friday to Monday next business day",
                "FUTURES_CODE": "YA",
                "EXCH_COMM_CD": "PDA",
                "EXCHANGE_NAME": "IFE",
                "TRADE_DATE": "20260626",
                "CONTRACT_YEAR_MONTH": "202606",
                "PROMPT_DAY": "29",
                "CUSIP": "IFEDPDA20260629",
                "product_code_grouping": "power_future",
                "ice_product_code": "",
                "cme_product_code": "",
                "bbg_product_code": "",
            },
            {
                "SECURITY_DESCRIPTION": "PDA weekend delivery unverified",
                "FUTURES_CODE": "YA",
                "EXCH_COMM_CD": "PDA",
                "EXCHANGE_NAME": "IFE",
                "TRADE_DATE": "20260625",
                "CONTRACT_YEAR_MONTH": "202606",
                "PROMPT_DAY": "28",
                "CUSIP": "IFEDPDA20260628",
                "product_code_grouping": "power_future",
                "ice_product_code": "",
                "cme_product_code": "",
                "bbg_product_code": "",
            },
            {
                "SECURITY_DESCRIPTION": "NYM row missing CME and Bloomberg",
                "FUTURES_CODE": "Q6",
                "EXCH_COMM_CD": "NG",
                "EXCHANGE_NAME": "NYM",
                "CONTRACT_YEAR_MONTH": "202608",
                "product_code_grouping": "gas_future",
                "ice_product_code": "NG Q26-IUS",
                "cme_product_code": "",
                "bbg_product_code": "",
            },
            {
                "SECURITY_DESCRIPTION": "NMY row with CME only",
                "FUTURES_CODE": "KN4",
                "EXCH_COMM_CD": "KN4",
                "EXCHANGE_NAME": "NMY",
                "CONTRACT_YEAR_MONTH": "202608",
                "product_code_grouping": "gas_option",
                "ice_product_code": "",
                "cme_product_code": "1|G|XNYM:O:KN4:202608:C:3.5",
                "bbg_product_code": "",
            },
            {
                "SECURITY_DESCRIPTION": "PGE row missing grouping",
                "EXCHANGE_NAME": "IPE",
                "product_code_grouping": "",
                "ice_product_code": "PGE X26-IUS",
                "cme_product_code": "",
                "bbg_product_code": "",
            },
            {
                "SECURITY_DESCRIPTION": "Unsupported exchange row",
                "EXCHANGE_NAME": "CBOT",
                "product_code_grouping": "gas_future",
                "ice_product_code": "GC Z26-IUS",
                "cme_product_code": "GCZ6",
                "bbg_product_code": "GCZ6 Comdty",
            },
            {
                "SECURITY_DESCRIPTION": "United States Dollar",
                "INSTRUMENT_DESCRIPTION": "RESID ADJ CASH",
                "EXCHANGE_NAME": "NYM",
                "QUANTITY": 0,
                "CONTRACT_YEAR_MONTH": 0,
                "product_code_grouping": "",
                "ice_product_code": "",
                "cme_product_code": "",
                "bbg_product_code": "",
            },
        ]
    )

    summary = mufg_clear_street_trades.summarize_product_code_nulls(df)

    assert summary["overall_null_counts"] == {
        "product_code_grouping": 2,
        "exchange_name": 0,
        "ice_product_code": 7,
        "cme_product_code": 8,
        "bbg_product_code": 8,
    }
    assert "UNITED STATES DOLLAR" in summary["sql_where"]
    assert "'NMY'" in summary["sql_where"]
    assert "nullif(trim(product_code_grouping::text), '') is null" in summary["sql_where"]
    assert summary["ice_exchange_names"] == ["IFED", "IFE", "IPE"]
    assert summary["cme_bbg_exchange_names"] == ["NYME", "NYM", "NYMEX", "NMY"]
    assert summary["null_counts"] == {
        "product_code_grouping": 1,
        "exchange_name": 0,
        "ice_product_code": 4,
        "cme_product_code": 5,
        "bbg_product_code": 5,
    }
    assert summary["issue_counts"] == {
        "product_code_grouping_blank": 1,
        "exchange_name_blank": 0,
        "unsupported_exchange_name": 1,
        "ice_exchange_missing_ice_product_code": 4,
        "cme_bbg_exchange_missing_cme_and_bbg_product_code": 1,
    }
    assert summary["null_columns"] == [
        "product_code_grouping",
        "ice_product_code",
        "cme_product_code",
        "bbg_product_code",
    ]
    assert summary["null_rows"] == 7
    assert summary["missing_columns"] == []
    assert summary["has_nulls"] is True
    assert summary["affected_product_count"] == 7
    assert {
        product["product"] for product in summary["affected_products"]
    } == {
        "IPE row missing ICE",
        "PWA weekly strip missing weekly code",
        "PDA Friday to Monday next business day",
        "PDA weekend delivery unverified",
        "NYM row missing CME and Bloomberg",
        "PGE row missing grouping",
        "Unsupported exchange row",
    }


def test_run_clear_street_trades_mufg_upload_uploads_csv(monkeypatch, tmp_path):
    calls: dict[str, object] = {}

    class FakeSftp:
        def putfo(self, file_obj, remote_path):
            calls["remote_path"] = remote_path
            calls["content"] = file_obj.read().decode("utf-8")

        def close(self):
            calls["sftp_closed"] = True

    class FakeTransport:
        def close(self):
            calls["transport_closed"] = True

    monkeypatch.setattr(
        mufg_clear_street_trades,
        "pull_mufg_extract_from_db",
        lambda **kwargs: _extract_df(),
    )
    monkeypatch.setattr(
        mufg_clear_street_trades,
        "_connect_to_mufg_sftp",
        lambda **kwargs: (FakeSftp(), FakeTransport()),
    )

    summary = mufg_clear_street_trades.run_clear_street_trades_mufg_upload(
        expected_trade_date="20260706",
        local_dir=tmp_path,
        mufg_host="mufg.example.test",
        mufg_username="user",
        mufg_password="password",
        mufg_port=22,
        mufg_remote_dir="/upload",
    )

    assert summary["rows_uploaded"] == 1
    assert summary["trade_date"] == "2026-07-06"
    assert summary["sql_extract_trade_date"] == "2026-07-06"
    assert summary["sql_extract_trade_date_from_sql"] == "20260706"
    assert summary["sql_extract_trade_date_source"] == "TRADE_DATE"
    assert summary["expected_trade_date"] == "20260706"
    assert summary["sftp_date"] is None
    assert summary["filename"] == "helios_transactions_v3_20260706_filtered.csv"
    assert summary["remote_path"] == "/upload/helios_transactions_v3_20260706_filtered.csv"
    assert summary["expected_trade_status"] == "New"
    assert summary["trade_status_counts"] == {"New": 1}
    assert summary["unexpected_trade_status_rows"] == 0
    assert summary["non_ok_trade_status_rows"] == 0
    assert summary["product_code_null_check"]["has_nulls"] is False
    assert calls["remote_path"] == summary["remote_path"]
    assert "NG Q26-IUS" in str(calls["content"])
    assert calls["sftp_closed"] is True
    assert calls["transport_closed"] is True


def test_run_mufg_upload_records_date_mismatch_without_blocking(
    monkeypatch,
    tmp_path,
):
    calls: dict[str, object] = {}

    class FakeSftp:
        def putfo(self, file_obj, remote_path):
            calls["remote_path"] = remote_path
            calls["content"] = file_obj.read().decode("utf-8")

        def close(self):
            pass

    class FakeTransport:
        def close(self):
            pass

    monkeypatch.setattr(
        mufg_clear_street_trades,
        "pull_mufg_extract_from_db",
        lambda **kwargs: _extract_df(trade_date=date(2026, 7, 5)),
    )
    monkeypatch.setattr(
        mufg_clear_street_trades,
        "_connect_to_mufg_sftp",
        lambda **kwargs: (FakeSftp(), FakeTransport()),
    )

    summary = mufg_clear_street_trades.run_clear_street_trades_mufg_upload(
        expected_trade_date="20260706",
        local_dir=tmp_path,
        mufg_host="mufg.example.test",
        mufg_username="user",
        mufg_password="password",
    )

    assert summary["rows_uploaded"] == 1
    assert summary["trade_date"] == "2026-07-06"
    assert summary["sql_extract_trade_date"] == "2026-07-05"
    assert summary["sql_extract_trade_date_from_sql"] == "20260705"
    assert summary["sql_extract_trade_date_source"] == "TRADE_DATE"
    assert summary["expected_trade_date"] == "20260706"
    assert summary["sftp_date"] is None
    assert summary["sftp_date_from_sql"] is None
    assert summary["expected_trade_date_from_sftp"] == "20260706"
    assert summary["sql_extract_trade_date_mismatch"] is True
    assert summary["sql_extract_sftp_date_mismatch"] is False
    assert summary["filename"] == "helios_transactions_v3_20260706_filtered.csv"
    assert calls["remote_path"] == "/helios_transactions_v3_20260706_filtered.csv"
    assert "NG Q26-IUS" in str(calls["content"])


def test_run_mufg_upload_records_zero_row_extract_without_blocking(
    monkeypatch,
    tmp_path,
):
    calls: dict[str, object] = {}

    class FakeSftp:
        def putfo(self, file_obj, remote_path):
            calls["remote_path"] = remote_path
            calls["content"] = file_obj.read().decode("utf-8")

        def close(self):
            pass

    class FakeTransport:
        def close(self):
            pass

    monkeypatch.setattr(
        mufg_clear_street_trades,
        "pull_mufg_extract_from_db",
        lambda **kwargs: pd.DataFrame(
            columns=[
                "RECORD_ID",
                "TRADE_DATE",
                "trade_status",
                "ice_product_code",
                "cme_product_code",
                "bbg_product_code",
                "product_code_grouping",
            ]
        ),
    )
    monkeypatch.setattr(
        mufg_clear_street_trades,
        "_connect_to_mufg_sftp",
        lambda **kwargs: (FakeSftp(), FakeTransport()),
    )

    summary = mufg_clear_street_trades.run_clear_street_trades_mufg_upload(
        expected_trade_date="20260706",
        local_dir=tmp_path,
        mufg_host="mufg.example.test",
        mufg_username="user",
        mufg_password="password",
    )

    assert summary["rows_uploaded"] == 0
    assert summary["trade_date"] == "2026-07-06"
    assert summary["sql_extract_trade_date"] is None
    assert summary["sql_extract_trade_date_from_sql"] is None
    assert summary["sql_extract_trade_date_source"] is None
    assert summary["expected_trade_date"] == "20260706"
    assert summary["sftp_date"] is None
    assert summary["sftp_date_from_sql"] is None
    assert summary["sql_extract_empty"] is True
    assert summary["sql_extract_trade_date_mismatch"] is False
    assert summary["sql_extract_sftp_date_mismatch"] is False
    assert summary["product_code_null_check"]["has_nulls"] is False
    assert summary["filename"] == "helios_transactions_v3_20260706_filtered.csv"
    assert calls["remote_path"] == "/helios_transactions_v3_20260706_filtered.csv"
    assert str(calls["content"]).startswith("RECORD_ID,TRADE_DATE,trade_status")


def test_run_mufg_upload_requires_date_for_zero_row_manual_extract(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setattr(
        mufg_clear_street_trades,
        "pull_mufg_extract_from_db",
        lambda **kwargs: pd.DataFrame(columns=["RECORD_ID", "TRADE_DATE"]),
    )

    with pytest.raises(ValueError, match="expected_trade_date"):
        mufg_clear_street_trades.run_clear_street_trades_mufg_upload(
            local_dir=tmp_path,
            mufg_host="mufg.example.test",
            mufg_username="user",
            mufg_password="password",
        )


def test_run_mufg_upload_does_not_gate_unexpected_trade_status(
    monkeypatch,
    tmp_path,
):
    class FakeSftp:
        def putfo(self, *_args):
            pass

        def close(self):
            pass

    class FakeTransport:
        def close(self):
            pass

    monkeypatch.setattr(
        mufg_clear_street_trades,
        "pull_mufg_extract_from_db",
        lambda **kwargs: _extract_df(trade_status="Rejected"),
    )
    monkeypatch.setattr(
        mufg_clear_street_trades,
        "_connect_to_mufg_sftp",
        lambda **kwargs: (FakeSftp(), FakeTransport()),
    )

    summary = mufg_clear_street_trades.run_clear_street_trades_mufg_upload(
        expected_trade_date="20260706",
        local_dir=tmp_path,
        mufg_host="mufg.example.test",
        mufg_username="user",
        mufg_password="password",
    )

    assert summary["rows_uploaded"] == 1
    assert summary["expected_trade_status"] == "New"
    assert summary["trade_status_counts"] == {"Rejected": 1}
    assert summary["unexpected_trade_status_rows"] == 1
    assert summary["non_ok_trade_status_rows"] == 1


def test_mufg_orchestration_logs_success(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []
    scrape_calls: list[dict[str, object]] = []
    summary = {
        "target_table": mufg_clear_street_trades.TARGET_NAME,
        "source_table": mufg_clear_street_trades.SOURCE_TABLE_FQN,
        "sql_filename": "clear_street_mufg_latest.sql",
        "rows_exported": 1,
        "rows_uploaded": 1,
        "trade_date": "2026-07-06",
        "sql_extract_trade_date": "2026-07-06",
        "sql_extract_trade_date_from_sql": "20260706",
        "sql_extract_trade_date_source": "TRADE_DATE",
        "expected_trade_date": "20260706",
        "sftp_date": None,
        "sftp_date_from_sql": None,
        "filename": "helios_transactions_v3_20260706_filtered.csv",
        "remote_dir": "/",
        "remote_path": "/helios_transactions_v3_20260706_filtered.csv",
    }

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        clear_street_mufg_upload.scrape,
        "run_clear_street_trades_mufg_upload",
        lambda **kwargs: scrape_calls.append(kwargs) or summary,
    )
    monkeypatch.setattr(
        clear_street_mufg_upload,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    exit_code = clear_street_mufg_upload.main(
        expected_trade_date="20260706",
        local_dir=tmp_path,
        database="stage_db",
    )

    assert exit_code == 0
    assert scrape_calls[0]["sql_dir"] == clear_street_mufg_upload.DEFAULT_SQL_DIR
    assert scrape_calls[0]["sql_filename"] == "clear_street_mufg_latest.sql"
    assert len(telemetry) == 1
    assert telemetry[0]["provider"] == "mufg_sftp"
    assert telemetry[0]["operation_name"] == "clear_street_trades_mufg_upload"
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["rows_written"] == 1
    assert telemetry[0]["metadata"]["expected_trade_date"] == "20260706"
    assert telemetry[0]["metadata"]["sql_dir"] == str(
        clear_street_mufg_upload.DEFAULT_SQL_DIR
    )
    assert telemetry[0]["metadata"]["sql_filename"] == "clear_street_mufg_latest.sql"
    assert telemetry[0]["metadata"]["email_notification_status"] == (
        "skipped_missing_attachment"
    )
    assert telemetry[0]["database"] == "stage_db"


def test_mufg_orchestration_queues_upload_email_with_csv(monkeypatch, tmp_path):
    local_file = tmp_path / "helios_transactions_v3_20260706_filtered.csv"
    local_file.write_text("record_id\n1\n", encoding="utf-8")
    email_calls: list[dict[str, object]] = []
    summary = {
        "target_table": mufg_clear_street_trades.TARGET_NAME,
        "source_table": mufg_clear_street_trades.SOURCE_TABLE_FQN,
        "sql_filename": "clear_street_mufg_latest.sql",
        "rows_exported": 1,
        "rows_uploaded": 1,
        "trade_date": "2026-07-06",
        "filename": local_file.name,
        "local_file_path": str(local_file),
        "remote_dir": "/",
        "remote_path": f"/{local_file.name}",
        "product_code_null_check": {"has_nulls": False, "null_rows": 0},
    }

    monkeypatch.setattr(
        clear_street_mufg_upload.email_notifications.credentials,
        "HELIOS_EMAIL_RECIPIENTS",
        ["ops@example.test"],
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.email_notifications,
        "build_clear_street_mufg_upload_success_email",
        lambda **kwargs: {
            "notification_key": "mufg:email:upload",
            "recipient_email": kwargs["recipient_email"],
            "subject": "MUFG uploaded",
            "body_text": "Attached.",
            "body_html": None,
            "dataset": "clear_street_trades_mufg_upload",
            "source_event_key": "mufg",
            "source_event_id": None,
            "payload": {"attachment_paths": [str(kwargs["attachment_path"])]},
        },
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.email_notifications,
        "enqueue_email_notification",
        lambda **kwargs: email_calls.append(kwargs) or {"created": True},
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.email_notifications,
        "notifications_enabled",
        lambda: False,
    )

    email_summary = clear_street_mufg_upload._notify_mufg_email_success(
        summary=summary,
        database="stage_db",
        run_logger=type(
            "Logger",
            (),
            {
                "info": lambda *_args, **_kwargs: None,
                "exception": lambda *_args, **_kwargs: None,
            },
        )(),
    )

    assert email_summary == {
        "email_notification_status": "queued_sending_disabled",
        "email_notifications_queued": 1,
        "email_notifications_processed": 0,
    }
    assert email_calls[0]["database"] == "stage_db"
    assert email_calls[0]["recipient_email"] == "ops@example.test"
    assert email_calls[0]["payload"]["attachment_paths"] == [str(local_file)]


def test_mufg_orchestration_keeps_upload_success_when_email_fails(
    monkeypatch,
    tmp_path,
):
    local_file = tmp_path / "helios_transactions_v3_20260706_filtered.csv"
    local_file.write_text("record_id\n1\n", encoding="utf-8")
    telemetry: list[dict[str, object]] = []
    summary = {
        "target_table": mufg_clear_street_trades.TARGET_NAME,
        "source_table": mufg_clear_street_trades.SOURCE_TABLE_FQN,
        "sql_filename": "clear_street_mufg_latest.sql",
        "rows_exported": 1,
        "rows_uploaded": 1,
        "trade_date": "2026-07-06",
        "filename": local_file.name,
        "local_file_path": str(local_file),
        "remote_dir": "/",
        "remote_path": f"/{local_file.name}",
    }

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        clear_street_mufg_upload.scrape,
        "run_clear_street_trades_mufg_upload",
        lambda **kwargs: dict(summary),
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.email_notifications.credentials,
        "HELIOS_EMAIL_RECIPIENTS",
        ["ops@example.test"],
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.email_notifications,
        "build_clear_street_mufg_upload_success_email",
        lambda **kwargs: {
            "notification_key": "mufg:email:upload",
            "recipient_email": kwargs["recipient_email"],
            "subject": "MUFG uploaded",
            "body_text": "Attached.",
            "body_html": None,
            "dataset": "clear_street_trades_mufg_upload",
            "source_event_key": "mufg",
            "source_event_id": None,
            "payload": {"attachment_paths": [str(kwargs["attachment_path"])]},
        },
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.email_notifications,
        "enqueue_email_notification",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("outbox unavailable")),
    )
    monkeypatch.setattr(
        clear_street_mufg_upload,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    exit_code = clear_street_mufg_upload.main(
        expected_trade_date="20260706",
        local_dir=tmp_path,
        database="stage_db",
    )

    assert exit_code == 0
    assert len(telemetry) == 1
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["error_type"] is None
    assert telemetry[0]["rows_written"] == 1
    assert telemetry[0]["metadata"]["email_notification_status"] == "failure"
    assert telemetry[0]["metadata"]["email_notification_error_type"] == "RuntimeError"
    assert "outbox unavailable" in telemetry[0]["metadata"][
        "email_notification_error_message"
    ]


def test_mufg_orchestration_logs_failure(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        clear_street_mufg_upload.scrape,
        "run_clear_street_trades_mufg_upload",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("SFTP unavailable")),
    )
    monkeypatch.setattr(
        clear_street_mufg_upload,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    with pytest.raises(RuntimeError, match="SFTP unavailable"):
        clear_street_mufg_upload.main(
            expected_trade_date="20260706",
            local_dir=tmp_path,
            database="stage_db",
        )

    assert len(telemetry) == 1
    assert telemetry[0]["status"] == "failure"
    assert telemetry[0]["error_type"] == "RuntimeError"
    assert telemetry[0]["metadata"]["expected_trade_date"] == "20260706"
    assert telemetry[0]["metadata"]["sql_filename"] == "clear_street_mufg_latest.sql"
