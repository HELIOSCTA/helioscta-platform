from __future__ import annotations

import pandas as pd

from backend.scrapes.power.ercot import (
    hourly_resource_outage_capacity,
    short_term_system_adequacy,
)
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


def test_short_term_system_adequacy_config_contract():
    config = FEED_CONFIGS["short_term_system_adequacy"]

    assert config.emil_id == "NP3-763-CD"
    assert config.report_type_id == 12315
    assert config.endpoint == "np3-763-cd/st_sys_adequacy"
    assert config.primary_key == (
        "posteddatetime",
        "deliverydate",
        "hourending",
        "repeathourflag",
    )
    assert config.date_from_param == "deliveryDateFrom"
    assert config.date_to_param == "deliveryDateTo"
    assert config.default_lookahead_days == -1
    assert short_term_system_adequacy.API_SCRAPE_NAME == (
        "short_term_system_adequacy"
    )


def test_short_term_system_adequacy_normalizes_live_shape():
    df = normalize_public_report_frame(
        pd.DataFrame(
            [
                {
                    "postedDatetime": "2026-06-13T15:00:57",
                    "deliveryDate": "2026-06-19",
                    "hourEnding": "01:00",
                    "capGenResSouth": 22444.4,
                    "capGenResNorth": 17899.7,
                    "capGenResWest": 16249.9,
                    "capGenResHouston": 13769.7,
                    "capLoadResSouth": 908.4,
                    "capLoadResNorth": 125.6,
                    "capLoadResWest": 261.6,
                    "capLoadResHouston": 314.7,
                    "offAvailMWSouth": 6346.4,
                    "offAvailMWNorth": 16676.6,
                    "offAvailMWWest": 2181.9,
                    "offAvailMWHouston": 8137.8,
                    "availCapGen": 103346.3,
                    "availCapRes": 43157.3129,
                    "capGenRes": 70363.7,
                    "capLoadRes": 1610.3,
                    "offAvailMW": 33342.7,
                    "capREGUP": 18840.4,
                    "capREGDN": 18748.5,
                    "capRRS": 7841.88,
                    "capECRS": 20742.7,
                    "capNSPIN": 12928.6,
                    "capREGUPRRS": 21433.7,
                    "capREGUPRRSECRS": 25386.0,
                    "capREGUPRRSECRSNSPIN": 30945.7,
                    "repeatHourFlag": False,
                }
            ]
        ),
        FEED_CONFIGS["short_term_system_adequacy"],
    )

    assert df.to_dict("records") == [
        {
            "posteddatetime": pd.Timestamp("2026-06-13T15:00:57"),
            "deliverydate": pd.Timestamp("2026-06-19").date(),
            "hourending": 1,
            "capgenressouth": 22444.4,
            "capgenresnorth": 17899.7,
            "capgenreswest": 16249.9,
            "capgenreshouston": 13769.7,
            "caploadressouth": 908.4,
            "caploadresnorth": 125.6,
            "caploadreswest": 261.6,
            "caploadreshouston": 314.7,
            "offavailmwsouth": 6346.4,
            "offavailmwnorth": 16676.6,
            "offavailmwwest": 2181.9,
            "offavailmwhouston": 8137.8,
            "availcapgen": 103346.3,
            "availcapres": 43157.3129,
            "capgenres": 70363.7,
            "caploadres": 1610.3,
            "offavailmw": 33342.7,
            "capregup": 18840.4,
            "capregdn": 18748.5,
            "caprrs": 7841.88,
            "capecrs": 20742.7,
            "capnspin": 12928.6,
            "capreguprrs": 21433.7,
            "capreguprrsecrs": 25386.0,
            "capreguprrsecrsnspin": 30945.7,
            "repeathourflag": False,
        }
    ]
