from __future__ import annotations

from backend.orchestration.power.ercot import outage_capacity_batch


def test_ercot_outage_capacity_batch_default_feeds():
    assert outage_capacity_batch.DEFAULT_FEEDS == ("hourly_resource_outage_capacity",)


def test_ercot_outage_capacity_batch_returns_zero_when_all_feeds_succeed(monkeypatch):
    captured: list[str] = []

    class FakeModule:
        @staticmethod
        def main():
            return None

    def fake_import_module(name: str):
        captured.append(name)
        return FakeModule()

    monkeypatch.setattr(
        outage_capacity_batch.importlib,
        "import_module",
        fake_import_module,
    )

    assert outage_capacity_batch.main(feed_names=("hourly_resource_outage_capacity",)) == 0
    assert captured == [
        "backend.scrapes.power.ercot.hourly_resource_outage_capacity",
    ]


def test_ercot_outage_capacity_batch_returns_one_when_any_feed_fails(monkeypatch):
    class FakeModule:
        @staticmethod
        def main():
            raise RuntimeError("boom")

    monkeypatch.setattr(
        outage_capacity_batch.importlib,
        "import_module",
        lambda _name: FakeModule(),
    )

    assert outage_capacity_batch.main(feed_names=("hourly_resource_outage_capacity",)) == 1
