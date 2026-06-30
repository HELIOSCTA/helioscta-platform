from __future__ import annotations

from backend.orchestration.power.pjm import rt_hrl_lmps


def test_rt_hrl_orchestration_calls_scrape_with_post_publish_metadata(monkeypatch):
    captured: dict[str, object] = {}

    def fake_main(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(rt_hrl_lmps.scrape, "main", fake_main)

    result = rt_hrl_lmps.main()

    assert result == 0
    assert captured["run_mode"] == "scheduled_post_publish"
    assert captured["metadata"] == {
        "scheduler": "helios-pjm-rt-hrl-lmps.timer",
        "schedule_reason": "post_pjm_verified_rt_hourly_lmp_publication_window",
    }


def test_rt_hrl_orchestration_allows_metadata_override(monkeypatch):
    captured: dict[str, object] = {}

    def fake_main(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(rt_hrl_lmps.scrape, "main", fake_main)

    rt_hrl_lmps.main(
        database="stage_db",
        run_mode="manual",
        metadata={"manual_reason": "operator"},
    )

    assert captured["database"] == "stage_db"
    assert captured["run_mode"] == "manual"
    assert captured["metadata"] == {
        "scheduler": "helios-pjm-rt-hrl-lmps.timer",
        "schedule_reason": "post_pjm_verified_rt_hourly_lmp_publication_window",
        "manual_reason": "operator",
    }
