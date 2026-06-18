from __future__ import annotations

from datetime import datetime

import pandas as pd

from backend.scrapes.weather.noaa import metar_observations


def test_noaa_metar_normalizes_api_shape():
    df = metar_observations.normalize_metar_observations(
        [
            {
                "icaoId": "KDCA",
                "receiptTime": "2026-06-17T19:56:09.014Z",
                "obsTime": 1781725920,
                "reportTime": "2026-06-17T20:00:00.000Z",
                "temp": 30.6,
                "dewp": 15,
                "wdir": 180,
                "wspd": 15,
                "wgst": 23,
                "visib": "10+",
                "slp": 1007.4,
                "rawOb": "METAR KDCA 171952Z 18015G23KT 10SM",
                "lat": 38.8472,
                "lon": -77.0345,
                "elev": 4,
                "name": "Washington/Reagan-National Arpt, VA, US",
                "fltCat": "VFR",
            }
        ],
        region="PJM",
        stations={"KDCA": "Washington Reagan, DC"},
        source_updated_at=datetime(2026, 6, 17, 20, 0),
    )

    row = df.to_dict("records")[0]
    assert row["station_id"] == "KDCA"
    assert row["region"] == "PJM"
    assert row["observation_time_utc"] == pd.Timestamp("2026-06-17 19:52:00+0000", tz="UTC")
    assert row["report_time_utc"] == pd.Timestamp("2026-06-17 20:00:00+0000", tz="UTC")
    assert row["temp_f"] == 87.08
    assert row["dew_point_f"] == 59.0
    assert row["wind_speed_mph"] == 17.26
    assert row["wind_gust_mph"] == 26.47
    assert row["visibility_miles"] == 10.0
    assert row["pressure_mb"] == 1007.4
    assert row["flight_category"] == "VFR"
    assert row["source_product_id"] == "METAR"


def test_noaa_metar_pull_uses_batch_request(monkeypatch):
    captured: dict[str, object] = {}

    class FakeClient:
        def get_metars(self, **kwargs):
            captured.update(kwargs)
            return [
                {
                    "icaoId": "KPHL",
                    "obsTime": 1781726040,
                    "reportTime": "2026-06-17T20:00:00.000Z",
                    "temp": 28.3,
                    "dewp": 15.6,
                }
            ]

    df = metar_observations._pull(
        region="PJM",
        stations={"KPHL": "Philadelphia, PA"},
        hours=2,
        run_id="run-1",
        database="helios_prod",
        api_client=FakeClient(),
    )

    assert captured["station_ids"] == ["KPHL"]
    assert captured["operation_name"] == "metar"
    assert captured["target_table"] == "weather.noaa_metar_observations"
    assert df[["station_id", "station_name", "region"]].to_dict("records") == [
        {"station_id": "KPHL", "station_name": "Philadelphia, PA", "region": "PJM"}
    ]


def test_noaa_metar_pull_batches_station_requests():
    batches: list[list[str]] = []
    stations = {f"K{i:03d}": f"Station {i}" for i in range(10)}

    class FakeClient:
        def get_metars(self, **kwargs):
            batches.append(kwargs["station_ids"])
            return [
                {
                    "icaoId": kwargs["station_ids"][0],
                    "obsTime": 1781726040,
                    "reportTime": "2026-06-17T20:00:00.000Z",
                    "temp": 28.3,
                    "dewp": 15.6,
                }
            ]

    metar_observations._pull(
        region="PJM",
        stations=stations,
        hours=48,
        run_id="run-1",
        database="helios_prod",
        api_client=FakeClient(),
    )

    assert [len(batch) for batch in batches] == [7, 3]


def test_noaa_visibility_fraction_parser():
    assert metar_observations._visibility_miles("1 1/2") == 1.5
    assert metar_observations._visibility_miles("M1/4") == 0.25
    assert metar_observations._visibility_miles("10+") == 10.0
