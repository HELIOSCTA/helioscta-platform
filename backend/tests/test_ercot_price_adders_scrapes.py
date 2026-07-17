from __future__ import annotations

import pandas as pd

from backend.scrapes.power.ercot import rt_price_adders_15min, rt_price_adders_sced
from backend.scrapes.power.ercot.feed_configs import FEED_CONFIGS
from backend.scrapes.power.ercot.public_report_feed import normalize_public_report_frame


def test_rt_price_adders_sced_config_contract():
    config = FEED_CONFIGS["rt_price_adders_sced"]

    assert config.emil_id == "NP6-323-CD"
    assert config.report_type_id == 13221
    assert config.endpoint == "np6-323-cd/rt_price_adder_sced"
    assert config.primary_key == ("scedtimestamp", "repeathourflag")
    assert config.date_from_param == "SCEDTimestampFrom"
    assert config.date_to_param == "SCEDTimestampTo"
    assert config.date_from_format == "%Y-%m-%dT00:00:00"
    assert config.date_to_format == "%Y-%m-%dT23:59:59"
    assert config.default_lookahead_days == -1
    assert rt_price_adders_sced.API_SCRAPE_NAME == "rt_price_adders_sced"


def test_rt_price_adders_sced_normalizes_live_shape():
    df = normalize_public_report_frame(
        pd.DataFrame(
            [
                {
                    "SCEDTimestamp": "2026-07-17T11:25:16",
                    "repeatHourFlag": False,
                    "systemLambda": 16.0599,
                    "RTRDPA": 0.0,
                    "RTRDPARUS": 1.0,
                    "RTRDPARDS": 2.0,
                    "RTRDPARRS": 3.0,
                    "RTRDPAECRS": 4.0,
                    "RTRDPANSS": 5.0,
                    "RTRRUC": 6.0,
                    "RTRRMR": 7.0,
                    "RTDNCLR": 8.0,
                    "RTDERS": 9.0,
                    "RTDCTIEIMPORT": 10.0,
                    "RTDCTIEEXPORT": 11.0,
                    "RTBLTIMPORT": 12.0,
                    "RTBLTEXPORT": 13.0,
                    "RTOLLSL": 6908.2,
                    "RTOLHSL": 106919.43,
                }
            ]
        ),
        FEED_CONFIGS["rt_price_adders_sced"],
    )

    assert df.to_dict("records") == [
        {
            "scedtimestamp": pd.Timestamp("2026-07-17T11:25:16"),
            "repeathourflag": False,
            "systemlambda": 16.0599,
            "rtrdpa": 0.0,
            "rtrdparus": 1.0,
            "rtrdpards": 2.0,
            "rtrdparrs": 3.0,
            "rtrdpaecrs": 4.0,
            "rtrdpanss": 5.0,
            "rtrruc": 6.0,
            "rtrrmr": 7.0,
            "rtdnclr": 8.0,
            "rtders": 9.0,
            "rtdctieimport": 10.0,
            "rtdctieexport": 11.0,
            "rtbltimport": 12.0,
            "rtbltexport": 13.0,
            "rtollsl": 6908.2,
            "rtolhsl": 106919.43,
        }
    ]


def test_rt_price_adders_15min_config_contract():
    config = FEED_CONFIGS["rt_price_adders_15min"]

    assert config.emil_id == "NP6-324-CD"
    assert config.report_type_id == 13220
    assert config.endpoint == "np6-324-cd/rt_15min_price_adders"
    assert config.primary_key == (
        "deliverydate",
        "deliveryhour",
        "deliveryinterval",
        "repeathourflag",
    )
    assert config.date_from_param == "deliveryDateFrom"
    assert config.date_to_param == "deliveryDateTo"
    assert config.default_lookahead_days == -1
    assert rt_price_adders_15min.API_SCRAPE_NAME == "rt_price_adders_15min"


def test_rt_price_adders_15min_normalizes_live_shape():
    df = normalize_public_report_frame(
        pd.DataFrame(
            [
                {
                    "deliveryDate": "2026-07-17",
                    "deliveryHour": 2,
                    "deliveryInterval": 1,
                    "RTRDPA": 0.0,
                    "RTRDPRU": 1.0,
                    "RTRDPRD": 2.0,
                    "RTRDPRRS": 3.0,
                    "RTRDPECRS": 4.0,
                    "RTRDPNS": 5.0,
                    "repeatHourFlag": False,
                }
            ]
        ),
        FEED_CONFIGS["rt_price_adders_15min"],
    )

    assert df.to_dict("records") == [
        {
            "deliverydate": pd.Timestamp("2026-07-17").date(),
            "deliveryhour": 2,
            "deliveryinterval": 1,
            "rtrdpa": 0.0,
            "rtrdpru": 1.0,
            "rtrdprd": 2.0,
            "rtrdprrs": 3.0,
            "rtrdpecrs": 4.0,
            "rtrdpns": 5.0,
            "repeathourflag": False,
        }
    ]
