"""WSI station coverage helpers for data-availability events."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

import pandas as pd


@dataclass(frozen=True)
class StationCoverage:
    status: str
    expected_station_ids: list[str]
    actual_station_ids: list[str]
    missing_station_ids: list[str]
    unexpected_station_ids: list[str]

    @property
    def expected_station_count(self) -> int:
        return len(self.expected_station_ids)

    @property
    def actual_station_count(self) -> int:
        return len(self.actual_station_ids)

    def as_payload(self) -> dict[str, Any]:
        return {
            "station_coverage_status": self.status,
            "expected_station_count": self.expected_station_count,
            "actual_station_count": self.actual_station_count,
            "expected_station_ids": self.expected_station_ids,
            "actual_station_ids": self.actual_station_ids,
            "missing_station_ids": self.missing_station_ids,
            "unexpected_station_ids": self.unexpected_station_ids,
        }


def station_coverage(
    df: pd.DataFrame,
    *,
    expected_stations: Mapping[str, str],
    station_column: str = "station_id",
) -> StationCoverage:
    expected_station_ids = _sorted_station_ids(expected_stations.keys())
    if station_column in df.columns:
        actual_station_ids = _sorted_station_ids(df[station_column].dropna().tolist())
    else:
        actual_station_ids = []

    expected_station_set = set(expected_station_ids)
    actual_station_set = set(actual_station_ids)
    missing_station_ids = [
        station_id
        for station_id in expected_station_ids
        if station_id not in actual_station_set
    ]
    unexpected_station_ids = [
        station_id
        for station_id in actual_station_ids
        if station_id not in expected_station_set
    ]

    if not expected_station_ids:
        status = "unknown"
    elif missing_station_ids or unexpected_station_ids:
        status = "partial"
    else:
        status = "complete"

    return StationCoverage(
        status=status,
        expected_station_ids=expected_station_ids,
        actual_station_ids=actual_station_ids,
        missing_station_ids=missing_station_ids,
        unexpected_station_ids=unexpected_station_ids,
    )


def _sorted_station_ids(values: Iterable[object]) -> list[str]:
    return sorted({str(value).strip() for value in values if str(value).strip()})
