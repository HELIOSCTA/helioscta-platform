from __future__ import annotations

from backend.orchestration.power.ercot import congestion_batch


def test_ercot_congestion_batch_default_feeds():
    assert congestion_batch.DEFAULT_FEEDS == (
        "dam_shadow_prices",
        "sced_shadow_prices",
    )


def test_ercot_congestion_batch_returns_zero_when_all_feeds_succeed(monkeypatch):
    captured: list[str] = []

    class FakeModule:
        @staticmethod
        def main():
            return None

    def fake_import_module(name: str):
        captured.append(name)
        return FakeModule()

    monkeypatch.setattr(congestion_batch.importlib, "import_module", fake_import_module)

    assert congestion_batch.main(feed_names=("dam_shadow_prices", "sced_shadow_prices")) == 0
    assert captured == [
        "backend.scrapes.power.ercot.dam_shadow_prices",
        "backend.scrapes.power.ercot.sced_shadow_prices",
    ]


def test_ercot_congestion_batch_returns_one_when_any_feed_fails(monkeypatch):
    class FakeModule:
        @staticmethod
        def main():
            raise RuntimeError("boom")

    monkeypatch.setattr(
        congestion_batch.importlib,
        "import_module",
        lambda _name: FakeModule(),
    )

    assert congestion_batch.main(feed_names=("dam_shadow_prices",)) == 1
