from __future__ import annotations

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
def test_parse_position_file_normalizes_nav_report(tmp_path, fund_code, filename):
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
    assert captured["upsert"]["database"] == "stage_db"
    assert len(captured["upsert"]["df"]) == 1
    assert summary["files_downloaded"] == 1
    assert summary["rows_processed"] == 1


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
        "Position Valuation Detail Report_20260205_PNT Trading, LLC.20260206_054037.xlsx"
    )
    assert calls["sftp_closed"] is True
    assert calls["transport_closed"] is True


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
