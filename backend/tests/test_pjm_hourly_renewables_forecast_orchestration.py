from __future__ import annotations

import pandas as pd

from backend.orchestration.power.pjm import hourly_renewables_forecast


def test_hourly_renewables_forecast_orchestration_runs_both_feeds(monkeypatch):
    calls: list[tuple[str, dict[str, object]]] = []
    expected_solar = pd.DataFrame([{"solar_forecast_mwh": 10.5}])
    expected_wind = pd.DataFrame([{"wind_forecast_mwh": 8443.551}])

    def fake_solar_main(**kwargs):
        calls.append(("hourly_solar_power_forecast", kwargs))
        return expected_solar

    def fake_wind_main(**kwargs):
        calls.append(("hourly_wind_power_forecast", kwargs))
        return expected_wind

    monkeypatch.setattr(
        hourly_renewables_forecast.hourly_solar_power_forecast,
        "main",
        fake_solar_main,
    )
    monkeypatch.setattr(
        hourly_renewables_forecast.hourly_wind_power_forecast,
        "main",
        fake_wind_main,
    )

    result = hourly_renewables_forecast.main(
        database="stage_db",
        run_mode="manual",
        metadata={"source": "test"},
    )

    assert result == {
        "hourly_solar_power_forecast": expected_solar,
        "hourly_wind_power_forecast": expected_wind,
    }
    assert calls == [
        (
            "hourly_solar_power_forecast",
            {"database": "stage_db", "metadata": {"run_mode": "manual", "source": "test"}},
        ),
        (
            "hourly_wind_power_forecast",
            {"database": "stage_db", "metadata": {"run_mode": "manual", "source": "test"}},
        ),
    ]
