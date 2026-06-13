from __future__ import annotations

import pandas as pd

from backend.scrapes.power.ercot import (
    solar_power_production_hourly,
    wind_power_production_hourly,
)
from backend.scrapes.power.ercot.feed_configs import FEED_CONFIGS
from backend.scrapes.power.ercot.public_report_feed import normalize_public_report_frame


def test_wind_power_production_hourly_config_contract():
    config = FEED_CONFIGS["wind_power_production_hourly"]

    assert config.emil_id == "NP4-732-CD"
    assert config.report_type_id == 13028
    assert config.endpoint == "np4-732-cd/wpp_hrly_avrg_actl_fcast"
    assert config.primary_key == ("posteddatetime", "deliverydate", "hourending")
    assert config.date_from_param == "deliveryDateFrom"
    assert config.date_to_param == "deliveryDateTo"
    assert wind_power_production_hourly.API_SCRAPE_NAME == (
        "wind_power_production_hourly"
    )


def test_wind_power_production_hourly_normalizes_live_shape():
    df = normalize_public_report_frame(
        pd.DataFrame(
            [
                {
                    "postedDatetime": "2026-06-13T12:55:32",
                    "deliveryDate": "2026-06-12",
                    "hourEnding": 1,
                    "genSystemWide": 18905.79,
                    "COPHSLSystemWide": 18194.8,
                    "STWPFSystemWide": 18525.3,
                    "WGRPPSystemWide": 18525.3,
                    "genLoadZoneSouthHouston": 4368.21,
                    "COPHSLLoadZoneSouthHouston": 4100.2,
                    "STWPFLoadZoneSouthHouston": 4062.2,
                    "WGRPPLoadZoneSouthHouston": 4062.2,
                    "genLoadZoneWest": 12562.53,
                    "COPHSLLoadZoneWest": 12182.5,
                    "STWPFLoadZoneWest": 12586.7,
                    "WGRPPLoadZoneWest": 12586.7,
                    "genLoadZoneNorth": 1975.05,
                    "COPHSLLoadZoneNorth": 1912.1,
                    "STWPFLoadZoneNorth": 1876.4,
                    "WGRPPLoadZoneNorth": 1876.4,
                    "HSLSystemWide": 19719.58,
                    "DSTFlag": False,
                }
            ]
        ),
        FEED_CONFIGS["wind_power_production_hourly"],
    )

    assert df.to_dict("records") == [
        {
            "posteddatetime": pd.Timestamp("2026-06-13T12:55:32"),
            "deliverydate": pd.Timestamp("2026-06-12").date(),
            "hourending": 1,
            "gensystemwide": 18905.79,
            "cophslsystemwide": 18194.8,
            "stwpfsystemwide": 18525.3,
            "wgrppsystemwide": 18525.3,
            "genloadzonesouthhouston": 4368.21,
            "cophslloadzonesouthhouston": 4100.2,
            "stwpfloadzonesouthhouston": 4062.2,
            "wgrpploadzonesouthhouston": 4062.2,
            "genloadzonewest": 12562.53,
            "cophslloadzonewest": 12182.5,
            "stwpfloadzonewest": 12586.7,
            "wgrpploadzonewest": 12586.7,
            "genloadzonenorth": 1975.05,
            "cophslloadzonenorth": 1912.1,
            "stwpfloadzonenorth": 1876.4,
            "wgrpploadzonenorth": 1876.4,
            "hslsystemwide": 19719.58,
        }
    ]


def test_solar_power_production_hourly_config_contract():
    config = FEED_CONFIGS["solar_power_production_hourly"]

    assert config.emil_id == "NP4-737-CD"
    assert config.report_type_id == 13483
    assert config.endpoint == "np4-737-cd/spp_hrly_avrg_actl_fcast"
    assert config.primary_key == ("posteddatetime", "deliverydate", "hourending")
    assert solar_power_production_hourly.API_SCRAPE_NAME == (
        "solar_power_production_hourly"
    )


def test_solar_power_production_hourly_normalizes_live_shape():
    df = normalize_public_report_frame(
        pd.DataFrame(
            [
                {
                    "postedDatetime": "2026-06-13T12:55:30",
                    "deliveryDate": "2026-06-12",
                    "hourEnding": 1,
                    "genSystemWide": 1.07,
                    "COPHSLSystemWide": 0.0,
                    "STPPFSystemWide": 0.0,
                    "PVGRPPSystemWide": 0.0,
                    "HSLSystemWide": 2.9,
                    "DSTFlag": False,
                }
            ]
        ),
        FEED_CONFIGS["solar_power_production_hourly"],
    )

    assert df.to_dict("records") == [
        {
            "posteddatetime": pd.Timestamp("2026-06-13T12:55:30"),
            "deliverydate": pd.Timestamp("2026-06-12").date(),
            "hourending": 1,
            "gensystemwide": 1.07,
            "cophslsystemwide": 0.0,
            "stppfsystemwide": 0.0,
            "pvgrppsystemwide": 0.0,
            "hslsystemwide": 2.9,
        }
    ]
