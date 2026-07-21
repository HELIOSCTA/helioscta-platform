from __future__ import annotations

from datetime import date

import pandas as pd

from backend.orchestration.power.pjm import rt_fivemin_hrl_lmps


def test_rt_fivemin_hrl_expected_period_count_handles_normal_and_dst_days():
    assert rt_fivemin_hrl_lmps._expected_period_count_for_date(date(2026, 6, 13)) == 288
    assert rt_fivemin_hrl_lmps._expected_period_count_for_date(date(2026, 3, 8)) == 276
    assert rt_fivemin_hrl_lmps._expected_period_count_for_date(date(2026, 11, 1)) == 300


def test_rt_fivemin_hrl_event_key():
    assert (
        rt_fivemin_hrl_lmps._data_availability_event_key(date(2026, 6, 13))
        == "pjm_rt_fivemin_hrl_lmps:data_ready:2026-06-13:hub_zone_interface"
    )


def test_rt_fivemin_hrl_emits_readiness_event_for_complete_current_rows(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_emit_data_availability_event(**kwargs):
        captured.append(kwargs)
        return {"id": 1, "event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(
        rt_fivemin_hrl_lmps,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    events = rt_fivemin_hrl_lmps._emit_data_availability_events(
        df=_rt_fivemin_availability_frame(periods=288),
        run_id="run-1",
        database="stage_db",
    )

    assert events == [
        {
            "id": 1,
            "event_key": "pjm_rt_fivemin_hrl_lmps:data_ready:2026-06-13:hub_zone_interface",
            "created": True,
        }
    ]
    event = captured[0]
    assert event["dataset"] == "pjm_rt_fivemin_hrl_lmps"
    assert event["source_system"] == "pjm"
    assert event["availability_type"] == "data_ready"
    assert event["business_date"] == date(2026, 6, 13)
    assert event["scope"] == "hub_zone_interface"
    assert event["grain"] == "date_5min_pnode"
    assert event["source_table"] == "pjm.rt_fivemin_hrl_lmps"
    assert event["row_count"] == 864
    assert event["entity_count"] == 3
    assert event["period_count"] == 288
    assert event["completeness_status"] == "complete"
    assert event["run_id"] == "run-1"
    assert event["database"] == "stage_db"
    assert event["payload"]["expected_period_count"] == 288
    assert event["payload"]["expected_row_count"] == 864
    assert event["payload"]["type_counts"] == {"HUB": 288, "ZONE": 288, "INTERFACE": 288}


def test_rt_fivemin_hrl_skips_readiness_event_for_incomplete_current_rows(monkeypatch):
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        rt_fivemin_hrl_lmps,
        "emit_data_availability_event",
        lambda **kwargs: captured.append(kwargs),
    )

    events = rt_fivemin_hrl_lmps._emit_data_availability_events(
        df=_rt_fivemin_availability_frame(periods=287),
        run_id="run-1",
        database="stage_db",
    )

    assert events == []
    assert captured == []


def _rt_fivemin_availability_frame(periods: int) -> pd.DataFrame:
    nodes = [
        (1, "WESTERN HUB", "HUB"),
        (2, "MIDATLANTIC REGION", "ZONE"),
        (3, "PJM WEST", "INTERFACE"),
    ]
    rows = []
    for period in range(periods):
        ept = pd.Timestamp("2026-06-13") + pd.Timedelta(minutes=5 * period)
        for pnode_id, pnode_name, node_type in nodes:
            rows.append(
                {
                    "datetime_beginning_utc": ept + pd.Timedelta(hours=4),
                    "datetime_beginning_ept": ept,
                    "pnode_id": pnode_id,
                    "pnode_name": pnode_name,
                    "type": node_type,
                    "row_is_current": True,
                    "version_nbr": 1,
                    "total_lmp_rt": 25.0,
                }
            )
    return pd.DataFrame(rows)
