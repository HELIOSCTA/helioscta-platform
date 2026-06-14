from __future__ import annotations

from datetime import date

import pandas as pd

from backend.orchestration.power.isone import external_interface_metered_data


def test_isone_external_interface_metered_data_expected_period_count_dst_days():
    assert (
        external_interface_metered_data._expected_period_count_for_date(
            date(2026, 6, 12)
        )
        == 24
    )
    assert (
        external_interface_metered_data._expected_period_count_for_date(
            date(2026, 3, 8)
        )
        == 23
    )
    assert (
        external_interface_metered_data._expected_period_count_for_date(
            date(2026, 11, 1)
        )
        == 25
    )


def test_isone_external_interface_metered_data_event_key():
    assert (
        external_interface_metered_data._data_availability_event_key(
            date(2026, 6, 12)
        )
        == "isone_external_interface_metered_data:data_ready:2026-06-12:all_interfaces"
    )


def test_isone_external_interface_metered_data_emits_complete_readiness(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_emit_data_availability_event(**kwargs):
        captured.append(kwargs)
        return {"id": 1, "event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(
        external_interface_metered_data,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    events = external_interface_metered_data._emit_data_availability_events(
        df=_availability_frame(hours=24, entities=("control_area:ISO NE CA", "interface:A")),
        run_id="run-1",
        database="stage_db",
    )

    assert events == [
        {
            "id": 1,
            "event_key": (
                "isone_external_interface_metered_data:data_ready:"
                "2026-06-12:all_interfaces"
            ),
            "created": True,
        }
    ]
    event = captured[0]
    assert event["dataset"] == "isone_external_interface_metered_data"
    assert event["source_table"] == "isone.external_interface_metered_data"
    assert event["row_count"] == 48
    assert event["entity_count"] == 2
    assert event["period_count"] == 24
    assert event["scope"] == "all_interfaces"
    assert event["grain"] == "date_hour_entity_interface"


def test_isone_external_interface_metered_data_skips_incomplete_readiness(monkeypatch):
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        external_interface_metered_data,
        "emit_data_availability_event",
        lambda **kwargs: captured.append(kwargs),
    )

    events = external_interface_metered_data._emit_data_availability_events(
        df=_availability_frame(hours=23, entities=("control_area:ISO NE CA",)),
        run_id="run-1",
        database="stage_db",
    )

    assert events == []
    assert captured == []


def _availability_frame(hours: int, entities: tuple[str, ...]) -> pd.DataFrame:
    rows = []
    for hour in range(1, hours + 1):
        for entity in entities:
            entity_type, interface_name = entity.split(":", 1)
            rows.append(
                {
                    "local_date": pd.Timestamp("2026-06-12").date(),
                    "local_hour_ending": hour,
                    "entity_type": entity_type,
                    "interface_name": interface_name,
                    "net_interchange_mwh": 1.0,
                }
            )
    return pd.DataFrame(rows)
