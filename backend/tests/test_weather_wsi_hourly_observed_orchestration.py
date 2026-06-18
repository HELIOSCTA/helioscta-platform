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
    assert events[0]["payload"]["latest_observation_time_local"] == "2026-06-17T13:00:00"
