from __future__ import annotations

from datetime import datetime

import pandas as pd

from backend.backfills.eia import weekly_underground_storage as backfill
from backend.orchestration.eia import weekly_underground_storage as orchestration
from backend.scrapes.eia import weekly_underground_storage as scrape


def test_weekly_storage_target_contract():
    assert scrape.API_SCRAPE_NAME == "weekly_underground_storage"
    assert scrape.ROUTE == "natural-gas/stor/wkly"
    assert scrape.TARGET_SCHEMA == "eia"
    assert scrape.TARGET_TABLE == "weekly_underground_storage"
    assert scrape.TARGET_TABLE_FQN == "eia.weekly_underground_storage"
    assert scrape.PRIMARY_KEY == ["eia_week_ending", "series"]
    assert scrape.TARGET_COLUMNS == [
        "eia_week_ending",
        "duoarea",
        "area_name",
        "region",
        "product",
        "product_name",
        "process",
        "process_name",
        "series",
        "series_description",
        "value_bcf",
        "units",
        "source_frequency",
        "source_period",
        "scrape_run_at_utc",
    ]


def test_weekly_storage_format_extracts_region_and_deduplicates():
    df = scrape._format(
        pd.DataFrame(
            [
                {
                    "period": "2026-07-24",
                    "duoarea": "R31",
                    "area-name": "NA",
                    "product": "EPG0",
                    "product-name": "Natural Gas",
                    "process": "SWO",
                    "process-name": "Underground Storage - Working Gas",
                    "series": "NW2_EPG0_SWO_R31_BCF",
                    "series-description": "Weekly East Region Natural Gas Working Underground Storage (Billion Cubic Feet)",
                    "value": "654",
                    "units": "BCF",
                },
                {
                    "period": "2026-07-24",
                    "duoarea": "R31",
                    "area-name": "NA",
                    "product": "EPG0",
                    "product-name": "Natural Gas",
                    "process": "SWO",
                    "process-name": "Underground Storage - Working Gas",
                    "series": "NW2_EPG0_SWO_R31_BCF",
                    "series-description": "Weekly East Region Natural Gas Working Underground Storage (Billion Cubic Feet)",
                    "value": "655",
                    "units": "BCF",
                },
                {
                    "period": "2026-07-24",
                    "duoarea": "R33",
                    "area-name": "NA",
                    "product": "EPG0",
                    "product-name": "Natural Gas",
                    "process": "SNO",
                    "process-name": "Non-Salt Underground Storage - Working Gas",
                    "series": "NW2_EPG0_SNO_R33_BCF",
                    "series-description": "Weekly Nonsalt Region Natural Gas Working Underground Storage (Billion Cubic Feet)",
                    "value": "793",
                    "units": "BCF",
                },
            ]
        )
    )

    assert df[["eia_week_ending", "series", "region", "value_bcf"]].to_dict(
        "records"
    ) == [
        {
            "eia_week_ending": pd.Timestamp("2026-07-24").date(),
            "series": "NW2_EPG0_SNO_R33_BCF",
            "region": "Nonsalt",
            "value_bcf": 793.0,
        },
        {
            "eia_week_ending": pd.Timestamp("2026-07-24").date(),
            "series": "NW2_EPG0_SWO_R31_BCF",
            "region": "East",
            "value_bcf": 655.0,
        },
    ]
    assert df["source_frequency"].tolist() == ["weekly", "weekly"]


def test_weekly_storage_pull_uses_eia_client_and_metadata(monkeypatch):
    captured: dict[str, object] = {}

    def fake_get_eia_v2_data(route, **kwargs):
        captured["route"] = route
        captured.update(kwargs)
        return [
            {
                "period": "2026-07-24",
                "duoarea": "R31",
                "series": "NW2_EPG0_SWO_R31_BCF",
                "series-description": "Weekly East Region Natural Gas Working Underground Storage (Billion Cubic Feet)",
                "value": "654",
                "units": "BCF",
            }
        ]

    monkeypatch.setattr(scrape.credentials, "EIA_API_KEY", "key-1")
    monkeypatch.setattr(scrape.client, "get_eia_v2_data", fake_get_eia_v2_data)

    df = scrape._pull(
        start_date="2026-07-01",
        end_date="2026-07-30",
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert captured["route"] == "natural-gas/stor/wkly"
    assert captured["api_key"] == "key-1"
    assert captured["frequency"] == "weekly"
    assert captured["start"] == "2026-07-01"
    assert captured["end"] == "2026-07-30"
    assert captured["pipeline_name"] == "weekly_underground_storage"
    assert captured["target_table"] == "eia.weekly_underground_storage"
    assert captured["database"] == "stage_db"
    assert captured["metadata"]["run_mode"] == "test"
    assert len(df) == 1


def test_weekly_storage_orchestration_runs_successfully(monkeypatch):
    events: list[tuple[str, object]] = []
    df = pd.DataFrame(
        [
            {
                "eia_week_ending": pd.Timestamp("2026-07-24").date(),
                "duoarea": "R31",
                "area_name": "NA",
                "region": "East",
                "product": "EPG0",
                "product_name": "Natural Gas",
                "process": "SWO",
                "process_name": "Underground Storage - Working Gas",
                "series": "NW2_EPG0_SWO_R31_BCF",
                "series_description": "Weekly East Region Natural Gas Working Underground Storage (Billion Cubic Feet)",
                "value_bcf": 654.0,
                "units": "BCF",
                "source_frequency": "weekly",
                "source_period": "2026-07-24",
                "scrape_run_at_utc": pd.Timestamp("2026-07-30 14:00:00+0000", tz="UTC"),
            }
        ]
    )

    class FakeRunLogger:
        def header(self, value):
            events.append(("header", value))

        def info(self, value):
            events.append(("info", value))

        def section(self, value):
            events.append(("section", value))

        def success(self, value):
            events.append(("success", value))

        def exception(self, value):
            events.append(("exception", value))

    monkeypatch.setattr(
        orchestration.script_logging,
        "init_logging",
        lambda **kwargs: FakeRunLogger(),
    )
    monkeypatch.setattr(orchestration.script_logging, "close_logging", lambda: None)
    monkeypatch.setattr(orchestration.scrape, "_pull", lambda **kwargs: df)
    monkeypatch.setattr(
        orchestration.scrape,
        "_upsert",
        lambda **kwargs: events.append(("upsert", len(kwargs["df"]))),
    )

    result = orchestration.main(database="stage_db", run_mode="test")

    assert result is df
    assert ("upsert", 1) in events
    assert any(
        event == ("success", "weekly_underground_storage completed; 1 rows processed.")
        for event in events
    )


def test_weekly_storage_resolves_release_week_ending_by_default():
    assert orchestration._resolve_target_week_ending(
        target_week_ending=None,
        end_date=None,
        now=datetime(2026, 7, 30, 10, 30),
    ) == pd.Timestamp("2026-07-24").date()


def test_weekly_storage_scheduled_run_polls_for_complete_target(monkeypatch):
    events: list[tuple[str, object]] = []
    calls: list[dict[str, object]] = []
    target_week_ending = pd.Timestamp("2026-07-24").date()
    df = pd.DataFrame(
        [
            {
                "eia_week_ending": target_week_ending,
                "duoarea": f"R{index}",
                "area_name": "NA",
                "region": region,
                "product": "EPG0",
                "product_name": "Natural Gas",
                "process": "SWO",
                "process_name": "Underground Storage - Working Gas",
                "series": f"series-{index}",
                "series_description": f"Weekly {region} Natural Gas Storage",
                "value_bcf": 600.0 + index,
                "units": "BCF",
                "source_frequency": "weekly",
                "source_period": "2026-07-24",
                "scrape_run_at_utc": pd.Timestamp("2026-07-30 14:00:00+0000", tz="UTC"),
            }
            for index, region in enumerate(
                [
                    "East",
                    "Midwest",
                    "Mountain",
                    "Pacific",
                    "South Central",
                    "Salt",
                    "Nonsalt",
                    "Lower 48",
                ],
                start=1,
            )
        ]
    )

    class FakeRunLogger:
        def header(self, value):
            events.append(("header", value))

        def info(self, value):
            events.append(("info", value))

        def section(self, value):
            events.append(("section", value))

        def success(self, value):
            events.append(("success", value))

        def exception(self, value):
            events.append(("exception", value))

    def fake_pull(**kwargs):
        calls.append(kwargs)
        return df

    monkeypatch.setattr(
        orchestration.script_logging,
        "init_logging",
        lambda **kwargs: FakeRunLogger(),
    )
    monkeypatch.setattr(orchestration.script_logging, "close_logging", lambda: None)
    monkeypatch.setattr(orchestration.scrape, "_pull", fake_pull)
    monkeypatch.setattr(
        orchestration.scrape,
        "_upsert",
        lambda **kwargs: events.append(("upsert", len(kwargs["df"]))),
    )
    monkeypatch.setattr(
        orchestration._polling,
        "log_api_fetch",
        lambda **kwargs: events.append(("poll_log", kwargs["status"])),
    )

    result = orchestration.main(
        target_week_ending="2026-07-24",
        database="stage_db",
        poll_ceiling_seconds=60,
        poll_wait_seconds=0,
    )

    assert result is df
    assert len(calls) == 1
    assert calls[0]["metadata"]["poll_count"] == 1
    assert calls[0]["metadata"]["target_week_ending"] == "2026-07-24"
    assert ("poll_log", "success") in events
    assert ("upsert", 8) in events


def test_weekly_storage_backfill_dry_run():
    result = backfill.main(
        start_date="2026-01-01",
        end_date="2026-07-30",
        dry_run=True,
    )

    assert result.pipeline_name == "weekly_underground_storage"
    assert result.days_requested == 211
    assert result.rows_processed == 0
    assert result.status == "dry_run"


def test_weekly_storage_backfill_chunks(monkeypatch):
    calls: list[dict] = []

    def fake_workflow_main(**kwargs):
        calls.append(kwargs)
        return pd.DataFrame([{"row": len(calls)}])

    monkeypatch.setattr(backfill.workflow, "main", fake_workflow_main)

    result = backfill.main(
        start_date="2024-01-01",
        end_date="2026-07-30",
        chunk_days=365,
        request_delay_seconds=0,
        database="stage_db",
    )

    assert result.rows_processed == 3
    assert [call["start_date"] for call in calls] == [
        "2024-01-01",
        "2024-12-31",
        "2025-12-31",
    ]
    assert [call["end_date"] for call in calls] == [
        "2024-12-30",
        "2025-12-30",
        "2026-07-30",
    ]
    assert calls[0]["metadata"]["backfill_chunk_end_date"] == "2024-12-30"
    assert calls[-1]["metadata"]["backfill_chunk_end_date"] == "2026-07-30"
