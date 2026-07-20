from __future__ import annotations

from datetime import date

import pandas as pd

from backend.orchestration.power.isone import da_hrl_lmps


def test_isone_da_hrl_lmps_scheduled_default_targets_next_operating_date():
    assert da_hrl_lmps.DEFAULT_LOOKAHEAD_DAYS == 1


def test_isone_da_hrl_lmps_expected_period_count_handles_normal_and_dst_days():
    assert da_hrl_lmps._expected_period_count_for_date(date(2026, 6, 13)) == 24
    assert da_hrl_lmps._expected_period_count_for_date(date(2026, 3, 8)) == 23
    assert da_hrl_lmps._expected_period_count_for_date(date(2026, 11, 1)) == 25


def test_isone_da_hrl_lmps_event_key():
    assert (
        da_hrl_lmps._data_availability_event_key(date(2026, 6, 13))
        == "isone_da_hrl_lmps:data_ready:2026-06-13:internal_hub"
    )


def test_isone_da_hrl_lmps_emits_readiness_event_for_complete_rows(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_emit_data_availability_event(**kwargs):
        captured.append(kwargs)
        return {"id": 1, "event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(
        da_hrl_lmps,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    events = da_hrl_lmps._emit_data_availability_events(
        df=_availability_frame(hours=24, locations=(4000,)),
        run_id="run-1",
        database="stage_db",
    )

    assert events == [
        {
            "id": 1,
            "event_key": "isone_da_hrl_lmps:data_ready:2026-06-13:internal_hub",
            "created": True,
        }
    ]
    event = captured[0]
    assert event["dataset"] == "isone_da_hrl_lmps"
    assert event["source_system"] == "isone"
    assert event["availability_type"] == "data_ready"
    assert event["business_date"] == date(2026, 6, 13)
    assert event["scope"] == "internal_hub"
    assert event["grain"] == "date_hour_location"
    assert event["source_table"] == "isone.da_hrl_lmps"
    assert event["row_count"] == 24
    assert event["entity_count"] == 1
    assert event["period_count"] == 24
    assert event["completeness_status"] == "complete"
    assert event["run_id"] == "run-1"
    assert event["database"] == "stage_db"
    assert event["payload"]["expected_period_count"] == 24
    assert event["payload"]["expected_row_count"] == 24


def test_isone_da_hrl_lmps_skips_readiness_event_for_incomplete_rows(monkeypatch):
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        da_hrl_lmps,
        "emit_data_availability_event",
        lambda **kwargs: captured.append(kwargs),
    )

    events = da_hrl_lmps._emit_data_availability_events(
        df=_availability_frame(hours=23, locations=(4000,)),
        run_id="run-1",
        database="stage_db",
    )

    assert events == []
    assert captured == []


def test_isone_da_release_email_notifications_are_idempotent_and_sent(monkeypatch):
    calls: list[dict[str, object]] = []

    class DummyRunLogger:
        def info(self, _msg: str) -> None:
            pass

        def exception(self, _msg: str) -> None:
            pass

    def fake_enqueue(**kwargs):
        calls.append(kwargs)
        return [{"created": True, "notification_key": "email-key"}]

    monkeypatch.setattr(
        da_hrl_lmps.email_notifications,
        "enqueue_da_lmp_release_notifications",
        fake_enqueue,
    )
    monkeypatch.setattr(
        da_hrl_lmps.email_notifications,
        "notifications_enabled",
        lambda: True,
    )
    monkeypatch.setattr(
        da_hrl_lmps.email_notifications,
        "send_due_email_notifications",
        lambda **kwargs: [{"status": "sent", **kwargs}],
    )

    queued = da_hrl_lmps._notify_da_email_release_events(
        events=[
            {
                "id": 1,
                "event_key": "isone_da_hrl_lmps:data_ready:2026-07-02:internal_hub",
            }
        ],
        run_mode="scheduled",
        database="stage_db",
        run_logger=DummyRunLogger(),
    )

    assert queued == 1
    assert calls[0]["iso"] == "isone"
    assert calls[0]["event"]["event_key"] == (
        "isone_da_hrl_lmps:data_ready:2026-07-02:internal_hub"
    )
    assert calls[0]["database"] == "stage_db"


def test_isone_da_release_email_notifications_skip_outside_scheduled(monkeypatch):
    called = False

    class DummyRunLogger:
        def info(self, _msg: str) -> None:
            pass

        def exception(self, _msg: str) -> None:
            pass

    def fake_enqueue(**_kwargs):
        nonlocal called
        called = True
        return []

    monkeypatch.setattr(
        da_hrl_lmps.email_notifications,
        "enqueue_da_lmp_release_notifications",
        fake_enqueue,
    )

    queued = da_hrl_lmps._notify_da_email_release_events(
        events=[
            {
                "id": 1,
                "event_key": "isone_da_hrl_lmps:data_ready:2026-07-02:internal_hub",
            }
        ],
        run_mode="backfill",
        database="stage_db",
        run_logger=DummyRunLogger(),
    )

    assert queued == 0
    assert called is False


def _availability_frame(hours: int, locations: tuple[int, ...]) -> pd.DataFrame:
    rows = []
    for hour in range(1, hours + 1):
        for location_id in locations:
            rows.append(
                {
                    "date": pd.Timestamp("2026-06-13").date(),
                    "hour_ending": hour,
                    "location_id": location_id,
                    "location_name": f"location-{location_id}",
                    "location_type": "HUB",
                    "locational_marginal_price": 25.0,
                }
            )
    return pd.DataFrame(rows)
