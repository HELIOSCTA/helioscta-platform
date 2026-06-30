from __future__ import annotations

import pandas as pd

from backend.orchestration.power.pjm import meteologica_da_price_forecast


def test_pjm_meteologica_da_price_orchestration_emits_freshness(monkeypatch):
    events: list[dict] = []

    def fake_scrape_main(**_kwargs):
        return {
            "usa_pjm_western_hub_da_power_price_forecast_hourly": pd.DataFrame(
                [
                    {
                        "content_id": 4397,
                        "update_id": "100",
                        "issue_date": pd.Timestamp("2026-06-30 10:00:00+0000"),
                        "forecast_period_start": pd.Timestamp("2026-07-01 00:00:00"),
                    }
                ]
            ),
            "usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly": pd.DataFrame(
                [
                    {
                        "content_id": 4400,
                        "update_id": "101",
                        "issue_date": pd.Timestamp("2026-06-30 10:05:00+0000"),
                        "forecast_period_start": pd.Timestamp("2026-07-01 01:00:00"),
                    }
                ]
            ),
        }

    def fake_emit_data_availability_event(**kwargs):
        events.append(kwargs)
        return {"event_key": kwargs["event_key"], "created": True}

    monkeypatch.setattr(
        meteologica_da_price_forecast.scrape,
        "main",
        fake_scrape_main,
    )
    monkeypatch.setattr(
        meteologica_da_price_forecast,
        "emit_data_availability_event",
        fake_emit_data_availability_event,
    )

    result = meteologica_da_price_forecast.main(database="helios_prod")

    assert result is not None
    assert events[0]["dataset"] == "pjm_meteologica_da_price_forecast"
    assert events[0]["source_system"] == "meteologica"
    assert events[0]["availability_type"] == "freshness_forecast"
    assert events[0]["source_table"] == (
        "meteologica.usa_pjm_western_hub_da_power_price_forecast_hourly + "
        "meteologica.usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly"
    )
    assert events[0]["row_count"] == 2
    assert events[0]["entity_count"] == 2
    assert events[0]["period_count"] == 2
    assert events[0]["scope"] == "PJM WESTERN HUB"
    assert sorted(events[0]["payload"]["tables"]) == [
        "usa_pjm_western_hub_da_power_price_forecast_ecmwf_ens_hourly",
        "usa_pjm_western_hub_da_power_price_forecast_hourly",
    ]
