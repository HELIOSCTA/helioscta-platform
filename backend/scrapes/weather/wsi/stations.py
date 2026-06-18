"""Station baskets for WSI Trader weather scrapes."""

from __future__ import annotations

PJM_STATIONS: dict[str, str] = {
    "PJM": "PJM",
    "KABE": "Allentown",
    "KACY": "Atlantic City",
    "KBWI": "Baltimore",
    "KCAK": "Akron-Canton",
    "KCRW": "Charleston",
    "KMDW": "Chicago Midway",
    "KORD": "Chicago O'Hare",
    "KLUK": "Cincinnati",
    "KCLE": "Cleveland",
    "KCMH": "Columbus",
    "KCVG": "Covington",
    "KDAY": "Dayton",
    "KFWA": "Fort Wayne",
    "KHGR": "Hagerstown",
    "KMDT": "Harrisburg",
    "KHTS": "Huntington",
    "KMGW": "Morgantown",
    "KEWR": "Newark",
    "KORF": "Norfolk",
    "KPKB": "Parkersburg",
    "KPHL": "Philadelphia",
    "KPIT": "Pittsburgh",
    "KRIC": "Richmond",
    "KROA": "Roanoke",
    "KRFD": "Rockford",
    "KAVP": "Scranton",
    "KTOL": "Toledo",
    "KDCA": "Washington",
    "KIAD": "Washington Dulles",
    "KIPT": "Williamsport",
    "KILG": "Wilmington",
    "KDOV": "Dover",
    "KWAL": "Wallops Island",
}

STATION_BASKETS: dict[str, dict[str, str]] = {
    "PJM": PJM_STATIONS,
}
