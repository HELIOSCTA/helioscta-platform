from __future__ import annotations

import pandas as pd

from backend.scrapes.power.ercot import dam_shadow_prices, sced_shadow_prices
from backend.scrapes.power.ercot.feed_configs import FEED_CONFIGS
from backend.scrapes.power.ercot.public_report_feed import normalize_public_report_frame


def test_dam_shadow_prices_config_contract():
    config = FEED_CONFIGS["dam_shadow_prices"]

    assert config.endpoint == "np4-191-cd/dam_shadow_prices"
    assert config.primary_key == (
        "deliverytime",
        "constraintid",
        "constraintname",
        "contingencyname",
    )
    assert config.date_from_param == "deliveryDateFrom"
    assert config.date_to_param == "deliveryDateTo"
    assert config.default_lookahead_days == -1
    assert dam_shadow_prices.API_SCRAPE_NAME == "dam_shadow_prices"


def test_dam_shadow_prices_normalizes_live_shape():
    df = normalize_public_report_frame(
        pd.DataFrame(
            [
                {
                    "deliveryDate": "2026-06-13",
                    "hourEnding": "01:00",
                    "constraintId": 1,
                    "constraintName": " 6437__F",
                    "contingencyName": " DMTSCOS5",
                    "constraintLimit": 212,
                    "constraintValue": 212,
                    "violationAmount": 0,
                    "shadowPrice": 4.08,
                    "fromStation": " SCRCV",
                    "toStation": " KNAPP",
                    "fromStationkV": 138.0,
                    "toStationkV": 138.0,
                    "deliveryTime": "2026-06-13T00:00:00",
                    "DSTFlag": False,
                }
            ]
        ),
        FEED_CONFIGS["dam_shadow_prices"],
    )

    assert df.to_dict("records") == [
        {
            "deliverydate": pd.Timestamp("2026-06-13").date(),
            "hourending": 1,
            "constraintid": 1,
            "constraintname": "6437__F",
            "contingencyname": "DMTSCOS5",
            "constraintlimit": 212,
            "constraintvalue": 212,
            "violationamount": 0,
            "shadowprice": 4.08,
            "fromstation": "SCRCV",
            "tostation": "KNAPP",
            "fromstationkv": 138.0,
            "tostationkv": 138.0,
            "deliverytime": pd.Timestamp("2026-06-13T00:00:00"),
        }
    ]


def test_sced_shadow_prices_config_contract():
    config = FEED_CONFIGS["sced_shadow_prices"]

    assert config.endpoint == "np6-86-cd/shdw_prices_bnd_trns_const"
    assert config.primary_key == (
        "scedtimestamp",
        "constraintid",
        "constraintname",
        "contingencyname",
    )
    assert config.date_from_param == "SCEDTimestampFrom"
    assert config.date_to_param == "SCEDTimestampTo"
    assert config.date_from_format == "%Y-%m-%dT00:00:00"
    assert config.date_to_format == "%Y-%m-%dT23:59:59"
    assert config.default_lookahead_days == -1
    assert sced_shadow_prices.API_SCRAPE_NAME == "sced_shadow_prices"


def test_sced_shadow_prices_normalizes_live_shape():
    df = normalize_public_report_frame(
        pd.DataFrame(
            [
                {
                    "SCEDTimestamp": "2026-06-13T11:55:17",
                    "repeatedHourFlag": False,
                    "constraintID": 15,
                    "constraintName": "6437__F",
                    "contingencyName": "DMTSCOS5",
                    "shadowPrice": 0.0,
                    "maxShadowPrice": 3500.0,
                    "limit": 206.4,
                    "value": 174.0,
                    "violatedMW": -32.4,
                    "fromStation": "SCRCV",
                    "toStation": "KNAPP",
                    "fromStationkV": 138.0,
                    "toStationkV": 138.0,
                    "CCTStatus": "COMP",
                }
            ]
        ),
        FEED_CONFIGS["sced_shadow_prices"],
    )

    assert df.to_dict("records") == [
        {
            "scedtimestamp": pd.Timestamp("2026-06-13T11:55:17"),
            "repeatedhourflag": False,
            "constraintid": 15,
            "constraintname": "6437__F",
            "contingencyname": "DMTSCOS5",
            "shadowprice": 0.0,
            "maxshadowprice": 3500.0,
            "limit": 206.4,
            "value": 174.0,
            "violatedmw": -32.4,
            "fromstation": "SCRCV",
            "tostation": "KNAPP",
            "fromstationkv": 138.0,
            "tostationkv": 138.0,
            "cctstatus": "COMP",
        }
    ]
