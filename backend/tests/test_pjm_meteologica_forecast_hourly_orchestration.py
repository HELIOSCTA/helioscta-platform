from __future__ import annotations

import pandas as pd

from backend.orchestration.power.pjm import meteologica_forecast_hourly


def test_pjm_meteologica_orchestration_emits_freshness(monkeypatch):
    events: list[dict] = []

    def fake_scrape_main(**_kwargs):
        return pd.DataFrame(
            [
                {
                    "content_id": 2706,
                    "issue_date": pd.Timestamp("2026-06-18 10:00:00+0000"),
                    "forecast_period_start": pd.Timestamp("2026-06-18 14:00:00"),
                    "metric": "load",
                    "forecast_area": "RTO",
                },
                {
                    "content_id": 2553,
                    "issue_date": pd.Timestamp("2026-06-18 10:05:00+0000"),
                    "forecast_period_start": pd.Timestamp("2026-06-18 15:00:00"),
                    "metric": "solar",
                    "forecast_area": "RTO",
                },
            ]
        )

    def fake_emit_data_availability_event(**kwargs):
        events.append(kwargs)
        return {"event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(meteologica_forecast_hourly.scrape, "main", fake_scrape_main)
    monkeypatch.setattr(
        meteologica_forecast_hourly,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    result = meteologica_forecast_hourly.main(database="helios_prod")

    assert result is not None
    assert events[0]["dataset"] == "pjm_meteologica_forecast_hourly"
    assert events[0]["source_system"] == "meteologica"
    assert events[0]["availability_type"] == "freshness_forecast"
    assert events[0]["source_table"] == "meteologica.pjm_forecast_hourly"
    assert events[0]["row_count"] == 2
    assert events[0]["entity_count"] == 2
    assert events[0]["period_count"] == 2
    assert events[0]["scope"] == "PJM"
    assert events[0]["payload"]["forecast_areas"] == ["RTO"]

