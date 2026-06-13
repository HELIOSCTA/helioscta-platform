from __future__ import annotations

from datetime import datetime

from backend.orchestration.power.ercot import renewables_5min_batch


def test_ercot_renewables_5min_batch_default_feeds():
    assert renewables_5min_batch.DEFAULT_FEEDS == (
        "wind_power_actual_5min",
        "solar_power_actual_5min",
    )


def test_ercot_renewables_5min_batch_passes_window_to_feeds(monkeypatch):
    captured: list[tuple[str, datetime, datetime]] = []

    class FakeModule:
        @staticmethod
        def main(start_date: datetime, end_date: datetime):
            captured.append(("feed", start_date, end_date))

    monkeypatch.setattr(
        renewables_5min_batch.importlib,
        "import_module",
        lambda _name: FakeModule(),
    )

    start_date = datetime(2026, 6, 12)
    end_date = datetime(2026, 6, 12)

    assert renewables_5min_batch.main(
        feed_names=("wind_power_actual_5min",),
        start_date=start_date,
        end_date=end_date,
    ) == 0
    assert captured == [("feed", start_date, end_date)]


def test_ercot_renewables_5min_batch_returns_one_when_any_feed_fails(monkeypatch):
    class FakeModule:
        @staticmethod
        def main(start_date: datetime, end_date: datetime):
            raise RuntimeError("boom")

    monkeypatch.setattr(
        renewables_5min_batch.importlib,
        "import_module",
        lambda _name: FakeModule(),
    )

    assert renewables_5min_batch.main(feed_names=("wind_power_actual_5min",)) == 1
