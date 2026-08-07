from __future__ import annotations

import pandas as pd

from backend.orchestration.power.ercot import meteologica_forecast_hourly


def test_ercot_meteologica_orchestration_emits_freshness(monkeypatch):
    events: list[dict] = []

    def fake_scrape_main(**_kwargs):
        return pd.DataFrame(
            [
                {
                    "content_id": 1943,
                    "issue_date": pd.Timestamp("2026-06-18 10:00:00+0000"),
                    "forecast_period_start": pd.Timestamp("2026-06-18 14:00:00"),
                    "metric": "load",
                    "forecast_area": "ERCOT",
                },
                {
                    "content_id": 1840,
                    "issue_date": pd.Timestamp("2026-06-18 10:05:00+0000"),
                    "forecast_period_start": pd.Timestamp("2026-06-18 15:00:00"),
                    "metric": "solar",
                    "forecast_area": "ERCOT",
                },
                {
                    "content_id": 1952,
                    "issue_date": pd.Timestamp("2026-06-18 10:07:00+0000"),
                    "forecast_period_start": pd.Timestamp("2026-06-18 16:00:00"),
                    "metric": "load",
                    "forecast_area": "HOUSTON_FORECAST_ZONE",
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
    assert events[0]["dataset"] == "ercot_meteologica_forecast_hourly"
    assert events[0]["source_system"] == "meteologica"
    assert events[0]["availability_type"] == "freshness_forecast"
    assert events[0]["source_table"] == "meteologica.ercot_forecast_hourly"
    assert events[0]["row_count"] == 3
    assert events[0]["entity_count"] == 3
    assert events[0]["period_count"] == 3
    assert events[0]["scope"] == "ERCOT"
    assert events[0]["payload"]["content_ids"] == [1840, 1943, 1952]
    assert events[0]["payload"]["metrics"] == ["load", "solar"]
    assert events[0]["payload"]["forecast_areas"] == [
        "ERCOT",
        "HOUSTON_FORECAST_ZONE",
    ]


def test_ercot_meteologica_orchestration_skips_freshness_for_empty_result(monkeypatch):
    events: list[dict] = []
    monkeypatch.setattr(
        meteologica_forecast_hourly.scrape,
        "main",
        lambda **_kwargs: pd.DataFrame(),
    )
    monkeypatch.setattr(
        meteologica_forecast_hourly,
        "emit_data_availability_event",
        lambda **kwargs: events.append(kwargs),
    )

    result = meteologica_forecast_hourly.main(database="helios_prod")

    assert result is not None
    assert result.empty
    assert events == []
