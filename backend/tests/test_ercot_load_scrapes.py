from __future__ import annotations

import pandas as pd

from backend.scrapes.power.ercot import actual_system_load, seven_day_load_forecast
from backend.scrapes.power.ercot.feed_configs import FEED_CONFIGS
from backend.scrapes.power.ercot.public_report_feed import normalize_public_report_frame


def test_actual_system_load_config_contract():
    config = FEED_CONFIGS["actual_system_load"]

    assert config.endpoint == "np6-346-cd/act_sys_load_by_fzn"
    assert config.primary_key == ("operatingday", "hourending")
    assert config.date_from_param == "operatingDayFrom"
    assert config.date_to_param == "operatingDayTo"
    assert actual_system_load.API_SCRAPE_NAME == "actual_system_load"


def test_actual_system_load_normalizes_live_shape():
    df = normalize_public_report_frame(
        pd.DataFrame(
            [
                {
                    "operatingDay": "2026-06-12",
                    "hourEnding": "01:00",
                    "north": 20990.43,
                    "south": 16579.17,
                    "west": 9673.39,
                    "houston": 15638.65,
                    "total": 62881.63,
                    "DSTFlag": False,
                }
            ]
        ),
        FEED_CONFIGS["actual_system_load"],
    )

    assert df.to_dict("records") == [
        {
            "operatingday": pd.Timestamp("2026-06-12").date(),
            "hourending": 1,
            "north": 20990.43,
            "south": 16579.17,
            "west": 9673.39,
            "houston": 15638.65,
            "total": 62881.63,
        }
    ]


def test_seven_day_load_forecast_config_contract():
    config = FEED_CONFIGS["seven_day_load_forecast"]

    assert config.endpoint == "np3-565-cd/lf_by_model_weather_zone"
    assert config.primary_key == (
        "posteddatetime",
        "deliverydate",
        "hourending",
        "model",
    )
    assert config.default_params["inUseFlag"] == "true"
    assert seven_day_load_forecast.API_SCRAPE_NAME == "seven_day_load_forecast"


def test_seven_day_load_forecast_normalizes_live_shape():
    df = normalize_public_report_frame(
        pd.DataFrame(
            [
                {
                    "postedDatetime": "2026-06-13T12:30:00",
                    "deliveryDate": "2026-06-13",
                    "hourEnding": "1:00",
                    "coast": 15702.2998,
                    "east": 1953.4399,
                    "farWest": 7431.8999,
                    "north": 1669.48,
                    "northCentral": 15796.2998,
                    "southCentral": 10080.7998,
                    "southern": 4993.6899,
                    "west": 1886.8,
                    "systemTotal": 59514.7091,
                    "model": "X",
                    "inUseFlag": True,
                    "DSTFlag": False,
                }
            ]
        ),
        FEED_CONFIGS["seven_day_load_forecast"],
    )

    assert df.to_dict("records") == [
        {
            "posteddatetime": pd.Timestamp("2026-06-13T12:30:00"),
            "deliverydate": pd.Timestamp("2026-06-13").date(),
            "hourending": 1,
            "coast": 15702.2998,
            "east": 1953.4399,
            "farwest": 7431.8999,
            "north": 1669.48,
            "northcentral": 15796.2998,
            "southcentral": 10080.7998,
            "southern": 4993.6899,
            "west": 1886.8,
            "systemtotal": 59514.7091,
            "model": "X",
        }
    ]
