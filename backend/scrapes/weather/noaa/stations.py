"""Station baskets for NOAA AviationWeather METAR scrapes."""

from __future__ import annotations

PJM_STATIONS: dict[str, str] = {
    "KABE": "Allentown, PA",
    "KACY": "Atlantic City, NJ",
    "KBWI": "Baltimore, MD",
    "KCAK": "Akron-Canton, OH",
    "KCRW": "Charleston, WV",
    "KMDW": "Chicago Midway, IL",
    "KORD": "Chicago O'Hare, IL",
    "KLUK": "Cincinnati Lunken, OH",
    "KCLE": "Cleveland, OH",
    "KCMH": "Columbus, OH",
    "KCVG": "Cincinnati, OH",
    "KDAY": "Dayton, OH",
    "KFWA": "Fort Wayne, IN",
    "KHGR": "Hagerstown, MD",
    "KMDT": "Harrisburg, PA",
    "KHTS": "Huntington, WV",
    "KMGW": "Morgantown, WV",
    "KEWR": "Newark, NJ",
    "KORF": "Norfolk, VA",
    "KPKB": "Parkersburg, WV",
    "KPHL": "Philadelphia, PA",
    "KPIT": "Pittsburgh, PA",
    "KRIC": "Richmond, VA",
    "KROA": "Roanoke, VA",
    "KRFD": "Rockford, IL",
    "KAVP": "Scranton/Wilkes-Barre, PA",
    "KTOL": "Toledo, OH",
    "KDCA": "Washington Reagan, DC",
    "KIAD": "Washington Dulles, VA",
    "KIPT": "Williamsport, PA",
    "KILG": "Wilmington, DE",
    "KDOV": "Dover, DE",
    "KWAL": "Wallops Island, VA",
}

STATION_BASKETS: dict[str, dict[str, str]] = {
    "PJM": PJM_STATIONS,
}
