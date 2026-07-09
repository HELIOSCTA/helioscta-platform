from __future__ import annotations

from datetime import date, datetime, timezone

import pandas as pd
import pytest

from backend.orchestration.positions_and_trades import clear_street_mufg_upload
from backend.scrapes.positions_and_trades.clear_street import (
    mufg_upload as mufg_clear_street_trades,
)


def _extract_df(
    *,
    sftp_date: date = date(2026, 7, 6),
    trade_status: str = "ok",
) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "record_id": "T",
                "account_number": "GHELI",
                "give_in_out_firm_num": "905",
                "sftp_date": sftp_date,
                "sftp_upload_timestamp": datetime(
                    2026,
                    7,
                    7,
                    2,
                    8,
                    17,
                    tzinfo=timezone.utc,
                ),
                "trade_status": trade_status,
                "product_code_grouping": "Natural Gas",
                "product_code_region": "Henry Hub",
                "product_code_underlying": "NG",
                "ice_product_code": "NG Q26-IUS",
                "cme_product_code": "NGQ6",
                "bbg_product_code": "NGQ6 Comdty",
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


def test_write_mufg_extract_csv_uses_legacy_filename(tmp_path):
    local_path = mufg_clear_street_trades.write_mufg_extract_csv(
        df=_extract_df(),
        sftp_date=date(2026, 7, 6),
        local_dir=tmp_path,
    )

    assert local_path == tmp_path / "Helios_Transactions_20260706_filtered.csv"
    assert "ice_product_code" in local_path.read_text(encoding="utf-8")


def test_product_code_null_summary_uses_group_region_and_vendor_code_criteria():
    df = pd.DataFrame(
        [
            {
                "product_code_grouping": "Natural Gas",
                "product_code_region": "Henry Hub",
                "product_code_underlying": "",
                "ice_product_code": "NG Q26-IUS",
                "cme_product_code": None,
                "bbg_product_code": "NGQ6 Comdty",
            },
            {
                "security_description": "ALQ-Algonquin Citygates Basis Future",
                "futures_code": "H9",
                "exch_comm_cd": "ALQ",
                "exchange_name": "IPE",
                "contract_year_month": "202611",
                "product_code_grouping": "",
                "product_code_region": "",
                "product_code_underlying": "ALQ",
                "ice_product_code": " ",
                "cme_product_code": "ALQX6",
                "bbg_product_code": "ALQX6 Comdty",
            },
            {
                "product_code_grouping": "",
                "product_code_region": "PJM",
                "product_code_underlying": "PJM",
                "ice_product_code": "PJM X26-IUS",
                "cme_product_code": "PJM",
                "bbg_product_code": "",
            },
            {
                "product_code_grouping": "",
                "product_code_region": "",
                "product_code_underlying": "PGE",
                "ice_product_code": "PGE X26-IUS",
                "cme_product_code": "PGE",
                "bbg_product_code": "PGE Comdty",
            },
            {
                "product_code_grouping": "Power",
                "product_code_region": "PJM",
                "product_code_underlying": "PJM",
                "ice_product_code": "PJM X26-IUS",
                "cme_product_code": "PJM",
                "bbg_product_code": "",
            },
        ]
    )

    summary = mufg_clear_street_trades.summarize_product_code_nulls(df)

    assert summary["overall_null_counts"] == {
        "product_code_grouping": 3,
        "product_code_region": 2,
        "ice_product_code": 1,
        "cme_product_code": 1,
        "bbg_product_code": 2,
    }
    assert summary["null_counts"] == {
        "product_code_grouping": 1,
        "product_code_region": 1,
        "ice_product_code": 1,
        "cme_product_code": 0,
        "bbg_product_code": 0,
    }
    assert summary["null_columns"] == [
        "product_code_grouping",
        "product_code_region",
        "ice_product_code",
    ]
    assert summary["null_rows"] == 1
    assert summary["missing_columns"] == []
    assert summary["has_nulls"] is True
    assert summary["affected_product_count"] == 1
    assert summary["affected_products"] == [
        {
            "product": "ALQ-Algonquin Citygates Basis Future",
            "row_count": 1,
            "source_fields": {
                "security_description": "ALQ-Algonquin Citygates Basis Future",
                "instrument_description": None,
                "symbol": None,
                "futures_code": "H9",
                "exch_comm_cd": "ALQ",
                "exchange_name": "IPE",
            },
            "contract_year_months": ["202611"],
            "put_calls": [],
            "trade_statuses": [],
        }
    ]


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
    assert summary["sftp_date"] == "2026-07-06"
    assert summary["filename"] == "Helios_Transactions_20260706_filtered.csv"
    assert summary["remote_path"] == "/upload/Helios_Transactions_20260706_filtered.csv"
    assert summary["trade_status_counts"] == {"ok": 1}
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
        lambda **kwargs: _extract_df(sftp_date=date(2026, 7, 5)),
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
    assert summary["sftp_date"] == "2026-07-05"
    assert summary["sftp_date_from_sql"] == "20260705"
    assert summary["expected_trade_date_from_sftp"] == "20260706"
    assert summary["sql_extract_sftp_date_mismatch"] is True
    assert summary["filename"] == "Helios_Transactions_20260706_filtered.csv"
    assert calls["remote_path"] == "/Helios_Transactions_20260706_filtered.csv"
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
            columns=["sftp_date", "trade_status", "ice_product_code"]
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
    assert summary["sftp_date"] is None
    assert summary["sftp_date_from_sql"] is None
    assert summary["sql_extract_empty"] is True
    assert summary["sql_extract_sftp_date_mismatch"] is False
    assert summary["product_code_null_check"]["has_nulls"] is False
    assert summary["filename"] == "Helios_Transactions_20260706_filtered.csv"
    assert calls["remote_path"] == "/Helios_Transactions_20260706_filtered.csv"
    assert str(calls["content"]).startswith("sftp_date,trade_status,ice_product_code")


def test_run_mufg_upload_requires_date_for_zero_row_manual_extract(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setattr(
        mufg_clear_street_trades,
        "pull_mufg_extract_from_db",
        lambda **kwargs: pd.DataFrame(columns=["sftp_date"]),
    )

    with pytest.raises(ValueError, match="expected_trade_date"):
        mufg_clear_street_trades.run_clear_street_trades_mufg_upload(
            local_dir=tmp_path,
            mufg_host="mufg.example.test",
            mufg_username="user",
            mufg_password="password",
        )


def test_run_mufg_upload_does_not_gate_non_ok_trade_status(monkeypatch, tmp_path):
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
        lambda **kwargs: _extract_df(trade_status="unresolved_product"),
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
    assert summary["trade_status_counts"] == {"unresolved_product": 1}
    assert summary["non_ok_trade_status_rows"] == 1


def test_mufg_orchestration_logs_success_and_queues_slack(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []
    slack_calls: list[dict[str, object]] = []
    summary = {
        "target_table": mufg_clear_street_trades.TARGET_NAME,
        "source_table": mufg_clear_street_trades.SOURCE_TABLE_FQN,
        "sql_filename": "clear_street_trades/mufg/latest.sql",
        "rows_exported": 1,
        "rows_uploaded": 1,
        "sftp_date": "2026-07-06",
        "sftp_date_from_sql": "20260706",
        "filename": "Helios_Transactions_20260706_filtered.csv",
        "remote_dir": "/",
        "remote_path": "/Helios_Transactions_20260706_filtered.csv",
    }

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        clear_street_mufg_upload.scrape,
        "run_clear_street_trades_mufg_upload",
        lambda **kwargs: summary,
    )
    monkeypatch.setattr(
        clear_street_mufg_upload,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.slack_notifications,
        "positions_trades_alerts_channel_id",
        lambda: "C123",
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.slack_notifications,
        "build_clear_street_mufg_upload_success_slack",
        lambda **kwargs: {
            "notification_key": "mufg:success",
            "channel_id": "C123",
            "channel_name": "#alerts",
            "message_text": "MUFG uploaded",
            "message_blocks": [],
            "dataset": "clear_street_trades_mufg_upload",
            "source_event_key": "mufg",
            "source_event_id": None,
            "payload": {},
        },
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.slack_notifications,
        "enqueue_slack_notification",
        lambda **kwargs: slack_calls.append(kwargs) or {"created": True},
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.slack_notifications,
        "notifications_enabled",
        lambda: False,
    )

    exit_code = clear_street_mufg_upload.main(
        expected_trade_date="20260706",
        local_dir=tmp_path,
        database="stage_db",
    )

    assert exit_code == 0
    assert len(slack_calls) == 1
    assert len(telemetry) == 1
    assert telemetry[0]["provider"] == "mufg_sftp"
    assert telemetry[0]["operation_name"] == "clear_street_trades_mufg_upload"
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["rows_written"] == 1
    assert telemetry[0]["metadata"]["expected_trade_date"] == "20260706"
    assert telemetry[0]["database"] == "stage_db"


def test_mufg_orchestration_queues_product_code_null_warning(
    monkeypatch,
    tmp_path,
):
    telemetry: list[dict[str, object]] = []
    slack_calls: list[dict[str, object]] = []
    summary = {
        "target_table": mufg_clear_street_trades.TARGET_NAME,
        "source_table": mufg_clear_street_trades.SOURCE_TABLE_FQN,
        "sql_filename": "clear_street_trades/mufg/latest.sql",
        "rows_exported": 2,
        "rows_uploaded": 2,
        "sftp_date": "2026-07-06",
        "sftp_date_from_sql": "20260706",
        "filename": "Helios_Transactions_20260706_filtered.csv",
        "remote_dir": "/",
        "remote_path": "/Helios_Transactions_20260706_filtered.csv",
        "product_code_null_check": {
            "null_counts": {
                "product_code_grouping": 2,
                "product_code_region": 2,
                "ice_product_code": 2,
                "cme_product_code": 0,
                "bbg_product_code": 0,
            },
            "null_columns": [
                "product_code_grouping",
                "product_code_region",
                "ice_product_code",
            ],
            "null_rows": 2,
            "has_nulls": True,
            "missing_columns": [],
            "affected_products": [
                {
                    "product": "ALQ-Algonquin Citygates Basis Future",
                    "row_count": 2,
                    "source_fields": {
                        "security_description": (
                            "ALQ-Algonquin Citygates Basis Future"
                        ),
                        "futures_code": "H9",
                        "exch_comm_cd": "ALQ",
                        "exchange_name": "IPE",
                    },
                    "contract_year_months": ["202611"],
                    "put_calls": [],
                    "trade_statuses": ["New"],
                }
            ],
            "affected_product_count": 1,
        },
    }

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        clear_street_mufg_upload.scrape,
        "run_clear_street_trades_mufg_upload",
        lambda **kwargs: summary,
    )
    monkeypatch.setattr(
        clear_street_mufg_upload,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.slack_notifications,
        "positions_trades_alerts_channel_id",
        lambda: "C123",
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.slack_notifications,
        "build_clear_street_mufg_upload_success_slack",
        lambda **kwargs: {
            "notification_key": "mufg:success",
            "channel_id": "C123",
            "channel_name": "#alerts",
            "message_text": "MUFG uploaded",
            "message_blocks": [],
            "dataset": "clear_street_trades_mufg_upload",
            "source_event_key": "mufg",
            "source_event_id": None,
            "payload": {},
        },
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.slack_notifications,
        "build_clear_street_mufg_product_code_nulls_slack",
        lambda **kwargs: {
            "notification_key": "mufg:nulls",
            "channel_id": "C123",
            "channel_name": "#alerts",
            "message_text": "MUFG nulls",
            "message_blocks": [],
            "dataset": "clear_street_trades_mufg_upload",
            "source_event_key": "mufg:nulls",
            "source_event_id": None,
            "payload": {},
        },
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.slack_notifications,
        "enqueue_slack_notification",
        lambda **kwargs: slack_calls.append(kwargs) or {"created": True},
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.slack_notifications,
        "notifications_enabled",
        lambda: False,
    )

    exit_code = clear_street_mufg_upload.main(
        expected_trade_date="20260706",
        local_dir=tmp_path,
        database="stage_db",
    )

    assert exit_code == 0
    assert [call["notification_key"] for call in slack_calls] == [
        "mufg:success",
        "mufg:nulls",
    ]
    assert len(telemetry) == 1


def test_mufg_orchestration_queues_upload_email_with_csv(monkeypatch, tmp_path):
    local_file = tmp_path / "Helios_Transactions_20260706_filtered.csv"
    local_file.write_text("record_id\n1\n", encoding="utf-8")
    email_calls: list[dict[str, object]] = []
    summary = {
        "target_table": mufg_clear_street_trades.TARGET_NAME,
        "source_table": mufg_clear_street_trades.SOURCE_TABLE_FQN,
        "sql_filename": "clear_street_trades/mufg/latest.sql",
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

    queued = clear_street_mufg_upload._notify_mufg_email_success(
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

    assert queued == 1
    assert email_calls[0]["database"] == "stage_db"
    assert email_calls[0]["recipient_email"] == "ops@example.test"
    assert email_calls[0]["payload"]["attachment_paths"] == [str(local_file)]


def test_mufg_orchestration_logs_failure_and_queues_slack(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []
    slack_calls: list[dict[str, object]] = []

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
    monkeypatch.setattr(
        clear_street_mufg_upload.slack_notifications,
        "positions_trades_alerts_channel_id",
        lambda: "C123",
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.slack_notifications,
        "build_clear_street_mufg_upload_failure_slack",
        lambda **kwargs: {
            "notification_key": "mufg:failure",
            "channel_id": "C123",
            "channel_name": "#alerts",
            "message_text": "MUFG failed",
            "message_blocks": [],
            "dataset": "clear_street_trades_mufg_upload",
            "source_event_key": "mufg",
            "source_event_id": None,
            "payload": {},
        },
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.slack_notifications,
        "enqueue_slack_notification",
        lambda **kwargs: slack_calls.append(kwargs) or {"created": True},
    )
    monkeypatch.setattr(
        clear_street_mufg_upload.slack_notifications,
        "notifications_enabled",
        lambda: False,
    )

    with pytest.raises(RuntimeError, match="SFTP unavailable"):
        clear_street_mufg_upload.main(
            expected_trade_date="20260706",
            local_dir=tmp_path,
            database="stage_db",
        )

    assert len(slack_calls) == 1
    assert len(telemetry) == 1
    assert telemetry[0]["status"] == "failure"
    assert telemetry[0]["error_type"] == "RuntimeError"
    assert telemetry[0]["metadata"]["expected_trade_date"] == "20260706"
