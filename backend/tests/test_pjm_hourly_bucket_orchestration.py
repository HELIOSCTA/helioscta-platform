from __future__ import annotations

from types import SimpleNamespace

from backend.orchestration.power.pjm import hourly_bucket


def test_hourly_bucket_runs_default_unverified_feed_with_bucket_metadata(monkeypatch):
    captured: dict[str, dict[str, object]] = {}

    def fake_import_module(module_path: str):
        feed_name = module_path.rsplit(".", 1)[-1]

        def main(**kwargs):
            captured[feed_name] = kwargs
            return "ok"

        return SimpleNamespace(main=main)

    monkeypatch.setattr(hourly_bucket.importlib, "import_module", fake_import_module)

    result = hourly_bucket.main(database="stage_db", metadata={"trigger": "test"})

    assert result == 0
    assert set(captured) == {"rt_unverified_hrl_lmps", "gen_by_fuel"}
    assert captured["rt_unverified_hrl_lmps"] == {
        "database": "stage_db",
        "run_mode": "scheduled_hourly",
        "metadata": {
            "bucket": "pjm_hourly_bucket",
            "scheduler": "helios-pjm-hourly-bucket.timer",
            "schedule_reason": "hourly_pjm_bucket_refresh",
            "bucket_feed": "rt_unverified_hrl_lmps",
            "trigger": "test",
        },
    }
    assert captured["gen_by_fuel"] == {
        "database": "stage_db",
        "run_mode": "scheduled_hourly",
        "metadata": {
            "bucket": "pjm_hourly_bucket",
            "scheduler": "helios-pjm-hourly-bucket.timer",
            "schedule_reason": "hourly_pjm_bucket_refresh",
            "bucket_feed": "gen_by_fuel",
            "trigger": "test",
        },
    }


def test_hourly_bucket_continues_after_feed_failure(monkeypatch):
    calls: list[str] = []

    def fake_import_module(module_path: str):
        feed_name = module_path.rsplit(".", 1)[-1]

        def main():
            calls.append(feed_name)
            if feed_name == "bad_feed":
                raise RuntimeError("boom")

        return SimpleNamespace(main=main)

    monkeypatch.setattr(hourly_bucket.importlib, "import_module", fake_import_module)

    feeds = (
        hourly_bucket.HourlyFeed("good_feed", "backend.orchestration.power.pjm.good_feed"),
        hourly_bucket.HourlyFeed("bad_feed", "backend.orchestration.power.pjm.bad_feed"),
        hourly_bucket.HourlyFeed("later_feed", "backend.orchestration.power.pjm.later_feed"),
    )

    result = hourly_bucket.main(feeds=feeds)

    assert result == 1
    assert calls == ["good_feed", "bad_feed", "later_feed"]


def test_hourly_bucket_passes_only_supported_main_kwargs(monkeypatch):
    captured: dict[str, object] = {}

    def fake_import_module(module_path: str):
        def main(metadata):
            captured.update(metadata)

        return SimpleNamespace(main=main)

    monkeypatch.setattr(hourly_bucket.importlib, "import_module", fake_import_module)

    result = hourly_bucket.main(
        feeds=(
            hourly_bucket.HourlyFeed(
                "metadata_only",
                "backend.orchestration.power.pjm.metadata_only",
            ),
        ),
        database="ignored_db",
        run_mode="manual",
    )

    assert result == 0
    assert captured["bucket_feed"] == "metadata_only"
    assert captured["scheduler"] == "helios-pjm-hourly-bucket.timer"
