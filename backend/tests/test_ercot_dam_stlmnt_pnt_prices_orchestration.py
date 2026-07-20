from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from backend.orchestration.power.ercot import dam_stlmnt_pnt_prices


def test_ercot_dam_spp_scheduled_default_targets_next_delivery_date():
    assert dam_stlmnt_pnt_prices.DEFAULT_LOOKAHEAD_DAYS == 1


def test_ercot_dam_spp_expected_period_count_handles_normal_and_dst_days():
    assert dam_stlmnt_pnt_prices._expected_period_count_for_date(date(2026, 6, 13)) == 24
    assert dam_stlmnt_pnt_prices._expected_period_count_for_date(date(2026, 3, 8)) == 23
    assert dam_stlmnt_pnt_prices._expected_period_count_for_date(date(2026, 11, 1)) == 25


def test_ercot_dam_spp_event_key():
    assert (
        dam_stlmnt_pnt_prices._data_availability_event_key(date(2026, 6, 13))
        == "ercot_dam_stlmnt_pnt_prices:data_ready:2026-06-13:hub"
    )


def test_ercot_dam_spp_emits_readiness_event_for_complete_hub_rows(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_emit_data_availability_event(**kwargs):
        captured.append(kwargs)
        return {"id": 1, "event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(
        dam_stlmnt_pnt_prices,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    events = dam_stlmnt_pnt_prices._emit_data_availability_events(
        df=_dam_spp_availability_frame(hours=24),
        run_id="run-1",
        database="stage_db",
    )

    assert events == [
        {
            "id": 1,
            "event_key": "ercot_dam_stlmnt_pnt_prices:data_ready:2026-06-13:hub",
            "created": True,
        }
    ]
    event = captured[0]
    assert event["dataset"] == "ercot_dam_stlmnt_pnt_prices"
    assert event["source_system"] == "ercot"
    assert event["availability_type"] == "data_ready"
    assert event["business_date"] == date(2026, 6, 13)
    assert event["scope"] == "hub"
    assert event["grain"] == "date_hour_settlementpoint"
    assert event["source_table"] == "ercot.dam_stlmnt_pnt_prices"
    assert event["row_count"] == 96
    assert event["entity_count"] == 4
    assert event["period_count"] == 24
    assert event["completeness_status"] == "complete"
    assert event["run_id"] == "run-1"
    assert event["database"] == "stage_db"
    assert event["payload"]["expected_period_count"] == 24
    assert event["payload"]["expected_entity_count"] == 4
    assert event["payload"]["expected_row_count"] == 96
    assert event["payload"]["settlement_points"] == [
        "HB_HOUSTON",
        "HB_NORTH",
        "HB_SOUTH",
        "HB_WEST",
    ]


def test_ercot_dam_spp_skips_readiness_event_for_incomplete_rows(monkeypatch):
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        dam_stlmnt_pnt_prices,
        "emit_data_availability_event",
        lambda **kwargs: captured.append(kwargs),
    )

    events = dam_stlmnt_pnt_prices._emit_data_availability_events(
        df=_dam_spp_availability_frame(hours=23),
        run_id="run-1",
        database="stage_db",
    )

    assert events == []
    assert captured == []


def test_ercot_dam_spp_fetch_complete_market_day_rejects_incomplete_rows(monkeypatch):
    monkeypatch.setattr(
        dam_stlmnt_pnt_prices.scrape,
        "_pull",
        lambda **_kwargs: _dam_spp_availability_frame(hours=23),
    )

    with pytest.raises(dam_stlmnt_pnt_prices.DataNotYetAvailable):
        dam_stlmnt_pnt_prices._fetch_complete_market_day(
            delivery_date=date(2026, 6, 13),
            settlement_points=dam_stlmnt_pnt_prices.DEFAULT_SETTLEMENT_POINTS,
            run_id="run-1",
            database="stage_db",
            metadata={"run_mode": "scheduled"},
        )


def test_ercot_dam_spp_wait_retries_until_complete_and_logs_result(monkeypatch):
    complete = _dam_spp_availability_frame(hours=24)
    calls = {"count": 0}
    telemetry: list[dict[str, object]] = []
    sleeps: list[float] = []

    def fake_fetch_complete_market_day(**_kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise dam_stlmnt_pnt_prices.DataNotYetAvailable("not yet published")
        return complete

    monkeypatch.setattr(
        dam_stlmnt_pnt_prices,
        "_fetch_complete_market_day",
        fake_fetch_complete_market_day,
    )
    monkeypatch.setattr(dam_stlmnt_pnt_prices.time, "sleep", sleeps.append)
    monkeypatch.setattr(
        dam_stlmnt_pnt_prices,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    result = dam_stlmnt_pnt_prices._wait_for_complete_data_logged(
        delivery_date=date(2026, 6, 13),
        settlement_points=dam_stlmnt_pnt_prices.DEFAULT_SETTLEMENT_POINTS,
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "scheduled"},
        poll_ceiling_seconds=60,
        poll_wait_seconds=5,
    )

    assert result is complete
    assert calls["count"] == 2
    assert sleeps == [5]
    assert len(telemetry) == 1
    assert telemetry[0]["provider"] == "ercot"
    assert telemetry[0]["operation_name"] == "dam_stlmnt_pnt_prices_poll"
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["attempt"] == 2
    assert telemetry[0]["rows_returned"] == 96
    assert telemetry[0]["metadata"]["target_delivery_date"] == "2026-06-13"


def test_ercot_dam_release_email_notifications_are_idempotent_and_sent(monkeypatch):
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
        dam_stlmnt_pnt_prices.email_notifications,
        "enqueue_da_lmp_release_notifications",
        fake_enqueue,
    )
    monkeypatch.setattr(
        dam_stlmnt_pnt_prices.email_notifications,
        "notifications_enabled",
        lambda: True,
    )
    monkeypatch.setattr(
        dam_stlmnt_pnt_prices.email_notifications,
        "send_due_email_notifications",
        lambda **kwargs: [{"status": "sent", **kwargs}],
    )

    queued = dam_stlmnt_pnt_prices._notify_da_email_release_events(
        events=[
            {
                "id": 1,
                "event_key": "ercot_dam_stlmnt_pnt_prices:data_ready:2026-07-02:hub",
            }
        ],
        run_mode="scheduled",
        database="stage_db",
        run_logger=DummyRunLogger(),
    )

    assert queued == 1
    assert calls[0]["iso"] == "ercot"
    assert calls[0]["event"]["event_key"] == (
        "ercot_dam_stlmnt_pnt_prices:data_ready:2026-07-02:hub"
    )
    assert calls[0]["database"] == "stage_db"


def test_ercot_dam_release_email_notifications_skip_outside_scheduled(monkeypatch):
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
        dam_stlmnt_pnt_prices.email_notifications,
        "enqueue_da_lmp_release_notifications",
        fake_enqueue,
    )

    queued = dam_stlmnt_pnt_prices._notify_da_email_release_events(
        events=[
            {
                "id": 1,
                "event_key": "ercot_dam_stlmnt_pnt_prices:data_ready:2026-07-02:hub",
            }
        ],
        run_mode="backfill",
        database="stage_db",
        run_logger=DummyRunLogger(),
    )

    assert queued == 0
    assert called is False


def _dam_spp_availability_frame(hours: int) -> pd.DataFrame:
    settlement_points = (
        "HB_NORTH",
        "HB_SOUTH",
        "HB_WEST",
        "HB_HOUSTON",
    )
    rows = []
    for hour in range(1, hours + 1):
        for settlement_point in settlement_points:
            rows.append(
                {
                    "deliverydate": pd.Timestamp("2026-06-13").date(),
                    "hourending": hour,
                    "settlementpoint": settlement_point,
                    "settlementpointprice": 25.0,
                }
            )
    return pd.DataFrame(rows)

