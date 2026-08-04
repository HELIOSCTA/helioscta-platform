from __future__ import annotations

from datetime import date

import pandas as pd

from backend.orchestration.power.miso import (
    _lmp_readiness,
    _lmp_workflow,
    da_lmps,
    rt_lmps_final,
    rt_lmps_prelim,
)
from backend.scrapes.power.miso import _lmp


def test_miso_lmp_event_key_and_expected_periods():
    assert (
        da_lmps._data_availability_event_key(date(2026, 8, 4))
        == "miso_da_lmps:data_ready:2026-08-04:hubs_indiana_plus_ice"
    )
    assert da_lmps._expected_period_count_for_date(date(2026, 8, 4)) == 24
    assert da_lmps._expected_period_count_for_date(date(2026, 3, 8)) == 24
    assert da_lmps._expected_period_count_for_date(date(2026, 11, 1)) == 24


def test_miso_lmp_scheduled_target_dates():
    now = pd.Timestamp("2026-08-04T19:00:00Z")

    assert da_lmps._target_operating_date(now=now) == date(2026, 8, 5)
    assert rt_lmps_prelim._target_operating_date(now=now) == date(2026, 8, 3)
    assert rt_lmps_final._target_operating_date(now=now) == date(2026, 7, 30)


def test_miso_da_lmps_emits_readiness_for_complete_default_hubs(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_emit_data_availability_event(**kwargs):
        captured.append(kwargs)
        return {"id": 1, "event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(
        _lmp_readiness,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    events = da_lmps._emit_data_availability_events(
        df=_availability_frame(
            business_date=date(2026, 8, 4),
            periods=24,
            interval_minutes=60,
            nodes=da_lmps.DEFAULT_NODES,
        ),
        run_id="run-1",
        database="stage_db",
    )

    assert events == [
        {
            "id": 1,
            "event_key": (
                "miso_da_lmps:data_ready:2026-08-04:"
                "hubs_indiana_plus_ice"
            ),
            "created": True,
        }
    ]
    event = captured[0]
    assert event["dataset"] == "miso_da_lmps"
    assert event["source_system"] == "miso"
    assert event["availability_type"] == "data_ready"
    assert event["business_date"] == date(2026, 8, 4)
    assert event["scope"] == "hubs_indiana_plus_ice"
    assert event["grain"] == "operating_date_hour_node"
    assert event["source_table"] == "miso.da_lmps"
    assert event["row_count"] == 168
    assert event["entity_count"] == 7
    assert event["period_count"] == 24
    assert event["completeness_status"] == "complete"
    assert event["run_id"] == "run-1"
    assert event["database"] == "stage_db"
    assert event["payload"]["expected_row_count"] == 168
    assert event["payload"]["expected_nodes"] == sorted(da_lmps.DEFAULT_NODES)
    assert event["payload"]["market_clock"] == "fixed_est"


def test_miso_da_main_passes_release_notification_handler(monkeypatch):
    captured: dict[str, object] = {}

    def fake_run_lmp_workflow(**kwargs):
        captured.update(kwargs)
        return pd.DataFrame()

    monkeypatch.setattr(_lmp_workflow, "run_lmp_workflow", fake_run_lmp_workflow)

    result = da_lmps.main(
        start_date=date(2026, 8, 5),
        end_date=date(2026, 8, 5),
        database="stage_db",
        run_mode="scheduled",
        poll_ceiling_seconds=0,
        poll_wait_seconds=0,
    )

    assert result is not None
    assert captured["release_notification_handler"] is (
        da_lmps._notify_da_email_release_events
    )


def test_miso_da_release_email_notifications_are_idempotent_and_sent(monkeypatch):
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
        da_lmps.email_notifications,
        "enqueue_miso_da_lmp_release_notifications",
        fake_enqueue,
    )
    monkeypatch.setattr(
        da_lmps.email_notifications,
        "notifications_enabled",
        lambda: True,
    )
    monkeypatch.setattr(
        da_lmps.email_notifications,
        "send_due_email_notifications",
        lambda **kwargs: [{"status": "sent", **kwargs}],
    )

    queued = da_lmps._notify_da_email_release_events(
        events=[
            {
                "id": 1,
                "event_key": (
                    "miso_da_lmps:data_ready:2026-08-05:"
                    "hubs_indiana_plus_ice"
                ),
            }
        ],
        run_mode="scheduled",
        database="stage_db",
        run_logger=DummyRunLogger(),
    )

    assert queued == 1
    assert calls[0]["event"]["event_key"] == (
        "miso_da_lmps:data_ready:2026-08-05:hubs_indiana_plus_ice"
    )
    assert calls[0]["database"] == "stage_db"


def test_miso_da_release_email_notifications_skip_outside_scheduled(monkeypatch):
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
        da_lmps.email_notifications,
        "enqueue_miso_da_lmp_release_notifications",
        fake_enqueue,
    )

    queued = da_lmps._notify_da_email_release_events(
        events=[
            {
                "id": 1,
                "event_key": (
                    "miso_da_lmps:data_ready:2026-08-05:"
                    "hubs_indiana_plus_ice"
                ),
            }
        ],
        run_mode="smoke",
        database="stage_db",
        run_logger=DummyRunLogger(),
    )

    assert queued == 0
    assert called is False


def test_miso_rt_lmps_skips_readiness_when_a_hub_is_missing(monkeypatch):
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        _lmp_readiness,
        "emit_data_availability_event",
        lambda **kwargs: captured.append(kwargs),
    )

    events = rt_lmps_prelim._emit_data_availability_events(
        df=_availability_frame(
            business_date=date(2026, 8, 3),
            periods=24,
            interval_minutes=60,
            nodes=("INDIANA.HUB",),
        ),
        run_id="run-1",
        database="stage_db",
    )

    assert events == []
    assert captured == []


def test_miso_da_lmps_fetch_complete_market_day_suppresses_per_attempt_logs(
    monkeypatch,
):
    captured: dict[str, object] = {}

    def fake_pull(**kwargs):
        captured.update(kwargs)
        return _availability_frame(
            business_date=date(2026, 8, 5),
            periods=24,
            interval_minutes=60,
            nodes=da_lmps.DEFAULT_NODES,
        )

    monkeypatch.setattr(da_lmps.scrape, "_pull", fake_pull)

    df = da_lmps._fetch_complete_market_day(
        operating_date=date(2026, 8, 5),
        nodes=da_lmps.DEFAULT_NODES,
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "scheduled"},
    )

    assert len(df) == 168
    assert captured["operating_date"] == date(2026, 8, 5)
    assert captured["nodes"] == da_lmps.DEFAULT_NODES
    assert captured["run_id"] == "run-1"
    assert captured["database"] == "stage_db"
    assert captured["metadata"] == {"run_mode": "scheduled"}
    assert captured["log_fetch"] is False


def test_miso_da_lmps_wait_logs_one_resolved_poll_row(monkeypatch):
    logs: list[dict[str, object]] = []
    attempts = {"count": 0}

    def fake_fetch_complete_market_day(**kwargs):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise da_lmps.DataNotYetAvailable("not yet published")
        return _availability_frame(
            business_date=date(2026, 8, 5),
            periods=24,
            interval_minutes=60,
            nodes=da_lmps.DEFAULT_NODES,
        )

    monkeypatch.setattr(
        _lmp_workflow,
        "fetch_complete_market_day",
        fake_fetch_complete_market_day,
    )
    monkeypatch.setattr(_lmp_workflow.time, "sleep", lambda _seconds: None)
    monkeypatch.setattr(
        _lmp_workflow,
        "log_api_fetch",
        lambda **kwargs: logs.append(kwargs),
    )

    df = da_lmps._wait_for_complete_data_logged(
        operating_date=date(2026, 8, 5),
        nodes=da_lmps.DEFAULT_NODES,
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "scheduled"},
        poll_ceiling_seconds=60,
        poll_wait_seconds=1,
    )

    assert len(df) == 168
    assert attempts["count"] == 2
    assert len(logs) == 1
    log = logs[0]
    assert log["provider"] == "miso"
    assert log["pipeline_name"] == "miso_da_lmps"
    assert log["operation_name"] == "miso_da_lmps_poll"
    assert log["target_table"] == "miso.da_lmps"
    assert log["status"] == "success"
    assert log["rows_returned"] == 168
    assert log["attempt"] == 2
    assert log["database"] == "stage_db"
    assert log["metadata"]["run_mode"] == "scheduled"
    assert log["metadata"]["target_operating_date"] == "2026-08-05"
    assert log["metadata"]["poll_count"] == 2
    assert log["metadata"]["api_family"] == "data_exchange_pricing"
    assert log["metadata"]["expected_period_count"] == 24
    assert log["metadata"]["period_count"] == 24
    assert log["metadata"]["entity_count"] == 7


def test_miso_rt_final_fetch_complete_market_day_treats_404_as_not_available(
    monkeypatch,
):
    def fake_pull(**_kwargs):
        raise _lmp.data_exchange_client.MISODataNotAvailable(
            "not found",
            status_code=404,
        )

    monkeypatch.setattr(rt_lmps_final.scrape, "_pull", fake_pull)

    try:
        rt_lmps_final._fetch_complete_market_day(
            operating_date=date(2026, 7, 30),
            nodes=rt_lmps_final.DEFAULT_NODES,
            run_id="run-1",
            database="stage_db",
            metadata={"run_mode": "scheduled"},
        )
    except rt_lmps_final.DataNotYetAvailable as exc:
        assert "not found" in str(exc)
    else:
        raise AssertionError("expected DataNotYetAvailable")


def _availability_frame(
    *,
    business_date: date,
    periods: int,
    interval_minutes: int,
    nodes: tuple[str, ...],
) -> pd.DataFrame:
    start_utc, _end_utc = _lmp.market_day_window_utc(business_date)
    rows = []
    for period in range(periods):
        interval_start = start_utc + pd.Timedelta(minutes=interval_minutes * period)
        for node in nodes:
            rows.append(
                {
                    "operating_date": business_date,
                    "interval_start_time_utc": interval_start,
                    "node_id": node,
                    "locational_marginal_price": 25.0,
                }
            )
    return pd.DataFrame(rows)
