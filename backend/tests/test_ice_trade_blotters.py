from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from backend.backfills.ice_trade_blotters import from_legacy_cache as backfill
from backend.orchestration.ice_trade_blotters import trades as orchestration
from backend.scrapes.ice_trade_blotters.scripts import (
    manage_csv_files,
    upsert_ice_trade_blotters,
)


HTML_HEADERS = [
    "Trade Date",
    "Trade Time",
    "Deal ID",
    "Leg ID",
    "Orig ID",
    "B/S",
    "Product",
    "Hub",
    "Contract",
    "Begin Date",
    "End Date",
    "Clearing Acct",
    "Cust Acct",
    "Clearing Firm",
    "Price",
    "Price Units",
    "Option",
    "Strike",
    "Strike2",
    "Style",
    "Lots",
    "Total Quantity",
    "Qty Units",
    "TT",
    "BRK",
    "Trader",
    "Memo",
    "Clearing Venue",
    "User ID",
    "Source",
    "Link ID",
    "USI",
    "Authorized Trader ID",
    "Location",
    "Meter",
    "Lead Time",
    "Waiver Ind",
    "Trade Time Micros",
    "CDI Override",
    "By Pass MQR",
    "Broker Name",
    "Trading Company",
    "MIC",
    "CC",
    "Strip",
    "Counterparty",
    "Qty Per Period",
    "Periods",
    "Counterparty User",
]


def _sample_values(**overrides: object) -> dict[str, object]:
    row = {
        "Trade Date": "2026-07-06",
        "Trade Time": "08:15:27",
        "Deal ID": "123456789012345678",
        "Leg ID": "987654321012345678",
        "Orig ID": "111111111111111111",
        "B/S": "B",
        "Product": "Natural Gas",
        "Hub": "Henry",
        "Contract": "NG Aug26",
        "Begin Date": "Aug26",
        "End Date": "Aug26",
        "Clearing Acct": "GHELI",
        "Cust Acct": "PNT",
        "Clearing Firm": "ABN",
        "Price": "3.20325",
        "Price Units": "USD/MMBtu",
        "Option": "F",
        "Strike": "0",
        "Strike2": "0",
        "Style": "",
        "Lots": "10",
        "Total Quantity": "100000",
        "Qty Units": "MMBtu",
        "TT": "",
        "BRK": "",
        "Trader": "AK",
        "Memo": "",
        "Clearing Venue": "ICE",
        "User ID": "AK1",
        "Source": "ICE",
        "Link ID": "222222222222222222",
        "USI": "",
        "Authorized Trader ID": "",
        "Location": "",
        "Meter": "",
        "Lead Time": "",
        "Waiver Ind": "",
        "Trade Time Micros": "",
        "CDI Override": "",
        "By Pass MQR": "",
        "Broker Name": "",
        "Trading Company": "HeliosCTA",
        "MIC": "IFEU",
        "CC": "",
        "Strip": "Aug26",
        "Counterparty": "",
        "Qty Per Period": "100000",
        "Periods": "1",
        "Counterparty User": "",
    }
    row.update(overrides)
    return row


def _write_html_xls(path: Path, rows: list[dict[str, object]]) -> None:
    header_cells = "".join(f"<th>{header}</th>" for header in HTML_HEADERS)
    body_rows = []
    for row in rows:
        cells = "".join(f"<td>{row.get(header, '')}</td>" for header in HTML_HEADERS)
        body_rows.append(f"<tr>{cells}</tr>")
    html = (
        "Futures Deals<br>"
        "<table>"
        f"<tr>{header_cells}</tr>"
        f"{''.join(body_rows)}"
        "</table>"
    )
    path.write_text(html, encoding="utf-8")


def test_parse_trade_blotter_html_xls_preserves_trade_ids(tmp_path):
    filepath = tmp_path / "DealReport.xls"
    _write_html_xls(filepath, [_sample_values()])

    df = upsert_ice_trade_blotters.parse_trade_blotter_file(filepath)

    assert list(df.columns) == upsert_ice_trade_blotters.COLUMNS
    assert len(df) == 1
    row = df.iloc[0]
    assert row["deal_id"] == "123456789012345678"
    assert row["leg_id"] == "987654321012345678"
    assert row["link_id"] == "222222222222222222"
    assert row["deal_section"] == "futures"
    assert row["trade_date"].isoformat() == "2026-07-06"
    assert row["report_date"].isoformat() == "2026-07-06"
    assert row["price"] == 3.20325
    assert row["lots"] == 10
    assert row["total_quantity"] == 100000.0
    assert row["file_hash"] == upsert_ice_trade_blotters.file_hash(filepath)


def test_parse_trade_blotter_rejects_lossy_scientific_trade_ids(tmp_path):
    filepath = tmp_path / "DealReport.xls"
    _write_html_xls(filepath, [_sample_values(**{"Deal ID": "1.23457E+17"})])

    with pytest.raises(ValueError, match="scientific-notation trade identifiers"):
        upsert_ice_trade_blotters.parse_trade_blotter_file(filepath)


def test_inbox_trade_files_only_returns_xls_files(tmp_path):
    xls = tmp_path / "DealReport.xls"
    xls.write_text("xls", encoding="utf-8")
    (tmp_path / "DealReport.csv").write_text("csv", encoding="utf-8")
    (tmp_path / "notes.txt").write_text("txt", encoding="utf-8")

    assert manage_csv_files._inbox_trade_files(tmp_path) == [xls]


def test_dedupe_trade_rows_uses_ice_business_key(tmp_path):
    filepath = tmp_path / "DealReport.xls"
    _write_html_xls(filepath, [_sample_values()])
    df = upsert_ice_trade_blotters.parse_trade_blotter_file(filepath)

    deduped = upsert_ice_trade_blotters._dedupe_trade_rows(pd.concat([df, df]))

    assert len(deduped) == 1


def test_run_import_requires_manifest_and_upserts_rows(monkeypatch, tmp_path):
    filepath = tmp_path / "DealReport.xls"
    _write_html_xls(filepath, [_sample_values()])
    upserts: list[dict[str, object]] = []

    monkeypatch.setattr(
        upsert_ice_trade_blotters,
        "_assert_registered_manifest_file",
        lambda **kwargs: {"stored_filename": Path(kwargs["csv_filepath"]).name},
    )
    monkeypatch.setattr(
        upsert_ice_trade_blotters,
        "_upsert_trade_rows",
        lambda **kwargs: upserts.append(kwargs),
    )
    monkeypatch.setattr(
        upsert_ice_trade_blotters,
        "_recompute_manifest_load_state",
        lambda **kwargs: None,
    )

    summary = upsert_ice_trade_blotters.run_import(
        csv_filepath=filepath,
        database="stage_db",
    )

    assert summary["rows_processed"] == 1
    assert summary["source_rows_read"] == 1
    assert summary["duplicate_rows_dropped"] == 0
    assert summary["manifest_file"] == filepath.name
    assert len(upserts) == 1
    assert len(upserts[0]["df"]) == 1
    assert upserts[0]["database"] == "stage_db"


def test_manage_csv_files_moves_to_formatted_and_upserts_manifest(
    monkeypatch,
    tmp_path,
):
    inbox_dir = tmp_path / "inbox"
    formatted_dir = tmp_path / "formatted"
    inbox_dir.mkdir()
    source_file = inbox_dir / "DealReport.xls"
    _write_html_xls(source_file, [_sample_values()])
    manifest_records: list[dict[str, object]] = []

    monkeypatch.setattr(
        manage_csv_files,
        "_existing_manifest_record",
        lambda **kwargs: None,
    )
    monkeypatch.setattr(
        manage_csv_files,
        "_upsert_manifest",
        lambda records, **kwargs: manifest_records.extend(records),
    )

    summary = manage_csv_files.manage_csv_files(
        inbox_dir=inbox_dir,
        formatted_files_dir=formatted_dir,
        standardize_existing=False,
        database="stage_db",
    )

    assert summary["files_processed"] == 1
    assert summary["rows_processed"] == 1
    assert len(summary["managed_files"]) == 1
    assert not source_file.exists()
    managed_path = Path(summary["managed_files"][0])
    assert managed_path.exists()
    assert managed_path.name.startswith("deal_report_2026_07_06_to_2026_07_06__")
    assert len(manifest_records) == 1
    assert manifest_records[0]["source_filename"] == "DealReport.xls"
    assert manifest_records[0]["stored_filename"] == managed_path.name
    assert manifest_records[0]["status"] == "managed"
    assert manifest_records[0]["is_loaded"] is False


def test_orchestration_emits_api_fetch_telemetry(monkeypatch, tmp_path):
    managed_path = tmp_path / "formatted" / "DealReport.xls"
    telemetry: list[dict[str, object]] = []

    monkeypatch.setenv("HELIOS_LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        orchestration.manage_csv_files,
        "manage_csv_files",
        lambda **kwargs: {
            "files_processed": 1,
            "files_standardized": 0,
            "duplicate_files_removed": 0,
            "manifest_records_updated": 1,
            "rows_processed": 1,
            "manifest_table": "ice_trade_blotter.file_manifest",
            "managed_files": [str(managed_path)],
        },
    )
    monkeypatch.setattr(
        orchestration.upsert_ice_trade_blotters,
        "run_import",
        lambda **kwargs: {
            "rows_processed": 1,
            "source_rows_read": 1,
            "duplicate_rows_dropped": 0,
            "files_processed": 1,
            "source_file": Path(kwargs["csv_filepath"]).name,
            "manifest_file": Path(kwargs["csv_filepath"]).name,
            "file_hash": "abc",
            "min_trade_date": "2026-07-06",
            "max_trade_date": "2026-07-06",
            "target_table": "ice_trade_blotter.ice_trade_blotter",
        },
    )
    monkeypatch.setattr(
        orchestration,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    exit_code = orchestration.main(database="stage_db")

    assert exit_code == 0
    assert len(telemetry) == 1
    assert telemetry[0]["provider"] == "ice_trade_blotter_local_file"
    assert telemetry[0]["pipeline_name"] == "ice_trade_blotters"
    assert telemetry[0]["operation_name"] == "ice_trade_blotters_manual_ingest"
    assert telemetry[0]["method"] == "LOCAL_FILE"
    assert telemetry[0]["target_table"] == "ice_trade_blotter.ice_trade_blotter"
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["rows_returned"] == 1
    assert telemetry[0]["rows_written"] == 1
    assert telemetry[0]["database"] == "stage_db"
    assert telemetry[0]["metadata"]["files_processed"] == 1


def test_legacy_cache_backfill_dry_run_parses_without_copy_or_upsert(
    monkeypatch,
    tmp_path,
):
    source_dir = tmp_path / "legacy"
    source_dir.mkdir()
    source_file = source_dir / "DealReport.xls"
    _write_html_xls(source_file, [_sample_values()])
    formatted_dir = tmp_path / "formatted"

    monkeypatch.setattr(
        backfill.upsert_ice_trade_blotters,
        "run_import",
        lambda **kwargs: pytest.fail("dry_run should not import"),
    )
    monkeypatch.setattr(
        backfill,
        "log_api_fetch",
        lambda **kwargs: pytest.fail("dry_run should not write telemetry"),
    )

    result = backfill.main(
        source_dir=source_dir,
        formatted_files_dir=formatted_dir,
        dry_run=True,
        database="stage_db",
    )

    assert result.status == "dry_run"
    assert result.files_discovered == 1
    assert result.files_copied == 0
    assert result.files_processed == 1
    assert result.rows_processed == 1
    assert result.rows_written == 0
    assert result.min_trade_date == "2026-07-06"
    assert result.max_trade_date == "2026-07-06"
    assert source_file.exists()
    assert not formatted_dir.exists()


def test_legacy_cache_backfill_copies_imports_and_logs(
    monkeypatch,
    tmp_path,
):
    source_dir = tmp_path / "legacy"
    source_dir.mkdir()
    source_file = source_dir / "DealReport.xls"
    _write_html_xls(source_file, [_sample_values()])
    formatted_dir = tmp_path / "formatted"
    manifest_records: list[dict[str, object]] = []
    imports: list[dict[str, object]] = []
    telemetry: list[dict[str, object]] = []

    monkeypatch.setattr(
        backfill.manage_csv_files,
        "_existing_manifest_record",
        lambda **kwargs: None,
    )
    monkeypatch.setattr(
        backfill.manage_csv_files,
        "_upsert_manifest",
        lambda records, **kwargs: manifest_records.extend(records),
    )

    def fake_run_import(**kwargs):
        imports.append(kwargs)
        return {
            "rows_processed": 1,
            "source_rows_read": 1,
            "duplicate_rows_dropped": 0,
            "files_processed": 1,
            "source_file": Path(kwargs["csv_filepath"]).name,
            "manifest_file": Path(kwargs["csv_filepath"]).name,
            "file_hash": "abc",
            "min_trade_date": "2026-07-06",
            "max_trade_date": "2026-07-06",
            "target_table": "ice_trade_blotter.ice_trade_blotter",
        }

    monkeypatch.setattr(
        backfill.upsert_ice_trade_blotters,
        "run_import",
        fake_run_import,
    )
    monkeypatch.setattr(
        backfill,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    result = backfill.main(
        source_dir=source_dir,
        formatted_files_dir=formatted_dir,
        database="stage_db",
    )

    assert result.status == "success"
    assert result.files_discovered == 1
    assert result.files_copied == 1
    assert result.files_skipped_existing == 0
    assert result.files_processed == 1
    assert result.rows_processed == 1
    assert result.rows_written == 1
    assert source_file.exists()
    assert len(manifest_records) == 1
    assert len(imports) == 1
    assert Path(imports[0]["csv_filepath"]).exists()
    assert Path(imports[0]["csv_filepath"]).parent == formatted_dir
    assert len(telemetry) == 1
    assert telemetry[0]["operation_name"] == "ice_trade_blotters_legacy_cache_backfill"
    assert telemetry[0]["provider"] == "ice_trade_blotter_local_file"
    assert telemetry[0]["method"] == "LOCAL_FILE"
    assert telemetry[0]["rows_returned"] == 1
    assert telemetry[0]["rows_written"] == 1
    assert telemetry[0]["database"] == "stage_db"
    assert telemetry[0]["metadata"]["files_copied"] == 1
