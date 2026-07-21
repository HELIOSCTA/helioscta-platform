"""Manual WSI Trader station metadata probe."""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Iterable, Mapping
from dataclasses import asdict, dataclass
from io import StringIO
from pathlib import Path
from typing import Any
from uuid import uuid4

import pandas as pd

from backend import credentials
from backend.scrapes.weather.wsi import client
from backend.scrapes.weather.wsi.stations import STATION_BASKETS
from backend.utils import script_logging
from backend.utils.ops_logging import redact_secrets

API_SCRAPE_NAME = "wsi_station_metadata"
SOURCE_SYSTEM = "wsi"
DEFAULT_BASE_URL = (
    "https://www.wsitrader.com/Services/CSVDownloadService.svc/GetCityIds"
)
DEFAULT_REGION = "PJM"
STATION_ID_COLUMN_CANDIDATES = (
    "station_id",
    "stationid",
    "site_id",
    "siteid",
    "city_id",
    "cityid",
    "id",
)
STATION_NAME_COLUMN_CANDIDATES = (
    "station_name",
    "stationname",
    "site_name",
    "sitename",
    "city_name",
    "cityname",
    "name",
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StationMetadataCheck:
    region: str
    status: str
    configured_station_count: int
    source_station_count: int
    matched_station_ids: list[str]
    missing_station_ids: list[str]
    configured_station_ids: list[str]
    station_id_column: str
    station_name_column: str | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def main(
    *,
    region: str = DEFAULT_REGION,
    database: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> StationMetadataCheck:
    """Fetch WSI station metadata and compare it to one configured basket."""
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    fetch_metadata = {
        "region": region,
        "run_mode": "manual",
        **(metadata or {}),
    }

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Region: {region}")
        text = client._HTTP_CLIENT.get_text(
            base_url=DEFAULT_BASE_URL,
            params={},
            pipeline_name=API_SCRAPE_NAME,
            operation_name="GetCityIds",
            target_table=None,
            run_id=run_id,
            feed_name=API_SCRAPE_NAME,
            database=database,
            metadata=fetch_metadata,
        )
        parse_started_at = time.perf_counter()
        try:
            source_df = parse_station_metadata_text(text)
        except Exception as exc:
            client.log_wsi_fetch_event(
                base_url=DEFAULT_BASE_URL,
                pipeline_name=API_SCRAPE_NAME,
                operation_name="GetCityIds",
                target_table=None,
                status="failure",
                http_status=200,
                elapsed_ms=round((time.perf_counter() - parse_started_at) * 1000),
                run_id=run_id,
                feed_name=API_SCRAPE_NAME,
                database=database,
                error_type=type(exc).__name__,
                error_message=str(exc),
                metadata=client.with_telemetry_stage(
                    fetch_metadata,
                    "parse_station_metadata_csv",
                ),
            )
            raise

        result = compare_station_metadata(
            source_df,
            configured_stations=STATION_BASKETS.get(region, {}),
            region=region,
        )
        if result.status == "complete":
            run_logger.success(
                "WSI station metadata covers all "
                f"{result.configured_station_count} configured {region} stations."
            )
        else:
            run_logger.warning(
                "WSI station metadata is missing configured %s station IDs: %s",
                region,
                ", ".join(result.missing_station_ids),
            )
        return result
    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    finally:
        script_logging.close_logging()


def parse_station_metadata_text(text: str) -> pd.DataFrame:
    try:
        raw_df = pd.read_csv(StringIO(text))
    except pd.errors.EmptyDataError as exc:
        raise ValueError("WSI station metadata response contained no CSV data.") from exc
    except pd.errors.ParserError as exc:
        raise ValueError(f"Failed to parse WSI station metadata CSV: {exc}") from exc

    if raw_df.empty:
        raise ValueError("WSI station metadata response returned 0 rows.")

    normalized = raw_df.copy()
    normalized.columns = [_canonical_column(column) for column in normalized.columns]
    station_id_column = _detect_column(
        normalized.columns,
        STATION_ID_COLUMN_CANDIDATES,
        "station ID",
    )
    station_name_column = _detect_optional_column(
        normalized.columns,
        STATION_NAME_COLUMN_CANDIDATES,
    )

    result = pd.DataFrame(
        {
            "station_id": normalized[station_id_column].astype("string").str.strip(),
            "station_name": (
                normalized[station_name_column].astype("string").str.strip()
                if station_name_column is not None
                else pd.NA
            ),
        }
    )
    result = result[result["station_id"].notna() & (result["station_id"] != "")]
    result = result.drop_duplicates(subset=["station_id"], keep="last")
    if result.empty:
        raise ValueError("WSI station metadata contained no usable station IDs.")

    result.attrs["station_id_column"] = station_id_column
    result.attrs["station_name_column"] = station_name_column
    return result.sort_values("station_id").reset_index(drop=True)


def compare_station_metadata(
    source_df: pd.DataFrame,
    *,
    configured_stations: Mapping[str, str],
    region: str = DEFAULT_REGION,
) -> StationMetadataCheck:
    configured_station_ids = _sorted_station_ids(configured_stations.keys())
    source_station_ids = _sorted_station_ids(source_df["station_id"].tolist())
    source_station_set = set(source_station_ids)
    matched_station_ids = [
        station_id
        for station_id in configured_station_ids
        if station_id in source_station_set
    ]
    missing_station_ids = [
        station_id
        for station_id in configured_station_ids
        if station_id not in source_station_set
    ]
    status = (
        "complete"
        if configured_station_ids and not missing_station_ids
        else "partial"
    )
    return StationMetadataCheck(
        region=region,
        status=status,
        configured_station_count=len(configured_station_ids),
        source_station_count=len(source_station_ids),
        matched_station_ids=matched_station_ids,
        missing_station_ids=missing_station_ids,
        configured_station_ids=configured_station_ids,
        station_id_column=str(source_df.attrs.get("station_id_column", "station_id")),
        station_name_column=source_df.attrs.get("station_name_column"),
    )


def _detect_column(
    columns: pd.Index,
    candidates: tuple[str, ...],
    label: str,
) -> str:
    column = _detect_optional_column(columns, candidates)
    if column is None:
        raise ValueError(
            f"WSI station metadata missing a {label} column. "
            f"Expected one of {list(candidates)}, Actual={columns.tolist()}"
        )
    return column


def _detect_optional_column(
    columns: pd.Index,
    candidates: tuple[str, ...],
) -> str | None:
    available = set(columns)
    for candidate in candidates:
        if candidate in available:
            return candidate
    return None


def _canonical_column(column: object) -> str:
    value = str(column).strip().lower()
    value = value.replace("(", " ").replace(")", " ")
    return "_".join(value.split())


def _sorted_station_ids(values: Iterable[object]) -> list[str]:
    return sorted({str(value).strip() for value in values if str(value).strip()})


if __name__ == "__main__":
    check = main()
    print(json.dumps(check.to_dict(), indent=2))
    raise SystemExit(0 if check.status == "complete" else 1)
