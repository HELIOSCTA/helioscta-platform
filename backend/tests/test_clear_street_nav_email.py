from __future__ import annotations

from pathlib import Path

import pytest

from backend.orchestration.positions_and_trades import clear_street_nav_email
from backend.scrapes.positions_and_trades import nav_clear_street_trades


def _write_trade_file(directory: Path, filename: str) -> Path:
    path = directory / filename
    path.write_text("RECORD_ID\n1\n", encoding="utf-8")
    return path


def test_run_nav_email_uses_source_summary_and_legacy_subject(
    monkeypatch,
    tmp_path,
):
    trade_file = _write_trade_file(
        tmp_path,
        "Helios_Transactions_20260706.20260707_020817.csv",
    )
    calls: list[dict[str, object]] = []

    monkeypatch.setattr(
        nav_clear_street_trades.email_notifications,
        "send_email_via_graph",
        lambda **kwargs: calls.append(kwargs),
    )

    summary = nav_clear_street_trades.run_clear_street_trades_nav_email(
        expected_trade_date="20260706",
        source_summary={
            "local_dir": str(tmp_path),
            "latest_trade_file": {
                "local_filename": trade_file.name,
                "trade_date_from_sftp": "20260706",
            },
        },
        sender_email="admin@helioscta.com",
        recipient_emails=["ops@example.test", "nav@example.test"],
    )

    assert summary["emails_sent"] == 2
    assert summary["source_filename"] == trade_file.name
    assert summary["trade_date"] == "2026-07-06"
    assert summary["trade_date_from_sftp"] == "20260706"
    assert summary["email_subject"] == (
        "Clear Street - Helios Transactions - Mon Jul-06 2026"
    )
    assert [call["recipient_email"] for call in calls] == [
        "ops@example.test",
        "nav@example.test",
    ]
    assert calls[0]["sender_email"] == "admin@helioscta.com"
    assert calls[0]["attachments"] == [trade_file]


def test_run_nav_email_rejects_expected_trade_date_mismatch(
    monkeypatch,
    tmp_path,
):
    trade_file = _write_trade_file(
        tmp_path,
        "Helios_Transactions_20260705.20260706_020817.csv",
    )
    monkeypatch.setattr(
        nav_clear_street_trades.email_notifications,
        "send_email_via_graph",
        lambda **_kwargs: (_ for _ in ()).throw(
            AssertionError("email should not send")
        ),
    )

    with pytest.raises(ValueError, match="does not match expected date"):
        nav_clear_street_trades.run_clear_street_trades_nav_email(
            expected_trade_date="20260706",
            source_summary={
                "local_dir": str(tmp_path),
                "latest_trade_file": {
                    "local_filename": trade_file.name,
                    "trade_date_from_sftp": "20260705",
                },
            },
            sender_email="admin@helioscta.com",
            recipient_emails=["nav@example.test"],
        )


def test_run_nav_email_fails_when_source_summary_file_is_missing(tmp_path):
    with pytest.raises(FileNotFoundError, match="summary was not found"):
        nav_clear_street_trades.run_clear_street_trades_nav_email(
            expected_trade_date="20260706",
            source_summary={
                "local_dir": str(tmp_path),
                "latest_trade_file": {
                    "local_filename": (
                        "Helios_Transactions_20260706.20260707_020817.csv"
                    ),
                },
            },
            sender_email="admin@helioscta.com",
            recipient_emails=["nav@example.test"],
        )


def test_nav_orchestration_logs_success(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []
    summary = {
        "target_table": nav_clear_street_trades.TARGET_NAME,
        "source_table": nav_clear_street_trades.SOURCE_TABLE_FQN,
        "source_file_path": str(tmp_path / "file.csv"),
        "source_filename": "Helios_Transactions_20260706.20260707_020817.csv",
        "trade_date": "2026-07-06",
        "trade_date_from_sftp": "20260706",
        "email_subject": "Clear Street - Helios Transactions - Mon Jul-06 2026",
        "sender_email": "admin@helioscta.com",
        "recipient_count": 1,
        "recipient_emails": ["nav@example.test"],
        "attachments": ["Helios_Transactions_20260706.20260707_020817.csv"],
        "emails_sent": 1,
        "local_dir": str(tmp_path),
    }

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        clear_street_nav_email.scrape,
        "run_clear_street_trades_nav_email",
        lambda **kwargs: summary,
    )
    monkeypatch.setattr(
        clear_street_nav_email,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    exit_code = clear_street_nav_email.main(
        expected_trade_date="20260706",
        local_dir=tmp_path,
        database="stage_db",
    )

    assert exit_code == 0
    assert len(telemetry) == 1
    assert telemetry[0]["provider"] == "microsoft_graph"
    assert telemetry[0]["operation_name"] == "clear_street_trades_nav_email"
    assert telemetry[0]["method"] == "EMAIL"
    assert telemetry[0]["target_table"] == "nav_email.clear_street_trades"
    assert telemetry[0]["target_path"] == (
        "/v1.0/users/admin@helioscta.com/sendMail"
    )
    assert telemetry[0]["rows_returned"] == 1
    assert telemetry[0]["rows_written"] == 1
    assert telemetry[0]["metadata"]["expected_trade_date"] == "20260706"
    assert telemetry[0]["database"] == "stage_db"


def test_nav_orchestration_logs_failure(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        clear_street_nav_email.scrape,
        "run_clear_street_trades_nav_email",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("Graph down")),
    )
    monkeypatch.setattr(
        clear_street_nav_email,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    with pytest.raises(RuntimeError, match="Graph down"):
        clear_street_nav_email.main(
            expected_trade_date="20260706",
            local_dir=tmp_path,
            database="stage_db",
        )

    assert len(telemetry) == 1
    assert telemetry[0]["status"] == "failure"
    assert telemetry[0]["error_type"] == "RuntimeError"
    assert telemetry[0]["metadata"]["expected_trade_date"] == "20260706"
