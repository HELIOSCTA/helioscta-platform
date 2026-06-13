from __future__ import annotations

import pandas as pd

from backend.scrapes.power.ercot import hourly_resource_outage_capacity
from backend.scrapes.power.ercot.feed_configs import FEED_CONFIGS
from backend.scrapes.power.ercot.public_report_feed import normalize_public_report_frame


def test_hourly_resource_outage_capacity_config_contract():
    config = FEED_CONFIGS["hourly_resource_outage_capacity"]

    assert config.emil_id == "NP3-233-CD"
    assert config.endpoint == "np3-233-cd/hourly_res_outage_cap"
    assert config.primary_key == ("posteddatetime", "operatingdate", "hourending")
    assert config.date_from_param == "operatingDateFrom"
    assert config.date_to_param == "operatingDateTo"
    assert config.default_lookahead_days == -1
    assert hourly_resource_outage_capacity.API_SCRAPE_NAME == (
        "hourly_resource_outage_capacity"
    )


def test_hourly_resource_outage_capacity_normalizes_live_shape():
    df = normalize_public_report_frame(
        pd.DataFrame(
            [
                {
                    "postedDatetime": "2026-06-13T13:00:49",
                    "operatingDate": "2026-06-13",
                    "hourEnding": 1,
                    "totalResourceMWZoneSouth": 3121,
                    "totalResourceMWZoneNorth": 4331,
                    "totalResourceMWZoneWest": 716,
                    "totalResourceMWZoneHouston": 3765,
                    "totalIRRMWZoneSouth": 1165,
                    "totalIRRMWZoneNorth": 912,
                    "totalIRRMWZoneWest": 2462,
                    "totalIRRMWZoneHouston": 60,
                    "totalNewEquipResourceMWZoneSouth": 1456,
                    "totalNewEquipResourceMWZoneNorth": 1838,
                    "totalNewEquipResourceMWZoneWest": 881,
                    "totalNewEquipResourceMWZoneHouston": 621,
                }
            ]
        ),
        FEED_CONFIGS["hourly_resource_outage_capacity"],
    )

    assert df.to_dict("records") == [
        {
            "posteddatetime": pd.Timestamp("2026-06-13T13:00:49"),
            "operatingdate": pd.Timestamp("2026-06-13").date(),
            "hourending": 1,
            "totalresourcemwzonesouth": 3121,
            "totalresourcemwzonenorth": 4331,
            "totalresourcemwzonewest": 716,
            "totalresourcemwzonehouston": 3765,
            "totalirrmwzonesouth": 1165,
            "totalirrmwzonenorth": 912,
            "totalirrmwzonewest": 2462,
            "totalirrmwzonehouston": 60,
            "totalnewequipresourcemwzonesouth": 1456,
            "totalnewequipresourcemwzonenorth": 1838,
            "totalnewequipresourcemwzonewest": 881,
            "totalnewequipresourcemwzonehouston": 621,
        }
    ]
