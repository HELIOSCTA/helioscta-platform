from __future__ import annotations

import pandas as pd

from backend.scrapes.weather.wsi import station_metadata


def test_wsi_station_metadata_parses_city_id_shape():
    df = station_metadata.parse_station_metadata_text(
        "City ID,City Name\nKDCA,Washington\nKPHL,Philadelphia\n"
    )

    assert df.to_dict("records") == [
        {"station_id": "KDCA", "station_name": "Washington"},
        {"station_id": "KPHL", "station_name": "Philadelphia"},
    ]
    assert df.attrs["station_id_column"] == "city_id"
    assert df.attrs["station_name_column"] == "city_name"


def test_wsi_station_metadata_compare_identifies_missing_configured_station():
    source_df = pd.DataFrame(
        [
            {"station_id": "KDCA", "station_name": "Washington"},
            {"station_id": "KPHL", "station_name": "Philadelphia"},
        ]
    )
    source_df.attrs["station_id_column"] = "city_id"
    source_df.attrs["station_name_column"] = "city_name"

    check = station_metadata.compare_station_metadata(
        source_df,
        configured_stations={
            "KDCA": "Washington",
            "KPHL": "Philadelphia",
            "KPIT": "Pittsburgh",
        },
        region="PJM",
    )

    assert check.status == "partial"
    assert check.configured_station_count == 3
    assert check.source_station_count == 2
    assert check.matched_station_ids == ["KDCA", "KPHL"]
    assert check.missing_station_ids == ["KPIT"]
    assert check.station_id_column == "city_id"


def test_wsi_station_metadata_compare_marks_complete_when_all_configured_present():
    source_df = pd.DataFrame(
        [
            {"station_id": "KDCA", "station_name": "Washington"},
            {"station_id": "KPHL", "station_name": "Philadelphia"},
        ]
    )

    check = station_metadata.compare_station_metadata(
        source_df,
        configured_stations={"KDCA": "Washington", "KPHL": "Philadelphia"},
        region="PJM",
    )

    assert check.status == "complete"
    assert check.missing_station_ids == []
