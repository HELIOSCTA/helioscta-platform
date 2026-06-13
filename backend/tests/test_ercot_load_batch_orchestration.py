from __future__ import annotations

from backend.orchestration.power.ercot import load_batch


def test_ercot_load_batch_default_feeds():
    assert load_batch.DEFAULT_FEEDS == (
        "actual_system_load",
        "seven_day_load_forecast",
    )


def test_ercot_load_batch_returns_zero_when_all_feeds_succeed(monkeypatch):
    captured: list[str] = []

    class FakeModule:
        @staticmethod
        def main():
            return None

    def fake_import_module(name: str):
        captured.append(name)
        return FakeModule()

    monkeypatch.setattr(load_batch.importlib, "import_module", fake_import_module)

    assert load_batch.main(feed_names=("actual_system_load", "seven_day_load_forecast")) == 0
    assert captured == [
        "backend.scrapes.power.ercot.actual_system_load",
        "backend.scrapes.power.ercot.seven_day_load_forecast",
    ]


def test_ercot_load_batch_returns_one_when_any_feed_fails(monkeypatch):
    class FakeModule:
        @staticmethod
        def main():
            raise RuntimeError("boom")

    monkeypatch.setattr(
        load_batch.importlib,
        "import_module",
        lambda _name: FakeModule(),
    )

    assert load_batch.main(feed_names=("actual_system_load",)) == 1
