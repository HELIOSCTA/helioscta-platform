from __future__ import annotations

from datetime import datetime

import pandas as pd

from backend.backfills.eia import eia_930_daily_region_data as backfill
from backend.orchestration.eia import eia_930_daily_region_data as orchestration
from backend.scrapes.eia import eia_930_daily_region_data as scrape


def test_eia_930_daily_region_data_target_contract():
    assert scrape.API_SCRAPE_NAME == "eia_930_daily_region_data"
    assert scrape.ROUTE == "electricity/rto/daily-region-data"
    assert scrape.TARGET_SCHEMA == "eia"
    assert scrape.TARGET_TABLE == "eia_930_daily_region_data"
    assert scrape.TARGET_TABLE_FQN == "eia.eia_930_daily_region_data"
    assert scrape.PRIMARY_KEY == ["period", "respondent", "type", "timezone"]
    assert scrape.DEFAULT_TIMEZONES == (
        "Arizona",
        "Central",
        "Eastern",
        "Mountain",
        "Pacific",
    )
    assert scrape.DEFAULT_TYPES == ("D", "DF", "NG", "TI")
    assert scrape.TARGET_COLUMNS == [
        "period",
        "respondent",
        "respondent_name",
        "type",
        "type_name",
        "timezone",
        "timezone_description",
        "value",
        "value_units",
        "scrape_run_at_utc",
    ]
    assert len(scrape.TARGET_COLUMNS) == len(scrape.TARGET_DATA_TYPES)


def test_eia_930_daily_region_data_format_preserves_timezone_variants_and_deduplicates():
    df = scrape._format(
        pd.DataFrame(
            [
                {
                    "period": "2026-07-29",
                    "respondent": "PJM",
                    "respondent-name": "PJM Interconnection, LLC",
                    "type": "D",
                    "type-name": "Demand",
                    "timezone": "Eastern",
                    "timezone-description": "Eastern",
                    "value": "945682",
                    "value-units": "megawatthours",
                },
                {
                    "period": "2026-07-29",
                    "respondent": "PJM",
                    "respondent-name": "PJM Interconnection, LLC",
                    "type": "D",
                    "type-name": "Demand",
                    "timezone": "Central",
                    "timezone-description": "Central",
                    "value": "943111",
                    "value-units": "megawatthours",
                },
                {
                    "period": "2026-07-29",
                    "respondent": "PJM",
                    "respondent-name": "PJM Interconnection, LLC",
                    "type": "D",
                    "type-name": "Demand",
                    "timezone": "Central",
                    "value": "943112",
                    "value-units": "megawatthours",
                },
            ]
        )
    )

    assert df[["period", "respondent", "type", "timezone", "value"]].to_dict(
        "records"
    ) == [
        {
            "period": pd.Timestamp("2026-07-29").date(),
            "respondent": "PJM",
            "type": "D",
            "timezone": "Central",
            "value": 943112.0,
        },
        {
            "period": pd.Timestamp("2026-07-29").date(),
            "respondent": "PJM",
            "type": "D",
            "timezone": "Eastern",
            "value": 945682.0,
        },
    ]
    assert df["type_name"].tolist() == ["Demand", "Demand"]
    assert df["value_units"].tolist() == ["megawatthours", "megawatthours"]


def test_eia_930_daily_region_data_pull_uses_eia_client_and_metadata(monkeypatch):
    captured: dict[str, object] = {}

    def fake_get_eia_v2_data(route, **kwargs):
        captured["route"] = route
        captured.update(kwargs)
        return [
            {
                "period": "2026-07-29",
                "respondent": "PJM",
                "type": "D",
                "timezone": "Eastern",
                "value": "945682",
            }
        ]

    monkeypatch.setattr(scrape.credentials, "EIA_API_KEY", "key-1")
    monkeypatch.setattr(scrape.client, "get_eia_v2_data", fake_get_eia_v2_data)

    df = scrape._pull(
        start_date="2026-07-01",
        end_date="2026-07-29",
        timezones=("Eastern",),
        types=("D", "NG"),
        respondents=("PJM",),
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert captured["route"] == "electricity/rto/daily-region-data"
    assert captured["api_key"] == "key-1"
    assert captured["frequency"] == "daily"
    assert captured["start"] == "2026-07-01"
    assert captured["end"] == "2026-07-29"
    assert captured["facets"] == {
        "timezone": ("Eastern",),
        "type": ("D", "NG"),
        "respondent": ("PJM",),
    }
    assert captured["pipeline_name"] == "eia_930_daily_region_data"
    assert captured["target_table"] == "eia.eia_930_daily_region_data"
    assert captured["database"] == "stage_db"
    assert captured["metadata"]["run_mode"] == "test"
    assert captured["metadata"]["types"] == ["D", "NG"]
    assert captured["metadata"]["respondents"] == ["PJM"]
    assert len(df) == 1


def test_eia_930_daily_region_data_orchestration_runs_successfully(monkeypatch):
    events: list[tuple[str, object]] = []
    df = pd.DataFrame(
        [
            {
                "period": pd.Timestamp("2026-07-29").date(),
                "respondent": "PJM",
                "respondent_name": "PJM Interconnection, LLC",
                "type": "D",
                "type_name": "Demand",
                "timezone": "Eastern",
                "timezone_description": "Eastern",
                "value": 945682.0,
                "value_units": "megawatthours",
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
        event
        == (
            "success",
            "eia_930_daily_region_data completed; 1 rows processed.",
        )
        for event in events
    )


def test_eia_930_daily_region_data_resolves_prior_eastern_date_by_default():
    assert orchestration._resolve_target_date(
        target_date=None,
        end_date=None,
        now=datetime(2026, 7, 30, 7, 30),
    ) == pd.Timestamp("2026-07-29").date()


def test_eia_930_daily_region_data_scheduled_run_polls_until_target_available(
    monkeypatch,
):
    events: list[tuple[str, object]] = []
    calls: list[dict[str, object]] = []
    empty_df = pd.DataFrame(columns=scrape.TARGET_COLUMNS)
    df = pd.DataFrame(
        [
            {
                "period": pd.Timestamp("2026-07-29").date(),
                "respondent": "PJM",
                "respondent_name": "PJM Interconnection, LLC",
                "type": "D",
                "type_name": "Demand",
                "timezone": "Eastern",
                "timezone_description": "Eastern",
                "value": 945682.0,
                "value_units": "megawatthours",
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

    def fake_pull(**kwargs):
        calls.append(kwargs)
        return empty_df if len(calls) == 1 else df

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
        target_date="2026-07-29",
        database="stage_db",
        poll_ceiling_seconds=60,
        poll_wait_seconds=0,
    )

    assert result is df
    assert len(calls) == 2
    assert calls[0]["metadata"]["poll_count"] == 1
    assert calls[1]["metadata"]["poll_count"] == 2
    assert calls[1]["metadata"]["target_period"] == "2026-07-29"
    assert calls[1]["start_date"] == pd.Timestamp("2026-06-28").date()
    assert calls[1]["end_date"] == pd.Timestamp("2026-07-29").date()
    assert ("poll_log", "success") in events
    assert ("upsert", 1) in events


def test_eia_930_daily_region_data_backfill_dry_run():
    result = backfill.main(
        start_date="2026-07-01",
        end_date="2026-07-29",
        dry_run=True,
    )

    assert result.pipeline_name == "eia_930_daily_region_data"
    assert result.days_requested == 29
    assert result.rows_processed == 0
    assert result.status == "dry_run"


def test_eia_930_daily_region_data_backfill_chunks(monkeypatch):
    calls: list[dict] = []

    def fake_workflow_main(**kwargs):
        calls.append(kwargs)
        return pd.DataFrame([{"row": len(calls)}])

    monkeypatch.setattr(backfill.workflow, "main", fake_workflow_main)

    result = backfill.main(
        start_date="2026-06-01",
        end_date="2026-07-29",
        chunk_days=31,
        request_delay_seconds=0,
        database="stage_db",
        timezones=("Eastern",),
        types=("D",),
        respondents=("PJM",),
    )

    assert result.rows_processed == 2
    assert [call["start_date"] for call in calls] == [
        "2026-06-01",
        "2026-07-02",
    ]
    assert [call["end_date"] for call in calls] == [
        "2026-07-01",
        "2026-07-29",
    ]
    assert calls[0]["timezones"] == ("Eastern",)
    assert calls[0]["types"] == ("D",)
    assert calls[0]["respondents"] == ("PJM",)
    assert calls[0]["metadata"]["backfill_chunk_end_date"] == "2026-07-01"
    assert calls[1]["metadata"]["backfill_chunk_end_date"] == "2026-07-29"
