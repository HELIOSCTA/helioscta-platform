from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pandas as pd

from backend.orchestration.clear_street import transactions as orchestration
from backend.scrapes.clear_street import transactions


def _sample_row() -> dict[str, object]:
    row = {column: "" for column in transactions.RAW_CSV_COLUMNS}
    row.update(
        {
            "RECORD_ID": "T",
            "FIRM": "U",
            "ORGANIZATION": "HEL",
            "ACCOUNT_NUMBER": "GHELI",
            "ACCOUNT_TYPE": "U1",
            "CURRENCY_SYMBOL": "USD",
            "RR": "MAR01",
            "TRADE_DATE": "20260706",
            "BUY_SELL": "1",
            "QUANTITY": "19",
            "EXCHANGE": "07",
            "FUTURES_CODE": "NG",
            "CONTRACT_YEAR_MONTH": "202608",
            "PROMPT_DAY": "",
            "STRIKE_PRICE": "0",
            "SECURITY_DESCRIPTION": "NATURAL GAS HENRY HUB FUTURE",
            "TRADE_PRICE": "3.20325",
            "PRINTABLE_PRICE": "3.20325",
            "TRADE_TYPE": "G",
            "ORDER_NUMBER": "A85",
            "SECURITY_TYPE_CODE": "F",
            "CUSIP": "NYMEXNG202608",
            "COMMENT_CODE": "G",
            "GIVE_IN_OUT_CODE": "GO",
            "GIVE_IN_OUT_FIRM_NUM": "686",
            "OPEN_CLOSE_CODE": "O",
            "TRACE_NUM_OR_UNIQUE_IDENTIFIER": "13113201_A",
            "ROUND_TURN_HALF_TURN_ACCOUNT": "H",
            "EXECUTING_BROKER": "CME_KSAXENA4",
            "COMMISSION": ".00",
            "FEE_AMT_2": "-0.95",
            "GIVE_IO_CHARGE": "-9.5",
            "GIVE_IO_ATYPE": "U1",
            "DATE": "20260706",
            "LAST_TRD_DATE": "20260729",
            "NET_AMOUNT": "-608617.500000000",
            "TRADED_EXCHG": "1G",
            "EXCHANGE_NAME": "NYM",
            "EXCH_COMM_CD": "NG",
            "MULTIPLICATION_FACTOR": "10000.0000",
            "INSTR_TYPE": "F",
            "INSTRUMENT_DESCRIPTION": (
                "NYMEX HENRY HUB NATURAL GAS FUTURE          "
            ),
            "SETTLEMENT_PRICE": "3.24",
            "BROKER": "CME_KSAXENA4",
            "MIC": "XNYM",
        }
    )
    return row


def _write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    pd.DataFrame(rows, columns=transactions.RAW_CSV_COLUMNS).to_csv(
        path,
        index=False,
    )


def test_parse_transaction_file_keeps_raw_clear_street_contract(tmp_path):
    filepath = tmp_path / "Helios_Transactions_20260706.20260706_200817.csv"
    _write_csv(filepath, [_sample_row()])

    df = transactions.parse_transaction_file(filepath)

    assert list(df.columns) == transactions.OUTPUT_COLUMNS
    assert len(df) == 1
    row = df.iloc[0]
    assert row["trade_date_from_sftp"] == "20260706"
    assert row["sftp_upload_timestamp"] == pd.Timestamp(
        "2026-07-06 20:08:17+0000",
        tz="UTC",
    )
    assert row["row_number_for_trades"] == 0
    assert row["account_number"] == "GHELI"
    assert row["instrument_description"] == "NYMEX HENRY HUB NATURAL GAS FUTURE"
    assert row["prompt_day"] == 0
    assert row["quantity"] == 19
    assert row["trade_price"] == 3.20325
    assert row["net_amount"] == "-608617.500000000"


def test_parse_transaction_file_allows_header_only_files(tmp_path):
    filepath = tmp_path / "Helios_Transactions_20260106.20260106_191837.csv"
    _write_csv(filepath, [])

    df = transactions.parse_transaction_file(filepath)

    assert list(df.columns) == transactions.OUTPUT_COLUMNS
    assert df.empty


def test_pull_recent_transaction_files_uses_clear_street_sftp(monkeypatch, tmp_path):
    calls: dict[str, object] = {}
    timestamp = datetime(2026, 7, 6, 20, 8, 17, tzinfo=timezone.utc).timestamp()

    class FakeSftp:
        def listdir_attr(self, remote_dir):
            calls["remote_dir"] = remote_dir
            return [
                SimpleNamespace(
                    filename="Helios_Transactions_20260705.csv",
                    st_mtime=timestamp - 86400,
                ),
                SimpleNamespace(
                    filename="Helios_Transactions_20260706.csv",
                    st_mtime=timestamp,
                ),
                SimpleNamespace(filename="ignore.txt", st_mtime=timestamp),
            ]

        def get(self, remote_path, local_path):
            calls["remote_path"] = remote_path
            calls["local_path"] = local_path
            Path(local_path).write_text("RECORD_ID\n", encoding="utf-8")

        def close(self):
            calls["sftp_closed"] = True

    class FakeTransport:
        def close(self):
            calls["transport_closed"] = True

    def fake_connect(**kwargs):
        calls["connect"] = kwargs
        return FakeSftp(), FakeTransport()

    monkeypatch.setattr(
        transactions,
        "_connect_to_clear_street_sftp",
        fake_connect,
    )

    downloaded = transactions.pull_recent_transaction_files(
        lookback_days=1,
        local_dir=tmp_path,
        sftp_host="sftp.example.test",
        sftp_port=22,
        sftp_user="user",
        ssh_key_content="key-content",
        sftp_remote_dir="/reports",
    )

    assert len(downloaded) == 1
    assert calls["connect"]["ssh_key_content"] == "key-content"
    assert calls["remote_dir"] == "/reports"
    assert calls["remote_path"] == "/reports/Helios_Transactions_20260706.csv"
    assert str(calls["local_path"]).endswith(
        "Helios_Transactions_20260706.20260706_200817.csv.download"
    )
    assert downloaded[0].local_path.name == (
        "Helios_Transactions_20260706.20260706_200817.csv"
    )
    assert calls["sftp_closed"] is True
    assert calls["transport_closed"] is True


def test_pull_recent_transaction_files_filters_target_trade_date(
    monkeypatch,
    tmp_path,
):
    calls: dict[str, object] = {}
    timestamp = datetime(2026, 7, 6, 20, 8, 17, tzinfo=timezone.utc).timestamp()

    class FakeSftp:
        def listdir_attr(self, remote_dir):
            calls["remote_dir"] = remote_dir
            return [
                SimpleNamespace(
                    filename="Helios_Transactions_20260705.csv",
                    st_mtime=timestamp - 86400,
                ),
                SimpleNamespace(
                    filename="Helios_Transactions_20260706.csv",
                    st_mtime=timestamp,
                ),
            ]

        def get(self, remote_path, local_path):
            calls["remote_path"] = remote_path
            Path(local_path).write_text("RECORD_ID\n", encoding="utf-8")

        def close(self):
            pass

    class FakeTransport:
        def close(self):
            pass

    monkeypatch.setattr(
        transactions,
        "_connect_to_clear_street_sftp",
        lambda **kwargs: (FakeSftp(), FakeTransport()),
    )

    downloaded = transactions.pull_recent_transaction_files(
        lookback_days=5,
        local_dir=tmp_path,
        target_trade_date="2026-07-06",
        sftp_host="sftp.example.test",
        sftp_port=22,
        sftp_user="user",
        ssh_key_content="key-content",
        sftp_remote_dir="/reports",
    )

    assert len(downloaded) == 1
    assert calls["remote_path"] == "/reports/Helios_Transactions_20260706.csv"
    assert downloaded[0].remote_filename == "Helios_Transactions_20260706.csv"


def test_run_clear_street_transactions_downloads_parses_and_upserts(
    monkeypatch,
    tmp_path,
):
    filepath = tmp_path / "Helios_Transactions_20260706.20260706_200817.csv"
    _write_csv(filepath, [_sample_row()])
    captured: dict[str, object] = {}

    def fake_pull_recent_transaction_files(**kwargs):
        captured["pull"] = kwargs
        return [
            transactions.DownloadedClearStreetFile(
                remote_filename="Helios_Transactions_20260706.csv",
                local_path=filepath,
                sftp_upload_timestamp=pd.Timestamp(
                    "2026-07-06 20:08:17+0000",
                    tz="UTC",
                ),
            )
        ]

    def fake_upsert_transactions(**kwargs):
        captured["upsert"] = kwargs

    monkeypatch.setattr(
        transactions,
        "pull_recent_transaction_files",
        fake_pull_recent_transaction_files,
    )
    monkeypatch.setattr(
        transactions,
        "_upsert_transactions",
        fake_upsert_transactions,
    )

    summary = transactions.run_clear_street_transactions(
        lookback_days=1,
        local_dir=tmp_path,
        database="stage_db",
    )

    assert captured["pull"]["lookback_days"] == 1
    assert captured["upsert"]["database"] == "stage_db"
    assert len(captured["upsert"]["df"]) == 1
    assert summary["files_downloaded"] == 1
    assert summary["rows_processed"] == 1
    assert summary["source_files"] == [
        {
            "remote_filename": "Helios_Transactions_20260706.csv",
            "local_filename": "Helios_Transactions_20260706.20260706_200817.csv",
            "trade_date_from_sftp": "20260706",
            "sftp_upload_timestamp": pd.Timestamp(
                "2026-07-06 20:08:17+0000",
                tz="UTC",
            ).to_pydatetime(),
            "rows_processed": 1,
        }
    ]
    assert summary["latest_trade_file"] == summary["source_files"][0]
    assert summary["min_trade_date_from_sftp"] == "20260706"
    assert summary["max_trade_date_from_sftp"] == "20260706"
    assert summary["latest_sftp_upload_timestamp"] == pd.Timestamp(
        "2026-07-06 20:08:17+0000",
        tz="UTC",
    ).to_pydatetime()


def test_scheduled_window_after_midnight_targets_previous_day():
    window = orchestration._resolve_polling_window(
        now=datetime(2026, 7, 7, 2, 30, tzinfo=timezone.utc),
        start_hour=19,
        end_hour=5,
    )

    assert window.start_at == datetime(2026, 7, 6, 19, tzinfo=timezone.utc)
    assert window.deadline_at == datetime(2026, 7, 7, 5, tzinfo=timezone.utc)
    assert window.target_trade_date == "20260706"


def test_scheduled_main_polls_until_target_file_success(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []
    slack_calls: list[dict[str, object]] = []
    sleep_calls: list[float] = []
    summaries = iter(
        [
            {
                "target_table": "clear_street.eod_transactions",
                "lookback_days": 1,
                "files_downloaded": 0,
                "files_processed": 0,
                "rows_processed": 0,
                "target_trade_date_from_sftp": "20260706",
                "target_file_found": False,
                "min_trade_date_from_sftp": None,
                "max_trade_date_from_sftp": None,
                "latest_sftp_upload_timestamp": None,
            },
            {
                "target_table": "clear_street.eod_transactions",
                "lookback_days": 1,
                "files_downloaded": 1,
                "files_processed": 1,
                "rows_processed": 3,
                "target_trade_date_from_sftp": "20260706",
                "target_file_found": True,
                "min_trade_date_from_sftp": "20260706",
                "max_trade_date_from_sftp": "20260706",
                "latest_sftp_upload_timestamp": pd.Timestamp(
                    "2026-07-06 20:08:17+0000",
                    tz="UTC",
                ).to_pydatetime(),
            },
        ]
    )

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        orchestration.scrape,
        "run_clear_street_transactions",
        lambda **kwargs: next(summaries),
    )
    monkeypatch.setattr(
        orchestration,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )
    monkeypatch.setattr(
        orchestration.slack_notifications,
        "positions_trades_alerts_channel_id",
        lambda: "C123",
    )
    monkeypatch.setattr(
        orchestration.slack_notifications,
        "build_clear_street_eod_transactions_slack",
        lambda **kwargs: {
            "notification_key": "clear-street:slack:release",
            "channel_id": "C123",
            "channel_name": "#alerts",
            "message_text": "Clear Street loaded",
            "message_blocks": [],
            "dataset": "clear_street_eod_transactions",
            "source_event_key": "clear-street",
            "source_event_id": None,
            "payload": {},
        },
    )
    monkeypatch.setattr(
        orchestration.slack_notifications,
        "enqueue_slack_notification",
        lambda **kwargs: slack_calls.append(kwargs) or {"created": True},
    )
    monkeypatch.setattr(
        orchestration.slack_notifications,
        "notifications_enabled",
        lambda: False,
    )
    monkeypatch.setattr(
        orchestration.slack_notifications,
        "send_due_slack_notifications",
        lambda **kwargs: (_ for _ in ()).throw(
            AssertionError("Slack sender should not run when disabled")
        ),
    )

    exit_code = orchestration.scheduled_main(
        database="stage_db",
        now_fn=lambda: datetime(2026, 7, 6, 19, tzinfo=timezone.utc),
        sleep_fn=lambda seconds: sleep_calls.append(seconds),
        upload_mufg=False,
        email_nav=False,
    )

    assert exit_code == 0
    assert sleep_calls == [300.0]
    assert len(slack_calls) == 1
    assert len(telemetry) == 1
    assert telemetry[0]["operation_name"] == "clear_street_eod_transactions_poll"
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["attempt"] == 2
    assert telemetry[0]["max_attempts"] == 2
    assert telemetry[0]["metadata"]["target_trade_date"] == "20260706"
    assert telemetry[0]["metadata"]["poll_count"] == 2
    assert telemetry[0]["metadata"]["target_file_found"] is True
    assert telemetry[0]["metadata"]["mufg_upload_enabled"] is False


def test_clear_street_email_success_queues_source_csv(monkeypatch, tmp_path):
    trade_file = tmp_path / "Helios_Transactions_20260706.20260707_020817.csv"
    trade_file.write_text("RECORD_ID\n1\n", encoding="utf-8")
    email_calls: list[dict[str, object]] = []

    monkeypatch.setattr(
        orchestration.email_notifications.credentials,
        "HELIOS_EMAIL_RECIPIENTS",
        ["ops@example.test"],
    )
    monkeypatch.setattr(
        orchestration.email_notifications,
        "build_clear_street_eod_transactions_file_email",
        lambda **kwargs: {
            "notification_key": "clear-street:email:file",
            "recipient_email": kwargs["recipient_email"],
            "subject": "Clear Street file available",
            "body_text": "Attached.",
            "body_html": None,
            "dataset": "clear_street_eod_transactions",
            "source_event_key": "clear-street",
            "source_event_id": None,
            "payload": {"attachment_paths": [str(kwargs["attachment_path"])]},
        },
    )
    monkeypatch.setattr(
        orchestration.email_notifications,
        "enqueue_email_notification",
        lambda **kwargs: email_calls.append(kwargs) or {"created": True},
    )
    monkeypatch.setattr(
        orchestration.email_notifications,
        "notifications_enabled",
        lambda: False,
    )

    queued = orchestration._notify_clear_street_email_success(
        summary={
            "rows_processed": 1,
            "local_dir": str(tmp_path),
            "latest_trade_file": {
                "local_filename": trade_file.name,
                "trade_date_from_sftp": "20260706",
            },
        },
        database="stage_db",
        run_logger=SimpleNamespace(
            info=lambda *_args, **_kwargs: None,
            exception=lambda *_args, **_kwargs: None,
        ),
    )

    assert queued == 1
    assert email_calls[0]["database"] == "stage_db"
    assert email_calls[0]["recipient_email"] == "ops@example.test"
    assert email_calls[0]["payload"]["attachment_paths"] == [str(trade_file)]


def test_scheduled_main_runs_mufg_upload_after_target_success(
    monkeypatch,
    tmp_path,
):
    telemetry: list[dict[str, object]] = []
    mufg_calls: list[dict[str, object]] = []
    nav_calls: list[dict[str, object]] = []

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        orchestration.scrape,
        "run_clear_street_transactions",
        lambda **kwargs: {
            "target_table": "clear_street.eod_transactions",
            "lookback_days": 1,
            "files_downloaded": 1,
            "files_processed": 1,
            "rows_processed": 3,
            "target_trade_date_from_sftp": "20260706",
            "target_file_found": True,
            "min_trade_date_from_sftp": "20260706",
            "max_trade_date_from_sftp": "20260706",
            "latest_sftp_upload_timestamp": pd.Timestamp(
                "2026-07-06 20:08:17+0000",
                tz="UTC",
            ).to_pydatetime(),
        },
    )
    monkeypatch.setattr(
        orchestration,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )
    monkeypatch.setattr(
        orchestration,
        "_notify_clear_street_slack_success",
        lambda **kwargs: 1,
    )
    monkeypatch.setattr(
        orchestration.clear_street_mufg_upload,
        "main",
        lambda **kwargs: mufg_calls.append(kwargs) or 0,
    )
    monkeypatch.setattr(
        orchestration.clear_street_nav_email,
        "main",
        lambda **kwargs: nav_calls.append(kwargs) or 0,
    )

    exit_code = orchestration.scheduled_main(
        database="stage_db",
        mufg_local_dir=tmp_path / "mufg",
        nav_email_local_dir=tmp_path / "nav",
        now_fn=lambda: datetime(2026, 7, 6, 19, tzinfo=timezone.utc),
        sleep_fn=lambda seconds: None,
    )

    assert exit_code == 0
    assert len(mufg_calls) == 1
    assert mufg_calls[0]["expected_trade_date"] == "20260706"
    assert mufg_calls[0]["database"] == "stage_db"
    assert mufg_calls[0]["local_dir"] == tmp_path / "mufg"
    assert mufg_calls[0]["metadata"]["clear_street_rows_processed"] == 3
    assert len(nav_calls) == 1
    assert nav_calls[0]["expected_trade_date"] == "20260706"
    assert nav_calls[0]["database"] == "stage_db"
    assert nav_calls[0]["local_dir"] == tmp_path / "nav"
    assert nav_calls[0]["source_summary"]["target_file_found"] is True
    assert nav_calls[0]["metadata"]["clear_street_rows_processed"] == 3
    assert len(telemetry) == 1
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["metadata"]["mufg_upload_enabled"] is True
    assert telemetry[0]["metadata"]["nav_email_enabled"] is True
    assert telemetry[0]["metadata"]["downstream_failures"] == []


def test_scheduled_main_returns_nonzero_when_mufg_upload_fails(
    monkeypatch,
    tmp_path,
):
    telemetry: list[dict[str, object]] = []
    nav_calls: list[dict[str, object]] = []

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        orchestration.scrape,
        "run_clear_street_transactions",
        lambda **kwargs: {
            "target_table": "clear_street.eod_transactions",
            "lookback_days": 1,
            "files_downloaded": 1,
            "files_processed": 1,
            "rows_processed": 3,
            "target_trade_date_from_sftp": "20260706",
            "target_file_found": True,
            "min_trade_date_from_sftp": "20260706",
            "max_trade_date_from_sftp": "20260706",
            "latest_sftp_upload_timestamp": pd.Timestamp(
                "2026-07-06 20:08:17+0000",
                tz="UTC",
            ).to_pydatetime(),
        },
    )
    monkeypatch.setattr(
        orchestration,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )
    monkeypatch.setattr(
        orchestration,
        "_notify_clear_street_slack_success",
        lambda **kwargs: 1,
    )
    monkeypatch.setattr(
        orchestration.clear_street_mufg_upload,
        "main",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("MUFG down")),
    )
    monkeypatch.setattr(
        orchestration.clear_street_nav_email,
        "main",
        lambda **kwargs: nav_calls.append(kwargs) or 0,
    )

    exit_code = orchestration.scheduled_main(
        database="stage_db",
        now_fn=lambda: datetime(2026, 7, 6, 19, tzinfo=timezone.utc),
        sleep_fn=lambda seconds: None,
    )

    assert exit_code == 1
    assert len(telemetry) == 1
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["error_type"] is None
    assert telemetry[0]["metadata"]["target_file_found"] is True
    assert telemetry[0]["metadata"]["mufg_upload_enabled"] is True
    assert telemetry[0]["metadata"]["nav_email_enabled"] is True
    assert telemetry[0]["metadata"]["downstream_failures"] == ["mufg_upload"]
    assert len(nav_calls) == 1


def test_scheduled_main_returns_nonzero_when_nav_email_fails(
    monkeypatch,
    tmp_path,
):
    telemetry: list[dict[str, object]] = []

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        orchestration.scrape,
        "run_clear_street_transactions",
        lambda **kwargs: {
            "target_table": "clear_street.eod_transactions",
            "lookback_days": 1,
            "files_downloaded": 1,
            "files_processed": 1,
            "rows_processed": 3,
            "target_trade_date_from_sftp": "20260706",
            "target_file_found": True,
            "min_trade_date_from_sftp": "20260706",
            "max_trade_date_from_sftp": "20260706",
            "latest_sftp_upload_timestamp": pd.Timestamp(
                "2026-07-06 20:08:17+0000",
                tz="UTC",
            ).to_pydatetime(),
        },
    )
    monkeypatch.setattr(
        orchestration,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )
    monkeypatch.setattr(
        orchestration,
        "_notify_clear_street_slack_success",
        lambda **kwargs: 1,
    )
    monkeypatch.setattr(
        orchestration.clear_street_mufg_upload,
        "main",
        lambda **kwargs: 0,
    )
    monkeypatch.setattr(
        orchestration.clear_street_nav_email,
        "main",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("Graph down")),
    )

    exit_code = orchestration.scheduled_main(
        database="stage_db",
        now_fn=lambda: datetime(2026, 7, 6, 19, tzinfo=timezone.utc),
        sleep_fn=lambda seconds: None,
    )

    assert exit_code == 1
    assert len(telemetry) == 1
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["error_type"] is None
    assert telemetry[0]["metadata"]["target_file_found"] is True
    assert telemetry[0]["metadata"]["mufg_upload_enabled"] is True
    assert telemetry[0]["metadata"]["nav_email_enabled"] is True
    assert telemetry[0]["metadata"]["downstream_failures"] == ["nav_email"]


def test_scheduled_main_times_out_at_window_end(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []
    timeout_slack_calls: list[dict[str, object]] = []
    sleep_calls: list[float] = []
    now_values = iter(
        [
            datetime(2026, 7, 6, 19, tzinfo=timezone.utc),
            datetime(2026, 7, 6, 19, tzinfo=timezone.utc),
            datetime(2026, 7, 6, 19, tzinfo=timezone.utc),
            datetime(2026, 7, 7, 5, tzinfo=timezone.utc),
        ]
    )

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        orchestration.scrape,
        "run_clear_street_transactions",
        lambda **kwargs: {
            "target_table": "clear_street.eod_transactions",
            "lookback_days": 1,
            "files_downloaded": 0,
            "files_processed": 0,
            "rows_processed": 0,
            "target_trade_date_from_sftp": "20260706",
            "target_file_found": False,
            "min_trade_date_from_sftp": None,
            "max_trade_date_from_sftp": None,
            "latest_sftp_upload_timestamp": None,
        },
    )
    monkeypatch.setattr(
        orchestration,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )
    monkeypatch.setattr(
        orchestration,
        "_notify_clear_street_slack_timeout",
        lambda **kwargs: timeout_slack_calls.append(kwargs) or 1,
    )

    exit_code = orchestration.scheduled_main(
        database="stage_db",
        now_fn=lambda: next(now_values),
        sleep_fn=lambda seconds: sleep_calls.append(seconds),
    )

    assert exit_code == 1
    assert sleep_calls == [300.0]
    assert len(timeout_slack_calls) == 1
    assert timeout_slack_calls[0]["target_trade_date"] == "20260706"
    assert len(telemetry) == 1
    assert telemetry[0]["operation_name"] == "clear_street_eod_transactions_poll"
    assert telemetry[0]["status"] == "failure"
    assert telemetry[0]["error_type"] == "DataNotYetAvailable"
    assert telemetry[0]["attempt"] == 1
    assert telemetry[0]["metadata"]["poll_count"] == 1
    assert telemetry[0]["metadata"]["target_file_found"] is False


def test_orchestration_emits_api_fetch_telemetry(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []
    slack_calls: list[dict[str, object]] = []
    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setenv("CLEAR_STREET_SFTP_HOST", "sftp.example.test")
    monkeypatch.setattr(
        orchestration.scrape,
        "run_clear_street_transactions",
        lambda **kwargs: {
            "target_table": "clear_street.eod_transactions",
            "lookback_days": kwargs["lookback_days"],
            "files_downloaded": 1,
            "files_processed": 1,
            "rows_processed": 3,
            "min_trade_date_from_sftp": "20260706",
            "max_trade_date_from_sftp": "20260706",
            "latest_sftp_upload_timestamp": pd.Timestamp(
                "2026-07-06 20:08:17+0000",
                tz="UTC",
            ).to_pydatetime(),
        },
    )
    monkeypatch.setattr(
        orchestration,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )
    monkeypatch.setattr(
        orchestration.slack_notifications,
        "build_clear_street_eod_transactions_slack",
        lambda **kwargs: {
            "notification_key": "clear-street:slack:release",
            "channel_id": "C123",
            "channel_name": "#alerts",
            "message_text": "Clear Street loaded",
            "message_blocks": [],
            "dataset": "clear_street_eod_transactions",
            "source_event_key": "clear-street",
            "source_event_id": None,
            "payload": {},
        },
    )
    monkeypatch.setattr(
        orchestration.slack_notifications,
        "enqueue_slack_notification",
        lambda **kwargs: slack_calls.append(kwargs) or {"created": True},
    )
    monkeypatch.setattr(
        orchestration.slack_notifications,
        "notifications_enabled",
        lambda: False,
    )
    monkeypatch.setattr(
        orchestration.slack_notifications,
        "positions_trades_alerts_channel_id",
        lambda: "C123",
    )
    monkeypatch.setattr(
        orchestration.slack_notifications,
        "send_due_slack_notifications",
        lambda **kwargs: (_ for _ in ()).throw(
            AssertionError("Slack sender should not run when disabled")
        ),
    )

    exit_code = orchestration.main(
        lookback_days=1,
        database="stage_db",
    )

    assert exit_code == 0
    assert len(telemetry) == 1
    assert telemetry[0]["provider"] == "clear_street_sftp"
    assert telemetry[0]["pipeline_name"] == "clear_street_eod_transactions"
    assert telemetry[0]["target_table"] == "clear_street.eod_transactions"
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["rows_written"] == 3
    assert telemetry[0]["database"] == "stage_db"
    assert telemetry[0]["metadata"]["files_downloaded"] == 1
    assert len(slack_calls) == 1
    assert slack_calls[0]["database"] == "stage_db"
    assert slack_calls[0]["notification_key"] == "clear-street:slack:release"
