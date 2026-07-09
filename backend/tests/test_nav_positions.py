from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

from backend.orchestration.nav import positions as orchestration
from backend.scrapes.nav import positions

RAW_REPORT_COLUMNS = [
    "Broker Name",
    "Account Group",
    "Account",
    "Trade Date",
    "Product ID\n(Internal)",
    "Product",
    "Type",
    "Month Year",
    "Client Symbol",
    "Strike Price",
    "Call/ Put",
    "Product Currency 1",
    "Long/ Short",
    "Quantity 1",
    "Counter\nCurrency\n(CCY2)",
    "CCY2\nLong/ Short",
    "CCY2\nQuantity 2",
    "Trade Price",
    "Multiplier and Tick Value",
    "Cost In Native Currency",
    "Open Exchange Rate ($)",
    "Cost In Base Currency ($)",
    "Market Settlement  Price",
    "Market Value In Native Currency",
    "Close Exchange\nRate ($)",
    "Market Value In Base Currency ($)",
    "Sector",
    "Sub Sector",
    "Country",
    "Exchange Name",
    "Source 1 Symbol",
    "Source 3 Symbol",
    "One Chicago Symbol",
    "FASLevel",
    "Option Style",
]


def _sample_report_row(account_group: str) -> dict[str, object]:
    return {
        "Broker Name": "ABN",
        "Account Group": account_group,
        "Account": "ABN AMRO_1251PT034",
        "Trade Date": pd.Timestamp("2026-02-05"),
        "Product ID\n(Internal)": 6750217.0,
        "Product": "NYM EUR NATURAL GAS",
        "Type": "ENGOPP",
        "Month Year": " MAR25",
        "Client Symbol": "Henry Hub Eu Fin Option",
        "Strike Price": 1.25,
        "Call/ Put": "PUT",
        "Product Currency 1": "USD",
        "Long/ Short": "SHORT",
        "Quantity 1": -15,
        "Counter\nCurrency\n(CCY2)": None,
        "CCY2\nLong/ Short": None,
        "CCY2\nQuantity 2": None,
        "Trade Price": 0.005,
        "Multiplier and Tick Value": 10000.0,
        "Cost In Native Currency": -750.0,
        "Open Exchange Rate ($)": 1.0,
        "Cost In Base Currency ($)": -750.0,
        "Market Settlement  Price": 0.0001,
        "Market Value In Native Currency": -15.0,
        "Close Exchange\nRate ($)": 1.0,
        "Market Value In Base Currency ($)": -15.0,
        "Sector": "ENERGIES",
        "Sub Sector": "ENERGIES",
        "Country": "UNITED STATES",
        "Exchange Name": "NYM            ",
        "Source 1 Symbol": "GKH5P 1.25 COMDTY",
        "Source 3 Symbol": "LNE1250O25",
        "One Chicago Symbol": None,
        "FASLevel": "Level 1",
        "Option Style": "Equity Style Option",
    }


def _write_nav_workbook(path, *, account_group: str = "PNT Trading, LLC") -> None:
    report_df = pd.DataFrame(
        [
            _sample_report_row(account_group),
            {**{column: None for column in RAW_REPORT_COLUMNS}, "Broker Name": "Total"},
        ],
        columns=RAW_REPORT_COLUMNS,
    )
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        report_df.to_excel(writer, index=False, startrow=3)


@pytest.mark.parametrize(
    ("fund_code", "filename"),
    [
        (
            "agr",
            "Position Valuation Detail Report_20260205_AGR Trading II, LLC.20260206_054037.xlsx",
        ),
        (
            "moross",
            "Position Valuation Detail Report_20260205_Moross Limited Partnership.20260206_054037.xlsx",
        ),
        (
            "pnt",
            "Position Valuation Detail Report_20260205_PNT Trading, LLC.20260206_054037.xlsx",
        ),
        (
            "titan",
            "Position Valuation Detail Report_20260205_ESKER POINT LP.20260206_054037.xlsx",
        ),
    ],
)
def test_parse_position_file_keeps_nav_report_raw(tmp_path, fund_code, filename):
    filepath = tmp_path / filename
    fund_config = positions.FUND_CONFIGS[fund_code]
    _write_nav_workbook(filepath, account_group=fund_config.legal_entity)

    df = positions.parse_position_file(filepath, fund_config=fund_config)

    assert list(df.columns) == positions.OUTPUT_COLUMNS
    assert len(df) == 1
    row = df.iloc[0]
    assert row["fund_code"] == fund_code
    assert row["source_legal_entity"].lower() == fund_config.legal_entity.lower()
    assert row["source_file_row_number"] == 5
    assert row["nav_date"].isoformat() == "2026-02-05"
    assert row["sftp_upload_timestamp"] == pd.Timestamp(
        "2026-02-06 05:40:37+0000",
        tz="UTC",
    )
    assert row["trade_date"].isoformat() == "2026-02-05"
    assert row["product_id_internal"] == "6750217"
    assert row["month_year"] == "MAR25"
    assert row["exchange_name"] == "NYM"
    assert row["source_3_symbol"] == "LNE1250O25"
    assert row["quantity_1"] == -15
    assert row["close_exchange_rate"] == 1.0
    assert row["fas_level"] == "Level 1"
    assert "product_code" not in df.columns
    assert "product_group" not in df.columns
    assert "contract_yyyymm" not in df.columns
    assert "normalization_status" not in df.columns


def test_run_nav_positions_downloads_parses_and_upserts(monkeypatch, tmp_path):
    filepath = (
        tmp_path
        / "pnt"
        / "Position Valuation Detail Report_20260205_PNT Trading, LLC.20260206_054037.xlsx"
    )
    filepath.parent.mkdir()
    _write_nav_workbook(filepath)
    captured: dict[str, object] = {}

    def fake_pull_recent_position_files(**kwargs):
        captured["pull"] = kwargs
        return [
            positions.DownloadedNavFile(
                fund_code="pnt",
                remote_filename="Position Valuation Detail Report_20260205_PNT Trading, LLC.XLSX",
                local_path=filepath,
                sftp_upload_timestamp=pd.Timestamp(
                    "2026-02-06 05:40:37+0000",
                    tz="UTC",
                ),
            )
        ]

    def fake_upsert_positions(**kwargs):
        captured["upsert"] = kwargs

    monkeypatch.setattr(
        positions,
        "pull_recent_position_files",
        fake_pull_recent_position_files,
    )
    monkeypatch.setattr(positions, "_upsert_positions", fake_upsert_positions)

    summary = positions.run_nav_positions(
        lookback_days=1,
        fund_codes=("pnt",),
        local_dir=tmp_path,
        database="stage_db",
    )

    assert captured["pull"]["lookback_days"] == 1
    assert captured["pull"]["fund_configs"][0].fund_code == "pnt"
    assert captured["pull"]["target_nav_date"] is None
    assert captured["upsert"]["database"] == "stage_db"
    assert len(captured["upsert"]["df"]) == 1
    assert summary["files_downloaded"] == 1
    assert summary["rows_processed"] == 1
    assert summary["source_files"] == [
        {
            "fund_code": "pnt",
            "remote_filename": "Position Valuation Detail Report_20260205_PNT Trading, LLC.XLSX",
            "local_filename": filepath.name,
            "local_path": str(filepath),
            "sftp_upload_timestamp": pd.Timestamp(
                "2026-02-06 05:40:37+0000",
                tz="UTC",
            ).to_pydatetime(),
        }
    ]


def test_backfill_position_normalization_is_disabled():
    with pytest.raises(RuntimeError, match="raw-only"):
        positions.backfill_position_normalization(database="stage_db")


def test_resolve_local_root_defaults_to_nav_downloads(monkeypatch):
    monkeypatch.setenv("HELIOS_NAV_POSITIONS_DIR", r"C:\do-not-use")

    assert positions.resolve_local_root() == positions.DEFAULT_LOCAL_ROOT
    assert positions.resolve_local_root().name == "downloads"
    assert positions.resolve_local_root().parent.name == "nav"


def test_pull_recent_position_files_uses_nav_sftp(monkeypatch, tmp_path):
    calls: dict[str, object] = {}

    class FakeSftp:
        def listdir_attr(self, remote_dir):
            calls["remote_dir"] = remote_dir
            return [
                SimpleNamespace(
                    filename="Position Valuation Detail Report_20260205_PNT Trading, LLC.XLSX",
                    st_mtime=1770356437,
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
        positions,
        "_connect_to_nav_sftp",
        lambda **kwargs: (FakeSftp(), FakeTransport()),
    )

    downloaded = positions.pull_recent_position_files(
        fund_configs=[positions.FUND_CONFIGS["pnt"]],
        lookback_days=1,
        local_root=tmp_path,
        sftp_host="sftp.example.test",
        sftp_port=22,
        sftp_user="user",
        sftp_password="password",
        sftp_remote_dir="/",
    )

    assert len(downloaded) == 1
    assert calls["remote_dir"] == "/"
    assert calls["remote_path"] == (
        "/Position Valuation Detail Report_20260205_PNT Trading, LLC.XLSX"
    )
    assert str(calls["local_path"]).endswith(
        "Position Valuation Detail Report_20260205_PNT Trading, LLC.20260206_054037.xlsx.download"
    )
    assert str(downloaded[0].local_path).endswith(
        "Position Valuation Detail Report_20260205_PNT Trading, LLC.20260206_054037.xlsx"
    )
    assert calls["sftp_closed"] is True
    assert calls["transport_closed"] is True


def test_pull_recent_position_files_preserves_existing_cached_file(monkeypatch, tmp_path):
    cached_dir = tmp_path / "pnt"
    cached_dir.mkdir()
    cached_path = (
        cached_dir
        / "Position Valuation Detail Report_20260205_PNT Trading, LLC.20260206_054037.xlsx"
    )
    cached_path.write_bytes(b"preserved")

    class FakeSftp:
        def listdir_attr(self, remote_dir):
            return [
                SimpleNamespace(
                    filename="Position Valuation Detail Report_20260205_PNT Trading, LLC.XLSX",
                    st_mtime=1770356437,
                )
            ]

        def get(self, remote_path, local_path):
            raise AssertionError("existing cached NAV workbook should not be overwritten")

        def close(self):
            pass

    class FakeTransport:
        def close(self):
            pass

    monkeypatch.setattr(
        positions,
        "_connect_to_nav_sftp",
        lambda **kwargs: (FakeSftp(), FakeTransport()),
    )

    downloaded = positions.pull_recent_position_files(
        fund_configs=[positions.FUND_CONFIGS["pnt"]],
        lookback_days=1,
        local_root=tmp_path,
        sftp_host="sftp.example.test",
        sftp_port=22,
        sftp_user="user",
        sftp_password="password",
        sftp_remote_dir="/",
    )

    assert downloaded[0].local_path == cached_path
    assert cached_path.read_bytes() == b"preserved"


def test_run_nav_positions_waits_for_complete_target_before_upsert(
    monkeypatch,
    tmp_path,
):
    captured: dict[str, object] = {}

    def fake_pull_recent_position_files(**kwargs):
        captured["pull"] = kwargs
        return [
            positions.DownloadedNavFile(
                fund_code="pnt",
                remote_filename="Position Valuation Detail Report_20260205_PNT Trading, LLC.XLSX",
                local_path=tmp_path / "missing-but-not-parsed.xlsx",
                sftp_upload_timestamp=pd.Timestamp(
                    "2026-02-06 05:40:37+0000",
                    tz="UTC",
                ),
            )
        ]

    monkeypatch.setattr(
        positions,
        "pull_recent_position_files",
        fake_pull_recent_position_files,
    )
    monkeypatch.setattr(
        positions,
        "parse_position_file",
        lambda *args, **kwargs: pytest.fail("should not parse partial target"),
    )
    monkeypatch.setattr(
        positions,
        "_upsert_positions",
        lambda *args, **kwargs: pytest.fail("should not upsert partial target"),
    )

    summary = positions.run_nav_positions(
        lookback_days=1,
        fund_codes=("agr", "pnt"),
        local_dir=tmp_path,
        target_nav_date="2026-02-05",
        require_complete_target=True,
    )

    assert captured["pull"]["target_nav_date"].isoformat() == "2026-02-05"
    assert summary["target_file_found"] is False
    assert summary["loaded_fund_codes"] == ["pnt"]
    assert summary["missing_fund_codes"] == ["agr"]
    assert summary["files_processed"] == 0
    assert summary["rows_processed"] == 0


def test_orchestration_emits_api_fetch_telemetry(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []
    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setenv("NAV_SFTP_HOST", "sftp.example.test")
    monkeypatch.setattr(
        orchestration.scrape,
        "run_nav_positions",
        lambda **kwargs: {
            "target_table": "nav.positions",
            "fund_codes": ["pnt"],
            "lookback_days": kwargs["lookback_days"],
            "files_downloaded": 1,
            "files_processed": 1,
            "rows_processed": 3,
        },
    )
    monkeypatch.setattr(
        orchestration,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    exit_code = orchestration.main(
        lookback_days=1,
        fund_codes=("pnt",),
        database="stage_db",
        send_email=False,
    )

    assert exit_code == 0
    assert len(telemetry) == 1
    assert telemetry[0]["provider"] == "nav_sftp"
    assert telemetry[0]["pipeline_name"] == "nav_positions"
    assert telemetry[0]["target_table"] == "nav.positions"
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["rows_written"] == 3
    assert telemetry[0]["database"] == "stage_db"
    assert telemetry[0]["metadata"]["fund_codes"] == ["pnt"]


def test_scheduled_main_emits_scheduled_telemetry(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []
    calls: list[dict[str, object]] = []
    current_time = datetime(2026, 7, 9, 6, 0, tzinfo=timezone.utc)

    def fake_run_nav_positions(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            return {
                "target_table": "nav.positions",
                "fund_codes": ["pnt"],
                "lookback_days": kwargs["lookback_days"],
                "target_nav_date": "2026-07-08",
                "target_file_found": False,
                "loaded_fund_codes": [],
                "missing_fund_codes": ["pnt"],
                "files_downloaded": 0,
                "files_processed": 0,
                "rows_processed": 0,
            }
        return {
            "target_table": "nav.positions",
            "fund_codes": ["pnt"],
            "lookback_days": kwargs["lookback_days"],
            "target_nav_date": "2026-07-08",
            "target_file_found": True,
            "loaded_fund_codes": ["pnt"],
            "missing_fund_codes": [],
            "files_downloaded": 1,
            "files_processed": 1,
            "rows_processed": 3,
        }

    def sleep_fn(seconds):
        nonlocal current_time
        current_time += timedelta(seconds=seconds)

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setenv("NAV_SFTP_HOST", "sftp.example.test")
    monkeypatch.setattr(
        orchestration.scrape,
        "run_nav_positions",
        fake_run_nav_positions,
    )
    monkeypatch.setattr(
        orchestration,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    exit_code = orchestration.scheduled_main(
        lookback_days=1,
        fund_codes=("pnt",),
        database="stage_db",
        target_nav_date="2026-07-08",
        poll_wait_seconds=60,
        poll_window_minutes=10,
        poll_deadline_hour=None,
        now_fn=lambda: current_time,
        sleep_fn=sleep_fn,
        send_email=False,
    )

    assert exit_code == 0
    assert len(calls) == 2
    assert calls[0]["target_nav_date"].isoformat() == "2026-07-08"
    assert calls[0]["require_complete_target"] is True
    assert len(telemetry) == 1
    assert telemetry[0]["operation_name"] == "nav_positions_scheduled"
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["database"] == "stage_db"
    assert telemetry[0]["metadata"]["run_mode"] == "scheduler"
    assert telemetry[0]["metadata"]["scheduler"] == "windows_task_scheduler"
    assert telemetry[0]["metadata"]["poll_count"] == 2
    assert telemetry[0]["metadata"]["target_nav_date"] == "2026-07-08"
    assert telemetry[0]["metadata"]["target_file_found"] is True
    assert telemetry[0]["metadata"]["email_notifications_enabled"] is False
    assert telemetry[0]["metadata"]["emails_queued"] == 0


def test_nav_positions_email_success_queues_workbooks(monkeypatch, tmp_path):
    workbook = (
        tmp_path
        / "Position Valuation Detail Report_20260708_PNT Trading, LLC.20260709_125500.xlsx"
    )
    workbook.write_text("xlsx", encoding="utf-8")
    email_calls: list[dict[str, object]] = []

    monkeypatch.setattr(
        orchestration.email_notifications.credentials,
        "HELIOS_EMAIL_RECIPIENTS",
        ["ops@example.test"],
    )
    monkeypatch.setattr(
        orchestration.email_notifications,
        "build_nav_positions_file_email",
        lambda **kwargs: {
            "notification_key": "nav-positions:email:file",
            "recipient_email": kwargs["recipient_email"],
            "subject": "NAV positions loaded",
            "body_text": "Attached.",
            "body_html": None,
            "dataset": "nav_positions",
            "source_event_key": "nav-positions",
            "source_event_id": None,
            "payload": {
                "attachment_paths": [str(path) for path in kwargs["attachment_paths"]]
            },
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

    queued = orchestration._notify_nav_positions_email_success(
        summary={
            "target_nav_date": "2026-07-08",
            "rows_processed": 3,
            "source_files": [
                {
                    "fund_code": "pnt",
                    "local_path": str(workbook),
                    "local_filename": workbook.name,
                    "remote_filename": (
                        "Position Valuation Detail Report_20260708_PNT Trading, LLC.XLSX"
                    ),
                }
            ],
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
    assert email_calls[0]["payload"]["attachment_paths"] == [str(workbook)]


def test_scheduled_main_returns_failure_when_target_window_expires(
    monkeypatch,
    tmp_path,
):
    telemetry: list[dict[str, object]] = []
    current_time = datetime(2026, 7, 9, 6, 0, tzinfo=timezone.utc)

    def fake_run_nav_positions(**kwargs):
        return {
            "target_table": "nav.positions",
            "fund_codes": ["pnt"],
            "lookback_days": kwargs["lookback_days"],
            "target_nav_date": "2026-07-08",
            "target_file_found": False,
            "loaded_fund_codes": [],
            "missing_fund_codes": ["pnt"],
            "files_downloaded": 0,
            "files_processed": 0,
            "rows_processed": 0,
        }

    def sleep_fn(seconds):
        nonlocal current_time
        current_time += timedelta(seconds=seconds)

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setenv("NAV_SFTP_HOST", "sftp.example.test")
    monkeypatch.setattr(
        orchestration.scrape,
        "run_nav_positions",
        fake_run_nav_positions,
    )
    monkeypatch.setattr(
        orchestration,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    exit_code = orchestration.scheduled_main(
        lookback_days=1,
        fund_codes=("pnt",),
        database="stage_db",
        target_nav_date="2026-07-08",
        poll_wait_seconds=60,
        poll_window_minutes=1,
        poll_deadline_hour=None,
        now_fn=lambda: current_time,
        sleep_fn=sleep_fn,
    )

    assert exit_code == 1
    assert len(telemetry) == 1
    assert telemetry[0]["operation_name"] == "nav_positions_scheduled"
    assert telemetry[0]["status"] == "failure"
    assert telemetry[0]["error_type"] == "DataNotAvailable"
    assert telemetry[0]["rows_written"] == 0
    assert telemetry[0]["metadata"]["scheduler"] == "windows_task_scheduler"
    assert telemetry[0]["metadata"]["poll_count"] == 1
    assert telemetry[0]["metadata"]["target_file_found"] is False
