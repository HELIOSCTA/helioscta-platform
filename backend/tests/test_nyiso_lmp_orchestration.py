from __future__ import annotations

from datetime import date

import pandas as pd

from backend.orchestration.power.nyiso import (
    _lmp_readiness,
    _lmp_workflow,
    da_lmps,
    rt_lmps_prelim,
)
from backend.scrapes.power.nyiso import _lmp


def test_nyiso_lmp_event_key_and_expected_periods():
    assert (
        da_lmps._data_availability_event_key(date(2026, 8, 6))
        == (
            "nyiso_da_lmps:data_ready:2026-08-06:"
            "load_zones_plus_pjm_interface"
        )
    )
    assert da_lmps._expected_period_count_for_date(date(2026, 8, 6)) == 24
    assert da_lmps._expected_period_count_for_date(date(2026, 3, 8)) == 23
    assert da_lmps._expected_period_count_for_date(date(2026, 11, 1)) == 25
    assert rt_lmps_prelim._expected_period_count_for_date(date(2026, 8, 4)) == 288
    assert rt_lmps_prelim._expected_period_count_for_date(date(2026, 3, 8)) == 276
    assert rt_lmps_prelim._expected_period_count_for_date(date(2026, 11, 1)) == 300


def test_nyiso_lmp_scheduled_target_dates_use_eastern_market_date():
    now = pd.Timestamp("2026-08-05T13:00:00Z")

    assert da_lmps._target_operating_date(now=now) == date(2026, 8, 6)
    assert rt_lmps_prelim._target_operating_date(now=now) == date(2026, 8, 4)


def test_nyiso_da_lmps_emits_readiness_for_complete_default_nodes(monkeypatch):
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
            business_date=date(2026, 8, 6),
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
                "nyiso_da_lmps:data_ready:2026-08-06:"
                "load_zones_plus_pjm_interface"
            ),
            "created": True,
        }
    ]
    event = captured[0]
    assert event["dataset"] == "nyiso_da_lmps"
    assert event["source_system"] == "nyiso"
    assert event["availability_type"] == "data_ready"
    assert event["business_date"] == date(2026, 8, 6)
    assert event["scope"] == "load_zones_plus_pjm_interface"
    assert event["grain"] == "operating_date_hour_node"
    assert event["source_table"] == "nyiso.da_lmps"
    assert event["row_count"] == 288
    assert event["entity_count"] == 12
    assert event["period_count"] == 24
    assert event["completeness_status"] == "complete"
    assert event["run_id"] == "run-1"
    assert event["database"] == "stage_db"
    assert event["payload"]["expected_row_count"] == 288
    assert event["payload"]["expected_nodes"] == sorted(da_lmps.DEFAULT_NODES)
    assert event["payload"]["market_clock"] == "America/New_York"


def test_nyiso_da_main_passes_release_notification_handler(monkeypatch):
    captured: dict[str, object] = {}

    def fake_run_lmp_workflow(**kwargs):
        captured.update(kwargs)
        return pd.DataFrame()

    monkeypatch.setattr(_lmp_workflow, "run_lmp_workflow", fake_run_lmp_workflow)

    result = da_lmps.main(
        start_date=date(2026, 8, 6),
        end_date=date(2026, 8, 6),
        database="stage_db",
        run_mode="scheduled",
        poll_ceiling_seconds=0,
        poll_wait_seconds=0,
    )

    assert result is not None
    assert captured["release_notification_handler"] is (
        da_lmps._notify_da_email_release_events
    )


def test_nyiso_da_release_email_notifications_are_idempotent_and_sent(monkeypatch):
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
        "enqueue_nyiso_da_lmp_release_notifications",
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
                    "nyiso_da_lmps:data_ready:2026-08-06:"
                    "load_zones_plus_pjm_interface"
                ),
            }
        ],
        run_mode="scheduled",
        database="stage_db",
        run_logger=DummyRunLogger(),
    )

    assert queued == 1
    assert calls[0]["event"]["event_key"] == (
        "nyiso_da_lmps:data_ready:2026-08-06:"
        "load_zones_plus_pjm_interface"
    )
    assert calls[0]["database"] == "stage_db"


def test_nyiso_da_release_email_notifications_skip_outside_scheduled(monkeypatch):
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
        "enqueue_nyiso_da_lmp_release_notifications",
        fake_enqueue,
    )

    queued = da_lmps._notify_da_email_release_events(
        events=[
            {
                "id": 1,
                "event_key": (
                    "nyiso_da_lmps:data_ready:2026-08-06:"
                    "load_zones_plus_pjm_interface"
                ),
            }
        ],
        run_mode="smoke",
        database="stage_db",
        run_logger=DummyRunLogger(),
    )

    assert queued == 0
    assert called is False


def test_nyiso_rt_lmps_skips_readiness_when_a_zone_is_missing(monkeypatch):
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        _lmp_readiness,
        "emit_data_availability_event",
        lambda **kwargs: captured.append(kwargs),
    )

    events = rt_lmps_prelim._emit_data_availability_events(
        df=_availability_frame(
            business_date=date(2026, 8, 4),
            periods=288,
            interval_minutes=5,
            nodes=("N.Y.C.",),
        ),
        run_id="run-1",
        database="stage_db",
    )

    assert events == []
    assert captured == []


def test_nyiso_da_lmps_fetch_complete_market_day_suppresses_per_attempt_logs(
    monkeypatch,
):
    captured: dict[str, object] = {}

    def fake_pull(**kwargs):
        captured.update(kwargs)
        return _availability_frame(
            business_date=date(2026, 8, 6),
            periods=24,
            interval_minutes=60,
            nodes=da_lmps.DEFAULT_NODES,
        )

    monkeypatch.setattr(da_lmps.scrape, "_pull", fake_pull)

    df = da_lmps._fetch_complete_market_day(
        operating_date=date(2026, 8, 6),
        nodes=da_lmps.DEFAULT_NODES,
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "scheduled"},
    )

    assert len(df) == 288
    assert captured["operating_date"] == date(2026, 8, 6)
    assert captured["nodes"] == da_lmps.DEFAULT_NODES
    assert captured["run_id"] == "run-1"
    assert captured["database"] == "stage_db"
    assert captured["metadata"] == {"run_mode": "scheduled"}
    assert captured["log_fetch"] is False


def test_nyiso_da_lmps_wait_logs_one_resolved_poll_row(monkeypatch):
    logs: list[dict[str, object]] = []
    attempts = {"count": 0}

    def fake_fetch_complete_market_day(**kwargs):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise da_lmps.DataNotYetAvailable("not yet published")
        return _availability_frame(
            business_date=date(2026, 8, 6),
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
        operating_date=date(2026, 8, 6),
        nodes=da_lmps.DEFAULT_NODES,
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "scheduled"},
        poll_ceiling_seconds=60,
        poll_wait_seconds=1,
    )

    assert len(df) == 288
    assert attempts["count"] == 2
    assert len(logs) == 1
    log = logs[0]
    assert log["provider"] == "nyiso"
    assert log["pipeline_name"] == "nyiso_da_lmps"
    assert log["operation_name"] == "nyiso_da_lmps_poll"
    assert log["target_table"] == "nyiso.da_lmps"
    assert log["target_host"] == "mis.nyiso.com"
    assert log["target_path"] == "/public/csv/damlbmp/20260806damlbmp_zone.csv"
    assert log["status"] == "success"
    assert log["rows_returned"] == 288
    assert log["attempt"] == 2
    assert log["database"] == "stage_db"
    assert log["metadata"]["run_mode"] == "scheduled"
    assert log["metadata"]["target_operating_date"] == "2026-08-06"
    assert log["metadata"]["poll_count"] == 2
    assert log["metadata"]["api_family"] == "nyiso_mis_csv"
    assert log["metadata"]["expected_period_count"] == 24
    assert log["metadata"]["period_count"] == 24
    assert log["metadata"]["entity_count"] == 12


def test_nyiso_rt_fetch_complete_market_day_treats_404_as_not_available(
    monkeypatch,
):
    def fake_pull(**_kwargs):
        raise _lmp.NYISOMISDataNotAvailable("not found", status_code=404)

    monkeypatch.setattr(rt_lmps_prelim.scrape, "_pull", fake_pull)

    try:
        rt_lmps_prelim._fetch_complete_market_day(
            operating_date=date(2026, 8, 4),
            nodes=rt_lmps_prelim.DEFAULT_NODES,
            run_id="run-1",
            database="stage_db",
            metadata={"run_mode": "scheduled"},
        )
    except rt_lmps_prelim.DataNotYetAvailable as exc:
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
