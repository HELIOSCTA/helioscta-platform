from __future__ import annotations

import pandas as pd

from backend.scrapes.power.ercot import solar_power_actual_5min, wind_power_actual_5min
from backend.scrapes.power.ercot.feed_configs import FEED_CONFIGS
from backend.scrapes.power.ercot.public_report_feed import normalize_public_report_frame


def test_wind_power_actual_5min_config_contract():
    config = FEED_CONFIGS["wind_power_actual_5min"]

    assert config.emil_id == "NP4-733-CD"
    assert config.report_type_id == 13071
    assert config.endpoint == "np4-733-cd/wpp_actual_5min_avg_values"
    assert config.primary_key == ("posteddatetime", "intervalending")
    assert config.date_from_param == "intervalEndingFrom"
    assert config.date_to_param == "intervalEndingTo"
    assert wind_power_actual_5min.API_SCRAPE_NAME == "wind_power_actual_5min"


def test_wind_power_actual_5min_normalizes_live_shape():
    df = normalize_public_report_frame(
        pd.DataFrame(
            [
                {
                    "postedDatetime": "2026-06-13T00:55:32",
                    "intervalEnding": "2026-06-12T23:55:00",
                    "genSystemWide": 20516.72,
                    "LZSouthHouston": 3750.97,
                    "LZWest": 14774.21,
                    "LZNorth": 1991.54,
                    "HSLSystemWide": 20879.77,
                    "DSTFlag": False,
                }
            ]
        ),
        FEED_CONFIGS["wind_power_actual_5min"],
    )

    assert df.to_dict("records") == [
        {
            "posteddatetime": pd.Timestamp("2026-06-13T00:55:32"),
            "intervalending": pd.Timestamp("2026-06-12T23:55:00"),
            "gensystemwide": 20516.72,
            "lzsouthhouston": 3750.97,
            "lzwest": 14774.21,
            "lznorth": 1991.54,
            "hslsystemwide": 20879.77,
            "dstflag": False,
        }
    ]


def test_solar_power_actual_5min_config_contract():
    config = FEED_CONFIGS["solar_power_actual_5min"]

    assert config.emil_id == "NP4-738-CD"
    assert config.report_type_id == 13484
    assert config.endpoint == "np4-738-cd/spp_actual_5min_avg_values"
    assert config.primary_key == ("posteddatetime", "intervalending")
    assert config.date_from_param == "intervalEndingFrom"
    assert config.date_to_param == "intervalEndingTo"
    assert solar_power_actual_5min.API_SCRAPE_NAME == "solar_power_actual_5min"


def test_solar_power_actual_5min_normalizes_live_shape():
    df = normalize_public_report_frame(
        pd.DataFrame(
            [
                {
                    "postedDatetime": "2026-06-13T00:55:17",
                    "intervalEnding": "2026-06-12T23:55:00",
                    "genSystemWide": 0.84,
                    "HSLSystemWide": 2.87,
                    "DSTFlag": False,
                }
            ]
        ),
        FEED_CONFIGS["solar_power_actual_5min"],
    )

    assert df.to_dict("records") == [
        {
            "posteddatetime": pd.Timestamp("2026-06-13T00:55:17"),
            "intervalending": pd.Timestamp("2026-06-12T23:55:00"),
            "gensystemwide": 0.84,
            "hslsystemwide": 2.87,
            "dstflag": False,
        }
    ]
