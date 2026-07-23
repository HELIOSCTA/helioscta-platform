from __future__ import annotations

import pandas as pd

from backend.orchestration.power.pjm import transmission_outages as orchestration
from backend.scrapes.power.pjm import transmission_outages


SAMPLE_TEXT = """TIMESTAMP:07-23-2026 13:18:27
----------------------------------------------------------------------------
The data has been provided to PJM Interconnection, L.LC. (PJM) by Transmission Owners.
----------------------------------------------------------------------------
DE-ENERGIZED EQUIPMENT                                                     |
----------------------------------------------------------------------------
ITEM   TICKET   FACILITY NAME                                              |
----------------------------------------------------------------------------
     1        0 BRKR INDIANRI 230 KV  INDIANRI 231 CB                      |
----------------------------------------------------------------------------
"""


def test_default_retention_is_seven_days():
    assert transmission_outages.DEFAULT_RETENTION_DAYS == 7


def test_parse_linesout_text_stores_one_raw_txt_file_row():
    ingested_at = pd.Timestamp("2026-07-23T19:20:00Z")

    df = transmission_outages.parse_linesout_text(
        SAMPLE_TEXT,
        ingested_at=ingested_at,
        source_content_type="application/zip",
        source_content_length=1234,
    )

    assert len(df) == 1
    row = df.iloc[0]
    assert row["source_report_timestamp"] == pd.Timestamp("2026-07-23 13:18:27")
    assert row["source_report_timezone"] == "America/New_York"
    assert row["source_file_sha256"] == transmission_outages._sha256_text(SAMPLE_TEXT)
    assert row["source_url"] == transmission_outages.LINESOUT_URL
    assert row["source_content_type"] == "application/zip"
    assert row["source_content_length"] == 1234
    assert row["source_line_count"] == len(SAMPLE_TEXT.splitlines())
    assert row["raw_text"] == SAMPLE_TEXT
    assert row["ingested_at"] == ingested_at
    assert list(df.columns) == transmission_outages.RAW_COLUMNS


def test_parse_linesout_text_returns_empty_for_edart_throttle_response():
    text = (
        "linesout.txt file requested by this IP Address has not been updated "
        "since your last successful attempt on 07/23/2026 13:20:19 "
        "(throttle 300 seconds)."
    )

    df = transmission_outages.parse_linesout_text(text)

    assert df.empty
    assert list(df.columns) == transmission_outages.RAW_COLUMNS


def test_validate_table_against_text_compares_raw_txt_file(monkeypatch):
    expected_df = transmission_outages.parse_linesout_text(SAMPLE_TEXT)
    row = expected_df.iloc[0].to_dict()

    def fake_execute_sql(query, params=None, database=None, fetch=False):
        assert "FROM pjm.transmission_outages_raw" in query
        assert params == (row["source_file_sha256"],)
        assert database == "stage_db"
        assert fetch is True
        return [
            {
                "source_report_timestamp": row["source_report_timestamp"],
                "source_report_timezone": row["source_report_timezone"],
                "source_file_sha256": row["source_file_sha256"],
                "source_url": row["source_url"],
                "source_content_type": row["source_content_type"],
                "source_content_length": row["source_content_length"],
                "source_line_count": row["source_line_count"],
                "raw_text": row["raw_text"],
            }
        ]

    monkeypatch.setattr(transmission_outages.db, "execute_sql", fake_execute_sql)

    result = transmission_outages.validate_table_against_text(
        SAMPLE_TEXT,
        database="stage_db",
    )

    assert result.ok
    assert result.source_files == 1
    assert result.table_files == 1
    assert result.raw_text_matches
    assert result.timestamp_matches
    assert result.line_count_matches


def test_orchestration_passes_run_mode_and_retention(monkeypatch):
    captured: dict[str, object] = {}
    expected = pd.DataFrame([{"source_file_sha256": "abc"}])

    def fake_main(**kwargs):
        captured.update(kwargs)
        return expected

    monkeypatch.setattr(orchestration.scrape, "main", fake_main)

    result = orchestration.main(
        database="stage_db",
        retention_days=30,
        run_mode="manual",
        validate_after_write=False,
        metadata={"source": "test"},
    )

    assert result is expected
    assert captured == {
        "database": "stage_db",
        "retention_days": 30,
        "validate_after_write": False,
        "metadata": {"run_mode": "manual", "source": "test"},
    }
