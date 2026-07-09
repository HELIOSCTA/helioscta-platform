from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

from backend.orchestration.nav import trade_breaks_email as orchestration
from backend.scrapes.nav import trade_breaks


RAW_COLUMNS = [
    "Broker",
    "Account Group",
    "Account",
    "Commodity",
    "Month Year",
    "Call/ Put",
    "Strike Price",
    "P/S",
    "Quantity",
    "Trade Price",
    "Trade Date",
    "Source",
    "Add/Del",
]


def _write_trade_break_workbook(path: Path) -> None:
    df = pd.DataFrame(
        [
            {
                "Broker": "ABN",
                "Account Group": "PNT Trading, LLC",
                "Account": "ABN AMRO_1251PT034",
                "Commodity": "NYM EUR NATURAL GAS",
                "Month Year": "MAR26",
                "Call/ Put": "PUT",
                "Strike Price": 1.25,
                "P/S": "S",
                "Quantity": 15,
                "Trade Price": 0.005,
                "Trade Date": pd.Timestamp("2026-02-24"),
                "Source": "NAV",
                "Add/Del": "ADD",
            },
            {
                "Broker": "No Trade Break found in Reconciliation",
                **{column: None for column in RAW_COLUMNS if column != "Broker"},
            },
        ],
        columns=RAW_COLUMNS,
    )
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Trade Breaks", startrow=2)


def test_parse_trade_break_file_summarizes_rows_and_add_del(tmp_path):
    filepath = (
        tmp_path
        / "Trade Breaks Detail Report_20260224_HELIOS COMMODITY ADVISORS LTD.20260225_123456.xlsx"
    )
    _write_trade_break_workbook(filepath)

    df = trade_breaks.parse_trade_break_file(filepath)
    summary = trade_breaks.summarize_trade_break_file(filepath)

    assert len(df) == 1
    assert "add_del" in df.columns
    assert summary["rows_processed"] == 1
    assert summary["nav_date"] == "2026-02-24"
    assert summary["by_add_del"] == {"ADD": 1}


def test_pull_recent_trade_break_files_downloads_and_preserves_cache(
    monkeypatch,
    tmp_path,
):
    calls: dict[str, object] = {}

    class FakeSftp:
        def listdir_attr(self, remote_dir):
            calls["remote_dir"] = remote_dir
            return [
                SimpleNamespace(
                    filename=(
                        "Trade Breaks Detail Report_20260224_"
                        "HELIOS COMMODITY ADVISORS LTD.XLSX"
                    ),
                    st_mtime=1772022896,
                )
            ]

        def get(self, remote_path, local_path):
            calls["remote_path"] = remote_path
            calls["local_path"] = local_path
            Path(local_path).write_bytes(b"workbook")

        def close(self):
            calls["sftp_closed"] = True

    class FakeTransport:
        def close(self):
            calls["transport_closed"] = True

    monkeypatch.setattr(
        trade_breaks,
        "_connect_to_nav_sftp",
        lambda **kwargs: (FakeSftp(), FakeTransport()),
    )

    downloaded = trade_breaks.pull_recent_trade_break_files(
        lookback_days=1,
        local_dir=tmp_path,
        sftp_host="sftp.example.test",
        sftp_port=22,
        sftp_user="user",
        sftp_password="password",
        sftp_remote_dir="/",
    )

    assert len(downloaded) == 1
    assert downloaded[0].nav_date.isoformat() == "2026-02-24"
    assert downloaded[0].local_path.name == (
        "Trade Breaks Detail Report_20260224_"
        "HELIOS COMMODITY ADVISORS LTD.20260225_123456.xlsx"
    )
    assert calls["remote_path"] == (
        "/Trade Breaks Detail Report_20260224_HELIOS COMMODITY ADVISORS LTD.XLSX"
    )
    assert str(calls["local_path"]).endswith(".xlsx.download")
    assert calls["sftp_closed"] is True
    assert calls["transport_closed"] is True

    def fail_get(*_args):
        raise AssertionError("cached NAV trade break workbook should be preserved")

    monkeypatch.setattr(FakeSftp, "get", fail_get)
    downloaded_again = trade_breaks.pull_recent_trade_break_files(
        lookback_days=1,
        local_dir=tmp_path,
        sftp_host="sftp.example.test",
        sftp_port=22,
        sftp_user="user",
        sftp_password="password",
        sftp_remote_dir="/",
    )
    assert downloaded_again[0].local_path == downloaded[0].local_path


def test_run_nav_trade_breaks_email_sends_latest_workbook(monkeypatch, tmp_path):
    filepath = (
        tmp_path
        / "Trade Breaks Detail Report_20260224_HELIOS COMMODITY ADVISORS LTD.20260225_123456.xlsx"
    )
    _write_trade_break_workbook(filepath)
    calls: list[dict[str, object]] = []

    monkeypatch.setattr(
        trade_breaks,
        "pull_recent_trade_break_files",
        lambda **kwargs: [
            trade_breaks.DownloadedNavTradeBreakFile(
                remote_filename=(
                    "Trade Breaks Detail Report_20260224_"
                    "HELIOS COMMODITY ADVISORS LTD.XLSX"
                ),
                local_path=filepath,
                nav_date=pd.Timestamp("2026-02-24").date(),
                sftp_upload_timestamp=pd.Timestamp("2026-02-25 12:34:56+0000"),
            )
        ],
    )
    monkeypatch.setattr(
        trade_breaks.email_notifications,
        "send_email_via_graph",
        lambda **kwargs: calls.append(kwargs),
    )

    summary = trade_breaks.run_nav_trade_breaks_email(
        local_dir=tmp_path,
        sender_email="admin@helioscta.com",
        recipient_emails=["ops@example.test", "trades@example.test"],
    )

    assert summary["emails_sent"] == 2
    assert summary["rows_processed"] == 1
    assert summary["by_add_del"] == {"ADD": 1}
    assert summary["email_subject"] == "NAV Trade Breaks - Tue Feb-24 2026"
    assert [call["recipient_email"] for call in calls] == [
        "ops@example.test",
        "trades@example.test",
    ]
    assert calls[0]["sender_email"] == "admin@helioscta.com"
    assert calls[0]["attachments"] == [filepath]


def test_nav_trade_breaks_orchestration_logs_success(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []
    summary = {
        "target_table": trade_breaks.TARGET_NAME,
        "source_filename": (
            "Trade Breaks Detail Report_20260224_"
            "HELIOS COMMODITY ADVISORS LTD.XLSX"
        ),
        "downloaded_filename": (
            "Trade Breaks Detail Report_20260224_"
            "HELIOS COMMODITY ADVISORS LTD.20260225_123456.xlsx"
        ),
        "nav_date": "2026-02-24",
        "rows_processed": 3,
        "emails_sent": 1,
        "sender_email": "admin@helioscta.com",
    }

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setenv("NAV_SFTP_HOST", "sftp.example.test")
    monkeypatch.setattr(
        orchestration.scrape,
        "run_nav_trade_breaks_email",
        lambda **kwargs: summary,
    )
    monkeypatch.setattr(
        orchestration,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    exit_code = orchestration.main(
        lookback_days=1,
        local_dir=tmp_path,
        database="stage_db",
    )

    assert exit_code == 0
    assert len(telemetry) == 1
    assert telemetry[0]["provider"] == "nav_sftp"
    assert telemetry[0]["pipeline_name"] == "nav_trade_breaks_email"
    assert telemetry[0]["method"] == "SFTP_EMAIL"
    assert telemetry[0]["target_table"] == "nav_email.nav_trade_breaks"
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["rows_returned"] == 3
    assert telemetry[0]["rows_written"] == 1
    assert telemetry[0]["metadata"]["nav_date"] == "2026-02-24"
    assert telemetry[0]["database"] == "stage_db"


def test_nav_trade_breaks_orchestration_logs_failure(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        orchestration.scrape,
        "run_nav_trade_breaks_email",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("Graph down")),
    )
    monkeypatch.setattr(
        orchestration,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    with pytest.raises(RuntimeError, match="Graph down"):
        orchestration.main(
            lookback_days=1,
            local_dir=tmp_path,
            database="stage_db",
        )

    assert len(telemetry) == 1
    assert telemetry[0]["status"] == "failure"
    assert telemetry[0]["error_type"] == "RuntimeError"
    assert telemetry[0]["rows_written"] is None
