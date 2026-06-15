from __future__ import annotations

import pandas as pd

from backend.scrapes.power.miso import real_time_total_load


def test_miso_real_time_total_load_target_contract():
    assert real_time_total_load.API_SCRAPE_NAME == "real_time_total_load"
    assert real_time_total_load.TARGET_SCHEMA == "miso"
    assert real_time_total_load.TARGET_TABLE == "real_time_total_load"
    assert real_time_total_load.TARGET_TABLE_FQN == "miso.real_time_total_load"
    assert real_time_total_load.PRIMARY_KEY == [
        "series",
        "operating_date",
        "period_label",
    ]
    assert real_time_total_load.TARGET_COLUMNS == [
        "operating_date",
        "series",
        "period_label",
        "hour_ending",
        "interval_start",
        "load_mw",
        "source_ref_id",
        "source_interval_start",
    ]


def test_miso_real_time_total_load_format_normalizes_payload():
    df = real_time_total_load._format(
        {
            "LoadInfo": {
                "RefId": "13-Jun-2026 - Interval 20:25 EST",
                "ClearedMW": [
                    {"ClearedMWHourly": {"Hour": "1", "Value": "71219"}},
                    {"ClearedMWHourly": {"Hour": "1", "Value": "71220"}},
                ],
                "MediumTermLoadForecast": [
                    {"Forecast": {"HourEnding": "1", "LoadForecast": "72805"}},
                ],
                "FiveMinTotalLoad": [
                    {"Load": {"Time": "20:20", "Value": "88373"}},
                    {"Load": {"Time": "20:25", "Value": "88359"}},
                ],
            }
        }
    )

    assert df[["series", "period_label", "load_mw"]].to_dict("records") == [
        {"series": "cleared_mw_hourly", "period_label": "HE01", "load_mw": 71220.0},
        {"series": "five_min_total_load", "period_label": "20:20", "load_mw": 88373.0},
        {"series": "five_min_total_load", "period_label": "20:25", "load_mw": 88359.0},
        {
            "series": "medium_term_load_forecast",
            "period_label": "HE01",
            "load_mw": 72805.0,
        },
    ]
    assert df["operating_date"].tolist() == [pd.Timestamp("2026-06-13").date()] * 4
    assert df["source_ref_id"].tolist() == [
        "13-Jun-2026 - Interval 20:25 EST"
    ] * 4
    assert df["source_interval_start"].tolist() == [
        pd.Timestamp("2026-06-13 20:25:00")
    ] * 4
    assert df["hour_ending"].tolist()[0] == 1
    assert df["hour_ending"].tolist()[3] == 1
    assert df["hour_ending"].isna().tolist()[1:3] == [True, True]
    assert df["interval_start"].isna().tolist()[0] is True
    assert df["interval_start"].tolist()[1:3] == [
        pd.Timestamp("2026-06-13 20:20:00"),
        pd.Timestamp("2026-06-13 20:25:00"),
    ]


def test_miso_real_time_total_load_pull_uses_public_endpoint_and_metadata(monkeypatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        def json(self):
            return {
                "LoadInfo": {
                    "RefId": "13-Jun-2026 - Interval 20:25 EST",
                    "ClearedMW": [],
                    "MediumTermLoadForecast": [],
                    "FiveMinTotalLoad": [
                        {"Load": {"Time": "20:25", "Value": "88359"}},
                    ],
                }
            }

    def fake_make_get_request(endpoint, **kwargs):
        captured["endpoint"] = endpoint
        captured.update(kwargs)
        return FakeResponse()

    monkeypatch.setattr(
        real_time_total_load.client,
        "make_get_request",
        fake_make_get_request,
    )

    df = real_time_total_load._pull(
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
    )

    assert captured["endpoint"] == "api/RealTimeTotalLoad"
    assert captured["pipeline_name"] == "real_time_total_load"
    assert captured["run_id"] == "run-1"
    assert captured["feed_name"] == "real_time_total_load"
    assert captured["target_table"] == "miso.real_time_total_load"
    assert captured["operation_name"] == "real_time_total_load"
    assert captured["database"] == "stage_db"
    assert captured["metadata"] == {"run_mode": "test"}
    assert len(df) == 1
