from __future__ import annotations

import pandas as pd

from backend.orchestration.power.miso import real_time_total_load


def test_miso_real_time_total_load_orchestration_runs_successfully(monkeypatch):
    events: list[tuple[str, object]] = []
    df = pd.DataFrame(
        [
            {
                "operating_date": pd.Timestamp("2026-06-13").date(),
                "series": "five_min_total_load",
                "period_label": "20:25",
                "hour_ending": None,
                "interval_start": pd.Timestamp("2026-06-13 20:25:00"),
                "load_mw": 88359.0,
                "source_ref_id": "13-Jun-2026 - Interval 20:25 EST",
                "source_interval_start": pd.Timestamp("2026-06-13 20:25:00"),
            }
        ]
    )

    class FakeRunLogger:
        log_file_path = None

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
        real_time_total_load.script_logging,
        "init_logging",
        lambda **kwargs: FakeRunLogger(),
    )
    monkeypatch.setattr(real_time_total_load.script_logging, "close_logging", lambda: None)
    monkeypatch.setattr(
        real_time_total_load.scrape,
        "_pull",
        lambda **kwargs: df,
    )
    monkeypatch.setattr(
        real_time_total_load.scrape,
        "_upsert",
        lambda **kwargs: events.append(("upsert", len(kwargs["df"]))),
    )

    result = real_time_total_load.main(database="stage_db", run_mode="test")

    assert result is df
    assert ("upsert", 1) in events
    assert any(
        event == ("success", "real_time_total_load completed; 1 rows processed.")
        for event in events
    )
