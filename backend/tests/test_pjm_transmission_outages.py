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
    14  1215367 XFMR CUMB PL  230 KV  CUMB PL  3        XFORMER            |
----------------------------------------------------------------------------
"""

SCHEDULED_TEXT = """TIMESTAMP:07-23-2026 13:18:27
----------------------------------------------------------------------------
SCHEDULED OUTAGES (OUTAGE REQUEST RECEIVED BY PJM DISPATCHING PERSONNEL)                    OPEN/CLOSED---| (. . . . outage type . . . )                    APPROVAL
ITEM   TICKET   ZONE/CO  FACILITY_NAME                                     START_DATE TIME    END_DATE  TIME  | (. . . . c a u s e s . . . )  RTEP      AVAIL   RISK     PREV_STATUS ON_TIME LAST_EVALUATED
                                                                                                                DATE_LOG
                                                                                                                (START_DATE TIME    END_DATE    TIME    TIMESTAMP)
                                                                                                                HISTORY_LOG
                                                                                                                (STATUS       TIMESTAMP)
+-----+--------+--------+------------------------------------------------+-----------------+-----------------+-+---------+-----------------+---------+---------+--------+---------+---+-----------------+
     1   724453 FEPA     BRKR MANSFIEL 345 KV  MANSFIEL D42          DIS  19-NOV-2017 1000  01-NOV-2027 1600  O  Active   10/27/2024 07:19            Duration   No      Submitted No                   |
                FEPA     BRKR MANSFIEL 345 KV  MANSFIEL D43          CB   19-NOV-2017 1000  01-NOV-2027 1600  O (Continuous                )
                FEPA     BRKR MANSFIEL 345 KV  MANSFIEL D41          CB   19-NOV-2017 1000  01-NOV-2027 1600  O (Maintenance: Inspection / General Maintenance     )
                                                                                                                (19-NOV-2017 1000   01-NOV-2027 1600    11/01/2021 21:28)
                                                                                                                (Active       11/19/2017 11:16)
+-----+--------+--------+------------------------------------------------+-----------------+-----------------+-+---------+-----------------+---------+---------+--------+---------+---+-----------------+
"""


def test_parse_linesout_text_preserves_report_columns_and_raw_line():
    ingested_at = pd.Timestamp("2026-07-23T19:20:00Z")

    df = transmission_outages.parse_linesout_text(
        SAMPLE_TEXT,
        ingested_at=ingested_at,
    )

    assert len(df) == 2
    assert df["source_section"].tolist() == [
        "DE-ENERGIZED EQUIPMENT",
        "DE-ENERGIZED EQUIPMENT",
    ]
    assert df["source_report_timestamp"].iloc[0] == pd.Timestamp(
        "2026-07-23 13:18:27"
    )
    assert df["source_report_timezone"].iloc[0] == "America/New_York"
    assert df["source_columns"].iloc[0] == {
        "ITEM": "1",
        "TICKET": "0",
        "FACILITY NAME": "BRKR INDIANRI 230 KV  INDIANRI 231 CB",
    }
    assert df["record_kind"].iloc[0] == "deenergized_equipment"
    assert df["item_number"].iloc[0] == 1
    assert df["ticket_id"].iloc[0] == 0
    assert df["facility_name"].iloc[0] == "BRKR INDIANRI 230 KV  INDIANRI 231 CB"
    assert df["equipment_type"].iloc[0] == "BRKR"
    assert df["station"].iloc[0] == "INDIANRI"
    assert df["voltage_kv"].iloc[0] == 230.0
    assert df["equipment_count"].iloc[0] == 1
    assert df["source_columns"].iloc[1]["TICKET"] == "1215367"
    assert df["raw_line"].iloc[0].endswith("|")
    assert df["raw_record_text"].iloc[0] == df["raw_line"].iloc[0]
    assert df["ingested_at"].iloc[0] == ingested_at


def test_parse_linesout_text_parses_scheduled_outage_records():
    df = transmission_outages.parse_linesout_text(SCHEDULED_TEXT)

    assert len(df) == 1
    row = df.iloc[0]
    assert row["source_section"] == "SCHEDULED OUTAGES"
    assert row["record_kind"] == "transmission_outage"
    assert row["item_number"] == 1
    assert row["ticket_id"] == 724453
    assert row["zone_company"] == "FEPA"
    assert row["facility_name"] == "BRKR MANSFIEL 345 KV  MANSFIEL D42          DIS"
    assert row["equipment_type"] == "BRKR"
    assert row["station"] == "MANSFIEL"
    assert row["voltage_kv"] == 345.0
    assert row["start_datetime"] == pd.Timestamp("2017-11-19 10:00:00")
    assert row["end_datetime"] == pd.Timestamp("2027-11-01 16:00:00")
    assert row["status"] == "O"
    assert row["outage_state"] == "Active"
    assert row["last_revised"] == pd.Timestamp("2024-10-27 07:19:00")
    assert row["availability"] == "Duration"
    assert row["risk"] == "No"
    assert row["approval_status"] == "Submitted"
    assert row["on_time"] == "No"
    assert row["equipment_count"] == 3
    assert row["cause"] == "Maintenance: Inspection / General Maintenance"
    assert len(row["equipment_rows"]) == 3
    assert row["equipment_rows"][1]["OUTAGE_TYPE"] == "Continuous"
    assert len(row["date_log"]) == 1
    assert row["date_log"][0]["TIMESTAMP"] == "11/01/2021 21:28"
    assert row["history_log"] == [
        {"STATUS": "Active", "TIMESTAMP": "11/19/2017 11:16"}
    ]
    assert row["source_columns"]["ZONE/CO"] == "FEPA"
    assert row["source_columns"]["CAUSES"] == (
        "Maintenance: Inspection / General Maintenance"
    )
    assert "ITEM   TICKET" not in row["raw_record_text"]


def test_parse_linesout_text_returns_empty_for_edart_throttle_response():
    text = (
        "linesout.txt file requested by this IP Address has not been updated "
        "since your last successful attempt on 07/23/2026 13:20:19 "
        "(throttle 300 seconds)."
    )

    df = transmission_outages.parse_linesout_text(text)

    assert df.empty
    assert list(df.columns) == transmission_outages.RAW_COLUMNS


def test_parse_linesout_text_does_not_emit_headers_or_raw_line_fallbacks():
    df = transmission_outages.parse_linesout_text(SCHEDULED_TEXT)

    assert len(df) == 1
    assert not any("RAW LINE" in value for value in df["source_columns"])
    assert not df["raw_line"].str.contains("ITEM   TICKET", regex=False).any()
    assert not df["raw_line"].str.startswith("+-----+").any()


def test_validate_table_against_text_compares_row_hashes(monkeypatch):
    expected_df = transmission_outages.parse_linesout_text(SAMPLE_TEXT)
    rows = expected_df[
        [column for column in transmission_outages.RAW_COLUMNS if column != "ingested_at"]
    ].to_dict(orient="records")

    def fake_execute_sql(query, params=None, database=None, fetch=False):
        assert "FROM pjm.transmission_outages_raw" in query
        assert params == (expected_df["source_file_sha256"].iloc[0],)
        assert database == "stage_db"
        assert fetch is True
        return rows

    monkeypatch.setattr(transmission_outages.db, "execute_sql", fake_execute_sql)

    result = transmission_outages.validate_table_against_text(
        SAMPLE_TEXT,
        database="stage_db",
    )

    assert result.ok
    assert result.source_rows == 2
    assert result.table_rows == 2


def test_orchestration_passes_run_mode_and_retention(monkeypatch):
    captured: dict[str, object] = {}
    expected = pd.DataFrame([{"source_row_number": 1}])

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
