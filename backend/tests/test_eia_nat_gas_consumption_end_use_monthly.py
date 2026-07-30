from __future__ import annotations

from datetime import datetime

import pandas as pd

from backend.backfills.eia import (
    nat_gas_consumption_end_use_monthly as backfill,
)
from backend.orchestration.eia import (
    nat_gas_consumption_end_use_monthly as orchestration,
)
from backend.scrapes.eia import (
    nat_gas_consumption_end_use_monthly as scrape,
)


def test_nat_gas_consumption_target_contract():
    assert scrape.API_SCRAPE_NAME == "nat_gas_consumption_end_use_monthly"
    assert scrape.ROUTE == "natural-gas/cons/sum"
    assert scrape.TARGET_SCHEMA == "eia"
    assert scrape.TARGET_TABLE == "nat_gas_consumption_end_use_monthly"
    assert scrape.TARGET_TABLE_FQN == "eia.nat_gas_consumption_end_use_monthly"
    assert scrape.PRIMARY_KEY == ["report_month", "series"]
    assert scrape.TARGET_COLUMNS == [
        "report_month",
        "duoarea",
        "area_name",
        "product",
        "product_name",
        "process",
        "process_name",
        "series",
        "series_description",
        "value_mmcf",
        "units",
        "source_frequency",
        "source_period",
        "scrape_run_at_utc",
    ]


def test_nat_gas_consumption_format_month_and_deduplicates():
    df = scrape._format(
        pd.DataFrame(
            [
                {
                    "period": "2026-04",
                    "duoarea": "SVA",
                    "area-name": "USA-VA",
                    "product": "EPG0",
                    "product-name": "Natural Gas",
                    "process": "VEU",
                    "process-name": "Electric Power Consumption",
                    "series": "N3045VA2",
                    "series-description": "Virginia Natural Gas Deliveries to Electric Power Consumers (MMcf)",
                    "value": "20169",
                    "units": "MMCF",
                },
                {
                    "period": "2026-04",
                    "duoarea": "SVA",
                    "area-name": "USA-VA",
                    "product": "EPG0",
                    "product-name": "Natural Gas",
                    "process": "VEU",
                    "process-name": "Electric Power Consumption",
                    "series": "N3045VA2",
                    "series-description": "Virginia Natural Gas Deliveries to Electric Power Consumers (MMcf)",
                    "value": "20170",
                    "units": "MMCF",
                },
                {
                    "period": "2026-04",
                    "duoarea": "NUS",
                    "area-name": "U.S.",
                    "product": "EPG0",
                    "product-name": "Natural Gas",
                    "process": "VC0",
                    "process-name": "Total Consumption",
                    "series": "N9140US2",
                    "series-description": "U.S. Natural Gas Total Consumption (MMcf)",
                    "value": "2389299",
                    "units": "MMCF",
                },
            ]
        )
    )

    assert df[["report_month", "series", "duoarea", "process", "value_mmcf"]].to_dict(
        "records"
    ) == [
        {
            "report_month": pd.Timestamp("2026-04-01").date(),
            "series": "N3045VA2",
            "duoarea": "SVA",
            "process": "VEU",
            "value_mmcf": 20170.0,
        },
        {
            "report_month": pd.Timestamp("2026-04-01").date(),
            "series": "N9140US2",
            "duoarea": "NUS",
            "process": "VC0",
            "value_mmcf": 2389299.0,
        },
    ]
    assert df["source_frequency"].tolist() == ["monthly", "monthly"]


def test_nat_gas_consumption_pull_uses_eia_client_and_metadata(monkeypatch):
    captured: dict[str, object] = {}

    def fake_get_eia_v2_data(route, **kwargs):
        captured["route"] = route
        captured.update(kwargs)
        return [
            {
                "period": "2026-04",
                "duoarea": "NUS",
                "area-name": "U.S.",
                "process": "VC0",
                "series": "N9140US2",
                "value": "2389299",
                "units": "MMCF",
            }
        ]

    monkeypatch.setattr(scrape.credentials, "EIA_API_KEY", "key-1")
    monkeypatch.setattr(scrape.client, "get_eia_v2_data", fake_get_eia_v2_data)

    df = scrape._pull(
        start_month="2026-01",
        end_month="2026-04",
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert captured["route"] == "natural-gas/cons/sum"
    assert captured["api_key"] == "key-1"
    assert captured["frequency"] == "monthly"
    assert captured["start"] == "2026-01"
    assert captured["end"] == "2026-04"
    assert captured["pipeline_name"] == "nat_gas_consumption_end_use_monthly"
    assert captured["target_table"] == "eia.nat_gas_consumption_end_use_monthly"
    assert captured["database"] == "stage_db"
    assert captured["metadata"]["run_mode"] == "test"
    assert len(df) == 1


def test_nat_gas_consumption_orchestration_runs_successfully(monkeypatch):
    events: list[tuple[str, object]] = []
    df = pd.DataFrame(
        [
            {
                "report_month": pd.Timestamp("2026-04-01").date(),
                "duoarea": "NUS",
                "area_name": "U.S.",
                "product": "EPG0",
                "product_name": "Natural Gas",
                "process": "VC0",
                "process_name": "Total Consumption",
                "series": "N9140US2",
                "series_description": "U.S. Natural Gas Total Consumption (MMcf)",
                "value_mmcf": 2389299.0,
                "units": "MMCF",
                "source_frequency": "monthly",
                "source_period": "2026-04",
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
            "nat_gas_consumption_end_use_monthly completed; 1 rows processed.",
        )
        for event in events
    )


def test_nat_gas_consumption_resolves_two_month_lag_report_month_by_default():
    assert orchestration._resolve_target_month(
        target_month=None,
        end_month=None,
        now=datetime(2026, 7, 31, 15, 0),
    ) == pd.Timestamp("2026-05-01").date()


def test_nat_gas_consumption_scheduled_run_polls_for_target_month(monkeypatch):
    events: list[tuple[str, object]] = []
    calls: list[dict[str, object]] = []
    df = pd.DataFrame(
        [
            {
                "report_month": pd.Timestamp("2026-05-01").date(),
                "duoarea": "NUS",
                "area_name": "U.S.",
                "product": "EPG0",
                "product_name": "Natural Gas",
                "process": "VC0",
                "process_name": "Total Consumption",
                "series": "N9140US2",
                "series_description": "U.S. Natural Gas Total Consumption (MMcf)",
                "value_mmcf": 2389299.0,
                "units": "MMCF",
                "source_frequency": "monthly",
                "source_period": "2026-05",
                "scrape_run_at_utc": pd.Timestamp("2026-07-31 20:00:00+0000", tz="UTC"),
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
        target_month="2026-05",
        database="stage_db",
        poll_ceiling_seconds=60,
        poll_wait_seconds=0,
    )

    assert result is df
    assert len(calls) == 1
    assert calls[0]["metadata"]["poll_count"] == 1
    assert calls[0]["metadata"]["target_month"] == "2026-05-01"
    assert ("poll_log", "success") in events
    assert ("upsert", 1) in events


def test_nat_gas_consumption_release_day_guard_skips_early_weekday(monkeypatch):
    events: list[tuple[str, object]] = []
    calls: list[dict[str, object]] = []

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
    monkeypatch.setattr(orchestration.scrape, "_pull", lambda **kwargs: calls.append(kwargs))

    result = orchestration.main(
        database="stage_db",
        run_only_on_likely_release_day=True,
        now=datetime(2026, 7, 30, 15, 0),
    )

    assert result is None
    assert calls == []
    assert any(
        event
        == (
            "success",
            "nat_gas_consumption_end_use_monthly skipped; 0 rows processed.",
        )
        for event in events
    )


def test_nat_gas_consumption_backfill_dry_run():
    result = backfill.main(
        start_month="2026-01",
        end_month="2026-07",
        dry_run=True,
    )

    assert result.pipeline_name == "nat_gas_consumption_end_use_monthly"
    assert result.months_requested == 7
    assert result.rows_processed == 0
    assert result.status == "dry_run"


def test_nat_gas_consumption_backfill_chunks(monkeypatch):
    calls: list[dict] = []

    def fake_workflow_main(**kwargs):
        calls.append(kwargs)
        return pd.DataFrame([{"row": len(calls)}])

    monkeypatch.setattr(backfill.workflow, "main", fake_workflow_main)

    result = backfill.main(
        start_month="2020-01",
        end_month="2026-07",
        chunk_months=24,
        request_delay_seconds=0,
        database="stage_db",
    )

    assert result.rows_processed == 4
    assert [call["start_month"] for call in calls] == [
        "2020-01",
        "2022-01",
        "2024-01",
        "2026-01",
    ]
    assert [call["end_month"] for call in calls] == [
        "2021-12",
        "2023-12",
        "2025-12",
        "2026-07",
    ]
    assert calls[0]["metadata"]["backfill_chunk_end_month"] == "2021-12"
    assert calls[-1]["metadata"]["backfill_chunk_end_month"] == "2026-07"
