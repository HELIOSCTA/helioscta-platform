from __future__ import annotations

from datetime import date, datetime, timezone

import pandas as pd
import pytest

from backend.orchestration.positions_and_trades import clear_street_mufg_upload
from backend.scrapes.positions_and_trades import mufg_clear_street_trades


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
                "ice_product_code": "NG Q26-IUS",
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
        "sql_filename": "clear_street_trades_mufg_latest.sql",
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
