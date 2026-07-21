from __future__ import annotations

import pandas as pd

from backend.orchestration.weather.wsi import hourly_observed


def test_wsi_hourly_observed_orchestration_emits_freshness(monkeypatch):
    events: list[dict] = []

    def fake_scrape_main(**_kwargs):
        return pd.DataFrame(
            [
                {
                    "station_id": "KDCA",
                    "observation_time_local": pd.Timestamp("2026-06-17 13:00:00"),
                },
                {
                    "station_id": "KPHL",
                    "observation_time_local": pd.Timestamp("2026-06-17 13:00:00"),
                },
            ]
        )

    def fake_emit_data_availability_event(**kwargs):
        events.append(kwargs)
        return {"event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(hourly_observed.scrape, "main", fake_scrape_main)
    monkeypatch.setattr(
        hourly_observed,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    result = hourly_observed.main(region="PJM", database="helios_prod")

    assert result is not None
    assert events[0]["dataset"] == "weather_wsi_hourly_observed_temperatures"
    assert events[0]["source_system"] == "wsi"
    assert events[0]["availability_type"] == "freshness_observed"
    assert events[0]["source_table"] == "weather.wsi_hourly_observed_temperatures"
    assert events[0]["row_count"] == 2
    assert events[0]["entity_count"] == 2
    assert events[0]["window_start"] is None
    assert events[0]["window_end"] is None
    assert events[0]["completeness_status"] == "partial"
    assert events[0]["payload"]["expected_station_count"] == 34
    assert events[0]["payload"]["actual_station_ids"] == ["KDCA", "KPHL"]
    assert "PJM" in events[0]["payload"]["missing_station_ids"]
    assert (
        events[0]["payload"]["completeness_basis"]
        == "expected_station_presence_in_returned_window"
    )
    assert events[0]["payload"]["latest_observation_time_local"] == "2026-06-17T13:00:00"


def test_wsi_hourly_observed_freshness_is_complete_for_full_station_basket(
    monkeypatch,
):
    events: list[dict] = []
    stations = hourly_observed.STATION_BASKETS["PJM"]
    df = pd.DataFrame(
        [
            {
                "station_id": station_id,
                "observation_time_local": pd.Timestamp("2026-06-17 13:00:00"),
            }
            for station_id in stations
        ]
    )

    monkeypatch.setattr(
        hourly_observed,
        "emit_data_availability_event",
        lambda **kwargs: events.append(kwargs) or {"event_key": kwargs["event_key"]},
    )

    hourly_observed._emit_freshness_event(
        df=df,
        region="PJM",
        database="helios_prod",
    )

    assert events[0]["completeness_status"] == "complete"
    assert events[0]["entity_count"] == 34
    assert events[0]["payload"]["missing_station_ids"] == []
    assert events[0]["payload"]["unexpected_station_ids"] == []
