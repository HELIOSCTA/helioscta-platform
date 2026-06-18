from __future__ import annotations

import pandas as pd

from backend.orchestration.power.pjm import forecast_hourly


def test_forecast_hourly_orchestration_runs_load_solar_and_wind(monkeypatch):
    calls: list[tuple[str, dict[str, object]]] = []
    expected_load = pd.DataFrame([{"forecast_load_mw": 100000.0}])
    expected_solar = pd.DataFrame([{"solar_forecast_mwh": 10.5}])
    expected_wind = pd.DataFrame([{"wind_forecast_mwh": 8443.551}])

    def fake_main(feed_name: str, result: pd.DataFrame):
        def _main(**kwargs):
            calls.append((feed_name, kwargs))
            return result

        return _main

    monkeypatch.setattr(
        forecast_hourly.load_frcstd_7_day,
        "main",
        fake_main("load_frcstd_7_day", expected_load),
    )
    monkeypatch.setattr(
        forecast_hourly.hourly_solar_power_forecast,
        "main",
        fake_main("hourly_solar_power_forecast", expected_solar),
    )
    monkeypatch.setattr(
        forecast_hourly.hourly_wind_power_forecast,
        "main",
        fake_main("hourly_wind_power_forecast", expected_wind),
    )

    result = forecast_hourly.main(
        database="stage_db",
        run_mode="manual",
        metadata={"source": "test"},
    )

    assert result == {
        "load_frcstd_7_day": expected_load,
        "hourly_solar_power_forecast": expected_solar,
        "hourly_wind_power_forecast": expected_wind,
    }
    assert calls == [
        (
            "load_frcstd_7_day",
            {"database": "stage_db", "metadata": {"run_mode": "manual", "source": "test"}},
        ),
        (
            "hourly_solar_power_forecast",
            {"database": "stage_db", "metadata": {"run_mode": "manual", "source": "test"}},
        ),
        (
            "hourly_wind_power_forecast",
            {"database": "stage_db", "metadata": {"run_mode": "manual", "source": "test"}},
        ),
    ]
