from __future__ import annotations

import pandas as pd

from backend.orchestration.weather.noaa import metar_observations


def test_noaa_metar_orchestration_emits_freshness(monkeypatch):
    events: list[dict] = []

    def fake_scrape_main(**_kwargs):
        return pd.DataFrame(
            [
                {
                    "station_id": "KDCA",
                    "observation_time_utc": pd.Timestamp("2026-06-17 19:52:00+0000", tz="UTC"),
                },
                {
                    "station_id": "KPHL",
                    "observation_time_utc": pd.Timestamp("2026-06-17 19:54:00+0000", tz="UTC"),
                },
            ]
        )

    def fake_emit_data_availability_event(**kwargs):
        events.append(kwargs)
        return {"event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(metar_observations.scrape, "main", fake_scrape_main)
    monkeypatch.setattr(
        metar_observations,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    result = metar_observations.main(region="PJM", database="helios_prod")

    assert result is not None
    assert events[0]["dataset"] == "weather_noaa_metar_observations"
    assert events[0]["source_system"] == "noaa_aviationweather"
    assert events[0]["availability_type"] == "freshness_observed"
    assert events[0]["source_table"] == "weather.noaa_metar_observations"
    assert events[0]["row_count"] == 2
    assert events[0]["entity_count"] == 2
    assert events[0]["window_end"] == pd.Timestamp("2026-06-17 19:54:00+0000", tz="UTC")
