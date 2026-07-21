from __future__ import annotations

import pandas as pd

from backend.orchestration.weather.wsi import hourly_forecast


def test_wsi_hourly_forecast_orchestration_emits_freshness(monkeypatch):
    events: list[dict] = []

    def fake_scrape_main(**_kwargs):
        return pd.DataFrame(
            [
                {
                    "station_id": "KDCA",
                    "forecast_issued_at_utc": pd.Timestamp(
                        "2026-06-18 10:28:00+0000"
                    ),
                    "forecast_time_utc": pd.Timestamp("2026-06-18 11:00:00+0000"),
                },
                {
                    "station_id": "KPHL",
                    "forecast_issued_at_utc": pd.Timestamp(
                        "2026-06-18 10:28:00+0000"
                    ),
                    "forecast_time_utc": pd.Timestamp("2026-06-18 12:00:00+0000"),
                },
            ]
        )

    def fake_emit_data_availability_event(**kwargs):
        events.append(kwargs)
        return {"event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(hourly_forecast.scrape, "main", fake_scrape_main)
    monkeypatch.setattr(
        hourly_forecast,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    result = hourly_forecast.main(region="PJM", database="helios_prod")

    assert result is not None
    assert events[0]["dataset"] == "weather_wsi_hourly_forecasts"
    assert events[0]["source_system"] == "wsi"
    assert events[0]["availability_type"] == "freshness_forecast"
    assert events[0]["source_table"] == "weather.wsi_hourly_forecasts"
    assert events[0]["row_count"] == 2
    assert events[0]["entity_count"] == 2
    assert events[0]["window_start"] == pd.Timestamp(
        "2026-06-18 11:00:00+0000"
    ).to_pydatetime()
    assert events[0]["window_end"] == pd.Timestamp(
        "2026-06-18 12:00:00+0000"
    ).to_pydatetime()
    assert events[0]["completeness_status"] == "partial"
    assert events[0]["payload"]["expected_station_count"] == 34
    assert events[0]["payload"]["actual_station_ids"] == ["KDCA", "KPHL"]
    assert events[0]["payload"]["station_forecast_period_counts"] == {
        "KDCA": 1,
        "KPHL": 1,
    }
    assert events[0]["payload"]["uniform_forecast_period_count"] is True
    assert (
        events[0]["payload"]["completeness_basis"]
        == "expected_station_presence_and_uniform_forecast_period_count"
    )
    assert (
        events[0]["payload"]["latest_forecast_issued_at_utc"]
        == "2026-06-18T10:28:00+00:00"
    )


def test_wsi_hourly_forecast_freshness_is_complete_for_full_uniform_basket(
    monkeypatch,
):
    events: list[dict] = []
    stations = hourly_forecast.STATION_BASKETS["PJM"]
    df = pd.DataFrame(
        [
            {
                "station_id": station_id,
                "forecast_issued_at_utc": pd.Timestamp(
                    "2026-06-18 10:28:00+0000"
                ),
                "forecast_time_utc": pd.Timestamp(f"2026-06-18 {hour}:00:00+0000"),
            }
            for station_id in stations
            for hour in (11, 12)
        ]
    )

    monkeypatch.setattr(
        hourly_forecast,
        "emit_data_availability_event",
        lambda **kwargs: events.append(kwargs) or {"event_key": kwargs["event_key"]},
    )

    hourly_forecast._emit_freshness_event(
        df=df,
        region="PJM",
        database="helios_prod",
    )

    assert events[0]["completeness_status"] == "complete"
    assert events[0]["entity_count"] == 34
    assert events[0]["period_count"] == 2
    assert events[0]["payload"]["min_station_period_count"] == 2
    assert events[0]["payload"]["max_station_period_count"] == 2
    assert events[0]["payload"]["missing_station_ids"] == []
