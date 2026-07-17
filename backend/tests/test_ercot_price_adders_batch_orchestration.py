from __future__ import annotations

from datetime import datetime

from backend.orchestration.power.ercot import price_adders_batch


def test_ercot_price_adders_batch_default_feeds():
    assert price_adders_batch.DEFAULT_FEEDS == (
        "rt_price_adders_sced",
        "rt_price_adders_15min",
    )
    assert price_adders_batch.DEFAULT_LOOKBACK_DAYS == 1


def test_ercot_price_adders_batch_returns_zero_when_all_feeds_succeed(monkeypatch):
    calls: list[tuple[str, datetime, datetime]] = []
    business_datetime = datetime(2026, 7, 16)

    class FakeModule:
        @staticmethod
        def main(start_date=None, end_date=None):
            calls.append(("fake", start_date, end_date))

    def fake_import_module(module_name):
        calls.append((module_name, None, None))
        return FakeModule

    monkeypatch.setattr(
        price_adders_batch.importlib,
        "import_module",
        fake_import_module,
    )

    assert (
        price_adders_batch.main(
            feed_names=("rt_price_adders_sced",),
            business_datetime=business_datetime,
        )
        == 0
    )
    assert calls == [
        ("backend.scrapes.power.ercot.rt_price_adders_sced", None, None),
        ("fake", business_datetime, business_datetime),
    ]


def test_ercot_price_adders_batch_returns_one_when_any_feed_fails(monkeypatch):
    business_datetime = datetime(2026, 7, 16)

    class FakeModule:
        @staticmethod
        def main(start_date=None, end_date=None):
            raise RuntimeError("boom")

    monkeypatch.setattr(
        price_adders_batch.importlib,
        "import_module",
        lambda module_name: FakeModule,
    )

    assert (
        price_adders_batch.main(
            feed_names=("rt_price_adders_sced",),
            business_datetime=business_datetime,
        )
        == 1
    )
