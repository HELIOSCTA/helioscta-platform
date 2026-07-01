from __future__ import annotations

from datetime import date, datetime

import pandas as pd

from backend.orchestration.power.pjm import rt_hrl_lmps


def test_rt_hrl_orchestration_calls_scrape_with_post_publish_metadata(monkeypatch):
    captured: dict[str, object] = {}
    waited: dict[str, object] = {}
    notified: dict[str, object] = {}

    def fake_wait(**kwargs):
        waited.update(kwargs)
        return pd.DataFrame()

    def fake_main(**kwargs):
        captured.update(kwargs)

    def fake_emit(**kwargs):
        assert kwargs["target_date"] == date(2026, 6, 29)
        assert kwargs["database"] == "stage_db"
        return [{"id": 1, "event_key": "pjm_rt_hrl_lmps:data_ready:2026-06-29:hub"}]

    monkeypatch.setattr(
        rt_hrl_lmps,
        "_wait_for_available_market_day_logged",
        fake_wait,
    )
    monkeypatch.setattr(rt_hrl_lmps.scrape, "main", fake_main)
    monkeypatch.setattr(rt_hrl_lmps, "_emit_data_availability_events", fake_emit)
    monkeypatch.setattr(
        rt_hrl_lmps,
        "_notify_rt_release_events",
        lambda **kwargs: notified.update(kwargs),
    )

    result = rt_hrl_lmps.main(target_date="2026-06-29", database="stage_db")

    assert result == 0
    assert waited["target_date"] == date(2026, 6, 29)
    assert waited["database"] == "stage_db"
    assert waited["metadata"] == {
        "run_mode": "scheduled_post_publish",
        "scheduler": "helios-pjm-rt-hrl-lmps.timer",
        "schedule_reason": "poll_pjm_verified_rt_hourly_lmp_publication_window",
        "target_market_date": "2026-06-29",
        "poll_ceiling_seconds": 18000,
        "poll_wait_seconds": 300,
    }
    assert notified["events"] == [
        {"id": 1, "event_key": "pjm_rt_hrl_lmps:data_ready:2026-06-29:hub"}
    ]
    assert notified["run_mode"] == "scheduled_post_publish"
    assert notified["database"] == "stage_db"
    assert captured["database"] == "stage_db"
    assert captured["run_mode"] == "scheduled_post_publish"
    assert captured["metadata"] == {
        "scheduler": "helios-pjm-rt-hrl-lmps.timer",
        "schedule_reason": "poll_pjm_verified_rt_hourly_lmp_publication_window",
        "target_market_date": "2026-06-29",
        "poll_ceiling_seconds": 18000,
        "poll_wait_seconds": 300,
    }


def test_rt_hrl_orchestration_allows_metadata_override(monkeypatch):
    captured: dict[str, object] = {}

    def fake_main(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(
        rt_hrl_lmps,
        "_wait_for_available_market_day_logged",
        lambda **kwargs: pd.DataFrame(),
    )
    monkeypatch.setattr(rt_hrl_lmps.scrape, "main", fake_main)
    monkeypatch.setattr(rt_hrl_lmps, "_emit_data_availability_events", lambda **_: [])
    monkeypatch.setattr(rt_hrl_lmps, "_notify_rt_release_events", lambda **_: 0)

    rt_hrl_lmps.main(
        target_date=date(2026, 6, 29),
        database="stage_db",
        run_mode="manual",
        metadata={"manual_reason": "operator"},
    )

    assert captured["database"] == "stage_db"
    assert captured["run_mode"] == "manual"
    assert captured["metadata"] == {
        "scheduler": "helios-pjm-rt-hrl-lmps.timer",
        "schedule_reason": "poll_pjm_verified_rt_hourly_lmp_publication_window",
        "target_market_date": "2026-06-29",
        "poll_ceiling_seconds": 18000,
        "poll_wait_seconds": 300,
        "manual_reason": "operator",
    }


def test_rt_hrl_orchestration_default_target_skips_weekend(monkeypatch):
    class FakeDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 6, 29, 11, 30, tzinfo=tz)

    monkeypatch.setattr(rt_hrl_lmps, "datetime", FakeDatetime)

    assert rt_hrl_lmps._target_market_date() == date(2026, 6, 26)


def test_rt_hrl_market_day_shape_requires_complete_periods_and_unique_keys():
    rows = [
        {
            "datetime_beginning_utc": pd.Timestamp("2026-06-29 04:00"),
            "datetime_beginning_ept": pd.Timestamp("2026-06-29 00:00"),
            "pnode_id": 1,
            "pnode_name": "WESTERN HUB",
            "row_is_current": True,
            "version_nbr": 1,
        },
        {
            "datetime_beginning_utc": pd.Timestamp("2026-06-29 05:00"),
            "datetime_beginning_ept": pd.Timestamp("2026-06-29 01:00"),
            "pnode_id": 1,
            "pnode_name": "WESTERN HUB",
            "row_is_current": True,
            "version_nbr": 1,
        },
    ]

    shape = rt_hrl_lmps._market_day_shape(pd.DataFrame(rows), date(2026, 6, 29))

    assert shape["is_available"] is False
    assert shape["period_count"] == 2
    assert shape["expected_period_count"] == 24


def test_rt_hrl_event_key():
    assert (
        rt_hrl_lmps._data_availability_event_key(date(2026, 6, 30))
        == "pjm_rt_hrl_lmps:data_ready:2026-06-30:hub"
    )


def test_rt_hrl_emits_readiness_event_for_complete_target_date(monkeypatch):
    captured: dict[str, object] = {}

    def fake_emit(**kwargs):
        captured.update(kwargs)
        return {
            "id": 10,
            "event_key": kwargs["event_key"],
            "created": True,
        }

    monkeypatch.setattr(rt_hrl_lmps, "emit_data_availability_event", fake_emit)

    rows = []
    for hour in range(24):
        rows.append(
            {
                "datetime_beginning_utc": pd.Timestamp("2026-06-30 04:00")
                + pd.Timedelta(hours=hour),
                "datetime_beginning_ept": pd.Timestamp("2026-06-30 00:00")
                + pd.Timedelta(hours=hour),
                "pnode_id": 1,
                "pnode_name": "WESTERN HUB",
                "row_is_current": True,
                "version_nbr": 1,
            }
        )

    events = rt_hrl_lmps._emit_data_availability_events(
        df=pd.DataFrame(rows),
        target_date=date(2026, 6, 30),
        run_id="run-1",
        database="stage_db",
    )

    assert events == [
        {
            "id": 10,
            "event_key": "pjm_rt_hrl_lmps:data_ready:2026-06-30:hub",
            "created": True,
        }
    ]
    assert captured["dataset"] == "pjm_rt_hrl_lmps"
    assert captured["source_system"] == "pjm"
    assert captured["availability_type"] == "data_ready"
    assert captured["source_table"] == "pjm.rt_hrl_lmps"
    assert captured["row_count"] == 24
    assert captured["entity_count"] == 1
    assert captured["period_count"] == 24
    assert captured["completeness_status"] == "complete"
    assert captured["database"] == "stage_db"


def test_rt_hrl_skips_readiness_event_for_incomplete_target_date(monkeypatch):
    emitted = False

    def fake_emit(**_kwargs):
        nonlocal emitted
        emitted = True
        return {}

    monkeypatch.setattr(rt_hrl_lmps, "emit_data_availability_event", fake_emit)

    rows = [
        {
            "datetime_beginning_utc": pd.Timestamp("2026-06-30 04:00"),
            "datetime_beginning_ept": pd.Timestamp("2026-06-30 00:00"),
            "pnode_id": 1,
            "pnode_name": "WESTERN HUB",
            "row_is_current": True,
            "version_nbr": 1,
        }
    ]

    assert (
        rt_hrl_lmps._emit_data_availability_events(
            df=pd.DataFrame(rows),
            target_date=date(2026, 6, 30),
            run_id="run-1",
            database="stage_db",
        )
        == []
    )
    assert emitted is False


def test_rt_hrl_slack_notifications_are_idempotent_and_sent(monkeypatch):
    calls: list[dict[str, object]] = []

    monkeypatch.setattr(
        rt_hrl_lmps.slack_notifications,
        "build_pjm_rt_hrl_lmp_release_slack",
        lambda **kwargs: {
            "notification_key": f"{kwargs['event']['event_key']}:slack:release",
            "channel_id": "CPOWER",
            "channel_name": "#helios-alerts-power",
            "message_text": "message",
            "dataset": "pjm_rt_hrl_lmps",
            "source_event_key": kwargs["event"]["event_key"],
            "source_event_id": kwargs["event"]["id"],
            "payload": {},
        },
    )

    def fake_enqueue(**kwargs):
        calls.append(kwargs)
        return {"created": True}

    monkeypatch.setattr(
        rt_hrl_lmps.slack_notifications,
        "enqueue_slack_notification",
        fake_enqueue,
    )
    monkeypatch.setattr(
        rt_hrl_lmps.slack_notifications,
        "notifications_enabled",
        lambda: True,
    )
    monkeypatch.setattr(
        rt_hrl_lmps.slack_notifications,
        "send_due_slack_notifications",
        lambda **kwargs: [{"status": "sent", **kwargs}],
    )

    queued = rt_hrl_lmps._notify_rt_release_events(
        events=[
            {
                "id": 1,
                "event_key": "pjm_rt_hrl_lmps:data_ready:2026-06-30:hub",
            }
        ],
        run_mode=rt_hrl_lmps.DEFAULT_RUN_MODE,
        database="stage_db",
    )

    assert queued == 1
    assert calls[0]["notification_key"] == (
        "pjm_rt_hrl_lmps:data_ready:2026-06-30:hub:slack:release"
    )
    assert calls[0]["channel_id"] == "CPOWER"
    assert calls[0]["database"] == "stage_db"
